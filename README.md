# 1Password Classic extension on current Chrome

This repository is an independent compatibility research project for running the
classic 1Password browser extension as a Chrome Manifest V3 extension. It is not
an official AgileBits or 1Password release.

The current candidate is `legacy_chrome_extension/4.7.6.1`. Its embedded key
keeps the unpacked extension ID stable:

```text
phicbbndgmmpogmijjkbmdhpioaieaha
```

Do not use `legacy_chrome_extension/4.7.5.90_0` as the functional MV3 build. That
directory is retained as a historical/reference implementation and currently
selects a minimal service worker that does not provide the complete desktop
connection and filling core.

## Current compatibility status

| Platform | Desktop application | Browser | Result |
| --- | --- | --- | --- |
| macOS Sonoma 14.6.1 | 1Password 6.8.9 | Chrome 157.0.8103.51 | Native Messaging connection succeeded after the audited Chrome signer-name repair |
| Windows 11 Pro 26H2 | 1Password 4.6.2.626; Native Host 6.8.452 | Chrome 157.0.8103.51 | Native Messaging connection and authentication succeeded after the manifest-path and Helper signer-name repairs |

On Windows, the post-repair probe reported `connected`, `authenticated`,
`nativeMessaging`, and `readyToSend` as true. The result remained true after a
detached 135.536-second idle interval and after restarting the isolated browser.
The idle test shows that the connection remained usable during that interval; it
does **not** prove that Chrome terminated and recreated the service worker.

These results do not establish complete product compatibility:

- filling and saving real or synthetic Login items have not been tested;
- Go & Fill remains experimental under MV3;
- the Windows restore operation has been designed and hash-checked but was not
  exercised in the reported run;
- only the exact application and browser builds documented here were tested;
- Chrome, Windows, or 1Password updates can invalidate the pinned assumptions.

## What changed

The 4.7.6.1 MV3 worker now:

- registers Chrome events at service-worker top level;
- uses the current Action and context-menu APIs;
- limits pairing storage access to trusted extension contexts;
- fails closed if the legacy core cannot load;
- removes the non-functional declarative-net-request shim;
- emulates the old blocking Go & Fill redirect with `tabs.onUpdated`.

The compatibility repairs do not disable Chrome signature verification. They
update obsolete Google signer names while retaining the surrounding platform
identity checks:

- macOS changes 1Password 6.8.9's accepted Chrome certificate name to
  `Developer ID Application: Google LLC (EQHXZ8M8AV)`;
- Windows changes the audited 1Password 4 Helper literal from `Google Inc` to
  the equal-length `Google LLC` and separately corrects a broken Native
  Messaging manifest path.

## Important safety warning

Both desktop compatibility repairs modify installed 1Password components and
are limited to exact, audited file hashes. They are not general-purpose patchers.

The Windows Helper change modifies three bytes of `Agile1pAgent.exe` and causes
its original AgileBits Authenticode signature to report `HashMismatch`. Chrome
and the Native Messaging Host must still have valid signatures, and the Helper
continues to verify Chrome through Windows trust APIs. Do not apply this repair
to a different Helper hash, installation path, Chrome signer, or 1Password
version.

The macOS repair ad-hoc signs only the modified `OnePasswordCore.framework`.
Never run `codesign --deep` on the entire 1Password application.

Before any write-enabled repair:

1. complete the read-only audit for the target platform;
2. close 1Password, its Helper, and the isolated test browser as instructed;
3. preserve the generated or documented backup;
4. use an isolated Chrome profile with sync disabled;
5. never test with a real vault item or production credential;
6. do not install the modern 1Password extension in the isolated profile.

The scripts refuse unknown hashes. Do not weaken those checks to make an
unsupported build proceed.

## Documentation

### macOS

- [macOS repair notes](REPAIR.md)
- `tools/fix-1password6-chrome157.sh --audit` performs the read-only audit.
- `tools/fix-1password6-chrome157.sh --apply` is the explicitly confirmed,
  write-enabled repair for the audited 1Password 6.8.9 binary only.

### Windows

- [Read-only Windows validation plan](WINDOWS11-TEST.md)
- [Windows investigation and validation report](WINDOWS-REVIEW.md)
- [Hash-pinned Windows repair procedure](artifacts/windows-native-messaging/README.md)

The Windows repair is deliberately separated into two stages:

1. `apply-approved-repair.ps1` corrects the Native Messaging manifest only when
   the installed manifest and host match the pinned hashes.
2. `prepare-helper-signer.py` creates a local backup and candidate;
   `apply-helper-signer.ps1` applies or restores the Helper only when every
   expected identity and hash check passes.

No patched EXE, original proprietary EXE, generated analysis evidence, pairing
secret, message payload, or vault data is committed. `.gitignore` excludes those
local artifacts. The checked-in manifest templates are retained byte-for-byte
with their UTF-8 BOM and CRLF line endings because the repair scripts pin their
SHA-256 hashes.

## Security review summary

- The extension contains no remotely loaded executable scripts and no `eval`
  path was introduced by the MV3 changes.
- Native Messaging requests the legacy host
  `2bua8c4s2c.com.agilebits.1password`; the Windows validation explicitly checks
  that the expected extension origin is allowed.
- The extension still has broad `http://*/*` and `https://*/*` access because
  classic form detection and filling run across ordinary web pages. This is a
  material permission and is one reason testing should use a dedicated profile.
- The legacy bundle may fall back to a localhost WebSocket after the precise
  native-host-not-found error. A successful test must therefore confirm that
  the active connection is a `NativeMessagingConnection`, not merely that the
  toolbar opens without an error.
- Pairing state is restricted to trusted extension contexts. Validation tools
  intentionally avoid storage, pairing keys, protocol bodies, tab URLs, and
  vault contents.

## Repository status

This is an experimental compatibility build, not a supported password-manager
release. Treat connection success as a narrow engineering result, keep an
independent backup of the original desktop component, and review every future
browser or desktop update before reusing a repair.

Last reviewed: November 15, 2026.
