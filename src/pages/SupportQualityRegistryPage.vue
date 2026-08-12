<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportOperatorPresentationSource } from '@/features/support-quality/api/support-operator-presentation-source';
import { supportQualitySource } from '@/features/support-quality/api/support-quality-source';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  CreateSupportQualityCalibrationReviewDto,
  SupportQualityCalibrationDetailResponseDto,
  SupportQualityCalibrationResponseDto,
  SupportQualityDisputeRegistryItemResponseDto,
  SupportQualitySamplingPolicyResponseDto,
  SupportQualitySamplingRunResponseDto,
  SupportQualityScorecardResponseDto,
  SupportOperatorPresentationSummaryDto,
} from '@/shared/api/generated/models';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const actionNotice = ref('');
const acting = ref(false);
const participantId = ref('');
const baselineReviewId = ref('');
const consensusScore = ref<number | null>(null);
const resolutionNote = ref('');
const createCalibrationDialog = ref(false);
const calibrationReviewDialog = ref(false);
const samplingDialog = ref(false);
const samplingPolicy = ref<SupportQualitySamplingPolicyResponseDto | null>(null);
const samplingRun = ref<SupportQualitySamplingRunResponseDto | null>(null);
const samplingDraft = reactive({
  code: 'WEEKLY_QUALITY',
  samplePercent: 10,
  minimumDailyTasks: 2,
  maximumDailyTasks: 20,
  stratifyByTeam: true,
});
const calibrationDraft = reactive({
  caseId: '',
  conversationId: '',
  operatorCmsUserId: '',
  scorecardId: '',
  scorecardRevisionNumber: 1,
});
const calibrationReviewDraft = reactive<CreateSupportQualityCalibrationReviewDto>({
  scores: [{ itemCode: '', applicable: true, score: undefined }],
  evidence: [{ messageId: '', rationale: '' }],
});
const disputesCursor = ref<string | null>(null);
const calibrationCursor = ref<string | null>(null);
const scorecards = ref<SupportQualityScorecardResponseDto[]>([]);
const calibrations = ref<SupportQualityCalibrationResponseDto[]>([]);
const calibrationDetail = ref<SupportQualityCalibrationDetailResponseDto | null>(null);
const calibrationDiagnosticsOpen = ref(false);
const disputes = ref<SupportQualityDisputeRegistryItemResponseDto[]>([]);
const disputeFilters = reactive({ state: 'OPEN', from: '', to: '' });
const disputeDateInvalid = computed(() => {
  const date = /^\d{4}-\d{2}-\d{2}$/u;
  return (
    (disputeFilters.from !== '' && !date.test(disputeFilters.from)) ||
    (disputeFilters.to !== '' && !date.test(disputeFilters.to)) ||
    Boolean(disputeFilters.from && disputeFilters.to && disputeFilters.from > disputeFilters.to)
  );
});
const operatorCatalog = ref<SupportOperatorPresentationSummaryDto[]>([]);
const operatorNames = ref<Record<string, string>>({});
let controller: AbortController | null = null;
let loadGeneration = 0;
let registryUiScope = '';
let actionGeneration = 0;
const mode = computed(() =>
  route.name === 'support-quality-scorecards'
    ? 'scorecards'
    : route.name === 'support-quality-calibrations'
      ? 'calibrations'
      : 'disputes',
);
const title = computed(() =>
  mode.value === 'scorecards'
    ? 'Карты оценки'
    : mode.value === 'calibrations'
      ? 'Калибровки'
      : 'Апелляции',
);
const description = computed(() =>
  mode.value === 'scorecards'
    ? 'Версионированные критерии без изменения опубликованной истории.'
    : mode.value === 'calibrations'
      ? 'Согласованность оценок без раскрытия работ коллег до отправки.'
      : 'Прозрачное рассмотрение разногласий по оценкам.',
);
const canManage = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.support.quality.manage'),
);
const canReview = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.support.quality.review'),
);
const canReadRegistry = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.support.quality.read'),
);
interface RegistryActionScope {
  projectId: string;
  actorId: string;
  permissions: string;
  generation: number;
}
function registryActionScope(): RegistryActionScope | null {
  const projectId = auth.project?.id;
  const actorId = auth.user?.id;
  if (!projectId || !actorId) return null;
  return {
    projectId,
    actorId,
    permissions: auth.project?.effectivePermissionCodes?.join(',') ?? '',
    generation: loadGeneration,
  };
}
function registryActionCurrent(scope: RegistryActionScope): boolean {
  return (
    auth.project?.id === scope.projectId &&
    auth.user?.id === scope.actorId &&
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') === scope.permissions &&
    loadGeneration === scope.generation
  );
}
function clearManagementState(): void {
  createCalibrationDialog.value = false;
  samplingDialog.value = false;
  samplingPolicy.value = null;
  samplingRun.value = null;
  participantId.value = '';
  baselineReviewId.value = '';
  consensusScore.value = null;
}
function beginAction(): number {
  const generation = ++actionGeneration;
  acting.value = true;
  return generation;
}
function finishAction(generation: number): void {
  if (generation === actionGeneration) acting.value = false;
}
function cancelActions(): void {
  actionGeneration += 1;
  acting.value = false;
}
function scrubRegistryUi(scopeChanged: boolean): void {
  if (scopeChanged) {
    cancelActions();
    actionNotice.value = '';
    calibrationReviewDialog.value = false;
    resolutionNote.value = '';
    clearManagementState();
  }
  if (!canManage.value) clearManagementState();
  if (!canReview.value) calibrationReviewDialog.value = false;
}
const currentParticipant = computed(() =>
  calibrationDetail.value?.participants.find(
    ({ reviewerCmsUserId }) => reviewerCmsUserId === auth.user?.id,
  ),
);
function operatorName(cmsUserId: string): string {
  return operatorNames.value[cmsUserId] ?? 'Участник проекта';
}
function calibrationStateLabel(state: string): string {
  return { OPEN: 'Открыта', CLOSED: 'Завершена', CANCELLED: 'Отменена' }[state] ?? 'Неизвестно';
}
function participantStateLabel(state: string): string {
  return {
    INVITED: 'Приглашён',
    DRAFT: 'Черновик',
    SUBMITTED: 'Отправлена',
    REMOVED: 'Исключён',
  }[state] ?? 'Неизвестно';
}
function disputeStateLabel(state: string): string {
  return {
    OPEN: 'Открыта',
    RESOLVED: 'Разрешена',
    DISMISSED: 'Отклонена',
    WITHDRAWN: 'Отозвана',
  }[state] ?? 'Неизвестно';
}
async function resolveOperatorNames(
  projectId: string,
  cmsUserIds: string[],
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const ids = [...new Set(cmsUserIds.filter(Boolean))].slice(0, 100);
  if (!ids.length) return {};
  const response = await supportOperatorPresentationSource.resolve(projectId, ids, signal);
  return Object.fromEntries(
    response.items.map(({ cmsUserId, displayName }) => [
      cmsUserId,
      displayName.trim() || 'Участник проекта',
    ]),
  );
}
const calibrationReviewValid = computed(() => {
  const codes = calibrationReviewDraft.scores.map(({ itemCode }) => itemCode.trim());
  return (
    codes.length > 0 &&
    codes.every(Boolean) &&
    new Set(codes).size === codes.length &&
    calibrationReviewDraft.scores.every(
      ({ applicable, score }) => !applicable || score !== undefined,
    ) &&
    calibrationReviewDraft.evidence.length > 0 &&
    calibrationReviewDraft.evidence.every(({ messageId }) => messageId.trim())
  );
});

function resetCalibrationReviewDraft(): void {
  calibrationReviewDraft.scores = [{ itemCode: '', applicable: true, score: undefined }];
  calibrationReviewDraft.evidence = [{ messageId: '', rationale: '' }];
}
function openCalibrationReviewDialog(): void {
  resetCalibrationReviewDraft();
  calibrationReviewDialog.value = true;
}
function addCalibrationScore(): void {
  if (calibrationReviewDraft.scores.length >= 100) return;
  calibrationReviewDraft.scores.push({ itemCode: '', applicable: true, score: undefined });
}
function addCalibrationEvidence(): void {
  if (calibrationReviewDraft.evidence.length >= 20) return;
  calibrationReviewDraft.evidence.push({ messageId: '', rationale: '' });
}
async function createCalibrationReview(): Promise<void> {
  const detail = calibrationDetail.value;
  const participant = currentParticipant.value;
  const projectId = auth.project?.id ?? '';
  const actorId = auth.user?.id ?? '';
  const permissionSignature = auth.project?.effectivePermissionCodes?.join(',') ?? '';
  const generation = loadGeneration;
  if (
    !projectId ||
    !detail ||
    detail.state !== 'OPEN' ||
    participant?.state !== 'INVITED' ||
    !canReview.value ||
    !calibrationReviewValid.value
  )
    return;
  const current = () =>
    loadGeneration === generation &&
    auth.project?.id === projectId &&
    (auth.user?.id ?? '') === actorId &&
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') === permissionSignature &&
    canReview.value &&
    calibrationDetail.value?.id === detail.id;
  const action = beginAction();
  error.value = '';
  try {
    const created = await supportQualitySource.createCalibrationReview(projectId, detail.id, {
      scores: calibrationReviewDraft.scores.map((score) => ({
        ...score,
        itemCode: score.itemCode.trim(),
      })),
      evidence: calibrationReviewDraft.evidence.map((evidence) => ({
        messageId: evidence.messageId.trim(),
        rationale: evidence.rationale?.trim() || undefined,
      })),
    });
    if (!current()) return;
    calibrationReviewDialog.value = false;
    await router.push(`/support/quality/reviews/${created.id}`);
  } catch (cause) {
    if (current())
      error.value =
        cause instanceof Error ? cause.message : 'Не удалось начать независимую оценку';
  } finally {
    finishAction(action);
  }
}
async function perform(action: () => Promise<unknown>, notice: string): Promise<void> {
  const projectId = auth.project?.id ?? '';
  const actorId = auth.user?.id ?? '';
  const permissions = auth.project?.effectivePermissionCodes?.join(',') ?? '';
  const generation = loadGeneration;
  const targetMode = mode.value;
  const calibrationId = calibrationDetail.value?.id ?? '';
  const current = () =>
    auth.project?.id === projectId &&
    (auth.user?.id ?? '') === actorId &&
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') === permissions &&
    loadGeneration === generation;
  const sameAuthorityTarget = () =>
    auth.project?.id === projectId &&
    (auth.user?.id ?? '') === actorId &&
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') === permissions &&
    mode.value === targetMode &&
    (calibrationDetail.value?.id ?? '') === calibrationId;
  const actionGeneration = beginAction();
  error.value = '';
  try {
    await action();
    if (!current()) return;
    actionNotice.value = notice;
    await load();
  } catch (cause) {
    if (current() && cause instanceof ApiError && cause.status === 409) {
      await load();
      if (sameAuthorityTarget())
        error.value = 'Данные изменились на сервере. Мы обновили состояние и доступные действия.';
    } else if (current()) {
      error.value = cause instanceof Error ? cause.message : 'Действие не выполнено';
    }
  } finally {
    finishAction(actionGeneration);
  }
}
async function createCalibration(): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || !canManage.value) return;
  await perform(
    () =>
      supportQualitySource.createCalibration(projectId, {
        caseId: calibrationDraft.caseId.trim(),
        conversationId: calibrationDraft.conversationId.trim(),
        operatorCmsUserId: calibrationDraft.operatorCmsUserId.trim(),
        scorecardId: calibrationDraft.scorecardId,
        scorecardRevisionNumber: calibrationDraft.scorecardRevisionNumber,
      }),
    'Калибровочная сессия создана',
  );
  createCalibrationDialog.value = false;
}
function localDay(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
async function createSamplingPolicy(): Promise<void> {
  const scope = registryActionScope();
  const card = scorecards.value.find(({ state }) => state === 'ACTIVE');
  if (!scope || !card || !canManage.value) return;
  const action = beginAction();
  error.value = '';
  try {
    const policy = await supportQualitySource.createSamplingPolicy(scope.projectId, {
      code: samplingDraft.code.trim(),
      scorecardRevisionId: card.currentRevisionId,
      sampleBasisPoints: Math.round(samplingDraft.samplePercent * 100),
      minimumDailyTasks: samplingDraft.minimumDailyTasks,
      maximumDailyTasks: samplingDraft.maximumDailyTasks,
      stratificationCodes: samplingDraft.stratifyByTeam ? ['TEAM'] : [],
    });
    if (!registryActionCurrent(scope) || !canManage.value) return;
    samplingPolicy.value = policy;
    actionNotice.value = 'Политика выборки создана';
  } catch (cause) {
    if (registryActionCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось создать политику';
  } finally {
    finishAction(action);
  }
}
async function runSampling(): Promise<void> {
  const scope = registryActionScope();
  const policyId = samplingPolicy.value?.id;
  if (!scope || !policyId || !canManage.value) return;
  const until = new Date();
  const from = new Date(until.getTime() - 7 * 86_400_000);
  const action = beginAction();
  error.value = '';
  try {
    const run = await supportQualitySource.runSampling(scope.projectId, {
      samplingPolicyId: policyId,
      populationFrom: localDay(from),
      populationUntil: localDay(until),
    });
    if (
      !registryActionCurrent(scope) ||
      !canManage.value ||
      samplingPolicy.value?.id !== policyId
    )
      return;
    samplingRun.value = run;
    actionNotice.value = `В очередь добавлено ${run.selectedCount} проверок`;
  } catch (cause) {
    if (registryActionCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось запустить выборку';
  } finally {
    finishAction(action);
  }
}
async function appendDisputePage(projectId: string, signal: AbortSignal): Promise<void> {
  const generation = loadGeneration;
  const actorId = auth.user?.id ?? '';
  const permissionSignature = auth.project?.effectivePermissionCodes?.join(',') ?? '';
  const page = await supportQualitySource.listDisputes(
    projectId,
    {
      ...(disputeFilters.state ? { state: disputeFilters.state as 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'WITHDRAWN' } : {}),
      ...(disputeFilters.from ? { from: disputeFilters.from } : {}),
      ...(disputeFilters.to ? { to: disputeFilters.to } : {}),
      ...(disputesCursor.value ? { cursor: disputesCursor.value } : {}),
    },
    signal,
  );
  const nextNames = await resolveOperatorNames(
    projectId,
    page.items.map(({ operatorCmsUserId }) => operatorCmsUserId),
    signal,
  );
  if (
    signal.aborted ||
    generation !== loadGeneration ||
    auth.project?.id !== projectId ||
    (auth.user?.id ?? '') !== actorId ||
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') !== permissionSignature
  )
    return;
  disputes.value.push(...page.items);
  operatorNames.value = { ...operatorNames.value, ...nextNames };
  disputesCursor.value = page.nextCursor ?? null;
}
async function loadMoreDisputes(): Promise<void> {
  if (!auth.project?.id || !controller) return;
  loading.value = true;
  try {
    await appendDisputePage(auth.project.id, controller.signal);
  } finally {
    loading.value = false;
  }
}
async function applyDisputeFilters(): Promise<void> {
  disputes.value = [];
  disputesCursor.value = null;
  await load();
}
async function loadMoreCalibrations(): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || !calibrationCursor.value) return;
  const generation = loadGeneration;
  const actorId = auth.user?.id ?? '';
  const permissionSignature = auth.project?.effectivePermissionCodes?.join(',') ?? '';
  const page = await supportQualitySource.listCalibrations(projectId, calibrationCursor.value);
  const nextNames = controller
    ? await resolveOperatorNames(
        projectId,
        page.items.map(({ operatorCmsUserId }) => operatorCmsUserId),
        controller.signal,
      )
    : {};
  if (
    generation !== loadGeneration ||
    auth.project?.id !== projectId ||
    (auth.user?.id ?? '') !== actorId ||
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') !== permissionSignature ||
    !canReadRegistry.value
  )
    return;
  calibrations.value.push(...page.items);
  operatorNames.value = { ...operatorNames.value, ...nextNames };
  calibrationCursor.value = page.nextCursor ?? null;
}
async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++loadGeneration;
  const projectId = auth.project?.id;
  const actorId = auth.user?.id ?? '';
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  const permissionSignature = permissions.join(',');
  const nextUiScope = `${projectId ?? ''}\u0000${actorId}\u0000${permissionSignature}`;
  const uiScopeChanged = registryUiScope !== nextUiScope;
  registryUiScope = nextUiScope;
  scrubRegistryUi(uiScopeChanged);
  calibrationDiagnosticsOpen.value = false;
  const current = () =>
    !signal.aborted &&
    generation === loadGeneration &&
    auth.project?.id === projectId &&
    (auth.user?.id ?? '') === actorId &&
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') === permissionSignature;
  if (
    !projectId ||
    !permissions.some((code) =>
      [
        'project.support.quality.read',
        'project.support.quality.manage',
        'project.support.quality.review',
        'project.support.quality.dispute',
      ].includes(code),
    )
  ) {
    scorecards.value = [];
    calibrations.value = [];
    calibrationDetail.value = null;
    disputes.value = [];
    operatorCatalog.value = [];
    operatorNames.value = {};
    loading.value = false;
    return;
  }
  scorecards.value = [];
  calibrations.value = [];
  calibrationDetail.value = null;
  disputes.value = [];
  operatorCatalog.value = [];
  operatorNames.value = {};
  disputesCursor.value = null;
  calibrationCursor.value = null;
  loading.value = true;
  error.value = '';
  try {
    if (mode.value === 'scorecards') {
      const nextScorecards = await supportQualitySource.listScorecards(projectId, signal);
      if (!current()) return;
      scorecards.value = nextScorecards;
    } else if (mode.value === 'calibrations') {
      const calibrationId =
        typeof route.query.calibration === 'string' ? route.query.calibration : '';
      const [page, nextScorecards, nextDetail, nextOperators] = await Promise.all([
        canReadRegistry.value
          ? supportQualitySource.listCalibrations(projectId, undefined, signal)
          : Promise.resolve({ items: [], nextCursor: null }),
        canManage.value
          ? supportQualitySource.listScorecards(projectId, signal)
          : Promise.resolve([]),
        calibrationId
          ? supportQualitySource.readCalibration(projectId, calibrationId, signal)
          : Promise.resolve(null),
        canReview.value || canManage.value
          ? supportOperatorPresentationSource.catalog(projectId, undefined, undefined, signal)
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      const nextNames = await resolveOperatorNames(
        projectId,
        [
          ...page.items.map(({ operatorCmsUserId }) => operatorCmsUserId),
          ...(nextDetail?.participants.map(({ reviewerCmsUserId }) => reviewerCmsUserId) ?? []),
          ...(nextDetail ? [nextDetail.operatorCmsUserId] : []),
        ],
        signal,
      );
      if (!current()) return;
      calibrations.value = page.items;
      scorecards.value = nextScorecards;
      calibrationCursor.value = page.nextCursor ?? null;
      calibrationDetail.value = nextDetail;
      operatorCatalog.value = nextOperators.items;
      operatorNames.value = nextNames;
    } else {
      await appendDisputePage(projectId, signal);
    }
  } catch (cause) {
    if (current())
      error.value = cause instanceof Error ? cause.message : 'Раздел недоступен';
  } finally {
    if (current()) loading.value = false;
  }
}
watch(
  [
    () => auth.project?.id,
    () => auth.user?.id,
    () => auth.project?.effectivePermissionCodes?.join(',') ?? '',
    mode,
    () => route.query.calibration,
  ],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <main class="registry-page" aria-labelledby="registry-title">
    <header>
      <div>
        <span class="eyebrow">Качество поддержки</span>
        <h1 id="registry-title">{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <nav aria-label="Разделы контроля качества">
        <RouterLink to="/support/quality">Очередь</RouterLink
        ><RouterLink
          to="/support/quality/scorecards"
          :aria-current="mode === 'scorecards' ? 'page' : undefined"
          >Карты оценки</RouterLink
        ><RouterLink
          to="/support/quality/calibrations"
          :aria-current="mode === 'calibrations' ? 'page' : undefined"
          >Калибровки</RouterLink
        ><RouterLink
          to="/support/quality/disputes"
          :aria-current="mode === 'disputes' ? 'page' : undefined"
          >Апелляции</RouterLink
        >
      </nav>
    </header>
    <div v-if="error" class="alert" role="alert">{{ error }}</div>
    <div v-if="actionNotice" class="action-notice" role="status">
      {{ actionNotice }}
    </div>
    <div v-if="loading" class="loading"><i class="pi pi-spin pi-spinner" /> Загружаем…</div>
    <section v-else-if="mode === 'scorecards'" class="surface">
      <div class="table-head">
        <span>Карта и код</span><span>Ревизия</span><span>Структура</span><span>Состояние</span>
      </div>
      <article v-for="card in scorecards" :key="card.id">
        <div>
          <strong>{{ card.name }}</strong
          ><small>{{ card.code }}</small>
        </div>
        <strong>v{{ card.currentRevisionNumber }}</strong
        ><span class="structure-copy"
          >{{ card.sections.length }} раздела ·
          {{ card.sections.reduce((sum, section) => sum + section.items.length, 0) }}
          критерия</span
        ><Tag
          :value="card.state === 'ACTIVE' ? 'Активна' : 'Черновик'"
          :severity="card.state === 'ACTIVE' ? 'success' : 'secondary'"
        />
      </article>
      <div class="registry-note">
        <i class="pi pi-lock" />
        <div>
          <strong>Опубликованные ревизии неизменяемы</strong>
          <p>
            Новая версия создаёт отдельный снимок; завершённые оценки продолжают ссылаться на
            прежнюю ревизию.
          </p>
        </div>
      </div>
      <div v-if="canManage" class="management-row">
        <span>Новая ревизия копирует структуру и создаёт отдельный неизменяемый снимок.</span>
        <Button
          label="Создать новую ревизию"
          icon="pi pi-copy"
          :loading="acting"
          @click="
            perform(
              () => supportQualitySource.createScorecardRevision(auth.project!.id, scorecards[0]!),
              'Новая ревизия карты создана',
            )
          "
        />
        <Button
          label="Настроить выборку"
          icon="pi pi-filter"
          severity="secondary"
          outlined
          :disabled="!scorecards.some(({ state }) => state === 'ACTIVE')"
          @click="samplingDialog = true"
        />
      </div>
    </section>
    <section
      v-else-if="mode === 'calibrations' && calibrationDetail"
      class="surface calibration-detail"
      aria-labelledby="calibration-detail-title"
    >
      <div class="calibration-heading">
        <div>
          <span class="eyebrow">Калибровочная сессия</span>
          <h2 id="calibration-detail-title">Согласованность оценок</h2>
          <p>
            {{ operatorName(calibrationDetail.operatorCmsUserId) }} · результаты коллег скрыты до
            собственной отправки. Рабочая оценка качества не меняется.
          </p>
        </div>
        <div class="calibration-heading-actions">
          <Button
            label="К списку"
            icon="pi pi-times"
            text
            severity="secondary"
            @click="router.replace('/support/quality/calibrations')"
          />
          <Button
            label="Технические сведения"
            icon="pi pi-info-circle"
            text
            severity="secondary"
            @click="calibrationDiagnosticsOpen = true"
          />
        </div>
      </div>
      <div class="calibration-spine">
        <div>
          <span>Участники</span><strong>{{ calibrationDetail.participants.length }}</strong>
        </div>
        <div>
          <span>Минимум</span><strong>{{ calibrationDetail.minimumReviews }}</strong>
        </div>
        <div>
          <span>Согласие</span>
          <strong>{{
            calibrationDetail.agreementBasisPoints == null
              ? '—'
              : `${calibrationDetail.agreementBasisPoints / 100}%`
          }}</strong>
        </div>
      </div>
      <ul class="participant-list">
        <li
          v-for="participant in calibrationDetail.participants"
          :key="participant.reviewerCmsUserId"
        >
          <span
            ><strong>{{ operatorName(participant.reviewerCmsUserId) }}</strong
            ><small>{{ participantStateLabel(participant.state) }}</small></span
          >
          <Tag
            :value="
              calibrationDetail.peerReviewsVisible ||
              participant.reviewerCmsUserId === auth.user?.id
                ? (participant.reviewId ? 'Оценка доступна' : 'Ожидает оценку')
                : 'Результат скрыт'
            "
            :severity="participant.state === 'SUBMITTED' ? 'success' : 'secondary'"
          />
        </li>
      </ul>
      <div v-if="currentParticipant" class="independent-review">
        <div>
          <strong>Ваша независимая оценка</strong>
          <span v-if="currentParticipant.state === 'INVITED' && !currentParticipant.reviewId">
            Результаты коллег останутся скрыты, пока сервер не разрешит сравнение.
          </span>
          <span v-else-if="currentParticipant.state !== 'SUBMITTED'">
            Черновик сохранён отдельно от рабочих оценок оператора.
          </span>
          <span v-else>Оценка отправлена. Видимость сравнения определяет сервер.</span>
        </div>
        <Button
          v-if="
            currentParticipant.state === 'INVITED' &&
            !currentParticipant.reviewId &&
            calibrationDetail.state === 'OPEN'
          "
          label="Начать независимую оценку"
          icon="pi pi-pencil"
          :disabled="!canReview"
          @click="openCalibrationReviewDialog"
        />
        <Button
          v-else-if="currentParticipant.reviewId"
          :label="
            currentParticipant.state === 'SUBMITTED' ? 'Открыть оценку' : 'Продолжить оценку'
          "
          severity="secondary"
          outlined
          @click="router.push(`/support/quality/reviews/${currentParticipant.reviewId}`)"
        />
      </div>
      <div v-if="canManage" class="calibration-actions">
        <label>
          Участник
          <Select
            v-model="participantId"
            :options="operatorCatalog"
            option-label="displayName"
            option-value="cmsUserId"
            :option-disabled="(operator) => !operator.selectable"
            filter
            filter-placeholder="Найти участника"
            placeholder="Выберите участника"
            aria-label="Участник калибровки"
          />
        </label>
        <Button
          label="Добавить"
          :disabled="!participantId.trim()"
          :loading="acting"
          @click="
            perform(
              () =>
                supportQualitySource.addCalibrationParticipant(
                  auth.project!.id,
                  calibrationDetail!.id,
                  calibrationDetail!.version,
                  participantId.trim(),
                ),
              'Участник добавлен',
            )
          "
        />
        <label
          >Эталонная проверка<InputText
            v-model="baselineReviewId"
            placeholder="Технический идентификатор проверки"
        /></label>
        <Button
          label="Закрепить эталон"
          severity="secondary"
          :disabled="!baselineReviewId.trim()"
          :loading="acting"
          @click="
            perform(
              () =>
                supportQualitySource.setCalibrationBaseline(
                  auth.project!.id,
                  calibrationDetail!.id,
                  calibrationDetail!.version,
                  baselineReviewId.trim(),
                ),
              'Эталонная проверка закреплена',
            )
          "
        />
        <label
          >Согласованная оценка<InputNumber v-model="consensusScore" :min="0" :max="10000"
        /></label>
        <Button
          label="Закрыть сессию"
          severity="secondary"
          outlined
          :disabled="consensusScore === null"
          :loading="acting"
          @click="
            perform(
              () =>
                supportQualitySource.closeCalibration(
                  auth.project!.id,
                  calibrationDetail!.id,
                  calibrationDetail!.version,
                  consensusScore!,
                ),
              'Калибровка закрыта',
            )
          "
        />
      </div>
    </section>
    <section v-else-if="mode === 'calibrations'" class="cards">
      <div v-if="canManage" class="calibration-create-bar">
        <div>
          <strong>Новая калибровка</strong
          ><span>Один закреплённый кейс, независимые оценки участников.</span>
        </div>
        <Button label="Создать сессию" icon="pi pi-plus" @click="createCalibrationDialog = true" />
      </div>
      <article v-for="item in calibrations" :key="item.id" class="surface card">
        <div class="card-top">
          <Tag
            :value="calibrationStateLabel(item.state)"
            :severity="item.state === 'OPEN' ? 'info' : 'secondary'"
          /><span>Данные актуальны</span>
        </div>
        <h2>Калибровка · {{ operatorName(item.operatorCmsUserId) }}</h2>
        <dl>
          <div>
            <dt>Оператор</dt>
            <dd>{{ operatorName(item.operatorCmsUserId) }}</dd>
          </div>
          <div>
            <dt>Минимум оценок</dt>
            <dd>{{ item.minimumReviews }}</dd>
          </div>
          <div>
            <dt>Видимость коллег</dt>
            <dd>{{ item.peerVisibility }}</dd>
          </div>
        </dl>
        <Button
          label="Открыть сессию"
          severity="secondary"
          outlined
          @click="
            router.push({
              path: '/support/quality/calibrations',
              query: { calibration: item.id },
            })
          "
        />
      </article>
      <Button
        v-if="calibrationCursor"
        label="Загрузить ещё"
        severity="secondary"
        text
        @click="loadMoreCalibrations"
      />
    </section>
    <section v-else class="surface">
      <div class="dispute-filters" aria-label="Фильтры апелляций">
        <label>
          Состояние
          <select v-model="disputeFilters.state">
            <option value="">Все</option>
            <option value="OPEN">Открытые</option>
            <option value="RESOLVED">Разрешённые</option>
            <option value="DISMISSED">Отклонённые</option>
            <option value="WITHDRAWN">Отозванные</option>
          </select>
        </label>
        <label>
          С даты
          <InputText
            v-model="disputeFilters.from"
            placeholder="ГГГГ-ММ-ДД"
            maxlength="10"
            inputmode="numeric"
          />
        </label>
        <label>
          По дату
          <InputText
            v-model="disputeFilters.to"
            placeholder="ГГГГ-ММ-ДД"
            maxlength="10"
            inputmode="numeric"
          />
        </label>
        <Button
          label="Применить"
          icon="pi pi-filter"
          severity="secondary"
          :disabled="disputeDateInvalid"
          @click="applyDisputeFilters"
        />
      </div>
      <div v-if="!disputes.length" class="empty">
        <i class="pi pi-check-circle" />
        <h2>Апелляций по фильтрам нет</h2>
        <p>Измените период или состояние, чтобы проверить другую часть истории.</p>
      </div>
      <article v-for="item in disputes" v-else :key="item.id" class="dispute">
        <div>
          <Tag
            :value="disputeStateLabel(item.state)"
            :severity="item.state === 'OPEN' ? 'warn' : 'success'"
          />
          <h2>{{ operatorName(item.operatorCmsUserId) }}</h2>
          <p>{{ item.reason }}</p>
        </div>
        <div class="dispute-actions">
          <InputText
            v-if="canManage && item.state === 'OPEN'"
            v-model="resolutionNote"
            placeholder="Решение и обоснование"
          />
          <Button
            v-if="canManage && item.state === 'OPEN'"
            label="Разрешить"
            :disabled="!resolutionNote.trim()"
            :loading="acting"
            @click="
              perform(
                () =>
                  supportQualitySource.resolveDispute(
                    auth.project!.id,
                    item,
                    resolutionNote.trim(),
                  ),
                'Апелляция разрешена',
              )
            "
          />
          <Button
            label="Открыть оценку"
            severity="secondary"
            outlined
            @click="router.push(`/support/quality/reviews/${item.reviewId}`)"
          />
        </div>
      </article>
      <Button
        v-if="disputesCursor"
        label="Загрузить ещё"
        text
        :loading="loading"
        @click="loadMoreDisputes"
      />
    </section>
    <Dialog
      v-model:visible="calibrationReviewDialog"
      modal
      header="Независимая оценка"
      :style="{ width: 'min(42rem, calc(100vw - 1.5rem))' }"
    >
      <div class="calibration-review-form">
        <div class="privacy-note">
          <i class="pi pi-eye-slash" />
          <div>
            <strong>Работа коллег скрыта</strong>
            <p>
              Укажите все критерии закреплённой карты и хотя бы одно сообщение. Сервер проверит
              состав, границы баллов и принадлежность доказательств.
            </p>
          </div>
        </div>
        <fieldset>
          <legend>Критерии</legend>
          <div
            v-for="(score, index) in calibrationReviewDraft.scores"
            :key="index"
            class="calibration-score-row"
          >
            <label
              >Код критерия
              <InputText
                v-model="score.itemCode"
                :aria-label="`Код критерия ${index + 1}`"
                maxlength="64"
            /></label>
            <label
              >Баллы
              <InputNumber
                v-model="score.score"
                :aria-label="`Баллы по критерию ${index + 1}`"
                :min="0"
                :max="1000"
                :disabled="!score.applicable"
            /></label>
            <label class="applicable-check"
              ><input v-model="score.applicable" type="checkbox" /> Применим</label
            >
            <Button
              v-if="calibrationReviewDraft.scores.length > 1"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :aria-label="`Удалить критерий ${index + 1}`"
              @click="calibrationReviewDraft.scores.splice(index, 1)"
            />
          </div>
          <Button
            label="Добавить критерий"
            icon="pi pi-plus"
            severity="secondary"
            text
            :disabled="calibrationReviewDraft.scores.length >= 100"
            @click="addCalibrationScore"
          />
        </fieldset>
        <fieldset>
          <legend>Доказательства</legend>
          <div
            v-for="(evidence, index) in calibrationReviewDraft.evidence"
            :key="index"
            class="calibration-evidence-row"
          >
            <label
              >Идентификатор сообщения
              <InputText
                v-model="evidence.messageId"
                :aria-label="`Идентификатор сообщения ${index + 1}`"
            /></label>
            <label
              >Обоснование
              <InputText
                v-model="evidence.rationale"
                :aria-label="`Обоснование доказательства ${index + 1}`"
                maxlength="1000"
            /></label>
            <Button
              v-if="calibrationReviewDraft.evidence.length > 1"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :aria-label="`Удалить доказательство ${index + 1}`"
              @click="calibrationReviewDraft.evidence.splice(index, 1)"
            />
          </div>
          <Button
            label="Добавить доказательство"
            icon="pi pi-plus"
            severity="secondary"
            text
            :disabled="calibrationReviewDraft.evidence.length >= 20"
            @click="addCalibrationEvidence"
          />
        </fieldset>
      </div>
      <template #footer>
        <Button
          label="Отмена"
          text
          severity="secondary"
          :disabled="acting"
          @click="calibrationReviewDialog = false"
        />
        <Button
          label="Создать черновик"
          icon="pi pi-arrow-right"
          icon-pos="right"
          :loading="acting"
          :disabled="!calibrationReviewValid"
          @click="createCalibrationReview"
        />
      </template>
    </Dialog>
    <Dialog
      v-if="calibrationDiagnosticsOpen && calibrationDetail"
      v-model:visible="calibrationDiagnosticsOpen"
      modal
      header="Технические сведения"
      :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
    >
      <dl>
        <div><dt>Калибровка</dt><dd>{{ calibrationDetail.id }}</dd></div>
        <div><dt>Версия данных</dt><dd>{{ calibrationDetail.version }}</dd></div>
      </dl>
    </Dialog>
    <Dialog
      v-model:visible="createCalibrationDialog"
      modal
      header="Новая калибровочная сессия"
      :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
    >
      <div class="calibration-form">
        <p>
          Закрепите кейс, диалог и действующую ревизию карты. Результаты участников останутся скрыты
          до разрешённого этапа.
        </p>
        <label
          >Кейс<InputText
            v-model="calibrationDraft.caseId"
            placeholder="Идентификатор кейса"
        /></label>
        <label
          >Диалог<InputText
            v-model="calibrationDraft.conversationId"
            placeholder="Идентификатор диалога"
        /></label>
        <label>
          Оператор
          <Select
            v-model="calibrationDraft.operatorCmsUserId"
            :options="operatorCatalog"
            option-label="displayName"
            option-value="cmsUserId"
            :option-disabled="(operator) => !operator.selectable"
            filter
            filter-placeholder="Найти оператора"
            placeholder="Выберите оператора"
            aria-label="Оператор калибровки"
          />
        </label>
        <label>
          Карта оценки
          <select
            v-model="calibrationDraft.scorecardId"
            @change="
              calibrationDraft.scorecardRevisionNumber =
                scorecards.find(({ id }) => id === calibrationDraft.scorecardId)
                  ?.currentRevisionNumber ?? 1
            "
          >
            <option value="" disabled>Выберите карту</option>
            <option v-for="card in scorecards" :key="card.id" :value="card.id">
              {{ card.name }} · v{{ card.currentRevisionNumber }}
            </option>
          </select>
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" text severity="secondary" @click="createCalibrationDialog = false" />
        <Button
          label="Создать"
          icon="pi pi-check"
          :loading="acting"
          :disabled="
            !calibrationDraft.caseId.trim() ||
            !calibrationDraft.conversationId.trim() ||
            !calibrationDraft.operatorCmsUserId.trim() ||
            !calibrationDraft.scorecardId
          "
          @click="createCalibration"
        />
      </template>
    </Dialog>
    <Dialog
      v-model:visible="samplingDialog"
      modal
      header="Детерминированная выборка проверок"
      :style="{ width: 'min(560px, calc(100vw - 24px))' }"
    >
      <div class="sampling-form">
        <p>
          Выборка закрепляет карту оценки и создаёт воспроизводимую квитанцию популяции. Повторный
          запуск с теми же границами не создаёт дубликаты.
        </p>
        <template v-if="!samplingPolicy">
          <label>Код политики<InputText v-model="samplingDraft.code" maxlength="64" /></label>
          <label
            >Доля выборки, %<InputNumber
              v-model="samplingDraft.samplePercent"
              :min="0.01"
              :max="100"
              :min-fraction-digits="0"
              :max-fraction-digits="2"
          /></label>
          <div class="sampling-bounds">
            <label
              >Минимум в день<InputNumber
                v-model="samplingDraft.minimumDailyTasks"
                :min="0"
                :max="10000"
            /></label>
            <label
              >Максимум в день<InputNumber
                v-model="samplingDraft.maximumDailyTasks"
                :min="1"
                :max="10000"
            /></label>
          </div>
          <label class="check-row"
            ><input v-model="samplingDraft.stratifyByTeam" type="checkbox" /> Равномерно по
            командам</label
          >
        </template>
        <div v-else class="sampling-receipt">
          <span
            ><small>Политика</small><strong>{{ samplingPolicy.code }}</strong></span
          >
          <span
            ><small>Состояние</small><strong>Готова к запуску</strong></span
          >
          <span
            ><small>Доля</small><strong>{{ samplingPolicy.sampleBasisPoints / 100 }}%</strong></span
          >
        </div>
        <div v-if="samplingRun" class="sampling-result" role="status">
          <i class="pi pi-check-circle" />
          <span
            ><strong>{{ samplingRun.selectedCount }} из {{ samplingRun.eligibleCount }}</strong
            ><small>проверок добавлено в очередь</small></span
          >
        </div>
        <details v-if="samplingPolicy" class="sampling-diagnostics">
          <summary>Технические сведения</summary>
          <dl>
            <div><dt>Версия политики</dt><dd>{{ samplingPolicy.revisionNumber }}</dd></div>
            <div v-if="samplingRun">
              <dt>Квитанция популяции</dt>
              <dd>{{ samplingRun.populationReceiptId }}</dd>
            </div>
          </dl>
        </details>
      </div>
      <template #footer>
        <Button label="Закрыть" text severity="secondary" @click="samplingDialog = false" />
        <Button
          v-if="!samplingPolicy"
          label="Создать политику"
          icon="pi pi-check"
          :loading="acting"
          :disabled="
            !samplingDraft.code.trim() ||
            samplingDraft.minimumDailyTasks > samplingDraft.maximumDailyTasks
          "
          @click="createSamplingPolicy"
        />
        <Button
          v-else
          label="Выбрать обращения за 7 дней"
          icon="pi pi-play"
          :loading="acting"
          @click="runSampling"
        />
      </template>
    </Dialog>
  </main>
</template>

<style scoped>
.registry-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 24px;
}
.registry-page > *,
.surface > article > * {
  min-width: 0;
}
.registry-page header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}
.eyebrow {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--p-primary-color);
  font-weight: 700;
}
h1 {
  margin: 4px 0;
  font-size: clamp(1.75rem, 3vw, 2.4rem);
  letter-spacing: -0.04em;
}
header p {
  margin: 0;
  color: color-mix(in srgb, var(--p-text-color) 82%, var(--p-text-muted-color));
}
nav {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: var(--p-content-hover-background);
  overflow: auto;
}
nav a {
  padding: 8px 12px;
  border-radius: 7px;
  text-decoration: none;
  white-space: nowrap;
  color: color-mix(in srgb, var(--p-text-color) 82%, var(--p-text-muted-color));
  font-size: 0.84rem;
  font-weight: 600;
}
nav a[aria-current='page'],
nav a:hover {
  background: var(--p-content-background);
  color: var(--p-text-color);
}
.surface {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.action-notice {
  padding: 10px 12px;
  border: 1px solid var(--p-green-200);
  border-radius: 8px;
  color: var(--p-green-800);
  background: var(--p-green-50);
}
.management-row,
.calibration-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--p-content-border-color);
}
.independent-review {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-top: 1px solid var(--p-content-border-color);
  background: color-mix(in srgb, var(--p-primary-color) 5%, var(--p-content-background));
}
.independent-review > div {
  display: grid;
  gap: 3px;
}
.independent-review span {
  color: var(--p-text-muted-color);
  font-size: 0.82rem;
}
.management-row > span {
  margin-right: auto;
  color: var(--p-text-muted-color);
}
.calibration-actions {
  flex-wrap: wrap;
}
.calibration-actions label {
  display: grid;
  gap: 4px;
  color: var(--p-text-muted-color);
  font-size: 0.72rem;
}
.calibration-create-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
}
.calibration-create-bar > div {
  display: grid;
  gap: 2px;
}
.calibration-create-bar span {
  color: var(--p-text-muted-color);
  font-size: 0.78rem;
}
.calibration-form {
  display: grid;
  gap: 12px;
}
.calibration-review-form {
  display: grid;
  gap: 18px;
}
.privacy-note {
  display: flex;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 26%, var(--p-content-border-color));
  border-radius: 10px;
  background: color-mix(in srgb, var(--p-primary-color) 5%, var(--p-content-background));
}
.privacy-note i {
  color: var(--p-primary-color);
}
.privacy-note p {
  margin: 3px 0 0;
  color: var(--p-text-muted-color);
  line-height: 1.45;
}
.calibration-review-form fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 10px;
}
.calibration-review-form legend {
  margin-bottom: 8px;
  font-weight: 700;
}
.calibration-score-row,
.calibration-evidence-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 8rem auto auto;
  gap: 10px;
  align-items: end;
}
.calibration-evidence-row {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) auto;
}
.calibration-score-row label,
.calibration-evidence-row label {
  min-width: 0;
  display: grid;
  gap: 5px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
.calibration-score-row .applicable-check {
  display: flex;
  align-items: center;
  min-height: 40px;
  color: var(--p-text-color);
}
.calibration-form p {
  margin: 0 0 4px;
  color: var(--p-text-muted-color);
}
.calibration-form label {
  display: grid;
  gap: 5px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
.calibration-form select {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-form-field-border-radius);
  background: var(--p-form-field-background);
  color: var(--p-form-field-color);
}
.dispute-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dispute-filters {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) repeat(2, minmax(9rem, 0.8fr)) auto;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 1rem;
}
.dispute-filters label {
  display: grid;
  gap: 0.35rem;
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
}
.dispute-filters select,
.dispute-filters input {
  min-width: 0;
  min-height: 2.6rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  background: var(--p-content-background);
  color: var(--p-text-color);
  padding: 0.55rem 0.7rem;
  font: inherit;
}
.calibration-detail {
  display: grid;
}
.calibration-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.calibration-heading h2 {
  margin: 3px 0;
}
.calibration-heading p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.calibration-heading-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}
.calibration-spine {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid var(--p-content-border-color);
}
.calibration-spine > div {
  display: grid;
  gap: 2px;
  padding: 14px 18px;
  border-right: 1px solid var(--p-content-border-color);
}
.calibration-spine > div:last-child {
  border: 0;
}
.calibration-spine span,
.participant-list small {
  color: var(--p-text-muted-color);
}
.calibration-spine strong {
  font-size: 1.4rem;
}
.participant-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.participant-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.participant-list li:last-child {
  border: 0;
}
.participant-list li > span {
  display: grid;
  gap: 2px;
}
.table-head,
.surface > article {
  display: grid;
  grid-template-columns: 2fr 0.6fr 1.2fr 0.7fr;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.table-head {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--p-text-color) 78%, var(--p-text-muted-color));
  background: var(--p-content-hover-background);
}
.surface > article > div:first-child {
  display: grid;
  gap: 2px;
}
.surface small,
.surface > article > .structure-copy {
  color: var(--p-text-muted-color);
}
.registry-note {
  display: flex;
  gap: 12px;
  padding: 18px;
  background: color-mix(in srgb, var(--p-primary-color) 6%, var(--p-content-background));
}
.registry-note i {
  color: var(--p-primary-color);
}
.registry-note p {
  margin: 4px 0 0;
  color: color-mix(in srgb, var(--p-text-color) 78%, var(--p-text-muted-color));
}
.sampling-form {
  display: grid;
  gap: 14px;
}
.sampling-form > p {
  margin: 0;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}
.sampling-form label {
  display: grid;
  gap: 6px;
  color: var(--p-text-muted-color);
  font-size: 0.76rem;
}
.sampling-bounds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sampling-form .check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--p-text-color);
}
.sampling-receipt {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--p-content-border-color);
  border-radius: 9px;
  overflow: hidden;
}
.sampling-receipt > span {
  padding: 12px;
  display: grid;
  gap: 3px;
  border-right: 1px solid var(--p-content-border-color);
}
.sampling-receipt > span:last-child {
  border: 0;
}
.sampling-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--p-green-300);
  border-radius: 9px;
  color: var(--p-green-700);
}
.sampling-result > span {
  display: grid;
  gap: 2px;
}
.sampling-diagnostics {
  border-top: 1px solid var(--p-content-border-color);
  padding-top: 10px;
}
.sampling-diagnostics summary {
  cursor: pointer;
  color: var(--p-text-muted-color);
  font-size: 0.78rem;
}
.sampling-diagnostics dd {
  overflow-wrap: anywhere;
}
.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.card {
  padding: 16px;
}
.card-top {
  display: flex;
  justify-content: space-between;
}
.card h2 {
  font-size: 1rem;
}
.card dl {
  display: grid;
  gap: 10px;
}
.card dl div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.card dt {
  color: var(--p-text-muted-color);
}
.card dd {
  margin: 0;
}
.dispute {
  grid-template-columns: 1fr auto !important;
}
.dispute h2 {
  font-size: 0.95rem;
  margin: 8px 0 0;
}
.dispute p {
  margin: 4px 0;
}
.empty {
  text-align: center;
  padding: 64px 24px !important;
  display: block !important;
}
.empty i {
  font-size: 2rem;
  color: var(--p-green-500);
}
.alert {
  padding: 10px;
  border: 1px solid var(--p-red-200);
  background: var(--p-red-50);
  color: var(--p-red-700);
  border-radius: 8px;
}
.loading {
  padding: 64px;
  text-align: center;
  color: var(--p-text-muted-color);
}
@media (max-width: 900px) {
  .registry-page header {
    align-items: flex-start;
    flex-direction: column;
  }
  .cards {
    grid-template-columns: 1fr 1fr;
  }
  .dispute-filters {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 600px) {
  .registry-page {
    padding: 16px 12px;
  }
  .registry-page nav {
    width: 100%;
    max-width: 100%;
  }
  .cards {
    grid-template-columns: 1fr;
  }
  .dispute-filters {
    grid-template-columns: 1fr;
  }
  .dispute-filters :deep(.p-button) {
    width: 100%;
  }
  .table-head {
    display: none;
  }
  .surface > article {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .surface > article > .structure-copy {
    grid-column: 1/-1;
  }
  .dispute {
    grid-template-columns: 1fr !important;
  }
  .dispute :deep(.p-button) {
    width: 100%;
  }
  .calibration-heading {
    flex-direction: column;
    align-items: flex-start;
  }
  .calibration-heading-actions {
    justify-content: flex-start;
  }
  .calibration-spine {
    grid-template-columns: 1fr;
  }
  .calibration-spine > div {
    border-right: 0;
    border-bottom: 1px solid var(--p-content-border-color);
  }
  .management-row,
  .independent-review,
  .calibration-actions,
  .dispute-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .calibration-score-row,
  .calibration-evidence-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
</style>
