# Current Dash Implementation and Signing Inspection

**Inspection date:** 2026-07-27  
**Status:** Source inspection complete; interoperability vectors still required

## 1. Scope and pinned sources

This pass inspected shallow, read-only checkouts of:

| Repository | Inspected revision | Revision date |
| --- | --- | --- |
| [`dashpay/dash-wallet`](https://github.com/dashpay/dash-wallet) | [`526fe78127291649119d25dd675492fb0d450727`](https://github.com/dashpay/dash-wallet/commit/526fe78127291649119d25dd675492fb0d450727) | 2026-07-20 |
| [`dashpay/platform`](https://github.com/dashpay/platform) | [`08152ea51ec46c9b653899f6793c8a392c721c79`](https://github.com/dashpay/platform/commit/08152ea51ec46c9b653899f6793c8a392c721c79) | 2026-07-24 |
| [`dashpay/rust-dashcore`](https://github.com/dashpay/rust-dashcore) | [`70d4bf8e36057c58e02d56769a6e9760f701dd06`](https://github.com/dashpay/rust-dashcore/commit/70d4bf8e36057c58e02d56769a6e9760f701dd06) | 2026-07-22 |

The rust-dashcore revision is the exact commit pinned by the inspected Platform
workspace. Findings describe these revisions, not an evergreen API promise.

## 2. Executive findings

1. The shipping Android DashPay wallet has identity and DPNS functionality, but
   no website-login request handler or documented identity-message signing API
   was found.
2. Its existing `AuthenticationManager.signMessage` signs with a Dash payment
   address key through DashJ. It is not a Platform identity authentication
   signer and should not define the SIWD protocol.
3. The Platform monorepo now includes a substantially newer native Android
   Kotlin SDK backed by Rust through JNI. It includes wallet restore, identity
   discovery, DPNS queries, identity key derivation/persistence, a
   biometric-gated `KeystoreSigner`, and QR examples.
4. The Platform/Rust path already defines a suitable byte-signing primitive:
   double-SHA256 of the supplied bytes followed by secp256k1 recoverable ECDSA,
   serialized as a 65-byte compact signature with the recovery/compression byte
   first.
5. The newer SDK is the preferred foundation for the authenticator. Recreating
   BIP39, DIP-9 derivation, secp256k1 signing, or Platform discovery in app code
   would add avoidable incompatibility and secret-handling risk.

## 3. Shipping DashPay Android wallet

### 3.1 Current stack

At the inspected revision:

- the app is Kotlin;
- it pins DashJ Core `22.0.4`;
- it pins Dash Platform SDK artifacts `4.0.0`;
- it includes separate production, testnet, staging, and devnet flavors;
- it contains wallet recovery, Platform identity creation/recovery, DPNS
  registration, username lookup, and QR scanning.

Relevant source:

- [`wallet/build.gradle`](https://github.com/dashpay/dash-wallet/blob/526fe78127291649119d25dd675492fb0d450727/wallet/build.gradle)
- [`PlatformRepo.kt`](https://github.com/dashpay/dash-wallet/blob/526fe78127291649119d25dd675492fb0d450727/wallet/src/de/schildbach/wallet/ui/dashpay/PlatformRepo.kt)

### 3.2 Existing message signing

The app's `AuthenticationManager` exposes:

```kotlin
suspend fun signMessage(address: Address, message: String): String
```

`SecurityFunctions` unlocks the encrypted DashJ wallet, finds the payment key
for that address, and calls DashJ's `key.signMessage`.

Sources:

- [`AuthenticationManager.kt`](https://github.com/dashpay/dash-wallet/blob/526fe78127291649119d25dd675492fb0d450727/common/src/main/java/org/dash/wallet/common/services/AuthenticationManager.kt)
- [`SecurityFunctions.kt`](https://github.com/dashpay/dash-wallet/blob/526fe78127291649119d25dd675492fb0d450727/wallet/src/de/schildbach/wallet/security/SecurityFunctions.kt)

This proves that the wallet already has an unlock-before-signing pattern, but
the method is address-based and uses a conventional signed-message string. It
does not select a Platform identity key, bind a DPNS name, parse a relying-party
request, or expose a website callback.

### 3.3 Identity derivation in the app

The app initializes DashJ authentication keychains from the wallet seed and
recovers an identity using the first blockchain-identity key. This is useful
precedent, but the app's older DashJ keychain abstraction is not the preferred
foundation for a new authenticator now that the Platform repository contains a
unified Rust/Kotlin wallet.

### 3.4 Conclusion for the shipping wallet

Do not fork the full shipping wallet merely to add the first SIWD experiment.
It contains much more payment, exchange, merchant, analytics, and migration
surface than the authenticator needs.

Do keep an integration adapter open: if SIWD proves useful, the best eventual
user experience is likely an upstream feature in DashPay rather than asking
users to import the same phrase into a second application.

## 4. Platform Kotlin SDK and unified wallet

### 4.1 Architecture

The Platform monorepo contains:

- `packages/kotlin-sdk`: Android library and Compose example;
- `packages/rs-unified-sdk-jni`: JNI bridge;
- `packages/rs-sdk-ffi`: general SDK signer FFI;
- `packages/rs-platform-wallet`: unified wallet logic;
- `packages/rs-platform-wallet-ffi`: wallet and mnemonic-resolver FFI;
- `packages/rs-dpp`: Platform protocol and signature verification.

The Kotlin SDK targets Android API 29+ and publishes under the planned
coordinates `org.dashj:dash-sdk-android`. Its current documentation requires
the native JNI library to be packaged for the target ABI.

Source:
[Kotlin SDK README](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/kotlin-sdk/README.md)

### 4.2 Identity discovery

`IdentityRegistration.discoverIdentities` performs a mnemonic-resolver-backed,
gap-limit scan and returns discovered 32-byte identity IDs. The default gap
limit is five. `Dpns.usernames` retrieves names owned by an identity, while
`Dpns.resolve` resolves a name.

Sources:

- [`IdentityRegistration.kt`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/kotlin-sdk/sdk/src/main/kotlin/org/dashfoundation/dashsdk/identity/IdentityRegistration.kt)
- [`PlatformQueries.kt`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/kotlin-sdk/sdk/src/main/kotlin/org/dashfoundation/dashsdk/queries/PlatformQueries.kt)

This covers the authenticator's restore-time identity/name discovery without
implementing a custom Platform scanner.

### 4.3 Canonical identity key layout

The current Rust Platform wallet builds the identity authentication path:

```text
m/9'/coin'/5'/0'/0'/identity_index'/key_index'
```

where `coin'` is `5'` for mainnet and `1'` for test networks. Its canonical
new-identity layout is:

| Key index/ID | Purpose | Security level | Intended role |
| --- | --- | --- | --- |
| 0 | Authentication | Master | identity create/update |
| 1 | Authentication | Critical | token/critical operations |
| 2 | Authentication | High | general document operations |
| 3 | Transfer | Critical | credit transfer/withdrawal |
| >3 | Authentication | High | additional authentication keys |

Source:
[`identity_derive_and_persist.rs`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/rs-platform-wallet-ffi/src/identity_derive_and_persist.rs)

The SIWD default should therefore be an active, unbounded
`AUTHENTICATION/HIGH` ECDSA key, normally key ID 2 for the canonical layout.
The verifier must inspect metadata rather than assuming every historical
identity uses key ID 2.

### 4.4 Secret storage and signing

The Kotlin SDK's `WalletStorage`:

- encrypts the mnemonic using Android Keystore-backed storage;
- offers a byte-array mnemonic retrieval path to avoid an unsrubbable JVM
  `String` during programmatic use;
- stores identity private scalars encrypted under a separate
  authentication-gated Keystore alias;
- records a key fingerprint so stale ciphertext after Keystore replacement
  fails closed.

`KeystoreSigner`:

- looks up identity keys by public-key bytes;
- decrypts only for signing;
- requests a biometric/device authorization when the auth window has expired;
- calls Rust to sign;
- zeroes the Kotlin private-key buffer afterward.

Sources:

- [`WalletStorage.kt`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/kotlin-sdk/sdk/src/main/kotlin/org/dashfoundation/dashsdk/security/WalletStorage.kt)
- [`KeystoreSigner.kt`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/kotlin-sdk/sdk/src/main/kotlin/org/dashfoundation/dashsdk/security/KeystoreSigner.kt)

This is strong reusable infrastructure, but the SIWD app should not
automatically retain the mnemonic merely because the general wallet does.
After discovery and verified persistence of the selected identity
authentication key, SIWD can delete the stored phrase unless testing shows the
SDK requires it for identity loading or repair. That constrained lifecycle
needs an integration test.

## 5. Signing-format discovery

### 5.1 Platform/Rust signing primitive

At the pinned rust-dashcore revision:

```text
digest = SHA256(SHA256(canonical_bytes))
signature = secp256k1_sign_recoverable(digest, private_key)
wire = header_byte || compact_r_32 || compact_s_32
```

The result is exactly 65 bytes.

The first byte is:

```text
27 + recovery_id + 4
```

for a compressed public key, so current values are 31 through 34. The
remaining 64 bytes are the compact recoverable ECDSA signature.

`verify_data_signature` independently double-hashes the supplied bytes,
decodes the recoverable compact signature, and verifies its standard ECDSA
form against the supplied public key.

Source:
[`dash/src/signer.rs`](https://github.com/dashpay/rust-dashcore/blob/70d4bf8e36057c58e02d56769a6e9760f701dd06/dash/src/signer.rs)

### 5.2 Platform uses the same format

The Platform FFI's mnemonic-resolver signer:

- supports `ECDSA_SECP256K1` and `ECDSA_HASH160`;
- derives the requested DIP-9 path;
- can bind the derived public key or HASH160 to expected on-chain key data
  before signing;
- calls `dashcore::signer::sign`;
- returns the 65-byte signature;
- holds mnemonic, seed, and scalar in zeroizing Rust buffers.

Source:
[`sign_with_mnemonic_resolver.rs`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/rs-platform-wallet-ffi/src/sign_with_mnemonic_resolver.rs)

The Kotlin JNI path also wraps a derive-and-sign operation and returns this
65-byte shape:

- [`SignerNative.kt`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/kotlin-sdk/sdk/src/main/kotlin/org/dashfoundation/dashsdk/ffi/SignerNative.kt)
- [`rs-unified-sdk-jni/src/signer.rs`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/rs-unified-sdk-jni/src/signer.rs)

### 5.3 A similarly named function is incompatible

The JavaScript/WASM `wallet.signMessage` helper does something different:

- hashes the UTF-8 message once with SHA-256;
- emits a 64-byte non-recoverable compact ECDSA signature encoded as hex.

Source:
[`wasm-sdk/src/wallet/key_generation.rs`](https://github.com/dashpay/platform/blob/08152ea51ec46c9b653899f6793c8a392c721c79/packages/wasm-sdk/src/wallet/key_generation.rs)

SIWD must not use that helper on one side and the Platform/DPP signer on the
other. The shared protocol package should expose an explicit
`dash-platform-ecdsa-recoverable-sha256d` algorithm identifier and test vectors
to prevent accidental substitution.

### 5.4 Selected candidate

The SIWD Draft 1 candidate is:

- canonical SIWD binary bytes defined by our protocol;
- Dash Platform/rust-dashcore `signer::sign` semantics;
- 65 raw signature bytes transported as unpadded base64url;
- verification against the selected active identity authentication public key.

This is a protocol-level selection, not a production declaration. It remains
provisional until the same golden vectors pass through:

1. rust-dashcore/Platform Rust;
2. Kotlin/JNI signing;
3. the TypeScript server verifier.

## 6. Reuse plan

For the Android authenticator:

- consume the current Kotlin SDK rather than copying its Rust or crypto code;
- use identity discovery and DPNS query APIs;
- use Keystore-backed identity-key storage and biometric gating;
- add a narrow public/raw-data signing adapter if the SDK does not expose one
  outside its state-transition signer;
- never expose generic signing in the SIWD UI;
- retain only the selected high authentication key after restore where SDK
  lifecycle tests permit;
- keep a compatibility adapter so future DashPay support can use the same
  protocol request.

For the TypeScript verifier:

- do not call the incompatible WASM `signMessage` helper;
- use a secp256k1 implementation capable of decoding the 65-byte recoverable
  Dash format;
- double-SHA256 the exact canonical bytes;
- fetch the identity and key metadata through current Evo SDK queries;
- verify DPNS resolution independently.

## 7. Remaining verification work before implementation

- Produce deterministic Draft 1 canonical bytes and signatures.
- Confirm whether the Kotlin SDK artifact published for the chosen version
  contains the JNI libraries needed by the target test devices.
- Prove identity discovery and selected-key repair still work after SIWD deletes
  its stored mnemonic.
- Determine whether an existing public Kotlin method can sign arbitrary
  protocol bytes through `KeystoreSigner`; otherwise propose the smallest
  upstreamable wrapper around the existing Rust signer.
- Confirm server-side identity and DPNS proof APIs in Evo SDK 4.1.
- Sample older/restored identities for key metadata (expect HIGH present under
  DIP 11; SIWD is HIGH-only per D-010 — no CRITICAL fallback unless a survey
  finds a real gap).
- Confirm behavior for a key disabled between request issuance and response
  verification.

