<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import type {
  EventQueryPolicyStateResponseDto,
  EventQueryUsageResponseDto,
} from "@/shared/api/generated/models";
import ProjectSettingsSectionHeader from "@/shared/ui/ProjectSettingsSectionHeader.vue";
import { eventQueryRepository } from "../api/event-query-repository";
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
const success = ref("");
const state = ref<EventQueryPolicyStateResponseDto | null>(null);
const masterEnabled = ref(false);
const savedMasterEnabled = ref(false);
const usage = ref<EventQueryUsageResponseDto | null>(null);
let generation = 0;

const dirty = computed(
  () =>
    Boolean(state.value) && masterEnabled.value !== savedMasterEnabled.value,
);
const canPublish = computed(
  () =>
    props.canManage &&
    Boolean(state.value?.version) &&
    !dirty.value &&
    !saving.value &&
    !publishing.value,
);

function isCurrent(requestGeneration: number, projectId: string) {
  return requestGeneration === generation && projectId === props.projectId;
}

async function load() {
  const requestGeneration = ++generation;
  const projectId = props.projectId;
  loading.value = true;
  saving.value = false;
  publishing.value = false;
  error.value = "";
  success.value = "";
  state.value = null;
  usage.value = null;
  try {
    const nextState = await eventQueryRepository.getPolicy(projectId);
    if (!isCurrent(requestGeneration, projectId)) return;
    state.value = nextState;
    masterEnabled.value = nextState.masterEnabled;
    savedMasterEnabled.value = nextState.masterEnabled;
    if (props.canPreview) void loadUsage(projectId, requestGeneration);
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId)) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить политику";
  } finally {
    if (isCurrent(requestGeneration, projectId)) loading.value = false;
  }
}

async function loadUsage(projectId: string, requestGeneration: number) {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
  try {
    const response = await eventQueryRepository.usage(projectId, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (isCurrent(requestGeneration, projectId)) usage.value = response;
  } catch {
    if (isCurrent(requestGeneration, projectId)) usage.value = null;
  }
}

async function save() {
  const current = state.value;
  if (!props.canManage || !current || !dirty.value || saving.value) return;
  const requestGeneration = generation;
  const projectId = props.projectId;
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const response = await eventQueryRepository.patchProject(projectId, {
      expectedVersion: current.version,
      masterEnabled: masterEnabled.value,
    });
    if (!isCurrent(requestGeneration, projectId)) return;
    state.value = {
      ...current,
      version: response.version,
      masterEnabled: response.masterEnabled,
    };
    masterEnabled.value = response.masterEnabled;
    savedMasterEnabled.value = response.masterEnabled;
    success.value = "Черновик master-настройки сохранён.";
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId)) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось сохранить master-настройку";
  } finally {
    if (isCurrent(requestGeneration, projectId)) saving.value = false;
  }
}

async function publish() {
  const current = state.value;
  if (!current || !canPublish.value) return;
  const requestGeneration = generation;
  const projectId = props.projectId;
  publishing.value = true;
  error.value = "";
  success.value = "";
  try {
    await eventQueryRepository.publish(projectId, {
      expectedVersion: current.version,
    });
    if (!isCurrent(requestGeneration, projectId)) return;
    const next = await eventQueryRepository.getPolicy(projectId);
    if (!isCurrent(requestGeneration, projectId)) return;
    state.value = next;
    masterEnabled.value = next.masterEnabled;
    savedMasterEnabled.value = next.masterEnabled;
    success.value = "Master-настройка опубликована.";
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId)) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось опубликовать master-настройку";
  } finally {
    if (isCurrent(requestGeneration, projectId)) publishing.value = false;
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
      title="Доступ AI к событиям"
      description="Master-настройка, безопасный preview и потребление Event Query."
      icon="pi pi-shield"
      tone="violet"
      content-id="event-query-policy-settings"
    >
      <template #actions>
        <span v-if="state?.currentRevision" class="revision-badge">
          Опубликована ревизия {{ state.currentRevision.version }}
        </span>
        <span v-else class="revision-badge muted">Не опубликовано</span>
      </template>
    </ProjectSettingsSectionHeader>

    <div id="event-query-policy-settings" v-show="expanded" class="policy-body">
      <Message v-if="error" severity="error" :closable="false">
        {{ error }}
        <Button label="Повторить" text size="small" @click="load" />
      </Message>
      <Message v-if="success" severity="success" :closable="false">{{
        success
      }}</Message>
      <div v-if="loading" class="policy-loading">
        <Skeleton height="5rem" />
        <Skeleton height="7rem" />
      </div>
      <template v-else-if="state">
        <div class="master-control">
          <div>
            <strong>Разрешить AI доступ к событиям проекта</strong>
            <p>
              Это общий выключатель. Разрешения и безопасные поля настраиваются
              отдельно внутри каждого события.
            </p>
          </div>
          <label class="switch-label">
            <input
              v-model="masterEnabled"
              type="checkbox"
              :disabled="!canManage || saving || publishing"
            />
            {{ masterEnabled ? "Включено" : "Выключено" }}
          </label>
        </div>

        <div class="policy-summary">
          <div>
            <span>Настроено событий</span>
            <strong>{{ state.counts.configuredDraftItems ?? 0 }}</strong>
          </div>
          <div>
            <span>Доступно внутреннему AI</span>
            <strong>{{ state.counts.enabledDraftItems ?? 0 }}</strong>
          </div>
          <div>
            <span>Доступно в Chat/Voice</span>
            <strong>{{
              state.counts.endUserConversationDraftItems ?? 0
            }}</strong>
          </div>
          <RouterLink v-if="canReadCatalog !== false" :to="{ name: 'events' }">
            Настроить события
          </RouterLink>
        </div>

        <Message
          v-for="diagnostic in state.diagnostics"
          :key="`${diagnostic.code}:${diagnostic.location}`"
          severity="error"
          :closable="false"
        >
          <strong>{{ diagnostic.location }}</strong> — {{ diagnostic.message }}
        </Message>

        <div class="master-actions">
          <span v-if="dirty"
            >Есть неопубликованное изменение master-доступа</span
          >
          <Button
            data-test="save-policy"
            label="Сохранить"
            severity="secondary"
            :loading="saving"
            :disabled="!dirty || !canManage || publishing"
            @click="save"
          />
          <Button
            data-test="publish-policy"
            label="Опубликовать"
            :loading="publishing"
            :disabled="!canPublish"
            @click="publish"
          />
        </div>

        <div v-if="usage" class="usage-card">
          <div>
            <span>Запросы за 30 дней</span><strong>{{ usage.calls }}</strong>
          </div>
          <div>
            <span>Данные событий: оценка вклада</span>
            <strong>
              {{ formatBytes(usage.resultBytes) }} ·
              {{ usage.estimatedAddedInputTokens.toLocaleString("ru-RU") }}
              токенов
            </strong>
          </div>
          <div>
            <span>Связанное потребление AI</span>
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
            Оценочный вклад данных не прибавляется повторно к точным provider
            tokens и стоимости.
          </p>
        </div>

        <EventQueryPreview v-if="canPreview" :project-id="projectId" />
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
.master-control,
.master-actions {
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
.policy-summary,
.usage-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface-subtle);
}
.policy-summary span,
.policy-summary strong,
.usage-card span,
.usage-card strong {
  display: block;
}
.policy-summary span,
.usage-card span {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.policy-summary a {
  align-self: center;
  justify-self: end;
}
.usage-card p {
  grid-column: 1 / -1;
}
.master-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}
.master-actions span {
  margin-right: auto;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
@media (max-width: 900px) {
  .policy-summary,
  .usage-card {
    grid-template-columns: 1fr;
  }
  .policy-summary a {
    justify-self: start;
  }
}
@media (max-width: 600px) {
  .master-control {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
