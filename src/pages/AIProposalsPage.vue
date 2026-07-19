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
import Dialog from "primevue/dialog";
import Drawer from "primevue/drawer";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  defaultAIProposalFilters,
  type AIProposalFilters as AIProposalFiltersModel,
  type AIProposalKind,
  type AIProposalPreset,
  type AIProposalPriority,
} from "@/features/ai-proposals/model/ai-proposal";
import { useAIProposalsStore } from "@/features/ai-proposals/model/ai-proposals.store";
import { canReviewAIProposals } from "@/features/ai-proposals/model/ai-proposal-presentation";
import AIProposalCard from "@/features/ai-proposals/ui/AIProposalCard.vue";
import AIProposalDetail from "@/features/ai-proposals/ui/AIProposalDetail.vue";
import AIProposalFilters from "@/features/ai-proposals/ui/AIProposalFilters.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useAIProposalsStore();
const isMobile = ref(false);
const resolveDialogVisible = ref(false);
const resolutionReason = ref("");

const canAccess = computed(() => canReviewAIProposals(auth.user?.role));
const selectedVisible = computed(() => Boolean(store.selectedId));
const countDescription = computed(() => {
  if (!store.summary) return "Загрузка сводки";
  return `${store.summary.openCount} открытых · ${store.summary.unreadCount} непрочитанных`;
});
const emptyMessage = computed(() => {
  if (store.filters.preset === "UNREAD") return "Непрочитанных предложений нет";
  if (store.filters.preset === "COMPLETED")
    return "Завершённых предложений пока нет";
  return "Новых предложений нет";
});

function validPreset(value: unknown): AIProposalPreset {
  return ["OPEN", "UNREAD", "COMPLETED"].includes(String(value))
    ? (value as AIProposalPreset)
    : "OPEN";
}

function filtersFromRoute(): AIProposalFiltersModel {
  const kind = route.query.kind;
  const priority = route.query.priority;
  return {
    preset: validPreset(route.query.view),
    ...(["ADMIN_ATTENTION", "INSIGHT", "ACTION_RECOMMENDATION"].includes(
      String(kind),
    )
      ? { kind: kind as AIProposalKind }
      : {}),
    ...(["LOW", "NORMAL", "HIGH", "URGENT"].includes(String(priority))
      ? { priority: priority as AIProposalPriority }
      : {}),
    ...(typeof route.query.endUserId === "string" && route.query.endUserId
      ? { endUserId: route.query.endUserId }
      : {}),
    ...(typeof route.query.from === "string" && route.query.from
      ? { createdFrom: route.query.from }
      : {}),
    ...(typeof route.query.to === "string" && route.query.to
      ? { createdTo: route.query.to }
      : {}),
  };
}

function queryFromFilters(filters: AIProposalFiltersModel) {
  return {
    ...(filters.preset !== "OPEN" ? { view: filters.preset } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.endUserId ? { endUserId: filters.endUserId } : {}),
    ...(filters.createdFrom ? { from: filters.createdFrom } : {}),
    ...(filters.createdTo ? { to: filters.createdTo } : {}),
  };
}

async function applyFilters(filters: AIProposalFiltersModel): Promise<void> {
  await router.replace({ query: queryFromFilters(filters) });
  await store.setFilters(filters);
  if (store.selectedId) await closeDetail();
}

async function openProposal(id: string): Promise<void> {
  await router.push({
    name: "ai-proposal-detail",
    params: { proposalId: id },
    query: queryFromFilters(store.filters),
  });
  if (store.selectedId !== id) await store.open(id);
  await nextTick();
  await store.markSelectedRead();
  document
    .querySelector<HTMLElement>(
      isMobile.value
        ? ".proposal-drawer .proposal-detail h2"
        : ".detail-panel .proposal-detail h2",
    )
    ?.focus();
}

async function closeDetail(): Promise<void> {
  const selectedId = store.selectedId;
  store.close();
  await router.push({
    name: "ai-proposals",
    query: queryFromFilters(store.filters),
  });
  await nextTick();
  if (selectedId)
    document
      .querySelector<HTMLElement>(`[data-proposal-id="${selectedId}"] button`)
      ?.focus();
}

function askToResolve(): void {
  resolutionReason.value = "";
  resolveDialogVisible.value = true;
}

async function resolveProposal(): Promise<void> {
  const proposal = store.selectedDetail;
  if (!proposal) return;
  const resolved = await store.resolveProposal(
    proposal.id,
    proposal.version,
    resolutionReason.value,
  );
  if (resolved) resolveDialogVisible.value = false;
}

function updateViewport(): void {
  isMobile.value = window.innerWidth <= 900;
}

onMounted(async () => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  if (!canAccess.value || !auth.project?.id) return;
  if (store.projectId !== auth.project.id)
    await store.activateProject(auth.project.id);
  const initialFilters = filtersFromRoute();
  if (
    JSON.stringify(initialFilters) !==
    JSON.stringify(defaultAIProposalFilters())
  )
    await store.setFilters(initialFilters);
  const proposalId = route.params.proposalId;
  if (typeof proposalId === "string") {
    await store.open(proposalId);
    await nextTick();
    await store.markSelectedRead();
  }
});

onBeforeUnmount(() => window.removeEventListener("resize", updateViewport));

watch(
  () => route.params.proposalId,
  async (proposalId) => {
    if (typeof proposalId === "string" && proposalId !== store.selectedId) {
      await store.open(proposalId);
      await nextTick();
      await store.markSelectedRead();
    } else if (!proposalId && store.selectedId) store.close();
  },
);
</script>

<template>
  <section class="page proposals-page">
    <header class="page-header proposals-header">
      <div>
        <div class="eyebrow">AI inbox</div>
        <h1>Предложения Lola</h1>
        <p class="subtitle">
          Запросы пользователей, которым нужно внимание команды. Lola ничего не
          выполняет без решения администратора.
        </p>
      </div>
      <div class="header-summary">
        <div>
          <strong>{{ countDescription }}</strong>
          <span
            v-if="store.realtimeState === 'DEGRADED'"
            class="realtime-state degraded"
            ><i class="pi pi-cloud" /> Realtime временно недоступен</span
          >
          <span
            v-else-if="store.realtimeState === 'CONNECTED'"
            class="realtime-state connected"
            ><i class="pi pi-circle-fill" /> Обновляется в реальном
            времени</span
          >
        </div>
        <Button
          icon="pi pi-refresh"
          label="Обновить"
          severity="secondary"
          outlined
          :loading="store.loading"
          @click="store.reconcile()"
        />
      </div>
    </header>

    <Message v-if="!canAccess" severity="warn" :closable="false">
      Предложения Lola доступны владельцам и администраторам проекта.
    </Message>
    <template v-else>
      <AIProposalFilters
        :model-value="store.filters"
        @update:model-value="applyFilters"
      />

      <Message
        v-if="store.realtimeState === 'DEGRADED'"
        severity="info"
        :closable="false"
      >
        Realtime временно недоступен. Список остаётся доступным и сверяется с
        сервером при открытии страницы и по кнопке «Обновить».
      </Message>

      <div class="inbox-layout card">
        <div class="proposal-list" aria-label="Список предложений Lola">
          <div v-if="store.loading && !store.items.length" class="list-loading">
            <div v-for="index in 5" :key="index" class="list-skeleton">
              <Skeleton width="35%" height="14px" />
              <Skeleton width="82%" height="20px" />
              <Skeleton height="42px" />
            </div>
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
              size="small"
              @click="store.loadPage({ replace: true })"
            />
          </Message>
          <div v-else-if="!store.items.length" class="empty proposal-empty">
            <span><i class="pi pi-check" /></span>
            <strong>{{ emptyMessage }}</strong>
            <p>Новые запросы появятся здесь автоматически.</p>
          </div>
          <template v-else>
            <div
              v-for="proposal in store.items"
              :key="proposal.id"
              :data-proposal-id="proposal.id"
            >
              <AIProposalCard
                :proposal="proposal"
                :selected="store.selectedId === proposal.id"
                @select="openProposal(proposal.id)"
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
          <AIProposalDetail
            :proposal="store.selectedDetail"
            :loading="store.detailLoading"
            :deciding="store.deciding"
            :error="store.detailError"
            @retry="store.selectedId && store.open(store.selectedId)"
            @resolve="askToResolve"
          />
        </aside>
      </div>
    </template>
  </section>

  <Drawer
    v-if="isMobile"
    :visible="selectedVisible"
    position="right"
    class="proposal-drawer"
    :style="{ width: '100vw' }"
    @update:visible="!$event && closeDetail()"
  >
    <AIProposalDetail
      :proposal="store.selectedDetail"
      :loading="store.detailLoading"
      :deciding="store.deciding"
      :error="store.detailError"
      @retry="store.selectedId && store.open(store.selectedId)"
      @resolve="askToResolve"
    />
  </Drawer>

  <Dialog
    v-model:visible="resolveDialogVisible"
    modal
    header="Отметить запрос обработанным?"
    :style="{ width: 'min(480px, calc(100vw - 24px))' }"
  >
    <p class="dialog-copy">
      Предложение перейдёт в завершённые. Это действие не отправляет сообщение
      пользователю и не выполняет никаких операций от его имени.
    </p>
    <label class="field">
      <span>Комментарий <small>необязательно</small></span>
      <Textarea
        v-model="resolutionReason"
        rows="4"
        maxlength="2000"
        placeholder="Например: ответили пользователю в диалоге"
      />
    </label>
    <template #footer>
      <Button
        label="Отмена"
        severity="secondary"
        text
        @click="resolveDialogVisible = false"
      />
      <Button
        label="Да, обработано"
        icon="pi pi-check"
        :loading="store.deciding"
        @click="resolveProposal"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.proposals-page {
  max-width: 1540px;
}
.proposals-header {
  align-items: center;
}
.header-summary {
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-summary > div {
  text-align: right;
}
.header-summary strong,
.realtime-state {
  display: block;
}
.header-summary strong {
  font-size: 0.78rem;
}
.realtime-state {
  margin-top: 5px;
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.realtime-state i {
  margin-right: 5px;
  font-size: 0.52rem;
}
.realtime-state.connected i {
  color: var(--status-success);
}
.realtime-state.degraded {
  color: var(--status-warning-text);
}
.inbox-layout {
  min-height: calc(100dvh - 280px);
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(440px, 1.1fr);
  margin-top: 16px;
  overflow: hidden;
  border-radius: 20px;
}
.proposal-list {
  min-width: 0;
  padding: 16px;
  border-right: 1px solid var(--border-default);
  background: var(--surface-subtle);
}
.proposal-list > div + div,
.proposal-list > div + button {
  margin-top: 10px;
}
.detail-panel {
  min-width: 0;
  background: var(--surface-card);
}
.list-loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.list-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
}
.proposal-empty {
  min-height: 420px;
  display: grid;
  place-content: center;
  justify-items: center;
}
.proposal-empty > span {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.proposal-empty strong {
  margin-top: 16px;
  color: var(--text-primary);
}
.proposal-empty p {
  margin: 5px 0 0;
  font-size: 0.75rem;
}
.load-more {
  width: 100%;
  margin-top: 12px;
}
.dialog-copy {
  margin: 0 0 18px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.field span {
  font-weight: 700;
}
.field small {
  color: var(--text-tertiary);
  font-weight: 400;
}
@media (max-width: 1120px) {
  .inbox-layout {
    grid-template-columns: minmax(340px, 0.85fr) minmax(390px, 1.15fr);
  }
}
@media (max-width: 900px) {
  .proposals-header {
    align-items: flex-start;
  }
  .header-summary {
    width: 100%;
    justify-content: space-between;
  }
  .header-summary > div {
    text-align: left;
  }
  .inbox-layout {
    min-height: 480px;
    display: block;
  }
  .proposal-list {
    border-right: 0;
  }
  .detail-panel {
    display: none;
  }
}
@media (max-width: 540px) {
  .header-summary {
    align-items: stretch;
    flex-direction: column;
  }
  .header-summary :deep(.p-button) {
    align-self: flex-start;
  }
  .proposal-list {
    padding: 10px;
  }
}
</style>

<style>
.proposal-drawer .p-drawer-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.proposal-drawer .p-drawer-content {
  padding: 0;
}
@media (max-width: 900px) {
  .proposal-drawer {
    max-width: 100vw !important;
  }
}
</style>
