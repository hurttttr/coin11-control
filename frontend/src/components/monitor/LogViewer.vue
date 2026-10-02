<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useWebSocketStore, MAX_LOG_MESSAGES } from '@/stores/websocket'
import type { WSMessage } from '@/types'
import Convert from 'ansi-to-html'
import DOMPurify from 'dompurify'

const props = defineProps<{
  deviceId: string
}>()

const wsStore = useWebSocketStore()
const logContainer = ref<HTMLDivElement | null>(null)
const autoScroll = ref(true)
const isPaused = ref(false)

// ANSI → HTML 转换器（日志终端配色）
const convert = new Convert({
  fg: '#00ff41',
  bg: '#060a14',
  escapeXML: true,
})

/** 格式化时间戳 */
function timestamp(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** 单条日志消息 → 安全的 HTML 行（含 ANSI 转义渲染） */
function toHtml(msg: WSMessage): string {
  let text = msg.data
  // 备用解析：如果 data 是 JSON 字符串，提取 text 字段
  if (typeof text === 'string' && text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed.text) text = parsed.text
    } catch { /* 不是 JSON，保持原样 */ }
  }
  const ts = text?.includes(' ') ? '' : `[${timestamp()}] `
  const html = convert.toHtml(`${ts}${text}`)
  return DOMPurify.sanitize(html)
}

// 已渲染行（HTML 字符串），增量追加避免每次全量重算。
// 同样按 MAX_LOG_MESSAGES 裁剪，与 store 缓冲保持一致。
const htmlLines = ref<string[]>([])
// 已消费到的绝对序号（对应 store 的 logSeq 计数系，不是数组下标）。
// 用绝对序号而非数组下标，是因为 store 到达上限后会从头部裁剪日志，
// 数组下标会整体左移，用下标做游标必然漏行或重复行。
let consumedSeq = 0

/** 重置已渲染内容（切换设备 / 清空日志） */
function resetRendered(): void {
  htmlLines.value = []
  consumedSeq = 0
}

watch(
  () => props.deviceId,
  () => {
    // 切换设备时重置
    resetRendered()
  },
)

watch(
  // 以 logSeq（只增不减的写入序号）作为变更信号。
  // 不能用 deviceLogs(...).length：日志到达上限后长度恒为 2000，
  // 长度不再变化会让 watcher 永久不触发（"超过 2000 行后界面停更"的根因）。
  () => wsStore.logSeq(props.deviceId),
  async (seq) => {
    const logs = wsStore.deviceLogs(props.deviceId)
    const dropped = wsStore.logDropped(props.deviceId)
    // 缓冲首行的绝对序号即 dropped；游标落后于它说明中间的行已被裁剪丢弃，
    // 直接跳到缓冲首行，避免读到错位的下标。
    if (consumedSeq < dropped) consumedSeq = dropped
    // store 被清空（clearMessages）时 seq 归零，本地渲染内容一并重置
    if (seq < consumedSeq) resetRendered()

    while (consumedSeq < seq) {
      htmlLines.value.push(toHtml(logs[consumedSeq - dropped]))
      consumedSeq++
    }
    if (htmlLines.value.length > MAX_LOG_MESSAGES) {
      htmlLines.value.splice(0, htmlLines.value.length - MAX_LOG_MESSAGES)
    }
    if (autoScroll.value && !isPaused.value) {
      await nextTick()
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    }
  },
  { immediate: true },
)

function handleScroll(): void {
  if (!logContainer.value) return
  const el = logContainer.value
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  autoScroll.value = isAtBottom
}

function togglePause(): void {
  isPaused.value = !isPaused.value
  if (!isPaused.value && logContainer.value) {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    })
  }
}

function clearLogs(): void {
  wsStore.clearMessages(props.deviceId)
  resetRendered()
}
</script>

<template>
  <div class="log-viewer">
    <div class="log-header">
      <span class="log-title">
        <span class="log-indicator" /> 终端日志
        <span class="log-conn-status" :class="{ connected: wsStore.isConnected(deviceId) }">
          {{ wsStore.isConnected(deviceId) ? '● 已连接' : '○ 未连接' }}
        </span>
      </span>
      <div class="log-controls">
        <span class="log-count">{{ htmlLines.length }} 行</span>
        <button
          class="btn-log"
          :class="{ active: isPaused }"
          @click="togglePause"
        >
          {{ isPaused ? '▶ 继续' : '⏸ 暂停' }}
        </button>
        <button class="btn-log" @click="clearLogs">
          ∅ 清空
        </button>
      </div>
    </div>
    <div
      ref="logContainer"
      class="log-content"
      @scroll="handleScroll"
    >
      <div v-if="htmlLines.length === 0" class="log-empty">
        <span class="log-cursor">█</span> 等待日志输出...
      </div>
      <div v-else class="log-lines">
        <div v-for="(line, idx) in htmlLines" :key="idx" class="log-line">
          <span class="line-number">{{ String(idx + 1).padStart(4, '0') }}</span>
          <!--
            ANSI 转义已由 ansi-to-html 转换、再经 DOMPurify.sanitize 清洗（见 toHtml），
            渲染富文本日志必须用 v-html，此处的 XSS 风险已由消毒环节消除。
          -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="line-content" v-html="line" />
        </div>
      </div>
      <!-- 暂停提示 -->
      <div v-if="isPaused && htmlLines.length > 0" class="scroll-hint">
        已暂停滚动
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-viewer {
  background: #0a0e1a;
  border: 1px solid rgba(0, 240, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(0, 240, 255, 0.04);
  border-bottom: 1px solid rgba(0, 240, 255, 0.08);
  flex-wrap: wrap;
  gap: 6px;
}

.log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--accent);
  font-weight: 500;
}

.log-indicator {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.log-conn-status {
  font-size: 10px;
  color: var(--error);
  font-weight: 400;
}

.log-conn-status.connected {
  color: var(--success);
}

.log-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-count {
  font-size: 11px;
  color: var(--text-muted);
}

.btn-log {
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-log:hover {
  border-color: var(--border-accent);
  color: var(--accent);
}

.btn-log.active {
  border-color: var(--warning);
  color: var(--warning);
}

.log-content {
  flex: 1;
  max-height: 500px;
  overflow-y: auto;
  padding: 10px 0;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 14px;
  line-height: 1.6;
  background: #060a14;
  position: relative;
}

.log-empty {
  padding: 20px 14px;
  color: var(--text-muted);
  font-size: 13px;
}

.log-cursor {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.log-lines {
  display: flex;
  flex-direction: column;
}

.log-line {
  display: flex;
  padding: 0 14px;
  transition: background 0.1s;
}

.log-line:hover {
  background: rgba(0, 240, 255, 0.03);
}

.line-number {
  color: rgba(148, 163, 184, 0.3);
  min-width: 48px;
  user-select: none;
  flex-shrink: 0;
}

.line-content {
  color: #00ff41;
  white-space: pre-wrap;
  word-break: break-all;
  text-shadow: 0 0 4px rgba(0, 255, 65, 0.3);
}

/* ANSI 转换器输出的前景色内联样式优先级更高，这里做兜底 */
.line-content :deep(span) {
  text-shadow: 0 0 4px rgba(0, 255, 65, 0.3);
}

.scroll-hint {
  position: sticky;
  bottom: 0;
  text-align: center;
  padding: 4px;
  font-size: 10px;
  color: var(--warning);
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
}
</style>
