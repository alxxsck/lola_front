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
import PageLoadingSwap from '@/shared/ui/PageLoadingSwap.vue';
import SupportDataWorkbenchSkeleton from '@/features/support-quality/ui/SupportDataWorkbenchSkeleton.vue';
import type {
  SupportQualityCalibrationDetailResponseDto,
  SupportQualityCalibrationBootstrapResponseDto,
  SupportQualityCalibrationCandidateDto,
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
const initialLoading = ref(true);
const error = ref('');
const actionNotice = ref('');
const acting = ref(false);
const participantId = ref('');
const baselineReviewId = ref('');
const consensusScore = ref<number | null>(null);
const resolutionNote = ref('');
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
const disputesCursor = ref<string | null>(null);
const calibrationCursor = ref<string | null>(null);
const scorecards = ref<SupportQualityScorecardResponseDto[]>([]);
const calibrations = ref<SupportQualityCalibrationResponseDto[]>([]);
const calibrationDetail = ref<SupportQualityCalibrationDetailResponseDto | null>(null);
const calibrationBootstrap = ref<SupportQualityCalibrationBootstrapResponseDto | null>(null);
const calibrationCandidates = ref<SupportQualityCalibrationCandidateDto[]>([]);
const calibrationCandidateId = ref('');
const calibrationScores = ref<Record<string, number | null>>({});
const calibrationApplicable = ref<Record<string, boolean>>({});
const calibrationEvidence = ref<string[]>([]);
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
let candidateSearchGeneration = 0;
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
    resolutionNote.value = '';
    clearManagementState();
  }
  if (!canManage.value) clearManagementState();
}
const currentParticipant = computed(() =>
  calibrationDetail.value?.participants.find(
    ({ reviewerCmsUserId }) => reviewerCmsUserId === auth.user?.id,
  ),
);
const baselineReviewOptions = computed(() =>
  (calibrationDetail.value?.participants ?? []).flatMap((participant) =>
    participant.reviewId
      ? [
          {
            id: participant.reviewId,
            label: `${operatorName(participant.reviewerCmsUserId)} · ${participantStateLabel(participant.state)}`,
          },
        ]
      : [],
  ),
);
function operatorName(cmsUserId: string): string {
  return operatorNames.value[cmsUserId] ?? 'Участник проекта';
}
function calibrationStateLabel(state: string): string {
  return { OPEN: 'Открыта', CLOSED: 'Завершена', CANCELLED: 'Отменена' }[state] ?? 'Неизвестно';
}
function participantStateLabel(state: string): string {
  return (
    {
      INVITED: 'Приглашён',
      DRAFT: 'Черновик',
      SUBMITTED: 'Отправлена',
      REMOVED: 'Исключён',
    }[state] ?? 'Неизвестно'
  );
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
    if (!registryActionCurrent(scope) || !canManage.value || samplingPolicy.value?.id !== policyId)
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
async function createCalibration(): Promise<void> {
  const scope = registryActionScope();
  const candidate = calibrationCandidates.value.find(
    ({ caseId }) => caseId === calibrationCandidateId.value,
  );
  const card = scorecards.value.find(({ state }) => state === 'ACTIVE');
  if (!scope || !candidate || !card || !canManage.value) return;
  const action = beginAction();
  error.value = '';
  try {
    const created = await supportQualitySource.createCalibration(scope.projectId, {
      caseId: candidate.caseId,
      conversationId: candidate.conversationId,
      operatorCmsUserId: candidate.operatorCmsUserId,
      scorecardId: card.id,
      scorecardRevisionNumber: card.currentRevisionNumber,
    });
    if (!registryActionCurrent(scope)) return;
    actionNotice.value = 'Калибровка создана';
    await router.push({
      path: '/support/quality/calibrations',
      query: { calibration: created.id },
    });
  } catch (cause) {
    if (registryActionCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось создать калибровку';
  } finally {
    finishAction(action);
  }
}
async function searchCalibrationCandidates(event: { value: string }): Promise<void> {
  const projectId = auth.project?.id;
  const signal = controller?.signal;
  if (!projectId || !signal || !canManage.value) return;
  const generation = ++candidateSearchGeneration;
  try {
    const page = await supportQualitySource.listCalibrationCandidates(
      projectId,
      event.value.trim() || undefined,
      undefined,
      signal,
    );
    if (
      !signal.aborted &&
      generation === candidateSearchGeneration &&
      auth.project?.id === projectId &&
      canManage.value
    )
      calibrationCandidates.value = page.items;
  } catch (cause) {
    if (!signal.aborted && generation === candidateSearchGeneration)
      error.value = cause instanceof Error ? cause.message : 'Не удалось найти обращение';
  }
}
async function createIndependentCalibrationReview(): Promise<void> {
  const scope = registryActionScope();
  const bootstrap = calibrationBootstrap.value;
  const detail = calibrationDetail.value;
  if (!scope || !bootstrap || !detail || !canReview.value || !calibrationEvidence.value.length)
    return;
  const scores = bootstrap.initialScores.map((initial) => ({
    itemCode: initial.itemCode,
    applicable: calibrationApplicable.value[initial.itemCode] ?? initial.applicable,
    ...((calibrationApplicable.value[initial.itemCode] ?? initial.applicable) &&
    calibrationScores.value[initial.itemCode] !== null
      ? { score: calibrationScores.value[initial.itemCode] ?? undefined }
      : {}),
  }));
  const action = beginAction();
  error.value = '';
  try {
    const review = await supportQualitySource.createCalibrationReview(scope.projectId, detail.id, {
      scores,
      evidence: calibrationEvidence.value.map((messageId) => ({ messageId })),
    });
    if (!registryActionCurrent(scope)) return;
    await router.push(`/support/quality/reviews/${review.id}`);
  } catch (cause) {
    if (registryActionCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось начать оценку';
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
      ...(disputeFilters.state
        ? { state: disputeFilters.state as 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'WITHDRAWN' }
        : {}),
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
  const calibrationId = typeof route.query.calibration === 'string' ? route.query.calibration : '';
  const nextUiScope = `${projectId ?? ''}\u0000${actorId}\u0000${permissionSignature}\u0000${mode.value}\u0000${calibrationId}`;
  const uiScopeChanged = registryUiScope !== nextUiScope;
  registryUiScope = nextUiScope;
  if (uiScopeChanged) initialLoading.value = true;
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
    calibrationBootstrap.value = null;
    calibrationCandidates.value = [];
    disputes.value = [];
    operatorCatalog.value = [];
    operatorNames.value = {};
    loading.value = false;
    initialLoading.value = false;
    return;
  }
  if (uiScopeChanged) {
    scorecards.value = [];
    calibrations.value = [];
    calibrationDetail.value = null;
    calibrationBootstrap.value = null;
    calibrationCandidates.value = [];
    disputes.value = [];
    operatorCatalog.value = [];
    operatorNames.value = {};
    disputesCursor.value = null;
    calibrationCursor.value = null;
  }
  loading.value = true;
  error.value = '';
  try {
    if (mode.value === 'scorecards') {
      const nextScorecards = await supportQualitySource.listScorecards(projectId, signal);
      if (!current()) return;
      scorecards.value = nextScorecards;
    } else if (mode.value === 'calibrations') {
      const [page, nextScorecards, nextDetail, nextOperators, nextCandidates] = await Promise.all([
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
        canManage.value
          ? supportQualitySource.listCalibrationCandidates(projectId, undefined, undefined, signal)
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      const nextBootstrap =
        nextDetail &&
        canReview.value &&
        nextDetail.participants.some(
          ({ reviewerCmsUserId, state, reviewId }) =>
            reviewerCmsUserId === actorId && state === 'INVITED' && !reviewId,
        )
          ? await supportQualitySource.readCalibrationBootstrap(projectId, nextDetail.id, signal)
          : null;
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
      calibrationBootstrap.value = nextBootstrap;
      calibrationCandidates.value = nextCandidates.items;
      calibrationScores.value = Object.fromEntries(
        (nextBootstrap?.initialScores ?? []).map(({ itemCode, score }) => [
          itemCode,
          score ?? null,
        ]),
      );
      calibrationApplicable.value = Object.fromEntries(
        (nextBootstrap?.initialScores ?? []).map(({ itemCode, applicable }) => [
          itemCode,
          applicable,
        ]),
      );
      calibrationEvidence.value = (nextBootstrap?.evidenceOptions ?? [])
        .filter(({ selected }) => selected)
        .map(({ messageId }) => messageId);
      operatorCatalog.value = nextOperators.items;
      operatorNames.value = nextNames;
    } else {
      await appendDisputePage(projectId, signal);
    }
  } catch (cause) {
    if (current()) error.value = cause instanceof Error ? cause.message : 'Раздел недоступен';
  } finally {
    if (current()) {
      loading.value = false;
      initialLoading.value = false;
    }
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
  <PageLoadingSwap :loading="initialLoading">
    <template #loading><SupportDataWorkbenchSkeleton kind="registry" /></template>
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
      <section v-if="mode === 'scorecards'" class="surface">
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
                () =>
                  supportQualitySource.createScorecardRevision(auth.project!.id, scorecards[0]!),
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
                  ? participant.reviewId
                    ? 'Оценка доступна'
                    : 'Ожидает оценку'
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
          <form
            v-if="
              currentParticipant.state === 'INVITED' &&
              !currentParticipant.reviewId &&
              calibrationDetail.state === 'OPEN' &&
              calibrationBootstrap
            "
            class="calibration-review-form"
            @submit.prevent="createIndependentCalibrationReview"
          >
            <fieldset
              v-for="section in calibrationBootstrap.scorecard.sections"
              :key="section.code"
            >
              <legend>{{ section.name }}</legend>
              <div
                v-for="criterion in section.criteria"
                :key="criterion.code"
                class="calibration-score-row"
              >
                <label class="applicable-check">
                  <input
                    v-model="calibrationApplicable[criterion.code]"
                    type="checkbox"
                    :disabled="!criterion.allowNotApplicable"
                  />
                  {{ criterion.label }}
                </label>
                <InputNumber
                  v-model="calibrationScores[criterion.code]"
                  :min="0"
                  :max="criterion.maximumScore"
                  :disabled="!calibrationApplicable[criterion.code]"
                  :aria-label="`Баллы: ${criterion.label}`"
                />
              </div>
            </fieldset>
            <fieldset>
              <legend>Подтверждающие сообщения</legend>
              <label
                v-for="option in calibrationBootstrap.evidenceOptions"
                :key="option.messageId"
                class="calibration-evidence-row"
              >
                <input v-model="calibrationEvidence" type="checkbox" :value="option.messageId" />
                <span
                  >{{ option.role === 'USER' ? 'Клиент' : 'Оператор' }} · сообщение
                  {{ option.ordinal }}</span
                >
              </label>
            </fieldset>
            <Button
              type="submit"
              label="Начать независимую оценку"
              :loading="acting"
              :disabled="!calibrationEvidence.length"
            />
          </form>
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
          <label>
            Эталонная проверка
            <Select
              v-model="baselineReviewId"
              :options="baselineReviewOptions"
              option-label="label"
              option-value="id"
              placeholder="Выберите отправленную проверку"
              aria-label="Эталонная проверка"
            />
          </label>
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
      <section
        v-else-if="mode === 'calibrations' && !calibrations.length"
        class="surface calibration-empty"
        aria-labelledby="calibrations-empty-title"
      >
        <div class="calibration-empty__content">
          <span class="calibration-empty__icon" aria-hidden="true">
            <i class="pi pi-check-circle" />
          </span>
          <div>
            <h2 id="calibrations-empty-title">Калибровок пока нет</h2>
            <p>
              Контроль качества работает. Калибровочные сессии появятся здесь, когда команда начнёт
              сверять оценки по одной работе.
            </p>
          </div>
          <RouterLink class="calibration-empty__link" to="/support/quality">
            Открыть очередь проверок
            <i class="pi pi-arrow-right" aria-hidden="true" />
          </RouterLink>
          <div v-if="canManage" class="calibration-empty__create">
            <Select
              v-model="calibrationCandidateId"
              :options="calibrationCandidates"
              option-label="caseTitle"
              option-value="caseId"
              filter
              filter-placeholder="Найти обращение"
              placeholder="Выберите завершённое обращение"
              aria-label="Обращение для калибровки"
              @filter="searchCalibrationCandidates"
            />
            <Button
              label="Создать калибровку"
              icon="pi pi-plus"
              :loading="acting"
              :disabled="!calibrationCandidateId"
              @click="createCalibration"
            />
          </div>
        </div>
      </section>
      <section v-else-if="mode === 'calibrations'" class="cards">
        <div v-if="canManage" class="calibration-create-bar">
          <div>
            <strong>Новая калибровка</strong
            ><span>Один закреплённый кейс, независимые оценки участников.</span>
          </div>
          <Select
            v-model="calibrationCandidateId"
            :options="calibrationCandidates"
            option-label="caseTitle"
            option-value="caseId"
            filter
            filter-placeholder="Найти обращение"
            placeholder="Выберите завершённое обращение"
            aria-label="Обращение для калибровки"
            @filter="searchCalibrationCandidates"
          />
          <Button
            label="Создать"
            icon="pi pi-plus"
            :loading="acting"
            :disabled="!calibrationCandidateId"
            @click="createCalibration"
          />
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
        v-if="calibrationDiagnosticsOpen && calibrationDetail"
        v-model:visible="calibrationDiagnosticsOpen"
        modal
        header="Технические сведения"
        :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
      >
        <dl>
          <div>
            <dt>Калибровка</dt>
            <dd>{{ calibrationDetail.id }}</dd>
          </div>
          <div>
            <dt>Версия данных</dt>
            <dd>{{ calibrationDetail.version }}</dd>
          </div>
        </dl>
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
            <span><small>Состояние</small><strong>Готова к запуску</strong></span>
            <span
              ><small>Доля</small
              ><strong>{{ samplingPolicy.sampleBasisPoints / 100 }}%</strong></span
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
              <div>
                <dt>Версия политики</dt>
                <dd>{{ samplingPolicy.revisionNumber }}</dd>
              </div>
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
  </PageLoadingSwap>
</template>

<style scoped>
.registry-page {
  --p-text-muted-color: var(--p-slate-700);
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 24px;
}
.registry-page :deep(.p-tag-success) {
  --p-tag-success-color: var(--p-green-800);
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
.calibration-empty {
  min-height: 320px;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}
.calibration-empty__content {
  max-width: 520px;
  display: grid;
  justify-items: center;
  gap: 18px;
  text-align: center;
}
.calibration-empty__icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: var(--status-success-soft, var(--p-green-50));
  color: var(--status-success-text, var(--p-green-700));
  font-size: 1.35rem;
}
.calibration-empty h2 {
  margin: 0 0 6px;
  font-size: 1.1rem;
}
.calibration-empty p {
  margin: 0;
  color: var(--p-text-muted-color);
  line-height: 1.5;
  text-wrap: pretty;
}
.calibration-empty__link {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--p-primary-color);
  font-size: 0.84rem;
  font-weight: 650;
  text-decoration: none;
}
.calibration-empty__link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.calibration-empty__link:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 4px;
  border-radius: 6px;
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
  .calibration-create-bar {
    align-items: stretch;
    flex-direction: column;
  }
  .calibration-create-bar :deep(.p-select),
  .calibration-create-bar :deep(.p-button) {
    width: 100%;
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
