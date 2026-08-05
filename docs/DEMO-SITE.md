# Demo website

**App path:** `apps/demo-web`  
**Status:** Local (and public-prep) **testnet** demo. Verification modes:
`simulator` | `hybrid` (default) | `platform`. Real Platform identities work in
hybrid/platform; fixtures (alice/bob) work in hybrid/simulator.

For host-specific LAN/emulator notes, see [LOCAL-DEV-CONFIG.md](LOCAL-DEV-CONFIG.md).
For public deploy, see [LIVE-TESTNET-DEPLOY-CHECKLIST.md](LIVE-TESTNET-DEPLOY-CHECKLIST.md).

## Run locally

```bash
cd packages/protocol && npm install && npm run build
cd ../../apps/demo-web && npm install
npm run dev
# open http://127.0.0.1:8792  (override with SIWD_PUBLIC_ORIGIN / PORT / HOST)
```

Smoke test (starts server if needed):

```bash
cd apps/demo-web && npm test
```

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8792` | Listen port (avoids Solvent 8787 / DecentSite 8790–8791) |
| `HOST` | `127.0.0.1` | Bind address |
| `SIWD_PUBLIC_ORIGIN` | `http://127.0.0.1:8792` | Origin used in capability URLs / `responseUri` |
| `SIWD_DB_PATH` | `apps/demo-web/data/demo.sqlite` | SQLite file |
| `SIWD_VERIFY_MODE` | `hybrid` | `simulator` \| `hybrid` \| `platform` |
| `SIWD_ENABLE_SIMULATOR` | `true` | Dev signer UI |
| `SIWD_REQUEST_TTL_SECONDS` | `120` | Challenge lifetime |
| `SIWD_SITE_OWNER_NAMES` | _(empty)_ | Comma-separated Dash names and/or identity IDs with owner powers. If empty, **every signed-in user** is treated as an owner (local bootstrap). Set this on a public host. |
| `SIWD_DONATE_URL` | `https://myrpg.ronhelwig.com/donate` | Footer / home donate link |
| `SIWD_REPO_URL` | GitHub SignInWithDash URL | Self-host link in notices and invite messages |
| `SIWD_SHARED_HOST_NOTICE` | `true` | Show shared-host courtesy notice on public pages |
| `SIWD_CONTACT_TO` | _(empty)_ | Recipient for the signed-in contact form. Empty disables the form (no baked-in default). |
| `SIWD_CONTACT_FROM` | _(empty)_ | Optional From address for outbound contact mail |
| `SIWD_SMTP_HOST` | _(empty)_ | SMTP host. If empty while contact is enabled, messages are **logged** only |
| `SIWD_SMTP_PORT` | `587` | SMTP port |
| `SIWD_SMTP_SECURE` | `false` | Use TLS from the start (`true` for port 465) |
| `SIWD_SMTP_USER` | _(empty)_ | SMTP auth user |
| `SIWD_SMTP_PASS` | _(empty)_ | SMTP auth password |

Copy `apps/demo-web/.env.example` to `apps/demo-web/.env` and fill in values.
The demo loads that file automatically on startup (via `dotenv`; already-set
process environment variables still win). Never commit real recipient addresses
or SMTP credentials — `.env` is gitignored.

For a future public host, set e.g.:

```bash
SIWD_PUBLIC_ORIGIN=https://dashlogin.ronhelwig.com
SIWD_VERIFY_MODE=platform
SIWD_ENABLE_SIMULATOR=false
SIWD_SITE_OWNER_NAMES=your-testnet-name
HOST=127.0.0.1
PORT=8792
```

and reverse-proxy TLS (or Passenger) to that port.

## Pages

| Path | Purpose |
| --- | --- |
| `/` | What SIWD is, quick try links, shared-host notice, donate |
| `/how-it-works` | Protocol basics for non-specialists |
| `/get-started` | Simulator fixtures + Android APK notes |
| `/how-to-test` | Public testnet testing path, risks, APK/source |
| `/privacy` | Short privacy notice (testnet demo, no keys) |
| `/accounts` | List of accounts by Dash name (**signed-in only**); optional emails obfuscated |
| `/access` | Allowlist, user invites, ban list (**signed-in**) |
| `/contact` | Contact form for improvement ideas (**signed-in**; requires `SIWD_CONTACT_TO`) |
| `/login` | QR + copy link + status poll + finish (first success auto-creates account) |
| `/register` | Redirect alias → `/login` (kept for old links/invites) |
| `/me` | Profile, session history, revoke, deactivate |
| `/security` | Residual risks + pen-test ideas |
| `/dev/simulator` | Fetch + sign with fixture keys (dev only) |
| `/healthz` | Liveness JSON |

## Demo product choices

- **Session cookies only** (D-025): no multi-week remember-me.
- **identity_bound** accounts in the demo.
- **Account directory** (signed-in only) for transparency and multi-user testing.
- **Display names** omit the `.dash` parent label in the UI; full names remain
  on the wire and in storage.
- Explicit **QR-forwarding warning** on the ceremony page.
- **Access control** (demo site policy, not wire protocol):
  - Optional **allowlist** of Dash names that may *create* accounts.
  - Optional **user invites**: each non-owner may add up to N names to the
    allowlist and copy a canned invite message for messengers.
  - **Ban list** of Dash names and/or identity IDs: cannot create/login; existing
    matching accounts are banned and sessions revoked immediately.
  - Site owners configured via `SIWD_SITE_OWNER_NAMES` (always may create even
    when not on the allowlist).
- **Shared-host courtesy** notice on home/get-started/footer when
  `SIWD_SHARED_HOST_NOTICE` is true.
- **Donate** link to support hosting/dev time.
- **Contact form** (signed-in only), optional per deployment:
  - Enabled only when `SIWD_CONTACT_TO` is set (self-hosters point it at their
    own inbox; the repo has no default recipient).
  - Contacters must enter a reply-to email address.
  - Optional checkbox (unchecked by default) saves that address on the account.
  - Account list shows associated emails **obfuscated**, or “No email associated”.
  - Contact form autofills a saved address when present.
  - SMTP via `SIWD_SMTP_*`; without SMTP host, submissions are logged for local demos.

## Suggested live host (later)

When localhost is solid:

1. Create subdomain `dashlogin.ronhelwig.com` in cPanel (or similar).
2. Issue TLS certificate for the subdomain.
3. Run the Node app under a process manager (Passenger Node, systemd, pm2)
   — this is **not** a static HTML site; the protocol needs a live server.
4. Set `SIWD_PUBLIC_ORIGIN=https://dashlogin.ronhelwig.com`.
5. Keep simulator **off** on the public host once a real testnet authenticator
   is available; until then, label the site clearly as simulator-backed.

Do not upload SQLite from local testing if it contains junk accounts you do not
want public.

## Testnet identity setup (DashPay)

Play Store DashPay is **mainnet-only**. For a real Platform identity + DPNS name
on testnet, use a **testnet** wallet APK (separate package id, typically
`hashengineering.darkcoin.wallet_test`).

Workspace tooling (outside this repo):

- `Projects/tools/dash-wallet-testnet/` — official release testnet APK download,
  install helper, and optional source build of upstream
  [dashpay/dash-wallet](https://github.com/dashpay/dash-wallet)
  (`:wallet:assemble_testNet3Debug`).

**Never** restore a mainnet recovery phrase into the testnet wallet or the SIWD
authenticator. Create a new testnet wallet, fund it, register a name, then import
only that **testnet** phrase into SIWD.

## Authenticator product notes (for later app work)

- Prefer a **standalone authentication app** as a first-class path (not only a
  wallet fork). Users may want login signing separate from payment wallets.
  Wallet integration remains optional/demo.
- Per-site last-used **Dash name** should be remembered with identity + site
  origin so re-login defaults to the name used at account creation; changing
  the name re-fetches / re-binds the challenge display as needed.
- Android authenticator (testnet): build from `apps/android-authenticator` (preferred)
  or download the debug APK from `/downloads/siwd-authenticator-testnet-debug.apk`
  on a running demo-web instance (APK artifacts are gitignored; rebuild to refresh).

## Platform helpers (dev / tooling)

The demo exposes testnet Platform helpers primarily for the **dev simulator** and
debugging. The Android authenticator’s preferred path is **on-device** discovery
(not a long-term website proxy for end users):

| Path | Purpose |
| --- | --- |
| `GET /dash-auth/v1/platform/resolve?name=alice` | Resolve DPNS → identity id |
| `POST /dash-auth/v1/platform/discover` | Body `{ publicKeyHashes: [...] }` |
| `GET /dash-auth/v1/platform/identity/:id` | Keys + usernames |

Implemented via an isolated `scripts/platform-worker.mjs` (Evo SDK), so WASM
does not share the HTTP server process.

## M2 follow-ups

- Further harden hybrid/platform verification paths and key material parsing.
- Document phone/standalone-auth-app install path on Get started.
- Optional: hide or paginate account list if it grows large.
- Optional: site-local display handles without publishing identity IDs (product
  choice; listing IDs is intentional for this demo).
