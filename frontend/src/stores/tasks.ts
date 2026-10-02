import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TaskInfo, TaskQueueData, ScriptInfo, BatchTaskResult } from '@/types'
import { apiFetch, errMessage } from '@/utils/api'
import { useWebSocketStore } from '@/stores/websocket'

export const useTaskStore = defineStore('tasks', () => {
  // ── State ──
  const taskQueues = ref<TaskQueueData[]>([])
  const scripts = ref<ScriptInfo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Getters ──
  const allTasks = computed<TaskInfo[]>(() =>
    taskQueues.value.flatMap((q) => q.tasks),
  )

  const pendingTasks = computed(() =>
    allTasks.value.filter((t) => t.status === 'pending'),
  )

  const runningTasks = computed(() =>
    allTasks.value.filter((t) => t.status === 'running'),
  )

  const completedTasks = computed(() =>
    allTasks.value.filter((t) => t.status === 'completed'),
  )

  const failedTasks = computed(() =>
    allTasks.value.filter((t) => t.status === 'failed'),
  )

  const activeTasks = computed(() =>
    allTasks.value.filter((t) => t.status === 'pending' || t.status === 'running'),
  )

  function getQueueForDevice(deviceId: string): TaskInfo[] {
    return taskQueues.value.find((q) => q.device_id === deviceId)?.tasks ?? []
  }

  // ── Actions ──

  /** 获取可用脚本列表 */
  async function fetchScripts(): Promise<void> {
    try {
      scripts.value = await apiFetch<ScriptInfo[]>('/api/scripts')
    } catch (e) {
      error.value = errMessage(e, '获取脚本列表失败')
      console.error('[TaskStore] fetchScripts failed:', error.value)
    }
  }

  /**
   * 将每任务的 history log（\n 分隔）逐行注入日志通道。
   * 复用 websocket store 的 seedLog 去重（去重键为 任务 + 行文本），
   * 因此多行历史日志会全部注入，且与后端 WS 回放互不重复；
   * 重复调用 fetchQueue 也不会产生重复行。
   */
  function seedTaskLogs(deviceId: string, tasks: TaskInfo[]): void {
    const wsStore = useWebSocketStore()
    for (const task of tasks) {
      if (!task.log) continue
      const lines = task.log.split('\n').filter((l) => l.length > 0)
      for (const line of lines) {
        wsStore.seedLog(deviceId, task.id, line)
      }
    }
  }

  /** 获取指定设备的任务队列 */
  async function fetchQueue(deviceId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await apiFetch<TaskInfo[]>(`/api/devices/${deviceId}/queue`)
      // 合并到 taskQueues
      const existing = taskQueues.value.findIndex((q) => q.device_id === deviceId)
      if (existing !== -1) {
        taskQueues.value[existing] = { device_id: deviceId, tasks: data }
      } else {
        taskQueues.value.push({ device_id: deviceId, tasks: data })
      }
      // 把后端缓存的每任务历史日志注入日志通道（带按任务去重，作为 WS 回放的兜底）。
      // 自动任务可能在前端连接前已产生日志，此处的 Task.log 是这些日志的来源。
      seedTaskLogs(deviceId, data)
    } catch (e) {
      error.value = errMessage(e, '获取队列失败')
      console.error('[TaskStore] fetchQueue failed:', error.value)
    } finally {
      loading.value = false
    }
  }

  /** 获取所有设备队列 */
  async function fetchTasks(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      taskQueues.value = await apiFetch<TaskQueueData[]>('/api/tasks')
    } catch (e) {
      error.value = errMessage(e, '获取任务列表失败')
      console.error('[TaskStore] fetchTasks failed:', error.value)
    } finally {
      loading.value = false
    }
  }

  /** 添加任务到设备队列 */
  async function enqueueTask(deviceId: string, scriptName: string): Promise<void> {
    try {
      await apiFetch(`/api/devices/${deviceId}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_name: scriptName }),
      })
      await fetchQueue(deviceId)
    } catch (e) {
      error.value = errMessage(e, '添加任务失败')
      console.error('[TaskStore] enqueueTask failed:', error.value)
    }
  }

  /** 移除指定任务 */
  async function removeTask(deviceId: string, taskId: string): Promise<void> {
    try {
      await apiFetch(`/api/devices/${deviceId}/queue/${taskId}`, {
        method: 'DELETE',
      })
      await fetchQueue(deviceId)
    } catch (e) {
      error.value = errMessage(e, '移除任务失败')
      console.error('[TaskStore] removeTask failed:', error.value)
    }
  }

  /** 重新排序任务队列 */
  async function reorderTasks(deviceId: string, taskIds: string[]): Promise<void> {
    try {
      await apiFetch(`/api/devices/${deviceId}/queue/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_ids: taskIds }),
      })
      await fetchQueue(deviceId)
    } catch (e) {
      error.value = errMessage(e, '重新排序失败')
      console.error('[TaskStore] reorderTasks failed:', error.value)
    }
  }

  /** 开始执行队列 */
  async function startQueue(deviceId: string): Promise<void> {
    try {
      await apiFetch(`/api/devices/${deviceId}/queue/start`, {
        method: 'POST',
      })
    } catch (e) {
      error.value = errMessage(e, '启动队列失败')
      console.error('[TaskStore] startQueue failed:', error.value)
    }
  }

  /** 停止执行队列 */
  async function stopQueue(deviceId: string): Promise<void> {
    try {
      await apiFetch(`/api/devices/${deviceId}/queue/stop`, {
        method: 'POST',
      })
    } catch (e) {
      error.value = errMessage(e, '停止队列失败')
      console.error('[TaskStore] stopQueue failed:', error.value)
    }
  }

  /** 批量操作结果初始化 */
  function emptyBatchResult(): BatchTaskResult {
    return { succeeded: 0, failed: 0, errors: [] }
  }

  /** 执行批量操作并刷新任务列表 */
  async function runBatch(
    path: string,
    body: Record<string, unknown>,
    failMessage: string,
  ): Promise<BatchTaskResult> {
    loading.value = true
    error.value = null
    const result = emptyBatchResult()
    try {
      const data = await apiFetch<BatchTaskResult>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      result.succeeded = data.succeeded
      result.failed = data.failed
      result.errors = data.errors
      // 刷新所有受影响的设备队列
      await fetchTasks()
    } catch (e) {
      error.value = errMessage(e, failMessage)
      console.error(`[TaskStore] ${path} failed:`, error.value)
      result.failed = (body.device_ids as string[]).length
      result.errors = (body.device_ids as string[]).map((id) => ({ device_id: id, error: error.value! }))
    } finally {
      loading.value = false
    }
    return result
  }

  /** 批量分配任务到多台设备 */
  function batchEnqueueTask(scriptName: string, deviceIds: string[]): Promise<BatchTaskResult> {
    return runBatch('/api/tasks/batch-enqueue', { script_name: scriptName, device_ids: deviceIds }, '批量分配任务失败')
  }

  /** 批量启动设备队列 */
  function batchStartQueues(deviceIds: string[]): Promise<BatchTaskResult> {
    return runBatch('/api/tasks/batch-start', { device_ids: deviceIds }, '批量启动失败')
  }

  /** 批量停止设备队列 */
  function batchStopQueues(deviceIds: string[]): Promise<BatchTaskResult> {
    return runBatch('/api/tasks/batch-stop', { device_ids: deviceIds }, '批量停止失败')
  }

  return {
    // state
    taskQueues,
    scripts,
    loading,
    error,
    // getters
    allTasks,
    pendingTasks,
    runningTasks,
    completedTasks,
    failedTasks,
    activeTasks,
    getQueueForDevice,
    // actions
    fetchScripts,
    fetchQueue,
    fetchTasks,
    enqueueTask,
    removeTask,
    reorderTasks,
    startQueue,
    stopQueue,
    batchEnqueueTask,
    batchStartQueues,
    batchStopQueues,
  }
})
