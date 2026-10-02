<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import type { TaskInfo, ScriptInfo } from '@/types'
import ScriptSelector from './ScriptSelector.vue'
import { useTaskStore } from '@/stores/tasks'
import { taskStatusBadge } from '@/utils/taskStatus'
// vuedraggable 的类型由 env.d.ts 声明，无需 @ts-ignore
import VueDraggable from 'vuedraggable'

const props = defineProps<{
  deviceId: string
}>()

const taskStore = useTaskStore()
const showSelector = ref(false)
const localTasks = ref<TaskInfo[]>([])
// 组件根节点，用于排序后按 data 属性找回焦点所在的按钮
const rootEl = ref<HTMLElement | null>(null)

onMounted(() => {
  syncTasks()
})

// 从 store 同步任务列表
function syncTasks(): void {
  localTasks.value = [...taskStore.getQueueForDevice(props.deviceId)]
}

// 监听 store 变化
watch(
  () => taskStore.getQueueForDevice(props.deviceId),
  (newTasks) => {
    localTasks.value = [...newTasks]
  },
  { deep: true },
)

function handleRemove(taskId: string): void {
  taskStore.removeTask(props.deviceId, taskId)
}

function handleAddTask(script: ScriptInfo): void {
  taskStore.enqueueTask(props.deviceId, script.name)
}

async function handleStart(): Promise<void> {
  await taskStore.startQueue(props.deviceId)
  await taskStore.fetchQueue(props.deviceId).then(syncTasks)
}

async function handleStop(): Promise<void> {
  await taskStore.stopQueue(props.deviceId)
  await taskStore.fetchQueue(props.deviceId).then(syncTasks)  // 刷新队列状态
}

async function handleClearCompleted(): Promise<void> {
  const completedTasks = localTasks.value.filter((t) => t.status === 'completed')
  for (const task of completedTasks) {
    await taskStore.removeTask(props.deviceId, task.id)
  }
  await taskStore.fetchQueue(props.deviceId).then(syncTasks)
}

/** 拖拽排序结束 */
async function onDragEnd(): Promise<void> {
  const orderedIds = localTasks.value.map((t) => t.id)
  await taskStore.reorderTasks(props.deviceId, orderedIds)
  await taskStore.fetchQueue(props.deviceId).then(syncTasks)
}

// ── 键盘可用的排序替代方案 ──
// 拖拽（vuedraggable）只能用鼠标，键盘与读屏用户无法排序，
// 因此每行额外提供「上移 / 下移」按钮，走同一个 reorderTasks 动作。

function taskIndex(taskId: string): number {
  return localTasks.value.findIndex((t) => t.id === taskId)
}

function canMoveUp(taskId: string): boolean {
  return taskIndex(taskId) > 0
}

function canMoveDown(taskId: string): boolean {
  const idx = taskIndex(taskId)
  return idx !== -1 && idx < localTasks.value.length - 1
}

/**
 * 排序后把焦点还给被移动任务的同一个按钮。
 * 队列重新渲染会销毁原按钮节点，若不显式恢复，键盘用户每移一格就丢焦点、
 * 无法连续操作。目标按钮因到达边界而 disabled 时，退回另一个方向的按钮，
 * 让焦点仍留在同一行。
 */
async function restoreMoveFocus(taskId: string, direction: 'up' | 'down'): Promise<void> {
  await nextTick()
  const root = rootEl.value
  if (!root) return
  const preferred = root.querySelector<HTMLButtonElement>(
    `[data-move-btn="${taskId}:${direction}"]`,
  )
  const fallback = root.querySelector<HTMLButtonElement>(
    `[data-move-btn="${taskId}:${direction === 'up' ? 'down' : 'up'}"]`,
  )
  const target = preferred && !preferred.disabled ? preferred : fallback
  if (target && !target.disabled) target.focus()
}

async function moveTask(taskId: string, direction: 'up' | 'down'): Promise<void> {
  const from = taskIndex(taskId)
  if (from === -1) return
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= localTasks.value.length) return

  // 先本地交换，让界面立即响应；随后与后端对齐
  const next = [...localTasks.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  localTasks.value = next

  await taskStore.reorderTasks(props.deviceId, next.map((t) => t.id))
  await taskStore.fetchQueue(props.deviceId).then(syncTasks)
  await restoreMoveFocus(taskId, direction)
}
</script>

<template>
  <div ref="rootEl" class="task-queue">
    <!-- 工具栏 -->
    <div class="queue-toolbar">
      <div class="toolbar-left">
        <span class="queue-label">任务队列</span>
        <span class="queue-count">{{ localTasks.length }} 个任务</span>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="btn-tool btn-start" :disabled="localTasks.length === 0" @click="handleStart">
          ▶ 开始执行
        </button>
        <button type="button" class="btn-tool btn-stop" @click="handleStop">
          ■ 停止
        </button>
        <button type="button" class="btn-tool btn-clear" @click="handleClearCompleted">
          ∅ 清空已完成
        </button>
        <button type="button" class="btn-tool btn-add" @click="showSelector = true">
          + 添加任务
        </button>
      </div>
    </div>

    <!-- 任务列表（可拖拽） -->
    <div v-if="localTasks.length === 0" class="queue-empty">
      <div class="empty-icon">☰</div>
      <div class="empty-text">暂无任务，请添加</div>
      <button type="button" class="btn-add-empty" @click="showSelector = true">+ 添加任务</button>
    </div>

    <VueDraggable
      v-else
      v-model="localTasks"
      handle=".drag-handle"
      item-key="id"
      class="task-list"
      :animation="200"
      @change="onDragEnd"
    >
      <template #item="{ element: task }">
        <div class="task-item">
          <div class="drag-handle" title="拖拽排序" aria-hidden="true">⠿</div>
          <!--
            键盘可用的排序入口（拖拽的等价操作）。
            aria-label 带上脚本名，否则读屏用户听到的是一串无从区分的「上移」。
          -->
          <button
            type="button"
            class="btn-move"
            :data-move-btn="`${task.id}:up`"
            :disabled="!canMoveUp(task.id)"
            :title="`上移 ${task.script_name}`"
            :aria-label="`上移 ${task.script_name}`"
            @click="moveTask(task.id, 'up')"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn-move"
            :data-move-btn="`${task.id}:down`"
            :disabled="!canMoveDown(task.id)"
            :title="`下移 ${task.script_name}`"
            :aria-label="`下移 ${task.script_name}`"
            @click="moveTask(task.id, 'down')"
          >
            ↓
          </button>
          <div class="task-badge-wrap">
            <span :class="['task-badge', taskStatusBadge(task.status).class]">
              <span class="badge-icon">{{ taskStatusBadge(task.status).icon }}</span>
              {{ taskStatusBadge(task.status).label }}
            </span>
          </div>
          <div class="task-info">
            <span class="task-script">{{ task.script_name }}</span>
          </div>
          <div class="task-meta">
            <span class="task-time">{{ task.created_at }}</span>
            <button
              type="button"
              class="btn-remove"
              :title="`移除 ${task.script_name}`"
              :aria-label="`移除任务 ${task.script_name}`"
              @click="handleRemove(task.id)"
            >
              ✕
            </button>
          </div>
        </div>
      </template>
    </VueDraggable>

    <!-- Script Selector Modal -->
    <Teleport to="body">
      <ScriptSelector
        v-if="showSelector"
        @select="handleAddTask"
        @close="showSelector = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.task-queue {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
}

/* ── 工具栏 ── */
.queue-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.15);
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.queue-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.queue-count {
  font-size: 12px;
  color: var(--text-muted);
}

.toolbar-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn-tool {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-tool:hover:not(:disabled) {
  border-color: var(--border-accent);
  color: var(--accent);
}

.btn-tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 行内排序按钮（拖拽的键盘等价操作）── */
.btn-move {
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-move:hover:not(:disabled) {
  color: var(--accent);
  background: var(--accent-dim);
}

.btn-move:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-move:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn-start {
  color: var(--success);
  border-color: rgba(16, 185, 129, 0.3);
}

.btn-start:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.1);
  border-color: var(--success);
}

.btn-stop {
  color: var(--error);
  border-color: rgba(239, 68, 68, 0.3);
}

.btn-stop:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--error);
}

.btn-add {
  color: var(--accent);
  border-color: rgba(0, 240, 255, 0.3);
}

.btn-add:hover {
  background: rgba(0, 240, 255, 0.1);
  border-color: var(--accent);
}

/* ── 空状态 ── */
.queue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 32px;
  opacity: 0.3;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
  margin-bottom: 12px;
}

.btn-add-empty {
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: rgba(0, 240, 255, 0.1);
  color: var(--accent);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-empty:hover {
  background: rgba(0, 240, 255, 0.2);
}

/* ── 任务列表 ── */
/* .task-list / .task-item 基础样式见 global.css；
   本组件在窄栏中显示，左右内边距比 TaskListView 小 2px，故只覆盖 padding。 */
.task-item {
  padding: 10px 14px;
}

.drag-handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 14px;
  user-select: none;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.2s;
}

.task-item:hover .drag-handle {
  opacity: 0.8;
}

.drag-handle:active {
  cursor: grabbing;
}

/* 状态 Badge（.task-badge-wrap / .task-badge / .badge-*）、.task-info /
   .task-meta / .task-time 与 .btn-remove 见 global.css。
   @keyframes spin 也已上提到 global.css（原本在此处的 scoped 定义会被 Vue
   hash 成 spin-xxxx，仅本组件可见，上提后由全局 spin 驱动 badge 动画）。
   本组件仅字号与全局基础版不同，故只覆盖 font-size。 */
.task-badge {
  font-size: 12px;
}

.task-script {
  font-size: 15px;
}
</style>