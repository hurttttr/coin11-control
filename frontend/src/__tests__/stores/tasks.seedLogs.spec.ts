import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { useWebSocketStore } from '@/stores/websocket'
import type { TaskInfo } from '@/types'

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: 'task-1',
    device_id: 'dev1',
    script_name: 'auto.sh',
    status: 'completed',
    position: 0,
    created_at: '2025-06-17T10:00:00Z',
    log: '',
    ...overrides,
  }
}

/** 模拟 GET /api/devices/:id/queue 返回给定任务列表 */
function mockQueueFetch(tasks: TaskInfo[]): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(tasks),
  })
}

/** 读取通道内已注入的历史日志文本 */
function seededTexts(deviceId = 'dev1'): string[] {
  const ws = useWebSocketStore()
  return ws.deviceLogs(deviceId).map((m) => JSON.parse(m.data).text as string)
}

describe('taskStore 历史日志注入 (seedTaskLogs)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ── 回归：多行历史日志必须全部注入 ──
  // 旧实现 seedLog 按 taskId 去重，第一行写入后该任务即被标记，
  // 'L1\nL2\nL3' 只会注入 L1，刷新队列后自动任务的历史日志基本等于丢失。
  it('injects every line of a multi-line task history log', async () => {
    mockQueueFetch([createTask({ log: 'L1\nL2\nL3' })])
    const taskStore = useTaskStore()

    await taskStore.fetchQueue('dev1')

    expect(seededTexts()).toEqual(['L1', 'L2', 'L3'])
  })

  it('injects history logs of multiple tasks independently', async () => {
    mockQueueFetch([
      createTask({ id: 't1', log: 'a1\na2' }),
      createTask({ id: 't2', log: 'b1\nb2' }),
    ])
    const taskStore = useTaskStore()

    await taskStore.fetchQueue('dev1')

    expect(seededTexts()).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('does not duplicate lines when fetchQueue is called repeatedly', async () => {
    mockQueueFetch([createTask({ log: 'L1\nL2\nL3' })])
    const taskStore = useTaskStore()

    await taskStore.fetchQueue('dev1')
    await taskStore.fetchQueue('dev1')
    await taskStore.fetchQueue('dev1')

    expect(seededTexts()).toEqual(['L1', 'L2', 'L3'])
  })

  it('injects only the newly appended lines on the next fetch', async () => {
    const taskStore = useTaskStore()
    mockQueueFetch([createTask({ log: 'L1\nL2' })])
    await taskStore.fetchQueue('dev1')
    expect(seededTexts()).toEqual(['L1', 'L2'])

    // 任务继续运行，后端返回追加了新行的 log
    mockQueueFetch([createTask({ log: 'L1\nL2\nL3\nL4' })])
    await taskStore.fetchQueue('dev1')

    expect(seededTexts()).toEqual(['L1', 'L2', 'L3', 'L4'])
  })

  it('deduplicates against backend WS replay of the same lines', async () => {
    const ws = useWebSocketStore()
    // 后端 WS 连接时已回放两行
    for (const text of ['L1', 'L2']) {
      ws.receiveMessage('dev1', {
        type: 'log',
        device_id: 'dev1',
        data: JSON.stringify({ task_id: 'task-1', text }),
      })
    }

    mockQueueFetch([createTask({ log: 'L1\nL2\nL3' })])
    await useTaskStore().fetchQueue('dev1')

    // L1/L2 不重复，L3 被补齐
    expect(seededTexts()).toEqual(['L1', 'L2', 'L3'])
  })

  it('skips blank lines in the history log', async () => {
    mockQueueFetch([createTask({ log: 'L1\n\n\nL2\n' })])
    await useTaskStore().fetchQueue('dev1')

    expect(seededTexts()).toEqual(['L1', 'L2'])
  })

  it('collapses byte-identical repeated lines of one task (已知取舍)', async () => {
    // 去重键为 (任务, 行文本)，因此同一任务内完全相同的重复行会被折叠成一条。
    // 这是为了让 WS 回放与 fetchQueue 两条通道能互相去重而接受的取舍。
    mockQueueFetch([createTask({ log: 'same\nsame\nsame' })])
    await useTaskStore().fetchQueue('dev1')

    expect(seededTexts()).toEqual(['same'])
  })

  it('keeps devices isolated', async () => {
    const taskStore = useTaskStore()
    mockQueueFetch([createTask({ id: 't1', log: 'a1' })])
    await taskStore.fetchQueue('dev1')
    mockQueueFetch([createTask({ id: 't2', device_id: 'dev2', log: 'b1' })])
    await taskStore.fetchQueue('dev2')

    expect(seededTexts('dev1')).toEqual(['a1'])
    expect(seededTexts('dev2')).toEqual(['b1'])
  })
})
