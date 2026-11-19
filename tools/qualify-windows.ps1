$ErrorActionPreference='Stop'
$proofRepo=Split-Path $PSScriptRoot -Parent
$proofNode='C:/Program Files/nodejs/node.exe'
$proofPackage=Get-Content (Join-Path $proofRepo 'package.json') -Raw | ConvertFrom-Json
$proofInstaller=Join-Path $proofRepo ('release/Neuroscape Local Setup '+$proofPackage.version+'.exe')
foreach($proofKey in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
  $proofExisting=Get-ChildItem -LiteralPath $proofKey -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Neuroscape Local*' }
  if($proofExisting){throw 'Preserved an existing Neuroscape installation. Use a clean qualification host.'}
}
$proofTemp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$proofInstall=[IO.Path]::GetFullPath((Join-Path $proofTemp ('neuroscape-journey-'+[guid]::NewGuid().ToString('N'))))
if(!$proofInstall.StartsWith($proofTemp,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid owned installation path'}
$proofExe=Join-Path $proofInstall 'Neuroscape Local.exe'
$proofUninstaller=Join-Path $proofInstall 'Uninstall Neuroscape Local.exe'
$proofPreviousExe=$env:NEUROSCAPE_EXE
try {
try {
  $proofProcess=Start-Process -FilePath $proofInstaller -ArgumentList @('/S',('/D='+$proofInstall)) -WindowStyle Hidden -Wait -PassThru
  if($proofProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $proofExe)){throw 'Qualification installation failed'}
  $env:NEUROSCAPE_EXE=$proofExe
  & $proofNode (Join-Path $PSScriptRoot 'qualify-installed.mjs')
  if($LASTEXITCODE -ne 0){throw 'Installed Windows journey failed; inspect the unique qualification evidence folder'}
} finally {
  if(Test-Path -LiteralPath $proofUninstaller){
    $proofProcess=Start-Process -FilePath $proofUninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    if($proofProcess.ExitCode -ne 0){throw ('Owned qualification uninstaller failed: '+$proofProcess.ExitCode)}
    Write-Output 'Owned qualification uninstaller exit code: 0'
  }
}
& (Join-Path $PSScriptRoot 'upgrade-install-smoke.ps1')
if($LASTEXITCODE -ne 0){throw 'Installed schema8 upgrade failed'}
& (Join-Path $PSScriptRoot 'upgrade-install-smoke.ps1') -PredecessorSchema7
if($LASTEXITCODE -ne 0){throw 'Installed schema7 upgrade failed'}
Write-Output 'PASS: installed Windows journey and both supported predecessor upgrades.'
} finally {
  if($null -eq $proofPreviousExe){Remove-Item Env:\NEUROSCAPE_EXE -ErrorAction SilentlyContinue}else{$env:NEUROSCAPE_EXE=$proofPreviousExe}
}
