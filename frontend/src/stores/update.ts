import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { UpdateInfo } from '@/types'
import { apiFetch, errMessage } from '@/utils/api'

export const useUpdateStore = defineStore('update', () => {
  // ── State ──
  const updateInfo = ref<UpdateInfo>({
    has_update: false,
    current_commit: '',
    latest_commit: '',
    commits_behind: 0,
    commit_messages: [],
  })
  const checking = ref(false)
  const pulling = ref(false)
  const error = ref<string | null>(null)
  const dismissed = ref(false)
  const repoStatus = ref<string>('unknown')  // unknown | cloning | ready | error
  const repoError = ref<string | null>(null)
  const repoChecking = ref(false)

  // ── Actions ──

  async function checkUpdate(): Promise<void> {
    checking.value = true
    error.value = null
    try {
      updateInfo.value = await apiFetch<UpdateInfo>('/api/update/check')
      dismissed.value = false
    } catch (e) {
      error.value = errMessage(e, '检查更新失败')
      console.error('[UpdateStore] checkUpdate failed:', error.value)
    } finally {
      checking.value = false
    }
  }

  async function pullUpdate(): Promise<void> {
    pulling.value = true
    error.value = null
    try {
      updateInfo.value = await apiFetch<UpdateInfo>('/api/update/pull', {
        method: 'POST',
      })
    } catch (e) {
      error.value = errMessage(e, '拉取更新失败')
      console.error('[UpdateStore] pullUpdate failed:', error.value)
    } finally {
      pulling.value = false
    }
  }

  async function checkRepoStatus(): Promise<void> {
    repoChecking.value = true
    try {
      const data = await apiFetch<{ status: string; error?: string | null }>('/api/update/repo-status')
      repoStatus.value = data.status
      repoError.value = data.error ?? null
    } catch (e) {
      repoStatus.value = 'error'
      repoError.value = errMessage(e, '检查仓库状态失败')
    } finally {
      repoChecking.value = false
    }
  }

  function dismiss(): void {
    dismissed.value = true
  }

  /** 仅清除错误状态（与 devices store 保持一致的 clearError 约定）。
   *  reset() 会连带清空 updateInfo，只想消掉错误提示时用这个。 */
  function clearError(): void {
    error.value = null
  }

  function reset(): void {
    updateInfo.value = {
      has_update: false,
      current_commit: '',
      latest_commit: '',
      commits_behind: 0,
      commit_messages: [],
    }
    dismissed.value = false
    error.value = null
  }

  return {
    // state
    updateInfo,
    checking,
    pulling,
    error,
    dismissed,
    repoStatus,
    repoError,
    repoChecking,
    // actions
    checkUpdate,
    pullUpdate,
    checkRepoStatus,
    dismiss,
    clearError,
    reset,
  }
})
