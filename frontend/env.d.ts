/// <reference types="vite/client" />

/*
 * 下面两个模块声明是 Vue SFC / vuedraggable 的标准类型 shim：
 * DefineComponent<{}, {}, any> 里的 {} 与 any 是官方推荐写法，
 * 换成 object / unknown 会破坏 .vue 文件的 props 与实例类型推导，
 * 因此在文件级关闭这两条规则，而不是修改类型本身。
 */
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vuedraggable' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<any, any, any>
  export default component
}

declare module 'ansi-to-html' {
  interface AnsiToHtmlOptions {
    fg?: string
    bg?: string
    newline?: boolean
    escapeXML?: boolean
    stream?: boolean
    colors?: Record<number, string>
  }
  class Convert {
    constructor(options?: AnsiToHtmlOptions)
    toHtml(input: string): string
  }
  export default Convert
}

interface ImportMetaEnv {
  /**
   * WebSocket 鉴权 token，必须在 .env.local 中配置（参见 .env.example）。
   * 类型保留可选：缺失是运行期可能出现的真实状态，
   * websocket store 会在缺失时 console.error 指路而非静默连接。
   */
  readonly VITE_WS_TOKEN?: string
  /** vite.config.ts 由 package.json version 注入，构建产物中必定存在 */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
