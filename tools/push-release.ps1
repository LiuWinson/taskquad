# TaskQuad v1.3.1: commit, tag, push to GitHub, create release, upload installer
# ASCII-only for Windows PowerShell safety. Token is read from console prompt, never stored.
# Usage: right-click -> Run with PowerShell (or: powershell -ExecutionPolicy Bypass -File tools\push-release.ps1)
$ErrorActionPreference = 'Stop'
$root = 'D:\deepseek\project\todolist'
Set-Location $root

Write-Output '[1/5] commit & tag ...'
git add -A
git commit -m "feat: cross-day today auto-sync v1.3.1"
if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
git tag -f v1.3.1
Write-Output ('commit = ' + (git log --oneline -1))

Write-Output '[2/5] ensure proxy 127.0.0.1:7890 ...'
$p = Get-NetTCPConnection -State Listen -LocalPort 7890 -ErrorAction SilentlyContinue
if (-not $p) {
  Start-Process 'D:\Users\Huawei\AppData\Local\Clash Verge\Clash Verge.exe'
  Start-Sleep -Seconds 12
}

Write-Output '[3/5] push main + tag (token required) ...'
$token = Read-Host 'Paste a fresh GitHub PAT (repo scope), press Enter'
git -c http.proxy=http://127.0.0.1:7890 push "https://x-access-token:$token@github.com/LiuWinson/taskquad.git" main v1.3.1
if ($LASTEXITCODE -ne 0) { throw 'git push failed (wrong token / proxy down?)' }
Write-Output 'pushed'

Write-Output '[4/5] create GitHub release ...'
$body = [System.IO.File]::ReadAllText((Join-Path $root 'tools\_release_v131_body.md'), (New-Object System.Text.UTF8Encoding($false)))
$payload = @{ tag_name = 'v1.3.1'; name = 'v1.3.1'; body = $body; draft = $false; prerelease = $false } | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText((Join-Path $root 'tools\_release_v131_payload.json'), $payload, (New-Object System.Text.UTF8Encoding($false)))
curl.exe -x http://127.0.0.1:7890 -L -s -X POST 'https://api.github.com/repos/LiuWinson/taskquad/releases' -H "Authorization: token $token" -H 'Content-Type: application/json' -H 'User-Agent: taskquad-release' --data-binary '@tools\_release_v131_payload.json' -o 'tools\_release_v131_resp.json'
if ($LASTEXITCODE -ne 0) { throw 'create release failed' }
$rel = Get-Content 'tools\_release_v131_resp.json' -Raw | ConvertFrom-Json
if (-not $rel.id) {
  Write-Output ('release api message: ' + $rel.message)
  throw 'release not created (maybe already exists?)'
}
Write-Output ('release id = ' + $rel.id)

Write-Output '[5/5] upload installer ...'
$exe = Get-ChildItem (Join-Path $root 'desktop\dist') -Filter '*.exe' |
  Where-Object { $_.Name -like '*Setup*' -and $_.Name -like '*1.3.1*' } | Select-Object -First 1
if (-not $exe) { throw 'installer not found: run tools\rebuild-and-install.ps1 first' }
curl.exe -x http://127.0.0.1:7890 -L -s -X POST ("https://uploads.github.com/repos/LiuWinson/taskquad/releases/" + $rel.id + "/assets?name=TaskQuad-Setup-1.3.1.exe") -H "Authorization: token $token" -H 'Content-Type: application/octet-stream' -H 'User-Agent: taskquad-release' --data-binary "@$($exe.FullName)" --retry 3 --retry-delay 2 -o 'tools\_release_v131_upload.json'
if ($LASTEXITCODE -ne 0) { throw 'upload failed' }
$up = Get-Content 'tools\_release_v131_upload.json' -Raw | ConvertFrom-Json
Write-Output ('download = ' + $up.browser_download_url)
Write-Output 'DONE. Remember to revoke the PAT at github.com/settings/tokens'
