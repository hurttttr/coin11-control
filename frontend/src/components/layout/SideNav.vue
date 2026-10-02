<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 构建时由 vite.config.ts 注入（package.json version）
const appVersion = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

interface NavItem {
  name: string
  path: string
  icon: string
}

const navItems: NavItem[] = [
  { name: '仪表盘', path: '/', icon: '◈' },
  { name: '任务列表', path: '/tasks', icon: '☰' },
  { name: '设置', path: '/settings', icon: '⚙' },
]

const isActive = (item: NavItem) => {
  if (item.path === '/') return route.path === '/'
  return route.path.startsWith(item.path)
}

function navigate(item: NavItem): void {
  router.push(item.path)
}
</script>

<template>
  <nav class="side-nav">
    <div class="nav-header">
      <div class="logo">
        <span class="logo-icon">⧫</span>
        <span class="logo-text">Coin11<span class="accent">-TB</span></span>
      </div>
      <div class="logo-subtitle">控制平台</div>
    </div>

    <div class="nav-items">
      <button
        v-for="item in navItems"
        :key="item.path"
        :class="['nav-item', { active: isActive(item) }]"
        @click="navigate(item)"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.name }}</span>
        <span v-if="isActive(item)" class="nav-indicator" />
      </button>
    </div>

    <div class="nav-footer">
      <div class="version-info">v{{ appVersion }}</div>
    </div>
  </nav>
</template>

<style scoped>
.side-nav {
  width: var(--sidebar-width);
  height: 100vh;
  background: #0d1225;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
  user-select: none;
}

.nav-header {
  padding: 24px 20px 20px;
  border-bottom: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 22px;
  color: var(--accent);
  text-shadow: 0 0 10px var(--accent-glow);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--text-primary);
}

.accent {
  color: var(--accent);
}

.logo-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
  margin-left: 32px;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.nav-items {
  flex: 1;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  width: 100%;
  text-align: left;
}

.nav-item:hover {
  background: rgba(0, 240, 255, 0.06);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-dim);
  color: var(--accent);
  box-shadow: inset 0 0 20px rgba(0, 240, 255, 0.05);
}

.nav-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label {
  font-weight: 500;
}

.nav-indicator {
  position: absolute;
  right: 10px;
  width: 4px;
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.nav-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.version-info {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 1px;
}
</style>
