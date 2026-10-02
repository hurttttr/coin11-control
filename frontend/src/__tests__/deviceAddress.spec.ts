import { describe, it, expect } from 'vitest'
import { buildDeviceAddress, DEFAULT_ADB_PORT } from '@/utils/deviceAddress'

describe('buildDeviceAddress（拼接设备地址纯函数）', () => {
  it('短地址 + 显式端口 → host:port', () => {
    expect(buildDeviceAddress('100', '5555')).toBe('100:5555')
  })

  it('网段前缀 + 最后一段 → 完整 host:port', () => {
    expect(buildDeviceAddress('192.168.1.100', '5555')).toBe('192.168.1.100:5555')
  })

  it('完整 IP:Port → 原样返回（端口字段被忽略）', () => {
    expect(buildDeviceAddress('192.168.1.100:5555', '')).toBe('192.168.1.100:5555')
    expect(buildDeviceAddress('192.168.1.100:5555', '41339')).toBe('192.168.1.100:5555')
  })

  it('完整 IP（无端口）→ 补默认端口', () => {
    expect(buildDeviceAddress('192.168.1.100', '')).toBe('192.168.1.100:5555')
  })

  it('缺网段 / host 为空 → 返回空串', () => {
    expect(buildDeviceAddress('', '5555')).toBe('')
    expect(buildDeviceAddress('   ', '5555')).toBe('')
  })

  it('端口为空 → 使用默认端口', () => {
    expect(buildDeviceAddress('100', '')).toBe(`100:${DEFAULT_ADB_PORT}`)
    expect(DEFAULT_ADB_PORT).toBe('5555')
  })

  it('自定义默认端口生效', () => {
    expect(buildDeviceAddress('100', '', '41339')).toBe('100:41339')
  })

  it('首尾空白会被裁剪', () => {
    expect(buildDeviceAddress(' 100 ', ' 5555 ')).toBe('100:5555')
    expect(buildDeviceAddress(' 192.168.1.100:5555 ', '')).toBe('192.168.1.100:5555')
  })
})