<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import {
  parseEventSchema,
  serializeEventSchema,
  validateEventSchemaDraft,
  type EventSchemaDraft as EventSchemaEditorDraft,
  type EventSchemaDraftIssue,
} from "@/features/event-schema/model/event-schema";
import EventPayloadStudio from "@/features/event-schema/ui/EventPayloadStudio.vue";
import { ApiError } from "@/shared/api/http/api-error";
import {
  eventCatalogRepository,
  type EventCatalogDefinition,
  type EventSchemaDraft,
  type EventSchemaImpact,
  type EventSchemaPublishResult,
} from "@/shared/api/repository/event-catalog";

const props = defineProps<{
  projectId: string;
  event: EventCatalogDefinition;
  canEdit: boolean;
  canPublish: boolean;
}>();

const emit = defineEmits<{
  published: [result: EventSchemaPublishResult];
  publicationUncertain: [observedRevisionNumber: number];
  created: [definition: EventCatalogDefinition];
}>();

const draft = ref<EventSchemaDraft | null>(null);
const impact = ref<EventSchemaImpact | null>(null);
const editorDraft = ref<EventSchemaEditorDraft>(parseEventSchema({}));
const editorIssues = ref<EventSchemaDraftIssue[]>([]);
const technicalDraftDirty = ref(false);
const conflictChecked = ref(false);
const conflictDraft = ref<EventSchemaDraft | null>(null);
const serverSchemaText = ref("");
const loading = ref(true);
const pendingAction = ref<
  "save" | "analyze" | "publish" | "discard" | "create" | null
>(null);
const error = ref("");
const success = ref("");
const publishReason = ref("");
const confirmBreakingChange = ref(false);
const producerMigrationConfirmed = ref(false);
const lastPublishResult = ref<EventSchemaPublishResult | null>(null);
const confirmingDiscard = ref(false);
const discardReason = ref("");
const newEventName = ref(`${props.event.metadata.name} — новое событие`);
const newEventCode = ref("");
let requestGeneration = 0;

const serializedEditorSchema = computed(() =>
  serializeEventSchema(editorDraft.value),
);
const isDirty = computed(
  () =>
    JSON.stringify(serializedEditorSchema.value) !== serverSchemaText.value ||
    technicalDraftDirty.value,
);
const isReadOnly = computed(
  () =>
    !props.canEdit ||
    props.event.readOnly ||
    props.event.lifecycle === "ARCHIVED",
);
const nextRevisionNumber = computed(
  () => props.event.currentSchema.revisionNumber + 1,
);
const classification = computed(
  () => impact.value?.compatibility.classification,
);
const blockingCount = computed(
  () =>
    (impact.value?.impact.summary.blockingConsumerCount ?? 0) +
    (impact.value?.impact.summary.blockingActiveWaitCount ?? 0),
);
const requiresBreakingConfirmation = computed(() =>
  Boolean(
    classification.value && classification.value !== "FULL_TRANSITIVE_SAFE",
  ),
);
const requiresProducerConfirmation = computed(
  () => impact.value?.compatibility.producerCompatibility === "BREAKING",
);
const semanticBreak = computed(
  () => classification.value === "SEMANTIC_BREAKING",
);
const publishDisabled = computed(
  () =>
    isReadOnly.value ||
    !props.canPublish ||
    pendingAction.value !== null ||
    !draft.value ||
    !impact.value ||
    isDirty.value ||
    !publishReason.value.trim() ||
    blockingCount.value > 0 ||
    semanticBreak.value ||
    (requiresBreakingConfirmation.value && !confirmBreakingChange.value) ||
    (requiresProducerConfirmation.value && !producerMigrationConfirmed.value),
);

onMounted(loadDraft);
watch(
  () => [
    props.projectId,
    props.event.definitionKeyId,
    props.event.currentSchema.revisionId,
  ],
  () => void loadDraft(),
);

async function loadDraft() {
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = "";
  success.value = "";
  impact.value = null;
  conflictChecked.value = false;
  conflictDraft.value = null;
  confirmingDiscard.value = false;
  try {
    const loaded = await eventCatalogRepository.getSchemaDraft(
      props.projectId,
      props.event.definitionKeyId,
    );
    if (generation !== requestGeneration) return;
    draft.value = loaded;
    setServerSchema(
      loaded?.payloadSchema ?? props.event.currentSchema.payloadSchema,
    );
  } catch (cause) {
    if (generation !== requestGeneration) return;
    error.value = errorMessage(cause, "Не удалось загрузить черновик схемы");
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function setServerSchema(value: Record<string, unknown>) {
  editorDraft.value = parseEventSchema(value);
  editorIssues.value = [];
  technicalDraftDirty.value = false;
  serverSchemaText.value = JSON.stringify(value);
}

function parseSchema(): Record<string, unknown> | null {
  if (technicalDraftDirty.value) {
    error.value =
      "Сначала примените или отмените изменения в расширенном JSON-режиме.";
    return null;
  }
  editorIssues.value = validateEventSchemaDraft(editorDraft.value);
  if (editorIssues.value.length) {
    error.value = "Исправьте отмеченные поля перед сохранением черновика.";
    return null;
  }
  return serializedEditorSchema.value;
}

async function saveDraft() {
  if (isReadOnly.value || pendingAction.value) return;
  error.value = "";
  success.value = "";
  const payloadSchema = parseSchema();
  if (!payloadSchema) return;
  pendingAction.value = "save";
  try {
    const saved = await eventCatalogRepository.saveSchemaDraft(
      props.projectId,
      props.event.definitionKeyId,
      {
        payloadSchema,
        ...(draft.value
          ? { expectedDraftVersion: draft.value.draftVersion }
          : {}),
      },
    );
    draft.value = saved;
    lastPublishResult.value = null;
    impact.value = null;
    confirmBreakingChange.value = false;
    producerMigrationConfirmed.value = false;
    setServerSchema(saved.payloadSchema);
    success.value = saved.changed
      ? `Черновик v${saved.draftVersion} сохранён. Опубликованная версия не изменилась.`
      : "Изменений в черновике нет.";
    clearConflict();
  } catch (cause) {
    error.value = errorMessage(cause, "Не удалось сохранить черновик");
    await recoverMutationFailure(cause);
  } finally {
    pendingAction.value = null;
  }
}

async function analyzeDraft() {
  if (!draft.value || isDirty.value || pendingAction.value) return;
  error.value = "";
  success.value = "";
  pendingAction.value = "analyze";
  try {
    impact.value = await eventCatalogRepository.analyzeSchemaDraft(
      props.projectId,
      props.event.definitionKeyId,
      { expectedDraftVersion: draft.value.draftVersion },
    );
    confirmBreakingChange.value = false;
    producerMigrationConfirmed.value = false;
  } catch (cause) {
    error.value = errorMessage(cause, "Не удалось проверить влияние схемы");
    await recoverMutationFailure(cause);
  } finally {
    pendingAction.value = null;
  }
}

async function publishDraft() {
  const currentDraft = draft.value;
  const currentImpact = impact.value;
  if (!currentDraft || !currentImpact || publishDisabled.value) return;
  error.value = "";
  success.value = "";
  pendingAction.value = "publish";
  try {
    const result = await eventCatalogRepository.publishSchemaDraft(
      props.projectId,
      props.event.definitionKeyId,
      {
        expectedDraftVersion: currentDraft.draftVersion,
        expectedBaseRevisionId: currentDraft.baseRevisionId,
        reason: publishReason.value.trim(),
        ...(requiresBreakingConfirmation.value
          ? { confirmBreakingChange: true }
          : {}),
        ...(requiresProducerConfirmation.value
          ? { producerMigrationConfirmed: true }
          : {}),
      },
    );
    acceptPublishResult(result);
  } catch (cause) {
    const observedRevisionNumber = await inspectAmbiguousPublish(
      cause,
      currentDraft,
    );
    if (observedRevisionNumber !== null) {
      draft.value = null;
      impact.value = null;
      lastPublishResult.value = null;
      error.value = `Текущая схема уже v${observedRevisionNumber} и совпадает с отправленным черновиком, но ответ publish потерян. Нельзя надёжно установить автора операции: проверьте историю и audit log перед повтором.`;
      emit("publicationUncertain", observedRevisionNumber);
    } else {
      error.value = errorMessage(cause, "Не удалось опубликовать новую версию");
      await recoverMutationFailure(cause);
    }
  } finally {
    pendingAction.value = null;
  }
}

function acceptPublishResult(result: EventSchemaPublishResult) {
  draft.value = null;
  impact.value = null;
  publishReason.value = "";
  lastPublishResult.value = result;
  success.value = `Опубликована версия ${result.revisionNumber}.`;
  emit("published", result);
}

async function inspectAmbiguousPublish(
  cause: unknown,
  currentDraft: EventSchemaDraft,
): Promise<number | null> {
  if (cause instanceof ApiError && cause.status > 0 && cause.status < 500) {
    return null;
  }
  try {
    const current = await eventCatalogRepository.getDefinition(
      props.projectId,
      props.event.definitionKeyId,
    );
    if (
      current.currentSchema.revisionId === currentDraft.baseRevisionId ||
      current.currentSchema.revisionNumber !==
        props.event.currentSchema.revisionNumber + 1 ||
      canonicalJson(current.currentSchema.payloadSchema) !==
        canonicalJson(currentDraft.payloadSchema)
    ) {
      return null;
    }
    return current.currentSchema.revisionNumber;
  } catch {
    return null;
  }
}

function remainingPublishWarnings(result: EventSchemaPublishResult): number {
  return Math.max(
    0,
    result.impact.summary.consumerCount -
      result.automaticallyExtendedBindings +
      result.impact.summary.activeWaitCount -
      result.automaticallyExtendedWaits,
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object")
    return JSON.stringify(value) ?? "undefined";
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    .join(",")}}`;
}

async function discardDraft() {
  const currentDraft = draft.value;
  const reason = discardReason.value.trim();
  if (!currentDraft || !reason || pendingAction.value) return;
  error.value = "";
  success.value = "";
  pendingAction.value = "discard";
  try {
    await eventCatalogRepository.discardSchemaDraft(
      props.projectId,
      props.event.definitionKeyId,
      { expectedDraftVersion: currentDraft.draftVersion, reason },
    );
    draft.value = null;
    impact.value = null;
    confirmingDiscard.value = false;
    discardReason.value = "";
    setServerSchema(props.event.currentSchema.payloadSchema);
    success.value = "Черновик удалён. Опубликованная версия не изменилась.";
  } catch (cause) {
    error.value = errorMessage(cause, "Не удалось удалить черновик");
    await recoverMutationFailure(cause);
  } finally {
    pendingAction.value = null;
  }
}

async function recoverMutationFailure(cause: unknown) {
  if (!(cause instanceof ApiError) || cause.status !== 409) return;
  if (cause.code !== "EVENT_SCHEMA_DRAFT_STALE") {
    recoverImpact(cause);
    return;
  }
  try {
    conflictDraft.value = await eventCatalogRepository.getSchemaDraft(
      props.projectId,
      props.event.definitionKeyId,
    );
  } catch {
    conflictDraft.value = null;
  }
  conflictChecked.value = true;
}

function recoverImpact(cause: ApiError) {
  if (
    cause.code !== "EVENT_SCHEMA_PUBLISH_BLOCKED" &&
    cause.code !== "EVENT_SCHEMA_REQUIRES_NEW_DEFINITION"
  ) {
    return;
  }
  const details = cause.details;
  if (!draft.value || !details || typeof details !== "object") return;
  const compatibility = Reflect.get(details, "compatibility");
  const dependencyImpact = Reflect.get(details, "impact");
  if (!compatibility || !dependencyImpact) return;
  impact.value = {
    definitionKeyId: props.event.definitionKeyId,
    draftVersion: draft.value.draftVersion,
    baseRevisionId: draft.value.baseRevisionId,
    validation: { valid: true, validatedAt: new Date().toISOString() },
    compatibility,
    impact: dependencyImpact,
  } as unknown as EventSchemaImpact;
}

function clearConflict() {
  conflictChecked.value = false;
  conflictDraft.value = null;
}

function useServerDraft() {
  draft.value = conflictDraft.value;
  setServerSchema(
    conflictDraft.value?.payloadSchema ??
      props.event.currentSchema.payloadSchema,
  );
  impact.value = null;
  clearConflict();
  error.value = "";
}

function rebaseLocalDraft() {
  draft.value = conflictDraft.value;
  serverSchemaText.value = JSON.stringify(
    conflictDraft.value?.payloadSchema ??
      props.event.currentSchema.payloadSchema,
  );
  impact.value = null;
  const serverVersion = conflictDraft.value?.draftVersion;
  clearConflict();
  error.value = "";
  success.value = serverVersion
    ? `Локальные изменения готовы к сохранению поверх черновика v${serverVersion}.`
    : "Локальные изменения готовы к созданию нового черновика.";
}

async function createDefinitionFromDraft() {
  const currentDraft = draft.value;
  const name = newEventName.value.trim();
  const code = newEventCode.value.trim();
  if (
    !currentDraft ||
    isDirty.value ||
    !name ||
    !/^[a-z][a-z0-9_.-]*$/.test(code) ||
    pendingAction.value
  )
    return;
  error.value = "";
  success.value = "";
  pendingAction.value = "create";
  try {
    const created = await eventCatalogRepository.createSchemaSuccessor(
      props.projectId,
      props.event.definitionKeyId,
      {
        code,
        name,
        expectedDraftVersion: currentDraft.draftVersion,
        expectedBaseRevisionId: currentDraft.baseRevisionId,
      },
    );
    emit("created", created);
  } catch (cause) {
    error.value = errorMessage(cause, "Не удалось создать новое событие");
  } finally {
    pendingAction.value = null;
  }
}

function compatibilityTitle() {
  switch (classification.value) {
    case "FULL_TRANSITIVE_SAFE":
      return "Безопасное изменение";
    case "PRODUCER_BREAKING":
      return "Требуется миграция producers";
    case "CONSUMER_BREAKING":
      return "Затронуты consumers";
    case "SEMANTIC_BREAKING":
      return "Нужен новый код события";
    default:
      return "Требуется проверка";
  }
}

function reasonTitle(code: string) {
  return (
    {
      OPTIONAL_FIELD_ADDED: "Добавлено необязательное поле",
      FIELD_REMOVED: "Удалено поле",
      FIELD_PATH_RENAMED: "Изменён путь поля",
      REQUIRED_FIELD_ADDED: "Добавлено обязательное поле",
      FIELD_TYPE_CHANGED: "Изменён тип данных",
      CONSTRAINT_TIGHTENED: "Усилено ограничение",
      FIELD_KEY_CHANGED: "Изменён технический идентификатор",
      SEMANTIC_TYPE_CHANGED: "Изменён смысл данных",
      UNIT_CHANGED: "Изменена единица хранения",
      SENSITIVITY_CHANGED: "Изменена чувствительность данных",
    }[code] ?? code
  );
}

function resolutionTitle(action: string) {
  return (
    {
      MIGRATE: "Мигрировать binding",
      REPUBLISH: "Перепубликовать сценарий",
      DRAIN: "Дождаться завершения",
      CANCEL: "Отменить ожидание",
    }[action] ?? action
  );
}

function fieldDependencyTitle(dependency: Record<string, unknown>) {
  for (const key of ["fieldKey", "path", "sourcePath"]) {
    if (typeof dependency[key] === "string") return dependency[key];
  }
  return "payload";
}

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof ApiError || cause instanceof Error) {
    return cause.message || fallback;
  }
  return fallback;
}
</script>

<template>
  <div class="schema-authoring">
    <div class="authoring-banner">
      <div>
        <span class="eyebrow">Контракт payload</span>
        <strong>Версия {{ event.currentSchema.revisionNumber }}</strong>
        <p>
          Изменения сохраняются в отдельный черновик и не влияют на ingestion до
          публикации.
        </p>
      </div>
      <span v-if="draft" class="draft-badge">
        Черновик v{{ draft.draftVersion }}
      </span>
      <span v-else class="published-badge">Опубликовано</span>
    </div>

    <p v-if="loading" class="schema-state" aria-live="polite">
      Загружаем черновик…
    </p>

    <template v-else>
      <div v-if="isReadOnly" class="readonly-note">
        <i class="pi pi-lock" />
        <span>
          {{
            event.lifecycle === "ARCHIVED"
              ? "Архивное событие доступно только для чтения."
              : "У вас нет права изменять схему этого события."
          }}
        </span>
      </div>
      <pre
        v-if="isReadOnly"
        class="schema-preview"
      ><code>{{ JSON.stringify(serializedEditorSchema, null, 2) }}</code></pre>

      <template v-else>
        <fieldset class="editor-lock" :disabled="pendingAction !== null">
          <EventPayloadStudio
            v-model="editorDraft"
            :baseline-schema="event.currentSchema.payloadSchema"
            :issues="editorIssues"
            @technical-draft-change="technicalDraftDirty = $event"
          />
        </fieldset>
        <p class="editor-help">
          Технический идентификатор поля остаётся стабильным при переименовании.
          Изменение business meaning требует нового события.
        </p>
      </template>

      <div v-if="!isReadOnly" class="editor-actions">
        <button
          type="button"
          class="primary-button"
          :disabled="!isDirty || pendingAction !== null"
          @click="saveDraft"
        >
          {{ pendingAction === "save" ? "Сохраняем…" : "Сохранить черновик" }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="!draft || isDirty || pendingAction !== null"
          @click="analyzeDraft"
        >
          {{ pendingAction === "analyze" ? "Проверяем…" : "Проверить влияние" }}
        </button>
        <button
          v-if="draft"
          type="button"
          class="text-button danger-text"
          :disabled="pendingAction !== null"
          @click="confirmingDiscard = true"
        >
          Отменить черновик
        </button>
      </div>

      <p v-if="error" class="inline-message error" role="alert">
        {{ error }}
      </p>
      <p v-if="success" class="inline-message success" role="status">
        {{ success }}
      </p>

      <section
        v-if="lastPublishResult"
        class="publish-result"
        data-test="publish-result"
        aria-label="Результат публикации схемы"
      >
        <div>
          <span class="eyebrow">Опубликовано</span>
          <strong
            >Версия {{ lastPublishResult.revisionNumber }} — текущая</strong
          >
        </div>
        <dl>
          <div>
            <dt>Продолжено consumers</dt>
            <dd>{{ lastPublishResult.automaticallyExtendedBindings }}</dd>
          </div>
          <div>
            <dt>Продолжено ожиданий</dt>
            <dd>{{ lastPublishResult.automaticallyExtendedWaits }}</dd>
          </div>
          <div>
            <dt>Предупреждений</dt>
            <dd>
              {{ remainingPublishWarnings(lastPublishResult) }}
            </dd>
          </div>
        </dl>
      </section>

      <section v-if="conflictChecked" class="conflict-panel" role="alert">
        <div>
          <strong>Черновик изменился на сервере</strong>
          <p v-if="conflictDraft">
            На сервере уже черновик v{{ conflictDraft.draftVersion }}. Локальные
            поля сохранены в редакторе — выберите, какую версию продолжить.
          </p>
          <p v-else>
            Серверного черновика больше нет. Локальные поля сохранены в
            редакторе.
          </p>
        </div>
        <div class="conflict-actions">
          <button
            type="button"
            class="secondary-button"
            @click="useServerDraft"
          >
            Открыть серверную версию
          </button>
          <button
            type="button"
            class="primary-button"
            @click="rebaseLocalDraft"
          >
            Продолжить с локальными полями
          </button>
        </div>
      </section>

      <section
        v-if="impact"
        class="impact-review"
        aria-labelledby="event-schema-impact-title"
      >
        <div class="impact-heading">
          <div>
            <span class="eyebrow">Проверка перед публикацией</span>
            <h3 id="event-schema-impact-title">Влияние новой схемы</h3>
          </div>
          <span
            class="compatibility-badge"
            data-test="compatibility-summary"
            :class="{
              safe: classification === 'FULL_TRANSITIVE_SAFE',
              blocked: blockingCount > 0 || semanticBreak,
            }"
          >
            {{ compatibilityTitle() }}
          </span>
        </div>

        <div class="compatibility-grid" data-test="compatibility-matrix">
          <article>
            <span>Producers</span>
            <strong>{{ impact.compatibility.producerCompatibility }}</strong>
          </article>
          <article>
            <span>Consumers</span>
            <strong>{{ impact.compatibility.consumerCompatibility }}</strong>
          </article>
        </div>

        <div class="impact-summary" data-test="impact-summary">
          <span
            >Зависимых consumers:
            {{ impact.impact.summary.consumerCount }}</span
          >
          <span
            >Активных ожиданий:
            {{ impact.impact.summary.activeWaitCount }}</span
          >
          <span :class="{ danger: blockingCount > 0 }">
            Блокеров: {{ blockingCount }}
          </span>
        </div>

        <ul v-if="impact.compatibility.reasons.length" class="reason-list">
          <li
            v-for="reason in impact.compatibility.reasons"
            :key="`${reason.code}-${reason.path}`"
          >
            <strong>{{ reasonTitle(reason.code) }}</strong>
            <span>{{ reason.path || reason.fieldKey || "Вся схема" }}</span>
          </li>
        </ul>

        <section
          v-if="impact.impact.consumers.length"
          class="dependency-group"
          aria-labelledby="schema-consumers-title"
        >
          <h4 id="schema-consumers-title">Сценарии и consumers</h4>
          <article
            v-for="consumer in impact.impact.consumers"
            :key="consumer.bindingId"
            class="dependency-row"
            :class="{ blocking: consumer.blocking }"
          >
            <div>
              <RouterLink
                :to="{
                  name: 'scenario-edit',
                  params: { scenarioId: consumer.scenarioId },
                }"
              >
                {{ consumer.scenarioName }}
              </RouterLink>
              <span>
                {{ consumer.type }} · {{ consumer.state }} ·
                {{ consumer.matchingMode }}
              </span>
            </div>
            <div class="dependency-evidence">
              <span v-if="consumer.fieldDependencies.length">
                Поля:
                {{
                  consumer.fieldDependencies
                    .map(fieldDependencyTitle)
                    .join(", ")
                }}
              </span>
              <span v-if="consumer.resolutionActions.length">
                {{
                  consumer.resolutionActions.map(resolutionTitle).join(" · ")
                }}
              </span>
              <span v-if="consumer.reasonCodes.length">
                Причины: {{ consumer.reasonCodes.map(reasonTitle).join(" · ") }}
              </span>
              <strong v-if="consumer.blocking">Блокирует публикацию</strong>
            </div>
          </article>
        </section>

        <section
          v-if="impact.impact.activeWaits.length"
          class="dependency-group"
          aria-labelledby="schema-waits-title"
        >
          <div class="dependency-group-heading">
            <h4 id="schema-waits-title">Активные ожидания</h4>
            <RouterLink
              :to="{
                name: 'operations',
                query: { eventDefinitionKeyId: event.definitionKeyId },
              }"
            >
              Открыть операции
            </RouterLink>
          </div>
          <article
            v-for="wait in impact.impact.activeWaits"
            :key="wait.waitId"
            class="dependency-row"
            :class="{ blocking: wait.blocking }"
          >
            <div>
              <strong>Ожидание {{ wait.waitId }}</strong>
              <span>{{ wait.type }} · {{ wait.matchingMode }}</span>
            </div>
            <div class="dependency-evidence">
              <span>{{
                wait.resolutionActions.map(resolutionTitle).join(" · ")
              }}</span>
              <strong v-if="wait.blocking">Блокирует публикацию</strong>
            </div>
          </article>
        </section>

        <div v-if="blockingCount > 0" class="publish-blocker" role="alert">
          Сначала разрешите зависимости в сценариях или активных ожиданиях,
          затем обновите проверку влияния.
        </div>
        <div v-else-if="semanticBreak" class="publish-blocker" role="alert">
          Смысл события изменился. Создайте новую Event Definition с новым
          кодом.
        </div>

        <section v-if="semanticBreak" class="new-definition-panel">
          <div>
            <strong>Новая Event Definition из этого черновика</strong>
            <p>
              Схема станет первой ревизией нового события. Ingestion останется
              выключенным до отдельной проверки producers.
            </p>
          </div>
          <label for="semantic-event-name">Название</label>
          <input
            id="semantic-event-name"
            v-model="newEventName"
            maxlength="120"
          />
          <label for="semantic-event-code">Новый стабильный код</label>
          <input
            id="semantic-event-code"
            v-model="newEventCode"
            placeholder="payment.completed"
            maxlength="160"
          />
          <button
            type="button"
            class="primary-button"
            :disabled="
              !newEventName.trim() ||
              !/^[a-z][a-z0-9_.-]*$/.test(newEventCode.trim()) ||
              isDirty ||
              pendingAction !== null
            "
            @click="createDefinitionFromDraft"
          >
            {{
              pendingAction === "create" ? "Создаём…" : "Создать новое событие"
            }}
          </button>
        </section>

        <div v-if="!semanticBreak" class="publish-form">
          <p v-if="!canPublish" class="readonly-note">
            <i class="pi pi-lock" />
            У вас нет отдельного права публиковать версии схемы. Черновик можно
            сохранить и передать на публикацию администратору.
          </p>
          <label for="event-schema-publish-reason">Причина публикации</label>
          <textarea
            id="event-schema-publish-reason"
            v-model="publishReason"
            rows="2"
            maxlength="500"
            placeholder="Что изменилось и почему"
          />
          <label v-if="requiresBreakingConfirmation" class="check-row">
            <input v-model="confirmBreakingChange" type="checkbox" />
            <span>Я проверил breaking change и все runtime-зависимости.</span>
          </label>
          <label v-if="requiresProducerConfirmation" class="check-row">
            <input v-model="producerMigrationConfirmed" type="checkbox" />
            <span>Все producers переведены на новый payload.</span>
          </label>
          <button
            type="button"
            class="primary-button publish-button"
            :disabled="publishDisabled"
            @click="publishDraft"
          >
            {{
              pendingAction === "publish"
                ? "Публикуем…"
                : `Опубликовать версию ${nextRevisionNumber}`
            }}
          </button>
        </div>
      </section>

      <section v-if="confirmingDiscard && draft" class="discard-panel">
        <div>
          <strong>Удалить черновик v{{ draft.draftVersion }}?</strong>
          <p>
            Опубликованная версия
            {{ event.currentSchema.revisionNumber }} останется без изменений.
          </p>
        </div>
        <label for="event-schema-discard-reason">Причина</label>
        <input
          id="event-schema-discard-reason"
          v-model="discardReason"
          maxlength="500"
          placeholder="Почему черновик больше не нужен"
        />
        <div class="discard-actions">
          <button
            type="button"
            class="secondary-button"
            @click="confirmingDiscard = false"
          >
            Оставить черновик
          </button>
          <button
            type="button"
            class="danger-button"
            :disabled="!discardReason.trim() || pendingAction !== null"
            @click="discardDraft"
          >
            {{ pendingAction === "discard" ? "Удаляем…" : "Удалить черновик" }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.schema-authoring {
  display: grid;
  gap: 16px;
}
.editor-lock {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}
.editor-lock:disabled {
  opacity: 0.72;
}
.primary-button,
.secondary-button,
.danger-button {
  border: 0;
  border-radius: 9px;
  padding: 10px 14px;
  cursor: pointer;
  font:
    700 0.74rem var(--font-display),
    sans-serif;
}
.primary-button {
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.secondary-button {
  background: var(--surface-active);
  color: var(--text-primary);
}
.danger-button {
  background: var(--status-danger);
  color: var(--on-status-danger);
}
.primary-button:disabled,
.secondary-button:disabled,
.danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.authoring-banner,
.impact-review,
.publish-result,
.discard-panel,
.conflict-panel,
.new-definition-panel {
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
  padding: 16px;
}
.publish-result {
  display: grid;
  gap: 12px;
  border-color: var(--status-success);
  background: var(--status-success-soft);
}
.publish-result strong {
  display: block;
  margin-top: 4px;
}
.publish-result p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.publish-result dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.publish-result dl > div {
  border-radius: 9px;
  background: var(--surface-card);
  padding: 10px;
}
.publish-result dt {
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.publish-result dd {
  margin: 4px 0 0;
  font-weight: 800;
}
.authoring-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.authoring-banner strong {
  display: block;
  margin-top: 4px;
  font-size: 1rem;
}
.authoring-banner p,
.discard-panel p,
.conflict-panel p,
.new-definition-panel p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.5;
}
.eyebrow {
  color: var(--status-violet);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.draft-badge,
.published-badge,
.compatibility-badge {
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 0.68rem;
  font-weight: 800;
  white-space: nowrap;
}
.draft-badge {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.published-badge,
.compatibility-badge.safe {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.compatibility-badge {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.compatibility-badge.blocked {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.publish-form > label,
.discard-panel > label,
.new-definition-panel > label {
  display: grid;
  gap: 4px;
  color: var(--text-primary);
  font-size: 0.72rem;
  font-weight: 800;
}
.schema-preview {
  max-height: 480px;
  overflow: auto;
  margin: 0;
  border-radius: 10px;
  background: var(--surface-card);
  padding: 16px;
  color: var(--text-primary);
  font:
    0.76rem/1.55 ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
}
.publish-form textarea:focus,
.discard-panel input:focus,
.new-definition-panel input:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.editor-help,
.schema-state {
  margin: -8px 0 0;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.editor-actions,
.discard-actions,
.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.text-button {
  border: 0;
  background: transparent;
  padding: 8px;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
}
.danger-text {
  color: var(--status-danger-text);
}
.readonly-note,
.publish-blocker {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  background: var(--status-warning-soft);
  padding: 12px;
  color: var(--status-warning-text);
  font-size: 0.72rem;
}
.impact-review {
  display: grid;
  gap: 16px;
  background: var(--surface-card);
}
.conflict-panel,
.new-definition-panel {
  display: grid;
  gap: 12px;
}
.conflict-panel {
  border-color: var(--status-warning);
  background: var(--status-warning-soft);
}
.new-definition-panel {
  border-color: var(--status-violet);
  background: var(--status-violet-soft);
}
.new-definition-panel input {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-card);
  padding: 10px 12px;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.74rem;
}
.new-definition-panel .primary-button {
  justify-self: start;
}
.impact-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.impact-heading h3 {
  margin: 4px 0 0;
  font-size: 1rem;
}
.compatibility-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.compatibility-grid article {
  border-radius: 10px;
  background: var(--surface-subtle);
  padding: 13px;
}
.compatibility-grid span,
.compatibility-grid strong {
  display: block;
}
.compatibility-grid span {
  margin-bottom: 5px;
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.compatibility-grid strong {
  font-size: 0.76rem;
}
.impact-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.impact-summary span {
  border-radius: 999px;
  background: var(--surface-subtle);
  padding: 7px 10px;
  font-size: 0.68rem;
  font-weight: 700;
}
.impact-summary .danger {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.reason-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.reason-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 8px;
  font-size: 0.7rem;
}
.reason-list span {
  color: var(--text-secondary);
}
.dependency-group {
  display: grid;
  gap: 8px;
}
.dependency-group h4 {
  margin: 0;
  font-size: 0.78rem;
}
.dependency-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dependency-group-heading a,
.dependency-row a {
  color: var(--text-link);
  font-size: 0.7rem;
  font-weight: 800;
}
.dependency-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-subtle);
  padding: 11px 12px;
}
.dependency-row.blocking {
  border-color: var(--status-danger);
  background: var(--status-danger-soft);
}
.dependency-row > div,
.dependency-evidence {
  display: grid;
  gap: 4px;
}
.dependency-row span,
.dependency-evidence {
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.dependency-evidence strong {
  color: var(--status-danger-text);
}
.publish-form,
.discard-panel {
  display: grid;
  gap: 10px;
}
.publish-form textarea,
.discard-panel input {
  width: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-card);
  padding: 10px 12px;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.74rem;
}
.check-row {
  display: flex !important;
  grid-template-columns: auto 1fr;
  align-items: flex-start;
  gap: 8px !important;
  font-weight: 600 !important;
}
.publish-button {
  justify-self: start;
}
.discard-panel {
  background: var(--status-danger-soft);
}
.danger-button {
  border: 0;
  border-radius: 9px;
  background: var(--status-danger-text);
  padding: 9px 12px;
  color: var(--on-status-danger);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (max-width: 720px) {
  .authoring-banner,
  .impact-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .compatibility-grid {
    grid-template-columns: 1fr;
  }
  .publish-result dl {
    grid-template-columns: 1fr;
  }
  .dependency-row {
    grid-template-columns: 1fr;
  }
  .draft-badge,
  .published-badge,
  .compatibility-badge {
    align-self: flex-start;
  }
}
</style>
