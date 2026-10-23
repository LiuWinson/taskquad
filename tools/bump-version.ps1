# TaskQuad version bump: updates 5 places at once (router VERSION + 4 package.json).
# Usage: powershell -ExecutionPolicy Bypass -File tools\bump-version.ps1 1.5.2
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI;
#       non-ASCII characters break parsing (same trap as Set-Content on UTF-8 files).
param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "version format must be x.y.z (e.g. 1.5.2), got: $Version"
}

$jsonFiles = @(
  (Join-Path $root 'package.json'),
  (Join-Path $root 'desktop\package.json'),
  (Join-Path $root 'web\package.json'),
  (Join-Path $root 'server\package.json')
)

foreach ($file in $jsonFiles) {
  if (-not (Test-Path $file)) { throw "missing file: $file" }
  $text = [System.IO.File]::ReadAllText($file)
  $new = [regex]::Replace($text, '"version"\s*:\s*"[^"]*"', '"version": "' + $Version + '"', 1)
  if ($new -eq $text) { Write-Output "  [skip] $file already $Version" }
  else {
    [System.IO.File]::WriteAllText($file, $new, $utf8)
    Write-Output "  [ok]   $file"
  }
}

$router = Join-Path $root 'server\src\router.js'
if (-not (Test-Path $router)) { throw "missing file: $router" }
$routerText = [System.IO.File]::ReadAllText($router)
$routerNew = [regex]::Replace($routerText, "const VERSION = '[^']*';", "const VERSION = '$Version';", 1)
if ($routerNew -eq $routerText) { Write-Output "  [skip] $router already $Version" }
else {
  [System.IO.File]::WriteAllText($router, $routerNew, $utf8)
  Write-Output "  [ok]   $router"
}

# verify: all five places agree, JSON valid, UTF-8 Chinese intact
$versions = @()
foreach ($file in $jsonFiles) {
  $obj = [System.IO.File]::ReadAllText($file) | ConvertFrom-Json
  $versions += [string]$obj.version
  $desc = [string]$obj.description
  if ($desc -and $desc.Contains('?')) {
    Write-Warning "  possible encoding damage in $file (description contains '?')"
  }
}
$routerObj = [System.IO.File]::ReadAllText($router)
$m = [regex]::Match($routerObj, "const VERSION = '([^']*)';")
$versions += $m.Groups[1].Value

$unique = @($versions | Select-Object -Unique)
if ($unique.Count -ne 1) {
  throw "version mismatch: $($unique -join ', ')"
}
Write-Output "version unified: $($unique[0])"
Write-Output "next: build + silent install; title bar will show V$($unique[0]) automatically"
