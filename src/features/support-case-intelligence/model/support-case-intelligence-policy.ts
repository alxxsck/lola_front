import type {
  CaseIntelligenceAuthoringIssueDto,
  CaseIntelligenceBudgetPolicyDto,
  CaseIntelligenceCalibrationResponseDto,
  CaseIntelligenceCurrentResponseDto,
  CaseIntelligenceDetectionPolicyDto,
  CaseIntelligenceDetectionRuleDto,
  CaseIntelligenceTopicDto,
} from "@/shared/api/generated/models";

export type PolicyIssue = {
  path: string;
  message: string;
  severity: "ERROR" | "WARNING";
  code?: string;
  relatedPaths?: string[];
  source?: "LOCAL" | "SERVER";
};

export type CaseIntelligenceRuntimePresentation = {
  label: string;
  copy: string;
  tone: "success" | "warning" | "neutral";
};

export type CaseIntelligenceModelSetupNotice = {
  title: string;
  copy: string;
  action: string | null;
};

export function presentCaseIntelligenceModelSetup(
  catalogLoaded: boolean,
  profileCount: number,
  assignedRevisionId: string | null,
): CaseIntelligenceModelSetupNotice | null {
  if (!catalogLoaded) return null;
  if (profileCount === 0)
    return {
      title: "Проверка категорий пока недоступна",
      copy: "Настройки можно продолжать. Проверку и публикацию включит администратор платформы.",
      action: null,
    };
  if (!assignedRevisionId)
    return {
      title: "Выберите модель классификации",
      copy: "После выбора станут доступны проверка и публикация.",
      action: "Выбрать модель",
    };
  return null;
}

export function presentCaseIntelligenceRuntime(
  snapshot: CaseIntelligenceCurrentResponseDto | null,
): CaseIntelligenceRuntimePresentation {
  const activeDetectionRevisionId =
    snapshot?.release?.detectionPolicyRevisionId ?? null;
  const publishedDetection = snapshot?.detection?.published ?? null;
  if (!activeDetectionRevisionId)
    return {
      label: "Общая рабочая версия ещё не собрана",
      copy: publishedDetection
        ? "Правила категорий опубликованы и готовы войти в следующую общую рабочую версию. Сейчас они ещё не применяются к новым сообщениям."
        : "Создайте и опубликуйте первую версию правил категорий. Сервер применит её только в составе проверенной общей версии.",
      tone: "neutral",
    };
  const status = snapshot?.runtime?.status;
  if (status === "LIVE")
    return {
      label: "Правила применяются",
      copy: "Новые сообщения проверяются по правилам из общей рабочей версии. Черновик не влияет на работу операторов.",
      tone: "success",
    };
  if (status === "SAFETY_RECONCILING")
    return {
      label: "Обновляются меры безопасности",
      copy: "Сервер согласует обязательные правила безопасности. Изменить этот процесс в проекте нельзя.",
      tone: "warning",
    };
  if (status === "DEGRADED")
    return {
      label: "Проверка работает с ограничениями",
      copy: "Часть автоматических решений временно недоступна. Сервер использует безопасный режим.",
      tone: "warning",
    };
  if (status === "PAUSED" || status === "ROLLED_BACK")
    return {
      label: "Автоматическая проверка приостановлена",
      copy: "Общая рабочая версия сохранена, но новые сообщения сейчас не обрабатываются автоматически.",
      tone: "warning",
    };
  return {
    label: "Сервер проверяет общую рабочую версию",
    copy: "Настройки сохранены. Полное применение начнётся после обязательных серверных проверок.",
    tone: "neutral",
  };
}

export function createDefaultDetectionPolicy(): CaseIntelligenceDetectionPolicyDto {
  return {
    scope: "Определять тему обращения по сообщениям пользователя",
    locales: ["ru-RU"],
    channels: ["TEXT"],
    fallbackLocale: "ru-RU",
    audience: { include: [], exclude: [] },
    topics: [],
    rules: [],
    attachWindowMs: 86_400_000,
    reopenWindowMs: 604_800_000,
    candidateLimit: 5,
    confidenceTiers: { monitor: 0.5, suggest: 0.7, autoApply: 0.9 },
    ambiguityAction: "DEFER",
    routerContext: {
      maxSignals: 8,
      maxContextMessages: 12,
      maxCandidateCases: 5,
    },
    runtimeLimits: {
      maxRulesEvaluated: 20,
      maxSemanticStatements: 20,
      maxEvaluationMs: 500,
    },
    debounceMs: 1_500,
    modelProfileRevisionId: "default-router-model",
  };
}

export function createDefaultBudgetPolicy(): CaseIntelligenceBudgetPolicyDto {
  return {
    dailyTokenSoftCap: "1000000",
    dailyTokenHardCap: "1500000",
    dailyCostMicroUsdSoftCap: "5000000",
    dailyCostMicroUsdHardCap: "7500000",
    maxRunCostMicroUsd: "50000",
    costMicroUsdPerMillionTokens: "1000000",
    maxConcurrentRuns: 4,
    routeMaxEstimatedTokens: 2000,
  };
}

export function clonePolicy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function prepareDetectionPolicyForAuthoring(
  value: CaseIntelligenceDetectionPolicyDto,
): CaseIntelligenceDetectionPolicyDto {
  const defaults = createDefaultDetectionPolicy();
  const policy = clonePolicy(value);
  policy.runtimeLimits = {
    ...defaults.runtimeLimits,
    ...(policy.runtimeLimits ?? {}),
  };
  if (
    !Number.isInteger(policy.runtimeLimits.maxRulesEvaluated) ||
    policy.runtimeLimits.maxRulesEvaluated < 1
  ) {
    policy.runtimeLimits.maxRulesEvaluated =
      defaults.runtimeLimits.maxRulesEvaluated;
  }
  return policy;
}

export function createTopic(index: number): CaseIntelligenceTopicDto {
  return {
    code: `CATEGORY_${index}`,
    label: "",
    description: "",
    positiveExamples: [],
    negativeExamples: [],
  };
}

export function createRule(index: number): CaseIntelligenceDetectionRuleDto {
  return {
    action: "CREATE",
    code: `RULE_${index}`,
    kind: "PHRASE",
    phrase: "",
    priority: 100,
  };
}

export function normalizeStableCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "";
  return /^[A-Z]/.test(normalized)
    ? normalized.slice(0, 64)
    : `C_${normalized}`.slice(0, 64);
}

export function synchronizeProjectLocales(
  policy: CaseIntelligenceDetectionPolicyDto,
  supportedLocales: readonly string[],
  defaultLocale?: string,
): void {
  const locales = [...new Set(supportedLocales.filter(Boolean))];
  if (!locales.length) return;
  policy.locales = locales;
  policy.fallbackLocale =
    defaultLocale && locales.includes(defaultLocale)
      ? defaultLocale
      : locales[0]!;
}

function isStableCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value);
}

function scalarIssue(value: unknown): string {
  if (typeof value === "string")
    return value.trim() && value.trim().length <= 500
      ? ""
      : "Введите значение длиной до 500 знаков.";
  if (typeof value === "number")
    return Number.isFinite(value) ? "" : "Введите конечное число.";
  if (typeof value === "boolean") return "";
  if (!Array.isArray(value) || value.length === 0 || value.length > 50)
    return "Добавьте от 1 до 50 значений.";
  if (
    value.some(
      (item) =>
        typeof item !== "string" ||
        !item.trim() ||
        item.trim().length > 500,
    )
  )
    return "Каждое значение должно быть непустым и короче 500 знаков.";
  if (new Set(value.map((item) => item.trim())).size !== value.length)
    return "Удалите повторяющиеся значения.";
  return "";
}

function addDuplicateIssues(
  issues: PolicyIssue[],
  values: string[],
  path: string,
  label: string,
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return;
    if (seen.has(normalized)) {
      issues.push({
        path: `${path}.${index}.code`,
        message: `${label} с таким кодом уже существует.`,
        severity: "ERROR",
      });
    }
    seen.add(normalized);
  });
}

export function validateDetectionPolicy(
  policy: CaseIntelligenceDetectionPolicyDto,
): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const required = (condition: boolean, path: string, message: string) => {
    if (!condition) issues.push({ path, message, severity: "ERROR" });
  };

  required(Boolean(policy.scope.trim()), "scope", "Опишите назначение правил.");
  required(
    policy.scope.length <= 2000,
    "scope",
    "Назначение должно быть короче 2000 знаков.",
  );
  required(policy.locales.length > 0, "locales", "Добавьте хотя бы один язык.");
  required(policy.locales.length <= 20, "locales", "Можно указать не больше 20 языков.");
  required(
    policy.locales.every((locale) =>
      /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?$/.test(locale),
    ),
    "locales",
    "Используйте код языка вида ru-RU или en-US.",
  );
  required(
    new Set(policy.locales).size === policy.locales.length,
    "locales",
    "Удалите повторяющиеся языки.",
  );
  required(
    policy.locales.includes(policy.fallbackLocale),
    "fallbackLocale",
    "Основной язык должен быть в списке языков.",
  );
  required(
    policy.channels.length > 0,
    "channels",
    "Выберите хотя бы один канал.",
  );
  required(policy.channels.length <= 3, "channels", "Можно выбрать не больше трёх каналов.");
  required(
    new Set(policy.channels).size === policy.channels.length,
    "channels",
    "Удалите повторяющиеся каналы.",
  );
  required(policy.topics.length <= 50, "topics", "Можно создать не больше 50 категорий.");
  required(policy.rules.length <= 200, "rules", "Можно создать не больше 200 правил.");
  required(policy.fallbackLocale.length <= 35, "fallbackLocale", "Код языка должен быть короче 35 знаков.");
  required(
    Boolean(policy.modelProfileRevisionId.trim()),
    "modelProfileRevisionId",
    "Укажите версию модели маршрутизации.",
  );
  required(
    policy.modelProfileRevisionId.length <= 128,
    "modelProfileRevisionId",
    "Код версии модели должен быть короче 128 знаков.",
  );
  required(policy.attachWindowMs >= 60_000 && policy.attachWindowMs <= 365 * 86_400_000, "attachWindowMs", "Период привязки — от минуты до года.");
  required(policy.reopenWindowMs >= 60_000 && policy.reopenWindowMs <= 365 * 86_400_000, "reopenWindowMs", "Период повторного открытия — от минуты до года.");
  required(policy.candidateLimit >= 1 && policy.candidateLimit <= 20, "candidateLimit", "Укажите от 1 до 20 кандидатов.");
  required(policy.debounceMs >= 0 && policy.debounceMs <= 60_000, "debounceMs", "Пауза должна быть от 0 до 60 000 мс.");
  required(policy.routerContext.maxSignals >= 1 && policy.routerContext.maxSignals <= 8, "routerContext.maxSignals", "Укажите от 1 до 8 сигналов.");
  required(policy.routerContext.maxContextMessages >= 0 && policy.routerContext.maxContextMessages <= 50, "routerContext.maxContextMessages", "Укажите от 0 до 50 сообщений.");
  required(policy.routerContext.maxCandidateCases >= 0 && policy.routerContext.maxCandidateCases <= 20, "routerContext.maxCandidateCases", "Укажите от 0 до 20 обращений.");
  required(policy.runtimeLimits.maxRulesEvaluated >= 1 && policy.runtimeLimits.maxRulesEvaluated <= 20, "runtimeLimits.maxRulesEvaluated", "Лимит точных правил на одну проверку — от 1 до 20.");
  required(policy.runtimeLimits.maxSemanticStatements >= 0 && policy.runtimeLimits.maxSemanticStatements <= 50, "runtimeLimits.maxSemanticStatements", "Укажите от 0 до 50 смысловых признаков.");
  required(policy.runtimeLimits.maxEvaluationMs >= 1 && policy.runtimeLimits.maxEvaluationMs <= 5000, "runtimeLimits.maxEvaluationMs", "Укажите от 1 до 5000 мс.");
  for (const kind of ["include", "exclude"] as const) {
    required(policy.audience[kind].length <= 100, `audience.${kind}`, "Можно задать не больше 100 условий.");
    policy.audience[kind].forEach((predicate, index) => {
      required(isStableCode(predicate.attributeCode), `audience.${kind}.${index}.attributeCode`, "Код поля: латинские заглавные буквы, цифры и подчёркивание.");
      const valueIssue = scalarIssue(predicate.value);
      required(!valueIssue, `audience.${kind}.${index}.value`, valueIssue);
    });
  }

  addDuplicateIssues(
    issues,
    policy.topics.map((item) => item.code),
    "topics",
    "Категория",
  );
  addDuplicateIssues(
    issues,
    policy.rules.map((item) => item.code),
    "rules",
    "Правило",
  );

  policy.topics.forEach((topic, index) => {
    required(
      isStableCode(topic.code),
      `topics.${index}.code`,
      "Код: латинские заглавные буквы, цифры и подчёркивание.",
    );
    required(
      Boolean(topic.label.trim()),
      `topics.${index}.label`,
      "Введите короткое название категории.",
    );
    required(
      topic.label.trim().length <= 120,
      `topics.${index}.label`,
      "Название должно быть короче 120 знаков.",
    );
    required(
      Boolean(topic.description.trim()),
      `topics.${index}.description`,
      "Опишите категорию понятным языком.",
    );
    required(topic.description.length <= 1000, `topics.${index}.description`, "Описание должно быть короче 1000 знаков.");
    required(topic.positiveExamples.length <= 20, `topics.${index}.positiveExamples`, "Можно добавить не больше 20 примеров.");
    required(topic.negativeExamples.length <= 20, `topics.${index}.negativeExamples`, "Можно добавить не больше 20 исключений.");
    required(topic.positiveExamples.every((item) => Boolean(item.trim()) && item.trim().length <= 500), `topics.${index}.positiveExamples`, "Каждый пример должен быть непустым и короче 500 знаков.");
    required(topic.negativeExamples.every((item) => Boolean(item.trim()) && item.trim().length <= 500), `topics.${index}.negativeExamples`, "Каждое исключение должно быть непустым и короче 500 знаков.");
    required(
      new Set(topic.positiveExamples.map((item) => item.trim())).size ===
        topic.positiveExamples.length,
      `topics.${index}.positiveExamples`,
      "Удалите повторяющиеся подходящие примеры.",
    );
    required(
      new Set(topic.negativeExamples.map((item) => item.trim())).size ===
        topic.negativeExamples.length,
      `topics.${index}.negativeExamples`,
      "Удалите повторяющиеся исключения.",
    );
    if (topic.positiveExamples.length === 0) {
      issues.push({
        path: `topics.${index}.positiveExamples`,
        message: "Добавьте пример, который относится к категории.",
        severity: "WARNING",
      });
    }
  });

  policy.rules.forEach((rule, index) => {
    required(
      isStableCode(rule.code),
      `rules.${index}.code`,
      "Код: латинские заглавные буквы, цифры и подчёркивание.",
    );
    required(rule.priority >= 0 && rule.priority <= 10_000, `rules.${index}.priority`, "Порядок должен быть от 0 до 10 000.");
    required(!rule.locale || rule.locale.length <= 35, `rules.${index}.locale`, "Код языка должен быть короче 35 знаков.");
    if (rule.kind === "EXACT" || rule.kind === "PHRASE") {
      required(
        Boolean(rule.phrase?.trim()),
        `rules.${index}.phrase`,
        "Введите текст правила.",
      );
      required((rule.phrase?.length ?? 0) <= 500, `rules.${index}.phrase`, "Текст правила должен быть короче 500 знаков.");
    }
    if (rule.kind === "SEMANTIC_STATEMENT") {
      required(
        Boolean(rule.statement?.trim()),
        `rules.${index}.statement`,
        "Опишите смысл сообщения.",
      );
      required((rule.statement?.length ?? 0) <= 1000, `rules.${index}.statement`, "Описание смысла должно быть короче 1000 знаков.");
    }
    if (rule.kind === "ATTRIBUTE") {
      required(
        Boolean(rule.attributeCode?.trim()),
        `rules.${index}.attributeCode`,
        "Укажите поле профиля.",
      );
      required(isStableCode(rule.attributeCode ?? ""), `rules.${index}.attributeCode`, "Код поля: латинские заглавные буквы, цифры и подчёркивание.");
      required(
        Boolean(rule.operator),
        `rules.${index}.operator`,
        "Выберите условие сравнения.",
      );
      const valueIssue = scalarIssue(rule.value);
      required(!valueIssue, `rules.${index}.value`, valueIssue);
    }
  });

  const { monitor, suggest, autoApply } = policy.confidenceTiers;
  required(
    [monitor, suggest, autoApply].every((value) => value >= 0 && value <= 1),
    "confidenceTiers",
    "Каждый порог должен быть от 0 до 1.",
  );
  required(
    monitor <= suggest && suggest <= autoApply,
    "confidenceTiers",
    "Пороги должны возрастать: наблюдение, подсказка, автоматическое действие.",
  );
  return issues;
}

export function validateBudgetPolicy(
  budget: CaseIntelligenceBudgetPolicyDto,
): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const positive = /^[1-9]\d{0,14}$/;
  const numericFields = [
    ["dailyTokenSoftCap", budget.dailyTokenSoftCap],
    ["dailyTokenHardCap", budget.dailyTokenHardCap],
    ["dailyCostMicroUsdSoftCap", budget.dailyCostMicroUsdSoftCap],
    ["dailyCostMicroUsdHardCap", budget.dailyCostMicroUsdHardCap],
    ["maxRunCostMicroUsd", budget.maxRunCostMicroUsd],
    ["costMicroUsdPerMillionTokens", budget.costMicroUsdPerMillionTokens],
  ] as const;
  for (const [path, value] of numericFields) {
    if (!positive.test(value)) {
      issues.push({
        path,
        message: "Введите целое число больше нуля.",
        severity: "ERROR",
      });
    }
  }
  if (
    positive.test(budget.dailyTokenSoftCap) &&
    positive.test(budget.dailyTokenHardCap) &&
    BigInt(budget.dailyTokenSoftCap) > BigInt(budget.dailyTokenHardCap)
  ) {
    issues.push({
      path: "dailyTokenSoftCap",
      message: "Предупреждение должно срабатывать раньше жёсткого лимита.",
      severity: "ERROR",
    });
  }
  if (
    positive.test(budget.dailyCostMicroUsdSoftCap) &&
    positive.test(budget.dailyCostMicroUsdHardCap) &&
    BigInt(budget.dailyCostMicroUsdSoftCap) >
      BigInt(budget.dailyCostMicroUsdHardCap)
  ) {
    issues.push({
      path: "dailyCostMicroUsdSoftCap",
      message: "Предупреждение должно срабатывать раньше жёсткого лимита.",
      severity: "ERROR",
    });
  }
  if (
    !Number.isInteger(budget.maxConcurrentRuns) ||
    budget.maxConcurrentRuns < 1 ||
    budget.maxConcurrentRuns > 1024
  ) {
    issues.push({
      path: "maxConcurrentRuns",
      message: "Укажите от 1 до 1024 одновременных проверок.",
      severity: "ERROR",
    });
  }
  if (
    !Number.isInteger(budget.routeMaxEstimatedTokens) ||
    budget.routeMaxEstimatedTokens < 64 ||
    budget.routeMaxEstimatedTokens > 20_000
  ) {
    issues.push({
      path: "routeMaxEstimatedTokens",
      message: "Укажите от 64 до 20 000 токенов.",
      severity: "ERROR",
    });
  }
  return issues;
}

export function policyHasErrors(issues: readonly PolicyIssue[]): boolean {
  return issues.some((issue) => issue.severity === "ERROR");
}

function normalizeIssuePath(path: string): string {
  return path
    .replace(/^\$\.?/u, "")
    .replace(/\[(\d+)\]/gu, ".$1")
    .replace(/^\./u, "");
}

function serverIssueMessage(code: string): string {
  const labels: Record<string, string> = {
    CASE_INTELLIGENCE_DUPLICATE_TOPIC_CODE:
      "Код категории уже используется.",
    CASE_INTELLIGENCE_DUPLICATE_RULE_CODE: "Код правила уже используется.",
    CASE_INTELLIGENCE_DUPLICATE_RULE:
      "Другое правило уже описывает это совпадение.",
    CASE_INTELLIGENCE_OVERLAPPING_RULES:
      "Правила пересекаются. Проверьте порядок и итоговое действие.",
    CASE_INTELLIGENCE_RULE_TOO_BROAD:
      "Правило слишком широкое: короткая фраза может давать лишние совпадения.",
    CASE_INTELLIGENCE_FALLBACK_LOCALE_NOT_DECLARED:
      "Основной язык должен входить в список языков.",
    CASE_INTELLIGENCE_CONFIDENCE_TIERS_INVALID:
      "Пороги должны возрастать: наблюдение, подсказка, автоматическое действие.",
    CASE_INTELLIGENCE_DUPLICATE_LOCALE: "Язык указан повторно.",
    CASE_INTELLIGENCE_DUPLICATE_CHANNEL: "Канал указан повторно.",
    CASE_INTELLIGENCE_RULE_FIELD_REQUIRED:
      "Для выбранного типа правила заполните обязательное поле.",
    CASE_INTELLIGENCE_RULE_FIELD_FORBIDDEN:
      "Это поле не используется выбранным типом правила.",
    CASE_INTELLIGENCE_RULE_LOCALE_NOT_DECLARED:
      "Язык правила должен входить в список языков.",
    CASE_INTELLIGENCE_FIELD_INVALID: "Проверьте значение поля.",
    CASE_INTELLIGENCE_DUPLICATE_TOPIC_EXAMPLE:
      "Такой пример уже добавлен в эту категорию.",
    CASE_INTELLIGENCE_ROUTER_POLICY_EVIDENCE_TOO_LARGE:
      "Правила содержат слишком много текста для одной проверки.",
    CASE_INTELLIGENCE_POLICY_UNKNOWN_FIELD:
      "Правила содержат поле, которое сервер не поддерживает.",
    CASE_INTELLIGENCE_POLICY_INVALID:
      "Правила не прошли обязательную серверную проверку.",
    CASE_INTELLIGENCE_ISSUES_TRUNCATED:
      "Показана только первая часть ошибок. Исправьте их и проверьте снова.",
  };
  return labels[code] ?? "Сервер отклонил это значение. Проверьте поле.";
}

export function presentServerAuthoringIssues(
  issues: readonly CaseIntelligenceAuthoringIssueDto[],
): PolicyIssue[] {
  return issues.map((issue) => ({
    path: normalizeIssuePath(issue.path),
    relatedPaths: issue.relatedPaths.map(normalizeIssuePath),
    code: issue.code,
    message: serverIssueMessage(issue.code),
    severity: issue.severity,
    source: "SERVER",
  }));
}

export function mergePolicyIssues(
  ...groups: readonly (readonly PolicyIssue[])[]
): PolicyIssue[] {
  const result: PolicyIssue[] = [];
  const seen = new Set<string>();
  for (const issue of groups.flat()) {
    const identity = `${issue.severity}:${issue.path}:${issue.message}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(issue);
  }
  return result;
}

export function calibrationStateLabel(
  state: CaseIntelligenceCalibrationResponseDto["state"],
): string {
  if (state === "READY") return "Покрытие достаточно";
  if (state === "PARTIAL") return "Покрытие неполное";
  return "Калибровка недоступна";
}

export function calibrationBlockedReasonLabel(value: string | null): string {
  if (value === "CALIBRATION_CELL_MISSING") return "Нет данных для этой группы";
  if (value === "MINIMUM_SAMPLES_NOT_MET") return "Недостаточно примеров";
  if (value === "CONFIDENCE_INTERVAL_TOO_WIDE")
    return "Слишком широкий интервал доверия";
  return value ? "Автоматическое действие заблокировано" : "Требуется оценка";
}

export function previewStageLabel(value: string): string {
  const labels: Record<string, string> = {
    POLICY_VALIDATION: "Проверка правил",
    NORMALIZATION: "Нормализация текста",
    DETERMINISTIC_RULES: "Точные правила",
    SEMANTIC_ROUTER: "Смысловая проверка",
    CALIBRATION: "Калибровка доверия",
    COST_ACCOUNTING: "Учёт расходов",
  };
  return labels[value] ?? "Неизвестный этап";
}

export function caseIntelligenceReasonLabel(code: string): string {
  const labels: Record<string, string> = {
    CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH:
      "совпало опубликованное детерминированное правило",
    CASE_INTELLIGENCE_NO_DETERMINISTIC_MATCH:
      "детерминированное правило не найдено",
    CASE_INTELLIGENCE_QUOTED_OR_NEGATED_MATCH:
      "фраза найдена в цитате или отрицании — решение передано на проверку",
    CASE_INTELLIGENCE_RULE_CONFLICT:
      "совпали равноприоритетные правила — решение передано на проверку",
  };
  return (
    labels[code] ??
    "сервер вернул неизвестную причину; автоматическое решение не подтверждено"
  );
}
