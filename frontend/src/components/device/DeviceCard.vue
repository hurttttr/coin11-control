<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DeviceInfo } from '@/types'
import { useDeviceStore } from '@/stores/devices'
import StatusIndicator from '@/components/common/StatusIndicator.vue'

const props = defineProps<{
  device: DeviceInfo
}>()

const deviceStore = useDeviceStore()
const disconnecting = ref(false)

/**
 * 详情页路径。沿用原先 router.push(`/device/${serial}`) 的字符串形式，
 * 保证与改造前的导航行为完全等价。
 */
const detailPath = computed(() => `/device/${props.device.serial}`)

async function handleDisconnect(): Promise<void> {
  if (disconnecting.value) return
  disconnecting.value = true
  await deviceStore.disconnectDevice(props.device.serial)
  disconnecting.value = false
}
</script>

<template>
  <div class="device-card card">
    <!--
      主操作「进入详情」用一个铺满卡片的 router-link 承载，而非把整张卡片变成
      button/div@click：
      - 卡片内已有「断开」按钮，若外层也是交互元素就会形成嵌套可交互元素
        （button 套 button 是无效 HTML，屏幕阅读器行为不可预测）；
      - link 与卡片内容是兄弟节点而非父子，因此不存在嵌套问题；
      - 原生 <a> 天然可 Tab 聚焦、Enter 触发，并支持中键/新标签页打开。
      链接自身无可见文本，故用 aria-label 提供可访问名称。
    -->
    <router-link
      class="card-link"
      :to="detailPath"
      :aria-label="`查看 ${device.model}（${device.serial}）详情`"
    />

    <div class="card-header">
      <div class="device-info">
        <StatusIndicator :status="device.status" :size="'sm'" />
        <span class="device-status-label">
          {{ device.status === 'online' ? '在线' : device.status === 'busy' ? '忙碌' : '离线' }}
        </span>
      </div>
      <div class="connection-type">
        <!-- USB 图标 -->
        <svg v-if="device.connection_type === 'usb'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="2" width="10" height="7" rx="1" />
          <path d="M12 9v13" />
          <path d="M9 22h6" />
        </svg>
        <!-- WiFi 图标 -->
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h.01" />
          <path d="M2 8.82a15 15 0 0 1 20 0" />
          <path d="M5 12.85a10 10 0 0 1 14 0" />
          <path d="M8.5 16.43a5 5 0 0 1 7 0" />
        </svg>
        <span>{{ device.connection_type === 'usb' ? 'USB' : 'WiFi' }}</span>
      </div>
    </div>

    <div class="card-body">
      <div class="device-model">{{ device.model }}</div>
      <div class="device-serial">{{ device.serial }}</div>
    </div>

    <div class="card-footer">
      <div class="footer-left">
        <span class="footer-label">Android {{ device.android_version }}</span>
      </div>
      <div class="footer-actions">
        <button
          type="button"
          class="btn-disconnect"
          :disabled="disconnecting"
          title="断开连接"
          :aria-label="`断开 ${device.model}（${device.serial}）的连接`"
          @click="handleDisconnect"
        >
          {{ disconnecting ? '...' : '断开' }}
        </button>
        <span class="footer-arrow">→</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-card {
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* 覆盖式 .card-link 的定位上下文 */
  position: relative;
}

/* ── 主操作：铺满卡片的不可见链接 ── */
.card-link {
  position: absolute;
  inset: 0;
  z-index: 1;
  /* 链接本身不显示内容，仅承载点击与键盘焦点 */
  text-decoration: none;
  border-radius: inherit;
}

/* 键盘焦点落在覆盖链接上时，在整张卡片外缘显示焦点环 */
.card-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/*
  「断开」按钮与右下箭头必须叠在 .card-link 之上，
  否则会被覆盖层拦截点击（原实现靠 event.stopPropagation() 阻止冒泡，
  改为层叠顺序隔离后不再需要）。
*/
.footer-actions {
  position: relative;
  z-index: 2;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.device-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.device-status-label {
  font-size: 13px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.connection-type {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-muted);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.card-body {
  padding: 16px;
  flex: 1;
}

.device-model {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-family: inherit;
}

.device-serial {
  font-size: 14px;
  color: var(--text-muted);
  font-family: inherit;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.15);
}

.footer-left {
  display: flex;
  align-items: center;
}

.footer-label {
  font-size: 12px;
  color: var(--text-muted);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-disconnect {
  background: transparent;
  border: 1px solid var(--error-dim);
  color: var(--error);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;
  font-family: inherit;
}

.device-card:hover .btn-disconnect {
  opacity: 1;
}

.btn-disconnect:hover:not(:disabled) {
  background: var(--error-dim);
}

.btn-disconnect:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-arrow {
  font-size: 14px;
  color: var(--accent);
  opacity: 0;
  transition: opacity 0.2s;
}

.device-card:hover .footer-arrow {
  opacity: 1;
}
</style>
