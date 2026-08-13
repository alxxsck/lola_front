<script setup lang="ts">
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';

defineProps<{
  mode: 'DESKTOP' | 'TABLET' | 'MOBILE';
  mobileVisible: boolean;
  drawerVisible: boolean;
}>();

const emit = defineEmits<{
  closeMobile: [];
  'update:drawerVisible': [visible: boolean];
}>();
</script>

<template>
  <aside v-if="mode === 'DESKTOP'" class="context-pane" aria-label="Контекст диалога">
    <slot />
  </aside>

  <section
    v-else-if="mode === 'MOBILE' && mobileVisible"
    class="mobile-inspector-pane"
    aria-label="Контекст диалога"
  >
    <header class="mobile-inspector-header">
      <Button
        class="mobile-inspector-back"
        type="button"
        label="Назад к диалогу"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        @click="emit('closeMobile')"
      />
      <div>
        <span class="eyebrow">Сведения</span>
        <h2>Контекст диалога</h2>
      </div>
    </header>
    <div class="mobile-inspector-content">
      <slot />
    </div>
  </section>

  <Drawer
    v-else-if="mode === 'TABLET' && drawerVisible"
    :visible="drawerVisible"
    position="right"
    aria-label="Контекст диалога"
    :style="{ width: 'min(420px, 92vw)' }"
    @update:visible="emit('update:drawerVisible', $event)"
  >
    <slot />
  </Drawer>
</template>

<style scoped>
.context-pane {
  min-height: 0;
  padding: 18px 18px 24px;
  overflow: auto;
  overscroll-behavior: contain;
  border-left: 1px solid var(--line);
  background: var(--surface-card);
}
.mobile-inspector-pane {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-card);
}
.mobile-inspector-header {
  min-height: 60px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-card);
}
.mobile-inspector-header :deep(.p-button) {
  width: 44px;
  min-width: 44px;
  height: 44px;
  padding: 0;
}
.mobile-inspector-header :deep(.p-button-label) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.mobile-inspector-header h2 {
  margin: 2px 0 0;
  font-size: 1rem;
}
.mobile-inspector-header .eyebrow {
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.mobile-inspector-content {
  min-height: 0;
  flex: 1;
  padding: 12px 12px calc(16px + env(safe-area-inset-bottom));
  overflow: auto;
  overscroll-behavior: contain;
}
</style>
