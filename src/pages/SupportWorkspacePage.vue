<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Avatar from "primevue/avatar";
import Drawer from "primevue/drawer";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import ConversationAISuspensionBanner from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionBanner.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHeaderActions from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHeaderActions.vue";
import ConversationAISuspensionHistory from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHistory.vue";
import { createSupportConversationController } from "@/features/support-conversation/model/use-support-conversation";
import { createSupportInboxController } from "@/features/support-inbox/model/use-support-inbox";
import { supportAssignmentReleaseSource } from "@/features/support-case-assignment/api/support-assignment-release-source";
import { createSupportAssignmentReleaseController } from "@/features/support-case-assignment/model/use-support-assignment-release";
import { supportAvailabilitySource } from "@/features/support-availability/api/support-availability-source";
import { createSupportAvailabilityController } from "@/features/support-availability/model/use-support-availability";
import SupportAvailabilityStatus from "@/features/support-availability/ui/SupportAvailabilityStatus.vue";
import { supportRoutingOfferSource } from "@/features/support-routing-offers/api/support-routing-offer-source";
import { createSupportRoutingOffersController } from "@/features/support-routing-offers/model/use-support-routing-offers";
import SupportRoutingOffers from "@/features/support-routing-offers/ui/SupportRoutingOffers.vue";
import { supportWorkspaceSource } from "@/features/support-workspace/api/support-workspace-source";
import {
  canManageOwnSupportAvailability,
  canManageSupportConversationAiSuspension,
  canReceiveSupportRoutingOffers,
  canReadSupportConversationAiSuspension,
  canReleaseSupportCaseAssignment,
} from "@/features/support-workspace/model/support-workspace-access";
import { supportUserProfileSource } from "@/features/support-workspace/api/support-user-profile-source";
import SupportConversationContext from "@/features/support-workspace/ui/SupportConversationContext.vue";
import { createSupportUserProfileController } from "@/features/support-user-profile/model/use-support-user-profile";
import { relativeTime } from "@/shared/lib/format";
import type { ConversationMessage } from "@/shared/types/domain";
import type {
  ExtendConversationAISuspensionDto,
  ResumeConversationAIDto,
  StartConversationAISuspensionDto,
} from "@/shared/api/generated/models";
import { conversationAISuspensionEnabled } from "@/shared/config/features";

const auth = useAuthStore();
const aiSuspension = useConversationAISuspensionStore();
const route = useRoute();
const router = useRouter();
const inbox = createSupportInboxController(
  { projectId: () => auth.project?.id },
  supportWorkspaceSource,
);

const routeConversationId = computed(() => {
  const routeId = route.params.conversationId;
  return typeof routeId === "string" ? routeId : undefined;
});
const requestedConversationId = computed(
  () => routeConversationId.value ?? inbox.items.value[0]?.id,
);
const conversation = createSupportConversationController(
  {
    projectId: () => auth.project?.id,
    conversationId: () => requestedConversationId.value,
  },
  supportWorkspaceSource,
);
const selectedConversation = computed(() => {
  if (routeConversationId.value)
    return conversation.selection.value?.conversation ?? null;
  return (
    conversation.selection.value?.conversation ?? inbox.items.value[0] ?? null
  );
});
const selectedAssignmentAuthorityKey = computed(() => {
  const supportCase = conversation.selection.value?.case;
  const assignment = supportCase?.assignment;
  return [
    supportCase?.id ?? "",
    assignment?.id ?? "",
    assignment?.version ?? "",
    assignment?.actionEtag ?? "",
  ].join("\u0000");
});
const aiSuspensionAccessDenied = ref(false);
const canReadSelectedAiSuspension = computed(
  () =>
    !aiSuspensionAccessDenied.value &&
    conversationAISuspensionEnabled &&
    aiSuspension.projectId === auth.project?.id &&
    Boolean(conversation.selection.value?.conversation) &&
    canReadSupportConversationAiSuspension(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canManageSelectedAiSuspension = computed(
  () =>
    canReadSelectedAiSuspension.value &&
    canManageSupportConversationAiSuspension(
      auth.project?.effectivePermissionCodes ?? [],
      Boolean(conversation.selection.value?.capabilities.suspendAi),
    ),
);
const selectedAiSuspensionEntry = computed(() => {
  const conversationId = conversation.selection.value?.conversation?.id;
  return conversationId ? aiSuspension.getEntry(conversationId) : undefined;
});
const selectedAiSuspensionError = computed(() => {
  const conversationId = conversation.selection.value?.conversation?.id;
  return conversationId ? aiSuspension.getError(conversationId) : null;
});
const selectedAiSuspensionKey = computed(() => {
  const selection = conversation.selection.value;
  return [
    auth.project?.id ?? "",
    selection?.endUser.id ?? "",
    selection?.conversation?.id ?? "",
    selection?.capabilities.suspendAi ? "allowed" : "denied",
  ].join("\u0000");
});
const aiSuspensionDialogVisible = ref(false);
const aiSuspensionHistoryVisible = ref(false);
const aiSuspensionDialogMode = ref<"START" | "EXTEND" | "RESUME">("START");
const contextDrawerVisible = ref(false);
const canOpenSelectedCase = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.cases.read",
  ),
);
const assignmentReleaseAccessDenied = ref(false);
const canReleaseSelectedAssignment = computed(() =>
  !assignmentReleaseAccessDenied.value &&
  canReleaseSupportCaseAssignment(
    auth.project?.effectivePermissionCodes ?? [],
    auth.user?.id,
    conversation.selection.value?.case?.assignment?.operatorId,
  ),
);
const availabilityAccessDenied = ref(false);
const canReadAvailability = computed(
  () =>
    !availabilityAccessDenied.value &&
    canManageOwnSupportAvailability(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canManageOwnAvailability = computed(
  () => canReadAvailability.value,
);
const availability = createSupportAvailabilityController(
  {
    projectId: () => auth.project?.id,
    operatorId: () => auth.user?.id,
    canRead: () => canReadAvailability.value,
    canManage: () => canManageOwnAvailability.value,
    async onForbidden() {
      availabilityAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The self-availability snapshot has already been purged.
      }
    },
  },
  supportAvailabilitySource,
);
const routingOffersAccessDenied = ref(false);
const canManageRoutingOffers = computed(
  () =>
    !routingOffersAccessDenied.value &&
    canReceiveSupportRoutingOffers(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const routingOffers = createSupportRoutingOffersController(
  {
    projectId: () => auth.project?.id,
    canManage: () => canManageRoutingOffers.value,
    async onForbidden() {
      routingOffersAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The private offer capabilities have already been purged.
      }
    },
    async onChanged() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  supportRoutingOfferSource,
);
const assignmentRelease = createSupportAssignmentReleaseController(
  {
    projectId: () => auth.project?.id,
    selection: () => conversation.selection.value,
    canRelease: () => canReleaseSelectedAssignment.value,
    async onForbidden() {
      assignmentReleaseAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The action surface is already hidden until a new authoritative selection.
      }
    },
    async onChanged() {
      await Promise.all([inbox.load(), conversation.reconcile()]);
    },
  },
  supportAssignmentReleaseSource,
);
const profileAccessDenied = ref(false);
const canReadProfile = computed(() =>
  !profileAccessDenied.value &&
  hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.profiles.read",
    ),
);
const profile = createSupportUserProfileController(
  {
    projectId: () => auth.project?.id,
    endUserId: () => conversation.selection.value?.endUser.id,
    canRead: () => canReadProfile.value,
    async onForbidden() {
      profileAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The sensitive projection is already purged; the next route guard owns recovery.
      }
    },
  },
  supportUserProfileSource,
);

function messageAuthorName(message: ConversationMessage): string {
  return (
    message.authorSnapshot?.displayName ??
    {
      USER: "Пользователь",
      ASSISTANT: auth.project?.assistantName ?? "Lola",
      ADMIN: "Оператор",
      SCENARIO: "Сценарий",
      SYSTEM: "Система",
    }[message.author]
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function openConversation(conversationId: string): Promise<void> {
  if (conversationId === routeConversationId.value) return;
  await router.push({
    name: "support-inbox-conversation",
    params: { conversationId },
  });
}

async function backToInbox(): Promise<void> {
  contextDrawerVisible.value = false;
  await router.push({ name: "support-inbox" });
}

function keyboardNavigationIsBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='dialog'], [role='textbox'], [role='menuitem'], [role='option']",
    ) || document.querySelector("[role='dialog'][aria-modal='true']"),
  );
}

function moveInboxSelection(direction: -1 | 1): void {
  const items = inbox.items.value;
  if (!items.length) return;
  const currentId = selectedConversation.value?.id;
  const currentIndex = currentId
    ? items.findIndex((item) => item.id === currentId)
    : -1;
  const nextIndex = Math.max(
    0,
    Math.min(
      items.length - 1,
      currentIndex < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : currentIndex + direction,
    ),
  );
  const next = items[nextIndex];
  if (next) void openConversation(next.id);
}

function handleWorkspaceKeydown(event: KeyboardEvent): void {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    keyboardNavigationIsBlocked(event.target)
  )
    return;
  const direction =
    event.key === "ArrowDown" || event.key.toLowerCase() === "j"
      ? 1
      : event.key === "ArrowUp" || event.key.toLowerCase() === "k"
        ? -1
        : null;
  if (!direction) return;
  event.preventDefault();
  moveInboxSelection(direction);
}

async function reload(): Promise<void> {
  assignmentReleaseAccessDenied.value = false;
  aiSuspensionAccessDenied.value = false;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  await Promise.all([
    inbox.load(),
    conversation.load(),
    canReadAvailability.value ? availability.load() : Promise.resolve(),
    canManageRoutingOffers.value ? routingOffers.load() : Promise.resolve(),
  ]);
  reloadSelectedAiSuspension();
}

function reloadSelectedAiSuspension(): void {
  const selection = conversation.selection.value;
  if (!canReadSelectedAiSuspension.value || !selection?.conversation) return;
  aiSuspension.restoreConversation(selection.conversation.id);
  void aiSuspension.loadDetail(selection.endUser.id, selection.conversation.id);
}

function revokeSelectedAiSuspensionAccess(scope?: {
  projectId: string;
  endUserId: string;
  conversationId: string;
}): void {
  const selection = conversation.selection.value;
  const conversationId = selection?.conversation?.id;
  if (
    scope &&
    (scope.projectId !== auth.project?.id ||
      scope.endUserId !== selection?.endUser.id ||
      scope.conversationId !== conversationId)
  )
    return;
  if (conversationId) aiSuspension.revokeConversation(conversationId);
  aiSuspensionAccessDenied.value = true;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  void auth.refreshContext().catch(() => undefined);
  void Promise.all([inbox.load(), conversation.reconcile()]);
}

function openAiSuspensionDialog(mode: "START" | "EXTEND" | "RESUME"): void {
  if (!canManageSelectedAiSuspension.value || !selectedAiSuspensionEntry.value)
    return;
  aiSuspensionDialogMode.value = mode;
  aiSuspensionDialogVisible.value = true;
}

async function submitAiSuspension(value: {
  key: string;
  command:
    | StartConversationAISuspensionDto
    | ExtendConversationAISuspensionDto
    | ResumeConversationAIDto;
}): Promise<void> {
  const selection = conversation.selection.value;
  if (
    !selection?.conversation ||
    !canManageSelectedAiSuspension.value ||
    !selectedAiSuspensionEntry.value
  )
    return;
  const { endUser, conversation: selected } = selection;
  const succeeded =
    aiSuspensionDialogMode.value === "START"
      ? await aiSuspension.start(
          endUser.id,
          selected.id,
          value.command as StartConversationAISuspensionDto,
          value.key,
        )
      : aiSuspensionDialogMode.value === "EXTEND"
        ? await aiSuspension.extend(
            endUser.id,
            selected.id,
            value.command as ExtendConversationAISuspensionDto,
            value.key,
          )
        : await aiSuspension.resume(
            endUser.id,
            selected.id,
            value.command as ResumeConversationAIDto,
            value.key,
          );
  if (!succeeded) return;
  aiSuspensionDialogVisible.value = false;
  await Promise.all([
    aiSuspension.loadDetail(endUser.id, selected.id),
    inbox.load(),
    conversation.reconcile(),
  ]);
}

onMounted(async () => {
  window.addEventListener("keydown", handleWorkspaceKeydown);
  await inbox.load();
  if (canReadAvailability.value) await availability.load();
  if (canManageRoutingOffers.value) await routingOffers.load();
});

watch(
  () => auth.project?.id,
  () => {
    contextDrawerVisible.value = false;
    profileAccessDenied.value = false;
    availabilityAccessDenied.value = false;
    routingOffersAccessDenied.value = false;
    assignmentReleaseAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    assignmentRelease.reset();
    availability.reset();
    routingOffers.reset();
    profile.reset();
    conversation.reset();
    inbox.reset();
    void inbox.load();
  },
);

watch(canReadAvailability, (allowed) => {
  if (!allowed) availability.reset();
});

watch(canManageRoutingOffers, (allowed) => {
  if (!allowed) routingOffers.reset();
});

watch(canReleaseSelectedAssignment, (allowed) => {
  if (!allowed) assignmentRelease.reset();
});

watch(canReadSelectedAiSuspension, (allowed) => {
  if (allowed) {
    reloadSelectedAiSuspension();
    return;
  }
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
});

watch(selectedAiSuspensionKey, (selectionKey, previousSelectionKey) => {
  if (selectionKey === previousSelectionKey) return;
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  aiSuspensionAccessDenied.value = false;
  reloadSelectedAiSuspension();
});

watch(
  () => selectedAiSuspensionError.value?.kind,
  (kind) => {
    if (kind !== "FORBIDDEN" && kind !== "NOT_FOUND") return;
    revokeSelectedAiSuspensionAccess();
  },
);

watch(
  () => conversation.selection.value?.capabilities.releaseAssignment,
  (allowed) => {
    if (!allowed) assignmentRelease.reset();
  },
);

watch(
  selectedAssignmentAuthorityKey,
  (authorityKey, previousAuthorityKey) => {
    if (authorityKey !== previousAuthorityKey) assignmentRelease.reset();
  },
);

watch(
  () => requestedConversationId.value,
  () => {
    contextDrawerVisible.value = false;
    profileAccessDenied.value = false;
    assignmentReleaseAccessDenied.value = false;
    aiSuspensionAccessDenied.value = false;
    aiSuspensionDialogVisible.value = false;
    aiSuspensionHistoryVisible.value = false;
    assignmentRelease.reset();
    profile.reset();
    void conversation.load();
  },
  { immediate: true },
);

watch(
  () => conversation.selection.value?.conversation,
  (selected) => {
    if (selected) inbox.upsert(selected);
  },
);

watch(canReadProfile, (allowed) => {
  if (!allowed) profile.reset();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWorkspaceKeydown);
  profile.reset();
  availability.reset();
  routingOffers.reset();
  assignmentRelease.reset();
  aiSuspensionDialogVisible.value = false;
  aiSuspensionHistoryVisible.value = false;
  inbox.reset();
  conversation.reset();
});
</script>

<template>
  <section class="page support-workspace-page">
    <header class="page-header support-workspace-header">
      <div>
        <div class="eyebrow"><i class="pi pi-headphones" /> Поддержка</div>
        <h1>Рабочее место оператора</h1>
        <p class="subtitle">
          Диалоги проекта и безопасный контекст выбранного пользователя.
        </p>
      </div>
      <div class="header-actions">
        <Tag value="Снимок сервера" severity="info" />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="
            inbox.loading.value ||
            conversation.loading.value ||
            availability.loading.value ||
            availability.changing.value ||
            routingOffers.loading.value ||
            Boolean(routingOffers.changingOfferId.value)
          "
          @click="reload"
        />
      </div>
    </header>

    <Message severity="info" :closable="false" class="workspace-notice">
      Данные и разрешения приходят одним серверным срезом. Статус оператора,
      персональные предложения назначений и AI Suspension используют
      опубликованные server-side capabilities; отправка, live collaboration,
      SLA и delivery остаются выключенными до публикации своих контрактов.
    </Message>

    <SupportAvailabilityStatus
      v-if="canReadAvailability"
      :availability="availability.availability.value"
      :loading="availability.loading.value"
      :changing="availability.changing.value"
      :error="availability.error.value"
      :can-manage="canManageOwnAvailability"
      :unknown-outcome="availability.unknownOutcome.value"
      :needs-reconcile="availability.needsReconcile.value"
      :can-retry-after-reconcile="availability.canRetryAfterReconcile.value"
      :draft="availability.draft.value"
      @refresh="availability.load"
      @change="availability.change"
      @retry="availability.retryUnknownOutcome"
      @retry-after-reconcile="availability.retryAfterReconcile"
    />

    <SupportRoutingOffers
      v-if="canManageRoutingOffers"
      :offers="routingOffers.offers.value"
      :loading="routingOffers.loading.value"
      :changing-offer-id="routingOffers.changingOfferId.value"
      :error="routingOffers.error.value"
      :unknown-outcome="routingOffers.unknownOutcome.value"
      :last-outcome="routingOffers.lastOutcome.value"
      :can-retry="routingOffers.canRetry.value"
      @refresh="routingOffers.load"
      @action="routingOffers.act"
      @retry="routingOffers.retryUnknownOutcome"
    />

    <div
      class="support-workspace card"
      :class="{ 'has-route-selection': Boolean(routeConversationId) }"
    >
      <aside class="inbox-pane" aria-label="Диалоги проекта">
        <div class="pane-heading">
          <div>
            <span class="eyebrow">Все диалоги</span>
            <h2>Входящие</h2>
          </div>
          <span class="inbox-count">{{ inbox.items.value.length }}</span>
        </div>

        <div
          v-if="inbox.loading.value && !inbox.items.value.length"
          class="inbox-skeletons"
        >
          <Skeleton v-for="index in 5" :key="index" height="76px" />
        </div>
        <Message
          v-else-if="inbox.error.value"
          severity="error"
          :closable="false"
        >
          {{ inbox.error.value }}
        </Message>
        <p v-else-if="!inbox.items.value.length" class="empty-pane">
          В этом проекте пока нет доступных диалогов.
        </p>
        <div v-else class="conversation-list">
          <button
            v-for="conversation in inbox.items.value"
            :key="conversation.id"
            type="button"
            class="conversation-row"
            :class="{ selected: conversation.id === selectedConversation?.id }"
            :aria-current="
              conversation.id === selectedConversation?.id ? 'true' : undefined
            "
            @click="openConversation(conversation.id)"
          >
            <div class="conversation-row__top">
              <strong>{{ conversation.title }}</strong>
              <time :datetime="conversation.updatedAt">{{
                relativeTime(conversation.updatedAt)
              }}</time>
            </div>
            <span class="conversation-row__user">
              Пользователь раскрывается после выбора диалога
            </span>
            <p>
              {{
                conversation.lastMessageAt
                  ? `Последняя активность: ${relativeTime(conversation.lastMessageAt)}`
                  : "Сообщений пока нет"
              }}
            </p>
            <span class="conversation-row__meta">
              {{ conversation.messageCount }} сообщений
              <span v-if="conversation.isCurrent">· текущий</span>
            </span>
          </button>
          <Button
            v-if="inbox.nextCursor.value"
            label="Показать ещё"
            severity="secondary"
            text
            :loading="inbox.loading.value"
            @click="inbox.loadMore"
          />
        </div>
      </aside>

      <main class="conversation-pane" aria-label="Выбранный диалог">
        <template v-if="selectedConversation">
          <header class="conversation-header">
            <div>
              <Button
                class="mobile-back"
                label="Назад к списку диалогов"
                icon="pi pi-arrow-left"
                severity="secondary"
                text
                @click="backToInbox"
              />
              <span class="eyebrow">{{
                selectedConversation.status === "OPEN"
                  ? "Активный диалог"
                  : "Архивный диалог"
              }}</span>
              <h2>{{ selectedConversation.title }}</h2>
              <p>Безопасный контекст доступен в панели диалога.</p>
            </div>
            <div class="conversation-header__actions">
              <template
                v-if="canReadSelectedAiSuspension && selectedAiSuspensionEntry"
              >
                <ConversationAISuspensionHeaderActions
                  :entry="selectedAiSuspensionEntry"
                  :can-manage="canManageSelectedAiSuspension"
                  :conversation-open="selectedConversation.status === 'OPEN'"
                  :show-history="canReadSelectedAiSuspension"
                  @start="openAiSuspensionDialog('START')"
                  @history="aiSuspensionHistoryVisible = true"
                  @retry="reloadSelectedAiSuspension"
                />
              </template>
              <Button
                class="mobile-context"
                label="Контекст"
                icon="pi pi-user"
                severity="secondary"
                text
                @click="contextDrawerVisible = true"
              />
              <Tag
                :value="
                  selectedConversation.status === 'OPEN' ? 'Активен' : 'Архив'
                "
                :severity="
                  selectedConversation.status === 'OPEN'
                    ? 'success'
                    : 'secondary'
                "
              />
            </div>
          </header>

          <ConversationAISuspensionBanner
            v-if="canReadSelectedAiSuspension && selectedAiSuspensionEntry"
            :entry="selectedAiSuspensionEntry"
            :can-manage="canManageSelectedAiSuspension"
            :conversation-open="selectedConversation.status === 'OPEN'"
            :show-history="canReadSelectedAiSuspension"
            @extend="openAiSuspensionDialog('EXTEND')"
            @resume="openAiSuspensionDialog('RESUME')"
            @history="aiSuspensionHistoryVisible = true"
          />

          <div
            v-if="conversation.loading.value"
            class="message-skeletons"
            aria-busy="true"
          >
            <Skeleton
              v-for="index in 5"
              :key="index"
              height="64px"
              border-radius="14px"
            />
          </div>
          <Message
            v-else-if="conversation.error.value"
            severity="error"
            :closable="false"
          >
            {{ conversation.error.value }}
          </Message>
          <div
            v-else
            class="message-log"
            role="log"
            aria-live="polite"
            aria-label="История сообщений"
          >
            <Button
              v-if="conversation.nextMessageCursor.value"
              label="Загрузить более ранние сообщения"
              severity="secondary"
              outlined
              class="load-older"
              :loading="conversation.loadingOlder.value"
              @click="conversation.loadOlder"
            />
            <article
              v-for="message in conversation.messages.value"
              :key="message.id"
              class="message"
              :class="{
                'from-user': message.author === 'USER',
                'from-operator': message.author === 'ADMIN',
                'from-system':
                  message.author !== 'USER' && message.author !== 'ADMIN',
              }"
            >
              <div class="message-meta">
                <span class="message-author">
                  <Avatar
                    :image="message.authorSnapshot?.avatarUrl ?? undefined"
                    :label="initials(messageAuthorName(message))"
                    shape="circle"
                    class="message-avatar"
                    :aria-label="`Автор: ${messageAuthorName(message)}`"
                  />
                  <strong>{{ messageAuthorName(message) }}</strong>
                </span>
                <time :datetime="message.createdAt">{{
                  relativeTime(message.createdAt)
                }}</time>
              </div>
              <p>{{ message.text }}</p>
            </article>
            <p v-if="!conversation.messages.value.length" class="empty-pane">
              В этом диалоге пока нет сообщений.
            </p>
          </div>
        </template>
        <div
          v-else-if="inbox.loading.value || conversation.loading.value"
          class="empty-selection"
          aria-busy="true"
        >
          <Skeleton width="180px" height="24px" />
          <Skeleton width="240px" height="16px" />
        </div>
        <div v-else class="empty-selection">
          <i class="pi pi-comments" aria-hidden="true" />
          <template v-if="route.params.conversationId">
            <h2>Диалог недоступен</h2>
            <p>
              Диалог не найден или у вас больше нет прав на его просмотр.
            </p>
          </template>
          <template v-else>
            <h2>Выберите диалог</h2>
            <p>История и безопасный контекст появятся здесь.</p>
          </template>
        </div>
      </main>

      <aside
        v-if="selectedConversation && conversation.selection.value"
        class="context-pane"
        aria-label="Контекст диалога"
      >
        <SupportConversationContext
          :conversation="selectedConversation"
          :selection="conversation.selection.value"
          :can-open-case="canOpenSelectedCase"
          :can-release-assignment="canReleaseSelectedAssignment"
          :can-read-profile="canReadProfile"
          :profile="profile.profile.value"
          :profile-loading="profile.loading.value"
          :profile-error="profile.error.value"
          :assignment-release="{
            releasing: assignmentRelease.releasing.value,
            error: assignmentRelease.error.value,
            unknownOutcome: assignmentRelease.unknownOutcome.value,
            completed: assignmentRelease.completed.value,
            canRetry: assignmentRelease.canRetry.value,
          }"
          @load-profile="profile.load"
          @release-assignment="assignmentRelease.release"
          @retry-assignment-release="assignmentRelease.retryUnknownOutcome"
        />
      </aside>
    </div>
    <Drawer
      v-if="selectedConversation && conversation.selection.value"
      :visible="contextDrawerVisible"
      position="right"
      aria-label="Контекст диалога"
      :style="{ width: 'min(420px, 100vw)' }"
      @update:visible="contextDrawerVisible = $event"
    >
      <SupportConversationContext
        :conversation="selectedConversation"
        :selection="conversation.selection.value"
        :can-open-case="canOpenSelectedCase"
        :can-release-assignment="canReleaseSelectedAssignment"
        :can-read-profile="canReadProfile"
        :profile="profile.profile.value"
        :profile-loading="profile.loading.value"
        :profile-error="profile.error.value"
        :assignment-release="{
          releasing: assignmentRelease.releasing.value,
          error: assignmentRelease.error.value,
          unknownOutcome: assignmentRelease.unknownOutcome.value,
          completed: assignmentRelease.completed.value,
          canRetry: assignmentRelease.canRetry.value,
        }"
        @load-profile="profile.load"
        @release-assignment="assignmentRelease.release"
        @retry-assignment-release="assignmentRelease.retryUnknownOutcome"
      />
    </Drawer>
    <ConversationAISuspensionDialog
      v-if="
        canManageSelectedAiSuspension &&
        selectedConversation &&
        selectedAiSuspensionEntry
      "
      v-model:visible="aiSuspensionDialogVisible"
      :mode="aiSuspensionDialogMode"
      :conversation-label="selectedConversation.title"
      :current="selectedAiSuspensionEntry.detail ?? null"
      :server-offset-ms="selectedAiSuspensionEntry.serverOffsetMs"
      :busy="Boolean(selectedAiSuspensionEntry.mutating)"
      :error="selectedAiSuspensionEntry.error"
      @submit="submitAiSuspension"
    />
    <ConversationAISuspensionHistory
      v-if="
        canReadSelectedAiSuspension &&
        selectedConversation &&
        conversation.selection.value
      "
      v-model:visible="aiSuspensionHistoryVisible"
      :project-id="auth.project?.id ?? ''"
      :end-user-id="conversation.selection.value.endUser.id"
      :conversation-id="selectedConversation.id"
      @access-revoked="revokeSelectedAiSuspensionAccess"
    />
  </section>
</template>

<style scoped>
.support-workspace-header,
.header-actions,
.pane-heading,
.conversation-row__top,
.conversation-header,
.conversation-header__actions,
.message-meta {
  display: flex;
  align-items: center;
}
.support-workspace-header,
.conversation-header,
.pane-heading,
.conversation-row__top,
.message-meta {
  justify-content: space-between;
}
.header-actions {
  gap: 10px;
  flex-wrap: wrap;
}
.conversation-header__actions {
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.workspace-notice {
  margin-bottom: 16px;
}
.support-workspace {
  min-height: min(720px, calc(100dvh - 160px));
  padding: 0;
  display: grid;
  grid-template-columns: minmax(250px, 320px) minmax(0, 1fr) minmax(
      260px,
      320px
    );
  overflow: hidden;
}
.inbox-pane,
.context-pane {
  padding: 18px;
  background: var(--surface-card);
}
.inbox-pane {
  border-right: 1px solid var(--line);
}
.context-pane {
  border-left: 1px solid var(--line);
}
.pane-heading {
  gap: 12px;
  margin-bottom: 16px;
}
.pane-heading h2,
.conversation-header h2,
.empty-selection h2 {
  margin: 0;
  font-size: 1.05rem;
}
.inbox-count {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--surface-muted);
  font-weight: 700;
}
.conversation-list,
.inbox-skeletons,
.message-skeletons {
  display: grid;
  gap: 8px;
}
.conversation-list > :deep(.p-button),
.load-older {
  justify-self: start;
}
.conversation-row {
  width: 100%;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}
.conversation-row:hover {
  background: var(--surface-muted);
}
.conversation-row:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.conversation-row.selected {
  background: var(--brand-soft);
  border-color: var(--brand);
}
.conversation-row strong {
  max-width: 15ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-row time,
.conversation-row__user,
.conversation-row__meta,
.conversation-header p,
.message-meta time {
  color: var(--text-muted);
  font-size: 0.78rem;
}
.conversation-row__user {
  display: block;
  margin-top: 3px;
  font-family: var(--font-mono);
}
.conversation-row p {
  margin: 7px 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.conversation-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-base);
}
.conversation-header {
  gap: 16px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--line);
}
.conversation-header p {
  margin: 4px 0 0;
}
.mobile-back {
  display: none;
}
.mobile-context {
  display: none;
}
.message-log {
  flex: 1;
  padding: 22px;
  display: grid;
  align-content: start;
  gap: 12px;
  overflow: auto;
}
.message-skeletons {
  padding: 22px;
}
.message {
  max-width: min(82%, 620px);
  padding: 11px 13px;
  border-radius: 14px;
  background: var(--surface-card);
  border: 1px solid var(--line);
}
.message.from-user {
  justify-self: start;
}
.message.from-operator {
  justify-self: end;
  background: var(--brand-soft);
  border-color: color-mix(in srgb, var(--brand) 38%, var(--line));
}
.message.from-system {
  justify-self: start;
  background: var(--surface-muted);
}
.message-meta {
  gap: 14px;
  margin-bottom: 5px;
}
.message-author {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.message-avatar {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  font-size: 0.62rem;
}
.message p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.empty-pane {
  color: var(--text-muted);
  line-height: 1.5;
}
.empty-selection {
  min-height: 320px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 32px;
  text-align: center;
  color: var(--text-muted);
}
.empty-selection i {
  font-size: 2rem;
  color: var(--brand);
}
.empty-selection p {
  margin: 0;
}
@media (max-width: 1180px) {
  .support-workspace {
    grid-template-columns: minmax(230px, 300px) minmax(0, 1fr);
  }
  .context-pane {
    grid-column: 1 / -1;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
}
@media (max-width: 720px) {
  .support-workspace {
    display: block;
  }
  .support-workspace:not(.has-route-selection) .conversation-pane,
  .support-workspace:not(.has-route-selection) .context-pane,
  .support-workspace.has-route-selection .inbox-pane {
    display: none;
  }
  .inbox-pane {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .conversation-list {
    max-height: 260px;
    overflow: auto;
  }
  .conversation-header {
    align-items: flex-start;
    padding: 16px;
  }
  .conversation-header__actions {
    justify-content: flex-end;
  }
  .mobile-back {
    display: inline-flex;
    margin: -8px 0 8px -8px;
  }
  .mobile-context {
    display: inline-flex;
  }
  .context-pane {
    display: none;
  }
  .message-log,
  .message-skeletons {
    padding: 16px;
  }
  .message {
    max-width: 92%;
  }
}
</style>
