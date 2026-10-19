import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUpdateStore } from '@/stores/update'
import type { UpdateJob } from '@/types'

/*
 * 回归重点：
 * 旧实现把 POST /api/update/pull 的返回值（{success,message,pulled_commits}）
 * 直接赋给 updateInfo。该结构没有 has_update 字段 → 横幅在点击"立即更新"
 * 后立刻消失，错误也被静默吞掉。现在 pull 只更新 job，updateInfo 只在
 * 检查结果/任务成功时变化。
 */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  } as unknown as Response
}

function makeJob(overrides: Partial<UpdateJob> = {}): UpdateJob {
  return {
    id: 'job-1',
    mode: 'pull',
    status: 'running',
    stage: 'fetch',
    stage_label: '拉取远程引用',
    progress: 35,
    message: '',
    branch: 'main',
    previous_commit: 'aaaaaaaa1111',
    current_commit: '',
    commits_pulled: 0,
    started_at: '2026-10-19T22:00:00',
    finished_at: null,
    elapsed_seconds: 2,
    logs: [{ time: '22:00:02', level: 'info', text: '$ git fetch origin main' }],
    result: null,
    ...overrides,
  }
}

const statusPayload = {
  repo_url: 'https://github.com/czl0325/coin11-tb.git',
  origin_url: 'https://github.com/czl0325/coin11-tb.git',
  repo_url_source: 'env',
  default_repo_url: 'https://github.com/czl0325/coin11-tb.git',
  branch: 'main',
  branch_source: 'auto',
  repo_path: '/app/data/coin11_tb',
  is_git_repo: true,
  current_commit: 'aaaaaaaa1111',
  remote_commit: 'bbbbbbbb2222',
  commits_behind: 3,
  dirty: false,
  dirty_files: [],
  deployment: 'docker',
  app_version: '0.4.1',
  repo_status: 'ready',
  repo_error: '',
  last_checked_at: '2026-10-19T22:00:00',
}

describe('useUpdateStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('startPull 不用任务返回值覆盖 updateInfo（横幅不会瞬间消失）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/update/check')) {
          return jsonResponse({
            has_update: true,
            current_commit: 'aaaaaaaa1111',
            latest_commit: 'bbbbbbbb2222',
            commits_behind: 3,
            commit_messages: ['feat: a', 'fix: b'],
          })
        }
        if (url.includes('/api/update/pull')) {
          return jsonResponse({ started: true, reason: '', job: makeJob() }, 202)
        }
        return jsonResponse(statusPayload)
      }),
    )

    const store = useUpdateStore()
    await store.checkUpdate()
    expect(store.updateInfo.has_update).toBe(true)

    await store.startPull()

    // 关键断言：pull 返回后 has_update 仍为 true，横幅继续可见
    expect(store.updateInfo.has_update).toBe(true)
    expect(store.job.status).toBe('running')
    expect(store.pulling).toBe(true)
  })

  it('轮询到成功后清空 has_update 并停止轮询', async () => {
    let progressCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/update/check')) {
        return jsonResponse({
          has_update: true,
          commits_behind: 3,
          commit_messages: [],
          current_commit: 'aaaaaaaa1111',
          latest_commit: 'bbbbbbbb2222',
        })
      }
      if (url.includes('/api/update/pull')) {
        return jsonResponse({ started: true, reason: '', job: makeJob() }, 202)
      }
      if (url.includes('/api/update/progress')) {
        progressCalls += 1
        if (progressCalls === 1) return jsonResponse(makeJob({ progress: 60 }))
        return jsonResponse(
          makeJob({
            status: 'success',
            stage: 'done',
            stage_label: '更新完成',
            progress: 100,
            current_commit: 'bbbbbbbb2222',
            commits_pulled: 3,
            finished_at: '2026-10-19T22:00:10',
            result: {
              success: true,
              message: '更新完成',
              pulled_commits: [],
              commits_pulled: 3,
            },
          }),
        )
      }
      return jsonResponse(statusPayload)
    })
    vi.stubGlobal('fetch', fetchMock)

    const store = useUpdateStore()
    await store.checkUpdate()
    await store.startPull()

    await vi.advanceTimersByTimeAsync(800)
    expect(store.job.progress).toBe(60)
    expect(store.updateInfo.has_update).toBe(true)

    await vi.advanceTimersByTimeAsync(800)
    expect(store.job.status).toBe('success')
    expect(store.updateInfo.has_update).toBe(false)
    expect(store.updateInfo.commits_behind).toBe(0)
    expect(store.pulling).toBe(false)

    const callsAfterFinish = progressCalls
    await vi.advanceTimersByTimeAsync(2400)
    expect(progressCalls).toBe(callsAfterFinish)
  })

  it('任务失败时保留错误信息（横幅不会静默消失）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/update/pull')) {
          return jsonResponse({ started: true, reason: '', job: makeJob() }, 202)
        }
        if (url.includes('/api/update/progress')) {
          return jsonResponse(
            makeJob({
              status: 'error',
              stage: 'error',
              stage_label: '更新失败',
              message: '仓库存在未提交的本地修改，已中止更新',
              finished_at: '2026-10-19T22:00:05',
            }),
          )
        }
        return jsonResponse(statusPayload)
      }),
    )

    const store = useUpdateStore()
    await store.startPull()
    await vi.advanceTimersByTimeAsync(800)

    expect(store.job.status).toBe('error')
    expect(store.error).toContain('未提交的本地修改')
    expect(store.dismissed).toBe(false)
  })

  it('resumeJob 能接上后端正在运行的任务（刷新页面不丢进度）', async () => {
    let progressCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/update/progress')) {
          progressCalls += 1
          return jsonResponse(
            progressCalls === 1
              ? makeJob({ progress: 35 })
              : makeJob({
                  status: 'success',
                  stage: 'done',
                  stage_label: '更新完成',
                  progress: 100,
                  current_commit: 'bbbbbbbb2222',
                }),
          )
        }
        return jsonResponse(statusPayload)
      }),
    )

    const store = useUpdateStore()
    await store.resumeJob()

    expect(store.pulling).toBe(true)
    expect(store.job.progress).toBe(35)

    await vi.advanceTimersByTimeAsync(800)
    expect(store.job.status).toBe('success')
    expect(store.pulling).toBe(false)
  })
})
