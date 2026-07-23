<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import { useAuthStore } from "@/features/auth/auth.store";
import { notificationOperationsApi } from "@/features/notification-operations/api/notification-operations.api";
import {
  notificationOperationsPermissions,
  type NotificationOperationsDelivery,
  type NotificationOperationsFilters,
  type NotificationOperationsIntegration,
  type NotificationOperationsQuarantineReason,
} from "@/features/notification-operations/model/notification-operations";
import { createNotificationOperationsController } from "@/features/notification-operations/model/use-notification-operations";
import ExceptionalDeliveryTable from "@/features/notification-operations/ui/ExceptionalDeliveryTable.vue";
import NotificationIntegrationTable from "@/features/notification-operations/ui/NotificationIntegrationTable.vue";
import NotificationOperationsHealth from "@/features/notification-operations/ui/NotificationOperationsHealth.vue";
import QuarantineIntegrationDialog from "@/features/notification-operations/ui/QuarantineIntegrationDialog.vue";
import ReplayDeliveryDialog from "@/features/notification-operations/ui/ReplayDeliveryDialog.vue";

const auth = useAuthStore();
const router = useRouter();
const controller = createNotificationOperationsController({
  api: notificationOperationsApi,
});
const replayTarget = ref<NotificationOperationsDelivery | null>(null);
const quarantineTarget = ref<NotificationOperationsIntegration | null>(null);
const filterError = ref("");
const filterDraft = reactive<NotificationOperationsFilters>({
  projectId: "",
  channel: "",
  status: "",
  integrationKind: "",
  integrationStatus: "",
});

const permissions = computed(() =>
  notificationOperationsPermissions(auth.user?.platformPermissionCodes ?? []),
);
const loading = computed(
  () =>
    controller.healthLoading.value ||
    controller.deliveriesLoading.value ||
    controller.integrationsLoading.value,
);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const channelOptions = [
  { value: "", label: "Все operational каналы" },
  { value: "SLACK_WEBHOOK", label: "Slack" },
  { value: "TELEGRAM_OPERATIONAL", label: "Telegram operational" },
] as const;
const deliveryStatusOptions = [
  { value: "", label: "Все exceptional статусы" },
  { value: "REJECTED", label: "Отклонена" },
  { value: "OUTCOME_UNKNOWN", label: "Результат неизвестен" },
  { value: "DEAD_LETTER", label: "Dead letter" },
  { value: "CANCELLED", label: "Отменена" },
  { value: "SUPPRESSED", label: "Подавлена" },
] as const;
const integrationKindOptions = [
  { value: "", label: "Все типы интеграций" },
  { value: "SLACK_DESTINATION", label: "Slack destination" },
  {
    value: "TELEGRAM_OPERATIONAL_DESTINATION",
    label: "Telegram operational destination",
  },
  {
    value: "TELEGRAM_PRODUCT_INSTALLATION",
    label: "Telegram product installation",
  },
] as const;
const integrationStatusOptions = [
  { value: "", label: "Все статусы интеграций" },
  { value: "PENDING_TEST", label: "Ожидает test" },
  { value: "PENDING_SETUP", label: "Ожидает setup" },
  { value: "ACTIVE", label: "Активна" },
  { value: "DISABLED", label: "Отключена" },
  { value: "INVALID", label: "Invalid" },
] as const;

async function applyFilters(): Promise<void> {
  const projectId = filterDraft.projectId.trim();
  if (projectId && !uuidPattern.test(projectId)) {
    filterError.value = "Project ID должен быть UUID.";
    return;
  }
  filterError.value = "";
  replayTarget.value = null;
  quarantineTarget.value = null;
  await controller.setFilters({ ...filterDraft, projectId });
}

async function resetFilters(): Promise<void> {
  Object.assign(filterDraft, {
    projectId: "",
    channel: "",
    status: "",
    integrationKind: "",
    integrationStatus: "",
  });
  await applyFilters();
}

async function confirmReplay(): Promise<void> {
  const target = replayTarget.value;
  replayTarget.value = null;
  if (target) await controller.replayDelivery(target.id);
}

async function confirmQuarantine(
  reason: NotificationOperationsQuarantineReason,
  confirmation: string,
): Promise<void> {
  const target = quarantineTarget.value;
  quarantineTarget.value = null;
  if (target)
    await controller.quarantineIntegration(
      target.integrationId,
      reason,
      confirmation,
    );
}

function openReplay(deliveryId: string): void {
  replayTarget.value =
    controller.deliveries.value.find((item) => item.id === deliveryId) ?? null;
}

function openQuarantine(integrationId: string): void {
  const matches = controller.integrations.value.filter(
    (item) => item.integrationId === integrationId,
  );
  quarantineTarget.value = matches.length === 1 ? matches[0]! : null;
}

async function requireFreshLogin(): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // logout always clears local authority; navigation must not depend on the network
  }
  controller.dispose();
  await router.replace({
    name: "login",
    query: { redirect: "/platform/notification-operations" },
  });
}

watch(
  () => ({
    userId: auth.user?.id ?? "",
    projectId: auth.project?.id ?? "",
    read: permissions.value.read,
    operate: permissions.value.operate,
    authenticated: auth.isAuthenticated,
  }),
  async ({ userId, projectId, read, operate, authenticated }) => {
    replayTarget.value = null;
    quarantineTarget.value = null;
    controller.setContext({
      authorityKey: authenticated
        ? `${userId}:${projectId}:${read}:${operate}`
        : "",
      permissions: { read, operate },
    });
    if (!authenticated) return;
    if (!read) {
      await router.replace(auth.authenticatedLandingPath);
      return;
    }
    await controller.refresh();
  },
  { immediate: true },
);

watch(
  () => controller.error.value?.kind,
  async (kind) => {
    if (kind !== "FORBIDDEN" || !auth.isAuthenticated) return;
    try {
      await auth.refreshContext();
    } catch {
      await router.replace({ name: "login" });
    }
  },
);

onBeforeUnmount(() => controller.dispose());
</script>

<template>
  <section class="page notification-operations-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Control plane · Platform scope</div>
        <h1>Доставка и восстановление</h1>
        <p class="subtitle">
          Безопасное здоровье очередей, единичный replay и quarantine
          скомпрометированных интеграций без recipient data и содержимого.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="loading"
        @click="controller.refresh()"
      />
    </header>

    <Message
      v-if="controller.notice.value"
      severity="success"
      closable
      @close="controller.clearNotice()"
    >
      {{ controller.notice.value }}
    </Message>
    <Message v-if="controller.error.value" severity="error" :closable="false">
      <div class="message-action">
        <span>{{ controller.error.value.message }}</span>
        <Button
          v-if="controller.retryAvailable.value"
          label="Повторить тот же запрос"
          size="small"
          @click="controller.retryLastMutation()"
        />
        <Button
          v-if="controller.error.value.kind === 'FRESH_AUTH'"
          label="Войти заново"
          size="small"
          data-action="notification-operations-fresh-login"
          @click="requireFreshLogin"
        />
      </div>
    </Message>

    <NotificationOperationsHealth
      :health="controller.health.value"
      :loading="controller.healthLoading.value"
    />

    <form
      class="filters card"
      aria-label="Фильтры операций доставки"
      @submit.prevent="applyFilters"
    >
      <label>
        <span>Project UUID</span>
        <input
          v-model="filterDraft.projectId"
          type="text"
          placeholder="Все Projects"
          autocomplete="off"
          :disabled="controller.mutating.value"
        />
      </label>
      <label>
        <span>Канал delivery</span>
        <select
          v-model="filterDraft.channel"
          :disabled="controller.mutating.value"
        >
          <option
            v-for="option in channelOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        <span>Статус delivery</span>
        <select
          v-model="filterDraft.status"
          :disabled="controller.mutating.value"
        >
          <option
            v-for="option in deliveryStatusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        <span>Тип интеграции</span>
        <select
          v-model="filterDraft.integrationKind"
          :disabled="controller.mutating.value"
        >
          <option
            v-for="option in integrationKindOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        <span>Статус интеграции</span>
        <select
          v-model="filterDraft.integrationStatus"
          :disabled="controller.mutating.value"
        >
          <option
            v-for="option in integrationStatusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <div class="filter-actions">
        <Button
          type="submit"
          label="Применить"
          :disabled="controller.mutating.value"
        />
        <Button
          type="button"
          label="Сбросить"
          severity="secondary"
          text
          :disabled="controller.mutating.value"
          @click="resetFilters"
        />
      </div>
      <small v-if="filterError" role="alert">{{ filterError }}</small>
    </form>

    <ExceptionalDeliveryTable
      :items="controller.deliveries.value"
      :permissions="permissions"
      :next-cursor="controller.nextDeliveryCursor.value"
      :loading="controller.deliveriesLoading.value"
      @replay="openReplay"
      @load-more="controller.loadMoreDeliveries()"
    />

    <NotificationIntegrationTable
      :items="controller.integrations.value"
      :permissions="permissions"
      :next-cursor="controller.nextIntegrationCursor.value"
      :loading="controller.integrationsLoading.value"
      @quarantine="openQuarantine"
      @load-more="controller.loadMoreIntegrations()"
    />
  </section>

  <ReplayDeliveryDialog
    :target="replayTarget"
    :submitting="controller.mutating.value"
    @confirm="confirmReplay"
    @cancel="replayTarget = null"
  />
  <QuarantineIntegrationDialog
    :target="quarantineTarget"
    :submitting="controller.mutating.value"
    @confirm="confirmQuarantine"
    @cancel="quarantineTarget = null"
  />
</template>

<style scoped>
.notification-operations-page {
  display: grid;
  gap: 20px;
}
.message-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
}
.filters label {
  display: grid;
  gap: 6px;
}
.filters label span {
  color: var(--text-small-muted);
  font-size: 0.72rem;
  font-weight: 700;
}
.filters input,
.filters select {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  padding: 0 10px;
  font: inherit;
}
.filter-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
}
.filters small {
  grid-column: 1 / -1;
  color: var(--status-danger-text);
}
@media (max-width: 1000px) {
  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 620px) {
  .message-action,
  .filter-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
