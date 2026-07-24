<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Tag from "primevue/tag";
import type {
  ScenarioAdmissionDecisionResponseDto,
  ScenarioAdmissionDecisionsPageParams,
} from "@/shared/api/generated/models";
import { formatDate, relativeTime } from "@/shared/lib/format";
import { scenarioAdmissionApi } from "./scenario-admission.api";
import { importanceClassPresentation } from "./scenario-admission.model";

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ count: [value: number, hasMore: boolean] }>();
const items = ref<ScenarioAdmissionDecisionResponseDto[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");
const search = ref("");
const outcome = ref("ALL");
const selected = ref<ScenarioAdmissionDecisionResponseDto | null>(null);

const outcomeOptions = [
  { label: "Все решения", value: "ALL" },
  { label: "Запущен", value: "STARTED" },
  { label: "Не запущен", value: "SUPPRESSED" },
];
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return items.value.filter(
    (item) =>
      (outcome.value === "ALL" || item.outcome === outcome.value) &&
      (!query ||
        [
          item.scenarioName,
          item.scenarioCode,
          item.endUserExternalId,
          item.eventLogId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
});

const reasonLabels: Record<string, string> = {
  ADMITTED: "Запущен",
  QUIET_HOURS: "Не запущен: тихие часы",
  DAILY_LIMIT_REACHED: "Не запущен: суточный лимит",
  VISIT_LIMIT_REACHED: "Не запущен: лимит визита",
  MINIMUM_INTERVAL_ACTIVE: "Не запущен: минимальная пауза",
  LOST_ARBITRATION: "Не запущен: выбран более приоритетный сценарий",
  LEGACY_SCENARIO_LIMIT: "Не запущен: индивидуальное ограничение",
};

function reasonLabel(reason: string) {
  return reasonLabels[reason] ?? "Новый тип — обновите интерфейс";
}

async function load(cursor?: string) {
  if (cursor) loadingMore.value = true;
  else loading.value = true;
  error.value = "";
  try {
    const params: ScenarioAdmissionDecisionsPageParams = {
      limit: 50,
      ...(cursor ? { cursor } : {}),
    };
    const page = await scenarioAdmissionApi.decisionsPage(
      props.projectId,
      params,
    );
    if (cursor) items.value.push(...page.items);
    else items.value = page.items;
    nextCursor.value = page.nextCursor ?? null;
    emit("count", items.value.length, Boolean(nextCursor.value));
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить решения";
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="decision-panel">
    <div class="decision-intro card">
      <div>
        <span class="eyebrow">Admission</span>
        <h2>Решения о запуске</h2>
        <p>Здесь видны и запуски, и нормальные подавления без создания Run.</p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="loading"
        @click="load()"
      />
    </div>
    <div class="filters card">
      <span class="search"
        ><i class="pi pi-search" /><InputText
          v-model="search"
          placeholder="Сценарий, игрок или Event ID"
      /></span>
      <Select
        v-model="outcome"
        :options="outcomeOptions"
        option-label="label"
        option-value="value"
      />
    </div>
    <p v-if="error" class="decision-error">{{ error }}</p>
    <div class="card table-card">
      <DataTable
        :value="filtered"
        :loading="loading"
        row-hover
        data-key="id"
        :pt="{
          tableContainer: {
            tabindex: 0,
            'aria-label': 'Таблица решений о запуске сценариев',
          },
        }"
        @row-click="selected = $event.data"
      >
        <template #empty
          ><div class="empty">
            <i class="pi pi-check-circle" />Решений по выбранным фильтрам нет.
          </div></template
        >
        <Column header="Сценарий">
          <template #body="{ data }"
            ><div class="primary-cell">
              <strong>{{ data.scenarioName }}</strong
              ><small class="mono">{{ data.scenarioCode }}</small>
            </div></template
          >
        </Column>
        <Column header="Игрок"
          ><template #body="{ data }"
            ><span class="mono compact">{{
              data.endUserExternalId
            }}</span></template
          ></Column
        >
        <Column header="Решение">
          <template #body="{ data }"
            ><Tag
              :value="reasonLabel(data.reason)"
              :severity="data.outcome === 'STARTED' ? 'success' : 'secondary'"
              rounded
          /></template>
        </Column>
        <Column header="Важность">
          <template #body="{ data }"
            >{{ importanceClassPresentation(data.importanceClass).title }} ·
            {{ data.numericPriority }}</template
          >
        </Column>
        <Column header="Локальное время">
          <template #body="{ data }"
            ><span
              :title="`${data.timezoneSnapshot} · ${formatDate(data.evaluatedAt)}`"
              >{{ data.localDate }} · {{ data.timezoneSnapshot }}</span
            ></template
          >
        </Column>
        <Column header="Когда"
          ><template #body="{ data }">{{
            relativeTime(data.evaluatedAt)
          }}</template></Column
        >
        <Column
          ><template #body><i class="pi pi-chevron-right muted" /></template
        ></Column>
      </DataTable>
      <div v-if="nextCursor" class="load-more">
        <Button
          label="Загрузить ещё решений"
          icon="pi pi-chevron-down"
          severity="secondary"
          outlined
          :loading="loadingMore"
          @click="load(nextCursor ?? undefined)"
        />
      </div>
    </div>

    <Drawer
      :visible="Boolean(selected)"
      position="right"
      header="Решение о запуске"
      class="decision-drawer"
      @update:visible="!$event && (selected = null)"
    >
      <template v-if="selected">
        <Tag
          :value="reasonLabel(selected.reason)"
          :severity="selected.outcome === 'STARTED' ? 'success' : 'secondary'"
        />
        <dl>
          <dt>Сценарий</dt>
          <dd>{{ selected.scenarioName }} · {{ selected.scenarioCode }}</dd>
          <dt>Игрок</dt>
          <dd class="mono">{{ selected.endUserExternalId }}</dd>
          <dt>Event</dt>
          <dd class="mono">{{ selected.eventLogId }}</dd>
          <dt>Важность</dt>
          <dd>
            {{ importanceClassPresentation(selected.importanceClass).title }} ·
            priority {{ selected.numericPriority }}
          </dd>
          <dt>Локальное время</dt>
          <dd>
            {{ selected.localDate }} · {{ selected.timezoneSnapshot }} ({{
              selected.timezoneSource
            }})
          </dd>
          <dt>Retry at</dt>
          <dd>{{ selected.retryAt ? formatDate(selected.retryAt) : "—" }}</dd>
          <dt>Run</dt>
          <dd class="mono">
            {{ selected.scenarioRunId ?? "Run не создавался" }}
          </dd>
          <dt>Победитель</dt>
          <dd class="mono">{{ selected.winnerScenarioId ?? "—" }}</dd>
        </dl>
        <details>
          <summary>Что проверено</summary>
          <pre>{{ JSON.stringify(selected.evidence, null, 2) }}</pre>
        </details>
        <details>
          <summary>Снимок политики</summary>
          <pre>{{ JSON.stringify(selected.policySnapshot, null, 2) }}</pre>
        </details>
      </template>
    </Drawer>
  </div>
</template>

<style scoped>
.decision-panel {
  display: grid;
  gap: 16px;
}
.decision-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
}
.decision-intro h2,
.decision-intro p {
  margin: 0;
}
.decision-intro h2 {
  margin-top: 4px;
  font: 700 1.05rem var(--font-display);
}
.decision-intro p {
  margin-top: 5px;
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
.decision-error {
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 240px);
  align-items: center;
  gap: 12px;
  padding: 14px;
}
.search {
  position: relative;
  display: block;
}
.search > i {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 14px;
  color: var(--text-small-muted);
  transform: translateY(-50%);
}
.search :deep(.p-inputtext),
.filters :deep(.p-select) {
  width: 100%;
}
.search :deep(.p-inputtext) {
  padding-left: 38px;
}
.table-card {
  overflow: hidden;
}
.table-card :deep(.p-datatable-table-container) {
  overflow-x: auto;
}
.primary-cell strong,
.primary-cell small {
  display: block;
}
.primary-cell small {
  margin-top: 3px;
  color: var(--text-small-muted);
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
  border-top: 1px solid var(--line);
}
.decision-drawer dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 10px 14px;
  margin: 20px 0;
}
.decision-drawer dt {
  color: var(--text-small-muted);
  font-size: 0.68rem;
}
.decision-drawer dd {
  margin: 0;
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.decision-drawer details {
  margin-top: 12px;
}
.decision-drawer pre {
  overflow: auto;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-subtle);
  font-size: 0.64rem;
}
@media (max-width: 700px) {
  .decision-intro {
    align-items: stretch;
    flex-direction: column;
  }
  .decision-intro :deep(.p-button) {
    width: 100%;
  }
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
