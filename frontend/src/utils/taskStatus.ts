import type { TaskStatus } from '@/types'

export interface TaskStatusMeta {
  label: string
  class: string
  icon: string
}

/** 任务状态 → 展示文案 / 样式类 / 图标 的统一映射 */
export const TASK_STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  pending: { label: '等待中', class: 'badge-pending', icon: '⏳' },
  running: { label: '运行中', class: 'badge-running', icon: '⟳' },
  completed: { label: '已完成', class: 'badge-completed', icon: '✓' },
  failed: { label: '失败', class: 'badge-failed', icon: '✕' },
}

export function taskStatusBadge(status: TaskStatus): TaskStatusMeta {
  return TASK_STATUS_META[status] ?? { label: status, class: '', icon: '?' }
}
