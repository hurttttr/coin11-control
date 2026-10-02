<script setup lang="ts">
import { ref, onMounted, useId } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { storeToRefs } from 'pinia'
import { apiFetch, errMessage } from '@/utils/api'
import ErrorBanner from '@/components/common/ErrorBanner.vue'

/** 自动任务设置接口返回体 */
interface AutoTasksSettings {
  auto_tasks?: string[]
}

const taskStore = useTaskStore()
const { scripts, error: taskError } = storeToRefs(taskStore)

// 勾选列表的 role="group" 需要一个稳定且唯一的 aria-labelledby 目标
const groupLabelId = useId()

const selectedScripts = ref<Set<string>>(new Set())
const loading = ref(false)
const saving = ref(false)
const saveResult = ref<'success' | 'error' | null>(null)
// 加载 / 保存失败的具体原因（后端 detail），供 ErrorBanner 与页脚提示展示
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)

async function loadAutoTasks(): Promise<void> {
  loading.value = true
  loadError.value = null
  await taskStore.fetchScripts()
  try {
    const data = await apiFetch<AutoTasksSettings>('/api/settings/auto-tasks')
    selectedScripts.value = new Set(data?.auto_tasks ?? [])
  } catch (e) {
    loadError.value = errMessage(e, '加载自动任务设置失败')
    console.error('[SettingsView] loadAutoTasks failed:', loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAutoTasks()
})

function toggleScript(name: string): void {
  const s = new Set(selectedScripts.value)
  if (s.has(name)) s.delete(name)
  else s.add(name)
  selectedScripts.value = s
}

async function handleSave(): Promise<void> {
  saving.value = true
  saveResult.value = null
  saveError.value = null
  try {
    // 走统一的 apiFetch：非 2xx 会带着后端 detail 抛出，而不是静默变成"保存失败"
    await apiFetch('/api/settings/auto-tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_tasks: Array.from(selectedScripts.value) }),
    })
    saveResult.value = 'success'
    setTimeout(() => { saveResult.value = null }, 2000)
  } catch (e) {
    saveResult.value = 'error'
    saveError.value = errMessage(e, '保存设置失败')
    console.error('[SettingsView] handleSave failed:', saveError.value)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">设置</h1>
        <p class="page-subtitle">全局配置</p>
      </div>
    </div>

    <!-- 页面级错误提示：加载设置失败 / 脚本列表失败 / 保存失败 -->
    <ErrorBanner
      :message="loadError ?? saveError ?? taskError"
      :title="loadError ? '加载设置失败' : saveError ? '保存设置失败' : '获取脚本列表失败'"
      :show-retry="!saveError"
      :retrying="loading"
      @retry="loadAutoTasks"
    />

    <div class="settings-section card">
      <div class="section-header">
        <h2 :id="groupLabelId" class="section-title">设备连接自动运行任务</h2>
        <p class="section-desc">当设备连接成功后，自动将勾选的脚本入队并启动执行</p>
      </div>

      <div v-if="loading" class="loading-hint">加载中...</div>

      <div v-else-if="scripts.length === 0" class="empty-hint">暂无可用脚本</div>

      <!--
        每行用 <label> 包裹原生 checkbox（与 DevicePickerList 同构）：
        点击整行、Tab 聚焦 + Space、屏幕阅读器三条路径都只经过 checkbox 的 change 事件，
        不会像此前「外层 div @click + 内层 checkbox」那样产生双重 toggle。
      -->
      <div v-else class="script-check-list" role="group" :aria-labelledby="groupLabelId">
        <label
          v-for="script in scripts"
          :key="script.name"
          :class="['script-check-item', { checked: selectedScripts.has(script.name) }]"
        >
          <input
            type="checkbox"
            class="script-checkbox"
            :checked="selectedScripts.has(script.name)"
            @change="toggleScript(script.name)"
          />
          <span class="script-info">
            <span class="script-name">{{ script.name }}</span>
            <span v-if="script.description" class="script-desc">{{ script.description }}</span>
          </span>
        </label>
      </div>

      <div class="section-footer">
        <button
          class="btn-save"
          :disabled="saving"
          @click="handleSave"
        >
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
        <span v-if="saveResult === 'success'" class="save-msg success" role="status">✅ 已保存</span>
        <span v-else-if="saveResult === 'error'" class="save-msg error" role="alert">
          ❌ {{ saveError ?? '保存失败' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 4px 0 0;
  font-family: inherit;
}

.settings-section {
  padding: 24px;
}

.section-header {
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.loading-hint,
.empty-hint {
  padding: 30px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.script-check-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.script-check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  /* label 包裹整行，避免拖选时选中文本 */
  user-select: none;
}

.script-check-item:hover {
  background: rgba(0, 240, 255, 0.06);
}

/* ── 键盘焦点可见性：焦点在行内 checkbox 上时高亮整行 ── */
.script-check-item:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn-save:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.script-check-item.checked {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.2);
}

.script-checkbox {
  accent-color: var(--accent);
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.script-info {
  flex: 1;
  min-width: 0;
}

/* span 替代原 div 后需显式块级化，保持两行竖排的原有视觉 */
.script-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.script-desc {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.section-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.btn-save {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #000;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.save-msg {
  font-size: 13px;
  font-weight: 500;
}

.save-msg.success { color: var(--success); }
.save-msg.error { color: var(--error); }
</style>
