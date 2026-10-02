@echo off
rem Coin11 Control - one-click environment setup (idempotent).
rem Thin shell only: all logic lives in setup.ps1 (paths derived from script location).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
pause
