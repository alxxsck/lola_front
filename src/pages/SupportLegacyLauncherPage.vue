<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";

const props = defineProps<{
  entryPoint: "CASES" | "USERS" | "LIVE";
  selectionKind?: "CASE" | "CONVERSATION" | "END_USER";
  selectionId?: string;
}>();

const route = useRoute();
const router = useRouter();

const entryLabel = computed(() => {
  if (props.entryPoint === "CASES") return "Обращения";
  if (props.entryPoint === "LIVE") return "Сейчас онлайн";
  return "Пользователи";
});

const selectionLabel = computed(() => {
  if (!props.selectionId) return "Список проекта";
  if (props.selectionKind === "CASE") return `Case · ${props.selectionId}`;
  if (props.selectionKind === "CONVERSATION")
    return `Диалог · ${props.selectionId}`;
  return `Пользователь · ${props.selectionId}`;
});

async function recheckWorkspace(): Promise<void> {
  const projectId =
    typeof route.query.projectId === "string"
      ? route.query.projectId
      : undefined;
  if (props.entryPoint === "CASES") {
    await router.replace({
      name: props.selectionId ? "support-inbox-case" : "support-inbox",
      ...(props.selectionId ? { params: { caseId: props.selectionId } } : {}),
      query: { ...(projectId ? { projectId } : {}), mode: "cases" },
    });
    return;
  }
  if (props.selectionKind === "CONVERSATION" && props.selectionId) {
    await router.replace({
      name: "support-inbox-conversation",
      params: { conversationId: props.selectionId },
      query: projectId ? { projectId } : {},
    });
    return;
  }
  await router.replace({
    name: "support-inbox",
    query: {
      ...(projectId ? { projectId } : {}),
      ...(props.selectionKind === "END_USER" && props.selectionId
        ? {
            endUserId: props.selectionId,
            entry: props.entryPoint === "LIVE" ? "live" : "users",
          }
        : {}),
    },
  });
}
</script>

<template>
  <main class="legacy-launcher" aria-labelledby="legacy-launcher-title">
    <section class="legacy-launcher__panel">
      <div class="legacy-launcher__status" aria-hidden="true">
        <i class="pi pi-pause-circle" />
      </div>
      <div class="legacy-launcher__copy">
        <span class="legacy-launcher__kicker">Безопасный режим</span>
        <h1 id="legacy-launcher-title">Support Workspace временно выключен</h1>
        <p>
          Сервер вернул этот Project в launcher-only режим. Рабочие действия
          здесь недоступны, поэтому ответ, заметка или изменение Case не могут
          быть отправлены из второй поверхности.
        </p>
      </div>

      <dl class="legacy-launcher__context" aria-label="Сохранённый контекст">
        <div>
          <dt>Точка входа</dt>
          <dd>{{ entryLabel }}</dd>
        </div>
        <div>
          <dt>Сохранённый объект</dt>
          <dd>{{ selectionLabel }}</dd>
        </div>
      </dl>

      <div class="legacy-launcher__actions">
        <Button
          label="Проверить доступ снова"
          icon="pi pi-refresh"
          @click="recheckWorkspace"
        />
        <RouterLink class="legacy-launcher__overview" to="/overview">
          Вернуться к обзору
        </RouterLink>
      </div>

      <p class="legacy-launcher__note">
        Уже принятые сервером команды не отменяются и не повторяются при
        переключении режима.
      </p>
    </section>
  </main>
</template>

<style scoped>
.legacy-launcher {
  display: grid;
  min-height: calc(100dvh - 96px);
  place-items: center;
  padding: 24px;
}

.legacy-launcher__panel {
  display: grid;
  width: min(680px, 100%);
  gap: 20px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}

.legacy-launcher__status {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 14px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 1.15rem;
}

.legacy-launcher__kicker {
  color: var(--status-warning-text);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.legacy-launcher h1 {
  margin: 8px 0 0;
  font-size: clamp(1.55rem, 4vw, 2.1rem);
}

.legacy-launcher__copy p,
.legacy-launcher__note {
  margin: 10px 0 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.legacy-launcher__context {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--line);
}

.legacy-launcher__context div {
  min-width: 0;
  padding: 14px 16px;
  background: var(--surface-subtle);
}

.legacy-launcher__context dt {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.legacy-launcher__context dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  font-weight: 750;
}

.legacy-launcher__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.legacy-launcher__actions :deep(.p-button),
.legacy-launcher__overview {
  min-height: 44px;
}

.legacy-launcher__overview {
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  color: var(--text-link);
  font-weight: 700;
}

.legacy-launcher__note {
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 0.72rem;
}

@media (max-width: 640px) {
  .legacy-launcher {
    min-height: calc(100dvh - 64px);
    padding: 16px;
  }

  .legacy-launcher__panel {
    gap: 16px;
    padding: 20px;
  }

  .legacy-launcher__context {
    grid-template-columns: 1fr;
  }

  .legacy-launcher__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .legacy-launcher__actions :deep(.p-button),
  .legacy-launcher__overview {
    justify-content: center;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .legacy-launcher *,
  .legacy-launcher *::before,
  .legacy-launcher *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
