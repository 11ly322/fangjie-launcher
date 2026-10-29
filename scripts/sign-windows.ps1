param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$CertificatePath = $env:FJ_SIGN_CERT_PATH,
  [string]$CertificatePassword = $env:FJ_SIGN_CERT_PASSWORD,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Path)) {
  throw "File not found: $Path"
}
if (-not $CertificatePath -or -not (Test-Path -LiteralPath $CertificatePath)) {
  throw 'Set FJ_SIGN_CERT_PATH to a .pfx certificate or pass -CertificatePath.'
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
  $kits = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending
  foreach ($kit in $kits) {
    $candidate = Join-Path $kit.FullName 'x64\signtool.exe'
    if (Test-Path -LiteralPath $candidate) {
      $signtool = Get-Item $candidate
      break
    }
  }
}
if (-not $signtool) {
  throw 'signtool.exe was not found. Install the Windows SDK signing tools.'
}

$arguments = @(
  'sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', $TimestampUrl,
  '/f', $CertificatePath
)
if ($CertificatePassword) {
  $arguments += @('/p', $CertificatePassword)
}
$arguments += $Path

& $signtool.Source @arguments
if ($LASTEXITCODE -ne 0) {
  throw "signtool sign failed with exit code $LASTEXITCODE"
}

& $signtool.Source verify /pa /v $Path
if ($LASTEXITCODE -ne 0) {
  throw "signtool verify failed with exit code $LASTEXITCODE"
}

Write-Host "Signed and verified: $Path"
