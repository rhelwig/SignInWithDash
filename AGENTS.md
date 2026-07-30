# AGENTS.md

## Project intent

Sign in with Dash is a testnet-first reference implementation for passwordless
website authentication using Dash Platform identities and DPNS names.

## Safety

- Treat recovery phrases and derived private keys as secrets capable of causing
  serious loss or identity compromise.
- Never place a real recovery phrase, private key, WIF, production credential,
  or unredacted secret in source, fixtures, logs, screenshots, issue text, or
  documentation.
- Use generated testnet-only phrases and identities for development.
- Do not add payment, transfer, withdrawal, identity-update, or arbitrary
  message-signing features without updating the threat model first.
- The authenticator must show the relying-party domain, requested action, Dash
  name, and expiration before asking for approval.
- Authentication requests must be domain-bound, short-lived, single-use, and
  rejected closed when validation is incomplete.

## Development

- Keep protocol types and test vectors independent from the demo website and
  Android UI.
- Prefer current Dash Platform primary sources and pinned dependencies.
- Do not infer production support from an experiment or old pre-mainnet sample.
- Keep testnet and mainnet visibly distinct. Mainnet remains disabled until a
  dedicated security review.
- Use `rg` for local search.
- Do not create git commits without the user's permission.

## Documentation

- Keep `README.md` and `AGENTS.md` in the project root.
- Put specifications, research, plans, and other documentation in `docs/`.
- Update `docs/DECISIONS.md` when an architectural or protocol decision is made.

