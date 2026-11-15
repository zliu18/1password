# Windows / Chrome 157 repair

The tested combination is Windows 11, Chrome 157.0.8103.51, 1Password 4.6.2.626,
Native Messaging Host 6.8.452, and `legacy_chrome_extension/4.7.6.1`
(extension ID `phicbbndgmmpogmijjkbmdhpioaieaha`). The scripts require the audited
installation under `C:\Program Files (x86)\1Password 4` and Chrome under
`C:\Program Files\Google\Chrome\Application`; different executable hashes are rejected.

The Helper recognizes the old signer `Google Inc`. Current Chrome is validly signed
by `Google LLC`. Updating this equal-length name fixes the observed
`Unknown is connected but its code signature could not be verified` error.
Only three bytes change. Chrome trust verification remains in place, while the
Helper's original AgileBits Authenticode signature becomes `HashMismatch`.
The installed application was modified only after explicit authorization for that effect.

## Prepare and apply

Run these commands from the repository root. Use Python 3 for preparation and Node
22 or newer (with built-in `fetch` and `WebSocket`) for the optional status probe.

1. Enable **Help > Advanced > Use Native Messaging Protocol** in 1Password.
   Check the registered host manifest. If it matches the supplied original template's
   hash and has the broken root-relative path, apply the manifest repair from an
   **administrator PowerShell**:

   ```powershell
   powershell.exe -NoProfile -File .\artifacts\windows-native-messaging\apply-approved-repair.ps1
   ```

   The checked-in JSON files are hash-pinned configuration templates. If the installed
   manifest already has the correct path, skip this step. The script keeps the
   original allowed origins and rejects different installed files.

2. Prepare the Helper backup and candidate using ordinary privileges:

   ```powershell
   python .\artifacts\windows-native-messaging\prepare-helper-signer.py
   ```

   This reads the original installed Helper, checks its audited hash and exact byte
   differences, and generates local EXE files. It never installs or runs the candidate.
   Once the Helper is patched, this preparation command rejects the changed installed hash;
   retain the original backup and candidate for recovery.

3. Save and completely quit the desktop application and isolated test Chrome.
   After accepting the Helper signature change, apply from **administrator PowerShell**:

   ```powershell
   powershell.exe -NoProfile -File .\artifacts\windows-native-messaging\apply-helper-signer.ps1 -StopHelper
   ```

   The script stops only a remaining Helper from the audited installation, checks
   Chrome and host signatures, writes through an exclusive handle, and verifies
   the installed hash. It attempts to restore the previous bytes if writing fails.

4. Open an isolated Chrome profile and load `legacy_chrome_extension/4.7.6.1`.
   Confirm the signature error is gone. The [validation guide](../../WINDOWS11-TEST.md)
   describes the read-only baseline; its EXE-modification prohibition still applies
   unless the user explicitly authorizes this specific repair.

## Restore the Helper

Keep `Agile1pAgent.original.exe` and `Agile1pAgent.GoogleLLC.exe` in this directory.
After saving and quitting the desktop and isolated Chrome, run in administrator PowerShell:

```powershell
powershell.exe -NoProfile -File .\artifacts\windows-native-messaging\apply-helper-signer.ps1 -Restore -StopHelper
```

This restores the original hash and vendor signature. A successful restore was
not exercised during the reported run. It also restores the old signer-name mismatch.

## Optional read-only checks

For static disassembly, install the audit-only dependencies locally:

```powershell
python -m pip install --target .\artifacts\analysis-deps capstone==5.0.9 pefile==2024.8.26
python .\artifacts\windows-native-messaging\audit-helper-signer.py --target .\artifacts\windows-native-messaging\Agile1pAgent.original.exe
```

For an isolated profile started with `--remote-debugging-port=0`, query only four
connection flags and then detach:

```powershell
$testProfilePath = Join-Path $env:TEMP 'onepassword-classic-mv3-test'
node .\artifacts\windows-native-messaging\probe-connection.mjs $testProfilePath
```

The probe selects only this extension worker and never reads storage, pairing keys,
tab URLs, vault entries, or message payloads. Binary backups, dependency downloads,
and generated JSON evidence stay local through `.gitignore`.

The [Windows report](../../WINDOWS-REVIEW.md) records successful Native Messaging
authentication, a detached 135.536-second idle interval, no signature error after
clicking the toolbar icon, and automatic authentication after browser restart.
Actual filling was not tested.
