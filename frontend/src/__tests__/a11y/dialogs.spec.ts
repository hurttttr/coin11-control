import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ScriptSelector from '@/components/task/ScriptSelector.vue'
import BatchTaskDialog from '@/components/task/BatchTaskDialog.vue'
import BatchDeviceDialog from '@/components/task/BatchDeviceDialog.vue'
import DevicePickerList from '@/components/task/DevicePickerList.vue'
import { useTaskStore } from '@/stores/tasks'
import { useDeviceStore } from '@/stores/devices'
import type { DeviceInfo, ScriptInfo, BatchTaskResult } from '@/types'

function createScript(name: string): ScriptInfo {
  return { name, path: `/scripts/${name}`, description: `${name} 描述` }
}

function createDevice(serial: string): DeviceInfo {
  return {
    serial,
    model: `MODEL-${serial}`,
    status: 'online',
    connection_type: 'usb',
    android_version: '13',
  }
}

/** 派发一次真实的 document keydown，验证 composable 挂在 document 上的监听 */
function pressKey(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

describe('弹窗与列表可访问性', () => {
  const mounted: VueWrapper[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
    // 弹窗 onMounted 会拉取脚本/设备列表，统一 stub 掉网络
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve([]),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    for (const w of mounted) w.unmount()
    mounted.length = 0
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  function track<T extends VueWrapper>(w: T): T {
    mounted.push(w)
    return w
  }

  describe('ScriptSelector', () => {
    function factory() {
      const store = useTaskStore()
      store.scripts = [createScript('backup.sh'), createScript('cleanup.sh')]
      return track(mount(ScriptSelector, { attachTo: document.body }))
    }

    it('面板带有 dialog 角色与 aria-modal', () => {
      const panel = factory().find('.script-selector-panel')
      expect(panel.attributes('role')).toBe('dialog')
      expect(panel.attributes('aria-modal')).toBe('true')
    })

    it('aria-labelledby 指向真实存在的标题元素', () => {
      const wrapper = factory()
      const id = wrapper.find('.script-selector-panel').attributes('aria-labelledby')
      expect(id).toBeTruthy()
      const title = wrapper.find(`#${id}`)
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe('选择脚本')
    })

    it('关闭按钮有 aria-label', () => {
      expect(factory().find('.btn-close').attributes('aria-label')).toBe('关闭')
    })

    it('按 Escape 触发 close', async () => {
      const wrapper = factory()
      await nextTick()
      pressKey('Escape')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('打开时焦点移入弹窗内部', async () => {
      const wrapper = factory()
      await nextTick()
      const panel = wrapper.find('.script-selector-panel').element
      expect(panel.contains(document.activeElement)).toBe(true)
    })

    it('关闭后焦点归还触发元素', async () => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()
      expect(document.activeElement).toBe(trigger)

      const wrapper = mount(ScriptSelector, { attachTo: document.body })
      await nextTick()
      expect(document.activeElement).not.toBe(trigger)
      wrapper.unmount()
      expect(document.activeElement).toBe(trigger)
    })

    it('脚本项是可聚焦的 button，键盘可选择', async () => {
      const wrapper = factory()
      const items = wrapper.findAll('.script-item')
      expect(items).toHaveLength(2)
      expect(items[0].element.tagName).toBe('BUTTON')
      // button 上的 Enter/Space 由浏览器转成 click，这里直接验证 click 契约
      await items[0].trigger('click')
      expect(wrapper.emitted('select')?.[0]).toEqual([
        expect.objectContaining({ name: 'backup.sh' }),
      ])
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('Tab 焦点陷阱在末位元素回绕到首位', async () => {
      const wrapper = factory()
      await nextTick()
      const focusables = wrapper.find('.script-selector-panel').element
        .querySelectorAll<HTMLElement>('button')
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      last.focus()
      expect(document.activeElement).toBe(last)
      const event = pressKey('Tab')
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(first)
    })

    it('Shift+Tab 在首位元素回绕到末位', async () => {
      const wrapper = factory()
      await nextTick()
      const focusables = wrapper.find('.script-selector-panel').element
        .querySelectorAll<HTMLElement>('button')
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      first.focus()
      const event = pressKey('Tab', true)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(last)
    })
  })

  describe('BatchTaskDialog', () => {
    function factory() {
      const taskStore = useTaskStore()
      taskStore.scripts = [createScript('a.sh'), createScript('b.sh')]
      const deviceStore = useDeviceStore()
      deviceStore.devices = [createDevice('DEV1'), createDevice('DEV2')]
      return track(mount(BatchTaskDialog, { attachTo: document.body }))
    }

    it('面板带有 dialog 语义且标题被正确关联', () => {
      const wrapper = factory()
      const panel = wrapper.find('.batch-task-panel')
      expect(panel.attributes('role')).toBe('dialog')
      expect(panel.attributes('aria-modal')).toBe('true')
      const id = panel.attributes('aria-labelledby')
      expect(wrapper.find(`#${id}`).text()).toBe('批量分配任务')
    })

    it('按 Escape 触发 close', async () => {
      const wrapper = factory()
      await nextTick()
      pressKey('Escape')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('脚本项为 radio 语义，选中后 aria-checked 为 true', async () => {
      const wrapper = factory()
      await nextTick()
      const items = wrapper.findAll('.script-item')
      expect(items[0].element.tagName).toBe('BUTTON')
      expect(items[0].attributes('role')).toBe('radio')
      expect(items[0].attributes('aria-checked')).toBe('false')
      await items[0].trigger('click')
      expect(wrapper.findAll('.script-item')[0].attributes('aria-checked')).toBe('true')
    })

    it('脚本列表是被标签关联的 radiogroup', async () => {
      const wrapper = factory()
      await nextTick()
      const group = wrapper.find('.script-list')
      expect(group.attributes('role')).toBe('radiogroup')
      const labelId = group.attributes('aria-labelledby')
      expect(wrapper.find(`#${labelId}`).text()).toBe('选择脚本')
    })
  })

  describe('BatchDeviceDialog', () => {
    function factory() {
      const deviceStore = useDeviceStore()
      deviceStore.devices = [createDevice('DEV1')]
      const submitFn = vi.fn(
        async (): Promise<BatchTaskResult> => ({ succeeded: 1, failed: 0, errors: [] }),
      )
      return {
        wrapper: track(
          mount(BatchDeviceDialog, {
            props: { title: '批量启动队列', actionLabel: '批量启动', submitFn },
            attachTo: document.body,
          }),
        ),
        submitFn,
      }
    }

    it('面板带有 dialog 语义，标题取自 title prop', () => {
      const { wrapper } = factory()
      const panel = wrapper.find('.batch-panel')
      expect(panel.attributes('role')).toBe('dialog')
      const id = panel.attributes('aria-labelledby')
      expect(wrapper.find(`#${id}`).text()).toBe('批量启动队列')
    })

    it('按 Escape 触发 close', async () => {
      const { wrapper } = factory()
      await nextTick()
      pressKey('Escape')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('两个弹窗的 titleId 互不冲突', async () => {
      const a = factory().wrapper
      const b = factory().wrapper
      await nextTick()
      const idA = a.find('.batch-panel').attributes('aria-labelledby')
      const idB = b.find('.batch-panel').attributes('aria-labelledby')
      expect(idA).toBeTruthy()
      expect(idA).not.toBe(idB)
    })
  })

  describe('DevicePickerList', () => {
    function factory(selected: string[] = []) {
      return track(
        mount(DevicePickerList, {
          props: {
            devices: [createDevice('DEV1'), createDevice('DEV2')],
            modelValue: new Set(selected),
          },
          attachTo: document.body,
        }),
      )
    }

    it('每行是包裹 checkbox 的 label', () => {
      const wrapper = factory()
      const rows = wrapper.findAll('.device-item')
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(row.element.tagName).toBe('LABEL')
        expect(row.find('input[type="checkbox"]').exists()).toBe(true)
      }
    })

    it('checkbox 的 change 只触发一次 toggle（无双重切换）', async () => {
      const wrapper = factory()
      await wrapper.findAll('.device-checkbox')[0].trigger('change')
      const events = wrapper.emitted('update:modelValue')
      expect(events).toHaveLength(1)
      expect(Array.from(events![0][0] as Set<string>)).toEqual(['DEV1'])
    })

    it('对已选中项再次 change 取消选中', async () => {
      const wrapper = factory(['DEV1'])
      await wrapper.findAll('.device-checkbox')[0].trigger('change')
      const events = wrapper.emitted('update:modelValue')
      expect(Array.from(events![0][0] as Set<string>)).toEqual([])
    })

    it('设备列表是被标签关联的 group', () => {
      const wrapper = factory()
      const group = wrapper.find('.device-list')
      expect(group.attributes('role')).toBe('group')
      const labelId = group.attributes('aria-labelledby')
      expect(wrapper.find(`#${labelId}`).text()).toBe('选择目标设备')
    })

    it('checkbox 勾选状态跟随 modelValue', () => {
      const wrapper = factory(['DEV2'])
      const boxes = wrapper.findAll('.device-checkbox')
      expect((boxes[0].element as HTMLInputElement).checked).toBe(false)
      expect((boxes[1].element as HTMLInputElement).checked).toBe(true)
    })
  })
})
