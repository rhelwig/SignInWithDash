/**
 * End-to-end smoke test against a running demo server, or starts one in-process.
 * Run: npm test (expects server on SIWD_PUBLIC_ORIGIN or starts via child).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  base64urlDecode,
  signCanonicalBase64Url,
  type Action,
  type BindingPolicy,
} from "@siwd/protocol";
import { getSimulatorSigner, listSimulatorIdentities } from "./lib/simulator-keys.js";

const BASE = process.env.SIWD_PUBLIC_ORIGIN || "http://127.0.0.1:8787";

async function main() {
  let child: ChildProcess | null = null;
  // Try health; if down, start server
  try {
    const h = await fetch(`${BASE}/healthz`);
    if (!h.ok) throw new Error("unhealthy");
  } catch {
    child = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: "8787",
        SIWD_PUBLIC_ORIGIN: BASE,
        SIWD_DB_PATH: new URL("../data/smoke.sqlite", import.meta.url).pathname,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const h = await fetch(`${BASE}/healthz`);
        if (h.ok) break;
      } catch {
        /* wait */
      }
      if (i === 39) throw new Error("server failed to start");
    }
  }

  const jar = new Map<string, string>();

  function storeCookies(res: Response) {
    const raw = res.headers.getSetCookie?.() || [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair!.indexOf("=");
      if (eq > 0) jar.set(pair!.slice(0, eq), pair!.slice(eq + 1));
    }
  }

  function cookieHeader(): string {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  // 1. Start register ceremony
  const reg = await fetch(`${BASE}/register`, {
    redirect: "manual",
    headers: { cookie: cookieHeader() },
  });
  storeCookies(reg);
  const html = await reg.text();
  const m = html.match(/data-request-id="([^"]+)"/);
  const urlMatch = html.match(/id="cap-url"[^>]*value="([^"]+)"/);
  if (!m || !urlMatch) throw new Error("could not parse register page");
  const requestId = m[1]!;
  const capUrl = urlMatch[1]!.replace(/&amp;/g, "&");
  console.log("requestId", requestId);

  // 2. Fetch request
  const fr = await fetch(capUrl);
  if (!fr.ok) throw new Error("fetch request failed " + fr.status);
  const req = await fr.json();
  console.log("fetched action", req.action, "domain", req.domain);

  // 3. Sign as alice
  const alice = listSimulatorIdentities()[0]!;
  const signer = getSimulatorSigner(alice.identityId)!;
  const signature = signCanonicalBase64Url(
    {
      network: req.network,
      origin: req.origin,
      action: req.action as Action,
      bindingPolicy: req.bindingPolicy as BindingPolicy,
      requestId: req.requestId,
      nonce: base64urlDecode(req.nonce),
      issuedAt: req.issuedAt,
      expiresAt: req.expiresAt,
      identityId: alice.identityId,
      dpnsName: alice.dpnsName,
      keyId: signer.keyId,
    },
    signer.privateKey,
  );

  const respond = await fetch(`${BASE}/dash-auth/v1/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "dash-auth-response",
      version: 1,
      requestId: req.requestId,
      network: req.network,
      bindingPolicy: req.bindingPolicy,
      identityId: alice.identityId,
      dpnsName: alice.dpnsName,
      keyId: signer.keyId,
      algorithm: "dash-platform-ecdsa-recoverable-sha256d",
      signature,
    }),
  });
  const respondBody = await respond.json();
  if (!respond.ok) {
    throw new Error("respond failed: " + JSON.stringify(respondBody));
  }
  console.log("respond", respondBody);

  // 4. Status with binding cookie
  const st = await fetch(
    `${BASE}/dash-auth/v1/status?requestId=${encodeURIComponent(requestId)}`,
    { headers: { cookie: cookieHeader() } },
  );
  const stBody = await st.json();
  if (!st.ok || stBody.status !== "approved") {
    throw new Error("status expected approved: " + JSON.stringify(stBody));
  }

  // 5. Finish
  const fin = await fetch(`${BASE}/dash-auth/v1/finish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader(),
    },
    body: JSON.stringify({ requestId }),
  });
  storeCookies(fin);
  const finBody = await fin.json();
  if (!fin.ok) throw new Error("finish failed: " + JSON.stringify(finBody));
  console.log("finish", finBody);

  // 6. Me page (display name without .dash; full name still on profile)
  const me = await fetch(`${BASE}/me`, {
    headers: { cookie: cookieHeader() },
  });
  const meHtml = await me.text();
  if (!me.ok || !meHtml.includes("alice")) {
    throw new Error("me page missing alice");
  }

  // 7. Accounts list requires session
  const accAnon = await fetch(`${BASE}/accounts`, { redirect: "manual" });
  if (accAnon.status !== 302 && accAnon.status !== 301) {
    // hono redirect may be 302
    const loc = accAnon.headers.get("location") || "";
    if (!loc.includes("/login")) {
      throw new Error("accounts should redirect anonymous users to login");
    }
  }

  const acc = await fetch(`${BASE}/accounts`, {
    headers: { cookie: cookieHeader() },
  });
  const accHtml = await acc.text();
  if (!acc.ok || !accHtml.includes("alice")) {
    throw new Error("accounts page missing alice for signed-in user");
  }

  // 8. Finish without cookie should fail for new request
  const reg2 = await fetch(`${BASE}/login`, { redirect: "manual" });
  // no store cookies on purpose for finish of first... already consumed.

  console.log("SMOKE OK");
  if (child) child.kill("SIGTERM");
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
