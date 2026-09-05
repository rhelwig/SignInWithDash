# Authenticator download

Serve `siwd-authenticator-testnet-release.apk` here. Build both release flavors
and run `tools/sign-authenticator-release.sh` from the project root, then copy
the signed testnet artifact from `app/build/outputs/signed/` with mode 0644.
Never publish a debug APK or the release signing key. APKs are gitignored.
The former debug download URL redirects to the signed release.

The release application has a different Android package from debug builds;
its private data is separate. Keep your existing recovery backup and import
into the release app only after synthetic testnet device validation succeeds.
