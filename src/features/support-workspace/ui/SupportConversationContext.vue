<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import type { createSupportAssignmentController } from "@/features/support-case-assignment/model/use-support-assignment";
import SupportAssignmentDesk from "@/features/support-case-assignment/ui/SupportAssignmentDesk.vue";
import type { createSupportLeadAssignmentController } from "@/features/support-lead-assignment/model/use-support-lead-assignment";
import SupportLeadAssignmentDesk from "@/features/support-lead-assignment/ui/SupportLeadAssignmentDesk.vue";
import { createSupportCaseDeskController } from "@/features/support-case-desk/model/use-support-case-desk";
import SupportCaseDesk from "@/features/support-case-desk/ui/SupportCaseDesk.vue";
import SupportCaseBrief from "@/features/support-case-desk/ui/SupportCaseBrief.vue";
import SupportCaseOperationsContext from "@/features/support-case-operations/ui/SupportCaseOperationsContext.vue";
import SupportCaseDecisionExplain from "@/features/support-case-intelligence/ui/SupportCaseDecisionExplain.vue";
import type { createSupportInspectorController } from "@/features/support-inspector/model/use-support-inspector";
import SupportInspectorState from "@/features/support-inspector/ui/SupportInspectorState.vue";
import type { createSupportInternalKnowledgeController } from "@/features/support-internal-knowledge/model/use-support-internal-knowledge";
import SupportInternalKnowledgePane from "@/features/support-internal-knowledge/ui/SupportInternalKnowledgePane.vue";
import type {
  createSupportCaseExternalWorkController,
  SupportCaseExternalWorkPermissions,
} from "@/features/support-external-work/model/use-support-case-external-work";
import SupportCaseExternalWorkPane from "@/features/support-external-work/ui/SupportCaseExternalWorkPane.vue";
import type {
  ProfileProjectionFieldResponseDto,
  SupportLeadSafeFactDto,
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
    conversation: SupportWorkspaceConversation | null;
    selection: SupportWorkspaceSelection;
    canManageCase?: boolean;
    canReadCaseDesk?: boolean;
    canReadSlaContext?: boolean;
    canReadRoutingContext?: boolean;
    projectId?: string;
    canExplainCase?: boolean;
    reservationReconcileAttempt?: number;
    reservationReconcileInFlight?: boolean;
    assignmentController?: ReturnType<typeof createSupportAssignmentController>;
    leadAssignmentController?: ReturnType<
      typeof createSupportLeadAssignmentController
    >;
    availabilityLabel?: string;
    canReadInternalNotes?: boolean;
    canManageTranslation?: boolean;
    translationLocale?: string | null;
    inspector: ReturnType<typeof createSupportInspectorController>;
    knowledgeController?: ReturnType<
      typeof createSupportInternalKnowledgeController
    >;
    caseDesk?: ReturnType<typeof createSupportCaseDeskController>;
    externalWorkController?: ReturnType<
      typeof createSupportCaseExternalWorkController
    >;
    externalWorkPermissions?: SupportCaseExternalWorkPermissions;
  }>(),
  {
    canManageCase: false,
    canReadCaseDesk: false,
    canReadSlaContext: false,
    canReadRoutingContext: false,
    projectId: "",
    canExplainCase: false,
    reservationReconcileAttempt: 0,
    reservationReconcileInFlight: false,
    assignmentController: undefined,
    leadAssignmentController: undefined,
    availabilityLabel: "Недоступность не загружена",
    canReadInternalNotes: false,
    canManageTranslation: false,
    translationLocale: null,
    knowledgeController: undefined,
    externalWorkController: undefined,
    externalWorkPermissions: undefined,
  },
);

const emit = defineEmits<{
  openInternalNotes: [];
  classifyCase: [];
  manageTranslation: [];
  reconcileOperations: [expiresAt: string];
}>();

const caseDeskView = ref<InstanceType<typeof SupportCaseDesk> | null>(null);
const inspectorTabList = ref<HTMLElement | null>(null);
const activeTab = computed(() => props.inspector.activeTab.value);
const inspectorTabs = computed(() => props.inspector.tabs.value);
const canOpenFullProfile = computed(() =>
  inspectorTabs.value.some((tab) => tab.id === "DATA"),
);
const profile = computed(() => props.inspector.profile.data.value);

const userLabel = computed(() =>
  props.selection.endUser.isGuest ? "Гостевой пользователь" : "Пользователь",
);
const userInitial = computed(() => userLabel.value.slice(0, 1).toUpperCase());
const claimantLabel = computed(() => {
  if (!props.caseDesk?.detail.value)
    return props.caseDesk?.loading.value ? "Загружается…" : "Не загружен";
  const items = props.caseDesk?.detail.value?.escalations.items ?? [];
  const active = [...items]
    .reverse()
    .find(
      (item) =>
        item.claimant &&
        item.status !== "CLOSED" &&
        item.status !== "CANCELLED",
    );
  return active?.claimant
    ? `${active.claimant.displayName} · эскалация`
    : "Никто не взял эскалацию в работу";
});

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
    }[value] ?? "Состояние снимка не распознано"
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
    }[value] ?? "Приоритет не распознан"
  );
}

const visibleProfileFields = computed(
  () =>
    profile.value?.fields.filter((field) => field.access !== "FORBIDDEN") ?? [],
);
const profileEmptyState = computed(() =>
  profile.value?.fields.length
    ? {
        title: "Данные профиля недоступны",
        copy: "Сервер не разрешил показать ни одного значения профиля.",
      }
    : {
        title: "Данные профиля не переданы",
        copy: "Для этого пользователя проект пока не передал опубликованные поля профиля.",
      },
);

function profileFieldValue(field: ProfileProjectionFieldResponseDto): string {
  if (field.access === "REDACTED") return "Скрыто";
  if (field.availability !== "AVAILABLE" || !field.value)
    return profileValueStateLabel(field.availability);
  return formatProfileValue(field.value);
}

function profileSyncStatusLabel(value: string): string {
  return (
    {
      VALID: "Снимок проверен",
      VALID_WITH_WARNINGS: "Снимок с предупреждениями",
      NO_VALID_SNAPSHOT: "Нет проверенного снимка",
    }[value] ?? "Состояние снимка не распознано"
  );
}

function profileProvenanceLabel(value: string): string {
  if (value === "PRODUCT_PROFILE") return "Профиль продукта";
  if (value === "SUPPORT_OVERRIDE") return "Уточнено поддержкой";
  return "Источник не распознан";
}

function profileClassificationLabel(
  value: ProfileProjectionFieldResponseDto["classification"],
): string {
  return (
    {
      INTERNAL: "Внутреннее",
      PERSONAL: "Персональное",
      SENSITIVE: "Чувствительное",
    }[value] ?? "Класс данных не распознан"
  );
}

function requestClassification(): void {
  void props.inspector.open("CASE");
  if (props.caseDesk) {
    caseDeskView.value?.requestClassification();
    return;
  }
  emit("classifyCase");
}

function moveInspectorTab(event: KeyboardEvent, currentIndex: number): void {
  const count = inspectorTabs.value.length;
  if (!count) return;
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % count;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + count) % count;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = count - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  const tab = inspectorTabs.value[nextIndex];
  if (!tab) return;
  void props.inspector.open(tab.id);
  void nextTick(() => {
    const element = inspectorTabList.value?.querySelector<HTMLElement>(
      `#support-inspector-tab-${tab.id.toLowerCase()}`,
    );
    element?.focus();
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function activityTypeLabel(value: SupportLeadSafeFactDto["eventCode"]): string {
  return (
    {
      CASE_CHANGED: "Обращение изменено",
      ADMIN_REPLY_ACCEPTED: "Ответ принят",
      SUPPORT_CASE_ASSIGNMENT_CLAIMED: "Обращение принято оператором",
      SUPPORT_CASE_ASSIGNMENT_ASSIGNED: "Оператор назначен",
      SUPPORT_CASE_ASSIGNMENT_RELEASED: "Назначение освобождено",
      SUPPORT_CASE_ASSIGNMENT_TRANSFERRED: "Обращение передано",
      SUPPORT_CASE_ASSIGNMENT_COMPLETED: "Работа завершена",
      SUPPORT_ASSIGNMENT_RESERVED: "Работа зарезервирована",
      SUPPORT_ASSIGNMENT_OFFERED: "Оператору предложена работа",
      SUPPORT_ASSIGNMENT_OFFER_ACCEPTED: "Предложение принято",
      SUPPORT_ASSIGNMENT_OFFER_DECLINED: "Предложение отклонено",
      SUPPORT_ASSIGNMENT_RESERVATION_EXPIRED: "Резерв истёк",
      SUPPORT_ASSIGNMENT_RESERVATION_CANCELLED: "Резерв отменён",
      SUPPORT_ASSIGNMENT_AUTO_ASSIGNED: "Назначено автоматически",
      SUPPORT_ASSIGNMENT_ROUTING_FALLBACK_SCHEDULED:
        "Запланирован повторный подбор",
      OPERATOR_AVAILABILITY_CHANGED: "Доступность оператора изменилась",
      SUPPORT_WORKFORCE_REVISION_PUBLISHED: "Состав поддержки обновлён",
      SUPPORT_TEAM_CREATED: "Команда создана",
      SUPPORT_TEAM_RENAMED: "Команда переименована",
      SUPPORT_TEAM_ARCHIVED: "Команда архивирована",
      SUPPORT_SKILL_CREATED: "Навык создан",
      SUPPORT_SKILL_RENAMED: "Навык переименован",
      SUPPORT_SKILL_ARCHIVED: "Навык архивирован",
      SLA_CLOCK_CHANGED: "SLA обновлён",
      SLA_CLOCK_CORRECTED: "SLA скорректирован",
      SLA_POLICY_MIGRATED: "SLA перенесён на новую политику",
      CONVERSATION_DELIVERY_CHANGED: "Доставка сообщения изменилась",
    }[value] ?? "Активность поддержки"
  );
}

function activityActorLabel(actor: SupportLeadSafeFactDto["actor"]): string {
  if (actor.type === "CMS_USER") return "Оператор";
  if (actor.type === "BREAK_GLASS") return "Аварийный доступ";
  return "Система";
}

function activityFactKindLabel(
  value: SupportLeadSafeFactDto["factKind"],
): string {
  const labels: Record<string, string> = {
    ASSIGNMENT: "Назначение",
    AVAILABILITY: "Доступность",
    CASE: "Обращение",
    DEPENDENCY: "Зависимость",
    DELIVERY: "Доставка",
    INTERVENTION: "Вмешательство",
    REPLY: "Ответ",
    SLA: "SLA",
    WORKFORCE: "Команда поддержки",
  };
  return labels[value] ?? "Изменение";
}

function activityReasonLabel(
  value: SupportLeadSafeFactDto["reasonCode"],
): string | null {
  if (!value) return null;
  const labels: Record<string, string> = {
    SELF_CLAIM: "Оператор взял обращение",
    SKILL_MATCH: "Подобран по навыкам",
    LOAD_BALANCE: "Балансировка нагрузки",
    LEAD_INTERVENTION: "Решение лида",
    WORK_RETURNED: "Работа возвращена в очередь",
    SHIFT_END: "Смена завершена",
    LEAD_REBALANCE: "Лид перераспределил нагрузку",
    SKILL_HANDOFF: "Передача по компетенции",
    CASE_RESOLVED: "Обращение решено",
    CASE_UNRESOLVED: "Обращение не решено",
    CASE_CANCELLED: "Обращение отменено",
    ROUTING_AUTO_ASSIGN: "Автоматическая маршрутизация",
    ROUTING_OFFER_ACCEPTED: "Оператор принял предложение",
    OPERATOR_DECLINED: "Оператор отказался",
    RESERVATION_EXPIRED: "Истёк резерв",
    END_USER_CASE_CREATED: "Создано новое обращение",
    END_USER_CASE_MESSAGE_LINKED: "Сообщение связано с обращением",
    END_USER_CASE_REOPENED: "Обращение переоткрыто",
    END_USER_CASE_UPDATED: "Данные обращения обновлены",
    END_USER_CASE_STATUS_CHANGED: "Изменён статус",
    END_USER_CASE_ASSIGNED: "Изменено назначение",
    END_USER_CASE_CORRECTED: "Исправлена классификация",
    END_USER_CASE_MERGED: "Обращения объединены",
    END_USER_CASE_SPLIT: "Обращение разделено",
    OTHER: "Другая причина",
  };
  return labels[value] ?? "Причина не распознана";
}

function eventSourceLabel(value: string): string {
  return (
    {
      SERVER: "Серверная часть продукта",
      FRONTEND: "Интерфейс продукта",
      INTERNAL: "Lola",
      INTEGRATION: "Интеграция",
    }[value] ?? "Источник события не распознан"
  );
}

function eventStatusLabel(value: string): string {
  return (
    { RECEIVED: "Получено", PROCESSED: "Обработано", FAILED: "Ошибка" }[
      value
    ] ?? "Состояние события не распознано"
  );
}

onMounted(() => void props.inspector.loadActiveTab());

defineExpose({ requestClassification });
</script>

<template>
  <div class="support-conversation-context">
    <div
      ref="inspectorTabList"
      class="inspector-tabs"
      role="tablist"
      aria-label="Разделы контекста"
    >
      <button
        v-for="(tab, tabIndex) in inspectorTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :id="`support-inspector-tab-${tab.id.toLowerCase()}`"
        :aria-controls="`support-inspector-panel-${tab.id.toLowerCase()}`"
        :aria-selected="activeTab === tab.id"
        :tabindex="activeTab === tab.id ? 0 : -1"
        :class="{ active: activeTab === tab.id }"
        @click="inspector.open(tab.id)"
        @keydown="moveInspectorTab($event, tabIndex)"
      >
        <i :class="tab.icon" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </div>

    <Transition name="inspector-panel" mode="out-in">
      <div
        :key="activeTab"
        class="inspector-panel"
        role="tabpanel"
        :id="`support-inspector-panel-${activeTab.toLowerCase()}`"
        :aria-labelledby="`support-inspector-tab-${activeTab.toLowerCase()}`"
      >
        <section
          v-if="activeTab === 'CASE'"
          class="inspector-section case-section"
          aria-label="Обращение"
        >
          <SupportCaseDesk
            v-if="canReadCaseDesk && caseDesk && selection.case"
            ref="caseDeskView"
            :controller="caseDesk"
            :classification-options="selection.classificationOptions"
          />
          <template v-else-if="selection.case">
            <header class="case-header">
              <span class="section-kicker"
                >Обращение #{{ selection.case.projectSequence }}</span
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
            <SupportCaseBrief
              :case-title="selection.case.title"
              :project-sequence="selection.case.projectSequence"
              :summary="selection.case.summary"
              :goal="selection.case.goal"
            />
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
            <p>Для этого диалога обращение не создано.</p>
          </div>

          <div v-if="selection.case" class="assignment-context">
            <SupportAssignmentDesk
              :controller="assignmentController"
              :assignment="selection.case.assignment"
              :claimant-label="claimantLabel"
              viewers-label="Список наблюдателей ещё не подключён"
              :availability-label="availabilityLabel"
            />
          </div>

          <SupportCaseOperationsContext
            v-if="selection.case"
            :case-id="selection.case.id"
            :sla="canReadSlaContext ? selection.sla : null"
            :routing="canReadRoutingContext ? selection.routing : null"
            :reservation-reconcile-attempt="reservationReconcileAttempt"
            :reservation-reconcile-in-flight="reservationReconcileInFlight"
            @reconcile="emit('reconcileOperations', $event)"
          />

          <div class="case-actions">
            <div class="section-heading">
              <div>
                <span class="section-kicker">Управление</span>
                <h3>Действия с обращением</h3>
              </div>
            </div>
            <div v-if="selection.case" class="action-stack">
              <SupportLeadAssignmentDesk
                v-if="leadAssignmentController && selection.case"
                :controller="leadAssignmentController"
                :case-id="selection.case.id"
                :case-label="selection.case.title"
              />
              <Button
                v-if="canManageCase"
                class="classify-case"
                label="Классификация и приоритет"
                icon="pi pi-tags"
                severity="secondary"
                outlined
                @click="requestClassification"
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
              <SupportCaseDecisionExplain
                v-if="projectId && selection.case"
                :project-id="projectId"
                :case-id="selection.case.id"
                :can-read="canExplainCase"
              />
            </div>
            <p v-else class="empty-copy">
              Для этого обращения сейчас нет доступных действий.
            </p>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'USER'"
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
            <RouterLink
              v-if="canOpenFullProfile"
              class="user-profile-link"
              :to="{
                name: 'users',
                params: { endUserId: selection.endUser.id },
              }"
            >
              Открыть профиль
              <i class="pi pi-arrow-up-right" aria-hidden="true" />
            </RouterLink>
          </header>
          <div class="section-heading user-context-heading">
            <div>
              <span class="section-kicker">Контекст</span>
              <h3>В диалоге и проекте</h3>
            </div>
          </div>
          <dl class="user-facts">
            <div>
              <dt>Язык</dt>
              <dd class="user-language">
                <span>
                  {{
                    translationLocale?.toUpperCase() ??
                    selection.endUser.locale?.toUpperCase() ??
                    "Не указан"
                  }}
                </span>
                <Button
                  v-if="canManageTranslation"
                  type="button"
                  label="Изменить"
                  size="small"
                  text
                  @click="emit('manageTranslation')"
                />
              </dd>
            </div>
            <div>
              <dt>Диалог</dt>
              <dd>
                {{
                  !conversation
                    ? "Нет связанного чата"
                    : conversation.status === "OPEN"
                      ? "Активный"
                      : "Закрыт"
                }}
              </dd>
            </div>
            <div>
              <dt>Сообщений</dt>
              <dd>{{ conversation?.messageCount ?? "—" }}</dd>
            </div>
            <div>
              <dt>В проекте с</dt>
              <dd>{{ relativeTime(selection.endUser.createdAt) }}</dd>
            </div>
          </dl>
          <p class="privacy-copy">
            Полный профиль и разрешённые идентификаторы доступны по ссылке выше.
          </p>
        </section>

        <section
          v-else-if="activeTab === 'KNOWLEDGE' && knowledgeController"
          class="inspector-section knowledge-section"
          aria-label="Внутренняя база знаний"
        >
          <SupportInternalKnowledgePane :controller="knowledgeController" />
        </section>

        <section
          v-else-if="
            activeTab === 'INTEGRATIONS' &&
            externalWorkController &&
            externalWorkPermissions
          "
          class="inspector-section integrations-section"
          aria-label="Интеграции обращения"
        >
          <SupportCaseExternalWorkPane
            :controller="externalWorkController"
            :permissions="externalWorkPermissions"
          />
        </section>

        <section
          v-else-if="activeTab === 'DATA'"
          class="inspector-section data-section"
          aria-label="Данные пользователя"
        >
          <div class="section-heading">
            <div>
              <span class="section-kicker">Данные из продукта</span>
              <h3>Профиль пользователя</h3>
              <p class="section-description">
                Поля, переданные проектом. Доступ и свежесть проверяются для
                каждого значения.
              </p>
            </div>
            <Button
              label="Обновить данные"
              aria-label="Обновить данные пользователя"
              icon="pi pi-refresh"
              size="small"
              severity="secondary"
              text
              :loading="inspector.profile.loading.value"
              @click="inspector.reloadActiveTab()"
            />
          </div>
          <SupportInspectorState
            :loading="inspector.profile.loading.value"
            :error="inspector.profile.error.value"
            :has-content="Boolean(profile)"
            :empty="
              inspector.profile.loaded.value && !visibleProfileFields.length
            "
            :empty-title="profileEmptyState.title"
            :empty-copy="profileEmptyState.copy"
            empty-icon="pi pi-database"
            @retry="inspector.reloadActiveTab()"
          >
            <template v-if="profile">
              <div class="projection-meta">
                <span>{{ profileSyncStatusLabel(profile.syncStatus) }}</span>
                <span>Версия {{ profile.profileVersion }}</span>
                <span>{{
                  profile.observedAt
                    ? `Наблюдалось ${relativeTime(profile.observedAt)}`
                    : "Время не передано"
                }}</span>
                <span
                  >Источник:
                  {{ profileProvenanceLabel(profile.provenance) }}</span
                >
              </div>
              <dl class="profile-fields">
                <div
                  v-for="field in visibleProfileFields"
                  :key="field.definitionId"
                >
                  <dt>{{ field.label }}</dt>
                  <dd>{{ profileFieldValue(field) }}</dd>
                  <small>
                    {{ profileValueStateLabel(field.availability) }} ·
                    {{ profileClassificationLabel(field.classification) }}
                    <template v-if="field.observedAt">
                      · {{ relativeTime(field.observedAt) }}</template
                    >
                    <template v-if="field.untrustedData">
                      · требует проверки</template
                    >
                  </small>
                </div>
              </dl>
            </template>
          </SupportInspectorState>
        </section>

        <section
          v-else-if="activeTab === 'EVENTS'"
          class="inspector-section events-section"
          aria-label="События пользователя"
        >
          <div class="section-heading">
            <div>
              <span class="section-kicker">Последние 30 дней</span>
              <h3>События, связанные с обращением</h3>
            </div>
            <Button
              label="Обновить события"
              aria-label="Обновить события"
              icon="pi pi-refresh"
              size="small"
              severity="secondary"
              text
              :loading="inspector.events.loading.value"
              @click="inspector.reloadActiveTab()"
            />
          </div>
          <SupportInspectorState
            :loading="inspector.events.loading.value"
            :error="inspector.events.error.value"
            :has-content="Boolean(inspector.events.data.value?.items.length)"
            :empty="
              inspector.events.loaded.value &&
              !inspector.events.data.value?.items.length
            "
            empty-title="Событий пока нет"
            empty-copy="В защищённом наборе данных для этого обращения ничего не найдено."
            empty-icon="pi pi-bolt"
            @retry="inspector.reloadActiveTab()"
          >
            <ol class="event-list">
              <li
                v-for="event in inspector.events.data.value?.items ?? []"
                :key="event.id"
              >
                <span
                  class="event-icon"
                  :class="`status-${event.status.toLowerCase()}`"
                >
                  <i class="pi pi-wave-pulse" aria-hidden="true" />
                </span>
                <div>
                  <header>
                    <strong>{{ event.name }}</strong>
                    <time :datetime="event.occurredAt">{{
                      relativeTime(event.occurredAt)
                    }}</time>
                  </header>
                  <p>
                    {{ eventSourceLabel(event.source) }} ·
                    {{ eventStatusLabel(event.status) }}
                  </p>
                  <code>{{ event.code }}</code>
                </div>
              </li>
            </ol>
            <Button
              v-if="inspector.events.data.value?.nextCursor"
              class="load-more-context"
              label="Показать более ранние"
              icon="pi pi-chevron-down"
              severity="secondary"
              outlined
              :loading="inspector.events.loading.value"
              @click="inspector.loadMoreEvents()"
            />
          </SupportInspectorState>
        </section>

        <section
          v-else
          class="inspector-section activity-section"
          aria-label="Активность поддержки"
        >
          <div class="section-heading">
            <div>
              <span class="section-kicker">Причинная лента</span>
              <h3>Кто и почему изменил обращение</h3>
            </div>
            <Button
              label="Обновить активность"
              aria-label="Обновить активность"
              icon="pi pi-refresh"
              size="small"
              severity="secondary"
              text
              :loading="inspector.activity.loading.value"
              @click="inspector.reloadActiveTab()"
            />
          </div>
          <SupportInspectorState
            :loading="inspector.activity.loading.value"
            :error="inspector.activity.error.value"
            :has-content="
              Boolean(inspector.activity.data.value?.data.facts.length)
            "
            :empty="
              inspector.activity.loaded.value &&
              !inspector.activity.data.value?.data.facts.length
            "
            empty-title="Активности пока нет"
            empty-copy="Серверная причинная лента ещё не содержит фактов по обращению."
            empty-icon="pi pi-history"
            @retry="inspector.reloadActiveTab()"
          >
            <div v-if="inspector.activity.data.value" class="projection-meta">
              <span>{{
                inspector.activity.data.value.freshnessState === "READY"
                  ? "Данные актуальны"
                  : inspector.activity.data.value.freshnessState
              }}</span>
              <span
                >Рассчитано
                {{
                  relativeTime(inspector.activity.data.value.computedAt)
                }}</span
              >
            </div>
            <ol class="activity-list">
              <li
                v-for="fact in inspector.activity.data.value?.data.facts ?? []"
                :key="fact.activityId"
              >
                <span class="activity-marker" aria-hidden="true" />
                <div>
                  <header>
                    <strong>{{ activityTypeLabel(fact.eventCode) }}</strong>
                    <time :datetime="fact.occurredAt">{{
                      relativeTime(fact.occurredAt)
                    }}</time>
                  </header>
                  <p>
                    {{ activityActorLabel(fact.actor) }} ·
                    {{ activityFactKindLabel(fact.factKind) }}
                  </p>
                  <p
                    v-if="activityReasonLabel(fact.reasonCode)"
                    class="activity-reason"
                  >
                    {{ activityReasonLabel(fact.reasonCode) }}
                  </p>
                </div>
              </li>
            </ol>
            <Button
              v-if="inspector.activity.data.value?.nextCursor"
              class="load-more-context"
              label="Показать более ранние"
              icon="pi pi-chevron-down"
              severity="secondary"
              outlined
              :loading="inspector.activity.loading.value"
              @click="inspector.loadMoreActivity()"
            />
          </SupportInspectorState>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.inspector-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 82px), 1fr));
  gap: 2px;
  margin: -4px -8px 20px;
  padding: 4px;
  border-bottom: 1px solid var(--line);
}
.inspector-tabs button {
  min-height: 44px;
  min-width: 82px;
  padding: 0 6px;
  overflow: hidden;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.64rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 140ms ease-out,
    background-color 140ms ease-out,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inspector-tabs button i {
  display: block;
  margin-bottom: 4px;
  font-size: 0.82rem;
}
.inspector-tabs button.active {
  background: var(--brand-soft);
  color: var(--text-brand);
}
.inspector-tabs button:active {
  transform: scale(0.97);
}
.inspector-tabs button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.inspector-section {
  min-height: 260px;
}
.inspector-panel {
  min-height: 260px;
}
.inspector-panel-enter-active,
.inspector-panel-leave-active {
  transition:
    opacity 140ms ease-out,
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inspector-panel-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.inspector-panel-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}
.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
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
.user-profile-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--text-brand);
  font-size: 0.7rem;
  font-weight: 720;
  text-decoration: none;
  white-space: nowrap;
}
.user-profile-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.user-profile-link:focus-visible {
  border-radius: 6px;
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
}
.user-profile-link .pi {
  font-size: 0.62rem;
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
.user-context-heading {
  margin-bottom: 4px;
}
.section-description {
  max-width: 30rem;
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 0.68rem;
  line-height: 1.45;
  text-wrap: pretty;
}
.user-facts {
  display: grid;
  margin: 0;
}
.user-facts > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
}
.user-facts dt {
  color: var(--text-muted);
  font-size: 0.72rem;
}
.user-facts dd {
  max-width: 13rem;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 700;
  text-align: right;
}
.user-language {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.profile-heading {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.privacy-copy {
  margin: 14px 0 0;
  padding: 10px 11px;
  border-radius: 10px;
  background: var(--surface-muted);
  color: var(--text-muted);
  font-size: 0.7rem;
  line-height: 1.45;
  text-wrap: pretty;
}
.projection-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.projection-meta span {
  min-height: 24px;
  padding: 4px 7px;
  display: inline-flex;
  align-items: center;
  border-radius: 7px;
  background: var(--surface-muted);
  color: var(--text-muted);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
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
.assignment-context {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.action-stack {
  display: grid;
  gap: 10px;
}
.case-actions {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.action-stack :deep(.p-button) {
  width: 100%;
  justify-content: flex-start;
}
.activity-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.event-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.event-list li {
  min-width: 0;
  padding: 12px 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
}
.event-list li:first-child {
  padding-top: 2px;
}
.event-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.event-icon.status-failed {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.event-list header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.event-list strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 0.75rem;
  line-height: 1.35;
}
.event-list time,
.event-list p,
.event-list code {
  color: var(--text-muted);
  font-size: 0.65rem;
  line-height: 1.4;
}
.event-list time {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.event-list p {
  margin: 4px 0 0;
}
.event-list code {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-list li {
  position: relative;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 18px;
}
.activity-list li:not(:last-child)::before {
  content: "";
  position: absolute;
  top: 11px;
  bottom: 0;
  left: 5px;
  width: 1px;
  background: var(--line);
}
.activity-marker {
  position: relative;
  z-index: 1;
  width: 11px;
  height: 11px;
  margin-top: 4px;
  border: 3px solid var(--surface);
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 1px var(--line);
}
.activity-list header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.activity-list strong {
  font-size: 0.76rem;
}
.activity-list time,
.activity-list p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 0.67rem;
  line-height: 1.4;
}
.activity-list .activity-reason {
  color: var(--text-primary);
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
  padding: 10px 0;
  display: grid;
  gap: 3px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
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
.load-more-context {
  width: 100%;
  margin-top: 12px;
}
@media (max-width: 720px) {
  .inspector-tabs {
    margin-inline: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .inspector-tabs button,
  .inspector-panel-enter-active,
  .inspector-panel-leave-active {
    transition-duration: 1ms;
  }
  .inspector-panel-enter-from,
  .inspector-panel-leave-to {
    transform: none;
  }
}
</style>
