# ============================================
# Stage 1: Build Frontend (Vue 3 + Vite)
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# WS token 构建期注入前端 bundle。frontend/.env.local 被 .gitignore/.dockerignore 排除，
# CI 构建时不存在；缺了它前端会以空 token 连 WS → 后端 403（实时画面/日志终端全挂）。
# 必须与 Stage 2 的 WS_AUTH_TOKEN 保持一致。
ARG WS_AUTH_TOKEN=coin11-control-token
ENV VITE_WS_TOKEN=$WS_AUTH_TOKEN
# 完整构建 = vue-tsc 类型检查 + vite build。frontend 已并入 monorepo（frontend/），
# 类型错误由前端侧修复，这里不再用 npx vite build 绕过检查。
RUN npm run build

# ============================================
# Stage 2: Backend (FastAPI)
# ============================================
FROM python:3.12-slim

WORKDIR /app

# 与 Stage 1 注入前端 bundle 的 token 同源，镜像内前后端默认配对（WS 鉴权通过）
ARG WS_AUTH_TOKEN=coin11-control-token
ENV WS_AUTH_TOKEN=${WS_AUTH_TOKEN}

# 系统依赖:
#   git                          -> repo_manager 运行时 clone/更新 coin11-tb 上游仓库
#   android-tools-adb            -> 设备通信（容器只支持 WiFi ADB，见 docker-compose 注释）
#   libgl1/libglib2.0-0/libgomp1 -> coin11-tb 脚本的 opencv-python / numpy 运行时系统库
#   tesseract-ocr                -> pytesseract 只是 Python 包装层，OCR 需要这个二进制
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        android-tools-adb \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# 后端运行时依赖（不含测试依赖；requirements-dev.txt 不装入镜像）
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ---- coin11-tb 脚本运行时依赖 ----
# coin11_tb/ 目录由 repo_manager 在运行时 clone（被 .gitignore 忽略，构建时不存在），
# 因此无法在构建期 COPY 它的 requirements.txt，这里用 requirements-coin11tb-docker.txt
#（由 pyproject.toml 的 coin11tb 依赖组经 uv export 生成，torch 除外）。
#
# ⚠️ 这些依赖是【必需】的，不是可选项：
#    coin11_tb/utils.py 在模块顶层 import cv2/numpy/ddddocr/torch/easyocr/PIL/uiautomator2，
#    且在 import 期就构造 easyocr.Reader(['ch_sim','en'])；
#    全部 14 个任务脚本 + launcher 都 import utils。
#    少装任何一个 → 容器内所有脚本在 import 阶段就 ImportError，任务 100% 失败。
#
# torch/torchvision 必须先从 CPU-only 源安装（PyPI 默认是 CUDA 构建，会连带
# nvidia-* 依赖多占 ~2GB）；预装后，requirements 文件中的同名钉版即视为已满足。
# 若只需要 API/设备管理而不在容器内跑脚本，用 --build-arg WITH_SCRIPT_DEPS=0 构建精简镜像。
ARG WITH_SCRIPT_DEPS=1
COPY requirements-coin11tb-docker.txt ./
RUN if [ "$WITH_SCRIPT_DEPS" = "1" ]; then \
        pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
            torch==2.14.1 torchvision==0.29.1 && \
        pip install --no-cache-dir -r requirements-coin11tb-docker.txt; \
    else \
        echo "[build] WITH_SCRIPT_DEPS=0 —— 跳过脚本依赖，容器内无法执行 coin11-tb 任务"; \
    fi

# 非 root 运行（容器内只使用 WiFi ADB，无需 USB 透传）
# 必须先建用户，再 chown —— 否则 chown 会因用户不存在而使构建失败。
RUN useradd --create-home --uid 10001 app

# 复制后端代码。注意 frontend/ 必须留在 build context 里（stage 1 要用），
# 所以不能在 .dockerignore 里排除它 —— 这里复制后显式删掉前端源码，
# 后端镜像只需要 stage 1 产出的 frontend-dist/。
COPY . ./
RUN rm -rf frontend

# 复制前端构建产物到 /app/frontend-dist。
# 注意：vite outDir = ../frontend-dist（相对 WORKDIR /app/frontend），
# 所以产物在 builder 阶段的 /app/frontend-dist，不是 /app/frontend/dist。
COPY --from=frontend-builder /app/frontend-dist /app/frontend-dist

# 运行期数据目录：coin11_tb 克隆、auto_task_settings.json 放在这里，
# 由 docker-compose 用命名卷持久化（重建容器不丢失）。
RUN mkdir -p /app/data && chown -R app:app /app/data

USER app

# 生产环境配置
# 注意：CORS_ORIGINS 不要设 "*"（应用层会因此强制关闭 allow_credentials）。
# 请用 compose/.env 覆写为实际来源，例如 ["http://localhost:6173"]。
# WS_AUTH_TOKEN / API_AUTH_TOKEN 同理：务必覆写为强随机值，不要使用应用弱默认值。
ENV HOST=0.0.0.0 \
    PORT=8000 \
    ADB_PATH=adb \
    COIN11_TB_PATH=/app/data/coin11_tb \
    AUTO_TASK_SETTINGS_FILE=/app/data/auto_task_settings.json

# 健康检查：镜像基于 python:3.12-slim 无 curl，用 python 探活（与 docker-compose healthcheck 同款）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
