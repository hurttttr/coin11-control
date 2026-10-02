import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsView from '@/views/SettingsView.vue'
import ErrorBanner from '@/components/common/ErrorBanner.vue'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  }
}

/** 等待挂载时发起的请求链（fetchScripts + 加载设置）落地 */
async function settle(wrapper: ReturnType<typeof mount>) {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
  }
}

describe('ErrorBanner.vue', () => {
  it('message 为空时不渲染', () => {
    const wrapper = mount(ErrorBanner, { props: { message: null } })
    expect(wrapper.find('.error-banner').exists()).toBe(false)
  })

  it('渲染标题与错误详情，并带 role="alert"', () => {
    const wrapper = mount(ErrorBanner, {
      props: { message: '后端挂了', title: '获取设备列表失败' },
    })
    const banner = wrapper.find('.error-banner')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('获取设备列表失败')
    expect(banner.text()).toContain('后端挂了')
  })

  it('默认不显示重试按钮，show-retry 后显示并抛出 retry 事件', async () => {
    const wrapper = mount(ErrorBanner, { props: { message: 'x' } })
    expect(wrapper.find('.btn-retry').exists()).toBe(false)

    await wrapper.setProps({ showRetry: true })
    await wrapper.find('.btn-retry').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('关闭后隐藏，并在出现新错误时重新显示', async () => {
    const wrapper = mount(ErrorBanner, { props: { message: '第一个错误' } })
    await wrapper.find('.btn-dismiss').trigger('click')
    expect(wrapper.find('.error-banner').exists()).toBe(false)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)

    await wrapper.setProps({ message: '第二个错误' })
    expect(wrapper.find('.error-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('第二个错误')
  })
})

describe('SettingsView.vue（裸 fetch 收敛到 apiFetch）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('加载设置失败时通过 ErrorBanner 展示后端 detail', async () => {
    // 第一个请求是 fetchScripts，第二个是 /api/settings/auto-tasks
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ detail: '配置文件不可读' }, 500)) as unknown as typeof fetch

    const wrapper = mount(SettingsView)
    await settle(wrapper)

    const banner = wrapper.find('.error-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('配置文件不可读')
  })

  it('保存失败时展示后端 detail 而不是笼统的"保存失败"', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ name: 's1', path: 'p', description: '' }]))
      .mockResolvedValueOnce(jsonResponse({ auto_tasks: [] }))
      .mockResolvedValueOnce(jsonResponse({ detail: '磁盘只读，无法写入配置' }, 500)) as unknown as typeof fetch

    const wrapper = mount(SettingsView)
    await settle(wrapper)

    await wrapper.find('.btn-save').trigger('click')
    await settle(wrapper)

    expect(wrapper.find('.save-msg.error').text()).toContain('磁盘只读，无法写入配置')
    expect(wrapper.find('.error-banner').text()).toContain('磁盘只读，无法写入配置')
  })

  it('保存成功时展示成功提示且不显示错误', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ name: 's1', path: 'p', description: '' }]))
      .mockResolvedValueOnce(jsonResponse({ auto_tasks: ['s1'] }))
      .mockResolvedValueOnce(jsonResponse(null, 204)) as unknown as typeof fetch

    const wrapper = mount(SettingsView)
    await settle(wrapper)

    await wrapper.find('.btn-save').trigger('click')
    await settle(wrapper)

    expect(wrapper.find('.save-msg.success').exists()).toBe(true)
    expect(wrapper.find('.error-banner').exists()).toBe(false)
  })

  it('PUT 请求走 apiFetch 且携带勾选的脚本', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ name: 's1', path: 'p', description: '' }]))
      .mockResolvedValueOnce(jsonResponse({ auto_tasks: ['s1'] }))
      .mockResolvedValueOnce(jsonResponse(null, 204))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const wrapper = mount(SettingsView)
    await settle(wrapper)

    await wrapper.find('.btn-save').trigger('click')
    await settle(wrapper)

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/auto-tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_tasks: ['s1'] }),
    })
  })
})
