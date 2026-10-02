<script setup lang="ts">
import { computed, useId } from 'vue'
import type { DeviceInfo } from '@/types'

const props = defineProps<{
  devices: DeviceInfo[]
  modelValue: Set<string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Set<string>]
}>()

// 同页可能存在多个设备选择列表（批量分配 / 批量启停），id 必须唯一
const groupLabelId = useId()

const allSelected = computed(
  () => props.devices.length > 0 && props.modelValue.size === props.devices.length,
)

const someSelected = computed(
  () => props.modelValue.size > 0 && props.modelValue.size < props.devices.length,
)

function toggle(serial: string): void {
  const next = new Set(props.modelValue)
  if (next.has(serial)) next.delete(serial)
  else next.add(serial)
  emit('update:modelValue', next)
}

function toggleAll(): void {
  emit(
    'update:modelValue',
    allSelected.value ? new Set() : new Set(props.devices.map((d) => d.serial)),
  )
}
</script>

<template>
  <div class="section">
    <div class="section-header-row">
      <span :id="groupLabelId" class="section-label">选择目标设备</span>
      <label class="toggle-all">
        <input
          type="checkbox"
          :checked="allSelected"
          :indeterminate="someSelected"
          @change="toggleAll"
        />
        <span>全选/取消</span>
      </label>
    </div>
    <div v-if="devices.length === 0" class="empty-hint">暂无在线设备</div>
    <!--
      每行用 <label> 包裹原生 checkbox：
      点击整行、Space 键、屏幕阅读器三条路径都只经过 checkbox 的 change 事件，
      不会像此前「外层 div @click + 内层 checkbox」那样产生双重 toggle。
    -->
    <div v-else class="device-list" role="group" :aria-labelledby="groupLabelId">
      <label
        v-for="device in devices"
        :key="device.serial"
        :class="['device-item', { selected: modelValue.has(device.serial) }]"
      >
        <input
          type="checkbox"
          class="device-checkbox"
          :checked="modelValue.has(device.serial)"
          @change="toggle(device.serial)"
        />
        <span class="device-info">
          <span class="device-model">{{ device.model }}</span>
          <span class="device-serial">{{ device.serial }}</span>
        </span>
        <span class="device-conn">{{ device.connection_type === 'usb' ? 'USB' : 'WiFi' }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toggle-all {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  user-select: none;
}

.toggle-all input {
  accent-color: var(--accent);
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
}

.device-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  /* label 包裹整行，避免拖选时选中文本 */
  user-select: none;
}

.device-item:hover {
  background: rgba(0, 240, 255, 0.06);
}

/* ── 键盘焦点可见性：焦点在行内 checkbox 上时高亮整行 ── */
.device-item:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.toggle-all input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.device-item.selected {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.2);
}

.device-checkbox {
  accent-color: var(--accent);
  flex-shrink: 0;
}

.device-info {
  flex: 1;
  min-width: 0;
}

/* span 替代原 div 后需显式块级化，保持两行竖排的原有视觉 */
.device-model {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.device-serial {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  font-family: inherit;
  margin-top: 1px;
}

.device-conn {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-muted);
  text-transform: uppercase;
}
</style>
