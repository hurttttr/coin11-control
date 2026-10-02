<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import { useTaskStore } from '@/stores/tasks'
import DeviceGrid from '@/components/device/DeviceGrid.vue'
import ErrorBanner from '@/components/common/ErrorBanner.vue'

const deviceStore = useDeviceStore()
const taskStore = useTaskStore()

const { devices, loading: devicesLoading, error: deviceError } = storeToRefs(deviceStore)
const { allTasks, pendingTasks, runningTasks, completedTasks, failedTasks, activeTasks, loading: tasksLoading, error: taskError } = storeToRefs(taskStore)

onMounted(() => {
  // 设备列表由 DeviceGrid 内部负责拉取与轮询，这里只拉取任务数据
  taskStore.fetchTasks()
  // 版本更新检查由 AppLayout 中的 UpdateBanner 统一触发
})

/** 页面级错误：设备列表优先（更基础），其次任务列表 */
function retryFailed(): void {
  if (deviceError.value) deviceStore.fetchDevices()
  else taskStore.fetchTasks()
}
</script>

<template>
  <div class="dashboard">
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">仪表盘</h1>
        <p class="page-subtitle">设备概览与任务状态</p>
      </div>
      <div class="header-stats">
        <button class="btn-refresh-header" @click="deviceStore.fetchDevices()" :disabled="devicesLoading">
          ⟳
        </button>
      </div>
    </div>

    <!-- 页面级错误提示：设备列表 / 任务列表拉取失败 -->
    <ErrorBanner
      :message="deviceError ?? taskError"
      :title="deviceError ? '获取设备列表失败' : '获取任务列表失败'"
      show-retry
      :retrying="devicesLoading || tasksLoading"
      @retry="retryFailed"
    />

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card card">
        <div class="stat-icon stat-icon-online">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <div class="stat-body">
          <div class="stat-value accent">{{ deviceStore.onlineDevices.length }}</div>
          <div class="stat-label">在线</div>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon stat-icon-busy">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div class="stat-body">
          <div class="stat-value info">{{ deviceStore.busyDevices.length }}</div>
          <div class="stat-label">忙碌</div>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon stat-icon-offline">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="2" y1="20" x2="22" y2="20" />
          </svg>
        </div>
        <div class="stat-body">
          <div class="stat-value error">{{ deviceStore.offlineDevices.length }}</div>
          <div class="stat-label">离线</div>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon stat-icon-tasks">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <div class="stat-body">
          <div class="stat-value warning">{{ activeTasks.length }}</div>
          <div class="stat-label">活跃任务</div>
        </div>
      </div>
    </div>

    <!-- Device Grid -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">设备列表</h2>
        <div class="section-actions">
          <span class="device-total">共 {{ deviceStore.deviceCount }} 台</span>
          <button
            class="btn-refresh"
            @click="deviceStore.fetchDevices()"
            :disabled="devicesLoading"
          >
            ⟳ 刷新
          </button>
        </div>
      </div>
      <DeviceGrid :devices="devices" :loading="devicesLoading" />
    </section>

    <!-- 任务概览 -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">任务概览</h2>
        <div class="section-actions">
          <router-link to="/tasks" class="btn-link">查看全部 →</router-link>
        </div>
      </div>
      <div class="task-overview card">
        <div v-if="allTasks.length === 0" class="overview-empty">
          暂无任务
        </div>
        <div v-else class="overview-stats">
          <div class="overview-stat">
            <span class="overview-value pending">{{ pendingTasks.length }}</span>
            <span class="overview-label">等待中</span>
          </div>
          <div class="overview-stat">
            <span class="overview-value running">{{ runningTasks.length }}</span>
            <span class="overview-label">运行中</span>
          </div>
          <div class="overview-stat">
            <span class="overview-value completed">{{ completedTasks.length }}</span>
            <span class="overview-label">已完成</span>
          </div>
          <div class="overview-stat">
            <span class="overview-value failed">{{ failedTasks.length }}</span>
            <span class="overview-label">失败</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── Page Header ── */
/* .page-header / .page-subtitle 见 global.css（本页无差异）。
   .page-title 仅字号与全局基础版（24px）不同，故只覆盖 font-size。 */
.page-title {
  font-size: 26px;
}

.btn-refresh-header {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh-header:hover:not(:disabled) {
  border-color: var(--border-accent);
  color: var(--accent);
}

.btn-refresh-header:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 统计卡片 ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  flex-shrink: 0;
}

.stat-icon-online {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}

.stat-icon-busy {
  background: rgba(59, 130, 246, 0.15);
  color: var(--info);
}

.stat-icon-offline {
  background: rgba(239, 68, 68, 0.15);
  color: var(--error);
}

.stat-icon-tasks {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}

.stat-body {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 2px;
}

.stat-value.accent { color: var(--accent); }
.stat-value.info { color: var(--info); }
.stat-value.error { color: var(--error); }
.stat-value.warning { color: var(--warning); }

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* ── Sections ── */
.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.device-total {
  font-size: 12px;
  color: var(--text-muted);
}

/* .btn-refresh 见 global.css */

.btn-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  transition: opacity 0.2s;
}

.btn-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* ── 任务概览 ── */
.task-overview {
  padding: 24px;
}

.overview-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 20px;
}

.overview-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.overview-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.overview-value {
  font-size: 28px;
  font-weight: 700;
}

.overview-value.pending { color: var(--warning); }
.overview-value.running { color: var(--info); }
.overview-value.completed { color: var(--success); }
.overview-value.failed { color: var(--error); }

.overview-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}
</style>
