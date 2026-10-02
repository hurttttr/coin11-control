<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { ScriptInfo } from '@/types'
import { useTaskStore } from '@/stores/tasks'
import { useDeviceStore } from '@/stores/devices'
import DevicePickerList from './DevicePickerList.vue'
import BatchResult from './BatchResult.vue'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{
  close: []
}>()

const taskStore = useTaskStore()
const deviceStore = useDeviceStore()
const { scripts } = storeToRefs(taskStore)
const { devices } = storeToRefs(deviceStore)

// 只显示在线设备
const onlineDevices = computed(() =>
  devices.value.filter((d) => d.status === 'online'),
)

const selectedScript = ref<ScriptInfo | null>(null)
const selectedDeviceIds = ref<Set<string>>(new Set())
const submitting = ref(false)
const result = ref<Awaited<ReturnType<typeof taskStore.batchEnqueueTask>> | null>(null)

onMounted(() => {
  deviceStore.fetchDevices()
  if (scripts.value.length === 0) {
    taskStore.fetchScripts()
  }
})

async function handleSubmit(): Promise<void> {
  if (!selectedScript.value || selectedDeviceIds.value.size === 0) return
  submitting.value = true
  result.value = null
  try {
    result.value = await taskStore.batchEnqueueTask(
      selectedScript.value.name,
      Array.from(selectedDeviceIds.value),
    )
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
  <div class="batch-task-overlay" @click.self="handleClose">
    <div
      ref="panelRef"
      class="batch-task-panel card"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="panel-header">
        <h3 :id="titleId" class="panel-title">批量分配任务</h3>
        <button class="btn-close" type="button" aria-label="关闭" @click="handleClose">✕</button>
      </div>

      <div class="panel-body">
        <!-- 选择脚本 -->
        <div class="section">
          <span :id="`${titleId}-script-label`" class="section-label">选择脚本</span>
          <div v-if="scripts.length === 0" class="empty-hint">暂无可用脚本</div>
          <!-- 单选语义：radiogroup + aria-checked，键盘可 Tab 进入并用 Enter/Space 选中 -->
          <div
            v-else
            class="script-list"
            role="radiogroup"
            :aria-labelledby="`${titleId}-script-label`"
          >
            <button
              v-for="script in scripts"
              :key="script.name"
              :class="['script-item', { active: selectedScript?.name === script.name }]"
              type="button"
              role="radio"
              :aria-checked="selectedScript?.name === script.name"
              @click="selectedScript = script"
            >
              <div class="script-name">{{ script.name }}</div>
              <div v-if="script.description" class="script-desc">{{ script.description }}</div>
            </button>
          </div>
        </div>

        <!-- 选择设备 -->
        <DevicePickerList v-model="selectedDeviceIds" :devices="onlineDevices" />

        <!-- 提交结果 -->
        <BatchResult v-if="result" :result="result" />
      </div>

      <div class="panel-footer">
        <button class="btn-cancel" type="button" @click="handleClose">取消</button>
        <button
          class="btn-submit"
          type="button"
          :disabled="!selectedScript || selectedDeviceIds.size === 0 || submitting"
          @click="handleSubmit"
        >
          {{ submitting ? '分配中...' : `批量分配（${selectedDeviceIds.size} 台）` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch-task-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.batch-task-panel {
  width: 520px;
  max-height: 80vh;
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
.batch-task-panel:focus-visible,
.btn-close:focus-visible,
.script-item:focus-visible,
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
  gap: 20px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* ── 脚本列表 ── */
.script-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.script-item {
  /* button 元素的默认外观重置，保持与原 div 完全一致的视觉 */
  appearance: none;
  display: block;
  width: 100%;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.script-item:hover {
  background: rgba(0, 240, 255, 0.06);
}

.script-item.active {
  background: rgba(0, 240, 255, 0.1);
  border-color: var(--accent);
}

.script-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.script-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ── Footer ── */
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
