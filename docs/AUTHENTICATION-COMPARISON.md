# Authentication Method Comparison

**Status:** Product and positioning analysis  
**Date:** 2026-07-29  
**Scope:** Baseline consumer implementations, not every possible hardened
variant

## 1. Executive summary

Sign in with Dash is most compelling where a website wants a user-controlled,
portable public identity without delegating authentication to a corporate
identity provider.

Its strongest potential advantages are:

- no reusable password or private key is given to the website;
- the user proves control with a short-lived, domain-bound signature;
- a human-readable Dash name can work across participating applications;
- the identity is rooted in Dash Platform rather than one website or social
  login provider;
- the website can choose whether an account follows an identity or a
  transferable name; and
- normal login is off-chain, so it has no per-login Platform fee or public
  authentication trail.

SIWD is not automatically better in every respect. Passkeys have superior
browser and operating-system integration, site-scoped privacy, mature
standards, and easier onboarding for most people. OAuth/OpenID Connect offers
very familiar onboarding and mature provider recovery. SIWD currently requires
a Dash identity, a compatible authenticator, careful recovery-key handling, and
new verifier infrastructure.

The defensible positioning is therefore not “the most secure login.” It is:

> Passwordless website authentication using an identity and name the user
> controls, without making a social-login company the identity authority.

## 2. Methods compared

### Username and password

The website verifies a reusable secret, normally stored as a salted password
hash. This comparison assumes password-only login without mandatory hardware
MFA.

### Email magic link

The website emails a short-lived link. Control of the email inbox is treated as
control of the website account.

### Password plus OTP or push MFA

SMS codes, authenticator-app TOTP codes, and push approvals are commonly added
to passwords. They can substantially reduce attacks based only on a stolen
password, but manually entered OTPs are still relayable and are not considered
phishing-resistant under NIST's definition. This document keeps the main table
readable by rating password-only login and discussing MFA as a hardened
variant. [NIST phishing-resistance guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#phish-resistant)

### OAuth/OpenID Connect social login

The website redirects the user to an identity provider such as Google, Apple,
Microsoft, or another OpenID Provider. OpenID Connect is the identity layer on
OAuth 2.0 and allows the website to rely on authentication performed by that
provider. [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0-18.html)

### Passkey/WebAuthn

The browser and authenticator create a public-key credential scoped to the
website's relying-party ID. The private key remains in the authenticator.
WebAuthn credentials are deliberately site-scoped and designed to be minimally
correlatable across relying parties. [WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)

### Generic crypto-wallet sign-in

The website asks a wallet to sign a nonce-bearing message using a blockchain
account. Sign-In with Ethereum is a mature example of this general pattern,
including domain, nonce, issuance time, and optional expiration fields.
[EIP-4361 overview](https://docs.login.xyz/general-information/siwe-overview/eip-4361)

### Sign in with Dash

The website issues a short-lived request. A Dash authenticator displays the
domain, action, account-binding policy, Dash name, network, and expiration,
then signs canonical bytes using an eligible Dash Platform identity
authentication key. The website verifies the signature plus current identity,
key, and DPNS state.

## 3. At-a-glance comparison

The ratings describe typical deployments. `Strong` does not mean invulnerable,
and a poorly implemented version of any method can be unsafe.

| Property | Password | Email magic link | OAuth/OIDC | Passkey | Generic wallet sign-in | SIWD target |
| --- | --- | --- | --- | --- | --- | --- |
| First-use ease for a typical web user | Familiar, but requires creation | Easy if email arrives promptly | Usually excellent | Excellent on supported devices | Poor to moderate outside crypto audiences | Excellent for existing Dash users; weak for new users |
| Return-login ease | Requires remembering/autofill | Requires leaving site for inbox | Usually one redirect/approval | Usually device unlock | Connect wallet and approve | Scan/open and approve |
| Reusable secret sent to website | Yes | No | No local password; bearer artifacts exist | No | No | No |
| Resistance to stolen website credential database | Moderate with strong hashing; offline guessing remains | Strong for authentication secrets | Strong locally; client secrets/tokens still matter | Strong | Strong | Strong if only public provider data is stored |
| Replay resistance | Weak by itself | Strong if single-use and short-lived | Strong when correctly implemented | Strong | Strong with nonce and expiry | Designed to be strong with nonce, expiry, and atomic consumption |
| Phishing resistance | Weak | Weak to moderate | Depends heavily on provider and flow | Strong by design | Varies by wallet UX and domain binding | Domain-bound design, but not yet independently established as phishing-resistant |
| Cross-site privacy | Can be good with unique credentials; email reuse correlates | Poor if the same email is disclosed | Provider observes or participates in logins; claims may correlate | Excellent by design | Often poor when one public address is reused | Poor in version 1 when one identity/name is reused |
| Independent of a central identity provider | Yes, but each site is isolated | No; depends on email provider | No | Protocol is decentralized by site; synced recovery may depend on an ecosystem provider | Usually yes, subject to wallet/network dependencies | Yes, subject to Dash Platform and wallet availability |
| User-controlled portable public identifier | No standard identifier | Email address is portable only within provider/domain rules | Provider-controlled subject and claims | Intentionally site-specific | Public blockchain address | Dash identity plus human-readable DPNS name |
| Formal transferable account ownership | No | No | Generally no | No | Possible if a key/account is transferred, but often unsafe and ambiguous | Explicit `name_bound` policy is planned |
| Website recovery workload | High | Low; delegated to email | Low; delegated to identity provider | Moderate; multiple passkeys and recovery policy required | Often difficult | Policy-dependent; self-custody shifts responsibility toward user/wallet |
| Website integration maturity | Very high | Very high | Very high | High and increasing | Ecosystem-specific | Experimental |
| Native spam/Sybil prevention | Weak | Weak to moderate | Moderate provider-assisted friction | Weak | Weak to moderate economic friction | Economic/name-registration friction plus persistent principal reputation |
| Works without email or legal identity | Yes | No | Provider-dependent | Yes | Yes | Yes |

## 4. Security analysis

### Passwords

Passwords are familiar and universally deployable, but the same authenticator
output is reused. NIST explicitly distinguishes them from replay-resistant
authentication. A database breach can expose hashes to offline guessing, and
users frequently face phishing, reuse, reset, and credential-stuffing risks.
[NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)

Password managers, strong hashing, breached-password screening, rate limiting,
and MFA can greatly improve password deployments. Those controls also increase
implementation and support work.

### Email magic links

Magic links remove passwords from the relying website and can be pleasant for
infrequent login. Security is inherited from the email account, mail delivery
path, device previews, forwarded messages, and link handling. Inbox compromise
usually compromises every website that uses that inbox for login or recovery.
Delivery delay and spam filtering can also disrupt login.

### OAuth/OpenID Connect

OIDC provides mature federation, familiar consent screens, and delegated
account recovery. The tradeoff is dependence on the identity provider's
availability, policies, recovery decisions, and account suspension. The
provider can generally observe the relying-party relationship.

OAuth is not unsafe by definition, but secure deployments require careful
redirect validation, authorization-code protection, PKCE, issuer validation,
token protection, and other controls. The IETF's current OAuth security best
practice documents numerous implementation attack classes and deprecates older
unsafe patterns. [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)

### Passkeys

Passkeys are SIWD's strongest security and usability benchmark. WebAuthn binds
credentials to a relying-party identifier, keeps private keys out of the
website, requires user consent, resists replay, and prevents the same credential
from being exercised for another site. NIST recognizes properly implemented
syncable authenticators as phishing-resistant and highlights their recovery
and cross-device usability benefits.
[NIST syncable-authenticator guidance](https://pages.nist.gov/800-63-4/sp800-63b/syncable/)

Their intentional site scoping is simultaneously a privacy strength and a
limit: a passkey proves control of a credential created for one site; it is not
a portable public identity or name shared among independent applications.
Credential synchronization and recovery may also depend on an operating-system
or password-manager ecosystem, although WebAuthn itself does not require one
central identity provider.

### Generic wallet signatures

Wallet signatures avoid website passwords and provide a portable blockchain
identifier, but security varies widely with message formats and wallet
presentation. Users may be trained to approve opaque messages, signatures may
be reusable or insufficiently domain-bound, and the same public address can
make cross-site activity easy to correlate. Wallet keys may also control
valuable assets, increasing the consequence of malicious signing or wallet
compromise.

### SIWD

SIWD narrows the wallet-signature pattern:

- only a defined authentication message can be signed;
- the authenticator displays and signs the relying-party origin and action;
- requests are short-lived and single-use;
- the selected Dash identity, DPNS name, key ID, network, and binding policy
  are signed;
- the website verifies current key and name state through Dash Platform; and
- the SIWD handler exposes no payment, withdrawal, state-transition, or
  arbitrary-signing interface.

This is a security design target, not a completed assurance claim. Draft 1
encoding, conformance vectors, implementation, adversarial testing, and
independent review are still required. In particular, QR forwarding and user
confusion need explicit testing; displaying a domain does not by itself satisfy
the strongest definition of phishing resistance. SIWD trusts successfully
retrieved DAPI/SDK Platform state (including names); if that state cannot be
retrieved, login fails. SIWD does not query every DAPI node on every login.

### How phishing or forwarding could work

SIWD already blocks the simplest credential-harvesting attack:

1. A fake `examp1e.com` site creates its own request.
2. The authenticator signs `examp1e.com`, not `example.com`.
3. The signature cannot be replayed at `example.com`.

The harder attack uses a real request:

1. An attacker opens `example.com` in the attacker's browser and starts a
   legitimate SIWD login.
2. The attacker forwards that real QR to the victim, perhaps embedding it in a
   convincing fake page or message.
3. The victim's authenticator correctly connects to and displays
   `example.com`.
4. If the victim approves, the signature is valid for `example.com`.
5. The attacker's browser holds the original browser-binding cookie and
   receives the session.

Nothing was decrypted or forged; the victim was induced to authorize the
attacker's real browser. A browser-binding cookie prevents a stolen request URL
or phone response from independently becoming a session bearer, but it does
not stop this attacker-originated ceremony.

A two-minute timeout still provides substantial operational protection. It
prevents stockpiling and delayed reuse, limits accidental exposure, and forces
the attacker to coordinate with a victim immediately. It is not foolproof:
automated delivery and approval can complete well within two minutes. Timeout
is therefore an important replay and exposure control, not a complete live
relay defense.

NIST distinguishes phishing resistance that depends on cryptographic verifier
name or channel binding from defenses that depend on the user's vigilance.
[NIST authenticator guidance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)

### Ways SIWD can improve phishing resistance

1. **Offer authenticator-initiated login (planned extension).** The user
   selects a known site in the authenticator, which opens a verified site URL
   and starts the ceremony from the trusted app rather than from an untrusted
   QR. Especially suitable for same-device use.
2. **Bind high-risk actions, not only login.** A site can require a fresh SIWD
   signature describing a specific action such as changing recovery,
   transferring ownership, or creating an API credential. A stolen login
   session then cannot silently perform those operations.
3. **Make approval highly specific.** Always show the verified domain,
   `register`/`login`/`link` action, requested account, and binding policy
   using canned templates and confusable-safe fonts. This reduces confusion but
   is not, by itself, cryptographic phishing resistance.
4. **Notify and expose session history.** Record new sessions and controller
   changes, notify existing trusted endpoints where possible, and give users a
   fast way to revoke them.
5. **Optional future proximity (not MVP).** Encrypted browser-to-authenticator
   channels with BLE or similar can approach FIDO-style proximity proofs, but
   they fail for legitimate offline-radio cases (for example airplane mode) and
   are too heavy as a default requirement.
   [FIDO cross-device authentication](https://fidoalliance.org/passkeys/)

**Not used:** browser/phone confirmation codes. They add friction and do not
stop an active attacker who already controls a real login page and can relay
the same value.

For the cross-device MVP, residual QR-forwarding risk is accepted and described
plainly. Short TTL, browser binding, initiation warnings, and session
revoke/history are the shipped controls. Do not label the flow
phishing-resistant.

Authenticator-initiated login and session history/notifications are useful
early follow-ups and need not block the first identity-bound demonstration.

## 5. Identity control and decentralization

“Decentralized” has multiple meanings, so marketing should state precisely what
is decentralized.

| Question | Password/passkey | Email magic link | OAuth/OIDC | SIWD |
| --- | --- | --- | --- | --- |
| Who authenticates the user? | The individual website | Email provider plus website | Identity provider | Website verifies against Dash Platform state |
| Can one company suspend the shared identity everywhere? | No shared identity exists | Email provider can disable inbox access | Identity provider can disable its account | No social-login company controls the Dash identity; network and wallet availability still matter |
| Is the identifier shared across sites? | Normally no | Usually the email address | Provider subject/claims | Yes, if the user chooses the same identity/name |
| Who holds the authentication secret? | User/authenticator; password verifier also stores a derived secret | Email account infrastructure | Identity provider | User's wallet/authenticator |
| Can the website verify without trusting a corporate IdP assertion? | Yes | No | No | Intended yes, using Platform state and proofs |

SIWD does not eliminate trust. Users still trust authenticator software and
device security; websites depend on correct Dash Platform data and SDK proof
verification; the network has protocol governance and availability risks.
“User-controlled” is more accurate than “trustless.”

Dash Platform identities are public-key collections recorded on the Platform
chain, and their registered keys can be updated or disabled. DPNS associates
human-readable names with those identities.
[Dash identity reference](https://docs.dash.org/projects/platform/en/stable/docs/protocol-ref/identity.html),
[DPNS overview](https://docs.dash.org/projects/platform/en/stable/docs/explanations/dpns.html)

## 6. Privacy and correlation

SIWD version 1 intentionally discloses a stable identity ID and DPNS name. That
is useful for continuity and public reputation but enables participating sites
or data brokers to correlate the principal if the same identity is reused.

A website can assign a completely separate local handle and use it for every
public post, profile, and URL. This prevents casual observers and public-content
indexers from connecting that handle to the Dash name, assuming the site does
not expose the mapping. It does **not** prevent relying-party correlation:

- the site still learns the Dash identity ID and DPNS name while authenticating;
- two cooperating sites can compare those stable values; and
- a breach, log leak, subpoena, analytics integration, or deliberate disclosure
  may reveal the private mapping.

This is still a useful privacy mode and is easy for websites to implement. It
should be described as **site-local public pseudonymity**, not cross-site
unlinkability.

By comparison:

- passkeys use different, site-scoped credentials and are specifically designed
  to prevent relying parties from correlating authenticator credentials;
- passwords can be non-correlatable when users choose independent usernames
  and aliases, but email reuse often defeats that;
- magic links disclose an email address;
- OIDC exposes provider-defined identifiers and places the provider in the
  login path; and
- public wallet addresses are typically correlatable when reused.

Users who want one recognizable identity for professional reputation,
marketing, community participation, or authorship can deliberately reuse their
Dash name. Users who prioritize unlinkability can use separate Dash identities
or names per context, at the cost of extra registration and management.

Possible future protocol improvements include automatically managed
site-specific identities, pairwise pseudonymous identifiers backed by private
proofs, or a zero-knowledge proof that establishes an eligible Dash identity
without revealing the same identifier to every site. Contract-bounded keys
alone improve authorization scope but do not necessarily prevent correlation
if the parent identity ID remains visible. These are not MVP claims.

## 7. Spam, bots, and Sybil resistance

Authentication answers “does this requester control this account?” It does not
normally answer “is this one real human?” That is intentional for SIWD:
authenticated principals may be people, organizations, services, or autonomous
AI agents. Passwords, magic links, passkeys, OAuth accounts, wallet addresses,
and Dash identities can all be created or controlled in multiples.

SIWD provides some friction:

- creating a Dash Platform identity has a network fee;
- registering a DPNS name consumes Platform resources and fees; and
- premium names require a 0.2 DASH request fee and a two-week contested-name
  process.

Dash documents identity-creation fees and the payment required to store keys
on Platform. [Dash identity costs](https://docs.dash.org/projects/platform/en/stable/docs/protocol-ref/identity.html)
The premium-name rules apply only to contested names.
[DPNS conflict resolution](https://docs.dash.org/projects/platform/en/stable/docs/explanations/dpns.html)

This friction can be a useful component of spam prevention:

- disposable identities are not completely free;
- persistent names and history let a site build principal-specific reputation;
  and
- repeated enforcement can make replacement cost and setup effort accumulate.

The friction remains deliberately modest. One identity can act across many
sites, one operator can control multiple identities, and an established
identity is not proof of good behavior. Sites should pair it with rate limits,
reputation, content moderation, abuse detection, and application-specific
controls. Those systems are outside SIWD's authentication scope.

The safe marketing claim is:

> Dash identity and name registration give account creation a real, if small,
> cost and support persistent reputation. SIWD supplies that useful baseline
> friction while leaving application-specific abuse controls to each site.

No proof-of-personhood disclaimer is needed as an apology: supporting
non-human principals, including autonomous agents, is an intended capability.
The disclaimer remains important only to prevent a site from mistaking account
control for a claim about humanity.

The current authenticator design requires explicit approval for each signature.
That supports human-operated agents immediately, but a truly unattended agent
needs a future delegated signer mode with site- or contract-bounded keys,
limited actions, expiration, and rate limits. Giving an autonomous process the
wallet's general identity key would violate SIWD's narrow-signing design.

## 8. Recovery and loss

| Method | Typical recovery authority | Principal failure mode |
| --- | --- | --- |
| Password | Website, usually through email or support | Reset-channel takeover or support burden |
| Magic link | Email provider | Inbox loss or compromise |
| OAuth/OIDC | Identity provider | Provider suspension, recovery failure, or policy change |
| Passkey | Additional authenticators, sync provider, recovery process | Loss of all authenticators or ecosystem account |
| Generic wallet | Recovery phrase, hardware backup, or custodial wallet | Permanent key loss or asset-bearing key compromise |
| SIWD | Dash wallet recovery and website policy | Phrase/key loss, identity-key compromise, or unsafe account recovery overriding cryptographic ownership |

Self-custody gives the user more authority but also more responsibility. SIWD's
recovery phrase may control payment and broader identity capabilities, so the
authenticator must be treated as wallet-grade software. A recovery mechanism
that lets website support casually override SIWD ownership would weaken its
main value proposition.

Mnemonic recovery is also a significant usability and portability advantage.
If identity keys follow a documented deterministic derivation scheme, losing
every phone and computer does not have to mean losing the identity: a user can
restore the phrase in a conforming wallet, rediscover the Platform identity and
names, and resume signing.

The phrase does not literally back up everything. It does not reconstruct
website content, a site's private handle mapping, local account settings, or
keys that were created outside the deterministic scheme. Recovery also depends
on preserving any optional mnemonic passphrase and on compatible discovery
software. Because the same phrase may recover money, users have unusually
strong incentive to store it safely—but compromise also has unusually broad
consequences.

`name_bound` accounts add a different recovery and transfer option: once Dash
supports name transfer, ownership can intentionally follow the current name
controller. This is suitable for brands, organizations, publications, and
transferable digital property. It is generally inappropriate for personal
records or obligations that must remain tied to one identity.

## 9. Website-owner considerations

### Reasons a site might choose SIWD

- It serves an existing Dash community.
- It wants accounts that do not require email addresses.
- It wants a portable, human-readable public identity.
- It does not want Google, Apple, or another IdP to be the account authority.
- It wants users to prove current control without storing password verifiers.
- It wants organization, brand, or asset accounts whose rights can explicitly
  follow a transferred DPNS name.
- It can use one Dash identity across several cooperating applications.

### Reasons a site might prefer passkeys

- Its audience is the general public rather than existing Dash users.
- It wants the strongest mature browser-native phishing resistance.
- It prioritizes cross-site unlinkability.
- It does not need a shared public identity or transferable name.
- It wants mature platform libraries and broad device support today.

### Reasons to offer more than one method

SIWD should normally be an additional provider, not the only recovery path,
until deployment experience is mature. A site can offer:

- passkeys for private, site-scoped mainstream login;
- SIWD for portable Dash identity and name-based ownership;
- OIDC for users who prefer delegated corporate recovery; and
- carefully governed linking so no weaker provider silently overrides a
  stronger ownership policy.

Adding methods increases account-linking and recovery complexity. The site must
state which method is authoritative and what happens if linked methods
disagree.

## 10. Marketing-ready claims

These claims are supportable by the current design, although implementation
and security claims remain conditional until tested:

- **Your Dash identity, usable beyond one website.**
- **Passwordless login without sending a private key or recovery phrase to the
  site.**
- **No social-login company sits between the user and the website.**
- **A readable Dash name backed by current Platform identity and key state.**
- **Choose identity continuity or ownership that follows a transferable
  name.**
- **Off-chain authentication: no fee and no public Platform login event for
  each sign-in.**
- **Open protocol and verifier components intended for independent
  implementation.**
- **One authentication model for people, organizations, services, and
  autonomous agents.**

### Claims to avoid

Do not claim that SIWD:

- proves a legal identity, unique human, age, reputation, or good standing;
- eliminates phishing, spam, bots, account theft, or recovery risk;
- is safer than passkeys in all circumstances;
- is anonymous or unlinkable across websites;
- makes the website or authentication process fully trustless;
- currently supports production mainnet use or DPNS name transfer; or
- has completed independent security review.

## 11. Suggested positioning

### Short description

> Sign in with Dash lets people use a Dash Platform identity and readable Dash
> name to access websites without a password or corporate social-login
> provider.

### Expanded description

> The user approves a short-lived request in a Dash authenticator. The website
> verifies a domain-bound signature and current Dash Platform identity state,
> while the private key remains with the user. Websites can keep accounts tied
> to a stable identity or, where appropriate, let account ownership follow a
> transferable Dash name.

### Competitive position

> Passkeys are excellent private credentials for one website. Sign in with Dash
> explores a complementary use case: a user-controlled public identity and
> name that can carry continuity—or explicitly transferable ownership—across
> participating applications.

That comparison recognizes passkeys' strengths while clearly identifying
SIWD's distinctive purpose.
