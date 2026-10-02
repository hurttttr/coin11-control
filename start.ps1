# start.ps1 — 一键启动生产模式：uvicorn 托管 API + frontend-dist，自动打开浏览器
# 端口单一来源 8000（与 app/core/config.py 默认 HOST/PORT 一致）。
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Port = 8000
Set-Location $Root

# ---------- 1. .venv ----------
if (-not (Test-Path (Join-Path $Root ".venv\Scripts\python.exe"))) {
    Write-Host "[start] 未发现 .venv —— 自动执行 uv sync 初始化环境..." -ForegroundColor Yellow
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Host "[start] 未找到 uv。请先运行 setup.bat（或安装: winget install astral-sh.uv）" -ForegroundColor Red
        exit 1
    }
    uv sync
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $Root ".venv\Scripts\python.exe"))) {
        Write-Host "[start] 环境初始化失败 —— 请运行 setup.bat 查看详细错误" -ForegroundColor Red
        exit 1
    }
}

# ---------- 2. frontend-dist ----------
if (-not (Test-Path (Join-Path $Root "frontend-dist\index.html"))) {
    $canBuild = (Get-Command node -ErrorAction SilentlyContinue) -and
                (Test-Path (Join-Path $Root "frontend\package.json"))
    if ($canBuild) {
        Write-Host "[start] frontend-dist 缺失 —— 自动构建前端..." -ForegroundColor Yellow
        $envLocal = Join-Path $Root "frontend\.env.local"
        if (-not (Test-Path $envLocal)) {
            Copy-Item (Join-Path $Root "frontend\.env.example") $envLocal
            Write-Host "[start] frontend/.env.local 缺失 —— 已由 .env.example 生成" -ForegroundColor DarkGray
        }
        Push-Location (Join-Path $Root "frontend")
        try {
            npm ci
            npm run build
        } finally {
            Pop-Location
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[start] 前端构建失败 —— 将以纯 API 模式启动" -ForegroundColor Red
        }
        # 主路径：vite build.outDir = ../frontend-dist，产物直接落在仓库根；
        # 容错：旧 outDir（frontend/dist）时退回复制
        if (-not (Test-Path (Join-Path $Root "frontend-dist\index.html")) -and
            (Test-Path (Join-Path $Root "frontend\dist\index.html"))) {
            $t = Join-Path $Root "frontend-dist"
            if (Test-Path $t) { Remove-Item -Recurse -Force $t }
            Copy-Item -Recurse (Join-Path $Root "frontend\dist") $t
        }
    }
    if (-not (Test-Path (Join-Path $Root "frontend-dist\index.html"))) {
        Write-Host "[start] frontend-dist 不可用 —— 后端将以纯 API 模式启动:" -ForegroundColor Yellow
        Write-Host "        http://127.0.0.1:$Port/docs 可访问；页面路径会 404。"
        Write-Host "        生成前端页面需要 Node 20+ 与 frontend/ 源码，之后运行 setup.bat。"
    }
}

# ---------- 3. 端口占用检查 ----------
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[start] 端口 $Port 已被监听 —— 后端可能已在运行，直接打开浏览器。" -ForegroundColor Yellow
    Start-Process ("http://127.0.0.1:" + $Port)
    exit 0
}

# ---------- 4. 打开浏览器（延迟等 uvicorn 就绪） ----------
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    "-NoProfile", "-Command",
    "Start-Sleep 3; Start-Process 'http://127.0.0.1:$Port'"
)

# ---------- 5. 启动后端（前台运行，Ctrl+C 停止） ----------
Write-Host ("[start] uvicorn http://127.0.0.1:" + $Port + "  (Ctrl+C 停止)") -ForegroundColor Cyan
& (Join-Path $Root ".venv\Scripts\python.exe") -m uvicorn app.main:app --host 127.0.0.1 --port $Port
