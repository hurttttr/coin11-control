<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * 页面级错误提示条。
 * - message 为空（null / ''）时不渲染，可直接绑定 store 的 error 状态
 * - showRetry 为 true 时显示"重试"按钮并向父组件抛出 retry 事件
 * - 关闭状态由组件内部维护：message 变化（出现新错误）时自动重新显示，
 *   调用方无需为每个页面额外维护一个 dismissed 标记
 */
const props = withDefaults(
  defineProps<{
    /** 错误文案，通常来自 store 的 error 状态 */
    message?: string | null
    /** 标题文案，默认"操作失败" */
    title?: string
    /** 是否显示重试按钮（父组件需监听 retry 事件） */
    showRetry?: boolean
    /** 重试按钮文案 */
    retryLabel?: string
    /** 是否正在重试（禁用按钮并显示转圈） */
    retrying?: boolean
    /** 是否允许关闭 */
    dismissible?: boolean
  }>(),
  {
    message: null,
    title: '操作失败',
    showRetry: false,
    retryLabel: '重试',
    retrying: false,
    dismissible: true,
  },
)

const emit = defineEmits<{
  retry: []
  dismiss: []
}>()

const dismissed = ref(false)

// 出现新的错误文案时重新显示（避免上一次关闭把后续错误一起吞掉）
watch(
  () => props.message,
  () => {
    dismissed.value = false
  },
)

function handleDismiss(): void {
  dismissed.value = true
  emit('dismiss')
}
</script>

<template>
  <div
    v-if="message && !dismissed"
    class="error-banner"
    role="alert"
    aria-live="polite"
  >
    <div class="error-content">
      <span class="error-icon" aria-hidden="true">⚠</span>
      <div class="error-text">
        <span class="error-title">{{ title }}</span>
        <span class="error-detail">{{ message }}</span>
      </div>
    </div>
    <div class="error-actions">
      <button
        v-if="showRetry"
        class="btn-retry"
        type="button"
        :disabled="retrying"
        @click="emit('retry')"
      >
        <span v-if="retrying" class="spinner" aria-hidden="true" />
        {{ retrying ? '重试中...' : retryLabel }}
      </button>
      <button
        v-if="dismissible"
        class="btn-dismiss"
        type="button"
        aria-label="关闭错误提示"
        @click="handleDismiss"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(245, 158, 11, 0.06));
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.error-icon {
  font-size: 16px;
  color: var(--error);
  flex-shrink: 0;
}

.error-text {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 13px;
  min-width: 0;
}

.error-title {
  color: var(--error);
  font-weight: 600;
}

.error-detail {
  color: var(--text-secondary);
  word-break: break-word;
}

.error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-retry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid var(--error);
  background: var(--error-dim);
  color: var(--error);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

.btn-retry:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-dismiss {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 13px;
  transition: color 0.2s;
}

.btn-dismiss:hover {
  color: var(--text-primary);
}

.spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid var(--error);
  border-top-color: transparent;
  border-radius: 50%;
  /* @keyframes spin 见 global.css */
  animation: spin 0.6s linear infinite;
}
</style>
