<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import SupportAssignmentRelease from "@/features/support-case-assignment/ui/SupportAssignmentRelease.vue";
import type { SupportAssignmentReleaseInput } from "@/features/support-case-assignment/model/use-support-assignment-release";
import type {
  ProfileProjectionResponseDto,
  ProfileProjectionFieldResponseDto,
} from "@/shared/api/generated/models";
import {
  formatProfileValue,
  profileValueStateLabel,
} from "@/features/end-user-profile/model/profile-value";
import { relativeTime } from "@/shared/lib/format";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceSelection,
} from "@/features/support-workspace/api/support-workspace-source";

const props = withDefaults(
  defineProps<{
    conversation: SupportWorkspaceConversation;
    selection: SupportWorkspaceSelection;
    canManageCase?: boolean;
    canReleaseAssignment?: boolean;
    canReadInternalNotes?: boolean;
    canReadProfile?: boolean;
    profile?: ProfileProjectionResponseDto | null;
    profileLoading?: boolean;
    profileError?: string;
    assignmentRelease?: {
      releasing: boolean;
      error: string;
      unknownOutcome: boolean;
      completed: boolean;
      canRetry: boolean;
    };
  }>(),
  {
    canReadProfile: false,
    canManageCase: false,
    canReleaseAssignment: false,
    canReadInternalNotes: false,
    profile: null,
    profileLoading: false,
    profileError: "",
    assignmentRelease: () => ({
      releasing: false,
      error: "",
      unknownOutcome: false,
      completed: false,
      canRetry: false,
    }),
  },
);

const emit = defineEmits<{
  loadProfile: [];
  releaseAssignment: [input: SupportAssignmentReleaseInput];
  retryAssignmentRelease: [];
  openInternalNotes: [];
  classifyCase: [];
}>();

type InspectorTab = "USER" | "CASE" | "ACTIONS";
const activeTab = ref<InspectorTab>("USER");
const inspectorTabs = [
  { id: "USER" as const, label: "Пользователь", icon: "pi pi-user" },
  { id: "CASE" as const, label: "Кейс", icon: "pi pi-briefcase" },
  { id: "ACTIONS" as const, label: "Действия", icon: "pi pi-bolt" },
];

watch(
  () => props.selection.endUser.id,
  () => {
    activeTab.value = "USER";
  },
);

const userLabel = computed(() =>
  props.selection.endUser.isGuest ? "Гостевой пользователь" : "Пользователь",
);
const userInitial = computed(() => userLabel.value.slice(0, 1).toUpperCase());
const hasAvailableActions = computed(
  () =>
    props.canManageCase ||
    props.canReadInternalNotes ||
    (props.canReleaseAssignment &&
      props.selection.capabilities.releaseAssignment &&
      Boolean(props.selection.case?.assignment)),
);

function labelCaseStatus(value: string): string {
  return (
    {
      OPEN: "Открыт",
      IN_PROGRESS: "В работе",
      PENDING: "Ожидает",
      WAITING_END_USER: "Ожидает пользователя",
      WAITING_SYSTEM: "Ожидает системы",
      WAITING_ADMIN: "Ожидает оператора",
      RESOLVED: "Решён",
      UNRESOLVED: "Не решён",
      CANCELLED: "Отменён",
    }[value] ?? value
  );
}

function labelCasePriority(value: string): string {
  return (
    {
      LOW: "Низкий",
      NORMAL: "Обычный",
      HIGH: "Высокий",
      URGENT: "Срочный",
      CRITICAL: "Критический",
    }[value] ?? value
  );
}

const visibleProfileFields = computed(
  () =>
    props.profile?.fields.filter((field) => field.access !== "FORBIDDEN") ?? [],
);

function profileFieldValue(field: ProfileProjectionFieldResponseDto): string {
  if (field.access === "REDACTED") return "Скрыто";
  if (field.availability !== "AVAILABLE" || !field.value)
    return profileValueStateLabel(field.availability);
  return formatProfileValue(field.value);
}

function profileSyncStatusLabel(
  value: ProfileProjectionResponseDto["syncStatus"],
): string {
  return (
    {
      VALID: "Снимок проверен",
      VALID_WITH_WARNINGS: "Снимок с предупреждениями",
      NO_VALID_SNAPSHOT: "Нет проверенного снимка",
    }[value] ?? value
  );
}

function profileProvenanceLabel(
  value: ProfileProjectionResponseDto["provenance"],
): string {
  return value === "PRODUCT_PROFILE" ? "Профиль продукта" : value;
}

function profileClassificationLabel(
  value: ProfileProjectionFieldResponseDto["classification"],
): string {
  return (
    {
      INTERNAL: "Внутреннее",
      PERSONAL: "Персональное",
      SENSITIVE: "Чувствительное",
    }[value] ?? value
  );
}
</script>

<template>
  <div class="support-conversation-context">
    <div class="inspector-tabs" role="tablist" aria-label="Разделы контекста">
      <button
        v-for="tab in inspectorTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </div>

    <section
      v-if="activeTab === 'USER'"
      class="inspector-section user-section"
      aria-label="Пользователь"
    >
      <header class="user-card">
        <span class="user-avatar">{{ userInitial }}</span>
        <div>
          <span class="section-kicker">Пользователь</span>
          <h3>{{ userLabel }}</h3>
          <p>Активность {{ relativeTime(selection.endUser.lastSeenAt) }}</p>
        </div>
      </header>

      <dl class="context-grid">
        <div class="context-field">
          <dt>Язык</dt>
          <dd>{{ selection.endUser.locale?.toUpperCase() ?? "Не указан" }}</dd>
        </div>
        <div class="context-field">
          <dt>Диалог</dt>
          <dd>{{ conversation.status === "OPEN" ? "Активный" : "Закрыт" }}</dd>
        </div>
        <div class="context-field">
          <dt>Сообщений</dt>
          <dd>{{ conversation.messageCount }}</dd>
        </div>
      </dl>
      <div class="section-heading profile-heading">
        <div>
          <span class="section-kicker">Профиль</span>
          <h3>Данные пользователя</h3>
        </div>
        <Button
          v-if="canReadProfile"
          label="Обновить"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          :loading="profileLoading"
          @click="emit('loadProfile')"
        />
      </div>
      <Message v-if="profileError" severity="error" :closable="false">
        {{ profileError }}
      </Message>
      <template v-else-if="profile">
        <p class="profile-meta">
          {{
            profile.observedAt
              ? `Снимок обновлён ${relativeTime(profile.observedAt)}`
              : "Время снимка не передано"
          }}
        </p>
        <p class="profile-meta">
          {{ profileSyncStatusLabel(profile.syncStatus) }} · источник:
          {{ profileProvenanceLabel(profile.provenance) }}
        </p>
        <dl v-if="visibleProfileFields.length" class="profile-fields">
          <div v-for="field in visibleProfileFields" :key="field.definitionId">
            <dt>{{ field.label }}</dt>
            <dd>{{ profileFieldValue(field) }}</dd>
            <small>
              {{ profileValueStateLabel(field.availability) }}
              · {{ profileClassificationLabel(field.classification) }}
              <template v-if="field.observedAt">
                · обновлено {{ relativeTime(field.observedAt) }}
              </template>
              <template v-if="field.untrustedData">
                · требует проверки</template
              >
            </small>
          </div>
        </dl>
        <p v-else class="empty-copy">
          Разрешённых полей в актуальном снимке нет.
        </p>
      </template>
      <div v-else class="empty-card">
        <i class="pi pi-id-card" aria-hidden="true" />
        <p>
          <template v-if="canReadProfile"
            >Загрузите актуальные данные профиля.</template
          >
          <template v-else
            >У вас нет прав на персональные данные пользователя.</template
          >
        </p>
      </div>
    </section>

    <section
      v-if="activeTab === 'CASE'"
      class="inspector-section case-section"
      aria-label="Кейс"
    >
      <template v-if="selection.case">
        <header class="case-header">
          <span class="section-kicker"
            >Кейс #{{ selection.case.projectSequence }}</span
          >
          <h3>{{ selection.case.title }}</h3>
          <div class="case-badges">
            <span class="status-badge">{{
              labelCaseStatus(selection.case.status)
            }}</span>
            <span class="priority-badge">{{
              labelCasePriority(selection.case.priority)
            }}</span>
          </div>
        </header>
        <dl class="context-grid case-grid">
          <div class="context-field">
            <dt>Категория</dt>
            <dd>{{ selection.case.groupCode }}</dd>
          </div>
          <div class="context-field">
            <dt>Назначен</dt>
            <dd>
              {{
                selection.case.assignment?.operatorName ??
                selection.case.assignee?.displayName ??
                "Не назначен"
              }}
            </dd>
          </div>
          <div
            v-if="selection.case.assignment"
            class="context-field context-field--wide"
          >
            <dt>Команда</dt>
            <dd>{{ selection.case.assignment.teamName }}</dd>
          </div>
          <div class="context-field context-field--wide">
            <dt>Последнее изменение</dt>
            <dd>{{ relativeTime(selection.case.updatedAt) }}</dd>
          </div>
        </dl>
      </template>
      <div v-else class="empty-card">
        <i class="pi pi-briefcase" aria-hidden="true" />
        <p>Для этого диалога кейс не создан.</p>
      </div>
    </section>

    <section
      v-if="activeTab === 'ACTIONS'"
      class="inspector-section actions-section"
      aria-label="Действия"
    >
      <div class="section-heading">
        <div>
          <span class="section-kicker">Управление</span>
          <h3>Действия с диалогом</h3>
        </div>
      </div>
      <div v-if="hasAvailableActions" class="action-stack">
        <Button
          v-if="canManageCase"
          class="classify-case"
          label="Классификация и приоритет"
          icon="pi pi-tags"
          severity="secondary"
          outlined
          @click="emit('classifyCase')"
        />
        <Button
          v-if="canReadInternalNotes"
          class="internal-notes-link"
          label="Внутренние заметки"
          icon="pi pi-file-edit"
          severity="secondary"
          outlined
          @click="emit('openInternalNotes')"
        />
        <SupportAssignmentRelease
          v-if="
            canReleaseAssignment &&
            selection.case?.assignment &&
            selection.capabilities.releaseAssignment
          "
          v-bind="assignmentRelease"
          @release="emit('releaseAssignment', $event)"
          @retry="emit('retryAssignmentRelease')"
        />
      </div>
      <div v-else class="empty-card">
        <i class="pi pi-lock" aria-hidden="true" />
        <p>Для этого диалога сейчас нет доступных действий.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inspector-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  margin: -4px -8px 24px;
  padding: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
}
.inspector-tabs button {
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.inspector-tabs button i {
  display: block;
  margin-bottom: 4px;
  font-size: 0.82rem;
}
.inspector-tabs button.active {
  background: var(--brand-soft);
  color: var(--brand);
}
.inspector-tabs button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.inspector-section {
  min-height: 260px;
}
.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.user-avatar {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 0.9rem;
  font-weight: 800;
}
.user-card h3,
.case-header h3,
.section-heading h3 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 0.92rem;
  line-height: 1.35;
}
.user-card p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.section-kicker {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.context-field {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-muted);
}
.context-field--wide {
  grid-column: 1 / -1;
}
.context-field dt {
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 0.68rem;
}
.context-field dd {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.profile-heading {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.profile-meta,
.empty-copy {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.45;
}
.case-header {
  margin-bottom: 18px;
}
.case-header h3 {
  margin-top: 6px;
  font-size: 1rem;
}
.case-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.status-badge,
.priority-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
}
.status-badge {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.priority-badge {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.action-stack {
  display: grid;
  gap: 10px;
}
.action-stack :deep(.p-button) {
  width: 100%;
  justify-content: flex-start;
}
.empty-card {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 24px 18px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  color: var(--text-muted);
  text-align: center;
}
.empty-card i {
  color: var(--brand);
  font-size: 1.25rem;
}
.empty-card p {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.45;
}
.profile-fields {
  display: grid;
  gap: 10px;
  margin: 12px 0 0;
}
.profile-fields > div {
  display: grid;
  gap: 3px;
}
.profile-fields dt,
.profile-fields small {
  color: var(--text-muted);
  font-size: 0.72rem;
}
.profile-fields dd {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
@media (max-width: 720px) {
  .inspector-tabs {
    margin-inline: 0;
  }
}
</style>
