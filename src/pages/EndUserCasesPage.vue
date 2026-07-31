<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Drawer from "primevue/drawer";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { type EndUserCaseFilters as EndUserCaseFiltersModel } from "@/features/end-user-cases/model/end-user-case";
import {
  endUserCaseFiltersFromRoute,
  endUserCaseRouteQuery,
} from "@/features/end-user-cases/model/end-user-case-route";
import { useEndUserCasesStore } from "@/features/end-user-cases/model/end-user-cases.store";
import EndUserCaseCard from "@/features/end-user-cases/ui/EndUserCaseCard.vue";
import EndUserCaseDetail from "@/features/end-user-cases/ui/EndUserCaseDetail.vue";
import EndUserCaseDialogs from "@/features/end-user-cases/ui/EndUserCaseDialogs.vue";
import EndUserCaseEscalationDialogs from "@/features/end-user-cases/ui/EndUserCaseEscalationDialogs.vue";
import EndUserCaseFilters from "@/features/end-user-cases/ui/EndUserCaseFilters.vue";
import type { CaseVerificationRunResponseDto } from "@/shared/api/generated/models";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useEndUserCasesStore();
const isMobile = ref(false);
const dialogs = ref<InstanceType<typeof EndUserCaseDialogs> | null>(null);
const escalationDialogs = ref<InstanceType<
  typeof EndUserCaseEscalationDialogs
> | null>(null);
const latestVerification = ref<{
  caseId: string;
  run: CaseVerificationRunResponseDto;
} | null>(null);

const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canRead = computed(() =>
  hasProjectPermission(permissions.value, "project.cases.read"),
);
const canManage = computed(() =>
  hasProjectPermission(permissions.value, "project.cases.manage"),
);
const canAssign = computed(() =>
  hasProjectPermission(permissions.value, "project.cases.assign"),
);
const canEscalate = computed(() =>
  hasProjectPermission(permissions.value, "project.cases.escalate"),
);
const canConfigure = computed(() =>
  hasProjectPermission(permissions.value, "project.cases.settings.manage"),
);
const canReadEndUser = computed(() =>
  hasProjectPermission(permissions.value, "project.profiles.read"),
);
const canReadConversations = computed(() =>
  hasProjectPermission(permissions.value, "project.conversations.read"),
);
const canReadProposals = computed(() =>
  hasProjectPermission(permissions.value, "project.ai_proposals.read"),
);
const canVerifyEvents = computed(() =>
  hasProjectPermission(permissions.value, "project.end_user_cases.verify"),
);
const canPreviewEvents = computed(() =>
  hasProjectPermission(permissions.value, "project.event_query_policy.preview"),
);
const selectedVisible = computed(() => Boolean(store.selectedId));
const selectedVerificationRun = computed(() => {
  const latest = latestVerification.value;
  if (!latest) return null;
  return latest.caseId === store.selected?.case.id ? latest.run : null;
});
const counts = computed(() => ({
  active: store.summary?.openCount ?? 0,
  attention: store.summary?.attentionCount ?? 0,
  resolved:
    (store.summary?.resolvedCount ?? 0) + (store.summary?.unresolvedCount ?? 0),
}));

async function applyFilters(filters: EndUserCaseFiltersModel): Promise<void> {
  await router.replace({ query: endUserCaseRouteQuery(filters) });
  await store.setFilters(filters);
}

async function openCase(id: string): Promise<void> {
  await router.push({
    name: "end-user-case-detail",
    params: { caseId: id },
    query: endUserCaseRouteQuery(store.filters),
  });
  if (store.selectedId !== id) await store.open(id, canReadProposals.value);
  await nextTick();
  document.querySelector<HTMLElement>(".case-detail h2")?.focus();
}

async function closeDetail(): Promise<void> {
  const id = store.selectedId;
  store.close();
  await router.push({
    name: "end-user-cases",
    query: endUserCaseRouteQuery(store.filters),
  });
  await nextTick();
  if (id)
    document
      .querySelector<HTMLElement>(`[data-case-id="${id}"] button`)
      ?.focus();
}

function updateViewport(): void {
  isMobile.value = window.innerWidth <= 1180;
}

async function handleVerificationCompleted(
  run: CaseVerificationRunResponseDto,
): Promise<void> {
  if (!store.selectedId) return;
  latestVerification.value = { caseId: store.selectedId, run };
  await store.open(store.selectedId, canReadProposals.value);
}

onMounted(async () => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  if (!canRead.value || !auth.project?.id) return;
  await store.activateProject(auth.project.id);
  const initialFilters = endUserCaseFiltersFromRoute(route.query);
  if (JSON.stringify(initialFilters) !== JSON.stringify(store.filters))
    await store.setFilters(initialFilters);
  const caseId = route.params.caseId;
  if (typeof caseId === "string")
    await store.open(caseId, canReadProposals.value);
});

onBeforeUnmount(() => window.removeEventListener("resize", updateViewport));

watch(
  () => route.params.caseId,
  async (caseId) => {
    if (typeof caseId === "string" && caseId !== store.selectedId)
      await store.open(caseId, canReadProposals.value);
    else if (!caseId && store.selectedId) store.close();
  },
);

watch(canRead, async (allowed) => {
  if (!allowed) {
    store.deactivate();
    return;
  }
  const projectId = auth.project?.id;
  if (!projectId) return;
  await store.activateProject(projectId);
  const caseId = route.params.caseId;
  if (typeof caseId === "string")
    await store.open(caseId, canReadProposals.value);
});

watch(canReadProposals, (allowed) => {
  void store.setProposalAccess(allowed);
});
</script>

<template>
  <section class="page cases-page">
    <header class="page-header cases-header">
      <div>
        <div class="eyebrow">Качество поддержки Lola</div>
        <h1>Обращения пользователей</h1>
        <p class="subtitle">
          Цели и проблемы пользователей — от первого сообщения до проверенного
          результата, включая возвраты и повторные обращения.
        </p>
      </div>
      <div class="header-actions">
        <span
          v-if="store.realtimeState === 'DEGRADED'"
          class="realtime degraded"
        >
          <i class="pi pi-cloud" /> Автообновление недоступно
        </span>
        <Button
          v-if="canConfigure"
          label="Настройки"
          icon="pi pi-sliders-h"
          severity="secondary"
          text
          @click="router.push({ name: 'end-user-case-settings' })"
        />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          text
          :loading="store.loading"
          @click="store.reconcile()"
        />
      </div>
    </header>

    <Message v-if="!canRead" severity="warn" :closable="false">
      Для просмотра обращений требуется разрешение проекта.
    </Message>
    <template v-else>
      <div
        v-if="store.summary"
        class="summary-grid"
        aria-label="Сводка обращений"
      >
        <div>
          <span>Всего</span><strong>{{ store.summary.totalCount }}</strong>
        </div>
        <div>
          <span>Активные</span><strong>{{ store.summary.openCount }}</strong>
        </div>
        <div>
          <span>Решены</span><strong>{{ store.summary.resolvedCount }}</strong>
        </div>
        <div>
          <span>Требуют внимания</span
          ><strong>{{ store.summary.attentionCount }}</strong>
        </div>
        <div>
          <span>Критичные</span
          ><strong>{{ store.summary.criticalCount }}</strong>
        </div>
      </div>

      <EndUserCaseFilters
        :model-value="store.filters"
        :counts="counts"
        @update:model-value="applyFilters"
      />

      <Message
        v-if="store.realtimeState === 'DEGRADED'"
        severity="info"
        :closable="false"
      >
        Данные остаются доступны через REST. Используйте «Обновить» для сверки с
        сервером.
      </Message>

      <div class="cases-layout card">
        <div class="case-list" aria-label="Список обращений">
          <div v-if="store.loading && !store.items.length" class="list-loading">
            <Skeleton v-for="index in 5" :key="index" height="150px" />
          </div>
          <Message
            v-else-if="store.error && !store.items.length"
            severity="error"
            :closable="false"
          >
            {{ store.error }}
            <Button
              label="Повторить"
              text
              @click="store.loadPage({ replace: true })"
            />
          </Message>
          <div v-else-if="!store.items.length" class="empty">
            <i class="pi pi-check-circle" />
            <strong>Обращений по этим условиям нет</strong>
            <p>Измените фильтры или обновите список.</p>
          </div>
          <template v-else>
            <div
              v-for="item in store.items"
              :key="item.id"
              :data-case-id="item.id"
            >
              <EndUserCaseCard
                :item="item"
                :selected="store.selectedId === item.id"
                @select="openCase(item.id)"
              />
            </div>
            <Button
              v-if="store.nextCursor"
              class="load-more"
              label="Показать ещё"
              icon="pi pi-chevron-down"
              severity="secondary"
              outlined
              :loading="store.loadingMore"
              @click="store.loadPage()"
            />
          </template>
        </div>
        <aside v-if="!isMobile" class="detail-panel">
          <EndUserCaseDetail
            :value="store.selected"
            :loading="store.detailLoading"
            :messages-loading="store.messagesLoading"
            :mutating="store.mutating"
            :can-manage="canManage"
            :can-assign="canAssign"
            :can-escalate="canEscalate"
            :current-cms-user-id="auth.user?.id"
            :can-read-end-user="canReadEndUser"
            :can-read-conversation="canReadConversations"
            :can-read-proposals="canReadProposals"
            :project-id="auth.project?.id"
            :can-verify-events="canVerifyEvents"
            :can-preview-events="canPreviewEvents"
            :verification-run="selectedVerificationRun"
            :error="store.detailError"
            @retry="
              store.selectedId && store.open(store.selectedId, canReadProposals)
            "
            @request-transition="dialogs?.requestTransition($event)"
            @request-assignment="dialogs?.requestAssignment()"
            @request-escalation-action="
              escalationDialogs?.requestEscalationAction($event)
            "
            @request-classification="dialogs?.requestClassification()"
            @request-unlink="dialogs?.requestUnlink($event)"
            @request-merge="dialogs?.requestMerge()"
            @request-split="dialogs?.requestSplit()"
            @load-more-messages="store.loadMoreMessages"
            @verification-completed="handleVerificationCompleted"
          />
        </aside>
      </div>
    </template>
  </section>

  <Drawer
    v-if="isMobile && canRead"
    :visible="selectedVisible"
    position="right"
    :style="{ width: '100vw' }"
    @update:visible="!$event && closeDetail()"
  >
    <EndUserCaseDetail
      :value="store.selected"
      :loading="store.detailLoading"
      :messages-loading="store.messagesLoading"
      :mutating="store.mutating"
      :can-manage="canManage"
      :can-assign="canAssign"
      :can-escalate="canEscalate"
      :current-cms-user-id="auth.user?.id"
      :can-read-end-user="canReadEndUser"
      :can-read-conversation="canReadConversations"
      :can-read-proposals="canReadProposals"
      :project-id="auth.project?.id"
      :can-verify-events="canVerifyEvents"
      :can-preview-events="canPreviewEvents"
      :verification-run="selectedVerificationRun"
      :error="store.detailError"
      @request-transition="dialogs?.requestTransition($event)"
      @request-assignment="dialogs?.requestAssignment()"
      @request-escalation-action="
        escalationDialogs?.requestEscalationAction($event)
      "
      @request-classification="dialogs?.requestClassification()"
      @request-unlink="dialogs?.requestUnlink($event)"
      @request-merge="dialogs?.requestMerge()"
      @request-split="dialogs?.requestSplit()"
      @load-more-messages="store.loadMoreMessages"
      @verification-completed="handleVerificationCompleted"
    />
  </Drawer>

  <EndUserCaseDialogs v-if="canRead" ref="dialogs" />
  <EndUserCaseEscalationDialogs
    v-if="canRead"
    ref="escalationDialogs"
    :can-escalate="canEscalate"
    :can-assign="canAssign"
    :can-manage="canManage"
    :current-cms-user-id="auth.user?.id"
  />
</template>

<style scoped>
.cases-page {
  max-width: 1580px;
}
.cases-header {
  align-items: center;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}
.realtime {
  color: var(--text-tertiary);
  font-size: 0.7rem;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.summary-grid > div {
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-card);
}
.summary-grid span,
.summary-grid strong {
  display: block;
}
.summary-grid span {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.summary-grid strong {
  margin-top: 5px;
  font-size: 1.2rem;
}
.cases-layout {
  display: grid;
  grid-template-columns: minmax(340px, 0.78fr) minmax(520px, 1.22fr);
  min-height: 680px;
  overflow: hidden;
}
.case-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-right: 1px solid var(--border-default);
  background: var(--surface-subtle);
}
.list-loading {
  display: grid;
  gap: 10px;
}
.detail-panel {
  min-width: 0;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
}
.load-more {
  align-self: center;
}
.empty {
  display: grid;
  place-items: center;
  min-height: 420px;
  color: var(--text-tertiary);
  text-align: center;
}
.empty i {
  font-size: 2rem;
}
.empty p {
  margin: 0;
}
@media (max-width: 1180px) {
  .cases-layout {
    display: block;
  }
  .case-list {
    border-right: 0;
  }
}
@media (max-width: 700px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .header-actions {
    flex-wrap: wrap;
  }
}
</style>
