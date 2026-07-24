<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { LocationQueryRaw } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import IntegrationActivityLogView from "@/features/integration-activity/ui/IntegrationActivityLogView.vue";
import EventLogsPage from "./EventLogsPage.vue";

type LogsTab = "events" | "integrations";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canReadEvents = computed(() =>
  hasProjectPermission(permissions.value, "project.event_logs.read"),
);
const canReadIntegrations = computed(() =>
  hasProjectPermission(permissions.value, "project.integration_activity.read"),
);
const tabs = computed(() =>
  [
    {
      value: "events" as const,
      label: "События продукта",
      icon: "pi pi-bolt",
      available: canReadEvents.value,
    },
    {
      value: "integrations" as const,
      label: "Интеграции",
      icon: "pi pi-send",
      available: canReadIntegrations.value,
    },
  ].filter((tab) => tab.available),
);
const requestedTab = computed<LogsTab | null>(() =>
  route.query.tab === "events" || route.query.tab === "integrations"
    ? route.query.tab
    : null,
);
const activeTab = computed<LogsTab>(() => {
  const requested = tabs.value.find(
    (tab) => tab.value === requestedTab.value,
  )?.value;
  return requested ?? tabs.value[0]?.value ?? "events";
});

function normalizedQuery(tab: LogsTab) {
  const query: LocationQueryRaw = { ...route.query, tab };
  if (tab === "events") {
    for (const key of [
      "provider",
      "activityType",
      "activityStatus",
      "createdFrom",
      "createdTo",
    ])
      delete query[key];
  } else {
    for (const key of [
      "eventCode",
      "eventId",
      "source",
      "status",
      "receivedFrom",
      "receivedTo",
      "occurredFrom",
      "occurredTo",
    ])
      delete query[key];
  }
  return query;
}

function normalizeTab() {
  const desired = activeTab.value;
  if (!requestedTab.value && desired === "events") return;
  if (requestedTab.value === desired) return;
  void router.replace({ query: normalizedQuery(desired) });
}

function selectTab(tab: LogsTab) {
  if (tab === activeTab.value) return;
  void router.replace({ query: normalizedQuery(tab) });
}

onMounted(normalizeTab);
watch(
  () => [requestedTab.value, canReadEvents.value, canReadIntegrations.value],
  normalizeTab,
);
</script>

<template>
  <section class="page project-logs-page">
    <header class="project-logs-header">
      <div>
        <div class="eyebrow">Observability · Project history</div>
        <h1>Журнал проекта</h1>
        <p class="subtitle">
          События продукта и технический путь сообщений — в одном месте, но с
          разными правилами доступа.
        </p>
      </div>
      <div class="privacy-note">
        <i class="pi pi-shield" />
        <span
          ><strong>Безопасный просмотр</strong>Содержимое скрыто по
          умолчанию</span
        >
      </div>
    </header>

    <nav class="logs-tabs" role="tablist" aria-label="Раздел журнала проекта">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.value"
        :aria-controls="`${tab.value}-logs-panel`"
        :class="{ active: activeTab === tab.value }"
        @click="selectTab(tab.value)"
      >
        <i :class="tab.icon" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div
      v-if="activeTab === 'events' && canReadEvents"
      id="events-logs-panel"
      role="tabpanel"
    >
      <EventLogsPage embedded />
    </div>
    <div
      v-else-if="activeTab === 'integrations' && canReadIntegrations"
      id="integrations-logs-panel"
      role="tabpanel"
    >
      <IntegrationActivityLogView />
    </div>
  </section>
</template>

<style scoped>
.project-logs-page {
  max-width: 1540px;
}
.project-logs-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}
.project-logs-header > div:first-child {
  min-width: 0;
}
.project-logs-header h1 {
  margin-bottom: 6px;
}
.privacy-note {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 300px;
  padding: 11px 14px;
  border: 1px solid color-mix(in srgb, var(--text-brand) 18%, var(--line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--brand-soft) 55%, var(--surface-card));
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.35;
}
.privacy-note i {
  color: var(--text-brand);
  font-size: 1.05rem;
}
.privacy-note span {
  display: grid;
}
.privacy-note strong {
  color: var(--ink);
}
.logs-tabs {
  display: inline-flex;
  gap: 5px;
  margin-bottom: 18px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--surface-active);
}
.logs-tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}
.logs-tabs button:hover {
  color: var(--ink);
}
.logs-tabs button.active {
  background: var(--surface-card);
  color: var(--ink);
  box-shadow: var(--shadow-raised);
}
.logs-tabs button.active i {
  color: var(--text-brand);
}
@media (max-width: 1500px) {
  .project-logs-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .privacy-note {
    max-width: none;
    width: 100%;
  }
}
@media (max-width: 760px) {
  .logs-tabs {
    display: flex;
    width: 100%;
  }
  .logs-tabs button {
    flex: 1;
    justify-content: center;
    padding-inline: 10px;
  }
}
</style>
