import type {
  EscalationAmbiguousRule,
  EscalationPhraseRule,
  EscalationPolicy,
  EscalationScenario,
  EscalationSimulationStep,
} from './support-case-escalation-domain';

export type EscalationPolicyIssue = {
  path: string;
  message: string;
};

const stableCode = /^[A-Z][A-Z0-9_]{0,63}$/u;
const trustedOutcomes = [
  'NO_ANSWER',
  'KNOWLEDGE_INSUFFICIENT',
  'TOOL_FAILED',
  'UNRESOLVED',
] as const;

export function cloneEscalation<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultEscalationPolicy(): EscalationPolicy {
  return {
    explicitHumanRequestRules: [],
    ambiguousHumanTermRules: [],
    scenarios: [],
    trustedOutcomeLimits: trustedOutcomes.map((outcome) => ({
      outcome,
      limit: 2,
    })),
    clarificationLimit: 2,
    failedResolutionLimit: 2,
    noMatchLimit: 2,
    repeatLimit: 3,
    offerCooldownSeconds: 900,
    offerResponseTimeoutSeconds: 300,
    routingPolicyRevisionId: 'support-routing-current',
    doNotEscalateRules: [],
  };
}

export function createExplicitRequestRule(index: number): EscalationPhraseRule {
  return {
    code: `HUMAN_REQUEST_${index + 1}`,
    locales: ['ru-RU'],
    phrases: [],
  };
}

export function createAmbiguousRequestRule(index: number): EscalationAmbiguousRule {
  return {
    code: `HUMAN_TERM_${index + 1}`,
    locales: ['ru-RU'],
    phrases: [],
    action: 'OFFER',
  };
}

export function createDoNotEscalateRule(index: number): EscalationPhraseRule {
  return {
    code: `NO_HANDOFF_${index + 1}`,
    locales: ['ru-RU'],
    phrases: [],
  };
}

export function createEscalationScenario(index: number): EscalationScenario {
  return {
    code: `SUPPORT_SCENARIO_${index + 1}`,
    action: 'OFFER',
    urgency: 'MEDIUM',
    reasonCode: `SUPPORT_SCENARIO_${index + 1}`,
    dataToCollect: [],
  };
}

function validatePhraseRules(
  issues: EscalationPolicyIssue[],
  path: string,
  rules: EscalationPhraseRule[],
) {
  if (rules.length > 100) issues.push({ path, message: 'Можно добавить не больше 100 правил.' });
  const codes = new Set<string>();
  rules.forEach((rule, index) => {
    const prefix = `${path}[${index}]`;
    if (!stableCode.test(rule.code))
      issues.push({
        path: `${prefix}.code`,
        message: 'Код: заглавные латинские буквы, цифры и подчёркивание.',
      });
    if (codes.has(rule.code))
      issues.push({
        path: `${prefix}.code`,
        message: 'Коды правил не должны повторяться.',
      });
    codes.add(rule.code);
    if (!rule.locales.length || rule.locales.length > 20)
      issues.push({
        path: `${prefix}.locales`,
        message: 'Выберите от 1 до 20 языков.',
      });
    if (!rule.phrases.length || rule.phrases.length > 50)
      issues.push({
        path: `${prefix}.phrases`,
        message: 'Добавьте от 1 до 50 фраз.',
      });
    rule.phrases.forEach((phrase, phraseIndex) => {
      if (!phrase.trim() || phrase.length > 200)
        issues.push({
          path: `${prefix}.phrases[${phraseIndex}]`,
          message: 'Фраза должна содержать от 1 до 200 символов.',
        });
    });
  });
}

export function validateEscalationPolicy(policy: EscalationPolicy): EscalationPolicyIssue[] {
  const issues: EscalationPolicyIssue[] = [];
  validatePhraseRules(issues, 'explicitHumanRequestRules', policy.explicitHumanRequestRules);
  validatePhraseRules(issues, 'ambiguousHumanTermRules', policy.ambiguousHumanTermRules);
  validatePhraseRules(issues, 'doNotEscalateRules', policy.doNotEscalateRules ?? []);

  if (policy.scenarios.length > 100)
    issues.push({
      path: 'scenarios',
      message: 'Можно добавить не больше 100 сценариев.',
    });
  const scenarioCodes = new Set<string>();
  policy.scenarios.forEach((scenario, index) => {
    const prefix = `scenarios[${index}]`;
    if (!stableCode.test(scenario.code))
      issues.push({
        path: `${prefix}.code`,
        message: 'Укажите постоянный код сценария.',
      });
    if (scenarioCodes.has(scenario.code))
      issues.push({
        path: `${prefix}.code`,
        message: 'Коды сценариев не должны повторяться.',
      });
    scenarioCodes.add(scenario.code);
    if (!stableCode.test(scenario.reasonCode))
      issues.push({
        path: `${prefix}.reasonCode`,
        message: 'Укажите постоянный код причины.',
      });
    if (scenario.dataToCollect.length > 20)
      issues.push({
        path: `${prefix}.dataToCollect`,
        message: 'Можно собрать не больше 20 полей.',
      });
    scenario.dataToCollect.forEach((code, fieldIndex) => {
      if (!stableCode.test(code))
        issues.push({
          path: `${prefix}.dataToCollect[${fieldIndex}]`,
          message: 'Код данных: заглавные латинские буквы, цифры и подчёркивание.',
        });
    });
  });

  const ranges: Array<[keyof EscalationPolicy, number, number]> = [
    ['clarificationLimit', 0, 10],
    ['failedResolutionLimit', 1, 20],
    ['noMatchLimit', 1, 20],
    ['repeatLimit', 1, 20],
    ['offerCooldownSeconds', 60, 604800],
    ['offerResponseTimeoutSeconds', 60, 86400],
  ];
  ranges.forEach(([path, minimum, maximum]) => {
    const value = policy[path];
    if (typeof value !== 'number' || value < minimum || value > maximum)
      issues.push({
        path,
        message: `Допустимое значение: от ${minimum} до ${maximum}.`,
      });
  });
  if (!policy.routingPolicyRevisionId.trim() || policy.routingPolicyRevisionId.length > 128)
    issues.push({
      path: 'routingPolicyRevisionId',
      message: 'Выберите действующую политику распределения.',
    });
  if (policy.trustedOutcomeLimits.length !== 4)
    issues.push({
      path: 'trustedOutcomeLimits',
      message: 'Настройте все четыре проверенных результата Lola.',
    });
  trustedOutcomes.forEach((outcome) => {
    const match = policy.trustedOutcomeLimits.find((item) => item.outcome === outcome);
    if (!match || match.limit < 1 || match.limit > 20)
      issues.push({
        path: `trustedOutcomeLimits.${outcome}`,
        message: 'Укажите порог от 1 до 20.',
      });
  });
  return issues;
}

export function createSimulationStep(
  kind: EscalationSimulationStep['kind'],
  index: number,
): EscalationSimulationStep {
  const now = new Date(Date.now() + index * 60_000).toISOString();
  return {
    stepId: `STEP_${index + 1}`,
    attemptId: crypto.randomUUID(),
    outcomeId: crypto.randomUUID(),
    observedAt: now,
    kind,
    safetyState: 'CLEAR',
    safetyRiskClass: null,
    routing: {
      currentAssignment: false,
      businessState: 'OPEN',
      queueState: 'WINNER',
    },
  };
}

export function simulationStepSafetyIssue(step: EscalationSimulationStep): string {
  if ((step.safetyState === 'SUSPECTED' || step.safetyState === 'URGENT') && !step.safetyRiskClass)
    return 'Для обнаруженного риска выберите точный класс безопасности.';
  if (step.kind === 'POLICY_SWITCH' && (step.safetyState !== 'CLEAR' || step.safetyRiskClass))
    return 'Смена правил начинается только из подтверждённого безопасного состояния.';
  if (step.safetyState !== 'SUSPECTED' && step.safetyState !== 'URGENT' && step.safetyRiskClass)
    return 'Класс риска указывают только для обнаруженного риска.';
  return '';
}

export function simulationStepShapeIssue(step: EscalationSimulationStep): string {
  if (
    (step.kind === 'EXPLICIT_HUMAN_REQUEST' || step.kind === 'AMBIGUOUS_HUMAN_TERM') &&
    !step.ruleCode?.trim()
  )
    return 'Выберите точное правило для этого события.';
  if (step.kind === 'SCENARIO' && !step.scenarioCode?.trim())
    return 'Выберите сценарий для этого события.';
  if (step.kind === 'TRUSTED_OUTCOME' && !step.outcome)
    return 'Выберите проверенный результат Lola.';
  if (step.kind === 'POLICY_SWITCH' && !step.nextDefinition)
    return 'Добавьте версию правил, на которую переключается проверка.';
  return '';
}

export function simulationStepReferenceIssue(
  step: EscalationSimulationStep,
  policy: EscalationPolicy,
): string {
  const shapeIssue = simulationStepShapeIssue(step);
  if (shapeIssue) return shapeIssue;
  if (
    step.kind === 'EXPLICIT_HUMAN_REQUEST' &&
    !policy.explicitHumanRequestRules.some((rule) => rule.code === step.ruleCode)
  )
    return 'Выбранное правило явной просьбы больше не существует.';
  if (
    step.kind === 'AMBIGUOUS_HUMAN_TERM' &&
    !policy.ambiguousHumanTermRules.some((rule) => rule.code === step.ruleCode)
  )
    return 'Выбранное правило неоднозначной фразы больше не существует.';
  if (
    step.kind === 'SCENARIO' &&
    !policy.scenarios.some((scenario) => scenario.code === step.scenarioCode)
  )
    return 'Выбранный сценарий больше не существует.';
  if (
    step.kind !== 'EXPLICIT_HUMAN_REQUEST' &&
    step.kind !== 'AMBIGUOUS_HUMAN_TERM' &&
    step.ruleCode
  )
    return 'У этого события не должно быть ссылки на правило фразы.';
  if (step.kind !== 'SCENARIO' && step.scenarioCode)
    return 'У этого события не должно быть ссылки на сценарий.';
  if (step.kind !== 'TRUSTED_OUTCOME' && step.outcome)
    return 'У этого события не должно быть проверенного результата Lola.';
  if (step.kind !== 'POLICY_SWITCH' && step.nextDefinition)
    return 'Только смена правил может содержать следующую версию правил.';
  return '';
}

export function normalizeSimulationStepSafety(
  step: EscalationSimulationStep,
): EscalationSimulationStep {
  const normalized = cloneEscalation(step);
  if (normalized.kind === 'POLICY_SWITCH') {
    normalized.safetyState = 'CLEAR';
    normalized.safetyRiskClass = null;
  } else if (normalized.safetyState !== 'SUSPECTED' && normalized.safetyState !== 'URGENT') {
    normalized.safetyRiskClass = null;
  }
  return normalized;
}

export const escalationActionLabel = (value: string) =>
  ({
    OFFER: 'Предложить оператора',
    ASK_REASON_ONCE: 'Один раз уточнить причину',
    ESCALATE: 'Передать сразу',
    NONE: 'Продолжить без передачи',
  })[value] ?? 'Неизвестное действие';

export const urgencyLabel = (value: string) =>
  ({
    LOW: 'Низкая',
    MEDIUM: 'Обычная',
    HIGH: 'Высокая',
    IMMEDIATE: 'Немедленная',
  })[value] ?? 'Неизвестная срочность';

export const trustedOutcomeLabel = (value: string) =>
  ({
    NO_ANSWER: 'Lola не дала ответа',
    KNOWLEDGE_INSUFFICIENT: 'Не хватило знаний',
    TOOL_FAILED: 'Не сработал инструмент',
    UNRESOLVED: 'Проблема не решена',
  })[value] ?? 'Неизвестный результат';

export const routingAdmissionPresentation = (value: string) =>
  ({
    ROUTABLE: {
      label: 'Команда готова принять',
      copy: 'Передаём обращение команде поддержки.',
    },
    OUT_OF_HOURS: {
      label: 'Вне рабочего времени',
      copy: 'Обращение сохранено. Команда ответит в рабочее время.',
    },
    NO_ELIGIBLE_TEAM: {
      label: 'Команда не определена',
      copy: 'Обращение сохранено, но команда пока не определена.',
    },
    DELIVERY_DEGRADED: {
      label: 'Передача задерживается',
      copy: 'Обращение сохранено. Передача команде временно задерживается.',
    },
    NOT_REQUIRED: {
      label: 'Маршрут пока не нужен',
      copy: 'На этом шаге передача оператору не создаётся.',
    },
  })[value] ?? {
    label: 'Допуск неизвестен',
    copy: 'Сверьте состояние с сервером.',
  };
