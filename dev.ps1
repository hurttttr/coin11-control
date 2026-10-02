# dev.ps1 — 开发模式：后端 uvicorn --reload + 前端 vite dev server（并行）
# 后端: http://127.0.0.1:8000 (API 文档 /docs)；前端: http://localhost:6173
# 开发模式下 frontend-dist 不参与（app 未挂载 SPA，前端直连 vite dev server）。
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Port = 8000
Set-Location $Root

# ---------- 1. .venv ----------
if (-not (Test-Path (Join-Path $Root ".venv\Scripts\python.exe"))) {
    Write-Host "[dev] 未发现 .venv —— 请先运行 setup.bat" -ForegroundColor Red
    exit 1
}

# ---------- 2. 前端 dev server（新窗口并行） ----------
if (Test-Path (Join-Path $Root "frontend\package.json")) {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Host "[dev] 启动前端 vite dev server（新窗口，http://localhost:6173）" -ForegroundColor Cyan
        Start-Process cmd -ArgumentList @(
            "/k", "cd /d `"$Root\frontend`" && npm run dev"
        )
    } else {
        Write-Host "[dev] 未找到 Node.js —— 跳过前端 dev server (winget install OpenJS.NodeJS.LTS)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[dev] frontend/ 暂无前端源码 —— 仅启动后端 (API: http://127.0.0.1:$Port/docs)" -ForegroundColor Yellow
}

# ---------- 3. 后端 reload 模式（前台运行，Ctrl+C 停止） ----------
Write-Host ("[dev] 后端 reload 模式 http://127.0.0.1:" + $Port + "  (Ctrl+C 停止)") -ForegroundColor Cyan
& (Join-Path $Root ".venv\Scripts\python.exe") -m uvicorn app.main:app --host 127.0.0.1 --port $Port --reload
