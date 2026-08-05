# Live testnet demo deploy — remaining work

**Status snapshot:** local E2E login works (real testnet identity + phone or
simulator). Below is what is left before a public **testnet** site is ready.

## What “hybrid” means (badge next to testnet)

| Badge | Meaning |
| --- | --- |
| **testnet** | Network for SIWD requests (`network: testnet` on the wire). |
| **hybrid** | **Signature verification mode** (`SIWD_VERIFY_MODE`): try **live Dash Platform** for real identities; if that fails or the identity is a **dev fixture** (alice/bob), use local fixture public keys. |

Other modes:

- `platform` — live Platform only (recommended for a public testnet demo).
- `simulator` — fixtures only (local offline).

Set on the host, e.g. `SIWD_VERIFY_MODE=platform`.

---

## Done / solid locally

- [x] SIWD ceremony (QR/link → approve → session)
- [x] Single “Sign in with Dash” CTA (auto-create account)
- [x] Contact form + SMTP (env-based)
- [x] Invites / allowlist / bans (including “already has account”)
- [x] Dev simulator + real-phrase import (sessionStorage)
- [x] Android authenticator: scan/paste, fixtures, import UI, known sites
- [x] Testnet launcher icon (E4 flat uniform stroke)
- [x] Demo-web Platform proxy APIs (resolve/discover) for tooling/simulator

## Before public host (must)

1. **Production process**
   - Reverse proxy with **HTTPS** (Let’s Encrypt or host cert).
   - `SIWD_PUBLIC_ORIGIN=https://your.domain` (must match browser origin).
   - Process manager (systemd / docker / pm2), auto-restart.
   - Bind appropriately (`HOST=0.0.0.0` or socket).

2. **Env hardening**
   - `SIWD_VERIFY_MODE=platform` (not hybrid, unless you want fixture logins).
   - `SIWD_ENABLE_SIMULATOR=false` on the public host.
   - `SIWD_SITE_OWNER_NAMES=…` set (don’t leave empty = everyone is owner).
   - Contact: `SIWD_CONTACT_TO` + SMTP secrets only on host (not git).
   - SQLite path on persistent volume; backup plan.

3. **Smoke on that host**
   - Login as a real testnet identity (phone or laptop authenticator).
   - Login with fixture only if hybrid/simulator left on (prefer off).
   - Contact form once.
   - Invite a new name; reject invite for existing account.
   - Rate limits / `/healthz` OK.

4. **Authenticator discovery story**
   - On-device DAPI with trusted quorums is **partial** (native `Platform()` can
     abort on some devices). Phrase import for end users on a public demo may
     still need a **public discovery path** (hosted gateway) or a fixed
     dash-sdk crash before “no laptop / no proxy” is true.
   - For site launch, users can still log in if they already imported keys
     (or use QR + previously loaded identity). **Import** reliability is the
     main authenticator gap.

## Nice before launch (should)

- [x] APK download on Get Started (wired; rebuild + copy on release; APK gitignored).
- [x] Short public “how to test” page (`/how-to-test`) + privacy note (`/privacy`).
- [x] Un-hardcode LAN IP defaults in authenticator (prefs / paste; no LAN intent-filter default).
- [x] Cleartext limited via `network_security_config` (loopback/LAN only).
- [x] Legal/privacy one-liner in footer + `/privacy`.
- [x] Mainnet icon master named (`siwd-authenticator-mainnet-icon.*`) for future flavor.
- [x] Optional BIP-39 passphrase (13th/25th word) on import (Android + simulator).

## Hosting prep for `https://dashlogin.ronhelwig.com`

- [x] cPanel subdomain `dashlogin` created (docroot `~/dashlogin.ronhelwig.com`).
- [x] DNS A records for `dashlogin` / `www.dashlogin` (shared IP).
- [x] Wildcard LE cert covers `*.ronhelwig.com` — install on the new vhost.
- [ ] Deploy Node demo-web (Passenger app or reverse proxy) with env:
  - `SIWD_PUBLIC_ORIGIN=https://dashlogin.ronhelwig.com`
  - `SIWD_VERIFY_MODE=platform`
  - `SIWD_ENABLE_SIMULATOR=false`
  - `SIWD_SITE_OWNER_NAMES=ronhelwig4test`
- [ ] E2E smoke on the public origin.

**Note:** Account allows up to **4 Passenger apps**; shell is bash. `better-sqlite3`
native module may need compile tools or a pure-JS sqlite alternative on shared hosting —
verify during deploy. Do not point the process at apex or other subdomains.

## Can wait (after live)

- Full on-device MNL / non-crashing Platform SDK for import.
- Mainnet product flavor using blue mainnet icon masters.
- Wallet integration / Mod Menu N/A.

## Suggested go-live order

1. Finish SSL on `dashlogin` if not already matching edge.  
2. Deploy demo-web HTTPS + `platform` + no simulator + `SIWD_SITE_OWNER_NAMES=ronhelwig4test`.  
3. Manual E2E from phone (capability URL / QR against public origin).  
4. Publish APK + source links.  
5. Fix on-device import as follow-up if phrase-import is required for visitors.
