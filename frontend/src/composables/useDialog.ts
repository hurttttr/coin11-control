import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/**
 * 弹窗可访问性 composable。
 *
 * 各弹窗此前都是裸 div，键盘用户既无法用 Escape 关闭，Tab 也会跑到背景内容上。此处统一提供：
 * - panelRef：绑定到弹窗面板元素，用于焦点陷阱的边界计算
 * - titleId：供 aria-labelledby 指向标题元素的唯一 id
 * - Escape 关闭（调用调用方传入的 onClose，即各弹窗已有的 close emit）
 * - 打开时把焦点移入弹窗（默认首个可交互元素，可用 initialFocus 指定）
 * - 关闭时把焦点还给打开弹窗的触发元素
 * - Tab / Shift+Tab 在弹窗内循环
 *
 * 支持两种挂载模式：
 * 1. 弹窗自身就是一个组件，由父级 v-if 挂载/卸载（ScriptSelector / BatchTaskDialog /
 *    BatchDeviceDialog）——不传 active，随组件挂载即视为打开。
 * 2. 弹窗是宿主组件内由布尔开关 v-if 控制的一段模板（DeviceGrid 的 ADB 配对弹窗）——
 *    传入 active，composable 跟随开关启停监听与焦点管理。
 *
 * 键盘监听挂在 window 上（而非 document），这样 document 派发与元素冒泡的按键都能收到。
 *
 * 不涉及任何业务逻辑，各弹窗的 props/emits 契约保持不变。
 */

/** 递增序号，保证同页多个弹窗的 titleId 不冲突 */
let dialogSeq = 0

/** 可获得焦点的元素选择器（排除 tabindex="-1" 与禁用元素） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface UseDialogOptions {
  /** 请求关闭弹窗时调用，通常是 () => emit('close') */
  onClose: () => void
  /**
   * 弹窗是否处于打开状态。
   * 省略时视为「随组件挂载即打开」；传入时跟随该开关启停。
   */
  active?: Ref<boolean>
  /**
   * 打开时优先获得焦点的元素（如首个输入框）。
   * 省略时取弹窗内首个可交互元素（通常是关闭按钮）。
   */
  initialFocus?: Ref<HTMLElement | null>
}

export interface UseDialogReturn {
  /** 绑定到弹窗面板根元素（需带 tabindex="-1" 作为兜底焦点目标） */
  panelRef: Ref<HTMLElement | null>
  /** 绑定到标题元素的 id，同时用于面板的 aria-labelledby */
  titleId: string
}

export function useDialog(options: UseDialogOptions): UseDialogReturn {
  const panelRef = ref<HTMLElement | null>(null)
  const titleId = `dialog-title-${++dialogSeq}`
  // 打开弹窗前持有焦点的元素，关闭后焦点还给它
  let trigger: HTMLElement | null = null
  // 监听是否已挂载，避免重复注册 / 重复归还焦点
  let listening = false

  /** 当前弹窗内所有可获得焦点的元素，按 DOM 顺序 */
  function focusableItems(): HTMLElement[] {
    const panel = panelRef.value
    if (!panel) return []
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  /** Tab 焦点陷阱：到边界时回绕，焦点在弹窗外时拉回首个元素 */
  function trapTab(event: KeyboardEvent): void {
    const items = focusableItems()
    const panel = panelRef.value
    if (!panel) return
    if (items.length === 0) {
      // 弹窗内没有可聚焦元素时，焦点留在面板本身
      event.preventDefault()
      panel.focus()
      return
    }

    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (!active || !panel.contains(active)) {
      event.preventDefault()
      first.focus()
      return
    }
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation()
      options.onClose()
      return
    }
    if (event.key === 'Tab') {
      trapTab(event)
    }
  }

  /** 移动初始焦点：优先 initialFocus，其次首个可交互元素，最后退回面板本身 */
  function moveFocusIn(): void {
    const preferred = options.initialFocus?.value
    if (preferred) {
      preferred.focus()
      return
    }
    const items = focusableItems()
    if (items.length > 0) items[0].focus()
    else panelRef.value?.focus()
  }

  function activate(): void {
    if (listening) return
    listening = true
    const active = document.activeElement
    // body 不是有意义的归还目标（焦点本就不在任何控件上）
    trigger = active instanceof HTMLElement && active !== document.body ? active : null
    // 挂在 window 而非 document：window 能同时收到 document 与元素冒泡上来的按键
    window.addEventListener('keydown', handleKeydown)
    moveFocusIn()
  }

  function deactivate(): void {
    if (!listening) return
    listening = false
    window.removeEventListener('keydown', handleKeydown)
    // 焦点还给触发元素（元素仍在文档中才还，避免焦点丢到 body 之外）
    if (trigger && document.body.contains(trigger)) trigger.focus()
    trigger = null
  }

  if (options.active) {
    // 开关模式：flush 'post' 保证面板 DOM 已渲染后再算焦点与陷阱边界
    watch(
      options.active,
      (open) => {
        if (open) activate()
        else deactivate()
      },
      { flush: 'post' },
    )
    onMounted(() => {
      // 挂载时开关已是打开状态（例如从路由恢复）也要生效
      if (options.active?.value) nextTick(activate)
    })
  } else {
    // 组件即弹窗：挂载等于打开
    onMounted(activate)
  }

  onBeforeUnmount(deactivate)

  return { panelRef, titleId }
}
