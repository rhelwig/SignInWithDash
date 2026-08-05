# Deploying demo-web to dashlogin.ronhelwig.com

Live URL: **https://dashlogin.ronhelwig.com/**

## Layout on host

```text
~/siwd-demo/
  packages/protocol/     # built dist + package.json (file: dependency)
  apps/demo-web/         # CloudLinux Node app root
    app.cjs              # startup (CommonJS for LiteSpeed lsnode)
    .env                 # production secrets (mode 600, not in git)
    data/demo.sqlite     # sql.js-backed DB file
    passenger.log
~/dashlogin.ronhelwig.com/
  .htaccess              # Passenger/LiteSpeed config + SetEnv (managed by selector)
```

## Production env (host only)

```bash
SIWD_PUBLIC_ORIGIN=https://dashlogin.ronhelwig.com
SIWD_VERIFY_MODE=platform
SIWD_ENABLE_SIMULATOR=false
SIWD_SITE_OWNER_NAMES=ronhelwig4test
SIWD_SHARED_HOST_NOTICE=true
SIWD_DATA_DIR=/home/ronhcbvr/siwd-demo/apps/demo-web/data
SIWD_DB_PATH=/home/ronhcbvr/siwd-demo/apps/demo-web/data/demo.sqlite
NODE_ENV=production
```

Optional later: `SIWD_CONTACT_TO` + SMTP for the contact form.

## Redeploy (from a machine with SSH password/key to cPanel)

1. Build protocol: `cd packages/protocol && npm run build`
2. Upload monorepo subset (protocol + demo-web) to `~/siwd-demo/`
3. On host with Node 20 on `PATH`:
   ```bash
   cd ~/siwd-demo/packages/protocol && npm install --omit=dev
   cd ~/siwd-demo/apps/demo-web && npm install
   ```
4. Restart:
   ```bash
   cloudlinux-selector restart --json --interpreter=nodejs \
     --domain dashlogin.ronhelwig.com \
     --app-root /home/ronhcbvr/siwd-demo/apps/demo-web
   # or: touch ~/siwd-demo/apps/demo-web/tmp/restart.txt
   ```
5. Smoke: `curl -sS https://dashlogin.ronhelwig.com/healthz`

## Create app (once)

```bash
cloudlinux-selector create --json --interpreter=nodejs \
  --domain dashlogin.ronhelwig.com \
  --app-root /home/ronhcbvr/siwd-demo/apps/demo-web \
  --app-uri / \
  --version 20 \
  --app-mode production \
  --startup-file app.cjs \
  --env-vars '{"SIWD_PUBLIC_ORIGIN":"https://dashlogin.ronhelwig.com",...}' \
  --passenger-log-file /home/ronhcbvr/siwd-demo/apps/demo-web/passenger.log
```

## Caveats

- Shared host **cannot compile** native addons (gcc group-restricted). Prefer
  sql.js fallback (automatic) or ship a glibc-2.28-compatible better-sqlite3 binary.
- Simulator must stay **off** on the public host.
- TLS is the account wildcard (`*.ronhelwig.com`); renew via SiteSSL workflow.
