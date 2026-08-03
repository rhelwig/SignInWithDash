import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  base64urlDecode,
  normalizeOrigin,
  signCanonicalBase64Url,
  type Action,
  type BindingPolicy,
} from "@siwd/protocol";
import {
  ENABLE_SIMULATOR,
  HOST,
  PORT,
  PUBLIC_ORIGIN,
  absoluteUrl,
} from "./lib/config.js";
import { getDb } from "./lib/db.js";
import {
  bindingMatches,
  cancelRequest,
  createAuthRequest,
  deactivateAccount,
  finishRequest,
  getRequestByCapabilityToken,
  getRequestById,
  getSession,
  listPublicAccounts,
  listSessions,
  rateLimit,
  rejectRequest,
  respondToRequest,
  endAllSessions,
  endSession,
  toPublicRequest,
} from "./lib/store.js";
import { getSimulatorSigner } from "./lib/simulator-keys.js";
import {
  accountsPage,
  authCeremonyPage,
  getStartedPage,
  homePage,
  howItWorksPage,
  mePage,
  securityPage,
  simulatorPage,
} from "./pages/content.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = new Hono();

// Ensure DB is ready
getDb();

function cookieSecure(): boolean {
  // Secure cookies require HTTPS; plain HTTP localhost must omit Secure.
  return PUBLIC_ORIGIN.startsWith("https://");
}

function clientKey(c: { req: { header: (n: string) => string | undefined } }) {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "local"
  );
}

function sessionFrom(c: {
  req: { header: (n: string) => string | undefined };
}): ReturnType<typeof getSession> {
  return getSession(getCookie(c as never, "siwd_session"));
}

function jsonError(
  code: string,
  message: string,
  status: number,
) {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// Static assets
app.use(
  "/static/*",
  serveStatic({
    root: join(__dirname, "public"),
    rewriteRequestPath: (p) => p.replace(/^\/static/, ""),
  }),
);

// --- HTML pages ---

app.get("/", async (c) => {
  const s = sessionFrom(c);
  return c.html(await homePage(s?.account ?? null));
});

app.get("/how-it-works", (c) => {
  const s = sessionFrom(c);
  return c.html(howItWorksPage(s?.account ?? null));
});

app.get("/get-started", (c) => {
  const s = sessionFrom(c);
  return c.html(getStartedPage(s?.account ?? null));
});

app.get("/security", (c) => {
  const s = sessionFrom(c);
  return c.html(securityPage(s?.account ?? null));
});

app.get("/accounts", (c) => {
  const s = sessionFrom(c);
  if (!s) {
    return c.redirect("/login?next=" + encodeURIComponent("/accounts"));
  }
  return c.html(accountsPage(s.account));
});

app.get("/me", (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login?next=" + encodeURIComponent("/me"));
  return c.html(mePage(s.account, listSessions(s.account.id)));
});

app.post("/logout", (c) => {
  const sid = getCookie(c, "siwd_session");
  const s = getSession(sid);
  if (s) endSession(s.id, s.account.id, "logout");
  deleteCookie(c, "siwd_session", { path: "/" });
  return c.redirect("/");
});

app.post("/me/revoke-session", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  const body = await c.req.parseBody();
  const sessionId = String(body.sessionId || "");
  endSession(sessionId, s.account.id, "revoked");
  if (sessionId === s.id) {
    deleteCookie(c, "siwd_session", { path: "/" });
    return c.redirect("/");
  }
  return c.redirect("/me");
});

app.post("/me/revoke-others", (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  endAllSessions(s.account.id, "revoke_others", s.id);
  return c.redirect("/me");
});

app.post("/me/deactivate", (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  deactivateAccount(s.account.id);
  deleteCookie(c, "siwd_session", { path: "/" });
  return c.redirect("/?deactivated=1");
});

async function startAuth(
  c: {
    req: {
      url: string;
      header: (n: string) => string | undefined;
      query: (n: string) => string | undefined;
    };
    redirect: (u: string) => Response;
    html: (s: string) => Response | Promise<Response>;
    header: (n: string, v: string) => void;
  },
  action: "login" | "register",
) {
  if (!rateLimit(`create:${clientKey(c)}`, 30, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  let origin: string;
  let domain: string;
  try {
    const n = normalizeOrigin(PUBLIC_ORIGIN);
    origin = n.origin;
    domain = n.domain;
  } catch {
    // PUBLIC_ORIGIN for loopback http
    const u = new URL(PUBLIC_ORIGIN);
    origin = `${u.protocol}//${u.host}`;
    domain = u.hostname;
  }

  // Safe internal redirect after login (e.g. /accounts)
  const nextRaw = c.req.query("next") || "";
  if (nextRaw.startsWith("/") && !nextRaw.startsWith("//")) {
    setCookie(c as never, "siwd_next", nextRaw, {
      path: "/",
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "Lax",
      maxAge: 600,
    });
  }

  const created = createAuthRequest({
    action,
    bindingPolicy: "identity_bound",
    origin,
    domain,
  });

  setCookie(c as never, "siwd_bind", created.bindingToken, {
    path: "/dash-auth/v1",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "Strict",
    maxAge: 180,
  });

  // Also store requestId for cancel form convenience
  setCookie(c as never, "siwd_rid", created.requestId, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "Lax",
    maxAge: 180,
  });

  return c.html(
    await authCeremonyPage({
      action,
      account: sessionFrom(c)?.account ?? null,
      requestId: created.requestId,
      capabilityUrl: created.capabilityUrl,
      expiresAt: created.expiresAt,
    }),
  );
}

app.get("/login", (c) => startAuth(c, "login"));
app.get("/register", (c) => startAuth(c, "register"));

// --- Protocol API ---

app.get("/dash-auth/v1/r/:token", (c) => {
  if (!rateLimit(`fetch:${clientKey(c)}`, 60, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  const token = c.req.param("token");
  const row = getRequestByCapabilityToken(token);
  if (!row || row.status !== "pending") {
    return jsonError("invalid_request", "Not found", 404);
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    return jsonError("expired", "Expired", 404);
  }
  return c.json(toPublicRequest(row), 200, {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
});

app.post("/dash-auth/v1/respond", async (c) => {
  if (!rateLimit(`respond:${clientKey(c)}`, 60, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON", 400);
  }
  const result = respondToRequest({
    type: body.type as string | undefined,
    version: body.version as number | undefined,
    requestId: String(body.requestId || ""),
    network: String(body.network || ""),
    bindingPolicy: String(body.bindingPolicy || ""),
    identityId: String(body.identityId || ""),
    dpnsName: String(body.dpnsName || ""),
    keyId: Number(body.keyId),
    algorithm: String(body.algorithm || ""),
    // accept signature or signature_b64url
    signature: String(body.signature || body.signature_b64url || ""),
  });
  if (!result.ok) {
    return jsonError(result.code, result.message, result.http);
  }
  return c.json(
    { status: "approved", requestId: result.requestId },
    200,
    { "Cache-Control": "no-store" },
  );
});

app.get("/dash-auth/v1/status", (c) => {
  if (!rateLimit(`status:${clientKey(c)}`, 120, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  const requestId = c.req.query("requestId") || "";
  const row = getRequestById(requestId);
  const bind = getCookie(c, "siwd_bind");
  if (!row || !bindingMatches(row, bind)) {
    return jsonError("binding_mismatch", "Unauthorized", 401);
  }
  return c.json(
    {
      status: row.status,
      expiresAt: row.expires_at,
      finishReady: row.status === "approved",
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

app.post("/dash-auth/v1/finish", async (c) => {
  if (!rateLimit(`finish:${clientKey(c)}`, 30, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  let requestId = "";
  const ct = c.req.header("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await c.req.json();
    requestId = String(body.requestId || "");
  } else {
    const body = await c.req.parseBody();
    requestId = String(body.requestId || "");
  }
  const bind = getCookie(c, "siwd_bind");
  const result = finishRequest(
    requestId,
    bind,
    c.req.header("user-agent") || undefined,
  );
  if (!result.ok) {
    return jsonError(result.code, result.message, result.http);
  }
  setCookie(c, "siwd_session", result.sessionId, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "Lax",
  });
  deleteCookie(c, "siwd_bind", { path: "/dash-auth/v1" });
  deleteCookie(c, "siwd_rid", { path: "/" });
  // Prefer post-login next path from cookie if set (e.g. /accounts)
  const next = getCookie(c, "siwd_next");
  const redirect =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/me";
  if (next) deleteCookie(c, "siwd_next", { path: "/" });

  return c.json({
    status: "consumed",
    redirect,
    isNew: result.isNew,
    account: {
      dpnsName: result.account.dpns_name,
      identityId: result.account.identity_id,
    },
  });
});

app.post("/dash-auth/v1/cancel", async (c) => {
  let requestId = "";
  const ct = c.req.header("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await c.req.json();
    requestId = String(body.requestId || "");
  } else {
    const body = await c.req.parseBody();
    requestId = String(body.requestId || getCookie(c, "siwd_rid") || "");
  }
  const bind = getCookie(c, "siwd_bind");
  cancelRequest(requestId, bind);
  deleteCookie(c, "siwd_bind", { path: "/dash-auth/v1" });
  return c.redirect("/");
});

app.post("/dash-auth/v1/reject", async (c) => {
  const body = await c.req.json();
  const result = rejectRequest(
    String(body.requestId || ""),
    String(body.capabilityToken || ""),
  );
  if (!result.ok) return jsonError(result.code, result.message, result.http);
  return c.json({ status: "rejected", requestId: result.requestId });
});

// --- Dev simulator ---

if (ENABLE_SIMULATOR) {
  app.get("/dev/simulator", (c) => {
    const s = sessionFrom(c);
    return c.html(simulatorPage(s?.account ?? null));
  });

  app.post("/dev/simulator/sign", async (c) => {
    if (!rateLimit(`sim:${clientKey(c)}`, 40, 60_000)) {
      return jsonError("rate_limited", "Too many requests", 429);
    }
    const body = await c.req.json();
    const request = body.request as {
      requestId: string;
      network: string;
      origin: string;
      action: string;
      bindingPolicy: string;
      nonce: string;
      issuedAt: string;
      expiresAt: string;
    };
    const identityId = String(body.identityId || "");
    const signer = getSimulatorSigner(identityId);
    if (!signer) {
      return jsonError("invalid_request", "Unknown simulator identity", 400);
    }
    const dpnsName = String(body.dpnsName || signer.dpnsName);
    const keyId = Number(body.keyId || signer.keyId);

    const signature = signCanonicalBase64Url(
      {
        network: request.network as "testnet" | "mainnet",
        origin: request.origin,
        action: request.action as Action,
        bindingPolicy: request.bindingPolicy as BindingPolicy,
        requestId: request.requestId,
        nonce: base64urlDecode(request.nonce),
        issuedAt: request.issuedAt,
        expiresAt: request.expiresAt,
        identityId,
        dpnsName,
        keyId,
      },
      signer.privateKey,
    );

    const response = {
      type: "dash-auth-response",
      version: 1,
      requestId: request.requestId,
      network: request.network,
      bindingPolicy: request.bindingPolicy,
      identityId,
      dpnsName,
      keyId,
      algorithm: "dash-platform-ecdsa-recoverable-sha256d",
      signature,
    };

    const respondUrl = absoluteUrl("/dash-auth/v1/respond");
    const r = await fetch(respondUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(response),
    });
    const respondBody = await r.json();
    return c.json({
      signed: response,
      respondStatus: r.status,
      respondBody,
    });
  });
}

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    network: "testnet",
    origin: PUBLIC_ORIGIN,
    accounts: listPublicAccounts().length,
  }),
);

console.log(`SIWD demo listening on http://${HOST}:${PORT}`);
console.log(`PUBLIC_ORIGIN=${PUBLIC_ORIGIN}`);
console.log(`Simulator: ${ENABLE_SIMULATOR ? "enabled" : "disabled"}`);

serve({ fetch: app.fetch, hostname: HOST, port: PORT });
