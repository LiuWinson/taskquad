@echo off
rem TaskQuad version bump helper: run tools\bump-version.bat 1.5.2
if "%~1"=="" (
  echo Usage: bump-version.bat ^<x.y.z^>
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0bump-version.ps1" %1
