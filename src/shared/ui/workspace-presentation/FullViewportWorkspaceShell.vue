<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { acquireRootScrollLock, releaseRootScrollLock } from './root-scroll-lock';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  mode: 'windowed' | 'full-tab';
  measureSelector?: string;
  portalWindowed?: boolean;
}>();
const emit = defineEmits<{
  transitioning: [value: boolean];
  presented: [mode: 'windowed' | 'full-tab'];
}>();

let ownsRootLock = false;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;
let lastWindowedRect: DOMRect | null = null;
let lastWindowedViewport = { width: 0, height: 0 };
const shellElement = ref<HTMLElement | null>(null);
const renderedMode = ref(props.mode);
const transitionPhase = ref<'idle' | 'entering' | 'leaving'>('idle');
const enterTransform = ref('translateY(6px) scale(0.992)');
const exitTransform = ref('translateY(6px) scale(0.992)');

function viewportSize(): { width: number; height: number } {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height:
      window.visualViewport?.height || document.documentElement.clientHeight || window.innerHeight,
  };
}

function measuredWorkspace(): HTMLElement | null {
  const shell = shellElement.value;
  if (!shell) return null;
  if (props.measureSelector) {
    return shell.querySelector<HTMLElement>(props.measureSelector);
  }
  return shell.firstElementChild instanceof HTMLElement ? shell.firstElementChild : shell;
}

function usableRect(rect: DOMRect): boolean {
  return rect.width > 1 && rect.height > 1;
}

function inverseTransform(rect: DOMRect): string {
  const viewport = viewportSize();
  const scaleX = Math.min(1, Math.max(0.01, rect.width / viewport.width));
  const scaleY = Math.min(1, Math.max(0.01, rect.height / viewport.height));
  return `translate(${rect.left}px, ${rect.top}px) scale(${scaleX}, ${scaleY})`;
}

function currentWindowedTarget(): DOMRect | null {
  if (!lastWindowedRect) return null;
  const viewport = viewportSize();
  const previous = lastWindowedViewport;
  if (!previous.width || !previous.height) return lastWindowedRect;

  const width = Math.min(lastWindowedRect.width, viewport.width);
  const height = Math.min(lastWindowedRect.height, viewport.height);
  const leftRatio = lastWindowedRect.left / previous.width;
  const topRatio = lastWindowedRect.top / previous.height;
  return new DOMRect(
    Math.max(0, Math.min(viewport.width - width, leftRatio * viewport.width)),
    Math.max(0, Math.min(viewport.height - height, topRatio * viewport.height)),
    width,
    height,
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function acquireLock(): void {
  if (ownsRootLock) return;
  acquireRootScrollLock();
  ownsRootLock = true;
}

function releaseLock(): void {
  if (!ownsRootLock) return;
  releaseRootScrollLock();
  ownsRootLock = false;
}

function finishTransition(): void {
  transitionPhase.value = 'idle';
  emit('transitioning', false);
}

async function finishWindowedTransition(): Promise<void> {
  renderedMode.value = 'windowed';
  emit('presented', 'windowed');
  await nextTick();
  releaseLock();
  finishTransition();
}

watch(
  () => props.mode,
  (mode) => {
    if (transitionTimer) clearTimeout(transitionTimer);
    if (!initialized) {
      initialized = true;
      renderedMode.value = mode;
      if (mode === 'full-tab') acquireLock();
      return;
    }

    if (mode === 'full-tab') {
      const sourceRect = measuredWorkspace()?.getBoundingClientRect();
      if (sourceRect && usableRect(sourceRect)) {
        lastWindowedRect = sourceRect;
        lastWindowedViewport = viewportSize();
        enterTransform.value = inverseTransform(sourceRect);
      }
      emit('presented', 'full-tab');
      renderedMode.value = 'full-tab';
      acquireLock();
      if (prefersReducedMotion()) {
        finishTransition();
        return;
      }
      transitionPhase.value = 'entering';
      emit('transitioning', true);
      transitionTimer = setTimeout(finishTransition, 240);
      return;
    }

    if (prefersReducedMotion() || renderedMode.value !== 'full-tab') {
      void finishWindowedTransition();
      return;
    }
    const targetRect = currentWindowedTarget();
    if (targetRect) exitTransform.value = inverseTransform(targetRect);
    transitionPhase.value = 'leaving';
    emit('transitioning', true);
    transitionTimer = setTimeout(() => {
      void finishWindowedTransition();
    }, 180);
  },
  { immediate: true, flush: 'sync' },
);

onBeforeUnmount(() => {
  if (transitionTimer) clearTimeout(transitionTimer);
  releaseLock();
});
</script>

<template>
  <Teleport to="body" :disabled="renderedMode !== 'full-tab' && !portalWindowed">
    <div
      ref="shellElement"
      v-bind="$attrs"
      class="workspace-presentation-shell"
      :class="[
        `workspace-presentation-shell--${renderedMode}`,
        `workspace-presentation-shell--${transitionPhase}`,
      ]"
      :data-presentation-mode="mode"
      :data-transition-phase="transitionPhase"
      :aria-busy="transitionPhase !== 'idle'"
      :style="{
        '--workspace-flip-enter-transform': enterTransform,
        '--workspace-flip-exit-transform': exitTransform,
      }"
      data-testid="workspace-presentation-shell"
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.workspace-presentation-shell--windowed {
  display: contents;
}

.workspace-presentation-shell--full-tab {
  position: fixed;
  inset: 0;
  z-index: 1100;
  width: auto;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
    env(safe-area-inset-left);
  overflow: hidden;
  overscroll-behavior: none;
  border: 0;
  border-radius: 0;
  background: var(--surface-canvas);
  box-shadow: none;
  transform-origin: top left;
  animation: workspace-present-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.workspace-presentation-shell--leaving {
  animation: workspace-present-out 180ms cubic-bezier(0.4, 0, 0.8, 0.2) forwards;
}

@keyframes workspace-present-in {
  from {
    opacity: 0.82;
    transform: var(--workspace-flip-enter-transform, translateY(6px) scale(0.992));
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes workspace-present-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0.82;
    transform: var(--workspace-flip-exit-transform, translateY(6px) scale(0.992));
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-presentation-shell--full-tab {
    animation: none;
  }
  .workspace-presentation-shell--leaving {
    animation: none;
  }
}
</style>
