import QRCode from "qrcode";
import {
  type AllowlistEntry,
  type BanEntry,
  type SiteAccessSettings,
  getAccessSettings,
  invitesRemaining,
  isSiteOwner,
  listInvitesByAccount,
  ownersConfigured,
} from "../lib/access.js";
import {
  CONTACT_ENABLED,
  DONATE_URL,
  ENABLE_SIMULATOR,
  NETWORK,
  PUBLIC_ORIGIN,
  REPO_URL,
  REQUEST_TTL_SECONDS,
  SHARED_HOST_NOTICE,
  VERIFY_MODE,
} from "../lib/config.js";
import { displayDashName, obfuscateEmail } from "../lib/display.js";
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

/** UTC line + browser-local friendly line (`data-local-time` filled by app.js). */
function friendlyTimeHtml(
  iso: string | null | undefined,
  empty = "—",
): string {
  if (!iso) {
    return `<span class="muted">${esc(empty)}</span>`;
  }
  const utc = `${iso.slice(0, 19).replace("T", " ")} UTC`;
  return `<div class="account-times">
    <div class="mono account-time-utc">${esc(utc)}</div>
    <div class="account-time-local muted" data-local-time="${esc(iso)}">…</div>
  </div>`;
}

export async function homePage(account: AccountRow | null) {
  const settings = getAccessSettings();
  const accessBlurb = settings.allowlist_enabled
    ? `<p class="muted">Registration is <strong>allowlist-only</strong> right now.
       Signed-in users can invite others from
       <a href="${account ? "/access" : "/login?next=/access"}">Access &amp; invites</a>
       when invites are enabled.</p>`
    : `<p class="muted">Anyone with a testnet Dash name can sign in (first time creates
       the site account) unless the site owner turns on the allowlist. See
       <a href="${account ? "/access" : "/login?next=/access"}">Access &amp; invites</a>.</p>`;

  const body = `
  <section class="hero">
    <h1>Passwordless website login with Dash</h1>
    <p class="lead">
      This is a <strong>testnet demo</strong> of <em>Sign in with Dash</em> (SIWD):
      prove control of a Dash Platform identity and DPNS name without giving the
      website your recovery phrase or private keys.
    </p>
  </section>

  ${
    SHARED_HOST_NOTICE
      ? `<div class="warn-box">
    <strong>Shared hosting — please be gentle.</strong>
    This public demo runs on a shared host that I cannot upgrade to a bigger machine.
    Light manual testing is welcome; automated load tests or hammering the endpoints are not.
    If you want to stress the system or run continuous tests, please
    <a href="${esc(REPO_URL)}">host your own copy</a> — that helps a lot.
  </div>`
      : ""
  }

  <div class="grid-2">
    <div class="panel">
      <h2>Try it</h2>
      <p>Sign in with your Dash Platform identity. The first successful
      approval creates your site account automatically — there is no separate
      registration step. On localhost you can approve with the
      <strong>dev simulator</strong> (no phone app required yet).</p>
      <p>
        <a class="btn" href="/login">Sign in with Dash</a>
      </p>
      ${accessBlurb}
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
        <li>Optional allowlist, invite records, and ban list (site policy)</li>
        <li>Optional contact email <em>only if you choose to save it</em> from the contact form</li>
      </ul>
      <p class="muted">It never receives or stores a recovery phrase or private key. Login does not require email.</p>
    </div>
  </div>

  <div class="panel">
    <h2>At a glance</h2>
    <ul class="checklist">
      <li>Network: <span class="mono">${esc(NETWORK)}</span></li>
      <li>Verify mode: <span class="mono">${esc(VERIFY_MODE)}</span>
        ${
          VERIFY_MODE === "hybrid"
            ? " — live Platform for real identities; alice/bob fixtures still work offline"
            : VERIFY_MODE === "platform"
              ? " — live Platform only (no fixture fallback)"
              : " — fixture keys only (no live Platform)"
        }</li>
      <li>Public origin: <span class="mono">${esc(PUBLIC_ORIGIN)}</span></li>
      <li>Default request lifetime: ${REQUEST_TTL_SECONDS}s</li>
      <li>Persistent “remember me”: <strong>off</strong> by design</li>
      <li>Allowlist for new accounts: <strong>${settings.allowlist_enabled ? "on" : "off"}</strong>
        · user invites: <strong>${settings.user_invites_enabled ? `on (up to ${settings.invites_per_user} each)` : "off"}</strong></li>
    </ul>
  </div>

  <div class="panel">
    <h2>Support this work</h2>
    <p class="muted">If the demo is useful and you want to help cover hosting and development time,
    donations are appreciated (no obligation).</p>
    <p><a class="btn" href="${esc(DONATE_URL)}" rel="noopener noreferrer">Donate</a></p>
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

  ${
    SHARED_HOST_NOTICE
      ? `<div class="warn-box">
    <strong>Public demo courtesy.</strong> The live demo is on shared hosting.
    Please do not load-test or script against it — I cannot afford a larger server.
    For heavy testing, run your own instance from
    <a href="${esc(REPO_URL)}">the GitHub repo</a>. That is the best way to help.
  </div>`
      : ""
  }

  <div class="panel">
    <h2>Option A — Localhost with dev simulator (ready now)</h2>
    <ol>
      <li>Open <a href="/login">Sign in with Dash</a> in one browser tab.</li>
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
    <h2>Option B — Android authenticator (testnet, available now)</h2>
    <p>This demo is aimed at <strong>Dash developers</strong> and others who may implement
    SIWD on their own sites, build their own authenticator, or integrate login capabilities
    into a wallet. There is a working <strong>standalone Android authenticator</strong>
    for testnet (sideload; not a Play Store product).</p>
    <ul class="checklist">
      <li><strong>Prefer building from source</strong> so you can read and audit the code
        before putting a recovery phrase on a device. Source lives under
        <span class="mono">apps/android-authenticator</span> in
        <a href="${esc(REPO_URL)}">${esc(REPO_URL)}</a>.</li>
      <li>A prebuilt <strong>debug APK</strong> is published for convenience while iterating:
        <a href="/downloads/siwd-authenticator-testnet-debug.apk">Download SIWD Android authenticator (testnet debug APK)</a>.
        Treat it as a developer sample — verify the build from source for any serious use.</li>
      <li>Requires a <strong>testnet</strong> Dash Platform identity + DPNS name (e.g. from
        testnet DashPay). Never enter a mainnet recovery phrase.</li>
      <li>Flow: open <a href="/login">Sign in with Dash</a> here → scan the QR (or paste the
        capability URL into the app) → approve on the phone → browser finishes.</li>
    </ul>
    <p class="muted">Wallet integration is not required to use SIWD. A separate authenticator
    keeps site-login signing apart from a full payment wallet; wallets may still choose to
    embed SIWD later.</p>
    <p class="muted">Build tips: JDK 21, Android SDK; see the authenticator
    <a href="${esc(REPO_URL)}/tree/main/apps/android-authenticator">README</a>.
    First sideload target for development was a Samsung Galaxy A7 class device.</p>
    <ul class="checklist">
      <li>Use only generated testnet credentials — never a mainnet phrase</li>
      <li>Prefer scanning the QR from a device you control</li>
      <li>Approve only if you started the login for this exact domain moments ago</li>
    </ul>
  </div>

  <div class="panel">
    <h2>Invites &amp; access control</h2>
    <p>Site owners can restrict who may <em>create</em> accounts (allowlist), let existing users
    invite up to a fixed number of Dash names, and maintain ban lists. Signed-in users manage
    this under <a href="${account ? "/access" : "/login?next=/access"}">Access &amp; invites</a>.</p>
  </div>

  <div class="panel">
    <h2>Pen-testers</h2>
    <p>See <a href="/security">Security &amp; testing notes</a> for intentional residual risks,
    rate limits, and what is in-scope for the demo.</p>
    <p class="muted">Please run aggressive scanners against your own deployment, not the shared public demo.</p>
  </div>

  <div class="panel">
    <h2>Support</h2>
    <p class="muted">Optional: <a href="${esc(DONATE_URL)}" rel="noopener noreferrer">donate</a>
    if you appreciate the work.</p>
  </div>
  `;
  return layout({ title: "Get started", body, account });
}

export function howToTestPage(account: AccountRow | null) {
  const body = `
  <h1>How to test (public testnet demo)</h1>
  <div class="warn-box">
    <strong>Testnet only.</strong> Never enter a mainnet recovery phrase into the demo site,
    the Android authenticator, or the dev simulator. Testnet identities and faucets have no real value.
  </div>

  <div class="panel">
    <h2>What you need</h2>
    <ol>
      <li>A <strong>Dash Platform testnet</strong> identity with a DPNS name
        (for example created in <strong>DashPay testnet</strong> / related testnet tooling).</li>
      <li>Either:
        <ul>
          <li>the <a href="/get-started">Android authenticator (testnet APK or build from source)</a>, or</li>
          <li>on a private/local deployment with the simulator enabled, the
            <a href="/dev/simulator">dev simulator</a> (fixtures or imported testnet phrase).</li>
        </ul>
      </li>
      <li>Optional: testnet dash for identity registration (via a public testnet faucet if required by your wallet flow).</li>
    </ol>
  </div>

  <div class="panel">
    <h2>Suggested path</h2>
    <ol>
      <li>Install the authenticator (prefer build from source; debug APK is for convenience only).</li>
      <li>Import your <strong>testnet</strong> recovery phrase (and optional BIP-39 passphrase if you set one when creating the wallet).</li>
      <li>On this site, open <a href="/login">Sign in with Dash</a>.</li>
      <li>Scan the QR with the authenticator (or paste the capability URL).</li>
      <li>Approve only if <strong>you</strong> started this login for this exact domain moments ago.</li>
      <li>The browser finishes and creates/opens your site account (identity-bound).</li>
    </ol>
  </div>

  <div class="panel">
    <h2>Risks &amp; courtesy</h2>
    <ul class="checklist">
      <li>QR forwarding: approving someone else’s login grants <em>their</em> browser the session.</li>
      <li>Phrase import on-device talks to testnet Platform; discovery can fail if the identity does not exist yet or DAPI is flaky — use the optional DPNS name assist.</li>
      <li>This host is a small shared demo. Manual testing is welcome; do not load-test or script against it. Self-host from
        <a href="${esc(REPO_URL)}">GitHub</a> for heavy work.</li>
      <li>See <a href="/security">Security</a> for pen-test ideas and residual risks.</li>
    </ul>
  </div>

  <div class="panel">
    <h2>APK &amp; source</h2>
    <p><a href="/downloads/siwd-authenticator-testnet-debug.apk">Download testnet debug APK</a>
      · <a href="${esc(REPO_URL)}/tree/main/apps/android-authenticator">Authenticator source</a>
      · <a href="/get-started">Full get-started notes</a></p>
  </div>
  `;
  return layout({ title: "How to test", body, account });
}

export function privacyPage(account: AccountRow | null) {
  const body = `
  <h1>Privacy (short)</h1>
  <div class="panel">
    <p>This is a <strong>testnet demonstration</strong> of Sign in with Dash. It is not a production identity provider and does not handle real funds.</p>
    <ul class="checklist">
      <li><strong>What we store:</strong> Dash identity ID, DPNS name, session records for this site, optional email if you choose to add one, access-control lists (allowlist/bans/invites), and contact-form messages if you send them.</li>
      <li><strong>What we never store:</strong> recovery phrases, BIP-39 passphrases, or private keys. Login signatures prove control without transferring keys to the website.</li>
      <li><strong>Cookies:</strong> short-lived browser-binding and session cookies only (no multi-week “remember me”).</li>
      <li><strong>Contact form:</strong> optional; used only so the host can reply. Configure your own recipient when self-hosting.</li>
      <li><strong>Logs:</strong> ordinary web/server logs may include IP addresses and request metadata.</li>
    </ul>
    <p class="muted">Self-hosters: set your own privacy policy for public deployments. Source:
      <a href="${esc(REPO_URL)}">${esc(REPO_URL)}</a>.</p>
  </div>
  `;
  return layout({ title: "Privacy", body, account });
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
      <li><strong>Simulator mode:</strong> does not talk to live Platform when verify mode is simulator-only.</li>
      <li><strong>Account list:</strong> visible only when signed in (Dash names + identity IDs for transparency among testers; optional contact emails are obfuscated).</li>
      <li><strong>Access policy is local:</strong> allowlist/bans live in this site’s database; they are not Dash Platform consensus rules.</li>
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
  <div class="panel account-list-panel">
    ${
      rows.length === 0
        ? `<p class="muted">No accounts yet. Be the first to <a href="/login">sign in</a>.</p>`
        : `<ul class="account-list">
        ${rows
          .map((a) => {
            const isYou = a.id === account.id;
            const emailLine = a.email
              ? `<span class="mono">${esc(obfuscateEmail(a.email))}</span>`
              : `<span class="muted">No email associated</span>`;
            const bindingLabel =
              a.binding_policy === "identity_bound"
                ? "Identity-bound"
                : a.binding_policy === "name_bound"
                  ? "Name-bound"
                  : a.binding_policy;
            return `<li class="account-card${isYou ? " account-card-you" : ""}">
          <div class="account-card-head">
            <div class="account-card-title">
              <h2 class="account-name mono">${esc(displayDashName(a.dpns_name))}</h2>
              ${isYou ? `<span class="account-you-badge">You</span>` : ""}
            </div>
            <span class="account-binding" title="Account binding policy">${esc(bindingLabel)}</span>
          </div>
          <dl class="account-meta">
            <div>
              <dt>Identity ID</dt>
              <dd class="mono account-id">${esc(a.identity_id)}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>${emailLine}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>${friendlyTimeHtml(a.created_at)}</dd>
            </div>
            <div>
              <dt>Last login</dt>
              <dd>${friendlyTimeHtml(a.last_login_at)}</dd>
            </div>
          </dl>
        </li>`;
          })
          .join("")}
      </ul>`
    }
  </div>
  <p class="muted">Display names omit the <span class="mono">.dash</span> parent. Full names are stored and signed on the wire. Identity IDs are public on Dash Platform. Optional contact emails are shown obfuscated on this list.</p>
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
  // Protocol still carries action=login|register|link; the demo uses login for both
  // first-time and returning visitors (account is auto-created on first success).
  const title = "Sign in with Dash";
  const body = `
  <h1>${esc(title)}</h1>
  <div class="warn-box">
    Only approve this if <strong>you</strong> started this sign-in for
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
    case "banned":
      return "ended (banned)";
    default:
      return s.end_reason ? `ended (${s.end_reason})` : "ended";
  }
}

export function mePage(account: AccountRow, sessions: ReturnType<typeof listSessions>) {
  const shown = displayDashName(account.dpns_name);
  const settings = getAccessSettings();
  const inviteHint =
    settings.user_invites_enabled || isSiteOwner(account)
      ? `<p class="muted"><a href="/access">Invite others / manage access</a>
         ${
           settings.user_invites_enabled && !isSiteOwner(account)
             ? `· ${invitesRemaining(account)} invite(s) left`
             : ""
         }</p>`
      : "";
  const contactHint = CONTACT_ENABLED
    ? `<p class="muted"><a href="/contact">Contact the site host</a> with ideas or feedback
       (requires your email address for a reply).</p>`
    : "";
  const body = `
  <h1>Your account</h1>
  <div class="ok-box">
    Signed in as <strong class="mono">${esc(shown)}</strong>
  </div>
  ${inviteHint}
  ${contactHint}
  <div class="panel">
    <h2>Profile (what the site knows)</h2>
    <table>
      <tr><th>Dash name</th><td class="mono">${esc(shown)}</td></tr>
      <tr><th>Full name (stored)</th><td class="mono muted">${esc(account.dpns_name)}</td></tr>
      <tr><th>Identity ID</th><td class="mono">${esc(account.identity_id)}</td></tr>
      <tr><th>Contact email</th><td>${
        account.email
          ? `<span class="mono">${esc(account.email)}</span>`
          : `<span class="muted">No email associated</span>`
      }</td></tr>
      <tr><th>Binding policy</th><td>${esc(account.binding_policy)}</td></tr>
      <tr><th>Created</th><td>${friendlyTimeHtml(account.created_at)}</td></tr>
      <tr><th>Last login</th><td>${friendlyTimeHtml(account.last_login_at)}</td></tr>
    </table>
  </div>
  <div class="panel">
    <h2>Sessions</h2>
    <p class="muted">Browser session cookies end when you close the browser.
    Server-side rows record how a session was closed: normal <strong>sign out</strong>
    vs forced <strong>revoke</strong> (forensics-friendly, not a complete audit log).</p>
    <table class="sessions-table">
      <thead><tr><th>Created</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${sessions
          .map(
            (s) => `<tr>
          <td>${friendlyTimeHtml(s.created_at)}</td>
          <td>${friendlyTimeHtml(s.last_seen_at)}</td>
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

export function contactPage(opts: {
  account: AccountRow;
  flash?: string;
  error?: string | null;
  /** Prefill values after a validation error. */
  values?: {
    email?: string;
    subject?: string;
    message?: string;
    saveEmail?: boolean;
  };
  /** When false, form is disabled (host did not set SIWD_CONTACT_TO). */
  enabled?: boolean;
}) {
  const { account } = opts;
  const enabled = opts.enabled !== false && CONTACT_ENABLED;
  const prefillEmail =
    opts.values?.email ?? account.email ?? "";
  const prefillSubject = opts.values?.subject ?? "";
  const prefillMessage = opts.values?.message ?? "";
  const saveChecked = opts.values?.saveEmail === true;

  if (!enabled) {
    const body = `
  <h1>Contact</h1>
  <div class="panel">
    <p>The contact form is not configured on this deployment.</p>
    <p class="muted">Self-hosters can enable it by setting <span class="mono">SIWD_CONTACT_TO</span>
    (and SMTP settings if they want real email delivery). See the demo site docs.</p>
  </div>`;
    return layout({ title: "Contact", body, account });
  }

  const body = `
  <h1>Contact the host</h1>
  <p class="lead">Signed-in users can send improvement ideas, bug reports, or other feedback.
  Your email address is required so the host can reply. It is only stored on your account if you opt in below.</p>
  ${opts.error ? `<div class="warn-box">${esc(opts.error)}</div>` : ""}
  ${opts.flash ? `<div class="ok-box">${esc(opts.flash)}</div>` : ""}
  <div class="panel">
    <form method="post" action="/contact" class="stack">
      <div>
        <label for="contact-email">Your email address <span class="muted">(required)</span></label>
        <input id="contact-email" name="email" type="email" required
          autocomplete="email" maxlength="254"
          value="${esc(prefillEmail)}"
          placeholder="you@example.com" />
      </div>
      <div>
        <label for="contact-subject">Subject <span class="muted">(optional)</span></label>
        <input id="contact-subject" name="subject" type="text" maxlength="200"
          autocomplete="off" value="${esc(prefillSubject)}"
          placeholder="Idea, bug, question…" />
      </div>
      <div>
        <label for="contact-message">Message <span class="muted">(required)</span></label>
        <textarea id="contact-message" name="message" required rows="8"
          maxlength="8000" class="invite-msg" placeholder="What should we know?">${esc(prefillMessage)}</textarea>
      </div>
      <label class="check-row">
        <input type="checkbox" name="saveEmail" value="1"
          ${saveChecked ? "checked" : ""} />
        Save this email address on my account for next time
      </label>
      <p class="muted" style="margin:0">Unchecked by default. The accounts list shows associated emails in obfuscated form only.</p>
      <button type="submit" class="primary">Send message</button>
    </form>
  </div>
  <div class="panel">
    <h2>Privacy note</h2>
    <ul class="checklist">
      <li>SIWD login itself never requires an email address.</li>
      <li>The host receives your message, Dash name, identity ID, and the reply-to address you enter.</li>
      <li>Saving the address is optional and can only be done from this form (when you check the box).</li>
    </ul>
  </div>
  `;
  return layout({ title: "Contact", body, account });
}

export function accessPage(opts: {
  account: AccountRow;
  settings: SiteAccessSettings;
  allowlist: AllowlistEntry[];
  bans: BanEntry[];
  flash?: string;
  inviteMessage?: string | null;
  error?: string | null;
}) {
  const { account, settings, allowlist, bans } = opts;
  const owner = isSiteOwner(account);
  const remaining = invitesRemaining(account);
  const myInvites = listInvitesByAccount(account.id);
  const canInvite = settings.user_invites_enabled || owner;
  const remainingLabel =
    owner && settings.user_invites_enabled
      ? "unlimited (site owner)"
      : owner && !settings.user_invites_enabled
        ? "owner add (user invites off)"
        : `${Number.isFinite(remaining) ? remaining : 0} left of ${settings.invites_per_user}`;

  const invitePanel = canInvite
    ? `<div class="panel">
    <h2>Invite by Dash name</h2>
    <p class="muted">Add an approved Dash name so they can create an account when the allowlist is on
    (or so you can share a ready-made invite message even when it is off).
    Invites remaining for you: <strong>${esc(remainingLabel)}</strong>.</p>
    <form method="post" action="/access/invite" class="stack">
      <div>
        <label for="invite-name">Dash name to invite</label>
        <input id="invite-name" name="dpnsName" type="text" required
          autocomplete="off" spellcheck="false" placeholder="friend or friend.dash" />
      </div>
      <button type="submit" class="primary">Add invite</button>
    </form>
    ${
      opts.inviteMessage
        ? `<div class="ok-box" style="margin-top:1rem">
      <p><strong>Invite added.</strong> Copy this message into your messenger of choice:</p>
      <div class="copy-row">
        <textarea id="invite-msg" class="invite-msg" readonly rows="12">${esc(opts.inviteMessage)}</textarea>
      </div>
      <p style="margin-top:0.5rem"><button type="button" data-copy="#invite-msg">Copy invite message</button></p>
    </div>`
        : ""
    }
    ${
      myInvites.length
        ? `<h3 style="margin-top:1.25rem">Your invites</h3>
    <table>
      <thead><tr><th>Dash name</th><th>When</th></tr></thead>
      <tbody>
        ${myInvites
          .map(
            (e) => `<tr>
          <td class="mono">${esc(displayDashName(e.dpns_name))}</td>
          <td>${esc(e.created_at.slice(0, 19))}Z</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
        : ""
    }
  </div>`
    : `<div class="panel">
    <h2>Invites</h2>
    <p class="muted">User invites are currently disabled by the site owner.</p>
  </div>`;

  const ownerPanel = owner
    ? `<div class="panel">
    <h2>Site owner settings</h2>
    ${
      !ownersConfigured()
        ? `<p class="muted">No <span class="mono">SIWD_SITE_OWNER_NAMES</span> configured — every signed-in user has owner powers (local-demo bootstrap). Set that env var on a public host.</p>`
        : ""
    }
    <form method="post" action="/access/settings" class="stack">
      <label class="check-row">
        <input type="checkbox" name="allowlistEnabled" value="1"
          ${settings.allowlist_enabled ? "checked" : ""} />
        Require allowlist for <strong>new</strong> accounts
      </label>
      <label class="check-row">
        <input type="checkbox" name="userInvitesEnabled" value="1"
          ${settings.user_invites_enabled ? "checked" : ""} />
        Let signed-in users invite others (add to allowlist)
      </label>
      <div>
        <label for="invites-per">Invites per non-owner user</label>
        <input id="invites-per" name="invitesPerUser" type="number" min="0" max="100"
          value="${settings.invites_per_user}" style="max-width:8rem" />
      </div>
      <button type="submit" class="primary">Save settings</button>
    </form>
  </div>

  <div class="panel">
    <h2>Allowlist</h2>
    <p class="muted">When the allowlist is on, only these Dash names (plus configured site owners) may create accounts. Existing accounts may still sign in unless banned.</p>
    <form method="post" action="/access/allowlist/add" class="stack" style="margin-bottom:1rem">
      <div class="copy-row">
        <input name="dpnsName" type="text" required placeholder="name or name.dash"
          autocomplete="off" spellcheck="false" />
        <button type="submit">Add</button>
      </div>
    </form>
    ${
      allowlist.length === 0
        ? `<p class="muted">Allowlist is empty.</p>`
        : `<table>
      <thead><tr><th>Dash name</th><th>Source</th><th>When</th><th></th></tr></thead>
      <tbody>
        ${allowlist
          .map(
            (e) => `<tr>
          <td class="mono">${esc(displayDashName(e.dpns_name))}</td>
          <td>${esc(e.source)}</td>
          <td>${esc(e.created_at.slice(0, 19))}Z</td>
          <td>
            <form method="post" action="/access/allowlist/remove" class="inline">
              <input type="hidden" name="id" value="${e.id}" />
              <button type="submit" class="danger">Remove</button>
            </form>
          </td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
    }
  </div>

  <div class="panel">
    <h2>Ban list</h2>
    <p class="muted">Banned Dash names and identity IDs cannot create accounts. Matching existing accounts are banned and their sessions revoked immediately.</p>
    <form method="post" action="/access/ban/add" class="stack" style="margin-bottom:1rem">
      <div>
        <label for="ban-kind">Ban type</label>
        <select id="ban-kind" name="kind">
          <option value="dpns_name">Dash name</option>
          <option value="identity_id">Identity ID</option>
        </select>
      </div>
      <div>
        <label for="ban-value">Value</label>
        <input id="ban-value" name="value" type="text" required
          autocomplete="off" spellcheck="false" placeholder="name or identity id" />
      </div>
      <div>
        <label for="ban-reason">Reason (optional)</label>
        <input id="ban-reason" name="reason" type="text" autocomplete="off" />
      </div>
      <button type="submit" class="danger">Add ban</button>
    </form>
    ${
      bans.length === 0
        ? `<p class="muted">No bans.</p>`
        : `<table>
      <thead><tr><th>Kind</th><th>Value</th><th>Reason</th><th>When</th><th></th></tr></thead>
      <tbody>
        ${bans
          .map(
            (b) => `<tr>
          <td>${esc(b.kind)}</td>
          <td class="mono">${esc(b.kind === "dpns_name" ? displayDashName(b.value) : b.value)}</td>
          <td>${esc(b.reason || "—")}</td>
          <td>${esc(b.created_at.slice(0, 19))}Z</td>
          <td>
            <form method="post" action="/access/ban/remove" class="inline">
              <input type="hidden" name="id" value="${b.id}" />
              <button type="submit">Lift ban</button>
            </form>
          </td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
    }
  </div>`
    : `<div class="panel">
    <h2>Site policy</h2>
    <ul class="checklist">
      <li>Allowlist for new accounts: <strong>${settings.allowlist_enabled ? "on" : "off"}</strong></li>
      <li>User invites: <strong>${settings.user_invites_enabled ? `on (up to ${settings.invites_per_user} each)` : "off"}</strong></li>
    </ul>
    <p class="muted">Only site owners can change settings, the full allowlist, or the ban list.</p>
  </div>`;

  const body = `
  <h1>Access &amp; invites</h1>
  <p class="lead">Control who may create accounts on this demo, invite others by Dash name, and ban abusers.</p>
  ${opts.error ? `<div class="warn-box">${esc(opts.error)}</div>` : ""}
  ${opts.flash && !opts.inviteMessage ? `<div class="ok-box">${esc(opts.flash)}</div>` : ""}
  ${invitePanel}
  ${ownerPanel}
  <div class="panel">
    <h2>How this works</h2>
    <ul class="checklist">
      <li><strong>Allowlist</strong> (when on) gates <em>new</em> account creation only. Existing accounts still sign in unless banned.</li>
      <li><strong>User invites</strong> let account holders add up to N Dash names to the allowlist and copy a ready-made message.</li>
      <li><strong>Bans</strong> block create/login for a name or identity and revoke any matching sessions right away.</li>
      <li>Configured site owners (env <span class="mono">SIWD_SITE_OWNER_NAMES</span>) can always create accounts even if not on the allowlist.</li>
    </ul>
  </div>
  `;
  return layout({ title: "Access & invites", body, account });
}

export function simulatorPage(account: AccountRow | null) {
  const ids = listSimulatorIdentities();
  const body = `
  <h1>Dev authenticator simulator</h1>
  <div class="warn-box">
    Development only. Not a wallet. Fixture keys (alice/bob) work offline;
    you can also import a <strong>testnet</strong> recovery phrase to sign as a real Platform identity.
    Phrases are used once for discovery and not stored on the server.
  </div>
  <div class="panel stack">
    <div>
      <label for="cap">Capability URL <span class="muted">(paste the QR code's text here)</span></label>
      <input id="cap" type="text" autocomplete="off" spellcheck="false"
        placeholder="http://127.0.0.1:8792/dash-auth/v1/r/..." />
      <p class="muted" id="cap-hint" style="margin:0.35rem 0 0">Paste or type the URL — the request loads automatically.</p>
    </div>
    <div>
      <label for="ident">Sign in as</label>
      <select id="ident">
        ${ids
          .map(
            (i) =>
              `<option value="${esc(i.identityId)}" data-name="${esc(i.dpnsName)}" data-key="${i.keyId}" data-fixture="1">${esc(displayDashName(i.dpnsName))} (fixture)</option>`,
          )
          .join("")}
      </select>
      <p class="muted" id="ident-hint" style="margin:0.35rem 0 0">Fixtures are local test keys. Import a phrase below to add real testnet identities.</p>
    </div>
    <details class="sim-import">
      <summary>Import testnet recovery phrase (real Platform identity)</summary>
      <div class="stack" style="margin-top:0.75rem">
        <div>
          <label for="sim-phrase">BIP-39 phrase (testnet only)</label>
          <textarea id="sim-phrase" rows="3" autocomplete="off" spellcheck="false"
            placeholder="word1 word2 … word12"></textarea>
        </div>
        <div>
          <label for="sim-passphrase">BIP-39 passphrase (optional)</label>
          <input id="sim-passphrase" type="password" autocomplete="off"
            placeholder="Leave blank unless you set a 13th/25th word" />
          <p class="muted">Some wallets let you add an extra passphrase when creating the seed. It is not one of the 12/24 words.</p>
        </div>
        <div>
          <label for="sim-hint">DPNS name assist (optional)</label>
          <input id="sim-hint" type="text" autocomplete="off" placeholder="e.g. ronhelwig4test" />
        </div>
        <button type="button" id="sim-discover">Discover &amp; add to list</button>
        <button type="button" id="sim-clear-imported">Clear imported identities</button>
        <p class="muted" id="sim-import-status" role="status"></p>
        <p class="muted">Imported identities are kept in <span class="mono">sessionStorage</span> for this browser tab (reload keeps them; closing the tab clears them). Testnet only.</p>
      </div>
    </details>

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
      if (a === 'register') return 'Sign in (register)';
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

    function normalizeCapabilityUrl(url) {
      let u = (url || '').trim();
      if (!u) return u;
      // Rewrite any host to this page's origin so fetch stays same-origin.
      try {
        if (u.startsWith('/dash-auth/')) {
          return location.origin + u;
        }
        const parsed = new URL(u);
        if (parsed.pathname.includes('/dash-auth/v1/r/')) {
          return location.origin + parsed.pathname + parsed.search;
        }
      } catch { /* leave as-is */ }
      return u;
    }

    async function fetchRequest(url) {
      const gen = ++fetchGen;
      clearSummary();
      resWrap.hidden = true;
      if (!url) {
        setStatus('');
        return;
      }
      const normalized = normalizeCapabilityUrl(url);
      if (normalized !== url && cap.value.trim() === url) {
        cap.value = normalized;
      }
      if (!looksLikeCapabilityUrl(normalized)) {
        setStatus('Paste the full capability URL from the QR code (…/dash-auth/v1/r/…).', true);
        return;
      }
      setStatus('Loading request…');
      try {
        // Same-origin proxy avoids NetworkError when QR host is 127.0.0.1 vs LAN IP.
        const r = await fetch('/dev/simulator/fetch-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ capabilityUrl: normalized }),
        });
        const j = await r.json();
        if (gen !== fetchGen) return;
        if (!r.ok) {
          setStatus((j.error && j.error.message) || ('Could not load request (' + r.status + ')'), true);
          return;
        }
        fetched = j;
        lastFetchedUrl = normalized;
        showSummary(j);
        setStatus('Request loaded. Choose an identity and approve if this is your login.');
      } catch (e) {
        if (gen !== fetchGen) return;
        setStatus(String(e.message || e) + ' — try reloading this page on the same host as the login QR.', true);
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

    // Imported identities: sessionStorage so reload keeps them for this tab session.
    // Dev only — private keys for testnet HIGH keys; never use mainnet phrases.
    const STORAGE_KEY = 'siwd_sim_imported_v1';
    const imported = new Map(); // identityId -> { privateKeyHex, dpnsName, keyId }

    function saveImported() {
      const arr = [...imported.entries()].map(([identityId, v]) => ({
        identityId,
        privateKeyHex: v.privateKeyHex,
        dpnsName: v.dpnsName,
        keyId: v.keyId,
      }));
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      } catch { /* private mode / quota */ }
    }

    function loadImported() {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        for (const id of arr) {
          if (!id || !id.identityId || !id.privateKeyHex) continue;
          imported.set(id.identityId, {
            privateKeyHex: id.privateKeyHex,
            dpnsName: id.dpnsName || 'unnamed.dash',
            keyId: Number(id.keyId) || 1,
          });
        }
      } catch { /* ignore */ }
    }

    function addImportedOption(id) {
      imported.set(id.identityId, {
        privateKeyHex: id.privateKeyHex,
        dpnsName: id.dpnsName,
        keyId: id.keyId,
      });
      let opt = [...ident.options].find(o => o.value === id.identityId);
      if (!opt) {
        opt = document.createElement('option');
        opt.value = id.identityId;
        ident.appendChild(opt);
      }
      const label = (id.dpnsName || '').replace(/\\.dash$/i, '') || id.identityId.slice(0, 10);
      opt.textContent = label + ' (imported)';
      opt.setAttribute('data-name', id.dpnsName);
      opt.setAttribute('data-key', String(id.keyId));
      opt.setAttribute('data-priv', id.privateKeyHex);
      opt.removeAttribute('data-fixture');
      return opt;
    }

    loadImported();
    if (imported.size) {
      let last = null;
      for (const [identityId, v] of imported) {
        last = addImportedOption({
          identityId,
          privateKeyHex: v.privateKeyHex,
          dpnsName: v.dpnsName,
          keyId: v.keyId,
        });
      }
      if (last) last.selected = true;
      document.getElementById('ident-hint').textContent =
        'Restored ' + imported.size + ' imported identity(ies) from this browser session. Fixtures still available.';
    }

    document.getElementById('sim-discover').addEventListener('click', async () => {
      const phrase = document.getElementById('sim-phrase').value.trim();
      const passphrase = document.getElementById('sim-passphrase').value;
      const hintName = document.getElementById('sim-hint').value.trim();
      const st = document.getElementById('sim-import-status');
      if (!phrase) {
        st.textContent = 'Enter a testnet recovery phrase.';
        st.className = 'muted sim-error';
        return;
      }
      st.textContent = 'Discovering on Platform testnet…';
      st.className = 'muted';
      try {
        const r = await fetch('/dev/simulator/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            phrase,
            hintName: hintName || null,
            passphrase: passphrase || '',
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          st.textContent = (j.error && j.error.message) || ('Discover failed (' + r.status + ')');
          st.className = 'muted sim-error';
          return;
        }
        let n = 0;
        let lastOpt = null;
        for (const id of (j.identities || [])) {
          lastOpt = addImportedOption(id);
          lastOpt.selected = true;
          n++;
        }
        saveImported();
        document.getElementById('sim-phrase').value = '';
        document.getElementById('sim-passphrase').value = '';
        st.textContent = 'Added ' + n + ' identity(ies) and saved for this browser tab session. Phrase cleared from the form.';
        st.className = 'muted';
      } catch (e) {
        st.textContent = String(e.message || e);
        st.className = 'muted sim-error';
      }
    });

    const clearBtn = document.getElementById('sim-clear-imported');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        imported.clear();
        try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
        [...ident.options].forEach(o => {
          if (!o.getAttribute('data-fixture')) o.remove();
        });
        if (ident.options.length) ident.selectedIndex = 0;
        document.getElementById('sim-import-status').textContent = 'Cleared imported identities from this session.';
      });
    }

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
      const priv = opt.getAttribute('data-priv')
        || (imported.get(ident.value) && imported.get(ident.value).privateKeyHex);
      if (priv) body.privateKeyHex = priv;
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
