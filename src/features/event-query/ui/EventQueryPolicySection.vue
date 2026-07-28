<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import type {
  EventQueryPolicyDiagnosticDto,
  EventQueryPolicyDocumentDto,
  EventQueryPolicyItemDto,
  EventQueryPolicyRevisionResponseDto,
  EventQueryUsageResponseDto,
} from "@/shared/api/generated/models";
import { eventCatalogRepository } from "@/shared/api/repository/event-catalog";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog/event-catalog-contract";
import ProjectSettingsSectionHeader from "@/shared/ui/ProjectSettingsSectionHeader.vue";
import { eventQueryRepository } from "../api/event-query-repository";
import {
  eventPolicyState,
  flattenSchemaFields,
} from "../model/event-query-policy";
import EventQueryEventEditor from "./EventQueryEventEditor.vue";
import EventQueryPreview from "./EventQueryPreview.vue";

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
const selectedCode = ref("");
const usage = ref<EventQueryUsageResponseDto | null>(null);
let loadGeneration = 0;

const selectedDefinition = computed(() =>
  definitions.value.find(
    (definition) => definition.code === selectedCode.value,
  ),
);
const selectedItemIndex = computed(() =>
  document.value.items.findIndex(
    (item) => item.stableCode === selectedCode.value,
  ),
);
const selectedItem = computed(
  () => document.value.items[selectedItemIndex.value] ?? null,
);
const publishedItems = computed(() => published.value?.document.items ?? []);
const documentSnapshot = computed(() => JSON.stringify(document.value));
const globalDiagnostics = computed(() =>
  diagnostics.value.filter(
    (diagnostic) => !diagnostic.location.startsWith("items["),
  ),
);
const canPublish = computed(
  () =>
    props.canManage &&
    draftVersion.value > 0 &&
    documentSnapshot.value === savedDocumentSnapshot.value &&
    diagnostics.value.length === 0 &&
    !saving.value &&
    !publishing.value,
);

function cloneDocument(value: EventQueryPolicyDocumentDto) {
  return JSON.parse(JSON.stringify(value)) as EventQueryPolicyDocumentDto;
}

function defaultItem(
  definition: EventCatalogDefinition,
): EventQueryPolicyItemDto {
  return {
    stableCode: definition.code,
    descriptionForAI:
      definition.metadata.description ??
      `Событие «${definition.metadata.name}».`,
    allowedModes: ["SUMMARY"],
    maxInteractiveLookbackHours: 168,
    maxVerificationLookbackHours: 720,
    safeFields: [],
  };
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
  selectedCode.value = "";
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
    selectedCode.value =
      document.value.items[0]?.stableCode ?? definitions.value[0]?.code ?? "";
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

function selectDefinition(definition: EventCatalogDefinition) {
  selectedCode.value = definition.code;
}

function setDefinitionEnabled(
  definition: EventCatalogDefinition,
  enabled: boolean,
) {
  const items = document.value.items.filter(
    (item) => item.stableCode !== definition.code,
  );
  if (enabled) items.push(defaultItem(definition));
  document.value = { ...document.value, items };
  diagnostics.value = [];
  selectedCode.value = definition.code;
}

function updateSelectedItem(value: EventQueryPolicyItemDto) {
  if (selectedItemIndex.value < 0) return;
  document.value = {
    ...document.value,
    items: document.value.items.map((item, index) =>
      index === selectedItemIndex.value ? value : item,
    ),
  };
  diagnostics.value = [];
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

function status(definition: EventCatalogDefinition) {
  return eventPolicyState(
    definition.code,
    document.value.items,
    publishedItems.value,
    diagnostics.value,
  );
}

function diagnosticsForSelected() {
  if (selectedItemIndex.value < 0) return [];
  return diagnostics.value.filter((diagnostic) =>
    diagnostic.location.startsWith(`items[${selectedItemIndex.value}]`),
  );
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
          <p>
            Это оценка сериализованных данных, не точная цена. Точное
            потребление ответа ИИ смотрите в связанной AI-сессии.
          </p>
        </div>

        <div class="policy-workspace">
          <nav aria-label="Типы событий" class="definition-list">
            <button
              v-for="definition in definitions"
              :key="definition.definitionKeyId"
              type="button"
              :class="{ selected: selectedCode === definition.code }"
              @click="selectDefinition(definition)"
            >
              <span>
                <strong>{{ definition.metadata.name }}</strong>
                <code>{{ definition.code }}</code>
              </span>
              <span class="policy-state" :data-state="status(definition)">
                {{ status(definition) }}
              </span>
            </button>
          </nav>

          <div v-if="selectedDefinition" class="definition-editor">
            <div class="definition-heading">
              <div>
                <h4>{{ selectedDefinition.metadata.name }}</h4>
                <code>{{ selectedDefinition.code }}</code>
              </div>
              <label>
                <input
                  type="checkbox"
                  :checked="Boolean(selectedItem)"
                  :disabled="!canManage"
                  @change="
                    setDefinitionEnabled(
                      selectedDefinition,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
                Доступно ИИ
              </label>
            </div>
            <div class="schema-summary">
              <span
                v-for="field in flattenSchemaFields(
                  selectedDefinition.currentSchema.payloadSchema,
                )"
                :key="field.path"
              >
                <code>{{ field.path }}</code> {{ field.schemaType }}
              </span>
            </div>
            <EventQueryEventEditor
              v-if="selectedItem"
              :model-value="selectedItem"
              :schema-fields="
                flattenSchemaFields(
                  selectedDefinition.currentSchema.payloadSchema,
                )
              "
              :disabled="!canManage"
              @update:model-value="updateSelectedItem"
            />
            <Message v-else severity="secondary" :closable="false">
              Этот Event Definition не передаётся модели и не может быть выбран
              для AI Review или проверки обращения.
            </Message>
            <Message
              v-for="diagnostic in diagnosticsForSelected()"
              :key="`${diagnostic.code}:${diagnostic.location}`"
              severity="error"
              :closable="false"
            >
              <strong>{{ diagnostic.location }}</strong> —
              {{ diagnostic.message }}
            </Message>
          </div>
        </div>

        <div class="policy-actions">
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
.revision-badge,
.policy-state {
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
.master-control,
.definition-heading,
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
.policy-workspace {
  display: grid;
  grid-template-columns: minmax(210px, 0.7fr) minmax(0, 1.7fr);
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 16px;
}
.definition-list {
  padding: 8px;
  border-right: 1px solid var(--border-default);
  background: var(--surface-subtle);
}
.definition-list button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.definition-list button.selected {
  background: var(--surface-card);
  box-shadow: var(--shadow-xs);
}
.definition-list button > span:first-child,
.definition-list strong,
.definition-list code {
  display: block;
  min-width: 0;
}
.definition-list code {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 0.66rem;
  text-overflow: ellipsis;
}
.policy-state[data-state="disabled"] {
  background: var(--surface-muted);
  color: var(--text-tertiary);
}
.policy-state[data-state="draft"] {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.policy-state[data-state="invalid"] {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.policy-state[data-state="published"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.definition-editor {
  display: grid;
  min-width: 0;
  gap: 14px;
  padding: 18px;
}
.definition-heading h4 {
  margin: 0 0 3px;
}
.schema-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.schema-summary span {
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-tertiary);
  font-size: 0.66rem;
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
  .policy-workspace,
  .usage-card {
    grid-template-columns: 1fr;
  }
  .definition-list {
    border-right: 0;
    border-bottom: 1px solid var(--border-default);
  }
}
@media (max-width: 600px) {
  .master-control,
  .definition-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
