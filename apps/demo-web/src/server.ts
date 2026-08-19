import { getRequestListener, serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createServer } from "node:http";
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
  BIND_COOKIE_MAX_AGE,
  CONTACT_ENABLED,
  ENABLE_SIMULATOR,
  HOST,
  PORT,
  PUBLIC_ORIGIN,
  VERIFY_MODE,
  absoluteUrl,
} from "./lib/config.js";
import { isValidEmailShape } from "./lib/display.js";
import { sendContactMail } from "./lib/mail.js";
import {
  discoverByPublicKeyHashes,
  checkPlatformConnectivity,
  fetchIdentitySummary,
  resolveDpnsName,
} from "./lib/platform.js";
import { initDb } from "./lib/db.js";
import {
  addAllowlistEntry,
  addBan,
  createInvite,
  getAccessSettings,
  isSiteOwner,
  listAllowlist,
  listBans,
  removeAllowlistEntry,
  removeBan,
  updateAccessSettings,
} from "./lib/access.js";
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
  setAccountEmail,
  toPublicRequest,
} from "./lib/store.js";
import { getSimulatorSigner } from "./lib/simulator-keys.js";
import {
  accessPage,
  accountsPage,
  authCeremonyPage,
  contactPage,
  getStartedPage,
  homePage,
  howItWorksPage,
  howToTestPage,
  mePage,
  privacyPage,
  securityPage,
  simulatorPage,
} from "./pages/content.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = new Hono();

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

// Developer downloads (APK, etc.) — files live in apps/demo-web/public/downloads
app.use(
  "/downloads/*",
  serveStatic({
    root: join(__dirname, "public", "downloads"),
    rewriteRequestPath: (p) => p.replace(/^\/downloads\/?/, "") || "index.html",
  }),
);

// --- HTML pages ---

app.get("/", async (c) => {
  const s = sessionFrom(c);
  return c.html(await homePage(s?.account ?? null));
});

app.get("/how-to-test", (c) => {
  const s = sessionFrom(c);
  return c.html(howToTestPage(s?.account ?? null));
});

app.get("/privacy", (c) => {
  const s = sessionFrom(c);
  return c.html(privacyPage(s?.account ?? null));
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

app.get("/contact", (c) => {
  const s = sessionFrom(c);
  if (!s) {
    return c.redirect("/login?next=" + encodeURIComponent("/contact"));
  }
  return c.html(
    contactPage({
      account: s.account,
      enabled: CONTACT_ENABLED,
    }),
  );
});

app.post("/contact", async (c) => {
  const s = sessionFrom(c);
  if (!s) {
    return c.redirect("/login?next=" + encodeURIComponent("/contact"));
  }
  if (!CONTACT_ENABLED) {
    return c.html(
      contactPage({
        account: s.account,
        enabled: false,
        error: "Contact form is not configured on this deployment.",
      }),
    );
  }
  if (!rateLimit(`contact:${clientKey(c)}`, 8, 60_000)) {
    return c.html(
      contactPage({
        account: s.account,
        error: "Too many messages — try again shortly.",
      }),
    );
  }
  const body = await c.req.parseBody();
  const email = String(body.email || "").trim();
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  const saveEmail = body.saveEmail === "1" || body.saveEmail === "on";

  const values = { email, subject, message, saveEmail };

  if (!email || !isValidEmailShape(email)) {
    return c.html(
      contactPage({
        account: s.account,
        error: "Please enter a valid email address so the host can reply.",
        values,
      }),
    );
  }
  if (!message || message.length < 3) {
    return c.html(
      contactPage({
        account: s.account,
        error: "Please enter a message.",
        values,
      }),
    );
  }
  if (message.length > 8000) {
    return c.html(
      contactPage({
        account: s.account,
        error: "Message is too long (max 8000 characters).",
        values,
      }),
    );
  }

  const sent = await sendContactMail({
    replyTo: email,
    subject,
    message,
    dashName: s.account.dpns_name,
    identityId: s.account.identity_id,
    accountId: s.account.id,
    saveEmailRequested: saveEmail,
  });

  if (!sent.ok) {
    return c.html(
      contactPage({
        account: s.account,
        error: sent.message,
        values,
      }),
    );
  }

  if (saveEmail) {
    setAccountEmail(s.account.id, email);
    s.account.email = email;
  }

  const flash =
    sent.transport === "log"
      ? "Message recorded (this host logs contact mail instead of SMTP). Thank you!"
      : "Message sent. Thank you!";

  return c.html(
    contactPage({
      account: s.account,
      flash,
    }),
  );
});

function renderAccess(
  c: { html: (s: string) => Response | Promise<Response> },
  account: NonNullable<ReturnType<typeof sessionFrom>>["account"],
  extra?: { flash?: string; inviteMessage?: string | null; error?: string | null },
) {
  return c.html(
    accessPage({
      account,
      settings: getAccessSettings(),
      allowlist: listAllowlist(),
      bans: listBans(),
      flash: extra?.flash,
      inviteMessage: extra?.inviteMessage,
      error: extra?.error,
    }),
  );
}

app.get("/access", (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login?next=" + encodeURIComponent("/access"));
  return renderAccess(c, s.account);
});

app.post("/access/invite", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login?next=" + encodeURIComponent("/access"));
  if (!rateLimit(`invite:${clientKey(c)}`, 20, 60_000)) {
    return renderAccess(c, s.account, { error: "Too many invites — try again shortly." });
  }
  const body = await c.req.parseBody();
  const result = createInvite(s.account, String(body.dpnsName || ""));
  if (!result.ok) {
    return renderAccess(c, s.account, { error: result.message });
  }
  return renderAccess(c, s.account, {
    flash: "Invite added.",
    inviteMessage: result.message,
  });
});

app.post("/access/settings", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  if (!isSiteOwner(s.account)) {
    return renderAccess(c, s.account, { error: "Only site owners can change settings." });
  }
  const body = await c.req.parseBody();
  updateAccessSettings({
    allowlist_enabled: body.allowlistEnabled === "1",
    user_invites_enabled: body.userInvitesEnabled === "1",
    invites_per_user: Number.parseInt(String(body.invitesPerUser || "3"), 10) || 0,
  });
  return renderAccess(c, s.account, { flash: "Settings saved." });
});

app.post("/access/allowlist/add", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  if (!isSiteOwner(s.account)) {
    return renderAccess(c, s.account, { error: "Only site owners can edit the allowlist." });
  }
  const body = await c.req.parseBody();
  const result = addAllowlistEntry({
    dpnsName: String(body.dpnsName || ""),
    source: "owner",
    invitedByAccountId: s.account.id,
  });
  if (!result.ok) {
    return renderAccess(c, s.account, { error: result.message });
  }
  return renderAccess(c, s.account, { flash: "Allowlist entry added." });
});

app.post("/access/allowlist/remove", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  if (!isSiteOwner(s.account)) {
    return renderAccess(c, s.account, { error: "Only site owners can edit the allowlist." });
  }
  const body = await c.req.parseBody();
  removeAllowlistEntry(Number(body.id));
  return renderAccess(c, s.account, { flash: "Allowlist entry removed." });
});

app.post("/access/ban/add", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  if (!isSiteOwner(s.account)) {
    return renderAccess(c, s.account, { error: "Only site owners can manage bans." });
  }
  const body = await c.req.parseBody();
  const kind = String(body.kind || "") === "identity_id" ? "identity_id" : "dpns_name";
  const result = addBan({
    kind,
    value: String(body.value || ""),
    reason: String(body.reason || "") || null,
    createdByAccountId: s.account.id,
  });
  if (!result.ok) {
    return renderAccess(c, s.account, { error: result.message });
  }
  return renderAccess(c, s.account, {
    flash: `Ban added.${result.accountsBanned ? ` ${result.accountsBanned} existing account(s) banned and sessions revoked.` : ""}`,
  });
});

app.post("/access/ban/remove", async (c) => {
  const s = sessionFrom(c);
  if (!s) return c.redirect("/login");
  if (!isSiteOwner(s.account)) {
    return renderAccess(c, s.account, { error: "Only site owners can manage bans." });
  }
  const body = await c.req.parseBody();
  removeBan(Number(body.id));
  return renderAccess(c, s.account, {
    flash:
      "Ban lifted. Matching accounts can sign in again and will be restored if they were only banned by this list.",
  });
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
    maxAge: BIND_COOKIE_MAX_AGE,
  });

  // Also store requestId for cancel form convenience
  setCookie(c as never, "siwd_rid", created.requestId, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "Lax",
    maxAge: BIND_COOKIE_MAX_AGE,
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
// Protocol still allows action=register, but this demo auto-provisions on first
// successful login — keep /register as a stable alias for old links/invites.
app.get("/register", (c) => {
  const q = c.req.query("next");
  const dest =
    q && q.startsWith("/") && !q.startsWith("//")
      ? `/login?next=${encodeURIComponent(q)}`
      : "/login";
  return c.redirect(dest, 302);
});

// --- Protocol API ---

app.get("/dash-auth/v1/r/:token", (c) => {
  if (!rateLimit(`fetch:${clientKey(c)}`, 60, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  const token = c.req.param("token");
  const row = getRequestByCapabilityToken(token);
  if (!row) {
    return jsonError("invalid_request", "Not found", 404);
  }
  if (row.status === "expired" || Date.parse(row.expires_at) <= Date.now()) {
    return jsonError("expired", "This login request expired — start a new sign-in", 404);
  }
  if (row.status !== "pending") {
    return jsonError("invalid_request", "Not found", 404);
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
  const result = await respondToRequest({
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

  /**
   * Same-origin fetch of a capability URL so the browser never hits a
   * cross-origin NetworkError when the QR uses 127.0.0.1 vs LAN IP, etc.
   */
  app.post("/dev/simulator/fetch-request", async (c) => {
    if (!rateLimit(`simf:${clientKey(c)}`, 40, 60_000)) {
      return jsonError("rate_limited", "Too many requests", 429);
    }
    try {
      const body = await c.req.json();
      let urlStr = String(body.capabilityUrl || body.url || "").trim();
      if (!urlStr) {
        return jsonError("invalid_request", "capabilityUrl required", 400);
      }
      // Allow path-only pastes
      if (urlStr.startsWith("/dash-auth/")) {
        urlStr = absoluteUrl(urlStr);
      }
      let parsed: URL;
      try {
        parsed = new URL(urlStr);
      } catch {
        return jsonError("invalid_request", "Invalid capability URL", 400);
      }
      if (!parsed.pathname.includes("/dash-auth/v1/r/")) {
        return jsonError(
          "invalid_request",
          "URL must be a SIWD capability path …/dash-auth/v1/r/…",
          400,
        );
      }
      // Prefer same-host public origin so cookies/binding stay consistent
      const localPath = parsed.pathname + parsed.search;
      const fetchUrl = absoluteUrl(localPath);
      const r = await fetch(fetchUrl, {
        headers: { Accept: "application/json" },
      });
      const text = await r.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return jsonError(
          "invalid_request",
          `Upstream returned non-JSON (${r.status})`,
          502,
        );
      }
      if (!r.ok) {
        return c.json(json, r.status as 400);
      }
      return c.json(json);
    } catch (e) {
      return jsonError(
        "platform_unavailable",
        e instanceof Error ? e.message : "fetch failed",
        503,
      );
    }
  });

  app.post("/dev/simulator/discover", async (c) => {
    if (!rateLimit(`simd:${clientKey(c)}`, 10, 60_000)) {
      return jsonError("rate_limited", "Too many discovery attempts", 429);
    }
    try {
      const body = await c.req.json();
      const phrase = String(body.phrase || "");
      const hintName = body.hintName ? String(body.hintName) : null;
      const passphrase =
        body.passphrase != null ? String(body.passphrase) : "";
      if (!phrase.trim()) {
        return jsonError("invalid_request", "phrase required", 400);
      }
      const { discoverSimulatorIdentities } = await import(
        "./lib/simulator-discover.js"
      );
      const identities = await discoverSimulatorIdentities({
        phrase,
        hintName,
        passphrase,
      });
      if (!identities.length) {
        return jsonError(
          "not_found",
          "No Platform identities found for this phrase. Use a testnet phrase that already has an identity/username.",
          404,
        );
      }
      // Return material for in-browser session only (dev simulator).
      return c.json({
        network: "testnet",
        identities: identities.map((i) => ({
          identityId: i.identityId,
          dpnsName: i.dpnsName,
          keyId: i.keyId,
          identityIndex: i.identityIndex,
          privateKeyHex: i.privateKeyHex,
          publicKeyHex: i.publicKeyHex,
          usernames: i.usernames,
        })),
      });
    } catch (e) {
      return jsonError(
        "platform_unavailable",
        e instanceof Error ? e.message : "discover failed",
        503,
      );
    }
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
    // Prefer custom testnet key material (phrase import); else fixture alice/bob.
    let privateKey: Uint8Array | null = null;
    let dpnsName = String(body.dpnsName || "");
    let keyId = Number(body.keyId);
    const customHex = String(body.privateKeyHex || "").replace(/^0x/, "");
    if (/^[0-9a-fA-F]{64}$/.test(customHex)) {
      const { hexToBytes } = await import("@siwd/protocol");
      privateKey = hexToBytes(customHex);
      if (!dpnsName) {
        return jsonError(
          "invalid_request",
          "dpnsName required for custom key",
          400,
        );
      }
      if (!Number.isFinite(keyId)) keyId = 1;
    } else {
      const signer = getSimulatorSigner(identityId);
      if (!signer) {
        return jsonError(
          "invalid_request",
          "Unknown simulator identity — import a phrase or pick alice/bob",
          400,
        );
      }
      privateKey = signer.privateKey;
      if (!dpnsName) dpnsName = signer.dpnsName;
      if (!Number.isFinite(keyId) || keyId < 0) keyId = signer.keyId;
    }

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
      privateKey,
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

    // Prefer loopback so server-side sign never depends on LAN routing of PUBLIC_ORIGIN.
    const respondCandidates = [
      `http://127.0.0.1:${PORT}/dash-auth/v1/respond`,
      absoluteUrl("/dash-auth/v1/respond"),
    ];
    let respondBody: unknown = { error: { message: "respond failed" } };
    let respondStatus = 502;
    let lastErr = "";
    for (const respondUrl of respondCandidates) {
      try {
        const r = await fetch(respondUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(response),
        });
        respondStatus = r.status;
        respondBody = await r.json();
        lastErr = "";
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (lastErr && respondStatus === 502) {
      respondBody = {
        error: { code: "respond_unreachable", message: lastErr },
      };
    }
    return c.json({
      signed: response,
      respondStatus,
      respondBody,
    });
  });
}

// --- Platform discovery proxy (for authenticator; testnet) ---

app.get("/dash-auth/v1/platform/resolve", async (c) => {
  if (!rateLimit(`plat:${clientKey(c)}`, 30, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  const name = c.req.query("name") || "";
  if (!name) return jsonError("invalid_request", "name required", 400);
  try {
    const r = await resolveDpnsName(name);
    return c.json({
      name: r.label + ".dash",
      identityId: r.identityId,
      network: "testnet",
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : `resolve failed: ${String(e)}`;
    console.error("platform/resolve error", e);
    return jsonError("platform_unavailable", msg, 503);
  }
});

app.get("/dash-auth/v1/platform/health", async (c) => {
  if (!rateLimit(`plath:${clientKey(c)}`, 12, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  try {
    return c.json(await checkPlatformConnectivity());
  } catch (e) {
    console.error("platform/health error", e);
    return jsonError(
      "platform_unavailable",
      e instanceof Error ? e.message : "Platform health check failed",
      503,
    );
  }
});

app.post("/dash-auth/v1/platform/discover", async (c) => {
  if (!rateLimit(`platd:${clientKey(c)}`, 20, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  let body: { publicKeyHashes?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return jsonError("invalid_request", "Invalid JSON", 400);
  }
  const hashes = body.publicKeyHashes || [];
  if (!hashes.length || hashes.length > 40) {
    return jsonError("invalid_request", "publicKeyHashes 1..40 required", 400);
  }
  try {
    // One worker process for all hashes (byPublicKeyHash + summaries).
    const result = await discoverByPublicKeyHashes(hashes);
    return c.json({ network: "testnet", ...result });
  } catch (e) {
    return jsonError(
      "platform_unavailable",
      e instanceof Error ? e.message : "discover failed",
      503,
    );
  }
});

app.get("/dash-auth/v1/platform/identity/:id", async (c) => {
  if (!rateLimit(`plati:${clientKey(c)}`, 30, 60_000)) {
    return jsonError("rate_limited", "Too many requests", 429);
  }
  try {
    const summary = await fetchIdentitySummary(c.req.param("id"));
    if (!summary) return jsonError("invalid_request", "Not found", 404);
    return c.json({ network: "testnet", ...summary });
  } catch (e) {
    return jsonError(
      "platform_unavailable",
      e instanceof Error ? e.message : "fetch failed",
      503,
    );
  }
});

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    network: "testnet",
    origin: PUBLIC_ORIGIN,
    verifyMode: VERIFY_MODE,
    accounts: listPublicAccounts().length,
    platformBridge: Boolean(
      (process.env.SIWD_PLATFORM_BRIDGE || "").trim(),
    ),
  }),
);

/** Injected by Phusion Passenger when present. */
declare const PhusionPassenger:
  | { configure: (opts: { autoInstall: boolean }) => void }
  | undefined;

async function startServer(): Promise<void> {
  await initDb();

  console.log(`PUBLIC_ORIGIN=${PUBLIC_ORIGIN}`);
  console.log(`Simulator: ${ENABLE_SIMULATOR ? "enabled" : "disabled"}`);
  console.log(
    `Contact form: ${CONTACT_ENABLED ? "enabled (SIWD_CONTACT_TO set)" : "disabled"}`,
  );

  /**
   * Hosted runtimes:
   * - Phusion Passenger: listen on the special 'passenger' socket.
   * - LiteSpeed Node (lsnode / CloudLinux): provide process.env.PORT.
   * Local dev: HOST + PORT from config (default 127.0.0.1:8792).
   */
  const passengerSocket =
    typeof PhusionPassenger !== "undefined" ||
    process.env.PASSENGER_APP_ENV != null;

  const lsPort = process.env.PORT ? Number(process.env.PORT) : NaN;
  const underLiteSpeed =
    Number.isFinite(lsPort) &&
    (process.env.LSNODE != null ||
      process.env.PASSENGER_BASE_URI != null ||
      process.env.IN_PASSENGER === "1");

  if (passengerSocket && typeof PhusionPassenger !== "undefined") {
    try {
      PhusionPassenger.configure({ autoInstall: false });
    } catch {
      /* optional */
    }
    const server = createServer(getRequestListener(app.fetch));
    server.listen("passenger", () => {
      console.log("SIWD demo listening via Phusion Passenger");
    });
  } else if (
    underLiteSpeed ||
    (Number.isFinite(lsPort) && process.env.NODE_ENV === "production")
  ) {
    const port = Number.isFinite(lsPort) ? lsPort : PORT;
    const server = createServer(getRequestListener(app.fetch));
    server.listen(port, "0.0.0.0", () => {
      console.log(`SIWD demo listening on 0.0.0.0:${port} (hosted/proxy)`);
    });
  } else {
    console.log(`SIWD demo listening on http://${HOST}:${PORT}`);
    serve({ fetch: app.fetch, hostname: HOST, port: PORT });
  }
}

// CJS require (lsnode/tsx) and ESM both need the promise to start work.
void startServer().catch((err) => {
  console.error("SIWD demo failed to start:", err);
  process.exit(1);
});
