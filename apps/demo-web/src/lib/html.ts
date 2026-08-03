import { ENABLE_SIMULATOR, NETWORK, SITE_NAME, VERIFY_MODE } from "./config.js";
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
    : `<a href="/login">Sign in</a> <a class="btn" href="/register">Create account</a>`;

  const simLink = ENABLE_SIMULATOR
    ? `<a href="/dev/simulator">Dev simulator</a>`
    : "";

  const accountsNav = opts.account
    ? `<a href="/accounts">Accounts</a>`
    : `<a href="/login?next=/accounts" title="Sign in to view accounts">Accounts</a>`;

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
      <span class="badge testnet">${esc(NETWORK)}</span>
      <span class="badge mode">${esc(VERIFY_MODE)}</span>
    </div>
    <nav>
      <a href="/how-it-works">How it works</a>
      <a href="/get-started">Get started</a>
      ${accountsNav}
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
      <a href="https://github.com/rhelwig/SignInWithDash">docs &amp; source on GitHub</a></p>
  </footer>
  <script src="/static/app.js" defer></script>
</body>
</html>`;
}

export { esc };
