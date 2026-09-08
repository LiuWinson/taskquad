# TaskQuad app icon generator (quadrant 2x2, ASCII-only for Windows pwsh safety)
Add-Type -AssemblyName System.Drawing
function New-QuadIcon([int]$Size, [string]$Out) {
  $Dir = Split-Path -Parent $Out
  if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
  $Bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $G = [System.Drawing.Graphics]::FromImage($Bmp)
  $G.Clear([System.Drawing.Color]::White)
  $Gap = [int]([math]::Max(2, $Size * 0.05))
  $Half = [int](($Size - $Gap) / 2)
  $B1 = New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml('#E5484D')))
  $B2 = New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml('#3B82F6')))
  $B3 = New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml('#F59E0B')))
  $B4 = New-Object System.Drawing.SolidBrush(([System.Drawing.ColorTranslator]::FromHtml('#8B8F98')))
  $G.FillRectangle($B1, 0, 0, $Half, $Half)
  $G.FillRectangle($B2, ($Half + $Gap), 0, $Half, $Half)
  $G.FillRectangle($B3, 0, ($Half + $Gap), $Half, $Half)
  $G.FillRectangle($B4, ($Half + $Gap), ($Half + $Gap), $Half, $Half)
  $B1.Dispose(); $B2.Dispose(); $B3.Dispose(); $B4.Dispose()
  $G.Dispose()
  $Bmp.Save($Out, ([System.Drawing.Imaging.ImageFormat]::Png))
  $Bmp.Dispose()
  Write-Output ("generated: " + $Out)
}
New-QuadIcon 512 'assets\app-icon.png'
New-QuadIcon 64  'assets\favicon.png'
New-QuadIcon 32  'assets\tray.png'
New-QuadIcon 512 'harmonyos\AppScope\resources\base\media\app_icon.png'
New-QuadIcon 512 'harmonyos\entry\src\main\resources\base\media\icon.png'
