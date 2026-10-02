<script setup lang="ts">
import type { DeviceStatus } from '@/types'
import { computed } from 'vue'

const props = defineProps<{
  status: DeviceStatus
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}>()

const sizeMap = { sm: 8, md: 12, lg: 16 }

const dotSize = computed(() => sizeMap[props.size ?? 'md'])

const statusLabel = computed(() => {
  const labels: Record<DeviceStatus, string> = {
    online: '在线',
    offline: '离线',
    busy: '忙碌',
  }
  return labels[props.status]
})
</script>

<template>
  <div class="status-indicator">
    <!-- 圆点仅为装饰，状态语义由下方文字承载 -->
    <span
      :class="['status-dot', status]"
      :style="{ width: dotSize + 'px', height: dotSize + 'px' }"
      aria-hidden="true"
    />
    <span v-if="showLabel" class="status-label">{{ statusLabel }}</span>
  </div>
</template>

<style scoped>
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── 状态圆点 ── */
.status-dot {
  display: inline-block;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
}

.status-dot.online {
  background: var(--success);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  animation: pulse-green 2s ease-in-out infinite;
}

.status-dot.busy {
  background: var(--info);
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.6);
  animation: pulse-blue 2s ease-in-out infinite;
}

.status-dot.offline {
  background: var(--error);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}

/* ── 脉冲动画 ── */
@keyframes pulse-green {
  0%, 100% {
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }
  50% {
    box-shadow: 0 0 14px rgba(16, 185, 129, 0.9), 0 0 24px rgba(16, 185, 129, 0.3);
  }
}

@keyframes pulse-blue {
  0%, 100% {
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.6);
  }
  50% {
    box-shadow: 0 0 14px rgba(59, 130, 246, 0.9), 0 0 24px rgba(59, 130, 246, 0.3);
  }
}
</style>
