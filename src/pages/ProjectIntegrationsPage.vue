<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import "@/app/styles/project-integrations.css";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { notificationDestinationsApi } from "@/features/notification-destinations/notification-destinations.api";
import OperationalTelegramCard from "@/features/notification-destinations/OperationalTelegramCard.vue";
import ProductTelegramCard from "@/features/telegram-product-installations/ProductTelegramCard.vue";
import type { NotificationDestinationResponseDto } from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { formatAuditActor } from "@/shared/lib/format";

const auth = useAuthStore();
const router = useRouter();
const projectId = computed(() => auth.project?.id ?? "");
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canRead = computed(() =>
  hasProjectPermission(permissions.value, "project.notifications.read"),
);
const canManage = computed(() =>
  hasProjectPermission(permissions.value, "project.notifications.manage"),
);
const canReadProductTelegram = computed(() =>
  hasProjectPermission(permissions.value, "project.integrations.read"),
);
const canManageProductTelegram = computed(() =>
  hasProjectPermission(permissions.value, "project.integrations.manage"),
);
const destination = ref<NotificationDestinationResponseDto | null>(null);
const loading = ref(true);
const pending = ref(false);
const loadError = ref("");
const actionError = ref("");
const actionSuccess = ref("");
const displayName = ref("Предложения Lola");
const webhookUrl = ref("");
const createRetryKey = ref("");
const testRetry = ref<{ signature: string; key: string } | null>(null);
const productTelegramStepUpPending = ref(false);
let operationEpoch = 0;

const statusLabel = computed(() => {
  switch (destination.value?.status) {
    case "ACTIVE":
      return "Подключено";
    case "DISABLED":
      return "Отключено";
    case "INVALID":
      return "Требуется переподключение";
    case "PENDING_TEST":
      return "Требуется проверка";
    default:
      return "Не подключено";
  }
});
const readyToActivate = computed(
  () =>
    destination.value &&
    destination.value.testedSecretRevision ===
      destination.value.secretRevision &&
    destination.value.status !== "ACTIVE",
);

function clearFeedback(): void {
  actionError.value = "";
  actionSuccess.value = "";
}

async function requireFreshProductTelegramLogin(): Promise<void> {
  if (productTelegramStepUpPending.value) return;
  productTelegramStepUpPending.value = true;
  try {
    await auth.logout();
    operationEpoch += 1;
    destination.value = null;
    webhookUrl.value = "";
    await router.replace({
      name: "login",
      query: { redirect: "/settings/integrations" },
    });
  } finally {
    productTelegramStepUpPending.value = false;
  }
}

function beginOperation(): { projectId: string; epoch: number } | null {
  return projectId.value
    ? { projectId: projectId.value, epoch: operationEpoch }
    : null;
}

function isCurrent(operation: { projectId: string; epoch: number }): boolean {
  return (
    operation.epoch === operationEpoch &&
    operation.projectId === projectId.value
  );
}

function testIdempotencyKey(destinationId: string, version: number): string {
  const signature = `${destinationId}:${version}`;
  if (testRetry.value?.signature === signature) return testRetry.value.key;
  const key = crypto.randomUUID();
  testRetry.value = { signature, key };
  return key;
}

function terminalTestStatus(status: string): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "OUTCOME_UNKNOWN"
  );
}

function pendingTestStatus(status: string): boolean {
  return (
    status === "PENDING" || status === "PROCESSING" || status === "RETRY_WAIT"
  );
}

async function awaitDurableTest(
  operation: { projectId: string; epoch: number },
  destinationId: string,
  version: number,
  key: string,
) {
  let result = await notificationDestinationsApi.testSlack(
    operation.projectId,
    destinationId,
    version,
    key,
  );
  for (
    let attempt = 0;
    attempt < 20 && !terminalTestStatus(result.status);
    attempt += 1
  ) {
    if (!isCurrent(operation)) return result;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    if (!isCurrent(operation)) return result;
    result = await notificationDestinationsApi.testSlack(
      operation.projectId,
      destinationId,
      version,
      key,
    );
  }
  return result;
}

async function load(): Promise<void> {
  const selectedProjectId = projectId.value;
  if (!selectedProjectId || !canRead.value) {
    destination.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = "";
  try {
    const response = await notificationDestinationsApi.list(selectedProjectId);
    if (projectId.value !== selectedProjectId) return;
    destination.value =
      response.items.find(({ channel }) => channel === "SLACK_WEBHOOK") ?? null;
    displayName.value = destination.value?.displayName ?? "Предложения Lola";
  } catch {
    if (projectId.value === selectedProjectId) {
      destination.value = null;
      loadError.value = "Не удалось загрузить интеграции проекта.";
    }
  } finally {
    if (projectId.value === selectedProjectId) loading.value = false;
  }
}

async function createAndTest(): Promise<void> {
  const operation = beginOperation();
  if (!canManage.value || !operation || pending.value) return;
  const secret = webhookUrl.value.trim();
  const name = displayName.value.trim();
  if (!secret || !name) {
    actionError.value = "Укажите название и Slack Incoming Webhook URL.";
    return;
  }
  clearFeedback();
  pending.value = true;
  webhookUrl.value = "";
  try {
    const createKey = createRetryKey.value || crypto.randomUUID();
    createRetryKey.value = createKey;
    const created = await notificationDestinationsApi.createSlack(
      operation.projectId,
      { displayName: name, webhookUrl: secret },
      createKey,
    );
    createRetryKey.value = "";
    if (!isCurrent(operation)) return;
    const result = await awaitDurableTest(
      operation,
      created.id,
      created.version,
      testIdempotencyKey(created.id, created.version),
    );
    if (!isCurrent(operation)) return;
    if (terminalTestStatus(result.status)) testRetry.value = null;
    if (result.status === "SUCCEEDED") {
      actionSuccess.value =
        "Проверка Slack прошла успешно. Теперь интеграцию можно активировать.";
    } else if (pendingTestStatus(result.status)) {
      actionSuccess.value = testFailureCopy(result.status);
    } else {
      actionError.value = testFailureCopy(result.status);
    }
  } catch (cause) {
    if (isCurrent(operation)) actionError.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) {
      webhookUrl.value = "";
      await load();
      pending.value = false;
    }
  }
}

async function testCurrent(): Promise<void> {
  const current = destination.value;
  const operation = beginOperation();
  if (
    !current ||
    !operation ||
    current.projectId !== operation.projectId ||
    !canManage.value ||
    pending.value
  )
    return;
  clearFeedback();
  pending.value = true;
  try {
    const result = await awaitDurableTest(
      operation,
      current.id,
      current.version,
      testIdempotencyKey(current.id, current.version),
    );
    if (!isCurrent(operation)) return;
    if (terminalTestStatus(result.status)) testRetry.value = null;
    if (result.status === "SUCCEEDED") {
      actionSuccess.value =
        "Проверка Slack прошла успешно. Теперь интеграцию можно активировать.";
    } else if (pendingTestStatus(result.status)) {
      actionSuccess.value = testFailureCopy(result.status);
    } else {
      actionError.value = testFailureCopy(result.status);
    }
  } catch (cause) {
    if (isCurrent(operation)) actionError.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) {
      await load();
      pending.value = false;
    }
  }
}

async function activate(): Promise<void> {
  const current = destination.value;
  const operation = beginOperation();
  if (
    !current ||
    !operation ||
    current.projectId !== operation.projectId ||
    !readyToActivate.value ||
    !canManage.value ||
    pending.value
  )
    return;
  clearFeedback();
  pending.value = true;
  try {
    const updated = await notificationDestinationsApi.updateSlack(
      current.projectId,
      current.id,
      { expectedVersion: current.version, desiredStatus: "ACTIVE" },
    );
    if (isCurrent(operation)) {
      destination.value = updated;
      actionSuccess.value = "Slack-уведомления включены.";
    }
  } catch (cause) {
    if (isCurrent(operation)) actionError.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) pending.value = false;
  }
}

async function disable(): Promise<void> {
  const current = destination.value;
  const operation = beginOperation();
  if (
    !current ||
    !operation ||
    current.projectId !== operation.projectId ||
    current.status !== "ACTIVE" ||
    !canManage.value ||
    pending.value ||
    !window.confirm(`Отключить Slack-интеграцию «${current.displayName}»?`)
  ) {
    return;
  }
  clearFeedback();
  pending.value = true;
  try {
    const updated = await notificationDestinationsApi.updateSlack(
      current.projectId,
      current.id,
      { expectedVersion: current.version, desiredStatus: "DISABLED" },
    );
    if (isCurrent(operation)) {
      destination.value = updated;
      actionSuccess.value = "Slack-уведомления отключены.";
    }
  } catch (cause) {
    if (isCurrent(operation)) actionError.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) pending.value = false;
  }
}

async function rotateAndTest(): Promise<void> {
  const current = destination.value;
  const operation = beginOperation();
  const secret = webhookUrl.value.trim();
  if (
    !current ||
    !operation ||
    current.projectId !== operation.projectId ||
    !canManage.value ||
    pending.value ||
    !secret
  )
    return;
  if (
    !window.confirm(
      `Заменить webhook для «${current.displayName}»? Интеграцию потребуется активировать снова.`,
    )
  ) {
    return;
  }
  clearFeedback();
  pending.value = true;
  webhookUrl.value = "";
  try {
    const rotated = await notificationDestinationsApi.updateSlack(
      current.projectId,
      current.id,
      { expectedVersion: current.version, webhookUrl: secret },
    );
    if (!isCurrent(operation)) return;
    const result = await awaitDurableTest(
      operation,
      rotated.id,
      rotated.version,
      testIdempotencyKey(rotated.id, rotated.version),
    );
    if (!isCurrent(operation)) return;
    if (terminalTestStatus(result.status)) testRetry.value = null;
    if (result.status === "SUCCEEDED") {
      actionSuccess.value =
        "Новый webhook сохранён и проверен. Активируйте интеграцию.";
    } else if (pendingTestStatus(result.status)) {
      actionSuccess.value = testFailureCopy(result.status);
    } else {
      actionError.value = testFailureCopy(result.status);
    }
  } catch (cause) {
    if (isCurrent(operation)) actionError.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) {
      webhookUrl.value = "";
      await load();
      pending.value = false;
    }
  }
}

function testFailureCopy(status: string): string {
  if (
    status === "PENDING" ||
    status === "PROCESSING" ||
    status === "RETRY_WAIT"
  ) {
    return "Проверка ещё выполняется. Нажмите «Проверить», чтобы обновить статус.";
  }
  return status === "OUTCOME_UNKNOWN"
    ? "Slack не подтвердил результат проверки. Не активируйте интеграцию и повторите проверку позже."
    : "Slack отклонил проверку. Проверьте webhook и попробуйте снова.";
}

function safeError(cause: unknown): string {
  const error = normalizeApiError(cause);
  if (error.code === "NOTIFICATION_DESTINATION_VERSION_CONFLICT") {
    void load();
    return "Настройки уже изменились в другой вкладке. Данные обновлены — повторите действие.";
  }
  if (error.code === "SLACK_WEBHOOK_URL_INVALID")
    return "Slack Incoming Webhook URL имеет неверный формат.";
  if (error.code === "NOTIFICATION_DESTINATION_TEST_REQUIRED")
    return "Сначала выполните успешную проверку текущего webhook.";
  if (error.code === "FORBIDDEN" || error.status === 403)
    return "Недостаточно прав для изменения интеграции.";
  return "Не удалось изменить Slack-интеграцию. Повторите попытку.";
}

watch([projectId, canRead, canManage], () => {
  operationEpoch += 1;
  pending.value = false;
  destination.value = null;
  loading.value = true;
  createRetryKey.value = "";
  testRetry.value = null;
  webhookUrl.value = "";
  clearFeedback();
  if (canRead.value) void load();
  else loading.value = false;
});

onMounted(load);
</script>

<template>
  <main class="page integration-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Проект</div>
        <h1>Интеграции</h1>
        <p class="subtitle">
          Настройте каналы для команды и пользователей. Токены и webhook
          хранятся зашифрованными и не отображаются после сохранения.
        </p>
      </div>
    </header>

    <p v-if="loadError" class="feedback error" role="alert">
      {{ loadError }}
      <button type="button" @click="load">Повторить</button>
    </p>
    <p v-if="actionError" class="feedback error" role="alert">
      {{ actionError }}
    </p>
    <p
      v-if="actionSuccess"
      class="feedback success"
      role="status"
      aria-live="polite"
    >
      {{ actionSuccess }}
    </p>

    <section
      v-if="canRead"
      class="integration-card"
      data-integration="slack"
      aria-labelledby="slack-title"
    >
      <div class="card-heading">
        <div class="provider-mark provider-mark--slack" aria-hidden="true">
          <i class="pi pi-slack" />
        </div>
        <div class="card-title">
          <h2 id="slack-title">Slack для команды</h2>
          <p>Отправляет новые предложения Lola в выбранный канал команды.</p>
        </div>
        <span class="status" :data-status="destination?.status ?? 'EMPTY'">
          {{ statusLabel }}
        </span>
      </div>

      <div v-if="loading" class="skeleton" aria-live="polite">
        Загружаем интеграцию…
      </div>

      <template v-else-if="destination">
        <dl class="integration-facts">
          <div>
            <dt>Название</dt>
            <dd>{{ destination.displayName }}</dd>
          </div>
          <div>
            <dt>Идентификатор секрета</dt>
            <dd>
              <code>{{ destination.credentialFingerprint }}</code>
            </dd>
          </div>
          <div>
            <dt>Последняя успешная проверка</dt>
            <dd>
              {{
                destination.lastSuccessfulTestAt
                  ? new Date(destination.lastSuccessfulTestAt).toLocaleString(
                      "ru-RU",
                    )
                  : "Ещё не выполнялась"
              }}
            </dd>
          </div>
          <div>
            <dt>Последняя ошибка</dt>
            <dd>{{ destination.lastFailureCategory ?? "Нет" }}</dd>
          </div>
          <div>
            <dt>Последнее изменение</dt>
            <dd>
              {{ new Date(destination.updatedAt).toLocaleString("ru-RU") }}
            </dd>
          </div>
          <div>
            <dt>Изменил</dt>
            <dd>
              {{
                formatAuditActor(
                  destination.updatedByActorType,
                  destination.updatedByActorId,
                )
              }}
            </dd>
          </div>
        </dl>

        <div v-if="canManage" class="actions">
          <button
            v-if="!readyToActivate"
            type="button"
            data-action="test"
            :disabled="pending"
            @click="testCurrent"
          >
            Проверить подключение
          </button>
          <button
            v-if="readyToActivate"
            type="button"
            data-action="activate"
            :disabled="pending"
            @click="activate"
          >
            Активировать
          </button>
          <button
            v-if="destination.status === 'ACTIVE'"
            type="button"
            class="secondary"
            data-action="disable"
            :disabled="pending"
            @click="disable"
          >
            Отключить
          </button>
        </div>

        <form
          v-if="canManage"
          class="secret-form secret-form--single"
          data-form="rotate-slack"
          @submit.prevent="rotateAndTest"
        >
          <label class="integration-field" for="slack-webhook-rotate">
            <span>Новый webhook URL</span>
            <input
              id="slack-webhook-rotate"
              v-model="webhookUrl"
              name="webhookUrl"
              type="password"
              autocomplete="off"
              placeholder="https://hooks.slack.com/services/…"
              :disabled="pending"
            />
          </label>
          <small
            >После замены Lola проверит подключение. URL очистится сразу после
            отправки.</small
          >
          <div class="form-actions">
            <button
              type="submit"
              class="secondary"
              :disabled="pending || !webhookUrl.trim()"
            >
              Заменить и проверить
            </button>
          </div>
        </form>
      </template>

      <form
        v-else-if="canManage"
        class="secret-form"
        data-form="create-slack"
        @submit.prevent="createAndTest"
      >
        <label class="integration-field" for="slack-name">
          <span>Название подключения</span>
          <input
            id="slack-name"
            v-model="displayName"
            name="displayName"
            maxlength="120"
            placeholder="Например, предложения Lola"
          />
        </label>
        <label class="integration-field" for="slack-webhook-create">
          <span>Webhook URL</span>
          <input
            id="slack-webhook-create"
            v-model="webhookUrl"
            name="webhookUrl"
            type="password"
            autocomplete="off"
            placeholder="https://hooks.slack.com/services/…"
            :disabled="pending"
          />
        </label>
        <small
          >Создайте Incoming Webhook в Slack и вставьте URL. После сохранения
          Lola сразу проверит подключение.</small
        >
        <div class="form-actions">
          <button
            type="submit"
            :disabled="pending || !displayName.trim() || !webhookUrl.trim()"
          >
            Сохранить и проверить
          </button>
        </div>
      </form>

      <p v-else class="read-only-note">
        У вас есть доступ только для просмотра интеграций.
      </p>
    </section>

    <OperationalTelegramCard
      v-if="canRead"
      :project-id="projectId"
      :can-read="canRead"
      :can-manage="canManage"
    />
    <ProductTelegramCard
      v-if="canReadProductTelegram"
      :project-id="projectId"
      :can-read="canReadProductTelegram"
      :can-manage="canManageProductTelegram"
      @fresh-login-requested="requireFreshProductTelegramLogin"
    />
  </main>
</template>
