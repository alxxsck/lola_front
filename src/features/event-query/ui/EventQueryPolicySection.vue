<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import ToggleSwitch from "primevue/toggleswitch";
import type { EventQueryPolicyStateResponseDto } from "@/shared/api/generated/models";
import ProjectSettingsSectionHeader from "@/shared/ui/ProjectSettingsSectionHeader.vue";
import { eventQueryRepository } from "../api/event-query-repository";
import EventQueryPreview from "./EventQueryPreview.vue";

const props = defineProps<{
  projectId: string;
  canManage: boolean;
  canPreview: boolean;
}>();

const expanded = ref(false);
const loading = ref(true);
const applying = ref(false);
const applyPending = ref(false);
const error = ref("");
const success = ref("");
const state = ref<EventQueryPolicyStateResponseDto | null>(null);
const masterEnabled = ref(false);
const savedMasterEnabled = ref(false);
let generation = 0;

const dirty = computed(
  () =>
    Boolean(state.value) && masterEnabled.value !== savedMasterEnabled.value,
);
const canApply = computed(
  () =>
    props.canManage &&
    Boolean(state.value) &&
    (dirty.value || applyPending.value) &&
    !applying.value,
);

function isCurrent(requestGeneration: number, projectId: string) {
  return requestGeneration === generation && projectId === props.projectId;
}

async function load() {
  const requestGeneration = ++generation;
  const projectId = props.projectId;
  loading.value = true;
  applying.value = false;
  applyPending.value = false;
  error.value = "";
  success.value = "";
  state.value = null;
  try {
    const nextState = await eventQueryRepository.getPolicy(projectId);
    if (!isCurrent(requestGeneration, projectId)) return;
    state.value = nextState;
    masterEnabled.value = nextState.masterEnabled;
    savedMasterEnabled.value = nextState.masterEnabled;
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId)) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить настройку";
  } finally {
    if (isCurrent(requestGeneration, projectId)) loading.value = false;
  }
}

async function apply() {
  const current = state.value;
  if (!current || !canApply.value) return;
  const requestGeneration = generation;
  const projectId = props.projectId;
  applying.value = true;
  error.value = "";
  success.value = "";
  try {
    let expectedVersion = current.version;
    if (dirty.value) {
      const response = await eventQueryRepository.patchProject(projectId, {
        expectedVersion,
        masterEnabled: masterEnabled.value,
      });
      if (!isCurrent(requestGeneration, projectId)) return;
      expectedVersion = response.version;
      state.value = {
        ...current,
        version: response.version,
        masterEnabled: response.masterEnabled,
      };
      savedMasterEnabled.value = response.masterEnabled;
      applyPending.value = true;
    }

    await eventQueryRepository.publish(projectId, { expectedVersion });
    if (!isCurrent(requestGeneration, projectId)) return;
    const next = await eventQueryRepository.getPolicy(projectId);
    if (!isCurrent(requestGeneration, projectId)) return;
    state.value = next;
    masterEnabled.value = next.masterEnabled;
    savedMasterEnabled.value = next.masterEnabled;
    applyPending.value = false;
    success.value = masterEnabled.value
      ? "Доступ AI к событиям включён."
      : "Доступ AI к событиям выключен.";
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId)) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось применить настройку доступа";
  } finally {
    if (isCurrent(requestGeneration, projectId)) applying.value = false;
  }
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
      description="Общий доступ к событиям и безопасная проверка данных."
      icon="pi pi-shield"
      tone="violet"
      content-id="event-query-policy-settings"
    />

    <div id="event-query-policy-settings" v-show="expanded" class="policy-body">
      <Message v-if="error" severity="error" :closable="false">
        {{ error }}
        <Button
          v-if="applyPending"
          label="Повторить"
          text
          size="small"
          @click="apply"
        />
        <Button v-else label="Обновить" text size="small" @click="load" />
      </Message>
      <Message v-if="success" severity="success" :closable="false">
        {{ success }}
      </Message>

      <div v-if="loading" class="policy-loading">
        <Skeleton height="6rem" />
        <Skeleton height="12rem" />
      </div>

      <template v-else-if="state">
        <div class="master-control">
          <div>
            <strong>Разрешить AI получать данные событий</strong>
            <p>
              Это общий выключатель проекта. Доступ к конкретным событиям и
              полям настраивается внутри каждого события.
            </p>
          </div>
          <div class="master-toggle">
            <span>{{ masterEnabled ? "Включено" : "Выключено" }}</span>
            <ToggleSwitch
              v-model="masterEnabled"
              input-id="event-query-master-enabled"
              data-test="event-query-master-enabled"
              :disabled="!canManage || applying"
              aria-label="Разрешить AI получать данные событий"
            />
          </div>
        </div>

        <footer v-if="canManage" class="master-actions">
          <span>
            {{
              dirty || applyPending
                ? "Изменение ещё не применено"
                : "Настройка действует в проекте"
            }}
          </span>
          <Button
            data-test="apply-policy"
            label="Применить"
            icon="pi pi-check"
            :loading="applying"
            :disabled="!canApply"
            @click="apply"
          />
        </footer>

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
.master-control,
.master-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.master-control {
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.master-control p {
  max-width: 760px;
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.5;
}
.master-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}
.master-toggle span {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
}
.master-actions {
  justify-content: flex-end;
}
.master-actions span {
  margin-right: auto;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
@media (max-width: 600px) {
  .master-control,
  .master-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .master-toggle {
    width: 100%;
    justify-content: space-between;
  }
  .master-actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
