import {
  CONTACT_ENABLED,
  DONATE_URL,
  ENABLE_SIMULATOR,
  NETWORK,
  REPO_URL,
  SHARED_HOST_NOTICE,
  SITE_NAME,
  VERIFY_MODE,
} from "./config.js";
import { displayDashName } from "./display.js";
import type { AccountRow } from "./store.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(opts: {
  title: string;
  body: string;
  account?: AccountRow | null;
  flash?: string;
}): string {
  const navAccount = opts.account
    ? `<a href="/me">${esc(displayDashName(opts.account.dpns_name))}</a>
       <form class="inline" method="post" action="/logout"><button type="submit">Sign out</button></form>`
    : `<a class="btn" href="/login">Sign in with Dash</a>`;

  const simLink = ENABLE_SIMULATOR
    ? `<a href="/dev/simulator">Dev simulator</a>`
    : "";

  const accountsNav = opts.account
    ? `<a href="/accounts">Accounts</a>`
    : `<a href="/login?next=/accounts" title="Sign in to view accounts">Accounts</a>`;

  const accessNav = opts.account
    ? `<a href="/access">Access &amp; invites</a>`
    : `<a href="/login?next=/access" title="Sign in to manage invites">Access</a>`;

  // Contact is only useful when a recipient is configured; still gate by login.
  const contactNav = CONTACT_ENABLED
    ? opts.account
      ? `<a href="/contact">Contact</a>`
      : `<a href="/login?next=/contact" title="Sign in to contact the site host">Contact</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)} · ${esc(SITE_NAME)}</title>
  <link rel="stylesheet" href="/static/style.css" />
</head>
<body>
  <header class="top">
    <div class="brand">
      <a href="/">Sign in with Dash</a>
      <span class="badge testnet" title="Dash Platform network for this deployment">${esc(NETWORK)}</span>
      <span class="badge mode" title="How login signatures are verified: platform = live Platform only; simulator = fixture keys only; hybrid = Platform first, fixtures fallback">${esc(VERIFY_MODE)}</span>
    </div>
    <nav>
      <a href="/how-it-works">How it works</a>
      <a href="/get-started">Get started</a>
      <a href="/how-to-test">How to test</a>
      ${accountsNav}
      ${accessNav}
      ${contactNav}
      <a href="/security">Security</a>
      ${simLink}
      ${navAccount}
    </nav>
  </header>
  <main>
    ${opts.flash ? `<p class="flash">${esc(opts.flash)}</p>` : ""}
    ${opts.body}
  </main>
  <footer>
    <p>Testnet demo · session cookies only · no mainnet ·
      <a href="${esc(REPO_URL)}">docs &amp; source on GitHub</a>
      · <a href="${esc(DONATE_URL)}" rel="noopener noreferrer">Donate</a>
      · <a href="/privacy">Privacy</a>
    </p>
    <p class="footer-note">This is a <strong>Dash Platform testnet</strong> demo of Sign in with Dash.
      It does not handle real funds. Optional contact email is used only to reply if you write in.
      Do not enter mainnet recovery phrases anywhere in this project.</p>
    ${
      SHARED_HOST_NOTICE
        ? `<p class="footer-note">This public demo runs on <strong>shared hosting</strong>. Please be gentle with load tests —
      I cannot afford a bigger server. Hosting your own copy for heavy testing is welcome
      (<a href="${esc(REPO_URL)}">source on GitHub</a>).</p>`
        : ""
    }
  </footer>
  <script src="/static/app.js" defer></script>
</body>
</html>`;
}

export { esc };
