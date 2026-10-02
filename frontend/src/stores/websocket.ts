import { defineStore } from 'pinia'
import { ref, computed, markRaw } from 'vue'
import type { WSMessage, DeviceStatus } from '@/types'
import { useDeviceStore } from '@/stores/devices'

const MAX_RECONNECT_ATTEMPTS = 5
/** 单设备日志缓冲上限（条） */
export const MAX_LOG_MESSAGES = 2000
const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * 每台设备的消息通道：按类型分桶存储。
 * - logs：日志缓冲（上限 MAX_LOG_MESSAGES 条，超出后从头部裁剪）
 * - logSeq：累计写入的日志条数，只增不减；裁剪不会让它回退
 * - logDropped：累计被裁剪丢弃的日志条数
 * - lastScreenshot：仅保留最新一帧截图（screenshot / screencast）
 * - lastStatus / lastError：只保留最新值
 * 避免把大体积 base64 截图全量堆积在内存里。
 *
 * 为什么需要 logSeq / logDropped：日志数组长度到达上限后恒定不变，
 * 不能再用长度当"有新日志"的变更信号 —— 这正是历史上
 * "日志超过 2000 行后界面永久停更"的根因。
 * 消费方（LogViewer）以 logSeq 作为 watch 依赖，用 logDropped 校正绝对游标。
 * 不变式：logSeq - logDropped === logs.length，且 logs[i] 的绝对序号为 logDropped + i。
 */
export interface DeviceChannel {
  logs: WSMessage[]
  logSeq: number
  logDropped: number
  lastScreenshot: WSMessage | null
  lastStatus: WSMessage | null
  lastError: string | null
}

function createChannel(): DeviceChannel {
  return {
    // markRaw：日志数组不进入响应式代理，避免上千条消息对象被逐个包装。
    // 变更通知由 logSeq 承担；因此 deviceLogs() 返回的数组本身不是响应式的，
    // 不要对它做 deep watch —— 要感知新日志请 watch logSeq。
    logs: markRaw([] as WSMessage[]),
    logSeq: 0,
    logDropped: 0,
    lastScreenshot: null,
    lastStatus: null,
    lastError: null,
  }
}

/** 后端状态消息 → DeviceStatus 映射（后端可能发送 idle/running 等） */
function mapStatus(raw: string): DeviceStatus | null {
  switch (raw) {
    case 'online':
    case 'idle':
      return 'online'
    case 'busy':
    case 'running':
      return 'busy'
    case 'offline':
      return 'offline'
    default:
      return null
  }
}

/** 从环境变量读取 WS 鉴权 token；缺失时明确报错但仍发起连接，让后端鉴权失败可见 */
function resolveWsToken(): string {
  const token = import.meta.env.VITE_WS_TOKEN
  if (!token) {
    console.error(
      '[WS] 未配置 VITE_WS_TOKEN：请在项目根目录的 .env.local 中设置 ' +
        'VITE_WS_TOKEN=<后端约定的 token>（可参考 .env.example）。' +
        '当前将以空 token 发起连接，后端鉴权预期会失败。',
    )
    return ''
  }
  return token
}

export const useWebSocketStore = defineStore('websocket', () => {
  // ── State ──
  const connections = ref<Map<string, WebSocket>>(new Map())
  const connectedDevices = ref<Set<string>>(new Set())
  const reconnectAttempts = ref<Map<string, number>>(new Map())
  const reconnectTimers = ref<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const heartbeatTimers = ref<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const channels = ref<Map<string, DeviceChannel>>(new Map())
  // 已注入的历史日志行（deviceId -> Set<去重键>），去重键见 seedKey()。
  // 用于"后端 WS 回放"与"前端 fetchQueue 注入"双通道去重，防止历史日志重复显示。
  const seededLines = ref<Map<string, Set<string>>>(new Map())
  // 连接代际：每次 connect/disconnect 递增，用于废弃过期连接的回调
  // （修复 disconnect 与重连定时器竞态导致的"幽灵重连"）
  const generations = new Map<string, number>()

  // ── Getters ──
  const isConnected = computed(() => (deviceId: string) =>
    connectedDevices.value.has(deviceId),
  )

  /** 当前日志缓冲（非响应式数组，需配合 logSeq 使用） */
  const deviceLogs = computed(() => (deviceId: string) =>
    channels.value.get(deviceId)?.logs ?? [],
  )

  /** 累计写入的日志条数（只增不减，作为"有新日志"的变更信号） */
  const logSeq = computed(() => (deviceId: string) =>
    channels.value.get(deviceId)?.logSeq ?? 0,
  )

  /** 累计被裁剪丢弃的日志条数（消费方用它把绝对游标校正到缓冲首行） */
  const logDropped = computed(() => (deviceId: string) =>
    channels.value.get(deviceId)?.logDropped ?? 0,
  )

  const lastScreenshot = computed(() => (deviceId: string) =>
    channels.value.get(deviceId)?.lastScreenshot ?? null,
  )

  const lastStatus = computed(() => (deviceId: string) =>
    channels.value.get(deviceId)?.lastStatus ?? null,
  )

  const lastError = computed(() => (deviceId: string) =>
    channels.value.get(deviceId)?.lastError ?? null,
  )

  /** 指数退避: 1s → 2s → 4s → 8s → 16s */
  function getBackoffDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 16000)
  }

  function getChannel(deviceId: string): DeviceChannel {
    let channel = channels.value.get(deviceId)
    if (!channel) {
      channels.value.set(deviceId, createChannel())
      // 取回响应式代理后的实例，保证对 logSeq 等标量字段的写入能触发依赖
      channel = channels.value.get(deviceId)!
    }
    return channel
  }

  /**
   * 唯一的日志写入口：追加一条日志并维护 logSeq / logDropped。
   * 所有日志写入（实时收包与历史注入）都必须走这里，
   * 否则序号与裁剪计数会失配，消费方游标随之错位。
   */
  function appendLog(channel: DeviceChannel, msg: WSMessage): void {
    channel.logs.push(msg)
    channel.logSeq += 1
    if (channel.logs.length > MAX_LOG_MESSAGES) {
      const removed = channel.logs.length - MAX_LOG_MESSAGES
      channel.logs.splice(0, removed)
      channel.logDropped += removed
    }
  }

  function getSeedSet(deviceId: string): Set<string> {
    let set = seededLines.value.get(deviceId)
    if (!set) {
      set = new Set()
      seededLines.value.set(deviceId, set)
    }
    return set
  }

  /**
   * 历史日志去重键：(taskId, 行文本)。
   *
   * 取舍说明：去重粒度从"按任务"细化到"按任务 + 行文本"后，
   * 同一任务的多行历史日志能全部注入，任务后续新增的行也能继续注入；
   * 代价是同一任务内**完全相同**的重复行会被折叠成一条
   * （例如脚本连续输出两行一模一样的内容，只会显示一条）。
   * 这是为了让 WS 回放与 fetchQueue 两条通道互相去重而接受的取舍 ——
   * 两条通道对同一行没有稳定的行号可用，只能以文本作为身份。
   */
  function seedKey(taskId: string, text: string): string {
    return `${taskId}\u0000${text}`
  }

  /**
   * 解析历史回放日志的 data。
   * 后端 WS 回放与前端 fetchQueue 注入的 data 均为 JSON 字符串
   * {"task_id":..., "text":...}，此处解析并返回 taskId/text。
   */
  function parseReplayLog(data: string): { taskId: string; text: string } | null {
    if (typeof data !== 'string' || !data.startsWith('{')) return null
    try {
      const parsed = JSON.parse(data)
      if (parsed && typeof parsed.task_id === 'string' && typeof parsed.text === 'string') {
        return { taskId: parsed.task_id, text: parsed.text }
      }
    } catch { /* 不是合法 JSON，按普通日志处理 */ }
    return null
  }

  /**
   * 注入单条历史日志（带去重）。
   * 同一设备下同一 (任务, 行文本) 只注入一次，返回是否实际注入。
   * 供后端 WS 回放（receiveMessage）与前端 fetchQueue 兜底注入共用，
   * 保证历史 + 实时日志不重复、不遗漏。
   */
  function seedLog(deviceId: string, taskId: string, text: string): boolean {
    if (!taskId || !text) return false
    const seeded = getSeedSet(deviceId)
    const key = seedKey(taskId, text)
    if (seeded.has(key)) return false
    seeded.add(key)
    appendLog(getChannel(deviceId), {
      type: 'log',
      device_id: deviceId,
      data: JSON.stringify({ task_id: taskId, text }),
    })
    return true
  }

  // ── Actions ──

  /**
   * 收包入口：WebSocket onmessage 与单元测试共用。
   * 按消息类型分桶存储，并接线设备状态实时更新。
   */
  function receiveMessage(deviceId: string, msg: WSMessage): void {
    if (msg.device_id && msg.device_id !== deviceId) {
      console.warn(`[WS] ${deviceId}: 忽略来自设备 ${msg.device_id} 的消息`)
      return
    }
    const channel = getChannel(deviceId)
    switch (msg.type) {
      case 'log': {
        // 识别带 task_id 的历史回放消息（后端 WS 连接时回放）。
        // 与 fetchQueue 注入共用 seedLog 去重，避免重复显示。
        const parsed = parseReplayLog(msg.data)
        if (parsed) {
          seedLog(deviceId, parsed.taskId, parsed.text)
        } else {
          appendLog(channel, msg)
        }
        break
      }
      case 'screenshot':
      case 'screencast':
        // 画面只消费最新一帧，历史帧不保留
        channel.lastScreenshot = msg
        break
      case 'status': {
        channel.lastStatus = msg
        const mapped = mapStatus(msg.data)
        if (mapped) {
          useDeviceStore().updateDeviceStatus(deviceId, mapped)
        }
        break
      }
      case 'error':
        channel.lastError = msg.data
        break
      case 'pong':
        // 心跳应答，无需存储
        break
    }
  }

  function buildUrl(deviceId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const token = resolveWsToken()
    return `${protocol}//${host}/ws/device/${encodeURIComponent(deviceId)}?token=${encodeURIComponent(token)}`
  }

  function startHeartbeat(deviceId: string, ws: WebSocket): void {
    stopHeartbeat(deviceId)
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ action: 'ping' }))
        } catch {
          // 发送失败由 onclose/onerror 兜底
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
    heartbeatTimers.value.set(deviceId, timer)
  }

  function stopHeartbeat(deviceId: string): void {
    const timer = heartbeatTimers.value.get(deviceId)
    if (timer) {
      clearInterval(timer)
      heartbeatTimers.value.delete(deviceId)
    }
  }

  function connect(deviceId: string): void {
    if (connectedDevices.value.has(deviceId)) return

    const attempts = reconnectAttempts.value.get(deviceId) ?? 0
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[WS] ${deviceId}: 已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})`)
      return
    }

    const gen = (generations.get(deviceId) ?? 0) + 1
    generations.set(deviceId, gen)

    const ws = new WebSocket(buildUrl(deviceId))

    ws.onopen = () => {
      if (generations.get(deviceId) !== gen) {
        ws.close()
        return
      }
      console.log(`[WS] ${deviceId}: 已连接`)
      reconnectAttempts.value.set(deviceId, 0)
      connections.value.set(deviceId, ws)
      connectedDevices.value.add(deviceId)
      startHeartbeat(deviceId, ws)
    }

    ws.onmessage = (event: MessageEvent) => {
      if (generations.get(deviceId) !== gen) return
      try {
        receiveMessage(deviceId, JSON.parse(event.data) as WSMessage)
      } catch {
        console.warn(`[WS] ${deviceId}: 消息解析失败`)
      }
    }

    ws.onclose = () => {
      if (generations.get(deviceId) !== gen) return
      console.log(`[WS] ${deviceId}: 连接关闭`)
      stopHeartbeat(deviceId)
      connections.value.delete(deviceId)
      connectedDevices.value.delete(deviceId)

      // 自动重连（指数退避）
      const currentAttempts = reconnectAttempts.value.get(deviceId) ?? 0
      if (currentAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getBackoffDelay(currentAttempts)
        console.log(`[WS] ${deviceId}: ${delay / 1000}s 后尝试重连 (第 ${currentAttempts + 1} 次)`)
        reconnectAttempts.value.set(deviceId, currentAttempts + 1)
        const timer = setTimeout(() => {
          connect(deviceId)
        }, delay)
        reconnectTimers.value.set(deviceId, timer)
      }
    }

    ws.onerror = () => {
      console.error(`[WS] ${deviceId}: 连接错误`)
      ws.close()
    }
  }

  function disconnect(deviceId: string): void {
    // 递增代际，使所有在途回调（含重连定时器触发后的回调）失效
    generations.set(deviceId, (generations.get(deviceId) ?? 0) + 1)
    stopHeartbeat(deviceId)

    const timer = reconnectTimers.value.get(deviceId)
    if (timer) {
      clearTimeout(timer)
      reconnectTimers.value.delete(deviceId)
    }
    reconnectAttempts.value.delete(deviceId)

    const ws = connections.value.get(deviceId)
    if (ws) {
      ws.close()
      connections.value.delete(deviceId)
    }
    connectedDevices.value.delete(deviceId)
  }

  function send(deviceId: string, data: Record<string, unknown>): void {
    const ws = connections.value.get(deviceId)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    } else {
      console.warn(`[WS] ${deviceId}: 未连接，无法发送`)
    }
  }

  function disconnectAll(): void {
    for (const deviceId of [...connectedDevices.value]) {
      disconnect(deviceId)
    }
  }

  /**
   * 清除某设备已注入历史日志的标记（设备切换 / 断开时调用）。
   * 避免切回设备时历史日志被去重而无法重新回放。
   */
  function clearSeeds(deviceId: string): void {
    seededLines.value.delete(deviceId)
  }

  /**
   * 清空某设备的消息通道（日志 / 画面 / 状态 / 错误全部重置）。
   * 同时清掉历史注入标记：通道里已经没有那些行了，
   * 若保留标记，后续回放会被误判为重复而永久丢失
   * （与 clearSeeds 的语义保持一致）。
   */
  function clearMessages(deviceId: string): void {
    channels.value.set(deviceId, createChannel())
    clearSeeds(deviceId)
  }

  return {
    // state
    connectedDevices,
    channels,
    seededLines,
    // getters
    isConnected,
    deviceLogs,
    logSeq,
    logDropped,
    lastScreenshot,
    lastStatus,
    lastError,
    // actions
    receiveMessage,
    seedLog,
    clearSeeds,
    connect,
    disconnect,
    send,
    disconnectAll,
    clearMessages,
  }
})
