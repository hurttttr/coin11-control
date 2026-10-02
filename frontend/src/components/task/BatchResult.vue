<script setup lang="ts">
import type { BatchTaskResult } from '@/types'

defineProps<{
  result: BatchTaskResult
}>()
</script>

<template>
  <div
    class="result-section"
    role="status"
    aria-live="polite"
    :class="{
      success: result.failed === 0,
      partial: result.failed > 0 && result.succeeded > 0,
      fail: result.succeeded === 0,
    }"
  >
    <div class="result-summary">
      <span v-if="result.failed === 0">✅ 全部成功！{{ result.succeeded }} 台设备已完成</span>
      <span v-else-if="result.succeeded > 0">⚠️ 部分成功：{{ result.succeeded }} 成功，{{ result.failed }} 失败</span>
      <span v-else>❌ 全部失败：{{ result.failed }} 台设备操作失败</span>
    </div>
    <div v-if="result.errors.length > 0" class="result-errors">
      <div v-for="err in result.errors" :key="err.device_id" class="result-error">
        <span class="err-device">{{ err.device_id }}</span>
        <span class="err-msg">{{ err.error }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-section {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
}

.result-section.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: var(--success);
}

.result-section.partial {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: var(--warning);
}

.result-section.fail {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: var(--error);
}

.result-summary {
  font-weight: 600;
}

.result-errors {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-error {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.err-device {
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.err-msg {
  color: var(--text-muted);
}
</style>
