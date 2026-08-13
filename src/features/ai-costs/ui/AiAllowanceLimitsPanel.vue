<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import SegmentSelect from '@/features/scenario-audience/ui/SegmentSelect.vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  ScenarioLocalizationCatalogResponseDto,
  ScenarioLocalizationPolicyDto,
  ScenarioTranslationCatalogResponseDto,
} from '@/shared/api/generated/models';
import {
  applyTranslationResult,
  createTranslationJobController,
  type LocalizedText,
} from '@/features/scenario-localization/model';
import LocalizedField, {
  type TranslationUiState,
} from '@/features/scenario-localization/ui/LocalizedField.vue';
import {
  compareDecimalStrings,
  formatDecimalMoney,
  type DecimalString,
} from '@/shared/lib/decimal-money';
import { aiAllowanceRepository } from '../api/ai-allowance-repository';
import { allowanceCategoryLabel } from '../model/ai-allowance-presentation';
import AiAllowanceAccrualRulesPanel from './AiAllowanceAccrualRulesPanel.vue';
import AiAllowanceAccrualReceiptsPanel from './AiAllowanceAccrualReceiptsPanel.vue';
import AiAllowanceDirectGrantPanel from './AiAllowanceDirectGrantPanel.vue';
import AiAllowanceReauthenticationAction from './AiAllowanceReauthenticationAction.vue';
import { isAllowanceReauthenticationRequired } from '../model/allowance-reauthentication';
import {
  AI_ALLOWANCE_CATEGORIES,
  parseAllowanceUsd,
  type AiAllowanceCategory,
  type AiAllowanceEnforcementMode,
  type AiAllowanceLocalizedContent,
  type AiAllowanceLowThresholdMode,
  type AiAllowancePeriodKind,
  type AiAllowanceProjectPolicyView,
} from '../model/ai-allowance';

const MAX_CATEGORY_RULES = 2;
const WARNING_FIELD_PATH = 'allowance.warning';
const EXHAUSTED_FIELD_PATH = 'allowance.exhausted';
const SPONSORED_CATEGORIES = new Set<AiAllowanceCategory>([
  'AI_REVIEW',
  'AI_ANALYSIS',
  'CMS_AGENT',
  'PROJECT_OVERHEAD',
]);
const CATEGORY_DESCRIPTIONS: Record<AiAllowanceCategory, string> = {
  CHAT: 'Расходы обычного текстового диалога с Retenive.',
  VOICE: 'Работа голосового режима разговора с Retenive.',
  SPEECH: 'Преобразование готового текста в аудио.',
  MEMORY: 'Создание и обновление краткой памяти о пользователе.',
  AI_REVIEW:
    'Автоматическая AI-проверка сообщений. Ручная проверка администратором сюда не относится.',
  AI_ANALYSIS: 'AI-анализ данных и обращений, запущенный сценарием или сотрудником.',
  CMS_AGENT: 'Действия AI-помощника в административной панели.',
  CASE_INTELLIGENCE: 'AI-обработка и обобщение обращений пользователей.',
  PROJECT_OVERHEAD: 'Фоновые AI-операции проекта, не относящиеся к конкретному пользователю.',
};
const TIMEZONE_CITY_LABELS: Record<string, string> = {
  UTC: 'UTC',
  'Europe/Madrid': 'Мадрид',
  'Europe/Lisbon': 'Лиссабон',
  'Europe/London': 'Лондон',
  'Europe/Paris': 'Париж',
  'Europe/Berlin': 'Берлин',
  'Europe/Rome': 'Рим',
  'Europe/Warsaw': 'Варшава',
  'Europe/Kyiv': 'Киев',
  'Europe/Moscow': 'Москва',
  'America/New_York': 'Нью-Йорк',
  'America/Chicago': 'Чикаго',
  'America/Denver': 'Денвер',
  'America/Los_Angeles': 'Лос-Анджелес',
  'America/Sao_Paulo': 'Сан-Паулу',
  'Asia/Dubai': 'Дубай',
  'Asia/Kolkata': 'Калькутта',
  'Asia/Bangkok': 'Бангкок',
  'Asia/Singapore': 'Сингапур',
  'Asia/Tokyo': 'Токио',
  'Australia/Sydney': 'Сидней',
};
const ENFORCEMENT_OPTIONS: ReadonlyArray<{
  value: AiAllowanceEnforcementMode;
  label: string;
  description: string;
}> = [
  {
    value: 'DISABLED',
    label: 'Только учитывать расходы',
    description:
      'Сохранять расходы, но не сравнивать их с лимитом и ничего не показывать пользователю.',
  },
  {
    value: 'SHADOW',
    label: 'Проверять незаметно',
    description:
      'Сравнивать расходы с лимитом только для внутренней аналитики. Работа AI не изменится.',
  },
  {
    value: 'SOFT',
    label: 'Предупреждать, но не блокировать',
    description: 'Показать предупреждение пользователю и продолжить выполнять AI-операции.',
  },
  {
    value: 'HARD',
    label: 'Предупреждать и блокировать',
    description:
      'После исчерпания лимита показать сообщение пользователю и остановить новые AI-операции.',
  },
];
const PERIOD_OPTIONS: Array<{
  value: AiAllowancePeriodKind;
  label: string;
}> = [
  { value: 'DAY', label: 'День' },
  { value: 'MONTH', label: 'Месяц' },
];
const LOW_THRESHOLD_OPTIONS: Array<{
  value: AiAllowanceLowThresholdMode;
  label: string;
}> = [
  { value: 'PERCENT', label: 'Процент от лимита' },
  { value: 'ABSOLUTE_USD', label: 'Сумма в долларах' },
];

type CategoryRuleDraft = {
  category: AiAllowanceCategory;
  responsibility: 'END_USER_ALLOWANCE' | 'PROJECT_SPONSORED';
  capUsd: string;
  originalCapUsd: string;
  capEdited: boolean;
};

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canManage: boolean;
  canReconcile: boolean;
  canGrant?: boolean;
  canReadAccrual?: boolean;
  canManageAccrual?: boolean;
  canReadAccrualReceipts?: boolean;
  defaultLocale?: string;
  supportedLocales?: string[];
}>();
const emit = defineEmits<{ 'fresh-login': [] }>();
const policy = ref<AiAllowanceProjectPolicyView | null>(null);
const loading = ref(false);
const saving = ref(false);
const plansLoading = ref(false);
const revisionLoadingKey = ref('');
const error = ref('');
const loadedProjectId = ref('');
const dialogOpen = ref(false);
const amount = ref('');
const originalAmount = ref('');
const amountEdited = ref(false);
const period = ref<AiAllowancePeriodKind>('DAY');
const timezone = ref('UTC');
const enforcement = ref<AiAllowanceEnforcementMode>('SOFT');
const reason = ref('');
const idempotencyKey = ref('');
const hardConfirmed = ref(false);
const showEndUserExactUsd = ref(false);
const lowThresholdMode = ref<AiAllowanceLowThresholdMode>('PERCENT');
const lowThresholdValue = ref('10');
const originalLowThresholdValue = ref('');
const lowThresholdEdited = ref(false);
const formError = ref('');
const editingProjectPolicyVersion = ref('');
const configurationConflict = ref(false);
const reauthenticationRequired = ref(false);
const conflictRefreshing = ref(false);
const namedDialogOpen = ref(false);
const cohortDialogOpen = ref(false);
const planKey = ref('');
const planName = ref('');
const dailyCap = ref('');
const originalDailyCap = ref('');
const dailyCapEdited = ref(false);
const warningTranslations = ref<LocalizedText>({});
const useSystemWarning = ref(true);
const exhaustedTranslations = ref<LocalizedText>({});
const useSystemExhausted = ref(true);
const translationError = ref('');
const messageTranslationStates = ref<Record<string, TranslationUiState>>({});
const cohortScope = ref<'SEGMENT' | 'LEVEL'>('SEGMENT');
const cohortId = ref('');
const cohortPlanId = ref('');
const cohortPriority = ref(100);
const effectiveFrom = ref('');
const effectiveUntil = ref('');
const categories = AI_ALLOWANCE_CATEGORIES;
const categoryRules = ref<CategoryRuleDraft[]>([]);
const preservedCategoryRules = ref<CategoryRuleDraft[]>([]);
let generation = 0;
let mutationGeneration = 0;

const latestDefaultPlan = computed(
  () =>
    policy.value?.plans.find((plan) => plan.id === policy.value?.defaultAssignment?.planId) ?? null,
);
const latestDefaultRevision = computed(() => latestDefaultPlan.value?.revisions[0] ?? null);
const canActivateHard = computed(
  () =>
    Boolean(policy.value?.runtimeGates.hardEnforcementApproved) &&
    !policy.value?.runtimeGates.emergencyDisabled,
);
const policyReady = computed(
  () => loadedProjectId.value === props.projectId && Boolean(policy.value),
);
const allowanceDefaultLocale = computed(() => policy.value?.localization.defaultLocale ?? 'ru');
const allowanceLocalizationCatalog = computed<ScenarioLocalizationCatalogResponseDto>(() => {
  const localization = policy.value?.localization;
  const defaultLocale = localization?.defaultLocale ?? 'ru';
  const supportedLocales = localization?.supportedLocales ?? [defaultLocale];
  return {
    defaultLocale,
    enabled: true,
    locales: supportedLocales.map((code) => ({
      code,
      default: code === defaultLocale,
      language: code.split('-')[0] ?? code,
    })),
    localizedValueSchemaVersion: 1,
    paths: [],
    policyModes: ['ALL_PROJECT_LOCALES', 'SELECTED_LOCALES'],
    version: 1,
  };
});
const allowanceTranslationCatalog = computed<ScenarioTranslationCatalogResponseDto>(() => {
  const supportedLocales = policy.value?.localization.translationSupportedLocales ?? [];
  return {
    enabled:
      supportedLocales.includes(allowanceDefaultLocale.value) &&
      supportedLocales.some((locale) => locale !== allowanceDefaultLocale.value),
    maxBatchCharacters: 2000,
    supportedSourceLocales: supportedLocales,
    supportedTargetLocales: supportedLocales,
  };
});
const allowanceLocalizationPolicy = computed<ScenarioLocalizationPolicyDto>(() => ({
  version: 1,
  mode: 'ALL_PROJECT_LOCALES',
  locales: [],
}));
const customMessageFieldPaths = computed(() => [
  ...(!useSystemWarning.value ? [WARNING_FIELD_PATH] : []),
  ...(!useSystemExhausted.value ? [EXHAUSTED_FIELD_PATH] : []),
]);
const allowanceTranslationTargets = computed(() =>
  (policy.value?.localization.translationSupportedLocales ?? []).filter(
    (locale) => locale !== allowanceDefaultLocale.value,
  ),
);
const allowanceTranslationBusy = computed(() =>
  Object.values(messageTranslationStates.value).some((state) =>
    ['PENDING', 'RUNNING'].includes(state),
  ),
);
const canTranslateAllowanceContent = computed(
  () =>
    allowanceTranslationCatalog.value.enabled &&
    customMessageFieldPaths.value.length > 0 &&
    customMessageFieldPaths.value.every((fieldPath) =>
      messageContent(fieldPath)[allowanceDefaultLocale.value]?.trim(),
    ) &&
    allowanceTranslationTargets.value.length > 0 &&
    !allowanceTranslationBusy.value,
);
const lowThresholdDisplay = computed(() => {
  const configured = policy.value?.policy;
  if (!configured) return 'Не задан';
  return configured.lowThresholdMode === 'ABSOLUTE_USD'
    ? formatMoney(configured.lowThresholdValue)
    : `${compactDecimal(configured.lowThresholdValue)}% от базового лимита`;
});
const currentEnforcementOption = computed(
  () =>
    ENFORCEMENT_OPTIONS.find((option) => option.value === policy.value?.policy?.enforcementMode) ??
    ENFORCEMENT_OPTIONS[0]!,
);
const timezoneOptions = computed(() => {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: 'timeZone') => string[];
    }
  ).supportedValuesOf;
  const supported = supportedValuesOf?.('timeZone') ?? [
    'UTC',
    ...Object.keys(TIMEZONE_CITY_LABELS),
  ];
  const values = new Set(['UTC', timezone.value, ...supported]);
  return [...values]
    .filter(Boolean)
    .map((value) => ({ value, label: timezoneLabel(value) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ru'));
});
const categoryOptions = computed(() =>
  categories
    .filter(
      (category) =>
        ![...categoryRules.value, ...preservedCategoryRules.value].some(
          (rule) => rule.category === category,
        ),
    )
    .map((value) => ({ value, label: allowanceCategoryLabel(value) })),
);
const hardUnavailableReason = computed(() =>
  policy.value?.runtimeGates.emergencyDisabled
    ? 'В проекте включено аварийное отключение блокировок.'
    : 'Блокировка не разрешена в настройках окружения.',
);
let translationProjectId = props.projectId;
let translationControllerGeneration = 0;
let translationRecoveryStarted = false;
let messageTranslationController: ReturnType<typeof makeMessageTranslationController> | null =
  props.canManage
    ? makeMessageTranslationController(translationProjectId, translationControllerGeneration)
    : null;

onBeforeUnmount(() => messageTranslationController?.dispose());

watch(
  () => [props.projectId, props.canRead] as const,
  ([projectId, canRead]) => {
    if (projectId !== translationProjectId) {
      messageTranslationController?.dispose();
      translationProjectId = projectId;
      translationControllerGeneration += 1;
      translationRecoveryStarted = false;
      messageTranslationController = props.canManage
        ? makeMessageTranslationController(projectId, translationControllerGeneration)
        : null;
    }
    generation += 1;
    mutationGeneration += 1;
    policy.value = null;
    loadedProjectId.value = '';
    plansLoading.value = false;
    revisionLoadingKey.value = '';
    dialogOpen.value = false;
    namedDialogOpen.value = false;
    cohortDialogOpen.value = false;
    editingProjectPolicyVersion.value = '';
    configurationConflict.value = false;
    conflictRefreshing.value = false;
    if (canRead) void load();
    else {
      loading.value = false;
    }
  },
  { immediate: true },
);
watch(
  () => props.canManage,
  (canManage) => {
    if (canManage) {
      messageTranslationController ??= makeMessageTranslationController(
        props.projectId,
        translationControllerGeneration,
      );
      return;
    }
    mutationGeneration += 1;
    messageTranslationController?.dispose();
    messageTranslationController = null;
    translationControllerGeneration += 1;
    translationRecoveryStarted = false;
    dialogOpen.value = false;
    namedDialogOpen.value = false;
    cohortDialogOpen.value = false;
    saving.value = false;
  },
);

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const requestProjectId = props.projectId;
  loading.value = true;
  error.value = '';
  try {
    const next = await aiAllowanceRepository.projectPolicy(requestProjectId);
    const hydrated = await hydrateDefaultPlan(requestProjectId, next);
    if (requestGeneration === generation && requestProjectId === props.projectId) {
      policy.value = hydrated;
      loadedProjectId.value = requestProjectId;
    }
  } catch (cause) {
    if (requestGeneration === generation)
      error.value = message(cause, 'Не удалось загрузить политику лимитов');
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function hydrateDefaultPlan(
  projectId: string,
  view: AiAllowanceProjectPolicyView,
): Promise<AiAllowanceProjectPolicyView> {
  const assignment = view.defaultAssignment;
  if (!assignment || view.plans.some((plan) => plan.id === assignment.planId)) return view;
  const page = await aiAllowanceRepository.planRevisions(projectId, 'DEFAULT', {
    limit: 1,
  });
  if (page.projectPolicyVersion !== view.projectPolicyVersion || page.plan.id !== assignment.planId)
    throw new Error('Default allowance plan changed while it was loading');
  return {
    ...view,
    plans: [
      {
        ...page.plan,
        revisions: page.revisions,
        revisionsPageInfo: page.pageInfo,
      },
      ...view.plans,
    ],
  };
}

async function loadMorePlans(): Promise<void> {
  const current = policy.value;
  const cursor = current?.plansPageInfo.nextCursor;
  if (!policyReady.value || !cursor || plansLoading.value) return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  plansLoading.value = true;
  try {
    const next = await aiAllowanceRepository.projectPolicy(requestProjectId, {
      planCursor: cursor,
      planLimit: 50,
      revisionLimit: 5,
    });
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      loadedProjectId.value === requestProjectId &&
      policy.value === current
    ) {
      if (next.projectPolicyVersion !== current.projectPolicyVersion) {
        plansLoading.value = false;
        await load();
        return;
      }
      const plansById = new Map([...current.plans, ...next.plans].map((plan) => [plan.id, plan]));
      policy.value = {
        ...current,
        plans: [...plansById.values()],
        plansPageInfo: next.plansPageInfo,
      };
    }
  } catch (cause) {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      error.value = message(cause, 'Не удалось загрузить остальные варианты');
  } finally {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      plansLoading.value = false;
  }
}
async function loadMoreRevisions(
  plan: AiAllowanceProjectPolicyView['plans'][number],
): Promise<void> {
  const cursor = plan.revisionsPageInfo.nextCursor;
  const current = policy.value;
  if (!current || !policyReady.value || !cursor || revisionLoadingKey.value) return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  revisionLoadingKey.value = plan.key;
  try {
    const page = await aiAllowanceRepository.planRevisions(requestProjectId, plan.key, {
      limit: 25,
      cursor,
    });
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      loadedProjectId.value === requestProjectId &&
      policy.value === current
    ) {
      if (page.projectPolicyVersion !== current.projectPolicyVersion) {
        revisionLoadingKey.value = '';
        await load();
        return;
      }
      policy.value = {
        ...current,
        plans: current.plans.map((item) =>
          item.id === plan.id
            ? {
                ...item,
                revisions: [...item.revisions, ...page.revisions],
                revisionsPageInfo: page.pageInfo,
              }
            : item,
        ),
      };
    }
  } catch (cause) {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      error.value = message(cause, 'Не удалось загрузить историю изменений');
  } finally {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      revisionLoadingKey.value = '';
  }
}

function openEditor(): void {
  if (!props.canManage) return;
  if (!policyReady.value || !policy.value) return;
  editingProjectPolicyVersion.value = policy.value.projectPolicyVersion;
  const revision = latestDefaultRevision.value;
  originalAmount.value = revision?.recurringAmountUsd ?? '';
  amount.value = revision?.recurringAmountUsd ? editableDecimal(revision.recurringAmountUsd) : '';
  amountEdited.value = false;
  period.value = revision?.periodKind ?? 'DAY';
  timezone.value = policy.value?.policy?.timezone ?? 'UTC';
  enforcement.value = policy.value?.policy?.enforcementMode ?? 'SOFT';
  reason.value = '';
  idempotencyKey.value = newIdempotencyKey();
  hardConfirmed.value = false;
  showEndUserExactUsd.value = policy.value?.policy?.showEndUserExactUsd ?? false;
  lowThresholdMode.value = policy.value?.policy?.lowThresholdMode ?? 'PERCENT';
  originalLowThresholdValue.value = policy.value?.policy?.lowThresholdValue ?? '10.000000000000';
  lowThresholdValue.value = editableDecimal(
    policy.value?.policy?.lowThresholdValue ?? '10.000000000000',
  );
  lowThresholdEdited.value = false;
  formError.value = '';
  reauthenticationRequired.value = false;
  translationError.value = '';
  messageTranslationStates.value = {};
  configurationConflict.value = false;
  dialogOpen.value = true;
  const warningContent = policy.value?.policy?.warningContent;
  warningTranslations.value =
    warningContent?.mode === 'CUSTOM' ? { ...warningContent.translations } : {};
  useSystemWarning.value = warningContent?.mode !== 'CUSTOM';
  const exhaustedContent = policy.value?.policy?.exhaustedContent;
  exhaustedTranslations.value =
    exhaustedContent?.mode === 'CUSTOM' ? { ...exhaustedContent.translations } : {};
  useSystemExhausted.value = exhaustedContent?.mode !== 'CUSTOM';
  if (!translationRecoveryStarted && messageTranslationController) {
    translationRecoveryStarted = true;
    void messageTranslationController.recover();
  }
}

function openNamedEditor(plan?: AiAllowanceProjectPolicyView['plans'][number]): void {
  if (!props.canManage) return;
  if (!policyReady.value || !policy.value) return;
  editingProjectPolicyVersion.value = policy.value.projectPolicyVersion;
  const revision = plan?.revisions[0];
  planKey.value = plan?.key ?? '';
  planName.value = plan?.name ?? '';
  originalAmount.value = revision?.recurringAmountUsd ?? '';
  amount.value = revision?.recurringAmountUsd ? editableDecimal(revision.recurringAmountUsd) : '';
  amountEdited.value = false;
  period.value = revision?.periodKind ?? 'MONTH';
  originalDailyCap.value = revision?.dailyCapUsd ?? '';
  dailyCap.value = revision?.dailyCapUsd ? editableDecimal(revision.dailyCapUsd) : '';
  dailyCapEdited.value = false;
  reason.value = '';
  idempotencyKey.value = newIdempotencyKey();
  formError.value = '';
  reauthenticationRequired.value = false;
  configurationConflict.value = false;
  const meaningfulRules = (revision?.categoryRules ?? [])
    .filter(
      (rule) =>
        Boolean(rule.capUsd) || rule.responsibility !== defaultResponsibility(rule.category),
    )
    .map((rule) => ({
      category: rule.category,
      responsibility: rule.responsibility,
      capUsd: rule.capUsd ? editableDecimal(rule.capUsd) : '',
      originalCapUsd: rule.capUsd ?? '',
      capEdited: false,
    }));
  categoryRules.value = meaningfulRules.slice(0, MAX_CATEGORY_RULES);
  preservedCategoryRules.value = meaningfulRules.slice(MAX_CATEGORY_RULES);
  namedDialogOpen.value = true;
}
function openCohortEditor(): void {
  if (!props.canManage || !policyReady.value || !policy.value) return;
  editingProjectPolicyVersion.value = policy.value.projectPolicyVersion;
  cohortScope.value = 'SEGMENT';
  cohortId.value = '';
  cohortPlanId.value = policy.value?.plans.find((plan) => plan.status === 'ACTIVE')?.id ?? '';
  cohortPriority.value = 100;
  effectiveFrom.value = localInput(new Date());
  effectiveUntil.value = '';
  reason.value = '';
  idempotencyKey.value = newIdempotencyKey();
  formError.value = '';
  reauthenticationRequired.value = false;
  configurationConflict.value = false;
  cohortDialogOpen.value = true;
}

async function save(): Promise<void> {
  if (!props.canManage) return fail('Операция больше недоступна.');
  if (!editingProjectPolicyVersion.value)
    return fail('Сначала загрузите актуальную конфигурацию проекта.');
  const amountInput = effectiveDecimal(amount.value, originalAmount.value, amountEdited.value);
  const exactAmount = parseAllowanceUsd(amountInput);
  if (
    !exactAmount ||
    (amountEdited.value && !/^\d+(?:\.\d{1,2})?$/u.test(amount.value.trim())) ||
    compareDecimalStrings(exactAmount, '0') < 0
  )
    return fail('Укажите лимит — не более двух знаков после запятой.');
  if (!validTimezone(timezone.value.trim()))
    return fail('Выберите корректный часовой пояс из списка.');
  const lowThresholdInput = effectiveDecimal(
    lowThresholdValue.value,
    originalLowThresholdValue.value,
    lowThresholdEdited.value,
  );
  const exactLowThreshold = parseAllowanceUsd(lowThresholdInput);
  if (
    !exactLowThreshold ||
    (lowThresholdEdited.value && !/^\d+(?:\.\d{1,2})?$/u.test(lowThresholdValue.value.trim())) ||
    compareDecimalStrings(exactLowThreshold, '0') <= 0 ||
    (lowThresholdMode.value === 'PERCENT' && compareDecimalStrings(exactLowThreshold, '100') > 0)
  )
    return fail(
      lowThresholdMode.value === 'PERCENT'
        ? 'Укажите процент от 0,01 до 100 — не более двух знаков после запятой.'
        : 'Укажите сумму больше нуля — не более двух знаков после запятой.',
    );
  if (!useSystemWarning.value && !customContent(warningTranslations.value))
    return fail(
      `Заполните предупреждение на основном языке (${allowanceDefaultLocale.value}) или включите стандартный текст Retenive.`,
    );
  if (!useSystemExhausted.value && !customContent(exhaustedTranslations.value))
    return fail(
      `Заполните сообщение об исчерпании на основном языке (${allowanceDefaultLocale.value}) или включите стандартный текст Retenive.`,
    );
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return fail('Укажите причину изменения — от 3 до 500 символов.');
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128)
    return fail('Укажите Idempotency-Key длиной до 128 символов.');
  if (enforcement.value === 'HARD' && !canActivateHard.value)
    return fail('Блокировку сейчас нельзя включить для этого проекта.');
  if (enforcement.value === 'HARD' && !hardConfirmed.value)
    return fail('Подтвердите, что AI-операции можно блокировать.');
  const requestGeneration = mutationGeneration;
  const requestProjectId = props.projectId;
  saving.value = true;
  formError.value = '';
  configurationConflict.value = false;
  reauthenticationRequired.value = false;
  try {
    const result = await aiAllowanceRepository.putDefaultPlan(
      requestProjectId,
      {
        expectedProjectPolicyVersion: editingProjectPolicyVersion.value,
        amountUsd: exactAmount,
        categoryRules: (latestDefaultRevision.value?.categoryRules ?? []).map((rule) => ({
          category: rule.category,
          responsibility: rule.responsibility,
          ...(rule.capUsd ? { capUsd: rule.capUsd } : {}),
        })),
        period: period.value,
        timezone: timezone.value.trim(),
        enforcementMode: enforcement.value,
        lowThresholdMode: lowThresholdMode.value,
        lowThresholdValue: exactLowThreshold,
        showEndUserExactUsd: showEndUserExactUsd.value,
        reason: reason.value.trim(),
        warningContent: useSystemWarning.value
          ? { mode: 'SYSTEM' }
          : customContent(warningTranslations.value),
        exhaustedContent: useSystemExhausted.value
          ? { mode: 'SYSTEM' }
          : customContent(exhaustedTranslations.value),
      },
      idempotencyKey.value.trim(),
    );
    if (
      requestGeneration !== mutationGeneration ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    acceptProjectPolicyVersion(result.projectPolicyVersion);
    dialogOpen.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (requestGeneration === mutationGeneration && requestProjectId === props.projectId) {
      configurationConflict.value = isConfigurationConflict(cause);
      reauthenticationRequired.value = isAllowanceReauthenticationRequired(cause);
      formError.value = reauthenticationRequired.value
        ? ''
        : mutationMessage(cause, 'Не удалось сохранить политику лимитов');
    }
  } finally {
    if (requestGeneration === mutationGeneration && requestProjectId === props.projectId)
      saving.value = false;
  }
}

async function saveNamed(): Promise<void> {
  if (!props.canManage) return fail('Операция больше недоступна.');
  if (!editingProjectPolicyVersion.value)
    return fail('Сначала загрузите актуальную конфигурацию проекта.');
  const key = planKey.value.trim().toUpperCase();
  const exact = parseAllowanceUsd(
    effectiveDecimal(amount.value, originalAmount.value, amountEdited.value),
  );
  const capInput = effectiveDecimal(dailyCap.value, originalDailyCap.value, dailyCapEdited.value);
  const cap = capInput ? parseAllowanceUsd(capInput) : undefined;
  if (!/^[A-Z][A-Z0-9_-]{0,99}$/.test(key) || key === 'DEFAULT')
    return fail('Ключ: A-Z, 0-9, _ или -, до 100 символов; DEFAULT зарезервирован.');
  if (
    planName.value.trim().length < 1 ||
    planName.value.trim().length > 160 ||
    !exact ||
    (amountEdited.value && !/^\d+(?:\.\d{1,2})?$/u.test(amount.value.trim()))
  )
    return fail(
      'Проверьте название и лимит — в сумме допустимо не более двух знаков после запятой.',
    );
  if (
    capInput &&
    (!cap || (dailyCapEdited.value && !/^\d+(?:\.\d{1,2})?$/u.test(dailyCap.value.trim())))
  )
    return fail('Проверьте дневное ограничение — не более двух знаков после запятой.');
  if (period.value === 'DAY' && cap && compareDecimalStrings(cap, exact) > 0)
    return fail('Дневной максимум не может превышать общую сумму лимита.');
  if (!validCommon()) return;
  const rules = [...categoryRules.value, ...preservedCategoryRules.value].map((rule) => {
    const ruleCap = effectiveDecimal(rule.capUsd, rule.originalCapUsd, rule.capEdited);
    return {
      category: rule.category,
      responsibility: rule.responsibility,
      ...(ruleCap ? { capUsd: parseAllowanceUsd(ruleCap) } : {}),
    };
  });
  if (
    rules.some((rule) => 'capUsd' in rule && !rule.capUsd) ||
    categoryRules.value.some(
      (rule) =>
        rule.capEdited && rule.capUsd.trim() && !/^\d+(?:\.\d{1,2})?$/u.test(rule.capUsd.trim()),
    )
  )
    return fail('Проверьте ограничения выбранных категорий — не более двух знаков после запятой.');
  const requestGeneration = mutationGeneration;
  const requestProjectId = props.projectId;
  saving.value = true;
  configurationConflict.value = false;
  reauthenticationRequired.value = false;
  try {
    const result = await aiAllowanceRepository.putPlan(
      requestProjectId,
      key,
      {
        expectedProjectPolicyVersion: editingProjectPolicyVersion.value,
        name: planName.value.trim(),
        amountUsd: exact,
        period: period.value,
        ...(cap ? { dailyCapUsd: cap } : {}),
        categoryRules: rules as never,
        reason: reason.value.trim(),
      },
      idempotencyKey.value.trim(),
    );
    if (
      requestGeneration !== mutationGeneration ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    acceptProjectPolicyVersion(result.projectPolicyVersion);
    namedDialogOpen.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (requestGeneration === mutationGeneration && requestProjectId === props.projectId) {
      configurationConflict.value = isConfigurationConflict(cause);
      reauthenticationRequired.value = isAllowanceReauthenticationRequired(cause);
      formError.value = reauthenticationRequired.value
        ? ''
        : mutationMessage(cause, 'Не удалось сохранить вариант');
    }
  } finally {
    if (requestGeneration === mutationGeneration && requestProjectId === props.projectId)
      saving.value = false;
  }
}
async function saveCohort(): Promise<void> {
  if (!props.canManage) return fail('Операция больше недоступна.');
  if (!editingProjectPolicyVersion.value)
    return fail('Сначала загрузите актуальную конфигурацию проекта.');
  const id = cohortId.value.trim().toLowerCase();
  const from = localIso(effectiveFrom.value);
  const until = effectiveUntil.value ? localIso(effectiveUntil.value) : undefined;
  const validCohortId =
    cohortScope.value === 'SEGMENT'
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      : /^[a-z0-9][a-z0-9._-]{0,99}$/.test(id);
  if (!validCohortId)
    return fail(
      cohortScope.value === 'SEGMENT'
        ? 'Выберите опубликованный сегмент.'
        : 'Некорректный ID уровня.',
    );
  if (
    !cohortPlanId.value ||
    !Number.isSafeInteger(cohortPriority.value) ||
    cohortPriority.value < 0 ||
    cohortPriority.value > 1_000_000 ||
    !from ||
    (effectiveUntil.value && (!until || from >= until))
  )
    return fail('Проверьте вариант лимита, приоритет и период назначения.');
  if (!validCommon()) return;
  const requestGeneration = mutationGeneration;
  const requestProjectId = props.projectId;
  saving.value = true;
  configurationConflict.value = false;
  reauthenticationRequired.value = false;
  try {
    const result = await aiAllowanceRepository.putCohortAssignment(
      requestProjectId,
      cohortScope.value,
      id,
      {
        expectedProjectPolicyVersion: editingProjectPolicyVersion.value,
        planId: cohortPlanId.value,
        priority: cohortPriority.value,
        effectiveFrom: from,
        ...(until ? { effectiveUntil: until } : {}),
        reason: reason.value.trim(),
      },
      idempotencyKey.value.trim(),
    );
    if (
      requestGeneration !== mutationGeneration ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    acceptProjectPolicyVersion(result.projectPolicyVersion);
    cohortDialogOpen.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (requestGeneration === mutationGeneration && requestProjectId === props.projectId) {
      configurationConflict.value = isConfigurationConflict(cause);
      reauthenticationRequired.value = isAllowanceReauthenticationRequired(cause);
      formError.value = reauthenticationRequired.value
        ? ''
        : mutationMessage(cause, 'Не удалось назначить лимит группе');
    }
  } finally {
    if (requestGeneration === mutationGeneration && requestProjectId === props.projectId)
      saving.value = false;
  }
}
function validCommon(): boolean {
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500) {
    fail('Причина должна содержать от 3 до 500 символов.');
    return false;
  }
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128) {
    fail('Некорректный Idempotency-Key.');
    return false;
  }
  return true;
}
function customContent(value: LocalizedText): AiAllowanceLocalizedContent | undefined {
  const translations = Object.fromEntries(
    (policy.value?.localization.supportedLocales ?? [])
      .map((locale) => [locale, value[locale]?.trim() ?? ''] as const)
      .filter(([, text]) => text),
  );
  const defaultLocale = allowanceDefaultLocale.value;
  if (!translations[defaultLocale]) return undefined;
  return { mode: 'CUSTOM', defaultLocale, translations };
}
function makeMessageTranslationController(projectId: string, controllerGeneration: number) {
  return createTranslationJobController({
    context: () => ({ projectId, scenarioId: 'allowance-policy' }),
    getValue: messageContent,
    apply: (fieldPath, _locale, text, snapshot) => {
      if (projectId !== props.projectId || controllerGeneration !== translationControllerGeneration)
        return 'STALE_SOURCE';
      const result = applyTranslationResult({
        current: messageContent(fieldPath),
        snapshot,
        translatedText: text,
      });
      if (result.outcome === 'APPLIED') setMessageContent(fieldPath, result.value);
      return result.outcome;
    },
    state: (fieldPath, locale, state) => {
      if (projectId !== props.projectId || controllerGeneration !== translationControllerGeneration)
        return;
      messageTranslationStates.value = {
        ...messageTranslationStates.value,
        [`${fieldPath}:${locale}`]: state,
      };
    },
  });
}
function messageContent(fieldPath: string): LocalizedText {
  return fieldPath === WARNING_FIELD_PATH ? warningTranslations.value : exhaustedTranslations.value;
}
function setMessageContent(fieldPath: string, value: LocalizedText): void {
  if (fieldPath === WARNING_FIELD_PATH) {
    warningTranslations.value = value;
    return;
  }
  exhaustedTranslations.value = value;
}
function translationStatesFor(fieldPath: string): Record<string, TranslationUiState> {
  return Object.fromEntries(
    Object.entries(messageTranslationStates.value)
      .filter(([key]) => key.startsWith(`${fieldPath}:`))
      .map(([key, state]) => [key.slice(fieldPath.length + 1), state]),
  );
}
function markTranslationManual(fieldPath: string, locale: string): void {
  messageTranslationStates.value = {
    ...messageTranslationStates.value,
    [`${fieldPath}:${locale}`]: 'MANUAL',
  };
}
async function translateAllContent(): Promise<void> {
  const sourceLocale = allowanceDefaultLocale.value;
  const fieldPaths = customMessageFieldPaths.value;
  if (
    !fieldPaths.length ||
    fieldPaths.some((fieldPath) => !messageContent(fieldPath)[sourceLocale]?.trim())
  ) {
    translationError.value = `Сначала заполните все свои сообщения на основном языке (${sourceLocale}).`;
    return;
  }
  const targets = allowanceTranslationTargets.value;
  if (!targets.length) {
    translationError.value = 'Для языков проекта автоматический перевод недоступен.';
    return;
  }
  const filledTargets = targets.filter((locale) =>
    fieldPaths.some((fieldPath) => messageContent(fieldPath)[locale]?.trim()),
  );
  if (
    filledTargets.length &&
    !window.confirm('Заменить уже заполненные переводы? Тексты на основном языке не изменятся.')
  )
    return;
  translationError.value = '';
  const controller = messageTranslationController;
  if (!controller) {
    translationError.value = 'Перевод сейчас недоступен.';
    return;
  }
  try {
    await controller.startBatch({
      fieldPaths,
      sourceLocale,
      targets,
    });
  } catch (cause) {
    translationError.value = message(cause, 'Не удалось выполнить перевод.');
  }
}
async function retryTranslation(fieldPath: string, locale: string): Promise<void> {
  try {
    await messageTranslationController?.retry(fieldPath, locale);
  } catch (cause) {
    translationError.value = message(cause, 'Не удалось повторить перевод.');
  }
}
function defaultResponsibility(category: AiAllowanceCategory): CategoryRuleDraft['responsibility'] {
  return SPONSORED_CATEGORIES.has(category) ? 'PROJECT_SPONSORED' : 'END_USER_ALLOWANCE';
}
function addCategoryRule(): void {
  if (categoryRules.value.length >= MAX_CATEGORY_RULES) return;
  const category = categoryOptions.value[0]?.value;
  if (!category) return;
  categoryRules.value.push({
    category,
    responsibility: defaultResponsibility(category),
    capUsd: '',
    originalCapUsd: '',
    capEdited: false,
  });
}
function removeCategoryRule(index: number): void {
  categoryRules.value.splice(index, 1);
}
function changeRuleCategory(index: number, category: AiAllowanceCategory): void {
  const rule = categoryRules.value[index];
  if (!rule) return;
  rule.category = category;
  rule.responsibility = defaultResponsibility(category);
}
function timezoneLabel(value: string): string {
  const city =
    TIMEZONE_CITY_LABELS[value] ?? value.split('/').at(-1)?.replaceAll('_', ' ') ?? value;
  let offset = '';
  try {
    offset =
      new Intl.DateTimeFormat('ru-RU', {
        timeZone: value,
        timeZoneName: 'shortOffset',
      })
        .formatToParts()
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    // The current API value remains visible even if this browser cannot format it.
  }
  return [city, city === value ? '' : value, offset].filter(Boolean).join(' · ');
}
function localInput(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function localIso(value: string): string | undefined {
  const date = new Date(value);
  return value && Number.isFinite(date.valueOf()) ? date.toISOString() : undefined;
}

function fail(value: string): void {
  formError.value = value;
}
function formatMoney(value: DecimalString): string {
  return formatDecimalMoney(value, 'USD');
}
function planDisplayName(plan: { id: string; name: string }): string {
  const isDefault = plan.id === policy.value?.defaultAssignment?.planId;
  const hasTechnicalDefaultName = /^(?:project[- ]?default|default)$/iu.test(plan.name.trim());
  return isDefault && hasTechnicalDefaultName ? 'Общий лимит проекта' : plan.name;
}
function compactDecimal(value: DecimalString): string {
  const [whole, fraction = ''] = value.split('.');
  const significantFraction = fraction.replace(/0+$/u, '');
  return significantFraction ? `${whole}.${significantFraction}` : whole!;
}
function editableDecimal(value: DecimalString): string {
  const match = /^(?<whole>\d+)(?:\.(?<fraction>\d+))?$/u.exec(value);
  if (!match?.groups) return compactDecimal(value);
  let whole = match.groups.whole!;
  const fraction = match.groups.fraction ?? '';
  let cents = Number(fraction.slice(0, 2).padEnd(2, '0'));
  if ((fraction[2] ?? '0') >= '5') cents += 1;
  if (cents === 100) {
    whole = incrementDecimalDigits(whole);
    cents = 0;
  }
  const compactCents = String(cents).padStart(2, '0').replace(/0+$/u, '');
  return compactCents ? `${whole}.${compactCents}` : whole;
}
function incrementDecimalDigits(value: string): string {
  const digits = [...value];
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== '9') {
      digits[index] = String(Number(digits[index]) + 1);
      return digits.join('');
    }
    digits[index] = '0';
  }
  return `1${digits.join('')}`;
}
function effectiveDecimal(displayed: string, original: string, edited: boolean): string {
  return edited || !original ? displayed.trim() : original.trim();
}
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `allowance-${Date.now()}`;
}
function validTimezone(value: string): boolean {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
function mutationMessage(cause: unknown, fallback: string): string {
  return isConfigurationConflict(cause)
    ? 'Конфигурация лимитов уже изменилась. Форма сохранена — перезагрузите актуальную конфигурацию и повторите проверку.'
    : message(cause, fallback);
}
function isConfigurationConflict(cause: unknown): boolean {
  return (
    cause instanceof ApiError &&
    cause.status === 409 &&
    cause.code === 'AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT'
  );
}
async function refreshDraftVersion(): Promise<void> {
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  conflictRefreshing.value = true;
  try {
    const next = await aiAllowanceRepository.projectPolicy(requestProjectId);
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    policy.value = next;
    loadedProjectId.value = requestProjectId;
    editingProjectPolicyVersion.value = next.projectPolicyVersion;
    configurationConflict.value = false;
    formError.value = '';
  } catch (cause) {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      formError.value = message(cause, 'Не удалось загрузить актуальную конфигурацию');
  } finally {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      conflictRefreshing.value = false;
  }
}
function acceptProjectPolicyVersion(projectPolicyVersion: string): void {
  if (!policy.value) return;
  policy.value = { ...policy.value, projectPolicyVersion };
  editingProjectPolicyVersion.value = projectPolicyVersion;
}
</script>

<template>
  <section class="allowance-panel" role="tabpanel" aria-labelledby="ai-cost-tab-limits">
    <Message v-if="!canRead" severity="warn" :closable="false"
      >Нет права <code>project.ai_allowance.read</code>. Политика и балансы скрыты.</Message
    >
    <div v-if="!canRead && canManage" class="card direct-actions">
      <div>
        <h3>Операции управления</h3>
        <p>
          Для безопасного изменения нужен актуальный номер версии. Выдайте право чтения конфигурации
          или выполните операцию через API с проверенным OCC-токеном.
        </p>
      </div>
      <div class="heading-actions">
        <Button
          label="Настроить общий лимит"
          icon="pi pi-pencil"
          disabled
          @click="openEditor"
        /><Button
          label="Создать вариант"
          outlined
          icon="pi pi-plus"
          disabled
          @click="openNamedEditor()"
        />
      </div>
    </div>
    <div v-if="canRead" class="allowance-heading">
      <div>
        <span class="eyebrow">Лимиты для пользователей</span>
        <h2>Общий лимит проекта</h2>
        <p>
          Здесь задаётся сумма, которую пользователь может потратить на AI за день или месяц. В
          начале нового периода лимит обновляется.
        </p>
      </div>
      <div class="heading-actions">
        <Button
          v-if="canManage"
          label="Настроить общий лимит"
          icon="pi pi-pencil"
          :disabled="!policyReady"
          @click="openEditor"
        /><Button
          v-if="canManage"
          label="Создать вариант"
          class="secondary-action"
          severity="secondary"
          outlined
          icon="pi pi-plus"
          :disabled="!policyReady"
          @click="openNamedEditor()"
        /><Button
          v-if="canManage"
          label="Назначить группе"
          class="secondary-action"
          severity="secondary"
          outlined
          icon="pi pi-users"
          :disabled="!policyReady"
          @click="openCohortEditor"
        />
      </div>
    </div>
    <template v-if="canRead">
      <div v-if="loading && !policy" class="allowance-loading">
        <Skeleton height="150px" /><Skeleton height="150px" />
      </div>
      <Message v-if="error" severity="error" :closable="false"
        ><span>{{ error }}</span
        ><Button label="Повторить" text size="small" @click="load"
      /></Message>
      <template v-if="policy">
        <Message
          v-if="policy.policy?.enforcementMode === 'HARD' && canActivateHard"
          severity="error"
          :closable="false"
          ><strong>Блокировка расходов включена.</strong> Когда лимит закончится, новые AI-операции
          пользователя будут остановлены.</Message
        >
        <div
          v-if="policy.runtimeGates.emergencyDisabled"
          class="gate-warning emergency"
          role="alert"
        >
          <i class="pi pi-shield" aria-hidden="true" />
          <div>
            <strong>Блокировка расходов временно отключена</strong>
            <span
              >Расходы продолжают учитываться, но AI не остановится после исчерпания лимита. Чтобы
              вернуть блокировку, администратор окружения должен отключить аварийный режим на
              сервере.</span
            >
          </div>
        </div>
        <div
          v-else-if="!policy.runtimeGates.hardEnforcementApproved"
          class="gate-warning"
          role="status"
        >
          <i class="pi pi-shield" aria-hidden="true" />
          <div>
            <strong>Блокировка расходов недоступна</strong>
            <span
              >Для этого окружения её ещё не разрешили. Администратор сервера должен включить
              блокировку, после чего этот режим появится в настройках лимита.</span
            >
          </div>
        </div>
        <div class="policy-grid">
          <article>
            <small>Режим</small
            ><strong class="mode-badge">{{ currentEnforcementOption.label }}</strong
            ><span>{{ currentEnforcementOption.description }}</span>
          </article>
          <article>
            <small>Базовый лимит</small
            ><strong>{{
              latestDefaultRevision
                ? formatMoney(latestDefaultRevision.recurringAmountUsd)
                : 'Не настроен'
            }}</strong
            ><span>{{
              !latestDefaultRevision
                ? 'Задайте сумму и период.'
                : latestDefaultRevision.periodKind === 'MONTH'
                  ? 'Обновляется каждый месяц.'
                  : 'Обновляется каждый день.'
            }}</span>
          </article>
          <article>
            <small>Часовой пояс</small
            ><strong>{{ timezoneLabel(policy.policy?.timezone ?? 'UTC') }}</strong
            ><span>По нему начинается новый день или месяц лимита.</span>
          </article>
          <article>
            <small>Порог предупреждения</small
            ><strong data-testid="allowance-low-threshold-summary">{{ lowThresholdDisplay }}</strong
            ><span
              >Когда остаток достигнет этого значения, пользователь увидит предупреждение.</span
            >
          </article>
        </div>
        <div class="plans card">
          <header>
            <div>
              <h3>Варианты лимита</h3>
              <p>
                Общий вариант действует для всех пользователей. Дополнительные варианты можно
                назначить отдельным группам.
              </p>
            </div>
          </header>
          <div v-if="policy.plans.length" class="plan-list">
            <article v-for="plan in policy.plans" :key="plan.id">
              <div>
                <strong>{{ planDisplayName(plan) }}</strong
                ><small
                  >{{ plan.key }} · {{ plan.status === 'ACTIVE' ? 'активен' : 'в архиве' }}</small
                >
              </div>
              <div v-if="plan.revisions[0]">
                <strong
                  >{{ formatMoney(plan.revisions[0].recurringAmountUsd) }} /
                  {{ plan.revisions[0].periodKind === 'DAY' ? 'день' : 'месяц' }}</strong
                ><small
                  >версия {{ plan.revisions[0].revisionNumber }} · максимум в день:
                  {{
                    plan.revisions[0].dailyCapUsd
                      ? formatMoney(plan.revisions[0].dailyCapUsd)
                      : 'нет'
                  }}</small
                >
              </div>
              <Button
                v-if="canManage && plan.key !== 'DEFAULT'"
                label="Изменить вариант"
                text
                size="small"
                @click="openNamedEditor(plan)"
              />
              <Button
                v-if="plan.revisionsPageInfo.hasMore"
                label="Показать историю"
                text
                size="small"
                :loading="revisionLoadingKey === plan.key"
                @click="loadMoreRevisions(plan)"
              />
            </article>
          </div>
          <Button
            v-if="policy.plansPageInfo.hasMore"
            label="Показать остальные варианты"
            outlined
            :loading="plansLoading"
            @click="loadMorePlans"
          />
          <p v-if="!policy.plans.length" class="empty-state">
            Сначала настройте общий лимит проекта.
          </p>
        </div>
      </template>
    </template>
    <AiAllowanceDirectGrantPanel
      v-if="canGrant"
      :project-id="projectId"
      @fresh-login="emit('fresh-login')"
    />
    <AiAllowanceAccrualRulesPanel
      v-if="canReadAccrual || canManageAccrual"
      :project-id="projectId"
      :can-read="Boolean(canReadAccrual)"
      :can-manage="Boolean(canManageAccrual)"
      @fresh-login="emit('fresh-login')"
    />
    <AiAllowanceAccrualReceiptsPanel v-if="canReadAccrualReceipts" :project-id="projectId" />
  </section>

  <Dialog
    v-model:visible="dialogOpen"
    class="allowance-dialog"
    modal
    header="Общий лимит проекта"
    :style="{ width: 'min(680px, 94vw)' }"
  >
    <form class="allowance-form" @submit.prevent="save">
      <p class="form-intro">
        Лимит определяет, сколько проект выделяет каждому пользователю на AI за один период. Расходы
        списываются из этой суммы до начала следующего периода.
      </p>
      <section
        class="primary-limit-card"
        data-testid="primary-limit-card"
        aria-labelledby="primary-limit-title"
      >
        <div class="primary-limit-copy">
          <span id="primary-limit-title" class="primary-limit-title"
            >Базовый лимит
            <button
              type="button"
              class="help-tip"
              aria-label="Подсказка о базовом лимите"
              title="Максимальная сумма расходов на AI за выбранный период."
            >
              <i class="pi pi-question-circle" aria-hidden="true" /></button
          ></span>
          <p>Максимальные расходы проекта за выбранный период.</p>
        </div>
        <span class="input-with-suffix compact-money-input"
          ><input
            v-model="amount"
            inputmode="decimal"
            autocomplete="off"
            aria-label="Базовый лимит в долларах"
            @input="amountEdited = true"
          /><span data-testid="allowance-amount-suffix">$</span></span
        >
      </section>
      <div class="settings-grid">
        <label>
          <span class="field-label">Период лимита</span>
          <Select
            v-model="period"
            data-testid="allowance-period-select"
            :options="PERIOD_OPTIONS"
            option-label="label"
            option-value="value"
            aria-label="Период лимита"
            fluid
          />
        </label>
        <label>
          <span class="field-label"
            >Часовой пояс
            <button
              type="button"
              class="help-tip"
              aria-label="Подсказка о часовом поясе"
              title="По этому часовому поясу начинается новый день или месяц лимита."
            >
              <i class="pi pi-question-circle" aria-hidden="true" /></button
          ></span>
          <Select
            v-model="timezone"
            data-testid="allowance-timezone-select"
            :options="timezoneOptions"
            option-label="label"
            option-value="value"
            filter
            filter-placeholder="Найти город"
            placeholder="Выберите город"
            fluid
          />
        </label>
        <label>
          <span class="field-label"
            >Порог предупреждения
            <button
              type="button"
              class="help-tip"
              aria-label="Подсказка о пороге предупреждения"
              title="Когда остаток станет равен этому значению или меньше, пользователь увидит предупреждение."
            >
              <i class="pi pi-question-circle" aria-hidden="true" /></button
          ></span>
          <Select
            id="allowance-low-threshold-mode"
            v-model="lowThresholdMode"
            data-testid="allowance-threshold-mode-select"
            :options="LOW_THRESHOLD_OPTIONS"
            option-label="label"
            option-value="value"
            aria-label="Способ расчёта порога предупреждения"
            fluid
          />
        </label>
        <label for="allowance-low-threshold-value">
          <span class="field-label"
            >Значение
            <button
              type="button"
              class="help-tip"
              aria-label="Подсказка о значении порога"
              :title="
                lowThresholdMode === 'PERCENT'
                  ? 'От 0,01 до 100, не более двух знаков после запятой.'
                  : 'Сумма больше нуля, не более двух знаков после запятой.'
              "
            >
              <i class="pi pi-question-circle" aria-hidden="true" /></button
          ></span>
          <span class="input-with-suffix"
            ><input
              id="allowance-low-threshold-value"
              v-model="lowThresholdValue"
              inputmode="decimal"
              autocomplete="off"
              @input="lowThresholdEdited = true"
            /><span>{{ lowThresholdMode === 'PERCENT' ? '%' : '$' }}</span></span
          >
        </label>
      </div>
      <fieldset class="mode-picker">
        <legend>Что делать после исчерпания лимита</legend>
        <div class="mode-options">
          <label
            v-for="option in ENFORCEMENT_OPTIONS"
            :key="option.value"
            class="mode-option"
            :class="{ selected: enforcement === option.value }"
          >
            <input
              v-model="enforcement"
              type="radio"
              name="allowance-enforcement"
              :value="option.value"
              :disabled="option.value === 'HARD' && !canActivateHard"
            />
            <span
              ><strong>{{ option.label }}</strong
              ><small>{{ option.description }}</small></span
            >
          </label>
        </div>
      </fieldset>
      <details class="form-accordion" data-testid="allowance-warning-content">
        <summary>
          <span
            ><strong>Предупреждение о низком остатке</strong
            ><small>Текст, который пользователь увидит при достижении порога.</small></span
          >
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </summary>
        <div class="accordion-content">
          <label class="checkbox-card">
            <input v-model="useSystemWarning" data-testid="use-system-warning" type="checkbox" />
            <span
              ><strong>Использовать стандартный текст Retenive</strong
              ><small>Retenive покажет готовое предупреждение на языке пользователя.</small></span
            >
          </label>
          <LocalizedField
            v-if="!useSystemWarning"
            v-model="warningTranslations"
            :catalog="allowanceLocalizationCatalog"
            :translation="allowanceTranslationCatalog"
            :policy="allowanceLocalizationPolicy"
            :source-locale="allowanceDefaultLocale"
            :field-path="WARNING_FIELD_PATH"
            scenario-id="allowance-policy"
            :project-id="projectId"
            label="Предупреждение о низком остатке"
            :translation-states="translationStatesFor(WARNING_FIELD_PATH)"
            :max-length="2000"
            :show-translation-actions="false"
            @manual-edit="markTranslationManual(WARNING_FIELD_PATH, $event)"
            @retry="retryTranslation(WARNING_FIELD_PATH, $event)"
          />
        </div>
      </details>
      <details class="form-accordion" data-testid="allowance-exhausted-content">
        <summary>
          <span
            ><strong>Сообщение об исчерпании лимита</strong
            ><small>Текст, который пользователь увидит, когда квота закончится.</small></span
          >
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </summary>
        <div class="accordion-content">
          <label class="checkbox-card">
            <input
              v-model="useSystemExhausted"
              data-testid="use-system-exhausted"
              type="checkbox"
            />
            <span
              ><strong>Использовать стандартный текст Retenive</strong
              ><small>Retenive покажет готовое сообщение на языке пользователя.</small></span
            >
          </label>
          <LocalizedField
            v-if="!useSystemExhausted"
            v-model="exhaustedTranslations"
            :catalog="allowanceLocalizationCatalog"
            :translation="allowanceTranslationCatalog"
            :policy="allowanceLocalizationPolicy"
            :source-locale="allowanceDefaultLocale"
            :field-path="EXHAUSTED_FIELD_PATH"
            scenario-id="allowance-policy"
            :project-id="projectId"
            label="Сообщение об исчерпании лимита"
            :translation-states="translationStatesFor(EXHAUSTED_FIELD_PATH)"
            :max-length="2000"
            :show-translation-actions="false"
            @manual-edit="markTranslationManual(EXHAUSTED_FIELD_PATH, $event)"
            @retry="retryTranslation(EXHAUSTED_FIELD_PATH, $event)"
          />
        </div>
      </details>
      <div v-if="customMessageFieldPaths.length" class="allowance-translation-toolbar">
        <Button
          data-testid="translate-allowance-content"
          label="Перевести на все языки"
          icon="pi pi-language"
          type="button"
          size="small"
          :loading="allowanceTranslationBusy"
          :disabled="!canTranslateAllowanceContent"
          @click="translateAllContent"
        />
        <span
          ><strong>AI-перевод сообщений</strong
          ><small
            >Retenive переведёт свои тексты на языки проекта одним запросом. Вы сможете проверить и
            изменить результат перед сохранением.</small
          ></span
        >
      </div>
      <small v-if="translationError" class="field-error" role="alert">{{ translationError }}</small>
      <Message v-if="enforcement === 'HARD' && canActivateHard" severity="error" :closable="false"
        >После исчерпания лимита новые AI-операции пользователя будут остановлены.<label
          class="hard-confirm"
          ><input id="hard-enforcement-confirmation" v-model="hardConfirmed" type="checkbox" /> Я
          подтверждаю, что AI-операции можно блокировать</label
        ></Message
      >
      <Message v-else-if="!canActivateHard" severity="warn" :closable="false"
        ><strong>Блокировка сейчас недоступна.</strong> {{ hardUnavailableReason }}</Message
      >
      <label class="visibility-toggle" for="show-end-user-exact-usd">
        <input id="show-end-user-exact-usd" v-model="showEndUserExactUsd" type="checkbox" />
        <span
          ><strong>Показывать пользователю остаток в долларах</strong>
          <small
            >Значение появится только после отдельного включения этой возможности в окружении
            проекта.</small
          ></span
        >
      </label>
      <label>
        <span class="field-label">Причина изменения <span aria-hidden="true">*</span></span>
        <textarea
          v-model="reason"
          rows="2"
          maxlength="500"
          placeholder="Например: увеличили лимит для нового тарифа"
          required
        />
        <small
          >Будет сохранена в истории изменений, чтобы коллеги понимали причину изменения.</small
        >
      </label>
      <small v-if="formError" class="field-error" role="alert">{{ formError }}</small>
      <Button
        v-if="configurationConflict"
        label="Загрузить актуальную версию"
        type="button"
        outlined
        severity="warn"
        :loading="conflictRefreshing"
        @click="refreshDraftVersion"
      />
      <AiAllowanceReauthenticationAction
        :required="reauthenticationRequired"
        @fresh-login="emit('fresh-login')"
      />
      <footer>
        <Button
          label="Отмена"
          text
          type="button"
          :disabled="saving"
          @click="dialogOpen = false"
        /><Button label="Сохранить изменения" type="submit" :loading="saving" />
      </footer>
    </form>
  </Dialog>

  <Dialog
    v-model:visible="namedDialogOpen"
    modal
    header="Вариант лимита"
    :style="{ width: 'min(720px, 94vw)' }"
  >
    <form class="allowance-form" @submit.prevent="saveNamed">
      <p class="form-intro">
        Вариант лимита можно назначить отдельной группе пользователей. Каждое изменение сохраняется
        в истории.
      </p>
      <div class="form-row">
        <label
          ><span class="field-label">Системный ключ</span
          ><input
            v-model="planKey"
            :readonly="policy?.plans.some((plan) => plan.key === planKey)"
            maxlength="100"
          /><small>Короткий уникальный код, например PREMIUM.</small></label
        ><label
          ><span class="field-label">Название</span><input v-model="planName" maxlength="160"
        /></label>
      </div>
      <div class="form-row">
        <label
          ><span class="field-label">Лимит в долларах</span
          ><input v-model="amount" inputmode="decimal" @input="amountEdited = true" /></label
        ><label
          ><span class="field-label">Период лимита</span
          ><select v-model="period">
            <option value="DAY">День</option>
            <option value="MONTH">Месяц</option>
          </select></label
        >
      </div>
      <label
        ><span class="field-label"
          >Максимум расходов в день <span class="optional">необязательно</span></span
        ><input v-model="dailyCap" inputmode="decimal" @input="dailyCapEdited = true" /><small
          >Оставьте пустым, если достаточно общей суммы.</small
        ></label
      >
      <details class="form-accordion">
        <summary>
          <span
            ><strong>Исключения для типов AI-операций</strong
            ><small>По умолчанию все операции используют обычные правила варианта.</small></span
          >
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </summary>
        <div class="accordion-content category-exceptions">
          <p>
            Добавляйте исключения только там, где расходы нужно учитывать иначе. Не более двух
            исключений.
          </p>
          <p v-if="preservedCategoryRules.length" class="legacy-rule-note">
            Старые исключения ({{ preservedCategoryRules.length }}) сохранятся без изменений и не
            займут новые слоты.
          </p>
          <div
            v-for="(rule, index) in categoryRules"
            :key="index"
            class="category-rule"
            data-testid="category-rule"
          >
            <label>
              <span class="field-label">Тип операции</span>
              <Select
                :model-value="rule.category"
                :options="[
                  {
                    value: rule.category,
                    label: allowanceCategoryLabel(rule.category),
                  },
                  ...categoryOptions,
                ]"
                option-label="label"
                option-value="value"
                fluid
                @update:model-value="changeRuleCategory(index, $event)"
              />
              <small>{{ CATEGORY_DESCRIPTIONS[rule.category] }}</small>
            </label>
            <label>
              <span class="field-label">Кто оплачивает</span>
              <select v-model="rule.responsibility">
                <option value="END_USER_ALLOWANCE">Из лимита пользователя</option>
                <option value="PROJECT_SPONSORED">Из бюджета проекта</option>
              </select>
            </label>
            <label>
              <span class="field-label"
                >Отдельный лимит в долларах <span class="optional">необязательно</span></span
              >
              <input v-model="rule.capUsd" inputmode="decimal" @input="rule.capEdited = true" />
            </label>
            <Button
              label="Удалить"
              icon="pi pi-trash"
              type="button"
              text
              severity="danger"
              @click="removeCategoryRule(index)"
            />
          </div>
          <Button
            data-testid="add-category-rule"
            label="Добавить исключение"
            icon="pi pi-plus"
            type="button"
            outlined
            :disabled="categoryRules.length >= MAX_CATEGORY_RULES || !categoryOptions.length"
            @click="addCategoryRule"
          />
        </div>
      </details>
      <label>
        <span class="field-label">Причина изменения <span aria-hidden="true">*</span></span>
        <textarea
          v-model="reason"
          rows="2"
          maxlength="500"
          placeholder="Например: добавили тариф для команды продаж"
          required
        />
        <small>Будет сохранена в истории изменений.</small>
      </label>
      <small v-if="formError" class="field-error" role="alert">{{ formError }}</small>
      <AiAllowanceReauthenticationAction
        :required="reauthenticationRequired"
        @fresh-login="emit('fresh-login')"
      />
      <Button
        v-if="configurationConflict"
        label="Загрузить актуальную версию"
        type="button"
        outlined
        severity="warn"
        :loading="conflictRefreshing"
        @click="refreshDraftVersion"
      />
      <footer>
        <Button label="Отмена" text type="button" @click="namedDialogOpen = false" /><Button
          label="Сохранить изменения"
          type="submit"
          :loading="saving"
        />
      </footer>
    </form>
  </Dialog>

  <Dialog
    v-model:visible="cohortDialogOpen"
    modal
    header="Назначить лимит группе пользователей"
    :style="{ width: 'min(700px, 96vw)' }"
  >
    <form class="allowance-form" @submit.prevent="saveCohort">
      <p class="form-intro">
        Выберите сегмент или уровень пользователей и вариант лимита, который будет для них
        действовать. Если подходит несколько назначений, применяется назначение с большим
        приоритетом.
      </p>
      <div class="form-row">
        <label
          >Группа<select v-model="cohortScope">
            <option value="SEGMENT">Сегмент</option>
            <option value="LEVEL">Уровень</option>
          </select></label
        >
        <SegmentSelect
          v-if="cohortScope === 'SEGMENT'"
          v-model="cohortId"
          :project-id="projectId"
          :disabled="saving"
        />
        <label v-else
          >Уровень<input v-model="cohortId" maxlength="100" placeholder="gold" /><small
            >Постоянный ID уровня</small
          ></label
        >
      </div>
      <label
        >Вариант лимита<select v-model="cohortPlanId">
          <option value="" disabled>Выберите вариант</option>
          <option
            v-for="plan in policy?.plans.filter((item) => item.status === 'ACTIVE')"
            :key="plan.id"
            :value="plan.id"
          >
            {{ plan.name }} ({{ plan.key }})
          </option>
        </select></label
      ><label
        >Приоритет<input v-model.number="cohortPriority" type="number" min="0" max="1000000"
      /></label>
      <div class="form-row">
        <label>С<input v-model="effectiveFrom" type="datetime-local" /></label
        ><label>До (необязательно)<input v-model="effectiveUntil" type="datetime-local" /></label>
      </div>
      <label>Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
      ><small v-if="formError" class="field-error" role="alert">{{ formError }}</small>
      <AiAllowanceReauthenticationAction
        :required="reauthenticationRequired"
        @fresh-login="emit('fresh-login')"
      />
      <Button
        v-if="configurationConflict"
        label="Загрузить актуальную версию"
        type="button"
        outlined
        severity="warn"
        :loading="conflictRefreshing"
        @click="refreshDraftVersion"
      />
      <footer>
        <Button label="Отмена" text type="button" @click="cohortDialogOpen = false" /><Button
          label="Назначить"
          type="submit"
          :loading="saving"
        />
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.heading-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.secondary-action {
  background: var(--surface-card);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.category-grid {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
}
.category-grid label {
  grid-template-columns: minmax(130px, 1fr) minmax(170px, 1.4fr) minmax(100px, 0.8fr);
  align-items: center;
}
.category-grid legend {
  padding: 0 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.allowance-panel,
.allowance-loading {
  display: grid;
  gap: 16px;
}
.allowance-loading {
  grid-template-columns: 1fr 1fr;
}
.allowance-heading,
.plans > header,
.plan-list article,
.allowance-form footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.allowance-heading {
  align-items: flex-start;
}
.allowance-heading h2,
.plans h3 {
  margin: 3px 0 0;
  font-weight: 600;
}
.allowance-heading p,
.plans p {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.gate-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--status-warning) 40%, var(--border-default));
  border-radius: 11px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 0.8125rem;
  line-height: 1.45;
}
.gate-warning > i {
  margin-top: 2px;
}
.gate-warning > div {
  display: grid;
  gap: 3px;
}
.gate-warning strong {
  font-weight: 600;
}
.gate-warning.emergency {
  border-color: color-mix(in srgb, var(--status-danger) 40%, var(--border-default));
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.policy-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.policy-grid article {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 132px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
.policy-grid small,
.policy-grid span,
.plan-list small {
  color: var(--text-small-muted);
}
.policy-grid strong {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.mode-badge {
  width: max-content;
  padding: 5px 8px;
  border-radius: 999px;
  background: var(--action-soft);
  color: var(--action-primary);
  font-size: 0.72rem;
}
.plans {
  display: grid;
  gap: 14px;
  padding: 20px;
}
.plan-list {
  display: grid;
}
.plan-list article {
  padding: 13px 0;
  border-top: 1px solid var(--border-subtle);
}
.plan-list article > div {
  display: grid;
  gap: 4px;
}
.plan-list strong {
  font-weight: 600;
}
.plan-list article > div:last-child {
  text-align: right;
}
:global(.allowance-dialog .p-dialog-title) {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.3;
}
:global(.allowance-dialog .p-dialog-header) {
  padding: 24px 24px 18px;
}
:global(.allowance-dialog .p-dialog-content) {
  padding: 0 24px 24px;
}
.allowance-form {
  display: grid;
  gap: 24px;
  padding-top: 2px;
}
.allowance-form label {
  display: grid;
  align-content: start;
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 400;
}
.allowance-form input,
.allowance-form select,
.allowance-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.25;
}
.allowance-form textarea {
  min-height: 72px;
  padding-block: 10px;
  line-height: 1.45;
  resize: vertical;
}
.allowance-form :deep(.p-select) {
  height: 44px;
  min-height: 44px;
  border-color: var(--border-default);
  border-radius: 10px;
  box-shadow: none;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 400;
}
.allowance-form :deep(.p-select-label) {
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.25;
}
.allowance-form :deep(.p-select-dropdown) {
  width: 42px;
  color: var(--text-small-muted);
}
.allowance-form small {
  color: var(--text-small-muted);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
}
.form-intro {
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
}
.primary-limit-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--action-primary) 24%, var(--border-default));
  border-radius: 14px;
  background: color-mix(in srgb, var(--action-primary) 6%, var(--surface-card));
  box-shadow: inset 3px 0 0 var(--action-primary);
}
.primary-limit-copy {
  display: grid;
  gap: 4px;
}
.primary-limit-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.35;
}
.primary-limit-copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.4;
}
.primary-limit-card .compact-money-input {
  flex: 0 0 200px;
  width: 200px;
  max-width: 200px;
  height: 52px;
}
.primary-limit-card .compact-money-input input {
  height: 52px;
  min-height: 52px;
  font-size: 1.125rem;
  font-weight: 500;
}
.primary-limit-card .compact-money-input > span {
  font-size: 1rem;
  font-weight: 500;
}
.field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.35;
}
.help-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-small-muted);
  cursor: help;
  line-height: 1;
  vertical-align: middle;
}
.help-tip .pi {
  display: block;
  width: 16px;
  height: 16px;
  font-size: 16px;
  line-height: 16px;
}
.input-with-suffix {
  display: flex;
  align-items: stretch;
  height: 44px;
}
.input-with-suffix input {
  height: 44px;
  min-height: 44px;
  border-radius: 10px 0 0 10px;
}
.input-with-suffix > span {
  display: grid;
  place-items: center;
  min-width: 42px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-left: 0;
  border-radius: 0 10px 10px 0;
  background: var(--surface-subtle);
  color: var(--text-small-muted);
  font-size: 0.875rem;
  font-weight: 400;
}
.compact-money-input {
  max-width: 160px;
}
.mode-picker {
  display: grid;
  gap: 12px;
  margin: 8px 0 0;
  padding: 0;
  border: 0;
}
.mode-picker legend {
  margin: 0 0 8px;
  padding: 0;
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.35;
}
.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mode-option {
  grid-template-columns: auto 1fr;
  align-items: start;
  min-height: 92px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  cursor: pointer;
}
.mode-option.selected {
  border-color: var(--action-primary);
  background: var(--action-soft);
}
.mode-option:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}
.mode-option input,
.checkbox-card input {
  width: 17px;
  height: 17px;
  min-height: 17px;
  margin: 1px 0 0;
}
.mode-option span,
.checkbox-card span,
.visibility-toggle span {
  display: grid;
  gap: 4px;
}
.mode-option strong,
.checkbox-card strong,
.visibility-toggle strong {
  font-weight: 500;
}
.form-accordion {
  overflow: clip;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-card);
}
.form-accordion summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  cursor: pointer;
  list-style: none;
}
.form-accordion summary::-webkit-details-marker {
  display: none;
}
.form-accordion summary > span {
  display: grid;
  gap: 4px;
}
.form-accordion summary strong {
  font-size: 0.78rem;
  font-weight: 500;
}
.form-accordion summary small {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.form-accordion summary i {
  color: var(--text-small-muted);
  transition: transform 0.18s ease;
}
.form-accordion[open] summary i {
  transform: rotate(180deg);
}
.accordion-content {
  display: grid;
  gap: 14px;
  padding: 0 16px 16px;
  border-top: 1px solid var(--border-subtle);
}
.checkbox-card {
  grid-template-columns: auto 1fr;
  align-items: start;
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
.allowance-translation-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--action-soft);
}
.allowance-translation-toolbar > span {
  display: grid;
  gap: 3px;
}
.allowance-translation-toolbar strong {
  font-size: 0.78rem;
  font-weight: 650;
}
.allowance-translation-toolbar small {
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.45;
}
.category-exceptions > p {
  margin: 14px 0 0;
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.5;
}
.category-rule {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.category-rule > label:nth-child(3) {
  grid-column: 1 / -1;
}
.category-rule > button {
  justify-self: start;
}
.optional {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 400;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 16px;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 24px 16px;
}
.hard-confirm {
  display: flex !important;
  align-items: center;
  margin-top: 10px;
}
.hard-confirm input {
  width: auto;
}
.visibility-toggle {
  grid-template-columns: auto 1fr;
  align-items: start;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.visibility-toggle input {
  width: auto;
  min-height: auto;
  margin-top: 2px;
}
.field-error {
  color: var(--status-danger-text) !important;
}
.eyebrow {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.empty-state {
  text-align: center;
  color: var(--text-small-muted);
}
@media (max-width: 900px) {
  .policy-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  :global(.allowance-dialog .p-dialog-header) {
    padding: 20px 18px 16px;
  }
  :global(.allowance-dialog .p-dialog-content) {
    padding: 0 18px 20px;
  }
  .allowance-loading,
  .policy-grid,
  .form-row,
  .settings-grid,
  .mode-options,
  .category-rule {
    grid-template-columns: 1fr;
  }
  .allowance-form {
    gap: 20px;
  }
  .allowance-translation-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .mode-picker {
    margin-top: 6px;
  }
  .mode-option {
    min-height: auto;
  }
  .primary-limit-card {
    display: grid;
    align-items: start;
    gap: 14px;
    padding: 16px;
  }
  .primary-limit-card .compact-money-input {
    width: 180px;
    max-width: 100%;
  }
  .category-rule > label:nth-child(3) {
    grid-column: auto;
  }
  .allowance-heading,
  .plans > header,
  .plan-list article {
    align-items: stretch;
    flex-direction: column;
  }
  .allowance-heading > .heading-actions {
    display: grid;
    width: 100%;
  }
  .allowance-heading > .heading-actions :deep(.p-button) {
    width: 100%;
  }
  .plan-list article > div:last-child {
    text-align: left;
  }
}
</style>
