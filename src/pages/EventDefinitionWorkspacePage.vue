<script setup lang="ts">
import Dialog from "primevue/dialog";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import EventDefinitionHistory from "@/features/events/EventDefinitionHistory.vue";
import EventSchemaAuthoring from "@/features/events/EventSchemaAuthoring.vue";
import { ApiError } from "@/shared/api/http/api-error";
import {
  applyEventMetadataUpdate,
  eventCatalogRepository,
  type EventCatalogDefinition,
  type EventDefinitionUsage,
} from "@/shared/api/repository/event-catalog";

type WorkspaceSection = "overview" | "policy" | "schema" | "usage";
const workspaceSections: WorkspaceSection[] = [
  "overview",
  "policy",
  "schema",
  "usage",
];

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
const activeSection = ref<WorkspaceSection>("overview");
const linkedRevisionId = computed(() =>
  typeof route.query?.revisionId === "string"
    ? route.query.revisionId
    : undefined,
);
const usage = ref<EventDefinitionUsage | null>(null);
const usageLoading = ref(false);
const usageError = ref("");
const mutationPending = ref(false);
const mutationError = ref("");
const archiveDialogVisible = ref(false);
const deleteDialogVisible = ref(false);
const disableDialogVisible = ref(false);
const archiveReason = ref("");
const deleteReason = ref("");
const deleteConfirmation = ref("");
const policyEnabled = ref(false);
const policyClientIngestible = ref(false);
const policyCountsAsActivity = ref(false);
const policyReason = ref("");
const policyConflictServer = ref<EventCatalogDefinition["policy"] | null>(null);
interface PolicyCommandSnapshot {
  projectId: string;
  definitionKeyId: string;
  generation: number;
  enabled: boolean;
  clientIngestible: boolean;
  countsAsActivity: boolean;
  expectedVersion: number;
  reason: string;
}
const pendingDisablePolicy = ref<PolicyCommandSnapshot | null>(null);
let definitionRequestId = 0;
let usageRequestId = 0;
let workspaceGeneration = 0;

const definitionKeyId = computed(() =>
  String(route.params.definitionKeyId ?? ""),
);
const canEdit = computed(
  () =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.event_catalog.write",
    ) && !definition.value?.readOnly,
);
const canManageLifecycle = computed(
  () =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.event_catalog.write",
    ) && definition.value?.origin === "CUSTOM",
);
const canPublish = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.event_catalog.publish",
  ),
);
const isArchived = computed(() => definition.value?.lifecycle === "ARCHIVED");
const hasMetadataConcurrencyToken = computed(() =>
  Boolean(definition.value?.metadata.concurrencyToken),
);
const isDirty = computed(
  () =>
    Boolean(definition.value) &&
    (name.value !== definition.value?.metadata.name ||
      description.value !== (definition.value?.metadata.description ?? "")),
);
const isPolicyDirty = computed(
  () =>
    Boolean(definition.value) &&
    (policyEnabled.value !== definition.value?.policy.enabled ||
      policyClientIngestible.value !==
        definition.value?.policy.clientIngestible ||
      policyCountsAsActivity.value !==
        definition.value?.policy.countsAsActivity),
);
onMounted(loadDefinition);
watch(
  () => [auth.project?.id, definitionKeyId.value],
  ([projectId, key], [previousProjectId, previousKey]) => {
    if (projectId === previousProjectId && key === previousKey) return;
    resetWorkspace();
    void loadDefinition();
  },
);

function resetWorkspace() {
  workspaceGeneration += 1;
  definitionRequestId += 1;
  usageRequestId += 1;
  definition.value = null;
  usage.value = null;
  loading.value = false;
  usageLoading.value = false;
  saving.value = false;
  mutationPending.value = false;
  archiveDialogVisible.value = false;
  deleteDialogVisible.value = false;
  disableDialogVisible.value = false;
  mutationError.value = "";
  loadError.value = "";
  saveError.value = "";
  usageError.value = "";
  success.value = "";
  archiveReason.value = "";
  deleteReason.value = "";
  deleteConfirmation.value = "";
  policyEnabled.value = false;
  policyClientIngestible.value = false;
  policyCountsAsActivity.value = false;
  policyReason.value = "";
  policyConflictServer.value = null;
  pendingDisablePolicy.value = null;
}

watch(disableDialogVisible, (visible) => {
  if (!visible && !mutationPending.value) pendingDisablePolicy.value = null;
});

async function loadDefinition() {
  const projectId = auth.project?.id;
  const key = definitionKeyId.value;
  if (!projectId || !key) return;
  const requestId = ++definitionRequestId;
  loading.value = true;
  loadError.value = "";
  try {
    const loaded = await eventCatalogRepository.getDefinition(projectId, key);
    if (!isCurrentRequest(projectId, key, requestId, definitionRequestId))
      return;
    definition.value = loaded;
    syncPolicyForm(loaded);
    name.value = loaded.metadata.name;
    description.value = loaded.metadata.description ?? "";
    usage.value = null;
    void loadUsage();
  } catch (cause) {
    if (!isCurrentRequest(projectId, key, requestId, definitionRequestId))
      return;
    loadError.value = errorMessage(cause, "Не удалось загрузить событие");
  } finally {
    if (isCurrentRequest(projectId, key, requestId, definitionRequestId)) {
      loading.value = false;
    }
  }
}

async function handleSchemaPublished() {
  await loadDefinition();
  activeSection.value = "schema";
  success.value = "Опубликована новая версия схемы.";
}

async function handleSchemaPublicationUncertain(revisionNumber: number) {
  await loadDefinition();
  activeSection.value = "schema";
  mutationError.value = `На сервере наблюдается схема v${revisionNumber}, совпадающая с отправленным черновиком, но потерянный ответ не позволяет приписать публикацию этой команде. Проверьте историю и audit log.`;
}

async function handleSchemaDefinitionCreated(created: EventCatalogDefinition) {
  await router.push({
    name: "event-definition-workspace",
    params: { definitionKeyId: created.definitionKeyId },
  });
}

async function saveMetadata() {
  const projectId = auth.project?.id;
  const current = definition.value;
  const generation = workspaceGeneration;
  const nextName = name.value.trim();
  if (!projectId || !current || !canEdit.value || saving.value) return;
  saveError.value = "";
  success.value = "";
  if (!nextName) {
    saveError.value = "Укажите название события.";
    return;
  }
  if (!current.metadata.concurrencyToken) {
    saveError.value =
      "Сервер не предоставил данные для безопасного сохранения. Обновите страницу или повторите позже.";
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
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    if (!result.schemaRevisionUnchanged) {
      throw new Error(
        "Ответ сервера нарушает правило сохранения без новой версии схемы",
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
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    saveError.value = errorMessage(cause, "Не удалось сохранить изменения");
  } finally {
    if (isCurrentWorkspace(projectId, current.definitionKeyId, generation)) {
      saving.value = false;
    }
  }
}

async function selectSection(section: WorkspaceSection) {
  activeSection.value = section;
  if (section !== "usage" || usage.value || usageLoading.value) return;
  await loadUsage();
}

function handleTabKeydown(event: KeyboardEvent, section: WorkspaceSection) {
  const currentIndex = workspaceSections.indexOf(section);
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % workspaceSections.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex =
      (currentIndex - 1 + workspaceSections.length) % workspaceSections.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = workspaceSections.length - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  const next = workspaceSections[nextIndex];
  void selectSection(next);
  requestAnimationFrame(() =>
    document.getElementById(`event-tab-${next}`)?.focus(),
  );
}

async function loadUsage() {
  const projectId = auth.project?.id;
  const current = definition.value;
  if (!projectId || !current) return null;
  const key = current.definitionKeyId;
  const requestId = ++usageRequestId;
  usageLoading.value = true;
  usageError.value = "";
  try {
    const loaded = await eventCatalogRepository.getUsage(projectId, key);
    if (!isCurrentRequest(projectId, key, requestId, usageRequestId))
      return null;
    usage.value = loaded;
    return usage.value;
  } catch (cause) {
    if (!isCurrentRequest(projectId, key, requestId, usageRequestId))
      return null;
    usageError.value = errorMessage(
      cause,
      "Не удалось загрузить сведения об использовании",
    );
    return null;
  } finally {
    if (isCurrentRequest(projectId, key, requestId, usageRequestId)) {
      usageLoading.value = false;
    }
  }
}

function isCurrentRequest(
  projectId: string,
  key: string,
  requestId: number,
  currentRequestId: number,
) {
  return (
    requestId === currentRequestId &&
    isCurrentWorkspace(projectId, key, workspaceGeneration)
  );
}

function isCurrentWorkspace(
  projectId: string,
  key: string,
  generation: number,
) {
  return (
    generation === workspaceGeneration &&
    auth.project?.id === projectId &&
    definitionKeyId.value === key
  );
}

async function prepareArchive() {
  mutationError.value = "";
  const currentUsage = await loadUsage();
  if (!currentUsage) return;
  archiveDialogVisible.value = true;
}

async function prepareDelete() {
  mutationError.value = "";
  deleteConfirmation.value = "";
  const currentUsage = await loadUsage();
  if (!currentUsage) return;
  deleteDialogVisible.value = true;
}

function syncPolicyForm(current: EventCatalogDefinition) {
  policyEnabled.value = current.policy.enabled;
  policyClientIngestible.value = current.policy.clientIngestible;
  policyCountsAsActivity.value = current.policy.countsAsActivity;
  policyReason.value = "";
}

async function requestPolicyChange() {
  const current = definition.value;
  if (
    !current ||
    isArchived.value ||
    mutationPending.value ||
    !isPolicyDirty.value ||
    !policyReason.value.trim()
  )
    return;
  mutationError.value = "";
  const command: PolicyCommandSnapshot = {
    projectId: current.projectId,
    definitionKeyId: current.definitionKeyId,
    generation: workspaceGeneration,
    enabled: policyEnabled.value,
    clientIngestible: policyClientIngestible.value,
    countsAsActivity: policyCountsAsActivity.value,
    expectedVersion: current.policy.version,
    reason: policyReason.value.trim(),
  };
  if (current.policy.enabled && !policyEnabled.value) {
    mutationPending.value = true;
    const currentUsage = await loadUsage();
    mutationPending.value = false;
    if (!currentUsage) return;
    if (
      !isCurrentWorkspace(
        command.projectId,
        command.definitionKeyId,
        command.generation,
      )
    )
      return;
    pendingDisablePolicy.value = command;
    disableDialogVisible.value = true;
    return;
  }
  await executePolicyChange(command);
}

async function applyPolicyChange() {
  const command = pendingDisablePolicy.value;
  if (!command) return;
  await executePolicyChange(command);
}

async function executePolicyChange(command: PolicyCommandSnapshot) {
  const projectId = command.projectId;
  const current = definition.value;
  const generation = command.generation;
  if (
    !current ||
    mutationPending.value ||
    !isCurrentWorkspace(projectId, command.definitionKeyId, generation)
  )
    return;
  const attemptedPolicy = {
    enabled: command.enabled,
    clientIngestible: command.clientIngestible,
    countsAsActivity: command.countsAsActivity,
    reason: command.reason,
  };
  mutationPending.value = true;
  mutationError.value = "";
  success.value = "";
  try {
    await eventCatalogRepository.updatePolicy(
      projectId,
      command.definitionKeyId,
      {
        enabled: command.enabled,
        clientIngestible: command.clientIngestible,
        countsAsActivity: command.countsAsActivity,
        expectedVersion: command.expectedVersion,
        reason: command.reason,
      },
    );
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    const reloaded = await eventCatalogRepository.getDefinition(
      projectId,
      command.definitionKeyId,
    );
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    if (
      reloaded.policy.enabled !== command.enabled ||
      reloaded.policy.clientIngestible !== command.clientIngestible ||
      reloaded.policy.countsAsActivity !== command.countsAsActivity ||
      reloaded.policy.version <= command.expectedVersion
    ) {
      throw new Error("Сервер не подтвердил изменение приёма событий");
    }
    definition.value = reloaded;
    syncPolicyForm(reloaded);
    usage.value = null;
    disableDialogVisible.value = false;
    pendingDisablePolicy.value = null;
    success.value = "Правила приёма событий обновлены без новой версии схемы.";
    policyConflictServer.value = null;
  } catch (cause) {
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    if (cause instanceof ApiError && cause.code === "EVENT_POLICY_CONFLICT") {
      try {
        const reloaded = await eventCatalogRepository.getDefinition(
          projectId,
          current.definitionKeyId,
        );
        if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
          return;
        definition.value = reloaded;
        policyConflictServer.value = reloaded.policy;
        usage.value = null;
        disableDialogVisible.value = false;
        pendingDisablePolicy.value = null;
        policyEnabled.value = attemptedPolicy.enabled;
        policyClientIngestible.value = attemptedPolicy.clientIngestible;
        policyCountsAsActivity.value = attemptedPolicy.countsAsActivity;
        policyReason.value = attemptedPolicy.reason;
        mutationError.value =
          `Правила на сервере уже обновлены до v${reloaded.policy.version}. ` +
          "Ваши значения и причина сохранены — проверьте их и повторите сохранение.";
        void loadUsage();
      } catch {
        mutationError.value =
          "Правила были изменены другим администратором. Ваши локальные значения сохранены, но актуальную версию сервера загрузить не удалось.";
      }
    } else {
      await recoverConflict(cause);
      mutationError.value = errorMessage(
        cause,
        "Не удалось изменить приём событий",
      );
    }
  } finally {
    if (isCurrentWorkspace(projectId, current.definitionKeyId, generation)) {
      mutationPending.value = false;
    }
  }
}

async function archiveDefinition() {
  const projectId = auth.project?.id;
  const current = definition.value;
  const currentUsage = usage.value;
  const generation = workspaceGeneration;
  if (
    !projectId ||
    !current ||
    !currentUsage?.canArchive ||
    mutationPending.value
  )
    return;
  mutationPending.value = true;
  mutationError.value = "";
  try {
    await eventCatalogRepository.archive(projectId, current.definitionKeyId, {
      expectedLifecycleVersion: currentUsage.lifecycleVersion,
      expectedPolicyVersion: currentUsage.policyVersion,
      reason: archiveReason.value.trim() || undefined,
    });
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    const [active, archived] = await Promise.all([
      eventCatalogRepository.listDefinitions(projectId, "ACTIVE"),
      eventCatalogRepository.listDefinitions(projectId, "ARCHIVED"),
    ]);
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    const absentFromActive = !active.some(
      (item) => item.definitionKeyId === current.definitionKeyId,
    );
    const archivedDefinition = archived.find(
      (item) => item.definitionKeyId === current.definitionKeyId,
    );
    if (
      !absentFromActive ||
      !archivedDefinition ||
      archivedDefinition.policy.enabled
    ) {
      throw new Error("Сервер не подтвердил перемещение события в архив");
    }
    archiveDialogVisible.value = false;
    await router.push({ name: "events", query: { lifecycle: "ARCHIVED" } });
  } catch (cause) {
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    await recoverConflict(cause);
    mutationError.value = errorMessage(
      cause,
      "Не удалось архивировать событие",
    );
  } finally {
    if (isCurrentWorkspace(projectId, current.definitionKeyId, generation)) {
      mutationPending.value = false;
    }
  }
}

async function restoreDefinition() {
  const projectId = auth.project?.id;
  const current = definition.value;
  const generation = workspaceGeneration;
  if (!projectId || !current || !isArchived.value || mutationPending.value)
    return;
  mutationPending.value = true;
  mutationError.value = "";
  success.value = "";
  try {
    const currentUsage = await loadUsage();
    if (!currentUsage) return;
    await eventCatalogRepository.restore(projectId, current.definitionKeyId, {
      expectedLifecycleVersion: currentUsage.lifecycleVersion,
      reason: "Restored from CMS workspace",
    });
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    const active = await eventCatalogRepository.listDefinitions(
      projectId,
      "ACTIVE",
    );
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    const restored = active.find(
      (item) => item.definitionKeyId === current.definitionKeyId,
    );
    if (
      !restored ||
      restored.lifecycle !== "ACTIVE" ||
      restored.policy.enabled
    ) {
      throw new Error(
        "Сервер не подтвердил восстановление с выключенным приёмом событий",
      );
    }
    definition.value = restored;
    usage.value = null;
    success.value =
      "Событие восстановлено. Приём новых событий остаётся выключенным.";
  } catch (cause) {
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    await recoverConflict(cause);
    mutationError.value = errorMessage(
      cause,
      "Не удалось восстановить событие",
    );
  } finally {
    if (isCurrentWorkspace(projectId, current.definitionKeyId, generation)) {
      mutationPending.value = false;
    }
  }
}

async function deleteDefinition() {
  const projectId = auth.project?.id;
  const current = definition.value;
  const currentUsage = usage.value;
  const generation = workspaceGeneration;
  if (
    !projectId ||
    !current ||
    !currentUsage?.canDelete ||
    mutationPending.value ||
    deleteConfirmation.value !== current.code ||
    !deleteReason.value.trim()
  )
    return;
  mutationPending.value = true;
  mutationError.value = "";
  try {
    await eventCatalogRepository.hardDelete(
      projectId,
      current.definitionKeyId,
      {
        expectedLifecycleVersion: currentUsage.lifecycleVersion,
        expectedPolicyVersion: currentUsage.policyVersion,
        reason: deleteReason.value.trim(),
      },
    );
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    const lifecycle = current.lifecycle;
    const remaining = await eventCatalogRepository.listDefinitions(
      projectId,
      lifecycle,
    );
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    if (
      remaining.some((item) => item.definitionKeyId === current.definitionKeyId)
    ) {
      throw new Error("Сервер не подтвердил физическое удаление события");
    }
    deleteDialogVisible.value = false;
    await router.push({
      name: "events",
      query: lifecycle === "ARCHIVED" ? { lifecycle } : {},
    });
  } catch (cause) {
    if (!isCurrentWorkspace(projectId, current.definitionKeyId, generation))
      return;
    await recoverConflict(cause);
    mutationError.value = errorMessage(cause, "Не удалось удалить событие");
  } finally {
    if (isCurrentWorkspace(projectId, current.definitionKeyId, generation)) {
      mutationPending.value = false;
    }
  }
}

async function recoverConflict(cause: unknown) {
  if (!(cause instanceof ApiError) || cause.status !== 409) return;
  await loadDefinition();
  await loadUsage();
}

function blockerLabel(blocker: string) {
  return (
    {
      SCENARIO_DEPENDENCIES: "Событие используется в сценариях или их истории",
      ACTIVE_WAITS: "Есть активные ожидания события",
      EVENT_LOGS: "Существуют записанные Event Logs",
    }[blocker] ?? blocker
  );
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
      Загружаем событие…
    </div>

    <div v-else-if="loadError" class="workspace-error card" role="alert">
      <strong>Страница события недоступна</strong>
      <span>{{ loadError }}</span>
      <button type="button" class="secondary-button" @click="loadDefinition">
        Повторить
      </button>
    </div>

    <template v-else-if="definition">
      <header class="workspace-header">
        <div>
          <div class="eyebrow">Событие</div>
          <h1>{{ definition.metadata.name }}</h1>
          <div class="identity-line">
            <code data-test="event-code">{{ definition.code }}</code>
            <span data-test="schema-revision"
              >Схема v{{ definition.currentSchema.revisionNumber }}</span
            >
          </div>
        </div>
        <div class="header-actions">
          <span
            class="lifecycle-badge"
            :class="{ archived: isArchived }"
            data-test="lifecycle-state"
          >
            {{
              isArchived
                ? "В архиве"
                : definition.policy.enabled
                  ? "Включено"
                  : "Выключено"
            }}
          </span>
          <template v-if="canManageLifecycle">
            <button
              v-if="isArchived"
              type="button"
              class="secondary-button"
              :disabled="mutationPending"
              @click="restoreDefinition"
            >
              Восстановить
            </button>
            <button
              v-else
              type="button"
              class="secondary-button"
              :disabled="
                mutationPending || usageLoading || usage?.canArchive === false
              "
              @click="prepareArchive"
            >
              Архивировать
            </button>
            <button
              type="button"
              class="danger-button"
              :disabled="
                mutationPending || usageLoading || usage?.canDelete === false
              "
              @click="prepareDelete"
            >
              Удалить
            </button>
          </template>
          <span v-else-if="definition.readOnly" class="read-only-badge"
            ><i class="pi pi-lock" /> Управляется Lola · только чтение</span
          >
        </div>
      </header>

      <aside
        v-if="
          canManageLifecycle &&
          usage &&
          ((!isArchived && !usage.canArchive) || !usage.canDelete)
        "
        class="lifecycle-blocker-summary"
        role="note"
      >
        <strong>Действия ограничены существующими зависимостями.</strong>
        <router-link
          v-for="scenario in usage.scenarios.items"
          :key="scenario.scenarioId"
          :to="{
            name: 'scenario-edit',
            params: { scenarioId: scenario.scenarioId },
          }"
        >
          Сценарий: {{ scenario.name }}
        </router-link>
        <router-link
          v-if="usage.activeWaitCount > 0"
          :to="{
            name: 'operations',
            query: {
              section: 'runs',
              eventDefinitionKeyId: definition.definitionKeyId,
            },
          }"
        >
          Активные ожидания: {{ usage.activeWaitCount }}
        </router-link>
        <router-link
          v-if="usage.eventLogs.exists"
          :to="{
            name: 'event-logs',
            query: { eventCode: definition.code },
          }"
        >
          Открыть Event Logs
        </router-link>
      </aside>

      <p v-if="mutationError" class="inline-message error" role="alert">
        {{ mutationError }}
      </p>
      <p v-if="success" class="inline-message success" role="status">
        {{ success }}
      </p>

      <aside class="producer-contract card" data-test="producer-contract-hint">
        <i class="pi pi-send" aria-hidden="true" />
        <div>
          <strong>Контракт интеграции остаётся стабильным</strong>
          <p>
            Сервер продукта отправляет <code>eventCode + payload</code>. Номер
            версии схемы передавать не нужно: его определяет Lola.
          </p>
        </div>
      </aside>

      <nav
        class="workspace-navigation card"
        aria-label="Разделы события"
        role="tablist"
      >
        <button
          id="event-tab-overview"
          type="button"
          role="tab"
          data-section="overview"
          aria-controls="event-panel-overview"
          :aria-selected="activeSection === 'overview'"
          :tabindex="activeSection === 'overview' ? 0 : -1"
          :class="{ active: activeSection === 'overview' }"
          @click="selectSection('overview')"
          @keydown="handleTabKeydown($event, 'overview')"
        >
          <i class="pi pi-info-circle" /> Основное
        </button>
        <button
          id="event-tab-policy"
          type="button"
          role="tab"
          data-section="policy"
          aria-controls="event-panel-policy"
          :aria-selected="activeSection === 'policy'"
          :tabindex="activeSection === 'policy' ? 0 : -1"
          :class="{ active: activeSection === 'policy' }"
          @click="selectSection('policy')"
          @keydown="handleTabKeydown($event, 'policy')"
        >
          <i class="pi pi-shield" /> Приём событий
        </button>
        <button
          id="event-tab-schema"
          type="button"
          role="tab"
          data-section="schema"
          aria-controls="event-panel-schema"
          :aria-selected="activeSection === 'schema'"
          :tabindex="activeSection === 'schema' ? 0 : -1"
          :class="{ active: activeSection === 'schema' }"
          @click="selectSection('schema')"
          @keydown="handleTabKeydown($event, 'schema')"
        >
          <i class="pi pi-code" /> Схема данных
        </button>
        <button
          id="event-tab-usage"
          type="button"
          role="tab"
          data-section="usage"
          aria-controls="event-panel-usage"
          :aria-selected="activeSection === 'usage'"
          :tabindex="activeSection === 'usage' ? 0 : -1"
          :class="{ active: activeSection === 'usage' }"
          @click="selectSection('usage')"
          @keydown="handleTabKeydown($event, 'usage')"
        >
          <i class="pi pi-chart-bar" /> Использование
        </button>
      </nav>

      <main
        id="event-panel-overview"
        v-if="activeSection === 'overview'"
        class="overview-layout"
        role="tabpanel"
        aria-labelledby="event-tab-overview"
        data-test="overview-section"
      >
        <form class="overview-form card" @submit.prevent="saveMetadata">
          <div class="section-heading">
            <div>
              <span>Название и описание</span>
              <h2>Основное</h2>
              <p>
                Название и описание помогают людям понимать событие и не
                изменяют структуру его данных.
              </p>
            </div>
            <span class="schema-safe-label"
              ><i class="pi pi-check-circle" /> Без новой версии схемы</span
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
              <span>Код события</span>
              <code>{{ definition.code }}</code>
            </div>
            <p>
              Не изменяется после создания. Именно этот код сервер продукта
              передаёт в Lola.
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
            Сервер не предоставил данные для безопасного сохранения. Раздел
            доступен только для чтения.
          </p>
          <footer v-if="canEdit" class="form-actions">
            <span v-if="isDirty">Есть несохранённые изменения</span>
            <button
              class="primary-button"
              type="submit"
              :disabled="!isDirty || saving || !hasMetadataConcurrencyToken"
            >
              {{ saving ? "Сохраняем…" : "Сохранить" }}
            </button>
          </footer>
          <p v-else class="read-only-note">
            У вас нет права изменять название и описание этого события.
          </p>
        </form>

        <aside class="revision-card card">
          <span>Текущая схема данных</span>
          <strong>v{{ definition.currentSchema.revisionNumber }}</strong>
          <code>{{ definition.currentSchema.revisionId }}</code>
          <p>
            Эту версию определяет Lola. Она нужна для истории и диагностики, но
            не передаётся сервером продукта.
          </p>
        </aside>
      </main>

      <section
        id="event-panel-policy"
        v-else-if="activeSection === 'policy'"
        class="workspace-panel card"
        role="tabpanel"
        aria-labelledby="event-tab-policy"
        data-test="policy-section"
      >
        <div class="section-heading">
          <div>
            <span>Правила приёма</span>
            <h2>Приём событий</h2>
            <p>
              Эти настройки влияют только на новые события и не меняют схему
              данных.
            </p>
          </div>
          <span class="schema-safe-label"
            ><i class="pi pi-check-circle" /> Без новой версии схемы</span
          >
        </div>
        <form class="policy-form" @submit.prevent="requestPolicyChange">
          <div class="settings-grid">
            <label class="policy-option" for="event-policy-enabled">
              <input
                id="event-policy-enabled"
                v-model="policyEnabled"
                type="checkbox"
                :disabled="!canManageLifecycle || isArchived || mutationPending"
              />
              <span>
                <strong>Принимать новые события</strong>
                <small
                  >Выключение останавливает новые trigger и wait-события.</small
                >
              </span>
            </label>
            <label class="policy-option" for="event-policy-client-ingestible">
              <input
                id="event-policy-client-ingestible"
                v-model="policyClientIngestible"
                type="checkbox"
                :disabled="!canManageLifecycle || isArchived || mutationPending"
              />
              <span>
                <strong>Разрешить приём из браузера</strong>
                <small>Событие сможет отправлять доверенный web-клиент.</small>
              </span>
            </label>
            <label class="policy-option" for="event-policy-counts-as-activity">
              <input
                id="event-policy-counts-as-activity"
                v-model="policyCountsAsActivity"
                type="checkbox"
                :disabled="!canManageLifecycle || isArchived || mutationPending"
              />
              <span>
                <strong>Учитывать как активность</strong>
                <small
                  >Только новые валидные события продлевают Visit и Activity
                  Day.</small
                >
              </span>
            </label>
          </div>
          <label
            v-if="canManageLifecycle"
            class="field"
            for="event-policy-reason"
          >
            <span>Причина изменения</span>
            <textarea
              id="event-policy-reason"
              v-model="policyReason"
              rows="2"
              maxlength="500"
              :disabled="isArchived || mutationPending"
              placeholder="Что меняется и почему"
            />
          </label>
          <div v-if="canManageLifecycle" class="policy-actions">
            <button
              data-test="save-policy"
              type="button"
              class="primary-button"
              :disabled="
                isArchived ||
                mutationPending ||
                !isPolicyDirty ||
                !policyReason.trim()
              "
              @click="requestPolicyChange"
            >
              {{ mutationPending ? "Сохраняем…" : "Сохранить правила приёма" }}
            </button>
            <p v-if="isArchived">
              Сначала восстановите событие. Восстановление не включает ingestion
              автоматически.
            </p>
          </div>
          <p v-else class="read-only-note">
            У вас нет права изменять правила приёма этого события.
          </p>
        </form>
        <aside
          v-if="policyConflictServer"
          class="policy-conflict"
          data-test="policy-conflict-server"
          role="note"
        >
          <strong
            >Текущие правила на сервере — v{{
              policyConflictServer.version
            }}</strong
          >
          <p>
            Приём: {{ policyConflictServer.enabled ? "включён" : "выключен" }};
            браузер:
            {{
              policyConflictServer.clientIngestible ? "разрешён" : "запрещён"
            }}; активность:
            {{
              policyConflictServer.countsAsActivity
                ? "учитывается"
                : "не учитывается"
            }}.
          </p>
          <span>В форме выше сохранены ваши локальные значения.</span>
        </aside>
      </section>

      <section
        id="event-panel-schema"
        v-else-if="activeSection === 'schema'"
        class="workspace-panel card"
        role="tabpanel"
        aria-labelledby="event-tab-schema"
        data-test="schema-section"
      >
        <div class="section-heading">
          <div>
            <span
              >Опубликованная версия
              {{ definition.currentSchema.revisionNumber }}</span
            >
            <h2>Схема данных</h2>
            <p>
              Текущая структура данных события. Номер версии назначает Lola.
            </p>
          </div>
          <EventDefinitionHistory
            :project-id="definition.projectId"
            :event="definition"
            :initial-revision-id="linkedRevisionId"
          />
        </div>
        <EventSchemaAuthoring
          :project-id="definition.projectId"
          :event="definition"
          :can-edit="canEdit"
          :can-publish="canPublish"
          @published="handleSchemaPublished"
          @publication-uncertain="handleSchemaPublicationUncertain"
          @created="handleSchemaDefinitionCreated"
        />
      </section>

      <section
        id="event-panel-usage"
        v-else
        class="workspace-panel card"
        role="tabpanel"
        aria-labelledby="event-tab-usage"
        data-test="usage-section"
      >
        <div class="section-heading">
          <div>
            <span>Зависимости</span>
            <h2>Использование</h2>
            <p>Сценарии, ожидания и черновики, связанные с этим событием.</p>
          </div>
        </div>
        <p v-if="usageLoading" class="panel-state" aria-live="polite">
          Загружаем сведения…
        </p>
        <p v-else-if="usageError" class="inline-message error" role="alert">
          {{ usageError }}
        </p>
        <div v-else-if="usage" class="usage-content">
          <div class="usage-summary">
            <div>
              <strong>{{ usage.scenarios.total }}</strong
              ><span>сценариев</span>
            </div>
            <div>
              <strong>{{ usage.activeWaitCount }}</strong
              ><span>активных ожиданий</span>
            </div>
            <div>
              <strong>{{ usage.scenarioDraftDependencyCount }}</strong
              ><span>зависимостей в черновиках</span>
            </div>
            <div>
              <strong>{{ usage.publishedScenarioRevisionCount }}</strong
              ><span>опубликованных ревизий</span>
            </div>
            <div>
              <strong>{{ usage.eventLogs.exists ? "Есть" : "Нет" }}</strong
              ><span>Event Logs</span>
            </div>
          </div>
          <ul
            v-if="usage.scenarios.items.length"
            class="dependency-list"
            aria-label="Сценарии, использующие событие"
          >
            <li
              v-for="scenario in usage.scenarios.items"
              :key="scenario.scenarioId"
            >
              <router-link
                :to="{
                  name: 'scenario-edit',
                  params: { scenarioId: scenario.scenarioId },
                }"
                >{{ scenario.name }}</router-link
              >
              <span
                >{{ scenario.status }} · {{ scenario.usages.join(", ") }}</span
              >
            </li>
          </ul>
          <router-link
            :to="{ name: 'event-logs', query: { eventCode: definition.code } }"
            class="usage-link"
          >
            Открыть Event Logs
          </router-link>
        </div>
      </section>
    </template>

    <Dialog
      v-model:visible="disableDialogVisible"
      modal
      header="Выключить приём событий?"
      :style="{ width: 'min(540px, 94vw)' }"
    >
      <p>
        Новые события <strong>{{ definition?.code }}</strong> перестанут
        приниматься и запускать или продвигать сценарии. Изменение действует
        только на будущий приём; существующие данные и определение сохранятся.
      </p>
      <p v-if="usage">
        <strong
          >Связано сценариев: {{ usage.scenarios.total }}; активных ожиданий:
          {{ usage.activeWaitCount }}.</strong
        >
      </p>
      <template #footer>
        <button
          type="button"
          class="secondary-button"
          @click="disableDialogVisible = false"
        >
          Отмена
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="mutationPending"
          @click="applyPolicyChange"
        >
          Выключить приём
        </button>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="archiveDialogVisible"
      modal
      header="Архивировать событие?"
      :style="{ width: 'min(580px, 94vw)' }"
    >
      <p>
        Событие исчезнет из активного каталога, приём новых событий будет
        выключен. Event Logs и история схемы сохранятся.
      </p>
      <ul v-if="usage && !usage.canArchive" class="blocker-list" role="alert">
        <li v-for="blocker in usage.archiveBlockers" :key="blocker">
          {{ blockerLabel(blocker) }}
        </li>
      </ul>
      <router-link
        v-if="usage && usage.activeWaitCount > 0"
        :to="{
          name: 'operations',
          query: {
            section: 'runs',
            eventDefinitionKeyId: definition?.definitionKeyId,
          },
        }"
      >
        Открыть активные ожидания
      </router-link>
      <label class="field" for="event-archive-reason"
        ><span>Причина <small>необязательно</small></span
        ><textarea
          id="event-archive-reason"
          v-model="archiveReason"
          rows="3"
          maxlength="500"
        />
      </label>
      <template #footer>
        <button
          type="button"
          class="secondary-button"
          @click="archiveDialogVisible = false"
        >
          Отмена
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="!usage?.canArchive || mutationPending"
          @click="archiveDefinition"
        >
          Архивировать
        </button>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      modal
      header="Удалить событие навсегда?"
      :style="{ width: 'min(600px, 94vw)' }"
    >
      <p>
        Stable identity, черновики и все ревизии схемы будут физически удалены.
        Это действие нельзя отменить.
      </p>
      <ul v-if="usage && !usage.canDelete" class="blocker-list" role="alert">
        <li v-for="blocker in usage.deleteBlockers" :key="blocker">
          {{ blockerLabel(blocker) }}
        </li>
      </ul>
      <label class="field" for="event-delete-reason"
        ><span>Причина удаления</span
        ><textarea
          id="event-delete-reason"
          v-model="deleteReason"
          rows="3"
          maxlength="500"
          required
        />
      </label>
      <label class="field" for="event-delete-confirmation"
        ><span
          >Введите код <code>{{ definition?.code }}</code></span
        ><input
          id="event-delete-confirmation"
          v-model="deleteConfirmation"
          autocomplete="off"
      /></label>
      <template #footer>
        <button
          type="button"
          class="secondary-button"
          @click="deleteDialogVisible = false"
        >
          Отмена
        </button>
        <button
          type="button"
          class="danger-button"
          :disabled="
            !usage?.canDelete ||
            deleteConfirmation !== definition?.code ||
            !deleteReason.trim() ||
            mutationPending
          "
          @click="deleteDefinition"
        >
          Удалить навсегда
        </button>
      </template>
    </Dialog>
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
  font:
    600 0.76rem var(--font-display),
    sans-serif;
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
.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.lifecycle-badge {
  border-radius: 999px;
  background: var(--status-success-soft);
  padding: 7px 10px;
  color: var(--status-success-text);
  font-size: 0.7rem;
  font-weight: 800;
}
.lifecycle-badge.archived {
  background: var(--surface-active);
  color: var(--text-secondary);
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
.lifecycle-blocker-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.lifecycle-blocker-summary strong {
  color: var(--text-primary);
}
.lifecycle-blocker-summary a {
  color: var(--text-link);
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
.policy-conflict {
  margin-top: 14px;
  border: 1px solid var(--status-warning);
  border-radius: 10px;
  background: var(--status-warning-soft);
  padding: 12px;
  color: var(--status-warning-text);
  font-size: 0.74rem;
}
.policy-conflict p {
  margin: 6px 0;
}
.policy-conflict span {
  color: var(--text-secondary);
}
.workspace-navigation {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  min-width: 0;
}
.workspace-navigation button {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  padding: 10px 12px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
  min-width: 0;
  overflow-wrap: anywhere;
}
.workspace-navigation .active {
  background: var(--surface-active);
  color: var(--text-primary);
}
.workspace-navigation button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
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
.workspace-panel {
  padding: 22px;
  min-width: 0;
}
.settings-grid,
.usage-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.settings-grid > div,
.settings-grid > label,
.usage-summary > div {
  border-radius: 10px;
  background: var(--surface-subtle);
  padding: 16px;
}
.settings-grid dt,
.usage-summary span {
  color: var(--text-secondary);
  font-size: 0.7rem;
}
.settings-grid dd {
  margin: 6px 0 0;
  font-weight: 700;
}
.policy-form {
  display: grid;
  gap: 18px;
}
.policy-option {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  cursor: pointer;
}
.policy-option input {
  margin-top: 3px;
}
.policy-option span,
.policy-option strong,
.policy-option small {
  display: block;
}
.policy-option strong {
  font-size: 0.76rem;
}
.policy-option small {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.45;
}
.usage-summary strong,
.usage-summary span {
  display: block;
}
.usage-summary strong {
  margin-bottom: 5px;
  font:
    800 1.8rem var(--font-display),
    sans-serif;
}
.usage-content {
  display: grid;
  gap: 16px;
}
.dependency-list,
.blocker-list {
  margin: 0;
  padding-left: 20px;
}
.dependency-list li + li,
.blocker-list li + li {
  margin-top: 8px;
}
.dependency-list span {
  display: block;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.blocker-list {
  border-radius: 10px;
  background: var(--status-danger-soft);
  padding: 12px 16px 12px 34px;
  color: var(--status-danger-text);
  font-size: 0.75rem;
}
.usage-link {
  justify-self: start;
  color: var(--text-link);
  font-size: 0.74rem;
  font-weight: 700;
}
.policy-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
}
.policy-actions p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.7rem;
}
.panel-state {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.76rem;
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
.secondary-button,
.danger-button {
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font:
    700 0.74rem var(--font-display),
    sans-serif;
  padding: 10px 14px;
}
.primary-button {
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.primary-button:disabled,
.secondary-button:disabled,
.danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.secondary-button {
  background: var(--surface-active);
  color: var(--text-primary);
}
.danger-button {
  background: var(--status-danger);
  color: var(--on-status-danger);
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
  font:
    800 2.3rem var(--font-display),
    sans-serif;
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
  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .workspace-navigation {
    display: flex;
    overflow-x: auto;
  }
  .workspace-navigation button {
    min-width: max-content;
  }
  .settings-grid,
  .usage-summary {
    grid-template-columns: 1fr;
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
  .primary-button,
  .danger-button {
    width: 100%;
  }
  .policy-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
