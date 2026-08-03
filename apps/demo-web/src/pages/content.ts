import QRCode from "qrcode";
import {
  ENABLE_SIMULATOR,
  NETWORK,
  PUBLIC_ORIGIN,
  REQUEST_TTL_SECONDS,
  VERIFY_MODE,
} from "../lib/config.js";
import { displayDashName } from "../lib/display.js";
import { esc, layout } from "../lib/html.js";
import {
  listPublicAccounts,
  listSessions,
  type AccountRow,
} from "../lib/store.js";
import {
  listSimulatorIdentities,
  simulatorTestKeyNote,
} from "../lib/simulator-keys.js";

export async function homePage(account: AccountRow | null) {
  const body = `
  <section class="hero">
    <h1>Passwordless website login with Dash</h1>
    <p class="lead">
      This is a <strong>testnet demo</strong> of <em>Sign in with Dash</em> (SIWD):
      prove control of a Dash Platform identity and DPNS name without giving the
      website your recovery phrase or private keys.
    </p>
  </section>

  <div class="grid-2">
    <div class="panel">
      <h2>Try it</h2>
      <p>Create an account or sign in. On localhost you can approve with the
      <strong>dev simulator</strong> (no phone app required yet).</p>
      <p>
        <a class="btn" href="/register">Create account</a>
        <a class="btn" href="/login" style="margin-left:0.5rem;background:#244">Sign in</a>
      </p>
      ${
        ENABLE_SIMULATOR
          ? `<p class="muted"><a href="/dev/simulator">Open dev simulator</a></p>`
          : ""
      }
    </div>
    <div class="panel">
      <h2>What this site stores</h2>
      <ul class="checklist">
        <li>Your Dash identity ID and DPNS name</li>
        <li>When you created the account and last signed in</li>
        <li>Short-lived login requests and <strong>session</strong> cookies (browser session only)</li>
      </ul>
      <p class="muted">It never receives or stores a recovery phrase or private key.</p>
    </div>
  </div>

  <div class="panel">
    <h2>At a glance</h2>
    <ul class="checklist">
      <li>Network: <span class="mono">${esc(NETWORK)}</span></li>
      <li>Verify mode: <span class="mono">${esc(VERIFY_MODE)}</span> (M1 = local fixtures; live Platform comes later)</li>
      <li>Public origin: <span class="mono">${esc(PUBLIC_ORIGIN)}</span></li>
      <li>Default request lifetime: ${REQUEST_TTL_SECONDS}s</li>
      <li>Persistent “remember me”: <strong>off</strong> by design</li>
    </ul>
  </div>
  `;
  return layout({ title: "Home", body, account });
}

export function howItWorksPage(account: AccountRow | null) {
  const body = `
  <h1>How Sign in with Dash works</h1>
  <div class="panel">
    <ol>
      <li>The website creates a short-lived, domain-bound login request and shows a QR (or link).</li>
      <li>Your authenticator fetches the request over HTTPS, shows the domain and action, and asks you to approve.</li>
      <li>You approve; the phone signs a <strong>canonical challenge</strong> with an eligible Dash identity authentication key (HIGH).</li>
      <li>The website verifies the signature and checks Dash Platform (identity keys + DPNS name). On this demo in simulator mode, fixtures stand in for Platform.</li>
      <li>Only the browser that started the login (binding cookie) can finish and receive a session cookie.</li>
    </ol>
  </div>
  <div class="panel">
    <h2>What it is not</h2>
    <ul class="checklist">
      <li>Not a password or email magic link</li>
      <li>Not Yappr-style key transfer into the website (this site never holds your keys)</li>
      <li>Not phishing-proof for QR forwarding in the MVP — only approve logins <em>you</em> started</li>
      <li>Not mainnet-ready</li>
    </ul>
  </div>
  <div class="panel">
    <h2>Account model on this demo</h2>
    <p>Accounts are <strong>identity-bound</strong>: the Dash identity ID is the stable key;
    the DPNS name is a public handle. Session cookies last for the browser session only.</p>
  </div>
  `;
  return layout({ title: "How it works", body, account });
}

export function getStartedPage(account: AccountRow | null) {
  const ids = listSimulatorIdentities();
  const body = `
  <h1>Get started testing</h1>
  <div class="warn-box">
    <strong>Testnet only.</strong> Never enter a mainnet recovery phrase into experimental software.
  </div>

  <div class="panel">
    <h2>Option A — Localhost with dev simulator (ready now)</h2>
    <ol>
      <li>Open <a href="/register">Create account</a> or <a href="/login">Sign in</a> in one browser tab.</li>
      <li>Open <a href="/dev/simulator">Dev simulator</a> in another tab (or on a second device on the same host).</li>
      <li>Paste the capability URL from the QR (or open the QR link and copy it into the simulator).</li>
      <li>Choose a fixture identity (e.g. <span class="mono">${esc(displayDashName("alice.dash"))}</span>) and approve.</li>
      <li>The first tab finishes automatically and signs you in.</li>
    </ol>
    <p class="muted">${esc(simulatorTestKeyNote())}</p>
    <p class="muted">Names are shown without the <span class="mono">.dash</span> parent label; the protocol still uses the full name.</p>
    <table>
      <thead><tr><th>Name</th><th>Identity ID</th><th>Key</th></tr></thead>
      <tbody>
        ${ids
          .map(
            (i) =>
              `<tr><td class="mono">${esc(displayDashName(i.dpnsName))}</td><td class="mono">${esc(i.identityId)}</td><td class="mono">${i.keyId}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Option B — Phone authenticator (later milestones)</h2>
    <p>After the protocol and simulator path are solid, we plan a real Android
    authenticator for testnet. That may be:</p>
    <ul class="checklist">
      <li>a <strong>separate authentication app</strong> (likely preferred for many people —
        keep site-login signing apart from a full payment wallet), and/or</li>
      <li>an optional integration into an existing Dash wallet if maintainers want it</li>
    </ul>
    <p>Wallet integration is not guaranteed and is not required to use SIWD.
    Development hardware for the first APK path includes a <strong>Samsung Galaxy A7</strong>
    sideload target before any wider distribution.</p>
    <p>When an APK exists, this page will cover install, testnet funding/identity setup,
    and safe phrase handling. Until then:</p>
    <ul class="checklist">
      <li>Use only generated testnet credentials — never a mainnet phrase</li>
      <li>Prefer scanning the QR from a device you control</li>
      <li>Approve only if you started the login for this exact domain moments ago</li>
    </ul>
  </div>

  <div class="panel">
    <h2>Pen-testers</h2>
    <p>See <a href="/security">Security &amp; testing notes</a> for intentional residual risks,
    rate limits, and what is in-scope for the demo.</p>
  </div>
  `;
  return layout({ title: "Get started", body, account });
}

export function securityPage(account: AccountRow | null) {
  const body = `
  <h1>Security &amp; testing notes</h1>
  <div class="panel">
    <h2>Demo defaults</h2>
    <ul class="checklist">
      <li>≥256-bit capability tokens; request bodies <span class="mono">Cache-Control: no-store</span></li>
      <li>Browser binding cookie required to finish login</li>
      <li>Session cookies only (no multi-week remember-me)</li>
      <li>HIGH authentication keys only; master/CRITICAL/transfer rejected</li>
      <li>Rate limits on create / fetch / respond / status / finish</li>
    </ul>
  </div>
  <div class="panel">
    <h2>Known residual risks (by design for MVP)</h2>
    <ul class="checklist">
      <li><strong>QR forwarding:</strong> if someone else starts a real login and you approve their QR, their browser gets the session. Only approve logins you started.</li>
      <li><strong>Simulator mode:</strong> does not talk to live Dash Platform yet.</li>
      <li><strong>Account list:</strong> visible only when signed in (Dash names + identity IDs for transparency among testers).</li>
    </ul>
  </div>
  <div class="panel">
    <h2>Helpful attacks to try (demo only)</h2>
    <ul class="checklist">
      <li>Finish without the binding cookie</li>
      <li>Reuse a capability URL after expiry or after consume</li>
      <li>Respond twice; finish twice</li>
      <li>Sign with the wrong origin, network, or key level (simulator can help)</li>
      <li>Open the capability URL from a different browser than the one that created the request</li>
    </ul>
  </div>
  `;
  return layout({ title: "Security", body, account });
}

export function accountsPage(account: AccountRow) {
  const rows = listPublicAccounts();
  const body = `
  <h1>Accounts on this demo</h1>
  <p class="lead">Active accounts on this site (signed-in testers only). This is what the site associates with a login — not your keys.</p>
  <div class="panel">
    ${
      rows.length === 0
        ? `<p class="muted">No accounts yet. Be the first to <a href="/register">create one</a>.</p>`
        : `<table>
      <thead>
        <tr>
          <th>Dash name</th>
          <th>Identity ID</th>
          <th>Binding</th>
          <th>Created</th>
          <th>Last login</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (a) => `<tr>
          <td class="mono">${esc(displayDashName(a.dpns_name))}</td>
          <td class="mono account-id">${esc(a.identity_id)}</td>
          <td>${esc(a.binding_policy)}</td>
          <td>${esc(a.created_at.slice(0, 19))}Z</td>
          <td>${a.last_login_at ? esc(a.last_login_at.slice(0, 19)) + "Z" : "—"}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
    }
  </div>
  <p class="muted">Display names omit the <span class="mono">.dash</span> parent. Full names are stored and signed on the wire. Identity IDs are public on Dash Platform.</p>
  `;
  return layout({ title: "Accounts", body, account });
}

export async function authCeremonyPage(opts: {
  action: "login" | "register";
  account: AccountRow | null;
  requestId: string;
  capabilityUrl: string;
  expiresAt: string;
}) {
  const qrDataUrl = await QRCode.toDataURL(opts.capabilityUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
  const title = opts.action === "register" ? "Create account" : "Sign in";
  const body = `
  <h1>${esc(title)} with Dash</h1>
  <div class="warn-box">
    Only approve this if <strong>you</strong> started this ${esc(opts.action)} for
    <span class="mono">${esc(new URL(PUBLIC_ORIGIN).host)}</span> moments ago.
    Do not approve a QR someone else sent you.
  </div>
  <div class="panel" id="auth-flow" data-request-id="${esc(opts.requestId)}">
    <p class="auth-status pending" id="auth-status">Waiting for approval…</p>
    <p class="muted" id="auth-detail">Request expires at ${esc(opts.expiresAt)}</p>
    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="Login QR code" width="280" height="280" />
      <div class="copy-row">
        <input id="cap-url" type="text" readonly value="${esc(opts.capabilityUrl)}" />
        <button type="button" data-copy="#cap-url">Copy</button>
      </div>
      ${
        ENABLE_SIMULATOR
          ? `<p class="muted">Local testing: paste that URL into the <a href="/dev/simulator" target="_blank" rel="noopener">dev simulator</a>.</p>`
          : ""
      }
    </div>
    <form method="post" action="/dash-auth/v1/cancel" class="stack">
      <input type="hidden" name="requestId" value="${esc(opts.requestId)}" />
      <button type="submit">Cancel</button>
    </form>
  </div>
  `;
  return layout({ title, body, account: opts.account });
}

function sessionStatusLabel(s: {
  revoked_at: string | null;
  end_reason: string | null;
}): string {
  if (!s.revoked_at) return "active";
  switch (s.end_reason) {
    case "logout":
      return "signed out";
    case "revoked":
      return "revoked";
    case "revoke_others":
      return "revoked (other sessions)";
    case "deactivate":
      return "ended (account deactivated)";
    default:
      return s.end_reason ? `ended (${s.end_reason})` : "ended";
  }
}

export function mePage(account: AccountRow, sessions: ReturnType<typeof listSessions>) {
  const shown = displayDashName(account.dpns_name);
  const body = `
  <h1>Your account</h1>
  <div class="ok-box">
    Signed in as <strong class="mono">${esc(shown)}</strong>
  </div>
  <div class="panel">
    <h2>Profile (what the site knows)</h2>
    <table>
      <tr><th>Dash name</th><td class="mono">${esc(shown)}</td></tr>
      <tr><th>Full name (stored)</th><td class="mono muted">${esc(account.dpns_name)}</td></tr>
      <tr><th>Identity ID</th><td class="mono">${esc(account.identity_id)}</td></tr>
      <tr><th>Binding policy</th><td>${esc(account.binding_policy)}</td></tr>
      <tr><th>Created</th><td>${esc(account.created_at)}</td></tr>
      <tr><th>Last login</th><td>${esc(account.last_login_at ?? "—")}</td></tr>
    </table>
  </div>
  <div class="panel">
    <h2>Sessions</h2>
    <p class="muted">Browser session cookies end when you close the browser.
    Server-side rows record how a session was closed: normal <strong>sign out</strong>
    vs forced <strong>revoke</strong> (forensics-friendly, not a complete audit log).</p>
    <table>
      <thead><tr><th>Created</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${sessions
          .map(
            (s) => `<tr>
          <td>${esc(s.created_at.slice(0, 19))}</td>
          <td>${esc(s.last_seen_at.slice(0, 19))}</td>
          <td>${esc(sessionStatusLabel(s))}</td>
          <td>${
            s.revoked_at
              ? ""
              : `<form method="post" action="/me/revoke-session" class="inline">
                  <input type="hidden" name="sessionId" value="${esc(s.id)}" />
                  <button type="submit" class="danger">Revoke</button>
                </form>`
          }</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <form method="post" action="/me/revoke-others" style="margin-top:1rem">
      <button type="submit">Revoke other sessions</button>
    </form>
  </div>
  <div class="panel">
    <h2>Danger zone</h2>
    <p class="muted">Unlink / deactivate removes SIWD control and revokes all sessions (demo policy).</p>
    <form method="post" action="/me/deactivate" onsubmit="return confirm('Deactivate this account?');">
      <button type="submit" class="danger">Deactivate account</button>
    </form>
  </div>
  `;
  return layout({ title: "Account", body, account });
}

export function simulatorPage(account: AccountRow | null) {
  const ids = listSimulatorIdentities();
  const body = `
  <h1>Dev authenticator simulator</h1>
  <div class="warn-box">
    Development only. Signs SIWD challenges with fixture keys. Not a wallet.
  </div>
  <div class="panel stack">
    <div>
      <label for="cap">Capability URL <span class="muted">(paste the QR code's text here)</span></label>
      <input id="cap" type="text" autocomplete="off" spellcheck="false"
        placeholder="http://127.0.0.1:8787/dash-auth/v1/r/..." />
      <p class="muted" id="cap-hint" style="margin:0.35rem 0 0">Paste or type the URL — the request loads automatically.</p>
    </div>
    <div>
      <label for="ident">Sign in as</label>
      <select id="ident">
        ${ids
          .map(
            (i) =>
              `<option value="${esc(i.identityId)}" data-name="${esc(i.dpnsName)}" data-key="${i.keyId}">${esc(displayDashName(i.dpnsName))}</option>`,
          )
          .join("")}
      </select>
    </div>

    <div id="sim-summary" class="sim-summary" hidden>
      <h2 class="sim-summary-title">Login request</h2>
      <dl class="sim-dl">
        <div><dt>Website</dt><dd id="sum-domain" class="mono">—</dd></div>
        <div><dt>Action</dt><dd id="sum-action">—</dd></div>
        <div><dt>Network</dt><dd id="sum-network" class="mono">—</dd></div>
        <div><dt>Account binding</dt><dd id="sum-policy">—</dd></div>
        <div><dt>Expires</dt><dd id="sum-expires" data-expires-at="">—</dd></div>
      </dl>
      <div class="warn-box" id="sim-warning">
        Only approve if you personally started this login for the displayed domain moments ago.
      </div>
      <div class="sim-actions">
        <button type="button" class="primary" id="sim-approve" disabled>Approve &amp; sign in</button>
        <button type="button" id="sim-details-btn">View details</button>
      </div>
      <pre id="sim-request" class="mono muted sim-json" hidden></pre>
    </div>

    <p id="sim-status" class="muted" role="status"></p>
    <div id="sim-result-wrap" hidden>
      <h2 class="sim-summary-title">Result</h2>
      <p id="sim-result-friendly"></p>
      <button type="button" id="sim-result-details-btn">View technical details</button>
      <pre id="sim-result" class="mono muted sim-json" hidden></pre>
    </div>
  </div>
  <script type="module">
    const cap = document.getElementById('cap');
    const ident = document.getElementById('ident');
    const summary = document.getElementById('sim-summary');
    const reqPre = document.getElementById('sim-request');
    const detailsBtn = document.getElementById('sim-details-btn');
    const resWrap = document.getElementById('sim-result-wrap');
    const resPre = document.getElementById('sim-result');
    const resFriendly = document.getElementById('sim-result-friendly');
    const resDetailsBtn = document.getElementById('sim-result-details-btn');
    const warn = document.getElementById('sim-warning');
    const statusEl = document.getElementById('sim-status');
    const approve = document.getElementById('sim-approve');
    const sumExpires = document.getElementById('sum-expires');
    let fetched = null;
    let lastFetchedUrl = '';
    let fetchTimer = null;
    let fetchGen = 0;
    let countdownTimer = null;

    function actionLabel(a) {
      if (a === 'register') return 'Create account';
      if (a === 'link') return 'Link account';
      if (a === 'login') return 'Sign in';
      return a || '—';
    }
    function policyLabel(p) {
      if (p === 'identity_bound') return 'Identity-bound';
      if (p === 'name_bound') return 'Name-bound';
      return p || '—';
    }
    function looksLikeCapabilityUrl(u) {
      try {
        const url = new URL(u);
        return url.pathname.includes('/dash-auth/v1/r/');
      } catch { return false; }
    }
    function setStatus(msg, isError) {
      statusEl.textContent = msg || '';
      statusEl.className = isError ? 'muted sim-error' : 'muted';
    }
    function stopCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
    function renderExpires(expiresAt) {
      if (!expiresAt) {
        sumExpires.textContent = '—';
        sumExpires.dataset.expiresAt = '';
        return;
      }
      sumExpires.dataset.expiresAt = expiresAt;
      const ms = new Date(expiresAt).getTime() - Date.now();
      const sec = Math.max(0, Math.ceil(ms / 1000));
      if (sec <= 0) {
        sumExpires.textContent = expiresAt + ' (expired)';
        sumExpires.classList.add('sim-error');
        approve.disabled = true;
        setStatus('This request has expired. Start a new login in the other tab.', true);
      } else {
        sumExpires.textContent = expiresAt + ' (' + sec + 's left)';
        sumExpires.classList.remove('sim-error');
      }
    }
    function startCountdown(expiresAt) {
      stopCountdown();
      renderExpires(expiresAt);
      if (!expiresAt) return;
      countdownTimer = setInterval(() => {
        renderExpires(sumExpires.dataset.expiresAt || expiresAt);
      }, 1000);
    }
    function clearSummary() {
      fetched = null;
      lastFetchedUrl = '';
      summary.hidden = true;
      approve.disabled = true;
      reqPre.hidden = true;
      reqPre.textContent = '';
      detailsBtn.textContent = 'View details';
      stopCountdown();
      sumExpires.textContent = '—';
      sumExpires.dataset.expiresAt = '';
      sumExpires.classList.remove('sim-error');
    }
    function showSummary(j) {
      document.getElementById('sum-domain').textContent = j.domain || j.origin || '—';
      document.getElementById('sum-action').textContent = actionLabel(j.action);
      document.getElementById('sum-network').textContent = j.network || '—';
      document.getElementById('sum-policy').textContent = policyLabel(j.bindingPolicy);
      startCountdown(j.expiresAt || '');
      warn.innerHTML = 'Only approve if you personally started this <strong>' +
        actionLabel(j.action) + '</strong> for <span class="mono">' +
        (j.domain || j.origin || 'this site') + '</span> moments ago.';
      reqPre.textContent = JSON.stringify(j, null, 2);
      reqPre.hidden = true;
      detailsBtn.textContent = 'View details';
      summary.hidden = false;
      const msLeft = j.expiresAt ? new Date(j.expiresAt).getTime() - Date.now() : 0;
      approve.disabled = !(msLeft > 0);
    }

    async function fetchRequest(url) {
      const gen = ++fetchGen;
      clearSummary();
      resWrap.hidden = true;
      if (!url) {
        setStatus('');
        return;
      }
      if (!looksLikeCapabilityUrl(url)) {
        setStatus('Paste the full capability URL from the QR code (…/dash-auth/v1/r/…).', true);
        return;
      }
      setStatus('Loading request…');
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        const j = await r.json();
        if (gen !== fetchGen) return;
        if (!r.ok) {
          setStatus((j.error && j.error.message) || ('Could not load request (' + r.status + ')'), true);
          return;
        }
        fetched = j;
        lastFetchedUrl = url;
        showSummary(j);
        setStatus('Request loaded. Choose an identity and approve if this is your login.');
      } catch (e) {
        if (gen !== fetchGen) return;
        setStatus(String(e.message || e), true);
      }
    }

    function scheduleFetch() {
      if (fetchTimer) clearTimeout(fetchTimer);
      fetchTimer = setTimeout(() => {
        const url = cap.value.trim();
        if (url === lastFetchedUrl && fetched) return;
        fetchRequest(url);
      }, 400);
    }

    cap.addEventListener('input', scheduleFetch);
    cap.addEventListener('paste', () => setTimeout(scheduleFetch, 0));
    cap.addEventListener('change', scheduleFetch);

    // If the page was opened with ?url=...
    const params = new URLSearchParams(location.search);
    const prefill = params.get('url');
    if (prefill) {
      cap.value = prefill;
      fetchRequest(prefill.trim());
    }

    detailsBtn.addEventListener('click', () => {
      const open = reqPre.hidden;
      reqPre.hidden = !open;
      detailsBtn.textContent = open ? 'Hide details' : 'View details';
    });

    resDetailsBtn.addEventListener('click', () => {
      const open = resPre.hidden;
      resPre.hidden = !open;
      resDetailsBtn.textContent = open ? 'Hide technical details' : 'View technical details';
    });

    approve.addEventListener('click', async () => {
      if (!fetched) return;
      approve.disabled = true;
      setStatus('Signing and sending approval…');
      const opt = ident.selectedOptions[0];
      const body = {
        capabilityUrl: cap.value.trim(),
        identityId: ident.value,
        dpnsName: opt.getAttribute('data-name'),
        keyId: Number(opt.getAttribute('data-key')),
        request: fetched,
      };
      try {
        const r = await fetch('/dev/simulator/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        resWrap.hidden = false;
        resPre.textContent = JSON.stringify(j, null, 2);
        resPre.hidden = true;
        resDetailsBtn.textContent = 'View technical details';
        const ok = r.ok && j.respondBody && j.respondBody.status === 'approved';
        if (ok) {
          resFriendly.innerHTML = '<span class="ok-inline">Approved.</span> Return to the browser tab with the QR code — it should finish signing you in automatically.';
          setStatus('Done.');
          stopCountdown();
        } else {
          const msg = (j.respondBody && j.respondBody.error && j.respondBody.error.message)
            || (j.error && j.error.message)
            || 'Approval failed';
          resFriendly.innerHTML = '<span class="err-inline">Not approved.</span> ' + msg;
          setStatus(msg, true);
          approve.disabled = false;
        }
      } catch (e) {
        setStatus(String(e.message || e), true);
        approve.disabled = false;
      }
    });
  </script>
  `;
  return layout({ title: "Dev simulator", body, account });
}
