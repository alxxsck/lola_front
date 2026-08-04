<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Select from "primevue/select";
import type { IntegrationConnectionResponseDto } from "@/shared/api/generated/models";
import { integrationRegionOptions } from "@/features/integrations/provider-ui";
import {
  integrationInboundConnectionsApi,
  type InboundIntegrationProvider,
  type InboundSetupReceipt,
} from "./integration-inbound-connections.api";

const props = defineProps<{
  projectId: string;
  provider: InboundIntegrationProvider;
  canRead: boolean;
  canManage: boolean;
}>();

const providerUi = computed(() =>
  props.provider === "AMPLITUDE"
    ? {
        slug: "amplitude",
        title: "Amplitude",
        header: "x-lola-amplitude-secret",
        warning:
          "Amplitude API Call не подписывает webhook: секретный заголовок Lola обязателен.",
      }
    : {
        slug: "customer-io",
        title: "Customer.io",
        header: "X-Signature",
        warning:
          "Customer.io должен подписывать исходные байты тела HMAC-SHA1 в X-Signature.",
      },
);

const connections = ref<IntegrationConnectionResponseDto[]>([]);
const loading = ref(false);
const pending = ref(false);
const error = ref("");
const notice = ref("");
const displayName = ref("");
const region = ref<"US" | "EU">("EU");
const remoteProjectLabel = ref("");
const overlapSeconds = ref(300);
const oneTimeReceipt = ref<InboundSetupReceipt | null>(null);
const commandKeys = new Map<string, string>();
let loadEpoch = 0;
let mutationEpoch = 0;

const inboundConnections = computed(() =>
  connections.value.filter(
    (connection) =>
      connection.projectId === props.projectId &&
      connection.provider === props.provider &&
      connection.inboundEnabled &&
      connection.lifecycle !== "ARCHIVED",
  ),
);

function lifecycleLabel(value: string): string {
  return (
    {
      DRAFT: "Черновик",
      PENDING_TEST: "Ожидает проверки",
      ACTIVE: "Активно",
      PAUSED: "Приостановлено",
      ARCHIVED: "В архиве",
    }[value] ?? value
  );
}

function oneTimeSecret(receipt: InboundSetupReceipt): string | null {
  return "secret" in receipt && receipt.replayed === false
    ? receipt.secret
    : null;
}

function endpointPath(receipt: InboundSetupReceipt): string | null {
  return "endpointPath" in receipt ? receipt.endpointPath : null;
}

function headerName(receipt: InboundSetupReceipt): string {
  return "headerName" in receipt ? receipt.headerName : providerUi.value.header;
}

function commandKey(signature: string): string {
  const existing = commandKeys.get(signature);
  if (existing) return existing;
  const key = crypto.randomUUID();
  commandKeys.set(signature, key);
  return key;
}

function payloadTemplate(
  receipt: InboundSetupReceipt,
): Record<string, unknown> | null {
  return "payloadTemplate" in receipt ? receipt.payloadTemplate : null;
}

function signatureAlgorithm(receipt: InboundSetupReceipt): string | null {
  return "signatureAlgorithm" in receipt ? receipt.signatureAlgorithm : null;
}

async function load(): Promise<void> {
  const epoch = ++loadEpoch;
  connections.value = [];
  if (!props.projectId || !props.canRead) return;
  loading.value = true;
  error.value = "";
  try {
    const response = await integrationInboundConnectionsApi.list(
      props.projectId,
    );
    if (epoch === loadEpoch) connections.value = response.items;
  } catch {
    if (epoch === loadEpoch)
      error.value = "Не удалось загрузить входящие подключения.";
  } finally {
    if (epoch === loadEpoch) loading.value = false;
  }
}

async function create(): Promise<void> {
  const projectId = props.projectId;
  const operationEpoch = mutationEpoch;
  const name = displayName.value.trim();
  if (!props.canManage || !name || pending.value) return;
  pending.value = true;
  error.value = "";
  notice.value = "";
  oneTimeReceipt.value = null;
  const signature = `create:${props.provider}:${name}:${region.value}:${remoteProjectLabel.value.trim()}`;
  try {
    await integrationInboundConnectionsApi.create(
      props.provider,
      projectId,
      {
        displayName: name,
        region: region.value,
        ...(remoteProjectLabel.value.trim()
          ? { remoteProjectLabel: remoteProjectLabel.value.trim() }
          : {}),
      },
      commandKey(signature),
    );
    if (
      projectId !== props.projectId ||
      !props.canManage ||
      operationEpoch !== mutationEpoch
    )
      return;
    notice.value = "Черновик подключения создан. Теперь настройте webhook.";
    commandKeys.delete(signature);
    displayName.value = "";
    remoteProjectLabel.value = "";
    await load();
  } catch {
    if (projectId === props.projectId)
      error.value = "Не удалось создать черновик входящего подключения.";
  } finally {
    pending.value = false;
  }
}

async function configure(
  connection: IntegrationConnectionResponseDto,
  operation: "SETUP" | "ROTATE",
): Promise<void> {
  if (!props.canManage || pending.value) return;
  const projectId = props.projectId;
  const operationEpoch = mutationEpoch;
  pending.value = true;
  error.value = "";
  notice.value = "";
  oneTimeReceipt.value = null;
  const signature = `${operation.toLowerCase()}:${props.provider}:${connection.id}:${connection.version}:${operation === "ROTATE" ? overlapSeconds.value : 0}`;
  try {
    const receipt =
      operation === "SETUP"
        ? await integrationInboundConnectionsApi.setup(
            props.provider,
            projectId,
            connection.id,
            connection.version,
            commandKey(signature),
          )
        : await integrationInboundConnectionsApi.rotate(
            props.provider,
            projectId,
            connection.id,
            connection.version,
            overlapSeconds.value,
            commandKey(signature),
          );
    if (
      projectId !== props.projectId ||
      !props.canManage ||
      operationEpoch !== mutationEpoch
    )
      return;
    oneTimeReceipt.value = receipt;
    commandKeys.delete(signature);
    notice.value = oneTimeSecret(receipt)
      ? "Сохраните секрет сейчас: после закрытия он больше не отображается."
      : "Команда уже была выполнена. Секрет не возвращается при повторе; при утрате замените его ещё раз.";
    await load();
  } catch {
    if (projectId === props.projectId)
      error.value =
        "Не удалось настроить входящий webhook. Обновите данные и повторите.";
  } finally {
    pending.value = false;
  }
}

async function activate(
  connection: IntegrationConnectionResponseDto,
): Promise<void> {
  if (!props.canManage || pending.value || !connection.inbound.configured)
    return;
  const projectId = props.projectId;
  const operationEpoch = mutationEpoch;
  const signature = `activate:${connection.id}:${connection.version}`;
  pending.value = true;
  try {
    await integrationInboundConnectionsApi.activate(
      projectId,
      connection.id,
      connection.version,
      commandKey(signature),
    );
    if (
      projectId === props.projectId &&
      props.canManage &&
      operationEpoch === mutationEpoch
    ) {
      notice.value = "Входящее подключение активировано.";
      commandKeys.delete(signature);
      await load();
    }
  } catch {
    if (projectId === props.projectId)
      error.value = "Не удалось активировать подключение.";
  } finally {
    pending.value = false;
  }
}

watch(
  () =>
    [props.projectId, props.provider, props.canRead, props.canManage] as const,
  () => {
    mutationEpoch += 1;
    oneTimeReceipt.value = null;
    commandKeys.clear();
    notice.value = "";
    void load();
  },
);
onMounted(() => void load());
</script>

<template>
  <section
    class="integration-card inbound-connections-card"
    :data-inbound-connections="providerUi.slug"
  >
    <div class="card-heading">
      <div>
        <h2>Приём событий из {{ providerUi.title }}</h2>
        <p>
          Шаг 1. Создайте защищённую точку приёма, затем перенесите выданные
          настройки в {{ providerUi.title }}.
        </p>
      </div>
      <span
        class="status"
        :data-status="inboundConnections.length ? 'ACTIVE' : 'EMPTY'"
      >
        {{
          inboundConnections.length
            ? `Подключений: ${inboundConnections.length}`
            : "Не настроено"
        }}
      </span>
    </div>

    <p class="field-help">{{ providerUi.warning }}</p>

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>

    <article
      v-if="oneTimeReceipt && canManage"
      class="one-time-secret"
      aria-live="polite"
    >
      <h3>Одноразовые настройки webhook</h3>
      <dl class="integration-facts">
        <div v-if="endpointPath(oneTimeReceipt)">
          <dt>Адрес приёма</dt>
          <dd>
            <code>{{ endpointPath(oneTimeReceipt) }}</code>
          </dd>
        </div>
        <div>
          <dt>Заголовок запроса</dt>
          <dd>
            <code>{{ headerName(oneTimeReceipt) }}</code>
          </dd>
        </div>
        <div v-if="oneTimeSecret(oneTimeReceipt)">
          <dt>Секрет</dt>
          <dd>
            <code data-testid="inbound-one-time-secret">{{
              oneTimeSecret(oneTimeReceipt)
            }}</code>
          </dd>
        </div>
        <div>
          <dt>Идентификатор секрета</dt>
          <dd>
            <code>{{ oneTimeReceipt.credentialFingerprint }}</code>
          </dd>
        </div>
        <div v-if="signatureAlgorithm(oneTimeReceipt)">
          <dt>Подпись</dt>
          <dd>
            <code>{{ signatureAlgorithm(oneTimeReceipt) }}</code>
          </dd>
        </div>
      </dl>
      <div v-if="payloadTemplate(oneTimeReceipt)" class="payload-template">
        <h4>Рекомендуемый шаблон тела запроса</h4>
        <pre><code>{{ JSON.stringify(payloadTemplate(oneTimeReceipt), null, 2) }}</code></pre>
      </div>
      <button type="button" class="secondary" @click="oneTimeReceipt = null">
        Я сохранил, скрыть
      </button>
    </article>

    <p v-if="loading" class="empty-state">Загружаем входящие подключения…</p>
    <div v-else class="provider-connections">
      <article
        v-for="connection in inboundConnections"
        :key="connection.id"
        class="provider-connection"
        :data-inbound-connection-id="connection.id"
      >
        <div class="provider-connection__heading">
          <h3>{{ connection.displayName }}</h3>
          <span class="status" :data-status="connection.lifecycle">{{
            lifecycleLabel(connection.lifecycle)
          }}</span>
        </div>
        <dl class="integration-facts">
          <div>
            <dt>Регион</dt>
            <dd>{{ connection.region }}</dd>
          </div>
          <div>
            <dt>Webhook</dt>
            <dd>
              {{
                connection.inbound.configured
                  ? "Настроен"
                  : "Webhook ещё не настроен"
              }}
            </dd>
          </div>
          <div>
            <dt>Готовность к приёму</dt>
            <dd>
              {{ connection.inbound.admissionReady ? "Готов" : "Не готов" }}
            </dd>
          </div>
          <div>
            <dt>Идентификатор секрета</dt>
            <dd>
              <code>{{ connection.inbound.credentialFingerprint ?? "—" }}</code>
            </dd>
          </div>
          <div>
            <dt>Версия секрета</dt>
            <dd>{{ connection.inbound.credentialRevision ?? "—" }}</dd>
          </div>
          <div>
            <dt>Старый секрет действует до</dt>
            <dd>{{ connection.inbound.overlapEndsAt ?? "—" }}</dd>
          </div>
        </dl>
        <div v-if="canManage" class="actions">
          <button
            v-if="!connection.inbound.configured"
            type="button"
            :data-action="`setup-inbound-${providerUi.slug}`"
            :disabled="pending"
            @click="configure(connection, 'SETUP')"
          >
            Настроить webhook
          </button>
          <button
            v-else
            type="button"
            class="secondary"
            :data-action="`rotate-inbound-${providerUi.slug}`"
            :disabled="pending"
            @click="configure(connection, 'ROTATE')"
          >
            Заменить секрет
          </button>
          <label v-if="connection.inbound.configured" class="overlap-field">
            <span>Переходный период, секунд</span>
            <input
              v-model.number="overlapSeconds"
              type="number"
              min="0"
              max="3600"
            />
          </label>
          <button
            v-if="
              connection.lifecycle !== 'ACTIVE' && connection.inbound.configured
            "
            type="button"
            :disabled="pending"
            @click="activate(connection)"
          >
            Активировать
          </button>
        </div>
      </article>
    </div>

    <form
      v-if="canManage"
      class="secret-form provider-create-form"
      :data-form="`create-inbound-${providerUi.slug}`"
      @submit.prevent="create"
    >
      <div class="form-intro">
        <span class="setup-step">Шаг 1</span>
        <div>
          <h3>Новое входящее подключение</h3>
          <p>
            После создания Lola покажет адрес webhook и секрет только один раз.
            Сохраните их сразу.
          </p>
        </div>
      </div>
      <label class="integration-field">
        <span>Название в Lola</span>
        <input
          v-model="displayName"
          name="inboundDisplayName"
          maxlength="120"
          required
        />
        <small>Например, «Customer.io — продакшен».</small>
      </label>
      <label class="integration-field">
        <span>Где хранятся данные</span>
        <Select
          v-model="region"
          :options="integrationRegionOptions"
          option-label="label"
          option-value="value"
          fluid
        />
        <small>
          Выберите регион проекта {{ providerUi.title }}, из которого будут
          приходить события.
        </small>
      </label>
      <label class="integration-field">
        <span>Проект в {{ providerUi.title }} (необязательно)</span>
        <input v-model="remoteProjectLabel" maxlength="120" />
        <small>
          Справочная подпись внешнего проекта или рабочего пространства. На
          обработку не влияет.
        </small>
      </label>
      <div class="form-actions">
        <button type="submit" :disabled="pending || !displayName.trim()">
          Создать черновик
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.inbound-connections-card,
.provider-connections,
.provider-connection,
.one-time-secret {
  display: grid;
  gap: 14px;
}
.card-heading,
.provider-connection__heading,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.one-time-secret {
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.one-time-secret code {
  overflow-wrap: anywhere;
}
.payload-template pre {
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
}
.overlap-field {
  display: grid;
  gap: 4px;
}
@media (max-width: 700px) {
  .card-heading,
  .provider-connection__heading,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
