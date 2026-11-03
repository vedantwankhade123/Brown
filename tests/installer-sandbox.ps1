$ErrorActionPreference = 'Stop'
# Refuse to install on the developer's Windows account. Run only in Windows Sandbox.
if ($env:USERNAME -ne 'WDAGUtilityAccount') { throw 'This test runs only inside Windows Sandbox.' }
$results = 'C:\BrownValidation\Results'
$installDirectory = Join-Path $env:LOCALAPPDATA 'Programs\Brown AI Validation'
$latest = 'C:\BrownValidation\Latest\Brown AI Setup v1.0.21.exe'
$previous = 'C:\BrownValidation\Previous\Brown AI Setup v1.0.20.exe'
$checks = [System.Collections.Generic.List[string]]::new()
New-Item -ItemType Directory -Path $results -Force | Out-Null
Start-Transcript -Path (Join-Path $results 'installer-transcript.txt') -Force | Out-Null
function Install-Brown([string]$installer, [string]$expectedVersion) {
    $installerProcess = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDirectory") -PassThru -WindowStyle Hidden
    if (-not $installerProcess.WaitForExit(180000)) { throw 'Installer timed out.' }
    if ($installerProcess.ExitCode -ne 0) { throw "Installer failed: $($installerProcess.ExitCode)" }
    $binary = Join-Path $installDirectory 'Brown AI.exe'
    if (-not (Test-Path -LiteralPath $binary)) { throw 'Installed app is missing.' }
    if ((Get-Item -LiteralPath $binary).VersionInfo.ProductVersion -notlike "$expectedVersion*") { throw 'Installed version mismatch.' }
    $checks.Add("Installed $expectedVersion")
}
function Assert-Data {
    foreach ($item in @('data\validation.txt','models\validation.txt','connectors\validation.txt','personal.txt')) {
        if ([System.IO.File]::ReadAllText((Join-Path $installDirectory $item)) -ne 'BROWN_TEST_DATA') { throw "Saved data changed: $item" }
    }
    $checks.Add('Saved data and unrelated file preserved')
}
function Uninstall-Brown {
    $uninstaller = Join-Path $installDirectory 'Uninstall Brown AI.exe'
    $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @('/S', "_?=$installDirectory") -PassThru -WindowStyle Hidden
    if (-not $uninstallProcess.WaitForExit(180000)) { throw 'Uninstaller timed out.' }
    if ($uninstallProcess.ExitCode -ne 0) { throw "Uninstaller failed: $($uninstallProcess.ExitCode)" }
    if (Test-Path -LiteralPath (Join-Path $installDirectory 'Brown AI.exe')) { throw 'Application executable remains after uninstall.' }
    Assert-Data
    $checks.Add('Uninstall completed')
}
try {
    if (Test-Path -LiteralPath $installDirectory) { throw 'Expected a fresh Sandbox installation folder.' }
    $expected = Get-Content -LiteralPath 'C:\BrownValidation\Harness\checksums.json' -Raw | ConvertFrom-Json
    if ((Get-FileHash -LiteralPath $latest -Algorithm SHA256).Hash -ne $expected.latest) { throw 'Latest installer hash mismatch.' }
    if ((Get-FileHash -LiteralPath $previous -Algorithm SHA256).Hash -ne $expected.previous) { throw 'Previous installer hash mismatch.' }
    Install-Brown $previous '1.0.20'
    foreach ($item in @('data\validation.txt','models\validation.txt','connectors\validation.txt','personal.txt')) {
        $target = Join-Path $installDirectory $item
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        [System.IO.File]::WriteAllText($target,'BROWN_TEST_DATA')
    }
    Install-Brown $latest '1.0.21'
    Assert-Data
    Uninstall-Brown
    Install-Brown $latest '1.0.21'
    Assert-Data
    Uninstall-Brown
    @{passed=$true;version='1.0.21';installerSha256=(Get-FileHash -LiteralPath $latest -Algorithm SHA256).Hash;checks=$checks;finishedAt=(Get-Date).ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $results 'result.json')
} catch {
    @{passed=$false;checks=$checks;error=$_.Exception.Message;finishedAt=(Get-Date).ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $results 'result.json')
    throw
} finally { Stop-Transcript | Out-Null }
