<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportOperatorPresentationSource } from '@/features/support-quality/api/support-operator-presentation-source';
import { supportQualitySource } from '@/features/support-quality/api/support-quality-source';
import { qualityQueueAccess } from '@/features/support-quality/model/support-quality-permissions';
import PageLoadingSwap from '@/shared/ui/PageLoadingSwap.vue';
import SupportDataWorkbenchSkeleton from '@/features/support-quality/ui/SupportDataWorkbenchSkeleton.vue';
import type {
  SupportQualityReviewResponseDto,
  SupportQualityTaskResponseDto,
} from '@/shared/api/generated/models';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const actingId = ref('');
const taskState = ref('ALL');
const tasks = ref<SupportQualityTaskResponseDto[]>([]);
const reviews = ref<SupportQualityReviewResponseDto[]>([]);
const operatorNames = ref<Record<string, string>>({});
const taskCursor = ref<string | null>(null);
const reviewCursor = ref<string | null>(null);
let controller: AbortController | null = null;
let loadGeneration = 0;

const projectId = computed(() => auth.project?.id ?? '');
const permissions = computed(() => auth.project?.effectivePermissionCodes ?? []);
const canReview = computed(() => permissions.value.includes('project.support.quality.review'));
const canReadAll = computed(() => permissions.value.includes('project.support.quality.read'));
const canManage = computed(() => permissions.value.includes('project.support.quality.manage'));
const access = computed(() => qualityQueueAccess(permissions.value));
const filteredTasks = computed(() =>
  taskState.value === 'ALL'
    ? tasks.value
    : tasks.value.filter(({ state }) => state === taskState.value),
);
const submittedCount = computed(
  () => reviews.value.filter(({ state }) => state === 'SUBMITTED').length,
);
const overdueCount = computed(
  () =>
    tasks.value.filter(
      ({ dueAt, state }) =>
        dueAt && new Date(dueAt) < new Date() && !['COMPLETED', 'CANCELLED'].includes(state),
    ).length,
);

function operatorName(cmsUserId: string): string {
  return operatorNames.value[cmsUserId] ?? 'Участник проекта';
}

async function resolveOperatorNames(
  scopeProjectId: string,
  items: Array<{ operatorCmsUserId: string }>,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const cmsUserIds = [
    ...new Set(items.map(({ operatorCmsUserId }) => operatorCmsUserId).filter(Boolean)),
  ].slice(0, 100);
  if (!cmsUserIds.length) return {};
  try {
    const response = await supportOperatorPresentationSource.resolve(
      scopeProjectId,
      cmsUserIds,
      signal,
    );
    return Object.fromEntries(
      response.items.map(({ cmsUserId, displayName }) => [
        cmsUserId,
        displayName.trim() || 'Участник проекта',
      ]),
    );
  } catch {
    return {};
  }
}

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++loadGeneration;
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? '';
  const scopePermissions = permissions.value.join(',');
  tasks.value = [];
  reviews.value = [];
  operatorNames.value = {};
  actingId.value = '';
  taskCursor.value = null;
  reviewCursor.value = null;
  if (!scopeProjectId) return;
  loading.value = true;
  error.value = '';
  try {
    const [taskPage, reviewPage] = await Promise.all([
      canReview.value
        ? supportQualitySource.listTasks(scopeProjectId, undefined, signal)
        : Promise.resolve({ items: [], nextCursor: null }),
      access.value.reviews === 'NONE'
        ? Promise.resolve({ items: [], nextCursor: null })
        : supportQualitySource.listReviews(
            scopeProjectId,
            access.value.reviews === 'PROJECT' ? undefined : auth.user?.id,
            undefined,
            signal,
          ),
    ]);
    const nextOperatorNames = await resolveOperatorNames(
      scopeProjectId,
      [...taskPage.items, ...reviewPage.items],
      signal,
    );
    if (
      signal.aborted ||
      generation !== loadGeneration ||
      projectId.value !== scopeProjectId ||
      (auth.user?.id ?? '') !== scopeActorId ||
      permissions.value.join(',') !== scopePermissions
    )
      return;
    tasks.value = taskPage.items;
    reviews.value = reviewPage.items;
    operatorNames.value = nextOperatorNames;
    taskCursor.value = taskPage.nextCursor ?? null;
    reviewCursor.value = reviewPage.nextCursor ?? null;
  } catch (cause) {
    if (!signal.aborted && generation === loadGeneration)
      error.value =
        cause instanceof Error ? cause.message : 'Не удалось загрузить контроль качества';
  } finally {
    if (!signal.aborted && generation === loadGeneration) loading.value = false;
  }
}

async function loadMore(kind: 'tasks' | 'reviews'): Promise<void> {
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? '';
  const scopePermissions = permissions.value.join(',');
  const generation = loadGeneration;
  const cursor = kind === 'tasks' ? taskCursor.value : reviewCursor.value;
  if (!scopeProjectId || !cursor) return;
  const page =
    kind === 'tasks'
      ? await supportQualitySource.listTasks(scopeProjectId, cursor)
      : await supportQualitySource.listReviews(
          scopeProjectId,
          canReadAll.value ? undefined : auth.user?.id,
          cursor,
        );
  const nextOperatorNames = await resolveOperatorNames(
    scopeProjectId,
    page.items as Array<{ operatorCmsUserId: string }>,
    controller?.signal,
  );
  if (
    projectId.value !== scopeProjectId ||
    (auth.user?.id ?? '') !== scopeActorId ||
    permissions.value.join(',') !== scopePermissions ||
    generation !== loadGeneration
  )
    return;
  if (kind === 'tasks') {
    tasks.value.push(...(page.items as SupportQualityTaskResponseDto[]));
    taskCursor.value = page.nextCursor ?? null;
  } else {
    reviews.value.push(...(page.items as SupportQualityReviewResponseDto[]));
    reviewCursor.value = page.nextCursor ?? null;
  }
  operatorNames.value = { ...operatorNames.value, ...nextOperatorNames };
}

async function claim(task: SupportQualityTaskResponseDto): Promise<void> {
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? '';
  const scopePermissions = permissions.value.join(',');
  const generation = loadGeneration;
  const inScope = () =>
    projectId.value === scopeProjectId &&
    (auth.user?.id ?? '') === scopeActorId &&
    permissions.value.join(',') === scopePermissions &&
    generation === loadGeneration &&
    canReview.value;
  if (!scopeProjectId) return;
  actingId.value = task.id;
  error.value = '';
  try {
    if (task.draftReviewId) {
      await router.push(`/support/quality/reviews/${task.draftReviewId}`);
      return;
    }
    const next = await supportQualitySource.claimTask(scopeProjectId, task);
    if (!inScope()) return;
    tasks.value = tasks.value.map((item) => (item.id === next.id ? next : item));
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
      if (!inScope()) return;
      review = created;
      reviews.value = [created, ...reviews.value];
    }
    await router.push(`/support/quality/reviews/${review.id}`);
  } catch (cause) {
    if (inScope()) error.value = cause instanceof Error ? cause.message : 'Задание не взято';
  } finally {
    if (inScope()) actingId.value = '';
  }
}
async function changeTask(
  task: SupportQualityTaskResponseDto,
  action: 'release' | 'cancel',
): Promise<void> {
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? '';
  const scopePermissions = permissions.value.join(',');
  const generation = loadGeneration;
  const inScope = () =>
    projectId.value === scopeProjectId &&
    (auth.user?.id ?? '') === scopeActorId &&
    permissions.value.join(',') === scopePermissions &&
    generation === loadGeneration;
  if (!scopeProjectId) return;
  actingId.value = task.id;
  try {
    const next =
      action === 'release'
        ? await supportQualitySource.releaseTask(scopeProjectId, task)
        : await supportQualitySource.cancelTask(scopeProjectId, task);
    if (!inScope()) return;
    tasks.value = tasks.value.map((item) => (item.id === next.id ? next : item));
  } catch (cause) {
    if (inScope())
      error.value = cause instanceof Error ? cause.message : 'Состояние задания не изменено';
  } finally {
    if (inScope()) actingId.value = '';
  }
}

function dueLabel(value?: string | null): string {
  if (!value) return 'Без срока';
  const diff = new Date(value).getTime() - Date.now();
  if (diff < 0) return `Просрочено ${Math.max(1, Math.round(-diff / 60_000))} мин`;
  return `Осталось ${Math.max(1, Math.round(diff / 60_000))} мин`;
}
function taskStateLabel(state: string): string {
  return (
    {
      READY: 'Готово к проверке',
      CLAIMED: 'В работе',
      COMPLETED: 'Завершено',
      CANCELLED: 'Отменено',
    }[state] ?? 'Неизвестно'
  );
}

function score(review: SupportQualityReviewResponseDto): string {
  return review.state === 'SUBMITTED' && review.maximumScore
    ? `${Math.round((review.totalScore / review.maximumScore) * 100)}%`
    : review.state === 'VOID'
      ? 'Аннулирована'
      : 'Черновик';
}

watch([projectId, () => auth.user?.id, () => permissions.value.join(',')], () => void load(), {
  immediate: true,
});
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <PageLoadingSwap :loading="loading">
    <template #loading><SupportDataWorkbenchSkeleton kind="quality" /></template>
    <main class="quality-page" aria-labelledby="quality-title">
      <header class="page-heading">
        <div>
          <span class="eyebrow">Качество поддержки</span>
          <h1 id="quality-title">Контроль качества</h1>
          <p>Очередь проверок, обратная связь операторам и единый след доказательств.</p>
        </div>
        <nav class="section-nav" aria-label="Разделы контроля качества">
          <RouterLink to="/support/quality" aria-current="page">Очередь</RouterLink>
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
          ><strong>{{ tasks.filter(({ state }) => state === 'READY').length }}</strong
          ><small>на загруженной странице</small>
        </article>
        <article :class="{ danger: overdueCount > 0 }">
          <span>Требуют внимания</span><strong>{{ overdueCount }}</strong
          ><small>на загруженной странице</small>
        </article>
        <article>
          <span>Завершено</span><strong>{{ submittedCount }}</strong
          ><small>на загруженной странице</small>
        </article>
        <article class="coverage-link">
          <span>Покрытие выборки</span><strong class="compact">В аналитике</strong
          ><small>Только по серверной метрике и её квитанции</small>
          <RouterLink to="/support/analytics/quality">Открыть качество</RouterLink>
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
            <li v-for="task in filteredTasks" :key="task.id" :data-state="task.state">
              <div class="record-main">
                <div>
                  <Tag
                    :value="
                      task.selectionReasonCode === 'RANDOM_SAMPLE'
                        ? 'Случайная выборка'
                        : 'Риск-выборка'
                    "
                    :severity="task.selectionReasonCode === 'RANDOM_SAMPLE' ? 'secondary' : 'warn'"
                  />
                  <h3>Проверка обращения</h3>
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
                  <dd>{{ operatorName(task.operatorCmsUserId) }}</dd>
                </div>
                <div>
                  <dt>Состояние</dt>
                  <dd>{{ taskStateLabel(task.state) }}</dd>
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
                v-if="
                  task.state === 'CLAIMED' &&
                  task.assignedReviewerCmsUserId === auth.user?.id &&
                  task.draftReviewId &&
                  canReview
                "
                label="Продолжить оценку"
                icon="pi pi-arrow-right"
                icon-pos="right"
                @click="router.push(`/support/quality/reviews/${task.draftReviewId}`)"
              />
              <Button
                v-if="
                  task.state === 'CLAIMED' &&
                  task.assignedReviewerCmsUserId === auth.user?.id &&
                  canReview
                "
                label="Вернуть в очередь"
                severity="secondary"
                text
                :loading="actingId === task.id"
                @click="changeTask(task, 'release')"
              />
              <Button
                v-if="canManage && !['COMPLETED', 'CANCELLED'].includes(task.state)"
                label="Отменить задание"
                class="queue-cancel"
                severity="danger"
                text
                :loading="actingId === task.id"
                @click="changeTask(task, 'cancel')"
              />
              <Button
                v-if="!task.draftReviewId && reviews.some(({ taskId }) => taskId === task.id)"
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
          <Button
            v-if="taskCursor"
            label="Загрузить ещё"
            severity="secondary"
            text
            @click="loadMore('tasks')"
          />
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
              <button type="button" @click="router.push(`/support/quality/reviews/${review.id}`)">
                <span
                  ><strong>{{ score(review) }}</strong
                  ><small>{{ operatorName(review.operatorCmsUserId) }}</small></span
                >
                <span
                  ><Tag
                    :value="review.state === 'DRAFT' ? 'Черновик' : 'Отправлена'"
                    :severity="review.state === 'DRAFT' ? 'secondary' : 'success'" /><i
                    class="pi pi-chevron-right"
                /></span>
              </button>
            </li>
          </ul>
          <Button
            v-if="reviewCursor"
            label="Загрузить ещё"
            severity="secondary"
            text
            @click="loadMore('reviews')"
          />
        </aside>
      </section>
    </main>
  </PageLoadingSwap>
</template>

<style scoped>
.quality-page {
  --quality-secondary-text: color-mix(
    in srgb,
    var(--p-text-color) 88%,
    var(--p-text-muted-color)
  );
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
.quality-page > *,
.workbench-grid > * {
  min-width: 0;
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
  color: var(--quality-secondary-text);
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
.section-nav a[aria-current='page'],
.section-nav a:hover {
  background: var(--p-content-background);
  color: var(--p-text-color);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--p-text-color) 8%, transparent);
}
:deep(.queue-cancel.p-button-text) {
  color: var(--p-red-700);
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
  color: var(--quality-secondary-text);
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
  color: var(--quality-secondary-text);
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
  color: var(--quality-secondary-text);
  text-transform: uppercase;
}
.record-list dd {
  font-size: 0.84rem;
  margin: 0;
}
.record-list :deep(.p-button) {
  justify-self: start;
}
.record-list :deep(.p-button:not(.p-button-secondary, .p-button-text)) {
  background: color-mix(in srgb, var(--p-primary-color) 84%, var(--p-slate-950));
  border-color: color-mix(in srgb, var(--p-primary-color) 84%, var(--p-slate-950));
}
.record-list :deep(.p-button-secondary) {
  color: var(--quality-secondary-text);
}
.quality-page :deep(.p-tag-warn) {
  color: color-mix(in srgb, var(--p-orange-700) 82%, var(--p-slate-950));
}
.quality-page :deep(.p-tag-success) {
  color: color-mix(in srgb, var(--p-green-700) 82%, var(--p-slate-950));
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
    grid-template-columns: minmax(0, 1fr);
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
    width: 100%;
    max-width: 100%;
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
