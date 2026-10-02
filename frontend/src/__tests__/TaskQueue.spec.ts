import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { nextTick } from 'vue'
import TaskQueue from '@/components/task/TaskQueue.vue'
import { useTaskStore } from '@/stores/tasks'
import type { TaskInfo } from '@/types'

let router: ReturnType<typeof createRouter>

// Mock vuedraggable
vi.mock('vuedraggable', () => ({
  default: {
    name: 'VueDraggable',
    props: {
      modelValue: { type: Array, default: () => [] },
      handle: { type: String, default: '' },
      itemKey: { type: String, default: 'id' },
      animation: { type: Number, default: 0 },
    },
    template:
      '<div class="mock-draggable"><template v-for="(item, idx) in modelValue" :key="item[itemKey]"><slot name="item" :element="item" :index="idx" /></template></div>',
    emits: ['change', 'update:modelValue'],
  },
}))

// ScriptSelector mock — must emit 'select' via button click
vi.mock('@/components/task/ScriptSelector.vue', () => ({
  default: {
    name: 'ScriptSelector',
    props: ['scriptName'],
    template: `<div class="mock-script-selector">
      <button class="mock-select" @click="$emit('select', { name: 'test_script.sh', path: '/scripts/test.sh', description: 'A test script' })">Select</button>
      <button class="mock-close" @click="$emit('close')">Close</button>
    </div>`,
    emits: ['select', 'close'],
  },
}))

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    device_id: 'R58NA70A1YA',
    script_name: 'test_script.sh',
    status: 'pending',
    position: 1,
    created_at: '2025-06-17T10:00:00Z',
    log: '',
    ...overrides,
  }
}

/** 通过 fetchQueue 动作 + 模拟 fetch 为 store 填充队列数据 */
async function seedQueue(tasks: TaskInfo[], deviceId = 'R58NA70A1YA') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(tasks),
  })
  const store = useTaskStore()
  await store.fetchQueue(deviceId)
  return store
}

describe('TaskQueue.vue', () => {
  let pinia: ReturnType<typeof createPinia>
  const mountedWrappers: VueWrapper[] = []

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/device/:id', component: { template: '<div>detail</div>' } },
      ],
    })
  })

  afterEach(() => {
    // 卸载所有挂载实例并清空 body，避免 Teleport 到 body 的 DOM 跨测试残留
    for (const wrapper of mountedWrappers) wrapper.unmount()
    mountedWrappers.length = 0
    document.body.innerHTML = ''
  })

  function factory(props: { deviceId: string } = { deviceId: 'R58NA70A1YA' }) {
    const wrapper = mount(TaskQueue, {
      props,
      global: {
        plugins: [router, pinia],
        stubs: { Teleport: false },
      },
      attachTo: document.body,
    })
    mountedWrappers.push(wrapper)
    return wrapper
  }

  it('shows empty state when no tasks', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('暂无任务')
  })

  it('shows 0 task count when empty', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('0 个任务')
  })

  it('displays tasks from store on mount', async () => {
    await seedQueue([
      createTask({ script_name: 'backup.sh', status: 'pending' }),
      createTask({ script_name: 'cleanup.sh', status: 'completed' }),
    ])

    const wrapper = factory()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('backup.sh')
    expect(wrapper.text()).toContain('cleanup.sh')
    expect(wrapper.text()).toContain('2 个任务')
  })

  it('renders task status badges correctly', async () => {
    await seedQueue([
      createTask({ script_name: 'p.sh', status: 'pending' }),
      createTask({ script_name: 'r.sh', status: 'running' }),
      createTask({ script_name: 'c.sh', status: 'completed' }),
      createTask({ script_name: 'f.sh', status: 'failed' }),
    ])

    const wrapper = factory()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('等待中')
    expect(wrapper.text()).toContain('运行中')
    expect(wrapper.text()).toContain('已完成')
    expect(wrapper.text()).toContain('失败')
  })

  it('opens ScriptSelector when add button is clicked', async () => {
    const wrapper = factory()
    await nextTick()

    await wrapper.find('.btn-add').trigger('click')
    await nextTick()

    expect(document.body.querySelector('.mock-script-selector')).toBeTruthy()
  })

  it('closes ScriptSelector when close button is clicked', async () => {
    const wrapper = factory()
    await nextTick()

    await wrapper.find('.btn-add').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.mock-close')).toBeTruthy()

    await (document.body.querySelector('.mock-close') as HTMLElement).click()
    await nextTick()

    // ScriptSelector 关闭后应从 DOM 移除
    expect(document.body.querySelector('.mock-script-selector')).toBeNull()
  })

  it('adds a task when add button clicked', async () => {
    // 队列刷新会解析响应体，mock 必须提供 json（否则 apiFetch 返回 undefined，
    // seedTaskLogs 迭代失败并打出 'tasks is not iterable' 噪音）
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })

    const wrapper = factory()
    await nextTick()

    // Open selector
    await wrapper.find('.btn-add').trigger('click')
    await nextTick()

    const selectBtn = document.body.querySelector('.mock-select') as HTMLElement
    expect(selectBtn).toBeTruthy()

    await selectBtn.click()
    await nextTick()
    await nextTick()

    // After selecting a script, fetch should be called for enqueueTask API
    // The enqueueTask action calls fetch('/api/devices/R58NA70A1YA/queue', { method: 'POST', ... })
    const mockFetch = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }
    const postCalls = mockFetch.mock.calls.filter(
      (call) => call[0] === '/api/devices/R58NA70A1YA/queue' && call[1]?.method === 'POST',
    )
    expect(postCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('removes a task when remove button is clicked', async () => {
    const store = await seedQueue([createTask({ id: 'task-001', script_name: 'backup.sh' })])
    // 队列刷新会解析响应体，mock 必须提供 json（否则 apiFetch 返回 undefined，
    // seedTaskLogs 迭代失败并打出 'tasks is not iterable' 噪音）
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const removeSpy = vi.spyOn(store, 'removeTask')

    const wrapper = factory()
    await nextTick()
    await nextTick()

    const removeBtn = wrapper.find('.btn-remove')
    expect(removeBtn.exists()).toBe(true)
    await removeBtn.trigger('click')

    expect(removeSpy).toHaveBeenCalledWith('R58NA70A1YA', 'task-001')
  })

  it('calls startQueue when start button is clicked', async () => {
    const store = await seedQueue([createTask()])
    // 队列刷新会解析响应体，mock 必须提供 json（否则 apiFetch 返回 undefined，
    // seedTaskLogs 迭代失败并打出 'tasks is not iterable' 噪音）
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const startSpy = vi.spyOn(store, 'startQueue')

    const wrapper = factory()
    await nextTick()
    await nextTick()

    await wrapper.find('.btn-start').trigger('click')
    expect(startSpy).toHaveBeenCalledWith('R58NA70A1YA')
  })

  it('calls stopQueue when stop button is clicked', async () => {
    const store = useTaskStore()
    // 队列刷新会解析响应体，mock 必须提供 json（否则 apiFetch 返回 undefined，
    // seedTaskLogs 迭代失败并打出 'tasks is not iterable' 噪音）
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const stopSpy = vi.spyOn(store, 'stopQueue')

    const wrapper = factory()
    await nextTick()

    await wrapper.find('.btn-stop').trigger('click')
    expect(stopSpy).toHaveBeenCalledWith('R58NA70A1YA')
  })

  it('disables start button when no tasks', async () => {
    const wrapper = factory()
    await nextTick()

    expect(wrapper.find('.btn-start').attributes('disabled')).toBeDefined()
  })

  it('clears completed tasks when clear button is clicked', async () => {
    const store = await seedQueue([
      createTask({ id: 't1', status: 'completed' }),
      createTask({ id: 't2', status: 'pending' }),
    ])
    // 队列刷新会解析响应体，mock 必须提供 json（否则 apiFetch 返回 undefined，
    // seedTaskLogs 迭代失败并打出 'tasks is not iterable' 噪音）
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const removeSpy = vi.spyOn(store, 'removeTask')

    const wrapper = factory()
    await nextTick()
    await nextTick()

    await wrapper.find('.btn-clear').trigger('click')

    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledWith('R58NA70A1YA', 't1')
  })
})
