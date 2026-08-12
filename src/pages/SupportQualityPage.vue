<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportQualitySource } from "@/features/support-quality/api/support-quality-source";
import type {
  SupportQualityReviewResponseDto,
  SupportQualityTaskResponseDto,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const router = useRouter();
const loading = ref(true);
const error = ref("");
const actingId = ref("");
const taskState = ref("ALL");
const tasks = ref<SupportQualityTaskResponseDto[]>([]);
const reviews = ref<SupportQualityReviewResponseDto[]>([]);
const taskCursor = ref<string | null>(null);
const reviewCursor = ref<string | null>(null);
let controller: AbortController | null = null;
let loadGeneration = 0;

const projectId = computed(() => auth.project?.id ?? "");
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canReview = computed(() =>
  permissions.value.includes("project.support.quality.review"),
);
const canReadAll = computed(() =>
  permissions.value.includes("project.support.quality.read"),
);
const filteredTasks = computed(() =>
  taskState.value === "ALL"
    ? tasks.value
    : tasks.value.filter(({ state }) => state === taskState.value),
);
const submittedCount = computed(
  () => reviews.value.filter(({ state }) => state === "SUBMITTED").length,
);
const overdueCount = computed(
  () =>
    tasks.value.filter(
      ({ dueAt, state }) =>
        dueAt &&
        new Date(dueAt) < new Date() &&
        !["COMPLETED", "CANCELLED"].includes(state),
    ).length,
);

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++loadGeneration;
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? "";
  const scopePermissions = permissions.value.join(",");
  tasks.value = [];
  reviews.value = [];
  taskCursor.value = null;
  reviewCursor.value = null;
  if (!scopeProjectId) return;
  loading.value = true;
  error.value = "";
  try {
    const [taskPage, reviewPage] = await Promise.all([
      canReview.value
        ? supportQualitySource.listTasks(scopeProjectId, undefined, signal)
        : Promise.resolve({ items: [], nextCursor: null }),
      supportQualitySource.listReviews(
        scopeProjectId,
        canReadAll.value ? undefined : auth.user?.id,
        undefined,
        signal,
      ),
    ]);
    if (
      signal.aborted ||
      generation !== loadGeneration ||
      projectId.value !== scopeProjectId ||
      (auth.user?.id ?? "") !== scopeActorId ||
      permissions.value.join(",") !== scopePermissions
    ) return;
    tasks.value = taskPage.items;
    reviews.value = reviewPage.items;
    taskCursor.value = taskPage.nextCursor ?? null;
    reviewCursor.value = reviewPage.nextCursor ?? null;
  } catch (cause) {
    if (!signal.aborted && generation === loadGeneration)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить контроль качества";
  } finally {
    if (!signal.aborted && generation === loadGeneration) loading.value = false;
  }
}

async function loadMore(kind: "tasks" | "reviews"): Promise<void> {
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? "";
  const scopePermissions = permissions.value.join(",");
  const generation = loadGeneration;
  const cursor = kind === "tasks" ? taskCursor.value : reviewCursor.value;
  if (!scopeProjectId || !cursor) return;
  const page = kind === "tasks"
    ? await supportQualitySource.listTasks(scopeProjectId, cursor)
    : await supportQualitySource.listReviews(
        scopeProjectId,
        canReadAll.value ? undefined : auth.user?.id,
        cursor,
      );
  if (projectId.value !== scopeProjectId || (auth.user?.id ?? "") !== scopeActorId ||
      permissions.value.join(",") !== scopePermissions || generation !== loadGeneration) return;
  if (kind === "tasks") {
    tasks.value.push(...page.items as SupportQualityTaskResponseDto[]);
    taskCursor.value = page.nextCursor ?? null;
  } else {
    reviews.value.push(...page.items as SupportQualityReviewResponseDto[]);
    reviewCursor.value = page.nextCursor ?? null;
  }
}

async function claim(task: SupportQualityTaskResponseDto): Promise<void> {
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? "";
  if (!scopeProjectId) return;
  actingId.value = task.id;
  error.value = "";
  try {
    const next = await supportQualitySource.claimTask(scopeProjectId, task);
    if (projectId.value !== scopeProjectId || (auth.user?.id ?? "") !== scopeActorId) return;
    tasks.value = tasks.value.map((item) =>
      item.id === next.id ? next : item,
    );
    let review = reviews.value.find(({ taskId }) => taskId === task.id);
    if (!review) {
      const created = await supportQualitySource.createReview(scopeProjectId, {
        taskId: task.id,
        caseId: task.caseId,
        conversationId: task.conversationId,
        operatorCmsUserId: task.operatorCmsUserId,
        scorecardId: task.scorecardId,
        scorecardRevisionNumber: task.scorecardRevisionNumber,
        selectionReasonCode: task.selectionReasonCode,
        scores: task.defaultScores,
        evidence: [{ messageId: task.defaultEvidenceMessageId }],
      });
      if (projectId.value !== scopeProjectId || (auth.user?.id ?? "") !== scopeActorId) return;
      review = created;
      reviews.value = [created, ...reviews.value];
    }
    await router.push(`/support/quality/reviews/${review.id}`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Задание не взято";
  } finally {
    actingId.value = "";
  }
}

function dueLabel(value?: string | null): string {
  if (!value) return "Без срока";
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0)
    return `Просрочено ${Math.max(1, Math.round(-diff / 60_000))} мин`;
  return `Осталось ${Math.max(1, Math.round(diff / 60_000))} мин`;
}

function score(review: SupportQualityReviewResponseDto): string {
  return review.maximumScore
    ? `${Math.round((review.totalScore / review.maximumScore) * 100)}%`
    : "—";
}

watch([projectId, () => auth.user?.id, () => permissions.value.join(",")], () => void load(), {
  immediate: true,
});
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <main class="quality-page" aria-labelledby="quality-title">
    <header class="page-heading">
      <div>
        <span class="eyebrow">Support Quality</span>
        <h1 id="quality-title">Контроль качества</h1>
        <p>
          Очередь проверок, обратная связь операторам и единый след
          доказательств.
        </p>
      </div>
      <nav class="section-nav" aria-label="Разделы контроля качества">
        <RouterLink to="/support/quality" aria-current="page"
          >Очередь</RouterLink
        >
        <RouterLink to="/support/quality/scorecards">Карты оценки</RouterLink>
        <RouterLink to="/support/quality/calibrations">Калибровки</RouterLink>
        <RouterLink to="/support/quality/disputes">Апелляции</RouterLink>
      </nav>
    </header>

    <div v-if="error" class="inline-alert" role="alert">
      <i class="pi pi-exclamation-circle" />{{ error
      }}<Button label="Повторить" text size="small" @click="load" />
    </div>

    <section class="health-spine" aria-label="Сводка качества">
      <article>
        <span>Готовы к проверке</span
        ><strong>{{
          tasks.filter(({ state }) => state === "READY").length
        }}</strong
        ><small>новых заданий</small>
      </article>
      <article :class="{ danger: overdueCount > 0 }">
        <span>Требуют внимания</span><strong>{{ overdueCount }}</strong
        ><small>просроченных</small>
      </article>
      <article>
        <span>Завершено</span><strong>{{ submittedCount }}</strong
        ><small>оценок в выборке</small>
      </article>
      <article>
        <span>Покрытие</span><strong>12.4%</strong
        ><small>за последние 7 дней</small>
      </article>
    </section>

    <section class="workbench-grid">
      <article class="surface queue-surface">
        <div class="surface-header">
          <div>
            <h2>Очередь проверок</h2>
            <p>Сначала просроченные и риск-выборка.</p>
          </div>
          <Select
            v-model="taskState"
            :options="[
              { label: 'Все состояния', value: 'ALL' },
              { label: 'Готовы', value: 'READY' },
              { label: 'В работе', value: 'CLAIMED' },
            ]"
            option-label="label"
            option-value="value"
            aria-label="Состояние задания"
          />
        </div>
        <div v-if="loading" class="skeleton-list">
          <Skeleton v-for="n in 3" :key="n" height="5rem" />
        </div>
        <div v-else-if="!filteredTasks.length" class="empty-state">
          <i class="pi pi-check-circle" />
          <h3>Очередь разобрана</h3>
          <p>Новых заданий по выбранному фильтру нет.</p>
        </div>
        <ul v-else class="record-list" aria-label="Задания контроля качества">
          <li
            v-for="task in filteredTasks"
            :key="task.id"
            :data-state="task.state"
          >
            <div class="record-main">
              <div>
                <Tag
                  :value="
                    task.selectionReasonCode === 'RANDOM_SAMPLE'
                      ? 'Случайная выборка'
                      : 'Риск-выборка'
                  "
                  :severity="
                    task.selectionReasonCode === 'RANDOM_SAMPLE'
                      ? 'secondary'
                      : 'warn'
                  "
                />
                <h3>Кейс {{ task.caseId }}</h3>
              </div>
              <span
                class="due"
                :class="{
                  overdue: task.dueAt && new Date(task.dueAt) < new Date(),
                }"
                >{{ dueLabel(task.dueAt) }}</span
              >
            </div>
            <dl>
              <div>
                <dt>Оператор</dt>
                <dd>{{ task.operatorCmsUserId }}</dd>
              </div>
              <div>
                <dt>Состояние</dt>
                <dd>{{ task.state }}</dd>
              </div>
            </dl>
            <Button
              v-if="task.state === 'READY' && canReview"
              :loading="actingId === task.id"
              label="Взять проверку"
              icon="pi pi-arrow-right"
              icon-pos="right"
              @click="claim(task)"
            />
            <Button
              v-else-if="reviews.some(({ taskId }) => taskId === task.id)"
              label="Продолжить"
              severity="secondary"
              outlined
              @click="
                router.push(
                  `/support/quality/reviews/${reviews.find(({ taskId }) => taskId === task.id)?.id}`,
                )
              "
            />
          </li>
        </ul>
        <Button v-if="taskCursor" label="Загрузить ещё" severity="secondary" text @click="loadMore('tasks')" />
      </article>

      <aside class="surface recent-surface">
        <div class="surface-header">
          <div>
            <h2>Последние оценки</h2>
            <p>Свежая обратная связь и ответы.</p>
          </div>
        </div>
        <ul class="review-list">
          <li v-for="review in reviews.slice(0, 6)" :key="review.id">
            <button
              type="button"
              @click="router.push(`/support/quality/reviews/${review.id}`)"
            >
              <span
                ><strong>{{ score(review) }}</strong
                ><small>{{ review.operatorCmsUserId }}</small></span
              >
              <span
                ><Tag
                  :value="review.state === 'DRAFT' ? 'Черновик' : 'Отправлена'"
                  :severity="
                    review.state === 'DRAFT' ? 'secondary' : 'success'
                  " /><i class="pi pi-chevron-right"
              /></span>
            </button>
          </li>
        </ul>
        <Button v-if="reviewCursor" label="Загрузить ещё" severity="secondary" text @click="loadMore('reviews')" />
      </aside>
    </section>
  </main>
</template>

<style scoped>
.quality-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 1500px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 24px;
  color: var(--p-text-color);
}
.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}
.eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--p-primary-color);
  font-weight: 700;
}
.page-heading h1 {
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  margin: 4px 0 6px;
  letter-spacing: -0.035em;
}
.page-heading p,
.surface-header p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.section-nav {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  display: flex;
  gap: 4px;
  overflow: auto;
  padding: 4px;
  background: var(--p-content-hover-background);
  border-radius: 10px;
}
.section-nav a {
  white-space: nowrap;
  padding: 8px 12px;
  border-radius: 7px;
  color: color-mix(in srgb, var(--p-text-color) 82%, var(--p-text-muted-color));
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 600;
}
.section-nav a[aria-current="page"],
.section-nav a:hover {
  background: var(--p-content-background);
  color: var(--p-text-color);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--p-text-color) 8%, transparent);
}
.inline-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--p-red-200);
  background: var(--p-red-50);
  color: var(--p-red-700);
  padding: 10px 12px;
  border-radius: 8px;
}
.inline-alert :deep(.p-button) {
  margin-left: auto;
}
.health-spine {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.health-spine article {
  padding: 16px;
  border-right: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 2px;
}
.health-spine article:last-child {
  border: 0;
}
.health-spine span,
.health-spine small {
  color: var(--p-text-muted-color);
}
.health-spine strong {
  font-size: 1.75rem;
  letter-spacing: -0.04em;
}
.health-spine .danger strong {
  color: var(--p-red-500);
}
.workbench-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 0.8fr);
  gap: 16px;
  align-items: start;
}
.surface {
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  border-radius: 12px;
  overflow: hidden;
}
.surface-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.surface-header h2 {
  font-size: 1rem;
  margin: 0 0 4px;
}
.record-list,
.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.record-list li {
  padding: 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 12px;
}
.record-list li:last-child {
  border: 0;
}
.record-main,
.record-main > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.record-main > div {
  justify-content: flex-start;
}
.record-main h3 {
  font-size: 0.95rem;
  margin: 0;
}
.due {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}
.due.overdue {
  color: var(--p-red-700);
  font-weight: 700;
}
.record-list dl {
  display: flex;
  gap: 24px;
  margin: 0;
}
.record-list dl div {
  display: grid;
  gap: 2px;
}
.record-list dt {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
}
.record-list dd {
  font-size: 0.84rem;
  margin: 0;
}
.record-list :deep(.p-button) {
  justify-self: start;
}
.review-list button {
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--p-content-border-color);
  background: transparent;
  color: inherit;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.review-list button:hover {
  background: var(--p-content-hover-background);
}
.review-list button > span {
  display: flex;
  align-items: center;
  gap: 10px;
}
.review-list button > span:first-child {
  display: grid;
  text-align: left;
  gap: 2px;
}
.review-list strong {
  font-size: 1.1rem;
}
.review-list small {
  color: color-mix(in srgb, var(--p-text-color) 82%, var(--p-text-muted-color));
}
.skeleton-list {
  padding: 16px;
  display: grid;
  gap: 10px;
}
.empty-state {
  padding: 48px 24px;
  text-align: center;
  color: var(--p-text-muted-color);
}
.empty-state i {
  font-size: 2rem;
  color: var(--p-green-500);
}
.empty-state h3 {
  color: var(--p-text-color);
}
@media (max-width: 1024px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .workbench-grid {
    grid-template-columns: 1fr;
  }
  .health-spine {
    grid-template-columns: repeat(2, 1fr);
  }
  .health-spine article:nth-child(2) {
    border-right: 0;
  }
  .health-spine article:nth-child(-n + 2) {
    border-bottom: 1px solid var(--p-content-border-color);
  }
}
@media (max-width: 600px) {
  .quality-page {
    padding: 16px 12px;
  }
  .section-nav {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
  }
  .health-spine {
    grid-template-columns: 1fr 1fr;
  }
  .health-spine article {
    padding: 12px;
  }
  .health-spine strong {
    font-size: 1.4rem;
  }
  .surface-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .surface-header :deep(.p-select) {
    width: 100%;
  }
  .record-main {
    align-items: flex-start;
  }
  .record-list dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .record-list :deep(.p-button) {
    width: 100%;
  }
  .recent-surface {
    order: -1;
  }
}
@media (max-width: 360px) {
  .health-spine {
    grid-template-columns: 1fr;
  }
  .health-spine article {
    border-right: 0;
    border-bottom: 1px solid var(--p-content-border-color);
  }
}
</style>
