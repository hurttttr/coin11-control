import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import DeviceGrid from '@/components/device/DeviceGrid.vue'
import SettingsView from '@/views/SettingsView.vue'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  }
}

/** 派发一次真实按键，验证 useDialog 挂在 window 上的监听 */
function pressKey(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('ADB 配对弹窗焦点陷阱（复用 useDialog）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([])) as unknown as typeof fetch
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  async function openDialog() {
    const wrapper = mount(DeviceGrid, { attachTo: document.body })
    await nextTick()
    // happy-dom 的 programmatic click 不会移动焦点，真实浏览器会先聚焦按钮再触发 click，
    // 这里显式补上，才能验证「关闭后焦点归还触发元素」
    const pairBtn = wrapper.find('.btn-pair').element as HTMLButtonElement
    pairBtn.focus()
    await wrapper.find('.btn-pair').trigger('click')
    await nextTick()
    await nextTick()
    return wrapper
  }

  function focusables(wrapper: Awaited<ReturnType<typeof openDialog>>): HTMLElement[] {
    return Array.from(
      wrapper.find('.pair-panel').element.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled])',
      ),
    )
  }

  it('打开后焦点落在配对地址输入框（initialFocus 生效）', async () => {
    const wrapper = await openDialog()
    expect(document.activeElement).toBe(wrapper.find('#pair-host-input').element)
    wrapper.unmount()
  })

  it('Tab 在末位元素回绕到首位', async () => {
    const wrapper = await openDialog()
    const items = focusables(wrapper)
    const first = items[0]
    const last = items[items.length - 1]
    last.focus()
    expect(document.activeElement).toBe(last)

    const event = pressKey('Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    wrapper.unmount()
  })

  it('Shift+Tab 在首位元素回绕到末位', async () => {
    const wrapper = await openDialog()
    const items = focusables(wrapper)
    const first = items[0]
    const last = items[items.length - 1]
    first.focus()

    const event = pressKey('Tab', true)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('焦点跑到弹窗外时 Tab 把它拉回弹窗内', async () => {
    const wrapper = await openDialog()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)

    pressKey('Tab')
    expect(wrapper.find('.pair-panel').element.contains(document.activeElement)).toBe(true)
    wrapper.unmount()
  })

  it('关闭弹窗后焦点归还配对按钮', async () => {
    const wrapper = await openDialog()
    await wrapper.find('.btn-close').trigger('click')
    await nextTick()
    await nextTick()

    expect(wrapper.find('.pair-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.find('.btn-pair').element)
    wrapper.unmount()
  })

  it('关闭后按 Escape 不再触发弹窗逻辑（监听已移除）', async () => {
    const wrapper = await openDialog()
    await wrapper.find('.btn-close').trigger('click')
    await nextTick()

    // 焦点已归还配对按钮；残留的 Tab 陷阱会把焦点抢回弹窗，故用 Tab 验证监听确实解绑
    const event = pressKey('Tab')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(wrapper.find('.btn-pair').element)
    wrapper.unmount()
  })

  it('关闭后可再次打开并重新获得焦点陷阱', async () => {
    const wrapper = await openDialog()
    await wrapper.find('.btn-close').trigger('click')
    await nextTick()
    await wrapper.find('.btn-pair').trigger('click')
    await nextTick()
    await nextTick()

    expect(document.activeElement).toBe(wrapper.find('#pair-host-input').element)
    const items = focusables(wrapper)
    items[items.length - 1].focus()
    const event = pressKey('Tab')
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(items[0])
    wrapper.unmount()
  })

  it('Escape 关闭弹窗', async () => {
    const wrapper = await openDialog()
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.pair-panel').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('SettingsView 脚本勾选项键盘可操作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  async function mountView(scriptNames: string[], selected: string[] = []) {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(scriptNames.map((name) => ({ name, path: '/s/' + name, description: name + ' 描述' }))),
      )
      .mockResolvedValue(jsonResponse({ auto_tasks: selected })) as unknown as typeof fetch

    const wrapper = mount(SettingsView, { attachTo: document.body })
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0))
      await nextTick()
    }
    return wrapper
  }

  it('每行是包裹原生 checkbox 的 label（可 Tab 聚焦 + Space 切换）', async () => {
    const wrapper = await mountView(['a.sh', 'b.sh'])
    const rows = wrapper.findAll('.script-check-item')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.element.tagName).toBe('LABEL')
      expect(row.find('input[type="checkbox"]').exists()).toBe(true)
    }
    wrapper.unmount()
  })

  it('checkbox 的 change 切换勾选状态，且不产生双重 toggle', async () => {
    const wrapper = await mountView(['a.sh', 'b.sh'])
    const box = wrapper.findAll('.script-checkbox')[0]

    await box.trigger('change')
    await nextTick()
    expect(wrapper.findAll('.script-check-item')[0].classes()).toContain('checked')

    // 再次 change 应取消勾选：若存在双重 toggle，这里会又变回选中
    await box.trigger('change')
    await nextTick()
    expect(wrapper.findAll('.script-check-item')[0].classes()).not.toContain('checked')
    wrapper.unmount()
  })

  it('勾选状态跟随已保存的设置', async () => {
    const wrapper = await mountView(['a.sh', 'b.sh'], ['b.sh'])
    const boxes = wrapper.findAll('.script-checkbox')
    expect((boxes[0].element as HTMLInputElement).checked).toBe(false)
    expect((boxes[1].element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('勾选列表是被标签关联的 group', async () => {
    const wrapper = await mountView(['a.sh'])
    const group = wrapper.find('.script-check-list')
    expect(group.attributes('role')).toBe('group')
    const labelId = group.attributes('aria-labelledby')
    expect(labelId).toBeTruthy()
    expect(wrapper.find('#' + labelId).text()).toContain('设备连接自动运行任务')
    wrapper.unmount()
  })

  it('勾选后保存会把选中的脚本提交给后端', async () => {
    const wrapper = await mountView(['a.sh', 'b.sh'])
    await wrapper.findAll('.script-checkbox')[1].trigger('change')
    await nextTick()

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await wrapper.find('.btn-save').trigger('click')
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0))
      await nextTick()
    }

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(lastCall[0]).toBe('/api/settings/auto-tasks')
    expect(JSON.parse((lastCall[1] as RequestInit).body as string)).toEqual({ auto_tasks: ['b.sh'] })
    wrapper.unmount()
  })
})
