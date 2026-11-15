$ErrorActionPreference = 'Stop'
$sourcePath = 'C:\Program Files (x86)\1Password 4\ChromeManifest.json'
$candidatePath = Join-Path $PSScriptRoot 'ChromeManifest.candidate.json'
$backupPath = Join-Path $PSScriptRoot 'ChromeManifest.original.json'
$resultPath = Join-Path $PSScriptRoot 'apply-result.json'
$originalHash = 'FD8C937B6E41F0DE0AE38546ECDF780CCD1B8325E4F0D644011661477A730E25'
$candidateHash = '2DEF5CF7F03C7611D6464728B37673567AA93C06F55E8E11476A4735F3A70585'
$hostPath = 'C:\Program Files (x86)\1Password 4\1Password.NativeMessagingHost.exe'
$hostHash = 'ECEF2FC91DB47668B97864876CF253E20AF006863B4DF97A4C12222A92853B2A'
$writeStarted = $false

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator privileges are required.'
    }
    if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $originalHash) {
        throw 'Installed manifest changed; audit again before writing.'
    }
    if ((Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash -ne $originalHash) {
        throw 'Original backup hash mismatch.'
    }
    if ((Get-FileHash -LiteralPath $candidatePath -Algorithm SHA256).Hash -ne $candidateHash) {
        throw 'Candidate hash mismatch.'
    }
    if ((Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash -ne $hostHash) {
        throw 'Host executable changed; audit again.'
    }
    if ((Get-AuthenticodeSignature -LiteralPath $hostPath).Status -ne 'Valid') {
        throw 'Host signature is not valid.'
    }
    $original = Get-Content -Raw -LiteralPath $backupPath | ConvertFrom-Json
    $candidate = Get-Content -Raw -LiteralPath $candidatePath | ConvertFrom-Json
    if ($candidate.name -ne '2bua8c4s2c.com.agilebits.1password' -or
        $candidate.type -ne 'stdio' -or $candidate.path -ne $hostPath) {
        throw 'Candidate identity or executable path mismatch.'
    }
    $original.path = $hostPath
    if (($original | ConvertTo-Json -Depth 8 -Compress) -cne
        ($candidate | ConvertTo-Json -Depth 8 -Compress)) {
        throw 'Candidate changes fields other than path.'
    }
    $writeStarted = $true
    Copy-Item -LiteralPath $candidatePath -Destination $sourcePath -Force
    if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $candidateHash) {
        throw 'Installed candidate hash mismatch.'
    }
    [pscustomobject]@{
        Success = $true
        Manifest = $sourcePath
        HostPath = $hostPath
        InstalledSHA256 = $candidateHash
        Backup = $backupPath
    } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
    $failure = $_.Exception.Message
    $rollbackSucceeded = $null
    if ($writeStarted) {
        try {
            Copy-Item -LiteralPath $backupPath -Destination $sourcePath -Force
            $rollbackSucceeded = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -eq $originalHash
        } catch { $rollbackSucceeded = $false }
    }
    [pscustomobject]@{
        Success = $false
        Error = $failure
        RollbackSucceeded = $rollbackSucceeded
    } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
    exit 1
}
