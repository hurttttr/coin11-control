import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import TaskQueue from '@/components/task/TaskQueue.vue'
import { useTaskStore } from '@/stores/tasks'
import type { TaskInfo } from '@/types'

// vuedraggable 需要真实 DOM 拖拽能力，测试中替换为按顺序渲染 item 插槽的壳组件。
// 关键：它必须把 modelValue 的顺序如实反映到 DOM，否则无法验证排序结果。
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

vi.mock('@/components/task/ScriptSelector.vue', () => ({
  default: {
    name: 'ScriptSelector',
    template: '<div class="mock-script-selector" />',
    emits: ['select', 'close'],
  },
}))

const DEVICE = 'R58NA70A1YA'

function createTask(id: string, scriptName: string): TaskInfo {
  return {
    id,
    device_id: DEVICE,
    script_name: scriptName,
    status: 'pending',
    position: 1,
    created_at: '2025-06-17T10:00:00Z',
    log: '',
  }
}

describe('TaskQueue 排序的键盘替代方案', () => {
  const wrappers: VueWrapper[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers.length = 0
    vi.restoreAllMocks()
  })

/**
   * 装一个"假后端"：持有一份服务端顺序，reorder 时按传入的 id 数组重排。
   *
   * 这一点必须写实——moveTask 在提交排序后会 fetchQueue().then(syncTasks)，
   * 用 store 的最新数据覆盖本地乐观更新。若把 fetchQueue 也 mock 成空操作，
   * 等于模拟了一个"丢弃排序请求"的后端，界面会被刷回旧顺序，
   * 测出来的失败是 mock 的假象而非组件缺陷。
   */
  async function seed(tasks: TaskInfo[]) {
    const serverTasks = [...tasks]
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([...serverTasks]),
      }),
    )
    const store = useTaskStore()
    await store.fetchQueue(DEVICE)

    const reorderSpy = vi
      .spyOn(store, 'reorderTasks')
      .mockImplementation(async (_deviceId: string, taskIds: string[]) => {
        serverTasks.sort((a, b) => taskIds.indexOf(a.id) - taskIds.indexOf(b.id))
      })

    return { store, reorderSpy, serverTasks }
  }

  function factory() {
    const wrapper = mount(TaskQueue, {
      props: { deviceId: DEVICE },
      attachTo: document.body,
    })
    wrappers.push(wrapper)
    return wrapper
  }

  function moveButton(wrapper: VueWrapper, taskId: string, dir: 'up' | 'down') {
    return wrapper.find(`[data-move-btn="${taskId}:${dir}"]`)
  }

  it('每个任务都提供上移与下移按钮', async () => {
    await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh')])
    const wrapper = factory()
    await nextTick()

    expect(moveButton(wrapper, 't1', 'up').exists()).toBe(true)
    expect(moveButton(wrapper, 't1', 'down').exists()).toBe(true)
    expect(moveButton(wrapper, 't2', 'up').exists()).toBe(true)
    expect(moveButton(wrapper, 't2', 'down').exists()).toBe(true)
  })

  it('按钮是原生 button 且带含脚本名的 aria-label', async () => {
    await seed([createTask('t1', 'backup.sh'), createTask('t2', 'clean.sh')])
    const wrapper = factory()
    await nextTick()

    const up = moveButton(wrapper, 't1', 'up')
    expect(up.element.tagName).toBe('BUTTON')
    expect(up.attributes('type')).toBe('button')
    // 仅「上移」无法区分是哪一行，必须带上脚本名
    expect(up.attributes('aria-label')).toBe('上移 backup.sh')
    expect(moveButton(wrapper, 't2', 'down').attributes('aria-label')).toBe('下移 clean.sh')
  })

  it('首项的上移与末项的下移被禁用', async () => {
    await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh'), createTask('t3', 'c.sh')])
    const wrapper = factory()
    await nextTick()

    expect(moveButton(wrapper, 't1', 'up').attributes('disabled')).toBeDefined()
    expect(moveButton(wrapper, 't1', 'down').attributes('disabled')).toBeUndefined()
    expect(moveButton(wrapper, 't2', 'up').attributes('disabled')).toBeUndefined()
    expect(moveButton(wrapper, 't2', 'down').attributes('disabled')).toBeUndefined()
    expect(moveButton(wrapper, 't3', 'up').attributes('disabled')).toBeUndefined()
    expect(moveButton(wrapper, 't3', 'down').attributes('disabled')).toBeDefined()
  })

  it('下移把正确的新顺序提交给 reorderTasks', async () => {
    const { reorderSpy } = await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh'), createTask('t3', 'c.sh')])
    const wrapper = factory()
    await nextTick()

    await moveButton(wrapper, 't1', 'down').trigger('click')
    await nextTick()

    expect(reorderSpy).toHaveBeenCalledWith(DEVICE, ['t2', 't1', 't3'])
  })

  it('上移把正确的新顺序提交给 reorderTasks', async () => {
    const { reorderSpy } = await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh'), createTask('t3', 'c.sh')])
    const wrapper = factory()
    await nextTick()

    await moveButton(wrapper, 't3', 'up').trigger('click')
    await nextTick()

    expect(reorderSpy).toHaveBeenCalledWith(DEVICE, ['t1', 't3', 't2'])
  })

  it('移动后 DOM 顺序随之更新', async () => {
    await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh')])
    const wrapper = factory()
    await nextTick()

    await moveButton(wrapper, 't1', 'down').trigger('click')
    await flushPromises()
    await nextTick()

    const order = wrapper.findAll('.task-script').map((n) => n.text())
    expect(order).toEqual(['b.sh', 'a.sh'])
  })

  it('移动后焦点仍留在被移动任务的同一个按钮上', async () => {
    await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh'), createTask('t3', 'c.sh')])
    const wrapper = factory()
    await nextTick()

    const btn = moveButton(wrapper, 't1', 'down')
    ;(btn.element as HTMLButtonElement).focus()
    await btn.trigger('click')
    await flushPromises()
    await nextTick()

    // t1 移到中间位后「下移」仍可用，焦点必须回到同一个按钮，
    // 否则键盘用户每移一格就丢焦点、无法连续操作
    const active = document.activeElement as HTMLElement | null
    expect(active?.getAttribute('data-move-btn')).toBe('t1:down')
  })

  it('移动到末位后焦点退回同一行的上移按钮（目标按钮已禁用）', async () => {
    await seed([createTask('t1', 'a.sh'), createTask('t2', 'b.sh')])
    const wrapper = factory()
    await nextTick()

    const btn = moveButton(wrapper, 't1', 'down')
    ;(btn.element as HTMLButtonElement).focus()
    await btn.trigger('click')
    await flushPromises()
    await nextTick()

    // 两项队列里 t1 下移即到末位，「下移」随之 disabled；
    // 焦点应退到同一行的「上移」而不是丢回 body
    const active = document.activeElement as HTMLElement | null
    expect(active?.getAttribute('data-move-btn')).toBe('t1:up')
  })

  it('拖拽手柄对辅助技术隐藏（纯装饰字符）', async () => {
    await seed([createTask('t1', 'a.sh')])
    const wrapper = factory()
    await nextTick()

    expect(wrapper.find('.drag-handle').attributes('aria-hidden')).toBe('true')
  })

  it('移除按钮带含脚本名的 aria-label', async () => {
    await seed([createTask('t1', 'backup.sh')])
    const wrapper = factory()
    await nextTick()

    expect(wrapper.find('.btn-remove').attributes('aria-label')).toBe('移除任务 backup.sh')
  })

  it('保留 vuedraggable，鼠标拖拽能力未被移除', async () => {
    await seed([createTask('t1', 'a.sh')])
    const wrapper = factory()
    await nextTick()

    expect(wrapper.findComponent({ name: 'VueDraggable' }).exists()).toBe(true)
  })
})
