param([switch]$PredecessorSchema7)
$ErrorActionPreference='Stop'
$proofRepo=Split-Path $PSScriptRoot -Parent
$proofNode='C:/Program Files/nodejs/node.exe'
$proofPrior=Join-Path $proofRepo 'release/predecessor-0.1.0/Neuroscape Local Setup 0.1.0.exe'
$proofCurrent=Join-Path $proofRepo 'release/Neuroscape Local Setup 0.2.0.exe'
$proofTemp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$proofInstall=[IO.Path]::GetFullPath((Join-Path $proofTemp ('neuroscape-upgrade-installed-'+[guid]::NewGuid().ToString('N'))))
if (!$proofInstall.StartsWith($proofTemp,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid owned installation path' }
foreach ($proofKey in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
  $proofExisting=Get-ChildItem -LiteralPath $proofKey -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Neuroscape Local*' }
  if ($proofExisting) { throw 'An existing Neuroscape installation was preserved. Use the unpacked predecessor/current proof instead of changing its registration.' }
}
$proofExe=Join-Path $proofInstall 'Neuroscape Local.exe'
$proofUninstaller=Join-Path $proofInstall 'Uninstall Neuroscape Local.exe'
try {
  & $proofNode --disable-warning=ExperimentalWarning --import tsx (Join-Path $PSScriptRoot 'prepare-upgrade-ui.ts')
  if ($LASTEXITCODE -ne 0) { throw 'Upgrade profile preparation failed' }
  $proofProcess=Start-Process -FilePath $proofPrior -ArgumentList @('/S',('/D='+$proofInstall)) -WindowStyle Hidden -Wait -PassThru
  if ($proofProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $proofExe)) { throw 'Predecessor installation failed' }
  $env:NEUROSCAPE_EXE=$proofExe
  $proofArguments=@('--disable-warning=ExperimentalWarning','--import','tsx',(Join-Path $PSScriptRoot 'upgrade-smoke.ts'),'--before')
  if ($PredecessorSchema7) { $proofArguments+='--schema7' }
  $ErrorActionPreference='Continue'
  & $proofNode @proofArguments *> (Join-Path $proofRepo '.local/upgrade-before-process.log')
  $proofResult=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if ($proofResult -ne 0) { throw 'Installed predecessor qualification failed; see .local/upgrade-before-process.log' }
  $proofProcess=Start-Process -FilePath $proofCurrent -ArgumentList @('/S',('/D='+$proofInstall)) -WindowStyle Hidden -Wait -PassThru
  if ($proofProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $proofExe)) { throw 'Upgrade installation failed' }
  $ErrorActionPreference='Continue'
  & $proofNode --disable-warning=ExperimentalWarning --import tsx (Join-Path $PSScriptRoot 'upgrade-smoke.ts') *> (Join-Path $proofRepo '.local/upgrade-after-process.log')
  $proofResult=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if ($proofResult -ne 0) { throw 'Installed upgrade qualification failed; see .local/upgrade-after-process.log' }
  $proofEvidence=Join-Path $proofRepo '.local/profile-upgrade-ui.json'
  $proofRecord=Get-Content -LiteralPath $proofEvidence -Raw | ConvertFrom-Json
  $proofRecord | Add-Member -NotePropertyName installedUpgrade -NotePropertyValue $true
  $proofRecord | Add-Member -NotePropertyName installDirectory -NotePropertyValue $proofInstall
  $proofRecord | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $proofEvidence
  $proofSuffix=if ($PredecessorSchema7) { 'schema7' } else { 'schema8' }
  Copy-Item -LiteralPath $proofEvidence -Destination (Join-Path $proofRepo ('.local/upgrade-installed-'+$proofSuffix+'.json'))
  foreach ($proofImage in @('upgrade-before.png','upgrade-complete.png','upgrade-resumed.png')) { Copy-Item -LiteralPath (Join-Path $proofRepo ('.local/'+$proofImage)) -Destination (Join-Path $proofRepo ('.local/'+$proofSuffix+'-'+$proofImage)) }
  Write-Output ('PASS: installed 0.2.0 over owned 0.1.0 and resumed the original offline game ('+$proofSuffix+').')
} finally {
  Remove-Item Env:\NEUROSCAPE_EXE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $proofUninstaller) { $proofProcess=Start-Process -FilePath $proofUninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru; Write-Output ('Owned upgrade proof uninstaller exit code: '+$proofProcess.ExitCode) }
}
