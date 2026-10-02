import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import DeviceCard from '@/components/device/DeviceCard.vue'
import { useDeviceStore } from '@/stores/devices'
import type { DeviceInfo } from '@/types'

function createDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: 'R58NA70A1YA',
    model: 'SM-G998B',
    status: 'online',
    connection_type: 'usb',
    android_version: '13',
    ...overrides,
  }
}

describe('DeviceCard.vue', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/device/:id', name: 'device-detail', component: { template: '<div>detail</div>' } },
      ],
    })
  })

  function factory(device: DeviceInfo) {
    return mount(DeviceCard, {
      props: { device },
      global: {
        plugins: [router, pinia],
      },
    })
  }

  it('renders device model and serial', () => {
    const wrapper = factory(createDevice())
    expect(wrapper.text()).toContain('SM-G998B')
    expect(wrapper.text()).toContain('R58NA70A1YA')
  })

  it('renders Android version', () => {
    const wrapper = factory(createDevice({ android_version: '14' }))
    expect(wrapper.text()).toContain('Android 14')
  })

  it('shows status label for online device', () => {
    const wrapper = factory(createDevice({ status: 'online' }))
    expect(wrapper.text()).toContain('在线')
  })

  it('shows status label for busy device', () => {
    const wrapper = factory(createDevice({ status: 'busy' }))
    expect(wrapper.text()).toContain('忙碌')
  })

  it('shows status label for offline device', () => {
    const wrapper = factory(createDevice({ status: 'offline' }))
    expect(wrapper.text()).toContain('离线')
  })

  it('displays USB connection type icon and label', () => {
    const wrapper = factory(createDevice({ connection_type: 'usb' }))
    expect(wrapper.text()).toContain('USB')
  })

  it('displays WiFi connection type icon and label', () => {
    const wrapper = factory(createDevice({ connection_type: 'wifi' }))
    expect(wrapper.text()).toContain('WiFi')
  })

  it('renders StatusIndicator component', () => {
    const wrapper = factory(createDevice())
    expect(wrapper.findComponent({ name: 'StatusIndicator' }).exists()).toBe(true)
  })

  // 主操作从「外层 div @click + router.push」改为覆盖式 router-link
  // （避免与卡片内的「断开」按钮形成嵌套可交互元素）。
  // 断言从"是否调用了 push"改为"是否真的导航到了详情路由"——
  // 后者是真正要保住的行为，且不依赖具体实现方式。
  it('navigates to device detail when the card link is activated', async () => {
    const wrapper = factory(createDevice({ serial: 'TEST123' }))
    await router.isReady()

    await wrapper.find('.card-link').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/device/TEST123')
  })

  it('points the card link at the device detail route', () => {
    const wrapper = factory(createDevice({ serial: 'TEST123' }))
    const link = wrapper.find('.card-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/device/TEST123')
  })

  // ── 键盘可达性 ──

  it('exposes the primary action as a natively focusable anchor', () => {
    const wrapper = factory(createDevice())
    const link = wrapper.find('.card-link')
    // 原生 <a href> 天然可 Tab 聚焦并响应 Enter，无需 tabindex/keydown 兜底
    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBeTruthy()
  })

  it('gives the card link an accessible name', () => {
    const wrapper = factory(createDevice({ model: 'SM-G998B', serial: 'TEST123' }))
    // 链接内无可见文本，必须由 aria-label 提供可访问名称
    const label = wrapper.find('.card-link').attributes('aria-label')
    expect(label).toContain('SM-G998B')
    expect(label).toContain('TEST123')
  })

  it('does not nest the disconnect button inside the card link', () => {
    const wrapper = factory(createDevice())
    const link = wrapper.find('.card-link')
    // 嵌套可交互元素（a 内含 button）是无效 HTML，读屏行为不可预测
    expect(link.find('button').exists()).toBe(false)
    expect(link.element.children.length).toBe(0)
  })

  it('keeps the disconnect button keyboard reachable and named', () => {
    const wrapper = factory(createDevice({ model: 'SM-G998B', serial: 'TEST123' }))
    const btn = wrapper.find('.btn-disconnect')
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.attributes('type')).toBe('button')
    expect(btn.attributes('aria-label')).toContain('TEST123')
  })

  it('disconnects without navigating to the detail route', async () => {
    const wrapper = factory(createDevice({ serial: 'TO-DISCONNECT' }))
    await router.push('/')
    await router.isReady()

    const store = useDeviceStore()
    const spy = vi.spyOn(store, 'disconnectDevice').mockResolvedValue(undefined)

    await wrapper.find('.btn-disconnect').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('TO-DISCONNECT')
    // 断开是次要操作，不应触发卡片的主导航
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('renders disconnect button', () => {
    const wrapper = factory(createDevice({ serial: 'TO-DISCONNECT' }))
    const btn = wrapper.find('.btn-disconnect')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('断开')
  })
})
