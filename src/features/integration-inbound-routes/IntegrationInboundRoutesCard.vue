<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import Select from "primevue/select";
import EventDefinitionSelect from "@/features/events/EventDefinitionSelect.vue";
import TablePagination from "@/shared/ui/TablePagination.vue";
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
  focusRouteId?: string;
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
const editingRoute = ref<IntegrationEventRouteResponseDto | null>(null);
const routeQuery = ref("");
const routePage = ref(1);
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
const PAGE_SIZE = 10;

function routeProviderEventName(
  route: IntegrationEventRouteResponseDto,
): string {
  return (
    route.draftRevision?.providerEventName ??
    route.publishedRevision?.providerEventName ??
    ""
  );
}

function statusLabel(route: IntegrationEventRouteResponseDto): string {
  if (route.enabled) return "Активен";
  if (route.draftRevision) return "Черновик";
  return "Приостановлен";
}

function rulesCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} правил`;
  if (mod10 === 1) return `${count} правило`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} правила`;
  return `${count} правил`;
}

const filteredRoutes = computed(() => {
  const query = routeQuery.value.trim().toLocaleLowerCase("ru-RU");
  if (!query) return routes.value;
  return routes.value.filter((route) =>
    `${route.name} ${routeProviderEventName(route)}`
      .toLocaleLowerCase("ru-RU")
      .includes(query),
  );
});
const visibleRoutes = computed(() => {
  const start = (routePage.value - 1) * PAGE_SIZE;
  return filteredRoutes.value.slice(start, start + PAGE_SIZE);
});

watch(routeQuery, () => {
  routePage.value = 1;
});
watch(
  () => filteredRoutes.value.length,
  (total) => {
    routePage.value = Math.min(
      routePage.value,
      Math.max(1, Math.ceil(total / PAGE_SIZE)),
    );
  },
);

const providerConnections = computed(() =>
  connections.value.filter(
    (connection) =>
      connection.provider === props.provider &&
      connection.inboundEnabled &&
      connection.lifecycle !== "ARCHIVED",
  ),
);
const connectionOptions = computed(() =>
  providerConnections.value.map((connection) => ({
    label: connection.displayName,
    description: connection.region,
    value: connection.id,
  })),
);
const normalizationOptions = [
  { label: "Не изменять значение", value: "NONE" },
  { label: "Убрать пробелы по краям", value: "TRIM" },
  { label: "Привести к нижнему регистру", value: "LOWERCASE" },
  {
    label: "Убрать пробелы и привести к нижнему регистру",
    value: "TRIM_LOWERCASE",
  },
];
const selectedDefinition = computed(() =>
  definitions.value.find((definition) => definition.id === definitionId.value),
);
const isEditing = computed(() => editingRoute.value !== null);
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
  routeName.value = selectedDefinition.value
    ? `${title.value} → ${selectedDefinition.value.name}`
    : "";
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
  routePage.value = 1;
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
    const focusedRoute = routes.value.find(
      ({ id }) => id === props.focusRouteId,
    );
    if (focusedRoute) {
      routeQuery.value = focusedRoute.name;
      routePage.value = 1;
      await nextTick();
      document
        .querySelector<HTMLElement>(
          `[data-inbound-route-id="${focusedRoute.id}"]`,
        )
        ?.scrollIntoView?.({ block: "center" });
    }
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

function openCreate(): void {
  editingRoute.value = null;
  showCreate.value = true;
  connectionId.value = providerConnections.value[0]?.id ?? "";
  definitionId.value = "";
  routeName.value = "";
  providerEventName.value = "";
  canonicalKeySourcePath.value = "";
  canonicalKeyNormalization.value = "TRIM_LOWERCASE";
  for (const key of Object.keys(sourcePaths)) delete sourcePaths[key];
}

function closeEditor(): void {
  showCreate.value = false;
  editingRoute.value = null;
}

async function startEdit(
  route: IntegrationEventRouteResponseDto,
): Promise<void> {
  const revision = route.draftRevision ?? route.publishedRevision;
  if (!revision) return;
  editingRoute.value = route;
  showCreate.value = true;
  connectionId.value = route.connectionId;
  definitionId.value = revision.eventDefinitionKeyId;
  await nextTick();
  routeName.value = route.name;
  providerEventName.value = revision.providerEventName;
  for (const binding of revision.propertyBindings) {
    sourcePaths[binding.targetKey] = binding.sourcePath.join(".");
  }
  canonicalKeySourcePath.value =
    revision.canonicalKeyExtractor?.sourcePath.join(".") ?? "";
  canonicalKeyNormalization.value =
    revision.canonicalKeyExtractor?.normalization ?? "TRIM_LOWERCASE";
  await nextTick();
  document
    .getElementById(`${slug.value}-create-inbound-route`)
    ?.scrollIntoView?.({ block: "start" });
}

async function save(): Promise<void> {
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
    error.value = "Проверьте подключение, событие и пути к свойствам.";
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
  let completedSignature = signature;
  pending.value = true;
  error.value = "";
  try {
    if (editingRoute.value) {
      const route = editingRoute.value;
      const editInput = {
        expectedVersion: route.version,
        reason: `Редактирование правила приёма ${title.value} через CMS`,
        name: input.name,
        eventDefinitionKeyId: input.eventDefinitionKeyId,
        eventDefinitionRevisionId: input.eventDefinitionRevisionId,
        providerEventName: input.providerEventName,
        propertyBindings: input.propertyBindings,
        ...(input.canonicalKeyExtractor
          ? { canonicalKeyExtractor: input.canonicalKeyExtractor }
          : {}),
      };
      completedSignature = `edit:${route.id}:${JSON.stringify(editInput)}`;
      await integrationEventRoutesApi.editDraft(
        projectId,
        route.id,
        editInput,
        commandKey(completedSignature),
      );
    } else {
      await integrationInboundRoutesApi.create(
        props.provider,
        projectId,
        input,
        commandKey(signature),
      );
    }
    if (projectId !== props.projectId) return;
    notice.value = editingRoute.value
      ? "Изменения сохранены в новой черновой версии. Проверьте и опубликуйте её."
      : "Черновик входящего маршрута создан.";
    commandKeys.delete(completedSignature);
    closeEditor();
    await load();
  } catch {
    if (projectId === props.projectId)
      error.value =
        "Не удалось сохранить правило приёма. Проверьте пути и схему события.";
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
        ? "Customer.io ещё не подтвердил messageId для текущего секрета подписи. Отправьте подписанное контрольное событие track и повторите операцию."
        : "Изменение отклонено: без объединения дублей у события Retenive может быть только один включённый входящий источник.";
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
        <h2>Правила приёма событий из {{ title }}</h2>
        <p>
          Шаг 2. Укажите, какое внешнее событие должно превратиться в выбранное
          событие Retenive.
        </p>
        <p v-if="provider === 'CUSTOMER_IO'">
          Перед включением отправьте контрольное событие <code>track</code> с
          уникальным <code>messageId</code>, подписанное текущим секретом.
          Retenive проверит подпись и только после этого разрешит принимать
          рабочие события. После замены секрета проверку нужно повторить.
        </p>
      </div>
      <button
        v-if="canManage"
        type="button"
        :data-action="`show-create-inbound-${slug}`"
        :disabled="pending"
        :aria-expanded="showCreate"
        :aria-controls="`${slug}-create-inbound-route`"
        @click="showCreate ? closeEditor() : openCreate()"
      >
        {{ showCreate ? "Закрыть" : "Добавить правило" }}
      </button>
    </div>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
    <p v-if="loading" class="empty-state">Загружаем входящие маршруты…</p>

    <Transition name="integration-reveal">
      <form
        v-if="showCreate && canManage"
        :id="`${slug}-create-inbound-route`"
        class="route-form"
        :data-form="`create-inbound-route-${slug}`"
        @submit.prevent="save"
      >
        <div class="form-intro">
          <span class="setup-step">Шаг 2</span>
          <div>
            <h3>
              {{
                isEditing ? "Изменить правило приёма" : "Новое правило приёма"
              }}
            </h3>
            <p>
              {{
                isEditing
                  ? "Сохранение создаст новую черновую версию. Приём событий не изменится до публикации."
                  : "Правило определяет, какое внешнее событие станет событием Retenive, и откуда взять его свойства. Название правила Retenive сформирует автоматически."
              }}
            </p>
          </div>
        </div>
        <label class="integration-field">
          <span>1. Защищённый адрес приёма</span>
          <Select
            v-model="connectionId"
            :options="connectionOptions"
            option-label="label"
            option-value="value"
            placeholder="Выберите адрес"
            :disabled="pending || isEditing"
            fluid
          >
            <template #option="slotProps">
              <div class="select-option">
                <strong>{{ slotProps.option.label }}</strong>
                <small>{{ slotProps.option.description }}</small>
              </div>
            </template>
          </Select>
          <small>
            Это адрес webhook и секрет, созданные на предыдущем шаге. Исходящий
            API-ключ здесь не используется.
          </small>
        </label>
        <EventDefinitionSelect
          v-model="definitionId"
          class="integration-field"
          :project-id="projectId"
          label="2. Событие Retenive"
          placeholder="Найдите событие по названию или коду"
          :disabled="pending"
        />
        <label class="integration-field">
          <span>3. Название события в {{ title }}</span>
          <input
            v-model="providerEventName"
            name="inboundProviderEventName"
            maxlength="120"
            required
            :disabled="pending"
          />
          <small>
            Retenive будет принимать только события с этим точным названием.
          </small>
        </label>
        <fieldset v-if="schemaFields.length" class="mapping-fields">
          <legend>4. Откуда брать свойства события Retenive</legend>
          <p class="field-help">
            Для каждого свойства укажите путь в JSON, который присылает
            {{ title }}. Пример: <code>properties.transaction_id</code>.
          </p>
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
              placeholder="properties.field"
              required
              :disabled="pending"
            />
          </label>
        </fieldset>
        <details class="advanced-settings">
          <summary>Объединение дублей из нескольких источников</summary>
          <p>
            Заполняйте этот блок, только если одно бизнес-событие может прийти и
            из Customer.io, и из Amplitude. Retenive сравнит стабильный
            идентификатор, например <code>transaction_id</code>, и не создаст
            дубль.
          </p>
          <div class="advanced-settings__grid">
            <label class="mapping-row">
              <span>Путь к стабильному идентификатору</span>
              <input
                v-model="canonicalKeySourcePath"
                name="canonicalKeySourcePath"
                maxlength="520"
                placeholder="properties.transaction_id"
              />
              <small
                >Оставьте пустым, если событие приходит только из одного
                источника.</small
              >
            </label>
            <label class="mapping-row">
              <span>Как сравнивать значения</span>
              <Select
                v-model="canonicalKeyNormalization"
                name="canonicalKeyNormalization"
                :options="normalizationOptions"
                option-label="label"
                option-value="value"
                fluid
              />
            </label>
          </div>
        </details>
        <div class="form-actions">
          <button type="submit" :disabled="pending">
            {{ isEditing ? "Сохранить изменения" : "Создать черновик" }}
          </button>
        </div>
      </form>
    </Transition>

    <section v-if="!loading && routes.length" class="integration-records">
      <div class="integration-records__header">
        <div>
          <h3>Правила приёма</h3>
          <p>{{ rulesCountLabel(routes.length) }} · по 10 на странице</p>
        </div>
        <label
          v-if="routes.length > PAGE_SIZE"
          class="integration-records__search"
        >
          <input
            v-model="routeQuery"
            type="search"
            aria-label="Поиск по правилам приёма"
            placeholder="Найти правило или событие"
          />
        </label>
      </div>
      <div v-if="filteredRoutes.length" class="integration-table-wrap">
        <table class="integration-table">
          <thead>
            <tr>
              <th>Правило</th>
              <th>Событие в {{ title }}</th>
              <th>Статус</th>
              <th v-if="canManage" class="integration-table__action">
                Действие
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="route in visibleRoutes"
              :key="route.id"
              data-route-row
              :data-inbound-route-id="route.id"
              :class="{ 'route-row--focused': route.id === focusRouteId }"
            >
              <td>
                <strong>{{ route.name }}</strong>
              </td>
              <td>
                <code>{{ routeProviderEventName(route) }}</code>
              </td>
              <td>
                <span
                  class="status-chip"
                  :data-status="route.enabled ? 'active' : 'idle'"
                  >{{ statusLabel(route) }}</span
                >
              </td>
              <td
                v-if="canManage"
                class="integration-table__action route-actions"
              >
                <button
                  type="button"
                  :disabled="pending"
                  @click="startEdit(route)"
                >
                  Изменить
                </button>
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
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty-state">По этому запросу правил нет.</p>
      <TablePagination
        v-model:page="routePage"
        :total="filteredRoutes.length"
        :page-size="PAGE_SIZE"
        previous-label="Предыдущая страница входящих правил"
        next-label="Следующая страница входящих правил"
      />
    </section>
    <p v-else-if="!loading" class="empty-state">
      Правила приёма ещё не настроены.
    </p>
  </section>
</template>

<style scoped>
.inbound-routes-card,
.route-form,
.mapping-fields {
  display: grid;
  gap: 14px;
}
.status-chip {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.status-chip[data-status="active"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.route-row--focused {
  outline: 2px solid var(--status-accent);
  outline-offset: -2px;
  background: var(--status-accent-soft);
}
.card-heading,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.route-actions {
  white-space: nowrap;
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
}
@media (max-width: 700px) {
  .route-form {
    grid-template-columns: 1fr;
  }
  .card-heading,
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
