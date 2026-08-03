# Demo website

**App path:** `apps/demo-web`  
**Status:** M1 localhost demo with **simulator verification** (no live Platform yet)

## Run locally

```bash
cd packages/protocol && npm install && npm run build
cd ../../apps/demo-web && npm install
npm run dev
# open http://127.0.0.1:8787
```

Smoke test (starts server if needed):

```bash
cd apps/demo-web && npm test
```

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Listen port |
| `HOST` | `127.0.0.1` | Bind address |
| `SIWD_PUBLIC_ORIGIN` | `http://127.0.0.1:8787` | Origin used in capability URLs / `responseUri` |
| `SIWD_DB_PATH` | `apps/demo-web/data/demo.sqlite` | SQLite file |
| `SIWD_VERIFY_MODE` | `simulator` | `simulator` until M2 Platform |
| `SIWD_ENABLE_SIMULATOR` | `true` | Dev signer UI |
| `SIWD_REQUEST_TTL_SECONDS` | `120` | Challenge lifetime |

For a future public host, set e.g.:

```bash
SIWD_PUBLIC_ORIGIN=https://dashlogin.ronhelwig.com
SIWD_ENABLE_SIMULATOR=false   # after a real authenticator exists
HOST=127.0.0.1
PORT=8787
```

and reverse-proxy TLS to that port.

## Pages

| Path | Purpose |
| --- | --- |
| `/` | What SIWD is, quick try links |
| `/how-it-works` | Protocol basics for non-specialists |
| `/get-started` | Simulator fixtures + future phone APK notes |
| `/accounts` | List of accounts by Dash name (**signed-in only**) |
| `/login`, `/register` | QR + copy link + status poll + finish |
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

## Authenticator product notes (for later app work)

- Prefer a **standalone authentication app** as a first-class path (not only a
  wallet fork). Users may want login signing separate from payment wallets.
  Wallet integration remains optional/demo.
- Per-site last-used **Dash name** should be remembered with identity + site
  origin so re-login defaults to the name used at account creation; changing
  the name re-fetches / re-binds the challenge display as needed.
- First device target for APK development: **Samsung Galaxy A7** (sideload).

## M2 follow-ups

- Replace simulator verification with live Dash Platform testnet reads.
- Document phone/standalone-auth-app install path on Get started.
- Optional: hide or paginate account list if it grows large.
- Optional: site-local display handles without publishing identity IDs (product
  choice; listing IDs is intentional for this demo).
