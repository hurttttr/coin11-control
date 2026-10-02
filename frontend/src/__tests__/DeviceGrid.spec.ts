import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DeviceGrid from '@/components/device/DeviceGrid.vue'

/** 构造一个 apiFetch 可消费的 Response 替身 */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  }
}

type RouteHandler = () => { body: unknown; status?: number }

/**
 * URL 路由式 fetch mock：DeviceGrid 挂载时会同时请求设备列表与 network-info，
 * 若用按顺序堆叠的 mockResolvedValueOnce，两个请求会各自消费一个结果导致断言错位，
 * 因此按 URL 分别应答。
 */
function mockFetchRoutes(routes: Record<string, RouteHandler>) {
  const fn = vi.fn((url: RequestInfo | URL, _init?: RequestInit) => {
    const key = String(url)
    const handler = routes[key]
    const { body, status } = handler ? handler() : { body: {} }
    return Promise.resolve(jsonResponse(body, status))
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

/** 默认路由：设备列表为空 + network-info 可配 subnet */
function baseRoutes(subnet = '', hostIp = '192.168.1.5'): Record<string, RouteHandler> {
  return {
    '/api/devices': () => ({ body: [] }),
    '/api/devices/network-info': () => ({ body: { subnet, host_ip: hostIp } }),
  }
}

/** 取最后一次发给指定 URL 的请求体 */
function bodyOf(
  fetchMock: ReturnType<typeof mockFetchRoutes>,
  url: string,
): Record<string, unknown> | null {
  const call = fetchMock.mock.calls.find((c) => String(c[0]) === url)
  if (!call || call.length < 2) return null
  const init = call[1]
  if (!init || typeof init.body !== 'string') return null
  return JSON.parse(init.body) as Record<string, unknown>
}

describe('DeviceGrid.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('网段自动预填（getNetworkInfo）', () => {
    // getNetworkInfo 的预填链（fetch → json → 组件写入）跨多个微任务，
    // 与套件内既有约定一致：用 setTimeout(0) 让链稳定落地后再断言。
    async function settle(wrapper: Awaited<ReturnType<typeof mount>>) {
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()
    }

    it('挂载后连接输入框预填网段前缀', async () => {
      mockFetchRoutes(baseRoutes('192.168.1.'))
      const wrapper = mount(DeviceGrid)
      await settle(wrapper)

      expect((wrapper.find('.connect-host-input').element as HTMLInputElement).value).toBe('192.168.1.')
      wrapper.unmount()
    })

    it('打开配对弹窗时 IP 输入框预填网段前缀', async () => {
      mockFetchRoutes(baseRoutes('192.168.1.'))
      const wrapper = mount(DeviceGrid)
      await settle(wrapper)
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()

      expect((wrapper.find('#pair-host-input').element as HTMLInputElement).value).toBe('192.168.1.')
      wrapper.unmount()
    })

    it('network-info 失败时不预填，输入框保持为空', async () => {
      mockFetchRoutes({
        ...baseRoutes(),
        '/api/devices/network-info': () => ({ body: { detail: 'backend down' }, status: 500 }),
      })
      const wrapper = mount(DeviceGrid)
      await settle(wrapper)

      expect((wrapper.find('.connect-host-input').element as HTMLInputElement).value).toBe('')
      wrapper.unmount()
    })
  })

  describe('远程连接', () => {
    it('最后一段 + 端口拼接成完整地址后连接', async () => {
      const fetchMock = mockFetchRoutes(baseRoutes('192.168.1.'))
      const wrapper = mount(DeviceGrid)
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      // 真实操作：网段前缀已预填，用户在其后补上最后一段
      const hostInput = wrapper.find('.connect-host-input')
      await hostInput.setValue(`${(hostInput.element as HTMLInputElement).value}100`)
      await wrapper.find('.connect-port-input').setValue('5555')
      await wrapper.find('.btn-connect').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(bodyOf(fetchMock, '/api/devices/connect')).toEqual({ address: '192.168.1.100:5555' })
      wrapper.unmount()
    })

    it('端口缺省时使用默认 5555', async () => {
      const fetchMock = mockFetchRoutes(baseRoutes('192.168.1.'))
      const wrapper = mount(DeviceGrid)
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      await wrapper.find('.connect-host-input').setValue('100')
      await wrapper.find('.connect-port-input').setValue('')
      await wrapper.find('.btn-connect').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(bodyOf(fetchMock, '/api/devices/connect')).toEqual({ address: '100:5555' })
      wrapper.unmount()
    })

    it('粘贴完整 IP:Port 时直接用完整值（兼容）', async () => {
      const fetchMock = mockFetchRoutes(baseRoutes('192.168.1.'))
      const wrapper = mount(DeviceGrid)
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      await wrapper.find('.connect-host-input').setValue('192.168.1.100:5555')
      await wrapper.find('.btn-connect').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(bodyOf(fetchMock, '/api/devices/connect')).toEqual({ address: '192.168.1.100:5555' })
      wrapper.unmount()
    })

    it('展示后端返回的 detail 而不是兜底文案', async () => {
      mockFetchRoutes({
        ...baseRoutes(),
        '/api/devices/connect': () => ({ body: { detail: 'adb: device unauthorized' }, status: 400 }),
      })
      const wrapper = mount(DeviceGrid)
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      await wrapper.find('.connect-host-input').setValue('192.168.1.100:5555')
      await wrapper.find('.btn-connect').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      const err = wrapper.find('.connect-error')
      expect(err.exists()).toBe(true)
      expect(err.text()).toContain('adb: device unauthorized')
      expect(err.text()).not.toBe('连接失败')
      wrapper.unmount()
    })
  })

  describe('ADB 配对', () => {
    async function openDialog() {
      const wrapper = mount(DeviceGrid, { attachTo: document.body })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper.find('#pair-host-input').setValue('100')
      await wrapper.find('#pair-port-input').setValue('41339')
      await wrapper.find('#pair-code-input').setValue('123456')
      return wrapper
    }

    it('HTTP 级失败展示后端 detail', async () => {
      mockFetchRoutes({
        ...baseRoutes(),
        '/api/devices/pair': () => ({ body: { detail: '配对端口已关闭' }, status: 500 }),
      })
      const wrapper = await openDialog()
      await wrapper.find('.btn-pair-submit').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.pair-error').text()).toContain('配对端口已关闭')
      wrapper.unmount()
    })

    it('业务级失败（HTTP 200 + success=false）展示 message', async () => {
      mockFetchRoutes({
        ...baseRoutes(),
        '/api/devices/pair': () => ({ body: { success: false, message: '配对码错误' } }),
      })
      const wrapper = await openDialog()
      await wrapper.find('.btn-pair-submit').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.pair-error').text()).toContain('配对码错误')
      wrapper.unmount()
    })

    it('配对成功展示成功提示并清空输入', async () => {
      mockFetchRoutes({
        ...baseRoutes(),
        '/api/devices/pair': () => ({ body: { success: true } }),
      })
      const wrapper = await openDialog()
      await wrapper.find('.btn-pair-submit').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.pair-success').text()).toContain('配对成功')
      expect(wrapper.find('.pair-error').exists()).toBe(false)
      wrapper.unmount()
    })

    it('拼接 最后一段+配对端口+配对码 提交 /api/devices/pair', async () => {
      const fetchMock = mockFetchRoutes({
        ...baseRoutes(),
        '/api/devices/pair': () => ({ body: { success: true } }),
      })
      const wrapper = await openDialog()
      await wrapper.find('.btn-pair-submit').trigger('click')
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()

      expect(bodyOf(fetchMock, '/api/devices/pair')).toEqual({ address: '100:41339', code: '123456' })
      wrapper.unmount()
    })
  })

  describe('配对缺字段提示（FE-1b）', () => {
    // 与「网段自动预填」套件一致的 settle：让 getNetworkInfo 的异步链稳定落地
    async function settle(wrapper: Awaited<ReturnType<typeof mount>>) {
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      await wrapper.vm.$nextTick()
    }

    async function openDialogWithSubnet(subnet: string) {
      mockFetchRoutes(baseRoutes(subnet))
      const wrapper = mount(DeviceGrid)
      await settle(wrapper)
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('仅预填网段前缀时显示补全提示，按钮禁用且 IP 输入框 aria-invalid', async () => {
      const wrapper = await openDialogWithSubnet('192.168.1.')

      expect((wrapper.find('#pair-host-input').element as HTMLInputElement).value).toBe('192.168.1.')
      const hint = wrapper.find('.pair-hint-error')
      expect(hint.exists()).toBe(true)
      expect(hint.text()).toContain('请补全 IP 最后一段')
      expect(wrapper.find('#pair-host-input').attributes('aria-invalid')).toBe('true')
      // placeholder 明确告知网段已自动填充、只差末段
      expect(wrapper.find('#pair-host-input').attributes('placeholder')).toContain('网段已自动填充 192.168.1.')
      // 二维码入口已移除（FE-1c），只保留「开始配对」主按钮
      expect(wrapper.find('.btn-qr').exists()).toBe(false)
      expect(wrapper.find('.btn-pair-submit').attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('补全 IP/配对码/端口后提示依次切换、消失且按钮可点', async () => {
      const wrapper = await openDialogWithSubnet('192.168.1.')

      // 补上末段 → 提示切换为缺配对码
      await wrapper.find('#pair-host-input').setValue('192.168.1.100')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.pair-hint-error').text()).toContain('请填写 6 位配对码')
      expect(wrapper.find('#pair-host-input').attributes('aria-invalid')).toBeUndefined()

      // 补上配对码 → 提示切换为缺端口
      await wrapper.find('#pair-code-input').setValue('123456')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.pair-hint-error').text()).toContain('请填写配对端口')
      expect(wrapper.find('#pair-port-input').attributes('aria-invalid')).toBe('true')

      // 补上端口 → 提示消失、aria-invalid 移除、按钮可点
      await wrapper.find('#pair-port-input').setValue('41339')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.pair-hint-error').exists()).toBe(false)
      expect(wrapper.find('#pair-port-input').attributes('aria-invalid')).toBeUndefined()
      // 二维码入口已移除（FE-1c），只保留「开始配对」主按钮
      expect(wrapper.find('.btn-qr').exists()).toBe(false)
      expect(wrapper.find('.btn-pair-submit').attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })
  })

  describe('配对二维码入口已移除（FE-1c）', () => {
    it('弹窗内不存在生成配对二维码按钮与二维码展示区', async () => {
      mockFetchRoutes(baseRoutes())
      const wrapper = mount(DeviceGrid, { attachTo: document.body })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper.find('#pair-host-input').setValue('100')
      await wrapper.find('#pair-port-input').setValue('41339')
      await wrapper.find('#pair-code-input').setValue('123456')
      await wrapper.vm.$nextTick()

      // 直接配对入口保留（FE-1c 主路径）
      expect(wrapper.find('.btn-pair-submit').exists()).toBe(true)
      // 二维码按钮、图片/提示区已随 FE-1c 移除
      expect(wrapper.find('.btn-qr').exists()).toBe(false)
      expect(wrapper.find('.pair-qr-box').exists()).toBe(false)
      expect(wrapper.find('.pair-qr-image').exists()).toBe(false)
      expect(wrapper.find('.pair-qr-tip').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('配对弹窗可访问性', () => {
    it('弹窗带 role/aria-modal/aria-labelledby 且标题 id 对应', async () => {
      mockFetchRoutes(baseRoutes())
      const wrapper = mount(DeviceGrid)
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()

      const panel = wrapper.find('.pair-panel')
      expect(panel.attributes('role')).toBe('dialog')
      expect(panel.attributes('aria-modal')).toBe('true')
      // titleId 由 useDialog 生成，只要求它指向真实存在的标题元素
      const labelledBy = panel.attributes('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      expect(wrapper.find(`#${labelledBy}`).text()).toContain('ADB 配对')
      wrapper.unmount()
    })

    it('打开后焦点落在 IP 最后一段输入框', async () => {
      mockFetchRoutes(baseRoutes())
      const wrapper = mount(DeviceGrid, { attachTo: document.body })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      expect(document.activeElement).toBe(wrapper.find('#pair-host-input').element)
      wrapper.unmount()
    })

    it('按 Escape 关闭弹窗', async () => {
      mockFetchRoutes(baseRoutes())
      const wrapper = mount(DeviceGrid, { attachTo: document.body })
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.pair-panel').exists()).toBe(true)

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.pair-panel').exists()).toBe(false)
      wrapper.unmount()
    })

    it('输入框通过 label for 关联', async () => {
      mockFetchRoutes(baseRoutes())
      const wrapper = mount(DeviceGrid)
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await wrapper.find('.btn-pair').trigger('click')
      await wrapper.vm.$nextTick()

      const labels = wrapper.findAll('.pair-field label')
      const fors = labels.map((l) => l.attributes('for'))
      expect(fors).toContain('pair-host-input')
      expect(fors).toContain('pair-port-input')
      expect(fors).toContain('pair-code-input')
      wrapper.unmount()
    })
  })
})