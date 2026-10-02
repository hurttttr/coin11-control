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
