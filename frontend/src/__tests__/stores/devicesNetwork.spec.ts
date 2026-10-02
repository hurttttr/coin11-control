import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDeviceStore } from '@/stores/devices'

const { apiFetchMock, errMessageMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  errMessageMock: vi.fn((e: unknown, fallback: string) =>
    e instanceof Error && e.message ? e.message : fallback,
  ),
}))

// mock apiFetch / errMessage：getNetworkInfo 的请求参数/缓存/错误路径
vi.mock('@/utils/api', () => ({
  apiFetch: apiFetchMock,
  errMessage: errMessageMock,
}))

describe('useDeviceStore · 网络信息', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiFetchMock.mockReset()
    errMessageMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getNetworkInfo', () => {
    it('GET network-info 并返回 subnet/host_ip', async () => {
      apiFetchMock.mockResolvedValue({ subnet: '192.168.1.', host_ip: '192.168.1.5' })
      const store = useDeviceStore()

      const info = await store.getNetworkInfo()

      expect(apiFetchMock).toHaveBeenCalledWith('/api/devices/network-info')
      expect(info).toEqual({ subnet: '192.168.1.', host_ip: '192.168.1.5' })
      expect(store.networkInfo).toEqual({ subnet: '192.168.1.', host_ip: '192.168.1.5' })
    })

    it('成功结果被缓存：第二次调用不再发请求', async () => {
      apiFetchMock.mockResolvedValue({ subnet: '192.168.1.', host_ip: '192.168.1.5' })
      const store = useDeviceStore()

      await store.getNetworkInfo()
      await store.getNetworkInfo()

      expect(apiFetchMock).toHaveBeenCalledTimes(1)
    })

    it('force=true 强制重新请求', async () => {
      apiFetchMock.mockResolvedValueOnce({ subnet: '10.0.0.', host_ip: '10.0.0.2' })
      const store = useDeviceStore()
      await store.getNetworkInfo()

      apiFetchMock.mockResolvedValueOnce({ subnet: '192.168.1.', host_ip: '192.168.1.5' })
      await store.getNetworkInfo(true)

      expect(apiFetchMock).toHaveBeenCalledTimes(2)
      expect(store.networkInfo).toEqual({ subnet: '192.168.1.', host_ip: '192.168.1.5' })
    })

    it('请求失败 → 返回 undefined 而不抛出（预填失败不影响主流程）', async () => {
      apiFetchMock.mockRejectedValue(new Error('backend down'))
      const store = useDeviceStore()

      await expect(store.getNetworkInfo()).resolves.toBeUndefined()
      expect(store.error).toBeNull()
      expect(store.networkInfo).toBeNull()
    })

    it('后端返回空对象时不污染缓存（可再次请求）', async () => {
      apiFetchMock.mockResolvedValueOnce({})
      const store = useDeviceStore()

      const info = await store.getNetworkInfo()
      expect(info).toEqual({})
      expect(store.networkInfo).toBeNull()

      // subnet 不是字符串 → 未缓存，再次请求
      await store.getNetworkInfo()
      expect(apiFetchMock).toHaveBeenCalledTimes(2)
    })
  })
})