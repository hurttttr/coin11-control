<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWebSocketStore } from '@/stores/websocket'

const props = defineProps<{
  deviceId: string
}>()

const wsStore = useWebSocketStore()
const screenshotUrl = ref<string | null>(null)
const deviceStatus = ref<string>('connecting')
const connectionError = ref<string | null>(null)

// 从首帧自动检测图片格式
function detectImageFormat(data: string): string {
  // base64 前几个字符检测: iVBORw0KGgo → PNG, /9j/ → JPEG
  if (data.startsWith('/9j/')) return 'image/jpeg'
  if (data.startsWith('iVBOR')) return 'image/png'
  return 'image/png'  // adb screencap -p 默认输出 PNG
}

// 只消费最新一帧截图（screenshot / screencast 均已分桶存储，无需全量扫描）
watch(
  () => wsStore.lastScreenshot(props.deviceId),
  (shot) => {
    if (shot) {
      const mime = detectImageFormat(shot.data)
      screenshotUrl.value = `data:${mime};base64,${shot.data}`
      connectionError.value = null
    }
  },
  { immediate: true },
)

// 设备状态（后端可能推送 online/busy/idle/running）
watch(
  () => wsStore.lastStatus(props.deviceId),
  (statusMsg) => {
    if (statusMsg) {
      deviceStatus.value = statusMsg.data
    }
  },
  { immediate: true },
)

// 错误消息
watch(
  () => wsStore.lastError(props.deviceId),
  (err) => {
    if (err) connectionError.value = err
  },
)

const isConnected = computed(() => wsStore.isConnected(props.deviceId))
</script>

<template>
  <div class="screen-viewer">
    <!-- 状态标签 -->
    <div class="status-overlay" v-if="deviceStatus && screenshotUrl">
      <span :class="['status-tag', deviceStatus]">{{ deviceStatus }}</span>
    </div>

    <!-- 未连接 -->
    <div v-if="!isConnected" class="screen-placeholder">
      <div class="placeholder-icon">🖥</div>
      <div class="placeholder-text">等待设备连接...</div>
      <div class="placeholder-hint">{{ deviceId }}</div>
    </div>

    <!-- 已连接但无截图 -->
    <div v-else-if="!screenshotUrl" class="screen-placeholder">
      <div class="spinner-ring" />
      <div class="placeholder-text">等待画面传输...</div>
      <div class="placeholder-hint">{{ connectionError || 'WebSocket 已连接，等待首帧截图' }}</div>
    </div>

    <!-- 截图画面 -->
    <img
      v-else
      :src="screenshotUrl"
      :alt="`${deviceId} 画面`"
      class="screen-image"
    />
  </div>
</template>

<style scoped>
.screen-viewer {
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 320px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  position: relative;
}

/* ── 状态覆盖层 ── */
.status-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
}

.status-tag {
  font-size: 10px;
  padding: 2px 10px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.status-tag.online,
.status-tag.idle {
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-tag.busy,
.status-tag.running {
  color: var(--info);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

/* ── 占位 ── */
.screen-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.placeholder-icon {
  font-size: 36px;
  margin-bottom: 8px;
  opacity: 0.3;
}

.placeholder-text {
  font-size: 14px;
}

.placeholder-hint {
  font-size: 11px;
  margin-top: 4px;
  opacity: 0.6;
}

.spinner-ring {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  /* @keyframes spin 见 global.css */
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

/* ── 截图 ── */
.screen-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
