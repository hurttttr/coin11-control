import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DeviceInfo, DeviceStatus } from '@/types'
import { apiFetch, errMessage } from '@/utils/api'

/** 本机网络信息：网段前缀（subnet）与主机 IP，用于连接/配对输入自动预填 */
export interface NetworkInfo {
  subnet: string
  host_ip: string
}

export const useDeviceStore = defineStore('devices', () => {
  // ── State ──
  const devices = ref<DeviceInfo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** getNetworkInfo 的缓存：同一会话内只请求一次，避免每次进页面都打后端 */
  const networkInfo = ref<NetworkInfo | null>(null)
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  // ── Getters ──
  const onlineDevices = computed(() =>
    devices.value.filter((d) => d.status === 'online'),
  )

  const offlineDevices = computed(() =>
    devices.value.filter((d) => d.status === 'offline'),
  )

  const busyDevices = computed(() =>
    devices.value.filter((d) => d.status === 'busy'),
  )

  const deviceCount = computed(() => devices.value.length)

  // ── Actions ──
  async function fetchDevices(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      devices.value = await apiFetch<DeviceInfo[]>('/api/devices')
    } catch (e) {
      error.value = errMessage(e, '获取设备列表失败')
      console.error('[DeviceStore] fetchDevices failed:', error.value)
    } finally {
      loading.value = false
    }
  }

  /**
   * 连接设备。
   * 失败时既写入 error 状态，也抛出 Error —— 调用方（DeviceGrid 的连接输入框）
   * 需要就地展示后端返回的 detail，因此必须抛真正的 Error 对象，
   * 否则调用方的 `e instanceof Error` 判断会失败而丢掉 detail。
   */
  async function connectDevice(address: string): Promise<void> {
    error.value = null
    try {
      await apiFetch('/api/devices/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      await fetchDevices()
    } catch (e) {
      error.value = errMessage(e, '连接设备失败')
      console.error('[DeviceStore] connectDevice failed:', error.value)
      // 保留原始异常作为 cause，避免错误传播时丢失底层信息
      throw new Error(error.value, { cause: e })
    }
  }

  /**
   * 断开设备。
   * 与 connectDevice 不同，这里只写入 error 状态、不抛出：断开是设备卡片上的
   * 次要操作，没有就地展示错误的位置，失败原因统一由页面级 ErrorBanner
   * 呈现 store.error。保持"只有需要就地反馈的 action 才抛出"这一约定。
   */
  async function disconnectDevice(serial: string): Promise<void> {
    error.value = null
    try {
      await apiFetch(`/api/devices/${serial}`, {
        method: 'DELETE',
      })
      await fetchDevices()
    } catch (e) {
      error.value = errMessage(e, '断开设备失败')
      console.error('[DeviceStore] disconnectDevice failed:', error.value)
    }
  }

  /** 轮询刷新 — 每 intervalMs 毫秒自动拉取设备列表 */
  function startPolling(intervalMs = 5000): void {
    stopPolling()
    refreshTimer = setInterval(() => {
      fetchDevices()
    }, intervalMs)
  }

  function stopPolling(): void {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  /** 清除错误状态（供页面级 ErrorBanner 关闭 / 重试前调用） */
  function clearError(): void {
    error.value = null
  }

  /**
   * 拉取本机网络信息（网段 + 主机 IP），供 DeviceGrid 预填连接/配对输入框。
   * 成功后缓存，同一会话内不再重复请求；失败静默返回 undefined ——
   * 预填只是锦上添花，不应影响连接/配对主流程。
   */
  async function getNetworkInfo(force = false): Promise<NetworkInfo | undefined> {
    if (!force && networkInfo.value) return networkInfo.value
    try {
      const info = await apiFetch<NetworkInfo>('/api/devices/network-info')
      // 防御：后端异常/旧版本可能返回空对象或数组，避免污染缓存
      if (info && typeof info === 'object' && typeof info.subnet === 'string') {
        networkInfo.value = info
      }
      return info
    } catch (e) {
      console.warn('[DeviceStore] getNetworkInfo failed:', errMessage(e, '获取网络信息失败'))
      return undefined
    }
  }

  /** 由 WebSocket status 消息驱动，实时更新设备状态 */
  function updateDeviceStatus(serial: string, status: DeviceStatus): void {
    const idx = devices.value.findIndex((d) => d.serial === serial)
    if (idx !== -1) {
      devices.value[idx] = { ...devices.value[idx], status }
    }
  }

  return {
    // state
    devices,
    loading,
    error,
    networkInfo,
    // getters
    onlineDevices,
    offlineDevices,
    busyDevices,
    deviceCount,
    // actions
    fetchDevices,
    connectDevice,
    disconnectDevice,
    getNetworkInfo,
    startPolling,
    stopPolling,
    clearError,
    updateDeviceStatus,
  }
})
