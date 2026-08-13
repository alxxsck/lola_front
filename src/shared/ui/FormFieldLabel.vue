<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId } from 'vue';

defineProps<{
  text: string;
  help: string;
}>();

const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 7;

const helpTrigger = ref<HTMLElement | null>(null);
const tooltip = ref<HTMLElement | null>(null);
const tooltipId = `field-help-${useId()}`;
const tooltipVisible = ref(false);
const tooltipPosition = ref<{ left: number; top: number; placement: 'top' | 'bottom' } | null>(
  null,
);

function updateTooltipPosition(): void {
  if (!helpTrigger.value || !tooltip.value) return;

  const triggerRect = helpTrigger.value.getBoundingClientRect();
  const tooltipRect = tooltip.value.getBoundingClientRect();
  const availableAbove = triggerRect.top - VIEWPORT_PADDING;
  const availableBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING;
  const fitsAbove = availableAbove >= tooltipRect.height + TOOLTIP_GAP;
  const fitsBelow = availableBelow >= tooltipRect.height + TOOLTIP_GAP;
  const placement = fitsAbove || (!fitsBelow && availableAbove >= availableBelow) ? 'top' : 'bottom';
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - tooltipRect.width - VIEWPORT_PADDING);
  const left = Math.min(
    Math.max(
      VIEWPORT_PADDING,
      triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
    ),
    maxLeft,
  );
  const requestedTop =
    placement === 'top'
      ? triggerRect.top - tooltipRect.height - TOOLTIP_GAP
      : triggerRect.bottom + TOOLTIP_GAP;
  const maxTop = Math.max(
    VIEWPORT_PADDING,
    window.innerHeight - tooltipRect.height - VIEWPORT_PADDING,
  );

  tooltipPosition.value = {
    left,
    top: Math.min(Math.max(VIEWPORT_PADDING, requestedTop), maxTop),
    placement,
  };
}

function bindPositionListeners(): void {
  window.addEventListener('resize', updateTooltipPosition);
  window.addEventListener('scroll', updateTooltipPosition, true);
}

function unbindPositionListeners(): void {
  window.removeEventListener('resize', updateTooltipPosition);
  window.removeEventListener('scroll', updateTooltipPosition, true);
}

async function showTooltip(): Promise<void> {
  if (tooltipVisible.value) {
    updateTooltipPosition();
    return;
  }

  tooltipVisible.value = true;
  bindPositionListeners();
  await nextTick();

  if (tooltipVisible.value) updateTooltipPosition();
}

function hideTooltip(): void {
  tooltipVisible.value = false;
  tooltipPosition.value = null;
  unbindPositionListeners();
}

onBeforeUnmount(unbindPositionListeners);
</script>

<template>
  <span class="field-label">
    <span>{{ text }}</span>
    <span
      ref="helpTrigger"
      class="field-label__help"
      data-testid="field-help"
      :aria-label="`${text}. ${help}`"
      :aria-describedby="tooltipVisible ? tooltipId : undefined"
      tabindex="0"
      role="note"
      @mouseenter="showTooltip"
      @mouseleave="hideTooltip"
      @focus="showTooltip"
      @blur="hideTooltip"
      @keydown.esc.stop="hideTooltip"
    >
      <i class="pi pi-info-circle" aria-hidden="true" />
    </span>
  </span>

  <Teleport to="body">
    <Transition name="field-label-tooltip">
      <span
        v-if="tooltipVisible"
        :id="tooltipId"
        ref="tooltip"
        class="field-label-tooltip"
        :data-placement="tooltipPosition?.placement"
        :style="{
          left: `${tooltipPosition?.left ?? 0}px`,
          top: `${tooltipPosition?.top ?? 0}px`,
          visibility: tooltipPosition ? 'visible' : 'hidden',
        }"
        role="tooltip"
      >
        {{ help }}
      </span>
    </Transition>
  </Teleport>
</template>

<style scoped>
.field-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  color: var(--text-primary);
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.25;
}
.field-label__help {
  position: static;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: -2px;
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: help;
  outline: none;
}
.field-label__help i {
  font-size: 0.78rem;
}
.field-label-tooltip {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  width: min(280px, 70vw);
  padding: 9px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
  color: var(--text-primary);
  font-size: 0.76rem;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  white-space: normal;
  pointer-events: none;
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.field-label__help:hover,
.field-label__help:focus-visible {
  color: var(--action-primary);
  background: var(--surface-subtle);
}
.field-label-tooltip-enter-from,
.field-label-tooltip-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
  .field-label-tooltip {
    transition: none;
  }
}
</style>
