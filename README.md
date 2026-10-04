<div align="center">

# ⛓️ Coin11 Control

**多设备安卓自动化任务控制平台**

[![Version](https://img.shields.io/badge/版本-v0.4.0-00f0ff?style=flat-square)](https://github.com/hurttttr/coin11-control/releases)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)]()
[![Vue 3](https://img.shields.io/badge/Frontend-Vue_3-4FC08D?style=flat-square&logo=vue.js&logoColor=white)]()
[![License](https://img.shields.io/badge/许可证-MIT-green?style=flat-square)]()

> 基于 [coin11-tb](https://github.com/czl0325/coin11-tb) 二次开发 · 前端源码在本仓库 [frontend/](frontend/) 目录（monorepo 单服务部署）

</div>

---

## ✨ 功能特性

<table>
<tr>
<td width="50%">

**📱 设备管理**
- 自动发现 USB / Wi-Fi 设备
- ADB 无线调试配对（`adb pair`）
- 网段自动预填（`GET /api/devices/network-info`）
- 远程连接输入优化（IP 末段 + 端口，网段自动预填，端口默认 5555）
- 远程连接 / 断开
- 实时状态监视

**📋 任务队列**
- 每台设备独立 FIFO 队列
- 拖拽重排、清空已完成
- 批量分配 / 启动 / 暂停
- 运行中任务保护

</td>
<td width="50%">

**🤖 自动执行**
- 设备连接自动运行任务 ⭐
- 多脚本多选配置
- WebSocket 实时日志推送
- WebSocket 截图流（2 FPS）
- 任务超时保护（默认 30 分钟）

**🐳 DevOps**
- Docker 多阶段构建
- GitHub Actions 测试 + 自动打包
- 一键启动脚本（`.bat` / `.ps1`）
- Git 版本自动更新

**🔒 安全**
- 可选 API Token 鉴权
- WebSocket 连接鉴权
- CORS 白名单校验

</td>
</tr>
</table>

---

## 🚀 快速开始

### 环境要求

| 依赖 | 说明 |
|------|------|
| **Python** ≥ 3.12 | 推荐使用 [uv](https://docs.astral.sh/uv/) |
| **ADB** | Android Debug Bridge，需在 PATH 或 `.env` 配置 |
| **Git** | coin11-tb 仓库自动拉取 |
| **Node.js** ≥ 20（可选） | 构建前端产物 `frontend-dist/` 或本地开发前端时需要；缺失时 `setup.bat` / `start.bat` 会自动跳过并提示 |

### ADB 安装

<details>
<summary>点击展开安装指南</summary>

**Windows**
```bash
# 1. 下载 Platform Tools 并解压
# 2. 将路径加入系统 PATH 或 .env 配置
#    ADB_PATH=D:\platform-tools\adb.exe
# 3. 验证
adb version
```

**macOS**
```bash
brew install android-platform-tools
```

**Linux**
```bash
sudo apt install android-tools-adb
```
</details>

### 安装 & 启动

**新电脑三步走（Windows）**：

1. 安装 [uv](https://docs.astral.sh/uv/)：`winget install astral-sh.uv`（或官方脚本 `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`）
2. 双击 **`setup.bat`** — 环境一键初始化：`uv sync` 自动安装 CPython 3.12 并创建 .venv（含 coin11-tb 任务脚本全部依赖）→ 构建前端产出 `frontend-dist/`（需 Node 20+，缺失时跳过并给安装指引，之后 `start.bat` 检测到缺失也会自动补建）→ 检查 adb / tesseract。幂等可重复运行。
3. 双击 **`start.bat`** — 启动服务并自动打开浏览器。前后端同端口：**http://127.0.0.1:8000**（页面 + API + 文档 `/docs`）。

**开发模式**：双击 `dev.bat`（并行：后端 uvicorn --reload 8000 + 前端 vite dev 6173，改前端热更新）；或两个终端分别跑 `uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` 与 `cd frontend && npm run dev`。

**生产模式（单端口）**：`start.bat` / Docker 均为单端口 8000 —— 后端 uvicorn 托管 `frontend-dist/`（SPA history 路由回退 index.html），API 走 `/api/*`、WS 走 `/ws/*`，无需单独起前端服务。

```bash
git clone https://github.com/hurttttr/coin11-control.git
cd coin11-control

# 安装依赖（uv 按 .python-version 自动安装 CPython 3.12 并创建 .venv）
uv sync

# 启动（开发模式）
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

访问 **http://127.0.0.1:8000/docs** 查看 Swagger 文档。

> Python 钉在 3.12（任务脚本依赖的 torch/easyocr 等二进制 wheel 不支持 3.13+，这是"新电脑跑不起来"的头号原因）；
> 常规依赖走清华镜像，torch/torchvision 走 PyTorch 官方 CPU 源（+cpu 构建，避免数 GB 的 CUDA 轮子）。

---

## 🐳 Docker 部署

项目使用**多阶段构建**，前端编译后与后端打包成单一镜像。

```bash
# 拉取镜像并启动（GHCR 公开镜像，无需登录）
docker compose up -d

# 升级到新版本
docker compose pull && docker compose up -d

# 不用 compose 时直接 docker run
docker run -d --name coin11-control -p 8000:8000 -v coin11-data:/app/data \
  ghcr.io/hurttttr/coin11-control:latest
```

访问 **http://localhost:8000**（远程服务器替换为对应 IP）。

> ⚠️ Docker 不支持 USB 设备透传，请使用 Wi-Fi ADB（`adb connect IP:5555`）

镜像内已安装 coin11-tb 脚本的运行时依赖（`uiautomator2` / `opencv` / `easyocr` / `ddddocr` /
CPU 版 `torch`），因此体积较大（约 2GB）。若只需要 API 与设备管理、不在容器内执行脚本，
可构建精简镜像：

```bash
docker build --build-arg WITH_SCRIPT_DEPS=0 -t coin11-control:slim .
```

`docker compose` 已配置命名卷 `coin11-data`，持久化 coin11-tb 克隆与自动任务配置，
重建容器不会丢失。

---

## 📡 API 文档

所有端点均以 `/api` 为前缀。完整文档见 Swagger UI：`http://127.0.0.1:8000/docs`

> 🔑 若配置了 `API_AUTH_TOKEN`，除 `/api/health` 外所有端点均需携带
> `Authorization: Bearer <token>` 或 `X-API-Token: <token>` 请求头。

### 设备管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/devices` | 获取设备列表 |
| `GET` | `/api/devices/network-info` | 获取局域网网段与本机 IP（`{"subnet":"192.168.1","host_ip":"192.168.1.10"}`） |
| `POST` | `/api/devices/connect` | 远程连接（`{"address":"IP:Port"}`） |
| `POST` | `/api/devices/pair` | ADB 无线配对（`{"address":"IP:Port","code":"123456"}`） |
| `DELETE` | `/api/devices/{serial}` | 断开设备 |

> **🔌 远程连接 / ADB 配对（Android 11+ 无线调试）**
> 1. 前端通过 `GET /api/devices/network-info` 自动探测本机局域网网段（`{"subnet":"192.168.1","host_ip":"192.168.1.10"}`），
>    探测不到局域网时可用 `LAN_SUBNET_OVERRIDE` 兜底，并在输入框中自动预填网段前缀。
> 2. 远程连接：只需输入 IP 最后一段（如 `100`）与端口（默认 `5555`），前端拼成完整地址
>    `IP:Port` 后调用 `POST /api/devices/connect`；直接粘贴完整地址同样兼容。
> 3. ADB 配对：在配对弹窗输入 IP 最后一段（网段已预填）、配对端口与 6 位配对码，调用
>    `POST /api/devices/pair` 完成 `adb pair`。
> 4. **前提**：手机需开启「开发者选项 → 无线调试」，与电脑处于同一局域网；若需手机访问后端，
>    `HOST` 需为 `0.0.0.0`（`/api/*` 建议同时设置 `API_AUTH_TOKEN`）。

### 任务队列

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | …​/queue | 获取队列 |
| `POST` | …​/queue | 添加任务 |
| `DELETE` | …​/queue/{task_id} | 移除任务 |
| `POST` | …​/queue/start | 启动执行 |
| `POST` | …​/queue/stop | 停止执行 |

### 批量操作

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks/batch-enqueue` | 批量分配任务 |
| `POST` | `/api/tasks/batch-start` | 批量启动队列 |
| `POST` | `/api/tasks/batch-stop` | 批量暂停队列 |

### 自动任务设置

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/settings/auto-tasks` | 获取自动任务脚本列表 |
| `PUT` | `/api/settings/auto-tasks` | 设置自动任务脚本列表 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/scripts` | 可用脚本列表 |
| `GET` | `/api/update/check` | 检查更新 |
| `POST` | `/api/update/pull` | 拉取更新 |

---

## 📦 版本发布说明

> 各版本说明已折叠，点击版本行展开详情。

<details open>
<summary><strong>v0.4.0 (2026-10-02)</strong> — 🔀 前端并入 monorepo + 新电脑一键可跑</summary>

- 📦 **前端源码并入仓库内 `frontend/`**，废弃 submodule（原 `sync-frontend-submodule` 工作流删除，CI/Docker 改用仓库内路径）
- 🏃 **一键脚本**：`setup.bat`（环境初始化：uv → Python 3.12 + 依赖 → 前端构建）/ `start.bat`（启动 + 自动开浏览器）/ `dev.bat`（后端 reload + 前端 vite dev 并行）
- 🐍 **Python 钉 3.12**（`.python-version` + `requires-python`）：任务脚本依赖的 torch/easyocr 二进制 wheel 不支持 3.13+，根治"新电脑跑不起来"
- 🧱 **脚本依赖收入 coin11tb 依赖组**（uv 默认安装）：按上游 coin11-tb 钉版对齐，torch 走 PyTorch CPU 源（2.14.1+cpu），常规依赖走清华镜像
- 📄 requirements*.txt 全部改为 `uv export` 生成（pyproject 单一来源）
- 🖥️ **生产单端口 8000**：uvicorn 托管 `frontend-dist/`（vite `outDir` 直产仓库根），Docker 构建还原完整 `npm run build`（含 vue-tsc）
- 🔧 CI 前端 job 还原完整检查链（lint → typecheck → build → test，vue-tsc 已全绿）

</details>

<details>
<summary><strong>v0.3.1 (2026-08-26)</strong> — 🚀 远程连接/ADB 配对输入优化 + 死代码清理</summary>

**✨ 新功能：**
- 🌐 **网段自动预填** — 新增 `GET /api/devices/network-info`，自动探测本机局域网网段并预填到连接/配对输入框；`LAN_SUBNET_OVERRIDE` 可兜底多网卡/探测失败场景
- 🔌 **远程连接输入优化** — 只需输入 IP 最后一段 + 端口（默认 `5555`），前端自动拼成完整地址；直接粘贴完整 `IP:Port` 同样兼容
- 📟 **ADB 配对弹窗优化** — 输入项改为主机末段（网段已预填）+ 配对端口 + 6 位配对码；表单缺字段时红字提示具体原因

**🧹 精简与清理：**
- ♻️ 移除手机扫码二维码配对（前端入口已移除，后端 `pair-qr` API 一并删除，`qrcode` 依赖移除）
- 🗑️ 删除死代码 `state_store.py` 及其测试（生产零引用）

</details>

<details>
<summary><strong>v0.3.0 (2026-08-25)</strong> — 🛠️ 稳定性与安全加固：修复任务停止、孤儿进程、批量截图错发等核心缺陷；测试从 1 个增至 46 个</summary>

**🐛 关键修复：**
- ⏹️ **停止队列真正生效** — 此前取消信号被吞掉，点「停止」后队列仍会继续启动下一个脚本；现在取消会正确终止整个队列
- 💀 **不再遗留孤儿进程** — 此前仅取消了 asyncio 包装任务，`subprocess` 启动的脚本仍在真机上继续操作 App；现在按进程树终止（Windows `taskkill /F /T`、POSIX `killpg`）
- 📸 **批量启动的截图不再错发** — 闭包晚绑定使所有设备的画面都推给最后一台设备，改用 `functools.partial` 绑定
- 🔁 **设备重连后自动任务可再次触发** — 去重集合此前只增不减，掉线重连必须重启后端；现在按连续缺席轮次清理（含 ADB 抖动宽限）
- 🔗 **SPA 深链接刷新不再 404** — 直接访问或刷新 `/tasks`、`/settings`、`/device/xxx` 现在正常返回页面；未命中的 `/api`、`/ws` 路径仍保持 404 JSON
- 🐳 **Docker 镜像可真正执行任务** — 此前未安装 coin11-tb 脚本依赖，容器内所有脚本在 import 阶段即失败
- ⏱️ **任务超时保护** — 挂死的脚本不再永久阻塞设备队列（默认 30 分钟，超时后继续执行下一个任务）
- 🧠 **日志内存上限** — 任务日志改为 `deque(maxlen=2000)`，长跑任务不再无限增长
- 📡 **广播不再被慢客户端阻塞** — WebSocket 推送改为并发发送
- 🔍 **修正设备解析** — 无详细信息的在线设备此前会被正则静默丢弃

**🔒 安全增强：**
- 🔑 **可选 API 鉴权** — 设置 `API_AUTH_TOKEN` 后所有 `/api/*` 需携带 `Authorization: Bearer` 或 `X-API-Token`；`/api/health` 始终豁免。**未设置时行为完全不变**（向后兼容本地单用户场景）
- 🌐 **CORS 合法性** — `CORS_ORIGINS` 含 `"*"` 时自动关闭 `allow_credentials`（该组合被浏览器禁止），并收敛 methods/headers
- 🛡️ **WebSocket 鉴权收紧** — 移除端点上的弱默认 token，缺失 token 即拒绝（close code 4001）
- ⚠️ **暴露风险告警** — 非回环监听且未设置 `API_AUTH_TOKEN` 时启动告警

**✨ 工程质量：**
- 🧪 测试从 **1 → 46 个**，新增 7 个测试文件，覆盖任务引擎、设备解析、自动任务、鉴权、SPA 托管
- 🤖 新增 CI 工作流（`ci.yml`）：后端 pytest + 前端 vitest + ruff/mypy 基线；发布镜像前先过测试闸门
- 📋 统一日志体系（`app/core/logging_config.py`），替换散落各处的 `print`
- 🗑️ 清理死代码：删除无任何引用的 `app/models/`、`app/schemas/task.py`、`task_state.json`
- 🔀 抽出 `git_ops.py` 消除 `repo_manager` / `version_manager` 的重复 git 逻辑，并支持 `master` / `main` 分支自动探测
- 📦 依赖收敛：移除 5 个未使用依赖，拆分 `requirements-dev.txt`（测试依赖不再进入生产镜像）
- 🐋 Docker：非 root 运行、HEALTHCHECK、数据卷持久化、移除危险的 `CORS_ORIGINS=["*"]` 默认值
- 📄 新增 `.env.example` 配置模板

**⚠️ 已知问题（需前端仓库配合修复）：**
- 前端硬编码了 WS token，若 `.env` 中 `WS_AUTH_TOKEN` 被改为其它值，实时画面与日志会**静默失效**（详见「配置说明」）
- 前端将截图与日志混存于同一 2000 条缓冲区，2 FPS 截图约 16 分钟后会把日志挤出
- 前端 WebSocket 重连 5 次耗尽后不会自愈，需刷新页面

</details>

<details>
<summary><strong>v0.2.1 (2026-08-14)</strong> — 🐛 修复：设备自动任务不再依赖打开网页，后端启动即自动工作</summary>

**修复：**
- 🤖 **后台设备监视** — 新增 `AutoTaskWatcher` 后台循环，后端启动后每 5 秒自动扫描 ADB 设备，新设备上线自动入队并启动已配置的自动任务，**无需打开网页 / 前端轮询**
- 🧪 新增无头启动回归测试（`tests/integration/test_headless_auto_task.py`），防止自动任务重新退回"必须开网页才执行"

**增强：**
- 🗂️ 自动任务触发逻辑抽离为独立服务 `app/services/auto_task_runner.py`，HTTP 触发与后台触发共用同一去重逻辑

</details>

<details>
<summary><strong>v0.2.0 (2026-07-23)</strong> — 🎉 添加设备连接自动运行任务 + ADB 无线配对</summary>

**新功能：**
- 🤖 **设备连接自动运行任务** — 设置页面配置脚本列表，设备上线时自动入队并启动
- 📟 **ADB 无线配对** — 支持 Android 11+ `adb pair`，仪表盘新增配对弹窗
- ⊞ **批量任务操作** — 批量分配、批量启动、批量暂停
- ⚙️ **设置页面** — 侧边栏新增设置页，支持多选自动运行脚本

**增强：**
- 🐳 Docker 多阶段构建，支持 GitHub Actions 自动推送
- 🏃 一键启动脚本（`start-coin11.bat` / `start-coin11.ps1`，v0.4.0 起改为 `setup.bat` / `start.bat` / `dev.bat`）
- 📝 前端子模块化，`git clone --recursive` 一次拉取全部代码（v0.4.0 起前端并入 monorepo `frontend/`，普通 clone 即可）

</details>

<details>
<summary><strong>v0.1.0 (2026-07-21)</strong> — 🎬 初始版本</summary>

- 基础设备管理（列表/连接/断开/详情）
- 任务队列编排（入队/出队/拖拽重排/启动/停止）
- WebSocket 实时日志 & 截图流
- coin11-tb 仓库自动拉取与版本更新
- 前端 Vue 3 + Pinia + Vite

</details>

---

## 🏗️ 项目结构

```
coin11-control/
├── app/
│   ├── main.py                 # FastAPI 入口 + WebSocket + SPA 托管 + 鉴权
│   ├── core/
│   │   ├── config.py           # 配置（pydantic-settings）
│   │   ├── constants.py
│   │   └── logging_config.py   # 统一日志配置
│   ├── api/v1/
│   │   ├── router.py           # 路由聚合 + 批量/设置端点
│   │   ├── devices.py          # 设备管理（GET 保持幂等）
│   │   ├── tasks.py            # 任务队列端点
│   │   └── update.py           # 更新检查/拉取
│   ├── services/
│   │   ├── device_manager.py   # ADB 设备发现（含短 TTL 缓存）
│   │   ├── task_engine.py      # 任务队列引擎（进程树终止 + 超时）
│   │   ├── queue_control.py    # 队列启动共享助手
│   │   ├── auto_task_runner.py # 自动任务触发 + 后台设备监视
│   │   ├── screen_capture.py   # 截图流服务
│   │   ├── websocket_manager.py# WS 连接池（并发广播）
│   │   ├── auto_task_settings.py
│   │   ├── git_ops.py          # git 操作共享层
│   │   ├── repo_manager.py
│   │   └── version_manager.py
│   └── schemas/device.py       # Pydantic 模型
├── coin11_tb/                  # coin11-tb 脚本仓库（运行时自动 clone）
├── frontend/                   # 前端源码（monorepo，本仓库内）
├── frontend-dist/              # 前端构建产物（setup.bat / start.bat 自动构建，已 gitignore）
├── tests/
│   ├── unit/                   # 单元测试（7 个文件）
│   └── integration/
├── .github/workflows/
│   ├── ci.yml                  # 测试 + lint
│   └── docker-build.yml        # 镜像构建与推送
├── .env.example
├── requirements.txt            # 运行时依赖（uv export 生成：仅后端依赖）
├── requirements-dev.txt        # 测试/lint 依赖（uv export 生成）
├── requirements-coin11tb-docker.txt  # 任务脚本依赖（uv export 生成：coin11tb 组，torch 除外）
├── Dockerfile
├── docker-compose.yml
├── setup.bat / setup.ps1       # 环境一键初始化（幂等）
├── start.bat / start.ps1       # 一键启动（uvicorn 8000 + 自动打开浏览器）
└── dev.bat / dev.ps1           # 开发模式（后端 reload + 前端 vite dev）
```

---

## ⚙️ 配置说明

复制 `.env.example` 为 `.env` 后按需修改：

```ini
HOST=0.0.0.0
PORT=8000
ADB_PATH=adb
CORS_ORIGINS=["http://localhost:6173","http://127.0.0.1:6173"]
COIN11_TB_REPO_URL=https://github.com/czl0325/coin11-tb.git

# 局域网网段覆盖值（可选）：自动探测失败或探测到非局域网网段时回退
# LAN_SUBNET_OVERRIDE=192.168.1

# WebSocket 鉴权令牌 —— ⚠️ 见下方警告，勿随意修改
WS_AUTH_TOKEN=coin11-control-token

# API 鉴权令牌（可选）：留空则 /api 完全开放（本地单用户场景）
# 设置后所有 /api/* 需携带 Authorization: Bearer *** 或 X-API-Token
# /api/health 始终豁免，供健康检查使用
API_AUTH_TOKEN=

# 日志级别：DEBUG / INFO / WARNING / ERROR
LOG_LEVEL=INFO
```

### ⚠️ 关于 `WS_AUTH_TOKEN`

前端令牌在**构建期**由 `frontend/.env.local` 的 `VITE_WS_TOKEN` 注入（`frontend/.env.example`
默认 `coin11-control-token`，与后端默认一致）。若两端令牌不一致，后端会拒绝前端的
WebSocket 连接（close code 4001），表现为 **实时设备画面一直「等待画面传输」、日志不刷新**
—— 页面上没有任何错误提示，只在浏览器 console 里有一行日志。

因此：
- **本地使用（`HOST=127.0.0.1`，仅回环监听）**：保持默认值即可
- **对外暴露**：修改 `WS_AUTH_TOKEN` 后，需在 `frontend/.env.local` 设置
  `VITE_WS_TOKEN=<新值>` 并重新构建前端（`cd frontend && npm run build`，或重跑 `setup.bat`），
  否则实时功能不可用

### 🔒 对外暴露时的建议

本平台可完整控制已连接的安卓设备（执行脚本、读取屏幕），请勿在无鉴权状态下暴露到公网：

| 项目 | 建议 |
|------|------|
| `HOST` | 尽量保持 `127.0.0.1`；需远程访问时置于反向代理之后 |
| `API_AUTH_TOKEN` | 非回环监听时**必须**设置为强随机值 |
| `WS_AUTH_TOKEN` | 改为强随机值，并同步前端 `VITE_WS_TOKEN` 后重新构建（见上节） |
| `CORS_ORIGINS` | 明确列出来源，不要用 `"*"` |

---

## 🤝 贡献

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feat/xxx`）
3. 提交改动（`git commit -m "feat: xxx"`）
4. 推送到分支（`git push origin feat/xxx`）
5. 提交 Pull Request

---

## 📄 许可证

本项目基于 **MIT** 许可证开源。
