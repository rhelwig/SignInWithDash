# Contributing

SignInWithDash welcomes research, protocol review, threat analysis,
documentation, test vectors, integrations, and implementation contributions.

## Licensing and ownership

Contributions are accepted under the repository's [MIT License](LICENSE).
Contributors retain copyright in their work. The project does not require
copyright assignment or grant any person or organization an exclusive license.

By submitting a contribution, you represent that you have the right to provide
it under the MIT License.

## Security-sensitive changes

Authentication and wallet integrations can put identities and funds at risk.
Changes to canonical encoding, signatures, key selection, secret handling,
account binding, recovery, or authorization should include:

- a clear threat and compatibility analysis;
- positive and negative tests or test vectors where applicable;
- no real recovery phrases, private keys, credentials, or mainnet secrets; and
- corresponding updates to the protocol, security model, and architecture
  decisions.

Please do not report an exploitable vulnerability in a public issue. A private
reporting channel will be established before distributing a test APK beyond
the immediate development group.

## Commits

Prefer focused changes and conventional-commit messages such as `feat: ...`,
`fix: ...`, `docs: ...`, and `refactor: ...`.
