import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { createPinia } from 'pinia'
import { Fragment, Transition, defineComponent, h, type Component } from 'vue'
import routerDefault from '@/router'
import DashboardView from '@/views/DashboardView.vue'
import TaskListView from '@/views/TaskListView.vue'
import SettingsView from '@/views/SettingsView.vue'
import DeviceDetailView from '@/views/DeviceDetailView.vue'

/*
 * 路由视图必须是「单根元素」组件。
 *
 * AppLayout 用 <transition name="fade" mode="out-in"> 承载 <router-view>，
 * 而 Transition 只能动画化单个元素根节点。若某个视图是多根节点（fragment），
 * Vue 会告警 "Component inside <Transition> renders non-element root node
 * that cannot be animated"，且在 out-in 模式下该视图离场后，后续路由切换会
 * 渲染不出任何内容 —— 表现为点击侧边栏导航「点了没反应」。
 *
 * 判定方式：多根组件的 subTree.type 是 Fragment，单根组件不是。
 * 不能用 wrapper.element.nodeType 判断 —— 实测多根与单根都返回 1。
 */
describe('路由视图必须是单根元素（否则破坏 AppLayout 的 out-in 过渡）', () => {
  let router: Router

  // 视图从 route.params 取参，因此用真实路由定位而非传 props
  const views: readonly [name: string, component: Component, path: string][] = [
    ['DashboardView', DashboardView, '/'],
    ['TaskListView', TaskListView, '/tasks'],
    ['SettingsView', SettingsView, '/settings'],
    ['DeviceDetailView', DeviceDetailView, '/device/TESTSERIAL'],
  ]

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })),
    )
    // DeviceDetailView 挂载即建立日志 WebSocket；happy-dom 不提供构造器
    vi.stubGlobal(
      'WebSocket',
      class {
        static OPEN = 1
        readyState = 0
        close() {}
        send() {}
        addEventListener() {}
        removeEventListener() {}
      },
    )
    router = createRouter({ history: createWebHistory(), routes: routerDefault.options.routes })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function mountAt(component: Component, path: string) {
    await router.push(path)
    await router.isReady()
    return mount(component, { global: { plugins: [router, createPinia()] } })
  }

  for (const [name, component, path] of views) {
    it(name + ' 的根节点不是 Fragment', async () => {
      const wrapper = await mountAt(component, path)
      const { subTree } = wrapper.vm.$ as unknown as { subTree: { type: unknown } }
      expect(subTree.type).not.toBe(Fragment)
    })
  }

  it('放进 AppLayout 的同款 <transition mode="out-in"> 后没有 non-element root node 告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const [, component, path] of views) {
        await router.push(path)
        await router.isReady()
        // 复刻 AppLayout 的包裹方式：告警只在真实 Transition 内部才会触发，
        // 因此必须关掉 test-utils 默认的 transition stub（实测 stub 下不告警）。
        const Host = defineComponent({
          render: () => h(Transition, { name: 'fade', mode: 'out-in' }, () => [h(component)]),
        })
        mount(Host, {
          global: { plugins: [router, createPinia()], stubs: { transition: false } },
        })
      }
      const offending = warn.mock.calls
        .map((call) => String(call[0]))
        .filter((message) => message.includes('non-element root node'))
      expect(offending).toEqual([])
    } finally {
      warn.mockRestore()
    }
  })
})
