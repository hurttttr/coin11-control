import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWebSocketStore, MAX_LOG_MESSAGES } from '@/stores/websocket'
import { useDeviceStore } from '@/stores/devices'
import type { WSMessage, DeviceInfo } from '@/types'

function createDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    serial: 'dev1',
    model: 'SM-G998B',
    status: 'online',
    connection_type: 'usb',
    android_version: '13',
    ...overrides,
  }
}

function logMsg(data: string, deviceId = 'dev1'): WSMessage {
  return { type: 'log', device_id: deviceId, data }
}

describe('useWebSocketStore', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('receiveMessage', () => {
    it('stores log messages in order', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', logMsg('first'))
      store.receiveMessage('dev1', logMsg('second'))

      const logs = store.deviceLogs('dev1')
      expect(logs.map((m) => m.data)).toEqual(['first', 'second'])
    })

    it('caps log buffer at 2000 messages', () => {
      const store = useWebSocketStore()
      for (let i = 0; i < 2010; i++) {
        store.receiveMessage('dev1', logMsg(`msg-${i}`))
      }

      const logs = store.deviceLogs('dev1')
      expect(logs).toHaveLength(2000)
      expect(logs[0].data).toBe('msg-10')
      expect(logs[1999].data).toBe('msg-2009')
    })

    // ── 回归：日志超过上限后仍要能感知新日志（旧实现用数组长度当信号，长度恒定 → 永久停更）──
    it('keeps advancing logSeq after the buffer cap is reached', () => {
      const store = useWebSocketStore()
      for (let i = 0; i < MAX_LOG_MESSAGES; i++) {
        store.receiveMessage('dev1', logMsg(`msg-${i}`))
      }
      expect(store.deviceLogs('dev1')).toHaveLength(MAX_LOG_MESSAGES)
      expect(store.logSeq('dev1')).toBe(MAX_LOG_MESSAGES)
      expect(store.logDropped('dev1')).toBe(0)

      // 数组长度不再变化，但 seq 必须继续增长
      store.receiveMessage('dev1', logMsg('after-cap'))
      expect(store.deviceLogs('dev1')).toHaveLength(MAX_LOG_MESSAGES)
      expect(store.logSeq('dev1')).toBe(MAX_LOG_MESSAGES + 1)
      expect(store.logDropped('dev1')).toBe(1)
      expect(store.deviceLogs('dev1')[MAX_LOG_MESSAGES - 1].data).toBe('after-cap')
    })

    it('maintains the logSeq - logDropped === logs.length invariant', () => {
      const store = useWebSocketStore()
      for (let i = 0; i < MAX_LOG_MESSAGES + 137; i++) {
        store.receiveMessage('dev1', logMsg(`msg-${i}`))
      }
      const logs = store.deviceLogs('dev1')
      expect(store.logSeq('dev1') - store.logDropped('dev1')).toBe(logs.length)
      // logs[i] 的绝对序号为 logDropped + i
      expect(logs[0].data).toBe(`msg-${store.logDropped('dev1')}`)
    })

    it('resets logSeq and logDropped when messages are cleared', () => {
      const store = useWebSocketStore()
      for (let i = 0; i < MAX_LOG_MESSAGES + 5; i++) {
        store.receiveMessage('dev1', logMsg(`msg-${i}`))
      }
      expect(store.logDropped('dev1')).toBe(5)

      store.clearMessages('dev1')
      expect(store.logSeq('dev1')).toBe(0)
      expect(store.logDropped('dev1')).toBe(0)
      expect(store.deviceLogs('dev1')).toHaveLength(0)

      // 清空后仍能继续写入
      store.receiveMessage('dev1', logMsg('fresh'))
      expect(store.logSeq('dev1')).toBe(1)
      expect(store.deviceLogs('dev1').map((m) => m.data)).toEqual(['fresh'])
    })

    it('keeps only the latest screenshot (screenshot/screencast)', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', { type: 'screenshot', device_id: 'dev1', data: 'frame-1' })
      store.receiveMessage('dev1', { type: 'screencast', device_id: 'dev1', data: 'frame-2' })
      store.receiveMessage('dev1', { type: 'screenshot', device_id: 'dev1', data: 'frame-3' })

      expect(store.lastScreenshot('dev1')?.data).toBe('frame-3')
      // 截图不占用日志缓冲
      expect(store.deviceLogs('dev1')).toHaveLength(0)
    })

    it('tracks latest status message and wires it to device store', async () => {
      const store = useWebSocketStore()
      const deviceStore = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([createDevice()]),
      })
      await deviceStore.fetchDevices()

      store.receiveMessage('dev1', { type: 'status', device_id: 'dev1', data: 'busy' })
      expect(store.lastStatus('dev1')?.data).toBe('busy')
      expect(deviceStore.devices[0].status).toBe('busy')

      // 后端可能发送 idle/running，需映射到 DeviceStatus
      store.receiveMessage('dev1', { type: 'status', device_id: 'dev1', data: 'idle' })
      expect(deviceStore.devices[0].status).toBe('online')

      store.receiveMessage('dev1', { type: 'status', device_id: 'dev1', data: 'running' })
      expect(deviceStore.devices[0].status).toBe('busy')

      store.receiveMessage('dev1', { type: 'status', device_id: 'dev1', data: 'offline' })
      expect(deviceStore.devices[0].status).toBe('offline')
    })

    it('does not update device status for unknown status values', async () => {
      const store = useWebSocketStore()
      const deviceStore = useDeviceStore()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([createDevice()]),
      })
      await deviceStore.fetchDevices()

      store.receiveMessage('dev1', { type: 'status', device_id: 'dev1', data: 'weird-state' })
      expect(deviceStore.devices[0].status).toBe('online')
    })

    it('stores the latest error message', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', { type: 'error', device_id: 'dev1', data: 'boom' })
      expect(store.lastError('dev1')).toBe('boom')
    })

    it('ignores pong messages', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', { type: 'pong', device_id: 'dev1', data: '' })

      expect(store.deviceLogs('dev1')).toHaveLength(0)
      expect(store.lastScreenshot('dev1')).toBeNull()
      expect(store.lastStatus('dev1')).toBeNull()
      expect(store.lastError('dev1')).toBeNull()
    })

    it('ignores messages whose device_id does not match the channel', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', logMsg('foreign message', 'dev2'))

      expect(store.deviceLogs('dev1')).toHaveLength(0)
      // 也不会污染其他设备的通道
      expect(store.deviceLogs('dev2')).toHaveLength(0)
    })

    it('keeps channels per device isolated', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', logMsg('for dev1', 'dev1'))
      store.receiveMessage('dev2', logMsg('for dev2', 'dev2'))

      expect(store.deviceLogs('dev1').map((m) => m.data)).toEqual(['for dev1'])
      expect(store.deviceLogs('dev2').map((m) => m.data)).toEqual(['for dev2'])
    })
  })

  describe('seedLog (历史日志注入去重)', () => {
    // ── 回归：去重键为 (任务, 行文本)，同一任务的多行历史日志必须全部注入 ──
    // 旧实现按 taskId 去重，第一行写入后该任务即被标记，后续行被永久拒绝。
    it('injects every distinct line of the same task', () => {
      const store = useWebSocketStore()
      expect(store.seedLog('dev1', 'task-1', 'line-a')).toBe(true)
      expect(store.seedLog('dev1', 'task-1', 'line-b')).toBe(true)
      expect(store.seedLog('dev1', 'task-1', 'line-c')).toBe(true)

      const logs = store.deviceLogs('dev1')
      expect(logs).toHaveLength(3)
      expect(logs.map((m) => JSON.parse(m.data).text)).toEqual(['line-a', 'line-b', 'line-c'])
      expect(JSON.parse(logs[0].data)).toEqual({ task_id: 'task-1', text: 'line-a' })
    })

    it('rejects the exact same (task, line) twice', () => {
      const store = useWebSocketStore()
      expect(store.seedLog('dev1', 'task-1', 'line-a')).toBe(true)
      expect(store.seedLog('dev1', 'task-1', 'line-a')).toBe(false)
      expect(store.deviceLogs('dev1')).toHaveLength(1)
    })

    it('accepts new lines produced by a task later on', () => {
      const store = useWebSocketStore()
      store.seedLog('dev1', 'task-1', 'line-a')
      // 任务继续运行后产生新行 —— 不能因为该任务已注入过就永久拒绝
      expect(store.seedLog('dev1', 'task-1', 'line-later')).toBe(true)
      expect(store.deviceLogs('dev1')).toHaveLength(2)
    })

    it('keeps the same line text separate across tasks', () => {
      const store = useWebSocketStore()
      expect(store.seedLog('dev1', 'task-1', 'same text')).toBe(true)
      expect(store.seedLog('dev1', 'task-2', 'same text')).toBe(true)
      expect(store.deviceLogs('dev1')).toHaveLength(2)
    })

    it('keeps distinct tasks separate', () => {
      const store = useWebSocketStore()
      store.seedLog('dev1', 'task-1', 'line-a')
      store.seedLog('dev1', 'task-2', 'line-b')

      expect(store.deviceLogs('dev1')).toHaveLength(2)
    })

    it('ignores empty text', () => {
      const store = useWebSocketStore()
      expect(store.seedLog('dev1', 'task-1', '')).toBe(false)
      expect(store.deviceLogs('dev1')).toHaveLength(0)
    })

    it('keeps channels per device isolated for seed', () => {
      const store = useWebSocketStore()
      store.seedLog('dev1', 'task-1', 'line-a')
      store.seedLog('dev2', 'task-1', 'line-a')

      expect(store.deviceLogs('dev1')).toHaveLength(1)
      expect(store.deviceLogs('dev2')).toHaveLength(1)
    })

    it('replays history through receiveMessage (后端 WS 回放)', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', {
        type: 'log',
        device_id: 'dev1',
        data: JSON.stringify({ task_id: 'auto-1', text: 'auto log line' }),
      })
      // 同一 (任务, 行文本) 的 fetchQueue 兜底注入被去重，不重复
      expect(store.seedLog('dev1', 'auto-1', 'auto log line')).toBe(false)

      const logs = store.deviceLogs('dev1')
      expect(logs).toHaveLength(1)
      expect(JSON.parse(logs[0].data)).toEqual({ task_id: 'auto-1', text: 'auto log line' })
    })

    it('deduplicates WS replay against fetchQueue line by line (双通道)', () => {
      const store = useWebSocketStore()
      // 后端 WS 回放三行
      for (const text of ['L1', 'L2', 'L3']) {
        store.receiveMessage('dev1', {
          type: 'log',
          device_id: 'dev1',
          data: JSON.stringify({ task_id: 'auto-1', text }),
        })
      }
      // fetchQueue 兜底注入同样三行 —— 全部被去重
      for (const text of ['L1', 'L2', 'L3']) {
        expect(store.seedLog('dev1', 'auto-1', text)).toBe(false)
      }
      expect(store.deviceLogs('dev1')).toHaveLength(3)
    })

    it('clearSeeds allows re-seeding after cleanup', () => {
      const store = useWebSocketStore()
      store.seedLog('dev1', 'task-1', 'line-a')
      expect(store.seedLog('dev1', 'task-1', 'line-a')).toBe(false)

      store.clearSeeds('dev1')
      // 标记被清掉后，同一行可以重新注入（设备切回时需要重新回放）
      expect(store.seedLog('dev1', 'task-1', 'line-a')).toBe(true)
      expect(store.deviceLogs('dev1')).toHaveLength(2)
    })

    it('clearMessages also clears seed marks so history can replay again', () => {
      const store = useWebSocketStore()
      store.seedLog('dev1', 'task-1', 'line-a')
      store.clearMessages('dev1')

      // 通道已清空，历史行必须能重新注入，否则会永久丢失
      expect(store.seedLog('dev1', 'task-1', 'line-a')).toBe(true)
      expect(store.deviceLogs('dev1')).toHaveLength(1)
    })
  })

  describe('clearMessages', () => {
    it('resets the device channel', () => {
      const store = useWebSocketStore()
      store.receiveMessage('dev1', logMsg('hello'))
      store.receiveMessage('dev1', { type: 'screenshot', device_id: 'dev1', data: 'frame' })
      store.receiveMessage('dev1', { type: 'error', device_id: 'dev1', data: 'err' })

      store.clearMessages('dev1')

      expect(store.deviceLogs('dev1')).toHaveLength(0)
      expect(store.lastScreenshot('dev1')).toBeNull()
      expect(store.lastError('dev1')).toBeNull()
    })
  })

  describe('connection lifecycle', () => {
    it('isConnected reflects connected devices set', () => {
      const store = useWebSocketStore()
      expect(store.isConnected('dev1')).toBe(false)

      store.connectedDevices = new Set(['dev1'])
      expect(store.isConnected('dev1')).toBe(true)
    })

    it('disconnectAll clears every connected device', () => {
      const store = useWebSocketStore()
      store.connectedDevices = new Set(['dev1', 'dev2'])

      store.disconnectAll()

      expect(store.connectedDevices.size).toBe(0)
    })
  })
})
