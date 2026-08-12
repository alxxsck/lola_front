<script setup lang="ts">
defineProps<{
  loading: boolean;
}>();
</script>

<template>
  <div class="page-loading-swap" :aria-busy="loading">
    <Transition name="page-content-swap">
      <div v-if="loading" key="loading" class="page-loading-swap__layer">
        <slot name="loading" />
      </div>
      <div v-else key="content" class="page-loading-swap__layer">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-loading-swap {
  display: grid;
  min-width: 0;
  min-height: calc(100vh - 180px);
}
.page-loading-swap__layer {
  grid-area: 1 / 1;
  min-width: 0;
}
.page-content-swap-enter-active,
.page-content-swap-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.page-content-swap-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.page-content-swap-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
@media (prefers-reduced-motion: reduce) {
  .page-content-swap-enter-active,
  .page-content-swap-leave-active {
    transition: opacity 120ms linear;
  }
  .page-content-swap-enter-from,
  .page-content-swap-leave-to {
    transform: none;
  }
}
</style>
