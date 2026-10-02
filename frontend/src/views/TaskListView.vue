<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { taskStatusBadge } from '@/utils/taskStatus'
import BatchTaskDialog from '@/components/task/BatchTaskDialog.vue'
import BatchDeviceDialog from '@/components/task/BatchDeviceDialog.vue'
import ErrorBanner from '@/components/common/ErrorBanner.vue'

const taskStore = useTaskStore()
const { taskQueues, loading, error: taskError, pendingTasks, runningTasks, completedTasks, failedTasks } = storeToRefs(taskStore)

const showBatchDialog = ref(false)
const showBatchStartDialog = ref(false)
const showBatchStopDialog = ref(false)

onMounted(() => {
  taskStore.fetchTasks()
})

function handleRemoveTask(deviceId: string, taskId: string): void {
  taskStore.removeTask(deviceId, taskId)
}

function handleRefresh(): void {
  taskStore.fetchTasks()
}
</script>

<template>
  <div class="task-list-page">
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">任务列表</h1>
        <p class="page-subtitle">全局任务队列管理</p>
      </div>
      <div class="header-actions">
        <div class="stats">
          <span class="stat pending">{{ pendingTasks.length }} 待处理</span>
          <span class="stat running">{{ runningTasks.length }} 运行中</span>
          <span class="stat completed">{{ completedTasks.length }} 已完成</span>
          <span class="stat failed">{{ failedTasks.length }} 失败</span>
        </div>
        <button class="btn-batch btn-batch-start" @click="showBatchStartDialog = true">
          ▶ 批量启动
        </button>
        <button class="btn-batch btn-batch-stop" @click="showBatchStopDialog = true">
          ■ 批量暂停
        </button>
        <button class="btn-batch" @click="showBatchDialog = true">
          ⊞ 批量分配
        </button>
        <button class="btn-refresh" @click="handleRefresh" :disabled="loading">
          ⟳ 刷新
        </button>
      </div>
    </div>

    <!-- 页面级错误提示：任务列表 / 批量操作失败 -->
    <ErrorBanner
      :message="taskError"
      title="任务操作失败"
      show-retry
      :retrying="loading"
      @retry="handleRefresh"
    />

    <!-- Task Queues -->
    <div class="task-queues">
      <!-- 加载中 -->
      <div v-if="loading && taskQueues.length === 0" class="queue-placeholder">
        <div class="placeholder-spinner" />
        <div class="placeholder-text">加载任务列表中...</div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="taskQueues.length === 0" class="queue-placeholder">
        <div class="placeholder-icon">☰</div>
        <div class="placeholder-text">暂无任务</div>
        <div class="placeholder-hint">前往设备详情页添加任务</div>
      </div>

      <!-- 按设备分组显示 -->
      <div
        v-for="queue in taskQueues"
        :key="queue.device_id"
        class="queue-group card"
      >
        <div class="queue-header">
          <span class="queue-device">{{ queue.device_id }}</span>
          <span class="queue-count">{{ queue.tasks.length }} 个任务</span>
        </div>
        <div v-if="queue.tasks.length === 0" class="queue-empty-device">
          该设备暂无任务
        </div>
        <div v-else class="task-list">
          <div
            v-for="task in queue.tasks"
            :key="task.id"
            class="task-item"
          >
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
                class="btn-remove"
                title="移除任务"
                @click="handleRemoveTask(queue.device_id, task.id)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!--
      弹窗必须留在这个根元素内部：本视图由 AppLayout 的
      <transition name="fade" mode="out-in"> 承载，多根节点（fragment）
      无法被 Transition 动画化，out-in 模式下会导致后续路由切换渲染不出内容。
      弹窗自身是 position: fixed，嵌在根元素内不影响其铺满视口的定位。
    -->

    <!-- 批量分配任务弹窗 -->
    <BatchTaskDialog v-if="showBatchDialog" @close="showBatchDialog = false; handleRefresh()" />

    <!-- 批量启动弹窗 -->
    <BatchDeviceDialog
      v-if="showBatchStartDialog"
      title="批量启动队列"
      action-label="批量启动"
      :submit-fn="taskStore.batchStartQueues.bind(taskStore)"
      @close="showBatchStartDialog = false; handleRefresh()"
    />

    <!-- 批量暂停弹窗 -->
    <BatchDeviceDialog
      v-if="showBatchStopDialog"
      title="批量暂停队列"
      action-label="批量暂停"
      :submit-fn="taskStore.batchStopQueues.bind(taskStore)"
      @close="showBatchStopDialog = false; handleRefresh()"
    />
  </div>
</template>

<style scoped>
.task-list-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* .page-header / .page-title / .page-subtitle 见 global.css（本页无差异） */

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.stat.pending { color: var(--warning); }
.stat.running { color: var(--info); }
.stat.completed { color: var(--success); }
.stat.failed { color: var(--error); }

/* .btn-refresh 见 global.css */

/* ── 任务队列列表 ── */
.task-queues {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.queue-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.placeholder-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.4;
}

/* .placeholder-spinner 与 @keyframes spin 见 global.css */

.placeholder-text {
  font-size: 15px;
  margin-bottom: 6px;
}

.placeholder-hint {
  font-size: 12px;
}

.queue-group {
  overflow: hidden;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.15);
}

.queue-device {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.queue-count {
  font-size: 11px;
  color: var(--text-muted);
}

.queue-empty-device {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* 任务行（.task-list / .task-item / .task-badge / .badge-* / .task-info /
   .task-script / .task-meta / .task-time）与 .btn-remove 见 global.css。
   本页取值与全局基础版完全一致，无需覆盖。 */

.btn-batch {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-batch:hover {
  background: var(--accent);
  color: #000;
}

.btn-batch-start {
  border-color: var(--success);
  color: var(--success);
}

.btn-batch-start:hover {
  background: var(--success);
  color: #000;
}

.btn-batch-stop {
  border-color: var(--error);
  color: var(--error);
}

.btn-batch-stop:hover {
  background: var(--error);
  color: #fff;
}
</style>
