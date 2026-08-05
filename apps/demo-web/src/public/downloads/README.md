# Downloads

Place developer artifacts here (served at `/downloads/...`).

- `siwd-authenticator-testnet-debug.apk` — Android authenticator debug build (testnet only).
  Built from `apps/android-authenticator` and copied here for local/demo hosting:

```bash
cp apps/android-authenticator/app/build/outputs/apk/debug/app-debug.apk \
  apps/demo-web/src/public/downloads/siwd-authenticator-testnet-debug.apk
```

Prefer building the authenticator from source and reviewing the code before
importing any recovery phrase. APK files are gitignored.
