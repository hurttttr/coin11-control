<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useWebSocketStore } from '@/stores/websocket'
import { useDeviceStore } from '@/stores/devices'
import { useTaskStore } from '@/stores/tasks'
import ScreenViewer from '@/components/monitor/ScreenViewer.vue'
import LogViewer from '@/components/monitor/LogViewer.vue'
import TaskQueue from '@/components/task/TaskQueue.vue'
import StatusIndicator from '@/components/common/StatusIndicator.vue'
import ErrorBanner from '@/components/common/ErrorBanner.vue'

const route = useRoute()
const wsStore = useWebSocketStore()
const deviceStore = useDeviceStore()
const taskStore = useTaskStore()

const { error: deviceError } = storeToRefs(deviceStore)
const { error: taskError, loading: taskLoading } = storeToRefs(taskStore)

const deviceId = ref(route.params.id as string)

const device = ref(
  deviceStore.devices.find((d) => d.serial === deviceId.value) ?? null,
)

function loadDevice(id: string): void {
  device.value = deviceStore.devices.find((d) => d.serial === id) ?? null
  // 如果找不到设备信息则刷新
  if (!device.value) {
    deviceStore.fetchDevices().then(() => {
      if (deviceId.value === id) {
        device.value = deviceStore.devices.find((d) => d.serial === id) ?? null
      }
    })
  }
  taskStore.fetchQueue(id)
  taskStore.fetchScripts()
}

onMounted(() => {
  // WebSocket 截图流连接
  wsStore.connect(deviceId.value)
  loadDevice(deviceId.value)
})

// 支持在同一视图内切换设备（如 /device/A → /device/B）
watch(
  () => route.params.id,
  (newId) => {
    if (!newId || newId === deviceId.value) return
    const oldId = deviceId.value
    wsStore.disconnect(oldId)
    // 清理旧设备已注入历史日志的任务标记，防止切回时因去重而无法重新回放
    wsStore.clearSeeds(oldId)
    deviceId.value = newId as string
    wsStore.connect(deviceId.value)
    loadDevice(deviceId.value)
  },
)

onUnmounted(() => {
  wsStore.clearSeeds(deviceId.value)
  wsStore.disconnect(deviceId.value)
})

/** 重试当前设备的数据加载（设备信息 + 任务队列） */
function retryLoad(): void {
  loadDevice(deviceId.value)
}
</script>

<template>
  <div class="device-detail">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <router-link to="/" class="back-link">← 返回仪表盘</router-link>
        <div>
          <h1 class="page-title">
            {{ device?.model ?? deviceId }}
            <StatusIndicator
              v-if="device"
              :status="device.status"
              size="sm"
              :show-label="true"
            />
          </h1>
          <p class="page-subtitle">{{ deviceId }}</p>
        </div>
      </div>
      <div class="header-meta" v-if="device">
        <span class="meta-tag">Android {{ device.android_version }}</span>
        <span class="meta-tag">{{ device.connection_type === 'usb' ? 'USB' : 'WiFi' }}</span>
      </div>
    </div>

    <!-- 页面级错误提示：设备信息 / 任务队列拉取失败 -->
    <ErrorBanner
      :message="deviceError ?? taskError"
      :title="deviceError ? '获取设备信息失败' : '获取任务队列失败'"
      show-retry
      :retrying="taskLoading"
      @retry="retryLoad"
    />

    <!-- Main Grid: Screen + Tasks side by side -->
    <div class="detail-grid">
      <!-- 左侧: 设备画面 -->
      <section class="section screen-section">
        <div class="section-header">
          <h2 class="section-title">实时设备画面</h2>
        </div>
        <ScreenViewer :device-id="deviceId" />
      </section>

      <!-- 右侧: 任务队列 -->
      <section class="section">
        <TaskQueue :device-id="deviceId" />
      </section>
    </div>

    <!-- 底部全宽: 日志终端 -->
    <section class="section">
      <h2 class="section-title">实时日志终端</h2>
      <LogViewer :device-id="deviceId" />
    </section>
  </div>
</template>

<style scoped>
.device-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* .page-header 见 global.css（本页无差异） */

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.back-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  padding: 4px 0;
  transition: opacity 0.2s;
  white-space: nowrap;
}

.back-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* .page-title 基础样式见 global.css；本页标题内嵌状态指示器，
   需要额外的 flex 布局，故只覆盖布局相关属性。 */
.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* .page-subtitle 基础样式见 global.css；本页字号略大且需继承等宽字体。 */
.page-subtitle {
  font-size: 14px;
  font-family: inherit;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-tag {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-muted);
}

/* ── Section Header ── */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 24px;
}

@media (max-width: 1024px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
