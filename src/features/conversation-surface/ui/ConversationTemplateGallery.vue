<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import type { ConversationReplyTemplate } from "../model/conversation-reply-templates";

const props = defineProps<{
  visible: boolean;
  templates: readonly ConversationReplyTemplate[];
}>();

const emit = defineEmits<{
  close: [];
  select: [template: ConversationReplyTemplate];
}>();

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("close");
}

function releaseModalState(): void {
  document.body.classList.remove("conversation-template-gallery-open");
  window.removeEventListener("keydown", handleKeydown);
}

watch(
  () => props.visible,
  (visible) => {
    releaseModalState();
    if (!visible) return;
    document.body.classList.add("conversation-template-gallery-open");
    window.addEventListener("keydown", handleKeydown);
  },
  { immediate: true },
);

onBeforeUnmount(releaseModalState);
</script>

<template>
  <div
    v-if="visible"
    class="template-gallery-backdrop"
    @click.self="emit('close')"
  >
    <section
      class="template-gallery"
      data-testid="reply-template-gallery"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reply-template-gallery-title"
    >
      <header>
        <div>
          <span>Быстрые ответы</span>
          <h3 id="reply-template-gallery-title">Галерея шаблонов</h3>
        </div>
        <button
          type="button"
          aria-label="Закрыть галерею шаблонов"
          @click="emit('close')"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </header>
      <div class="template-gallery__grid">
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          @click="emit('select', template)"
        >
          <span>{{ template.label }}</span>
          <strong>{{ template.text }}</strong>
          <small>{{ template.description }}</small>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.template-gallery-backdrop {
  position: fixed;
  z-index: 35;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--overlay-backdrop);
}

:global(body.conversation-template-gallery-open) {
  overflow: hidden;
}

.template-gallery {
  width: min(680px, 100%);
  max-height: min(620px, calc(100dvh - 80px));
  overflow-y: auto;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
  box-shadow: var(--shadow-dialog);
}

.template-gallery > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.template-gallery > header span {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.template-gallery > header h3 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 18px;
}

.template-gallery > header button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.template-gallery__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.template-gallery__grid > button {
  display: grid;
  min-height: 126px;
  align-content: start;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 13px;
  background: var(--surface-subtle);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.template-gallery__grid > button:hover,
.template-gallery__grid > button:focus-visible {
  border-color: var(--palette-blue-200);
  background: var(--status-accent-soft);
  outline: none;
  transform: translateY(-1px);
}

.template-gallery__grid span,
.template-gallery__grid small {
  color: var(--text-tertiary);
  font-size: 11px;
}

.template-gallery__grid span {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-weight: 700;
}

.template-gallery__grid strong {
  font-size: 13px;
  line-height: 1.45;
}

@media (max-width: 640px) {
  .template-gallery-backdrop {
    place-items: end stretch;
    padding: 0;
  }

  .template-gallery {
    width: 100%;
    max-height: 78dvh;
    padding: 16px;
    border-radius: 20px 20px 0 0;
  }

  .template-gallery__grid {
    grid-template-columns: 1fr;
  }

  .template-gallery__grid > button {
    min-height: 96px;
  }
}
</style>
