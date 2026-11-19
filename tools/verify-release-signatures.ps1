param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$Application)
$ErrorActionPreference = 'Stop'
foreach ($releasePath in @($Installer, $Application)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $releasePath
    if ($signature.Status -ne 'Valid') { throw "Release signature is not valid: $releasePath ($($signature.Status))" }
    Write-Output "Valid signature: $releasePath"
}
