/**
 * 统一 API 请求封装：
 * - 网络错误 / 非 2xx 状态统一抛出 Error
 * - 尽量从响应体提取后端 detail 作为错误信息
 * - 2xx 响应自动解析 JSON
 */

export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, options)
  } catch (e) {
    // 保留原始异常作为 cause，便于排查底层网络错误（DNS/CORS/中断等）
    throw new Error(e instanceof Error ? e.message : '网络请求失败', { cause: e })
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { detail?: unknown; message?: unknown } | null
      if (body) {
        const msg = body.detail ?? body.message
        if (typeof msg === 'string' && msg) detail = msg
        else if (msg != null) detail = JSON.stringify(msg)
      }
    } catch {
      // 响应体不是 JSON 时保留默认错误信息
    }
    throw new Error(detail)
  }

  // 204 No Content 等无响应体场景
  if (response.status === 204) return undefined as T

  // 防御：某些测试 mock 或环境没有完整 Response 实现
  if (typeof response.json !== 'function') return undefined as T

  const contentType = response.headers?.get?.('content-type') ?? ''
  if (contentType && !contentType.includes('json')) {
    return undefined as T
  }
  return (await response.json()) as T
}

/** 将未知异常转为可展示的字符串 */
export function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}
