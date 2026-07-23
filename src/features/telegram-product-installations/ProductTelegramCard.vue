<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  TelegramChannelHealthStatus,
  TelegramChannelInstallationResponseDto,
  TelegramChannelSetupStatus,
  TelegramChannelTestResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { formatAuditActor } from "@/shared/lib/format";
import { telegramProductInstallationsApi } from "./telegram-product-installations.api";

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canManage: boolean;
}>();
const emit = defineEmits<{
  "fresh-login-requested": [];
}>();

const installation = ref<TelegramChannelInstallationResponseDto | null>(null);
const loading = ref(true);
const pending = ref(false);
const loadError = ref("");
const actionError = ref("");
const success = ref("");
const botToken = ref("");
const createRetryKey = ref("");
const testRetry = ref<{ signature: string; key: string } | null>(null);
const broadcastsRetry = ref<{ signature: string; key: string } | null>(null);
const freshAuthRequired = ref(false);
let epoch = 0;
let disposed = false;
let loadRequest = 0;
const pollWaits = new Set<{
  timer: number;
  resolve: () => void;
}>();

type Operation = { projectId: string; epoch: number };

const statusView = computed(() => {
  const current = installation.value;
  if (!current) return { label: "Не подключено", tone: "EMPTY" };
  if (current.status === "DISABLED")
    return { label: "Отключено", tone: "DISABLED" };
  if (current.status === "INVALID")
    return { label: "Требуется переподключение", tone: "INVALID" };
  if (current.webhookSetupStatus === "FAILED")
    return { label: "Webhook не подключён", tone: "FAILED" };
  if (current.webhookSetupStatus !== "SUCCEEDED")
    return { label: "Регистрируем webhook", tone: "PROCESSING" };
  return current.status === "ACTIVE"
    ? { label: "Подключено", tone: "ACTIVE" }
    : { label: "Настраивается", tone: "PENDING_SETUP" };
});
const broadcastsReady = computed(
  () =>
    installation.value?.status === "ACTIVE" &&
    installation.value.webhookSetupStatus === "SUCCEEDED",
);

function beginOperation(): Operation | null {
  return props.projectId ? { projectId: props.projectId, epoch } : null;
}

function isCurrent(operation: Operation): boolean {
  return (
    !disposed &&
    operation.epoch === epoch &&
    operation.projectId === props.projectId &&
    props.canRead
  );
}

function waitForPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const wait = {
      timer: window.setTimeout(() => {
        pollWaits.delete(wait);
        resolve();
      }, delayMs),
      resolve,
    };
    pollWaits.add(wait);
  });
}

function cancelPollWaits(): void {
  for (const wait of pollWaits) {
    window.clearTimeout(wait.timer);
    wait.resolve();
  }
  pollWaits.clear();
}

function belongsToOperation(
  operation: Operation,
  value: TelegramChannelInstallationResponseDto,
): boolean {
  return isCurrent(operation) && value.projectId === operation.projectId;
}

function clearFeedback(): void {
  actionError.value = "";
  success.value = "";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "—"
    : timestamp.toLocaleString("ru-RU");
}

function failureLabel(code: string | null | undefined): string {
  switch (code) {
    case null:
    case undefined:
      return "Нет";
    case "TELEGRAM_BOT_TOKEN_INVALID":
      return "Token бота недействителен";
    case "TELEGRAM_BOT_IDENTITY_CHANGED":
      return "Telegram вернул другого бота";
    case "TELEGRAM_CHANNEL_TEST_LEASE_EXPIRED":
      return "Проверка не завершилась вовремя";
    case "TELEGRAM_CHANNEL_SECRET_UNAVAILABLE":
      return "Credential недоступен";
    case "TELEGRAM_CHANNEL_DISABLED":
      return "Отключено администратором";
    default:
      return "Подключение требует проверки";
  }
}

function webhookSetupLabel(status: TelegramChannelSetupStatus): string {
  switch (status) {
    case "SUCCEEDED":
      return "Подключён";
    case "FAILED":
      return "Ошибка настройки";
    case "PENDING":
    case "PROCESSING":
    case "RETRY_WAIT":
      return "Настраивается";
  }
}

function healthLabel(status: TelegramChannelHealthStatus): string {
  switch (status) {
    case "HEALTHY":
      return "Работает";
    case "UNHEALTHY":
      return "Недоступен";
    case "NOT_TESTED":
      return "Не проверен";
  }
}

function terminalTest(result: TelegramChannelTestResponseDto): boolean {
  return result.status === "SUCCEEDED" || result.status === "FAILED";
}

function setupPending(value: TelegramChannelInstallationResponseDto): boolean {
  return (
    value.webhookSetupStatus === "PENDING" ||
    value.webhookSetupStatus === "PROCESSING" ||
    value.webhookSetupStatus === "RETRY_WAIT"
  );
}

function durableTestKey(id: string, version: number): string {
  const signature = `${id}:${version}`;
  if (testRetry.value?.signature === signature) return testRetry.value.key;
  const key = crypto.randomUUID();
  testRetry.value = { signature, key };
  return key;
}

function durableBroadcastsKey(
  current: TelegramChannelInstallationResponseDto,
  enabled: boolean,
): string {
  const signature = `${current.id}:${current.broadcastsVersion}:${enabled}`;
  if (broadcastsRetry.value?.signature === signature)
    return broadcastsRetry.value.key;
  const key = crypto.randomUUID();
  broadcastsRetry.value = { signature, key };
  return key;
}

async function awaitWebhookSetup(
  operation: Operation,
  initial: TelegramChannelInstallationResponseDto,
): Promise<TelegramChannelInstallationResponseDto> {
  let latest = initial;
  for (let attempt = 0; attempt < 20 && setupPending(latest); attempt += 1) {
    await waitForPoll(500);
    if (!isCurrent(operation)) return latest;
    const loaded = await telegramProductInstallationsApi.get(
      operation.projectId,
    );
    if (!isCurrent(operation)) return latest;
    if (!loaded || loaded.projectId !== operation.projectId) continue;
    latest = loaded;
    installation.value = loaded;
  }
  return latest;
}

async function load(): Promise<void> {
  const request = ++loadRequest;
  const operation = beginOperation();
  if (!operation || !props.canRead) {
    if (request === loadRequest) {
      installation.value = null;
      loading.value = false;
      loadError.value = "";
    }
    return;
  }
  loading.value = true;
  loadError.value = "";
  try {
    const loaded = await telegramProductInstallationsApi.get(
      operation.projectId,
    );
    if (request !== loadRequest || !isCurrent(operation)) return;
    if (loaded && loaded.projectId !== operation.projectId) return;
    installation.value = loaded;
  } catch {
    if (request === loadRequest && isCurrent(operation)) {
      installation.value = null;
      loadError.value = "Не удалось загрузить пользовательский Telegram.";
    }
  } finally {
    if (request === loadRequest && isCurrent(operation)) loading.value = false;
  }
}

async function create(): Promise<void> {
  const operation = beginOperation();
  const token = botToken.value.trim();
  if (!operation || !props.canManage || pending.value) return;
  if (!token) {
    actionError.value = "Укажите token Telegram-бота.";
    return;
  }
  clearFeedback();
  loadError.value = "";
  pending.value = true;
  botToken.value = "";
  let needsRefresh = true;
  try {
    const key = createRetryKey.value || crypto.randomUUID();
    createRetryKey.value = key;
    const created = await telegramProductInstallationsApi.create(
      operation.projectId,
      { botToken: token },
      key,
    );
    if (!belongsToOperation(operation, created)) return;
    createRetryKey.value = "";
    installation.value = created;
    const settled = await awaitWebhookSetup(operation, created);
    if (!belongsToOperation(operation, settled)) return;
    installation.value = settled;
    needsRefresh = false;
    if (settled.webhookSetupStatus === "FAILED") {
      actionError.value = failureLabel(settled.webhookSetupErrorCode);
    } else if (setupPending(settled)) {
      success.value =
        "Настройка webhook продолжается в фоне. Обновите статус позже.";
    } else {
      success.value = "Бот и защищённый webhook подключены.";
    }
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) {
      botToken.value = "";
      if (needsRefresh) await load();
      if (isCurrent(operation)) pending.value = false;
    }
  }
}

async function rotate(): Promise<void> {
  const current = installation.value;
  const operation = beginOperation();
  const token = botToken.value.trim();
  if (
    !current ||
    !operation ||
    !belongsToOperation(operation, current) ||
    !props.canManage ||
    pending.value ||
    !token
  )
    return;
  if (
    !window.confirm(
      `Заменить product bot @${current.botUsername}? Подключение другого бота разорвёт активные связи ${current.linkedUserCount} пользователей.`,
    )
  )
    return;
  clearFeedback();
  pending.value = true;
  botToken.value = "";
  let needsRefresh = true;
  try {
    const rotated = await telegramProductInstallationsApi.rotate(
      operation.projectId,
      { botToken: token, expectedVersion: current.version },
    );
    if (!belongsToOperation(operation, rotated)) return;
    installation.value = rotated;
    testRetry.value = null;
    const settled = await awaitWebhookSetup(operation, rotated);
    if (!belongsToOperation(operation, settled)) return;
    installation.value = settled;
    needsRefresh = false;
    if (settled.webhookSetupStatus === "FAILED") {
      actionError.value = failureLabel(settled.webhookSetupErrorCode);
    } else if (setupPending(settled)) {
      success.value =
        "Новый token сохранён. Настройка webhook продолжается в фоне.";
    } else {
      success.value = "Token и защищённый webhook обновлены.";
    }
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) {
      botToken.value = "";
      if (needsRefresh) await load();
      if (isCurrent(operation)) pending.value = false;
    }
  }
}

async function awaitTest(
  operation: Operation,
  current: TelegramChannelInstallationResponseDto,
  key: string,
): Promise<TelegramChannelTestResponseDto> {
  let result = await telegramProductInstallationsApi.test(
    operation.projectId,
    current.id,
    { expectedVersion: current.version },
    key,
  );
  for (let attempt = 0; attempt < 20 && !terminalTest(result); attempt += 1) {
    await waitForPoll(500);
    if (!isCurrent(operation)) return result;
    result = await telegramProductInstallationsApi.test(
      operation.projectId,
      current.id,
      { expectedVersion: current.version },
      key,
    );
  }
  return result;
}

async function testCurrent(): Promise<void> {
  const current = installation.value;
  const operation = beginOperation();
  if (
    !current ||
    !operation ||
    !belongsToOperation(operation, current) ||
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
    if (terminalTest(result)) testRetry.value = null;
    if (result.status === "SUCCEEDED") {
      success.value = "Telegram подтвердил bot identity.";
    } else if (
      result.status === "PENDING" ||
      result.status === "PROCESSING" ||
      result.status === "RETRY_WAIT"
    ) {
      success.value =
        "Проверка ещё выполняется. Повторите действие, чтобы обновить статус.";
    } else {
      actionError.value = failureLabel(result.errorCode);
    }
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) {
      await load();
      if (isCurrent(operation)) pending.value = false;
    }
  }
}

async function disable(): Promise<void> {
  const current = installation.value;
  const operation = beginOperation();
  if (
    !current ||
    !operation ||
    !belongsToOperation(operation, current) ||
    !props.canManage ||
    pending.value ||
    !window.confirm(
      `Отключить product bot @${current.botUsername}? Будут разорваны активные связи ${current.linkedUserCount} пользователей.`,
    )
  )
    return;
  clearFeedback();
  pending.value = true;
  try {
    const disabled = await telegramProductInstallationsApi.disable(
      operation.projectId,
      { expectedVersion: current.version },
    );
    if (!belongsToOperation(operation, disabled)) return;
    installation.value = disabled;
    testRetry.value = null;
    success.value = "Пользовательский Telegram отключён.";
  } catch (cause) {
    if (isCurrent(operation)) setActionFailure(cause);
  } finally {
    if (isCurrent(operation)) {
      await load();
      if (isCurrent(operation)) pending.value = false;
    }
  }
}

async function setBroadcastsEnabled(enabled: boolean): Promise<void> {
  const current = installation.value;
  const operation = beginOperation();
  if (
    !current ||
    !operation ||
    !belongsToOperation(operation, current) ||
    !props.canManage ||
    pending.value ||
    current.broadcastsEnabled === enabled ||
    (enabled && !broadcastsReady.value)
  )
    return;
  if (
    !enabled &&
    !window.confirm(
      "Отключить Telegram-рассылки? Неотправленные сообщения этой инсталляции будут остановлены.",
    )
  )
    return;

  clearFeedback();
  freshAuthRequired.value = false;
  pending.value = true;
  try {
    const updated = await telegramProductInstallationsApi.setBroadcastsEnabled(
      operation.projectId,
      {
        enabled,
        expectedVersion: current.broadcastsVersion,
      },
      durableBroadcastsKey(current, enabled),
    );
    if (!belongsToOperation(operation, updated)) return;
    installation.value = updated;
    broadcastsRetry.value = null;
    success.value = enabled
      ? "Telegram-рассылки включены."
      : "Telegram-рассылки выключены.";
  } catch (cause) {
    if (!isCurrent(operation)) return;
    const apiError = normalizeApiError(cause);
    freshAuthRequired.value =
      apiError.status === 428 ||
      apiError.code === "REAUTHENTICATION_REQUIRED" ||
      apiError.code === "MFA_REQUIRED";
    if (freshAuthRequired.value) {
      actionError.value =
        "Требуется свежий вход с MFA. Действие не повторялось.";
    } else if (apiError.code === "TELEGRAM_BROADCASTS_VERSION_CONFLICT") {
      actionError.value =
        "Настройки рассылок изменились в другой вкладке. Данные обновлены.";
      await load();
    } else if (apiError.code === "TELEGRAM_CHANNEL_NOT_READY") {
      actionError.value =
        "Сначала активируйте бота и дождитесь завершения настройки webhook.";
      await load();
    } else if (apiError.status === 403) {
      actionError.value = "Недостаточно прав для изменения интеграции.";
    } else {
      actionError.value =
        "Не удалось подтвердить изменение Telegram-рассылок. Актуальное состояние обновлено.";
      await load();
    }
  } finally {
    if (isCurrent(operation)) pending.value = false;
  }
}

function safeError(cause: unknown): string {
  const apiError = normalizeApiError(cause);
  if (apiError.code === "TELEGRAM_CHANNEL_VERSION_CONFLICT") {
    return "Настройки изменились в другой вкладке. Данные обновлены.";
  }
  if (apiError.code === "TELEGRAM_BOT_TOKEN_INVALID")
    return "Telegram отклонил token бота.";
  if (apiError.status === 403)
    return "Недостаточно прав для изменения интеграции.";
  return "Не удалось изменить пользовательский Telegram. Повторите попытку.";
}

function setActionFailure(cause: unknown): void {
  const apiError = normalizeApiError(cause);
  if (apiError.code === "TELEGRAM_CHANNEL_DISABLED") {
    actionError.value = "";
    success.value = "Пользовательский Telegram уже отключён.";
    return;
  }
  actionError.value = safeError(apiError);
}

watch(
  () => [props.projectId, props.canRead, props.canManage] as const,
  () => {
    epoch += 1;
    cancelPollWaits();
    installation.value = null;
    loading.value = props.canRead;
    pending.value = false;
    botToken.value = "";
    createRetryKey.value = "";
    testRetry.value = null;
    broadcastsRetry.value = null;
    freshAuthRequired.value = false;
    loadError.value = "";
    clearFeedback();
    if (props.canRead) void load();
  },
  { flush: "sync" },
);

onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  epoch += 1;
  cancelPollWaits();
  botToken.value = "";
  createRetryKey.value = "";
  testRetry.value = null;
  broadcastsRetry.value = null;
  freshAuthRequired.value = false;
});
</script>

<template>
  <section
    class="integration-card"
    data-integration="telegram-users"
    aria-labelledby="telegram-product-title"
  >
    <header class="card-heading">
      <div class="provider-mark provider-mark--telegram" aria-hidden="true">
        <i class="pi pi-send" />
      </div>
      <div class="card-title">
        <h2 id="telegram-product-title">Telegram для пользователей</h2>
        <p>Подключает личные сообщения и рассылки пользователям продукта.</p>
      </div>
      <span class="status" :data-status="statusView.tone">
        {{ statusView.label }}
      </span>
    </header>

    <p v-if="loadError" class="feedback error" role="alert">
      {{ loadError }}
      <button type="button" class="secondary" @click="load">Повторить</button>
    </p>
    <p v-if="actionError" class="feedback error" role="alert">
      {{ actionError }}
    </p>
    <p
      v-if="freshAuthRequired"
      class="feedback warning"
      role="status"
      aria-live="polite"
    >
      Действие не отправлялось повторно.
      <button
        type="button"
        class="secondary"
        data-action="product-telegram-broadcasts-fresh-login"
        @click="emit('fresh-login-requested')"
      >
        Войти заново
      </button>
    </p>
    <p v-if="success" class="feedback success" role="status" aria-live="polite">
      {{ success }}
    </p>
    <p v-if="loading" aria-live="polite">
      Загружаем Telegram для пользователей…
    </p>

    <template v-else-if="installation">
      <dl class="facts">
        <div>
          <dt>Бот</dt>
          <dd>@{{ installation.botUsername }}</dd>
        </div>
        <div>
          <dt>Ссылка на бота</dt>
          <dd>
            <a
              :href="installation.deepLinkBase"
              target="_blank"
              rel="noreferrer"
            >
              {{ installation.deepLinkBase }}
            </a>
          </dd>
        </div>
        <div>
          <dt>Идентификатор секрета</dt>
          <dd>
            <code>{{ installation.credentialFingerprint }}</code>
          </dd>
        </div>
        <div>
          <dt>Состояние бота</dt>
          <dd>{{ statusView.label }}</dd>
        </div>
        <div>
          <dt>Webhook</dt>
          <dd>{{ webhookSetupLabel(installation.webhookSetupStatus) }}</dd>
        </div>
        <div>
          <dt>Работоспособность</dt>
          <dd>{{ healthLabel(installation.healthStatus) }}</dd>
        </div>
        <div>
          <dt>Связанные пользователи</dt>
          <dd>{{ installation.linkedUserCount }}</dd>
        </div>
        <div>
          <dt>Последняя проверка</dt>
          <dd>{{ formatTimestamp(installation.lastTestedAt) }}</dd>
        </div>
        <div>
          <dt>Последняя ошибка</dt>
          <dd>
            {{
              failureLabel(
                installation.lastTestFailureCode ??
                  installation.webhookSetupErrorCode,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>Изменил</dt>
          <dd>
            {{
              formatAuditActor(
                installation.updatedByActorType,
                installation.updatedByActorId,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>Время изменения</dt>
          <dd>{{ formatTimestamp(installation.updatedAt) }}</dd>
        </div>
      </dl>

      <section
        class="broadcasts-settings"
        aria-labelledby="product-telegram-broadcasts-title"
      >
        <div>
          <h3 id="product-telegram-broadcasts-title">
            Доставка Telegram-рассылок
          </h3>
          <p v-if="installation.broadcastsEnabled">
            Включена. Одобренные рассылки могут отправляться пользователям с
            явным согласием.
          </p>
          <p v-else-if="broadcastsReady">
            Выключена. Одобренные рассылки не отправляются через этого бота.
          </p>
          <p v-else>
            Рассылки можно включить после активации бота и завершения настройки
            webhook.
          </p>
        </div>
        <div
          v-if="canManage"
          class="broadcast-options"
          role="group"
          aria-label="Доставка Telegram-рассылок"
        >
          <button
            type="button"
            data-action="product-telegram-broadcasts-enable"
            :aria-pressed="installation.broadcastsEnabled"
            :disabled="
              pending || installation.broadcastsEnabled || !broadcastsReady
            "
            @click="setBroadcastsEnabled(true)"
          >
            Включить
          </button>
          <button
            type="button"
            class="secondary"
            data-action="product-telegram-broadcasts-disable"
            :aria-pressed="!installation.broadcastsEnabled"
            :disabled="pending || !installation.broadcastsEnabled"
            @click="setBroadcastsEnabled(false)"
          >
            Выключить
          </button>
        </div>
        <p v-else class="read-only-note">
          Изменение требует права управления интеграциями.
        </p>
      </section>

      <div v-if="canManage" class="actions">
        <button
          type="button"
          data-action="product-telegram-test"
          :disabled="pending || installation.status === 'DISABLED'"
          @click="testCurrent"
        >
          Проверить бота
        </button>
        <button
          v-if="installation.status !== 'DISABLED'"
          type="button"
          class="secondary"
          data-action="product-telegram-disable"
          :disabled="pending"
          @click="disable"
        >
          Отключить
        </button>
      </div>

      <form
        v-if="canManage"
        class="secret-form secret-form--single"
        data-form="rotate-product-telegram"
        @submit.prevent="rotate"
      >
        <label class="integration-field" for="product-telegram-rotate-token">
          <span>Новый токен бота</span>
          <input
            id="product-telegram-rotate-token"
            v-model="botToken"
            name="productTelegramToken"
            type="password"
            autocomplete="off"
            placeholder="123456789:AA…"
            :disabled="pending"
          />
        </label>
        <small>
          Токен очистится сразу после отправки и больше не будет отображаться.
        </small>
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
      <p v-else class="read-only-note">
        У вас есть доступ только для просмотра Telegram для пользователей.
      </p>
    </template>

    <form
      v-else-if="canManage"
      class="secret-form secret-form--single"
      data-form="create-product-telegram"
      @submit.prevent="create"
    >
      <label class="integration-field" for="product-telegram-create-token">
        <span>Токен бота</span>
        <input
          id="product-telegram-create-token"
          v-model="botToken"
          name="productTelegramToken"
          type="password"
          autocomplete="off"
          placeholder="123456789:AA…"
          :disabled="pending"
        />
      </label>
      <small>
        Создайте отдельного бота через BotFather. Lola проверит и сохранит токен
        зашифрованным.
      </small>
      <div class="form-actions">
        <button type="submit" :disabled="pending || !botToken.trim()">
          Подключить бота
        </button>
      </div>
    </form>

    <p v-else class="read-only-note">
      Telegram для пользователей пока не подключён. Для настройки нужны права
      управления интеграциями.
    </p>
  </section>
</template>

<style scoped>
.broadcasts-settings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px;
}
.broadcasts-settings h3,
.broadcasts-settings p {
  margin: 0;
}
.broadcasts-settings p {
  margin-top: 5px;
  color: var(--text-secondary);
}
.broadcast-options {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
@media (max-width: 700px) {
  .broadcasts-settings {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
