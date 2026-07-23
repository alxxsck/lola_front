<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { notificationDestinationsApi } from "./notification-destinations.api";
import type {
  NotificationDestinationResponseDto,
  TelegramBindingChallengeResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { formatAuditActor } from "@/shared/lib/format";

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canManage: boolean;
}>();

const destination = ref<NotificationDestinationResponseDto | null>(null);
const challenge = ref<TelegramBindingChallengeResponseDto | null>(null);
const loading = ref(true);
const pending = ref(false);
const error = ref("");
const success = ref("");
const displayName = ref("Служебные уведомления");
const botToken = ref("");
const createRetryKey = ref("");
const testRetry = ref<{ signature: string; key: string } | null>(null);
let epoch = 0;

const statusView = computed(() => {
  const current = destination.value;
  if (!current) return { label: "Не подключено", tone: "EMPTY" };
  if (current.status === "DISABLED")
    return { label: "Отключено", tone: "DISABLED" };
  if (
    current.status === "INVALID" ||
    current.telegramWebhookSetupStatus === "FAILED"
  ) {
    return {
      label:
        current.status === "INVALID"
          ? "Требуется переподключение"
          : "Webhook не подключён",
      tone: "FAILED",
    };
  }
  if (current.telegramWebhookSetupStatus !== "SUCCEEDED")
    return { label: "Регистрируем webhook", tone: "PROCESSING" };
  if (current.telegramInstallationStatus === "PENDING_BINDING")
    return { label: "Ожидает привязки чата", tone: "PENDING_TEST" };
  if (current.status === "ACTIVE")
    return { label: "Подключено", tone: "ACTIVE" };
  return { label: "Требуется проверка", tone: "PENDING_TEST" };
});

const setupReady = computed(
  () => destination.value?.telegramWebhookSetupStatus === "SUCCEEDED",
);

const isBound = computed(
  () =>
    destination.value?.telegramInstallationStatus === "BOUND" &&
    setupReady.value &&
    Boolean(destination.value.destinationChatId),
);

const readyToActivate = computed(
  () =>
    isBound.value &&
    destination.value?.testedSecretRevision ===
      destination.value?.secretRevision &&
    destination.value?.testedRoutingRevision ===
      destination.value?.routingRevision &&
    destination.value?.status !== "ACTIVE",
);

function currentOperation(): { projectId: string; epoch: number } | null {
  return props.projectId ? { projectId: props.projectId, epoch } : null;
}

function isCurrent(operation: { projectId: string; epoch: number }): boolean {
  return operation.projectId === props.projectId && operation.epoch === epoch;
}

function belongsToCurrentProject(
  operation: { projectId: string; epoch: number },
  current: NotificationDestinationResponseDto,
): boolean {
  return (
    isCurrent(operation) &&
    current.projectId === operation.projectId &&
    current.channel === "TELEGRAM_OPERATIONAL"
  );
}

function clearFeedback(): void {
  error.value = "";
  success.value = "";
}

function durableTestKey(id: string, version: number): string {
  const signature = `${id}:${version}`;
  if (testRetry.value?.signature === signature) return testRetry.value.key;
  const key = crypto.randomUUID();
  testRetry.value = { signature, key };
  return key;
}

function terminal(status: string): boolean {
  return ["SUCCEEDED", "FAILED", "OUTCOME_UNKNOWN"].includes(status);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "—"
    : timestamp.toLocaleString("ru-RU");
}

function failureLabel(category: string | null): string {
  switch (category) {
    case null:
      return "Нет";
    case "TELEGRAM_BOT_TOKEN_INVALID":
      return "Token бота недействителен";
    case "TELEGRAM_DESTINATION_UNAVAILABLE":
      return "Чат недоступен или бот заблокирован";
    case "TELEGRAM_DELIVERY_EXHAUSTED":
      return "Лимит повторных попыток исчерпан";
    case "TELEGRAM_SECRET_UNAVAILABLE":
      return "Credential недоступен";
    case "TELEGRAM_WEBHOOK_CONFIGURATION_FAILED":
      return "Не удалось настроить webhook";
    default:
      return "Требуется проверка подключения";
  }
}

async function load(): Promise<void> {
  const operation = currentOperation();
  if (!operation || !props.canRead) {
    destination.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const response = await notificationDestinationsApi.list(
      operation.projectId,
    );
    const loadedDestination =
      response.items.find(
        ({ channel, projectId }) =>
          channel === "TELEGRAM_OPERATIONAL" &&
          projectId === operation.projectId,
      ) ?? null;
    if (!isCurrent(operation)) return;
    destination.value = loadedDestination;
    displayName.value =
      destination.value?.displayName ?? "Служебные уведомления";
    if (!setupReady.value || isBound.value) challenge.value = null;
  } catch {
    if (isCurrent(operation))
      error.value = "Не удалось загрузить служебный Telegram.";
  } finally {
    if (isCurrent(operation)) loading.value = false;
  }
}

function requestChallenge(
  operation: { projectId: string; epoch: number },
  current: NotificationDestinationResponseDto,
): Promise<TelegramBindingChallengeResponseDto> {
  return notificationDestinationsApi.createTelegramBindingChallenge(
    operation.projectId,
    current.id,
    current.version,
  );
}

async function create(): Promise<void> {
  const operation = currentOperation();
  const token = botToken.value.trim();
  const name = displayName.value.trim();
  if (!operation || !props.canManage || pending.value) return;
  if (!token || !name) {
    error.value = "Укажите название и token служебного Telegram-бота.";
    return;
  }
  clearFeedback();
  pending.value = true;
  botToken.value = "";
  try {
    const key = createRetryKey.value || crypto.randomUUID();
    createRetryKey.value = key;
    const created = await notificationDestinationsApi.createOperationalTelegram(
      operation.projectId,
      { displayName: name, botToken: token },
      key,
    );
    if (!belongsToCurrentProject(operation, created)) return;
    createRetryKey.value = "";
    destination.value = created;
    success.value =
      "Бот проверен. Lola регистрирует защищённый webhook — обновите статус через несколько секунд.";
  } catch (cause) {
    if (isCurrent(operation)) error.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) {
      botToken.value = "";
      await load();
      pending.value = false;
    }
  }
}

async function createChallenge(): Promise<void> {
  const current = destination.value;
  const operation = currentOperation();
  if (
    !current ||
    !operation ||
    !belongsToCurrentProject(operation, current) ||
    !props.canManage ||
    pending.value
  )
    return;
  clearFeedback();
  pending.value = true;
  try {
    const issuedChallenge = await requestChallenge(operation, current);
    if (!isCurrent(operation)) return;
    challenge.value = issuedChallenge;
    success.value = "Новая команда действует 5 минут.";
  } catch (cause) {
    if (isCurrent(operation)) error.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) pending.value = false;
  }
}

async function refreshBinding(): Promise<void> {
  const operation = currentOperation();
  if (!operation || pending.value) return;
  clearFeedback();
  await load();
  if (!isCurrent(operation)) return;
  if (!setupReady.value) {
    success.value =
      "Webhook ещё регистрируется. Повторите проверку через несколько секунд.";
  } else if (isBound.value) {
    challenge.value = null;
    success.value = "Telegram-чат привязан. Выполните тестовое уведомление.";
  } else {
    success.value =
      "Команда пока не получена. Проверьте чат или выпустите новую.";
  }
}

async function awaitTest(
  operation: { projectId: string; epoch: number },
  current: NotificationDestinationResponseDto,
  key: string,
) {
  let result = await notificationDestinationsApi.testOperationalTelegram(
    operation.projectId,
    current.id,
    current.version,
    key,
  );
  for (
    let attempt = 0;
    attempt < 20 && !terminal(result.status);
    attempt += 1
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    if (!isCurrent(operation)) return result;
    result = await notificationDestinationsApi.testOperationalTelegram(
      operation.projectId,
      current.id,
      current.version,
      key,
    );
  }
  return result;
}

async function testCurrent(): Promise<void> {
  const current = destination.value;
  const operation = currentOperation();
  if (
    !current ||
    !operation ||
    !belongsToCurrentProject(operation, current) ||
    !isBound.value ||
    !props.canManage ||
    pending.value
  )
    return;
  clearFeedback();
  pending.value = true;
  try {
    const result = await awaitTest(
      operation,
      current,
      durableTestKey(current.id, current.version),
    );
    if (!isCurrent(operation)) return;
    if (terminal(result.status)) testRetry.value = null;
    if (result.status === "SUCCEEDED") {
      success.value =
        "Тестовое сообщение отправлено. Интеграцию можно активировать.";
    } else if (
      ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(result.status)
    ) {
      success.value =
        "Проверка ещё выполняется. Нажмите «Проверить», чтобы обновить статус.";
    } else {
      error.value =
        result.status === "OUTCOME_UNKNOWN"
          ? "Telegram не подтвердил результат. Повторите проверку позже."
          : "Telegram отклонил тестовое сообщение.";
    }
  } catch (cause) {
    if (isCurrent(operation)) error.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) {
      await load();
      pending.value = false;
    }
  }
}

async function updateStatus(status: "ACTIVE" | "DISABLED"): Promise<void> {
  const current = destination.value;
  const operation = currentOperation();
  if (
    !current ||
    !operation ||
    !belongsToCurrentProject(operation, current) ||
    !props.canManage ||
    pending.value
  )
    return;
  if (
    status === "DISABLED" &&
    !window.confirm(`Отключить служебный Telegram «${current.displayName}»?`)
  )
    return;
  clearFeedback();
  pending.value = true;
  try {
    const updated = await notificationDestinationsApi.updateOperationalTelegram(
      operation.projectId,
      current.id,
      { expectedVersion: current.version, desiredStatus: status },
    );
    if (!belongsToCurrentProject(operation, updated)) return;
    destination.value = updated;
    success.value =
      status === "ACTIVE"
        ? "Служебные Telegram-уведомления включены."
        : "Служебные Telegram-уведомления отключены.";
  } catch (cause) {
    if (isCurrent(operation)) error.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) pending.value = false;
  }
}

async function rotate(): Promise<void> {
  const current = destination.value;
  const operation = currentOperation();
  const token = botToken.value.trim();
  if (
    !current ||
    !operation ||
    !belongsToCurrentProject(operation, current) ||
    !props.canManage ||
    pending.value ||
    !token
  )
    return;
  if (
    !window.confirm(
      "Заменить token? Чат потребуется привязать и проверить заново.",
    )
  )
    return;
  clearFeedback();
  pending.value = true;
  botToken.value = "";
  try {
    const rotated = await notificationDestinationsApi.updateOperationalTelegram(
      operation.projectId,
      current.id,
      { expectedVersion: current.version, botToken: token },
    );
    if (!belongsToCurrentProject(operation, rotated)) return;
    destination.value = rotated;
    challenge.value = null;
    success.value =
      rotated.telegramWebhookSetupStatus === "SUCCEEDED"
        ? "Новый бот проверен. Получите новую команду привязки."
        : "Новый бот проверен. Lola регистрирует защищённый webhook — обновите статус через несколько секунд.";
  } catch (cause) {
    if (isCurrent(operation)) error.value = safeError(cause);
  } finally {
    if (isCurrent(operation)) {
      botToken.value = "";
      await load();
      pending.value = false;
    }
  }
}

function safeError(cause: unknown): string {
  const apiError = normalizeApiError(cause);
  if (apiError.code === "NOTIFICATION_DESTINATION_VERSION_CONFLICT") {
    void load();
    return "Настройки изменились в другой вкладке. Данные обновлены.";
  }
  if (apiError.code === "TELEGRAM_BOT_TOKEN_INVALID")
    return "Telegram отклонил token бота.";
  if (apiError.code === "TELEGRAM_DESTINATION_BINDING_REQUIRED")
    return "Сначала привяжите Telegram-чат.";
  if (apiError.code === "TELEGRAM_DESTINATION_TEST_REQUIRED")
    return "Сначала привяжите чат и выполните успешную проверку.";
  if (apiError.code === "TELEGRAM_WEBHOOK_SETUP_PENDING")
    return "Webhook ещё регистрируется. Обновите статус через несколько секунд.";
  if (apiError.status === 403)
    return "Недостаточно прав для изменения интеграции.";
  return "Не удалось изменить служебный Telegram. Повторите попытку.";
}

watch(
  () => [props.projectId, props.canRead, props.canManage],
  () => {
    epoch += 1;
    destination.value = null;
    challenge.value = null;
    botToken.value = "";
    createRetryKey.value = "";
    testRetry.value = null;
    pending.value = false;
    clearFeedback();
    if (props.canRead) void load();
    else loading.value = false;
  },
  { flush: "sync" },
);

onMounted(load);
</script>

<template>
  <section
    class="integration-card"
    data-integration="telegram-team"
    aria-labelledby="telegram-operational-title"
  >
    <div class="card-heading">
      <div class="provider-mark provider-mark--telegram" aria-hidden="true">
        <i class="pi pi-send" />
      </div>
      <div class="card-title">
        <h2 id="telegram-operational-title">Telegram для команды</h2>
        <p>
          Отправляет новые предложения Lola в служебный чат команды и не пишет
          пользователям продукта.
        </p>
      </div>
      <span class="status" :data-status="statusView.tone">
        {{ statusView.label }}
      </span>
    </div>

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="success" class="feedback success" role="status" aria-live="polite">
      {{ success }}
    </p>
    <p v-if="loading" aria-live="polite">Загружаем служебный Telegram…</p>

    <template v-else-if="destination">
      <dl class="facts">
        <div>
          <dt>Бот</dt>
          <dd>@{{ destination.botUsername ?? "—" }}</dd>
        </div>
        <div data-field="telegram-bot-id">
          <dt>ID бота в Telegram</dt>
          <dd>
            <code>{{ destination.telegramBotId ?? "—" }}</code>
          </dd>
        </div>
        <div>
          <dt>Чат</dt>
          <dd>{{ destination.destinationTitle ?? "Не привязан" }}</dd>
        </div>
        <div>
          <dt>Идентификатор секрета</dt>
          <dd>
            <code>{{ destination.credentialFingerprint }}</code>
          </dd>
        </div>
        <div>
          <dt>Последняя проверка</dt>
          <dd>{{ formatTimestamp(destination.lastSuccessfulTestAt) }}</dd>
        </div>
        <div data-field="telegram-last-failure">
          <dt>Последняя ошибка</dt>
          <dd>{{ failureLabel(destination.lastFailureCategory) }}</dd>
        </div>
        <div data-field="telegram-updated-by">
          <dt>Последнее изменение</dt>
          <dd>
            {{
              formatAuditActor(
                destination.updatedByActorType,
                destination.updatedByActorId,
              )
            }}
          </dd>
        </div>
        <div data-field="telegram-updated-at">
          <dt>Время изменения</dt>
          <dd>{{ formatTimestamp(destination.updatedAt) }}</dd>
        </div>
      </dl>

      <div
        v-if="challenge && setupReady && !isBound"
        class="binding"
        data-state="binding-challenge"
      >
        <strong>Привязка чата</strong>
        <p>
          Добавьте @{{ challenge.botUsername }} в нужный чат и отправьте
          команду:
        </p>
        <code>{{ challenge.command }}</code>
        <small
          >Команда одноразовая и действует до
          {{
            new Date(challenge.expiresAt).toLocaleTimeString("ru-RU")
          }}.</small
        >
      </div>

      <div
        v-if="!setupReady && destination.status !== 'INVALID'"
        class="binding"
        data-state="webhook-setup"
        role="status"
      >
        <strong>Регистрируем защищённый webhook</strong>
        <p>
          Настройка выполняется в фоне и безопасно повторится при временной
          ошибке Telegram. Token повторно вводить не нужно.
        </p>
      </div>

      <div v-if="canManage" class="actions">
        <button
          v-if="setupReady && !isBound"
          type="button"
          data-action="telegram-new-challenge"
          :disabled="pending"
          @click="createChallenge"
        >
          {{
            challenge ? "Выпустить новую команду" : "Получить команду привязки"
          }}
        </button>
        <button
          v-if="!isBound"
          type="button"
          class="secondary"
          data-action="telegram-refresh-binding"
          :disabled="pending"
          @click="refreshBinding"
        >
          {{ setupReady ? "Проверить привязку" : "Обновить статус" }}
        </button>
        <button
          v-if="isBound && !readyToActivate"
          type="button"
          data-action="telegram-test"
          :disabled="pending"
          @click="testCurrent"
        >
          Проверить подключение
        </button>
        <button
          v-if="readyToActivate"
          type="button"
          data-action="telegram-activate"
          :disabled="pending"
          @click="updateStatus('ACTIVE')"
        >
          Активировать
        </button>
        <button
          v-if="destination.status === 'ACTIVE'"
          type="button"
          class="secondary"
          data-action="telegram-disable"
          :disabled="pending"
          @click="updateStatus('DISABLED')"
        >
          Отключить
        </button>
      </div>

      <form
        v-if="canManage"
        class="secret-form secret-form--single"
        data-form="rotate-telegram"
        @submit.prevent="rotate"
      >
        <label class="integration-field" for="telegram-token-rotate">
          <span>Новый токен бота</span>
          <input
            id="telegram-token-rotate"
            v-model="botToken"
            name="telegramBotToken"
            type="password"
            autocomplete="off"
            placeholder="123456789:AA…"
            :disabled="pending"
          />
        </label>
        <small
          >После замены бот и чат будут проверены заново. Токен очистится сразу
          после отправки.</small
        >
        <div class="form-actions">
          <button
            type="submit"
            class="secondary"
            :disabled="pending || !botToken.trim()"
          >
            Заменить токен
          </button>
        </div>
      </form>
    </template>

    <form
      v-else-if="canManage"
      class="secret-form"
      data-form="create-telegram"
      @submit.prevent="create"
    >
      <label class="integration-field" for="telegram-name">
        <span>Название подключения</span>
        <input
          id="telegram-name"
          v-model="displayName"
          name="telegramDisplayName"
          maxlength="120"
          placeholder="Например, служебные уведомления"
        />
      </label>
      <label class="integration-field" for="telegram-token-create">
        <span>Токен бота</span>
        <input
          id="telegram-token-create"
          v-model="botToken"
          name="telegramBotToken"
          type="password"
          autocomplete="off"
          placeholder="123456789:AA…"
          :disabled="pending"
        />
      </label>
      <small
        >Скопируйте токен из BotFather. Lola проверит бота и выдаст команду
        привязки чата.</small
      >
      <div class="form-actions">
        <button
          type="submit"
          :disabled="pending || !displayName.trim() || !botToken.trim()"
        >
          Подключить и проверить
        </button>
      </div>
    </form>

    <p v-else class="read-only-note">
      У вас есть доступ только для просмотра интеграций.
    </p>
  </section>
</template>

<style scoped>
.binding {
  padding: 13px;
}
.binding {
  display: grid;
  gap: 8px;
}
.binding p,
.binding small {
  margin: 0;
  color: var(--text-secondary);
}
.binding code {
  width: fit-content;
  max-width: 100%;
  padding: 8px 10px;
  overflow-wrap: anywhere;
  border-radius: 8px;
  background: var(--surface-card);
}
</style>
