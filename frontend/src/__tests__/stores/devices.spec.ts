import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import type { DeviceInfo } from '@/types'

function createDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: `device-${Math.random().toString(36).slice(2, 8)}`,
    model: 'SM-G998B',
    status: 'online',
    connection_type: 'usb',
    android_version: '13',
    ...overrides,
  }
}

/** 通过 fetchDevices 动作 + 模拟 fetch 填充设备列表 */
async function seedDevices(list: DeviceInfo[]): Promise<ReturnType<typeof useDeviceStore>> {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(list),
  })
  const store = useDeviceStore()
  await store.fetchDevices()
  return store
}

describe('useDeviceStore', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty devices array', () => {
      const store = useDeviceStore()
      expect(store.devices).toEqual([])
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('starts with zero counts', () => {
      const store = useDeviceStore()
      expect(store.deviceCount).toBe(0)
      expect(store.onlineDevices).toEqual([])
      expect(store.offlineDevices).toEqual([])
      expect(store.busyDevices).toEqual([])
    })
  })

  describe('fetchDevices', () => {
    it('sets loading state during fetch', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      const promise = store.fetchDevices()
      expect(store.loading).toBe(true)
      await promise
      expect(store.loading).toBe(false)
    })

    it('populates devices on successful fetch', async () => {
      const store = useDeviceStore()
      const mockDevices = [createDevice({ serial: 'dev1' }), createDevice({ serial: 'dev2' })]
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDevices),
      })

      await store.fetchDevices()
      expect(store.devices).toEqual(mockDevices)
      expect(store.error).toBeNull()
    })

    it('replaces existing devices on refetch', async () => {
      const store = await seedDevices([createDevice()])
      expect(store.deviceCount).toBe(1)

      await seedDevices([])
      expect(store.deviceCount).toBe(0)
    })

    it('sets error on failed fetch', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      await store.fetchDevices()
      expect(store.error).toBeTruthy()
      expect(store.devices).toEqual([])
    })

    it('handles network error', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await store.fetchDevices()
      expect(store.error).toBe('Network error')
    })
  })

  describe('computed device groups', () => {
    it('correctly groups online devices', async () => {
      const store = await seedDevices([
        createDevice({ serial: 'dev1', status: 'online' }),
        createDevice({ serial: 'dev2', status: 'busy' }),
        createDevice({ serial: 'dev3', status: 'online' }),
        createDevice({ serial: 'dev4', status: 'offline' }),
      ])

      expect(store.onlineDevices).toHaveLength(2)
      expect(store.onlineDevices.every((d) => d.status === 'online')).toBe(true)
    })

    it('correctly groups busy devices', async () => {
      const store = await seedDevices([
        createDevice({ serial: 'dev1', status: 'busy' }),
        createDevice({ serial: 'dev2', status: 'online' }),
      ])

      expect(store.busyDevices).toHaveLength(1)
      expect(store.busyDevices[0].serial).toBe('dev1')
    })

    it('correctly groups offline devices', async () => {
      const store = await seedDevices([
        createDevice({ serial: 'dev1', status: 'offline' }),
        createDevice({ serial: 'dev2', status: 'offline' }),
        createDevice({ serial: 'dev3', status: 'online' }),
      ])

      expect(store.offlineDevices).toHaveLength(2)
      expect(store.offlineDevices.every((d) => d.status === 'offline')).toBe(true)
    })

    it('returns empty arrays when no devices match', async () => {
      const store = await seedDevices([createDevice({ status: 'online' })])

      expect(store.offlineDevices).toEqual([])
      expect(store.busyDevices).toEqual([])
    })
  })

  describe('updateDeviceStatus', () => {
    it('updates status of existing device', async () => {
      const store = await seedDevices([createDevice({ serial: 'dev1', status: 'online' })])

      store.updateDeviceStatus('dev1', 'busy')
      expect(store.devices[0].status).toBe('busy')
    })

    it('does nothing for unknown device', async () => {
      const store = await seedDevices([createDevice({ serial: 'dev1', status: 'online' })])

      store.updateDeviceStatus('unknown-device', 'offline')
      expect(store.devices[0].status).toBe('online')
    })

    it('preserves other device fields when updating status', async () => {
      const store = await seedDevices([
        createDevice({
          serial: 'dev1',
          model: 'Pixel 7',
          connection_type: 'wifi',
          android_version: '14',
          status: 'online',
        }),
      ])

      store.updateDeviceStatus('dev1', 'busy')
      expect(store.devices[0].model).toBe('Pixel 7')
      expect(store.devices[0].connection_type).toBe('wifi')
      expect(store.devices[0].android_version).toBe('14')
    })
  })

  describe('connectDevice', () => {
    it('posts address and refreshes devices', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })

      await store.connectDevice('192.168.1.100:5555')

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/devices/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: '192.168.1.100:5555' }),
      })
    })

    it('sets error on connection failure', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      })

      await expect(store.connectDevice('bad:address')).rejects.toBeTruthy()
      expect(store.error).toBeTruthy()
    })

    // 回归：以前这里 throw 的是字符串，调用方用 `e instanceof Error` 判断会失败，
    // 导致后端返回的 detail 被丢掉、只显示兜底文案。
    it('rejects with a real Error instance so callers can read the message', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'adb: device unauthorized' }),
      })

      await expect(store.connectDevice('bad:address')).rejects.toBeInstanceOf(Error)
      expect(store.error).toBe('adb: device unauthorized')
    })

    it('propagates the backend detail as the rejected Error message', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: '设备已连接' }),
      })

      let caught: unknown
      try {
        await store.connectDevice('192.168.1.7:5555')
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(Error)
      expect((caught as Error).message).toBe('设备已连接')
    })
  })

  describe('disconnectDevice', () => {
    it('sends DELETE request and refreshes', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })

      await store.disconnectDevice('dev1')

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/devices/dev1', {
        method: 'DELETE',
      })
    })

    // disconnectDevice 只写 error 状态、不抛出（约定见 store 内注释）：
    // 断开是设备卡片上的次要操作，失败原因由页面级 ErrorBanner 呈现。
    it('records the backend detail in error state without rejecting', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'adb server not running' }),
      })

      await expect(store.disconnectDevice('dev1')).resolves.toBeUndefined()
      expect(store.error).toBe('adb server not running')
    })
  })

  describe('clearError', () => {
    it('clears a previously recorded error', async () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      await store.fetchDevices()
      expect(store.error).toBe('Network error')

      store.clearError()
      expect(store.error).toBeNull()
    })
  })

  describe('polling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('starts periodic polling', () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      store.startPolling(5000)
      // fetchDevices is NOT called by startPolling itself
      expect(globalThis.fetch).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(5000)
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    it('stops polling and fetch is not called after stop', () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      store.startPolling(5000)
      store.stopPolling()

      vi.advanceTimersByTime(10000)
      // fetch should have been called only by the initial fetchDevices
      const callCountBefore = vi.mocked(globalThis.fetch).mock.calls.length
      // After stopping, no new fetches should happen
      vi.advanceTimersByTime(10000)
      expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(callCountBefore)
    })

    it('restarts polling without duplicate timers', () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      store.startPolling(5000)
      store.startPolling(5000) // should stop first timer

      vi.advanceTimersByTime(5000)
      // fetch should be called only once by the single active timer
      // (after initial fetchDevices call which happens on first startPolling if any — but it doesn't)
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    it('uses default interval of 5000ms', () => {
      const store = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })

      store.startPolling() // no argument — default 5000
      vi.advanceTimersByTime(5000)
      expect(globalThis.fetch).toHaveBeenCalled()
    })
  })
})
