# Security fixes — 2026-09-05

This is the implementation follow-up to SECURITY-REVIEW-2026-09-05.md. The
original review is preserved as the record of the pre-fix behavior.

## Production outcome

Both websites have been deployed and checked. Dashlogin runs as `siwd`;
Latitude runs as `rpgcampaign`. Neither service uses the `seraphina`
administration/AI-agent account. Application trees are root-owned. Private
state directories are mode 0700, environment files are root/service-group
0640, and systemd applies read-only system protection, protected homes,
private temporary/device namespaces, no new privileges, a 1536 MiB memory
budget and a 160-task limit. Cross-service data/environment access and
service-side source modification were checked and denied.

A fresh declared-dataset backup succeeded before and after migration. Both
pre-deployment SQLite copies returned `ok` from `PRAGMA quick_check`.
Private rollback copies of code, units, environment files and databases are
under `/var/backups/siwd-security-20260905` on the VPS. This is a temporary
rollback snapshot, not an additional ongoing backup policy. Off-host disaster
recovery and a full application restore rehearsal were not performed.

## Findings addressed

| Finding | Change and status |
| --- | --- |
| F01 | Android strictly validates request schema, sizes, domain/origin/response binding, supported network and deadlines before approval and signing; redirect following is disabled. Built and protocol-tested. |
| F02 | Per-operation Android Keystore authenticated decryption, zeroing of mutable signing-key buffers, screen-capture protection, debug-only test activities, signed release APKs and HTTPS App Links. Device validation status is recorded below. |
| F03 | Body limits, IP admission limits, at most four concurrent Platform operations per app, bounded worker output and execution time, HTTP timeouts and service resource budgets. The optional bridge receives corresponding limits. Live services use direct workers. |
| F04 | Deadline checked again after asynchronous verification; old Latitude approvals expire. Dashlogin's deployed request TTL reduced from 600 to 120 seconds; Latitude remains 180 seconds. |
| F05 | Dashlogin sessions expire after 12 hours absolute or 30 minutes idle by default. The database stores hashed session tokens. Migration invalidated old raw-token sessions once. |
| F06 | Latitude controller changes require a recent signature from the existing controller bound to the current user/session. Replacement revokes prior sessions, passwords, passkeys and pending authentication state. Unlinking requires explicit transfer consent and a surviving fallback. |
| F07 | Exact-origin checks plus CSRF tokens on browser mutations; signed phone-response endpoints retain signature authentication. Browser tests verify same-origin forms/fetch work and sibling-origin mutations fail. |
| F08 | Dedicated, separate service accounts and containment controls deployed and verified as above. |
| F09 | Real key purpose, security level, key type, disabled state, contract bounds, identity and network are preserved/validated. Unknown required metadata rejects; optional SDK fields follow their documented absence semantics. Fixtures include a public key shape read from deployed SDK 4.1. |
| F10 | Open by agreement: support transfers, investigate a complete name-bound ownership handover. See NAME-TRANSFER-SECURITY-2026-09-05.md. No permanent identity pin was introduced. |
| F11 | HSTS, no-referrer, no-store, nosniff, frame protection and limited CSP deployed. Hono updated to 4.12.34; unused demo nanoid removed; Latitude's development dependency nanoid updated to 3.3.18. Both locked deployments report zero known npm vulnerabilities. |

F09 in ordinary terms: a key can be a valid Dash key without being authorized
for this particular login. Previously, if its permission label was missing,
the adapter guessed that it was allowed. It now checks the actual permissions
and restrictions and rejects an incomplete or unsuitable key.

## Validation

- Campaign Platform: 223 tests passed across 36 test files, including 11 SIWD
  tests. Type checking passed.
- Demo: smoke suite and TypeScript checks passed; four metadata/capacity/CSRF
  tests plus regression cases for verification crossing expiry, expired
  sessions, old approvals, replay and Platform outages passed.
- Real Chromium: an authenticated synthetic user survives a sibling-origin
  logout attempt; same-origin fetch and form token insertion work; oversized
  phone-response bodies reject. Test data is isolated from live databases.
- Android: eight protocol tests passed and both release variants built.
  APK v2/v3 signatures verified. Release package IDs are
  `org.siwd.authenticator.testnet` and `org.siwd.authenticator`; version code 2.
- Live: both health endpoints return the expected network; live DPNS reads
  succeed on both networks. Capabilities are not cacheable, status requires
  browser binding, and an unsigned/unapproved request cannot finish. Sibling
  origin POSTs return 403. Both services are healthy after the deployment correction below; ordinary
  Platform reads work under their new accounts.
- Both HTTPS App Links association documents return 200 with the matching
  network package and release certificate. The public testnet APK download's
  SHA-256 matches the local signed artifact.

Commands/scripts: `apps/demo-web` contains `npm run test:security`; its
cross-project regression requires the sibling Campaign Platform checkout.
Run the browser harness from that directory with
`node --import tsx ../../docs/security-audit-2026-09-05/browser-regression.mjs`
and an isolated demo server on 18792. `inspect-live.mjs` performs bounded,
unsigned live ceremony checks without printing cookies or capability tokens.

## Mobile distribution and remaining work

The signed testnet release replaces the public debug download. At the operator's
request, both signed version-code-2 releases were installed on the attached
phone on 2026-09-05, alongside the existing debug apps. Checksums and signatures
were checked before installation. Android verified Dashlogin's association
with the testnet release and Latitude's association with the mainnet release.
The mainnet release remains privately distributed. Release and debug packages have
separate private storage; an existing debug installation is not silently
migrated into a release installation. Keep recovery backups before changing
installations. No real mnemonic, private key or transaction was used here.

Release signing material is stored outside the repository in the local
`.secrets/siwd-release/` directory. Retain a secure backup; future upgrades
must use the same certificate. The build helper is
`tools/sign-authenticator-release.sh`. Public certificate SHA-256:
`19:A6:2F:56:97:75:39:1F:75:45:82:BF:E6:43:29:7F:80:99:FF:AA:F1:79:62:95:B6:6E:19:0C:72:AF:66:F7`.

On the attached phone, the isolated synthetic testnet app passed the key-storage
test at 07:53 EDT on 2026-09-05 after the operator unlocked the phone and
approved the OS prompt. Stored metadata and the wrapped key survived a process
restart; unauthenticated decryption was blocked; authenticated decryption
returned the correct synthetic key; and a second decryption required fresh
authentication. The earlier prompt was canceled while the screen was off.
This validates the shared storage/gate code in the isolated audit build,
not the full release-app login flow or both authentication methods separately.
End-to-end login
using the user's real mainnet key has not been attempted. Legacy migration,
key invalidation, Android 8–10 biometric behavior and the full recovery/update
experience still need dedicated device coverage. F10 remains unresolved;
existing name-based owner authorization must not be considered a complete
safe transfer mechanism. Legitimate QR forwarding/phishing remains a
protocol limitation, and these fixes are not an independent mobile audit.


## Deployment issue found and corrected

A repeat Latitude deployment exposed an existing-file check performed as the
administration account after the configuration directory became private. It
mistook the inaccessible configuration for a missing file and installed the
generic example. Latitude failed closed on the wrong state-directory setting
and was temporarily unavailable. The private pre-deployment production
configuration was restored; its mainnet setting, original database and
bootstrapped state were verified. The deploy script now performs the
existence check with sudo and waits for a successful health check. Both
applications retain their separate unprivileged runtime accounts.


## Acceptance-test packages: 0.1.1, version code 4

Both signed releases were installed over their existing release packages on
the operator's phone with `adb install --no-incremental -r`. App data was not
cleared. Android reports version code 4 for both apps, with no DEBUGGABLE flag,
and verifies only the appropriate domain for each flavor: Dashlogin/testnet
and Latitude/mainnet. The persistent release certificate is unchanged.

The version-3 recovery fixes are retained. The unfinished follow-up that
checked non-login keys was removed, along with its unused helper/test and
incomplete derivation-only debug experiment. The operator had confirmed that
the correct saved phrase recovers the identity, resolving the original issue.

All 12 protocol tests passed with no skips. Both release builds and APK
signature/checksum checks passed. APK inspection confirms backups disabled,
the Platform service non-exported, and diagnostic activities absent.
Artifact hashes are recorded in security-audit-2026-09-05/release-0.1.1.json.

Operator acceptance tests remain pending on both websites. Check that the
imported identity persists after reopening the app, cancel one approval and
confirm no login occurs, then approve a fresh request and verify the expected
website account. No commit has been created or authorized by this packaging
request. The mainnet artifact remains private; the testnet artifact is staged
locally for later deployment after acceptance.


## Recovery and Firefox logout follow-up: 0.1.2 (version code 5)

The operator reported keyboard predictions during recovery, a name-free mainnet
scan timing out, and Firefox form logout failing with `Origin: null`.

- Recovery entry now uses app-owned letter buttons and a locally filtered,
  bundled BIP-39 word list. The mnemonic never enters the Android keyboard.
  Words are hidden by default, numbered, and individually editable. There is
  no clipboard or saved-instance-state persistence of the phrase. The optional
  passphrase remains password-class input even when revealed, with no-learning,
  no-suggestions, no-extraction, no-autofill and no-saved-state settings. These
  IME flags are requests to the keyboard; the mnemonic avoids the IME entirely.
  Existing keyboard history is not removed by an app update.
- Automatic discovery now visits 20 identity positions (instead of six), with
  the first six key slots as network discovery candidates. Common master slots
  are visited first across all identities. Eligible login keys are still
  matched locally across 20 identity positions and 32 key slots, using the
  actual Platform key ID. A supplied name is an optional direct shortcut.
- Progress and discovered identities are delivered incrementally. The operator
  can finish with found identities without waiting for unrelated missing-key
  lookups. The search has a 30-minute network-work limit; reaching it preserves
  found results for explicit saving instead of throwing them away. Cancellation,
  timeout and early completion unbind the dedicated service, which terminates
  its native process. A failed partial search is explicitly marked incomplete.
- Name lookup paginates the SDK's `records.identity` query and fails explicitly
  on network/pagination errors rather than silently showing an unnamed identity.
  It does not change name-transfer authorization (F10). Import merges by identity
  ID and preserves other already-stored identities. Private IPC result keys use
  mutable byte arrays, cleared after wrapping/cancellation and on replacement.
- Both sites accept an opaque or absent Origin only with browser-generated
  `Sec-Fetch-Site: same-origin` and a valid double-submit CSRF token. Explicit
  foreign origins, same-site/cross-site metadata and missing/invalid tokens are
  rejected. The no-referrer policy remains. Logout revokes the session, clears
  its cookie, and sends HTTP 303 to `/` on both sites.

Validation: both web type/build checks, 224 Campaign Platform tests, demo
security tests, and Chromium/Firefox 153 browser regressions passed. Browser
coverage includes authenticated session revocation and homepage navigation,
plus the reported opaque-origin request and negative CSRF cases for both sites.
Both deployed sites also passed anonymous endpoint checks (303 home, invalid
requests 403) after a four-file deployment; private backups are under
`/var/backups/siwd-logout-20260905`. Configuration and databases were unchanged.

The isolated phone fixture checks private-input flags, incremental discovery of
multiple identities with multiple names, early completion, preservation after a
later failure, timeout preservation, cancellation and retry. Public testnet
metadata verified the updated name query and public-key-hash lookups without
using a real recovery phrase. Real mainnet/testnet mnemonic recovery and login
acceptance remain the operator's tests; these checks do not establish support
for every wallet format, every identity position, or arbitrarily rotated keys.
The full automatic scan's speed still depends on the pinned native SDK and the
network. Mainnet remains a private experimental release. No commit is authorized.

Both signed version-5 apps were subsequently installed with replacement updates
(no data clearing). Package inspection confirms 0.1.2-testnet and
0.1.2-mainnet-private, no DEBUGGABLE flag, the unchanged signing certificate,
and verified domain links for the appropriate site. All six final synthetic
recovery checks passed on the phone, including the network-work timeout case.
The audit app was stopped and the mainnet release opened for operator testing.
Release hashes and validation evidence are in
`security-audit-2026-09-05/release-0.1.2.json` and
`security-audit-2026-09-05/recovery-0.1.2-validation.txt`.
The public download APK has not been replaced with this acceptance candidate.


## Operator acceptance and source synchronization

On 2026-09-05 the operator reported that testing was successful and authorized
committing and synchronizing the tested changes. This supersedes the pending
acceptance/commit notes above for version 0.1.2. Both release packages were
already installed in place, and both sites' logout fixes were deployed.
Only source, public signing fingerprints/artifact hashes, synthetic test
fixtures, and reviewed audit documentation belong in these commits. Recovery
secrets, release signing material, runtime configuration/databases, and APKs
remain outside the staged change set. F10 and the additional device scenarios
listed above are still outstanding; operator acceptance is not an independent
security audit.
