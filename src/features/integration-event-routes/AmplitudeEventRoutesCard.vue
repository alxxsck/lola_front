<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  CreateAmplitudeOutboundRouteDto,
  EventDefinitionCatalogResponseDto,
  IntegrationConnectionResponseDto,
  IntegrationDispatchActivityItemDto,
  IntegrationEventRouteResponseDto,
} from "@/shared/api/generated/models";
import { integrationConnectionsApi } from "@/features/integration-connections/integration-connections.api";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { integrationEventRoutesApi } from "./integration-event-routes.api";

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canManage: boolean;
  canReadActivity: boolean;
}>();

type PendingCreate = {
  projectId: string;
  idempotencyKey: string;
  input: CreateAmplitudeOutboundRouteDto;
};

const routes = ref<IntegrationEventRouteResponseDto[]>([]);
const connections = ref<IntegrationConnectionResponseDto[]>([]);
const definitions = ref<EventDefinitionCatalogResponseDto[]>([]);
const activity = ref<IntegrationDispatchActivityItemDto[]>([]);
const loading = ref(false);
const pending = ref(false);
const error = ref("");
const notice = ref("");
const showCreate = ref(false);
const connectionId = ref("");
const definitionId = ref("");
const routeName = ref("");
const providerEventName = ref("");
function emptyFieldMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

const selectedFields = ref<Record<string, boolean>>(emptyFieldMap());
const targetKeys = ref<Record<string, string>>(emptyFieldMap());
const requiredFields = ref<Record<string, boolean>>(emptyFieldMap());
const commandKeys = new Map<string, string>();
let pendingCreate: PendingCreate | null = null;
let loadEpoch = 0;

const amplitudeConnections = computed(() =>
  connections.value.filter(
    (connection) =>
      connection.provider === "AMPLITUDE" &&
      connection.lifecycle !== "ARCHIVED",
  ),
);
const selectedDefinition = computed(() =>
  definitions.value.find((definition) => definition.id === definitionId.value),
);
type SchemaField = {
  key: string;
  path: string[];
  sensitive: boolean;
  defaultTargetKey: string;
};

type SchemaFieldCandidate = Omit<SchemaField, "defaultTargetKey">;

const MAX_PROPERTY_BINDINGS = 32;
const reservedAmplitudeKeys = new Set([
  "user_id",
  "device_id",
  "event_type",
  "event_properties",
  "time",
  "insert_id",
]);
const sourcePathSegmentPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const unsafeSourcePathSegments = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function isExportableSourcePath(path: string[]): boolean {
  return (
    path.length >= 1 &&
    path.length <= 8 &&
    path.every(
      (segment) =>
        sourcePathSegmentPattern.test(segment) &&
        !unsafeSourcePathSegments.has(segment.toLowerCase()),
    )
  );
}

function stableKeySuffix(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
}

function amplitudeTargetKey(path: string[]): string {
  const normalized = path.join("_").replace(/[^A-Za-z0-9_]/g, "_");
  const prefixed = /^[A-Za-z_]/.test(normalized)
    ? normalized
    : `field_${normalized}`;
  const safe =
    reservedAmplitudeKeys.has(prefixed) || prefixed.startsWith("lola_")
      ? `event_${prefixed}`
      : prefixed;
  return safe.slice(0, 64);
}

function assignDefaultTargetKeys(
  candidates: SchemaFieldCandidate[],
): SchemaField[] {
  const used = new Set<string>();
  return [...candidates]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((field) => {
      const base = amplitudeTargetKey(field.path);
      let target = base;
      if (used.has(target)) {
        const suffix = `_${stableKeySuffix(field.key)}`;
        target = `${base.slice(0, 64 - suffix.length)}${suffix}`;
      }
      let collision = 2;
      while (used.has(target)) {
        const suffix = `_${collision}`;
        target = `${base.slice(0, 64 - suffix.length)}${suffix}`;
        collision += 1;
      }
      used.add(target);
      return { ...field, defaultTargetKey: target };
    });
}

function collectScalarSchemaFields(
  schema: unknown,
  path: string[] = [],
  inheritedSensitive = false,
  output: SchemaFieldCandidate[] = [],
): SchemaFieldCandidate[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return output;
  if (path.length > 0 && !isExportableSourcePath(path)) return output;
  const node = schema as Record<string, unknown>;
  const sensitive = inheritedSensitive || node["x-lola-sensitive"] === true;
  const declaredTypes = Array.isArray(node.type) ? node.type : [node.type];
  const scalar =
    path.length > 0 &&
    declaredTypes.some((type) =>
      ["string", "number", "integer", "boolean", "null"].includes(String(type)),
    ) &&
    declaredTypes.every((type) => !["object", "array"].includes(String(type)));
  if (scalar) output.push({ key: path.join("."), path, sensitive });
  const properties = node.properties;
  if (
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    for (const [name, child] of Object.entries(properties)) {
      collectScalarSchemaFields(child, [...path, name], sensitive, output);
    }
  }
  return output;
}

const schemaFields = computed(() => {
  const schema = selectedDefinition.value?.currentRevision?.payloadSchema;
  return assignDefaultTargetKeys(collectScalarSchemaFields(schema));
});
const selectedCount = computed(
  () =>
    schemaFields.value.filter(
      (field) => !field.sensitive && selectedFields.value[field.key],
    ).length,
);
const selectionLimitReached = computed(
  () => selectedCount.value >= MAX_PROPERTY_BINDINGS,
);
const canSubmit = computed(
  () =>
    connectionId.value &&
    selectedDefinition.value?.currentRevision &&
    routeName.value.trim() &&
    providerEventName.value.trim() &&
    selectedCount.value > 0 &&
    selectedCount.value <= MAX_PROPERTY_BINDINGS,
);

watch(definitionId, () => {
  selectedFields.value = emptyFieldMap();
  targetKeys.value = emptyFieldMap();
  requiredFields.value = emptyFieldMap();
  providerEventName.value = selectedDefinition.value?.code ?? "";
  if (!routeName.value.trim())
    routeName.value = selectedDefinition.value?.name ?? "";
});

watch(
  () => props.projectId,
  () => void switchProject(),
);

onMounted(() => void switchProject());

function pendingCreateStorageKey(projectId: string): string {
  return `lola:amplitude-pending-route-create:${projectId}`;
}

function rememberPendingCreate(command: PendingCreate): void {
  pendingCreate = command;
  try {
    window.sessionStorage.setItem(
      pendingCreateStorageKey(command.projectId),
      JSON.stringify(command),
    );
  } catch {
    // The in-memory receipt still protects retries during this page lifetime.
  }
}

function restorePendingCreate(projectId: string): void {
  pendingCreate = null;
  try {
    const raw = window.sessionStorage.getItem(
      pendingCreateStorageKey(projectId),
    );
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      value &&
      typeof value === "object" &&
      "projectId" in value &&
      value.projectId === projectId &&
      "idempotencyKey" in value &&
      typeof value.idempotencyKey === "string" &&
      value.idempotencyKey.length >= 8 &&
      value.idempotencyKey.length <= 200 &&
      "input" in value &&
      value.input &&
      typeof value.input === "object" &&
      !Array.isArray(value.input)
    ) {
      pendingCreate = value as PendingCreate;
    }
  } catch {
    // Invalid or unavailable browser storage is treated as no receipt.
  }
}

function forgetPendingCreate(command: PendingCreate): void {
  if (
    pendingCreate?.projectId === command.projectId &&
    pendingCreate.idempotencyKey === command.idempotencyKey
  ) {
    pendingCreate = null;
  }
  try {
    window.sessionStorage.removeItem(
      pendingCreateStorageKey(command.projectId),
    );
  } catch {
    // Ignore storage policies that reject cleanup.
  }
}

async function switchProject(): Promise<void> {
  commandKeys.clear();
  pendingCreate = null;
  showCreate.value = false;
  connectionId.value = "";
  definitionId.value = "";
  routeName.value = "";
  providerEventName.value = "";
  selectedFields.value = emptyFieldMap();
  targetKeys.value = emptyFieldMap();
  requiredFields.value = emptyFieldMap();
  error.value = "";
  notice.value = "";
  restorePendingCreate(props.projectId);
  await load();
  const command = pendingCreate as PendingCreate | null;
  if (command?.projectId === props.projectId && props.canManage) {
    await submitCreate(command);
  }
}

async function load(): Promise<void> {
  const epoch = ++loadEpoch;
  routes.value = [];
  connections.value = [];
  definitions.value = [];
  activity.value = [];
  connectionId.value = "";
  if (!props.projectId || !props.canRead) {
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const [routeResult, connectionResult, definitionResult, activityResult] =
      await Promise.all([
        integrationEventRoutesApi.list(props.projectId),
        integrationConnectionsApi.list(props.projectId),
        integrationEventRoutesApi.listEventDefinitions(props.projectId),
        props.canReadActivity
          ? integrationEventRoutesApi.listActivity(props.projectId)
          : Promise.resolve({ items: [] }),
      ]);
    if (epoch !== loadEpoch) return;
    routes.value = routeResult.items;
    connections.value = connectionResult.items;
    definitions.value = definitionResult;
    activity.value = activityResult.items;
    if (!connectionId.value)
      connectionId.value = amplitudeConnections.value[0]?.id ?? "";
  } catch {
    if (epoch === loadEpoch)
      error.value = "Не удалось загрузить маршруты Amplitude.";
  } finally {
    if (epoch === loadEpoch) loading.value = false;
  }
}

function keyFor(signature: string): string {
  const current = commandKeys.get(signature);
  if (current) return current;
  const created = crypto.randomUUID();
  commandKeys.set(signature, created);
  return created;
}

async function createRoute(): Promise<void> {
  const definition = selectedDefinition.value;
  if (
    !props.canManage ||
    !canSubmit.value ||
    !definition?.currentRevision ||
    pending.value
  )
    return;
  const bindings = schemaFields.value
    .filter((field) => !field.sensitive && selectedFields.value[field.key])
    .map((field) => ({
      sourcePath: field.path,
      targetKey: (targetKeys.value[field.key] || field.defaultTargetKey).trim(),
      required: requiredFields.value[field.key] === true,
    }));
  const input = {
    connectionId: connectionId.value,
    name: routeName.value.trim(),
    eventDefinitionKeyId: definition.id,
    eventDefinitionRevisionId: definition.currentRevision.id,
    providerEventName: providerEventName.value.trim(),
    propertyBindings: bindings,
  };
  const signature = `create:${JSON.stringify(input)}`;
  const command = {
    projectId: props.projectId,
    input,
    idempotencyKey: keyFor(signature),
  };
  rememberPendingCreate(command);
  await submitCreate(command, signature);
}

async function submitCreate(
  command: PendingCreate,
  signature?: string,
): Promise<void> {
  if (pending.value || command.projectId !== props.projectId) return;
  pending.value = true;
  error.value = "";
  notice.value = "";
  try {
    await integrationEventRoutesApi.createAmplitude(
      command.projectId,
      command.input,
      command.idempotencyKey,
    );
    if (command.projectId !== props.projectId) return;
    forgetPendingCreate(command);
    if (signature) commandKeys.delete(signature);
    showCreate.value = false;
    routeName.value = "";
    definitionId.value = "";
    notice.value = "Черновик маршрута создан. Проверьте его и опубликуйте.";
    await load();
  } catch (cause) {
    if (command.projectId !== props.projectId) return;
    const apiError = normalizeApiError(cause);
    if (apiError.status >= 400 && apiError.status < 500) {
      forgetPendingCreate(command);
      error.value = "Не удалось создать маршрут. Проверьте настройки и поля.";
    } else {
      error.value =
        "Результат создания не подтверждён. Повтор использует тот же ключ и не создаст второй маршрут.";
    }
  } finally {
    pending.value = false;
  }
}

async function publish(route: IntegrationEventRouteResponseDto): Promise<void> {
  const projectId = props.projectId;
  await mutate(
    `publish:${route.id}:${route.version}`,
    () =>
      integrationEventRoutesApi.publish(
        projectId,
        route.id,
        { expectedVersion: route.version, reason: "Публикация через CMS" },
        keyFor(`publish:${route.id}:${route.version}`),
      ),
    "Маршрут опубликован. Отправка остаётся выключенной до активации.",
  );
}

async function toggle(route: IntegrationEventRouteResponseDto): Promise<void> {
  const projectId = props.projectId;
  const signature = `${route.enabled ? "disable" : "enable"}:${route.id}:${route.version}`;
  await mutate(
    signature,
    () =>
      route.enabled
        ? integrationEventRoutesApi.disable(
            projectId,
            route.id,
            {
              expectedVersion: route.version,
              reason: "Остановка маршрута через CMS",
            },
            keyFor(signature),
          )
        : integrationEventRoutesApi.enable(
            projectId,
            route.id,
            {
              expectedVersion: route.version,
              reason: "Активация маршрута через CMS",
            },
            keyFor(signature),
          ),
    route.enabled
      ? "Отправка по маршруту остановлена."
      : "Отправка по маршруту включена.",
  );
}

async function mutate(
  signature: string,
  action: () => Promise<unknown>,
  success: string,
): Promise<void> {
  if (!props.canManage || pending.value) return;
  const projectId = props.projectId;
  pending.value = true;
  error.value = "";
  notice.value = "";
  try {
    await action();
    if (projectId !== props.projectId) return;
    commandKeys.delete(signature);
    notice.value = success;
    await load();
  } catch {
    if (projectId !== props.projectId) return;
    error.value =
      "Не удалось изменить маршрут. Обновите данные и повторите запрос.";
  } finally {
    pending.value = false;
  }
}

function mappingCount(route: IntegrationEventRouteResponseDto): number {
  return (
    route.draftRevision?.propertyBindings.length ??
    route.publishedRevision?.propertyBindings.length ??
    0
  );
}

function statusLabel(route: IntegrationEventRouteResponseDto): string {
  if (route.enabled) return "Активен";
  if (route.draftRevision) return "Черновик";
  return "Приостановлен";
}

function dispatchStatus(status: string): string {
  return (
    {
      PENDING: "В очереди",
      PROCESSING: "Отправляется",
      DELIVERED: "Доставлено",
      RETRY_WAIT: "Повтор",
      FAILED_PERMANENT: "Ошибка",
      OUTCOME_UNKNOWN: "Результат неизвестен",
      CANCELLED: "Отменено",
    }[status] ?? status
  );
}
</script>

<template>
  <section
    class="integration-card event-routes-card"
    aria-labelledby="amplitude-routes-title"
  >
    <div class="card-heading">
      <div>
        <h2 id="amplitude-routes-title">Маршруты событий Amplitude</h2>
        <p>Только опубликованные и включённые маршруты экспортируют события.</p>
      </div>
      <button
        v-if="canManage"
        type="button"
        :disabled="pending"
        @click="showCreate = !showCreate"
      >
        {{ showCreate ? "Закрыть" : "Создать маршрут" }}
      </button>
    </div>

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
    <p v-if="loading" class="empty-state">Загружаем маршруты…</p>

    <form
      v-if="showCreate && canManage"
      class="route-form"
      @submit.prevent="createRoute"
    >
      <label>
        <span>Подключение</span>
        <select v-model="connectionId" required :disabled="pending">
          <option value="" disabled>Выберите подключение</option>
          <option
            v-for="connection in amplitudeConnections"
            :key="connection.id"
            :value="connection.id"
          >
            {{ connection.displayName }} · {{ connection.region }}
          </option>
        </select>
      </label>
      <label>
        <span>Событие Lola</span>
        <select v-model="definitionId" required :disabled="pending">
          <option value="" disabled>Выберите событие</option>
          <option
            v-for="definition in definitions"
            :key="definition.id"
            :value="definition.id"
            :disabled="!definition.currentRevision"
          >
            {{ definition.name }} · {{ definition.code }}
          </option>
        </select>
      </label>
      <label>
        <span>Название маршрута</span>
        <input
          v-model="routeName"
          maxlength="120"
          required
          :disabled="pending"
        />
      </label>
      <label>
        <span>Название события в Amplitude</span>
        <input
          v-model="providerEventName"
          maxlength="120"
          required
          :disabled="pending"
        />
      </label>

      <fieldset v-if="schemaFields.length" class="mapping-fields">
        <legend>Разрешённые свойства</legend>
        <div v-for="field in schemaFields" :key="field.key" class="mapping-row">
          <label class="mapping-toggle">
            <input
              v-model="selectedFields[field.key]"
              type="checkbox"
              :disabled="
                pending ||
                field.sensitive ||
                (!selectedFields[field.key] && selectionLimitReached)
              "
            />
            <code>{{ field.key }}</code>
            <span v-if="field.sensitive">Не экспортируется</span>
          </label>
          <input
            v-model="targetKeys[field.key]"
            maxlength="64"
            pattern="[A-Za-z][A-Za-z0-9_.-]{0,63}"
            :placeholder="field.defaultTargetKey"
            :disabled="pending || field.sensitive || !selectedFields[field.key]"
            :aria-label="`Поле Amplitude для ${field.key}`"
          />
          <label class="required-toggle">
            <input
              v-model="requiredFields[field.key]"
              type="checkbox"
              :disabled="
                pending || field.sensitive || !selectedFields[field.key]
              "
            />
            Обязательное
          </label>
        </div>
      </fieldset>
      <p v-else-if="definitionId" class="empty-state">
        В текущей схеме нет доступных верхнеуровневых свойств.
      </p>
      <button type="submit" :disabled="pending || !canSubmit">
        Создать черновик
      </button>
    </form>

    <div v-if="!loading && routes.length" class="route-list">
      <article v-for="route in routes" :key="route.id" class="route-row">
        <div>
          <strong>{{ route.name }}</strong>
          <span
            class="status-chip"
            :data-status="route.enabled ? 'active' : 'idle'"
            >{{ statusLabel(route) }}</span
          >
          <p>
            <code>{{
              route.draftRevision?.providerEventName ??
              route.publishedRevision?.providerEventName
            }}</code>
            · {{ mappingCount(route) }} свойств
          </p>
        </div>
        <div v-if="canManage" class="route-actions">
          <button
            v-if="route.draftRevision"
            type="button"
            :disabled="pending"
            @click="publish(route)"
          >
            Опубликовать
          </button>
          <button
            v-else
            type="button"
            :disabled="pending"
            @click="toggle(route)"
          >
            {{ route.enabled ? "Остановить" : "Включить" }}
          </button>
        </div>
      </article>
    </div>
    <p v-else-if="!loading && !routes.length" class="empty-state">
      Маршруты ещё не настроены.
    </p>

    <div v-if="canReadActivity" class="delivery-activity">
      <h3>Последние доставки</h3>
      <div v-if="activity.length" class="activity-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Событие</th>
              <th>Статус</th>
              <th>Попытки</th>
              <th>Создано</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in activity" :key="item.id">
              <td>
                <code>{{ item.providerEventName }}</code>
              </td>
              <td>{{ dispatchStatus(item.status) }}</td>
              <td>{{ item.attemptCount }}</td>
              <td>{{ new Date(item.createdAt).toLocaleString("ru-RU") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty-state">Доставок пока нет.</p>
    </div>
  </section>
</template>

<style scoped>
.event-routes-card {
  display: grid;
  gap: 16px;
}
.card-heading,
.route-row,
.route-actions,
.mapping-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-heading,
.route-row {
  justify-content: space-between;
}
.card-heading h2,
.delivery-activity h3 {
  margin: 0;
}
.card-heading p,
.route-row p {
  margin: 4px 0 0;
  color: var(--text-secondary);
}
.route-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.route-form label {
  display: grid;
  gap: 6px;
}
.route-form input,
.route-form select {
  width: 100%;
  min-height: 40px;
}
.mapping-fields {
  grid-column: 1 / -1;
  display: grid;
  gap: 10px;
  border: 0;
  padding: 0;
}
.mapping-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) auto;
}
.mapping-toggle,
.required-toggle {
  display: flex !important;
  grid-auto-flow: column;
  align-items: center;
  justify-content: start;
}
.mapping-toggle input,
.required-toggle input {
  width: auto;
  min-height: auto;
}
.route-list {
  display: grid;
  gap: 10px;
}
.route-row {
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
}
.status-chip {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: 12px;
}
.status-chip[data-status="active"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.feedback {
  margin: 0;
}
.feedback.error {
  color: var(--status-danger-text);
}
.feedback.success {
  color: var(--status-success-text);
}
.activity-table-wrap {
  overflow-x: auto;
}
.delivery-activity table {
  width: 100%;
  border-collapse: collapse;
}
.delivery-activity th,
.delivery-activity td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-default);
}
@media (max-width: 720px) {
  .route-form {
    grid-template-columns: 1fr;
  }
  .mapping-row {
    grid-template-columns: 1fr;
  }
  .card-heading,
  .route-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
