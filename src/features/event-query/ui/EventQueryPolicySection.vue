<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import type {
  EventQueryPolicyDiagnosticDto,
  EventQueryPolicyDocumentDto,
  EventQueryPolicyRevisionResponseDto,
  EventQueryUsageResponseDto,
} from "@/shared/api/generated/models";
import { eventCatalogRepository } from "@/shared/api/repository/event-catalog";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog/event-catalog-contract";
import ProjectSettingsSectionHeader from "@/shared/ui/ProjectSettingsSectionHeader.vue";
import { eventQueryRepository } from "../api/event-query-repository";
import {
  eventQueryPolicyHardLimitViolations,
  eventQueryPolicyImpact,
} from "../model/event-query-policy";
import EventQueryPreview from "./EventQueryPreview.vue";
import EventQueryPolicyWorkspace from "./EventQueryPolicyWorkspace.vue";

const props = defineProps<{
  projectId: string;
  canManage: boolean;
  canPreview: boolean;
  canReadCatalog?: boolean;
}>();

const expanded = ref(false);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const error = ref("");
const definitions = ref<EventCatalogDefinition[]>([]);
const draftVersion = ref(0);
const published = ref<EventQueryPolicyRevisionResponseDto | null>(null);
const document = ref<EventQueryPolicyDocumentDto>({
  enabled: false,
  items: [],
});
const savedDocumentSnapshot = ref("");
const diagnostics = ref<EventQueryPolicyDiagnosticDto[]>([]);
const usage = ref<EventQueryUsageResponseDto | null>(null);
let loadGeneration = 0;

const publishedItems = computed(() => published.value?.document.items ?? []);
const documentSnapshot = computed(() => JSON.stringify(document.value));
const globalDiagnostics = computed(() =>
  diagnostics.value.filter(
    (diagnostic) => !diagnostic.location.startsWith("items["),
  ),
);
const hardLimitViolations = computed(() =>
  eventQueryPolicyHardLimitViolations(document.value),
);
const publishImpact = computed(() =>
  eventQueryPolicyImpact(published.value?.document ?? null, document.value),
);
const canPublish = computed(
  () =>
    props.canManage &&
    draftVersion.value > 0 &&
    documentSnapshot.value === savedDocumentSnapshot.value &&
    diagnostics.value.length === 0 &&
    hardLimitViolations.value.length === 0 &&
    !saving.value &&
    !publishing.value,
);

function cloneDocument(value: EventQueryPolicyDocumentDto) {
  return JSON.parse(JSON.stringify(value)) as EventQueryPolicyDocumentDto;
}

async function load() {
  const generation = ++loadGeneration;
  const projectId = props.projectId;
  loading.value = true;
  saving.value = false;
  publishing.value = false;
  error.value = "";
  definitions.value = [];
  draftVersion.value = 0;
  published.value = null;
  document.value = { enabled: false, items: [] };
  savedDocumentSnapshot.value = "";
  diagnostics.value = [];
  usage.value = null;
  try {
    const [state, catalog] = await Promise.all([
      eventQueryRepository.getPolicy(projectId),
      props.canReadCatalog === false
        ? Promise.resolve([])
        : eventCatalogRepository.listDefinitions(projectId, "ACTIVE"),
    ]);
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    const policyDocument = state.draft?.document ?? state.published?.document;
    const fallbackDefinitions = (policyDocument?.items ?? []).map(
      (item) =>
        ({
          definitionKeyId: `policy:${item.stableCode}`,
          projectId,
          code: item.stableCode,
          lifecycle: "ACTIVE",
          lifecycleVersion: 1,
          lifecycleUpdatedAt: state.draft?.updatedAt ?? "",
          metadata: {
            name: item.stableCode,
            description: item.descriptionForAI,
            concurrencyToken: state.draft?.updatedAt ?? "",
          },
          policy: {
            version: 1,
            updatedAt: state.draft?.updatedAt ?? "",
            enabled: true,
            clientIngestible: false,
            countsAsActivity: true,
          },
          currentSchema: {
            revisionId: `policy:${item.stableCode}`,
            revisionNumber: 1,
            publishedAt: state.published?.publishedAt ?? "",
            payloadSchema: { type: "object", properties: {} },
          },
          origin: "CUSTOM",
          readOnly: true,
        }) as EventCatalogDefinition,
    );
    definitions.value = [
      ...catalog,
      ...fallbackDefinitions.filter(
        (fallback) =>
          !catalog.some((definition) => definition.code === fallback.code),
      ),
    ];
    published.value = state.published ?? null;
    draftVersion.value = state.draft?.version ?? 0;
    document.value = cloneDocument(
      state.draft?.document ??
        state.published?.document ?? { enabled: false, items: [] },
    );
    savedDocumentSnapshot.value = JSON.stringify(document.value);
    if (props.canPreview) void loadUsage(projectId, generation);
  } catch (cause) {
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить политику";
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadUsage(projectId: string, generation: number) {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
  try {
    const response = await eventQueryRepository.usage(projectId, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (generation === loadGeneration && projectId === props.projectId) {
      usage.value = response;
    }
  } catch {
    if (generation === loadGeneration) usage.value = null;
  }
}

async function save() {
  if (!props.canManage || saving.value || loading.value) return;
  const projectId = props.projectId;
  const generation = loadGeneration;
  const draft = cloneDocument(document.value);
  const expectedVersion = draftVersion.value;
  saving.value = true;
  error.value = "";
  try {
    const validation = await eventQueryRepository.validate(projectId, {
      document: draft,
    });
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    diagnostics.value = validation.errors;
    if (!validation.valid) return;
    const saved = await eventQueryRepository.saveDraft(projectId, {
      expectedVersion,
      document: draft,
    });
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    draftVersion.value = saved.version;
    document.value = cloneDocument(saved.document);
    savedDocumentSnapshot.value = JSON.stringify(document.value);
  } catch (cause) {
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось сохранить черновик";
  } finally {
    if (generation === loadGeneration && projectId === props.projectId) {
      saving.value = false;
    }
  }
}

async function publishPolicy() {
  if (!canPublish.value) return;
  const projectId = props.projectId;
  const generation = loadGeneration;
  const expectedDraftVersion = draftVersion.value;
  publishing.value = true;
  error.value = "";
  try {
    const response = await eventQueryRepository.publish(projectId, {
      expectedDraftVersion,
    });
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    published.value = response;
  } catch (cause) {
    if (generation !== loadGeneration || projectId !== props.projectId) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось опубликовать политику";
  } finally {
    if (generation === loadGeneration && projectId === props.projectId) {
      publishing.value = false;
    }
  }
}

function formatBytes(value: number) {
  return value < 1024 ? `${value} Б` : `${(value / 1024).toFixed(1)} КБ`;
}

onMounted(load);
watch(() => props.projectId, load);
</script>

<template>
  <section
    class="card card-pad settings-section event-query-policy"
    :class="{ collapsed: !expanded }"
  >
    <ProjectSettingsSectionHeader
      v-model:expanded="expanded"
      title="Доступ ИИ к событиям"
      description="Read-only доступ только к опубликованным типам событий и безопасным полям текущего пользователя."
      icon="pi pi-shield"
      tone="violet"
      content-id="event-query-policy-settings"
    >
      <template #actions>
        <span v-if="published" class="revision-badge">
          Опубликована ревизия {{ published.version }}
        </span>
        <span v-else class="revision-badge muted">Не опубликовано</span>
      </template>
    </ProjectSettingsSectionHeader>

    <div id="event-query-policy-settings" v-show="expanded" class="policy-body">
      <Message v-if="error" severity="error" :closable="false">
        {{ error }}
        <Button label="Повторить" text size="small" @click="load" />
      </Message>
      <div v-if="loading" class="policy-loading">
        <Skeleton height="4rem" />
        <Skeleton v-for="index in 3" :key="index" height="5rem" />
      </div>
      <template v-else>
        <div class="master-control">
          <div>
            <strong>Разрешить Lola запрашивать продуктовые события</strong>
            <p>
              Идентификаторы проекта и пользователя подставляет сервер. SQL,
              произвольные таблицы и технические логи недоступны.
            </p>
          </div>
          <label class="switch-label">
            <input
              v-model="document.enabled"
              type="checkbox"
              :disabled="!canManage"
            />
            {{ document.enabled ? "Включено" : "Выключено" }}
          </label>
        </div>

        <div v-if="usage" class="usage-card">
          <div>
            <span>Запросы за 30 дней</span><strong>{{ usage.calls }}</strong>
          </div>
          <div>
            <span>Данные событий: оценка вклада</span>
            <strong
              >{{ formatBytes(usage.resultBytes) }} ·
              {{ usage.estimatedAddedInputTokens.toLocaleString("ru-RU") }}
              токенов</strong
            >
          </div>
          <div>
            <span>Связанное потребление ИИ</span>
            <strong>
              {{ usage.exactAiUsage?.totalTokens.toLocaleString("ru-RU") ?? 0 }}
              токенов
              <template v-if="usage.exactAiUsage?.billedCostUsd">
                · ${{ usage.exactAiUsage.billedCostUsd }}
              </template>
              <template v-else-if="usage.exactAiUsage?.estimatedCostUsd">
                · ≈ ${{ usage.exactAiUsage.estimatedCostUsd }}
              </template>
            </strong>
          </div>
          <p>
            Вклад Event Query — оценка сериализованных данных. Токены и
            стоимость берутся из provider usage только для связанных Chat, Voice
            и AI Review запусков.
          </p>
        </div>

        <EventQueryPolicyWorkspace
          v-model="document"
          :definitions="definitions"
          :published-items="publishedItems"
          :diagnostics="diagnostics"
          :can-manage="canManage"
          @edited="diagnostics = []"
        />

        <div class="policy-actions">
          <Message
            v-for="violation in hardLimitViolations"
            :key="violation"
            severity="error"
            :closable="false"
          >
            {{ violation }}
          </Message>
          <Message
            v-for="diagnostic in globalDiagnostics"
            :key="`${diagnostic.code}:${diagnostic.location}`"
            class="global-diagnostic"
            severity="error"
            :closable="false"
          >
            <strong>{{ diagnostic.location }}</strong> —
            {{ diagnostic.message }}
          </Message>
          <div class="publish-impact" data-test="publish-impact">
            <strong>Влияние публикации</strong>
            <span>
              Добавлено {{ publishImpact.addedEvents }}, изменено
              {{ publishImpact.changedEvents }}, удалено
              {{ publishImpact.removedEvents
              }}<template v-if="publishImpact.enabledChanged"
                >, переключён master-доступ</template
              >.
            </span>
          </div>
          <Button
            data-test="save-policy"
            label="Проверить и сохранить черновик"
            icon="pi pi-save"
            severity="secondary"
            :loading="saving"
            :disabled="!canManage || loading"
            @click="save"
          />
          <Button
            data-test="publish-policy"
            label="Опубликовать"
            icon="pi pi-send"
            :loading="publishing"
            :disabled="!canPublish"
            @click="publishPolicy"
          />
          <small>
            Черновик {{ draftVersion || "ещё не создан" }} · максимум 50 типов
            событий, до 50 безопасных полей на тип.
          </small>
        </div>

        <EventQueryPreview
          v-if="canPreview && published?.document.enabled"
          :project-id="projectId"
          :items="published.document.items"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.policy-body,
.policy-loading {
  display: grid;
  gap: 16px;
  padding-top: 18px;
}
.revision-badge {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-size: 0.68rem;
  font-weight: 700;
}
.revision-badge.muted {
  background: var(--surface-subtle);
  color: var(--text-tertiary);
}
.publish-impact {
  display: grid;
  gap: 2px;
  width: 100%;
  color: var(--text-secondary);
  font-size: 0.82rem;
}
.publish-impact strong {
  color: var(--text-primary);
}
.master-control,
.policy-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.master-control {
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.master-control p,
.usage-card p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.switch-label {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}
.usage-card {
  display: grid;
  grid-template-columns: 0.55fr 1fr 1.3fr;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface-subtle);
}
.usage-card span,
.usage-card strong {
  display: block;
}
.usage-card span {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.usage-card p {
  grid-column: 1 / -1;
}
.policy-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}
.policy-actions small {
  color: var(--text-tertiary);
}
.global-diagnostic {
  flex-basis: 100%;
}
@media (max-width: 900px) {
  .usage-card {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .master-control {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
