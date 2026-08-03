<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { ApiError } from "@/shared/api/http/api-error";
import {
  compareDecimalStrings,
  formatDecimalMoney,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import AiAllowanceAccrualRulesPanel from "./AiAllowanceAccrualRulesPanel.vue";
import AiAllowanceAccrualReceiptsPanel from "./AiAllowanceAccrualReceiptsPanel.vue";
import AiAllowanceDirectGrantPanel from "./AiAllowanceDirectGrantPanel.vue";
import {
  AI_ALLOWANCE_CATEGORIES,
  parseAllowanceUsd,
  type AiAllowanceEnforcementMode,
  type AiAllowanceLocalizedContent,
  type AiAllowanceLowThresholdMode,
  type AiAllowancePeriodKind,
  type AiAllowanceProjectPolicyView,
} from "../model/ai-allowance";

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
const policy = ref<AiAllowanceProjectPolicyView | null>(null);
const loading = ref(false);
const saving = ref(false);
const plansLoading = ref(false);
const revisionLoadingKey = ref("");
const error = ref("");
const loadedProjectId = ref("");
const dialogOpen = ref(false);
const amount = ref("");
const period = ref<AiAllowancePeriodKind>("DAY");
const timezone = ref("UTC");
const enforcement = ref<AiAllowanceEnforcementMode>("SOFT");
const reason = ref("");
const idempotencyKey = ref("");
const hardConfirmed = ref(false);
const showEndUserExactUsd = ref(false);
const lowThresholdMode = ref<AiAllowanceLowThresholdMode>("PERCENT");
const lowThresholdValue = ref("10");
const formError = ref("");
const editingProjectPolicyVersion = ref("");
const configurationConflict = ref(false);
const conflictRefreshing = ref(false);
const namedDialogOpen = ref(false);
const cohortDialogOpen = ref(false);
const planKey = ref("");
const planName = ref("");
const dailyCap = ref("");
const warningVariants = ref<Record<string, string>>({});
const warningMessage = ref("");
const exhaustedVariants = ref<Record<string, string>>({});
const exhaustedMessage = ref("");
const clearWarningContent = ref(false);
const clearExhaustedContent = ref(false);
const cohortScope = ref<"SEGMENT" | "LEVEL">("SEGMENT");
const cohortId = ref("");
const cohortPlanId = ref("");
const cohortPriority = ref(100);
const effectiveFrom = ref("");
const effectiveUntil = ref("");
const categories = AI_ALLOWANCE_CATEGORIES;
const messageLocales = computed(() => {
  const configured = (
    policy.value?.localization.supportedLocales ??
    props.supportedLocales ??
    []
  )
    .map((locale) => locale.trim())
    .filter(Boolean);
  const defaultLocale =
    policy.value?.localization.defaultLocale ?? props.defaultLocale;
  const existing = [
    ...localizedContentLocales(policy.value?.policy?.warningContent),
    ...localizedContentLocales(policy.value?.policy?.exhaustedContent),
  ];
  const candidates = [
    ...(defaultLocale ? [defaultLocale] : []),
    ...configured,
    ...existing,
  ];
  return [...new Set(candidates.length ? candidates : ["ru", "en"])];
});
const categoryRules = ref(
  categories.map((category) => ({
    category,
    responsibility: (category === "AI_REVIEW" ||
    category === "AI_ANALYSIS" ||
    category === "CMS_AGENT" ||
    category === "PROJECT_OVERHEAD"
      ? "PROJECT_SPONSORED"
      : "END_USER_ALLOWANCE") as "END_USER_ALLOWANCE" | "PROJECT_SPONSORED",
    capUsd: "",
  })),
);
let generation = 0;

const latestDefaultPlan = computed(
  () =>
    policy.value?.plans.find(
      (plan) => plan.id === policy.value?.defaultAssignment?.planId,
    ) ?? null,
);
const latestDefaultRevision = computed(
  () => latestDefaultPlan.value?.revisions[0] ?? null,
);
const canActivateHard = computed(
  () =>
    Boolean(policy.value?.runtimeGates.hardEnforcementApproved) &&
    !policy.value?.runtimeGates.emergencyDisabled,
);
const policyReady = computed(
  () => loadedProjectId.value === props.projectId && Boolean(policy.value),
);
const lowThresholdDisplay = computed(() => {
  const configured = policy.value?.policy;
  if (!configured) return "Не задан";
  return configured.lowThresholdMode === "ABSOLUTE_USD"
    ? formatMoney(configured.lowThresholdValue)
    : `${compactDecimal(configured.lowThresholdValue)}% от базового лимита`;
});

watch(
  () => [props.projectId, props.canRead] as const,
  ([, canRead]) => {
    generation += 1;
    policy.value = null;
    loadedProjectId.value = "";
    plansLoading.value = false;
    revisionLoadingKey.value = "";
    dialogOpen.value = false;
    namedDialogOpen.value = false;
    cohortDialogOpen.value = false;
    editingProjectPolicyVersion.value = "";
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
    if (canManage) return;
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
  error.value = "";
  try {
    const next = await aiAllowanceRepository.projectPolicy(requestProjectId);
    const hydrated = await hydrateDefaultPlan(requestProjectId, next);
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    ) {
      policy.value = hydrated;
      loadedProjectId.value = requestProjectId;
    }
  } catch (cause) {
    if (requestGeneration === generation)
      error.value = message(cause, "Не удалось загрузить политику лимитов");
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function hydrateDefaultPlan(
  projectId: string,
  view: AiAllowanceProjectPolicyView,
): Promise<AiAllowanceProjectPolicyView> {
  const assignment = view.defaultAssignment;
  if (!assignment || view.plans.some((plan) => plan.id === assignment.planId))
    return view;
  const page = await aiAllowanceRepository.planRevisions(projectId, "DEFAULT", {
    limit: 1,
  });
  if (
    page.projectPolicyVersion !== view.projectPolicyVersion ||
    page.plan.id !== assignment.planId
  )
    throw new Error("Default allowance plan changed while it was loading");
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

function contentSummary(content: AiAllowanceLocalizedContent): string {
  const localized = messageLocales.value
    .map((locale) => {
      const text = localizedContentVariant(content, locale);
      return text ? `${locale.toUpperCase()}: ${text}` : "";
    })
    .filter(Boolean);
  const variants = [
    content.message ? `Fallback: ${content.message}` : "",
    ...localized,
  ].filter(Boolean);
  return variants.join(" · ") || "Системный текст";
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
      const plansById = new Map(
        [...current.plans, ...next.plans].map((plan) => [plan.id, plan]),
      );
      policy.value = {
        ...current,
        plans: [...plansById.values()],
        plansPageInfo: next.plansPageInfo,
      };
    }
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      error.value = message(cause, "Не удалось загрузить остальные планы");
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      plansLoading.value = false;
  }
}
async function loadMoreRevisions(
  plan: AiAllowanceProjectPolicyView["plans"][number],
): Promise<void> {
  const cursor = plan.revisionsPageInfo.nextCursor;
  const current = policy.value;
  if (!current || !policyReady.value || !cursor || revisionLoadingKey.value)
    return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  revisionLoadingKey.value = plan.key;
  try {
    const page = await aiAllowanceRepository.planRevisions(
      requestProjectId,
      plan.key,
      { limit: 25, cursor },
    );
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      loadedProjectId.value === requestProjectId &&
      policy.value === current
    ) {
      if (page.projectPolicyVersion !== current.projectPolicyVersion) {
        revisionLoadingKey.value = "";
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
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      error.value = message(cause, "Не удалось загрузить историю ревизий");
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      revisionLoadingKey.value = "";
  }
}

function openEditor(): void {
  if (!props.canManage) return;
  if (!policyReady.value || !policy.value) return;
  editingProjectPolicyVersion.value = policy.value.projectPolicyVersion;
  const revision = latestDefaultRevision.value;
  amount.value = revision?.recurringAmountUsd ?? "";
  period.value = revision?.periodKind ?? "DAY";
  timezone.value = policy.value?.policy?.timezone ?? "UTC";
  enforcement.value = policy.value?.policy?.enforcementMode ?? "SOFT";
  reason.value = "";
  idempotencyKey.value = newIdempotencyKey();
  hardConfirmed.value = false;
  showEndUserExactUsd.value =
    policy.value?.policy?.showEndUserExactUsd ?? false;
  lowThresholdMode.value = policy.value?.policy?.lowThresholdMode ?? "PERCENT";
  lowThresholdValue.value =
    policy.value?.policy?.lowThresholdValue ?? "10.000000000000";
  formError.value = "";
  configurationConflict.value = false;
  dialogOpen.value = true;
  warningVariants.value = draftLocalizedVariants(
    policy.value?.policy?.warningContent,
  );
  warningMessage.value = policy.value?.policy?.warningContent.message ?? "";
  exhaustedVariants.value = draftLocalizedVariants(
    policy.value?.policy?.exhaustedContent,
  );
  exhaustedMessage.value = policy.value?.policy?.exhaustedContent.message ?? "";
  clearWarningContent.value = false;
  clearExhaustedContent.value = false;
  categoryRules.value = draftCategoryRules(revision);
}

function openNamedEditor(
  plan?: AiAllowanceProjectPolicyView["plans"][number],
): void {
  if (!props.canManage) return;
  if (!policyReady.value || !policy.value) return;
  editingProjectPolicyVersion.value = policy.value.projectPolicyVersion;
  const revision = plan?.revisions[0];
  planKey.value = plan?.key ?? "";
  planName.value = plan?.name ?? "";
  amount.value = revision?.recurringAmountUsd ?? "";
  period.value = revision?.periodKind ?? "MONTH";
  dailyCap.value = revision?.dailyCapUsd ?? "";
  reason.value = "";
  idempotencyKey.value = newIdempotencyKey();
  formError.value = "";
  configurationConflict.value = false;
  categoryRules.value = draftCategoryRules(revision);
  namedDialogOpen.value = true;
}
function draftCategoryRules(
  revision?:
    AiAllowanceProjectPolicyView["plans"][number]["revisions"][number] | null,
) {
  return categories.map((category) => {
    const existing = revision?.categoryRules.find(
      (rule) => rule.category === category,
    );
    return {
      category,
      responsibility:
        existing?.responsibility ??
        (category === "AI_REVIEW" ||
        category === "AI_ANALYSIS" ||
        category === "CMS_AGENT" ||
        category === "PROJECT_OVERHEAD"
          ? "PROJECT_SPONSORED"
          : "END_USER_ALLOWANCE"),
      capUsd: existing?.capUsd ?? "",
    };
  });
}
function openCohortEditor(): void {
  if (!props.canManage || !policyReady.value || !policy.value) return;
  editingProjectPolicyVersion.value = policy.value.projectPolicyVersion;
  cohortScope.value = "SEGMENT";
  cohortId.value = "";
  cohortPlanId.value =
    policy.value?.plans.find((plan) => plan.status === "ACTIVE")?.id ?? "";
  cohortPriority.value = 100;
  effectiveFrom.value = localInput(new Date());
  effectiveUntil.value = "";
  reason.value = "";
  idempotencyKey.value = newIdempotencyKey();
  formError.value = "";
  configurationConflict.value = false;
  cohortDialogOpen.value = true;
}

async function save(): Promise<void> {
  if (!props.canManage) return fail("Операция больше недоступна.");
  if (!editingProjectPolicyVersion.value)
    return fail("Сначала загрузите актуальную конфигурацию проекта.");
  const exactAmount = parseAllowanceUsd(amount.value.trim());
  if (!exactAmount || compareDecimalStrings(exactAmount, "0") < 0)
    return fail(
      "Сумма должна быть неотрицательной decimal-строкой (до 12 знаков после точки).",
    );
  if (!validTimezone(timezone.value.trim()))
    return fail("Укажите корректный IANA timezone длиной до 100 символов.");
  const exactLowThreshold = parseAllowanceUsd(lowThresholdValue.value.trim());
  if (
    !exactLowThreshold ||
    compareDecimalStrings(exactLowThreshold, "0") <= 0 ||
    (lowThresholdMode.value === "PERCENT" &&
      compareDecimalStrings(exactLowThreshold, "100") > 0)
  )
    return fail(
      lowThresholdMode.value === "PERCENT"
        ? "Порог LOW должен быть больше 0 и не больше 100 процентов."
        : "Порог LOW должен быть положительной суммой USD (до 12 знаков после точки).",
    );
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return fail("Причина должна содержать от 3 до 500 символов.");
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128)
    return fail("Укажите Idempotency-Key длиной до 128 символов.");
  if (enforcement.value === "HARD" && !canActivateHard.value)
    return fail("HARD заблокирован runtime gate проекта.");
  if (enforcement.value === "HARD" && !hardConfirmed.value)
    return fail("Подтвердите риски HARD enforcement.");
  const rules = categoryRules.value.map((rule) => ({
    category: rule.category,
    responsibility: rule.responsibility,
    ...(rule.capUsd.trim()
      ? { capUsd: parseAllowanceUsd(rule.capUsd.trim()) }
      : {}),
  }));
  if (
    rules.some(
      (rule) =>
        "capUsd" in rule &&
        (!rule.capUsd || compareDecimalStrings(rule.capUsd, "0") <= 0),
    )
  )
    return fail("Cap категории должен быть больше 0 USD или оставаться пустым.");
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  saving.value = true;
  formError.value = "";
  configurationConflict.value = false;
  try {
    const result = await aiAllowanceRepository.putDefaultPlan(
      requestProjectId,
      {
        expectedProjectPolicyVersion: editingProjectPolicyVersion.value,
        amountUsd: exactAmount,
        period: period.value,
        timezone: timezone.value.trim(),
        enforcementMode: enforcement.value,
        lowThresholdMode: lowThresholdMode.value,
        lowThresholdValue: exactLowThreshold,
        showEndUserExactUsd: showEndUserExactUsd.value,
        categoryRules: rules as never,
        reason: reason.value.trim(),
        ...(clearWarningContent.value
          ? { clearWarningContent: true }
          : compactContent(warningMessage.value, warningVariants.value)
            ? {
                warningContent: compactContent(
                  warningMessage.value,
                  warningVariants.value,
                ),
              }
            : {}),
        ...(clearExhaustedContent.value
          ? { clearExhaustedContent: true }
          : compactContent(exhaustedMessage.value, exhaustedVariants.value)
            ? {
                exhaustedContent: compactContent(
                  exhaustedMessage.value,
                  exhaustedVariants.value,
                ),
              }
            : {}),
      },
      idempotencyKey.value.trim(),
    );
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    acceptProjectPolicyVersion(result.projectPolicyVersion);
    dialogOpen.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    ) {
      configurationConflict.value = isConfigurationConflict(cause);
      formError.value = mutationMessage(
        cause,
        "Не удалось сохранить политику лимитов",
      );
    }
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      saving.value = false;
  }
}

async function saveNamed(): Promise<void> {
  if (!props.canManage) return fail("Операция больше недоступна.");
  if (!editingProjectPolicyVersion.value)
    return fail("Сначала загрузите актуальную конфигурацию проекта.");
  const key = planKey.value.trim().toUpperCase();
  const exact = parseAllowanceUsd(amount.value.trim());
  const cap = dailyCap.value.trim()
    ? parseAllowanceUsd(dailyCap.value.trim())
    : undefined;
  if (!/^[A-Z][A-Z0-9_-]{0,99}$/.test(key) || key === "DEFAULT")
    return fail(
      "Ключ: A-Z, 0-9, _ или -, до 100 символов; DEFAULT зарезервирован.",
    );
  if (
    planName.value.trim().length < 1 ||
    planName.value.trim().length > 160 ||
    !exact
  )
    return fail("Проверьте название и сумму плана.");
  if (
    dailyCap.value &&
    (!cap || compareDecimalStrings(cap, "0") <= 0)
  )
    return fail("Дневной cap должен быть больше 0 USD.");
  if (period.value === "DAY" && cap && compareDecimalStrings(cap, exact) > 0)
    return fail("Для дневного плана cap не может превышать лимит.");
  if (!validCommon()) return;
  const rules = categoryRules.value.map((rule) => ({
    category: rule.category,
    responsibility: rule.responsibility,
    ...(rule.capUsd.trim()
      ? { capUsd: parseAllowanceUsd(rule.capUsd.trim()) }
      : {}),
  }));
  if (
    rules.some(
      (rule) =>
        "capUsd" in rule &&
        (!rule.capUsd || compareDecimalStrings(rule.capUsd, "0") <= 0),
    )
  )
    return fail("Cap категории должен быть больше 0 USD или оставаться пустым.");
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  saving.value = true;
  configurationConflict.value = false;
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
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    acceptProjectPolicyVersion(result.projectPolicyVersion);
    namedDialogOpen.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    ) {
      configurationConflict.value = isConfigurationConflict(cause);
      formError.value = mutationMessage(cause, "Не удалось сохранить план");
    }
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      saving.value = false;
  }
}
async function saveCohort(): Promise<void> {
  if (!props.canManage) return fail("Операция больше недоступна.");
  if (!editingProjectPolicyVersion.value)
    return fail("Сначала загрузите актуальную конфигурацию проекта.");
  const id = cohortId.value.trim().toLowerCase();
  const from = localIso(effectiveFrom.value);
  const until = effectiveUntil.value
    ? localIso(effectiveUntil.value)
    : undefined;
  const validCohortId =
    cohortScope.value === "SEGMENT"
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        )
      : /^[a-z0-9][a-z0-9._-]{0,99}$/.test(id);
  if (!validCohortId)
    return fail(
      cohortScope.value === "SEGMENT"
        ? "Для SEGMENT укажите UUID опубликованного сегмента."
        : "Некорректный ID уровня.",
    );
  if (
    !cohortPlanId.value ||
    !Number.isSafeInteger(cohortPriority.value) ||
    cohortPriority.value < 0 ||
    cohortPriority.value > 1_000_000 ||
    !from ||
    (effectiveUntil.value && (!until || from >= until))
  )
    return fail("Проверьте план, приоритет и период назначения.");
  if (!validCommon()) return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  saving.value = true;
  configurationConflict.value = false;
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
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    acceptProjectPolicyVersion(result.projectPolicyVersion);
    cohortDialogOpen.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    ) {
      configurationConflict.value = isConfigurationConflict(cause);
      formError.value = mutationMessage(
        cause,
        "Не удалось назначить план когорте",
      );
    }
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      saving.value = false;
  }
}
function validCommon(): boolean {
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500) {
    fail("Причина должна содержать от 3 до 500 символов.");
    return false;
  }
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128) {
    fail("Некорректный Idempotency-Key.");
    return false;
  }
  return true;
}
function compactContent(message: string, variants: Record<string, string>) {
  const normalized = Object.fromEntries(
    Object.entries(variants)
      .map(([locale, text]) => [locale, text.trim()])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const additionalVariants = Object.fromEntries(
    Object.entries(normalized).filter(
      ([locale]) => locale !== "ru" && locale !== "en",
    ),
  );
  const content = {
    ...(message.trim() ? { message: message.trim() } : {}),
    ...(normalized.ru ? { ru: normalized.ru } : {}),
    ...(normalized.en ? { en: normalized.en } : {}),
    ...(Object.keys(additionalVariants).length
      ? { variants: additionalVariants }
      : {}),
  };
  return Object.keys(content).length ? content : undefined;
}
function localizedContentVariant(
  content: AiAllowanceLocalizedContent | undefined,
  locale: string,
): string {
  if (!content) return "";
  const direct = content[locale];
  if (typeof direct === "string") return direct;
  return content.variants?.[locale] ?? "";
}
function localizedContentLocales(
  content: AiAllowanceLocalizedContent | undefined,
): string[] {
  if (!content) return [];
  return [
    ...Object.keys(content.variants ?? {}),
    ...Object.keys(content).filter(
      (key) => key !== "message" && key !== "variants",
    ),
  ];
}
function draftLocalizedVariants(
  content: AiAllowanceLocalizedContent | undefined,
): Record<string, string> {
  return Object.fromEntries(
    messageLocales.value.map((locale) => [
      locale,
      localizedContentVariant(content, locale),
    ]),
  );
}
function localeFieldId(kind: "warning" | "exhausted", locale: string): string {
  return `allowance-${kind}-${locale.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
function localInput(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function localIso(value: string): string | undefined {
  const date = new Date(value);
  return value && Number.isFinite(date.valueOf())
    ? date.toISOString()
    : undefined;
}

function fail(value: string): void {
  formError.value = value;
}
function formatMoney(value: DecimalString): string {
  return formatDecimalMoney(value, "USD");
}
function compactDecimal(value: DecimalString): string {
  const [whole, fraction = ""] = value.split(".");
  const significantFraction = fraction.replace(/0+$/u, "");
  return significantFraction ? `${whole}.${significantFraction}` : whole!;
}
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `allowance-${Date.now()}`;
}
function validTimezone(value: string): boolean {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
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
    ? "Конфигурация лимитов уже изменилась. Форма сохранена — перезагрузите актуальную конфигурацию и повторите проверку."
    : message(cause, fallback);
}
function isConfigurationConflict(cause: unknown): boolean {
  return (
    cause instanceof ApiError &&
    cause.status === 409 &&
    cause.code === "AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT"
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
    formError.value = "";
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      formError.value = message(
        cause,
        "Не удалось загрузить актуальную конфигурацию",
      );
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
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
  <section
    class="allowance-panel"
    role="tabpanel"
    aria-labelledby="ai-cost-tab-limits"
  >
    <Message v-if="!canRead" severity="warn" :closable="false"
      >Нет права <code>project.ai_allowance.read</code>. Политика и балансы
      скрыты.</Message
    >
    <div v-if="!canRead && canManage" class="card direct-actions">
      <div>
        <h3>Операции управления</h3>
        <p>
          Для безопасного изменения нужен актуальный номер версии. Выдайте право
          чтения конфигурации или выполните операцию через API с проверенным
          OCC-токеном.
        </p>
      </div>
      <div class="heading-actions">
        <Button
          label="Настроить базовый план"
          icon="pi pi-pencil"
          disabled
          @click="openEditor"
        /><Button
          label="Создать named plan"
          outlined
          icon="pi pi-plus"
          disabled
          @click="openNamedEditor()"
        />
      </div>
    </div>
    <template>
      <div v-if="loading && !policy" class="allowance-loading">
        <Skeleton height="150px" /><Skeleton height="150px" />
      </div>
      <Message v-if="error" severity="error" :closable="false"
        ><span>{{ error }}</span
        ><Button label="Повторить" text size="small" @click="load"
      /></Message>
      <template v-if="policy">
        <div class="allowance-heading">
          <div>
            <span class="eyebrow">Project allowance policy</span>
            <h2>Общий лимит для всех пользователей</h2>
            <p>
              Лимиты расходов задают базовую AI-квоту в USD каждому
              пользователю проекта. Это внутренняя квота на потребление, не
              денежный кошелёк и не доступные к выводу средства.
            </p>
          </div>
          <div class="heading-actions">
            <Button
              v-if="canManage"
              :label="
                latestDefaultRevision
                  ? 'Изменить базовый план'
                  : 'Настроить общий лимит'
              "
              icon="pi pi-pencil"
              @click="openEditor"
            /><Button
              v-if="canManage"
              label="Новый план"
              outlined
              icon="pi pi-plus"
              @click="openNamedEditor()"
            /><Button
              v-if="canManage"
              label="Назначить когорте"
              outlined
              icon="pi pi-users"
              @click="openCohortEditor"
            />
          </div>
        </div>
        <Message
          v-if="policy.policy?.enforcementMode === 'HARD'"
          severity="error"
          :closable="false"
          >HARD enforcement активен: операции могут быть заблокированы при
          исчерпании квоты.</Message
        >
        <div
          v-if="policy.runtimeGates.emergencyDisabled"
          class="gate-warning emergency"
          role="alert"
        >
          <i class="pi pi-shield" aria-hidden="true" /><strong
            >Emergency disable активен.</strong
          >
          HARD нельзя включить или повторно сохранить до снятия аварийного
          флага.
        </div>
        <div
          v-else-if="!policy.runtimeGates.hardEnforcementApproved"
          class="gate-warning"
          role="status"
        >
          <i class="pi pi-shield" aria-hidden="true" /><strong
            >HARD enforcement не одобрен</strong
          >
          runtime-конфигурацией проекта.
        </div>
        <div class="runtime-gates" aria-label="Runtime gates HARD enforcement">
          <span :class="{ ready: policy.runtimeGates.hardEnforcementApproved }"
            >Approval:
            {{
              policy.runtimeGates.hardEnforcementApproved
                ? "разрешён"
                : "не выдан"
            }}</span
          >
          <span
            :class="{
              danger: policy.runtimeGates.emergencyDisabled,
              ready: !policy.runtimeGates.emergencyDisabled,
            }"
            >Emergency:
            {{
              policy.runtimeGates.emergencyDisabled
                ? "disable активен"
                : "норма"
            }}</span
          >
        </div>
        <div class="policy-grid">
          <article>
            <small>Режим</small
            ><strong class="mode-badge">{{
              policy.policy?.enforcementMode ?? "DISABLED"
            }}</strong
            ><span>Backend остаётся окончательной точкой enforcement.</span>
          </article>
          <article>
            <small>Базовый лимит</small
            ><strong>{{
              latestDefaultRevision
                ? formatMoney(latestDefaultRevision.recurringAmountUsd)
                : "Не задан"
            }}</strong
            ><span v-if="latestDefaultRevision">{{
              latestDefaultRevision.periodKind === "MONTH"
                ? "в месяц"
                : "в день"
            }}</span
            ><span v-else>Назначьте project default.</span>
            <span v-if="latestDefaultPlan"
              >{{ latestDefaultPlan.name }} · {{ latestDefaultPlan.key }}</span
            >
          </article>
          <article>
            <small>Часовой пояс</small
            ><strong>{{ policy.policy?.timezone ?? "UTC" }}</strong
            ><span>Определяет границы периода и сброса.</span>
          </article>
          <article>
            <small>Порог предупреждения LOW</small
            ><strong data-testid="allowance-low-threshold-summary">{{
              lowThresholdDisplay
            }}</strong
            ><span
              >При пересечении пользователь получит настроенное сообщение.</span
            >
          </article>
          <article>
            <small>Планы</small><strong>{{ policy.plans.length }}</strong
            ><span>{{
              policy.defaultAssignment
                ? "Есть назначение по умолчанию"
                : "Нет назначения по умолчанию"
            }}</span>
          </article>
          <article>
            <small>Точный остаток End User</small
            ><strong data-testid="allowance-exact-visibility-summary">{{
              policy.policy?.showEndUserExactUsd ? "Разрешён проектом" : "Скрыт"
            }}</strong
            ><span
              >Для показа также нужен deployment gate
              AI_ALLOWANCE_END_USER_EXACT_USD_VISIBLE=true.</span
            >
          </article>
          <article>
            <small>Сообщение LOW</small
            ><strong data-testid="allowance-warning-summary">{{
              contentSummary(policy.policy?.warningContent ?? {})
            }}</strong
            ><span>По locale пользователя, затем fallback.</span>
          </article>
          <article>
            <small>Сообщение при исчерпании</small
            ><strong data-testid="allowance-exhausted-summary">{{
              contentSummary(policy.policy?.exhaustedContent ?? {})
            }}</strong
            ><span>Возвращается пользователю при HARD-отказе.</span>
          </article>
        </div>
        <div v-if="latestDefaultRevision" class="plans card">
          <header>
            <div>
              <h3>Категории базового плана</h3>
              <p>
                Кто оплачивает категорию и какой cap закреплён в текущей
                ревизии.
              </p>
            </div>
          </header>
          <div class="plan-list">
            <article
              v-for="rule in latestDefaultRevision.categoryRules"
              :key="`summary-${rule.category}`"
            >
              <div>
                <strong>{{ rule.category }}</strong
                ><small>{{
                  rule.responsibility === "END_USER_ALLOWANCE"
                    ? "Квота пользователя"
                    : "Оплачивает проект"
                }}</small>
              </div>
              <strong>{{
                rule.capUsd ? formatMoney(rule.capUsd) : "Без cap"
              }}</strong>
            </article>
          </div>
        </div>
        <div class="plans card">
          <header>
            <div>
              <h3>Планы и ревизии</h3>
              <p>
                История не перезаписывается: изменение создаёт новую ревизию.
              </p>
            </div>
            <span v-if="canReconcile" class="permission-badge"
              >Право сверки выдано</span
            >
          </header>
          <div v-if="policy.plans.length" class="plan-list">
            <article v-for="plan in policy.plans" :key="plan.id">
              <div>
                <strong>{{ plan.name }}</strong
                ><small>{{ plan.key }} · {{ plan.status }}</small>
              </div>
              <div v-if="plan.revisions[0]">
                <strong
                  >{{ formatMoney(plan.revisions[0].recurringAmountUsd) }} /
                  {{
                    plan.revisions[0].periodKind === "DAY" ? "день" : "месяц"
                  }}</strong
                ><small
                  >ревизия {{ plan.revisions[0].revisionNumber }} · cap
                  {{
                    plan.revisions[0].dailyCapUsd
                      ? formatMoney(plan.revisions[0].dailyCapUsd)
                      : "нет"
                  }}</small
                >
              </div>
              <Button
                v-if="canManage && plan.key !== 'DEFAULT'"
                label="Новая ревизия"
                text
                size="small"
                @click="openNamedEditor(plan)"
              />
              <Button
                v-if="plan.revisionsPageInfo.hasMore"
                label="Старые ревизии"
                text
                size="small"
                :loading="revisionLoadingKey === plan.key"
                @click="loadMoreRevisions(plan)"
              />
            </article>
          </div>
          <Button
            v-if="policy.plansPageInfo.hasMore"
            label="Показать остальные планы"
            outlined
            :loading="plansLoading"
            @click="loadMorePlans"
          />
          <p v-if="!policy.plans.length" class="empty-state">
            Планы ещё не настроены.
          </p>
        </div>
      </template>
    </template>
    <AiAllowanceDirectGrantPanel v-if="canGrant" :project-id="projectId" />
    <AiAllowanceAccrualRulesPanel
      v-if="canReadAccrual || canManageAccrual"
      :project-id="projectId"
      :can-read="Boolean(canReadAccrual)"
      :can-manage="Boolean(canManageAccrual)"
    />
    <AiAllowanceAccrualReceiptsPanel
      v-if="canReadAccrualReceipts"
      :project-id="projectId"
    />
  </section>

  <Dialog
    v-model:visible="dialogOpen"
    modal
    header="Базовый план проекта"
    :style="{ width: 'min(680px, 94vw)' }"
  >
    <form class="allowance-form" @submit.prevent="save">
      <Message severity="warn" :closable="false"
        >Изменение влияет на новые периоды. Это квота AI, а не платёжный
        баланс.</Message
      >
      <label
        >Лимит, USD<input
          v-model="amount"
          inputmode="decimal"
          autocomplete="off"
      /></label>
      <div class="form-row">
        <label
          >Период<select v-model="period">
            <option value="DAY">День</option>
            <option value="MONTH">Месяц</option>
          </select></label
        ><label>Timezone<input v-model="timezone" autocomplete="off" /></label>
      </div>
      <div class="form-row">
        <label for="allowance-low-threshold-mode"
          >Порог LOW<select
            id="allowance-low-threshold-mode"
            v-model="lowThresholdMode"
          >
            <option value="PERCENT">Процент от базового лимита</option>
            <option value="ABSOLUTE_USD">Фиксированная сумма USD</option>
          </select></label
        ><label for="allowance-low-threshold-value"
          >Значение порога<input
            id="allowance-low-threshold-value"
            v-model="lowThresholdValue"
            inputmode="decimal"
            autocomplete="off"
          /><small>{{
            lowThresholdMode === "PERCENT"
              ? "Больше 0 и не больше 100."
              : "Положительная точная сумма USD."
          }}</small></label
        >
      </div>
      <label for="allowance-enforcement"
        >Enforcement<select id="allowance-enforcement" v-model="enforcement">
          <option value="DISABLED">DISABLED — только учёт</option>
          <option value="SHADOW">SHADOW — теневая проверка</option>
          <option value="SOFT">SOFT — предупреждение</option>
          <option value="HARD" :disabled="!canActivateHard">
            HARD — блокировка
          </option>
        </select></label
      >
      <fieldset class="category-grid">
        <legend>Ответственность и caps категорий базового плана</legend>
        <label v-for="rule in categoryRules" :key="`default-${rule.category}`"
          ><span>{{ rule.category }}</span
          ><select v-model="rule.responsibility">
            <option value="END_USER_ALLOWANCE">Квота пользователя</option>
            <option value="PROJECT_SPONSORED">Проект</option></select
          ><input
            v-model="rule.capUsd"
            inputmode="decimal"
            placeholder="cap USD"
        /></label>
      </fieldset>
      <div class="form-row">
        <label for="allowance-warning-fallback"
          >Fallback-сообщение<textarea
            id="allowance-warning-fallback"
            v-model="warningMessage"
            :disabled="clearWarningContent"
            rows="2"
            maxlength="2000"
          />
        </label>
        <label
          v-for="locale in messageLocales"
          :key="`warning-${locale}`"
          :for="localeFieldId('warning', locale)"
          >Предупреждение ({{ locale }})<textarea
            :id="localeFieldId('warning', locale)"
            v-model="warningVariants[locale]"
            :disabled="clearWarningContent"
            rows="2"
            maxlength="2000"
          />
        </label>
      </div>
      <label class="visibility-toggle" for="allowance-clear-warning-content">
        <input
          id="allowance-clear-warning-content"
          v-model="clearWarningContent"
          type="checkbox"
        />
        Сбросить предупреждение LOW на системный текст
      </label>
      <div class="form-row">
        <label for="allowance-exhausted-fallback"
          >Fallback при исчерпании<textarea
            id="allowance-exhausted-fallback"
            v-model="exhaustedMessage"
            :disabled="clearExhaustedContent"
            rows="2"
            maxlength="2000"
          />
        </label>
        <label
          v-for="locale in messageLocales"
          :key="`exhausted-${locale}`"
          :for="localeFieldId('exhausted', locale)"
          >Лимит исчерпан ({{ locale }})<textarea
            :id="localeFieldId('exhausted', locale)"
            v-model="exhaustedVariants[locale]"
            :disabled="clearExhaustedContent"
            rows="2"
            maxlength="2000"
          />
        </label>
      </div>
      <label class="visibility-toggle" for="allowance-clear-exhausted-content">
        <input
          id="allowance-clear-exhausted-content"
          v-model="clearExhaustedContent"
          type="checkbox"
        />
        Сбросить сообщение об исчерпании на системный текст
      </label>
      <Message
        v-if="enforcement === 'HARD' && canActivateHard"
        severity="error"
        :closable="false"
        >Runtime gates разрешают HARD. Backend повторно проверит их атомарно при
        сохранении.<label class="hard-confirm"
          ><input
            id="allowance-hard-confirmed"
            v-model="hardConfirmed"
            type="checkbox"
          />
          Я понимаю, что HARD может блокировать AI-операции</label
        ></Message
      >
      <Message v-else-if="!canActivateHard" severity="warn" :closable="false"
        >HARD недоступен:
        {{
          policy?.runtimeGates.emergencyDisabled
            ? "активен emergency disable"
            : "нет runtime approval"
        }}.</Message
      >
      <label class="visibility-toggle" for="show-end-user-exact-usd">
        <input
          id="show-end-user-exact-usd"
          v-model="showEndUserExactUsd"
          type="checkbox"
        />
        Показывать End User точную оставшуюся квоту в USD
        <small>
          Значение станет видимым только при включённом deployment gate.
          Проектная настройка сама по себе не раскрывает данные.
        </small>
      </label>
      <label
        >Причина<textarea v-model="reason" rows="3" maxlength="500" />
      </label>
      <label
        >Idempotency-Key<input
          v-model="idempotencyKey"
          autocomplete="off"
          maxlength="128"
        /><small
          >Сохраняется при повторной попытке; новый ключ создаётся при новом
          открытии формы.</small
        ></label
      >
      <small v-if="formError" class="field-error" role="alert">{{
        formError
      }}</small>
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
        <Button
          label="Отмена"
          text
          type="button"
          :disabled="saving"
          @click="dialogOpen = false"
        /><Button label="Сохранить ревизию" type="submit" :loading="saving" />
      </footer>
    </form>
  </Dialog>

  <Dialog
    v-model:visible="namedDialogOpen"
    modal
    header="Named allowance plan"
    :style="{ width: 'min(900px, 96vw)' }"
  >
    <form class="allowance-form" @submit.prevent="saveNamed">
      <Message severity="info" :closable="false"
        >Каждое сохранение создаёт неизменяемую ревизию. Архивирование планов
        backend пока не публикует.</Message
      >
      <div class="form-row">
        <label
          >Ключ<input
            v-model="planKey"
            :readonly="policy?.plans.some((plan) => plan.key === planKey)"
            maxlength="100" /></label
        ><label>Название<input v-model="planName" maxlength="160" /></label>
      </div>
      <div class="form-row">
        <label>Лимит, USD<input v-model="amount" inputmode="decimal" /></label
        ><label
          >Период<select v-model="period">
            <option value="DAY">День</option>
            <option value="MONTH">Месяц</option>
          </select></label
        >
      </div>
      <label
        >Дневной cap, USD (необязательно)<input
          v-model="dailyCap"
          inputmode="decimal"
      /></label>
      <fieldset class="category-grid">
        <legend>Ответственность и caps категорий</legend>
        <label v-for="rule in categoryRules" :key="rule.category"
          ><span>{{ rule.category }}</span
          ><select v-model="rule.responsibility">
            <option value="END_USER_ALLOWANCE">Квота пользователя</option>
            <option value="PROJECT_SPONSORED">Проект</option></select
          ><input
            v-model="rule.capUsd"
            inputmode="decimal"
            placeholder="cap USD"
        /></label>
      </fieldset>
      <label
        >Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
      ><label
        >Idempotency-Key<input
          v-model="idempotencyKey"
          maxlength="128" /></label
      ><small v-if="formError" class="field-error" role="alert">{{
        formError
      }}</small>
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
        <Button
          label="Отмена"
          text
          type="button"
          @click="namedDialogOpen = false"
        /><Button label="Сохранить ревизию" type="submit" :loading="saving" />
      </footer>
    </form>
  </Dialog>

  <Dialog
    v-model:visible="cohortDialogOpen"
    modal
    header="Назначение плана когорте"
    :style="{ width: 'min(700px, 96vw)' }"
  >
    <form class="allowance-form" @submit.prevent="saveCohort">
      <Message severity="info" :closable="false"
        >SEGMENT ссылается на UUID опубликованного сегмента, LEVEL — на
        стабильный внутренний ID уровня. Больший priority побеждает.</Message
      >
      <div class="form-row">
        <label
          >Тип<select v-model="cohortScope">
            <option value="SEGMENT">SEGMENT</option>
            <option value="LEVEL">LEVEL</option>
          </select></label
        ><label
          >ID когорты<input
            v-model="cohortId"
            maxlength="100"
            :placeholder="
              cohortScope === 'SEGMENT'
                ? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
                : 'gold'
            "
          /><small>{{
            cohortScope === "SEGMENT"
              ? "UUID опубликованного Segment"
              : "Стабильный ID уровня"
          }}</small></label
        >
      </div>
      <label
        >План<select v-model="cohortPlanId">
          <option value="" disabled>Выберите план</option>
          <option
            v-for="plan in policy?.plans.filter(
              (item) => item.status === 'ACTIVE',
            )"
            :key="plan.id"
            :value="plan.id"
          >
            {{ plan.name }} ({{ plan.key }})
          </option>
        </select></label
      ><label
        >Приоритет<input
          v-model.number="cohortPriority"
          type="number"
          min="0"
          max="1000000"
      /></label>
      <div class="form-row">
        <label>С<input v-model="effectiveFrom" type="datetime-local" /></label
        ><label
          >До (необязательно)<input
            v-model="effectiveUntil"
            type="datetime-local"
        /></label>
      </div>
      <label
        >Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
      ><label
        >Idempotency-Key<input
          v-model="idempotencyKey"
          maxlength="128" /></label
      ><small v-if="formError" class="field-error" role="alert">{{
        formError
      }}</small>
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
        <Button
          label="Отмена"
          text
          type="button"
          @click="cohortDialogOpen = false"
        /><Button label="Назначить" type="submit" :loading="saving" />
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.heading-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.category-grid {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
}
.category-grid label {
  grid-template-columns: minmax(130px, 1fr) minmax(170px, 1.4fr) minmax(
      100px,
      0.8fr
    );
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
.allowance-heading h2,
.plans h3 {
  margin: 3px 0 0;
}
.allowance-heading p,
.plans p {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.gate-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  border: 1px solid
    color-mix(in srgb, var(--status-warning) 40%, var(--border-default));
  border-radius: 11px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 0.73rem;
}
.gate-warning.emergency {
  border-color: color-mix(
    in srgb,
    var(--status-danger) 40%,
    var(--border-default)
  );
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.runtime-gates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.runtime-gates span {
  padding: 6px 9px;
  border-radius: 999px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 0.7rem;
  font-weight: 750;
}
.runtime-gates span.ready {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.runtime-gates span.danger {
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
  gap: 8px;
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
  font-size: 1.2rem;
  overflow-wrap: anywhere;
}
.mode-badge,
.permission-badge {
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
.plan-list article > div:last-child {
  text-align: right;
}
.allowance-form {
  display: grid;
  gap: 15px;
}
.allowance-form label {
  display: grid;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.allowance-form input,
.allowance-form select,
.allowance-form textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.allowance-form small {
  color: var(--text-small-muted);
  font-weight: 400;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
}
.visibility-toggle input {
  width: auto;
}
.visibility-toggle small {
  grid-column: 2;
}
.field-error {
  color: var(--status-danger-text) !important;
}
.eyebrow {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 800;
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
  .allowance-loading,
  .policy-grid,
  .form-row {
    grid-template-columns: 1fr;
  }
  .allowance-heading,
  .plans > header,
  .plan-list article {
    align-items: stretch;
    flex-direction: column;
  }
  .plan-list article > div:last-child {
    text-align: left;
  }
}
</style>
