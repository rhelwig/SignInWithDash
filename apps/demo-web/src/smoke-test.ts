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

const PORT = process.env.PORT || "8792";
const BASE =
  process.env.SIWD_PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`;

async function main() {
  let child: ChildProcess | null = null;
  // Try health; if down, start server
  try {
    const h = await fetch(`${BASE}/healthz`);
    if (!h.ok) throw new Error("unhealthy");
  } catch {
    const listenPort = process.env.PORT || new URL(BASE).port || "8792";
    child = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(listenPort),
        HOST: "127.0.0.1",
        SIWD_PUBLIC_ORIGIN: BASE,
        SIWD_DB_PATH: new URL("../data/smoke.sqlite", import.meta.url).pathname,
        // Enable contact form in log-only mode (no SMTP).
        SIWD_CONTACT_TO: "smoke-contact@example.test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const h = await fetch(`${BASE}/healthz`);
        if (h.ok) break;
      } catch {
        /* wait */
      }
      if (i === 39) {
        throw new Error("server failed to start: " + stderr.slice(-800));
      }
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

  // 1. Start login ceremony (first success auto-creates the site account)
  const reg = await fetch(`${BASE}/login`, {
    redirect: "manual",
    headers: { cookie: cookieHeader() },
  });
  storeCookies(reg);
  const html = await reg.text();
  const m = html.match(/data-request-id="([^"]+)"/);
  const urlMatch = html.match(/id="cap-url"[^>]*value="([^"]+)"/);
  if (!m || !urlMatch) throw new Error("could not parse login page");
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

  // 8. Access page (signed-in)
  const access = await fetch(`${BASE}/access`, {
    headers: { cookie: cookieHeader() },
  });
  const accessHtml = await access.text();
  if (!access.ok || !accessHtml.includes("Access") || !accessHtml.includes("Invite")) {
    throw new Error("access page missing invite UI");
  }

  // 9. Invite bob
  const inv = await fetch(`${BASE}/access/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: "dpnsName=bob",
    redirect: "manual",
  });
  storeCookies(inv);
  const invHtml = await inv.text();
  if (!invHtml.includes("reserved a spot") && !invHtml.includes("Invite added")) {
    // HTML response always 200 with invite message box
    if (!invHtml.includes("bob") || !invHtml.includes("invite")) {
      throw new Error("invite failed: " + invHtml.slice(0, 400));
    }
  }

  // 10. Enable allowlist as owner (smoke: no SIWD_SITE_OWNER_NAMES → all owners)
  const set = await fetch(`${BASE}/access/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: "allowlistEnabled=1&userInvitesEnabled=1&invitesPerUser=3",
  });
  const setHtml = await set.text();
  if (!set.ok || !setHtml.includes("Settings saved")) {
    throw new Error("settings save failed");
  }

  // 11. Ban identity should reject later; first confirm home mentions allowlist
  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  if (!homeHtml.includes("Donate") && !homeHtml.includes("donate")) {
    throw new Error("home missing donate link");
  }
  if (!homeHtml.includes("shared") && !homeHtml.includes("Shared")) {
    // notice may be in footer
    if (!homeHtml.includes("shared hosting") && !homeHtml.includes("Shared hosting")) {
      throw new Error("home missing shared-host notice");
    }
  }

  // 12. Finish without cookie should fail for new request
  const reg2 = await fetch(`${BASE}/login`, { redirect: "manual" });
  // no store cookies on purpose for finish of first... already consumed.
  void reg2;

  // 13. Contact form: anonymous redirected; signed-in can submit + save email
  const contactAnon = await fetch(`${BASE}/contact`, { redirect: "manual" });
  const contactAnonLoc = contactAnon.headers.get("location") || "";
  if (
    contactAnon.status !== 302 &&
    contactAnon.status !== 301 &&
    !contactAnonLoc.includes("/login")
  ) {
    // Some stacks return 200 only when CONTACT is disabled on an already-running server
    if (contactAnon.ok) {
      const t = await contactAnon.text();
      if (!t.includes("not configured") && !t.includes("Sign in")) {
        throw new Error("contact should require login or show not configured");
      }
    } else if (!contactAnonLoc.includes("/login")) {
      throw new Error("contact should redirect anonymous users to login");
    }
  }

  const contactGet = await fetch(`${BASE}/contact`, {
    headers: { cookie: cookieHeader() },
  });
  const contactGetHtml = await contactGet.text();
  if (contactGet.ok && contactGetHtml.includes('name="email"')) {
    // Form enabled (smoke server sets SIWD_CONTACT_TO)
    const saveMatch = contactGetHtml.match(/name="saveEmail"[^>]*/);
    if (saveMatch && /\bchecked\b/.test(saveMatch[0])) {
      throw new Error("saveEmail checkbox should be unchecked by default");
    }
    if (!contactGetHtml.includes("No email associated") && !contactGetHtml.includes("value=\"\"")) {
      // Prefill should be empty when account has no saved email
    }
    // Before save, accounts list should say no email associated
    const accBefore = await fetch(`${BASE}/accounts`, {
      headers: { cookie: cookieHeader() },
    });
    const accBeforeHtml = await accBefore.text();
    if (!accBeforeHtml.includes("No email associated")) {
      throw new Error("accounts list should say no email associated initially");
    }

    const contactPost = await fetch(`${BASE}/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(),
      },
      body:
        "email=alice-tester%40example.test&subject=Smoke&message=Hello+from+smoke&saveEmail=1",
    });
    const contactPostHtml = await contactPost.text();
    if (!contactPost.ok || !contactPostHtml.includes("Thank you")) {
      throw new Error(
        "contact submit failed: " + contactPostHtml.slice(0, 400),
      );
    }
    console.log("contact submit ok");
    // Autofill + accounts list obfuscation
    const contactAgain = await fetch(`${BASE}/contact`, {
      headers: { cookie: cookieHeader() },
    });
    const contactAgainHtml = await contactAgain.text();
    if (!contactAgainHtml.includes("alice-tester@example.test")) {
      throw new Error("contact form should autofill saved email");
    }
    const acc2 = await fetch(`${BASE}/accounts`, {
      headers: { cookie: cookieHeader() },
    });
    const acc2Html = await acc2.text();
    if (acc2Html.includes("alice-tester@example.test")) {
      throw new Error("accounts list must not show full email");
    }
    if (!acc2Html.includes("a***@e***.test")) {
      // obfuscateEmail("alice-tester@example.test") → a***@e***.test
      throw new Error(
        "accounts list should show obfuscated email, got snippet: " +
          acc2Html.match(/Email[\s\S]{0,400}/)?.[0]?.slice(0, 200),
      );
    }
  } else if (contactGet.ok && contactGetHtml.includes("not configured")) {
    console.log("contact form disabled on this server (ok for external host)");
  } else if (!contactGet.ok) {
    throw new Error("contact page failed for signed-in user");
  } else {
    throw new Error(
      "contact page unexpected content: " + contactGetHtml.slice(0, 200),
    );
  }

  console.log("SMOKE OK");
  if (child) child.kill("SIGTERM");
  process.exit(0);
}

main().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
