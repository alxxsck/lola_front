<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { RunExplainInspector } from "@/features/scenario-run-explain/ui";
import { repository } from "@/shared/api/repository";
import { formatDate, relativeTime } from "@/shared/lib/format";
import type { AuditEvent, ScenarioRun } from "@/shared/types/domain";

type Section = "runs" | "audit";
const auth = useAuthStore();
const route = useRoute();
const activeWaitDefinitionKeyId = computed(() =>
  typeof route.query.eventDefinitionKeyId === "string"
    ? route.query.eventDefinitionKeyId
    : undefined,
);
const section = ref<Section>(
  route.query.section === "audit" && !activeWaitDefinitionKeyId.value
    ? "audit"
    : "runs",
);
const scenarioRuns = ref<ScenarioRun[]>([]);
const runsNextCursor = ref<string | null>(null);
const loadingMoreRuns = ref(false);
const auditEvents = ref<AuditEvent[]>([]);
const auditNextCursor = ref<string | null>(null);
const auditLoadedFilterKey = ref<string | null>(null);
const auditLoading = ref(false);
const loadingMoreAudit = ref(false);
const loading = ref(true);
const errors = ref<Record<Section, string>>({
  runs: "",
  audit: "",
});
const search = ref("");
const status = ref("ALL");
const selectedRun = ref<ScenarioRun | null>(null);
const selectedAudit = ref<AuditEvent | null>(null);

const sections = [
  { value: "runs" as const, label: "Запуски сценариев", icon: "pi pi-sitemap" },
  { value: "audit" as const, label: "Аудит", icon: "pi pi-shield" },
];
const statusOptions = computed(() => {
  const values =
    section.value === "runs"
      ? ["RUNNING", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED", "EXPIRED"]
      : ["SUCCESS", "DENIED", "FAILED"];
  return [
    { label: "Все статусы", value: "ALL" },
    ...values.map((value) => ({ label: value, value })),
  ];
});
const sectionError = computed(() => errors.value[section.value]);

const query = computed(() => search.value.trim().toLowerCase());
const filteredRuns = computed(() =>
  scenarioRuns.value.filter(
    (item) =>
      (status.value === "ALL" || item.status === status.value) &&
      (!query.value ||
        [
          item.scenarioCode,
          item.scenarioName,
          item.userExternalId,
          item.id,
        ].some((value) => value.toLowerCase().includes(query.value))),
  ),
);
const severity = (
  value: string,
): "success" | "danger" | "warn" | "info" | "secondary" => {
  if (["COMPLETED", "SUCCESS"].includes(value)) return "success";
  if (["FAILED", "EXPIRED", "CANCELLED"].includes(value)) return "danger";
  if (value === "DENIED") return "warn";
  if (
    ["RUNNING", "WAITING_ACK", "WAITING_INPUT", "WAITING_TIME"].includes(value)
  )
    return "warn";
  return "secondary";
};
const json = (value: unknown) => JSON.stringify(value, null, 2);
let loadRequestId = 0;
let runsRequestId = 0;
let auditRequestId = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function auditRequest(cursor?: string) {
  return {
    limit: 50,
    ...(search.value.trim() ? { search: search.value.trim() } : {}),
    ...(status.value !== "ALL"
      ? { outcome: status.value as AuditEvent["outcome"] }
      : {}),
    ...(cursor ? { cursor } : {}),
  };
}

function auditFilterKey() {
  return `${search.value.trim()}\u0000${status.value}`;
}

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  const requestId = ++loadRequestId;
  const currentRunsRequestId = ++runsRequestId;
  const currentAuditRequestId = ++auditRequestId;
  loading.value = true;
  errors.value.runs = "";
  errors.value.audit = "";
  scenarioRuns.value = [];
  runsNextCursor.value = null;
  auditEvents.value = [];
  auditNextCursor.value = null;
  auditLoadedFilterKey.value = null;
  auditLoading.value = false;
  loadingMoreAudit.value = false;
  const results = await Promise.allSettled([
    repository.getScenarioRunsPage(projectId, {
      limit: 50,
      ...(activeWaitDefinitionKeyId.value
        ? { eventDefinitionKeyId: activeWaitDefinitionKeyId.value }
        : {}),
    }),
    repository.getAuditEventsPage(projectId, auditRequest()),
  ] as const);
  const message = (cause: unknown) =>
    cause instanceof Error ? cause.message : "Не удалось загрузить раздел";
  if (requestId !== loadRequestId || auth.project?.id !== projectId) return;
  if (
    results[0].status === "fulfilled" &&
    currentRunsRequestId === runsRequestId
  ) {
    scenarioRuns.value = results[0].value.items;
    runsNextCursor.value = results[0].value.nextCursor;
  } else if (
    results[0].status === "rejected" &&
    currentRunsRequestId === runsRequestId
  )
    errors.value.runs = message(results[0].reason);
  if (
    results[1].status === "fulfilled" &&
    currentAuditRequestId === auditRequestId
  ) {
    auditEvents.value = results[1].value.items;
    auditNextCursor.value = results[1].value.nextCursor;
    auditLoadedFilterKey.value = auditFilterKey();
  } else if (
    results[1].status === "rejected" &&
    currentAuditRequestId === auditRequestId
  )
    errors.value.audit = message(results[1].reason);
  if (currentAuditRequestId === auditRequestId) auditLoading.value = false;
  if (requestId === loadRequestId) loading.value = false;
}

async function loadAuditPage() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  const requestId = ++auditRequestId;
  auditLoading.value = true;
  errors.value.audit = "";
  try {
    const page = await repository.getAuditEventsPage(projectId, auditRequest());
    if (requestId === auditRequestId && auth.project?.id === projectId) {
      auditEvents.value = page.items;
      auditNextCursor.value = page.nextCursor;
      auditLoadedFilterKey.value = auditFilterKey();
    }
  } catch (cause) {
    if (requestId === auditRequestId && auth.project?.id === projectId)
      errors.value.audit =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить события аудита";
  } finally {
    if (requestId === auditRequestId && auth.project?.id === projectId)
      auditLoading.value = false;
  }
}

async function loadMoreAuditEvents() {
  const projectId = auth.project?.id;
  if (!projectId || !auditNextCursor.value) return;
  const requestId = ++auditRequestId;
  loadingMoreAudit.value = true;
  errors.value.audit = "";
  try {
    const page = await repository.getAuditEventsPage(
      projectId,
      auditRequest(auditNextCursor.value),
    );
    if (requestId === auditRequestId && auth.project?.id === projectId) {
      auditEvents.value.push(...page.items);
      auditNextCursor.value = page.nextCursor;
    }
  } catch (cause) {
    if (requestId === auditRequestId && auth.project?.id === projectId)
      errors.value.audit =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить следующую страницу аудита";
  } finally {
    if (requestId === auditRequestId && auth.project?.id === projectId)
      loadingMoreAudit.value = false;
  }
}

async function loadMoreRuns() {
  const projectId = auth.project?.id;
  if (!projectId || !runsNextCursor.value) return;
  const requestId = ++runsRequestId;
  loadingMoreRuns.value = true;
  errors.value.runs = "";
  try {
    const page = await repository.getScenarioRunsPage(projectId, {
      limit: 50,
      cursor: runsNextCursor.value,
      ...(activeWaitDefinitionKeyId.value
        ? { eventDefinitionKeyId: activeWaitDefinitionKeyId.value }
        : {}),
    });
    if (requestId === runsRequestId && auth.project?.id === projectId) {
      scenarioRuns.value.push(...page.items);
      runsNextCursor.value = page.nextCursor;
    }
  } catch (cause) {
    if (requestId === runsRequestId && auth.project?.id === projectId)
      errors.value.runs =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить следующую страницу запусков";
  } finally {
    if (requestId === runsRequestId && auth.project?.id === projectId)
      loadingMoreRuns.value = false;
  }
}

function resetProjectState() {
  loadRequestId += 1;
  runsRequestId += 1;
  auditRequestId += 1;
  clearTimeout(searchTimer);
  scenarioRuns.value = [];
  auditEvents.value = [];
  auditNextCursor.value = null;
  auditLoadedFilterKey.value = null;
  runsNextCursor.value = null;
  selectedRun.value = null;
  selectedAudit.value = null;
  loading.value = false;
  loadingMoreRuns.value = false;
  auditLoading.value = false;
  loadingMoreAudit.value = false;
  errors.value.runs = "";
  errors.value.audit = "";
}

function changeSection(value: Section) {
  section.value = value;
  status.value = "ALL";
  search.value = "";
}

watch([section, search, status], ([currentSection], [previousSection]) => {
  clearTimeout(searchTimer);
  if (currentSection === "audit") {
    if (
      previousSection === "audit" ||
      auditLoadedFilterKey.value !== auditFilterKey()
    )
      searchTimer = setTimeout(
        () => void loadAuditPage(),
        previousSection === "audit" ? 300 : 0,
      );
  }
});
watch(
  () => auth.project?.id,
  (projectId, previousProjectId) => {
    if (projectId === previousProjectId) return;
    resetProjectState();
    if (projectId) void load();
  },
);

onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);
</script>

<template>
  <section class="page operations-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Наблюдаемость</div>
        <h1>Операционный центр</h1>
        <p class="subtitle">
          Выполнение сценариев и действия администраторов в одном потоке.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="loading"
        @click="load"
      />
    </header>
    <Message v-if="sectionError" severity="error" class="mb"
      ><span>{{ sectionError }}</span
      ><Button
        label="Повторить"
        icon="pi pi-refresh"
        size="small"
        text
        @click="load"
    /></Message>
    <Message
      v-if="activeWaitDefinitionKeyId"
      data-test="active-wait-filter"
      severity="info"
      class="mb"
      :closable="false"
    >
      Показаны только запуски с активным ожиданием этого Event Definition.
    </Message>

    <div class="section-tabs" role="tablist" aria-label="Операционные разделы">
      <button
        v-for="item in sections"
        :key="item.value"
        type="button"
        role="tab"
        :aria-selected="section === item.value"
        :class="{ active: section === item.value }"
        @click="changeSection(item.value)"
      >
        <i :class="item.icon" /><span>{{ item.label }}</span>
        <strong>{{
          item.value === "runs"
            ? `${scenarioRuns.length}${runsNextCursor ? "+" : ""}`
            : `${auditEvents.length}${auditNextCursor ? "+" : ""}`
        }}</strong>
      </button>
    </div>

    <div class="filters card">
      <span class="search"
        ><i class="pi pi-search" /><InputText
          v-model="search"
          :placeholder="
            section === 'audit'
              ? 'Действие, актор или ресурс'
              : 'Код, пользователь или ID'
          "
      /></span>
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
      />
      <span class="data-source"
        ><i class="pi pi-database" />
        {{
          repository.mode === "api"
            ? "Lola Backend · live data"
            : "Демонстрационные данные"
        }}</span
      >
    </div>

    <div class="card table-card">
      <div v-if="loading" class="loading-list">
        <Skeleton v-for="item in 7" :key="item" height="58px" />
      </div>
      <DataTable
        v-else-if="section === 'runs'"
        :value="filteredRuns"
        paginator
        :rows="12"
        :pt="{
          tableContainer: {
            tabindex: 0,
            role: 'region',
            'aria-label': 'Запуски сценариев',
          },
        }"
        row-hover
        data-key="id"
        @row-click="selectedRun = $event.data"
      >
        <template #empty
          ><div class="empty">
            <i class="pi pi-sitemap" />Запусков по выбранным фильтрам нет.
          </div></template
        >
        <Column header="Сценарий"
          ><template #body="{ data }"
            ><div class="primary-cell">
              <strong>{{ data.scenarioName }}</strong
              ><small class="mono">{{ data.scenarioCode }}</small>
            </div></template
          ></Column
        >
        <Column header="Пользователь"
          ><template #body="{ data }"
            ><span class="mono compact">{{
              data.userExternalId
            }}</span></template
          ></Column
        >
        <Column header="Прогресс" class="mobile-hide"
          ><template #body="{ data }"
            ><span
              >{{ data.currentStep }} / {{ data.steps.length }}</span
            ></template
          ></Column
        >
        <Column header="Статус"
          ><template #body="{ data }"
            ><Tag
              :value="data.status"
              :severity="severity(data.status)"
              rounded /></template
        ></Column>
        <Column header="Старт"
          ><template #body="{ data }"
            ><span :title="formatDate(data.startedAt)">{{
              relativeTime(data.startedAt)
            }}</span></template
          ></Column
        >
        <Column
          ><template #body><i class="pi pi-chevron-right muted" /></template
        ></Column>
      </DataTable>
      <div v-if="section === 'runs' && runsNextCursor" class="load-more">
        <Button
          label="Загрузить ещё запусков"
          icon="pi pi-chevron-down"
          severity="secondary"
          outlined
          :loading="loadingMoreRuns"
          @click="loadMoreRuns"
        />
      </div>

      <DataTable
        v-if="section === 'audit'"
        :value="auditEvents"
        :loading="auditLoading"
        :pt="{
          tableContainer: {
            tabindex: 0,
            role: 'region',
            'aria-label': 'Аудит действий',
          },
        }"
        row-hover
        data-key="id"
        @row-click="selectedAudit = $event.data"
      >
        <template #empty
          ><div class="empty">
            <i class="pi pi-shield" />Записей аудита по выбранным фильтрам нет.
          </div></template
        >
        <Column header="Действие"
          ><template #body="{ data }"
            ><div class="primary-cell">
              <strong>{{
                data.operation || data.resourceType || data.eventType
              }}</strong
              ><small class="mono">{{ data.eventType }}</small>
            </div></template
          ></Column
        >
        <Column header="Администратор"
          ><template #body="{ data }"
            ><div class="primary-cell">
              <strong>{{ data.actor.name || "Система" }}</strong
              ><small>{{ data.actor.email || data.actor.type }}</small>
            </div></template
          ></Column
        >
        <Column header="Ресурс" class="mobile-hide"
          ><template #body="{ data }"
            ><div class="primary-cell">
              <strong>{{ data.resourceType || "—" }}</strong
              ><small class="mono">{{ data.resourceId || "—" }}</small>
            </div></template
          ></Column
        >
        <Column header="Статус"
          ><template #body="{ data }"
            ><Tag
              :value="data.outcome"
              :severity="severity(data.outcome)"
              rounded /></template
        ></Column>
        <Column header="Время"
          ><template #body="{ data }"
            ><span :title="formatDate(data.occurredAt)">{{
              relativeTime(data.occurredAt)
            }}</span></template
          ></Column
        >
        <Column
          ><template #body><i class="pi pi-chevron-right muted" /></template
        ></Column>
      </DataTable>
      <div v-if="section === 'audit' && auditNextCursor" class="load-more">
        <Button
          label="Загрузить ещё событий аудита"
          icon="pi pi-chevron-down"
          severity="secondary"
          outlined
          :loading="loadingMoreAudit"
          @click="loadMoreAuditEvents"
        />
      </div>
    </div>
  </section>

  <Drawer
    :visible="Boolean(selectedRun)"
    position="right"
    :style="{ width: 'min(700px, 100vw)' }"
    @update:visible="!$event && (selectedRun = null)"
  >
    <template #header
      ><div>
        <div class="eyebrow">Scenario run</div>
        <h2>{{ selectedRun?.scenarioName }}</h2>
      </div></template
    >
    <div v-if="selectedRun" class="detail-stack">
      <div class="detail-hero">
        <div>
          <span>Статус</span
          ><Tag
            :value="selectedRun.status"
            :severity="severity(selectedRun.status)"
          />
        </div>
        <div>
          <span>Пользователь</span
          ><strong class="mono">{{ selectedRun.userExternalId }}</strong>
        </div>
        <div>
          <span>Начало</span
          ><strong>{{ formatDate(selectedRun.startedAt) }}</strong>
        </div>
      </div>
      <Message v-if="selectedRun.errorCode" severity="error">{{
        selectedRun.errorCode
      }}</Message>
      <RunExplainInspector
        :project-id="auth.project?.id ?? ''"
        :run-id="selectedRun.id"
      />
      <div>
        <h3>Шаги выполнения</h3>
        <div class="steps">
          <article
            v-for="step in selectedRun.steps"
            :key="step.id"
            class="step-card"
          >
            <span class="step-index">{{ step.position + 1 }}</span>
            <div class="step-copy">
              <div>
                <strong>{{ step.actionType }}</strong
                ><Tag :value="step.status" :severity="severity(step.status)" />
              </div>
              <small class="mono muted"
                >{{ step.nodeKey }} · {{ step.executor }}</small
              ><small v-if="step.errorCode" class="error-code">{{
                step.errorCode
              }}</small>
              <div v-if="step.command" class="command">
                <span
                  ><i class="pi pi-send" /> Command #{{
                    step.command.sequence
                  }}</span
                ><Tag :value="step.command.status" severity="secondary" /><small
                  class="mono"
                  >{{ step.command.id }}</small
                >
              </div>
            </div>
          </article>
        </div>
      </div>
      <small class="mono muted"
        >Run {{ selectedRun.id }} · Event {{ selectedRun.eventLogId }}</small
      >
    </div>
  </Drawer>

  <Drawer
    :visible="Boolean(selectedAudit)"
    position="right"
    :style="{ width: 'min(700px, 100vw)' }"
    @update:visible="!$event && (selectedAudit = null)"
  >
    <template #header
      ><div>
        <div class="eyebrow">Audit event</div>
        <h2>
          {{
            selectedAudit?.operation ||
            selectedAudit?.resourceType ||
            selectedAudit?.eventType
          }}
        </h2>
      </div></template
    >
    <div v-if="selectedAudit" class="detail-stack">
      <div class="detail-hero">
        <div>
          <span>Результат</span
          ><Tag
            :value="selectedAudit.outcome"
            :severity="severity(selectedAudit.outcome)"
          />
        </div>
        <div>
          <span>Актор</span
          ><strong>{{
            selectedAudit.actor.name || selectedAudit.actor.id
          }}</strong
          ><small>{{
            selectedAudit.actor.email || selectedAudit.actor.type
          }}</small>
        </div>
        <div>
          <span>Время</span
          ><strong>{{ formatDate(selectedAudit.occurredAt) }}</strong>
        </div>
      </div>
      <div class="audit-facts">
        <div>
          <span>Событие</span
          ><strong class="mono">{{ selectedAudit.eventType }}</strong>
        </div>
        <div>
          <span>Цель</span
          ><strong class="mono"
            >{{ selectedAudit.target.kind }} ·
            {{ selectedAudit.target.id }}</strong
          >
        </div>
        <div v-if="selectedAudit.requiredPermissionCode">
          <span>Разрешение</span
          ><strong class="mono">{{
            selectedAudit.requiredPermissionCode
          }}</strong>
        </div>
        <div v-if="selectedAudit.auditReason">
          <span>Причина изменения</span
          ><strong>{{ selectedAudit.auditReason }}</strong>
        </div>
        <div v-if="selectedAudit.reasonCode">
          <span>Код результата</span
          ><strong class="mono">{{ selectedAudit.reasonCode }}</strong>
        </div>
        <div v-if="selectedAudit.requestId">
          <span>Request ID</span
          ><strong class="mono">{{ selectedAudit.requestId }}</strong>
        </div>
        <div v-if="selectedAudit.correlationId">
          <span>Correlation ID</span
          ><strong class="mono">{{ selectedAudit.correlationId }}</strong>
        </div>
        <div v-if="selectedAudit.ipAddress">
          <span>IP</span
          ><strong class="mono">{{ selectedAudit.ipAddress }}</strong>
        </div>
        <div v-if="selectedAudit.userAgent">
          <span>User agent</span><strong>{{ selectedAudit.userAgent }}</strong>
        </div>
      </div>
      <div>
        <h3>Authorization evidence</h3>
        <pre>{{ json(selectedAudit.authorizationEvidence) }}</pre>
      </div>
      <div v-if="selectedAudit.before">
        <h3>До</h3>
        <pre>{{ json(selectedAudit.before) }}</pre>
      </div>
      <div v-if="selectedAudit.after">
        <h3>После</h3>
        <pre>{{ json(selectedAudit.after) }}</pre>
      </div>
      <div>
        <h3>Metadata</h3>
        <pre>{{ json(selectedAudit.metadata) }}</pre>
      </div>
      <small class="mono muted">{{ selectedAudit.id }}</small>
    </div>
  </Drawer>
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.section-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  padding: 5px;
  background: var(--surface-subtle);
  border-radius: 15px;
  width: max-content;
  max-width: 100%;
  overflow: auto;
}
.section-tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 10px 13px;
  border-radius: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.section-tabs button.active {
  background: var(--surface-card);
  color: var(--ink);
  box-shadow: var(--shadow-raised);
}
.section-tabs strong {
  padding: 2px 7px;
  background: var(--border-default);
  border-radius: 10px;
  font-size: 0.66rem;
}
.section-tabs .active strong {
  background: var(--accent);
}
.filters {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 220px auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  margin-bottom: 18px;
}
.search {
  position: relative;
}
.search > i {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  color: var(--text-secondary);
}
.search :deep(input) {
  padding-left: 40px;
}
.data-source {
  font-size: 0.7rem;
  color: var(--muted);
  white-space: nowrap;
}
.data-source i {
  margin-right: 5px;
}
.table-card {
  overflow: hidden;
}
.table-card :deep(tbody tr) {
  cursor: pointer;
}
.loading-list {
  display: grid;
  gap: 10px;
  padding: 18px;
}
.primary-cell strong,
.primary-cell small {
  display: block;
}
.primary-cell strong {
  font-size: 0.82rem;
}
.primary-cell small {
  font-size: 0.68rem;
  color: var(--muted);
  margin-top: 3px;
}
.compact {
  font-size: 0.72rem;
}
.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.detail-hero {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
  background: var(--surface-subtle);
  border-radius: 14px;
}
.detail-hero > div {
  min-width: 0;
}
.detail-hero span,
.detail-hero strong {
  display: block;
}
.detail-hero > div > span {
  font-size: 0.62rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.detail-hero strong {
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.audit-facts {
  display: grid;
  gap: 10px;
}
.audit-facts > div {
  display: grid;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.audit-facts span {
  color: var(--muted);
  font-size: 0.68rem;
}
.audit-facts strong {
  overflow-wrap: anywhere;
  font-size: 0.8rem;
}
.detail-stack h3 {
  font-size: 0.9rem;
  margin: 0 0 9px;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.step-card {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 11px;
}
.step-index {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-weight: 700;
  font-size: 0.75rem;
}
.step-copy {
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 14px;
  min-width: 0;
}
.step-copy > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}
.step-copy strong {
  font-size: 0.78rem;
}
.error-code {
  display: block;
  color: var(--status-danger-text);
  margin-bottom: 8px;
}
.command {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
  margin-top: 10px;
  padding: 10px;
  background: var(--surface-subtle);
  border-radius: 10px;
}
.command span {
  font-size: 0.7rem;
  font-weight: 700;
}
.command small {
  grid-column: 1/-1;
  color: var(--muted);
}
@media (max-width: 760px) {
  .filters {
    grid-template-columns: 1fr;
  }
  .detail-hero {
    grid-template-columns: 1fr 1fr;
  }
  .table-card {
    overflow: auto;
  }
  :deep(.mobile-hide) {
    display: none;
  }
  .data-source {
    white-space: normal;
  }
}
</style>
