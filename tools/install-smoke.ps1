param([switch]$Game, [switch]$Recovery, [string]$PortabilityFixture)
$ErrorActionPreference = 'Stop'
$proofRepo = Split-Path $PSScriptRoot -Parent
$proofPackage = Get-Content -LiteralPath (Join-Path $proofRepo 'package.json') -Raw | ConvertFrom-Json
$proofInstaller = Join-Path $proofRepo ("release/Neuroscape Local Setup " + $proofPackage.version + '.exe')
foreach ($proofKey in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
  $proofExisting=Get-ChildItem -LiteralPath $proofKey -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Neuroscape Local*' }
  if ($proofExisting) { throw 'Preserved an existing Neuroscape installation. Use a clean qualification host.' }
}
$proofPreviousExe=$env:NEUROSCAPE_EXE
$proofPreviousFixture=$env:NEUROSCAPE_PORTABILITY_FIXTURE
$proofTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$proofInstallRoot = [IO.Path]::GetFullPath((Join-Path $proofTempRoot ('neuroscape-installed-' + [guid]::NewGuid().ToString('N'))))
if (!$proofInstallRoot.StartsWith($proofTempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Install target must remain in the temporary directory' }
$proofInstalledExe = Join-Path $proofInstallRoot 'Neuroscape Local.exe'
$proofUninstaller = Join-Path $proofInstallRoot 'Uninstall Neuroscape Local.exe'
try {
  $proofProcess = Start-Process -FilePath $proofInstaller -ArgumentList @('/S', ('/D=' + $proofInstallRoot)) -WindowStyle Hidden -Wait -PassThru
  if ($proofProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $proofInstalledExe)) { throw 'Internal installer failed' }
  $env:NEUROSCAPE_EXE = $proofInstalledExe
  & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'desktop-smoke.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Installed app smoke failed' }
  if ($Game) {
    & 'C:/Program Files/nodejs/node.exe' --import tsx (Join-Path $PSScriptRoot 'prepare-solo-ui.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Installed game profile preparation failed' }
    & 'C:/Program Files/nodejs/node.exe' --import tsx (Join-Path $PSScriptRoot 'game-smoke.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Installed offline game failed' }
    Copy-Item -LiteralPath (Join-Path $proofRepo '.local/game-ui.json') -Destination (Join-Path $proofRepo '.local/game-installed-ui.json')
    foreach ($proofImage in @('game-setup.png','game-battlefield.png','game-outcome.png')) {
      Copy-Item -LiteralPath (Join-Path $proofRepo ('.local/' + $proofImage)) -Destination (Join-Path $proofRepo ('.local/installed-' + $proofImage))
    }
  }
  if ($Recovery) {
    & 'C:/Program Files/nodejs/node.exe' --import tsx (Join-Path $PSScriptRoot 'prepare-solo-ui.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Installed recovery profile preparation failed' }
    & 'C:/Program Files/nodejs/node.exe' --import tsx (Join-Path $PSScriptRoot 'prepare-resume-ui.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Installed recovery checkpoint preparation failed' }
    & 'C:/Program Files/nodejs/node.exe' (Join-Path $PSScriptRoot 'match-recovery-smoke.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Installed offline recovery failed' }
    Copy-Item -LiteralPath (Join-Path $proofRepo '.local/match-recovery-ui.json') -Destination (Join-Path $proofRepo '.local/match-recovery-installed-ui.json')
    foreach ($proofImage in @('recovery-service-error.png','recovery-player.png','recovery-bot.png')) {
      Copy-Item -LiteralPath (Join-Path $proofRepo ('.local/' + $proofImage)) -Destination (Join-Path $proofRepo ('.local/installed-' + $proofImage))
    }
  }
  if ($PortabilityFixture) {
    $env:NEUROSCAPE_PORTABILITY_FIXTURE=[IO.Path]::GetFullPath($PortabilityFixture)
    & 'C:/Program Files/nodejs/node.exe' --disable-warning=ExperimentalWarning --import tsx (Join-Path $PSScriptRoot 'platform-render-smoke.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Installed cross-OS profile qualification failed' }
    Copy-Item -LiteralPath (Join-Path $proofRepo '.local/platform-render-proof.json') -Destination (Join-Path $proofRepo '.local/linux-to-windows-portability.json')
    foreach ($proofImage in @('platform-render-before.png','platform-render-after.png')) {
      Copy-Item -LiteralPath (Join-Path $proofRepo ('.local/'+$proofImage)) -Destination (Join-Path $proofRepo ('.local/linux-return-'+$proofImage))
    }
  }
  Write-Output 'PASS: installed the internal unsigned artifact and verified its local profile.'
} finally {
  if ($null -eq $proofPreviousExe) { Remove-Item Env:\NEUROSCAPE_EXE -ErrorAction SilentlyContinue } else { $env:NEUROSCAPE_EXE=$proofPreviousExe }
  if ($null -eq $proofPreviousFixture) { Remove-Item Env:\NEUROSCAPE_PORTABILITY_FIXTURE -ErrorAction SilentlyContinue } else { $env:NEUROSCAPE_PORTABILITY_FIXTURE=$proofPreviousFixture }
  if (Test-Path -LiteralPath $proofUninstaller) {
    $proofUninstallProcess = Start-Process -FilePath $proofUninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    Write-Output "Internal proof uninstaller exit code: $($proofUninstallProcess.ExitCode)"
    if ($proofUninstallProcess.ExitCode -ne 0) { throw "Owned proof uninstaller failed: $($proofUninstallProcess.ExitCode)" }
  }
}
