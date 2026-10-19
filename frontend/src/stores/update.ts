import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  UpdateInfo,
  UpdateJob,
  UpdateJobStartResponse,
  UpdateRepoStatus,
  UpdateSettingsInfo,
  UpdateSettingsSaveResponse,
} from '@/types'
import { apiFetch, errMessage } from '@/utils/api'

/** 进度轮询间隔：更新任务通常是秒级，800ms 足够顺滑又不会打满后端 */
const POLL_INTERVAL_MS = 800
/** 进度接口连续失败多少次后停止轮询（避免后端重启后无限打日志） */
const MAX_POLL_FAILURES = 3
/** 页面刷新后，"最近一次已完成任务"最多展示这么久，避免每次进页面都弹旧的成功提示 */
const FINISHED_NOTICE_TTL_MS = 30 * 60 * 1000

const emptyInfo = (): UpdateInfo => ({
  has_update: false,
  current_commit: '',
  latest_commit: '',
  commits_behind: 0,
  commit_messages: [],
})

/** 防御：接口异常/测试桩可能返回数组或非对象，直接当对象用会拿到 undefined */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const emptyJob = (): UpdateJob => ({
  id: '',
  mode: '',
  status: 'idle',
  stage: '',
  stage_label: '',
  progress: 0,
  message: '',
  branch: '',
  previous_commit: '',
  current_commit: '',
  commits_pulled: 0,
  started_at: null,
  finished_at: null,
  elapsed_seconds: 0,
  logs: [],
  result: null,
})

export const useUpdateStore = defineStore('update', () => {
  // ── State ──
  const updateInfo = ref<UpdateInfo>(emptyInfo())
  const status = ref<UpdateRepoStatus | null>(null)
  const settings = ref<UpdateSettingsInfo | null>(null)
  const job = ref<UpdateJob>(emptyJob())
  const checking = ref(false)
  const savingSettings = ref(false)
  const statusLoading = ref(false)
  const error = ref<string | null>(null)
  const settingsError = ref<string | null>(null)
  const dismissed = ref(false)

  // ── 派生状态 ──
  const pulling = computed(() => job.value.status === 'running')
  const jobFinished = computed(
    () => job.value.status === 'success' || job.value.status === 'error',
  )
  const repoStatus = computed(() => status.value?.repo_status ?? 'unknown')
  const repoError = computed(() => status.value?.repo_error || null)

  // 轮询句柄与请求状态（不需要响应式）
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollFailures = 0
  let checkInFlight = false
  // 横幅与版本页会同时请求状态/设置；共享同一个在途请求，避免重复 spawn git 进程
  let statusPromise: Promise<void> | null = null
  let settingsPromise: Promise<void> | null = null

  // ── Actions ──

  function applyJob(data: UpdateJob | null | undefined): void {
    if (!isRecord(data)) return
    job.value = {
      ...emptyJob(),
      ...(data as Partial<UpdateJob>),
      logs: Array.isArray(data.logs) ? data.logs : [],
    }
  }

  function startPolling(): void {
    stopPolling()
    pollFailures = 0
    pollTimer = setInterval(() => {
      void fetchProgress()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /** 任务结束后刷新版本状态，并让横幅展示结果（成功/失败都不自动消失） */
  async function handleJobFinished(): Promise<void> {
    if (job.value.status === 'success') {
      updateInfo.value = {
        ...updateInfo.value,
        has_update: false,
        commits_behind: 0,
        commit_messages: [],
        current_commit: job.value.current_commit || updateInfo.value.current_commit,
        latest_commit: job.value.current_commit || updateInfo.value.latest_commit,
        checked_at: new Date().toISOString(),
      }
      error.value = null
      await loadStatus()
    } else if (job.value.status === 'error') {
      error.value = job.value.message || '更新失败'
      await loadStatus()
    }
  }

  async function fetchProgress(): Promise<void> {
    try {
      const data = await apiFetch<UpdateJob>('/api/update/progress')
      if (!isRecord(data)) return
      pollFailures = 0
      applyJob(data)
      if (data.status !== 'running') {
        stopPolling()
        await handleJobFinished()
      }
    } catch (e) {
      pollFailures += 1
      if (pollFailures >= MAX_POLL_FAILURES) {
        stopPolling()
        error.value = errMessage(e, '获取更新进度失败')
      }
    }
  }

  function loadStatus(): Promise<void> {
    if (statusPromise) return statusPromise
    statusPromise = (async () => {
      statusLoading.value = true
      try {
        const data = await apiFetch<UpdateRepoStatus>('/api/update/status')
        if (isRecord(data)) status.value = data as unknown as UpdateRepoStatus
      } catch (e) {
        // 状态接口失败不覆盖更重要的更新错误
        if (!error.value) error.value = errMessage(e, '获取仓库状态失败')
      } finally {
        statusLoading.value = false
      }
    })()
    void statusPromise.finally(() => {
      statusPromise = null
    })
    return statusPromise
  }

  function loadSettings(): Promise<void> {
    if (settingsPromise) return settingsPromise
    settingsPromise = (async () => {
      try {
        const data = await apiFetch<UpdateSettingsInfo>('/api/update/settings')
        if (isRecord(data)) settings.value = data as unknown as UpdateSettingsInfo
      } catch (e) {
        settingsError.value = errMessage(e, '加载版本设置失败')
      }
    })()
    void settingsPromise.finally(() => {
      settingsPromise = null
    })
    return settingsPromise
  }

  async function checkUpdate(options: { silent?: boolean } = {}): Promise<void> {
    // 正在拉取时不要 fetch，避免两边同时操作 .git
    if (checkInFlight || pulling.value) return
    checkInFlight = true
    checking.value = true
    try {
      const data = await apiFetch<UpdateInfo>('/api/update/check')
      updateInfo.value = {
        ...emptyInfo(),
        ...(isRecord(data) ? (data as Partial<UpdateInfo>) : {}),
      }
      if (!options.silent) dismissed.value = false
      // fetch 失败仍返回旧信息，用提示告知而不是假装"已是最新"
      error.value = data?.warning || null
    } catch (e) {
      error.value = errMessage(e, '检查更新失败')
      console.error('[UpdateStore] checkUpdate failed:', error.value)
    } finally {
      checkInFlight = false
      checking.value = false
    }
  }

  /** 启动更新任务。修复旧实现：不再用 pull 的返回值覆盖 updateInfo */
  async function startPull(): Promise<void> {
    if (pulling.value) return
    error.value = null
    dismissed.value = false
    try {
      const data = await apiFetch<UpdateJobStartResponse>('/api/update/pull', {
        method: 'POST',
      })
      applyJob(data?.job)
      startPolling()
    } catch (e) {
      error.value = errMessage(e, '启动更新失败')
      console.error('[UpdateStore] startPull failed:', error.value)
    }
  }

  /** 备份并重新克隆任务脚本仓库（耗时较长，同样走进度轮询） */
  async function reclone(): Promise<void> {
    if (pulling.value) return
    error.value = null
    dismissed.value = false
    try {
      const data = await apiFetch<UpdateJobStartResponse>('/api/update/reclone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      applyJob(data?.job)
      startPolling()
    } catch (e) {
      error.value = errMessage(e, '启动重新克隆失败')
      console.error('[UpdateStore] reclone failed:', error.value)
    }
  }

  /**
   * 恢复后端正在进行的任务（页面刷新 / 从其它页面进入时调用）。
   * includeFinished=true 会额外展示"最近一次"任务的完成结果（版本页需要），
   * 横幅不传，避免每次打开页面都弹旧的成功提示。
   */
  async function resumeJob(options: { includeFinished?: boolean } = {}): Promise<void> {
    try {
      const data = await apiFetch<UpdateJob>('/api/update/progress')
      if (!isRecord(data)) return
      if (data.status === 'running') {
        applyJob(data)
        if (pollTimer === null) startPolling()
        return
      }
      if (options.includeFinished && data.id) {
        const finishedAt =
          typeof data.finished_at === 'string' ? Date.parse(data.finished_at) : Number.NaN
        const fresh =
          Number.isFinite(finishedAt) && Date.now() - finishedAt < FINISHED_NOTICE_TTL_MS
        if (fresh) applyJob(data)
      }
    } catch {
      // 进度接口不可用时保持静默：页面仍可正常检查/更新
    }
  }

  async function saveSettings(repoUrl: string, branch: string): Promise<boolean> {
    savingSettings.value = true
    settingsError.value = null
    try {
      const data = await apiFetch<UpdateSettingsSaveResponse>('/api/update/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl.trim(), branch: branch.trim() }),
      })
      if (data && isRecord(data.settings)) {
        settings.value = data.settings as unknown as UpdateSettingsInfo
      } else {
        await loadSettings()
      }
      error.value = null
      await loadStatus()
      // 仓库/分支变了，旧检查结果不可信，后台重新检查
      updateInfo.value = emptyInfo()
      void checkUpdate()
      return true
    } catch (e) {
      settingsError.value = errMessage(e, '保存版本设置失败')
      console.error('[UpdateStore] saveSettings failed:', settingsError.value)
      return false
    } finally {
      savingSettings.value = false
    }
  }

  function dismiss(): void {
    dismissed.value = true
  }

  /** 仅清除错误状态（与 devices store 保持一致的 clearError 约定） */
  function clearError(): void {
    error.value = null
  }

  function clearSettingsError(): void {
    settingsError.value = null
  }

  function reset(): void {
    stopPolling()
    updateInfo.value = emptyInfo()
    job.value = emptyJob()
    dismissed.value = false
    error.value = null
    settingsError.value = null
  }

  return {
    // state
    updateInfo,
    status,
    settings,
    job,
    checking,
    savingSettings,
    statusLoading,
    error,
    settingsError,
    dismissed,
    // derived
    pulling,
    jobFinished,
    repoStatus,
    repoError,
    // actions
    loadStatus,
    loadSettings,
    checkUpdate,
    startPull,
    reclone,
    resumeJob,
    fetchProgress,
    saveSettings,
    dismiss,
    clearError,
    clearSettingsError,
    reset,
  }
})
