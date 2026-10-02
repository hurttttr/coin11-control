<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import DevicePickerList from './DevicePickerList.vue'
import BatchResult from './BatchResult.vue'
import type { BatchTaskResult } from '@/types'
import { useDialog } from '@/composables/useDialog'

const props = defineProps<{
  title: string
  actionLabel: string
  submitFn: (deviceIds: string[]) => Promise<BatchTaskResult>
}>()

const emit = defineEmits<{
  close: []
}>()

const deviceStore = useDeviceStore()
const { devices } = storeToRefs(deviceStore)

const onlineDevices = computed(() =>
  devices.value.filter((d) => d.status === 'online'),
)

const selectedDeviceIds = ref<Set<string>>(new Set())
const submitting = ref(false)
const result = ref<BatchTaskResult | null>(null)

onMounted(() => {
  deviceStore.fetchDevices()
})

async function handleSubmit(): Promise<void> {
  if (selectedDeviceIds.value.size === 0) return
  submitting.value = true
  result.value = null
  try {
    result.value = await props.submitFn(Array.from(selectedDeviceIds.value))
  } finally {
    submitting.value = false
  }
}

function handleClose(): void {
  emit('close')
}

// 弹窗可访问性：Escape 关闭 / 焦点陷阱 / 焦点归还
const { panelRef, titleId } = useDialog({ onClose: handleClose })
</script>

<template>
  <div class="batch-overlay" @click.self="handleClose">
    <div
      ref="panelRef"
      class="batch-panel card"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="panel-header">
        <h3 :id="titleId" class="panel-title">{{ title }}</h3>
        <button class="btn-close" type="button" aria-label="关闭" @click="handleClose">✕</button>
      </div>

      <div class="panel-body">
        <DevicePickerList v-model="selectedDeviceIds" :devices="onlineDevices" />
        <BatchResult v-if="result" :result="result" />
      </div>

      <div class="panel-footer">
        <button class="btn-cancel" type="button" @click="handleClose">取消</button>
        <button
          class="btn-submit"
          type="button"
          :disabled="selectedDeviceIds.size === 0 || submitting"
          @click="handleSubmit"
        >
          {{ submitting ? '执行中...' : `${actionLabel}（${selectedDeviceIds.size} 台）` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.batch-panel {
  width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  transition: color 0.2s;
}

.btn-close:hover {
  color: var(--text-primary);
}

/* ── 键盘焦点可见性 ── */
.batch-panel:focus-visible,
.btn-close:focus-visible,
.btn-cancel:focus-visible,
.btn-submit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.btn-cancel {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
}

.btn-submit {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: #000;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-submit:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
