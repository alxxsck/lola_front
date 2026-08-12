<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportOperatorPresentationSource } from '@/features/support-quality/api/support-operator-presentation-source';
import { supportQualitySource } from '@/features/support-quality/api/support-quality-source';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportQualityEvidenceExcerptResponseDto,
  SupportQualityReviewBootstrapResponseDto,
  SupportQualityReviewDetailResponseDto,
  SupportQualityReviewFieldErrorResponseDtoCode,
} from '@/shared/api/generated/models';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const review = ref<SupportQualityReviewDetailResponseDto | null>(null);
const bootstrap = ref<SupportQualityReviewBootstrapResponseDto | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');
const dialog = ref<'reply' | 'dispute' | 'void' | null>(null);
const dialogText = ref('');
const operatorName = ref('Участник проекта');
const diagnosticsOpen = ref(false);
const excerpts = reactive<Record<string, SupportQualityEvidenceExcerptResponseDto | undefined>>({});
const excerptLoading = ref('');
const evidenceChoice = ref('');
const fieldErrors = reactive<
  Record<string, SupportQualityReviewFieldErrorResponseDtoCode | undefined>
>({});
let controller: AbortController | null = null;
let scopeGeneration = 0;
function mutationScope() {
  return {
    projectId: projectId.value,
    actorId: auth.user?.id ?? '',
    permissions: permissions.value.join(','),
    generation: scopeGeneration,
    reviewId: review.value?.id ?? '',
  };
}
function scopeIsCurrent(scope: ReturnType<typeof mutationScope>): boolean {
  return (
    scope.projectId === projectId.value &&
    scope.actorId === (auth.user?.id ?? '') &&
    scope.permissions === permissions.value.join(',') &&
    scope.generation === scopeGeneration &&
    scope.reviewId === (review.value?.id ?? '') &&
    canAccess.value
  );
}
function mutationTargetIsCurrent(scope: ReturnType<typeof mutationScope>): boolean {
  return (
    scope.projectId === projectId.value &&
    scope.actorId === (auth.user?.id ?? '') &&
    scope.permissions === permissions.value.join(',') &&
    scope.reviewId === String(route.params.reviewId ?? '') &&
    scope.reviewId === (review.value?.id ?? '') &&
    canAccess.value
  );
}
function snapshotDraft() {
  return {
    summary: draft.summary,
    scores: draft.scores.map((item) => ({ ...item })),
    evidence: draft.evidence.map((item) => ({ ...item })),
  };
}
function clearProtectedState(): void {
  bootstrap.value = null;
  review.value = null;
  for (const key of Object.keys(excerpts)) delete excerpts[key];
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
}
function captureFieldErrors(cause: unknown): boolean {
  if (!(cause instanceof ApiError)) return false;
  const body = cause.details;
  if (!body || typeof body !== 'object') return false;
  const nested = 'details' in body ? body.details : body;
  if (!nested || typeof nested !== 'object' || !('fieldErrors' in nested)) return false;
  const errors = nested.fieldErrors;
  if (!Array.isArray(errors)) return false;
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
  for (const item of errors) {
    if (
      item &&
      typeof item === 'object' &&
      'field' in item &&
      typeof item.field === 'string' &&
      'code' in item &&
      typeof item.code === 'string'
    )
      fieldErrors[item.field] = item.code as SupportQualityReviewFieldErrorResponseDtoCode;
  }
  return true;
}
async function handleMutationFailure(
  cause: unknown,
  scope: ReturnType<typeof mutationScope>,
  fallback: string,
  preserveDraft = false,
): Promise<void> {
  if (!scopeIsCurrent(scope)) return;
  if (cause instanceof ApiError && cause.status === 409) {
    if (captureFieldErrors(cause)) {
      error.value = 'Проверьте отмеченные поля перед продолжением.';
      return;
    }
    const preserved = preserveDraft ? snapshotDraft() : null;
    await load();
    if (!mutationTargetIsCurrent(scope)) return;
    if (preserved && review.value?.state === 'DRAFT') {
      draft.summary = preserved.summary;
      draft.scores = preserved.scores;
      draft.evidence = preserved.evidence;
    }
    error.value = preserveDraft
      ? 'Оценка изменилась на сервере. Данные обновлены, ваш черновик сохранён в форме — проверьте и повторите.'
      : 'Оценка изменилась на сервере. Мы обновили состояние и доступные действия.';
    return;
  }
  error.value = cause instanceof Error ? cause.message : fallback;
}

const draft = reactive({
  summary: '',
  scores: [] as Array<{
    itemCode: string;
    applicable: boolean;
    score: number | null;
    maximumScore: number;
    feedback: string;
    coachingTheme: string;
    rootCause: string;
  }>,
  evidence: [] as Array<{ messageId: string; rationale: string }>,
});
const projectId = computed(() => auth.project?.id ?? '');
const permissions = computed(() => auth.project?.effectivePermissionCodes ?? []);
const canReview = computed(() => permissions.value.includes('project.support.quality.review'));
const canSelfRead = computed(() => permissions.value.includes('project.support.quality.self_read'));
const canReadAll = computed(() => permissions.value.includes('project.support.quality.read'));
const canManage = computed(() => permissions.value.includes('project.support.quality.manage'));
const canDispute = computed(() => permissions.value.includes('project.support.quality.dispute'));
const canAccess = computed(() => canReview.value || canSelfRead.value || canReadAll.value);
function selectionReasonLabel(value: string | null | undefined): string {
  return value === 'RANDOM_SAMPLE'
    ? 'Случайная выборка'
    : value === 'RISK_SAMPLE'
      ? 'Риск-выборка'
      : 'Выборка контроля качества';
}
const isDraft = computed(() => review.value?.state === 'DRAFT');
const completedCriteria = computed(
  () => draft.scores.filter((item) => !item.applicable || item.score !== null).length,
);
const publishedPercent = computed(() => {
  const current = review.value;
  return current && current.state !== 'DRAFT' && current.maximumScore
    ? Math.round((current.totalScore / current.maximumScore) * 100)
    : null;
});
const canSubmit = computed(
  () =>
    isDraft.value &&
    draft.scores.every((item) => !item.applicable || item.score !== null) &&
    draft.evidence.length > 0,
);
function scaleLabel(scale: string): string {
  return (
    {
      BINARY: 'Да или нет',
      THREE_POINT: 'Три уровня',
      FIVE_POINT: 'Пять уровней',
      NUMERIC: 'Числовая шкала',
    }[scale] ?? 'Шкала сервера'
  );
}
function draftScore(code: string) {
  return draft.scores.find((item) => item.itemCode === code);
}
function evidenceOptionLabel(messageId: string): string {
  const option = bootstrap.value?.evidenceOptions.find((item) => item.messageId === messageId);
  if (!option) return 'Закреплённое сообщение';
  const role = option.role === 'USER' ? 'Клиент' : option.role === 'ADMIN' ? 'Оператор' : 'Ответ';
  return `${role} · сообщение ${option.ordinal}`;
}
function fieldMessage(path: string): string {
  const code = fieldErrors[path];
  if (!code) return '';
  return (
    {
      REQUIRED: 'Заполните поле',
      AT_LEAST_ONE_REQUIRED: 'Выберите хотя бы одно сообщение',
      INVALID_CATALOG_VALUE: 'Выберите значение из списка',
      NOT_ALLOWED: 'Значение недоступно для этого критерия',
      OUT_OF_RANGE: 'Баллы вне допустимого диапазона',
    } satisfies Record<SupportQualityReviewFieldErrorResponseDtoCode, string>
  )[code];
}
function disputeStateLabel(state: string): string {
  return (
    {
      OPEN: 'Открыта',
      RESOLVED: 'Разрешена',
      DISMISSED: 'Отклонена',
      WITHDRAWN: 'Отозвана',
    }[state] ?? 'Неизвестно'
  );
}

function apply(value: SupportQualityReviewBootstrapResponseDto): void {
  bootstrap.value = value;
  review.value = value.review;
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
  for (const item of value.submissionErrors) fieldErrors[item.field] = item.code;
  const detail = value.review;
  draft.summary = detail.summary ?? '';
  draft.scores = detail.scores.map((item) => ({
    itemCode: item.itemCode,
    applicable: item.applicable,
    score: item.score ?? null,
    maximumScore: item.maximumScore,
    feedback: item.feedback ?? '',
    coachingTheme: item.coachingTheme ?? '',
    rootCause: item.rootCause ?? '',
  }));
  draft.evidence = detail.evidence.map((item) => ({
    messageId: item.messageId,
    rationale: item.rationale ?? '',
  }));
}

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++scopeGeneration;
  const id = String(route.params.reviewId ?? '');
  const scopeProjectId = projectId.value;
  const scopeActorId = auth.user?.id ?? '';
  const scopePermissions = permissions.value.join(',');
  clearProtectedState();
  operatorName.value = 'Участник проекта';
  diagnosticsOpen.value = false;
  saving.value = false;
  dialog.value = null;
  dialogText.value = '';
  if (!scopeProjectId || !id || !canAccess.value) {
    review.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const next = await supportQualitySource.readReviewBootstrap(scopeProjectId, id, signal);
    let nextOperatorName = 'Участник проекта';
    try {
      const presentation = await supportOperatorPresentationSource.resolve(
        scopeProjectId,
        [next.review.operatorCmsUserId],
        signal,
      );
      nextOperatorName = presentation.items[0]?.displayName.trim() || nextOperatorName;
    } catch {
      // Presentation is optional; the authorized review remains usable without it.
    }
    if (
      signal.aborted ||
      generation !== scopeGeneration ||
      projectId.value !== scopeProjectId ||
      (auth.user?.id ?? '') !== scopeActorId ||
      permissions.value.join(',') !== scopePermissions ||
      !canAccess.value
    )
      return;
    apply(next);
    operatorName.value = nextOperatorName;
  } catch (cause) {
    if (!signal.aborted && generation === scopeGeneration)
      error.value = cause instanceof Error ? cause.message : 'Оценка не найдена';
  } finally {
    if (!signal.aborted && generation === scopeGeneration) loading.value = false;
  }
}

async function loadExcerpt(messageId: string): Promise<void> {
  if (!review.value || excerpts[messageId] || excerptLoading.value) return;
  const scope = mutationScope();
  const signal = controller?.signal;
  if (!signal) return;
  excerptLoading.value = messageId;
  try {
    const value = await supportQualitySource.readEvidenceExcerpt(
      scope.projectId,
      scope.reviewId,
      messageId,
      signal,
    );
    if (scopeIsCurrent(scope) && !signal.aborted) excerpts[messageId] = value;
  } catch (cause) {
    if (scopeIsCurrent(scope) && !signal.aborted)
      error.value = cause instanceof Error ? cause.message : 'Фрагмент недоступен';
  } finally {
    if (scopeIsCurrent(scope)) excerptLoading.value = '';
  }
}

async function save(): Promise<boolean> {
  if (!review.value) return false;
  const scope = mutationScope();
  saving.value = true;
  error.value = '';
  for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
  success.value = '';
  try {
    const updated = await supportQualitySource.saveDraft(
      scope.projectId,
      review.value.id,
      review.value.version,
      {
        summary: draft.summary || undefined,
        scores: draft.scores.map((item) => ({
          itemCode: item.itemCode,
          applicable: item.applicable,
          score: item.score ?? undefined,
          feedback: item.feedback || undefined,
          coachingTheme: item.coachingTheme || undefined,
          rootCause: item.rootCause || undefined,
        })),
        evidence: draft.evidence.map((item) => ({
          messageId: item.messageId,
          rationale: item.rationale || undefined,
        })),
      },
    );
    if (!scopeIsCurrent(scope)) return false;
    review.value = { ...review.value, ...updated };
    success.value = 'Черновик сохранён';
    return true;
  } catch (cause) {
    await handleMutationFailure(cause, scope, 'Не удалось сохранить', true);
    return false;
  } finally {
    if (scopeIsCurrent(scope)) saving.value = false;
  }
}

async function submit(): Promise<void> {
  if (!review.value || !canSubmit.value) return;
  if (!(await save())) return;
  if (!review.value) return;
  const scope = mutationScope();
  saving.value = true;
  try {
    const updated = await supportQualitySource.submit(
      scope.projectId,
      review.value.id,
      review.value.version,
    );
    if (!scopeIsCurrent(scope)) return;
    review.value = {
      ...review.value,
      ...updated,
    };
    success.value = 'Оценка отправлена оператору';
  } catch (cause) {
    await handleMutationFailure(cause, scope, 'Не удалось отправить оценку', true);
  } finally {
    if (scopeIsCurrent(scope)) saving.value = false;
  }
}

async function acknowledge(): Promise<void> {
  if (!review.value) return;
  const scope = mutationScope();
  try {
    const updated = await supportQualitySource.acknowledge(
      scope.projectId,
      review.value.id,
      review.value.version,
    );
    if (!scopeIsCurrent(scope)) return;
    review.value = {
      ...review.value,
      ...updated,
    };
    success.value = 'Обратная связь подтверждена';
  } catch (cause) {
    await handleMutationFailure(cause, scope, 'Действие не выполнено');
  }
}

async function sendDialog(): Promise<void> {
  if (!review.value || !dialogText.value.trim()) return;
  const scope = mutationScope();
  const action = dialog.value;
  saving.value = true;
  try {
    if (dialog.value === 'reply') {
      const updated = await supportQualitySource.reply(
        scope.projectId,
        review.value.id,
        review.value.version,
        dialogText.value.trim(),
      );
      if (!scopeIsCurrent(scope)) return;
      review.value = {
        ...review.value,
        ...updated,
      };
    } else if (dialog.value === 'dispute') {
      const dispute = await supportQualitySource.dispute(
        scope.projectId,
        review.value.id,
        review.value.version,
        dialogText.value.trim(),
      );
      if (!scopeIsCurrent(scope)) return;
      review.value.disputes.push(dispute);
    } else {
      const updated = await supportQualitySource.voidReview(
        scope.projectId,
        review.value.id,
        review.value.version,
        dialogText.value.trim(),
      );
      if (!scopeIsCurrent(scope)) return;
      review.value = { ...review.value, ...updated };
    }
    dialog.value = null;
    dialogText.value = '';
    success.value =
      action === 'void'
        ? 'Оценка аннулирована'
        : action === 'dispute'
          ? 'Апелляция открыта'
          : 'Ответ сохранён';
  } catch (cause) {
    await handleMutationFailure(cause, scope, 'Ответ не сохранён');
  } finally {
    if (scopeIsCurrent(scope)) saving.value = false;
  }
}
async function withdrawDispute(
  dispute: SupportQualityReviewDetailResponseDto['disputes'][number],
): Promise<void> {
  if (!review.value) return;
  const scope = mutationScope();
  saving.value = true;
  try {
    const next = await supportQualitySource.withdrawDispute(scope.projectId, dispute);
    if (!scopeIsCurrent(scope)) return;
    review.value.disputes = review.value.disputes.map((item) =>
      item.id === next.id ? next : item,
    );
    success.value = 'Апелляция отозвана';
  } catch (cause) {
    await handleMutationFailure(cause, scope, 'Апелляция не отозвана');
  } finally {
    if (scopeIsCurrent(scope)) saving.value = false;
  }
}

function addEvidence(messageId: string): void {
  if (!messageId || draft.evidence.some((item) => item.messageId === messageId)) return;
  draft.evidence.push({ messageId, rationale: '' });
  evidenceChoice.value = '';
}
function removeEvidence(index: number): void {
  draft.evidence.splice(index, 1);
}

watch(
  [projectId, () => auth.user?.id, () => route.params.reviewId, () => permissions.value.join(',')],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <main class="review-page" aria-labelledby="review-title">
    <header class="review-header">
      <Button
        label="К очереди"
        icon="pi pi-arrow-left"
        text
        severity="secondary"
        @click="router.push('/support/quality')"
      />
      <div v-if="review" class="review-heading">
        <div>
          <span class="eyebrow">Оценка качества</span>
          <h1 id="review-title">Кейс {{ review.caseId }}</h1>
          <p>{{ operatorName }} · {{ selectionReasonLabel(review.selectionReasonCode) }}</p>
        </div>
        <div class="review-heading-actions">
          <Tag
            :value="
              review.state === 'DRAFT'
                ? 'Черновик'
                : review.state === 'SUBMITTED'
                  ? 'Отправлена'
                  : 'Аннулирована'
            "
            :severity="
              review.state === 'DRAFT'
                ? 'secondary'
                : review.state === 'SUBMITTED'
                  ? 'success'
                  : 'danger'
            "
          />
          <Button
            label="Технические сведения"
            icon="pi pi-info-circle"
            text
            severity="secondary"
            @click="diagnosticsOpen = true"
          />
        </div>
      </div>
    </header>
    <div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <div v-if="success" class="notice success" role="status">{{ success }}</div>
    <div v-if="loading" class="loading-state">
      <i class="pi pi-spin pi-spinner" /> Загружаем оценку…
    </div>
    <template v-else-if="review">
      <section class="review-spine" aria-label="Итог оценки">
        <div>
          <span>Результат сервера</span
          ><strong>{{ publishedPercent === null ? '—' : `${publishedPercent}%` }}</strong
          ><small>{{
            publishedPercent === null
              ? 'появится после отправки'
              : `${review.totalScore} из ${review.maximumScore}`
          }}</small>
        </div>
        <div>
          <span>Критический итог</span
          ><strong class="compact">{{
            review.criticalFailureOutcome === 'NONE' ? 'Нет' : review.criticalFailureOutcome
          }}</strong
          ><small>согласно ревизии карты</small>
        </div>
        <div>
          <span>Доказательства</span><strong>{{ draft.evidence.length }}</strong
          ><small>закреплённых сообщений</small>
        </div>
        <div>
          <span>Состояние данных</span><strong class="compact">Актуально</strong
          ><small>сверено с сервером</small>
        </div>
      </section>
      <div class="review-layout">
        <section class="surface score-editor" aria-labelledby="criteria-title">
          <div class="surface-title">
            <div>
              <h2 id="criteria-title">Критерии оценки</h2>
              <p>Неприменимые пункты исключаются из знаменателя.</p>
            </div>
          </div>
          <section
            v-for="section in bootstrap?.scorecard.sections ?? []"
            :key="section.code"
            class="score-section"
          >
            <header class="score-section-heading">
              <div>
                <h3>{{ section.name }}</h3>
                <p>{{ section.description }}</p>
              </div>
              <Tag :value="`${section.sectionWeightBasisPoints / 100}%`" severity="secondary" />
              <span class="semantic-label">{{ section.sectionWeightBasisPoints / 100 }}%</span>
            </header>
            <article
              v-for="(criterion, index) in section.criteria"
              :key="criterion.code"
              class="criterion"
              :class="{ disabled: draftScore(criterion.code)?.applicable === false }"
            >
              <template
                v-for="item in [draftScore(criterion.code)]"
                :key="`${section.code}:${item?.itemCode ?? criterion.code}`"
              >
                <template v-if="item">
                  <div class="criterion-heading">
                    <div>
                      <span>{{ String(index + 1).padStart(2, '0') }}</span>
                      <div>
                        <h3>{{ criterion.label }}</h3>
                        <div class="criterion-tags">
                          <Tag :value="scaleLabel(criterion.ratingScale)" severity="secondary" />
                          <span class="semantic-label">{{
                            scaleLabel(criterion.ratingScale)
                          }}</span>
                          <Tag
                            v-if="criterion.criticalFailure"
                            value="Критический критерий"
                            severity="danger"
                          />
                          <span v-if="criterion.criticalFailure" class="semantic-label">
                            Критический критерий
                          </span>
                        </div>
                      </div>
                    </div>
                    <label
                      ><input
                        v-model="item.applicable"
                        type="checkbox"
                        :disabled="!isDraft || !canReview || !criterion.allowNotApplicable"
                      />
                      Применим</label
                    >
                  </div>
                  <p class="criterion-guidance">{{ criterion.guidance }}</p>
                  <div class="criterion-fields">
                    <label
                      >Баллы
                      <InputNumber
                        v-model="item.score"
                        :min="0"
                        :max="item.maximumScore"
                        :disabled="!isDraft || !item.applicable || !canReview"
                        :invalid="Boolean(fieldMessage(`scores.${item.itemCode}.score`))"
                        show-buttons
                      />
                      <small
                        v-if="fieldMessage(`scores.${item.itemCode}.score`)"
                        class="field-error"
                      >
                        {{ fieldMessage(`scores.${item.itemCode}.score`) }}
                      </small></label
                    ><span class="maximum">из {{ item.maximumScore }}</span
                    ><label class="feedback"
                      >Комментарий
                      <InputText
                        v-model="item.feedback"
                        :disabled="!isDraft || !canReview"
                        placeholder="Что было хорошо и что улучшить"
                    /></label>
                    <label
                      >Причина
                      <Select
                        v-model="item.rootCause"
                        :options="bootstrap?.rootCauseOptions ?? []"
                        option-label="label"
                        option-value="code"
                        show-clear
                        :disabled="!isDraft || !canReview"
                        :invalid="Boolean(fieldMessage(`scores.${item.itemCode}.rootCause`))"
                        placeholder="Выберите причину"
                      />
                      <small
                        v-if="fieldMessage(`scores.${item.itemCode}.rootCause`)"
                        class="field-error"
                      >
                        {{ fieldMessage(`scores.${item.itemCode}.rootCause`) }}
                      </small></label
                    >
                    <label
                      >Тема развития
                      <Select
                        v-model="item.coachingTheme"
                        :options="bootstrap?.coachingThemeOptions ?? []"
                        option-label="label"
                        option-value="code"
                        show-clear
                        :disabled="!isDraft || !canReview"
                        :invalid="Boolean(fieldMessage(`scores.${item.itemCode}.coachingTheme`))"
                        placeholder="Выберите тему"
                      />
                      <small
                        v-if="fieldMessage(`scores.${item.itemCode}.coachingTheme`)"
                        class="field-error"
                      >
                        {{ fieldMessage(`scores.${item.itemCode}.coachingTheme`) }}
                      </small></label
                    >
                  </div>
                </template>
              </template>
            </article>
          </section>
        </section>
        <aside class="review-aside">
          <section class="surface">
            <div class="surface-title">
              <div>
                <h2>Доказательства</h2>
                <p>Сообщения закрепляются по ревизии.</p>
              </div>
              <RouterLink
                :to="{ name: 'support-inbox-case', params: { caseId: review.caseId } }"
                class="case-link"
                >Открыть кейс</RouterLink
              >
            </div>
            <div v-if="isDraft && canReview" class="evidence-picker">
              <Select
                v-model="evidenceChoice"
                :options="
                  (bootstrap?.evidenceOptions ?? []).filter(
                    (option) => !draft.evidence.some((item) => item.messageId === option.messageId),
                  )
                "
                option-label="ordinal"
                option-value="messageId"
                placeholder="Выберите сообщение"
                aria-label="Сообщение для доказательства"
              >
                <template #option="slotProps">{{
                  evidenceOptionLabel(slotProps.option.messageId)
                }}</template>
              </Select>
              <Button
                label="Добавить"
                icon="pi pi-plus"
                :disabled="!evidenceChoice"
                @click="addEvidence(evidenceChoice)"
              />
            </div>
            <div class="evidence-list">
              <div v-for="(item, index) in draft.evidence" :key="index" class="evidence">
                <div class="evidence-heading">
                  <strong>{{ evidenceOptionLabel(item.messageId) }}</strong>
                  <small>Закреплённая ревизия</small>
                </div>
                <label
                  >Почему важно<Textarea
                    v-model="item.rationale"
                    :disabled="!isDraft || !canReview"
                    rows="2"
                /></label>
                <div v-if="excerpts[item.messageId]" class="evidence-excerpt">
                  {{ excerpts[item.messageId]?.excerpt }}
                  <small v-if="excerpts[item.messageId]?.truncated">Фрагмент сокращён</small>
                </div>
                <Button
                  v-else
                  label="Показать фрагмент"
                  icon="pi pi-eye"
                  text
                  :loading="excerptLoading === item.messageId"
                  @click="loadExcerpt(item.messageId)"
                />
                <Button
                  v-if="isDraft && canReview"
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  size="small"
                  label="Убрать"
                  class="evidence-remove"
                  @click="removeEvidence(index)"
                />
              </div>
              <p v-if="!draft.evidence.length" class="empty-copy">
                Добавьте хотя бы одно сообщение перед отправкой.
              </p>
              <small v-if="fieldMessage('evidence')" class="field-error">
                {{ fieldMessage('evidence') }}
              </small>
            </div>
          </section>
          <section class="surface summary">
            <div class="surface-title">
              <div>
                <h2>Итоговая обратная связь</h2>
                <p>Коротко, конкретно и по действиям.</p>
              </div>
            </div>
            <Textarea
              v-model="draft.summary"
              rows="5"
              :disabled="!isDraft || !canReview"
              placeholder="Итог оценки и следующий шаг"
            />
          </section>
          <section
            v-if="review.state === 'SUBMITTED' && canSelfRead"
            class="surface feedback-actions"
          >
            <div class="surface-title">
              <div>
                <h2>Ответ оператора</h2>
                <p>Подтвердите получение или откройте апелляцию.</p>
              </div>
            </div>
            <Button
              v-if="review.acknowledgmentState === 'PENDING'"
              label="Подтвердить"
              icon="pi pi-check"
              @click="acknowledge"
            /><Button
              label="Ответить"
              severity="secondary"
              outlined
              @click="dialog = 'reply'"
            /><Button
              v-if="canDispute"
              label="Открыть апелляцию"
              severity="danger"
              text
              @click="dialog = 'dispute'"
            />
          </section>
          <section v-if="review.disputes.length" class="surface dispute-history">
            <div class="surface-title">
              <div>
                <h2>История апелляций</h2>
                <p>Решение не переписывает оценку.</p>
              </div>
            </div>
            <article v-for="item in review.disputes" :key="item.id">
              <span
                ><Tag
                  :value="disputeStateLabel(item.state)"
                  :severity="item.state === 'OPEN' ? 'warn' : 'secondary'"
                />{{ item.reason }}</span
              >
              <Button
                v-if="item.state === 'OPEN' && item.openedByCmsUserId === auth.user?.id"
                label="Отозвать"
                text
                severity="secondary"
                :loading="saving"
                @click="withdrawDispute(item)"
              />
            </article>
          </section>
          <section v-if="canManage && review.state !== 'VOID'" class="surface feedback-actions">
            <div class="surface-title">
              <div>
                <h2>Административное действие</h2>
                <p>Аннулирование сохраняет историю и требует причины.</p>
              </div>
            </div>
            <Button label="Аннулировать оценку" severity="danger" text @click="dialog = 'void'" />
          </section>
        </aside>
      </div>
      <footer v-if="isDraft && canReview" class="sticky-actions">
        <span
          ><strong>{{ completedCriteria }} / {{ draft.scores.length }}</strong> критериев ·
          {{ draft.evidence.length }} доказательств · итог рассчитает сервер</span
        >
        <div>
          <Button
            label="Сохранить"
            severity="secondary"
            outlined
            :loading="saving"
            @click="save"
          /><Button
            label="Отправить оператору"
            icon="pi pi-send"
            :disabled="!canSubmit"
            :loading="saving"
            @click="submit"
          />
        </div>
      </footer>
    </template>
    <Dialog
      :visible="dialog !== null"
      modal
      :header="
        dialog === 'reply'
          ? 'Ответить на оценку'
          : dialog === 'void'
            ? 'Аннулировать оценку'
            : 'Открыть апелляцию'
      "
      :style="{ width: 'min(32rem, calc(100vw - 2rem))' }"
      @update:visible="dialog = null"
      ><Textarea
        v-model="dialogText"
        rows="5"
        class="dialog-text"
        :placeholder="
          dialog === 'reply'
            ? 'Комментарий к обратной связи'
            : dialog === 'void'
              ? 'Причина аннулирования'
              : 'Что необходимо пересмотреть'
        " /><template #footer
        ><Button label="Отмена" text severity="secondary" @click="dialog = null" /><Button
          :label="
            dialog === 'reply'
              ? 'Отправить'
              : dialog === 'void'
                ? 'Аннулировать'
                : 'Открыть апелляцию'
          "
          :severity="dialog === 'reply' ? undefined : 'danger'"
          :disabled="!dialogText.trim()"
          :loading="saving"
          @click="sendDialog" /></template
    ></Dialog>
    <Dialog
      v-if="review && diagnosticsOpen"
      v-model:visible="diagnosticsOpen"
      modal
      header="Технические сведения"
      :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
    >
      <dl class="diagnostics-list">
        <div>
          <dt>Оценка</dt>
          <dd>{{ review.id }}</dd>
        </div>
        <div>
          <dt>Оператор</dt>
          <dd>{{ review.operatorCmsUserId }}</dd>
        </div>
        <div>
          <dt>Версия данных</dt>
          <dd>{{ review.version }}</dd>
        </div>
      </dl>
    </Dialog>
  </main>
</template>

<style scoped>
.review-page {
  max-width: 1500px;
  margin: 0 auto;
  padding: 20px 24px 96px;
  display: grid;
  gap: 16px;
}
.review-header {
  display: grid;
  gap: 8px;
}
.review-header :deep(.p-button) {
  justify-self: start;
}
.review-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--p-primary-color);
  font-weight: 700;
}
.review-heading h1 {
  margin: 3px 0;
  font-size: clamp(1.6rem, 3vw, 2.25rem);
  letter-spacing: -0.035em;
}
.review-heading p,
.surface-title p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.review-heading-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
.diagnostics-list dd {
  font-family: monospace;
  overflow-wrap: anywhere;
}
.notice {
  padding: 10px 12px;
  border-radius: 8px;
}
.notice.error {
  background: var(--p-red-50);
  color: var(--p-red-700);
  border: 1px solid var(--p-red-200);
}
.notice.success {
  background: var(--p-green-50);
  color: var(--p-green-700);
  border: 1px solid var(--p-green-200);
}
.review-spine {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.review-spine div {
  padding: 14px 16px;
  border-right: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 2px;
}
.review-spine div:last-child {
  border: 0;
}
.review-spine span,
.review-spine small {
  color: var(--p-text-muted-color);
}
.review-spine strong {
  font-size: 1.7rem;
}
.review-spine strong.compact {
  font-size: 1rem;
  margin: 7px 0;
}
.review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.8fr);
  gap: 16px;
  align-items: start;
}
.review-aside {
  display: grid;
  gap: 16px;
}
.surface {
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  border-radius: 12px;
  overflow: hidden;
}
.surface-title {
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.surface-title h2 {
  margin: 0 0 3px;
  font-size: 1rem;
}
.score-section + .score-section {
  border-top: 1px solid var(--p-content-border-color);
}
.score-section-heading {
  padding: 14px 16px 10px;
  background: var(--p-content-hover-background);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.score-section-heading h3,
.score-section-heading p {
  margin: 0;
}
.evidence-remove {
  --p-button-text-danger-color: var(--p-red-700);
  --p-button-text-danger-hover-color: var(--p-red-800);
}
.score-section-heading p {
  margin-top: 3px;
  color: var(--p-text-color);
  font-size: 0.8rem;
}
.criterion {
  padding: 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 14px;
}
.criterion:last-child {
  border: 0;
}
.criterion.disabled {
  opacity: 0.56;
}
.criterion-heading,
.criterion-heading > div {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.criterion-heading > div {
  justify-content: flex-start;
}
.criterion-heading > div > span {
  font: 700 0.72rem/1 monospace;
  color: var(--p-text-muted-color);
  padding-top: 4px;
}
.criterion-heading h3 {
  margin: 0;
  font-size: 0.95rem;
}
.criterion-heading small {
  color: var(--p-text-muted-color);
}
.criterion-tags {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.semantic-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.criterion-guidance {
  margin: 0;
  padding-left: 32px;
  color: var(--p-text-muted-color);
  line-height: 1.45;
}
.criterion-heading label {
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.criterion-fields {
  display: grid;
  grid-template-columns: 100px auto minmax(180px, 1fr) minmax(160px, 0.8fr) minmax(160px, 0.8fr);
  gap: 10px;
  align-items: end;
}
.criterion-fields label,
.evidence label {
  font-size: 0.74rem;
  color: var(--p-text-muted-color);
  display: grid;
  gap: 5px;
}
.criterion-fields :deep(.p-inputnumber),
.criterion-fields :deep(.p-inputtext),
.criterion-fields :deep(.p-select) {
  width: 100%;
}
.field-error {
  color: var(--p-red-700);
  font-size: 0.75rem;
}
.maximum {
  padding-bottom: 10px;
  color: var(--p-text-muted-color);
}
.summary {
  padding-bottom: 16px;
}
.summary > textarea {
  margin: 16px;
  width: calc(100% - 32px);
}
.evidence-list {
  padding: 12px;
  display: grid;
  gap: 10px;
}
.evidence-picker {
  padding: 12px 12px 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.evidence-picker :deep(.p-select) {
  min-width: 0;
}
.case-link {
  color: var(--p-primary-color);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
}
.evidence-heading,
.evidence-excerpt {
  display: grid;
  gap: 3px;
}
.evidence-heading small,
.evidence-excerpt small {
  color: var(--p-text-muted-color);
}
.evidence-excerpt {
  padding: 10px;
  border-radius: 7px;
  background: var(--p-content-hover-background);
  white-space: pre-wrap;
  line-height: 1.45;
}
.evidence {
  padding: 12px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  display: grid;
  gap: 8px;
}
.evidence :deep(.p-inputtext),
.evidence :deep(.p-textarea) {
  width: 100%;
}
.evidence :deep(.p-button) {
  justify-self: start;
}
.evidence :deep(.p-button-danger.p-button-text) {
  color: var(--p-red-700);
}
.empty-copy {
  font-size: 0.82rem;
  color: var(--p-text-muted-color);
  text-align: center;
}
.feedback-actions {
  padding-bottom: 14px;
}
.feedback-actions > :not(.surface-title) {
  margin: 10px 14px 0;
}
.feedback-actions :deep(.p-button-danger.p-button-text) {
  color: var(--p-red-700);
}
.dispute-history article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.dispute-history article > span {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sticky-actions {
  position: fixed;
  left: var(--app-sidebar-width, 0);
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 12px 24px;
  background: color-mix(in srgb, var(--p-content-background) 92%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--p-content-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.sticky-actions > div {
  display: flex;
  gap: 8px;
}
.dialog-text {
  width: 100%;
}
.loading-state {
  padding: 60px;
  text-align: center;
  color: var(--p-text-muted-color);
}
@media (max-width: 1050px) {
  .review-layout {
    grid-template-columns: 1fr;
  }
  .review-spine {
    grid-template-columns: repeat(2, 1fr);
  }
  .review-spine div:nth-child(2) {
    border-right: 0;
  }
  .review-spine div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--p-content-border-color);
  }
}
@media (max-width: 600px) {
  .review-page {
    padding: 12px 12px 110px;
  }
  .review-spine {
    grid-template-columns: 1fr 1fr;
  }
  .criterion-fields {
    grid-template-columns: 90px 1fr;
  }
  .criterion-fields .feedback {
    grid-column: 1/-1;
  }
  .criterion-fields label:not(:first-child),
  .evidence-picker {
    grid-column: 1/-1;
    grid-template-columns: 1fr;
  }
  .sticky-actions {
    left: 0;
    padding: 10px 12px;
    align-items: stretch;
  }
  .sticky-actions > span {
    display: none;
  }
  .sticky-actions > div {
    width: 100%;
  }
  .sticky-actions :deep(.p-button) {
    flex: 1;
  }
  .review-heading {
    flex-direction: column;
    align-items: stretch;
  }
  .review-heading-actions {
    justify-content: flex-start;
  }
  .review-heading :deep(.p-tag) {
    flex-shrink: 0;
  }
}
@media (max-width: 360px) {
  .review-spine {
    grid-template-columns: 1fr;
  }
  .review-spine div {
    border-right: 0;
    border-bottom: 1px solid var(--p-content-border-color);
  }
}
</style>
