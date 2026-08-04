<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  CanonicalIdentityPolicyPreviewResponseDto,
  CanonicalIdentityPolicyResponseDto,
  EventDefinitionCatalogResponseDto,
  IntegrationEventRouteResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { integrationCanonicalIdentityApi } from "./integration-canonical-identity.api";

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canManage: boolean;
}>();

type CurrentPolicy = CanonicalIdentityPolicyResponseDto & {
  runtimeActivation: "PENDING_WORKER_CUTOVER" | "ACTIVE";
};

const definitions = ref<EventDefinitionCatalogResponseDto[]>([]);
const routes = ref<IntegrationEventRouteResponseDto[]>([]);
const eventDefinitionKeyId = ref("");
const canonicalKeyName = ref("");
const selectedRouteIds = ref<string[]>([]);
const currentPolicy = ref<CurrentPolicy | null>(null);
const preview = ref<CanonicalIdentityPolicyPreviewResponseDto | null>(null);
const loading = ref(false);
const pending = ref(false);
const loadError = ref("");
const actionError = ref("");
const notice = ref("");
let epoch = 0;
let publishRetry: { signature: string; key: string } | null = null;

const selectedDefinition = computed(() =>
  definitions.value.find(({ id }) => id === eventDefinitionKeyId.value),
);

const eligibleRoutes = computed(() =>
  routes.value.filter((route) => {
    const revision = route.publishedRevision;
    return (
      route.direction === "INBOUND" &&
      route.lifecycle === "ACTIVE" &&
      revision?.eventDefinitionKeyId === eventDefinitionKeyId.value &&
      revision.eventDefinitionRevisionId ===
        selectedDefinition.value?.currentRevision?.id &&
      Boolean(revision.canonicalKeyExtractor?.sourcePath.length)
    );
  }),
);
const selectedRoutes = computed(() =>
  eligibleRoutes.value.filter((route) =>
    selectedRouteIds.value.includes(route.id),
  ),
);
const selectedProviders = computed(
  () =>
    new Set(
      selectedRoutes.value.map((route) => route.publishedRevision?.provider),
    ),
);
const canPreview = computed(
  () =>
    props.canManage &&
    !pending.value &&
    canonicalKeyName.value.trim().length > 0 &&
    selectedRoutes.value.length >= 2 &&
    selectedProviders.value.size >= 2,
);

function participants() {
  return selectedRoutes.value.map((route) => ({
    routeId: route.id,
    routeRevisionId: route.publishedRevision!.id,
  }));
}

function resetDraft(): void {
  preview.value = null;
  actionError.value = "";
  notice.value = "";
  publishRetry = null;
}

function normalizationLabel(value: string): string {
  switch (value) {
    case "TRIM":
      return "trim";
    case "LOWERCASE":
      return "lowercase";
    case "TRIM_LOWERCASE":
      return "trim + lowercase";
    default:
      return "без нормализации";
  }
}

function providerLabel(value: string): string {
  return value === "CUSTOMER_IO" ? "Customer.io" : "Amplitude";
}

function activationLabel(value: string): string {
  return value === "ACTIVE" ? "Активна в runtime" : "Ожидает worker cutover";
}

function routeName(routeId: string): string {
  return routes.value.find((route) => route.id === routeId)?.name ?? routeId;
}

function policyError(cause: unknown): string {
  switch (normalizeApiError(cause).code) {
    case "INTEGRATION_IDENTITY_POLICY_VERSION_CONFLICT":
      return "Policy уже изменилась. Обновите данные и повторите preview.";
    case "INTEGRATION_IDENTITY_POLICY_PARTICIPANTS_INCOMPLETE":
      return "Выберите все активные входящие маршруты этого события.";
    case "INTEGRATION_IDENTITY_POLICY_PROVIDERS_NOT_DISTINCT":
      return "Canonical policy требует маршруты минимум двух разных провайдеров.";
    case "INTEGRATION_IDENTITY_POLICY_PARTICIPANT_NOT_ELIGIBLE":
    case "INTEGRATION_IDENTITY_POLICY_TARGET_REVISION_MISMATCH":
      return "Один из маршрутов больше не совместим с текущей ревизией события.";
    case "IDEMPOTENCY_KEY_CONFLICT":
      return "Повтор команды не совпал с исходной публикацией. Обновите preview.";
    default:
      return "Операция canonical policy отклонена. Обновите данные и повторите preview.";
  }
}

function applyCurrent(policy: CurrentPolicy | null): void {
  currentPolicy.value = policy;
  if (!policy) {
    canonicalKeyName.value = "";
    selectedRouteIds.value = [];
    return;
  }
  canonicalKeyName.value = policy.canonicalKeyName;
  selectedRouteIds.value = policy.participants.map(({ routeId }) => routeId);
}

async function loadCurrent(
  selectedProjectId: string,
  selectedEventId: string,
  requestEpoch: number,
): Promise<void> {
  const policy = await integrationCanonicalIdentityApi.current(
    selectedProjectId,
    selectedEventId,
  );
  if (
    requestEpoch !== epoch ||
    selectedProjectId !== props.projectId ||
    selectedEventId !== eventDefinitionKeyId.value
  )
    return;
  applyCurrent(policy as CurrentPolicy | null);
}

async function load(): Promise<void> {
  const requestEpoch = ++epoch;
  const selectedProjectId = props.projectId;
  definitions.value = [];
  routes.value = [];
  currentPolicy.value = null;
  preview.value = null;
  if (!selectedProjectId || !props.canRead) return;
  loading.value = true;
  loadError.value = "";
  try {
    const [definitionResult, routeResult] = await Promise.all([
      integrationCanonicalIdentityApi.listDefinitions(selectedProjectId),
      integrationCanonicalIdentityApi.listRoutes(selectedProjectId),
    ]);
    if (requestEpoch !== epoch || selectedProjectId !== props.projectId) return;
    definitions.value = definitionResult;
    routes.value = routeResult.items;
    const requestedEventStillExists = definitionResult.some(
      ({ id }) => id === eventDefinitionKeyId.value,
    );
    eventDefinitionKeyId.value = requestedEventStillExists
      ? eventDefinitionKeyId.value
      : (definitionResult[0]?.id ?? "");
    if (eventDefinitionKeyId.value)
      await loadCurrent(
        selectedProjectId,
        eventDefinitionKeyId.value,
        requestEpoch,
      );
  } catch {
    if (requestEpoch === epoch && selectedProjectId === props.projectId)
      loadError.value = "Не удалось загрузить canonical identity policies.";
  } finally {
    if (requestEpoch === epoch && selectedProjectId === props.projectId)
      loading.value = false;
  }
}

async function selectEvent(): Promise<void> {
  const requestEpoch = ++epoch;
  const selectedProjectId = props.projectId;
  const selectedEventId = eventDefinitionKeyId.value;
  resetDraft();
  currentPolicy.value = null;
  canonicalKeyName.value = "";
  selectedRouteIds.value = [];
  if (!selectedProjectId || !selectedEventId || !props.canRead) return;
  loading.value = true;
  loadError.value = "";
  try {
    await loadCurrent(selectedProjectId, selectedEventId, requestEpoch);
  } catch {
    if (requestEpoch === epoch)
      loadError.value = "Не удалось загрузить policy выбранного события.";
  } finally {
    if (requestEpoch === epoch) loading.value = false;
  }
}

async function runPreview(): Promise<void> {
  if (!canPreview.value) {
    actionError.value =
      "Выберите минимум два маршрута разных провайдеров со стабильным canonical key.";
    return;
  }
  const selectedProjectId = props.projectId;
  const selectedEventId = eventDefinitionKeyId.value;
  const requestEpoch = epoch;
  pending.value = true;
  actionError.value = "";
  notice.value = "";
  try {
    const result = await integrationCanonicalIdentityApi.preview(
      selectedProjectId,
      selectedEventId,
      {
        canonicalKeyName: canonicalKeyName.value.trim(),
        participants: participants(),
      },
    );
    if (
      requestEpoch !== epoch ||
      selectedProjectId !== props.projectId ||
      selectedEventId !== eventDefinitionKeyId.value
    )
      return;
    preview.value = result;
  } catch (cause) {
    if (requestEpoch === epoch) actionError.value = policyError(cause);
  } finally {
    if (requestEpoch === epoch) pending.value = false;
  }
}

function publishKey(signature: string): string {
  if (publishRetry?.signature === signature) return publishRetry.key;
  publishRetry = { signature, key: crypto.randomUUID() };
  return publishRetry.key;
}

async function publish(): Promise<void> {
  const snapshot = preview.value;
  if (!props.canManage || !snapshot || pending.value) return;
  const selectedProjectId = props.projectId;
  const selectedEventId = eventDefinitionKeyId.value;
  const selectedParticipants = participants();
  const signature = JSON.stringify({
    selectedProjectId,
    selectedEventId,
    canonicalKeyName: snapshot.canonicalKeyName,
    expectedVersion: snapshot.expectedVersion,
    participants: selectedParticipants,
  });
  pending.value = true;
  actionError.value = "";
  notice.value = "";
  try {
    await integrationCanonicalIdentityApi.publish(
      selectedProjectId,
      selectedEventId,
      {
        canonicalKeyName: snapshot.canonicalKeyName,
        expectedVersion: snapshot.expectedVersion,
        participants: selectedParticipants,
        reason: "Публикация canonical identity policy через CMS",
      },
      publishKey(signature),
    );
    if (
      selectedProjectId !== props.projectId ||
      selectedEventId !== eventDefinitionKeyId.value
    )
      return;
    publishRetry = null;
    preview.value = null;
    await loadCurrent(selectedProjectId, selectedEventId, epoch);
    notice.value = "Canonical identity policy опубликована.";
  } catch (cause) {
    if (selectedProjectId === props.projectId)
      actionError.value = policyError(cause);
  } finally {
    if (selectedProjectId === props.projectId) pending.value = false;
  }
}

watch(
  () => [props.projectId, props.canRead] as const,
  () => void load(),
);
watch([canonicalKeyName, selectedRouteIds], resetDraft, { deep: true });
onMounted(() => void load());
</script>

<template>
  <section v-if="canRead" class="integration-card canonical-policy-card">
    <div class="card-heading">
      <div>
        <h2>Canonical identity policy</h2>
        <p>
          Объединяет одинаковое бизнес-событие от разных провайдеров по
          стабильному ключу.
        </p>
      </div>
      <button
        type="button"
        class="secondary"
        :disabled="loading || pending"
        @click="load"
      >
        Обновить
      </button>
    </div>

    <p v-if="loadError" class="feedback error" role="alert">{{ loadError }}</p>
    <p v-if="actionError" class="feedback error" role="alert">
      {{ actionError }}
    </p>
    <p v-if="notice" class="feedback success" role="status">{{ notice }}</p>
    <p v-if="loading" class="empty-state">Загружаем canonical policy…</p>

    <label v-if="definitions.length" class="integration-field">
      <span>Событие Lola</span>
      <select
        v-model="eventDefinitionKeyId"
        name="canonicalEventDefinition"
        @change="selectEvent"
      >
        <option
          v-for="definition in definitions"
          :key="definition.id"
          :value="definition.id"
        >
          {{ definition.name }} · {{ definition.code }}
        </option>
      </select>
    </label>

    <p v-if="!loading && !definitions.length && !loadError" class="empty-state">
      Нет опубликованных событий для canonical policy.
    </p>

    <template v-if="currentPolicy">
      <div class="card-heading policy-revision-heading">
        <h3>Текущая policy · Ревизия {{ currentPolicy.revision }}</h3>
        <span class="status-pill" :data-state="currentPolicy.runtimeActivation">
          {{ activationLabel(currentPolicy.runtimeActivation) }}
        </span>
      </div>
      <dl class="integration-metadata">
        <div>
          <dt>Canonical key</dt>
          <dd>
            <code>{{ currentPolicy.canonicalKeyName }}</code>
          </dd>
        </div>
        <div>
          <dt>Revision ID</dt>
          <dd>
            <code>{{ currentPolicy.policyRevisionId }}</code>
          </dd>
        </div>
      </dl>
      <ul class="activity-list">
        <li
          v-for="participant in currentPolicy.participants"
          :key="participant.routeRevisionId"
        >
          <strong
            >{{ providerLabel(participant.provider) }} ·
            {{ routeName(participant.routeId) }}</strong
          >
          <span
            ><code>{{ participant.sourcePath.join(".") }}</code> ·
            {{ normalizationLabel(participant.normalization) }}</span
          >
        </li>
      </ul>
    </template>

    <form
      v-if="canManage && eventDefinitionKeyId"
      class="route-form"
      data-form="canonical-policy"
      @submit.prevent="runPreview"
    >
      <h3>{{ currentPolicy ? "Новая ревизия policy" : "Новая policy" }}</h3>
      <label>
        <span>Имя canonical key</span>
        <input
          v-model="canonicalKeyName"
          name="canonicalKeyName"
          maxlength="64"
          required
        />
      </label>
      <fieldset class="mapping-fields">
        <legend>Участники — минимум два разных провайдера</legend>
        <small
          >Показываются только маршруты, закреплённые за текущей ревизией
          события.</small
        >
        <label
          v-for="route in eligibleRoutes"
          :key="route.id"
          class="mapping-row"
        >
          <input
            v-model="selectedRouteIds"
            name="canonicalParticipant"
            type="checkbox"
            :value="route.id"
          />
          <span>
            <strong
              >{{ providerLabel(route.publishedRevision!.provider) }} ·
              {{ route.name }}</strong
            ><br />
            <code>{{
              route.publishedRevision!.canonicalKeyExtractor!.sourcePath.join(
                ".",
              )
            }}</code>
            ·
            {{
              normalizationLabel(
                route.publishedRevision!.canonicalKeyExtractor!.normalization,
              )
            }}
          </span>
        </label>
        <p v-if="!eligibleRoutes.length" class="empty-state">
          Сначала опубликуйте входящие маршруты с canonical key extractor.
        </p>
      </fieldset>
      <p class="read-only-note">
        Повтор одного canonical key будет принят только один раз. Одинаковый
        ключ с разным payload будет конфликтом, а не автоматическим merge.
      </p>
      <button
        type="submit"
        data-action="preview-canonical-policy"
        :disabled="!canPreview"
      >
        Проверить policy
      </button>
    </form>

    <section v-if="preview" class="route-form" data-preview="canonical-policy">
      <h3>Preview перед публикацией</h3>
      <p>
        Version {{ preview.expectedVersion }} · key
        <code>{{ preview.canonicalKeyName }}</code>
      </p>
      <p>{{ activationLabel(preview.runtimeActivation) }}</p>
      <ul class="activity-list">
        <li
          v-for="participant in preview.participants"
          :key="participant.routeRevisionId"
        >
          <strong>{{ providerLabel(participant.provider) }}</strong>
          <span
            ><code>{{ participant.sourcePath.join(".") }}</code> ·
            {{ normalizationLabel(participant.normalization) }}</span
          >
        </li>
      </ul>
      <button
        v-if="canManage"
        type="button"
        data-action="publish-canonical-policy"
        :disabled="pending || !preview.publishable"
        @click="publish"
      >
        Опубликовать атомарно
      </button>
    </section>
  </section>
</template>
