import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import LogViewer from '@/components/monitor/LogViewer.vue'
import { useWebSocketStore, MAX_LOG_MESSAGES } from '@/stores/websocket'
import type { WSMessage } from '@/types'

describe('LogViewer.vue', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-17T12:30:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function factory(props: { deviceId: string } = { deviceId: 'R58NA70A1YA' }) {
    return mount(LogViewer, {
      props,
      global: { plugins: [pinia] },
    })
  }

  /** 通过 store 收包入口注入日志消息（与 WebSocket onmessage 同路径） */
  function pushLogs(deviceId: string, datas: string[]): void {
    const store = useWebSocketStore()
    for (const data of datas) {
      store.receiveMessage(deviceId, { type: 'log', device_id: deviceId, data } as WSMessage)
    }
  }

  it('shows waiting state when no logs', () => {
    expect(factory().text()).toContain('等待日志输出')
  })

  it('shows 0 lines when empty', () => {
    expect(factory().text()).toContain('0 行')
  })

  it('displays log messages from WebSocket store', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['log message 1', 'log message 2', 'log message 3'])

    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('log message 1')
    expect(wrapper.text()).toContain('log message 2')
    expect(wrapper.text()).toContain('log message 3')
    expect(wrapper.text()).toContain('3 行')
  })

  it('shows connected indicator when WebSocket is connected', async () => {
    const wrapper = factory()
    const store = useWebSocketStore()

    store.connectedDevices = new Set(['R58NA70A1YA'])
    await nextTick()

    expect(wrapper.text()).toContain('● 已连接')
  })

  it('shows disconnected indicator when WebSocket is not connected', () => {
    expect(factory().text()).toContain('○ 未连接')
  })

  it('toggles pause state when pause button is clicked', async () => {
    const wrapper = factory()
    await nextTick()

    const pauseBtn = wrapper.findAll('.btn-log')[0]
    expect(pauseBtn.text()).toContain('⏸ 暂停')
    await pauseBtn.trigger('click')
    expect(wrapper.text()).toContain('▶ 继续')
    await pauseBtn.trigger('click')
    expect(wrapper.text()).toContain('⏸ 暂停')
  })

  it('shows pause overlay when paused with logs', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['test log'])
    await nextTick()
    await nextTick()

    await wrapper.findAll('.btn-log')[0].trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('已暂停滚动')
  })

  it('clears logs when clear button is clicked', async () => {
    const wrapper = factory()
    const store = useWebSocketStore()
    const spy = vi.spyOn(store, 'clearMessages')
    await nextTick()

    const buttons = wrapper.findAll('.btn-log')
    await buttons[buttons.length - 1].trigger('click')
    expect(spy).toHaveBeenCalledWith('R58NA70A1YA')
  })

  it('clears rendered lines when clear button is clicked', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['to be cleared'])
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('to be cleared')

    const buttons = wrapper.findAll('.btn-log')
    await buttons[buttons.length - 1].trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('0 行')
  })

  it('shows line numbers for each log entry', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['single line'])
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('0001')
  })

  it('adds timestamps to log messages without spaces', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['plain_message'])
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('plain_message')
    expect(wrapper.text()).toContain('12:30:00')
  })

  it('does not add extra timestamp when data already contains a space', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['2025-06-17 INFO: started'])
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('2025-06-17 INFO: started')
  })

  it('renders ANSI escape sequences as colored spans', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['\u001b[32mgreen text\u001b[0m'])
    await nextTick()
    await nextTick()

    const html = wrapper.html()
    expect(html).toContain('<span')
    expect(wrapper.text()).not.toContain('\u001b[')
    expect(wrapper.text()).toContain('green text')
  })

  it('reactively updates when new log messages arrive', async () => {
    const wrapper = factory()
    pushLogs('R58NA70A1YA', ['first message'])
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('first message')
    expect(wrapper.text()).toContain('1 行')

    pushLogs('R58NA70A1YA', ['second message'])
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('second message')
    expect(wrapper.text()).toContain('2 行')
  })

  // ── 回归：日志超过缓冲上限后界面不能停更 ──
  // 旧实现 watch 的是 deviceLogs(...).length，到上限后长度恒为 2000，
  // watcher 永久不触发，新日志再也不渲染。
  describe('日志缓冲上限', () => {
    /** 灌满日志缓冲至上限 */
    async function fillToCap(): Promise<void> {
      pushLogs(
        'R58NA70A1YA',
        Array.from({ length: MAX_LOG_MESSAGES }, (_, i) => `line_${i}`),
      )
      await nextTick()
      await nextTick()
    }

    it('keeps rendering new logs after the 2000-line cap', async () => {
      const wrapper = factory()
      await fillToCap()
      expect(wrapper.findAll('.log-line')).toHaveLength(MAX_LOG_MESSAGES)

      pushLogs('R58NA70A1YA', ['AFTER_CAP_MARKER'])
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('AFTER_CAP_MARKER')
      // 行数保持在上限，不会无限增长
      expect(wrapper.findAll('.log-line')).toHaveLength(MAX_LOG_MESSAGES)
    })

    it('does not drop or duplicate lines when crossing the cap', async () => {
      const wrapper = factory()
      await fillToCap()

      // 跨越上限继续写入 50 条
      pushLogs(
        'R58NA70A1YA',
        Array.from({ length: 50 }, (_, i) => `over_${i}`),
      )
      await nextTick()
      await nextTick()

      const rendered = wrapper.findAll('.log-line').map((n) => n.text())
      expect(rendered).toHaveLength(MAX_LOG_MESSAGES)
      // 50 条新行全部渲染且各只出现一次（用 endsWith 精确匹配，避免 over_1 命中 over_10）
      for (let i = 0; i < 50; i++) {
        expect(rendered.filter((t) => t.endsWith(`over_${i}`))).toHaveLength(1)
      }
      // 最后一行就是最新写入的那条（顺序未错乱）
      expect(rendered[rendered.length - 1]).toContain('over_49')
      // 最旧的行已被裁剪掉
      expect(rendered.filter((t) => t.endsWith('line_0'))).toHaveLength(0)
      // 保留窗口的首行应为第 50 条原始日志（前 50 条被裁剪）
      expect(rendered[0]).toContain('line_50')
    })

    it('renders logs again after clearing past the cap', async () => {
      const wrapper = factory()
      await fillToCap()
      pushLogs('R58NA70A1YA', ['before_clear'])
      await nextTick()
      await nextTick()

      const buttons = wrapper.findAll('.btn-log')
      await buttons[buttons.length - 1].trigger('click')
      await nextTick()
      expect(wrapper.text()).toContain('0 行')

      pushLogs('R58NA70A1YA', ['after_clear'])
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('after_clear')
      expect(wrapper.text()).toContain('1 行')
    })

    it('renders a device that already overflowed before being shown', async () => {
      // 目标设备在被渲染前就已越过上限：游标必须校正到缓冲首行，不能读错位下标
      pushLogs(
        'PRELOADED',
        Array.from({ length: MAX_LOG_MESSAGES + 30 }, (_, i) => `pre_${i}`),
      )
      const wrapper = factory({ deviceId: 'PRELOADED' })
      await nextTick()
      await nextTick()

      const rendered = wrapper.findAll('.log-line').map((n) => n.text())
      expect(rendered).toHaveLength(MAX_LOG_MESSAGES)
      expect(rendered[0]).toContain('pre_30')
      expect(rendered[rendered.length - 1]).toContain(`pre_${MAX_LOG_MESSAGES + 29}`)

      // 之后的新日志继续渲染
      pushLogs('PRELOADED', ['pre_after'])
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('pre_after')
    })

    it('resets the cursor when switching devices past the cap', async () => {
      const wrapper = factory()
      await fillToCap()
      pushLogs('R58NA70A1YA', ['dev_a_line'])
      await nextTick()
      await nextTick()

      await wrapper.setProps({ deviceId: 'OTHER_DEVICE' })
      await nextTick()
      expect(wrapper.text()).toContain('0 行')

      pushLogs('OTHER_DEVICE', ['dev_b_line'])
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('dev_b_line')
      expect(wrapper.text()).not.toContain('dev_a_line')
      expect(wrapper.text()).toContain('1 行')
    })
  })
})
