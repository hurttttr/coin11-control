# Coin11-TB 控制平台前端

> coin11-control-frontend — coin11-tb 自动化任务系统的 Web 控制面板前端
> （已并入 [coin11-control](https://github.com/hurttttr/coin11-control) monorepo，位于仓库 `frontend/` 目录）

基于 **Vue 3 + TypeScript + Vite** 构建，通过 **WebSocket** 与后端实时通信，提供 Android 设备管理、自动化任务调度、实时设备画面预览和日志查看等功能。

> 本项目基于 [coin11-tb](https://github.com/czl0325/coin11-tb) 二次开发，后者提供了淘宝/支付宝/闲鱼等平台的自动化脚本。  
> 配套后端项目：[coin11-control](https://github.com/hurttttr/coin11-control)（前后端已合并为单仓库，后端位于 `app/`）

---

## 目录

- [项目简介](#项目简介)
- [截图预览](#截图预览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [功能说明](#功能说明)
  - [仪表盘](#仪表盘)
  - [设备管理](#设备管理)
  - [设备详情](#设备详情)
  - [任务队列](#任务队列)
  - [实时画面](#实时画面)
  - [日志终端](#日志终端)
  - [设置](#设置)
  - [版本更新](#版本更新)
- [路由说明](#路由说明)
- [WebSocket 通信](#websocket-通信)
- [开发说明](#开发说明)
- [构建部署](#构建部署)
- [许可协议](#许可协议)

---

## 项目简介

Coin11-TB 控制平台前端是一个面向 Android 设备自动化测试/运维场景的 Web 管理界面。它允许用户：

- **管理设备** — 查看设备在线状态、型号、Android 版本，支持 USB/WiFi 连接和断开
- **调度任务** — 为每台设备维护独立的自动化任务队列，支持拖拽排序、添加/移除任务、启停队列
- **实时监控** — 通过 WebSocket 流式传输设备截图和日志，实现远程设备画面预览和实时日志输出
- **全局管控** — 仪表盘提供设备统计和任务概览，全局任务列表支持跨设备管理

后端服务为 [coin11-control](https://github.com/hurttttr/coin11-control)（Python + FastAPI，与前端同仓库），前端通过 REST API 和 WebSocket 与之通信。

---

## 截图预览

| 页面 | 预览 |
|------|------|
| 仪表盘 | 设备卡片网格 + 统计卡片 + 任务概览 |
| 设备详情 | 实时画面 + 可拖拽任务队列 + 日志终端 |
| 任务列表 | 按设备分组的全部任务视图 |

> 项目采用暗色科技风主题（Dark Tech Theme），主色调 `#00f0ff`（青色）。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Vue 3 (Composition API) + TypeScript |
| **构建工具** | Vite 6 |
| **状态管理** | Pinia 3 |
| **路由** | Vue Router 4 (History 模式) |
| **样式方案** | Scoped CSS + CSS 自定义属性（暗色主题），无 CSS 框架 |
| **实时通信** | 原生 WebSocket (无第三方库) |
| **拖拽排序** | vuedraggable 4 (基于 SortableJS) |
| **HTML 渲染** | ansi-to-html (日志 ANSI 转义) + DOMPurify (安全过滤) |
| **单元测试** | Vitest + Vue Test Utils + happy-dom |
| **代码检查** | ESLint 10 (flat config) + eslint-plugin-vue + typescript-eslint |
| **包管理** | npm |

---

## 快速开始

### 环境要求

- **Node.js** >= 20.19（ESLint 10 要求 `^20.19.0 || ^22.13.0 || >=24`）
- **npm** >= 9.x

### 安装与启动

```bash
# 1. 克隆 monorepo 仓库
git clone https://github.com/hurttttr/coin11-control.git
cd coin11-control/frontend

# 2. 安装依赖
npm install

# 3. 配置环境变量（WebSocket 鉴权 token）
cp .env.example .env.local

# 4. 启动开发服务器（默认端口 6173）
npm run dev
```

启动后访问 `http://localhost:6173` 即可打开控制面板。

> **必须配置 `.env.local`**：`VITE_WS_TOKEN` 需与后端保持一致，源码中没有内置默认值。
> 未配置时前端会在控制台报错并以空 token 发起连接，后端鉴权将失败，表现为设备画面与日志始终为空。

> **提示**：开发服务器已配置代理，`/api/*` 请求转发至 `http://localhost:8000`，`/ws/*` 转发至 `ws://localhost:8000`。请确保后端服务已启动（仓库根 `dev.bat` / `start.bat`，或 `uv run uvicorn app.main:app --reload --port 8000`）。

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（热重载） |
| `npm run build` | TypeScript 类型检查 + 生产构建 |
| `npm run typecheck` | 仅执行 TypeScript 类型检查 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run preview` | 本地预览生产构建产物 |
| `npm run test` | 运行单元测试（Vitest） |

---

## 项目结构

```
frontend/（monorepo 仓库根为 coin11-control）
├── index.html                       # HTML 入口
├── vite.config.ts                   # Vite 配置（代理、别名、版本号注入）
├── tsconfig.json                    # TypeScript 配置
├── eslint.config.js                 # ESLint flat config
├── package.json                     # 依赖 & 脚本
├── env.d.ts                         # 类型声明（.vue / vuedraggable / ansi-to-html、环境变量）
├── .env.example                     # 环境变量示例（复制为 .env.local 使用）
├── public/                          # 静态资源
│   └── vite.svg
├── （构建产物输出至仓库根 ../frontend-dist/，不在本目录）
└── src/
    ├── main.ts                      # Vue 应用入口（创建 Pinia + Router）
    ├── App.vue                      # 根组件（挂载 AppLayout）
    ├── assets/
    │   └── styles/
    │       └── global.css           # 全局样式（浏览器重置 + 主题变量 + 共享类）
    ├── router/
    │   └── index.ts                 # Vue Router 路由配置（4 条路由 + 404 兜底）
    ├── stores/                      # Pinia 状态管理
    │   ├── devices.ts               # 设备状态（列表、连接/断开、轮询）
    │   ├── tasks.ts                 # 任务状态（队列 CRUD、排序、启停、批量操作）
    │   ├── websocket.ts             # WebSocket 连接管理（多设备、自动重连）
    │   └── update.ts                # 版本更新管理（检查、拉取、消除）
    ├── composables/
    │   └── useDialog.ts             # 弹窗可访问性（aria、Escape、焦点陷阱与归还）
    ├── utils/
    │   ├── api.ts                   # 统一请求封装（错误归一化、detail 提取）
    │   └── taskStatus.ts            # 任务状态 → 文案/样式类/图标 映射
    ├── types/
    │   └── index.ts                 # TypeScript 类型定义（设备、任务、WS 消息）
    ├── views/                       # 页面级组件
    │   ├── DashboardView.vue        # 仪表盘（设备概览 + 统计卡片 + 任务概览）
    │   ├── DeviceDetailView.vue     # 设备详情（画面 + 队列 + 日志）
    │   ├── TaskListView.vue         # 全局任务列表（按设备分组 + 批量操作）
    │   └── SettingsView.vue         # 设置（设备连接后自动运行的任务）
    ├── components/
    │   ├── layout/                  # 布局组件
    │   │   ├── AppLayout.vue        # 主布局（侧边栏 + 内容区 + 路由视图）
    │   │   └── SideNav.vue          # 侧边导航（仪表盘/任务列表/设置）
    │   ├── device/                  # 设备相关组件
    │   │   ├── DeviceCard.vue       # 设备卡片（状态、型号、连接方式、断开按钮）
    │   │   └── DeviceGrid.vue       # 设备网格（卡片列表 + 远程连接 + ADB 配对）
    │   ├── task/                    # 任务相关组件
    │   │   ├── TaskQueue.vue        # 任务队列（拖拽 / 上移下移排序、启停、清空）
    │   │   ├── ScriptSelector.vue   # 脚本选择弹窗
    │   │   ├── BatchTaskDialog.vue  # 批量分配任务弹窗
    │   │   ├── BatchDeviceDialog.vue # 批量启动/暂停队列弹窗
    │   │   ├── DevicePickerList.vue # 设备多选列表（批量弹窗共用）
    │   │   └── BatchResult.vue      # 批量操作结果展示
    │   ├── monitor/                 # 监控组件
    │   │   ├── ScreenViewer.vue     # 实时设备画面（WebSocket 截图流）
    │   │   └── LogViewer.vue        # 实时日志终端（自动滚动、暂停/继续）
    │   └── common/                  # 通用组件
    │       ├── StatusIndicator.vue  # 状态指示灯（在线/离线/忙碌 + 脉冲动画）
    │       ├── UpdateBanner.vue     # 版本更新横幅
    │       └── ErrorBanner.vue      # 错误提示横幅（可关闭 / 可重试）
    └── __tests__/                   # 单元测试
        ├── DeviceCard.spec.ts
        ├── DeviceGrid.spec.ts
        ├── LogViewer.spec.ts
        ├── SettingsView.spec.ts
        ├── TaskQueue.spec.ts
        ├── a11y/                    # 可访问性专项测试
        │   ├── dialogs.spec.ts
        │   ├── focusTrap.spec.ts
        │   └── taskReorder.spec.ts
        └── stores/
            ├── devices.spec.ts
            ├── tasks.seedLogs.spec.ts
            └── websocket.spec.ts
```

---

## 功能说明

### 仪表盘

仪表盘（`/`）是登录后的默认页面，包含三个区域：

1. **统计卡片** — 在顶部展示四组数据：
   - 在线设备数（绿色）
   - 忙碌设备数（蓝色）
   - 离线设备数（红色）
   - 活跃任务数（黄色，= 运行中 + 等待中）

2. **设备列表** — 以自适应网格布局展示所有设备卡片。每张卡片显示：
   - 状态指示灯（在线/离线/忙碌，带脉冲动画）
   - 设备型号和序列号
   - 连接方式（USB/WiFi）
   - Android 版本
   - 悬停显示的断开按钮
   - 点击卡片跳转至设备详情页

3. **任务概览** — 显示全部任务的统计分布：等待中、运行中、已完成、失败。

### 设备管理

在仪表盘底部的 **DeviceGrid** 组件中，提供：

- **远程连接** — 网段由 `GET /api/devices/network-info` 自动预填，只需输入 IP 最后一段与端口（默认 `5555`），前端拼成完整 `IP:Port` 后通过 `POST /api/devices/connect` 发起 ADB WiFi 连接；直接粘贴完整地址同样兼容
- **ADB 配对** — 点击"配对"弹窗输入 IP 最后一段（网段已预填）、配对端口与 6 位配对码，通过 `POST /api/devices/pair` 完成无线调试配对；表单缺字段时红字提示具体原因
- **自动轮询** — 每 10 秒自动刷新设备列表（通过 `GET /api/devices`）
- **手动刷新** — 点击刷新按钮立即拉取
- **断开设备** — 悬停设备卡片时显示"断开"按钮

### 设备详情

设备详情页（`/device/:id`）是核心操作界面，布局分为三块：

- **左侧** — 实时设备画面（ScreenViewer）
- **右侧** — 任务队列管理（TaskQueue）
- **底部全宽** — 实时日志终端（LogViewer）

页面顶部显示设备型号、序列号、状态指示灯、Android 版本和连接方式。

### 任务队列

**TaskQueue** 组件为每台设备维护独立的自动化任务队列：

- **添加任务** — 点击"添加任务"弹出脚本选择器（从后端获取可用脚本列表），选择后自动入队
- **拖拽排序** — 使用 `vuedraggable`，通过拖拽手柄（⠿）调整任务执行顺序，自动同步至后端
- **上移/下移** — 每行提供 ↑/↓ 按钮，作为拖拽的键盘等价操作（首项 ↑、末项 ↓ 自动禁用）
- **任务状态标签** — 每个任务显示状态徽标：
  - ⏳ 等待中（黄色）
  - ⟳ 运行中（蓝色，带旋转动画）
  - ✓ 已完成（绿色）
  - ✕ 失败（红色）
- **队列控制** — 工具栏提供："开始执行"（启动队列）、"停止"（停止队列）、"清空已完成"（移除已完成任务）
- **移除任务** — 每行右侧的 ✕ 按钮可单独移除任务

任务数据通过 REST API 和后端同步，同时 WebSocket 推送的状态变更会实时更新 UI。

全局任务列表页（`/tasks`）按设备分组展示全部任务，并提供**批量操作**：批量分配任务、
批量启动队列、批量暂停队列。批量弹窗中可多选在线设备，执行后展示每台设备的成功/失败结果。

### 实时画面

**ScreenViewer** 组件通过 WebSocket 接收服务端推送的截图数据：

- 自动检测图片格式（PNG/JPEG）
- 以 16:9 比例显示设备屏幕画面
- 画面角落显示设备状态标签（online/busy/idle/running）
- 连接等待时显示加载动画
- WebSocket 断开时显示"等待设备连接..."

### 日志终端

**LogViewer** 组件提供类终端的实时日志查看体验：

- 深色终端风格背景（`#0a0e1a`），等宽字体（JetBrains Mono / Fira Code）
- 绿色日志文本（`#00ff41`，带发光效果），模拟经典终端
- **ANSI 转义渲染** — 日志中的颜色/样式转义码通过 `ansi-to-html` 转为内联样式，并经 DOMPurify 清洗防 XSS
- 增量渲染 — 新日志只追加新行，不重算历史行
- 自动滚动到底部（跟随新日志输出）
- **暂停/继续** — 点击暂停按钮冻结滚动，方便回溯查看
- **清空** — 一键清除当前日志缓冲区
- 行号显示 + 时间戳标注
- WebSocket 连接状态指示（● 已连接 / ○ 未连接）

### 设置

设置页（`/settings`）用于配置**设备连接后自动运行的任务**：

- 勾选一个或多个脚本，设备连接成功后由后端自动入队并启动执行
- 通过 `GET/PUT /api/settings/auto-tasks` 读写配置
- 勾选项支持键盘操作（Tab 聚焦 + Space 切换）

### 版本更新

**UpdateBanner** 组件在页面顶部显示版本更新提示：

- 自动检查后端是否有新版本（`GET /api/update/check`）
- 显示落后提交数和最新 commit hash
- **立即更新** — 调用 `POST /api/update/pull` 触发后端更新拉取
- **关闭** — 可消除本次更新提示

此外，**ErrorBanner** 组件在各页面顶部展示接口失败原因（尽可能透出后端返回的 `detail`），
可关闭、部分场景提供重试按钮；出现新错误时会重新显示。

---

## 路由说明

| 路径 | 名称 | 页面 | 说明 |
|------|------|------|------|
| `/` | dashboard | DashboardView | 仪表盘（默认页） |
| `/device/:id` | device-detail | DeviceDetailView | 设备详情（serial 作为 ID） |
| `/tasks` | tasks | TaskListView | 全局任务列表 |
| `/settings` | settings | SettingsView | 设置（自动任务多选） |
| `/:pathMatch(.*)*` | — | 重定向至 `/` | 404 兜底 |

所有路由使用 **History 模式**（`createWebHistory`），URL 中不含 `#`。

---

## WebSocket 通信

### 连接机制

前端使用**原生 WebSocket**（非第三方库）与后端建立实时通信。每台设备维护独立的 WebSocket 连接。

```
ws://<host>/ws/device/<device_id>?token=<token>
```

- 连接地址自动根据页面协议选择 `ws://` 或 `wss://`
- 开发环境下 `/ws/*` 请求通过 Vite 代理转发至 `ws://localhost:8000`
- token 由环境变量 `VITE_WS_TOKEN` 提供，源码中没有内置默认值（见 `.env.example`）。
  未配置时 store 会在控制台报错指明配置方式，并以空 token 发起连接，使后端鉴权失败可见，而非静默重试

### 心跳保活

- 每个连接每 **30 秒** 发送一次 `{ action: 'ping' }` 心跳
- 用于穿透代理超时、及时发现静默断开的连接（如设备休眠唤醒后）

### 自动重连

- 采用**指数退避**策略：1s → 2s → 4s → 8s → 16s（最大间隔 16 秒）
- 最多重试 **5 次**，超出后停止重连
- 页面离开设备详情时自动断开连接（`onUnmounted`）
- 断开/重连使用代际（generation）计数，避免竞态导致"幽灵重连"

### 消息格式

所有消息均为 JSON 格式：

```typescript
interface WSMessage {
  type: 'log' | 'screenshot' | 'screencast' | 'status' | 'error' | 'pong'
  device_id: string
  data: string
}
```

| 消息类型 | 说明 | data 内容 |
|----------|------|-----------|
| `screenshot` | 设备截图 | Base64 编码的图片数据（PNG/JPEG） |
| `screencast` | 持续截图流 | Base64 编码的图片数据 |
| `log` | 实时日志行 | 日志文本（支持 ANSI 转义序列） |
| `status` | 设备状态变化 | 状态字符串（如 `online`/`busy`/`idle`/`running`） |
| `error` | 错误信息 | 错误描述文本 |
| `pong` | 心跳回复 | — |

### 发送消息

前端可通过 WebSocket 发送控制指令：

```typescript
wsStore.send(deviceId, { action: 'screenshot' })    // 请求截图
wsStore.send(deviceId, { action: 'ping' })          // 心跳检测
```

### 消息存储（分桶）

消息按类型分桶存储，避免大体积数据堆积：

| 类型 | 存储方式 |
|------|----------|
| `log` | 日志缓冲，上限 **2000 条**，超出丢弃最旧（配合 `logSeq` / `logDropped` 计数，见下） |
| `screenshot` / `screencast` | **仅保留最新一帧**（历史帧不缓存） |
| `status` | 仅保留最新值，并同步更新设备列表状态 |
| `error` | 仅保留最新错误信息 |
| `pong` | 心跳应答，不存储 |

消息会校验 `device_id`，与当前通道不一致的消息会被丢弃。

日志通道额外维护两个计数器：`logSeq`（累计写入条数，只增不减）与 `logDropped`（累计被裁剪条数），
不变式为 `logSeq - logDropped === logs.length`。消费方以 `logSeq` 作为变更依赖、用 `logDropped` 校正绝对游标——
因为缓冲到达上限后数组长度恒定，仅凭长度无法感知新日志。日志数组本身不是响应式的，请勿对它做深度监听。

后端在 WebSocket 连接时会回放历史日志，前端拉取队列时也会注入任务的历史日志（`Task.log`），
两条通道以 `(task_id, 行文本)` 为键互相去重。代价是同一任务内**完全相同**的重复行会被折叠为一条。

---

## 开发说明

### TypeScript

- 项目全程使用 **TypeScript**（`strict: true`，编译目标 `ES2022`）
- 类型定义集中在 `src/types/index.ts`
- 使用 `@` 路径别名指向 `src/` 目录（在 `vite.config.ts` 和 `tsconfig.json` 中配置）
- 状态管理中全部使用类型化的 `ref`、`computed` 和 Pinia store

### Vue 3 Composition API

- 全部组件使用 `<script setup lang="ts">` 语法
- 组合式 API 风格，无 Options API 混用
- `defineProps`/`defineEmits` 使用泛型约束类型安全

### Pinia 状态管理

四个独立 Store：

| Store | 职责 | 核心数据 |
|-------|------|----------|
| `useDeviceStore` | 设备列表管理 | `devices`、`loading`、轮询定时器 |
| `useTaskStore` | 任务队列管理 | `taskQueues`、`scripts`、增删改查、批量操作 |
| `useWebSocketStore` | WebSocket 连接管理 | `connections`、分桶消息通道、重连/心跳 |
| `useUpdateStore` | 版本更新管理 | `updateInfo`、检查/拉取/消除 |

Store 之间通过 `storeToRefs` 解构响应式数据，保持组件简洁。

### 请求与错误处理

- 所有接口调用统一走 `src/utils/api.ts` 的 `apiFetch`：网络错误与非 2xx 一律抛出 `Error`，
  并尽可能从响应体中提取后端的 `detail` 作为错误信息；204 与非 JSON 响应安全返回
- Store 捕获异常后写入自身的 `error` 状态，由页面级 `ErrorBanner` 展示；
  需要就地反馈的操作（如远程连接）才向调用方抛出

### 样式体系

- **无 CSS 框架** — 全部为手写 CSS。项目此前引入过 Tailwind，但从未使用其工具类，已移除；
  原先由 Tailwind preflight 提供的浏览器默认样式重置已逐条移植进 `global.css`
- **CSS 自定义属性** — 在 `global.css` 中定义暗色主题变量
- **共享样式类** — 跨页面复用的样式（`.card`、`.page-header`、`.btn-refresh`、任务状态徽标 `.badge-*` 等）
  集中在 `global.css`，组件内只保留差异化覆盖，避免每个路由重复下载同一份规则
- **Scoped CSS** — 组件级样式隔离（`<style scoped>`）
- 全站统一暗色科技风调色板

### 可访问性

- 弹窗（脚本选择、批量操作、ADB 配对）统一由 `useDialog` 提供 `role="dialog"`、`aria-modal`、
  `aria-labelledby`、Escape 关闭、焦点移入与归还、Tab 焦点陷阱
- 列表项与勾选项使用语义化元素（`<button>` / `<label>` 包裹原生 checkbox），可 Tab 聚焦、Enter/Space 触发
- 设备卡片的「进入详情」由铺满卡片的 `<router-link>` 承载，键盘可达且支持新标签页打开
- 任务队列除拖拽外提供上移/下移按钮作为键盘等价操作，移动后焦点保持在原按钮上
- 交互元素均有 `:focus-visible` 焦点环

### 单元测试

测试基于 **Vitest** + **Vue Test Utils** + **happy-dom**：

```bash
npm run test
```

现有 14 个测试文件、195 个用例：

| 测试文件 | 覆盖范围 |
|----------|----------|
| `DeviceCard.spec.ts` | 设备卡片渲染、导航与断开交互 |
| `DeviceGrid.spec.ts` | 远程连接、ADB 配对（含后端 detail 提示）、配对弹窗 |
| `TaskQueue.spec.ts` | 任务队列渲染和操作 |
| `LogViewer.spec.ts` | 日志终端渲染、ANSI 转义、缓冲上限行为 |
| `SettingsView.spec.ts` | 自动任务设置的加载/保存与错误提示 |
| `stores/devices.spec.ts` | 设备 Store（拉取、分组、轮询、错误传播） |
| `stores/websocket.spec.ts` | WebSocket Store（分桶存储、状态映射、设备隔离、日志计数） |
| `stores/tasks.seedLogs.spec.ts` | 历史日志注入与双通道去重 |
| `a11y/dialogs.spec.ts` | 弹窗 aria 语义、Escape 关闭、列表项键盘操作 |
| `a11y/focusTrap.spec.ts` | 焦点陷阱、焦点归还、勾选项键盘切换 |
| `a11y/taskReorder.spec.ts` | 上移/下移排序、边界禁用、移动后焦点保持 |

### 代码检查

```bash
npm run lint
```

ESLint 采用 flat config（`eslint.config.js`），以 `eslint-plugin-vue` 的 `flat/recommended`
与 typescript-eslint 的 `recommended` 为基础。刻意未启用 `recommended-type-checked`：
那套规则需要完整类型信息、会显著拖慢 CI，而类型安全已由 `npm run typecheck`（vue-tsc）把关。
项目没有引入 Prettier，因此纯格式类规则一律关闭，只保留语义类检查。

### 持续集成

monorepo 的 `.github/workflows/ci.yml` 含 `frontend-tests` job（push 到 `main`/`master`、PR 及手动触发时运行；前端源码位于仓库 `frontend/`）：

```
npm ci → npm run lint → npm run typecheck → npm run build → npm test
```

---

## 构建部署

### 生产构建

```bash
npm run build
```

该命令会依次执行：

1. `vue-tsc -b` — TypeScript 类型检查
2. `vite build` — Vite 生产构建

### 构建产物

构建结果输出至**仓库根** `../frontend-dist/` 目录（由后端 uvicorn 单端口托管）：

```
frontend-dist/
├── index.html
├── vite.svg
└── assets/
    ├── index-xxx.js               # 主入口（Vue、Pinia、Router 及共享代码）
    ├── index-xxx.css              # 全局样式（重置 + 主题变量 + 共享类）
    ├── DashboardView-xxx.{js,css} # 各路由按需加载的代码分割产物
    ├── DeviceDetailView-xxx.{js,css}
    ├── TaskListView-xxx.{js,css}
    ├── SettingsView-xxx.{js,css}
    └── ...                        # 被多路由共享的组件与工具各自成块
```

路由组件通过 `() => import(...)` 动态导入，因此每个页面及其样式都是独立 chunk，按需加载。

### 部署方式

构建产物为纯静态文件。**标准部署**是随 monorepo 单端口托管（`start.bat` / Docker，见仓库根 README）；以下为前端独立部署的备用方案（Nginx、Apache、Caddy 等）。

**Nginx 配置示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/dist;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://localhost:8000;
    }

    # WebSocket 反向代理
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> **提示**：生产部署时，`/api/` 和 `/ws/` 的反向代理需要指向后端服务（coin11-control 的 uvicorn，默认 8000 端口）。

---

## 许可协议

本项目基于 **MIT License** 开源，完整条款见仓库根目录的 [LICENSE](./LICENSE) 文件。

---

*Coin11-TB 控制平台前端 — 构建高效、直观的 Android 自动化设备管理体验。*
