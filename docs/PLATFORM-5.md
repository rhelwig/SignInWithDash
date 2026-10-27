# Platform 5 readiness

**October 27, 2026 revisit: done.** JavaScript preparation is implemented and
local validation passes. Live testnet acceptance, deployment, and Android
Platform 5 compatibility remain open; this is not a mainnet readiness claim.

## Release and deadline

Dash Platform [5.0.0 was released on October 26](https://github.com/dashpay/platform/releases/tag/v5.0.0).
The [official rollout schedule](https://www.dash.org/blog/dash-platform-5/)
places Platform 5 on testnet from October 15 and mainnet protocol version 14
activation around **November 8, 2026**, conditional on sufficient signalling
for October 30 lock-in. Recheck actual lock-in rather than treating that date
as guaranteed. Complete the application rollout before November 8.

## Versions and decisions

| Component | Before | After / status |
| --- | --- | --- |
| `apps/demo-web` Evo SDK | `^4.1.0` (locked `4.1.0`) | Exact `5.0.0` |
| `deploy/claw-platform-bridge` Evo SDK | Exact `4.1.0` | Exact `5.0.0` |
| Both transitive WASM SDKs | `4.1.0` | Locked `5.0.0` |
| Android `dash-sdk-android`, `dash-sdk-kotlin`, `dash-sdk-java` | Exact `4.0.0` in this checkout | Unchanged; see blocker below |

`deploy/claw-platform-bridge` is this repository's Platform bridge package
(there is no `deploy/platform-bridge`). Both npm lockfiles were regenerated
with `npm install --save-exact @dashevo/evo-sdk@5.0.0`.

- SIWD remains the default, off-chain, domain-bound, short-lived, single-use
  login. Successful Platform reads remain required in Platform verification
  mode; outages fail closed.
- App Connect is a possible later opt-in integration, not part of this upgrade.
  See [the comparison](DASHCONNECT-COMPARISON.md) and decision D-033 in
  [DECISIONS.md](DECISIONS.md).
- No new mainnet enablement, signing capabilities, Platform writes, or spending
  are introduced. Mainnet enablement still requires dedicated security review.
- Keep active, unbounded `AUTHENTICATION/HIGH` ECDSA keys as the SIWD policy.
  SDK 5's actual JSON serialization exposed a compatibility bug: the adapter
  discarded `expiresAt` and `totalBudget`, allowing an expired key to appear
  eligible. It now preserves both fields and `$formatVersion` (as
  `formatVersion` in the bridge summary). Version 1, unknown versions, and
  keys with any usage limit are rejected. Legacy version 0 keys and older
  unrestricted summaries remain supported. Supporting limited keys requires
  a separate policy and usage-state verification, not merely checking a local
  expiry timestamp.

The worker's existing `testnetTrusted`, identity lookup, and DPNS APIs remain
available in SDK 5. No TypeScript call-site changes were needed. Regression
tests construct real SDK 5 public-key objects offline, serialize them through
the bridge JSON shape, and check enabled, disabled, expired, future-expiring,
budgeted, and unknown-format cases. No recovery phrases are used.

## Android blocker

As checked on October 27, Maven Central's
[`dash-sdk-android` metadata](https://repo.maven.apache.org/maven2/org/dashj/platform/dash-sdk-android/maven-metadata.xml)
reports **4.0.1** as its latest release; it does not publish a 5.x Android
artifact. Platform's monorepo release does not establish Maven availability or
compatibility of the installed Android SDK.

The clean `main` baseline actually pins all three Android SDK dependencies to
**4.0.0**. This preparation leaves those pins unchanged; neither an invented
5.x version nor an unvalidated 4.0.1 bump is made. The blocker is a verified,
published Android SDK path for Platform 5/PV14. Kotlin protocol unit tests
exercise local protocol behavior, not native SDK/DAPI compatibility.

Follow up with upstream release availability and compatibility guidance for
Android, Kotlin, and Java artifacts together. Validate native initialization,
DPNS resolution, identity discovery, key metadata, and an existing testnet
identity's SIWD login before declaring the authenticator ready. The web SDK
upgrade alone cannot establish Android readiness.

## Local validation on October 27

Environment: Node `24.22.1`, npm `11.19.1`, Gradle `8.11.1`, JDK 21 for Gradle
build/test execution. No live Platform requests, transactions, secret imports,
SMTP delivery, or deployment were performed.

| Check | Result |
| --- | --- |
| Protocol `npm run build` | Pass |
| Protocol `node --import tsx src/verify-vectors.ts` | 28/28 pass |
| Demo `npm run build` | Pass |
| Demo `npm run test:security` | 6/6 unit tests and all synthetic integration checks pass |
| Demo `npm test`, simulator mode | `SMOKE OK`, including login and contact form with SMTP disabled |
| SDK import/API checks in demo and bridge installations | Pass offline; no `connect()` call |
| `node --check` on worker and bridge scripts | Pass |
| Android `:protocol:test --rerun-tasks --offline` | 14/14 pass, no skipped tests |
| `git diff --check` | Pass |

The initial protocol `npm test` wrapper hit sandbox `listen EPERM` on tsx's
IPC pipe; the same vector suite passed through Node's tsx loader. Gradle's
initial sandbox attempt could not write its cache lock; the offline rerun
outside that restriction passed. These were environment restrictions, not
SDK test failures.

The HTTP suites ran from a temporary copy of the updated source excluding
`.env`, existing databases, and APKs, with an empty inherited environment,
synthetic keys, and loopback listeners. The security suite also requires the
existing sibling `rpg-campaign-platform` checkout and its installed dependencies;
it is not a standalone fresh-clone test. Smoke verification explicitly used
`SIWD_VERIFY_MODE=simulator`, with SMTP disabled. No remaining local build or
test failures were observed. Android APK/device and live network tests were
not run.

## Sail-through checklist before November 8

1. Confirm October 30 lock-in and actual PV14 activation timing with upstream.
2. On a testnet staging host, install from both committed lockfiles with
   `npm ci` under the supported Node 24 runtime. Roll out the updated worker,
   **`platform-key.mjs` adapter**, and SDK dependencies together on every
   bridge as well as the web host. An old adapter can strip limited-key
   metadata before the verifier sees it.
3. Perform read-only live testnet DPNS resolution and identity/key reads through
   the direct worker and each configured bridge. Verify real responses carry
   the authorization fields and complete an existing testnet identity login.
   Check expiry, replay rejection, outage rejection, and bridge failover.
   A successful SDK import or `health` connection alone is insufficient.
4. Resolve the Android publication/compatibility blocker and run testnet device
   acceptance. Do not substitute the protocol unit result for this gate.
5. After acceptance, deploy the reviewed web/bridge artifacts before November 8
   and monitor `/dash-auth/v1/platform/health` plus actual read/login outcomes.
   If verification breaks, fail closed and diagnose; do not enable simulator
   fallback or assume an SDK 4 rollback works against PV14.

This branch preparation does not push, deploy, restore stashed work, or spend
funds. Steps above that require deployment or device credentials are follow-up
work, not completed validation.
