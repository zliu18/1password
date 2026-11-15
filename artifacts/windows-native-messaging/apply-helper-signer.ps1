param([switch]$Restore, [switch]$StopHelper)

$ErrorActionPreference = 'Stop'
$targetPath = 'C:\Program Files (x86)\1Password 4\Agile1pAgent.exe'
$backupPath = Join-Path $PSScriptRoot 'Agile1pAgent.original.exe'
$candidatePath = Join-Path $PSScriptRoot 'Agile1pAgent.GoogleLLC.exe'
$originalHash = '17BF9760CB97EC3B76DB46B2F502645D2A539EDD858B5484AE336727EFF5C948'
$candidateHash = '968235499FBEA066C979AC3C4A8A663E46EA7026A5C6A0AB2316FB5D3BE22857'
$resultName = if ($Restore) { 'helper-restore-result.json' } else { 'helper-apply-result.json' }
$resultPath = Join-Path $PSScriptRoot $resultName
$stream = $null
$writeStarted = $false
$rollbackSucceeded = $null
$chromeSignature = $null

function Get-BytesHash([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '') }
    finally { $sha.Dispose() }
}

try {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator privileges are required.'
    }
    $original = [IO.File]::ReadAllBytes($backupPath)
    $candidate = [IO.File]::ReadAllBytes($candidatePath)
    if ((Get-BytesHash $original) -ne $originalHash -or (Get-BytesHash $candidate) -ne $candidateHash) {
        throw 'Backup or candidate hash mismatch.'
    }
    if ($original.Length -ne $candidate.Length) { throw 'Candidate size mismatch.' }
    if ((Get-AuthenticodeSignature -LiteralPath $backupPath).Status -ne 'Valid') {
        throw 'Original backup vendor signature is not valid.'
    }
    if (-not $Restore) {
        $chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
        $chromeSignature = Get-AuthenticodeSignature -LiteralPath $chromePath
        if ($chromeSignature.Status -ne 'Valid' -or
            $chromeSignature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Google LLC') {
            throw 'Chrome must have a valid Google LLC signature.'
        }
        $hostPath = 'C:\Program Files (x86)\1Password 4\1Password.NativeMessagingHost.exe'
        if ((Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash -ne 'ECEF2FC91DB47668B97864876CF253E20AF006863B4DF97A4C12222A92853B2A' -or
            (Get-AuthenticodeSignature -LiteralPath $hostPath).Status -ne 'Valid') {
            throw 'Native host identity or signature changed.'
        }
    }
    if ($StopHelper) {
        if (@(Get-Process -Name '1Password','1Password.NativeMessagingHost' -ErrorAction SilentlyContinue).Count -gt 0) {
            throw 'Quit desktop and isolated test Chrome before stopping the remaining Helper.'
        }
        $helpers = @(Get-Process -Name 'Agile1pAgent' -ErrorAction SilentlyContinue)
        foreach ($helper in $helpers) {
            if ($helper.Path -ine $targetPath) { throw 'Refusing to stop a Helper from another installation.' }
            Stop-Process -Id $helper.Id -ErrorAction Stop
            if (-not $helper.WaitForExit(5000)) { throw 'Helper did not stop.' }
        }
    }
    $running = @(Get-Process -Name '1Password','Agile1pAgent','1Password.NativeMessagingHost' -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        throw ('Quit desktop, tray Helper, and isolated test Chrome before replacing Helper. Running: ' + (($running.Name | Sort-Object -Unique) -join ', '))
    }
    $installedHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
    $expectedBefore = if ($Restore) { $candidateHash } else { $originalHash }
    $expectedAfter = if ($Restore) { $originalHash } else { $candidateHash }
    $replacement = if ($Restore) { $original } else { $candidate }
    if ($installedHash -ne $expectedBefore) { throw 'Installed Helper changed; refusing to overwrite it.' }

    # An exclusive handle prevents writing while the executable is in use.
    # Keep its existing file identity, permissions, and length.
    $stream = [IO.File]::Open($targetPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $beforeBytes = [byte[]]::new($stream.Length)
    $readTotal = 0
    while ($readTotal -lt $beforeBytes.Length) {
        $read = $stream.Read($beforeBytes, $readTotal, $beforeBytes.Length - $readTotal)
        if ($read -eq 0) { throw 'Unexpected end of installed Helper.' }
        $readTotal += $read
    }
    if ((Get-BytesHash $beforeBytes) -ne $expectedBefore -or $beforeBytes.Length -ne $replacement.Length) {
        throw 'Installed Helper changed before acquiring exclusive handle.'
    }
    $stream.Position = 0
    $writeStarted = $true
    $stream.Write($replacement, 0, $replacement.Length)
    $stream.Flush($true)
    $stream.Dispose()
    $stream = $null
    if ((Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash -ne $expectedAfter) {
        throw 'Installed result hash mismatch.'
    }
    [pscustomobject]@{
        Success = $true
        Operation = if ($Restore) { 'restore' } else { 'apply' }
        TimestampUTC = [DateTime]::UtcNow.ToString('o')
        Target = $targetPath
        InstalledSHA256 = $expectedAfter
        InstalledSignatureStatus = [string](Get-AuthenticodeSignature -LiteralPath $targetPath).Status
        OriginalBackup = $backupPath
        ChromeSignatureStatus = if ($chromeSignature) { [string]$chromeSignature.Status } else { $null }
        ChromeSigner = if ($chromeSignature) { 'Google LLC' } else { $null }
    } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
    $failure = $_.Exception.Message
    if ($stream) { $stream.Dispose(); $stream = $null }
    if ($writeStarted) {
        try {
            [IO.File]::WriteAllBytes($targetPath, $beforeBytes)
            $rollbackSucceeded = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash -eq $expectedBefore
        } catch { $rollbackSucceeded = $false }
    }
    [pscustomobject]@{
        Success = $false
        Operation = if ($Restore) { 'restore' } else { 'apply' }
        TimestampUTC = [DateTime]::UtcNow.ToString('o')
        Error = $failure
        WriteStarted = $writeStarted
        RollbackSucceeded = $rollbackSucceeded
    } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
    exit 1
} finally {
    if ($stream) { $stream.Dispose() }
}
