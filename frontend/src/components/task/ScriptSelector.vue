<script setup lang="ts">
import { useTaskStore } from '@/stores/tasks'
import { storeToRefs } from 'pinia'
import type { ScriptInfo } from '@/types'
import { useDialog } from '@/composables/useDialog'

const emit = defineEmits<{
  select: [script: ScriptInfo]
  close: []
}>()

const taskStore = useTaskStore()
const { scripts } = storeToRefs(taskStore)

// 如果脚本列表为空，自动拉取
if (scripts.value.length === 0) {
  taskStore.fetchScripts()
}

function handleSelect(script: ScriptInfo): void {
  emit('select', script)
  emit('close')
}

function handleClose(): void {
  emit('close')
}

// 弹窗可访问性：Escape 关闭 / 焦点陷阱 / 焦点归还
const { panelRef, titleId } = useDialog({ onClose: handleClose })
</script>

<template>
  <div class="script-selector-overlay" @click.self="handleClose">
    <div
      ref="panelRef"
      class="script-selector-panel card"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="panel-header">
        <h3 :id="titleId" class="panel-title">选择脚本</h3>
        <button class="btn-close" type="button" aria-label="关闭" @click="handleClose">✕</button>
      </div>
      <div class="panel-body">
        <div v-if="scripts.length === 0" class="panel-empty">
          <p>暂无可用脚本</p>
        </div>
        <!-- 用 button 承载点击，天然支持 Enter/Space 与 Tab 聚焦 -->
        <button
          v-for="script in scripts"
          :key="script.name"
          class="script-item"
          type="button"
          @click="handleSelect(script)"
        >
          <div class="script-name">{{ script.name }}</div>
          <div v-if="script.description" class="script-desc">{{ script.description }}</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.script-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.script-selector-panel {
  width: 420px;
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
.script-selector-panel:focus-visible,
.btn-close:focus-visible,
.script-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.panel-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.script-item {
  /* button 元素的默认外观重置，保持与原 div 完全一致的视觉 */
  appearance: none;
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.script-item:hover {
  background: rgba(0, 240, 255, 0.06);
}

.script-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: inherit;
}

.script-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
