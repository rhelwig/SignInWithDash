# Deploying demo-web to dashlogin.ronhelwig.com

Live URL: **https://dashlogin.ronhelwig.com/**

The public demo runs on the OVH VPS (systemd + Caddy). Deploy tooling lives in
`Projects/VpsManage` (`scripts/deploy-dashlogin.sh`). DNS for this hostname
points at the VPS; HTTPS is Let's Encrypt via Caddy.

## Layout on the VPS

```text
/opt/dashlogin/              # protocol + demo-web (git deploy; no .env)
/var/lib/dashlogin/          # sqlite data dir
  demo.sqlite
/etc/dashlogin.env           # production env (mode 600)
/etc/systemd/system/dashlogin.service
```

Caddy terminates HTTP/HTTPS and reverse-proxies to `127.0.0.1:8792`.
The app binds loopback only.

## Production env (`/etc/dashlogin.env`)

```bash
SIWD_PUBLIC_ORIGIN=https://dashlogin.ronhelwig.com
SIWD_VERIFY_MODE=platform
SIWD_ENABLE_SIMULATOR=false
SIWD_SITE_OWNER_NAMES=ronhelwig4test
SIWD_SHARED_HOST_NOTICE=false
SIWD_DATA_DIR=/var/lib/dashlogin
SIWD_DB_PATH=/var/lib/dashlogin/demo.sqlite
NODE_ENV=production
HOST=127.0.0.1
PORT=8792
```

Do **not** set `SIWD_PLATFORM_BRIDGE` / `SIWD_PLATFORM_BRIDGES` here — the VPS
reaches Dash testnet DAPI directly.

Optional later: `SIWD_CONTACT_TO` + SMTP for the contact form.

The database is a **fresh** SQLite file on this host. There are no accounts to
copy from the previous public demo.

## Redeploy

From a machine with `vps-agent` SSH access:

```bash
~/Projects/VpsManage/scripts/deploy-dashlogin.sh
```

That script:

1. Builds `packages/protocol`
2. rsyncs protocol + demo-web to the VPS (excludes `node_modules`, sqlite, `.env`, APKs)
3. Installs into `/opt/dashlogin`, removes any copied `.env`, `npm install`s
4. Restarts `dashlogin.service`

## Smoke

```bash
curl -sS https://dashlogin.ronhelwig.com/healthz
curl -sS https://dashlogin.ronhelwig.com/dash-auth/v1/platform/health
curl -sS \
  'https://dashlogin.ronhelwig.com/dash-auth/v1/platform/resolve?name=ronhelwig4test'
```

## Caveats

- Simulator must stay **off** on the public host.
- Start with an empty `/var/lib/dashlogin/demo.sqlite`; do not upload local test DBs.
- Hourly sqlite snapshots + claw pull are handled by VpsManage, not this repo.
