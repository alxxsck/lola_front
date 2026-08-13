<script setup lang="ts">
import { ref, watch } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

const props = defineProps<{
  label: string;
  value: string;
  to?: RouteLocationRaw;
}>();

const copyState = ref<'idle' | 'success' | 'error'>('idle');

watch(
  () => props.value,
  () => {
    copyState.value = 'idle';
  },
);

async function copyIdentifier(): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(props.value);
    copyState.value = 'success';
  } catch {
    copyState.value = 'error';
  }
}
</script>

<template>
  <div class="technical-identifier">
    <span class="identifier-label">{{ label }}</span>
    <div class="identifier-value">
      <RouterLink v-if="to" :to="to" class="identifier-link">
        <code>{{ value }}</code>
        <i class="pi pi-arrow-up-right" />
      </RouterLink>
      <code v-else>{{ value }}</code>
      <button
        type="button"
        class="copy-identifier"
        :class="{ copied: copyState === 'success' }"
        :aria-label="copyState === 'success' ? `${label} скопирован` : `Скопировать ${label}`"
        :title="copyState === 'success' ? 'Скопировано' : 'Копировать ID'"
        @click.stop="copyIdentifier"
      >
        <i :class="copyState === 'success' ? 'pi pi-check' : 'pi pi-copy'" />
      </button>
    </div>
    <small v-if="copyState !== 'idle'" aria-live="polite">
      {{ copyState === 'success' ? 'Скопировано' : 'Не удалось скопировать' }}
    </small>
  </div>
</template>

<style scoped>
.technical-identifier {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.identifier-label {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1rem;
}
.identifier-value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}
code,
.identifier-link {
  min-width: 0;
}
code {
  display: block;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font:
    500 0.78rem/1.15rem ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.identifier-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-link);
  text-decoration: none;
}
.identifier-link i {
  flex: 0 0 auto;
  font-size: 0.72rem;
}
.copy-identifier {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  color: var(--text-secondary);
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.copy-identifier:hover,
.copy-identifier:focus-visible,
.copy-identifier.copied {
  color: var(--text-link);
  border-color: color-mix(in srgb, var(--action-primary) 42%, var(--line));
}
small {
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1rem;
}
</style>
