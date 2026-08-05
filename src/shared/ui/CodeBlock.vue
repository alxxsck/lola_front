<script setup lang="ts">
import hljs from "highlight.js/lib/core";
import jsonLanguage from "highlight.js/lib/languages/json";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";

hljs.registerLanguage("json", jsonLanguage);

const props = withDefaults(
  defineProps<{
    title: string;
    code: string;
    language?: string;
    collapsible?: boolean;
    collapsedLines?: number;
  }>(),
  {
    language: "JSON",
    collapsible: false,
    collapsedLines: 10,
  },
);

type CopyState = "idle" | "copied" | "error";

const copyState = ref<CopyState>("idle");
const expanded = ref(false);
const contentId = `code-block-${useId()}`;
const copyStatus = computed(() => {
  if (copyState.value === "copied") return "Скопировано";
  if (copyState.value === "error") return "Не удалось скопировать";
  return "";
});
const copyLabel = computed(() => {
  if (copyState.value === "copied") return "Скопировано";
  if (copyState.value === "error") return "Ошибка";
  return "Копировать";
});
const copyIcon = computed(() => {
  if (copyState.value === "copied") return "pi pi-check";
  if (copyState.value === "error") return "pi pi-times";
  return "pi pi-copy";
});
const isLong = computed(
  () =>
    props.collapsible && props.code.split("\n").length > props.collapsedLines,
);
const isCollapsed = computed(() => isLong.value && !expanded.value);
const collapsedStyle = computed(() => ({
  "--collapsed-lines": String(props.collapsedLines),
}));
const highlightedCode = computed(() =>
  props.language.toLowerCase() === "json"
    ? hljs.highlight(props.code, { language: "json" }).value
    : "",
);
let copyFeedbackTimer: number | undefined;

watch(
  () => props.code,
  () => {
    expanded.value = false;
  },
);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copyState.value = "copied";
  } catch {
    copyState.value = "error";
  }
  window.clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = window.setTimeout(() => {
    copyState.value = "idle";
  }, 1800);
}

onBeforeUnmount(() => window.clearTimeout(copyFeedbackTimer));
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
          <i :class="copyIcon" />
          {{ copyLabel }}
        </button>
        <span class="sr-only" role="status" aria-live="polite">{{
          copyStatus
        }}</span>
      </span>
    </figcaption>
    <pre
      :id="contentId"
      tabindex="0"
      :aria-label="title"
      :class="{ 'is-collapsed': isCollapsed }"
      :style="collapsedStyle"
      ><code
        v-if="highlightedCode"
        class="hljs"
        v-html="highlightedCode"
      ></code
      ><code v-else>{{ code }}</code></pre
    >
    <button
      v-if="isLong"
      class="code-disclosure"
      type="button"
      :aria-controls="contentId"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <i :class="expanded ? 'pi pi-angle-up' : 'pi pi-angle-down'" />
      {{ expanded ? "Свернуть" : "Показать полностью" }}
    </button>
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
.code-block pre.is-collapsed {
  max-height: calc(var(--collapsed-lines) * 1.254rem + 34px);
  overflow: hidden;
}
.code-block code {
  font: inherit;
}
.code-disclosure {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-top: 1px solid var(--border-on-emphasis);
  background: var(--surface-emphasis-raised);
  color: var(--text-on-emphasis);
  cursor: pointer;
  font-size: 0.66rem;
  font-weight: 700;
}
.code-disclosure:hover {
  background: var(--surface-emphasis-hover);
}
.code-block :deep(.hljs-attr) {
  color: var(--palette-blue-300);
}
.code-block :deep(.hljs-string) {
  color: var(--status-success-on-emphasis);
}
.code-block :deep(.hljs-literal) {
  color: var(--status-warning-on-emphasis);
}
.code-block :deep(.hljs-number) {
  color: var(--palette-sky-200);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
