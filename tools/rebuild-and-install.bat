@echo off
rem TaskQuad rebuild & install launcher - keeps window open on any error
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0rebuild-and-install.ps1"
