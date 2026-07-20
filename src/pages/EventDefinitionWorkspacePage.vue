<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/features/auth/auth.store";
import {
  applyEventMetadataUpdate,
  eventCatalogRepository,
  type EventCatalogDefinition,
} from "@/shared/api/repository/event-catalog";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const definition = ref<EventCatalogDefinition | null>(null);
const name = ref("");
const description = ref("");
const loading = ref(true);
const saving = ref(false);
const loadError = ref("");
const saveError = ref("");
const success = ref("");

const definitionKeyId = computed(() =>
  String(route.params.definitionKeyId ?? ""),
);
const canEdit = computed(
  () =>
    (auth.user?.role === "OWNER" || auth.user?.role === "ADMIN") &&
    !definition.value?.readOnly,
);
const hasMetadataConcurrencyToken = computed(() =>
  Boolean(definition.value?.metadata.concurrencyToken),
);
const isDirty = computed(
  () =>
    Boolean(definition.value) &&
    (name.value !== definition.value?.metadata.name ||
      description.value !== (definition.value?.metadata.description ?? "")),
);

onMounted(loadDefinition);

async function loadDefinition() {
  const projectId = auth.project?.id;
  if (!projectId || !definitionKeyId.value) return;
  loading.value = true;
  loadError.value = "";
  try {
    const loaded = await eventCatalogRepository.getDefinition(
      projectId,
      definitionKeyId.value,
    );
    definition.value = loaded;
    name.value = loaded.metadata.name;
    description.value = loaded.metadata.description ?? "";
  } catch (cause) {
    loadError.value = errorMessage(
      cause,
      "Не удалось загрузить Event Definition",
    );
  } finally {
    loading.value = false;
  }
}

async function saveMetadata() {
  const projectId = auth.project?.id;
  const current = definition.value;
  const nextName = name.value.trim();
  if (!projectId || !current || !canEdit.value || saving.value) return;
  saveError.value = "";
  success.value = "";
  if (!nextName) {
    saveError.value = "Укажите название Event Definition.";
    return;
  }
  if (!current.metadata.concurrencyToken) {
    saveError.value =
      "Backend contract не отдаёт metadata concurrency token. Сохранение безопасно недоступно.";
    return;
  }

  saving.value = true;
  try {
    const result = await eventCatalogRepository.updateMetadata(
      projectId,
      current.definitionKeyId,
      {
        name: nextName,
        description: description.value.trim() || null,
        expectedUpdatedAt: current.metadata.concurrencyToken,
      },
    );
    if (!result.schemaRevisionUnchanged) {
      throw new Error(
        "Invalid backend response: metadata mutation changed the schema revision",
      );
    }
    const applied = applyEventMetadataUpdate(
      definition.value ?? current,
      result,
    );
    definition.value = applied;
    name.value = applied.metadata.name;
    description.value = applied.metadata.description ?? "";
    success.value = "Сохранено. Ревизия схемы не изменилась.";
  } catch (cause) {
    saveError.value = errorMessage(cause, "Не удалось сохранить Overview");
  } finally {
    saving.value = false;
  }
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
</script>

<template>
  <section class="page event-workspace">
    <button
      class="back-link"
      type="button"
      @click="router.push({ name: 'events' })"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" /> К каталогу событий
    </button>

    <div v-if="loading" class="workspace-loading" aria-live="polite">
      Загружаем Event Definition…
    </div>

    <div v-else-if="loadError" class="workspace-error card" role="alert">
      <strong>Workspace недоступен</strong>
      <span>{{ loadError }}</span>
      <button type="button" class="secondary-button" @click="loadDefinition">
        Повторить
      </button>
    </div>

    <template v-else-if="definition">
      <header class="workspace-header">
        <div>
          <div class="eyebrow">Event Definition</div>
          <h1>{{ definition.metadata.name }}</h1>
          <div class="identity-line">
            <code data-test="event-code">{{ definition.code }}</code>
            <span data-test="schema-revision"
              >Схема v{{ definition.currentSchema.revisionNumber }}</span
            >
          </div>
        </div>
        <span v-if="definition.readOnly" class="read-only-badge"
          ><i class="pi pi-lock" /> Только чтение</span
        >
      </header>

      <aside class="producer-contract card" data-test="producer-contract-hint">
        <i class="pi pi-send" aria-hidden="true" />
        <div>
          <strong>Контракт интеграции остаётся стабильным</strong>
          <p>
            Product backend отправляет <code>eventCode + payload</code>. Номер
            ревизии передавать не нужно: это внутренняя метаинформация Lola.
          </p>
        </div>
      </aside>

      <nav
        class="workspace-navigation card"
        aria-label="Разделы Event Definition"
      >
        <span class="active" aria-current="page"
          ><i class="pi pi-info-circle" /> Overview</span
        >
        <span><i class="pi pi-shield" /> Ingestion Policy</span>
        <span><i class="pi pi-code" /> Schema Revisions</span>
        <span><i class="pi pi-chart-bar" /> Usage / Health</span>
      </nav>

      <main class="overview-layout">
        <form class="overview-form card" @submit.prevent="saveMetadata">
          <div class="section-heading">
            <div>
              <span>Display metadata</span>
              <h2>Overview</h2>
              <p>
                Название и описание помогают людям понимать событие и не
                изменяют payload schema.
              </p>
            </div>
            <span class="schema-safe-label"
              ><i class="pi pi-check-circle" /> Без новой schema revision</span
            >
          </div>

          <label class="field" for="event-overview-name">
            <span>Название</span>
            <input
              id="event-overview-name"
              v-model="name"
              maxlength="120"
              :readonly="!canEdit || !hasMetadataConcurrencyToken"
              :aria-invalid="Boolean(saveError && !name.trim())"
            />
          </label>

          <label class="field" for="event-overview-description">
            <span>Описание <small>необязательно</small></span>
            <textarea
              id="event-overview-description"
              v-model="description"
              rows="5"
              maxlength="2000"
              :readonly="!canEdit || !hasMetadataConcurrencyToken"
              placeholder="Когда происходит событие и что оно означает"
            />
          </label>

          <div class="stable-identity">
            <div>
              <span>Stable event code</span>
              <code>{{ definition.code }}</code>
            </div>
            <p>
              Не изменяется после создания и остаётся идентичностью producer
              contract.
            </p>
          </div>

          <p v-if="saveError" class="inline-message error" role="alert">
            {{ saveError }}
          </p>
          <p
            v-else-if="canEdit && !hasMetadataConcurrencyToken"
            class="inline-message error"
            role="alert"
          >
            Backend contract не отдаёт metadata concurrency token. Overview
            доступен только для чтения до обновления контракта.
          </p>
          <p v-if="success" class="inline-message success" role="status">
            {{ success }}
          </p>

          <footer v-if="canEdit" class="form-actions">
            <span v-if="isDirty">Есть несохранённые изменения</span>
            <button
              class="primary-button"
              type="submit"
              :disabled="!isDirty || saving || !hasMetadataConcurrencyToken"
            >
              {{ saving ? "Сохраняем…" : "Сохранить Overview" }}
            </button>
          </footer>
          <p v-else class="read-only-note">
            У вас нет права изменять metadata этой Event Definition.
          </p>
        </form>

        <aside class="revision-card card">
          <span>Current published schema</span>
          <strong>v{{ definition.currentSchema.revisionNumber }}</strong>
          <code>{{ definition.currentSchema.revisionId }}</code>
          <p>
            Revision принадлежит Lola и доступна здесь только для аудита и
            диагностики.
          </p>
        </aside>
      </main>
    </template>
  </section>
</template>

<style scoped>
.event-workspace {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.back-link {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--text-link);
  cursor: pointer;
  font: 600 0.76rem Manrope;
  padding: 2px 0;
}
.back-link i {
  margin-right: 6px;
}
.workspace-loading {
  padding: 48px;
  text-align: center;
  color: var(--muted);
}
.workspace-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-direction: column;
  padding: 24px;
}
.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
}
.workspace-header > div {
  min-width: 0;
}
.workspace-header h1 {
  margin: 4px 0 9px;
  overflow-wrap: anywhere;
  font-size: clamp(2rem, 4vw, 4.2rem);
}
.identity-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.identity-line code,
.identity-line span {
  border-radius: 7px;
  background: var(--surface-subtle);
  padding: 5px 8px;
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.read-only-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  background: var(--surface-subtle);
  padding: 7px 10px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}
.producer-contract {
  display: flex;
  gap: 13px;
  min-width: 0;
  padding: 16px 18px;
  border-color: color-mix(
    in srgb,
    var(--status-violet) 35%,
    var(--border-default)
  );
  background: var(--status-violet-soft);
}
.producer-contract > i {
  color: var(--status-violet);
  font-size: 1.1rem;
}
.producer-contract strong {
  font-size: 0.8rem;
}
.producer-contract p {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: var(--status-violet-text);
  font-size: 0.75rem;
  line-height: 1.5;
}
.producer-contract code {
  font-weight: 700;
}
.workspace-navigation {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  min-width: 0;
}
.workspace-navigation span {
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 9px;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  min-width: 0;
  overflow-wrap: anywhere;
}
.workspace-navigation .active {
  background: var(--surface-active);
  color: var(--text-primary);
}
.overview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  align-items: start;
  gap: 16px;
  min-width: 0;
}
.overview-form {
  padding: 22px;
  min-width: 0;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}
.section-heading > div > span,
.revision-card > span {
  color: var(--status-violet);
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.section-heading h2 {
  margin: 3px 0 5px;
  font-size: 1.15rem;
}
.section-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.45;
}
.schema-safe-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--status-success-soft);
  padding: 7px 9px;
  color: var(--status-success-text);
  font-size: 0.68rem;
  font-weight: 700;
}
.field {
  display: grid;
  gap: 7px;
  margin-top: 15px;
}
.field > span {
  font-size: 0.75rem;
  font-weight: 700;
}
.field small {
  color: var(--text-secondary);
  font-weight: 500;
}
.field input,
.field textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  padding: 10px 12px;
}
.field textarea {
  resize: vertical;
  line-height: 1.5;
}
.field input:focus,
.field textarea:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.field input[readonly],
.field textarea[readonly] {
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
.stable-identity {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 1.5fr;
  align-items: center;
  gap: 18px;
  margin-top: 18px;
  padding: 13px 14px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
.stable-identity span,
.stable-identity code {
  display: block;
}
.stable-identity span {
  margin-bottom: 4px;
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.stable-identity code {
  font-size: 0.76rem;
  font-weight: 700;
}
.stable-identity p {
  margin: 0;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.45;
}
.inline-message {
  margin: 15px 0 0;
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 0.75rem;
}
.inline-message.error {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.inline-message.success {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}
.form-actions span {
  color: var(--text-secondary);
  font-size: 0.7rem;
}
.primary-button,
.secondary-button {
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font: 700 0.74rem Manrope;
  padding: 10px 14px;
}
.primary-button {
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.secondary-button {
  background: var(--surface-active);
  color: var(--text-primary);
}
.read-only-note {
  margin: 18px 0 0;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.revision-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 19px;
}
.revision-card strong {
  font: 800 2.3rem Manrope;
}
.revision-card code {
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 0.67rem;
}
.revision-card p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.5;
}
@media (max-width: 900px) {
  .overview-layout {
    grid-template-columns: 1fr;
  }
  .revision-card {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
  }
  .revision-card > span,
  .revision-card p {
    grid-column: 1/-1;
  }
  .revision-card strong {
    font-size: 1.6rem;
  }
  .workspace-navigation {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 620px) {
  .workspace-header,
  .section-heading {
    flex-direction: column;
  }
  .workspace-navigation {
    display: flex;
    overflow-x: auto;
  }
  .workspace-navigation span {
    min-width: max-content;
  }
  .overview-form {
    padding: 16px;
  }
  .schema-safe-label {
    align-self: flex-start;
  }
  .stable-identity {
    grid-template-columns: 1fr;
  }
  .form-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .primary-button {
    width: 100%;
  }
}
</style>
