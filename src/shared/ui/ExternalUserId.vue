<script setup lang="ts">
import { getCurrentInstance, ref, watch } from 'vue';
import type { ToastMessageOptions } from 'primevue/toast';

const props = defineProps<{
  value: string;
  href?: string;
  iconOnly?: boolean;
}>();

const copied = ref(false);
const instance = getCurrentInstance();

function notify(message: ToastMessageOptions): void {
  instance?.proxy?.$toast?.add(message);
}

watch(
  () => props.value,
  () => {
    copied.value = false;
  },
);

async function copy(): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(props.value);
    copied.value = true;
    notify({
      severity: 'success',
      summary: 'Внешний ID скопирован',
      detail: props.value,
      life: 2200,
    });
  } catch {
    notify({
      severity: 'error',
      summary: 'Не удалось скопировать внешний ID',
      life: 3000,
    });
  }
}
</script>

<template>
  <span class="external-user-id">
    <a v-if="!iconOnly && href" :href="href" class="external-user-id__value" @click.stop>{{
      value
    }}</a>
    <span v-else-if="!iconOnly" class="external-user-id__value">{{ value }}</span>
    <button
      type="button"
      class="external-user-id__copy"
      :class="{ copied }"
      :aria-label="`Скопировать внешний ID пользователя ${value}`"
      :title="copied ? 'Скопировано' : 'Копировать внешний ID'"
      @click.stop="copy"
    >
      <i :class="copied ? 'pi pi-check' : 'pi pi-copy'" aria-hidden="true" />
    </button>
  </span>
</template>

<style scoped>
.external-user-id {
  position: relative;
  z-index: 1;
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
}
.external-user-id__value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-decoration: none;
}
.external-user-id__copy {
  position: relative;
  display: inline-grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    background 140ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.external-user-id__copy::before {
  position: absolute;
  inset: -4px;
  content: '';
}
.external-user-id__copy:hover,
.external-user-id__copy:focus-visible {
  border-color: var(--line);
  background: var(--surface-subtle);
  color: var(--text-link);
}
.external-user-id__copy:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--action-primary) 38%, transparent);
  outline-offset: 1px;
}
.external-user-id__copy:active {
  transform: scale(0.97);
}
.external-user-id__copy.copied {
  color: var(--status-success-text);
}
.external-user-id__copy i {
  font-size: 0.78rem;
}
@media (prefers-reduced-motion: reduce) {
  .external-user-id__copy {
    transition: color 140ms ease-out;
  }
}
</style>
