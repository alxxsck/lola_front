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
    canOpenCase: boolean;
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

type InspectorTab = "CASE" | "USER" | "DATA" | "ACTIVITY";
const activeTab = ref<InspectorTab>("CASE");
const inspectorTabs = computed(
  () =>
    [
      ...(props.selection.case
        ? [{ id: "CASE" as const, label: "Обращение" }]
        : []),
      { id: "USER" as const, label: "Пользователь" },
      { id: "DATA" as const, label: "Данные" },
      { id: "ACTIVITY" as const, label: "Активность" },
    ] satisfies Array<{ id: InspectorTab; label: string }>,
);

watch(
  () => props.selection.case?.id,
  () => {
    activeTab.value = props.selection.case ? "CASE" : "USER";
  },
  { immediate: true },
);

const userLabel = computed(() =>
  props.selection.endUser.isGuest ? "Гостевой пользователь" : "Пользователь",
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
    <div class="pane-heading">
      <div>
        <span class="eyebrow">Контекст</span>
        <h2>Инспектор</h2>
      </div>
    </div>
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
        {{ tab.label }}
      </button>
    </div>

    <section
      v-if="activeTab === 'CASE' && selection.case"
      class="case-summary"
      aria-label="Case"
    >
      <span class="eyebrow">Case #{{ selection.case.projectSequence }}</span>
      <h3>{{ selection.case.title }}</h3>
      <dl>
        <div>
          <dt>Статус</dt>
          <dd>{{ labelCaseStatus(selection.case.status) }}</dd>
        </div>
        <div>
          <dt>Приоритет</dt>
          <dd>{{ labelCasePriority(selection.case.priority) }}</dd>
        </div>
        <div>
          <dt>Назначен</dt>
          <dd>
            {{
              selection.case.assignment?.operatorName ??
              selection.case.assignee?.displayName ??
              "Не назначен"
            }}
          </dd>
        </div>
        <div v-if="selection.case.assignment">
          <dt>Команда</dt>
          <dd>{{ selection.case.assignment.teamName }}</dd>
        </div>
      </dl>
      <RouterLink
        v-if="canOpenCase"
        class="case-link"
        :to="{
          name: 'support-inbox-case',
          params: { caseId: selection.case.id },
          query: { view: 'cases' },
        }"
      >
        Открыть в рабочем месте
      </RouterLink>
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
          selection.case.assignment &&
          selection.capabilities.releaseAssignment
        "
        v-bind="assignmentRelease"
        @release="emit('releaseAssignment', $event)"
        @retry="emit('retryAssignmentRelease')"
      />
    </section>

    <section
      v-if="activeTab === 'USER'"
      class="inspector-section"
      aria-label="Пользователь"
    >
      <dl class="context-list">
        <div>
          <dt>Пользователь</dt>
          <dd>{{ userLabel }}</dd>
        </div>
        <div>
          <dt>Язык</dt>
          <dd>{{ selection.endUser.locale ?? "Не указан" }}</dd>
        </div>
        <div>
          <dt>Последняя активность</dt>
          <dd>{{ relativeTime(selection.endUser.lastSeenAt) }}</dd>
        </div>
      </dl>
      <p class="inspector-hint">
        Безопасная сводка доступна здесь; персональные поля открываются во
        вкладке «Данные».
      </p>
    </section>

    <section
      v-if="activeTab === 'DATA'"
      class="profile-summary"
      aria-label="Данные пользователя"
    >
      <div class="profile-summary__heading">
        <div>
          <span class="eyebrow">Профиль</span>
          <h3>Разрешённые данные</h3>
        </div>
        <Button
          v-if="canReadProfile"
          label="Загрузить"
          icon="pi pi-refresh"
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
        <p class="profile-summary__freshness">
          {{
            profile.observedAt
              ? `Снимок обновлён ${relativeTime(profile.observedAt)}`
              : "Время снимка не передано"
          }}
        </p>
        <p class="profile-summary__metadata">
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
        <p v-else class="profile-summary__empty">
          Разрешённых полей в актуальном снимке нет.
        </p>
      </template>
      <p v-else class="profile-summary__empty">
        <template v-if="canReadProfile"
          >Загрузите отдельный серверный снимок профиля.</template
        >
        <template v-else
          >У вас нет прав на персональные данные пользователя.</template
        >
      </p>
    </section>

    <section
      v-if="activeTab === 'ACTIVITY'"
      class="inspector-section"
      aria-label="Активность"
    >
      <dl class="context-list">
        <div>
          <dt>Статус диалога</dt>
          <dd>
            {{ conversation.status === "OPEN" ? "Активный" : "Архивный" }}
          </dd>
        </div>
        <div>
          <dt>Сообщений</dt>
          <dd>{{ conversation.messageCount }}</dd>
        </div>
        <div>
          <dt>Сессий сейчас</dt>
          <dd>{{ conversation.currentInteractionSessionCount }}</dd>
        </div>
        <div>
          <dt>Обновлён</dt>
          <dd>{{ relativeTime(conversation.updatedAt) }}</dd>
        </div>
      </dl>
      <p class="inspector-hint">
        Presence — это только краткая подсказка. Он не меняет назначение
        обращения или доступность оператора.
      </p>
    </section>
  </div>
</template>

<style scoped>
.pane-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.pane-heading h2 {
  margin: 0;
  font-size: 1.05rem;
}
.inspector-tabs {
  display: flex;
  gap: 4px;
  margin: 0 -2px 18px;
  padding: 4px;
  overflow-x: auto;
  border-radius: 12px;
  background: var(--surface-muted);
}
.inspector-tabs button {
  min-height: 32px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.inspector-tabs button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-raised);
}
.inspector-tabs button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.inspector-section {
  min-height: 220px;
}
.inspector-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.5;
}
.context-list {
  display: grid;
  gap: 14px;
  margin: 0 0 18px;
}
.context-list div {
  display: grid;
  gap: 3px;
}
.context-list dt {
  color: var(--text-muted);
  font-size: 0.78rem;
}
.context-list dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.case-summary {
  margin: 0 0 18px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-muted);
}
.case-summary h3 {
  margin: 4px 0 12px;
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}
.case-summary dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.case-summary dl > div {
  display: grid;
  gap: 3px;
}
.case-summary dt {
  color: var(--text-muted);
  font-size: 0.72rem;
}
.case-summary dd {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.case-link {
  display: inline-flex;
  margin-top: 12px;
  color: var(--brand);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}
.classify-case {
  width: 100%;
  margin-top: 12px;
}
.case-link:hover,
.case-link:focus-visible {
  text-decoration: underline;
}
.internal-notes-link {
  margin-top: 12px;
}
.profile-summary {
  margin: 0 0 18px;
}
.profile-summary__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.profile-summary h3 {
  margin: 4px 0 0;
  font-size: 0.92rem;
}
.profile-summary__freshness,
.profile-summary__metadata,
.profile-summary__empty {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 0.78rem;
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
@media (max-width: 1180px) {
  .context-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .context-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
