<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import type {
  EventDefinitionCatalogResponseDto,
  IntegrationConnectionResponseDto,
  IntegrationEventRouteResponseDto,
} from "@/shared/api/generated/models";
import {
  integrationInboundConnectionsApi,
  type InboundIntegrationProvider,
} from "@/features/integration-inbound-connections/integration-inbound-connections.api";
import { ApiError } from "@/shared/api/http/api-error";
import { integrationEventRoutesApi } from "@/features/integration-event-routes/integration-event-routes.api";
import { integrationInboundRoutesApi } from "./integration-inbound-routes.api";

const props = defineProps<{
  projectId: string;
  provider: InboundIntegrationProvider;
  canRead: boolean;
  canManage: boolean;
}>();

const slug = computed(() =>
  props.provider === "AMPLITUDE" ? "amplitude" : "customer-io",
);
const title = computed(() =>
  props.provider === "AMPLITUDE" ? "Amplitude" : "Customer.io",
);
const routes = ref<IntegrationEventRouteResponseDto[]>([]);
const connections = ref<IntegrationConnectionResponseDto[]>([]);
const definitions = ref<EventDefinitionCatalogResponseDto[]>([]);
const loading = ref(false);
const pending = ref(false);
const showCreate = ref(false);
const error = ref("");
const notice = ref("");
const connectionId = ref("");
const definitionId = ref("");
const routeName = ref("");
const providerEventName = ref("");
const canonicalKeySourcePath = ref("");
const canonicalKeyNormalization = ref<
  "NONE" | "TRIM" | "LOWERCASE" | "TRIM_LOWERCASE"
>("TRIM_LOWERCASE");
const sourcePaths = reactive<Record<string, string>>({});
const commandKeys = new Map<string, string>();
let epoch = 0;

const providerConnections = computed(() =>
  connections.value.filter(
    (connection) =>
      connection.provider === props.provider &&
      connection.inboundEnabled &&
      connection.lifecycle !== "ARCHIVED",
  ),
);
const selectedDefinition = computed(() =>
  definitions.value.find((definition) => definition.id === definitionId.value),
);
const schemaFields = computed(() => {
  const schema = selectedDefinition.value?.currentRevision?.payloadSchema as
    { properties?: Record<string, unknown>; required?: string[] } | undefined;
  const required = new Set(schema?.required ?? []);
  return Object.keys(schema?.properties ?? {})
    .filter((key) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(key))
    .slice(0, 32)
    .map((key) => ({ key, required: required.has(key) }));
});

watch(definitionId, () => {
  for (const key of Object.keys(sourcePaths)) delete sourcePaths[key];
  for (const field of schemaFields.value) {
    sourcePaths[field.key] = field.key;
  }
  if (!routeName.value) routeName.value = selectedDefinition.value?.name ?? "";
  if (!providerEventName.value)
    providerEventName.value = selectedDefinition.value?.code ?? "";
});

function parseSourcePath(value: string): string[] | null {
  const path = value.trim().split(".");
  const unsafeSegments = new Set(["__proto__", "constructor", "prototype"]);
  return path.length >= 1 &&
    path.length <= 8 &&
    path.every(
      (segment) =>
        /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(segment) &&
        !unsafeSegments.has(segment.toLowerCase()),
    )
    ? path
    : null;
}

function commandKey(signature: string): string {
  const existing = commandKeys.get(signature);
  if (existing) return existing;
  const key = crypto.randomUUID();
  commandKeys.set(signature, key);
  return key;
}

async function load(): Promise<void> {
  const current = ++epoch;
  routes.value = [];
  if (!props.projectId || !props.canRead) return;
  loading.value = true;
  error.value = "";
  try {
    const [routeResult, connectionResult, definitionResult] = await Promise.all(
      [
        integrationEventRoutesApi.list(props.projectId),
        integrationInboundConnectionsApi.list(props.projectId),
        integrationEventRoutesApi.listEventDefinitions(props.projectId),
      ],
    );
    if (current !== epoch) return;
    routes.value = routeResult.items.filter((route) => {
      const revision = route.draftRevision ?? route.publishedRevision;
      return (
        route.direction === "INBOUND" && revision?.provider === props.provider
      );
    });
    connections.value = connectionResult.items;
    definitions.value = definitionResult;
    connectionId.value = providerConnections.value[0]?.id ?? "";
  } catch {
    if (current === epoch)
      error.value = "Не удалось загрузить входящие маршруты.";
  } finally {
    if (current === epoch) loading.value = false;
  }
}

async function create(): Promise<void> {
  const definition = selectedDefinition.value;
  const revision = definition?.currentRevision;
  const bindings = schemaFields.value.map((field) => ({
    sourcePath: parseSourcePath(sourcePaths[field.key] ?? ""),
    targetKey: field.key,
    required: field.required,
  }));
  const canonicalSourcePath = canonicalKeySourcePath.value.trim()
    ? parseSourcePath(canonicalKeySourcePath.value)
    : null;
  if (
    !props.canManage ||
    pending.value ||
    !definition ||
    !revision ||
    !connectionId.value ||
    !routeName.value.trim() ||
    !providerEventName.value.trim() ||
    bindings.some((binding) => binding.sourcePath === null) ||
    (canonicalKeySourcePath.value.trim().length > 0 && !canonicalSourcePath)
  ) {
    error.value = "Проверьте подключение, событие и пути mapping.";
    return;
  }
  const projectId = props.projectId;
  const input = {
    connectionId: connectionId.value,
    name: routeName.value.trim(),
    eventDefinitionKeyId: definition.id,
    eventDefinitionRevisionId: revision.id,
    providerEventName: providerEventName.value.trim(),
    propertyBindings: bindings.map((binding) => ({
      ...binding,
      sourcePath: binding.sourcePath!,
    })),
    ...(canonicalSourcePath
      ? {
          canonicalKeyExtractor: {
            sourcePath: canonicalSourcePath,
            normalization: canonicalKeyNormalization.value,
          },
        }
      : {}),
  };
  const signature = `create:${JSON.stringify(input)}`;
  pending.value = true;
  error.value = "";
  try {
    await integrationInboundRoutesApi.create(
      props.provider,
      projectId,
      input,
      commandKey(signature),
    );
    if (projectId !== props.projectId) return;
    notice.value = "Черновик входящего маршрута создан.";
    commandKeys.delete(signature);
    showCreate.value = false;
    await load();
  } catch {
    if (projectId === props.projectId)
      error.value =
        "Не удалось создать входящий маршрут. Проверьте mapping и схему события.";
  } finally {
    pending.value = false;
  }
}

async function mutate(
  route: IntegrationEventRouteResponseDto,
  action: "PUBLISH" | "ENABLE" | "DISABLE",
): Promise<void> {
  if (!props.canManage || pending.value) return;
  const projectId = props.projectId;
  const signature = `${action}:${route.id}:${route.version}`;
  pending.value = true;
  error.value = "";
  try {
    const input = {
      expectedVersion: route.version,
      reason:
        action === "PUBLISH"
          ? "Публикация входящего маршрута через CMS"
          : action === "ENABLE"
            ? "Активация входящего маршрута через CMS"
            : "Остановка входящего маршрута через CMS",
    };
    if (action === "PUBLISH")
      await integrationEventRoutesApi.publish(
        projectId,
        route.id,
        input,
        commandKey(signature),
      );
    else if (action === "ENABLE")
      await integrationEventRoutesApi.enable(
        projectId,
        route.id,
        input,
        commandKey(signature),
      );
    else
      await integrationEventRoutesApi.disable(
        projectId,
        route.id,
        input,
        commandKey(signature),
      );
    if (projectId !== props.projectId) return;
    notice.value =
      action === "PUBLISH"
        ? "Маршрут опубликован, но ещё не включён."
        : "Состояние маршрута обновлено.";
    commandKeys.delete(signature);
    await load();
  } catch (cause) {
    if (projectId !== props.projectId) return;
    error.value =
      cause instanceof ApiError &&
      cause.code === "CUSTOMER_IO_INBOUND_DELIVERY_ID_NOT_VERIFIED"
        ? "Customer.io ещё не подтвердил messageId для текущего signing secret. Отправьте signed track canary и повторите операцию."
        : "Изменение отклонено. Для SINGLE_SOURCE у события Lola может быть только один включённый входящий источник.";
  } finally {
    pending.value = false;
  }
}

watch(
  () => [props.projectId, props.provider, props.canRead] as const,
  () => {
    commandKeys.clear();
    void load();
  },
);
onMounted(() => void load());
</script>

<template>
  <section
    class="integration-card inbound-routes-card"
    :data-inbound-routes="slug"
  >
    <div class="card-heading">
      <div>
        <h2>Входящие маршруты {{ title }}</h2>
        <p>SINGLE_SOURCE: один включённый источник на событие Lola.</p>
        <p v-if="provider === 'CUSTOMER_IO'">
          Перед публикацией или включением отправьте signed track canary с
          messageId под текущим signing secret. После rotation повторите canary.
        </p>
      </div>
      <button
        v-if="canManage"
        type="button"
        :data-action="`show-create-inbound-${slug}`"
        :disabled="pending"
        @click="showCreate = !showCreate"
      >
        {{ showCreate ? "Закрыть" : "Создать маршрут" }}
      </button>
    </div>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
    <p v-if="loading" class="empty-state">Загружаем входящие маршруты…</p>

    <form
      v-if="showCreate && canManage"
      class="route-form"
      :data-form="`create-inbound-route-${slug}`"
      @submit.prevent="create"
    >
      <label
        ><span>Входящее подключение</span
        ><select v-model="connectionId" required>
          <option value="" disabled>Выберите подключение</option>
          <option
            v-for="connection in providerConnections"
            :key="connection.id"
            :value="connection.id"
          >
            {{ connection.displayName }} · {{ connection.region }}
          </option>
        </select></label
      >
      <label
        ><span>Событие Lola</span
        ><select v-model="definitionId" name="inboundEventDefinition" required>
          <option value="" disabled>Выберите событие</option>
          <option
            v-for="definition in definitions"
            :key="definition.id"
            :value="definition.id"
            :disabled="!definition.currentRevision"
          >
            {{ definition.name }} · {{ definition.code }}
          </option>
        </select></label
      >
      <label
        ><span>Название маршрута</span
        ><input
          v-model="routeName"
          name="inboundRouteName"
          maxlength="120"
          required
      /></label>
      <label
        ><span>Название события у провайдера</span
        ><input
          v-model="providerEventName"
          name="inboundProviderEventName"
          maxlength="120"
          required
      /></label>
      <fieldset class="mapping-fields">
        <legend>Canonical key extractor (для multi-provider dedup)</legend>
        <label class="mapping-row">
          <span>Путь стабильного бизнес-ключа</span>
          <input
            v-model="canonicalKeySourcePath"
            name="canonicalKeySourcePath"
            maxlength="520"
            placeholder="transaction_id"
          />
        </label>
        <label class="mapping-row">
          <span>Нормализация</span>
          <select
            v-model="canonicalKeyNormalization"
            name="canonicalKeyNormalization"
          >
            <option value="NONE">Без нормализации</option>
            <option value="TRIM">Trim</option>
            <option value="LOWERCASE">Lowercase</option>
            <option value="TRIM_LOWERCASE">Trim + lowercase</option>
          </select>
        </label>
        <small>
          Оставьте путь пустым для SINGLE_SOURCE. Временные окна и эвристики не
          используются.
        </small>
      </fieldset>
      <fieldset v-if="schemaFields.length" class="mapping-fields">
        <legend>Mapping provider payload → Lola payload</legend>
        <label
          v-for="field in schemaFields"
          :key="field.key"
          class="mapping-row"
        >
          <span
            ><code>{{ field.key }}</code
            >{{ field.required ? " · обязательно" : "" }}</span
          >
          <input
            v-model="sourcePaths[field.key]"
            :name="`sourcePath-${field.key}`"
            maxlength="520"
            placeholder="field or nested.field"
            required
          />
        </label>
      </fieldset>
      <button type="submit" :disabled="pending">Создать черновик</button>
    </form>

    <div v-if="!loading && routes.length" class="route-list">
      <article v-for="route in routes" :key="route.id" class="route-row">
        <div>
          <strong>{{ route.name }}</strong>
          <p>
            <code>{{
              route.draftRevision?.providerEventName ??
              route.publishedRevision?.providerEventName
            }}</code>
            ·
            {{
              route.enabled
                ? "Включён"
                : route.draftRevision
                  ? "Черновик"
                  : "Остановлен"
            }}
          </p>
        </div>
        <div v-if="canManage" class="actions">
          <button
            v-if="route.draftRevision"
            type="button"
            :disabled="pending"
            @click="mutate(route, 'PUBLISH')"
          >
            Опубликовать
          </button>
          <button
            v-else
            type="button"
            :disabled="pending"
            @click="mutate(route, route.enabled ? 'DISABLE' : 'ENABLE')"
          >
            {{ route.enabled ? "Остановить" : "Включить" }}
          </button>
        </div>
      </article>
    </div>
    <p v-else-if="!loading" class="empty-state">
      Входящие маршруты ещё не настроены.
    </p>
  </section>
</template>

<style scoped>
.inbound-routes-card,
.route-list,
.route-form,
.mapping-fields {
  display: grid;
  gap: 14px;
}
.card-heading,
.route-row,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.route-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.route-form label,
.mapping-row {
  display: grid;
  gap: 6px;
}
.mapping-fields {
  grid-column: 1 / -1;
  border: 0;
  padding: 0;
}
@media (max-width: 700px) {
  .route-form {
    grid-template-columns: 1fr;
  }
  .card-heading,
  .route-row,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
