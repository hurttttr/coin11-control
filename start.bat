@echo off
rem Coin11 Control - start backend (uvicorn, port 8000) and open browser.
rem Thin shell only: all logic lives in start.ps1 (paths derived from script location).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
