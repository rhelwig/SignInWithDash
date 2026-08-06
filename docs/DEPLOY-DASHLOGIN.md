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
# Legacy single bridge:
SIWD_PLATFORM_BRIDGE=http://127.0.0.1:19792
# Preferred when two independently supervised tunnels are available:
# SIWD_PLATFORM_BRIDGES=http://127.0.0.1:19792,http://127.0.0.1:19793
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
6. Verify the complete bridge → Evo SDK → DAPI path (not just the web app):
   ```bash
   curl -fsS https://dashlogin.ronhelwig.com/dash-auth/v1/platform/health
   curl -fsS \
     'https://dashlogin.ronhelwig.com/dash-auth/v1/platform/resolve?name=ronhelwig4test'
   ```

## Keep the Platform bridge alive

The public host cannot reach testnet DAPI directly. Both the local bridge and
its reverse SSH tunnel are therefore production dependencies; running either
from an interactive terminal will leave every login returning
`platform_unavailable` when that terminal exits.

Run both under a service manager (systemd user services are suitable on the
bridge machine), with automatic restart and SSH keepalives. The tunnel command
should include:

```bash
ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -R 127.0.0.1:19792:127.0.0.1:19792 \
  -p 21098 user@host
```

For failover, run a second independently supervised bridge/tunnel on port
`19793` and set `SIWD_PLATFORM_BRIDGES` as shown above. The verifier tries the
URLs in order. Do not enable `SIWD_PLATFORM_LOCAL_FALLBACK` on this shared host;
it is only useful on hosts that can reach DAPI directly.

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
