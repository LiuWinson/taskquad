# TaskQuad 1.3.1 rebuild & install (ASCII-only for Windows PowerShell safety)
# Usage: double-click this file, or run:  powershell -ExecutionPolicy Bypass -File tools\rebuild-and-install.ps1
$ErrorActionPreference = 'Stop'
$root = 'D:\deepseek\project\todolist'

Set-Location (Join-Path $root 'web')
Write-Output '[1/4] build web ...'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'web build failed' }

Get-Process | Where-Object { $_.Path -like '*taskquad-desktop*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Set-Location (Join-Path $root 'desktop')
$env:ELECTRON_BUILDER_CACHE = Join-Path $root 'desktop\.builder-cache'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:npm_config_cache = Join-Path $root 'desktop\.npm-cache'
$env:LOCALAPPDATA = Join-Path $root 'desktop\.localappdata'

Write-Output '[2/4] build desktop (pack + dist) ...'
npm run pack
if ($LASTEXITCODE -ne 0) { throw 'pack failed' }
npm run dist
if ($LASTEXITCODE -ne 0) { throw 'dist failed' }

$setup = Get-ChildItem (Join-Path $root 'desktop\dist') -Filter '*.exe' |
  Where-Object { $_.Name -like '*Setup*' -and $_.Name -like '*1.3.1*' } | Select-Object -First 1
if (-not $setup) { throw 'setup exe not found' }

Write-Output '[3/4] install silently (click Yes if UAC prompt appears) ...'
Start-Process -FilePath $setup.FullName -ArgumentList '/S' -Wait

$installed = $null
$dir = 'D:\Program Files (x86)\taskquad-desktop'
if (Test-Path $dir) {
  $installed = Get-ChildItem $dir -Filter '*.exe' |
    Where-Object { $_.Name -notlike 'Uninstall*' } | Select-Object -First 1
}
if (-not $installed) { throw 'installed exe not found under D:\Program Files (x86)\taskquad-desktop' }

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Write-Output '[4/4] launch app ...'
Start-Process -FilePath $installed.FullName
Start-Sleep -Seconds 8
try {
  $h = Invoke-RestMethod 'http://127.0.0.1:8788/api/health' -TimeoutSec 5
  Write-Output ('OK server version = ' + $h.version)
  $all = Invoke-RestMethod 'http://127.0.0.1:8788/api/tasks' -TimeoutSec 5
  Write-Output ('OK task count = ' + $all.tasks.Count)
} catch {
  Write-Output 'WARN health check failed (app may still be starting, check manually)'
}
Write-Output 'DONE'
