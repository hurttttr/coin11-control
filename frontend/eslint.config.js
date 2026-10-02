import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/**
 * ESLint 9+ flat config —— Vue 3 + <script setup> + TypeScript。
 *
 * 刻意不启用 typescript-eslint 的 recommended-type-checked：
 * 那套规则需要完整类型信息，会显著拖慢 CI，而本项目的类型安全
 * 已由 `npm run typecheck`（vue-tsc）把关，收益有限。
 *
 * 项目没有引入 Prettier，因此纯格式类规则一律关闭，
 * 只保留语义类检查（未使用变量、可疑写法等）。
 */
export default tseslint.config(
  {
    // dist 与 coverage 是产物目录；node_modules 由 ESLint 默认忽略
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        // .vue 文件的 <script lang="ts"> 由 vue-eslint-parser 交给 ts 解析器
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // ── 关闭纯格式规则（无 Prettier，开启只会产生噪音）──
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',

      // ── 语义类规则保留 ──
      // 以 _ 开头的参数视为有意忽略
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // 测试文件使用 vitest 全局 API（vite.config.ts 里 test.globals = true）
    files: ['src/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },

  {
    // 构建配置运行在 Node 环境
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
)
