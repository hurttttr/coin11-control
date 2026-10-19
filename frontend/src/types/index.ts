export type DeviceStatus = 'online' | 'offline' | 'busy'
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type ConnectionType = 'usb' | 'wifi'

export interface DeviceInfo {
  serial: string
  model: string
  status: DeviceStatus
  connection_type: ConnectionType
  android_version: string
}

export interface TaskInfo {
  id: string
  device_id: string
  script_name: string
  status: TaskStatus
  position: number
  created_at: string
  log: string
}

export interface UpdateInfo {
  has_update: boolean
  current_commit: string
  latest_commit: string
  commits_behind: number
  commit_messages: string[]
  checked_at?: string
  branch?: string
  repo_url?: string
  /** false 表示 fetch 失败，结果是基于本地缓存的远端引用 */
  fetch_ok?: boolean
  warning?: string
}

/** 更新任务状态（后端进程内，刷新页面后可通过 /progress 恢复） */
export type UpdateJobStatus = 'idle' | 'running' | 'success' | 'error'
export type UpdateJobMode = 'pull' | 'reclone' | ''

export interface UpdateJobLog {
  time: string
  level: 'info' | 'warning' | 'error' | 'success' | string
  text: string
}

export interface UpdateJobResult {
  success: boolean
  message: string
  pulled_commits: string[]
  previous_commit?: string
  current_commit?: string
  commits_pulled?: number
  backup_path?: string
}

export interface UpdateJob {
  id: string
  mode: UpdateJobMode
  status: UpdateJobStatus
  stage: string
  stage_label: string
  progress: number
  message: string
  branch: string
  previous_commit: string
  current_commit: string
  commits_pulled: number
  started_at: string | null
  finished_at: string | null
  elapsed_seconds: number
  logs: UpdateJobLog[]
  result: UpdateJobResult | null
}

/** GET /api/update/status */
export interface UpdateRepoStatus {
  repo_url: string
  origin_url: string
  repo_url_source: 'settings' | 'env' | string
  default_repo_url: string
  branch: string
  branch_source: 'settings' | 'auto' | string
  repo_path: string
  is_git_repo: boolean
  current_commit: string
  remote_commit: string
  commits_behind: number
  dirty: boolean
  dirty_files: string[]
  deployment: 'docker' | 'source' | string
  app_version: string
  repo_status: string
  repo_error: string
  last_checked_at: string | null
}

/** GET /api/update/settings */
export interface UpdateSettingsInfo {
  repo_url: string
  branch: string
  default_repo_url: string
  effective_repo_url: string
}

export interface UpdateJobStartResponse {
  started: boolean
  reason: string
  job: UpdateJob
}

export interface UpdateSettingsSaveResponse {
  settings: UpdateSettingsInfo
  previous_repo_url: string
  effective_repo_url: string
  applied: string[]
}

export interface ScriptInfo {
  name: string
  path: string
  description: string
}

export interface WSMessage {
  type: 'log' | 'screenshot' | 'screencast' | 'status' | 'error' | 'pong'
  device_id: string
  data: string
}

export interface TaskQueueData {
  device_id: string
  tasks: TaskInfo[]
}

/** 批量操作（分配/启动/停止）的结果 */
export interface BatchTaskResult {
  succeeded: number
  failed: number
  errors: { device_id: string; error: string }[]
}
