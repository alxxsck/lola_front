<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { notificationDestinationsApi } from "./notification-destinations.api";
import type {
  NotificationDestinationResponseDto,
  TelegramBindingChallengeResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

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

const statusLabel = computed(() => {
  if (!destination.value) return "Не подключено";
  if (destination.value.status === "ACTIVE") return "Подключено";
  if (destination.value.status === "DISABLED") return "Отключено";
  if (destination.value.status === "INVALID")
    return "Требуется переподключение";
  if (destination.value.telegramWebhookSetupStatus === "FAILED")
    return "Webhook не подключён";
  if (destination.value.telegramWebhookSetupStatus !== "SUCCEEDED")
    return "Регистрируем webhook";
  if (destination.value.telegramInstallationStatus === "PENDING_BINDING")
    return "Ожидает привязки чата";
  return "Требуется проверка";
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

function actorLabel(type: string, id: string): string {
  const kind =
    type === "CMS_USER"
      ? "Пользователь"
      : type === "BREAK_GLASS"
        ? "Аварийный оператор"
        : type === "SYSTEM"
          ? "Система"
          : "Оператор";
  return `${kind} · ${id}`;
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
    aria-labelledby="telegram-operational-title"
  >
    <div class="card-heading">
      <div class="provider-mark" aria-hidden="true">T</div>
      <div>
        <h2 id="telegram-operational-title">
          Telegram · Служебные уведомления
        </h2>
        <p>
          Предложения Lola для команды проекта. Этот бот не пишет пользователям
          продукта и не создаёт пользовательские Telegram-связи.
        </p>
      </div>
      <span class="status" :data-status="destination?.status ?? 'EMPTY'">{{
        statusLabel
      }}</span>
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
          <dt>Telegram bot ID</dt>
          <dd>
            <code>{{ destination.telegramBotId ?? "—" }}</code>
          </dd>
        </div>
        <div>
          <dt>Чат</dt>
          <dd>{{ destination.destinationTitle ?? "Не привязан" }}</dd>
        </div>
        <div>
          <dt>Credential fingerprint</dt>
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
              actorLabel(
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
        class="secret-form"
        data-form="rotate-telegram"
        @submit.prevent="rotate"
      >
        <label for="telegram-token-rotate">Новый bot token</label>
        <input
          id="telegram-token-rotate"
          v-model="botToken"
          name="telegramBotToken"
          type="password"
          autocomplete="off"
          :disabled="pending"
        />
        <small
          >Token write-only. При замене бот и чат проверяются заново.</small
        >
        <button
          type="submit"
          class="secondary"
          :disabled="pending || !botToken.trim()"
        >
          Заменить token
        </button>
      </form>
    </template>

    <form
      v-else-if="canManage"
      class="secret-form"
      data-form="create-telegram"
      @submit.prevent="create"
    >
      <label for="telegram-name">Название служебного подключения</label>
      <input
        id="telegram-name"
        v-model="displayName"
        name="telegramDisplayName"
        maxlength="120"
      />
      <label for="telegram-token-create">Bot token от BotFather</label>
      <input
        id="telegram-token-create"
        v-model="botToken"
        name="telegramBotToken"
        type="password"
        autocomplete="off"
        :disabled="pending"
      />
      <small
        >Lola проверит бота, зашифрует token и выдаст одноразовую команду
        привязки чата.</small
      >
      <button
        type="submit"
        :disabled="pending || !displayName.trim() || !botToken.trim()"
      >
        Проверить бота
      </button>
    </form>

    <p v-else class="read-only-note">
      У вас есть доступ только для просмотра интеграций.
    </p>
  </section>
</template>

<style scoped>
.integration-card {
  display: grid;
  gap: 22px;
  padding: 24px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}
.card-heading {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
}
.card-heading h2 {
  margin: 0 0 5px;
}
.card-heading p {
  margin: 0;
  color: var(--text-secondary);
}
.provider-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--status-info);
  color: var(--on-status-info);
  font-weight: 800;
}
.status {
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 650;
}
.status[data-status="ACTIVE"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.status[data-status="INVALID"] {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.facts > div,
.binding {
  padding: 13px;
  border-radius: 12px;
  background: var(--surface-ground);
}
.facts dt {
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.facts dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
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
.actions,
.secret-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
}
.secret-form {
  display: grid;
  grid-template-columns: minmax(180px, 0.55fr) minmax(260px, 1fr) auto;
  padding-top: 18px;
  border-top: 1px solid var(--border-default);
}
.secret-form label {
  font-size: 0.82rem;
  font-weight: 650;
}
.secret-form input {
  width: 100%;
  min-height: 42px;
  padding: 9px 11px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-ground);
  color: var(--text-primary);
}
.secret-form small {
  grid-column: 1 / -1;
  color: var(--text-secondary);
}
button {
  min-height: 40px;
  padding: 9px 14px;
  border: 0;
  border-radius: 10px;
  background: var(--primary-color);
  color: var(--primary-contrast-color);
  cursor: pointer;
  font-weight: 650;
}
button.secondary {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-primary);
}
button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.feedback {
  padding: 12px 14px;
  border-radius: 12px;
}
.feedback.error {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.feedback.success {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.read-only-note {
  color: var(--text-secondary);
}
@media (max-width: 760px) {
  .card-heading,
  .facts,
  .secret-form {
    grid-template-columns: 1fr;
  }
  .status {
    justify-self: start;
  }
}
</style>
