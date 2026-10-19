@echo off
rem TaskQuad push & release launcher - keeps window open on any error
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0push-release.ps1"
