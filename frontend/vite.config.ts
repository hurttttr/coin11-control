import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

/*
 * vuedraggable 的 package.json "module" 字段指向 dist/vuedraggable.umd.js ——
 * 一个 157KB 的「未压缩 UMD」包。UMD 不是 ESM，Rollup 无法 tree-shake，
 * 还会把 Vue 的部分运行时重复打进共享 chunk。
 * 它的 src/ 才是真正的 ESM 入口（8KB，import sortablejs + vue），
 * 指向它可让 Rollup 正常 tree-shaking 并复用项目自身的 Vue 实例
 * （实测首屏 + 详情页 gzip 合计减少约 66 kB）。
 *
 * 代价：这是 node_modules 的内部路径。若上游升级后调整 src/ 布局，
 * 下面的断言会立即以明确信息失败，而不是静默回退到 UMD 让体积悄悄翻倍。
 */
const vuedraggableEsmEntry = resolve(
  __dirname,
  'node_modules/vuedraggable/src/vuedraggable.js',
)

if (!existsSync(vuedraggableEsmEntry)) {
  throw new Error(
    `找不到 vuedraggable 的 ESM 入口：${vuedraggableEsmEntry}\n` +
      '该依赖可能已升级并调整了 src/ 布局。请重新确认其 ESM 入口路径后更新此 alias，' +
      '或移除该 alias（会退回未压缩的 UMD 包，产物体积显著增大）。',
  )
}

export default defineConfig({
  define: {
    // 构建时注入版本号（SideNav 展示，取自 package.json）
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
  ],
  build: {
    // 产物输出到项目根外层的 frontend-dist/：并入后端仓库后即
    // <后端仓库根>/frontend-dist/，与后端 app/main.py 的 SPA 静态托管约定一致。
    // outDir 在项目根之外时 Vite 默认不清空并打印警告，故需显式 emptyOutDir；
    // 该目录仅承载前端构建产物（后端只读托管），清空不会误删其他文件。
    outDir: resolve(__dirname, '../frontend-dist'),
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // vuedraggable 的 package.json "module" 字段指向 dist/vuedraggable.umd.js ——
      // 一个 157KB 的「未压缩 UMD」包。UMD 不是 ESM，Rollup 无法 tree-shake，
      // 还会把 Vue 的部分运行时重复打进共享 chunk。
      // 它的 src/ 才是真正的 ESM 入口（8KB，import sortablejs + vue），
      // 指向它可让 Rollup 正常做 tree-shaking 并复用项目自身的 Vue 实例。
      vuedraggable: vuedraggableEsmEntry,
    },
  },
  server: {
    port: 6173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})