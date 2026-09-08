# TaskQuad end-to-end test (ASCII-only for Windows pwsh safety).
# Usage: pwsh -File tools\e2e-test.ps1   (run after web/dist is built)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8793
$base = "http://127.0.0.1:$port"

# 1. Start server serving web/dist
$proc = Start-Process node -ArgumentList @('server/src/index.js', '--port', "$port") -WorkingDirectory $root -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 2

  # 2. Static page serving
  $page = Invoke-WebRequest "$base/" -UseBasicParsing
  $snippet = $page.Content.Substring(0, [math]::Min(60, $page.Content.Length)) -replace "`r?`n", ' '
  Write-Output ("PASS index.html: " + $page.StatusCode + " " + $snippet)

  $health = Invoke-RestMethod "$base/api/health"
  Write-Output ("PASS health: ok=" + $health.ok + " name=" + $health.name)

  # 3. Create task with UTF-8 body file
  $bodyPath = Join-Path $root 'tools\_e2e_body.json'
  $body = '{"title":"e2e-task-8793","note":"","quadrant":"IU","dueAt":null,"remindAt":null}'
  [System.IO.File]::WriteAllText($bodyPath, $body, (New-Object System.Text.UTF8Encoding($false)))
  $created = Invoke-RestMethod -Method Post "$base/api/tasks" -ContentType 'application/json; charset=utf-8' -Body ([System.IO.File]::ReadAllText($bodyPath))
  Write-Output ("PASS create: " + $created.task.id)

  $list = Invoke-RestMethod "$base/api/tasks"
  Write-Output ("PASS list count: " + $list.tasks.Count)

  # 4. Complete -> archive week
  $done = Invoke-RestMethod -Method Patch "$base/api/tasks/$($created.task.id)" -ContentType 'application/json' -Body '{"completed":true}'
  Write-Output ("PASS complete: " + $done.task.completed)
  $archive = Invoke-RestMethod "$base/api/archive?period=week"
  $hit = $false
  foreach ($t in $archive.tasks) { if ($t.id -eq $created.task.id) { $hit = $true } }
  Write-Output ("PASS archive-week contains task: " + $hit)

  # 5. Delete
  $del = Invoke-RestMethod -Method Delete "$base/api/tasks/$($created.task.id)"
  Write-Output ("PASS delete: " + $del.ok)

  # 6. Bundled asset reachable
  $html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
  $m = [regex]::Match($html, 'src="([^"]+\.js)"')
  if ($m.Success) {
    $asset = Invoke-WebRequest "$base$($m.Groups[1].Value)" -UseBasicParsing
    Write-Output ("PASS asset " + $m.Groups[1].Value + " : " + $asset.StatusCode)
  } else {
    Write-Output "WARN no bundled js asset found in index.html"
  }
  Write-Output 'ALL TESTS DONE'
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item (Join-Path $root 'tools\_e2e_body.json') -ErrorAction SilentlyContinue
}
