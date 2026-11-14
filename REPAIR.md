# Chrome 157 / 1Password 6.8.9 repair notes

## What is changed

The extension remains ID `phicbbndgmmpogmijjkbmdhpioaieaha`. The MV3 worker now uses
top-level event listeners, restricts pairing storage to trusted extension contexts,
uses the Action and context-menu event APIs, fails closed when the legacy core cannot
load, and removes the non-functional declarative-net-request shim.

1Password 6.8.9 contains two Chrome code-signing requirements that accept the old
Google certificate name. `tools/fix-1password6-chrome157.sh` changes only the
Team-ID-bearing alternatives to the current certificate name:

```text
Developer ID Application: Google, Inc. (EQHXZ8M8AV)
Developer ID Application: Google LLC (EQHXZ8M8AV)
```

The replacement is byte-for-byte equal in length. The surrounding requirement still
requires Apple's code-signing anchor, bundle ID `com.google.Chrome`, and Google Team ID
`EQHXZ8M8AV`.

## Safety gates

The repair script:

- defaults to read-only audit mode;
- accepts only the audited 1Password 6.8.9 `OnePasswordCore` SHA-256;
- requires exactly two expected signer clauses;
- builds and validates a candidate in `/private/tmp`;
- checks the installed Chrome against the patched requirement before writing;
- refuses to run while 1Password, its helper, or Native Message Host is running;
- backs up the complete framework before writing;
- asks for the literal confirmation `APPLY`;
- signs only `OnePasswordCore.framework`, never the whole app;
- attempts automatic rollback if the write or signing step fails.

## Commands

Run the audit first:

```sh
./tools/fix-1password6-chrome157.sh --audit
```

After quitting 1Password 6 and 1Password mini:

```sh
./tools/fix-1password6-chrome157.sh --apply
```

Backups are stored under:

```text
~/Library/Application Support/1Password 6 MV3 Repair Backups/
```

Do not run `codesign --deep` on `1Password 6.app`; doing so would also re-sign its
login item and can break background-item registration on current macOS releases.

## Remaining limitation

Go & Fill is emulated with `tabs.onUpdated` because MV3 forbids the original blocking
`webRequest` redirect. Ordinary toolbar/context-menu fill and Native Messaging do not
depend on that redirect, but Go & Fill should be treated as experimental until tested
with synthetic data.
