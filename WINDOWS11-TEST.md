# Windows 11 / Chrome 157 validation handoff

## Objective

Validate whether the Manifest V3 extension in this repository can connect to
**1Password 4 for Windows 4.6.2.626** on Windows 11 and Chrome 157.

The expected extension ID is:

```text
phicbbndgmmpogmijjkbmdhpioaieaha
```

The legacy Native Messaging host requested by the extension is:

```text
2bua8c4s2c.com.agilebits.1password
```

1Password 4.6.2.626 is an appropriate test baseline. Native Messaging support
for Chrome was added to the 4.6.2 release line and is enabled by default in the
relevant builds.

## Instructions for the Windows Codex agent

Work through the phases below in order. Report the evidence from each phase
before making any repair proposal.

### Safety constraints

- Start read-only. Do not install or modify 1Password.
- Do not edit the registry or a Native Messaging manifest without fresh,
  explicit confirmation from the user.
- Do not patch, replace, re-sign, or otherwise modify any EXE or DLL.
- Do not disable Chrome security features, signature verification, or browser
  policies.
- Do not open or inspect the user's real vault items.
- If a functional fill test is eventually approved, use a new synthetic item
  containing no real credentials.
- Do not run `tools/fix-1password6-chrome157.sh`. It is a macOS-only repair for
  1Password 6.8.9 and is not applicable to Windows.
- Do not remove or alter a separately installed subscription version of
  1Password. Keep its browser extension out of the isolated Chrome profile.
- Never print or retain pairing secrets, encrypted message bodies, vault data,
  usernames, passwords, or OTP values. Redact them if they appear in logs.

## Phase 0: verify the supplied extension

Use the repository branch containing the Chrome 157 MV3 fixes. From the
repository root, record:

```powershell
git status --short --branch
git log --oneline -3
git rev-parse HEAD
```

The fixed history should include these commits, or equivalent later commits:

```text
966428c tools: add audited macOS signer repair
1804216 fix: harden MV3 service worker for Chrome 157
```

The macOS repair commit is harmless on Windows because its script will not be
run. Confirm that this file exists:

```text
legacy_chrome_extension\4.7.6.1\manifest.json
```

Read the manifest and verify:

- `manifest_version` is `3`;
- `minimum_chrome_version` is `116`;
- the service worker is `background.js`;
- `nativeMessaging` is present;
- the embedded `key` is present (it makes the unpacked extension ID stable).

Do not make source changes during this validation.

## Phase 1: inspect 1Password and Chrome

In the 1Password 4 desktop window, ask the user to confirm that this option is
enabled:

```text
Help > Advanced > Use Native Messaging Protocol
```

Do not ask the user to unlock the vault merely for this inspection.

Run the following read-only PowerShell commands in a normal, non-elevated
terminal:

```powershell
$ErrorActionPreference = "Continue"

Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
                 "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
                 "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
  Where-Object DisplayName -Like "*1Password*" |
  Select-Object DisplayName, DisplayVersion, InstallLocation

$ChromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$ChromeCandidates | ForEach-Object {
  $Signature = Get-AuthenticodeSignature -LiteralPath $_
  [pscustomobject]@{
    Path        = $_
    Version     = (Get-Item -LiteralPath $_).VersionInfo.FileVersion
    SigStatus   = $Signature.Status
    Subject     = $Signature.SignerCertificate.Subject
    Thumbprint  = $Signature.SignerCertificate.Thumbprint
  }
}

Get-Process | Where-Object {
  $_.ProcessName -match "1Password|AgileBits|onepassword"
} | Select-Object ProcessName, Id, Path
```

The commands above inspect installed products, Chrome's Authenticode identity,
and relevant running processes. They do not change system state.

## Phase 2: inspect Native Messaging registration

Run this in the same non-elevated PowerShell terminal:

```powershell
$HostName = "2bua8c4s2c.com.agilebits.1password"
$RegistryKeys = @(
  "Registry::HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "Registry::HKEY_LOCAL_MACHINE\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Google\Chrome\NativeMessagingHosts\$HostName"
)

$Found = $false
foreach ($RegistryKey in $RegistryKeys) {
  if (Test-Path -LiteralPath $RegistryKey) {
    $Found = $true
    $ManifestPath = (Get-Item -LiteralPath $RegistryKey).GetValue("")
    Write-Host "FOUND: $RegistryKey"
    Write-Host "MANIFEST: $ManifestPath"

    if (Test-Path -LiteralPath $ManifestPath) {
      $Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
      [pscustomobject]@{
        Name           = $Manifest.name
        Description    = $Manifest.description
        HostPath       = $Manifest.path
        HostPathExists = Test-Path -LiteralPath $Manifest.path
        Type           = $Manifest.type
        AllowedOrigins = $Manifest.allowed_origins -join "; "
      } | Format-List
    } else {
      Write-Warning "The registered manifest file does not exist."
    }
  }
}

if (-not $Found) {
  Write-Warning "The legacy 1Password Native Messaging host is not registered."
}
```

Expected properties:

```text
Name: 2bua8c4s2c.com.agilebits.1password
Type: stdio
HostPathExists: True
AllowedOrigins includes:
chrome-extension://phicbbndgmmpogmijjkbmdhpioaieaha/
```

Also list host names registered for Chrome, without changing them:

```powershell
$Roots = @(
  "Registry::HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts",
  "Registry::HKEY_LOCAL_MACHINE\Software\Google\Chrome\NativeMessagingHosts",
  "Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Google\Chrome\NativeMessagingHosts"
)

foreach ($Root in $Roots) {
  if (Test-Path -LiteralPath $Root) {
    Get-ChildItem -LiteralPath $Root |
      Select-Object @{Name="RegistryRoot";Expression={$Root}}, PSChildName
  }
}
```

A modern host such as `com.1password.1password` may coexist with the legacy
host. Its presence alone is not a conflict: the extension connects to the
legacy host by its exact name. Do not delete either registration.

If the legacy registration is absent, its JSON is invalid, its executable is
missing, or its `allowed_origins` lacks the expected extension ID, stop after
reporting the evidence. A repair is a separate, write-enabled phase requiring
user confirmation.

## Phase 3: load into an isolated Chrome profile

This phase installs only the unpacked extension into a disposable Chrome
profile. It must not alter the user's normal Chrome profile.

Select the first Chrome path discovered in Phase 1, then run:

```powershell
$Chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $Chrome) { throw "Google Chrome was not found." }

$Profile = Join-Path $env:TEMP "onepassword-classic-mv3-test"
Start-Process -FilePath $Chrome -ArgumentList @(
  "--user-data-dir=$Profile",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-sync"
)
```

In that isolated Chrome window:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `legacy_chrome_extension\4.7.6.1`.
5. Confirm the displayed ID is exactly
   `phicbbndgmmpogmijjkbmdhpioaieaha`.
6. Do not install the modern 1Password extension in this profile.
7. Open the extension's service-worker inspector and record only error names
   and sanitized messages.

At this point, do not browse the real vault. The first success criterion is
simply that the extension connects without a Native Messaging or authentication
error.

## Phase 4: lifecycle-only validation

If the initial connection succeeds:

1. Close the service-worker DevTools window so it cannot keep the worker alive.
2. Leave Chrome idle for at least 90 seconds.
3. Click the extension button again.
4. Confirm it reconnects or remains functional without accumulating errors.
5. Fully exit the isolated Chrome instance, restart it with the same command,
   and confirm another clean connection.
6. Restart only the 1Password Helper through the application's normal UI if
   this can be done without modifying or unlocking the vault, then confirm the
   extension reconnects.

Do not claim lifecycle success merely because DevTools remained open: inspecting
the service worker can affect its lifetime.

## Optional synthetic functional test

Perform this only after connection and lifecycle tests succeed and the user
explicitly approves creating a test item.

- Use a disposable local test page or a non-sensitive public test form.
- Use a synthetic username and password that have never been used elsewhere.
- Test toolbar invocation and ordinary fill.
- Treat Go & Fill as experimental; its MV3 emulation is documented in
  `REPAIR.md`.
- Delete the synthetic item only if the user asks; do not touch any real item.

## Error classification

Report the exact sanitized error and use the following decision tree:

| Error or observation | Likely layer | Next action |
| --- | --- | --- |
| `Specified native messaging host not found` | Registry key, manifest path, or host name | Recheck Phase 2; do not create a key yet |
| `Access to the specified native messaging host is forbidden` | Expected extension ID missing from `allowed_origins` | Report manifest and propose a minimal, backed-up JSON change; wait for approval |
| Host starts and immediately disconnects | Host crash, protocol failure, or authentication rejection | Collect sanitized extension errors, process exit evidence, and 1Password diagnostics |
| Browser/runtime/code signature invalid | 1Password's Windows browser authentication rejects current Chrome | Record Chrome signature details and relevant 1Password diagnostics; do not patch binaries or disable verification |
| `Receiving end does not exist` | Message was sent to a tab without a content script | Test on a normal `https://` page, not `chrome://` or the extensions page |
| Connection works only while DevTools is open | Service-worker lifecycle issue | Reproduce with DevTools closed and record timestamps |

## Evidence to return

Return a concise report containing:

1. Windows edition/build and architecture.
2. Chrome version, executable path, Authenticode status, signer subject, and
   certificate thumbprint.
3. Confirmed 1Password version `4.6.2.626` and whether Native Messaging is
   enabled.
4. Legacy Native Messaging registry key and manifest path.
5. Manifest `name`, host executable path/existence, and `allowed_origins`.
6. Other registered 1Password host names, without modifying them.
7. Loaded extension ID and service-worker status.
8. Sanitized errors, if any.
9. Result after 90 seconds with DevTools closed and after restarting Chrome.
10. A proposed repair, if needed, clearly separated from actions already
    performed.

Do not include vault contents, pairing secrets, protocol payloads, or personal
site URLs in the report.

