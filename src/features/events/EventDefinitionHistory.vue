<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Tag from "primevue/tag";
import {
  eventCatalogRepository,
  type EventCatalogDefinition,
  type EventDefinitionRevision,
} from "@/shared/api/repository/event-catalog";

const props = defineProps<{
  projectId: string;
  event: EventCatalogDefinition;
  initialRevisionId?: string;
}>();

const visible = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const revisions = ref<EventDefinitionRevision[]>([]);
const nextCursor = ref<string | null>(null);
const detail = ref<EventDefinitionRevision | null>(null);
let generation = 0;
let pageRequestId = 0;
let detailRequestId = 0;

watch(
  () =>
    [
      props.projectId,
      props.event.definitionKeyId,
      props.initialRevisionId,
    ] as const,
  async ([, , revisionId]) => {
    reset();
    if (revisionId) await openLinkedRevision(revisionId);
  },
  { immediate: true },
);

function reset() {
  generation += 1;
  pageRequestId += 1;
  detailRequestId += 1;
  visible.value = false;
  loading.value = false;
  loadingMore.value = false;
  error.value = "";
  revisions.value = [];
  nextCursor.value = null;
  detail.value = null;
}

async function open() {
  visible.value = true;
  revisions.value = [];
  nextCursor.value = null;
  detail.value = null;
  await loadPage();
}

async function openLinkedRevision(revisionId: string) {
  visible.value = true;
  loading.value = true;
  const projectId = props.projectId;
  const definitionKeyId = props.event.definitionKeyId;
  const requestGeneration = generation;
  const requestId = ++detailRequestId;
  error.value = "";
  try {
    const loaded = await eventCatalogRepository.getRevision(
      projectId,
      definitionKeyId,
      revisionId,
    );
    if (
      !isCurrent(projectId, definitionKeyId, requestGeneration) ||
      requestId !== detailRequestId
    )
      return;
    detail.value = loaded;
  } catch (cause) {
    if (
      isCurrent(projectId, definitionKeyId, requestGeneration) &&
      requestId === detailRequestId
    ) {
      error.value =
        cause instanceof Error ? cause.message : "Не удалось загрузить версию";
    }
  } finally {
    if (
      isCurrent(projectId, definitionKeyId, requestGeneration) &&
      requestId === detailRequestId
    )
      loading.value = false;
  }
}

async function loadPage(cursor?: string) {
  const projectId = props.projectId;
  const definitionKeyId = props.event.definitionKeyId;
  const requestGeneration = generation;
  const requestId = ++pageRequestId;
  if (cursor) loadingMore.value = true;
  else loading.value = true;
  error.value = "";
  try {
    const page = await eventCatalogRepository.listRevisions(
      projectId,
      definitionKeyId,
      {
        limit: 25,
        ...(cursor ? { cursor } : {}),
      },
    );
    if (
      !isCurrent(projectId, definitionKeyId, requestGeneration) ||
      requestId !== pageRequestId
    )
      return;
    revisions.value.push(...page.items);
    nextCursor.value = page.nextCursor;
  } catch (cause) {
    if (
      !isCurrent(projectId, definitionKeyId, requestGeneration) ||
      requestId !== pageRequestId
    )
      return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить историю версий";
  } finally {
    if (
      isCurrent(projectId, definitionKeyId, requestGeneration) &&
      requestId === pageRequestId
    ) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function openDetail(revision: EventDefinitionRevision) {
  const projectId = props.projectId;
  const definitionKeyId = props.event.definitionKeyId;
  const requestGeneration = generation;
  const requestId = ++detailRequestId;
  error.value = "";
  try {
    const loaded = await eventCatalogRepository.getRevision(
      projectId,
      definitionKeyId,
      revision.id,
    );
    if (
      !isCurrent(projectId, definitionKeyId, requestGeneration) ||
      requestId !== detailRequestId
    )
      return;
    detail.value = loaded;
  } catch (cause) {
    if (
      !isCurrent(projectId, definitionKeyId, requestGeneration) ||
      requestId !== detailRequestId
    )
      return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить версию";
  }
}

function isCurrent(
  projectId: string,
  definitionKeyId: string,
  requestGeneration: number,
) {
  return (
    requestGeneration === generation &&
    props.projectId === projectId &&
    props.event.definitionKeyId === definitionKeyId
  );
}

function compatibilitySeverity(
  value: EventDefinitionRevision["compatibility"],
) {
  return value === "CURRENT"
    ? "success"
    : value === "PINNED"
      ? "warn"
      : "secondary";
}

function compatibilityLabel(value: EventDefinitionRevision["compatibility"]) {
  return value === "CURRENT"
    ? "Текущая"
    : value === "PINNED"
      ? "Используется публикациями"
      : "Заменена";
}
</script>

<template>
  <Button
    label="История"
    icon="pi pi-history"
    severity="secondary"
    text
    size="small"
    @click="open"
  />
  <Dialog
    v-model:visible="visible"
    modal
    :header="`История: ${event.metadata.name}`"
    :style="{ width: 'min(760px, calc(100vw - 28px))' }"
  >
    <div class="event-history-meta">
      <span>Постоянный ключ</span><code>{{ event.definitionKeyId }}</code>
      <span>Текущая версия</span
      ><code>{{ event.currentSchema.revisionId }}</code>
    </div>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <p v-if="loading">Загружаем историю…</p>
    <div v-else class="event-revisions">
      <button
        v-for="revision in revisions"
        :key="revision.id"
        type="button"
        class="event-revision-row"
        data-testid="event-revision-detail"
        @click="openDetail(revision)"
      >
        <strong>v{{ revision.number }}</strong>
        <Tag
          :value="compatibilityLabel(revision.compatibility)"
          :severity="compatibilitySeverity(revision.compatibility)"
        />
        <span
          >{{ revision.pinnedScenarioRevisionCount }} публикации сценариев</span
        >
        <small>{{
          new Date(revision.publishedAt).toLocaleString("ru-RU")
        }}</small>
      </button>
    </div>
    <Button
      v-if="nextCursor"
      label="Загрузить ещё"
      severity="secondary"
      outlined
      :loading="loadingMore"
      @click="loadPage(nextCursor)"
    />

    <section v-if="detail" class="event-revision-detail">
      <header>
        <h3>Версия v{{ detail.number }}</h3>
        <Tag
          :value="compatibilityLabel(detail.compatibility)"
          :severity="compatibilitySeverity(detail.compatibility)"
        />
      </header>
      <p>
        Эту схему фиксируют
        {{ detail.pinnedScenarioRevisionCount }} опубликованных ревизий
        сценариев.
      </p>
      <pre>{{ JSON.stringify(detail.payloadSchema, null, 2) }}</pre>
    </section>
  </Dialog>
</template>

<style scoped>
.event-history-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 12px;
  margin-bottom: 14px;
  color: var(--text-small-muted);
}
.event-history-meta code {
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.event-revisions {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.event-revision-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.event-revision-row small {
  color: var(--text-small-muted);
}
.event-revision-detail {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}
.event-revision-detail header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.event-revision-detail h3 {
  margin: 0;
}
.event-revision-detail pre {
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border-radius: 10px;
  background: var(--code-background);
  color: var(--code-text);
  font-size: 0.78rem;
}
@media (max-width: 640px) {
  .event-revision-row {
    grid-template-columns: auto 1fr;
  }
}
</style>
