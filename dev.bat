@echo off
rem Coin11 Control - dev mode: backend (uvicorn --reload) + frontend (vite dev, port 6173).
rem Thin shell only: all logic lives in dev.ps1 (paths derived from script location).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
