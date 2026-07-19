<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    code: string;
    language?: string;
  }>(),
  { language: "JSON" },
);

const copied = ref(false);

async function copy() {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1800);
}
</script>

<template>
  <figure class="code-block">
    <figcaption>
      <span><i class="pi pi-code" />{{ title }}</span>
      <span class="code-actions">
        <small>{{ language }}</small>
        <button
          type="button"
          :aria-label="`Скопировать: ${title}`"
          @click="copy"
        >
          <i :class="copied ? 'pi pi-check' : 'pi pi-copy'" />
          {{ copied ? "Скопировано" : "Копировать" }}
        </button>
      </span>
    </figcaption>
    <pre tabindex="0" :aria-label="title"><code>{{ code }}</code></pre>
  </figure>
</template>

<style scoped>
.code-block {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--border-on-emphasis);
  border-radius: 16px;
  background: var(--surface-emphasis);
  box-shadow: var(--shadow-raised);
}
.code-block figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--border-on-emphasis);
  color: var(--text-on-emphasis-muted);
  font-size: 0.68rem;
  font-weight: 700;
}
.code-block figcaption > span:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}
.code-block figcaption i {
  color: var(--accent);
}
.code-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.code-actions small {
  color: var(--text-on-emphasis-muted);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.code-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-on-emphasis);
  border-radius: 9px;
  background: var(--surface-emphasis-raised);
  color: var(--text-on-emphasis);
  cursor: pointer;
  font-size: 0.64rem;
  font-weight: 700;
}
.code-block pre {
  max-height: 390px;
  margin: 0;
  padding: 17px 18px;
  overflow: auto;
  color: var(--text-on-emphasis);
  font:
    500 0.76rem/1.65 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  tab-size: 2;
}
.code-block code {
  font: inherit;
}
@media (max-width: 620px) {
  .code-block {
    border-radius: 12px;
  }
  .code-actions small {
    display: none;
  }
  .code-actions button {
    padding: 0 8px;
  }
  .code-block pre {
    padding: 14px;
    font-size: 0.68rem;
  }
}
</style>
