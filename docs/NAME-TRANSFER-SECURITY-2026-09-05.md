# Name transfer security — 2026-09-05

Status: investigation and proposed design; F10 remains open. The operator
explicitly wants name transfers supported. We have not pinned ownership to a
permanent identity or performed an on-chain transfer during this work.

## What a transfer should mean

DPNS ownership and a website account are separate records. Moving a name on
Dash does not automatically remove the former owner's browser sessions,
passwords, passkeys, or website permissions. F10 concerns that incomplete
handover, not a prohibition on transferring names.

Current [Dash DPNS documentation](https://docs.dash.org/projects/platform/en/stable/docs/explanations/dpns.html)
describes transfer/purchase support from protocol 13, introduced in Platform
4.1. After a transfer, name resolution follows the new owner. Network protocol
activation and actual SDK behavior still need a testnet transfer experiment.
The installed Evo SDK 4.1 delegates `resolveName` to WASM `dpnsResolveName`;
we have not verified its result against a newly transferred name.

## Proposed website behavior

For an explicitly **name-bound** account, the account and its permissions
follow the name. For **identity-bound** accounts (Latitude's current signed
policy), changing a name alone must not silently transfer the account. These
policies must be described accurately in the approval screen and account UI.
The operator can instead choose that only a site-owner role follows a name;
that is a different policy and should not accidentally transfer private user
data to a purchaser.

A safe name-bound handover needs all of the following:

1. Resolve the normalized name on the configured network with verified
   Platform reads. Preserve proof/version information sufficient to reject a
   stale result and compare Base58 identity IDs exactly.
2. Require the new owner's valid SIWD signature. A completed on-chain transfer
   should not depend on another signature from the former owner.
3. In one database transaction, update the account's controller, increment an
   ownership generation, revoke every former session, controller grant,
   unfinished SIWD request, recovery method, password, and passkey, and record
   an audit event. Pending ceremonies must match the current generation.
4. Detect changed ownership for old sessions before privileged operations,
   including when the new owner has never visited the website. Define a
   bounded cache for ordinary reads; sensitive authorization should use fresh
   ownership information and fail closed during a Platform outage.
5. Handle account collisions deliberately: a buyer who already has an account
   must not trigger an automatic account merge or inherit unrelated data.
6. Display what follows the name before enabling the policy. Preserve account
   history without presenting the former owner's actions as the buyer's.

## Required investigation and tests

Use two generated, funded testnet identities and a disposable name; no
mainnet keys or transfers. Confirm active protocol support, transfer the name
using an existing wallet/SDK tool, and verify name resolution and proof
freshness through the same SDK path the server uses. This task does not add
transaction signing to the SIWD authenticator.

Then test old/new sessions, passwords and passkeys, transfers before/after QR
approval, concurrent finishes, transfer back, stale responses, outages, name
normalization, existing-account collisions, and owner-only actions. Decide
whether account data or only administrative authority follows a name before
implementing the database migration.

The current security fixes tighten explicit Latitude controller replacement
and revoke old credentials, but do not implement this automatic DPNS handover.
