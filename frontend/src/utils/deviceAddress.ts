/** ADB 远程连接默认端口 */
export const DEFAULT_ADB_PORT = '5555'

/**
 * 拼接设备完整地址 `host[:port]` 的纯函数。
 *
 * - host 已含冒号（完整 IP:Port，含主机部分/多点）→ 原样返回，端口输入被忽略；
 * - 否则按 `host:port` 拼接，端口为空时使用 defaultPort（连接场景默认 5555）；
 * - host 为空 → 返回空串（调用方据此跳过提交）。
 *
 * 网段预填由调用方（DeviceGrid）负责：这里的 host 参数已包含网段前缀，
 * 即「子网前缀 + IP 最后一段」（如 `192.168.1.` + `100` → `192.168.1.100`），
 * 也可能是用户直接粘贴的完整地址。
 */
export function buildDeviceAddress(
  hostPart: string,
  port: string,
  defaultPort = DEFAULT_ADB_PORT,
): string {
  const host = hostPart.trim()
  // 完整 IP:Port（含主机部分/多点）→ 直接用完整值，不再拼接端口
  if (host.includes(':')) return host
  const portValue = port.trim() || defaultPort
  return host ? `${host}:${portValue}` : ''
}