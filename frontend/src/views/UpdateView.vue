<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ErrorBanner from '@/components/common/ErrorBanner.vue'
import { useUpdateStore } from '@/stores/update'

const store = useUpdateStore()
const { status, settings, job, updateInfo, checking, savingSettings, error, settingsError, pulling } =
  storeToRefs(store)

const repoUrlInput = ref('')
const branchInput = ref('')
const saveNotice = ref(false)
const confirmReclone = ref(false)
const logBox = ref<HTMLElement | null>(null)

// 配置加载/保存后同步表单（用户未编辑时不会被打断：只在 settings 变化时写入）
watch(
  () => settings.value,
  (value) => {
    if (!value) return
    repoUrlInput.value = value.repo_url ?? ''
    branchInput.value = value.branch ?? ''
  },
  { immediate: true },
)

const settingsDirty = computed(() => {
  const value = settings.value
  if (!value) return false
  return (
    repoUrlInput.value.trim() !== (value.repo_url ?? '').trim() ||
    branchInput.value.trim() !== (value.branch ?? '').trim()
  )
})

const currentShort = computed(
  () =>
    (job.value.current_commit ||
      status.value?.current_commit ||
      updateInfo.value.current_commit ||
      ''
    ).slice(0, 8) || '—',
)
const remoteShort = computed(
  () => (updateInfo.value.latest_commit || status.value?.remote_commit || '').slice(0, 8) || '—',
)

const deploymentLabel = computed(() =>
  status.value?.deployment === 'docker' ? 'Docker 容器' : '源码运行',
)
const repoStateLabel = computed(() => {
  switch (status.value?.repo_status) {
    case 'ready':
      return '就绪'
    case 'cloning':
      return '初始化中'
    case 'error':
      return '异常'
    default:
      return '未知'
  }
})
const repoUrlSourceLabel = computed(() =>
  status.value?.repo_url_source === 'settings' ? '页面配置' : '环境变量默认',
)
const branchLabel = computed(() => {
  const branch = status.value?.branch || updateInfo.value.branch || '—'
  return status.value?.branch_source === 'settings' ? `${branch}（指定）` : `${branch}（自动探测）`
})

const versionBadge = computed(() => {
  if (checking.value) return '检查中...'
  return updateInfo.value.has_update
    ? `${updateInfo.value.commits_behind} 个提交落后`
    : '已是最新'
})
const versionBadgeClass = computed(() => {
  if (checking.value) return 'badge'
  return updateInfo.value.has_update ? 'badge badge-warn' : 'badge badge-ok'
})

const jobStatusLabel = computed(() => {
  switch (job.value.status) {
    case 'running':
      return '更新中'
    case 'success':
      return '成功'
    case 'error':
      return '失败'
    default:
      return '空闲'
  }
})

const errorTitle = computed(() =>
  updateInfo.value.warning && error.value === updateInfo.value.warning
    ? '更新检查提示'
    : '操作失败',
)

watch(
  () => job.value.logs.length,
  async () => {
    await nextTick()
    const el = logBox.value
    if (el) el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)

onMounted(() => {
  void store.loadStatus()
  void store.loadSettings()
  // 刷新页面时把后端正在跑（或刚结束）的任务接回来
  void store.resumeJob({ includeFinished: true })
  void store.checkUpdate({ silent: true })
})

async function refreshAll(): Promise<void> {
  await Promise.all([store.loadStatus(), store.loadSettings()])
  await store.checkUpdate()
}

async function handleCheck(): Promise<void> {
  await store.checkUpdate()
}

async function handlePull(): Promise<void> {
  await store.startPull()
}

async function handleSave(): Promise<void> {
  const ok = await store.saveSettings(repoUrlInput.value, branchInput.value)
  if (!ok) return
  saveNotice.value = true
  setTimeout(() => {
    saveNotice.value = false
  }, 2500)
}

async function handleResetDefault(): Promise<void> {
  repoUrlInput.value = ''
  const ok = await store.saveSettings('', branchInput.value)
  if (ok) {
    saveNotice.value = true
    setTimeout(() => {
      saveNotice.value = false
    }, 2500)
  }
}

async function handleReclone(): Promise<void> {
  confirmReclone.value = false
  await store.reclone()
}
</script>

<template>
  <div class="update-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">版本管理</h1>
        <p class="page-subtitle">任务脚本仓库（coin11-tb）的更新、进度与来源配置</p>
      </div>
      <button class="btn-refresh" type="button" :disabled="checking || pulling" @click="refreshAll">
        <span v-if="checking" class="spinner" aria-hidden="true" />
        {{ checking ? '检查中...' : '刷新状态' }}
      </button>
    </div>

    <ErrorBanner
      :message="error"
      :title="errorTitle"
      :show-retry="!pulling"
      :retrying="checking"
      @retry="refreshAll"
    />

    <div class="info-grid">
      <section class="card pane">
        <div class="pane-header">
          <div>
            <h2 class="pane-title">运行环境</h2>
            <p class="pane-desc">平台版本与部署形态</p>
          </div>
        </div>
        <dl class="kv-list">
          <div class="kv-row">
            <dt>平台版本</dt>
            <dd>v{{ status?.app_version || '—' }}</dd>
          </div>
          <div class="kv-row">
            <dt>部署方式</dt>
            <dd>{{ deploymentLabel }}</dd>
          </div>
          <div class="kv-row">
            <dt>仓库状态</dt>
            <dd>
              <span :class="['state-dot', status?.repo_status || 'unknown']" />
              {{ repoStateLabel }}
            </dd>
          </div>
          <div class="kv-row">
            <dt>仓库路径</dt>
            <dd class="mono ellipsis" :title="status?.repo_path">{{ status?.repo_path || '—' }}</dd>
          </div>
        </dl>

        <div v-if="status?.deployment === 'docker'" class="docker-tip">
          <span class="tip-title">Docker 部署提示</span>
          <p>
            本页可在容器内更新<strong>任务脚本仓库</strong>；平台本体（后端/前端镜像）不会自更新，
            升级请执行：
          </p>
          <code>docker compose pull &amp;&amp; docker compose up -d</code>
        </div>
      </section>

      <section class="card pane">
        <div class="pane-header">
          <div>
            <h2 class="pane-title">当前版本</h2>
            <p class="pane-desc">本地与远端提交对比</p>
          </div>
          <span :class="versionBadgeClass">
            {{ versionBadge }}
          </span>
        </div>
        <dl class="kv-list">
          <div class="kv-row">
            <dt>本地提交</dt>
            <dd class="mono">{{ currentShort }}</dd>
          </div>
          <div class="kv-row">
            <dt>远端提交</dt>
            <dd class="mono">{{ remoteShort }}</dd>
          </div>
          <div class="kv-row">
            <dt>跟踪分支</dt>
            <dd>{{ branchLabel }}</dd>
          </div>
          <div class="kv-row">
            <dt>生效地址</dt>
            <dd class="mono ellipsis" :title="status?.repo_url || settings?.effective_repo_url">
              {{ status?.repo_url || settings?.effective_repo_url || '—' }}
            </dd>
          </div>
          <div class="kv-row">
            <dt>上次检查</dt>
            <dd>{{ status?.last_checked_at ? status.last_checked_at.replace('T', ' ').slice(0, 19) : '尚未检查' }}</dd>
          </div>
        </dl>
        <p v-if="status?.dirty" class="dirty-warning">
          ⚠ 仓库有 {{ status.dirty_files.length }} 处未提交的本地修改，更新会被中止（避免覆盖你的改动）。
          <span v-if="status.dirty_files.length" class="dirty-files">
            {{ status.dirty_files.slice(0, 3).join('、') }}{{ status.dirty_files.length > 3 ? ' 等' : '' }}
          </span>
        </p>
      </section>
    </div>

    <!-- ── GitHub 仓库配置 ── -->
    <section class="card pane">
      <div class="pane-header">
        <div>
          <h2 class="pane-title">GitHub 仓库</h2>
          <p class="pane-desc">
            指定任务脚本仓库地址与跟踪分支；留空则回退到 .env 的
            <code>COIN11_TB_REPO_URL</code> / 自动探测分支。
          </p>
        </div>
        <span class="badge">{{ repoUrlSourceLabel }}</span>
      </div>

      <div class="form-grid">
        <label class="field" for="repo-url">
          <span class="field-label">仓库地址</span>
          <input
            id="repo-url"
            v-model="repoUrlInput"
            class="text-input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="https://github.com/czl0325/coin11-tb.git"
          />
          <span class="field-hint">支持 https://、ssh:// 或 git@host:path 形式</span>
        </label>

        <label class="field" for="repo-branch">
          <span class="field-label">跟踪分支</span>
          <input
            id="repo-branch"
            v-model="branchInput"
            class="text-input"
            type="text"
            spellcheck="false"
            autocomplete="off"
            placeholder="留空自动探测（main / master）"
          />
          <span class="field-hint">切换分支后请再执行一次「检查更新」</span>
        </label>
      </div>

      <div class="form-actions">
        <button
          class="btn-primary"
          type="button"
          :disabled="savingSettings || !settingsDirty"
          @click="handleSave"
        >
          {{ savingSettings ? '保存中...' : '保存并应用' }}
        </button>
        <button
          class="btn-ghost"
          type="button"
          :disabled="savingSettings || (settings?.repo_url ?? '') === ''"
          @click="handleResetDefault"
        >
          恢复默认地址
        </button>
        <span v-if="saveNotice" class="ok-text" role="status">✓ 已保存并应用</span>
        <span v-if="settingsError" class="inline-error" role="alert">{{ settingsError }}</span>
      </div>
    </section>

    <!-- ── 更新与进度 ── -->
    <section class="card pane">
      <div class="pane-header">
        <div>
          <h2 class="pane-title">更新</h2>
          <p class="pane-desc">更新过程分阶段执行，进度与日志会实时刷新，刷新页面也不会丢失</p>
        </div>
        <div class="pane-actions">
          <button
            class="btn-ghost"
            type="button"
            :disabled="checking || pulling"
            @click="handleCheck"
          >
            {{ checking ? '检查中...' : '检查更新' }}
          </button>
          <button
            class="btn-primary"
            type="button"
            :disabled="pulling || checking || !updateInfo.has_update"
            @click="handlePull"
          >
            {{ pulling ? '更新中...' : '立即更新' }}
          </button>
        </div>
      </div>

      <div v-if="updateInfo.warning" class="inline-warning" role="status">
        {{ updateInfo.warning }}
      </div>

      <div v-if="status?.dirty" class="inline-warning" role="status">
        仓库存在未提交的本地修改，更新会被中止。请先提交/撤销改动，或在下方「重新克隆仓库」。
      </div>

      <!-- 进度面板：任务开始后一直保留结果，不自动消失 -->
      <div v-if="job.status !== 'idle'" class="progress-panel">
        <div class="progress-head">
          <span :class="['status-pill', job.status]">{{ jobStatusLabel }}</span>
          <span class="stage-label" role="status">{{ job.stage_label }}</span>
          <span class="spacer" />
          <span class="progress-num">{{ job.progress }}%</span>
          <span class="elapsed">{{ job.elapsed_seconds }}s</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuenow="job.progress"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="job.stage_label || '更新进度'"
        >
          <div class="progress-fill" :style="{ width: `${job.progress}%` }" />
        </div>
        <p v-if="job.message" :class="['job-message', job.status]">{{ job.message }}</p>

        <div ref="logBox" class="job-log" role="log" aria-live="polite">
          <div v-for="(line, index) in job.logs" :key="index" :class="['log-line', line.level]">
            <span class="log-time">{{ line.time }}</span>
            <span class="log-text">{{ line.text }}</span>
          </div>
          <div v-if="job.logs.length === 0" class="log-empty">等待任务输出...</div>
        </div>
      </div>

      <div v-if="updateInfo.has_update && updateInfo.commit_messages.length" class="commit-list">
        <h3 class="commit-title">待更新提交（{{ updateInfo.commit_messages.length }}）</h3>
        <ul>
          <li v-for="message in updateInfo.commit_messages" :key="message">
            <code>{{ message }}</code>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── 重新克隆（危险操作） ── -->
    <section class="card pane danger-pane">
      <div class="pane-header">
        <div>
          <h2 class="pane-title">重新克隆仓库</h2>
          <p class="pane-desc">
            仓库历史分叉、目录损坏，或切换到完全不同的 GitHub 仓库后使用。旧目录会改名备份，不会删除。
          </p>
        </div>
      </div>

      <div v-if="!confirmReclone" class="form-actions">
        <button
          class="btn-warn"
          type="button"
          :disabled="pulling"
          @click="confirmReclone = true"
        >
          重新克隆…
        </button>
      </div>
      <div v-else class="confirm-row">
        <span class="confirm-text">
          确认重新克隆？克隆期间任务执行可能受影响，旧仓库会保留为
          <code>&lt;路径&gt;.bak-时间戳</code>。
        </span>
        <button class="btn-danger" type="button" :disabled="pulling" @click="handleReclone">
          确认重新克隆
        </button>
        <button class="btn-ghost" type="button" @click="confirmReclone = false">取消</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.update-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}

.pane {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pane-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pane-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.pane-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.7;
}

.pane-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kv-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}

.kv-row dt {
  color: var(--text-muted);
  flex-shrink: 0;
}

.kv-row dd {
  color: var(--text-secondary);
  text-align: right;
  min-width: 0;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.state-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
  background: var(--text-muted);
}

.state-dot.ready {
  background: var(--success);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

.state-dot.cloning {
  background: var(--info);
}

.state-dot.error {
  background: var(--error);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(148, 163, 184, 0.06);
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.badge-ok {
  border-color: rgba(16, 185, 129, 0.3);
  background: var(--success-dim);
  color: var(--success);
}

.badge-warn {
  border-color: rgba(245, 158, 11, 0.3);
  background: var(--warning-dim);
  color: var(--warning);
}

.docker-tip {
  border: 1px dashed rgba(59, 130, 246, 0.35);
  border-radius: 10px;
  padding: 12px 14px;
  background: rgba(59, 130, 246, 0.06);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.tip-title {
  display: block;
  color: var(--info);
  font-weight: 600;
  margin-bottom: 4px;
}

.docker-tip p {
  margin: 0 0 8px;
}

.docker-tip code,
.confirm-text code {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--accent);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.text-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(10, 14, 26, 0.6);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.text-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.1);
}

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-ghost,
.btn-warn,
.btn-danger {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  border: 1px solid var(--accent);
  background: rgba(0, 240, 255, 0.12);
  color: var(--accent);
}

.btn-primary:hover:not(:disabled) {
  background: rgba(0, 240, 255, 0.22);
}

.btn-ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover:not(:disabled) {
  border-color: var(--border-accent);
  color: var(--accent);
}

.btn-warn {
  border: 1px solid var(--warning);
  background: var(--warning-dim);
  color: var(--warning);
}

.btn-warn:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.25);
}

.btn-danger {
  border: 1px solid var(--error);
  background: var(--error-dim);
  color: var(--error);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

.btn-primary:disabled,
.btn-ghost:disabled,
.btn-warn:disabled,
.btn-danger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary:focus-visible,
.btn-ghost:focus-visible,
.btn-warn:focus-visible,
.btn-danger:focus-visible,
.text-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.ok-text {
  font-size: 12px;
  color: var(--success);
}

.inline-error {
  font-size: 12px;
  color: var(--error);
}

.inline-warning {
  font-size: 12px;
  color: var(--warning);
  background: var(--warning-dim);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 8px;
  padding: 8px 12px;
}

.dirty-warning {
  font-size: 12px;
  color: var(--warning);
  margin: 0;
}

.dirty-files {
  color: var(--text-muted);
  word-break: break-all;
}

/* ── 进度 ── */
.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: rgba(10, 14, 26, 0.4);
}

.progress-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.status-pill {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.status-pill.running {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.12);
  color: var(--info);
}

.status-pill.success {
  border-color: rgba(16, 185, 129, 0.4);
  background: var(--success-dim);
  color: var(--success);
}

.status-pill.error {
  border-color: rgba(239, 68, 68, 0.4);
  background: var(--error-dim);
  color: var(--error);
}

.stage-label {
  color: var(--text-secondary);
}

.spacer {
  flex: 1;
}

.progress-num {
  color: var(--accent);
  font-weight: 600;
}

.elapsed {
  color: var(--text-muted);
}

.progress-track {
  height: 6px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.15);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent), var(--info));
  transition: width 0.4s ease;
}

.job-message {
  font-size: 12px;
  margin: 0;
  word-break: break-word;
  color: var(--text-secondary);
}

.job-message.success {
  color: var(--success);
}

.job-message.error {
  color: var(--error);
}

.job-log {
  max-height: 240px;
  overflow-y: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--border);
  padding: 10px 12px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.75;
}

.log-line {
  display: flex;
  gap: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-line.error .log-text {
  color: var(--error);
}

.log-line.warning .log-text {
  color: var(--warning);
}

.log-line.success .log-text {
  color: var(--success);
}

.log-empty {
  color: var(--text-muted);
}

.commit-list {
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.commit-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

.commit-list ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.commit-list code {
  font-size: 11.5px;
  color: var(--text-muted);
  word-break: break-all;
}

.danger-pane {
  border-color: rgba(239, 68, 68, 0.18);
}

.confirm-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.confirm-text {
  font-size: 12px;
  color: var(--warning);
  flex-basis: 100%;
}
</style>
