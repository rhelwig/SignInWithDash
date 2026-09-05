# Testnet import diagnostic — 2026-09-05

The operator reported that the signed testnet app could not discover their
identity after entering recovery details. Retained SIWD-only logs showed
successful quorum initialization followed by no matches for derived keys at
identity indexes 0–5. No recovery input or private app storage was read.

A public-only probe in the separate `org.siwd.authenticator.testnet.securityaudit`
package used the same OnDevicePlatform code and Android SDK as the release.
At 08:13 EDT, all of these succeeded for `ronhelwig4test`:

- Name document lookup and extraction of its identity record.
- Identity fetch; key 1 is enabled AUTHENTICATION/HIGH with 33-byte public data.
- Automatic lookup using the on-chain public-key hashes of keys 0 and 1;
  both returned the expected identity.

The server independently resolved the same public name on testnet. These
checks rule out a persistent failure of those public lookup paths at test time.
They do not prove the user's entered recovery details derive the matching
keys. Wallet provenance, optional BIP-39 passphrase use and derivation
compatibility remain to be established without sharing recovery secrets.
No release code or installed release app was changed during this diagnostic.

The debug-only public probe accepts `--es publicName ronhelwig4test` on
DebugSelfTestActivity and refuses this mode outside the isolated testnet audit
package. It reports public field types and lookup success, never key secrets.


## Recovery search correction (version code 3)

The old matching loop derived only the path whose key index equaled the
on-chain key ID, even after an identity was found. The corrected matcher
compares eligible public keys against derivation slots independently of IDs.
Name-assisted recovery checks identity positions 0–19 and key positions 0–31
locally, with no expansion of public-hash queries. BIP-39 passphrase Unicode
normalization was corrected as well. Neither change establishes that this
was the cause of the operator's failed import; an on-device retry is required.

Four regression tests passed using independent Python HMAC/BIP32 and
cryptography public fixtures; all 12 protocol tests and both release builds
passed. The testnet release was updated in place on the phone, preserving app
data. The mainnet version-3 artifact was built but not installed during this
troubleshooting step. No phrase or private key was requested or retrieved.

Reference path: [DIP-13](https://github.com/dashpay/dips/blob/master/dip-0013.md).
The default path was checked against the official Platform
[identity-key derivation](https://github.com/dashpay/platform/blob/master/packages/rs-platform-wallet-ffi/src/identity_keys_from_mnemonic.rs)
and [Evo Tool wallet](https://github.com/dashpay/dash-evo-tool/blob/master/src/model/wallet/mod.rs)
implementations. No speculative alternative wallet paths were added.


## Resolution and final packaging

The operator found a different saved recovery phrase and reported successful
recovery with it. The tested version-3 search improvements are retained.
The unfinished follow-up that checked non-login/master keys was removed from
production code and its unused helper/test removed. The incomplete debug
`derivationOnly` experiment was removed as well. Existing isolated synthetic
key-storage and public-network diagnostics remain debug-only.

Both 0.1.1 releases (version code 4) were rebuilt for the operator's acceptance
tests. Their verified website-link declarations are flavor-specific. App data
is preserved by in-place updates with the same package IDs and release key.
No commit is authorized until the operator finishes testing both networks.
