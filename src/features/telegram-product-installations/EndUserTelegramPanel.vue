<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { TelegramAdminLinkSummaryResponseDto } from "@/shared/api/generated/models";
import { telegramProductInstallationsApi } from "./telegram-product-installations.api";

const props = defineProps<{
  visible: boolean;
  projectId: string;
  endUserId: string | null;
  canRead: boolean;
}>();

const summary = ref<TelegramAdminLinkSummaryResponseDto | null>(null);
const loading = ref(false);
const error = ref("");
let epoch = 0;

const statusLabel = computed(() => {
  switch (summary.value?.effectiveStatus) {
    case "PENDING_CONFIRMATION":
      return "Ожидает подтверждения";
    case "ACTIVE":
      return "Подключён";
    case "BLOCKED":
      return "Бот заблокирован";
    case "REVOKED":
      return "Отключён";
    default:
      return "Не подключён";
  }
});
const headerStatus = computed(() => {
  if (loading.value) return { code: "LOADING", label: "Загрузка" };
  if (error.value) return { code: "UNAVAILABLE", label: "Недоступно" };
  return {
    code: summary.value?.effectiveStatus ?? "UNLINKED",
    label: statusLabel.value,
  };
});
const displayName = computed(() =>
  summary.value?.effectiveStatus === "PENDING_CONFIRMATION"
    ? summary.value.pendingCandidate?.displayName
    : (summary.value?.displayName ?? summary.value?.activeLink?.displayName),
);
const username = computed(() =>
  summary.value?.effectiveStatus === "PENDING_CONFIRMATION"
    ? summary.value.pendingCandidate?.username
    : (summary.value?.username ?? summary.value?.activeLink?.username),
);

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "—"
    : timestamp.toLocaleString("ru-RU");
}

async function load(): Promise<void> {
  const operation = {
    epoch,
    visible: props.visible,
    projectId: props.projectId,
    endUserId: props.endUserId,
    canRead: props.canRead,
  };
  if (
    !operation.visible ||
    !operation.projectId ||
    !operation.endUserId ||
    !operation.canRead
  ) {
    summary.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const loaded = await telegramProductInstallationsApi.getEndUserSummary(
      operation.projectId,
      operation.endUserId,
    );
    if (
      operation.epoch !== epoch ||
      !props.visible ||
      !props.canRead ||
      props.projectId !== operation.projectId ||
      props.endUserId !== operation.endUserId
    )
      return;
    summary.value = loaded;
  } catch {
    if (
      operation.epoch === epoch &&
      props.visible &&
      props.canRead &&
      props.projectId === operation.projectId &&
      props.endUserId === operation.endUserId
    ) {
      summary.value = null;
      error.value = "Не удалось загрузить статус Telegram.";
    }
  } finally {
    if (
      operation.epoch === epoch &&
      props.visible &&
      props.canRead &&
      props.projectId === operation.projectId &&
      props.endUserId === operation.endUserId
    )
      loading.value = false;
  }
}

watch(
  () =>
    [
      props.visible,
      props.projectId,
      props.endUserId,
      props.canRead,
    ] as const,
  () => {
    epoch += 1;
    summary.value = null;
    error.value = "";
    loading.value =
      props.visible &&
      Boolean(props.projectId) &&
      Boolean(props.endUserId) &&
      props.canRead;
    if (loading.value) void load();
  },
  { flush: "sync" },
);

onMounted(load);
</script>

<template>
  <section
    v-if="canRead"
    class="telegram-panel"
    aria-labelledby="end-user-telegram-title"
  >
    <header>
      <div>
        <span>Канал пользователя</span>
        <h4 id="end-user-telegram-title">Telegram</h4>
      </div>
      <strong :data-status="headerStatus.code">
        {{ headerStatus.label }}
      </strong>
    </header>
    <p v-if="loading" role="status" aria-live="polite">
      Загружаем статус Telegram…
    </p>
    <div v-else-if="error" class="error" role="alert">
      <p>{{ error }}</p>
      <button
        type="button"
        data-action="retry-telegram-summary"
        @click="load"
      >
        Повторить
      </button>
    </div>
    <dl v-else-if="summary" class="facts">
      <div>
        <dt>Имя в Telegram</dt>
        <dd>{{ displayName || "Не указано" }}</dd>
      </div>
      <div>
        <dt>Username</dt>
        <dd>{{ username ? `@${username}` : "Не указан" }}</dd>
      </div>
      <div v-if="summary.activeLink">
        <dt>Подключён</dt>
        <dd>{{ formatTimestamp(summary.activeLink.linkedAt) }}</dd>
      </div>
      <div v-if="summary.pendingCandidate">
        <dt>Ожидает до</dt>
        <dd>{{ formatTimestamp(summary.pendingCandidate.expiresAt) }}</dd>
      </div>
      <div v-if="summary.revokedAt">
        <dt>Отключён</dt>
        <dd>{{ formatTimestamp(summary.revokedAt) }}</dd>
      </div>
    </dl>
    <p v-else class="empty">Пользователь ещё не подключил Telegram.</p>
  </section>
</template>

<style scoped>
.telegram-panel {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}
.telegram-panel header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}
.telegram-panel header span,
.facts dt,
.empty {
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.telegram-panel h4 {
  margin: 2px 0 0;
}
.telegram-panel header strong {
  font-size: 0.72rem;
  text-align: right;
}
.facts {
  display: grid;
  gap: 8px;
  margin: 0;
}
.facts > div {
  padding: 9px;
  border-radius: 10px;
  background: var(--surface-ground);
}
.facts dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
}
.error {
  color: var(--status-danger-text);
}
.error p {
  margin: 0 0 8px;
}
</style>
