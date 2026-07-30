# Authentication and Message Flows

**Status:** Initial flow model  
**Protocol status:** Illustrative until Draft 1 fixes endpoint names and binary
encoding

This document shows how the browser, relying website, authenticator, and Dash
Platform communicate. It is the quickest introduction to the SIWD protocol.
The normative field definitions and verification rules remain in
[`PROTOCOL.md`](PROTOCOL.md).

## 1. Participants and trust boundaries

```mermaid
flowchart LR
    U[User]

    subgraph BrowserDevice["Browser device"]
        B[Web browser]
        BC["Browser-binding cookie<br/>and request page"]
        B --- BC
    end

    subgraph Phone["Phone security boundary"]
        A[SIWD authenticator]
        K["Protected identity key<br/>Android Keystore / wallet"]
        A --- K
    end

    subgraph RelyingParty["Relying website"]
        W[Web server]
        C["Challenge and account store"]
        W --- C
    end

    P["Dash Platform<br/>identity, keys, and DPNS state"]

    U -->|starts login| B
    B -->|"1. HTTPS: create request"| W
    W -->|"2. HTML + QR/request URL"| B
    A -->|"3. HTTPS: fetch request"| W
    A <-->|"4. query identity/name state"| P
    U -->|"5. review and approve"| A
    A -->|"6. HTTPS: signed response"| W
    W <-->|"7. independently verify state"| P
    B <-->|"8. poll status / finish"| W
```

The browser and authenticator do not need a direct connection. The website
relays the request and response status, but it never receives the private key.
The QR contains a short-lived HTTPS capability URL, not a signature, recovery
phrase, or browser session cookie.

## 2. Cross-device login sequence

This is the primary desktop-browser plus phone flow. Registration and account
linking use the same transport with a different signed `action`.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant Server as Relying web server
    participant Auth as SIWD authenticator
    participant Platform as Dash Platform

    User->>Browser: Select "Sign in with Dash"
    Browser->>Server: POST create authentication request
    Server->>Server: Generate request ID and random nonce
    Server->>Server: Store pending request and<br/>retain nonce only for its lifetime
    Server-->>Browser: Login page, QR/request URL,<br/>browser-binding cookie

    Note over Browser,Server: Browser may poll while the phone flow proceeds.<br/>The QR does not contain the binding cookie.

    User->>Auth: Scan QR
    Auth->>Server: GET authentication request<br/>using short-lived capability URL
    Server-->>Auth: Structured request:<br/>origin, action, policy, nonce, expiry
    Auth->>Auth: Validate schema, HTTPS origin,<br/>response URI, network, and expiry
    Auth->>Platform: Retrieve selected identity,<br/>active key, and DPNS relationship
    Platform-->>Auth: Current identity/name state
    Auth-->>User: Show domain, action, binding policy,<br/>Dash name, network, and expiry

    alt User rejects
        User->>Auth: Reject
        Auth->>Server: POST rejection
        Server->>Server: Mark request rejected
        Browser->>Server: GET request status
        Server-->>Browser: rejected
    else User approves
        User->>Auth: Approve with device authentication
        Auth->>Auth: Construct canonical message<br/>and sign with identity key
        Auth->>Server: POST signed authentication response
        Server->>Platform: Retrieve current identity key<br/>and DPNS resolution
        Platform-->>Server: Verifiable current state
        Server->>Server: Verify request fields, signature,<br/>key eligibility, name, and policy
        Server->>Server: Atomically approve request<br/>and bind the local account
        Server-->>Auth: Response accepted
        Browser->>Server: GET request status
        Server-->>Browser: approved + one-time finish permission
        Browser->>Server: POST finish using binding cookie
        Server->>Server: Consume request and rotate session ID
        Server-->>Browser: Secure authenticated session cookie
        Browser-->>User: Signed-in page
    end
```

### Why the browser-binding cookie matters

The phone's signed response approves a request but does not receive the
browser's web session. Only the browser that created the request and retained
the separate binding cookie can finish the login. This prevents possession of
the request URL or phone response alone from yielding a browser session.

Browser binding alone does **not** stop an attacker who creates a request in the
attacker's browser and persuades a victim to approve that QR, because the
attacker holds the correct cookie. The user must still confirm the real domain
and intended action. Draft 1 must add and test a stronger QR-forwarding defense,
such as a browser/phone confirmation value or another ceremony that binds the
approval to the user's browser.

## 3. Message inventory

Endpoint names are illustrative. Draft 1 may change the paths, but not the
separation of responsibilities.

| Message | Sender → receiver | Important contents | Authentication or protection |
| --- | --- | --- | --- |
| Create request | Browser → server | Action and site-selected binding policy | HTTPS, CSRF protection where applicable |
| Request page | Server → browser | QR capability URL, expiry, request status UI | HTTPS plus browser-binding cookie |
| Fetch request | Authenticator → server | High-entropy request capability | HTTPS, short lifetime, rate limiting |
| Authentication request | Server → authenticator | Request ID, nonce, origin, action, binding policy, timestamps, response URI, requested claims | Capability URL plus strict app validation |
| Platform lookup | Authenticator → Platform | Identity/name/key queries | Prefer SDK-verified proofs |
| Signed response | Authenticator → server | Request ID, policy, identity ID, DPNS name, key ID, algorithm, signature | Domain-bound canonical signature |
| Verification lookup | Server → Platform | Current identity keys, disabled state, and DPNS resolution | Prefer SDK-verified proofs |
| Status check | Browser → server | Request ID or server-side browser state | Browser-binding cookie; uniform status responses |
| Finish login | Browser → server | One-time approved request | Binding cookie, atomic consumption, session rotation |
| Session response | Server → browser | Local website session | Secure, HTTP-only, same-site cookie |

No message contains a recovery phrase or private key. Normal authentication
does not submit a Dash Platform state transition and does not consume Platform
credits.

## 4. What is signed

The authenticator signs the security-relevant request and response values, not
arbitrary website text and not the JSON serialization itself.

```mermaid
flowchart TB
    R["Stored server request<br/>version, network, origin, action,<br/>binding policy, request ID, nonce,<br/>issued time, expiry"]
    I["Authenticator selection<br/>identity ID, normalized DPNS name,<br/>eligible key ID"]
    E["Canonical binary encoder"]
    H["SHA-256 twice"]
    S["Recoverable secp256k1 signature"]
    V["Server reconstructs identical bytes<br/>and verifies against current Platform key"]

    R --> E
    I --> E
    E --> H
    H --> S
    S --> V
    R --> V
    I --> V
```

Changing the origin, action, binding policy, request ID, nonce, expiry,
identity, name, or key ID causes signature verification or request comparison
to fail.

## 5. Same-device flow

On a phone, the browser opens the same HTTPS request URL as a verified
application link. The cryptographic request and response do not change.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Mobile browser
    participant Server as Relying web server
    participant Auth as SIWD authenticator
    participant Platform as Dash Platform

    User->>Browser: Select "Sign in with Dash"
    Browser->>Server: Create request
    Server-->>Browser: Request URL + browser-binding cookie
    Browser->>Auth: Open verified app link
    Auth->>Server: Fetch structured request
    Auth->>Platform: Retrieve identity/name/key state
    Platform-->>Auth: Current state
    Auth-->>User: Trusted approval screen
    User->>Auth: Approve
    Auth->>Server: Signed response
    Server->>Platform: Independently verify current state
    Platform-->>Server: Verifiable state
    Server-->>Auth: Accepted + return URL
    Auth->>Browser: Return to original website
    Browser->>Server: Finish using browser-binding cookie
    Server-->>Browser: Authenticated session
```

The return URL is navigation, not proof of authentication. The server accepts
only the signed response, and the browser still needs its original binding
cookie to receive a session.

## 6. Account-binding policy branch

The wire exchange proves the same relationship under both policies. The
website's stored policy determines which local provider record is selected.

```mermaid
flowchart TD
    A["Valid signed response<br/>identity I, name N, policy P"]
    B{"Does P match the<br/>stored request?"}
    X[Reject]
    C{"Binding policy"}
    D["identity_bound<br/>lookup by network + identity I"]
    E["name_bound<br/>lookup by network + normalized name N"]
    F{"Does N currently<br/>resolve to I?"}
    G["Ordinary registration or login"]
    H{"Is I different from the<br/>stored current controller?"}
    J["Ordinary name-bound login"]
    K["Atomic ownership transfer:<br/>rebind controller and rights;<br/>revoke old access;<br/>record audit history"]

    A --> B
    B -->|No| X
    B -->|Yes| C
    C -->|identity_bound| D
    C -->|name_bound| E
    D --> F
    E --> F
    F -->|No| X
    F -->|Yes, identity_bound| G
    F -->|Yes, name_bound| H
    H -->|No| J
    H -->|Yes| K
```

For `identity_bound`, a transferred preferred name does not transfer the local
account. For `name_bound`, the current owner of the name controls the local
account and its transferable rights.

## 7. Name-bound ownership transfer sequence

The current controller may change on Dash Platform before either party visits
the website. A name-bound site therefore revalidates control during login and
before sensitive actions, and may additionally monitor for changes.

```mermaid
sequenceDiagram
    autonumber
    actor Seller
    participant Platform as Dash Platform
    actor Buyer
    participant Auth as Buyer's authenticator
    participant Server as Relying web server
    participant Sessions as Session / credential store

    Seller->>Platform: Transfer DPNS name N to buyer identity I2
    Platform->>Platform: Finalize N → I2
    Note over Server,Platform: Server may learn through login,<br/>periodic checks, or future events.

    Buyer->>Auth: Approve login for name N
    Auth->>Server: Signed response from I2 for N<br/>with policy name_bound
    Server->>Platform: Resolve N and retrieve I2 key
    Platform-->>Server: Finalized N → I2 and active key
    Server->>Server: Verify signature and policy
    Server->>Sessions: In one transaction:<br/>revoke seller sessions and recovery,<br/>rotate API credentials,<br/>move account rights to I2,<br/>and append transfer audit record
    Sessions-->>Server: Ownership rebind committed
    Server-->>Buyer: New authenticated session
```

If revocation or ownership rebinding cannot complete, the transfer login fails
closed and no buyer session is issued. Historical records retain the identity
that performed each past action rather than being rewritten as actions by the
buyer.

## 8. Failure behavior

At every failure point, the server creates no session and performs no partial
account transfer:

- an expired, cancelled, rejected, approved, or consumed request cannot return
  to `pending`;
- malformed or mismatched fields fail before signature acceptance;
- an unknown, disabled, incorrectly scoped, or disallowed key is rejected;
- a name that does not currently resolve to the signing identity is rejected;
- a response with the wrong binding policy is rejected;
- a browser without the original binding cookie cannot finish an approved
  login; and
- a name-bound controller change is committed together with all required
  revocations or not committed at all.
