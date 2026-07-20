<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { useAdminConversationConsole } from "@/features/admin-conversations/model/use-admin-conversation-console";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import ConversationAISuspensionBanner from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionBanner.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHistory from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHistory.vue";
import UserAISuspensionIndicator from "@/features/conversation-ai-suspension/ui/UserAISuspensionIndicator.vue";
import {
  reportSuspensionEvent,
  suspensionDurationBucket,
} from "@/features/conversation-ai-suspension/model/suspension-analytics";
import CodeBlock from "@/features/end-user-attributes/ui/CodeBlock.vue";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import {
  formatProfileValue,
  profileValueStateLabel,
} from "@/features/end-user-profile/model/profile-value";
import { repository } from "@/shared/api/repository";
import type {
  CmsProfileSummaryResponseDto,
  ExtendConversationAISuspensionDto,
  ProfileProjectionFieldResponseDto,
  ProfileProjectionResponseDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";
import { formatDate, relativeTime } from "@/shared/lib/format";
import { russianCount } from "@/shared/lib/russian-count";
import type { ConversationMessage } from "@/shared/types/domain";
import { conversationAISuspensionEnabled } from "@/shared/config/features";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";

const auth = useAuthStore();
const suspensionStore = useConversationAISuspensionStore();
const route = useRoute();
const router = useRouter();
const items = ref<CmsProfileSummaryResponseDto[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const detailLoading = ref(false);
const error = ref("");
const detailError = ref("");
const query = ref("");
const appliedQuery = ref("");
const filterDefinitionId = ref("");
const filterOperator = ref<"EQ" | "LT" | "LTE" | "GT" | "GTE">("EQ");
const filterValue = ref("");
const sort = ref<"LAST_SEEN_DESC" | "LAST_SEEN_ASC">("LAST_SEEN_DESC");
const aiFilter = ref<"ALL" | "SUSPENDED">("ALL");
const selected = ref<CmsProfileSummaryResponseDto | null>(null);
const detail = ref<ProfileProjectionResponseDto | null>(null);
const drawerVisible = ref(false);
const showDeveloperKeys = ref(false);
const showArchivedFields = ref(false);
let requestSequence = 0;
let detailRequestSequence = 0;
let realtimeReloadTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribeSummaryReconcile: (() => void) | undefined;
const suspensionDialogVisible = ref(false);
const suspensionHistoryVisible = ref(false);
const suspensionDialogMode = ref<"START" | "EXTEND" | "RESUME">("START");
const combinedSend = ref(false);

const {
  conversations,
  selectedConversation,
  messages,
  conversationsLoading,
  conversationsLoadingMore,
  nextConversationCursor,
  messagesLoading,
  conversationError,
  onlineSession,
  replyText,
  sendingReply,
  combinedSuspensionError,
  reset: resetConversationConsole,
  loadConversations,
  loadMoreConversations,
  loadMessages,
  sendReply,
  suspendAndSendReply,
} = useAdminConversationConsole({
  projectId: () => auth.project?.id,
  endUserId: () => selected.value?.endUserId,
  updateRoute: (conversationId) =>
    router.replace({
      name: "users",
      params: { endUserId: selected.value?.endUserId },
      query: { conversationId },
    }),
});

const availableFields = computed(() => {
  const byId = new Map<string, ProfileProjectionFieldResponseDto>();
  items.value
    .flatMap((item) => item.fields)
    .forEach((field) => byId.set(field.definitionId, field));
  return [...byId.values()].map((field) => ({
    value: field.definitionId,
    label: `${field.label} · ${field.key}`,
  }));
});
const visibleDetailFields = computed(() =>
  (detail.value?.fields ?? []).filter(
    (field) => showArchivedFields.value || field.lifecycle !== "ARCHIVED",
  ),
);
const operatorOptions = [
  { value: "EQ", label: "Равно" },
  { value: "LT", label: "Меньше" },
  { value: "LTE", label: "Не больше" },
  { value: "GT", label: "Больше" },
  { value: "GTE", label: "Не меньше" },
];
const sortOptions = [
  { value: "LAST_SEEN_DESC", label: "Сначала недавно активные" },
  { value: "LAST_SEEN_ASC", label: "Сначала давно активные" },
];
const aiFilterOptions = [
  { value: "ALL", label: "Все" },
  { value: "SUSPENDED", label: "Приостановлен" },
];
const canManageSuspension = computed(() =>
  auth.user?.role === "OWNER" || auth.user?.role === "ADMIN",
);
const selectedSuspensionEntry = computed(() =>
  selectedConversation.value
    ? suspensionStore.getEntry(selectedConversation.value.id)
    : undefined,
);
const selectedActiveConversationCount = computed(() => {
  // Повторный расчёт нужен при локальном истечении срока и после события канала.
  void suspensionStore.changeRevision;
  const summary = selected.value?.conversationAiSuspensionSummary;
  if (!summary || summary.activeConversationCount <= 0) return 0;
  if (!summary.nearestSuspendedUntil) return summary.activeConversationCount;
  const deadline = Date.parse(summary.nearestSuspendedUntil);
  const serverTime = Date.parse(summary.serverTime);
  if (!Number.isFinite(deadline) || !Number.isFinite(serverTime)) return 0;
  const knownOffset = conversations.value
    .map((conversation) => suspensionStore.getEntry(conversation.id)?.serverOffsetMs)
    .find((offset): offset is number => offset !== undefined);
  const clientNow = Date.now();
  const estimatedServerNow = clientNow + (knownOffset ?? serverTime - clientNow);
  return deadline > estimatedServerNow ? summary.activeConversationCount : 0;
});

watch(
  conversations,
  (value) => suspensionStore.ingestConversations(value),
  { flush: "sync" },
);
watch(
  () => selectedConversation.value?.id,
  (conversationId) => {
    const endUserId = selected.value?.endUserId;
    if (conversationId && endUserId)
      void suspensionStore.loadDetail(endUserId, conversationId);
  },
);
watch(
  () => suspensionStore.changeRevision,
  scheduleSuspensionSummaryReload,
);
onBeforeUnmount(() => {
  if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer);
  unsubscribeSummaryReconcile?.();
});

onMounted(async () => {
  if (conversationAISuspensionEnabled) {
    unsubscribeSummaryReconcile = cmsRealtimeClient.reconcile(() => {
      const endUserId = selected.value?.endUserId;
      return endUserId ? refreshSelectedSummary(endUserId) : load();
    });
  }
  await load();
  const endUserId = route.params.endUserId;
  if (typeof endUserId !== "string") return;
  const profile = items.value.find((item) => item.endUserId === endUserId);
  if (profile) {
    await openProfile(profile, false);
    return;
  }
  const projectId = auth.project?.id;
  if (!projectId) return;
  try {
    const exactProfile = await endUserProfileRepository.profile(
      projectId,
      endUserId,
    );
    const summary = await loadExactProfileSummary(
      projectId,
      exactProfile.endUserId,
      exactProfile.externalUserId,
    );
    if (!summary) throw new Error("Сводка пользователя не найдена");
    await openProfile(summary, false, exactProfile);
  } catch {
    detailError.value = "Не удалось открыть пользователя";
  }
});

function mockField(
  definitionId: string,
  key: string,
  label: string,
  valueType: string,
  value: string | number | boolean | undefined,
): ProfileProjectionFieldResponseDto {
  return {
    definitionId,
    definitionRevisionId: `${definitionId}-r1`,
    key,
    label,
    valueType,
    lifecycle: "ACTIVE",
    classification: "INTERNAL",
    access: "ALLOWED",
    availability: value === undefined ? "MISSING" : "AVAILABLE",
    ...(value === undefined ? {} : { value: { type: valueType, value } }),
  };
}

async function load(append = false) {
  const projectId = auth.project?.id;
  if (!projectId || (append && !nextCursor.value)) return;
  const request = ++requestSequence;
  if (append) loadingMore.value = true;
  else loading.value = true;
  error.value = "";
  try {
    let response: {
      items: CmsProfileSummaryResponseDto[];
      nextCursor?: string | null;
    };
    if (repository.mode === "mock") {
      const legacy = await repository.getUsersPage(projectId, { limit: 50 });
      const normalizedQuery = appliedQuery.value.toLowerCase();
      const profiles = (await Promise.all(legacy.items.map(async (user) => {
        const conversationPage = await repository.getConversations(projectId, user.id, { limit: 30 });
        const activeConversations = conversationPage.items.filter((conversation) => {
          const state = conversation.aiSuspension;
          return state.mode === "SUSPENDED" && state.lifecycle === "ACTIVE" && Boolean(state.suspendedUntil) && Date.parse(state.suspendedUntil!) > Date.parse(state.serverTime);
        });
        const deadlines = activeConversations.flatMap((conversation) => conversation.aiSuspension.suspendedUntil ? [conversation.aiSuspension.suspendedUntil] : []);
        return ({
          endUserId: user.id,
          externalUserId: user.externalId,
          locale: user.locale,
          lastSeenAt: user.lastSeenAt,
          observedAt: user.lastSeenAt,
          profileVersion: "1",
          syncStatus: "VALID" as const,
          conversationAiSuspensionSummary: {
            activeConversationCount: activeConversations.length,
            nearestSuspendedUntil: deadlines.sort()[0] ?? null,
            mostRecentlyStartedConversationId: activeConversations[0]?.id ?? null,
            serverTime: new Date().toISOString(),
          },
          fields: [
            mockField(
              "attr-name",
              "displayName",
              "Отображаемое имя",
              "STRING",
              user.profile.name,
            ),
            mockField(
              "attr-email",
              "email",
              "Электронная почта",
              "STRING",
              user.profile.email,
            ),
            mockField(
              "attr-country",
              "country",
              "Страна",
              "COUNTRY_CODE",
              user.profile.country,
            ),
            mockField(
              "attr-tier",
              "loyaltyTier",
              "Уровень лояльности",
              "STRING",
              user.segment,
            ),
          ],
        });
      })))
        .filter(
          (profile) =>
            !normalizedQuery ||
            profile.externalUserId.toLowerCase().includes(normalizedQuery),
        )
        .filter((profile) => aiFilter.value !== "SUSPENDED" || profile.conversationAiSuspensionSummary.activeConversationCount > 0);
      response = { items: profiles, nextCursor: null };
    } else {
      response = await endUserProfileRepository.list(projectId, {
        limit: 50,
        ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}),
        ...(appliedQuery.value ? { externalUserId: appliedQuery.value } : {}),
        ...(aiFilter.value === "SUSPENDED"
          ? { hasActiveConversationAiSuspension: true }
          : {}),
        ...(filterDefinitionId.value && filterValue.value
          ? {
              filterDefinitionId: filterDefinitionId.value,
              filterOperator: filterOperator.value,
              ...(filterValue.value ? { filterValue: filterValue.value } : {}),
            }
          : {}),
        sort: sort.value,
      });
    }
    if (request !== requestSequence) return;
    items.value = append ? [...items.value, ...response.items] : response.items;
    nextCursor.value = response.nextCursor ?? null;
  } catch {
    if (request === requestSequence)
      error.value = "Не удалось загрузить профили пользователей";
  } finally {
    if (request === requestSequence) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function search() {
  appliedQuery.value = query.value.trim();
  nextCursor.value = null;
  void load();
}

function changeAIFilter() {
  nextCursor.value = null;
  void load();
}

function scheduleSuspensionSummaryReload() {
  if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer);
  const endUserId = selected.value?.endUserId;
  realtimeReloadTimer = setTimeout(
    () => void (endUserId ? refreshSelectedSummary(endUserId) : load()),
    250,
  );
}

function conversationIsSuspended(conversationId: string): boolean {
  const entry = suspensionStore.getEntry(conversationId);
  if (!entry || entry.locallyExpired) return false;
  const deadline = entry.summary.suspendedUntil
    ? Date.parse(entry.summary.suspendedUntil)
    : Number.NaN;
  return (
    entry.summary.mode === "SUSPENDED" &&
    entry.summary.lifecycle === "ACTIVE" &&
    Number.isFinite(deadline) &&
    deadline > Date.now() + entry.serverOffsetMs
  );
}

function suspensionTime(conversationId: string): string {
  const value = suspensionStore.getEntry(conversationId)?.summary.suspendedUntil;
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";
}

function openSuspensionDialog(mode: "START" | "EXTEND" | "RESUME") {
  combinedSend.value = false;
  suspensionDialogMode.value = mode;
  suspensionDialogVisible.value = true;
  reportSuspensionEvent("conversation_ai_suspension_dialog_opened", {
    source: "conversation_banner",
  });
}

function openCombinedSend() {
  combinedSend.value = true;
  suspensionDialogMode.value = "START";
  suspensionDialogVisible.value = true;
  reportSuspensionEvent("conversation_ai_suspension_dialog_opened", {
    source: "combined_send",
  });
}

async function refreshSelectedSummary(endUserId: string) {
  const projectId = auth.project?.id;
  const externalUserId = selected.value?.externalUserId;
  if (!projectId || !externalUserId) return;
  await load();
  if (
    auth.project?.id !== projectId ||
    selected.value?.endUserId !== endUserId
  ) return;
  let refreshed = items.value.find((item) => item.endUserId === endUserId) ?? null;
  if (!refreshed) {
    try {
      refreshed = await loadExactProfileSummary(projectId, endUserId, externalUserId);
    } catch {
      return;
    }
  }
  if (refreshed && selected.value?.endUserId === endUserId)
    selected.value = refreshed;
}

async function loadExactProfileSummary(
  projectId: string,
  endUserId: string,
  externalUserId: string,
): Promise<CmsProfileSummaryResponseDto | null> {
  const page = await endUserProfileRepository.list(projectId, {
    limit: 50,
    externalUserId,
  });
  return page.items.find((item) => item.endUserId === endUserId) ?? null;
}

async function submitSuspension(value: {
  key: string;
  command:
    | StartConversationAISuspensionDto
    | ExtendConversationAISuspensionDto
    | ResumeConversationAIDto;
}) {
  const conversation = selectedConversation.value;
  const endUserId = selected.value?.endUserId;
  const projectId = auth.project?.id;
  if (!conversation || !endUserId || !projectId) return;
  if (combinedSend.value && suspensionDialogMode.value === "START") {
    const command = value.command as StartConversationAISuspensionDto;
    const result = await suspendAndSendReply(
      command,
      value.key,
    );
    if (
      auth.project?.id !== projectId ||
      selected.value?.endUserId !== endUserId ||
      selectedConversation.value?.id !== conversation.id
    ) return;
    const combinedErrorKind = combinedSuspensionError.value?.kind;
    if (result?.aiSuspension) {
      suspensionStore.applyConfirmedState(
        endUserId,
        conversation.id,
        result.aiSuspension.state,
        result.aiSuspension.inFlightCancellation?.status,
      );
      const confirmedEntry = suspensionStore.getEntry(conversation.id);
      if (confirmedEntry) conversation.aiSuspension = confirmedEntry.summary;
    }
    await suspensionStore.loadDetail(endUserId, conversation.id);
    if (!result) {
      if (
        combinedErrorKind === "CONVERSATION_CLOSED" ||
        combinedErrorKind === "NOT_FOUND"
      ) {
        await loadConversations(endUserId);
      }
      reportSuspensionEvent("conversation_ai_suspension_command_failed", {
        command: "start_and_send",
        error_kind: combinedErrorKind ?? "unknown_result",
      });
      return;
    }
    reportSuspensionEvent("conversation_ai_suspension_started", {
      duration_bucket: suspensionDurationBucket(command.durationSeconds),
      reason: command.reason,
      source: "combined_send",
    });
    suspensionDialogVisible.value = false;
    combinedSend.value = false;
    await refreshSelectedSummary(endUserId);
    return;
  }
  const succeeded =
    suspensionDialogMode.value === "START"
      ? await suspensionStore.start(
          endUserId,
          conversation.id,
          value.command as StartConversationAISuspensionDto,
          value.key,
        )
      : suspensionDialogMode.value === "EXTEND"
        ? await suspensionStore.extend(
            endUserId,
            conversation.id,
            value.command as ExtendConversationAISuspensionDto,
            value.key,
          )
        : await suspensionStore.resume(
            endUserId,
            conversation.id,
            value.command as ResumeConversationAIDto,
            value.key,
          );
  if (!succeeded) {
    const errorKind = suspensionStore.getEntry(conversation.id)?.error?.kind;
    if (errorKind === "CONVERSATION_CLOSED" || errorKind === "NOT_FOUND") {
      await loadConversations(endUserId);
    }
    return;
  }
  suspensionDialogVisible.value = false;
  const entry = suspensionStore.getEntry(conversation.id);
  if (entry) conversation.aiSuspension = entry.summary;
  await refreshSelectedSummary(endUserId);
}

async function openProfile(
  profile: CmsProfileSummaryResponseDto,
  updateRoute = true,
  prefetchedDetail?: ProfileProjectionResponseDto,
) {
  const projectId = auth.project?.id;
  if (!projectId) return;
  if (profile.conversationAiSuspensionSummary.activeConversationCount > 0) {
    reportSuspensionEvent("conversation_ai_suspension_indicator_opened", {
      surface: updateRoute ? "users_table" : "direct_link",
    });
  }
  const request = ++detailRequestSequence;
  selected.value = profile;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  drawerVisible.value = true;
  resetConversationConsole();
  if (updateRoute)
    await router.replace({
      name: "users",
      params: { endUserId: profile.endUserId },
    });
  void loadConversations(
    profile.endUserId,
    typeof route.query.conversationId === "string"
      ? route.query.conversationId
      : (profile.conversationAiSuspensionSummary
          .mostRecentlyStartedConversationId ?? undefined),
  );
  try {
    const response: ProfileProjectionResponseDto =
      repository.mode === "mock"
        ? ({
            endUserId: profile.endUserId,
            externalUserId: profile.externalUserId,
            profileVersion: profile.profileVersion,
            syncStatus: profile.syncStatus,
            fields: profile.fields,
            observedAt: profile.observedAt,
            receivedAt: profile.lastSeenAt,
            ageSeconds: Math.max(
              0,
              Math.round(
                (Date.now() -
                  new Date(
                    profile.observedAt ?? profile.lastSeenAt,
                  ).valueOf()) /
                  1000,
              ),
            ),
            contractRevision: 1,
            provenance: "PRODUCT_PROFILE",
          } as ProfileProjectionResponseDto)
        : (prefetchedDetail ??
          (await endUserProfileRepository.profile(
            projectId,
            profile.endUserId,
          )));
    if (
      request === detailRequestSequence &&
      selected.value?.endUserId === profile.endUserId
    )
      detail.value = response;
  } catch {
    if (request === detailRequestSequence)
      detailError.value = "Не удалось загрузить профиль";
  } finally {
    if (request === detailRequestSequence) detailLoading.value = false;
  }
}

function closeProfile() {
  drawerVisible.value = false;
  selected.value = null;
  detail.value = null;
  resetConversationConsole();
  void router.replace({ name: "users" });
}

function messageAuthorLabel(author: ConversationMessage["author"]): string {
  return (
    {
      USER: "Пользователь",
      ASSISTANT: "Lola",
      ADMIN: "Администратор",
      SCENARIO: "Сценарий",
      SYSTEM: "Система",
    }[author] ?? author
  );
}

function displayField(field: ProfileProjectionFieldResponseDto): string {
  return field.availability === "AVAILABLE" &&
    field.access === "ALLOWED" &&
    field.value
    ? formatProfileValue(field.value)
    : profileValueStateLabel(
        field.access === "ALLOWED" ? field.availability : "DENIED",
      );
}

function syncSeverity(status: string) {
  return status === "VALID"
    ? "success"
    : status === "VALID_WITH_WARNINGS"
      ? "warn"
      : status === "NO_VALID_SNAPSHOT"
        ? "secondary"
        : "danger";
}

function syncStatusLabel(status: string) {
  return (
    {
      VALID: "Данные приняты",
      VALID_WITH_WARNINGS: "Принято с предупреждением",
      NO_VALID_SNAPSHOT: "Профиль ещё не передан",
      INVALID: "Обновление отклонено",
    }[status] ?? status
  );
}

function valueTypeLabel(type: string) {
  return (
    {
      STRING: "Текст",
      BOOLEAN: "Да или нет",
      INTEGER: "Целое число",
      DECIMAL: "Десятичное число",
      DATE: "Дата",
      DATETIME: "Дата и время",
      COUNTRY_CODE: "Страна",
      CURRENCY_CODE: "Валюта",
    }[type] ?? type
  );
}

function availabilityLabel(value: string) {
  return (
    {
      AVAILABLE: "Есть значение",
      MISSING: "Не передано",
      NULL: "Пустое значение",
      INVALID: "Некорректное значение",
      STALE: "Данные устарели",
      DENIED: "Нет доступа",
    }[value] ?? value
  );
}

function lifecycleLabel(value: string) {
  return (
    {
      ACTIVE: "Активно",
      DEPRECATED: "Выводится из использования",
      ARCHIVED: "В архиве",
    }[value] ?? value
  );
}

function classificationLabel(value: string) {
  return (
    {
      INTERNAL: "Служебные данные",
      PERSONAL: "Персональные данные",
      SENSITIVE: "Чувствительные данные",
    }[value] ?? value
  );
}
</script>

<template>
  <section class="page profiles-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Данные пользователей</div>
        <h1>Профили пользователей</h1>
        <p class="subtitle">
          Последние данные, которые ваш продукт передал в Lola. Откройте
          пользователя, чтобы посмотреть его поля и состояние обновления.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Как устроены поля"
          icon="pi pi-book"
          severity="secondary"
          text
          as="router-link"
          :to="{ name: 'profile-fields-guide' }"
        />
        <Button
          label="Настроить поля профиля"
          icon="pi pi-sliders-h"
          severity="secondary"
          outlined
          as="router-link"
          to="/profile-fields"
        />
      </div>
    </header>
    <RouterLink to="/profile-fields" class="profile-fields-callout card">
      <span class="callout-icon"><i class="pi pi-id-card" /></span>
      <span>
        <strong>Нужно добавить или изменить данные профиля?</strong>
        <small>Настройте названия, типы и доступность полей.</small>
      </span>
      <span class="callout-action"
        >Настроить поля <i class="pi pi-arrow-right"
      /></span>
    </RouterLink>
    <Message v-if="error" severity="error" :closable="false"
      ><div class="error-row">
        <span>{{ error }}</span
        ><Button label="Повторить" size="small" text @click="load()" /></div
    ></Message>

    <form class="filters card" @submit.prevent="search">
      <label class="search"
        ><span>ID пользователя в вашем продукте</span>
        <div>
          <i class="pi pi-search" /><InputText
            v-model="query"
            placeholder="user-123"
          /><Button type="submit" label="Найти" /></div
      ></label>
      <label
        ><span>Поле профиля</span
        ><Select
          v-model="filterDefinitionId"
          :options="availableFields"
          option-label="label"
          option-value="value"
          show-clear
          placeholder="Без фильтра"
      /></label>
      <label
        ><span>Оператор</span
        ><Select
          v-model="filterOperator"
          :options="operatorOptions"
          option-label="label"
          option-value="value"
          :disabled="!filterDefinitionId"
      /></label>
      <label
        ><span>Значение</span
        ><InputText v-model="filterValue" :disabled="!filterDefinitionId"
      /></label>
      <label
        ><span>Сортировка</span
        ><Select
          v-model="sort"
          :options="sortOptions"
          option-label="label"
          option-value="value"
          @change="load()"
      /></label>
      <label v-if="conversationAISuspensionEnabled"
        ><span>AI</span
        ><Select
          v-model="aiFilter"
          :options="aiFilterOptions"
          option-label="label"
          option-value="value"
          aria-label="Состояние AI"
          @change="changeAIFilter"
      /></label>
    </form>

    <div class="card table-card">
      <div v-if="loading" class="loading-list">
        <Skeleton v-for="item in 7" :key="item" height="58px" />
      </div>
      <DataTable
        v-else
        :value="items"
        row-hover
        data-key="endUserId"
        @row-click="openProfile($event.data)"
      >
        <template #empty
          ><div class="empty">
            <i class="pi pi-users" /><strong>Профили не найдены</strong
            ><span>По заданным условиям нет пользователей.</span>
          </div></template
        >
        <Column header="Пользователь"
          ><template #body="{ data }"
            ><div class="user-cell">
              <span class="avatar">{{
                data.externalUserId.slice(0, 1).toUpperCase()
              }}</span>
              <div>
                <strong>{{ data.externalUserId }}</strong
                ><small>ID {{ data.endUserId }}</small>
              </div>
              <UserAISuspensionIndicator
                v-if="conversationAISuspensionEnabled"
                :summary="data.conversationAiSuspensionSummary"
                @expired="scheduleSuspensionSummaryReload"
              />
            </div></template
          ></Column
        >
        <Column header="Данные профиля"
          ><template #body="{ data }"
            ><div class="preview-fields">
              <span
                v-for="field in data.fields.slice(0, 2)"
                :key="field.definitionId"
                ><b>{{ field.label }}</b
                >{{ displayField(field) }}</span
              ><small v-if="data.fields.length > 2"
                >+{{ data.fields.length - 2 }} полей</small
              >
            </div></template
          ></Column
        >
        <Column header="Состояние"
          ><template #body="{ data }"
            ><Tag
              :value="syncStatusLabel(data.syncStatus)"
              :severity="syncSeverity(data.syncStatus)" /></template
        ></Column>
        <Column header="Версия профиля" class="mobile-hide"
          ><template #body="{ data }">{{
            data.profileVersion
          }}</template></Column
        >
        <Column header="Данные получены" class="mobile-hide"
          ><template #body="{ data }"
            ><span :title="formatDate(data.observedAt)">{{
              data.observedAt ? relativeTime(data.observedAt) : "Данных ещё нет"
            }}</span></template
          ></Column
        >
        <Column header="Последняя активность" class="mobile-hide"
          ><template #body="{ data }">{{
            relativeTime(data.lastSeenAt)
          }}</template></Column
        >
        <Column
          ><template #body="{ data }"
            ><Button
              icon="pi pi-chevron-right"
              severity="secondary"
              text
              rounded
              :aria-label="`Открыть профиль ${data.externalUserId}`"
              @click.stop="openProfile(data)" /></template
        ></Column>
      </DataTable>
      <div v-if="!loading && nextCursor" class="load-more">
        <Button
          label="Загрузить ещё"
          icon="pi pi-chevron-down"
          severity="secondary"
          outlined
          :loading="loadingMore"
          @click="load(true)"
        />
      </div>
    </div>
  </section>

  <Drawer
    v-model:visible="drawerVisible"
    class="user-profile-drawer"
    position="right"
    :style="{ width: 'min(680px, 100vw)' }"
    @update:visible="!$event && closeProfile()"
  >
    <template #header
      ><div>
        <div class="eyebrow">Профиль пользователя</div>
        <h2>{{ selected?.externalUserId }}</h2>
      </div></template
    >
    <div v-if="detailLoading" class="loading-list">
      <Skeleton v-for="item in 6" :key="item" height="72px" />
    </div>
    <Message v-else-if="detailError" severity="error" :closable="false">{{
      detailError
    }}</Message>
    <div v-else-if="detail" class="profile-detail">
      <section class="profile-meta surface-soft">
        <div>
          <span>Версия профиля</span
          ><strong>{{ detail.profileVersion }}</strong>
        </div>
        <div>
          <span>Версия полей</span
          ><strong>{{ detail.contractRevision ?? "Не указана" }}</strong>
        </div>
        <div>
          <span>Данные актуальны на</span
          ><strong>{{
            detail.observedAt ? formatDate(detail.observedAt) : "Данных ещё нет"
          }}</strong>
        </div>
        <div>
          <span>Возраст</span
          ><strong>{{
            detail.ageSeconds === null || detail.ageSeconds === undefined
              ? "—"
              : `${detail.ageSeconds} сек.`
          }}</strong>
        </div>
        <div>
          <span>Получено Lola</span
          ><strong>{{
            detail.receivedAt ? formatDate(detail.receivedAt) : "—"
          }}</strong>
        </div>
        <div>
          <span>Состояние обновления</span
          ><Tag
            :value="syncStatusLabel(detail.syncStatus)"
            :severity="syncSeverity(detail.syncStatus)"
          />
        </div>
      </section>
      <Message v-if="detail.lastRejectedSync" severity="warn" :closable="false"
        ><strong>Последнее обновление отклонено.</strong> Ниже показаны
        последние корректные данные; отклонённое обновление их не заменило.<span
          v-if="detail.lastRejectedSync.at"
        >
          {{ formatDate(detail.lastRejectedSync.at) }}.</span
        ><span v-if="detail.lastRejectedSync.issues?.length">
          Причины:
          {{
            detail.lastRejectedSync.issues
              .map((issue) => issue.code)
              .join(", ")
          }}.</span
        ></Message
      >
      <div class="detail-nav">
        <strong
          >{{ visibleDetailFields.length }} полей в опубликованной
          версии</strong
        ><label class="detail-toggle"
          ><input v-model="showArchivedFields" type="checkbox" />Архивные</label
        ><label class="detail-toggle"
          ><input v-model="showDeveloperKeys" type="checkbox" />Ключи</label
        ><RouterLink to="/profile-fields"
          >Настроить поля профиля <i class="pi pi-arrow-up-right" /></RouterLink
        ><RouterLink
          :to="{ name: 'event-logs', query: { user: detail.externalUserId } }"
          >История событий отдельно <i class="pi pi-arrow-up-right"
        /></RouterLink>
      </div>
      <div class="profile-fields">
        <article
          v-for="field in visibleDetailFields"
          :key="field.definitionId"
          class="profile-field card"
          :class="field.availability.toLowerCase()"
        >
          <div>
            <span>{{ field.label }}</span
            ><code>{{ valueTypeLabel(field.valueType) }}</code
            ><code v-if="showDeveloperKeys">{{ field.key }}</code>
          </div>
          <strong>{{ displayField(field) }}</strong>
          <div class="field-meta">
            <Tag
              :value="availabilityLabel(field.availability)"
              :severity="
                field.availability === 'AVAILABLE'
                  ? 'success'
                  : field.availability === 'STALE'
                    ? 'warn'
                    : 'secondary'
              "
            /><Tag
              :value="lifecycleLabel(field.lifecycle)"
              severity="secondary"
            /><Tag
              v-if="field.classification !== 'INTERNAL'"
              :value="classificationLabel(field.classification)"
              severity="warn"
            /><span v-if="field.untrustedData">Получено из продукта</span>
          </div>
          <p v-if="field.description">{{ field.description }}</p>
        </article>
      </div>
      <details class="technical">
        <summary>Источник данных для разработчика</summary>
        <CodeBlock
          title="Источник данных профиля"
          language="JSON"
          :code="JSON.stringify(detail.provenance, null, 2)"
        />
      </details>

      <section class="conversation-console">
        <div class="conversation-heading">
          <div>
            <span class="eyebrow">Рабочий контекст</span>
            <h3>Диалоги</h3>
          </div>
          <Tag
            :value="
              onlineSession ? 'Пользователь онлайн' : 'Пользователь офлайн'
            "
            :severity="onlineSession ? 'success' : 'secondary'"
          />
        </div>

        <div v-if="conversationsLoading" class="loading-list">
          <Skeleton v-for="item in 3" :key="item" height="54px" />
        </div>
        <Message
          v-else-if="conversationError"
          severity="warn"
          :closable="false"
        >
          {{ conversationError }}
        </Message>
        <div
          v-else-if="!conversations.length"
          class="conversation-empty surface-soft"
        >
          У пользователя пока нет доступных диалогов.
        </div>
        <template v-else>
          <p
            v-if="selectedActiveConversationCount"
            class="conversation-suspension-summary"
          >
            <i class="pi pi-pause-circle" aria-hidden="true" />
            AI приостановлен в
            {{
              russianCount(
              selectedActiveConversationCount,
                ["диалоге", "диалогах", "диалогах"],
              )
            }}
          </p>
          <div class="conversation-tabs" aria-label="Диалоги пользователя">
            <button
              v-for="conversation in conversations"
              :key="conversation.id"
              type="button"
              :class="{ active: selectedConversation?.id === conversation.id }"
              @click="loadMessages(conversation)"
            >
              <strong>{{ conversation.title }}</strong>
              <span
                >{{
                  russianCount(conversation.messageCount, [
                    "сообщение",
                    "сообщения",
                    "сообщений",
                  ])
                }}
                · {{ relativeTime(conversation.lastMessageAt) }}</span
              >
              <span
                v-if="conversationIsSuspended(conversation.id)"
                class="conversation-tab-suspension"
              >
                <i class="pi pi-pause-circle" aria-hidden="true" /> AI
                приостановлен до {{ suspensionTime(conversation.id) }}
              </span>
            </button>
          </div>
          <Button
            v-if="nextConversationCursor"
            label="Показать ещё диалоги"
            icon="pi pi-chevron-down"
            severity="secondary"
            text
            size="small"
            :loading="conversationsLoadingMore"
            @click="loadMoreConversations"
          />

          <ConversationAISuspensionBanner
            v-if="conversationAISuspensionEnabled && selectedConversation && selectedSuspensionEntry"
            :entry="selectedSuspensionEntry"
            :can-manage="canManageSuspension"
            :conversation-open="selectedConversation.status === 'ACTIVE'"
            @start="openSuspensionDialog('START')"
            @extend="openSuspensionDialog('EXTEND')"
            @resume="openSuspensionDialog('RESUME')"
            @history="suspensionHistoryVisible = true"
            @retry="
              selected &&
              selectedConversation &&
              suspensionStore.loadDetail(
                selected.endUserId,
                selectedConversation.id,
              )
            "
          />

          <div class="message-history" aria-label="История сообщений">
            <div v-if="messagesLoading" class="loading-list">
              <Skeleton v-for="item in 4" :key="item" height="58px" />
            </div>
            <div
              v-for="message in messages"
              v-else
              :key="message.id"
              class="conversation-message"
              :class="[
                message.author.toLowerCase(),
                { cancelled: message.status === 'CANCELLED' },
              ]"
            >
              <div>
                <strong>{{ messageAuthorLabel(message.author) }}</strong>
                <time :datetime="message.createdAt">{{
                  formatDate(message.createdAt)
                }}</time>
              </div>
              <p>{{ message.text }}</p>
              <small v-if="message.status === 'CANCELLED'" class="cancelled-label"
                ><i class="pi pi-stop-circle" aria-hidden="true" /> Ответ AI
                остановлен оператором</small
              >
            </div>
          </div>

          <Message v-if="!onlineSession" severity="info" :closable="false">
            Пользователь сейчас не в сети, поэтому отправить ответ пока нельзя.
            Вернитесь к диалогу позже или обработайте запрос другим способом.
          </Message>
          <form class="reply-form" @submit.prevent="sendReply">
            <Textarea
              v-model="replyText"
              rows="3"
              maxlength="4000"
              :disabled="!onlineSession"
              placeholder="Ответить пользователю"
              aria-label="Ответ пользователю"
            />
            <Button
              type="submit"
              label="Отправить"
              icon="pi pi-send"
              :disabled="!onlineSession || !replyText.trim()"
              :loading="sendingReply"
            />
            <Button
              v-if="
                conversationAISuspensionEnabled &&
                canManageSuspension &&
                onlineSession &&
                replyText.trim() &&
                selectedConversation &&
                !conversationIsSuspended(selectedConversation.id)
              "
              type="button"
              label="Приостановить AI и отправить"
              icon="pi pi-pause-circle"
              severity="danger"
              outlined
              :loading="sendingReply"
              @click="openCombinedSend"
            />
          </form>
        </template>
      </section>
    </div>
  </Drawer>

  <ConversationAISuspensionDialog
    v-if="conversationAISuspensionEnabled && selectedConversation && selectedSuspensionEntry"
    v-model:visible="suspensionDialogVisible"
    :mode="suspensionDialogMode"
    :conversation-label="`${selectedConversation.title} · ${selectedConversation.id.slice(-8)}${combinedSend ? ' · сообщение будет отправлено одной операцией' : ''}`"
    :current="selectedSuspensionEntry.detail ?? null"
    :server-offset-ms="selectedSuspensionEntry.serverOffsetMs"
    :busy="Boolean(selectedSuspensionEntry.mutating) || (combinedSend && sendingReply)"
    :error="combinedSend ? combinedSuspensionError : selectedSuspensionEntry.error"
    @submit="submitSuspension"
  />
  <ConversationAISuspensionHistory
    v-if="conversationAISuspensionEnabled && auth.project && selected && selectedConversation"
    v-model:visible="suspensionHistoryVisible"
    :project-id="auth.project.id"
    :end-user-id="selected.endUserId"
    :conversation-id="selectedConversation.id"
  />
</template>

<style scoped>
.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.profiles-page {
  max-width: 1400px;
}
.profile-fields-callout {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin: -8px 0 18px;
  padding: 15px 17px;
  border-color: color-mix(
    in srgb,
    var(--status-violet) 25%,
    var(--border-default)
  );
  background: linear-gradient(
    120deg,
    var(--surface-card),
    var(--status-violet-soft)
  );
}
.callout-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--surface-emphasis);
  color: var(--accent);
}
.profile-fields-callout strong,
.profile-fields-callout small {
  display: block;
}
.profile-fields-callout strong {
  font-size: 0.82rem;
}
.profile-fields-callout small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.7rem;
}
.callout-action {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--status-violet-text);
  font-size: 0.72rem;
  font-weight: 800;
}
.detail-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
}
.conversation-console {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid var(--border-default);
}
.conversation-heading,
.conversation-message > div,
.reply-form {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.conversation-heading {
  margin-bottom: 12px;
}
.conversation-heading .eyebrow {
  margin-bottom: 3px;
}
.conversation-heading h3 {
  margin: 0;
}
.conversation-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.conversation-tabs button {
  min-width: 180px;
  padding: 11px 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.conversation-tabs button.active {
  border-color: var(--action-primary);
  background: var(--status-violet-soft);
}
.conversation-tabs strong,
.conversation-tabs span {
  display: block;
}
.conversation-tabs .conversation-tab-suspension {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--status-danger-text);
  font-weight: 800;
}
.conversation-suspension-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  color: var(--status-danger-text);
  font-size: .72rem;
  font-weight: 800;
}
.conversation-tabs strong {
  font-size: 0.74rem;
}
.conversation-tabs span {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.64rem;
}
.message-history {
  max-height: 360px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.conversation-message {
  max-width: 86%;
  align-self: flex-start;
  padding: 10px 12px;
  border-radius: 4px 13px 13px;
  background: var(--surface-card);
}
.conversation-message.admin {
  align-self: flex-end;
  border-radius: 13px 4px 13px 13px;
  background: var(--status-violet-soft);
}
.conversation-message.cancelled {
  border: 1px dashed var(--status-warning);
  background: var(--status-warning-soft);
}
.cancelled-label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  color: var(--status-warning-text);
  font-size: .64rem;
  font-weight: 800;
}
.conversation-message > div {
  align-items: baseline;
}
.conversation-message strong {
  font-size: 0.65rem;
}
.conversation-message time {
  color: var(--text-tertiary);
  font-size: 0.58rem;
}
.conversation-message p {
  margin: 5px 0 0;
  font-size: 0.75rem;
  white-space: pre-wrap;
}
.conversation-empty {
  padding: 20px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 0.75rem;
}
.reply-form {
  align-items: flex-end;
  margin-top: 10px;
}
.reply-form :deep(.p-textarea) {
  flex: 1;
}
.filters {
  display: grid;
  grid-template-columns:
    minmax(0, 1.35fr)
    minmax(0, 1.1fr)
    minmax(0, 0.75fr)
    minmax(0, 0.85fr)
    minmax(0, 1.25fr)
    minmax(0, 0.8fr);
  gap: 12px;
  padding: 14px;
  margin-bottom: 18px;
  align-items: end;
}
.filters label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.filters :deep(.p-select),
.filters :deep(.p-inputtext) {
  min-width: 0;
}
.filters label > span {
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
}
.search > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  position: relative;
}
.search i {
  position: absolute;
  left: 12px;
  top: 50%;
  z-index: 1;
  transform: translateY(-50%);
  color: var(--muted);
}
.search :deep(input) {
  min-width: 0;
  padding-left: 34px;
}
.table-card {
  overflow: hidden;
}
.loading-list {
  display: grid;
  gap: 9px;
  padding: 16px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-weight: 800;
}
.user-cell strong,
.user-cell small {
  display: block;
}
.user-cell small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.63rem;
}
.preview-fields {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.preview-fields span {
  font-size: 0.67rem;
}
.preview-fields b {
  display: inline-block;
  min-width: 110px;
  margin-right: 6px;
  color: var(--muted);
}
.preview-fields small {
  color: var(--muted);
}
.table-card :deep(tbody tr) {
  cursor: pointer;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px;
  color: var(--muted);
}
.error-row,
.detail-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.detail-nav {
  flex-wrap: wrap;
}
.profile-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
:deep(.user-profile-drawer .p-drawer-content) {
  overflow-x: hidden;
}
.profile-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  padding: 1px;
  overflow: hidden;
}
.profile-meta > div {
  padding: 13px;
  background: var(--surface-card);
}
.profile-meta span,
.profile-meta strong {
  display: block;
}
.profile-meta span {
  color: var(--muted);
  font-size: 0.59rem;
  text-transform: uppercase;
}
.profile-meta strong {
  margin-top: 5px;
  font-size: 0.73rem;
}
.detail-nav a {
  color: var(--status-violet-text);
  font-size: 0.68rem;
}
.profile-fields {
  display: grid;
  gap: 8px;
}
.profile-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 13px;
}
.profile-field > div:first-child span,
.profile-field > div:first-child code {
  display: block;
}
.profile-field > div:first-child span {
  font-size: 0.75rem;
  font-weight: 700;
}
.profile-field code {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.59rem;
}
.profile-field > strong {
  align-self: center;
  text-align: right;
  overflow-wrap: anywhere;
}
.field-meta {
  display: flex;
  align-items: center;
  gap: 5px;
}
.profile-field p {
  grid-column: 1/3;
  margin: 0;
  color: var(--muted);
  font-size: 0.66rem;
}
.profile-field.missing,
.profile-field.denied,
.profile-field.invalid {
  opacity: 0.75;
}
.technical {
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.technical summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.7rem;
}
.technical pre {
  overflow: auto;
  font-size: 0.65rem;
}
@media (max-width: 1350px) {
  .filters {
    grid-template-columns: repeat(2, 1fr);
  }
  .search {
    grid-column: 1/-1;
  }
}
@media (max-width: 620px) {
  .profile-fields-callout {
    grid-template-columns: 38px minmax(0, 1fr);
  }
  .callout-action {
    grid-column: 2;
  }
  .filters {
    grid-template-columns: 1fr;
  }
  .search {
    grid-column: auto;
  }
  .mobile-hide {
    display: none;
  }
  .profile-meta {
    grid-template-columns: 1fr;
  }
  .preview-fields {
    display: none;
  }
}
</style>
