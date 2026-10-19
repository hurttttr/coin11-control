<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUpdateStore } from '@/stores/update'

const store = useUpdateStore()

// 页面顶部横幅：只负责"提示 + 入口"，详细进度/日志在 /updates 版本管理页。
// 关键修复：更新任务的返回值不再覆盖 updateInfo，任务进行中/结束后的横幅
// 不会因为字段丢失而突然消失。
type BannerMode = 'running' | 'success' | 'error' | 'update' | ''

const bannerMode = computed<BannerMode>(() => {
  if (store.pulling) return 'running'
  if (store.dismissed) return ''
  if (store.job.status === 'error') return 'error'
  if (store.job.status === 'success') return 'success'
  if (store.updateInfo.has_update) return 'update'
  return ''
})

const title = computed(() => {
  switch (bannerMode.value) {
    case 'running':
      return store.job.mode === 'reclone' ? '正在重新克隆仓库' : '正在更新任务脚本'
    case 'success':
      return store.job.mode === 'reclone' ? '仓库已重新克隆' : '更新完成'
    case 'error':
      return store.job.mode === 'reclone' ? '重新克隆失败' : '更新失败'
    case 'update':
      return '新版本可用'
    default:
      return ''
  }
})

const detail = computed(() => {
  switch (bannerMode.value) {
    case 'running':
      return `${store.job.stage_label || '准备更新'} · ${store.job.progress}% · 已用时 ${store.job.elapsed_seconds}s`
    case 'success':
      // 标题已经说明"更新完成/已重新克隆"，详情不再重复同一句话
      if (store.job.mode === 'reclone') {
        return store.job.current_commit
          ? `当前提交 ${store.job.current_commit.slice(0, 8)}`
          : store.job.message
      }
      return store.job.commits_pulled > 0
        ? `已拉取 ${store.job.commits_pulled} 个提交 · ${store.job.current_commit.slice(0, 8)}`
        : '已是最新版本，无需更新'
    case 'error':
      return store.job.message
    case 'update': {
      const info = store.updateInfo
      const base = `${info.commits_behind} 个提交落后 · ${info.latest_commit.slice(0, 8)}`
      return info.warning ? `${base}（${info.warning}）` : base
    }
    default:
      return ''
  }
})

const icon = computed(() => {
  switch (bannerMode.value) {
    case 'running':
      return '⟳'
    case 'success':
      return '✓'
    case 'error':
      return '⚠'
    default:
      return '⟳'
  }
})

onMounted(() => {
  // 先接上后端可能正在跑的任务，再检查是否有新版本
  void store.loadStatus()
  void store.resumeJob()
  void store.checkUpdate()
})

function handleDismiss(): void {
  store.dismiss()
}

function handlePull(): void {
  void store.startPull()
}
</script>

<template>
  <div class="update-banners">
    <!-- 仓库初始化状态 -->
    <div v-if="store.repoStatus === 'cloning'" class="repo-status-banner repo-status-cloning">
      <div class="update-content">
        <span class="update-icon">⟳</span>
        <span class="update-title">正在初始化 coin11-tb 仓库...</span>
      </div>
    </div>
    <div v-else-if="store.repoStatus === 'error'" class="repo-status-banner repo-status-error">
      <div class="update-content">
        <span class="update-icon">⚠</span>
        <div class="update-text">
          <span class="update-title">coin11-tb 仓库初始化失败</span>
          <span class="update-detail">{{ store.repoError }}</span>
        </div>
      </div>
      <router-link class="btn-link" to="/updates">版本管理</router-link>
    </div>

    <!-- 更新任务 / 新版本提示 -->
    <div v-if="bannerMode" :class="['update-banner', `is-${bannerMode}`]">
      <div class="update-content">
        <span class="update-icon">{{ icon }}</span>
        <div class="update-text">
          <span class="update-title">{{ title }}</span>
          <span class="update-detail">{{ detail }}</span>
        </div>
      </div>

      <div class="update-actions">
        <button
          v-if="bannerMode === 'update' || bannerMode === 'error'"
          class="btn-update"
          :disabled="store.checking || store.pulling"
          @click="handlePull"
        >
          {{ bannerMode === 'error' ? '重试' : '立即更新' }}
        </button>
        <router-link class="btn-link" to="/updates">版本管理</router-link>
        <button
          v-if="bannerMode !== 'running'"
          class="btn-dismiss"
          type="button"
          aria-label="关闭提示"
          @click="handleDismiss"
        >
          ✕
        </button>
      </div>

      <!-- 进行中：把进度条嵌在横幅底部，刷新页面后由 /progress 恢复 -->
      <div
        v-if="bannerMode === 'running'"
        class="progress-track"
        role="progressbar"
        :aria-valuenow="store.job.progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="store.job.stage_label || '更新进度'"
      >
        <div class="progress-fill" :style="{ width: `${store.job.progress}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-banners {
  display: flex;
  flex-direction: column;
}

.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.08), rgba(59, 130, 246, 0.08));
  border-bottom: 1px solid var(--border-accent);
  gap: 16px;
}

.update-banner.is-success {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(0, 240, 255, 0.06));
  border-bottom-color: rgba(16, 185, 129, 0.3);
}

.update-banner.is-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.08));
  border-bottom-color: rgba(239, 68, 68, 0.3);
}

.update-content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.update-icon {
  font-size: 16px;
  color: var(--accent);
  flex-shrink: 0;
}

.is-success .update-icon {
  color: var(--success);
}

.is-error .update-icon {
  color: var(--error);
}

.is-running .update-icon {
  animation: spin 1.2s linear infinite;
}

.update-text {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 14px;
  min-width: 0;
}

.update-title {
  color: var(--accent);
  font-weight: 600;
}

.is-success .update-title {
  color: var(--success);
}

.is-error .update-title {
  color: var(--error);
}

.update-detail {
  color: var(--text-secondary);
  word-break: break-word;
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-update {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: rgba(0, 240, 255, 0.1);
  color: var(--accent);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-update:hover:not(:disabled) {
  background: rgba(0, 240, 255, 0.2);
}

.btn-update:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-link {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-link:hover {
  border-color: var(--border-accent);
  color: var(--accent);
}

.btn-dismiss {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  transition: color 0.2s;
}

.btn-dismiss:hover {
  color: var(--text-primary);
}

/* 进度条占满横幅底部一行 */
.progress-track {
  flex-basis: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(148, 163, 184, 0.15);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--info));
  border-radius: 2px;
  transition: width 0.4s ease;
}

.repo-status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  gap: 16px;
}

.repo-status-cloning {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.08));
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.repo-status-error {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(245, 158, 11, 0.08));
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
}
</style>
