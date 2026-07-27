<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Drawer from "primevue/drawer";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import type {
  CmsProfileSyncHistoryFieldResponseDto,
  CmsProfileSyncHistoryItemResponseDto,
} from "@/shared/api/generated/models";
import { formatDate } from "@/shared/lib/format";

const props = defineProps<{
  projectId: string;
  endUserId: string;
}>();

const visible = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const items = ref<CmsProfileSyncHistoryItemResponseDto[]>([]);
const nextCursor = ref<string | null>(null);
const failedCursor = ref<string>();
let requestSequence = 0;

const statusPresentation: Record<
  CmsProfileSyncHistoryItemResponseDto["status"],
  {
    label: string;
    severity: "success" | "secondary" | "warn" | "danger";
    icon: string;
  }
> = {
  APPLIED: {
    label: "Применено",
    severity: "success",
    icon: "pi pi-check",
  },
  NOOP: {
    label: "Без изменений",
    severity: "secondary",
    icon: "pi pi-minus",
  },
  DUPLICATE: {
    label: "Повтор",
    severity: "secondary",
    icon: "pi pi-minus",
  },
  REJECTED_INVALID: {
    label: "Отклонено",
    severity: "danger",
    icon: "pi pi-exclamation-triangle",
  },
  CONTRACT_OUTDATED: {
    label: "Контракт устарел",
    severity: "danger",
    icon: "pi pi-exclamation-triangle",
  },
  STALE_IGNORED: {
    label: "Устаревшие данные",
    severity: "warn",
    icon: "pi pi-exclamation-triangle",
  },
  IDEMPOTENCY_CONFLICT: {
    label: "Конфликт запроса",
    severity: "danger",
    icon: "pi pi-exclamation-triangle",
  },
  SOURCE_SEQUENCE_CONFLICT: {
    label: "Конфликт последовательности",
    severity: "danger",
    icon: "pi pi-exclamation-triangle",
  },
  OBSERVATION_CONFLICT: {
    label: "Конфликт времени",
    severity: "danger",
    icon: "pi pi-exclamation-triangle",
  },
  RATE_LIMITED: {
    label: "Лимит запросов",
    severity: "danger",
    icon: "pi pi-exclamation-triangle",
  },
};

watch(
  () => [props.projectId, props.endUserId] as const,
  () => {
    requestSequence += 1;
    visible.value = false;
    reset();
  },
);

function reset(): void {
  items.value = [];
  nextCursor.value = null;
  failedCursor.value = undefined;
  error.value = "";
  loading.value = false;
  loadingMore.value = false;
}

function close(): void {
  requestSequence += 1;
  visible.value = false;
  reset();
}

async function open(): Promise<void> {
  visible.value = true;
  reset();
  await load();
}

async function load(cursor?: string): Promise<void> {
  const request = ++requestSequence;
  const projectId = props.projectId;
  const endUserId = props.endUserId;
  if (cursor) loadingMore.value = true;
  else loading.value = true;
  error.value = "";
  try {
    const page = await endUserProfileRepository.history(projectId, endUserId, {
      limit: 25,
      ...(cursor ? { cursor } : {}),
    });
    if (
      request !== requestSequence ||
      projectId !== props.projectId ||
      endUserId !== props.endUserId
    )
      return;
    const byId = new Map(items.value.map((item) => [item.id, item]));
    page.items.forEach((item) => byId.set(item.id, item));
    items.value = [...byId.values()];
    nextCursor.value = page.nextCursor ?? null;
    failedCursor.value = undefined;
  } catch {
    if (
      request === requestSequence &&
      projectId === props.projectId &&
      endUserId === props.endUserId
    ) {
      error.value = "Не удалось загрузить историю профиля.";
      failedCursor.value = cursor;
    }
  } finally {
    if (
      request === requestSequence &&
      projectId === props.projectId &&
      endUserId === props.endUserId
    ) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function retry(): Promise<void> {
  return load(failedCursor.value);
}

function statusDisplay(status: CmsProfileSyncHistoryItemResponseDto["status"]) {
  return statusPresentation[status];
}

function sourceLabel(source: CmsProfileSyncHistoryItemResponseDto["source"]) {
  return source === "SESSION" ? "Сессия" : "Profile Sync API";
}

function fieldLabel(field: CmsProfileSyncHistoryFieldResponseDto): string {
  return field.label || field.key || field.definitionId;
}
</script>

<template>
  <Button
    label="История"
    icon="pi pi-history"
    size="small"
    severity="secondary"
    text
    aria-label="Открыть историю профиля"
    @click="open"
  />

  <Drawer
    :visible="visible"
    position="right"
    class="profile-history-drawer"
    :style="{ width: 'min(720px, 100vw)' }"
    @update:visible="!$event && close()"
  >
    <template #header>
      <div class="drawer-heading">
        <span class="drawer-heading-icon" aria-hidden="true">
          <i class="pi pi-history" />
        </span>
        <div>
          <span class="eyebrow">Аудит профиля</span>
          <h2>История изменений</h2>
          <p>Версии, синхронизации и состав полей без их значений</p>
        </div>
      </div>
    </template>

    <Message v-if="error" severity="error" :closable="false">
      <div class="error-message">
        <span>{{ error }}</span>
        <Button
          label="Повторить"
          size="small"
          text
          aria-label="Повторить"
          @click="retry"
        />
      </div>
    </Message>

    <p class="history-note">
      <i class="pi pi-info-circle" aria-hidden="true" />
      <span>
        <strong>Как читать diff.</strong>
        Передано — поля, пришедшие в этой попытке, а не обязательно новые
        значения. Значения профиля в истории не сохраняются.
      </span>
    </p>

    <div v-if="loading" class="history-loading" aria-label="Загрузка истории">
      <Skeleton v-for="item in 3" :key="item" height="190px" />
    </div>

    <div v-else-if="!items.length && !error" class="history-empty">
      <span aria-hidden="true"><i class="pi pi-clock" /></span>
      <strong>История пока пуста</strong>
      <p>Здесь появятся попытки синхронизации профиля.</p>
    </div>

    <ol
      v-if="items.length"
      class="history-timeline"
      aria-label="Попытки синхронизации"
    >
      <li v-for="item in items" :key="item.id">
        <span
          class="timeline-marker"
          :data-status="statusDisplay(item.status).severity"
          aria-hidden="true"
        >
          <i :class="statusDisplay(item.status).icon" />
        </span>

        <article class="history-attempt">
          <header class="attempt-header">
            <div>
              <Tag
                :value="statusDisplay(item.status).label"
                :severity="statusDisplay(item.status).severity"
                rounded
              />
              <span>{{ sourceLabel(item.source) }}</span>
            </div>
            <time :datetime="item.receivedAt">{{
              formatDate(item.receivedAt)
            }}</time>
          </header>

          <div
            class="version-flow"
            :aria-label="`Переход с версии ${item.previousProfileVersion} на версию ${item.resultProfileVersion}`"
          >
            <span>
              <small>Было</small>
              <strong>Версия {{ item.previousProfileVersion }}</strong>
            </span>
            <i class="pi pi-arrow-right" aria-hidden="true" />
            <span>
              <small>Стало</small>
              <strong>Версия {{ item.resultProfileVersion }}</strong>
            </span>
          </div>

          <div
            v-if="item.submittedFields.length || item.removedFields.length"
            class="field-diff"
          >
            <section
              v-if="item.submittedFields.length"
              class="field-change sent"
            >
              <header>
                <span><i class="pi pi-plus" aria-hidden="true" /></span>
                <strong>Передано</strong>
                <small>{{ item.submittedFields.length }}</small>
              </header>
              <ul>
                <li
                  v-for="field in item.submittedFields"
                  :key="field.definitionId"
                >
                  <span>{{ fieldLabel(field) }}</span>
                  <code v-if="field.key">{{ field.key }}</code>
                </li>
              </ul>
            </section>

            <section
              v-if="item.removedFields.length"
              class="field-change removed"
            >
              <header>
                <span><i class="pi pi-minus" aria-hidden="true" /></span>
                <strong>Удалено</strong>
                <small>{{ item.removedFields.length }}</small>
              </header>
              <ul>
                <li
                  v-for="field in item.removedFields"
                  :key="field.definitionId"
                >
                  <span>{{ fieldLabel(field) }}</span>
                  <code v-if="field.key">{{ field.key }}</code>
                </li>
              </ul>
            </section>
          </div>
          <p v-else class="no-field-changes">
            <i class="pi pi-equals" aria-hidden="true" />
            Состав переданных и удалённых полей пуст
          </p>

          <section v-if="item.issues.length" class="attempt-issues">
            <header>
              <i class="pi pi-exclamation-circle" aria-hidden="true" />
              <strong>Ошибки синхронизации</strong>
            </header>
            <ul>
              <li
                v-for="issue in item.issues"
                :key="`${issue.code}-${issue.definitionId ?? ''}`"
              >
                <code>{{ issue.code }}</code>
                <span v-if="issue.definitionId"
                  >Поле {{ issue.definitionId }}</span
                >
              </li>
            </ul>
          </section>

          <details class="attempt-technical">
            <summary>Технические детали</summary>
            <dl>
              <div>
                <dt>Ревизия контракта</dt>
                <dd>
                  {{ item.declaredContractRevision }}
                  <template
                    v-if="
                      item.activeContractRevision &&
                      item.activeContractRevision !==
                        item.declaredContractRevision
                    "
                  >
                    → {{ item.activeContractRevision }}
                  </template>
                </dd>
              </div>
              <div>
                <dt>Наблюдалось</dt>
                <dd>
                  {{
                    item.observedAt ? formatDate(item.observedAt) : "Не указано"
                  }}
                </dd>
              </div>
              <div>
                <dt>Последовательность</dt>
                <dd>{{ item.sourceSequence ?? "Не указана" }}</dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>
                  <code>{{ item.outcome }}</code>
                </dd>
              </div>
              <div>
                <dt>Длительность</dt>
                <dd>{{ item.durationMs }} мс</dd>
              </div>
              <div>
                <dt>Размер snapshot</dt>
                <dd>{{ item.snapshotBytes }} Б</dd>
              </div>
              <div>
                <dt>Credential</dt>
                <dd class="mono">{{ item.credentialId }}</dd>
              </div>
              <div v-if="item.idempotencyConflictCount">
                <dt>Конфликты идемпотентности</dt>
                <dd>{{ item.idempotencyConflictCount }}</dd>
              </div>
            </dl>
          </details>
        </article>
      </li>
    </ol>

    <Button
      v-if="nextCursor"
      label="Загрузить более ранние"
      icon="pi pi-chevron-down"
      severity="secondary"
      outlined
      class="load-more"
      :loading="loadingMore"
      aria-label="Загрузить более ранние"
      @click="load(nextCursor)"
    />
  </Drawer>
</template>

<style scoped>
.drawer-heading,
.drawer-heading > div,
.history-loading,
.history-timeline,
.history-attempt,
.attempt-issues,
.attempt-technical dl {
  display: grid;
}
.drawer-heading {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 13px;
}
.drawer-heading > div {
  gap: 2px;
}
.drawer-heading-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 11%, var(--surface-subtle));
  color: var(--accent);
}
.drawer-heading h2,
.drawer-heading p {
  margin: 0;
}
.drawer-heading h2 {
  font: 750 1.05rem var(--font-display);
}
.drawer-heading p {
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.error-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.history-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0 0 15px;
  padding: 11px 13px;
  border-radius: 11px;
  background: var(--status-info-soft);
  color: var(--status-info-text);
  font-size: 0.66rem;
  line-height: 1.45;
}
.history-note i {
  margin-top: 2px;
}
.history-note strong {
  margin-right: 4px;
}
.history-loading {
  gap: 14px;
}
.history-empty {
  display: grid;
  place-items: center;
  min-height: 360px;
  padding: 40px 24px;
  color: var(--text-secondary);
  text-align: center;
}
.history-empty > span {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 14px;
  border-radius: 19px;
  background: var(--surface-subtle);
  color: var(--accent);
  font-size: 1.35rem;
}
.history-empty strong {
  color: var(--text-primary);
  font: 700 0.88rem var(--font-display);
}
.history-empty p {
  margin: 6px 0 0;
  font-size: 0.72rem;
}
.history-timeline {
  gap: 0;
  margin: 0;
  padding: 4px 0 12px;
  list-style: none;
}
.history-timeline > li {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
}
.timeline-marker {
  position: relative;
  z-index: 0;
  display: grid;
  place-items: center;
  align-self: start;
  width: 28px;
  height: 28px;
  border: 4px solid var(--surface-card);
  border-radius: 50%;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.58rem;
}
.timeline-marker::after {
  position: absolute;
  z-index: -1;
  top: 24px;
  bottom: -999px;
  left: 50%;
  width: 1px;
  background: var(--border-default);
  content: "";
}
.history-timeline > li:last-child .timeline-marker::after {
  display: none;
}
.timeline-marker[data-status="success"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.timeline-marker[data-status="danger"] {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.timeline-marker[data-status="warn"] {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.history-attempt {
  gap: 14px;
  min-width: 0;
  margin-bottom: 18px;
  padding: 17px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}
.attempt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.attempt-header > div {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.attempt-header time {
  color: var(--text-secondary);
  font-size: 0.66rem;
  white-space: nowrap;
}
.version-flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  border-radius: 13px;
  background: var(--surface-subtle);
}
.version-flow > span {
  display: grid;
  gap: 3px;
}
.version-flow > span:last-child {
  text-align: right;
}
.version-flow small {
  color: var(--text-secondary);
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.version-flow strong {
  font: 700 0.78rem var(--font-display);
}
.version-flow > i {
  color: var(--accent);
  font-size: 0.72rem;
}
.field-diff {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.field-change {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 13px;
}
.field-change > header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 7px;
  padding: 10px 11px;
  border-bottom: 1px solid var(--border-default);
  font-size: 0.7rem;
}
.field-change > header > span {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: 7px;
  font-size: 0.58rem;
}
.field-change.sent > header > span {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.field-change.removed > header > span {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.field-change > header small {
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
.field-change ul,
.attempt-issues ul {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.field-change li {
  display: grid;
  gap: 3px;
  padding: 9px 11px;
  border-bottom: 1px solid var(--border-default);
  font-size: 0.69rem;
}
.field-change li:last-child {
  border-bottom: 0;
}
.field-change code {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.6rem;
  text-overflow: ellipsis;
}
.no-field-changes {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 11px 13px;
  border-radius: 11px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.attempt-issues {
  gap: 8px;
  padding: 11px 13px;
  border: 1px solid
    color-mix(in srgb, var(--status-danger) 24%, var(--border-default));
  border-radius: 12px;
  background: color-mix(in srgb, var(--status-danger) 5%, var(--surface-card));
}
.attempt-issues > header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--status-danger-text);
  font-size: 0.7rem;
}
.attempt-issues li {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 0.65rem;
}
.attempt-issues code {
  color: var(--text-primary);
}
.attempt-technical {
  border-top: 1px solid var(--border-default);
  padding-top: 11px;
}
.attempt-technical summary {
  width: fit-content;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.66rem;
}
.attempt-technical dl {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px 14px;
  margin: 12px 0 0;
}
.attempt-technical dl > div {
  min-width: 0;
}
.attempt-technical dt {
  color: var(--text-secondary);
  font-size: 0.58rem;
}
.attempt-technical dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.66rem;
  font-weight: 650;
}
.load-more {
  width: 100%;
}
@media (max-width: 560px) {
  .drawer-heading p {
    display: none;
  }
  .attempt-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .field-diff {
    grid-template-columns: 1fr;
  }
  .attempt-technical dl {
    grid-template-columns: 1fr;
  }
  .history-attempt {
    padding: 14px;
  }
}
</style>
