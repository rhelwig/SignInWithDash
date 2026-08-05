# Local development configuration (for other machines)

This document lists **host-specific defaults** that work on the original
maintainer’s LAN or Android Emulator, and how to adapt them on your machine.
Nothing here is required for a public HTTPS deploy.

## Demo website (`apps/demo-web`)

| Setting | Default | Notes |
| --- | --- | --- |
| `PORT` | `8792` | Arbitrary free port; change if busy. |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` if a **physical phone** on the same LAN must open the demo over HTTP. |
| `SIWD_PUBLIC_ORIGIN` | `http://127.0.0.1:8792` | Must match the origin the **browser** uses (scheme + host + port). Capability URLs embed this origin. |
| `SIWD_VERIFY_MODE` | `hybrid` | Local: `hybrid` or `simulator`. Public demo: prefer `platform`. |
| `SIWD_ENABLE_SIMULATOR` | `true` | Set `false` on public hosts. |
| `SIWD_SITE_OWNER_NAMES` | empty | Empty = every signed-in user is an owner (local bootstrap only). |

Copy `apps/demo-web/.env.example` → `.env` (gitignored). Process env wins over `.env`.

**Phone on Wi‑Fi talking to your laptop:**

```bash
# discover your LAN address (examples)
hostname -I | awk '{print $1}'
# or: ip -4 route get 1.1.1.1 | awk '{print $7; exit}'

export HOST=0.0.0.0
export PORT=8792
export SIWD_PUBLIC_ORIGIN=http://YOUR_LAN_IP:8792
npm run dev
```

Open the same origin in the laptop browser and on the phone. Using `127.0.0.1` in
`SIWD_PUBLIC_ORIGIN` while the phone loads a LAN IP will break capability URLs.

## Android authenticator

### Cleartext HTTP (`network_security_config.xml`)

Cleartext is **denied by default**. Allowed only for:

| Host | Why it is listed |
| --- | --- |
| `127.0.0.1`, `localhost` | Host loopback (via `adb reverse` or same-device). |
| `10.0.2.2` | **AOSP Android Emulator** alias for the host machine’s loopback. Same on virtually every stock emulator; **not** your home Wi‑Fi address. |

**Not** shipped: any personal LAN IP. Production relies on **HTTPS** (no cleartext
entry needed).

If you need cleartext HTTP to a phone on Wi‑Fi for local demos only:

1. Prefer `adb reverse tcp:8792 tcp:8792` and use `http://127.0.0.1:8792` in the
   capability URL / app paste field, **or**
2. Add **your** LAN IP under a `domain-config` with `cleartextTrafficPermitted="true"`
   in `app/src/main/res/xml/network_security_config.xml` for a **debug** build only.

Do not commit a personal LAN IP if you can avoid it.

### Emulator vs physical device

| Setup | How the phone/emulator reaches demo-web |
| --- | --- |
| Emulator + demo on host | Use host alias `http://10.0.2.2:PORT` **or** `adb reverse` + `http://127.0.0.1:PORT`. |
| Physical device + USB | `adb reverse tcp:PORT tcp:PORT`, then paste `http://127.0.0.1:PORT/...`. |
| Physical device + Wi‑Fi | Bind demo with `HOST=0.0.0.0`, set `SIWD_PUBLIC_ORIGIN=http://YOUR_LAN_IP:PORT`, allow cleartext for that IP only if not using HTTPS. |
| Public / LAN HTTPS | Use the real HTTPS origin; cleartext config is irrelevant. |

### Self-test activity

`DebugSelfTestActivity` optional extra:

```bash
adb shell am start -n org.siwd.authenticator.testnet.debug/.DebugSelfTestActivity \
  --es proxy http://127.0.0.1:8792
```

Override `proxy` with whatever origin you use for demo-web. Default is loopback,
not a fixed LAN address.

### Deep links

HTTPS capability URLs (`…/dash-auth/v1/r/…`) are accepted for any host. HTTP is
limited to loopback in the manifest (local demos). Add an intent-filter for your
own LAN host only if you must deep-link cleartext HTTP without pasting.

## Maintainer-only checklists

Files such as `docs/MORNING-PUBLISH-CHECKLIST.md` may use **example** LAN IPs as
placeholders. Treat them as illustrations; substitute your own address or use
the public HTTPS host.

## Public deploy (not local)

See `docs/LIVE-TESTNET-DEPLOY-CHECKLIST.md` and `docs/DEMO-SITE.md` for
`SIWD_PUBLIC_ORIGIN=https://…`, `SIWD_VERIFY_MODE=platform`, owners, and simulator off.
