<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { integrationActivityRepository } from "../api";
import {
  activityOriginLabel,
  activityStateLabel,
  activityStatusLabel,
  activityStatusOptions,
  activityStatusSeverity,
  activityTypeLabel,
  type IntegrationActivityContent,
  type IntegrationActivityDetail,
  type IntegrationActivityFilters,
  type IntegrationActivityItem,
  type IntegrationActivityStatus,
  type IntegrationActivityType,
} from "../model/integration-activity";
import { formatDate, relativeTime } from "@/shared/lib/format";

interface FailedPageRequest {
  cursor: string | undefined;
  index: number;
  filters: IntegrationActivityFilters;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const providerValues = ["TELEGRAM"];
const typeValues: IntegrationActivityType[] = [
  "CONNECTION",
  "PERSONAL_MESSAGE",
];
const statusValues: IntegrationActivityStatus[] = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "OUTCOME_UNKNOWN",
];
const items = ref<IntegrationActivityItem[]>([]);
const nextCursor = ref<string | null>(null);
const pageCursors = ref<Array<string | undefined>>([undefined]);
const pageIndex = ref(0);
const loading = ref(false);
const detailLoading = ref(false);
const contentLoading = ref(false);
const error = ref("");
const detailError = ref("");
const contentError = ref("");
const filterError = ref("");
const selectedItem = ref<IntegrationActivityItem | null>(null);
const detail = ref<IntegrationActivityDetail | null>(null);
const content = ref<IntegrationActivityContent | null>(null);
const advancedFilters = ref(false);
const failedRequest = ref<FailedPageRequest | null>(null);
const filters = reactive({
  provider: queryValues("provider").filter((value) =>
    providerValues.includes(value),
  ),
  activityType: queryValues("activityType").filter(
    (value): value is IntegrationActivityType =>
      typeValues.includes(value as IntegrationActivityType),
  ),
  status: queryValues("activityStatus").filter(
    (value): value is IntegrationActivityStatus =>
      statusValues.includes(value as IntegrationActivityStatus),
  ),
  externalUserId: queryValue("user"),
  createdFrom: queryValue("createdFrom"),
  createdTo: queryValue("createdTo"),
  limit: [25, 50, 100].includes(Number(queryValue("limit")))
    ? Number(queryValue("limit"))
    : 25,
});
const appliedFilters = ref<IntegrationActivityFilters>({});
const canRead = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.integration_activity.read",
  ),
);
const canReadContent = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.integration_message_content.read",
  ),
);
const activeFilterCount = computed(
  () =>
    [
      filters.provider.length,
      filters.activityType.length,
      filters.status.length,
      filters.externalUserId.trim(),
      filters.createdFrom,
      filters.createdTo,
    ].filter(Boolean).length,
);
const failedCount = computed(
  () =>
    items.value.filter(
      (item) => item.status === "FAILED" || item.status === "OUTCOME_UNKNOWN",
    ).length,
);
const pendingCount = computed(
  () => items.value.filter((item) => item.status === "PENDING").length,
);
const providerOptions = [{ label: "Telegram", value: "TELEGRAM" }];
const typeOptions = [
  { label: "Подключение", value: "CONNECTION" },
  { label: "Личное сообщение", value: "PERSONAL_MESSAGE" },
];
const limitOptions = [25, 50, 100].map((value) => ({
  label: `${value} на странице`,
  value,
}));
let projectGeneration = 0;
let listSequence = 0;
let detailSequence = 0;
let contentSequence = 0;

function queryValue(key: string): string {
  return typeof route.query[key] === "string" ? route.query[key] : "";
}

function queryValues(key: string): string[] {
  const raw = route.query[key];
  const values = Array.isArray(raw) ? raw : [raw];
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  ];
}

function buildFilters(): IntegrationActivityFilters {
  return {
    ...(filters.provider.length ? { provider: [...filters.provider] } : {}),
    ...(filters.activityType.length
      ? { activityType: [...filters.activityType] }
      : {}),
    ...(filters.status.length ? { status: [...filters.status] } : {}),
    ...(filters.externalUserId.trim()
      ? { externalUserId: filters.externalUserId.trim() }
      : {}),
    ...(filters.createdFrom ? { createdFrom: toIso(filters.createdFrom) } : {}),
    ...(filters.createdTo ? { createdTo: toIso(filters.createdTo) } : {}),
    limit: filters.limit,
  };
}

function toIso(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

async function initializeProject() {
  resetProjectState();
  if (!canRead.value) return;
  appliedFilters.value = buildFilters();
  await loadPage(undefined, 0, appliedFilters.value);
}

function resetProjectState() {
  projectGeneration += 1;
  listSequence += 1;
  detailSequence += 1;
  contentSequence += 1;
  items.value = [];
  nextCursor.value = null;
  pageCursors.value = [undefined];
  pageIndex.value = 0;
  selectedItem.value = null;
  detail.value = null;
  content.value = null;
  failedRequest.value = null;
  loading.value = false;
  detailLoading.value = false;
  contentLoading.value = false;
  error.value = "";
  detailError.value = "";
  contentError.value = "";
}

onMounted(initializeProject);
watch(
  () => [auth.project?.id, canRead.value] as const,
  ([projectId, readable], [previousProjectId, previousReadable]) => {
    if (projectId === previousProjectId && readable === previousReadable)
      return;
    void initializeProject();
  },
);
watch(canReadContent, (readable, previousReadable) => {
  if (readable || !previousReadable) return;
  contentSequence += 1;
  content.value = null;
  contentLoading.value = false;
  contentError.value = "";
});

async function loadPage(
  cursor: string | undefined,
  index: number,
  requestFilters = appliedFilters.value,
) {
  const projectId = auth.project?.id;
  if (!projectId || !canRead.value) return false;
  const generation = projectGeneration;
  const sequence = ++listSequence;
  loading.value = true;
  error.value = "";
  try {
    const page = await integrationActivityRepository.list(projectId, {
      ...requestFilters,
      ...(cursor ? { cursor } : {}),
    });
    if (
      sequence !== listSequence ||
      generation !== projectGeneration ||
      auth.project?.id !== projectId
    )
      return false;
    items.value = page.items;
    nextCursor.value = page.nextCursor;
    pageIndex.value = index;
    failedRequest.value = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  } catch (cause) {
    if (
      sequence !== listSequence ||
      generation !== projectGeneration ||
      auth.project?.id !== projectId
    )
      return false;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить журнал интеграций";
    failedRequest.value = {
      cursor,
      index,
      filters: { ...requestFilters },
    };
    return false;
  } finally {
    if (sequence === listSequence && generation === projectGeneration)
      loading.value = false;
  }
}

function validateDates(): boolean {
  const from = filters.createdFrom
    ? new Date(filters.createdFrom).getTime()
    : null;
  const to = filters.createdTo ? new Date(filters.createdTo).getTime() : null;
  filterError.value =
    from !== null && to !== null && from >= to
      ? "Дата «с» должна быть раньше даты «по»."
      : "";
  return !filterError.value;
}

async function applyFilters() {
  if (!validateDates()) return;
  const next = buildFilters();
  const loaded = await loadPage(undefined, 0, next);
  if (!loaded) return;
  appliedFilters.value = next;
  pageCursors.value = [undefined];
  void router.replace({
    query: {
      tab: "integrations",
      ...(next.provider ? { provider: next.provider } : {}),
      ...(next.activityType ? { activityType: next.activityType } : {}),
      ...(next.status ? { activityStatus: next.status } : {}),
      ...(next.externalUserId ? { user: next.externalUserId } : {}),
      ...(next.createdFrom ? { createdFrom: next.createdFrom } : {}),
      ...(next.createdTo ? { createdTo: next.createdTo } : {}),
      ...(next.limit !== 25 ? { limit: String(next.limit) } : {}),
    },
  });
}

function resetFilters() {
  Object.assign(filters, {
    provider: [],
    activityType: [],
    status: [],
    externalUserId: "",
    createdFrom: "",
    createdTo: "",
    limit: 25,
  });
  filterError.value = "";
  return applyFilters();
}

function refresh() {
  pageCursors.value = [undefined];
  return loadPage(undefined, 0);
}

function nextPage() {
  if (!nextCursor.value) return;
  const nextIndex = pageIndex.value + 1;
  pageCursors.value[nextIndex] = nextCursor.value;
  return loadPage(nextCursor.value, nextIndex);
}

function previousPage() {
  if (pageIndex.value === 0) return;
  const previousIndex = pageIndex.value - 1;
  return loadPage(pageCursors.value[previousIndex], previousIndex);
}

function retryFailedRequest() {
  const request = failedRequest.value;
  if (!request) return;
  return loadPage(request.cursor, request.index, request.filters);
}

async function openDetail(item: IntegrationActivityItem) {
  const projectId = auth.project?.id;
  if (!projectId) return;
  const sequence = ++detailSequence;
  contentSequence += 1;
  selectedItem.value = item;
  detail.value = null;
  content.value = null;
  detailError.value = "";
  contentError.value = "";
  detailLoading.value = true;
  try {
    const loaded = await integrationActivityRepository.get(projectId, item.id);
    if (
      sequence === detailSequence &&
      auth.project?.id === projectId &&
      selectedItem.value?.id === item.id
    )
      detail.value = loaded;
  } catch (cause) {
    if (sequence === detailSequence)
      detailError.value =
        cause instanceof Error ? cause.message : "Детали не загружены";
  } finally {
    if (sequence === detailSequence) detailLoading.value = false;
  }
}

async function revealContent() {
  const projectId = auth.project?.id;
  const current = detail.value;
  if (
    !projectId ||
    !current ||
    !canReadContent.value ||
    current.contentState !== "AVAILABLE"
  )
    return;
  const sequence = ++contentSequence;
  contentLoading.value = true;
  contentError.value = "";
  try {
    const loaded = await integrationActivityRepository.content(
      projectId,
      current.id,
    );
    if (
      sequence === contentSequence &&
      detail.value?.id === current.id &&
      auth.project?.id === projectId &&
      canReadContent.value
    )
      content.value = loaded;
  } catch (cause) {
    if (sequence === contentSequence)
      contentError.value =
        cause instanceof Error ? cause.message : "Содержимое не загружено";
  } finally {
    if (sequence === contentSequence) contentLoading.value = false;
  }
}

function closeDetail() {
  detailSequence += 1;
  contentSequence += 1;
  selectedItem.value = null;
  detail.value = null;
  content.value = null;
  detailError.value = "";
  contentError.value = "";
}

function providerLabel(provider: string): string {
  return provider === "TELEGRAM" ? "Telegram" : provider;
}

function providerIcon(provider: string): string {
  return provider === "TELEGRAM" ? "pi pi-send" : "pi pi-link";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}
</script>

<template>
  <section class="integration-activity-log-view">
    <div class="activity-toolbar">
      <div class="activity-summary" aria-label="Сводка журнала интеграций">
        <span><i class="pi pi-database" /> {{ items.length }} на странице</span>
        <span v-if="pendingCount" class="pending"
          ><i class="pi pi-clock" /> {{ pendingCount }} ожидают</span
        >
        <span v-if="failedCount" class="danger"
          ><i class="pi pi-exclamation-circle" /> {{ failedCount }} требуют
          внимания</span
        >
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="loading"
        @click="refresh"
      />
    </div>

    <Message v-if="!canRead" severity="warn" :closable="false">
      Нет доступа к журналу интеграций.
    </Message>
    <template v-else>
      <section class="activity-filters card">
        <div class="filter-grid">
          <div class="field">
            <label for="integration-provider">Интеграция</label>
            <MultiSelect
              id="integration-provider"
              v-model="filters.provider"
              :options="providerOptions"
              option-label="label"
              option-value="value"
              display="chip"
              placeholder="Все интеграции"
            />
          </div>
          <div class="field">
            <label for="integration-type">Тип активности</label>
            <MultiSelect
              id="integration-type"
              v-model="filters.activityType"
              :options="typeOptions"
              option-label="label"
              option-value="value"
              display="chip"
              placeholder="Все типы"
            />
          </div>
          <div class="field">
            <label for="integration-status">Статус</label>
            <MultiSelect
              id="integration-status"
              v-model="filters.status"
              :options="activityStatusOptions"
              option-label="label"
              option-value="value"
              display="chip"
              placeholder="Все статусы"
              :max-selected-labels="1"
              selected-items-label="{0} статуса"
            />
          </div>
          <div class="field user-field">
            <label for="integration-user">External user ID</label>
            <span class="input-icon"
              ><i class="pi pi-user" /><InputText
                id="integration-user"
                v-model="filters.externalUserId"
                class="mono"
                placeholder="customer_42"
                @keydown.enter="applyFilters"
            /></span>
          </div>
        </div>
        <div v-if="advancedFilters" class="date-grid">
          <div class="field">
            <label for="integration-created-from">Создано с</label>
            <InputText
              id="integration-created-from"
              v-model="filters.createdFrom"
              type="datetime-local"
            />
          </div>
          <div class="field">
            <label for="integration-created-to">Создано по</label>
            <InputText
              id="integration-created-to"
              v-model="filters.createdTo"
              type="datetime-local"
            />
          </div>
        </div>
        <Message
          v-if="filterError"
          severity="warn"
          size="small"
          :closable="false"
          >{{ filterError }}</Message
        >
        <footer>
          <button
            type="button"
            class="advanced-button"
            @click="advancedFilters = !advancedFilters"
          >
            <i
              :class="advancedFilters ? 'pi pi-chevron-up' : 'pi pi-calendar'"
            />
            {{ advancedFilters ? "Скрыть даты" : "Период создания" }}
          </button>
          <span v-if="activeFilterCount" class="filter-count"
            >{{ activeFilterCount }} активных</span
          >
          <Button
            v-if="activeFilterCount"
            label="Сбросить"
            severity="secondary"
            text
            size="small"
            @click="resetFilters"
          />
          <Select
            v-model="filters.limit"
            :options="limitOptions"
            option-label="label"
            option-value="value"
            class="limit-select"
          />
          <Button label="Применить" icon="pi pi-search" @click="applyFilters" />
        </footer>
      </section>

      <div class="snapshot-note" tabindex="0">
        <i class="pi pi-lock" />
        <span
          ><strong>Стабильный снимок</strong> Новые записи появятся после
          обновления; статусы текущих записей остаются актуальными.</span
        >
      </div>
      <Message v-if="error" severity="error" :closable="false">
        <div class="message-row">
          <span>{{ error }}</span>
          <Button
            label="Повторить"
            size="small"
            text
            @click="retryFailedRequest"
          />
        </div>
      </Message>

      <div v-if="loading" class="loading-list card">
        <Skeleton v-for="index in 7" :key="index" height="66px" />
      </div>
      <div v-else-if="!items.length" class="empty card">
        <span class="empty-icon"><i class="pi pi-inbox" /></span>
        <strong>Активность интеграций не найдена</strong>
        <p>Измените фильтры или дождитесь нового подключения или сообщения.</p>
        <Button
          v-if="activeFilterCount"
          label="Сбросить фильтры"
          severity="secondary"
          @click="resetFilters"
        />
      </div>

      <div v-else class="activity-table card">
        <DataTable
          :value="items"
          data-key="id"
          row-hover
          table-style="min-width: 860px"
          @row-click="openDetail($event.data)"
        >
          <Column header="Активность">
            <template #body="{ data }">
              <div class="activity-cell">
                <span class="provider-mark"
                  ><i :class="providerIcon(data.provider)"
                /></span>
                <div>
                  <strong>{{ activityStateLabel(data.state) }}</strong>
                  <small
                    >{{ providerLabel(data.provider) }} ·
                    {{ activityTypeLabel(data.activityType) }}</small
                  >
                </div>
              </div>
            </template>
          </Column>
          <Column header="Пользователь">
            <template #body="{ data }">
              <strong class="mono user-id">{{
                data.endUser.externalId
              }}</strong>
            </template>
          </Column>
          <Column header="Источник">
            <template #body="{ data }">
              <div class="origin-cell">
                <i
                  :class="
                    data.origin.kind === 'AI'
                      ? 'pi pi-sparkles'
                      : data.origin.kind === 'CMS_USER'
                        ? 'pi pi-user-edit'
                        : 'pi pi-cog'
                  "
                />
                <span>{{ activityOriginLabel(data.origin.kind) }}</span>
              </div>
            </template>
          </Column>
          <Column header="Статус">
            <template #body="{ data }">
              <Tag
                :value="activityStatusLabel(data.status)"
                :severity="activityStatusSeverity(data.status)"
                rounded
              />
            </template>
          </Column>
          <Column header="Создано">
            <template #body="{ data }">
              <div class="time-cell">
                <strong :title="formatDate(data.createdAt)">{{
                  relativeTime(data.createdAt)
                }}</strong>
                <small>{{
                  new Date(data.createdAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }}</small>
              </div>
            </template>
          </Column>
          <Column>
            <template #body="{ data }">
              <Button
                icon="pi pi-chevron-right"
                text
                rounded
                severity="secondary"
                :aria-label="`Открыть ${activityStateLabel(data.state)}`"
                @click.stop="openDetail(data)"
              />
            </template>
          </Column>
        </DataTable>
      </div>

      <div v-if="items.length" class="activity-cards">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="activity-card card"
          @click="openDetail(item)"
        >
          <span class="card-top"
            ><span class="provider-mark"
              ><i :class="providerIcon(item.provider)" /></span
            ><span class="card-title"
              ><strong>{{ activityStateLabel(item.state) }}</strong
              ><small
                >{{ providerLabel(item.provider) }} ·
                {{ activityTypeLabel(item.activityType) }}</small
              ></span
            ><Tag
              :value="activityStatusLabel(item.status)"
              :severity="activityStatusSeverity(item.status)"
              rounded
          /></span>
          <span class="card-meta"
            ><span class="mono"
              ><i class="pi pi-user" /> {{ item.endUser.externalId }}</span
            ><span
              ><i class="pi pi-clock" />
              {{ relativeTime(item.createdAt) }}</span
            ></span
          >
        </button>
      </div>

      <footer v-if="items.length" class="pagination">
        <span>Страница {{ pageIndex + 1 }} · {{ items.length }} записей</span>
        <div>
          <Button
            label="Назад"
            icon="pi pi-arrow-left"
            severity="secondary"
            outlined
            :disabled="pageIndex === 0 || loading"
            @click="previousPage"
          />
          <Button
            label="Дальше"
            icon="pi pi-arrow-right"
            icon-pos="right"
            :disabled="!nextCursor || loading"
            @click="nextPage"
          />
        </div>
      </footer>
    </template>
  </section>

  <Drawer
    :visible="Boolean(selectedItem)"
    position="right"
    :style="{ width: 'min(700px, 100vw)' }"
    @update:visible="!$event && closeDetail()"
  >
    <template #header>
      <div v-if="selectedItem" class="drawer-title">
        <div class="drawer-provider">
          <span class="provider-mark"
            ><i :class="providerIcon(selectedItem.provider)"
          /></span>
          <div>
            <div class="eyebrow">
              {{ providerLabel(selectedItem.provider) }} · Integration activity
            </div>
            <h2>{{ activityStateLabel(selectedItem.state) }}</h2>
          </div>
        </div>
      </div>
    </template>

    <div v-if="selectedItem" class="detail-stack">
      <Skeleton v-if="detailLoading" height="180px" />
      <Message v-else-if="detailError" severity="error" :closable="false">
        {{ detailError }}
      </Message>
      <template v-else-if="detail">
        <section class="detail-hero">
          <div>
            <span>Статус</span>
            <Tag
              :value="activityStatusLabel(detail.status)"
              :severity="activityStatusSeverity(detail.status)"
            />
          </div>
          <div>
            <span>Пользователь</span>
            <strong class="mono">{{ detail.endUser.externalId }}</strong>
          </div>
          <div>
            <span>Источник</span>
            <strong>{{ activityOriginLabel(detail.origin.kind) }}</strong>
          </div>
          <div>
            <span>Создано</span>
            <strong>{{ formatDate(detail.createdAt) }}</strong>
          </div>
        </section>

        <Message
          v-if="detail.status === 'OUTCOME_UNKNOWN'"
          severity="warn"
          :closable="false"
        >
          Lola не может доказать итог доставки. Это не означает, что сообщение
          точно не доставлено.
        </Message>
        <Message
          v-else-if="detail.status === 'FAILED'"
          severity="error"
          :closable="false"
        >
          <strong>Операция завершилась ошибкой</strong>
          <span v-if="detail.errorCode" class="mono">{{
            detail.errorCode
          }}</span>
        </Message>

        <section
          v-if="detail.milestones.length || detail.attempts.length"
          class="detail-section"
        >
          <header>
            <span class="section-index">01</span>
            <div>
              <h3>Технический путь</h3>
              <p>
                {{
                  detail.activityType === "CONNECTION"
                    ? "Этапы подключения"
                    : "Попытки доставки"
                }}
              </p>
            </div>
          </header>
          <ol v-if="detail.milestones.length" class="history-list">
            <li
              v-for="milestone in detail.milestones"
              :key="`${milestone.state}-${milestone.at}`"
            >
              <i class="pi pi-check-circle" />
              <span
                ><strong>{{ activityStateLabel(milestone.state) }}</strong
                ><small>{{ formatDate(milestone.at) }}</small></span
              >
            </li>
          </ol>
          <ol v-else class="history-list">
            <li v-for="attempt in detail.attempts" :key="attempt.attemptNumber">
              <i
                :class="
                  attempt.outcome === 'ACCEPTED'
                    ? 'pi pi-check-circle'
                    : 'pi pi-refresh'
                "
              />
              <span
                ><strong
                  >Попытка {{ attempt.attemptNumber }} ·
                  {{ attempt.outcome }}</strong
                ><small
                  >{{ formatDate(attempt.finishedAt)
                  }}<template v-if="attempt.retryAfterMs">
                    · повтор через
                    {{ Math.ceil(attempt.retryAfterMs / 1000) }} сек.</template
                  ></small
                ><code v-if="attempt.errorCode">{{
                  attempt.errorCode
                }}</code></span
              >
            </li>
          </ol>
        </section>

        <section class="detail-section content-section">
          <header>
            <span class="section-index">{{
              detail.milestones.length || detail.attempts.length ? "02" : "01"
            }}</span>
            <div>
              <h3>Содержимое сообщения</h3>
              <p>Загружается отдельно и фиксируется в аудите</p>
            </div>
          </header>
          <template v-if="detail.activityType !== 'PERSONAL_MESSAGE'">
            <div class="content-placeholder">
              <i class="pi pi-minus-circle" />
              Для подключения содержимое не применяется.
            </div>
          </template>
          <template v-else-if="detail.contentState === 'REDACTED'">
            <div class="content-placeholder">
              <i class="pi pi-clock" />
              Содержимое удалено по политике хранения.
            </div>
          </template>
          <template v-else-if="content">
            <div
              v-if="content.state === 'REDACTED'"
              class="content-placeholder"
            >
              <i class="pi pi-clock" />
              Содержимое удалено по политике хранения.
            </div>
            <div v-else class="message-preview">
              <div class="message-preview-head">
                <span
                  ><i class="pi pi-lock-open" /> Раскрыто для этой сессии</span
                >
                <Tag :value="content.kind" severity="secondary" />
              </div>
              <p v-if="content.text" class="message-content">
                {{ content.text }}
              </p>
              <div v-if="content.attachment" class="attachment">
                <i class="pi pi-paperclip" />
                <span
                  ><strong>{{ content.attachment.filename }}</strong
                  ><small
                    >{{ content.attachment.mimeType }} ·
                    {{ formatBytes(content.attachment.sizeBytes) }}</small
                  ></span
                >
              </div>
            </div>
          </template>
          <template v-else-if="canReadContent">
            <Button
              label="Показать содержимое"
              icon="pi pi-eye"
              severity="secondary"
              outlined
              :loading="contentLoading"
              @click="revealContent"
            />
            <Message
              v-if="contentError"
              severity="error"
              size="small"
              :closable="false"
            >
              <div class="message-row">
                <span>{{ contentError }}</span>
                <Button
                  label="Повторить"
                  text
                  size="small"
                  @click="revealContent"
                />
              </div>
            </Message>
          </template>
          <div v-else class="content-placeholder">
            <i class="pi pi-lock" />
            Требуется отдельное разрешение на просмотр содержимого.
          </div>
        </section>

        <section class="detail-section technical-section">
          <header>
            <span class="section-index">{{
              detail.milestones.length || detail.attempts.length ? "03" : "02"
            }}</span>
            <div>
              <h3>Диагностика</h3>
              <p>Без Telegram identifiers и provider payload</p>
            </div>
          </header>
          <dl>
            <div>
              <dt>Activity ID</dt>
              <dd class="mono">{{ detail.id }}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd class="mono">{{ detail.sourceResourceKind }}</dd>
            </div>
            <div v-if="detail.requestId">
              <dt>Request ID</dt>
              <dd class="mono">{{ detail.requestId }}</dd>
            </div>
            <div v-if="detail.correlationId">
              <dt>Correlation ID</dt>
              <dd class="mono">{{ detail.correlationId }}</dd>
            </div>
            <div>
              <dt>Обновлено</dt>
              <dd>{{ formatDate(detail.updatedAt) }}</dd>
            </div>
            <div v-if="detail.finishedAt">
              <dt>Завершено</dt>
              <dd>{{ formatDate(detail.finishedAt) }}</dd>
            </div>
          </dl>
        </section>
      </template>
    </div>
  </Drawer>
</template>

<style scoped>
.integration-activity-log-view {
  min-width: 0;
}
.activity-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.activity-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.activity-summary span,
.snapshot-note {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.7rem;
}
.activity-summary span {
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-card);
}
.activity-summary .pending {
  color: var(--status-warning-text);
  border-color: color-mix(in srgb, var(--status-warning-text) 24%, var(--line));
}
.activity-summary .danger {
  color: var(--status-danger-text);
  border-color: color-mix(in srgb, var(--status-danger-text) 22%, var(--line));
}
.activity-filters {
  padding: 17px;
  margin-bottom: 12px;
}
.filter-grid {
  display: grid;
  grid-template-columns: 0.8fr 1fr 1fr 1.2fr;
  gap: 10px;
}
.date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-width: 660px;
  padding-top: 13px;
  margin-top: 13px;
  border-top: 1px solid var(--line);
}
.field {
  min-width: 0;
  gap: 5px;
}
.field label {
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.field :deep(.p-multiselect),
.field :deep(.p-inputtext) {
  width: 100%;
}
.input-icon {
  position: relative;
  display: block;
}
.input-icon > i {
  position: absolute;
  z-index: 1;
  left: 12px;
  top: 50%;
  color: var(--text-secondary);
  transform: translateY(-50%);
}
.input-icon :deep(input) {
  padding-left: 36px;
}
.activity-filters footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 13px;
}
.advanced-button {
  margin-right: auto;
  padding: 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.advanced-button i {
  margin-right: 5px;
}
.filter-count {
  padding: 5px 8px;
  border-radius: 9px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 0.65rem;
}
.limit-select {
  width: 160px;
}
.snapshot-note {
  width: 100%;
  margin-bottom: 12px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-card) 82%, transparent);
}
.snapshot-note i {
  color: var(--text-brand);
}
.snapshot-note strong {
  color: var(--ink);
}
.message-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.loading-list {
  display: grid;
  gap: 6px;
  padding: 8px;
}
.activity-table {
  overflow: hidden;
}
.activity-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}
.activity-table :deep(.p-datatable-tbody > tr:hover) {
  background: color-mix(in srgb, var(--brand-soft) 28%, transparent);
}
.activity-cell,
.drawer-provider {
  display: flex;
  align-items: center;
  gap: 11px;
}
.activity-cell > div,
.card-title,
.drawer-provider > div {
  display: grid;
  gap: 3px;
}
.activity-cell small,
.card-title small,
.time-cell small {
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.provider-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: linear-gradient(
    145deg,
    var(--status-info),
    var(--action-primary)
  );
  color: var(--on-status-info);
  box-shadow: var(--shadow-raised);
}
.provider-mark i {
  transform: translate(-1px, 1px);
}
.user-id {
  font-size: 0.76rem;
}
.origin-cell {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.origin-cell i {
  color: var(--text-brand);
}
.time-cell {
  display: grid;
  gap: 2px;
  white-space: nowrap;
}
.activity-cards {
  display: none;
}
.activity-card {
  display: grid;
  gap: 13px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--line);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-title {
  flex: 1;
  min-width: 0;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 0.7rem;
}
.pagination > div {
  display: flex;
  gap: 8px;
}
.empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
}
.empty p {
  margin: 0 0 6px;
  color: var(--text-secondary);
}
.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 17px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 1.25rem;
}
.drawer-title h2 {
  margin: 2px 0 0;
  font-size: 1.1rem;
}
.detail-stack {
  display: grid;
  gap: 14px;
  padding-bottom: 30px;
}
.detail-hero {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--line);
}
.detail-hero > div {
  display: grid;
  gap: 5px;
  padding: 13px;
  background: var(--surface-card);
  min-width: 0;
}
.detail-hero span,
.technical-section dt {
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.detail-hero strong {
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-section {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--surface-card);
}
.detail-section > header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.detail-section header h3 {
  margin: 0;
  font-size: 0.9rem;
}
.detail-section header p {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.section-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 0.62rem;
  font-weight: 800;
}
.history-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.history-list li {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 0 0 17px;
}
.history-list li:not(:last-child)::before {
  position: absolute;
  top: 17px;
  bottom: 1px;
  left: 7px;
  width: 1px;
  background: var(--line);
  content: "";
}
.history-list li:last-child {
  padding-bottom: 0;
}
.history-list i {
  z-index: 1;
  margin-top: 2px;
  color: var(--text-brand);
  background: var(--surface-card);
}
.history-list li > span {
  display: grid;
  gap: 3px;
}
.history-list small {
  color: var(--text-secondary);
}
.history-list code {
  color: var(--status-danger-text);
  font-size: 0.67rem;
}
.content-placeholder {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px;
  border-radius: 12px;
  background: var(--surface-active);
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.message-preview {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--status-info) 24%, var(--line));
  border-radius: 14px;
  background: color-mix(
    in srgb,
    var(--status-info-soft) 45%,
    var(--surface-card)
  );
}
.message-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.message-content {
  margin: 0;
  padding: 16px;
  color: var(--ink);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.attachment {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 12px 12px;
  padding: 10px;
  border-radius: 10px;
  background: var(--surface-card);
}
.attachment > span {
  display: grid;
}
.attachment small {
  color: var(--text-secondary);
}
.technical-section dl {
  display: grid;
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--line);
}
.technical-section dl > div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  padding: 9px 11px;
  background: var(--surface-card);
}
.technical-section dt,
.technical-section dd {
  margin: 0;
}
.technical-section dd {
  overflow: hidden;
  color: var(--ink);
  font-size: 0.7rem;
  text-overflow: ellipsis;
}
@media (max-width: 1500px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 1120px) {
  .activity-table {
    display: none;
  }
  .activity-cards {
    display: grid;
    gap: 8px;
  }
}
@media (max-width: 760px) {
  .activity-toolbar {
    align-items: flex-start;
  }
  .activity-summary {
    gap: 5px;
  }
  .filter-grid,
  .date-grid {
    grid-template-columns: 1fr;
    max-width: none;
  }
  .activity-filters footer {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .advanced-button {
    width: 100%;
    margin: 0;
    text-align: left;
  }
  .filter-count {
    align-self: center;
  }
  .limit-select {
    flex: 1;
    min-width: 150px;
  }
  .pagination {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .pagination > div :deep(.p-button) {
    flex: 1;
  }
  .detail-hero {
    grid-template-columns: 1fr;
  }
  .technical-section dl > div {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
@media (max-width: 430px) {
  .activity-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .activity-summary span:first-child {
    display: none;
  }
  .activity-filters {
    padding: 13px;
  }
  .activity-filters footer :deep(.p-button) {
    flex: 1;
  }
  .card-top {
    align-items: flex-start;
  }
  .card-top :deep(.p-tag) {
    max-width: 105px;
    white-space: normal;
    text-align: center;
  }
  .card-meta {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
