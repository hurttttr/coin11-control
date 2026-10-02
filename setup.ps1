# setup.ps1 — Coin11 Control 环境一键初始化（幂等，可重复运行）
# 职责: uv -> uv sync（自动装 CPython 3.12 + 建 .venv）-> 前端构建 -> adb / tesseract 检查
# 一切路径从本脚本位置推导，无硬编码盘符；端口单一来源 8000（仅提示用）。
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

function Write-Step([string]$Msg)  { Write-Host "`n==> $Msg" -ForegroundColor Cyan }
function Write-Skip([string]$Msg)  { Write-Host "    [SKIP] $Msg" -ForegroundColor Yellow }
function Write-Ok([string]$Msg)    { Write-Host "    [OK] $Msg" -ForegroundColor Green }

# ---------- 1. uv ----------
Write-Step "检查 uv 包管理器"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Skip "未找到 uv，尝试用 winget 安装..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id astral-sh.uv -e --accept-source-agreements --accept-package-agreements
        # 刷新当前会话 PATH（winget 安装后不会自动刷新）
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [Environment]::GetEnvironmentVariable("Path", "User")
    }
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "未找到 uv，请先安装后重跑 setup.bat:" -ForegroundColor Red
        Write-Host "  winget install astral-sh.uv"
        Write-Host '  或官方脚本: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"'
        exit 1
    }
}
Write-Ok (uv --version)

# ---------- 2. uv sync ----------
Write-Step "同步 Python 环境（uv 按 .python-version 自动安装 CPython 3.12 并创建 .venv）"
Write-Host "    首次运行会下载 Python 与依赖（torch/easyocr 数百 MB），请耐心等待..."
uv sync
if ($LASTEXITCODE -ne 0) {
    Write-Host "uv sync 失败 —— 请检查网络后重试（依赖走清华镜像，torch 走 PyTorch CPU 源）" -ForegroundColor Red
    exit 1
}
Write-Ok ".venv 就绪 ($Root\.venv)"

# ---------- 3. Node / 前端构建 ----------
Write-Step "检查 Node.js（前端构建需要 >= 20.19）"
$nodeOk = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $v = (node --version) -replace '^v', ''
    $p = $v.Split('.')
    if ([int]$p[0] -gt 20 -or ([int]$p[0] -eq 20 -and [int]$p[1] -ge 19)) {
        $nodeOk = $true
        Write-Ok ("node v" + $v)
    } else {
        Write-Skip ("node v" + $v + " 过低，前端构建需要 >= 20.19 (winget install OpenJS.NodeJS.LTS)")
    }
} else {
    Write-Skip "未找到 Node.js —— 跳过前端构建（不影响后端）"
    Write-Host "    如需托管前端页面: winget install OpenJS.NodeJS.LTS 后重跑 setup.bat"
}

$frontendDir = Join-Path $Root "frontend"
$distTarget  = Join-Path $Root "frontend-dist"
if (Test-Path (Join-Path $frontendDir "package.json")) {
    if ($nodeOk) {
        Write-Step "构建前端 (frontend/ -> frontend-dist/)"
        Push-Location $frontendDir
        try {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci 失败" }
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "npm run build 失败" }
        } finally {
            Pop-Location
        }
        $distDir = Join-Path $frontendDir "dist"
        if (Test-Path (Join-Path $distTarget "index.html")) {
            # 主路径：vite build.outDir = ../frontend-dist，产物直接落在仓库根
            Write-Ok "frontend-dist/ 已生成"
        } elseif (Test-Path (Join-Path $distDir "index.html")) {
            # 容错：若前端 outDir 未指向 frontend-dist，退回从 frontend/dist 复制
            if (Test-Path $distTarget) { Remove-Item -Recurse -Force $distTarget }
            Copy-Item -Recurse $distDir $distTarget
            Write-Ok "frontend-dist/ 已生成（自 frontend/dist 复制）"
        } else {
            Write-Skip "构建后未找到产物（frontend-dist/ 与 frontend/dist 均无 index.html）—— 请检查 vite outDir 配置"
        }
    }
} else {
    Write-Skip "frontend/ 暂无前端源码（前端并入 monorepo 前的正常状态）—— 跳过前端构建"
    Write-Host "    前端源码并入 frontend/ 后重跑 setup.bat 即可生成 frontend-dist/"
}

# ---------- 4. adb ----------
Write-Step "检查 adb（设备管理功能依赖）"
if (Get-Command adb -ErrorAction SilentlyContinue) {
    Write-Ok (adb version | Select-Object -First 1)
} else {
    Write-Skip "未找到 adb —— 后端可启动，但设备管理/任务执行不可用"
    Write-Host "    安装: winget install Google.PlatformTools（安装后重开终端）"
}

# ---------- 5. tesseract（pytesseract 的二进制依赖，脚本级 OCR 用） ----------
Write-Step "检查 tesseract OCR"
if (Get-Command tesseract -ErrorAction SilentlyContinue) {
    Write-Ok (tesseract --version | Select-Object -First 1)
} else {
    Write-Skip "未找到 tesseract —— 涉及验证码 OCR 的任务脚本会失败（其余功能不受影响）"
    Write-Host "    安装: winget install UB-Mannheim.TesseractOCR（安装后重开终端）"
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  环境初始化完成！下一步: 双击 start.bat 启动" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
