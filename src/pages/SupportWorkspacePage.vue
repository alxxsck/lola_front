<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { createSupportInboxController } from "@/features/support-inbox/model/use-support-inbox";
import { repository } from "@/shared/api/repository";
import { relativeTime } from "@/shared/lib/format";
import type { ConversationMessage } from "@/shared/types/domain";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const inbox = createSupportInboxController(
  { projectId: () => auth.project?.id },
  repository,
);
const messages = ref<ConversationMessage[]>([]);
const messagesLoading = ref(false);
const messagesError = ref("");
let messageGeneration = 0;

const selectedConversation = computed(() => {
  const routeId = route.params.conversationId;
  const conversationId = typeof routeId === "string" ? routeId : undefined;
  return (
    inbox.items.value.find((item) => item.id === conversationId) ??
    inbox.items.value[0] ??
    null
  );
});

const selectedName = computed(
  () => selectedConversation.value?.endUser.externalId ?? "Диалог",
);

function messageAuthor(message: ConversationMessage): string {
  if (message.authorSnapshot?.displayName)
    return message.authorSnapshot.displayName;
  return {
    USER: "Пользователь",
    ASSISTANT: auth.project?.assistantName ?? "Lola",
    ADMIN: "Оператор",
    SCENARIO: "Сценарий",
    SYSTEM: "Система",
  }[message.author];
}

function messageClass(message: ConversationMessage): string {
  if (message.author === "USER") return "from-user";
  if (message.author === "ADMIN") return "from-operator";
  return "from-system";
}

async function openConversation(conversationId: string): Promise<void> {
  if (conversationId === selectedConversation.value?.id) return;
  await router.push({
    name: "support-inbox-conversation",
    params: { conversationId },
  });
}

async function loadMessages(): Promise<void> {
  const selected = selectedConversation.value;
  const projectId = auth.project?.id;
  const requestGeneration = ++messageGeneration;
  messages.value = [];
  messagesError.value = "";
  if (!selected || !projectId) {
    messagesLoading.value = false;
    return;
  }
  messagesLoading.value = true;
  try {
    const page = await repository.getMessages(
      projectId,
      selected.endUser.id,
      selected.id,
      { limit: 50 },
    );
    if (requestGeneration !== messageGeneration) return;
    messages.value = [...page.items].sort(
      (left, right) =>
        (left.ordinal ?? Number.MAX_SAFE_INTEGER) -
          (right.ordinal ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  } catch {
    if (requestGeneration !== messageGeneration) return;
    messagesError.value = "Не удалось загрузить сообщения выбранного диалога";
  } finally {
    if (requestGeneration === messageGeneration) messagesLoading.value = false;
  }
}

async function reload(): Promise<void> {
  await inbox.load();
  await loadMessages();
}

onMounted(async () => {
  await inbox.load();
});

watch(
  () => [auth.project?.id, selectedConversation.value?.id],
  () => void loadMessages(),
  { immediate: true },
);

watch(
  () => auth.project?.id,
  () => inbox.reset(),
);

onBeforeUnmount(() => {
  inbox.reset();
  messageGeneration += 1;
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
        <Tag value="Read-only foundation" severity="secondary" />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="inbox.loading.value || messagesLoading"
          @click="reload"
        />
      </div>
    </header>

    <Message severity="info" :closable="false" class="workspace-notice">
      Отправка, назначение, SLA и delivery появятся после публикации их
      серверных контрактов. Этот экран не подменяет их локальными статусами.
    </Message>

    <div class="support-workspace card">
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
            <span class="conversation-row__user">{{
              conversation.endUser.externalId
            }}</span>
            <p>{{ conversation.lastMessage?.text ?? "Сообщений пока нет" }}</p>
            <span class="conversation-row__meta">
              {{ conversation.messageCount }} сообщений
              <span v-if="conversation.isCurrent">· текущий</span>
            </span>
          </button>
        </div>
      </aside>

      <main class="conversation-pane" aria-label="Выбранный диалог">
        <template v-if="selectedConversation">
          <header class="conversation-header">
            <div>
              <span class="eyebrow">{{
                selectedConversation.status === "ACTIVE"
                  ? "Активный диалог"
                  : "Архивный диалог"
              }}</span>
              <h2>{{ selectedConversation.title }}</h2>
              <p>{{ selectedConversation.endUser.externalId }}</p>
            </div>
            <Tag
              :value="
                selectedConversation.status === 'ACTIVE' ? 'Активен' : 'Архив'
              "
              :severity="
                selectedConversation.status === 'ACTIVE'
                  ? 'success'
                  : 'secondary'
              "
            />
          </header>

          <div
            v-if="messagesLoading"
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
          <Message v-else-if="messagesError" severity="error" :closable="false">
            {{ messagesError }}
          </Message>
          <div
            v-else
            class="message-log"
            role="log"
            aria-live="polite"
            aria-label="История сообщений"
          >
            <article
              v-for="message in messages"
              :key="message.id"
              class="message"
              :class="messageClass(message)"
            >
              <div class="message-meta">
                <strong>{{ messageAuthor(message) }}</strong>
                <time :datetime="message.createdAt">{{
                  relativeTime(message.createdAt)
                }}</time>
              </div>
              <p>{{ message.text }}</p>
            </article>
            <p v-if="!messages.length" class="empty-pane">
              В этом диалоге пока нет сообщений.
            </p>
          </div>
        </template>
        <div v-else class="empty-selection">
          <i class="pi pi-comments" aria-hidden="true" />
          <h2>Выберите диалог</h2>
          <p>История и безопасный контекст появятся здесь.</p>
        </div>
      </main>

      <aside
        v-if="selectedConversation"
        class="context-pane"
        aria-label="Контекст диалога"
      >
        <div class="pane-heading">
          <div>
            <span class="eyebrow">Контекст</span>
            <h2>Диалог</h2>
          </div>
        </div>
        <dl class="context-list">
          <div>
            <dt>Пользователь</dt>
            <dd>{{ selectedName }}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>
              {{
                selectedConversation.status === "ACTIVE"
                  ? "Активный"
                  : "Архивный"
              }}
            </dd>
          </div>
          <div>
            <dt>Сообщений</dt>
            <dd>{{ selectedConversation.messageCount }}</dd>
          </div>
          <div>
            <dt>Сессий сейчас</dt>
            <dd>{{ selectedConversation.currentInteractionSessionCount }}</dd>
          </div>
          <div>
            <dt>Обновлён</dt>
            <dd>{{ relativeTime(selectedConversation.updatedAt) }}</dd>
          </div>
        </dl>
        <Message severity="secondary" :closable="false">
          Полный профиль, события и sensitive поля загрузятся только при наличии
          отдельных разрешений.
        </Message>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.support-workspace-header,
.header-actions,
.pane-heading,
.conversation-row__top,
.conversation-header,
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
.message p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
  .context-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .support-workspace {
    display: block;
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
  .message-log,
  .message-skeletons {
    padding: 16px;
  }
  .message {
    max-width: 92%;
  }
  .context-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
