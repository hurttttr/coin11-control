<script setup lang="ts">
import { useUpdateStore } from '@/stores/update'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'

const store = useUpdateStore()
const { updateInfo, checking, dismissed, repoError } = storeToRefs(store)

onMounted(() => {
  store.checkUpdate()
  store.checkRepoStatus()
})

function handleDismiss(): void {
  store.dismiss()
}

function handlePull(): void {
  store.pullUpdate()
}
</script>

<template>
  <!-- 仓库状态提示 -->
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
        <span class="update-detail">{{ repoError }}</span>
      </div>
    </div>
  </div>

  <!-- 现有更新提示 -->
  <div
    v-if="updateInfo.has_update && !dismissed"
    class="update-banner"
  >
    <div class="update-content">
      <span class="update-icon">⟳</span>
      <div class="update-text">
        <span class="update-title">新版本可用</span>
        <span class="update-detail">
          {{ updateInfo.commits_behind }} 个提交落后 ·
          {{ updateInfo.latest_commit.slice(0, 8) }}
        </span>
      </div>
    </div>
    <div class="update-actions">
      <button
        class="btn-update"
        :disabled="checking || store.pulling"
        @click="handlePull"
      >
        <span v-if="store.pulling" class="spinner" />
        {{ store.pulling ? '更新中...' : '立即更新' }}
      </button>
      <button class="btn-dismiss" @click="handleDismiss">✕</button>
    </div>
  </div>
</template>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.08), rgba(59, 130, 246, 0.08));
  border-bottom: 1px solid var(--border-accent);
  gap: 16px;
}

.update-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.update-icon {
  font-size: 16px;
  color: var(--accent);
}

.update-text {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.update-title {
  color: var(--accent);
  font-weight: 600;
}

.update-detail {
  color: var(--text-secondary);
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  /* @keyframes spin 见 global.css */
  animation: spin 0.6s linear infinite;
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
