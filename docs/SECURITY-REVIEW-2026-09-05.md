# Security review — Sign in with Dash and Latitude

Reviewed 2026-09-05. Scope: SIWD protocol, demo server, Android authenticator,
Latitude's SIWD integration and adjacent session/account controls, and the two
live VPS services. **The normal login flow works in the tests performed, but
this implementation is not ready for a mainnet security sign-off.** There are
confirmed authentication-UI and lifetime defects, insufficient mobile key
protection, and weak abuse containment.

This was a source review with isolated reproductions and bounded live checks,
not an independent cryptographic certification, mobile penetration test, or
incident investigation. Severity below describes application impact and
prerequisites; it is not a formal CVSS assessment. No real recovery phrase or
private key was used. No production login was approved, account changed,
service restarted, deployment modified, or commit created.

## What was verified live

| Check | dashlogin.ronhelwig.com | latitude.ronhelwig.com |
| --- | --- | --- |
| Network | Testnet | Mainnet |
| Verification | `platform`; simulator disabled; `/dev/simulator` returns 404 | Mainnet trusted Evo SDK; no bridge configured |
| Public Platform lookup | Configured testnet name resolved, HTTP 200 | Mainnet name lookup created an unsigned ceremony, HTTP 200, about 1.3 seconds |
| Challenge lifetime | **600 seconds** | 180 seconds |
| Binding cookie | Secure, HttpOnly, SameSite=Strict | Secure, HttpOnly, SameSite=Strict |
| Status without / with correct binding | 401 / 200 pending | 401 / 200 pending |
| Finish without approval | 409 | 409 |
| Capability JSON cache policy | `no-store` | `no-store` |
| Capability referrer policy | `no-referrer` | **`same-origin`**, overwritten by Caddy |
| Ceremony HTML cache policy | Missing | Missing |
| HSTS | Missing | Present |
| Frame protection / CSP | Missing | Missing |
| Service state | Active; zero recorded restarts | Active; zero recorded restarts |

Both application listeners bind to loopback behind Caddy. VPS Node is
24.20.0. SHA-256 comparisons matched the local and deployed demo server,
demo store, demo Platform worker, Latitude server, and all three Latitude SIWD
implementation files. Thus the server findings apply to deployed code, rather
than merely an undeployed branch. The Android working tree contains existing
uncommitted mainnet work; its installed version on the user's phone was not
verified. The locally built mainnet APK is marked `application-debuggable`.

## Findings and remedies

### F01 — High: the phone can display a different domain from the one it signs

**Evidence:** `apps/android-authenticator/app/src/main/java/org/siwd/authenticator/data/RequestClient.kt:22`,
`protocol/src/main/kotlin/org/siwd/protocol/RequestParse.kt` under the Android
app, and `ui/Screens.kt:688`. `fetchRequest()` parses a body without checking
the fetched URL against `origin`, `domain`, and `responseUri`. The approval UI
prints `req.domain`; signing uses `req.origin`. The parser also accepts an
unsupported version and uses regular expressions instead of a complete JSON
parser. OkHttp's default redirect following is left enabled.

An attacker can start a real login in their own browser, copy its challenge
into a malicious HTTPS response, change the displayed domain, and retain the
original signed origin. They can change `responseUri` to their own collector
and forward the returned signature. If the victim approves, the attacker's
browser can finish the victim's login. This requires user approval, but the
domain shown during that approval is misleading. It is an additional defect
beyond the already documented risk of forwarding a legitimate QR code.

**Reproduced:** the actual Kotlin parser accepts a spoofed display domain and
foreign response destination. The actual signer produces a signature that
verifies for the original request. A second diagnostic confirms acceptance
of version 999 and an HTTP response URI. Release network security settings
may block the HTTP connection; the HTTPS spoofing case needs no cleartext.

**Fix first:** implement strict JSON/schema validation before displaying any
approval; enforce version, network, nonce, supported policy, timestamp bounds,
normalized origin, domain, and same-origin capability/response endpoints.
Reject or tightly constrain redirects. Derive the displayed host from the
validated origin, and revalidate expiration immediately before signing.

### F02 — High: mobile key protection does not enforce authenticated key use

**Evidence:** `SecureIdentityStore.kt:29` builds an AES master key without
`setUserAuthenticationRequired(true)`. `list()` decrypts identities including
private-key hex strings; the UI loads these before approval. `DeviceGate.kt`
uses `BiometricPrompt.authenticate(info)` without a cryptographic object.
The local mainnet APK is a debug build. There is no `FLAG_SECURE` protection
on the phrase or approval activity. The exported debug self-test activity is
declared in the main manifest rather than restricted to debug builds.

The prompt protects the normal UI path, but code executing as the app can read
and use its stored signing keys without a fresh Keystore-enforced unlock.
Debug builds make debugger/ADB access a material additional concern. This
does **not** mean an ordinary unrelated Android app can automatically decrypt
the store; exploitation needs app-process/debug access or another compromise.
Screenshots and recents are a separate exposure for phrase-entry screens.

**Fix:** authenticate decryption of each selected signing key through an
authentication-required Keystore key and `CryptoObject`; retain plaintext for
the shortest practical period; avoid loading all private keys into UI state.
Add secure-window protection, move debug components to the debug source set,
and distribute a non-debuggable signed release through a verified update
process. Verify backup exclusion and key invalidation on actual devices.
Android's [biometric cryptography guidance](https://developer.android.com/identity/sign-in/biometric-auth)
and [OWASP's cryptographic binding recommendation](https://mas.owasp.org/MASTG/best-practices/MASTG-BEST-0036/)
describe the required distinction between a UI prompt and enforced key use.

### F03 — High availability risk: anonymous requests can consume unbounded resources

**Evidence:** Latitude `apps/campaign-platform/src/server.ts:511` buffers whole
request bodies with no byte limit. Its public `/auth/dash/login` performs a
Platform lookup and spawns an SDK process without rate limiting or a global
concurrency limit. `auth/siwd-platform.ts:8` allows workers to run for 90 seconds.
The demo also lacks HTTP body limits and a global worker limit; it does have
per-IP rate limits, but exposes several expensive lookup routes separately.
Neither app purges old SIWD requests; the demo also retains rate-bucket keys.
The deployed Caddyfile supplies no compensating body limits.

Repeated requests or large bodies can exhaust memory/processes or grow the
database. A healthy `/healthz` response does not establish load resilience.
**No live load or exhaustion attack was attempted.**

**Fix:** enforce small byte limits before buffering auth bodies, validate
field lengths and types before SDK work, add trusted-proxy-aware rate limits,
cap global and per-client verification concurrency, bound queues, cancel
abandoned work, and purge expired data. Add service memory/task limits and
perform bounded load tests on an isolated deployment.

### F04 — Medium: authentication deadlines are not enforced consistently

**Evidence:** demo `src/lib/store.ts:253` checks expiry before awaiting Platform
work, but its approval update at line 452 does not recheck time. Latitude
`auth/siwd.ts:25` has the same gap. Latitude's `expire()` at line 15 handles
only pending requests; `finishSiwd()` has no approval/finish deadline at all.

**Reproduced:** both implementations approved a valid response when the clock
advanced beyond expiry during Platform verification. Latitude also finished
an approved request whose expiry and approval timestamps were set to 2000.
This needs a genuine approved response and the original browser-binding token;
it is not a signature forgery. Browser cookie expiration does not constrain a
client that retained the token and manually resubmits it.

The live demo additionally advertises a **600-second** TTL, exceeding
`docs/PROTOCOL.md:101` and `:302`, which limit requests to 300 seconds.

**Fix:** include expiry in the atomic pending-to-approved condition, enforce
a bounded approval-to-finish deadline, and reject startup configurations
outside the protocol's allowed TTL range. Recheck time after every async
verification step that can affect acceptance.

### F05 — Medium: Dashlogin sessions have no server-side expiration

**Evidence:** demo `src/lib/store.ts:702`, `getSession()`, checks revocation and
account status but neither absolute nor idle expiry. A browser-session cookie
does not expire a copied bearer token on the server.

**Reproduced:** a demo session with creation and last-seen timestamps set to
2000 was accepted. A stolen token remains useful until logout, revocation, or
account deactivation. Latitude does enforce server-side session expiry; its
default is 14 days, a separate exposure-window policy rather than this bug.

**Fix:** enforce absolute and idle timeouts in the session query, store hashed
session tokens, and require fresh authentication for sensitive account changes.

### F06 — High conditional account-takeover risk: Latitude can replace or remove SIWD control using an existing session

**Evidence:** Latitude `server.ts:1959` unlinks Dash by deleting its identity
row; it neither revokes sessions nor deactivates the account. `auth/siwd.ts:46`
upserts a replacement identity after approval by the **new** identity, without
approval by the currently controlling identity. These paths are accessible to
an ordinary authenticated account session, including one obtained through
another login method.

Someone holding a stolen existing session can attach an identity they control
and gain persistent access, or remove the victim's SIWD method. A legitimate
user can also disconnect their only login method and lock themselves out.
This conflicts with the controlling-method policy in `docs/SECURITY.md` §9.

**Fix:** define explicit ownership-transfer semantics, require fresh approval
from the existing controller for replacement, prevent accidental removal of
the last method, and atomically revoke sessions and pending linking requests
when control changes. Distinguish explicit transfer to another method from
ordinary unlinking.

### F07 — Medium: state-changing browser routes lack CSRF checks

Neither server implements a general Origin/CSRF check on authenticated form
actions. Examples include demo `/me/deactivate` and access-management routes,
and Latitude `/auth/dash/unlink`. SameSite cookies reduce attacks from unrelated
sites, but sibling HTTPS hosts under `ronhelwig.com` are the same site while
remaining different origins. A compromised or malicious sibling site can
therefore submit authenticated forms. CORS does not prevent form submission.
This was established from route and cookie configuration, not by attacking
any sibling production site.

**Fix:** enforce exact allowed Origin and CSRF tokens on browser mutations,
with a narrowly scoped exception for signed authenticator responses. Protect
pages from framing. Test sibling-origin requests in a real browser.

### F08 — High containment concern: both live apps share a writable service identity

Both services run as `seraphina`; their source trees and application data are
owned by that identity, and both environment files are readable by it.
`ProtectSystem`, `ProtectHome`, and `PrivateTmp` are disabled; `MemoryMax` is
unlimited. This lets compromise of either app expose or alter the other app's
code, data, and credentials. It substantially weakens separation between the
public testnet demo and the mainnet application.

The account also has passwordless sudo, but **`NoNewPrivileges=yes` is present
on both services**: ordinary setuid sudo escalation from those service
processes is constrained. No root exploit or initial code-execution exploit
was demonstrated. The finding is shared access and blast radius.

**Fix:** separate unprivileged service users, read-only deployment trees,
private state directories, restricted environment-file ownership, filesystem
sandboxing, and resource budgets. Keep the deployment/administration account
separate from application execution.

### F09 — Medium: Platform key adapters supply permissive defaults and discard restrictions

Both Platform worker summaries default a missing purpose to AUTHENTICATION
and a missing level to HIGH. They discard key type and contract bounds; the
web verifiers use substring checks for purpose and security level and pass
hardcoded eligible values into protocol checks. The standalone eligibility
helper's bounds check is consequently not supplied real bounds on these paths.

Current complete SDK responses may prevent this from being exploitable today;
no malicious live Platform key was provisioned. The code nevertheless fails
open on missing authorization metadata and cannot enforce the stated bounded-key
policy. A compressed-key length check does not replace purpose/bounds validation.

**Fix:** preserve and strictly validate SDK key type, purpose, level, disabled
state, bounds, identity ID, and network. Missing fields must reject. Add real
SDK-shaped fixtures, including bounded and incomplete keys, to verifier tests.
If bridge mode is used later, verify its network and schema rather than
assuming the configured upstream belongs to the right network.

### F10 — Medium: demo owner authority follows a mutable display name

`src/lib/access.ts:65` grants owner access based on `account.dpns_name`, and
the live owner configuration is a DPNS name. Following a name transfer, a new
identity can acquire owner status while the previous identity's existing
session can retain its stored old name and privileges. That does not implement
the atomic transfer/revocation behavior required for name-bound authority.
This is conditional on name ownership changing; no transfer was attempted.

**Fix:** pin administrative ownership to a stable identity ID/account ID, or
explicitly implement name-bound administrative control with revalidation and
revocation. Compare Base58 identity IDs exactly, without lowercasing them.

### F11 — Lower-priority hardening and dependency maintenance

The live header gaps are listed above. Add `no-store` to ceremony and account
responses, `no-referrer` for sensitive auth routes, HSTS on Dashlogin, and a
CSP including `frame-ancestors`. Preserve the application's stricter
`no-referrer` header instead of replacing it with Caddy's `same-origin` value.
No access logger is enabled in the reviewed Caddyfile; that is not proof that
capability URLs never appear in browser history or other operational systems.

The demo's production dependency audit reported **two affected packages**:
Hono 4.12.33 (moderate) and nanoid 5.1.5 (high package-level rating). Those
versions are also deployed. The reviewed source does not import nanoid or use
the flagged Hono CORS/language/proxy/SSR-memo paths, so this is **not a confirmed
reachable high-severity web exploit**. Remove unused dependencies and update
the remaining ones with locked installs. Relevant maintainer advisories:
[Hono CORS](https://github.com/honojs/hono/security/advisories/GHSA-8j4g-w8fx-2239)
and [nanoid](https://github.com/ai/nanoid/security/advisories/GHSA-xwg4-73v4-xw9w).
Latitude's production npm audit reported **zero known vulnerabilities**.
These results are point-in-time package checks, not an Android dependency audit.

## Correct behavior and resilience already present

- Canonical signing binds network, origin, action, binding policy, challenge,
  nonce, timestamps, identity, name, and key ID. Strict recoverable-signature
  verification checks the recovered public key and rejects high-S signatures.
- Capabilities, binding tokens, and session tokens use cryptographic randomness;
  capability/binding hashes are stored server-side. Nonce material is stored
  in recoverable form in the database, contrary to the threat-model table's
  stronger "hash request nonces" wording; it is not sufficient to sign a login.
- Both real-Platform verification paths failed closed in the synthetic outage
  reproduction. Live deployments do not use the demo fixture fallback.
- Atomic state transitions prevent duplicate finishes. Latitude verifies the
  intended Dash name and binds linking completion to the intended user.
- The SDK's `testnetTrusted()`/`mainnetTrusted()` use a trusted HTTPS source of
  quorum keys to verify Platform proofs; the name does not mean proofs are
  simply skipped. See [Dash's trusted-mode documentation](https://dashpay.github.io/platform/evo-sdk/trusted-mode.html).
- Android has encrypted preferences, explicit UI approval, backup/transfer
  exclusions, and an isolated native discovery process. It does not persist
  the mnemonic in the reviewed store or send it to these websites.
- systemd restarts failed services. Both remained active with zero recorded
  restarts after the bounded checks. The VPS had roughly 48 GB free disk and
  5.8 GB available memory during inspection; no swap was configured.
- Successful hourly backup logs include both SQLite databases and Latitude's
  uploaded files. Retention is configured for 24 hourly and 14 daily snapshots.
  Off-VPS freshness and a restore drill were **not verified**. One VPS and the
  external Platform/quorum-key services remain availability dependencies.

## Validation and limits

| Validation | Result |
| --- | --- |
| TypeScript protocol vectors | 28/28 passed |
| Protocol build and demo typecheck | Passed |
| Existing demo HTTP smoke suite, synthetic identities/in-memory DB | Passed |
| Latitude SIWD unit suite | 5/5 passed |
| Latitude typecheck | Passed |
| Kotlin existing golden-vector tests, forced rerun | 3/3 passed, none skipped |
| Kotlin adversarial parser/signature diagnostics | 2/2 reproduced the defects |
| Server lifetime/session diagnostics | Four defects reproduced; duplicate-finish and outage controls passed |
| Live checks | HTTPS, configuration, unsigned ceremonies, public lookups, binding and unsigned finish rejection |

Reproduction artifacts are in [security-audit-2026-09-05](security-audit-2026-09-05/).
`reproduce-server.mjs` uses real verifier code, synthetic keys, a loopback
Platform stub, in-memory databases, and controlled clock advancement. It
asserts the insecure behavior observed on this date; its success is **not** a
security pass. Run from `apps/demo-web` using the project's Node 24 runtime:

```sh
node --import tsx ../../docs/security-audit-2026-09-05/reproduce-server.mjs
```

`RequestValidationAuditTest.kt` was temporarily copied into the Android
protocol test source set and executed with JDK 21 and
`./gradlew :protocol:test --offline --rerun-tasks`; the temporary copy was
removed afterward. The audit source remains alongside this report.
`inspect-live.mjs` records only non-secret summaries; it creates unsigned
requests and performs no authentication. Its successful run is documented
above; do not run it against additional hosts without authorization.

The vector tests validate protocol examples, not every deployed HTTP or phone
validation path. The Kotlin existing tests do not run a malicious-QR corpus.
No full mobile UI/biometric test, real mainnet sign-in, live concurrency test,
TLS cipher assessment, backup restore, complete Latitude feature audit, or
historical secret/compromise investigation was performed.

## Recommended order

1. Correct phone request validation and authenticated key decryption; produce
   and verify a non-debuggable mobile release before relying on mainnet SIWD.
2. Repair request/finish/session expiration, and reduce the live demo TTL to
   the protocol limit. Add regression tests asserting rejection of the cases
   reproduced here.
3. Fix SIWD replacement/unlink authority and CSRF, then enforce body, worker,
   and rate limits and separate service identities.
4. Tighten key metadata validation and owner identity binding; add headers and
   dependency updates, restore testing, monitoring, and isolated load tests.

The documented residual legitimate-QR forwarding risk remains even after F01
is fixed. Users must approve only ceremonies they initiated; this cross-device
flow should not be advertised as phishing-resistant. A fresh signed approval
does not authorize payments through the SIWD protocol, but importing a wallet
recovery phrase still places financial recovery material inside the mobile
application during import. The existing mainnet review/release gates remain
relevant; this review does not fulfill the independent mobile/cryptographic
review requirement.
