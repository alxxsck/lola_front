<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { AI_USAGE_CATEGORY_LABELS } from "@/features/ai-usage/ai-usage.model";
import {
  compareDecimalStrings,
  decimalRatio,
  formatDecimalMoney,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import { aiCostsRepository } from "../api/ai-costs-repository";
import AiAllowanceJournalPanel from "./AiAllowanceJournalPanel.vue";
import AiAllowanceLimitsPanel from "./AiAllowanceLimitsPanel.vue";
import AiAllowanceUserDialog from "./AiAllowanceUserDialog.vue";
import {
  aiCostRouteQuery,
  parseAiCostRouteState,
  type AiCostCmsUserRow,
  type AiCostOverview,
  type AiCostPage,
  type AiCostPeriod,
  type AiCostRankedRow,
  type AiCostRouteState,
  type AiCostSortKey,
  type AiCostTab,
  type AiCostUserRow,
  projectTimezone,
} from "../model/ai-costs";

const PAGE_SIZE = 25;
const tabs: ReadonlyArray<{ key: AiCostTab; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "users", label: "Пользователи" },
  { key: "employees", label: "Сотрудники" },
  { key: "limits", label: "Лимиты" },
  { key: "journal", label: "Журнал и сверка" },
];
const periods: ReadonlyArray<{
  key: Exclude<AiCostPeriod, "custom">;
  label: string;
}> = [
  { key: "today", label: "Сегодня" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
];
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const overview = ref<AiCostOverview | null>(null);
const users = ref<AiCostPage<AiCostUserRow> | null>(null);
const employees = ref<AiCostPage<AiCostCmsUserRow> | null>(null);
const overviewLoading = ref(false);
const tableLoading = ref(false);
const error = ref("");
const customFrom = ref("");
const customTo = ref("");
const customError = ref("");
const selectedAllowanceUser = ref<AiCostUserRow | null>(null);
const freshLoginPending = ref(false);
const tablist = ref<HTMLElement | null>(null);
const loadedTableKey = ref("");
let generation = 0;
let overviewKey = "";

const customDateRange = computed<Date[] | null>({
  get: () => {
    const from = parseIsoDay(customFrom.value);
    const to = parseIsoDay(customTo.value);
    if (!from) return null;
    return to ? [from, to] : [from];
  },
  set: (range) => {
    customFrom.value = formatIsoDay(range?.[0]);
    customTo.value = formatIsoDay(range?.[1]);
    customError.value = "";
  },
});

const projectId = computed(() => auth.project?.id ?? null);
const configuredTimezone = computed(() =>
  projectTimezone(auth.project?.settings),
);
const state = computed(() =>
  parseAiCostRouteState(
    route.query as Record<string, string | string[] | null | undefined>,
    new Date(),
    configuredTimezone.value,
  ),
);
const canReadProfiles = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.profiles.read",
  ),
);
const canReadCmsUsers = computed(
  () =>
    auth.user?.platformPermissionCodes?.includes("platform.cms_users.read") ??
    false,
);
const permissionCodes = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canReadCosts = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_costs.read"),
);
const canReadAllowance = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_allowance.read"),
);
const canManageAllowance = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_allowance.manage"),
);
const canGrantAllowance = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_allowance.grant"),
);
const canReconcileAllowance = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_allowance.reconcile"),
);
const canReadAccrual = computed(() =>
  hasProjectPermission(
    permissionCodes.value,
    "project.ai_allowance.accrual_rules.read",
  ),
);
const canManageAccrual = computed(() =>
  hasProjectPermission(
    permissionCodes.value,
    "project.ai_allowance.accrual_rules.manage",
  ),
);
const canReadAccrualReceipts = computed(() =>
  hasProjectPermission(
    permissionCodes.value,
    "project.ai_allowance.accrual_receipts.read",
  ),
);
const canAccessAllowanceConfiguration = computed(
  () =>
    canReadAllowance.value ||
    canManageAllowance.value ||
    canGrantAllowance.value ||
    canReconcileAllowance.value ||
    canReadAccrual.value ||
    canReadAccrualReceipts.value ||
    canManageAccrual.value,
);
const visibleTabs = computed(() =>
  tabs.filter((tab) =>
    tab.key === "limits"
      ? canAccessAllowanceConfiguration.value
      : tab.key === "journal"
        ? canReadAllowance.value || canReconcileAllowance.value
        : canReadCosts.value,
  ),
);
const tableContextKey = computed(() =>
  JSON.stringify([
    projectId.value,
    canReadCosts.value,
    state.value.tab,
    state.value.from,
    state.value.to,
    state.value.page,
    state.value.sort,
    state.value.direction,
  ]),
);
const activePage = computed(() =>
  loadedTableKey.value !== tableContextKey.value
    ? null
    : state.value.tab === "users"
      ? users.value
      : state.value.tab === "employees"
        ? employees.value
        : null,
);
const displayedRows = computed<AiCostRankedRow[]>(() => {
  if (loadedTableKey.value !== tableContextKey.value) return [];
  if (state.value.tab === "users" && users.value) return users.value.items;
  if (state.value.tab === "employees" && employees.value)
    return employees.value.items;
  return [];
});
const dailyMax = computed(() => maxCost(overview.value?.daily ?? []));
const categoryMax = computed(() => maxCost(overview.value?.categories ?? []));
const displayTimezone = computed(
  () =>
    activePage.value?.projection?.timezone ??
    overview.value?.timezone ??
    configuredTimezone.value,
);
const activeProjection = computed(() =>
  state.value.tab === "overview"
    ? overview.value?.projection
    : activePage.value?.projection,
);

watch(
  tableContextKey,
  () => {
    invalidateTable();
    void load();
  },
  { immediate: true },
);
watch(
  () => state.value.tab,
  async () => {
    await nextTick();
    const active = tablist.value?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    active?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  },
  { immediate: true },
);
watch(
  [projectId, canReadAllowance],
  ([nextProjectId, canRead], [previousProjectId]) => {
    if (!canRead || nextProjectId !== previousProjectId)
      selectedAllowanceUser.value = null;
  },
);
watch(
  () =>
    [
      visibleTabs.value.map((tab) => tab.key).join("|"),
      state.value.tab,
    ] as const,
  ([, activeTab]) => {
    if (visibleTabs.value.some((tab) => tab.key === activeTab)) return;
    const fallback = visibleTabs.value[0];
    if (fallback) replaceState({ tab: fallback.key, page: 1 });
  },
  { immediate: true },
);
watch(
  () =>
    [state.value.period, state.value.customFrom, state.value.customTo] as const,
  ([period, from, to]) => {
    customFrom.value = period === "custom" ? from : "";
    customTo.value = period === "custom" ? to : "";
    customError.value = "";
  },
  { immediate: true },
);

async function load(): Promise<void> {
  const currentProjectId = projectId.value;
  const current = state.value;
  const requestContextKey = tableContextKey.value;
  const requestGeneration = ++generation;
  error.value = "";
  loadedTableKey.value = "";
  users.value = null;
  employees.value = null;
  if (!currentProjectId) {
    overviewLoading.value = false;
    tableLoading.value = false;
    return;
  }
  if (
    !canReadCosts.value &&
    current.tab !== "limits" &&
    current.tab !== "journal"
  ) {
    overviewLoading.value = false;
    tableLoading.value = false;
    overview.value = null;
    overviewKey = "";
    error.value =
      "Нет права project.ai_costs.read. Доступны только управление лимитами и журнал allowance.";
    return;
  }
  if (current.tab === "limits" || current.tab === "journal") {
    overviewLoading.value = false;
    tableLoading.value = false;
    return;
  }
  const nextOverviewKey = `${currentProjectId}|${current.from}|${current.to}`;
  const needsOverview = !overview.value || overviewKey !== nextOverviewKey;
  if (needsOverview) overview.value = null;
  overviewLoading.value = needsOverview;
  tableLoading.value = current.tab !== "overview";
  try {
    const overviewRequest = needsOverview
      ? aiCostsRepository.overview(currentProjectId, {
          from: current.from,
          to: current.to,
        })
      : Promise.resolve(overview.value);
    const tableRequest =
      current.tab === "users"
        ? aiCostsRepository.users(currentProjectId, pageQuery(current))
        : current.tab === "employees"
          ? aiCostsRepository.cmsUsers(currentProjectId, pageQuery(current))
          : Promise.resolve(null);
    const [nextOverview, nextPage] = await Promise.all([
      overviewRequest,
      tableRequest,
    ]);
    if (
      requestGeneration !== generation ||
      projectId.value !== currentProjectId ||
      tableContextKey.value !== requestContextKey ||
      !canReadCosts.value
    )
      return;
    if (nextOverview) {
      overview.value = nextOverview;
      overviewKey = nextOverviewKey;
    }
    if (current.tab === "users") {
      users.value = nextPage as AiCostPage<AiCostUserRow>;
      loadedTableKey.value = requestContextKey;
    }
    if (current.tab === "employees") {
      employees.value = nextPage as AiCostPage<AiCostCmsUserRow>;
      loadedTableKey.value = requestContextKey;
    }
  } catch (cause) {
    if (requestGeneration !== generation) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить статистику расходов AI";
  } finally {
    if (requestGeneration === generation) {
      overviewLoading.value = false;
      tableLoading.value = false;
    }
  }
}

function invalidateTable(): void {
  generation += 1;
  loadedTableKey.value = "";
  users.value = null;
  employees.value = null;
  tableLoading.value = false;
  if (!canReadCosts.value) {
    overview.value = null;
    overviewKey = "";
    overviewLoading.value = false;
  }
}

function pageQuery(current: AiCostRouteState) {
  return {
    from: current.from,
    to: current.to,
    sort: current.sort,
    direction: current.direction,
    limit: PAGE_SIZE,
    offset: (current.page - 1) * PAGE_SIZE,
  };
}

function replaceState(patch: Partial<AiCostRouteState>): void {
  const next = { ...state.value, ...patch };
  void router.replace({ query: aiCostRouteQuery(next) });
}

function selectTab(tab: AiCostTab): void {
  replaceState({ tab, page: 1 });
}

async function handleTabKeydown(
  event: KeyboardEvent,
  tab: AiCostTab,
): Promise<void> {
  const available = visibleTabs.value;
  const index = available.findIndex((item) => item.key === tab);
  if (index < 0) return;
  let nextIndex: number | undefined;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % available.length;
  if (event.key === "ArrowLeft")
    nextIndex = (index - 1 + available.length) % available.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = available.length - 1;
  if (nextIndex === undefined) return;
  event.preventDefault();
  const target = available[nextIndex];
  if (!target) return;
  selectTab(target.key);
  await nextTick();
  tablist.value
    ?.querySelector<HTMLElement>(`#ai-cost-tab-${target.key}`)
    ?.focus();
}

function selectPeriod(period: Exclude<AiCostPeriod, "custom">): void {
  replaceState({ period, page: 1, customFrom: "", customTo: "" });
}

function openAllowanceUser(row: AiCostRankedRow): void {
  if ("endUserId" in row) selectedAllowanceUser.value = row as AiCostUserRow;
}

function openJournal(endUserId: string): void {
  selectedAllowanceUser.value = null;
  replaceState({
    tab: "journal",
    allowanceUser: endUserId,
    allowanceCursor: "",
    page: 1,
  });
}

async function requireFreshAllowanceLogin(): Promise<void> {
  if (freshLoginPending.value) return;
  freshLoginPending.value = true;
  const redirect = route.fullPath;
  try {
    await auth.logout();
  } catch {
    // logout() clears local authority in finally; navigation must not depend on the network.
  }
  selectedAllowanceUser.value = null;
  await router.replace({
    name: "login",
    query: { redirect },
  });
}

function selectJournalUser(endUserId: string): void {
  replaceState({ allowanceUser: endUserId, allowanceCursor: "" });
}

function nextJournalCursor(cursor: string): void {
  if (cursor) replaceState({ allowanceCursor: cursor });
}

function applyCustomPeriod(): void {
  const parsed = parseAiCostRouteState(
    {
      period: "custom",
      from: customFrom.value,
      to: customTo.value,
    },
    new Date(),
    configuredTimezone.value,
  );
  if (parsed.period !== "custom") {
    customError.value =
      "Выберите корректный диапазон: окончание не раньше начала, не более 366 дней.";
    return;
  }
  customError.value = "";
  replaceState({
    period: "custom",
    customFrom: parsed.customFrom,
    customTo: parsed.customTo,
    from: parsed.from,
    to: parsed.to,
    page: 1,
  });
}

function parseIsoDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function formatIsoDay(value: Date | null | undefined): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function changeSort(sort: AiCostSortKey): void {
  replaceState({
    sort,
    direction:
      state.value.sort === sort && state.value.direction === "desc"
        ? "asc"
        : "desc",
    page: 1,
  });
}

function sortState(key: AiCostSortKey): "ascending" | "descending" | "none" {
  if (state.value.sort !== key) return "none";
  return state.value.direction === "asc" ? "ascending" : "descending";
}

function changePage(page: number): void {
  if (page < 1 || page > 401) return;
  replaceState({ page });
}

function formatMoney(value: DecimalString | null): string {
  return value === null ? "Нет цены" : formatDecimalMoney(value, "USD");
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function categoryLabel(category: string): string {
  return (
    AI_USAGE_CATEGORY_LABELS[
      category as keyof typeof AI_USAGE_CATEGORY_LABELS
    ] ?? category.replaceAll("_", " ")
  );
}

function dayLabel(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}`;
}

function barWidth(value: DecimalString | null, maximum: DecimalString): string {
  if (value === null) return "0%";
  if (compareDecimalStrings(value, "0") <= 0) return "0%";
  return `${Math.max(decimalRatio(value, maximum) * 100, 2)}%`;
}

function maxCost(
  rows: readonly { effectiveCostUsd: DecimalString | null }[],
): DecimalString {
  return rows.reduce<DecimalString>(
    (maximum, row) =>
      row.effectiveCostUsd !== null &&
      compareDecimalStrings(row.effectiveCostUsd, maximum) > 0
        ? row.effectiveCostUsd
        : maximum,
    "0",
  );
}

function rowIdentity(row: AiCostRankedRow): string {
  if ("externalId" in row && typeof row.externalId === "string")
    return row.externalId;
  if ("email" in row && typeof row.email === "string") return row.email;
  return "—";
}

function userHref(row: AiCostRankedRow): string | undefined {
  return "endUserId" in row &&
    typeof row.endUserId === "string" &&
    canReadProfiles.value
    ? `/users/${encodeURIComponent(row.endUserId)}`
    : undefined;
}

function employeeHref(row: AiCostRankedRow): string | undefined {
  return "cmsUserId" in row &&
    typeof row.cmsUserId === "string" &&
    canReadCmsUsers.value
    ? `/platform/cms-users/${encodeURIComponent(row.cmsUserId)}`
    : undefined;
}
</script>

<template>
  <main class="ai-costs-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">Контроль расходов</span>
        <h1>Расходы AI</h1>
        <p>
          Фактическая, расчётная и неполная стоимость по задачам, пользователям
          и сотрудникам.
        </p>
      </div>
      <span
        v-if="state.tab !== 'limits' && state.tab !== 'journal'"
        class="timezone-badge"
        :title="`Дневные срезы сгруппированы в ${displayTimezone}`"
      >
        <i class="pi pi-clock" aria-hidden="true" />
        Часовой пояс проекта: <strong>{{ displayTimezone }}</strong>
      </span>
    </header>

    <nav
      ref="tablist"
      class="cost-tabs"
      role="tablist"
      aria-label="Разделы расходов AI"
    >
      <button
        v-for="tab in visibleTabs"
        :id="`ai-cost-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="state.tab === tab.key"
        :aria-controls="`ai-cost-panel-${tab.key}`"
        :class="{ active: state.tab === tab.key }"
        :tabindex="state.tab === tab.key ? 0 : -1"
        @click="selectTab(tab.key)"
        @keydown="handleTabKeydown($event, tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section
      v-if="state.tab !== 'limits' && state.tab !== 'journal'"
      class="period-panel"
      aria-label="Период отчёта"
    >
      <div class="preset-group" role="group" aria-label="Быстрый выбор периода">
        <button
          v-for="periodOption in periods"
          :key="periodOption.key"
          type="button"
          :class="{ active: state.period === periodOption.key }"
          :aria-pressed="state.period === periodOption.key"
          @click="selectPeriod(periodOption.key)"
        >
          {{ periodOption.label }}
        </button>
      </div>
      <div class="custom-period" role="group" aria-label="Произвольный период">
        <DatePicker
          v-model="customDateRange"
          selection-mode="range"
          date-format="dd.mm.yy"
          show-icon
          icon-display="input"
          placeholder="Выбрать даты"
          aria-label="Начальная и конечная даты отчёта"
        />
        <Button
          label="Применить"
          size="small"
          :disabled="!customFrom || !customTo"
          @click="applyCustomPeriod"
        />
      </div>
      <small v-if="customError" class="field-error" role="alert">{{
        customError
      }}</small>
    </section>

    <Message v-if="error" severity="error" :closable="false">
      <span>{{ error }}</span>
      <Button label="Повторить" size="small" text @click="load" />
    </Message>

    <AiAllowanceLimitsPanel
      v-if="state.tab === 'limits' && projectId"
      id="ai-cost-panel-limits"
      :project-id="projectId"
      :default-locale="auth.project?.defaultLocale"
      :supported-locales="auth.project?.supportedLocales"
      :can-read="canReadAllowance"
      :can-manage="canManageAllowance"
      :can-grant="canGrantAllowance"
      :can-reconcile="canReconcileAllowance"
      :can-read-accrual="canReadAccrual"
      :can-manage-accrual="canManageAccrual"
      :can-read-accrual-receipts="canReadAccrualReceipts"
      @fresh-login="requireFreshAllowanceLogin"
    />
    <AiAllowanceJournalPanel
      v-if="state.tab === 'journal' && projectId"
      id="ai-cost-panel-journal"
      :project-id="projectId"
      :can-read="canReadAllowance"
      :can-reconcile="canReconcileAllowance"
      :end-user-id="state.allowanceUser"
      :cursor="state.allowanceCursor"
      @select-user="selectJournalUser"
      @next-cursor="nextJournalCursor"
      @fresh-login="requireFreshAllowanceLogin"
    />

    <template v-if="state.tab !== 'limits' && state.tab !== 'journal'">
      <section
        v-if="overviewLoading && !overview"
        class="kpi-grid"
        aria-label="Загрузка сводки"
      >
        <Skeleton
          v-for="index in 4"
          :key="index"
          height="132px"
          border-radius="16px"
        />
      </section>
      <template v-else-if="overview">
        <Message
          v-if="
            activeProjection?.status === 'STALE' ||
            activeProjection?.driftDetected
          "
          severity="warn"
          :closable="false"
        >
          Проекция расходов устарела или обнаружен drift. Данные актуальны на
          {{
            activeProjection?.asOf
              ? new Date(activeProjection.asOf).toLocaleString("ru-RU")
              : "неизвестный момент"
          }}; финансовые решения отложите до сверки.
        </Message>
        <section class="kpi-grid" aria-label="Сводка расходов">
          <article>
            <small>По данным провайдера</small>
            <strong>{{
              formatMoney(overview.totals.providerReportedCostUsd)
            }}</strong>
            <span
              >{{
                formatCount(overview.completeness.providerReportedRecords)
              }}
              записей</span
            >
          </article>
          <article>
            <small>Расчётная стоимость</small>
            <strong>{{
              formatMoney(overview.totals.estimatedFallbackCostUsd)
            }}</strong>
            <span
              >{{
                formatCount(overview.completeness.estimatedRecords)
              }}
              записей</span
            >
          </article>
          <article class="kpi-effective">
            <small>Итого</small>
            <strong>{{ formatMoney(overview.totals.effectiveCostUsd) }}</strong>
            <span>provider + estimate, без двойного счёта</span>
          </article>
          <article>
            <small>Полнота оценки</small>
            <strong>{{ overview.completeness.pricedPercent }}%</strong>
            <span
              >{{
                formatCount(overview.completeness.totalRecords)
              }}
              операций</span
            >
          </article>
        </section>

        <div
          v-if="overview.completeness.unpricedRecords > 0"
          class="completeness-warning"
          role="alert"
        >
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />
          <span>
            <strong
              >{{ formatCount(overview.completeness.unpricedRecords) }} операций
              пока без цены.</strong
            >
            Итоговая стоимость может увеличиться после сверки.
          </span>
        </div>

        <section
          v-if="state.tab === 'overview'"
          id="ai-cost-panel-overview"
          class="chart-grid"
          role="tabpanel"
          aria-labelledby="ai-cost-tab-overview"
        >
          <article class="chart-card daily-chart">
            <header>
              <div>
                <small>Динамика</small>
                <h2>Расход по дням</h2>
              </div>
              <span>USD · {{ overview.timezone }}</span>
            </header>
            <div v-if="overview.daily.length" class="bar-list">
              <div v-for="row in overview.daily" :key="row.day" class="bar-row">
                <span>{{ dayLabel(row.day) }}</span>
                <div class="bar-track" aria-hidden="true">
                  <span
                    class="bar-fill"
                    :style="{ width: barWidth(row.effectiveCostUsd, dailyMax) }"
                  />
                </div>
                <strong>{{ formatMoney(row.effectiveCostUsd) }}</strong>
              </div>
            </div>
            <p v-else class="empty-state">За период расходов нет.</p>
          </article>

          <article class="chart-card category-chart">
            <header>
              <div>
                <small>Структура</small>
                <h2>Категории расходов</h2>
              </div>
              <span>{{ overview.categories.length }} категорий</span>
            </header>
            <div v-if="overview.categories.length" class="bar-list">
              <div
                v-for="row in overview.categories"
                :key="row.category"
                class="bar-row"
              >
                <span>{{ categoryLabel(row.category) }}</span>
                <div class="bar-track" aria-hidden="true">
                  <span
                    class="bar-fill category"
                    :style="{
                      width: barWidth(row.effectiveCostUsd, categoryMax),
                    }"
                  />
                </div>
                <strong>{{ formatMoney(row.effectiveCostUsd) }}</strong>
              </div>
            </div>
            <p v-else class="empty-state">
              Категории появятся после первой AI-операции.
            </p>
          </article>
        </section>
      </template>

      <section
        v-if="state.tab === 'users' || state.tab === 'employees'"
        :id="`ai-cost-panel-${state.tab}`"
        class="ranking-card card"
        role="tabpanel"
        :aria-labelledby="`ai-cost-tab-${state.tab}`"
      >
        <header>
          <div>
            <span class="eyebrow">Cost attribution</span>
            <h2>{{ state.tab === "users" ? "Пользователи" : "Сотрудники" }}</h2>
            <p>
              Сортировка выполняется сервером по всей выборке и сохраняется в
              URL.
            </p>
          </div>
        </header>
        <div v-if="tableLoading" class="table-loading">
          <Skeleton v-for="index in 6" :key="index" height="42px" />
        </div>
        <div v-else-if="displayedRows.length" class="table-scroll">
          <table>
            <thead>
              <tr>
                <th :aria-sort="sortState('identity')">
                  <button type="button" @click="changeSort('identity')">
                    {{ state.tab === "users" ? "Пользователь" : "Сотрудник" }}
                  </button>
                </th>
                <th v-if="state.tab === 'users'">Сегмент</th>
                <th :aria-sort="sortState('records')">
                  <button type="button" @click="changeSort('records')">
                    Операции
                  </button>
                </th>
                <th :aria-sort="sortState('unpricedRecords')">
                  <button type="button" @click="changeSort('unpricedRecords')">
                    Без цены
                  </button>
                </th>
                <th>Провайдер</th>
                <th>Расчёт</th>
                <th :aria-sort="sortState('effectiveCostUsd')">
                  <button type="button" @click="changeSort('effectiveCostUsd')">
                    Итого
                  </button>
                </th>
                <th v-if="state.tab === 'users' && canReadAllowance">Квота</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in displayedRows" :key="rowIdentity(row)">
                <td>
                  <a
                    v-if="state.tab === 'users' && userHref(row)"
                    :href="userHref(row)"
                    >{{ rowIdentity(row) }}</a
                  >
                  <a
                    v-else-if="state.tab === 'employees' && employeeHref(row)"
                    :href="employeeHref(row)"
                    >{{ rowIdentity(row) }}</a
                  >
                  <strong v-else>{{ rowIdentity(row) }}</strong>
                  <small v-if="'endUserId' in row">{{ row.endUserId }}</small>
                  <small v-if="'cmsUserId' in row">{{ row.cmsUserId }}</small>
                </td>
                <td v-if="state.tab === 'users'">
                  <span class="segment-tag">{{
                    "segment" in row ? row.segment || "Без сегмента" : "—"
                  }}</span>
                </td>
                <td>{{ formatCount(row.records) }}</td>
                <td>
                  <span :class="{ warning: row.unpricedRecords > 0 }">{{
                    formatCount(row.unpricedRecords)
                  }}</span>
                </td>
                <td>{{ formatMoney(row.providerReportedCostUsd) }}</td>
                <td>{{ formatMoney(row.estimatedFallbackCostUsd) }}</td>
                <td>
                  <strong>{{ formatMoney(row.effectiveCostUsd) }}</strong>
                </td>
                <td v-if="state.tab === 'users' && canReadAllowance">
                  <Button
                    label="Баланс"
                    icon="pi pi-wallet"
                    size="small"
                    outlined
                    @click="openAllowanceUser(row)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-state">
          За выбранный период расходов в этом разрезе нет.
        </p>

        <Message
          v-if="activePage?.pagination.truncated"
          severity="warn"
          :closable="false"
        >
          Достигнута граница безопасной пагинации. Сузьте период, чтобы увидеть
          оставшиеся строки.
        </Message>

        <footer v-if="activePage" class="pagination-bar">
          <Button
            label="Назад"
            icon="pi pi-chevron-left"
            size="small"
            outlined
            :disabled="state.page <= 1 || tableLoading"
            @click="changePage(state.page - 1)"
          />
          <span class="pagination-status">Страница {{ state.page }}</span>
          <Button
            label="Далее"
            icon="pi pi-chevron-right"
            icon-pos="right"
            size="small"
            outlined
            :disabled="
              !activePage.pagination.hasMore ||
              activePage.pagination.nextOffset === null ||
              tableLoading
            "
            @click="changePage(state.page + 1)"
          />
        </footer>
      </section>
    </template>
    <AiAllowanceUserDialog
      v-if="projectId && canReadAllowance && selectedAllowanceUser"
      :visible="true"
      :project-id="projectId"
      :end-user-id="selectedAllowanceUser.endUserId"
      :identity="selectedAllowanceUser.externalId"
      :can-read="canReadAllowance"
      :can-grant="canGrantAllowance"
      :can-manage="canManageAllowance"
      :can-reconcile="canReconcileAllowance"
      @update:visible="selectedAllowanceUser = null"
      @open-journal="openJournal"
      @fresh-login="requireFreshAllowanceLogin"
    />
  </main>
</template>

<style scoped>
.ai-costs-page {
  display: grid;
  gap: 20px;
  max-width: 1440px;
  padding: 28px;
  margin: 0 auto;
}
.page-heading,
.period-panel,
.ranking-card > header,
.chart-card > header,
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.page-heading {
  align-items: flex-start;
}
.page-heading h1,
.ranking-card h2,
.chart-card h2 {
  margin: 3px 0 0;
}
.page-heading p,
.ranking-card p {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--text-secondary);
}
.eyebrow,
.chart-card header small {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.timezone-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.74rem;
  white-space: nowrap;
}
.period-panel {
  min-height: 58px;
  padding: 9px 10px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.preset-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 11px;
  background: var(--surface-active);
}
.preset-group button,
.cost-tabs button {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.preset-group button {
  min-height: 38px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
}
.preset-group button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-soft);
}
.custom-period {
  display: flex;
  align-items: center;
  gap: 8px;
}
.custom-period :deep(.p-datepicker) {
  width: 230px;
}
.custom-period :deep(.p-inputtext),
.custom-period :deep(.p-button) {
  min-height: 42px;
}
.custom-period :deep(.p-inputtext) {
  padding-block: 8px;
  font-size: 0.78rem;
}
.field-error {
  flex-basis: 100%;
  color: var(--status-danger-text);
}
.cost-tabs {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding: 5px;
  border-bottom: 1px solid var(--border-default);
}
.cost-tabs button {
  flex: 0 0 auto;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.77rem;
  font-weight: 700;
}
.cost-tabs button.active {
  background: var(--action-soft);
  color: var(--action-primary);
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.kpi-grid article {
  display: grid;
  gap: 8px;
  min-height: 132px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
.kpi-grid article small,
.kpi-grid article span {
  color: var(--text-small-muted);
}
.kpi-grid article strong {
  font-size: clamp(1.15rem, 2vw, 1.65rem);
  overflow-wrap: anywhere;
}
.kpi-grid .kpi-effective {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 38%,
    var(--border-default)
  );
  background: linear-gradient(145deg, var(--action-soft), var(--surface-card));
}
.completeness-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid
    color-mix(in srgb, var(--status-warning) 38%, var(--border-default));
  border-radius: 12px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 0.74rem;
  line-height: 1.45;
}
.completeness-warning span,
.completeness-warning strong {
  display: block;
}
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.chart-card {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
}
.chart-card header {
  align-items: flex-start;
}
.chart-card header span {
  color: var(--text-small-muted);
  font-size: 0.68rem;
}
.bar-list {
  display: grid;
  gap: 14px;
  margin-top: 24px;
}
.bar-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) minmax(100px, 2fr) minmax(
      88px,
      auto
    );
  align-items: center;
  gap: 12px;
  font-size: 0.72rem;
}
.bar-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-row strong {
  text-align: right;
}
.bar-track {
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-active);
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--chart-series-1),
    var(--chart-series-4)
  );
}
.bar-fill.category {
  background: linear-gradient(
    90deg,
    var(--chart-series-6),
    var(--chart-series-3)
  );
}
.ranking-card {
  padding: 20px;
  overflow: hidden;
}
.ranking-card > header {
  align-items: flex-start;
  margin-bottom: 18px;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 840px;
  border-collapse: collapse;
}
th,
td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: right;
  vertical-align: middle;
}
th:first-child,
td:first-child,
th:nth-child(2),
td:nth-child(2) {
  text-align: left;
}
th {
  color: var(--text-small-muted);
  font-size: 0.65rem;
  text-transform: uppercase;
}
th button {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  cursor: pointer;
}
td {
  font-size: 0.73rem;
}
td:first-child strong,
td:first-child small {
  display: block;
}
td:first-child a {
  color: var(--action-primary);
  font-weight: 750;
  text-decoration: none;
}
td:first-child small {
  max-width: 250px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-small-muted);
  text-overflow: ellipsis;
}
.segment-tag,
td .warning {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--surface-active);
}
td .warning {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.pagination-bar {
  padding-top: 16px;
}
.pagination-status {
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.table-loading {
  display: grid;
  gap: 7px;
}
.empty-state {
  padding: 26px;
  margin: 0;
  color: var(--text-small-muted);
  text-align: center;
}
.feature-unavailable {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 26px;
}
.feature-unavailable > i {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--surface-active);
  color: var(--text-small-muted);
}
.feature-unavailable h2 {
  margin: 0 0 7px;
  font-size: 1rem;
}
.feature-unavailable p {
  max-width: 720px;
  margin: 0;
  color: var(--text-secondary);
}
@media (max-width: 980px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 700px) {
  .ai-costs-page {
    padding: 16px;
  }
  .page-heading,
  .period-panel {
    align-items: stretch;
    flex-direction: column;
  }
  .period-panel {
    flex-wrap: nowrap;
  }
  .field-error {
    flex-basis: auto;
  }
  .timezone-badge {
    align-self: flex-start;
    white-space: normal;
  }
  .custom-period {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .custom-period :deep(.p-datepicker) {
    width: 100%;
  }
  .kpi-grid {
    grid-template-columns: 1fr;
  }
  .bar-row {
    grid-template-columns: minmax(68px, 0.8fr) 1fr;
  }
  .bar-row strong {
    grid-column: 2;
  }
}
</style>
