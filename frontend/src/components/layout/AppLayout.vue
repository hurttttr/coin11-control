<script setup lang="ts">
import SideNav from './SideNav.vue'
import UpdateBanner from '@/components/common/UpdateBanner.vue'
</script>

<template>
  <div class="app-layout">
    <SideNav />
    <main class="main-content">
      <UpdateBanner />
      <div class="content-area">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
}

.main-content {
  margin-left: var(--sidebar-width);
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.content-area {
  flex: 1;
  padding: 36px 40px;
  width: 100%;
}

/* Route transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
