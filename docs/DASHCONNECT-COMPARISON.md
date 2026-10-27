# SIWD and App Connect

**Revisited October 27, 2026.** SIWD remains the default login. Platform 5's
App Connect is an optional future integration, with no implementation or
automatic migration in this change.

| Aspect | SIWD today | App Connect candidate |
| --- | --- | --- |
| Approval | Sign a domain-bound, expiring, single-use login challenge | Wallet approves delegated app capabilities |
| Key custody | Authenticator retains its SIWD signing key | App receives limited keys through encrypted exchange |
| Platform operations | Read identity/DPNS data; no login state transition | Registration of limited identity keys and contract documents |
| Scope | Authentication using an active, unbounded HIGH ECDSA key | Contract scope, budgets, expiry, and delegated operations |
| Status here | Default and tested locally | Deferred; separate design and security review |

The [official Platform 5 overview](https://www.dash.org/blog/dash-platform-5/#keys-and-login)
describes App Connect as a system-contract flow for wallet-approved, encrypted
delivery of limited app keys. This is distinct from SIWD's off-chain challenge
protocol. The overview's Bluetooth pairing example is not a requirement for
SIWD; no pairing codes or BLE requirement are added.

Any later opt-in adapter needs a threat-model update covering delegated-key
custody, origin binding, capability scope, revocation, expiry/budget enforcement,
on-chain costs and privacy, plus published SDK/wallet interoperability tests.
Do not feed bounded or usage-limited keys into the current SIWD verifier, or
silently switch existing accounts to a new authentication mechanism.

See [Platform 5 preparation and Android blocker](PLATFORM-5.md) and
[decision D-033](DECISIONS.md#d-033--platform-5-preparation-with-siwd-as-default).
