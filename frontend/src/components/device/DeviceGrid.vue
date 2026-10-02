<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDeviceStore } from '@/stores/devices'
import { storeToRefs } from 'pinia'
import { apiFetch, errMessage } from '@/utils/api'
import { buildDeviceAddress, DEFAULT_ADB_PORT } from '@/utils/deviceAddress'
import { useDialog } from '@/composables/useDialog'
import DeviceCard from './DeviceCard.vue'

/** ADB 配对接口返回体：业务级成败由 success 表达，HTTP 200 也可能 success=false */
interface PairResponse {
  success?: boolean
  message?: string
}

const deviceStore = useDeviceStore()
const { devices, loading } = storeToRefs(deviceStore)

/** 后端 network-info 返回的网段前缀（含尾点，如 "192.168.1."），连接/配对输入框共用 */
const networkPrefix = ref('')

// 远程连接：IP 最后一段（网段前缀已预填）+ 端口（默认 5555）
const connectHost = ref('')
const connectPort = ref(DEFAULT_ADB_PORT)
const connecting = ref(false)
const connectError = ref<string | null>(null)

// ADB Pair：IP 最后一段 + 配对端口 + 配对码
const showPairDialog = ref(false)
const pairHost = ref('')
const pairPort = ref('')
const pairCode = ref('')
const pairing = ref(false)
const pairError = ref<string | null>(null)
const pairResult = ref<string | null>(null)
// 打开时焦点优先落在首个输入框（而非默认的关闭按钮）
const pairHostInput = ref<HTMLInputElement | null>(null)

// 弹窗可访问性统一交给 useDialog：Escape 关闭 / 焦点移入与归还 / Tab 焦点陷阱。
// 该弹窗由 showPairDialog 开关条件渲染，故走 active 模式。
const { panelRef, titleId } = useDialog({
  onClose: closePairDialog,
  active: showPairDialog,
  initialFocus: pairHostInput,
})

onMounted(() => {
  deviceStore.fetchDevices()
  deviceStore.startPolling(10000)
  prefillSubnet()
})

onUnmounted(() => {
  deviceStore.stopPolling()
})

/** 拉取 network-info 并预填网段前缀（失败静默，不影响连接/配对主流程） */
async function prefillSubnet(): Promise<void> {
  const info = await deviceStore.getNetworkInfo()
  const subnet = info?.subnet?.trim() ?? ''
  networkPrefix.value = subnet ? (subnet.endsWith('.') ? subnet : `${subnet}.`) : ''
  if (networkPrefix.value && !connectHost.value) connectHost.value = networkPrefix.value
}

async function handleConnect(): Promise<void> {
  const address = buildDeviceAddress(connectHost.value, connectPort.value)
  if (!address) return
  connecting.value = true
  connectError.value = null
  try {
    await deviceStore.connectDevice(address)
    // 保留网段前缀，方便继续连接同一网段内的其它设备
    connectHost.value = networkPrefix.value
  } catch (e) {
    connectError.value = e instanceof Error ? e.message : '连接失败'
  } finally {
    connecting.value = false
  }
}

/** 配对表单是否可提交：IP 最后一段（排除仅网段前缀）+ 配对端口 + 配对码 都有效 */
function pairValid(): boolean {
  const host = pairHost.value.trim()
  const port = pairPort.value.trim()
  if (!host || host.endsWith('.')) return false
  if (pairCode.value.trim().length === 0) return false
  // 完整 IP:Port 已含端口；短地址（仅最后一段）必须单独填写配对端口
  return host.includes(':') ? true : port.length > 0
}

/** 配对表单缺什么字段的动态提示：与 pairValid() 的判定顺序一致，把按钮禁用原因显性化 */
const pairHint = computed<{ text: string; field: 'host' | 'port' | 'code' } | null>(() => {
  const host = pairHost.value.trim()
  const port = pairPort.value.trim()
  if (!host || host.endsWith('.')) {
    return host
      ? { text: '请补全 IP 最后一段（如 100），当前仅网段前缀', field: 'host' }
      : { text: '请填写 IP 最后一段（如 100）', field: 'host' }
  }
  if (pairCode.value.trim().length === 0) return { text: '请填写 6 位配对码', field: 'code' }
  return host.includes(':') || port.length > 0 ? null : { text: '请填写配对端口', field: 'port' }
})

/** 网段已预填时，placeholder 明确告诉用户只差末段 */
const pairHostPlaceholder = computed(() =>
  networkPrefix.value ? `例如 100，网段已自动填充 ${networkPrefix.value}` : '例如 100（也可粘贴完整 IP:Port）',
)

async function handlePair(): Promise<void> {
  const address = buildDeviceAddress(pairHost.value, pairPort.value)
  const code = pairCode.value.trim()
  if (!address || !code) return
  pairing.value = true
  pairError.value = null
  pairResult.value = null
  try {
    // 走统一的 apiFetch：HTTP 级失败会抛出并带上后端 detail
    const data = await apiFetch<PairResponse>('/api/devices/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, code }),
    })
    // HTTP 2xx 仍可能是业务级失败（success=false），需分别提示
    if (data?.success) {
      pairResult.value = `✅ 配对成功！(${address})`
      pairHost.value = ''
      pairPort.value = ''
      pairCode.value = ''
      deviceStore.fetchDevices()
    } else {
      pairError.value = data?.message || '配对失败'
    }
  } catch (e) {
    pairError.value = errMessage(e, '配对请求失败')
  } finally {
    pairing.value = false
  }
}

function openPairDialog(): void {
  showPairDialog.value = true
  pairHost.value = networkPrefix.value
  pairPort.value = ''
  pairCode.value = ''
  pairError.value = null
  pairResult.value = null
}

function closePairDialog(): void {
  // 焦点归还由 useDialog 在开关关闭时处理
  showPairDialog.value = false
}
</script>

<template>
  <div class="device-grid-wrapper">
    <!-- 远程连接区域 -->
    <div class="connect-section">
      <div class="connect-row">
        <div class="connect-input-group">
          <input
            v-model="connectHost"
            type="text"
            class="connect-input connect-host-input"
            placeholder="IP 最后一段，例如 100（也可粘贴完整 IP:Port）"
            @keyup.enter="handleConnect"
          />
          <input
            v-model="connectPort"
            type="text"
            inputmode="numeric"
            class="connect-input connect-port-input"
            placeholder="端口（默认 5555）"
            @keyup.enter="handleConnect"
          />
          <button
            class="btn-connect"
            :disabled="connecting || !connectHost.trim()"
            @click="handleConnect"
          >
            <span v-if="connecting" class="spinner-sm" />
            {{ connecting ? '连接中...' : '远程连接' }}
          </button>
        </div>
        <button class="btn-pair" @click="openPairDialog">
          📟 配对
        </button>
      </div>
      <p v-if="networkPrefix" class="connect-hint" role="note">
        已自动填充网段 {{ networkPrefix }}，只需填写最后一段
      </p>
      <p v-if="connectError" class="connect-error" role="alert">{{ connectError }}</p>
    </div>

    <!-- 设备网格 -->
    <div class="device-grid">
      <div v-if="loading && devices.length === 0" class="grid-placeholder">
        <div class="placeholder-spinner" />
        <div class="placeholder-text">加载设备中...</div>
      </div>
      <div v-else-if="devices.length === 0" class="grid-placeholder">
        <div class="placeholder-icon">⊘</div>
        <div class="placeholder-text">暂无设备</div>
        <div class="placeholder-hint">等待设备连接...</div>
      </div>
      <DeviceCard
        v-for="device in devices"
        :key="device.serial"
        :device="device"
      />
    </div>

    <!-- ADB Pair 弹窗 -->
    <div v-if="showPairDialog" class="pair-overlay" @click.self="closePairDialog">
      <div
        ref="panelRef"
        class="pair-panel card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <div class="pair-header">
          <h3 :id="titleId">ADB 配对</h3>
          <button class="btn-close" type="button" aria-label="关闭配对弹窗" @click="closePairDialog">✕</button>
        </div>
        <div class="pair-body">
          <p class="pair-hint">在开发者选项 → 无线调试 → 使用配对码配对设备，输入显示的 IP 最后一段、配对端口 和 配对码。</p>
          <div class="pair-field">
            <label for="pair-host-input">IP 最后一段</label>
            <input
              id="pair-host-input"
              ref="pairHostInput"
              v-model="pairHost"
              type="text"
              :placeholder="pairHostPlaceholder"
              :aria-invalid="pairHint?.field === 'host' ? 'true' : undefined"
              class="pair-input"
            />
          </div>
          <div class="pair-field">
            <label for="pair-port-input">配对端口</label>
            <input
              id="pair-port-input"
              v-model="pairPort"
              type="text"
              inputmode="numeric"
              placeholder="例如 41339"
              :aria-invalid="pairHint?.field === 'port' ? 'true' : undefined"
              class="pair-input"
            />
          </div>
          <div class="pair-field">
            <label for="pair-code-input">配对码</label>
            <input
              id="pair-code-input"
              v-model="pairCode"
              type="text"
              placeholder="123456"
              :aria-invalid="pairHint?.field === 'code' ? 'true' : undefined"
              class="pair-input"
              maxlength="6"
            />
          </div>
          <p v-if="pairError" class="pair-error" role="alert">{{ pairError }}</p>
          <p v-if="pairResult" class="pair-success" role="status">{{ pairResult }}</p>
          <p v-if="pairHint" class="pair-hint-error" role="alert">{{ pairHint.text }}</p>
        </div>
        <div class="pair-footer">
          <button class="btn-cancel" type="button" @click="closePairDialog">取消</button>
          <button
            class="btn-pair-submit"
            :disabled="!pairValid() || pairing"
            @click="handlePair"
          >
            {{ pairing ? '配对中...' : '开始配对' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-grid-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.connect-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.connect-row {
  display: flex;
  gap: 8px;
}

.connect-input-group {
  display: flex;
  gap: 8px;
  flex: 1;
}

.connect-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.connect-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.1);
}

.connect-input::placeholder {
  color: var(--text-muted);
}

/* IP 最后一段输入框占满剩余宽度，端口输入框固定窄宽 */
.connect-host-input {
  flex: 1;
}

.connect-input.connect-port-input {
  flex: 0 0 84px;
  text-align: center;
}

.btn-connect {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: rgba(0, 240, 255, 0.1);
  color: var(--accent);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-connect:hover:not(:disabled) {
  background: rgba(0, 240, 255, 0.2);
  box-shadow: 0 0 16px rgba(0, 240, 255, 0.15);
}

.btn-connect:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-pair {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--warning);
  background: rgba(245, 158, 11, 0.1);
  color: var(--warning);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-pair:hover {
  background: rgba(245, 158, 11, 0.2);
}

.connect-error {
  margin: 0;
  font-size: 12px;
  color: var(--error);
}

.connect-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── 设备网格 ── */
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.grid-placeholder {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.placeholder-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.4; }
/* .placeholder-spinner 与 @keyframes spin 见 global.css（取值完全一致，不再重复定义） */
.placeholder-text { font-size: 15px; margin-bottom: 6px; }
.placeholder-hint { font-size: 12px; }

/* ── ADB Pair 弹窗 ── */
.pair-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.pair-panel {
  width: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pair-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.pair-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

.btn-close:hover { color: var(--text-primary); }

/* ── 键盘焦点可见性 ── */
.pair-panel:focus-visible,
.btn-close:focus-visible,
.btn-cancel:focus-visible,
.btn-pair-submit:focus-visible,
.btn-pair:focus-visible,
.btn-connect:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.pair-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.pair-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pair-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.pair-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pair-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.pair-input {
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  outline: none;
}

.pair-input:focus {
  border-color: var(--accent);
}

.pair-error {
  margin: 0;
  font-size: 12px;
  color: var(--error);
}

/* 表单缺字段提示：位于按钮上方，把禁用原因显性化（FE-1b） */
.pair-hint-error {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--error);
}

.pair-success {
  margin: 0;
  font-size: 12px;
  color: var(--success);
  font-weight: 500;
}

.pair-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.btn-cancel {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel:hover {
  border-color: var(--border-accent);
  color: var(--text-primary);
}

.btn-pair-submit {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: var(--warning);
  color: #000;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-pair-submit:hover:not(:disabled) { opacity: 0.9; }
.btn-pair-submit:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
