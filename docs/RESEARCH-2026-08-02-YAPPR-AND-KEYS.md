# Research: Yappr Auth Evaluation and Identity Key Eligibility

**Research date:** 2026-08-02  
**Status:** Closed for M0 Yappr item; key policy updated in `DECISIONS.md` D-010  
**Related:** [`RESEARCH-2026-07-27.md`](RESEARCH-2026-07-27.md),
[`DASH-IMPLEMENTATION-INSPECTION-2026-07-27.md`](DASH-IMPLEMENTATION-INSPECTION-2026-07-27.md)

## 1. Yappr (not “Yapper”)

### What it is

| Field | Value |
| --- | --- |
| Canonical name | **Yappr** |
| Product | Twitter/X-like social + storefront DApp on Dash Platform |
| Live site | https://yap.pr/ (testnet; data may reset) |
| Source | https://github.com/dashpay/yappr (`dashpay` org) |
| Driver | Pasta / QuantumExplorer; promoted by Dash |
| Stack | Next.js, TypeScript, `@dashevo/evo-sdk` (advanced branch) |

Unrelated products share the “Yapper” spelling (AI tools, care apps, tokens).
SIWD care is only **Yappr**.

### What Yappr login actually does

Yappr’s “Login with Wallet (QR)” is **not** passwordless website authentication
in the SIWD sense. It is **DApp key bootstrap** so the browser session can act
as the user’s Platform identity against **Yappr’s data contracts** (posts,
follows, DMs, store, etc. on Dash Drive / Platform).

High-level flow (confirmed from Yappr advanced-branch source and draft DIP):

1. The site generates an ephemeral keypair and shows a `dash-key:` QR
   (~120 s TTL), bound to Yappr’s **application contract ID** and a short
   label.
2. A compatible wallet (Dash Evo Tool / marketing also mentions DashPay)
   scans, derives a deterministic per-contract login key, ECDH-encrypts it,
   and publishes a Platform `loginKeyResponse` document.
3. The site polls Platform, decrypts the login key, and derives app
   auth/encryption keys.
4. First-time identities may need a second `dash-st:` QR so the wallet
   registers those keys on the identity and signs the state transition.

Other Yappr login paths (manual WIF, password vault, WebAuthn/passkey vault)
also end with **private keys available to the browser DApp**, not with an
HttpOnly server session for an arbitrary relying party.

### Product interpretation (SIWD framing)

Yes: Yappr auth is mostly “sign in so this app can read/write the Yappr
contract data the user owns on Platform.” That is a legitimate and polished
use of Dash identity technology. It is a **different application** from
SIWD:

| | Yappr QR login | SIWD |
| --- | --- | --- |
| Goal | Bootstrap app-scoped keys for a Platform DApp | Prove control of identity to a website |
| After success | Browser holds keys; can sign Platform STs | Website holds a session; keys stay on phone |
| Binding | Contract ID + label | HTTPS origin / domain + browser binding |
| Auth channel | On-chain document poll | Off-chain HTTPS capability URL + signature |
| RP type | The DApp itself | Ordinary websites |

SIWD should **not** fork Yappr’s security model (key transfer into the site).
It **can** learn UX patterns and should stay aware of the emerging
`dash-key:` / `dash-st:` wallet URI family so scanners do not confuse
“share app keys with this DApp” and “sign in to this website.”

### UX and ecosystem learnings worth adopting

- QR + countdown (~120 s), copy-URI fallback, cancel/retry on timeout.
- Clear multi-state UI: generating → waiting → decrypting/checking →
  complete / timeout / error.
- Explicit network pin in the URI (`n=t|m|…`).
- Human-readable label in the payload; wallet must still show trustworthy
  context.
- First-time setup QR only when needed (e.g. key registration), not on every
  return login.
- Coordinate a **distinct SIWD URI scheme** (e.g. `siwd:` or `dash-auth:`)
  with wallet maintainers so `dash-key:` remains key-exchange only.

### Explicit non-goals / do not copy

- Transferring identity or app private keys into website JavaScript.
- Completing login via public Platform documents (fees, latency, metadata
  leakage, different threat model).
- Binding login only to a data-contract ID without web origin binding.
- Master-branch patterns that stored vault material in fragile
  `sessionStorage` designs (advanced branch is the auth reference).

### Protocol standardization

- Draft DIP (Pasta/Yappr key exchange + ST signing URI):  
  https://github.com/dashpay/dips/pull/181  
- Wallet peer: https://github.com/dashpay/dash-evo-tool  
- Earlier ST-signing URI discussion: DIP PR #174 (closed/superseded direction).

### Status

Active testnet product; mainnet “soon” in marketing, not treated as live
production by SIWD. Open source. Auth maturity is on advanced branches (e.g.
`codex/passkey-auth-vault`); sparse `master` history is not the full picture.

### Sources

- https://yap.pr/
- https://github.com/dashpay/yappr
- https://github.com/dashpay/dips/pull/181
- https://github.com/dashpay/dash-evo-tool
- Local prior note: `RESEARCH-2026-07-27.md` § Yappr / Yapper

**M0 item:** Locate and evaluate Yappr authentication work — **done**.

---

## 2. Identity key eligibility (HIGH vs CRITICAL vs historical)

### Question

Do older or real-world identities ever lack an usable `AUTHENTICATION/HIGH`
ECDSA key, such that SIWD would need a **CRITICAL** authentication key
fallback?

### Protocol requirements (DIP 11)

[DIP 0011 — Identities](https://github.com/dashpay/dips/blob/master/dip-0011.md)
defines authentication security levels Master, Critical, High, and Medium, and
states that identities **must be created with at least one authentication key
in each security level**. It also states keys may only be disabled if another
valid key remains enabled at the **same** security level.

Implication: a protocol-conforming identity is created with a HIGH auth key and
cannot be left with zero enabled HIGH auth keys through normal updates.

### Canonical wallet layout (current Platform)

Current Platform identity derivation (rs-platform-wallet-ffi) provisions:

| Key id | Purpose | Security level | Role |
| --- | --- | --- | --- |
| 0 | Authentication | Master | identity create/update |
| 1 | Authentication | Critical | token / high-stakes ops |
| 2 | Authentication | High | general document operations |
| 3 | Transfer | Critical | credit transfer/withdrawal |
| >3 | Authentication | High | additional auth keys |

Source comments note slots 0/1/2 keep pre-existing purpose/level bytes
byte-for-byte for callers that still use a 3-key count; HIGH at id 2 is not a
new late addition to the auth ladder—it is the general-operations key.

CRITICAL at id 1 is therefore **not** “what old identities used instead of
HIGH.” It is a **higher-stakes sibling** that coexists with HIGH in the
canonical set (tokens / elevated Platform operations).

### What SIWD should sign with

Website login is closer to DIP 11’s **HIGH** examples (social posts, contact
requests, reputation-level risk) than to **CRITICAL** (asset exchange, fund
loss) or **MASTER** (identity loss). Preferring HIGH:

- matches Platform’s intended security-level UX;
- avoids soliciting signatures with keys clients treat as higher privilege;
- matches SIWD’s “narrow signing, not a general oracle” posture.

Never eligible for SIWD (unchanged):

- Master authentication
- Transfer / withdrawal
- Encryption / decryption
- Voting (if present)
- Disabled keys
- Wrong type for recoverable SIWD signatures (prefer
  `ECDSA_SECP256K1`; contract-bounded or hash-only keys that cannot serve
  SIWD are out)

### Fallback decision

**MVP / Draft 1.1 policy: HIGH only.** No CRITICAL fallback in the default
protocol.

Rationale:

1. DIP 11 requires HIGH at creation and replacement-on-disable.
2. Canonical layouts always include HIGH alongside CRITICAL, not HIGH-or-
   CRITICAL as alternatives.
3. CRITICAL fallback would expand blast radius for little expected gain.
4. Pathological cases (malformed testnet tools, only `ECDSA_HASH160` app keys
   registered as HIGH, bounds that forbid general auth) should fail closed or
   be fixed by adding a proper unbounded HIGH ECDSA key—not by elevating SIWD
   to CRITICAL.

**Optional future:** if a live survey of testnet/mainnet identities finds
conforming identities with no usable HIGH ECDSA auth key, revisit a narrowly
scoped CRITICAL fallback under RP policy + golden vectors. That is not
expected under DIP 11.

### Residual verification (implementation, not design change)

Still worth checking when Platform is wired (M2/M3):

- A sample of restored identities: every one has an active HIGH ECDSA auth
  key selectable by metadata (not hard-coded id 2 alone).
- Disabled-key and wrong-type rejection paths.
- Contract-bounded app keys (e.g. Yappr-registered keys) are not silently
  chosen for SIWD unless they meet eligibility.

These are conformance tests, not open product questions.

---

## 3. Bottom line

| Topic | Conclusion |
| --- | --- |
| Yappr | Real Dash DApp; QR login = contract/Drive key bootstrap; different problem than website SIWD |
| Learn from Yappr | UX, TTL, network pin, distinct URI schemes, wallet ecosystem awareness |
| Do not copy Yappr | Keys in browser, on-chain login response, contract-only binding |
| Key eligibility | Prefer and require active unbounded AUTHENTICATION/HIGH ECDSA; never master/transfer/etc.; no CRITICAL fallback unless a later survey proves HIGH-less identities exist |
