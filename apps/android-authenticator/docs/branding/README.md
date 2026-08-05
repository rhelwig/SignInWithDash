# SIWD authenticator branding

Launcher art: Dash mark → continuous middle stroke as key → lock on globe.

| Network | Field color | Master PNG | Design source |
| --- | --- | --- | --- |
| **Testnet** | Orange | `siwd-authenticator-testnet-icon.png` | `siwd-authenticator-testnet-icon-source.jpg` (E4 flat uniform stroke A) |
| **Mainnet** | Blue | `siwd-authenticator-mainnet-icon.png` | `siwd-authenticator-mainnet-icon-source.jpg` (E4 mainnet blue exact) |

Concept / exploration still under `docs/icon-concepts/`:

- `siwd-authenticator-testnet-icon.jpg` — named testnet copy
- `siwd-authenticator-mainnet-icon.jpg` — named mainnet copy
- `variant-E4-flat-uniform-stroke-A.jpg` / `variant-E4-mainnet-blue-exact.jpg` — original design names

## Android packaging

- **Testnet debug/release builds today** use density mipmaps generated from the **testnet** master (`@mipmap/ic_launcher` + adaptive XML).
- When cutting a **mainnet** product flavor, regenerate `mipmap-*` / `drawable-*dpi` foregrounds from `siwd-authenticator-mainnet-icon.png` (same adaptive XML pattern). Do not ship orange testnet art on mainnet.

## Notes

- Icons are branding only; they are not certificates of network safety. Always show TESTNET ONLY in-app for testnet builds.
- Never put real mainnet recovery phrases into testnet software.
