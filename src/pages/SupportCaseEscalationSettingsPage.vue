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
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import FormFieldLabel from "@/shared/ui/FormFieldLabel.vue";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import type {
  EscalationAmbiguousRule,
  EscalationPhraseRule,
  EscalationScenario,
  EscalationSimulationStep,
} from "@/features/support-case-intelligence/model/support-case-escalation-domain";
import { localeDisplayName } from "@/shared/lib/locale";
import type { CaseIntelligenceAuthority } from "@/features/support-case-intelligence/model/use-support-case-intelligence";
import { useSupportCaseEscalation } from "@/features/support-case-intelligence/model/use-support-case-escalation";
import {
  cloneEscalation,
  createAmbiguousRequestRule,
  createDoNotEscalateRule,
  createEscalationScenario,
  createExplicitRequestRule,
  createSimulationStep,
  escalationActionLabel,
  normalizeSimulationStepSafety,
  routingAdmissionPresentation,
  simulationStepSafetyIssue,
  simulationStepReferenceIssue,
  trustedOutcomeLabel,
  urgencyLabel,
  validateEscalationPolicy,
} from "@/features/support-case-intelligence/model/support-case-escalation-policy";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const accessDenied = ref(false);
const editorKind = ref<
  "EXPLICIT" | "AMBIGUOUS" | "EXCLUDE" | "SCENARIO" | null
>(null);
const editorIndex = ref(-1);
const editedPhraseRule = ref<
  EscalationPhraseRule | EscalationAmbiguousRule | null
>(null);
const editedScenario = ref<EscalationScenario | null>(null);
const phrasesText = ref("");
const dataToCollectText = ref("");
const simulatorVisible = ref(false);
const mobileSimulatorView = ref<"events" | "result">("events");
const openedPanelFromPage = ref(false);
const publishVisible = ref(false);
const discardVisible = ref(false);
const reason = ref("");
const newStepKind = ref<EscalationSimulationStep["kind"]>(
  "EXPLICIT_HUMAN_REQUEST",
);
const stepEditorIndex = ref(-1);
const editedStep = ref<EscalationSimulationStep | null>(null);
const editedStepDelayMinutes = ref(0);

const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const permissionSignature = computed(() =>
  [...permissions.value].sort().join(","),
);
const canRead = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(permissions.value, "project.case_intelligence.read"),
);

function authority(): CaseIntelligenceAuthority | null {
  return auth.user?.id && auth.project?.id
    ? {
        actorId: auth.user.id,
        projectId: auth.project.id,
        permissions: permissions.value,
      }
    : null;
}

const controller = useSupportCaseEscalation({
  authority,
  async onForbidden() {
    accessDenied.value = true;
    try {
      await auth.refreshContext();
    } catch {
      /* state is already purged */
    }
  },
  async onAuthenticationRequired() {
    try {
      await auth.logout();
    } catch {
      /* local authority is already gone */
    } finally {
      await router.replace({
        path: "/login",
        query: { redirect: route.fullPath },
      });
    }
  },
});

const localeOptions = computed(() => {
  const values = new Set([
    "ru-RU",
    "en-US",
    "en-GB",
    "es-ES",
    "de-DE",
    "fr-FR",
    "pt-BR",
    "tr-TR",
    ...(auth.project?.supportedLocales ?? []),
  ]);
  return [...values].map((value) => ({
    value,
    label: `${localeDisplayName(value, "ru") ?? value} · ${value}`,
  }));
});
const actionOptions = [
  { value: "OFFER", label: "Предложить оператора" },
  { value: "ASK_REASON_ONCE", label: "Один раз уточнить причину" },
  { value: "ESCALATE", label: "Передать сразу" },
];
const urgencyOptions = ["LOW", "MEDIUM", "HIGH", "IMMEDIATE"].map((value) => ({
  value,
  label: urgencyLabel(value),
}));
const simulationKindOptions = [
  ["EXPLICIT_HUMAN_REQUEST", "Явная просьба позвать человека"],
  ["AMBIGUOUS_HUMAN_TERM", "Неоднозначное упоминание оператора"],
  ["SCENARIO", "Продуктовый сценарий"],
  ["TRUSTED_OUTCOME", "Проверенный неудачный результат Lola"],
  ["CLARIFICATION", "Дополнительный вопрос Lola"],
  ["NO_MATCH", "Lola не поняла сообщение"],
  ["REPEAT", "Повтор проблемы"],
  ["OFFER_ACCEPTED", "Пользователь принял предложение"],
  ["OFFER_DECLINED", "Пользователь отказался"],
  ["OFFER_TIMEOUT", "Пользователь не ответил"],
  ["VERIFIED_RESOLUTION", "Решение подтверждено"],
  ["NEW_CASE_OR_TOPIC", "Новая тема обращения"],
  ["CASE_TERMINAL", "Обращение завершено"],
  ["ESCALATION_COMMITTED", "Передача зафиксирована"],
  ["POLICY_SWITCH", "Правила сменились"],
] as const;

const safetyClassLabels: Record<string, string> = {
  SELF_HARM_OR_SUICIDE: "Риск причинения вреда себе",
  CREDIBLE_THREAT_OR_VIOLENCE: "Реальная угроза или насилие",
  HARM_INVOLVING_MINORS: "Риск для несовершеннолетних",
  RESPONSIBLE_GAMING_CRISIS: "Кризис ответственной игры",
};
const consequenceLabels: Record<string, string> = {
  SAFE_RESPONSE: "Безопасный ответ",
  SAFETY_OCCURRENCE: "Зафиксировать риск",
  CASE_ESCALATION: "Передать человеку",
  OPERATIONAL_ALERT: "Оповестить ответственную команду",
};
const safetyStateLabels: Record<string, string> = {
  CLEAR: "Риск не обнаружен",
  PENDING: "Проверка продолжается",
  FAILED: "Проверка не завершилась",
  SUSPECTED: "Обнаружен возможный риск",
  URGENT: "Требуется немедленное действие",
};
const simulationStatusLabels: Record<string, string> = {
  OPEN: "Обращение открыто",
  OFFERED: "Оператор предложен",
  COOLDOWN: "Пауза перед новым предложением",
  ESCALATED: "Передача зафиксирована",
  FROZEN: "Решение зафиксировано",
};
const dispositionLabels: Record<string, string> = {
  APPLIED: "Событие применено",
  BLOCKED: "Событие заблокировано",
  CONFLICT: "Событие конфликтует с уже зафиксированным решением",
};
const effectLabels: Record<string, string> = {
  STATE_FROZEN: "Состояние решения зафиксировано",
  SAFE_RESPONSE: "Подготовлен безопасный ответ",
  OPERATIONAL_ALERT: "Ответственная команда оповещена",
};
const channelLabels: Record<string, string> = {
  TEXT: "Текст",
  VOICE: "Голос",
  TELEGRAM: "Telegram",
};
const businessStateOptions = [
  { value: "OPEN", label: "Обращение открыто" },
  { value: "CLOSED", label: "Обращение закрыто" },
  { value: "RUNTIME_MISMATCH", label: "Состояние сервера ещё сверяется" },
];
const queueStateOptions = [
  { value: "WINNER", label: "Команда готова принять" },
  { value: "NO_ELIGIBLE_OPERATOR", label: "Нет доступного оператора" },
  { value: "NO_ACTIVATION", label: "Правила распределения не активны" },
  { value: "MISSING", label: "Команда не найдена" },
  { value: "UNKNOWN", label: "Состояние очереди неизвестно" },
];
const safetyStateOptions = Object.entries(safetyStateLabels).map(
  ([value, label]) => ({ value, label }),
);
const safetyRiskOptions = [
  { value: null, label: "Класс риска не задан" },
  ...Object.entries(safetyClassLabels).map(([value, label]) => ({
    value,
    label,
  })),
];
const trustedOutcomeOptions = [
  "NO_ANSWER",
  "KNOWLEDGE_INSUFFICIENT",
  "TOOL_FAILED",
  "UNRESOLVED",
].map((value) => ({ value, label: trustedOutcomeLabel(value) }));

const currentSafetyPresentation = computed(() => {
  const value = controller.snapshot.value?.safety;
  if (!value)
    return {
      severity: "warn" as const,
      title: "Состояние безопасности загружается",
      copy: "До сверки обычные ответы Lola не считаются разрешёнными.",
    };
  if (value.state === "READY" && value.assistantReleaseGate === "ALLOW")
    return {
      severity: "success" as const,
      title: "Безопасность готова",
      copy: "Сервер сверил обязательные правила и разрешил обычные ответы Lola.",
    };
  if (value.state === "UNAVAILABLE")
    return {
      severity: "error" as const,
      title: "Проверка безопасности не завершилась",
      copy: "Обычный ответ Lola заблокирован. Сервер повторит проверку, а ответственная команда увидит предупреждение.",
    };
  return {
    severity: "warn" as const,
    title: "Правила безопасности сверяются",
    copy: "Пока сверка не закончена, используется безопасный ответ и передача человеку остаётся доступной.",
  };
});
const committedSimulationStep = computed(() =>
  controller.simulation.value?.steps.find(
    (step) =>
      step.kind === "ESCALATION_COMMITTED" &&
      step.disposition === "APPLIED" &&
      step.after.status === "FROZEN" &&
      step.effects.includes("STATE_FROZEN"),
  ),
);
const stepShapeIssue = computed(() => {
  const step = editedStep.value;
  return step
    ? simulationStepReferenceIssue(step, controller.policy.value)
    : "";
});
const stepSafetyIssue = computed(() => {
  const step = editedStep.value;
  return step ? simulationStepSafetyIssue(step) : "";
});
const stepEditorIssue = computed(
  () => stepShapeIssue.value || stepSafetyIssue.value,
);
const simulationStepIssues = computed(() =>
  controller.simulationSteps.value.map(
    (step) =>
      simulationStepReferenceIssue(step, controller.policy.value) ||
      simulationStepSafetyIssue(step),
  ),
);

function issue(path: string) {
  return (
    controller.issues.value.find(
      (item) =>
        item.path === path ||
        item.path.startsWith(`${path}.`) ||
        item.path.startsWith(`${path}[`),
    )?.message ?? ""
  );
}

const editorIssues = computed(() => {
  const candidate = cloneEscalation(controller.policy.value);
  if (editedPhraseRule.value && editorKind.value) {
    const editedRule = cloneEscalation(editedPhraseRule.value);
    editedRule.phrases = phrasesText.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const collection =
      editorKind.value === "EXPLICIT"
        ? candidate.explicitHumanRequestRules
        : editorKind.value === "AMBIGUOUS"
          ? candidate.ambiguousHumanTermRules
          : (candidate.doNotEscalateRules ??
            (candidate.doNotEscalateRules = []));
    const index = editorIndex.value < 0 ? collection.length : editorIndex.value;
    collection.splice(
      index,
      editorIndex.value < 0 ? 0 : 1,
      editedRule as never,
    );
  }
  if (editedScenario.value && editorKind.value === "SCENARIO") {
    const scenario = cloneEscalation(editedScenario.value);
    scenario.dataToCollect = dataToCollectText.value
      .split("\n")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const index =
      editorIndex.value < 0 ? candidate.scenarios.length : editorIndex.value;
    candidate.scenarios.splice(index, editorIndex.value < 0 ? 0 : 1, scenario);
  }
  return validateEscalationPolicy(candidate);
});

function editorIssue(field: string) {
  const collection =
    editorKind.value === "EXPLICIT"
      ? "explicitHumanRequestRules"
      : editorKind.value === "AMBIGUOUS"
        ? "ambiguousHumanTermRules"
        : editorKind.value === "EXCLUDE"
          ? "doNotEscalateRules"
          : "scenarios";
  const index =
    editorIndex.value < 0
      ? editorKind.value === "SCENARIO"
        ? controller.policy.value.scenarios.length
        : editorKind.value === "EXPLICIT"
          ? controller.policy.value.explicitHumanRequestRules.length
          : editorKind.value === "AMBIGUOUS"
            ? controller.policy.value.ambiguousHumanTermRules.length
            : (controller.policy.value.doNotEscalateRules?.length ?? 0)
      : editorIndex.value;
  const prefix = `${collection}[${index}].${field}`;
  return (
    editorIssues.value.find(
      (item) => item.path === prefix || item.path.startsWith(`${prefix}[`),
    )?.message ?? ""
  );
}

async function focusIssue(path: string) {
  const match =
    /^(explicitHumanRequestRules|ambiguousHumanTermRules|doNotEscalateRules|scenarios)\[(\d+)\]/u.exec(
      path,
    );
  if (match) {
    const index = Number(match[2]);
    if (match[1] === "explicitHumanRequestRules")
      openPhraseEditor("EXPLICIT", index);
    if (match[1] === "ambiguousHumanTermRules")
      openPhraseEditor("AMBIGUOUS", index);
    if (match[1] === "doNotEscalateRules") openPhraseEditor("EXCLUDE", index);
    if (match[1] === "scenarios") openScenarioEditor(index);
    await nextTick();
    document.getElementById(issueControlId(path))?.focus();
    return;
  }
  document.getElementById(issueControlId(path))?.focus();
}

function issueControlId(path: string) {
  const field =
    path
      .split(".")
      .at(-1)
      ?.replace(/\[\d+\]/gu, "") ?? "";
  if (path.startsWith("scenarios["))
    return (
      {
        code: "escalation-scenario-code",
        reasonCode: "escalation-scenario-reason",
        dataToCollect: "escalation-scenario-data",
      }[field] ?? "escalation-scenario-code"
    );
  if (
    /^(explicitHumanRequestRules|ambiguousHumanTermRules|doNotEscalateRules)\[/u.test(
      path,
    )
  )
    return (
      {
        code: "escalation-rule-code",
        locales: "escalation-rule-locales",
        phrases: "escalation-rule-phrases",
      }[field] ?? "escalation-rule-code"
    );
  if (path.startsWith("trustedOutcomeLimits."))
    return `escalation-outcome-${path.split(".").at(-1)}`;
  return (
    {
      clarificationLimit: "escalation-clarification",
      noMatchLimit: "escalation-no-match",
      repeatLimit: "escalation-repeat",
      failedResolutionLimit: "escalation-failed",
      routingPolicyRevisionId: "escalation-routing",
      offerCooldownSeconds: "escalation-cooldown",
      offerResponseTimeoutSeconds: "escalation-timeout",
    }[path] ?? "escalation-validation-summary"
  );
}

function writePanel(
  panel: "rule" | "simulator" | "event" | "result",
  extra: Record<string, string> = {},
) {
  openedPanelFromPage.value = true;
  void router.push({
    query: {
      ...route.query,
      escalationPanel: panel,
      ...extra,
    },
  });
}

function clearPanel(fallback: "simulator" | null = null) {
  const query = { ...route.query };
  delete query.escalationPanel;
  delete query.ruleKind;
  delete query.ruleIndex;
  if (fallback) query.escalationPanel = fallback;
  if (openedPanelFromPage.value) void router.back();
  else void router.replace({ query });
  openedPanelFromPage.value = false;
}

function openPhraseEditor(
  kind: "EXPLICIT" | "AMBIGUOUS" | "EXCLUDE",
  index = -1,
  updateRoute = true,
) {
  if (!canRead.value) return;
  editorKind.value = kind;
  editorIndex.value = index;
  const collection =
    kind === "EXPLICIT"
      ? controller.policy.value.explicitHumanRequestRules
      : kind === "AMBIGUOUS"
        ? controller.policy.value.ambiguousHumanTermRules
        : (controller.policy.value.doNotEscalateRules ??= []);
  const value =
    collection[index] ??
    (kind === "EXPLICIT"
      ? createExplicitRequestRule(collection.length)
      : kind === "AMBIGUOUS"
        ? createAmbiguousRequestRule(collection.length)
        : createDoNotEscalateRule(collection.length));
  editedPhraseRule.value = cloneEscalation(value);
  phrasesText.value = value.phrases.join("\n");
  if (updateRoute)
    writePanel("rule", { ruleKind: kind, ruleIndex: String(index) });
}

function openScenarioEditor(index = -1, updateRoute = true) {
  if (!canRead.value) return;
  editorKind.value = "SCENARIO";
  editorIndex.value = index;
  const value =
    controller.policy.value.scenarios[index] ??
    createEscalationScenario(controller.policy.value.scenarios.length);
  editedScenario.value = cloneEscalation(value);
  dataToCollectText.value = value.dataToCollect.join("\n");
  if (updateRoute)
    writePanel("rule", { ruleKind: "SCENARIO", ruleIndex: String(index) });
}

function closeEditor() {
  editorKind.value = null;
  editorIndex.value = -1;
  editedPhraseRule.value = null;
  editedScenario.value = null;
  if (route.query.escalationPanel === "rule") clearPanel();
}

function saveEditor() {
  if (!controller.canManage.value || editorIssues.value.length) return;
  if (
    (editorKind.value === "EXPLICIT" ||
      editorKind.value === "AMBIGUOUS" ||
      editorKind.value === "EXCLUDE") &&
    editedPhraseRule.value
  ) {
    editedPhraseRule.value.phrases = phrasesText.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const collection =
      editorKind.value === "EXPLICIT"
        ? controller.policy.value.explicitHumanRequestRules
        : editorKind.value === "AMBIGUOUS"
          ? controller.policy.value.ambiguousHumanTermRules
          : (controller.policy.value.doNotEscalateRules ??= []);
    if (editorIndex.value < 0)
      collection.push(cloneEscalation(editedPhraseRule.value) as never);
    else
      collection.splice(
        editorIndex.value,
        1,
        cloneEscalation(editedPhraseRule.value) as never,
      );
  }
  if (editorKind.value === "SCENARIO" && editedScenario.value) {
    editedScenario.value.dataToCollect = dataToCollectText.value
      .split("\n")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    if (editorIndex.value < 0)
      controller.policy.value.scenarios.push(
        cloneEscalation(editedScenario.value),
      );
    else
      controller.policy.value.scenarios.splice(
        editorIndex.value,
        1,
        cloneEscalation(editedScenario.value),
      );
  }
  closeEditor();
}

function removeEditorItem() {
  if (!controller.canManage.value) return;
  if (editorIndex.value < 0) return closeEditor();
  if (editorKind.value === "EXPLICIT")
    controller.policy.value.explicitHumanRequestRules.splice(
      editorIndex.value,
      1,
    );
  if (editorKind.value === "AMBIGUOUS")
    controller.policy.value.ambiguousHumanTermRules.splice(
      editorIndex.value,
      1,
    );
  if (editorKind.value === "EXCLUDE")
    controller.policy.value.doNotEscalateRules?.splice(editorIndex.value, 1);
  if (editorKind.value === "SCENARIO")
    controller.policy.value.scenarios.splice(editorIndex.value, 1);
  closeEditor();
}

function addSimulationStep() {
  const step = createSimulationStep(
    newStepKind.value,
    controller.simulationSteps.value.length,
  );
  if (step.kind === "EXPLICIT_HUMAN_REQUEST")
    step.ruleCode = controller.policy.value.explicitHumanRequestRules[0]?.code;
  if (step.kind === "AMBIGUOUS_HUMAN_TERM")
    step.ruleCode = controller.policy.value.ambiguousHumanTermRules[0]?.code;
  if (step.kind === "SCENARIO")
    step.scenarioCode = controller.policy.value.scenarios[0]?.code;
  if (step.kind === "TRUSTED_OUTCOME") step.outcome = "NO_ANSWER";
  if (step.kind === "POLICY_SWITCH")
    step.nextDefinition = cloneEscalation(controller.policy.value);
  controller.simulationSteps.value.push(step);
}

function openStepEditor(index: number) {
  stepEditorIndex.value = index;
  editedStep.value = cloneEscalation(controller.simulationSteps.value[index]);
  const startedAt = new Date(
    controller.simulationSteps.value[0]?.observedAt ??
      editedStep.value.observedAt,
  ).getTime();
  editedStepDelayMinutes.value = Math.max(
    0,
    Math.round(
      (new Date(editedStep.value.observedAt).getTime() - startedAt) / 60_000,
    ),
  );
  writePanel("event");
}

function closeStepEditor() {
  stepEditorIndex.value = -1;
  editedStep.value = null;
  if (route.query.escalationPanel === "event") clearPanel("simulator");
}

function saveStepEditor() {
  if (!editedStep.value || stepEditorIndex.value < 0 || stepEditorIssue.value)
    return;
  const startedAt = new Date(
    controller.simulationSteps.value[0]?.observedAt ??
      editedStep.value.observedAt,
  ).getTime();
  editedStep.value.observedAt = new Date(
    startedAt + editedStepDelayMinutes.value * 60_000,
  ).toISOString();
  editedStep.value = normalizeSimulationStepSafety(editedStep.value);
  if (editedStep.value.kind === "POLICY_SWITCH")
    editedStep.value.nextDefinition = cloneEscalation(controller.policy.value);
  else delete editedStep.value.nextDefinition;
  if (
    !["EXPLICIT_HUMAN_REQUEST", "AMBIGUOUS_HUMAN_TERM"].includes(
      editedStep.value.kind,
    )
  )
    delete editedStep.value.ruleCode;
  if (editedStep.value.kind !== "SCENARIO")
    delete editedStep.value.scenarioCode;
  if (editedStep.value.kind !== "TRUSTED_OUTCOME")
    delete editedStep.value.outcome;
  controller.simulationSteps.value.splice(
    stepEditorIndex.value,
    1,
    cloneEscalation(editedStep.value),
  );
  closeStepEditor();
}

function repeatSimulationStep(index: number) {
  const sourceStep = controller.simulationSteps.value[index];
  const copy = cloneEscalation(sourceStep);
  copy.stepId = `STEP_${controller.simulationSteps.value.length + 1}`;
  copy.observedAt = new Date(
    new Date(sourceStep.observedAt).getTime() + 60_000,
  ).toISOString();
  controller.simulationSteps.value.splice(index + 1, 0, copy);
}

function removeSimulationStep(index: number) {
  controller.simulationSteps.value.splice(index, 1);
}

function loadPreset(kind: "DIRECT" | "OFFER" | "FAILURE" | "SAFETY") {
  const kinds: Record<typeof kind, EscalationSimulationStep["kind"][]> = {
    DIRECT: ["EXPLICIT_HUMAN_REQUEST", "ESCALATION_COMMITTED"],
    OFFER: ["AMBIGUOUS_HUMAN_TERM", "OFFER_ACCEPTED", "ESCALATION_COMMITTED"],
    FAILURE: ["TRUSTED_OUTCOME", "TRUSTED_OUTCOME", "ESCALATION_COMMITTED"],
    SAFETY: ["SCENARIO", "ESCALATION_COMMITTED"],
  };
  controller.simulationSteps.value = kinds[kind].map((stepKind, index) => {
    const step = createSimulationStep(stepKind, index);
    if (stepKind === "EXPLICIT_HUMAN_REQUEST")
      step.ruleCode =
        controller.policy.value.explicitHumanRequestRules[0]?.code;
    if (stepKind === "AMBIGUOUS_HUMAN_TERM")
      step.ruleCode = controller.policy.value.ambiguousHumanTermRules[0]?.code;
    if (stepKind === "SCENARIO")
      step.scenarioCode = controller.policy.value.scenarios[0]?.code;
    if (stepKind === "TRUSTED_OUTCOME") step.outcome = "NO_ANSWER";
    if (kind === "SAFETY") {
      step.safetyState = "URGENT";
      step.safetyRiskClass = "SELF_HARM_OR_SUICIDE";
    }
    return step;
  });
}

function simulationStepLabel(kind: string) {
  return (
    simulationKindOptions.find(([value]) => value === kind)?.[1] ??
    "Неизвестное событие"
  );
}
function simulationStepOffset(index: number) {
  const first = controller.simulationSteps.value[0];
  const current = controller.simulationSteps.value[index];
  if (!first || !current) return 0;
  return Math.max(
    0,
    Math.round(
      (new Date(current.observedAt).getTime() -
        new Date(first.observedAt).getTime()) /
        60_000,
    ),
  );
}
function dataFieldCount(value: number) {
  if (value === 1) return "1 поле до передачи";
  if (value > 1 && value < 5) return `${value} поля до передачи`;
  return `${value} полей до передачи`;
}

function openSimulator() {
  simulatorVisible.value = true;
  mobileSimulatorView.value = "events";
  writePanel("simulator");
}

function closeSimulator() {
  simulatorVisible.value = false;
  editedStep.value = null;
  if (
    ["simulator", "result", "event"].includes(
      String(route.query.escalationPanel),
    )
  ) {
    const query = { ...route.query };
    delete query.escalationPanel;
    void router.replace({ query });
  }
  openedPanelFromPage.value = false;
}

async function runAndShowResult() {
  if (await controller.runSimulation()) {
    mobileSimulatorView.value = "result";
    const query = { ...route.query, escalationPanel: "result" };
    await router.push({ query });
  }
}

function showSimulatorView(view: "events" | "result") {
  mobileSimulatorView.value = view;
  if (view === "events" && route.query.escalationPanel === "result") {
    void router.back();
    return;
  }
  if (view === "result" && controller.simulation.value) {
    void router.push({ query: { ...route.query, escalationPanel: "result" } });
  }
}

function closeProtectedOverlays() {
  editorKind.value = null;
  editorIndex.value = -1;
  editedPhraseRule.value = null;
  editedScenario.value = null;
  editedStep.value = null;
  simulatorVisible.value = false;
  publishVisible.value = false;
  discardVisible.value = false;
  reason.value = "";
}

async function refresh() {
  accessDenied.value = false;
  await controller.load();
  if (route.query.escalationPanel === "rule" && controller.canManage.value) {
    const kind =
      typeof route.query.ruleKind === "string" ? route.query.ruleKind : "";
    const index = Number.parseInt(String(route.query.ruleIndex ?? "-1"), 10);
    if (kind === "SCENARIO") openScenarioEditor(index, false);
    if (["EXPLICIT", "AMBIGUOUS", "EXCLUDE"].includes(kind))
      openPhraseEditor(
        kind as "EXPLICIT" | "AMBIGUOUS" | "EXCLUDE",
        index,
        false,
      );
  }
}
async function confirmPublish() {
  if (await controller.publish(reason.value)) {
    publishVisible.value = false;
    reason.value = "";
  }
}
async function confirmDiscard() {
  if (await controller.discard(reason.value)) {
    discardVisible.value = false;
    reason.value = "";
  }
}

watch(
  [() => auth.user?.id, () => auth.project?.id],
  ([nextActor], [previousActor]) => {
    closeProtectedOverlays();
    const actorChanged = Boolean(previousActor) && nextActor !== previousActor;
    controller.reset({ forgetRetained: actorChanged || !nextActor });
    void refresh();
  },
  { flush: "sync" },
);
watch(permissionSignature, (_next, previous) => {
  const lostAuthority =
    Boolean(previous) &&
    (!hasProjectPermission(
      permissions.value,
      "project.case_intelligence.read",
    ) ||
      (controller.hasUnknownOutcome.value &&
        !hasProjectPermission(
          permissions.value,
          "project.case_intelligence.escalation.manage",
        ) &&
        !hasProjectPermission(
          permissions.value,
          "project.case_intelligence.release.manage",
        )));
  closeProtectedOverlays();
  controller.reset({ forgetRetained: lostAuthority });
  void refresh();
});
watch(
  () => route.query.escalationPanel,
  (panel) => {
    if (panel === "simulator" || panel === "result" || panel === "event") {
      simulatorVisible.value = true;
      mobileSimulatorView.value = panel === "result" ? "result" : "events";
      if (panel !== "event") editedStep.value = null;
    } else if (!panel) {
      simulatorVisible.value = false;
      editedStep.value = null;
      if (editorKind.value) {
        editorKind.value = null;
        editedPhraseRule.value = null;
        editedScenario.value = null;
      }
    }
  },
);
watch(
  [() => editedStep.value?.kind, () => editedStep.value?.safetyState],
  ([kind, safetyState]) => {
    if (!editedStep.value) return;
    if (kind === "EXPLICIT_HUMAN_REQUEST") {
      const codes = controller.policy.value.explicitHumanRequestRules.map(
        (rule) => rule.code,
      );
      if (
        !editedStep.value.ruleCode ||
        !codes.includes(editedStep.value.ruleCode)
      )
        editedStep.value.ruleCode = codes[0];
    } else if (kind === "AMBIGUOUS_HUMAN_TERM") {
      const codes = controller.policy.value.ambiguousHumanTermRules.map(
        (rule) => rule.code,
      );
      if (
        !editedStep.value.ruleCode ||
        !codes.includes(editedStep.value.ruleCode)
      )
        editedStep.value.ruleCode = codes[0];
    } else {
      delete editedStep.value.ruleCode;
    }
    if (kind === "SCENARIO") {
      const codes = controller.policy.value.scenarios.map((item) => item.code);
      if (
        !editedStep.value.scenarioCode ||
        !codes.includes(editedStep.value.scenarioCode)
      )
        editedStep.value.scenarioCode = codes[0];
    } else delete editedStep.value.scenarioCode;
    if (kind === "TRUSTED_OUTCOME") editedStep.value.outcome ??= "NO_ANSWER";
    else delete editedStep.value.outcome;
    if (kind === "POLICY_SWITCH")
      editedStep.value.nextDefinition ??= cloneEscalation(
        controller.policy.value,
      );
    else delete editedStep.value.nextDefinition;
    if (
      kind === "POLICY_SWITCH" ||
      (safetyState && !["SUSPECTED", "URGENT"].includes(safetyState))
    )
      editedStep.value = normalizeSimulationStepSafety(editedStep.value);
  },
);
onMounted(refresh);
onBeforeUnmount(() => controller.reset());
</script>

<template>
  <section class="escalation-page" aria-labelledby="escalation-title">
    <header class="page-header">
      <div>
        <div class="eyebrow"><i class="pi pi-users" /> Настройки поддержки</div>
        <h1 id="escalation-title">Передача оператору</h1>
        <p>
          Настройте, когда Lola предлагает помощь человека, уточняет причину или
          сразу передаёт обращение.
        </p>
      </div>
      <div class="header-actions">
        <RouterLink
          v-if="canRead"
          class="release-workspace-link"
          to="/support/settings/case-intelligence/evaluation"
        >
          Проверка и публикация
          <i class="pi pi-arrow-right" aria-hidden="true" />
        </RouterLink>
        <Tag
          v-if="canRead && !controller.canManage.value"
          value="Только просмотр"
          severity="secondary"
        />
        <Button
          label="Перечитать"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          :disabled="controller.mutating.value"
          @click="refresh"
        />
      </div>
    </header>

    <Message v-if="!canRead" severity="warn" :closable="false"
      >Для этого раздела нужен доступ к правилам обращений текущего
      проекта.</Message
    >
    <template v-else>
      <nav class="section-tabs" aria-label="Разделы правил обращений">
        <RouterLink to="/support/settings/case-intelligence"
          ><i class="pi pi-th-large" /> Обзор</RouterLink
        >
        <RouterLink to="/support/settings/case-intelligence/detection"
          ><i class="pi pi-tags" /> Категории и правила</RouterLink
        >
        <RouterLink
          to="/support/settings/case-intelligence/escalation"
          aria-current="page"
          ><i class="pi pi-users" /> Передача оператору</RouterLink
        >
        <RouterLink to="/support/settings/case-intelligence/models-budget"
          ><i class="pi pi-gauge" /> Модель и лимиты</RouterLink
        >
      </nav>

      <Message
        v-if="controller.safetyUnavailable.value"
        severity="warn"
        :closable="false"
      >
        Обязательная политика безопасности ещё не опубликована администратором
        платформы. Это не проблема вашей роли: правила передачи можно открыть и
        подготовить, но сервер не разрешит проверку и публикацию до настройки
        политики безопасности.
      </Message>

      <div class="live-region" aria-live="polite" aria-atomic="true">
        <Message
          v-if="controller.error.value"
          severity="error"
          :closable="false"
          >{{ controller.error.value }}</Message
        >
        <Message
          v-else-if="controller.feedback.value"
          severity="success"
          :closable="false"
          >{{ controller.feedback.value }}</Message
        >
        <Message
          v-if="controller.hasUnknownOutcome.value"
          severity="warn"
          :closable="false"
        >
          <div class="recovery">
            <span
              >Предыдущая команда ждёт подтверждения сервера. Новые изменения
              временно заблокированы.</span
            ><Button
              label="Проверить эту попытку"
              size="small"
              @click="controller.retryPending"
            />
          </div>
        </Message>
      </div>

      <div
        v-if="controller.loading.value && !controller.snapshot.value"
        class="skeleton-grid"
        aria-label="Загрузка правил передачи"
      >
        <Skeleton height="11rem" border-radius="14px" /><Skeleton
          height="22rem"
          border-radius="14px"
        /><Skeleton height="18rem" border-radius="14px" />
      </div>
      <section
        v-else-if="!controller.snapshot.value"
        class="empty-state"
        role="alert"
      >
        <i class="pi pi-cloud-off" />
        <h2>Правила не загрузились</h2>
        <p>Ничего не изменено. Проверьте соединение и попробуйте ещё раз.</p>
        <Button
          label="Попробовать снова"
          icon="pi pi-refresh"
          @click="refresh"
        />
      </section>

      <template v-else>
        <section class="handoff-brief" aria-labelledby="handoff-flow-title">
          <div class="brief-copy">
            <div class="card-kicker">Как работает передача</div>
            <h2 id="handoff-flow-title">Как обращение попадает к человеку</h2>
            <p>
              Явная просьба всегда передаёт обращение. Для неоднозначной фразы
              или сценария можно сначала предложить оператора либо один раз
              уточнить причину.
            </p>
          </div>
          <div class="brief-actions">
            <Button
              label="Проверить сценарий"
              icon="pi pi-play"
              severity="secondary"
              outlined
              :disabled="!controller.canPreview.value"
              @click="openSimulator"
            />
            <Button
              v-if="controller.canManage.value"
              label="Сохранить черновик"
              icon="pi pi-save"
              :loading="controller.mutating.value"
              :disabled="
                Boolean(controller.issues.value.length) ||
                controller.hasUnknownOutcome.value
              "
              @click="controller.save"
            />
          </div>
          <ol class="handoff-path" aria-label="Этапы передачи обращения">
            <li>
              <span>1</span><strong>Сигнал</strong
              ><small>Фраза, сценарий или риск</small>
            </li>
            <li>
              <span>2</span><strong>Решение</strong
              ><small>Предложить, уточнить или передать</small>
            </li>
            <li>
              <span>3</span><strong>Сведения</strong
              ><small>Собрать нужный контекст</small>
            </li>
            <li>
              <span>4</span><strong>Распределение</strong
              ><small>Выбрать очередь и SLA</small>
            </li>
          </ol>
          <dl class="brief-facts">
            <div>
              <dt>Опубликовано</dt>
              <dd>
                {{
                  controller.published.value
                    ? `Версия ${controller.published.value.version}`
                    : "Нет"
                }}
              </dd>
            </div>
            <div>
              <dt>Черновик</dt>
              <dd>
                {{
                  controller.draft.value
                    ? `Версия ${controller.draft.value.version}`
                    : "Нет"
                }}
              </dd>
            </div>
            <div>
              <dt>Правила распределения</dt>
              <dd>Подключены</dd>
            </div>
          </dl>
        </section>

        <main class="policy-stack">
          <section
            class="policy-section requests-section"
            aria-labelledby="requests-title"
            aria-label="Фразы человека"
          >
            <div class="section-heading">
              <div>
                <span class="card-kicker">Просьба позвать человека</span>
                <h2 id="requests-title">Фразы человека</h2>
                <p>
                  Три отдельных списка: подтверждённая просьба, неясное
                  упоминание и точное исключение.
                </p>
              </div>
            </div>
            <div class="request-groups">
              <article class="rule-group rule-group--explicit">
                <div class="rule-group__head">
                  <div>
                    <div class="rule-group__title">
                      <span class="group-mark"><i class="pi pi-bolt" /></span>
                      <h3>Явная просьба</h3>
                      <span class="group-count">{{
                        controller.policy.value.explicitHumanRequestRules.length
                      }}</span>
                    </div>
                    <p>
                      «Позовите оператора» — передаём сразу, без дополнительного
                      вопроса.
                    </p>
                  </div>
                  <Button
                    v-if="controller.canManage.value"
                    label="Добавить просьбу"
                    icon="pi pi-plus"
                    severity="secondary"
                    outlined
                    @click="openPhraseEditor('EXPLICIT')"
                  />
                </div>
                <div class="rule-list">
                  <button
                    v-for="(rule, index) in controller.policy.value
                      .explicitHumanRequestRules"
                    :key="rule.code"
                    class="rule-row"
                    type="button"
                    @click="openPhraseEditor('EXPLICIT', index)"
                  >
                    <span class="rule-main"
                      ><strong>{{
                        rule.phrases[0] || "Фразы не добавлены"
                      }}</strong
                      ><small
                        ><code>{{ rule.code }}</code> ·
                        {{ rule.phrases.length }} фраз</small
                      ></span
                    ><Tag value="Передать сразу" severity="danger" /><i
                      class="pi pi-chevron-right"
                    />
                  </button>
                  <div
                    v-if="
                      !controller.policy.value.explicitHumanRequestRules.length
                    "
                    class="inline-empty"
                  >
                    Добавьте подтверждённые формулировки по языкам проекта.
                  </div>
                </div>
              </article>
              <article class="rule-group rule-group--ambiguous">
                <div class="rule-group__head">
                  <div>
                    <div class="rule-group__title">
                      <span class="group-mark"
                        ><i class="pi pi-comments"
                      /></span>
                      <h3>Неясное упоминание</h3>
                      <span class="group-count">{{
                        controller.policy.value.ambiguousHumanTermRules.length
                      }}</span>
                    </div>
                    <p>
                      «Оператор» без просьбы — можно предложить помощь или
                      уточнить причину.
                    </p>
                  </div>
                  <Button
                    v-if="controller.canManage.value"
                    label="Добавить фразу"
                    icon="pi pi-plus"
                    severity="secondary"
                    outlined
                    @click="openPhraseEditor('AMBIGUOUS')"
                  />
                </div>
                <div class="rule-list">
                  <button
                    v-for="(rule, index) in controller.policy.value
                      .ambiguousHumanTermRules"
                    :key="rule.code"
                    class="rule-row"
                    type="button"
                    @click="openPhraseEditor('AMBIGUOUS', index)"
                  >
                    <span class="rule-main"
                      ><strong>{{
                        rule.phrases[0] || "Фразы не добавлены"
                      }}</strong
                      ><small
                        ><code>{{ rule.code }}</code> ·
                        {{ rule.phrases.length }} фраз</small
                      ></span
                    ><Tag
                      :value="escalationActionLabel(rule.action)"
                      severity="warn"
                    /><i class="pi pi-chevron-right" />
                  </button>
                  <div
                    v-if="
                      !controller.policy.value.ambiguousHumanTermRules.length
                    "
                    class="inline-empty"
                  >
                    Необязательный список: Lola может опираться на сценарии и
                    проверенные исходы.
                  </div>
                </div>
              </article>
              <article class="rule-group rule-group--exception">
                <div class="rule-group__head">
                  <div>
                    <div class="rule-group__title">
                      <span class="group-mark"
                        ><i class="pi pi-minus-circle"
                      /></span>
                      <h3>Точные исключения</h3>
                      <span class="group-count">{{
                        controller.policy.value.doNotEscalateRules?.length ?? 0
                      }}</span>
                    </div>
                    <p>
                      Не передавать только по известной ложной формулировке.
                      Безопасность и явная просьба важнее.
                    </p>
                  </div>
                  <Button
                    v-if="controller.canManage.value"
                    label="Добавить исключение"
                    icon="pi pi-plus"
                    severity="secondary"
                    outlined
                    @click="openPhraseEditor('EXCLUDE')"
                  />
                </div>
                <div class="rule-list">
                  <button
                    v-for="(rule, index) in controller.policy.value
                      .doNotEscalateRules ?? []"
                    :key="rule.code"
                    class="rule-row"
                    type="button"
                    @click="openPhraseEditor('EXCLUDE', index)"
                  >
                    <span class="rule-main"
                      ><strong>{{
                        rule.phrases[0] || "Фразы не добавлены"
                      }}</strong
                      ><small
                        ><code>{{ rule.code }}</code> ·
                        {{ rule.phrases.length }} фраз</small
                      ></span
                    ><Tag value="Не передавать" severity="secondary" /><i
                      class="pi pi-chevron-right"
                    />
                  </button>
                  <div
                    v-if="!controller.policy.value.doNotEscalateRules?.length"
                    class="inline-empty"
                  >
                    Исключений нет. Добавляйте их только для известных ложных
                    срабатываний.
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="policy-section" aria-labelledby="scenario-title">
            <div class="section-heading">
              <div>
                <span class="card-kicker">Продуктовые ситуации</span>
                <h2 id="scenario-title">Сценарии обращения</h2>
                <p>
                  Сценарий задаёт решение и срочность. Он не назначает
                  сотрудника напрямую.
                </p>
              </div>
              <Button
                v-if="controller.canManage.value"
                label="Добавить сценарий"
                icon="pi pi-plus"
                @click="openScenarioEditor()"
              />
            </div>
            <div class="scenario-list">
              <button
                v-for="(scenario, index) in controller.policy.value.scenarios"
                :key="scenario.code"
                class="scenario-row"
                type="button"
                @click="openScenarioEditor(index)"
              >
                <span
                  ><strong>{{ escalationActionLabel(scenario.action) }}</strong
                  ><small
                    ><code>{{ scenario.code }}</code> · причина
                    <code>{{ scenario.reasonCode }}</code> ·
                    {{
                      scenario.dataToCollect.length
                        ? dataFieldCount(scenario.dataToCollect.length)
                        : "Без обязательных полей"
                    }}</small
                  ></span
                ><span class="scenario-meta"
                  ><Tag
                    :value="urgencyLabel(scenario.urgency)"
                    severity="secondary" /></span
                ><i class="pi pi-chevron-right" />
              </button>
              <div
                v-if="!controller.policy.value.scenarios.length"
                class="inline-empty"
              >
                Сценариев пока нет. Явная просьба человека всё равно остаётся
                обязательным основанием для передачи.
              </div>
            </div>
          </section>

          <section class="policy-section" aria-labelledby="thresholds-title">
            <div class="section-heading">
              <div>
                <span class="card-kicker">Повторные неудачи Lola</span>
                <h2 id="thresholds-title">Пороги и проверенные результаты</h2>
                <p>
                  Эти счётчики ведёт сервер по подтверждённым исходам. Браузер
                  не угадывает их по числу сообщений.
                </p>
              </div>
            </div>
            <div class="threshold-grid">
              <label
                ><FormFieldLabel
                  text="Уточнений"
                  help="Максимум дополнительных вопросов, которые Lola задаст до предложения помощи человека."
                /><InputNumber
                  input-id="escalation-clarification"
                  v-model="controller.policy.value.clarificationLimit"
                  :min="0"
                  :max="10"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="Boolean(issue('clarificationLimit'))"
                  aria-describedby="escalation-clarification-help escalation-clarification-error"
                /><small id="escalation-clarification-help"
                  >Сколько раз Lola может задать дополнительный вопрос.</small
                ><small
                  v-if="issue('clarificationLimit')"
                  id="escalation-clarification-error"
                  class="field-error"
                  >{{ issue("clarificationLimit") }}</small
                ></label
              >
              <label
                ><FormFieldLabel
                  text="Не найден ответ"
                  help="Сколько непонятых сообщений подряд допускается до передачи обращения."
                /><InputNumber
                  input-id="escalation-no-match"
                  v-model="controller.policy.value.noMatchLimit"
                  :min="1"
                  :max="20"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="Boolean(issue('noMatchLimit'))"
                  aria-describedby="escalation-no-match-help escalation-no-match-error"
                /><small id="escalation-no-match-help"
                  >Предел непонятых сообщений подряд.</small
                ><small
                  v-if="issue('noMatchLimit')"
                  id="escalation-no-match-error"
                  class="field-error"
                  >{{ issue("noMatchLimit") }}</small
                ></label
              >
              <label
                ><FormFieldLabel
                  text="Повтор проблемы"
                  help="После скольких подтверждённых повторов одной проблемы предложить помощь человека."
                /><InputNumber
                  input-id="escalation-repeat"
                  v-model="controller.policy.value.repeatLimit"
                  :min="1"
                  :max="20"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="Boolean(issue('repeatLimit'))"
                  aria-describedby="escalation-repeat-help escalation-repeat-error"
                /><small id="escalation-repeat-help"
                  >Когда повтор становится основанием для передачи.</small
                ><small
                  v-if="issue('repeatLimit')"
                  id="escalation-repeat-error"
                  class="field-error"
                  >{{ issue("repeatLimit") }}</small
                ></label
              >
              <label
                ><FormFieldLabel
                  text="Неудачных решений"
                  help="Общее число подтверждённых неудачных результатов, после которого обращение передаётся."
                /><InputNumber
                  input-id="escalation-failed"
                  v-model="controller.policy.value.failedResolutionLimit"
                  :min="1"
                  :max="20"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="Boolean(issue('failedResolutionLimit'))"
                  aria-describedby="escalation-failed-help escalation-failed-error"
                /><small id="escalation-failed-help"
                  >Общий предел проверенных неудачных результатов.</small
                ><small
                  v-if="issue('failedResolutionLimit')"
                  id="escalation-failed-error"
                  class="field-error"
                  >{{ issue("failedResolutionLimit") }}</small
                ></label
              >
            </div>
            <div class="outcome-list">
              <label
                v-for="item in controller.policy.value.trustedOutcomeLimits"
                :key="item.outcome"
                ><span
                  ><FormFieldLabel
                    :text="trustedOutcomeLabel(item.outcome)"
                    help="Серверный результат обращения. Счётчик растёт только после подтверждённого исхода, а не по словам в сообщении."
                  />
                  ><small
                    >Серверный результат, а не поиск слов в ответе.</small
                  ></span
                ><InputNumber
                  :input-id="'escalation-outcome-' + item.outcome"
                  v-model="item.limit"
                  :min="1"
                  :max="20"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="
                    Boolean(issue('trustedOutcomeLimits.' + item.outcome))
                  "
                  :aria-describedby="
                    'escalation-outcome-' + item.outcome + '-error'
                  "
                /><small
                  v-if="issue('trustedOutcomeLimits.' + item.outcome)"
                  :id="'escalation-outcome-' + item.outcome + '-error'"
                  class="field-error"
                  >{{ issue("trustedOutcomeLimits." + item.outcome) }}</small
                ></label
              >
            </div>
          </section>

          <section
            class="policy-section routing-section"
            aria-labelledby="routing-title"
          >
            <div>
              <span class="card-kicker">После решения</span>
              <h2 id="routing-title">Распределение и время ожидания</h2>
              <p>
                Эта ссылка выбирает правила команды, рабочего времени и SLA.
                Здесь нельзя назначить конкретного сотрудника.
              </p>
            </div>
            <label class="routing-field"
              ><FormFieldLabel
                text="Версия правил распределения"
                help="Ссылка на опубликованные правила, которые выбирают очередь, рабочее время и SLA. Это не имя сотрудника."
              /><InputText
                id="escalation-routing"
                v-model="controller.policy.value.routingPolicyRevisionId"
                maxlength="128"
                :disabled="!controller.canManage.value"
                :aria-invalid="Boolean(issue('routingPolicyRevisionId'))"
                aria-describedby="escalation-routing-error"
              /><small>{{
                issue("routingPolicyRevisionId") ||
                "Используйте опубликованную версию правил распределения поддержки."
              }}</small
              ><small
                v-if="issue('routingPolicyRevisionId')"
                id="escalation-routing-error"
                class="field-error"
                >{{ issue("routingPolicyRevisionId") }}</small
              ></label
            >
            <div class="threshold-grid threshold-grid--two">
              <label
                ><FormFieldLabel
                  text="Повторно предложить через, минут"
                  help="Минимальная пауза перед тем, как Lola снова предложит оператора после отказа или пропуска."
                /><InputNumber
                  input-id="escalation-cooldown"
                  :model-value="
                    Math.round(
                      controller.policy.value.offerCooldownSeconds / 60,
                    )
                  "
                  :min="1"
                  :max="10080"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="Boolean(issue('offerCooldownSeconds'))"
                  aria-describedby="escalation-cooldown-error"
                  @update:model-value="
                    controller.policy.value.offerCooldownSeconds =
                      Number($event) * 60
                  "
                /><small
                  v-if="issue('offerCooldownSeconds')"
                  id="escalation-cooldown-error"
                  class="field-error"
                  >{{ issue("offerCooldownSeconds") }}</small
                ></label
              ><label
                ><FormFieldLabel
                  text="Ждать ответа на предложение, минут"
                  help="Сколько времени предложение помощи считается активным, пока человек не ответил."
                /><InputNumber
                  input-id="escalation-timeout"
                  :model-value="
                    Math.round(
                      controller.policy.value.offerResponseTimeoutSeconds / 60,
                    )
                  "
                  :min="1"
                  :max="1440"
                  :disabled="!controller.canManage.value"
                  :aria-invalid="Boolean(issue('offerResponseTimeoutSeconds'))"
                  aria-describedby="escalation-timeout-error"
                  @update:model-value="
                    controller.policy.value.offerResponseTimeoutSeconds =
                      Number($event) * 60
                  "
                /><small
                  v-if="issue('offerResponseTimeoutSeconds')"
                  id="escalation-timeout-error"
                  class="field-error"
                  >{{ issue("offerResponseTimeoutSeconds") }}</small
                ></label
              >
            </div>
          </section>

          <section class="safety-section" aria-labelledby="safety-title">
            <div class="safety-heading">
              <span class="lock-mark"><i class="pi pi-lock" /></span>
              <div>
                <span class="card-kicker"
                  >Обязательные правила платформы · только просмотр</span
                >
                <h2 id="safety-title">
                  Безопасность нельзя отключить в проекте
                </h2>
                <p>
                  При риске обычный ответ Lola блокируется. Платформа даёт
                  безопасный ответ, фиксирует событие, создаёт передачу и при
                  необходимости оповещает ответственную команду.
                </p>
              </div>
              <Tag
                :value="
                  controller.safety.value ? 'Проверено сервером' : 'Загрузка'
                "
                severity="secondary"
              />
            </div>
            <Message
              :severity="currentSafetyPresentation.severity"
              :closable="false"
              class="safety-state"
            >
              <strong>{{ currentSafetyPresentation.title }}</strong
              ><br />
              {{ currentSafetyPresentation.copy }}
            </Message>
            <div class="safety-classes">
              <article
                v-for="item in controller.safety.value?.classes ?? []"
                :key="item.code"
              >
                <div>
                  <strong>{{
                    safetyClassLabels[item.code] ?? "Неизвестный класс риска"
                  }}</strong
                  ><Tag
                    :value="
                      item.severity === 'URGENT' ? 'Немедленно' : 'Высокий риск'
                    "
                    severity="danger"
                  />
                </div>
                <ul>
                  <li v-for="effect in item.consequences" :key="effect">
                    {{
                      consequenceLabels[effect] ??
                      "Обязательное действие платформы"
                    }}
                  </li>
                </ul>
              </article>
            </div>
            <div class="safety-foot">
              <span
                ><i class="pi pi-language" />
                {{
                  controller.safety.value?.locales
                    .map((value) => localeDisplayName(value, "ru") ?? value)
                    .join(", ")
                }}</span
              ><span
                ><i class="pi pi-comments" />
                {{
                  controller.safety.value?.channels
                    .map((value) => channelLabels[value] ?? "Неизвестный канал")
                    .join(", ")
                }}</span
              >
            </div>
          </section>
        </main>

        <footer v-if="controller.canManage.value" class="action-bar">
          <div>
            <strong v-if="controller.issues.value.length"
              >{{ controller.issues.value.length }} ошибок</strong
            ><span v-else>Черновик готов к серверной проверке.</span>
            <ul
              v-if="controller.issues.value.length"
              class="error-summary"
              aria-label="Ошибки черновика"
            >
              <li
                v-for="item in controller.issues.value.slice(0, 8)"
                :key="`${item.path}:${item.message}`"
              >
                <button type="button" @click="focusIssue(item.path)">
                  {{ item.message }}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <Button
              v-if="controller.draft.value"
              label="Удалить черновик"
              severity="danger"
              text
              @click="discardVisible = true"
            /><Button
              label="Сохранить черновик"
              icon="pi pi-save"
              :disabled="
                Boolean(controller.issues.value.length) ||
                controller.hasUnknownOutcome.value
              "
              :loading="controller.mutating.value"
              @click="controller.save"
            /><Button
              v-if="controller.draft.value && controller.canPublish.value"
              label="Опубликовать"
              icon="pi pi-check"
              severity="success"
              :disabled="controller.hasUnknownOutcome.value"
              @click="publishVisible = true"
            />
          </div>
        </footer>
      </template>
    </template>

    <Dialog
      v-if="canRead"
      :visible="editorKind !== null"
      modal
      :header="
        editorKind === 'SCENARIO'
          ? 'Сценарий передачи'
          : editorKind === 'EXPLICIT'
            ? 'Явная просьба человека'
            : editorKind === 'EXCLUDE'
              ? 'Исключение из автоматической передачи'
              : 'Неоднозначная фраза'
      "
      class="rule-dialog"
      :style="{
        width: 'min(42.5rem, calc(100vw - 1.5rem))',
        maxHeight: 'calc(100dvh - 1.5rem)',
      }"
      @update:visible="!$event && closeEditor()"
    >
      <div v-if="editedPhraseRule" class="dialog-form">
        <Message
          v-if="editorKind === 'EXPLICIT'"
          severity="info"
          :closable="false"
          >Подтверждённая просьба всегда создаёт передачу. Это действие нельзя
          ослабить до предложения.</Message
        >
        <Message
          v-if="editorKind === 'EXCLUDE'"
          severity="warn"
          :closable="false"
          >Исключение действует только для обычной автоматической проверки.
          Явная просьба человека и обязательные правила безопасности всегда
          имеют приоритет.</Message
        >
        <label
          ><FormFieldLabel
            text="Языки"
            help="Языки, для которых Lola будет проверять эти формулировки. Добавляйте фразы именно на выбранных языках."
          /><MultiSelect
            id="escalation-rule-locales"
            v-model="editedPhraseRule.locales"
            :options="localeOptions"
            option-label="label"
            option-value="value"
            display="chip"
            filter
            panel-class="escalation-locale-panel"
            :disabled="!controller.canManage.value"
            :aria-invalid="Boolean(editorIssue('locales'))"
            aria-describedby="escalation-rule-locales-error"
          /><small
            v-if="editorIssue('locales')"
            id="escalation-rule-locales-error"
            class="field-error"
            >{{ editorIssue("locales") }}</small
          ></label
        >
        <label v-if="editorKind === 'AMBIGUOUS'"
          ><FormFieldLabel
            text="Что сделать"
            help="Мягкий следующий шаг для неясного упоминания: предложить оператора или один раз уточнить причину." /><Select
            v-model="(editedPhraseRule as EscalationAmbiguousRule).action"
            :options="actionOptions"
            option-label="label"
            option-value="value"
            :disabled="!controller.canManage.value"
        /></label>
        <label
          ><FormFieldLabel
            text="Фразы"
            help="Реальные формулировки человека. Одна законченная фраза в строке; одиночные слова дают слишком много ложных совпадений."
          /><Textarea
            id="escalation-rule-phrases"
            v-model="phrasesText"
            rows="7"
            maxlength="10000"
            auto-resize
            :disabled="!controller.canManage.value"
            :aria-invalid="Boolean(editorIssue('phrases'))"
            aria-describedby="escalation-rule-phrases-help escalation-rule-phrases-error"
          /><small id="escalation-rule-phrases-help"
            >Одна фраза в строке. Добавляйте полноценные формулировки, а не
            отдельные слова без контекста.</small
          ><small
            v-if="editorIssue('phrases')"
            id="escalation-rule-phrases-error"
            class="field-error"
            >{{ editorIssue("phrases") }}</small
          ></label
        >
        <details class="technical-fields" :open="Boolean(editorIssue('code'))">
          <summary>
            <span>Технический идентификатор</span>
            <small>заполнен автоматически</small>
          </summary>
          <label class="technical-field">
            <FormFieldLabel
              text="Постоянный код"
              help="Стабильное имя правила для истории, интеграций и отчётов. Создаётся автоматически; меняйте только если код должен совпасть с вашей схемой данных."
            />
            <InputText
              id="escalation-rule-code"
              v-model="editedPhraseRule.code"
              maxlength="64"
              :disabled="!controller.canManage.value"
              :aria-invalid="Boolean(editorIssue('code'))"
              aria-describedby="escalation-rule-code-help escalation-rule-code-error"
            />
            <small id="escalation-rule-code-help"
              >Например, HUMAN_REQUEST_RU. Это не текст, который увидит
              пользователь.</small
            >
            <small
              v-if="editorIssue('code')"
              id="escalation-rule-code-error"
              class="field-error"
              >{{ editorIssue("code") }}</small
            >
          </label>
        </details>
      </div>
      <div v-if="editedScenario" class="dialog-form">
        <div class="field-grid">
          <label
            ><FormFieldLabel
              text="Что сделать"
              help="Как Lola реагирует на этот сценарий: предлагает оператора, уточняет причину или передаёт сразу." /><Select
              v-model="editedScenario.action"
              :options="actionOptions"
              option-label="label"
              option-value="value"
              :disabled="!controller.canManage.value" /></label
          ><label
            ><FormFieldLabel
              text="Срочность"
              help="Приоритет передачи для очереди и SLA. Не меняет обязательные правила безопасности." /><Select
              v-model="editedScenario.urgency"
              :options="urgencyOptions"
              option-label="label"
              option-value="value"
              :disabled="!controller.canManage.value"
          /></label>
        </div>
        <label
          ><FormFieldLabel
            text="Что собрать перед передачей"
            help="Какие сведения Lola должна запросить до передачи: например, номер платежа или заказа. По одному коду поля в строке."
          /><Textarea
            id="escalation-scenario-data"
            v-model="dataToCollectText"
            rows="5"
            auto-resize
            :disabled="!controller.canManage.value"
            :aria-invalid="Boolean(editorIssue('dataToCollect'))"
            aria-describedby="escalation-scenario-data-help escalation-scenario-data-error"
          /><small id="escalation-scenario-data-help"
            >Один постоянный код поля в строке, например PAYMENT_ID. Не вводите
            имя сотрудника или команды.</small
          ><small
            v-if="editorIssue('dataToCollect')"
            id="escalation-scenario-data-error"
            class="field-error"
            >{{ editorIssue("dataToCollect") }}</small
          ></label
        >
        <details
          class="technical-fields"
          :open="Boolean(editorIssue('code') || editorIssue('reasonCode'))"
        >
          <summary>
            <span>Технические идентификаторы</span>
            <small>заполнены автоматически</small>
          </summary>
          <div class="field-grid technical-fields__grid">
            <label class="technical-field">
              <FormFieldLabel
                text="Постоянный код"
                help="Стабильное имя самого сценария. Используется в настройках, интеграциях и истории изменений."
              />
              <InputText
                id="escalation-scenario-code"
                v-model="editedScenario.code"
                maxlength="64"
                :disabled="!controller.canManage.value"
                :aria-invalid="Boolean(editorIssue('code'))"
                aria-describedby="escalation-scenario-code-error"
              />
              <small
                v-if="editorIssue('code')"
                id="escalation-scenario-code-error"
                class="field-error"
                >{{ editorIssue("code") }}</small
              >
            </label>
            <label class="technical-field">
              <FormFieldLabel
                text="Код причины"
                help="Причина именно этой передачи для отчётов и маршрутизации. Она может совпадать с кодом сценария, но отвечает на другой вопрос: почему передали."
              />
              <InputText
                id="escalation-scenario-reason"
                v-model="editedScenario.reasonCode"
                maxlength="64"
                :disabled="!controller.canManage.value"
                :aria-invalid="Boolean(editorIssue('reasonCode'))"
                aria-describedby="escalation-scenario-reason-error"
              />
              <small
                v-if="editorIssue('reasonCode')"
                id="escalation-scenario-reason-error"
                class="field-error"
                >{{ editorIssue("reasonCode") }}</small
              >
            </label>
          </div>
        </details>
      </div>
      <template #footer
        ><Button
          v-if="controller.canManage.value && editorIndex >= 0"
          label="Удалить"
          severity="danger"
          text
          @click="removeEditorItem" /><span class="dialog-spacer" /><Button
          label="Отмена"
          severity="secondary"
          text
          @click="closeEditor" /><Button
          v-if="controller.canManage.value"
          label="Готово"
          @click="saveEditor"
          :disabled="Boolean(editorIssues.length)" /><Button
          v-else
          label="Закрыть"
          @click="closeEditor"
      /></template>
    </Dialog>

    <Dialog
      v-if="canRead"
      :visible="simulatorVisible"
      modal
      header="Проверка сценария передачи"
      class="simulator-dialog"
      :style="{
        width: 'min(70rem, calc(100vw - 2rem))',
        maxHeight: 'calc(100dvh - 2rem)',
      }"
      @update:visible="!$event && closeSimulator()"
    >
      <div class="simulator-note">
        <i class="pi pi-shield" />
        <div>
          <strong>Без реальных действий</strong
          ><span
            >Проверка не создаёт обращений, не вызывает операторов и не
            отправляет уведомления.</span
          >
        </div>
      </div>
      <div class="preset-row" aria-label="Готовые проверки">
        <Button
          label="Явная просьба"
          severity="secondary"
          outlined
          @click="loadPreset('DIRECT')"
        /><Button
          label="Предложение принято"
          severity="secondary"
          outlined
          @click="loadPreset('OFFER')"
        /><Button
          label="Повторные неудачи"
          severity="secondary"
          outlined
          @click="loadPreset('FAILURE')"
        /><Button
          label="Срочный риск"
          severity="secondary"
          outlined
          @click="loadPreset('SAFETY')"
        />
      </div>
      <div class="mobile-simulator-nav" aria-label="Шаги проверки">
        <Button
          label="1. События"
          :severity="mobileSimulatorView === 'events' ? 'primary' : 'secondary'"
          @click="showSimulatorView('events')"
        />
        <Button
          label="2. Результат"
          :severity="mobileSimulatorView === 'result' ? 'primary' : 'secondary'"
          :disabled="!controller.simulation.value"
          @click="showSimulatorView('result')"
        />
      </div>
      <div class="simulator-grid">
        <section
          class="step-builder"
          :class="{ 'mobile-pane--hidden': mobileSimulatorView !== 'events' }"
          aria-labelledby="steps-title"
        >
          <div class="simulator-subhead">
            <div>
              <span class="card-kicker">События</span>
              <h2 id="steps-title">Что произойдёт по порядку</h2>
            </div>
            <Tag
              :value="`${controller.simulationSteps.value.length}/100`"
              severity="secondary"
            />
          </div>
          <div class="add-step">
            <Select
              v-model="newStepKind"
              :options="
                simulationKindOptions.map(([value, label]) => ({
                  value,
                  label,
                }))
              "
              option-label="label"
              option-value="value"
              filter
            /><Button
              label="Добавить"
              icon="pi pi-plus"
              @click="addSimulationStep"
            />
          </div>
          <ol class="step-list">
            <li
              v-for="(step, index) in controller.simulationSteps.value"
              :key="`${step.stepId}-${index}`"
            >
              <span>{{ index + 1 }}</span
              ><button
                type="button"
                class="step-summary"
                @click="openStepEditor(index)"
              >
                <strong>{{ simulationStepLabel(step.kind) }}</strong
                ><small>{{
                  step.ruleCode ||
                  step.scenarioCode ||
                  (step.outcome && trustedOutcomeLabel(step.outcome)) ||
                  "Сервер применит текущее состояние"
                }}</small>
                <small>Через {{ simulationStepOffset(index) }} мин.</small>
                <small v-if="simulationStepIssues[index]" class="field-error">{{
                  simulationStepIssues[index]
                }}</small>
              </button>
              <div class="step-actions">
                <Button
                  icon="pi pi-copy"
                  aria-label="Повторить то же событие"
                  severity="secondary"
                  text
                  rounded
                  @click="repeatSimulationStep(index)"
                /><Button
                  icon="pi pi-trash"
                  aria-label="Удалить событие"
                  severity="danger"
                  text
                  rounded
                  @click="removeSimulationStep(index)"
                />
              </div>
            </li>
          </ol>
          <div
            v-if="!controller.simulationSteps.value.length"
            class="inline-empty"
          >
            Выберите готовую проверку или добавьте события вручную.
          </div>
          <Button
            class="run-button"
            label="Запустить проверку"
            icon="pi pi-play"
            :loading="controller.simulating.value"
            :disabled="
              !controller.simulationSteps.value.length ||
              simulationStepIssues.some(Boolean) ||
              !controller.canPreview.value
            "
            @click="runAndShowResult"
          />
        </section>
        <section
          class="simulation-result"
          :class="{ 'mobile-pane--hidden': mobileSimulatorView !== 'result' }"
          aria-labelledby="result-title"
        >
          <div class="simulator-subhead">
            <div>
              <span class="card-kicker">Результат сервера</span>
              <h2 id="result-title">Хронология решения</h2>
            </div>
            <Tag
              v-if="controller.simulation.value"
              value="Без записи"
              severity="success"
            />
          </div>
          <div v-if="!controller.simulation.value" class="result-empty">
            <i class="pi pi-play-circle" /><strong
              >Результат появится здесь</strong
            ><span
              >Вы увидите изменение счётчиков, действие, безопасность и допуск
              распределения на каждом шаге.</span
            >
          </div>
          <Message
            v-if="committedSimulationStep"
            severity="success"
            :closable="false"
          >
            <strong>Передача оператору зафиксирована</strong><br />
            Шаг {{ committedSimulationStep.index + 1 }} создал серверный
            результат. Проверка не записала его в рабочее обращение.
          </Message>
          <ol v-if="controller.simulation.value" class="timeline">
            <li
              v-for="step in controller.simulation.value.steps"
              :key="`${step.index}-${step.stepId}`"
            >
              <span class="timeline-marker">{{ step.index + 1 }}</span>
              <article>
                <div class="timeline-title">
                  <div>
                    <span class="card-kicker">Шаг {{ step.index + 1 }}</span>
                    <strong>{{ simulationStepLabel(step.kind) }}</strong>
                  </div>
                  ><Tag
                    :value="escalationActionLabel(step.action)"
                    :severity="
                      step.action === 'ESCALATE'
                        ? 'danger'
                        : step.action === 'NONE'
                          ? 'secondary'
                          : 'warn'
                    "
                  />
                </div>
                <ol class="decision-flow" aria-label="Порядок обработки шага">
                  <li>
                    <span>1</span>
                    <div>
                      <small>Сигнал</small
                      ><strong>{{ simulationStepLabel(step.kind) }}</strong>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <small>Безопасность</small
                      ><strong>{{
                        safetyStateLabels[step.safety.state] ??
                        "Состояние неизвестно"
                      }}</strong>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <small>Допуск передачи</small
                      ><strong>{{
                        routingAdmissionPresentation(step.routingAdmission)
                          .label
                      }}</strong>
                    </div>
                  </li>
                  <li>
                    <span>4</span>
                    <div>
                      <small>Итог</small
                      ><strong>{{ escalationActionLabel(step.action) }}</strong>
                    </div>
                  </li>
                </ol>
                <p class="timeline-outcome">
                  {{ routingAdmissionPresentation(step.routingAdmission).copy }}
                </p>
                <details class="timeline-details">
                  <summary>Изменения состояния и технические детали</summary>
                  <div class="counter-diff">
                    <span
                      >Уточнения {{ step.before.clarificationCount }} →
                      {{ step.after.clarificationCount }}</span
                    >
                    <span
                      >Неудачи {{ step.before.failedResolutionCount }} →
                      {{ step.after.failedResolutionCount }}</span
                    >
                    <span
                      >Не понято {{ step.before.noMatchCount }} →
                      {{ step.after.noMatchCount }}</span
                    >
                    <span
                      >Повторы {{ step.before.repeatCount }} →
                      {{ step.after.repeatCount }}</span
                    >
                  </div>
                  <div class="result-facts">
                    <span
                      >{{
                        simulationStatusLabels[step.before.status] ??
                        "Состояние неизвестно"
                      }}
                      →
                      {{
                        simulationStatusLabels[step.after.status] ??
                        "Состояние неизвестно"
                      }}</span
                    >
                    <span>{{
                      dispositionLabels[step.disposition] ??
                      "Решение сервера не описано"
                    }}</span>
                    <span>Событие № {{ step.occurrenceNumber }}</span>
                    <span v-if="step.policyMigration !== 'NONE'"
                      >Смена правил:
                      {{
                        step.policyMigration === "APPLIED"
                          ? "применена"
                          : "требуется сверка"
                      }}</span
                    >
                    <span>Причина: {{ step.reasonCode }}</span>
                    <span v-if="step.policyReasonCode"
                      >Правило: {{ step.policyReasonCode }}</span
                    >
                    <span v-if="step.sourceCode"
                      >Источник: {{ step.sourceCode }}</span
                    >
                    <span v-if="step.urgency"
                      >Срочность: {{ urgencyLabel(step.urgency) }}</span
                    >
                    <span v-if="step.dataToCollect.length"
                      >Собрать: {{ step.dataToCollect.join(", ") }}</span
                    >
                    <span v-if="step.offerDeadline"
                      >Ответ до
                      {{
                        new Date(step.offerDeadline).toLocaleString("ru-RU")
                      }}</span
                    >
                    <span v-if="step.cooldownUntil"
                      >Повтор после
                      {{
                        new Date(step.cooldownUntil).toLocaleString("ru-RU")
                      }}</span
                    >
                    <span
                      v-for="(count, outcome) in step.after
                        .trustedOutcomeCounts ?? {}"
                      :key="outcome"
                      >{{ trustedOutcomeLabel(String(outcome)) }}:
                      {{ count }}</span
                    >
                  </div>
                </details>
                <Message
                  v-if="step.safety.assistantReleaseGate !== 'ALLOW'"
                  severity="warn"
                  :closable="false"
                  >Обычный ответ Lola заблокирован.
                  {{
                    step.safety.retryScheduled
                      ? "Проверка будет повторена."
                      : "Используется безопасный ответ."
                  }}
                  {{
                    step.safety.operationalAlertRequired
                      ? "Ответственная команда получит оповещение."
                      : ""
                  }}</Message
                ><small v-if="step.replay"
                  >Повтор шага {{ Number(step.replayOfStep) + 1 }}: счётчики не
                  увеличены второй раз.</small
                ><small v-if="step.effects.length"
                  >Результаты сервера:
                  {{
                    step.effects
                      .map(
                        (effect) =>
                          effectLabels[effect] ??
                          "Служебное действие выполнено",
                      )
                      .join(", ")
                  }}</small
                >
              </article>
            </li>
          </ol>
        </section>
      </div>
    </Dialog>

    <Dialog
      v-if="canRead && controller.canPreview.value"
      :visible="editedStep !== null"
      modal
      header="Параметры события"
      class="rule-dialog"
      :style="{
        width: 'min(42.5rem, calc(100vw - 1.5rem))',
        maxHeight: 'calc(100dvh - 1.5rem)',
      }"
      @update:visible="!$event && closeStepEditor()"
    >
      <div v-if="editedStep" class="dialog-form">
        <Message severity="info" :closable="false"
          >Изменения действуют только внутри проверки и ничего не отправляют
          пользователям или операторам.</Message
        >
        <label
          ><FormFieldLabel
            text="Событие"
            help="Какой факт проверка должна воспроизвести на этом шаге. Реальных обращений и передач она не создаёт." /><Select
            v-model="editedStep.kind"
            :options="
              simulationKindOptions.map(([value, label]) => ({ value, label }))
            "
            option-label="label"
            option-value="value"
            filter
        /></label>
        <label
          ><FormFieldLabel
            text="Через сколько минут от начала"
            help="Виртуальное время события относительно первого шага проверки." /><InputNumber
            v-model="editedStepDelayMinutes"
            :min="0"
            :max="10080"
            :use-grouping="false"
        /></label>
        <label v-if="editedStep.kind === 'EXPLICIT_HUMAN_REQUEST'"
          ><FormFieldLabel
            text="Правило явной просьбы"
            help="Какое из настроенных правил явной просьбы использовать в проверке." /><Select
            v-model="editedStep.ruleCode"
            :options="
              controller.policy.value.explicitHumanRequestRules.map((rule) => ({
                value: rule.code,
                label: rule.code,
              }))
            "
            option-label="label"
            option-value="value"
            :aria-invalid="Boolean(stepShapeIssue)"
            aria-describedby="escalation-step-shape-error"
        /></label>
        <label v-if="editedStep.kind === 'AMBIGUOUS_HUMAN_TERM'"
          ><FormFieldLabel
            text="Правило неоднозначной фразы"
            help="Какое правило неясного упоминания использовать в проверке." /><Select
            v-model="editedStep.ruleCode"
            :options="
              controller.policy.value.ambiguousHumanTermRules.map((rule) => ({
                value: rule.code,
                label: rule.code,
              }))
            "
            option-label="label"
            option-value="value"
            :aria-invalid="Boolean(stepShapeIssue)"
            aria-describedby="escalation-step-shape-error"
        /></label>
        <label v-if="editedStep.kind === 'SCENARIO'"
          ><FormFieldLabel
            text="Сценарий"
            help="Какой продуктовый сценарий воспроизвести на этом шаге." /><Select
            v-model="editedStep.scenarioCode"
            :options="
              controller.policy.value.scenarios.map((item) => ({
                value: item.code,
                label: item.code,
              }))
            "
            option-label="label"
            option-value="value"
            :aria-invalid="Boolean(stepShapeIssue)"
            aria-describedby="escalation-step-shape-error"
        /></label>
        <label v-if="editedStep.kind === 'TRUSTED_OUTCOME'"
          ><FormFieldLabel
            text="Проверенный результат"
            help="Подтверждённый сервером исход, который изменяет соответствующий счётчик." /><Select
            v-model="editedStep.outcome"
            :options="trustedOutcomeOptions"
            option-label="label"
            option-value="value"
            :aria-invalid="Boolean(stepShapeIssue)"
            aria-describedby="escalation-step-shape-error"
        /></label>
        <small
          v-if="stepShapeIssue"
          id="escalation-step-shape-error"
          class="field-error"
          >{{ stepShapeIssue }}</small
        >
        <div class="field-grid">
          <label
            ><FormFieldLabel
              text="Проверка безопасности"
              help="Состояние обязательной платформенной проверки на этом тестовом шаге." /><Select
              v-model="editedStep.safetyState"
              :options="safetyStateOptions"
              option-label="label"
              option-value="value" /></label
          ><label
            ><FormFieldLabel
              text="Класс риска"
              help="Категория риска для подозрительного или срочного состояния безопасности."
            /><Select
              v-model="editedStep.safetyRiskClass"
              :options="safetyRiskOptions"
              option-label="label"
              option-value="value"
              :disabled="
                !['SUSPECTED', 'URGENT'].includes(editedStep.safetyState)
              "
              :aria-invalid="Boolean(stepSafetyIssue)"
              aria-describedby="escalation-step-safety-error"
            /><small
              v-if="stepSafetyIssue"
              id="escalation-step-safety-error"
              class="field-error"
              >{{ stepSafetyIssue }}</small
            ></label
          >
        </div>
        <div class="field-grid">
          <label
            ><FormFieldLabel
              text="Состояние обращения"
              help="Бизнес-состояние обращения, которое увидит логика распределения." /><Select
              v-model="editedStep.routing.businessState"
              :options="businessStateOptions"
              option-label="label"
              option-value="value" /></label
          ><label
            ><FormFieldLabel
              text="Готовность команды"
              help="Доступна ли подходящая очередь для передачи на этом шаге проверки." /><Select
              v-model="editedStep.routing.queueState"
              :options="queueStateOptions"
              option-label="label"
              option-value="value"
          /></label>
        </div>
        <label class="check-row"
          ><input
            v-model="editedStep.routing.currentAssignment"
            type="checkbox" />
          <FormFieldLabel
            text="Обращение уже назначено оператору"
            help="Включите, чтобы проверить поведение уже назначенного обращения и не создавать повторную передачу."
        /></label>
        <Message
          v-if="editedStep.kind === 'POLICY_SWITCH'"
          severity="warn"
          :closable="false"
          >На этом шаге сервер сверит состояние с текущим черновиком правил и
          покажет, нужна ли миграция.</Message
        >
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="closeStepEditor" /><Button
          label="Готово"
          :disabled="Boolean(stepEditorIssue)"
          @click="saveStepEditor"
      /></template>
    </Dialog>

    <Dialog
      v-if="canRead && controller.canPublish.value"
      v-model:visible="publishVisible"
      modal
      header="Опубликовать правила передачи"
      class="confirm-dialog"
      ><p>
        Публикация подготовит эту версию для следующей общей рабочей версии Case
        Intelligence. Она не меняет правила категорий или Safety.
      </p>
      <label
        ><FormFieldLabel
          text="Причина публикации"
          help="Короткое объяснение для истории изменений: что проверено и зачем эта версия публикуется." /><Textarea
          v-model="reason"
          rows="3"
          maxlength="500" /></label
      ><template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="publishVisible = false" /><Button
          label="Опубликовать"
          severity="success"
          :disabled="reason.trim().length < 3"
          @click="confirmPublish" /></template
    ></Dialog>
    <Dialog
      v-if="canRead && controller.canManage.value"
      v-model:visible="discardVisible"
      modal
      header="Удалить черновик"
      class="confirm-dialog"
      ><p>Опубликованные правила не изменятся.</p>
      <label
        ><FormFieldLabel
          text="Причина удаления"
          help="Объяснение для журнала изменений, почему незавершённый черновик больше не нужен." /><Textarea
          v-model="reason"
          rows="3"
          maxlength="500" /></label
      ><template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="discardVisible = false" /><Button
          label="Удалить"
          severity="danger"
          :disabled="reason.trim().length < 3"
          @click="confirmDiscard" /></template
    ></Dialog>
  </section>
</template>

<style scoped>
.escalation-page {
  --line: color-mix(in srgb, var(--border-color) 78%, transparent);
  --soft: color-mix(in srgb, var(--primary-color) 7%, var(--surface-card));
  --text-color-secondary: color-mix(
    in srgb,
    var(--text-primary) 70%,
    var(--surface-card)
  );
  max-width: 1480px;
  margin: 0 auto;
  padding: 28px clamp(16px, 3vw, 32px) 64px;
  overflow-x: clip;
  color: var(--text-primary);
}
.page-header,
.section-heading,
.rule-group__head,
.safety-heading,
.simulator-subhead,
.header-actions,
.brief-actions,
.recovery,
.action-bar,
.action-bar > div,
.dialog-form label,
.routing-field,
.threshold-grid label,
.outcome-list label {
  display: flex;
}
.page-header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}
.page-header h1 {
  font-size: clamp(1.8rem, 3vw, 2.55rem);
  letter-spacing: -0.035em;
  line-height: 1.05;
  margin: 5px 0 7px;
}
.page-header p,
.section-heading p,
.rule-group p,
.handoff-brief p,
.safety-heading p,
.routing-section p {
  margin: 0;
  color: var(--text-color-secondary);
  line-height: 1.5;
}
.eyebrow,
.card-kicker {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}
.header-actions {
  gap: 8px;
  align-items: center;
}
.release-workspace-link {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-primary);
  background: var(--surface-card);
  font-size: 0.84rem;
  font-weight: 650;
  text-decoration: none;
}
.release-workspace-link:hover {
  background: var(--soft);
}
.release-workspace-link:focus-visible {
  outline: 2px solid var(--action-primary);
  outline-offset: 2px;
}
.section-tabs {
  display: flex;
  box-sizing: border-box;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-card);
  margin-bottom: 18px;
  overflow: auto;
}
.section-tabs a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 13px;
  border-radius: 9px;
  color: var(--text-color-secondary);
  text-decoration: none;
  font-weight: 700;
  white-space: nowrap;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}
.section-tabs a:hover {
  background: var(--soft);
}
.section-tabs a[aria-current="page"] {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: color-mix(in srgb, var(--primary-color) 78%, var(--text-primary));
}
.live-region {
  margin-bottom: 14px;
}
.recovery {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.skeleton-grid {
  display: grid;
  gap: 14px;
}
.empty-state,
.inline-empty,
.result-empty {
  text-align: center;
  border: 1px dashed var(--line);
  border-radius: 14px;
  padding: 28px;
  color: var(--text-color-secondary);
}
.empty-state i,
.result-empty i {
  font-size: 2rem;
}
.handoff-brief,
.policy-section,
.safety-section,
.action-bar {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.handoff-brief {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px 24px;
  padding: 22px;
  margin-bottom: 16px;
}
.handoff-brief h2,
.policy-section h2,
.safety-section h2,
.simulator-dialog h2 {
  margin: 5px 0 7px;
  letter-spacing: -0.02em;
}
.brief-actions {
  align-items: flex-start;
  gap: 8px;
}
.handoff-path {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface-subtle);
}
.handoff-path li {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 9px;
  min-height: 82px;
  padding: 14px;
  border-right: 1px solid var(--line);
}
.handoff-path li:last-child {
  border-right: 0;
}
.handoff-path li > span {
  grid-row: 1 / 3;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--action-primary);
  background: color-mix(
    in srgb,
    var(--action-primary) 10%,
    var(--surface-card)
  );
  font-size: 0.75rem;
  font-weight: 700;
}
.handoff-path strong {
  font-size: 0.88rem;
}
.handoff-path small {
  color: var(--text-color-secondary);
  line-height: 1.35;
}
.brief-facts {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.brief-facts div {
  padding: 12px 14px;
  border-right: 1px solid var(--line);
}
.brief-facts div:last-child {
  border: 0;
}
.brief-facts dt {
  font-size: 0.72rem;
  color: var(--text-color-secondary);
  font-weight: 700;
}
.brief-facts dd {
  margin: 4px 0 0;
  font-weight: 750;
  overflow-wrap: anywhere;
}
.policy-stack {
  display: grid;
  gap: 14px;
}
.policy-section,
.safety-section {
  padding: 22px;
}
.section-heading,
.rule-group__head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.request-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.rule-group {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--surface-subtle);
}
.rule-group--exception {
  grid-column: 1/-1;
}
.rule-group__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: var(--action-primary);
  background: color-mix(
    in srgb,
    var(--action-primary) 10%,
    var(--surface-card)
  );
}
.rule-group--explicit .group-mark {
  color: var(--status-danger-text);
  background: color-mix(
    in srgb,
    var(--status-danger-text) 9%,
    var(--surface-card)
  );
}
.rule-group--exception .group-mark {
  color: var(--text-color-secondary);
  background: var(--surface-card);
}
.group-count {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--text-color-secondary);
  background: var(--surface-card);
  font-size: 0.72rem;
  font-weight: 600;
}
.rule-group h3 {
  margin: 0;
  font-size: 1rem;
}
.rule-group__head p {
  margin-top: 7px;
  font-size: 0.84rem;
}
.rule-list,
.scenario-list {
  display: grid;
  gap: 8px;
}
.rule-list {
  max-height: 300px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.rule-row,
.scenario-row {
  width: 100%;
  display: grid;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-card);
  color: inherit;
  text-align: left;
  padding: 12px;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}
.rule-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}
.scenario-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}
.rule-row:hover,
.scenario-row:hover {
  border-color: color-mix(in srgb, var(--action-primary) 30%, var(--line));
  background: color-mix(in srgb, var(--action-primary) 5%, var(--surface-card));
}
.rule-row:disabled,
.scenario-row:disabled {
  cursor: default;
  opacity: 0.84;
}
.rule-row:focus-visible,
.scenario-row:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rule-icon,
.lock-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--soft);
  color: var(--primary-color);
}
.rule-main,
.scenario-row > span:first-child {
  display: grid;
  gap: 3px;
}
.rule-main small,
.scenario-row small,
.dialog-form small,
.routing-field small,
.threshold-grid small,
.outcome-list small {
  color: var(--text-color-secondary);
  line-height: 1.4;
}
.rule-main code,
.scenario-row code {
  color: var(--text-color-secondary);
  font:
    500 0.74rem/1.3 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.scenario-list {
  margin-top: 16px;
}
.scenario-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.threshold-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.threshold-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.threshold-grid label,
.dialog-form label,
.routing-field {
  flex-direction: column;
  gap: 7px;
  font-weight: 400;
}
.outcome-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.outcome-list label {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.outcome-list label span {
  display: grid;
  gap: 3px;
}
.routing-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.75fr);
  gap: 18px;
}
.routing-section .threshold-grid {
  grid-column: 1/-1;
  margin: 0;
}
.safety-section {
  --text-color-secondary: color-mix(
    in srgb,
    var(--text-primary) 72%,
    var(--surface-card)
  );
  background: color-mix(in srgb, var(--surface-card) 94%, var(--primary-color));
}
.safety-heading {
  align-items: flex-start;
  gap: 14px;
}
.safety-heading > div:nth-child(2) {
  flex: 1;
}
.safety-classes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}
.safety-classes article {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  background: var(--surface-card);
}
.safety-classes article > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.safety-classes ul {
  margin: 10px 0 0;
  padding-left: 18px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}
.safety-foot {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 14px;
  color: var(--text-color-secondary);
}
.action-bar {
  position: sticky;
  bottom: 12px;
  z-index: 8;
  margin-top: 14px;
  padding: 12px 14px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-shadow: 0 12px 32px
    color-mix(in srgb, var(--text-primary) 14%, transparent);
}
.action-bar > div {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.action-bar > div:first-child {
  display: grid;
  gap: 2px;
}
.action-bar small {
  color: var(--p-red-600);
}
.error-summary {
  margin: 4px 0 0;
  padding-left: 18px;
  max-height: 92px;
  overflow: auto;
}
.error-summary button {
  border: 0;
  padding: 2px 0;
  background: transparent;
  color: var(--p-red-600);
  text-align: left;
  cursor: pointer;
}
.field-error {
  color: var(--p-red-600) !important;
  font-weight: 650;
}
.safety-state {
  margin-top: 16px;
}
.safety-state:deep(.p-message-text) {
  color: color-mix(in srgb, var(--text-primary) 88%, var(--surface-card));
}
.mobile-simulator-nav {
  display: none;
}
.rule-dialog {
  width: min(680px, calc(100vw - 28px));
}
:global(.rule-dialog),
:global(.simulator-dialog) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
:global(.rule-dialog .p-dialog-content),
:global(.simulator-dialog .p-dialog-content) {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
:global(.rule-dialog .dialog-form > label) {
  min-width: 0;
}
:global(.rule-dialog .p-multiselect) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
:global(.rule-dialog .p-multiselect-label) {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  min-width: 0;
  max-width: 100%;
  gap: 4px;
  max-height: 108px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}
:global(.escalation-locale-panel .p-multiselect-list-container) {
  max-height: min(260px, 38vh);
  overscroll-behavior: contain;
}
.confirm-dialog {
  width: min(520px, calc(100vw - 28px));
}
.dialog-form {
  display: grid;
  gap: 16px;
}
.technical-fields {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-subtle);
  overflow: hidden;
}
.technical-fields summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
}
.technical-fields summary small {
  font-weight: 400;
}
.technical-fields[open] summary {
  border-bottom: 1px solid var(--line);
}
.technical-fields > .technical-field,
.technical-fields__grid {
  margin: 12px;
}
.technical-field small {
  font-weight: 400;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.escalation-page :deep(.p-inputtext),
.escalation-page :deep(.p-select-label),
.escalation-page :deep(.p-multiselect-label),
.escalation-page :deep(.p-inputnumber-input),
.escalation-page :deep(.p-textarea),
:deep(.rule-dialog .p-inputtext),
:deep(.rule-dialog .p-select-label),
:deep(.rule-dialog .p-multiselect-label),
:deep(.rule-dialog .p-inputnumber-input),
:deep(.rule-dialog .p-textarea),
:deep(.rule-dialog .p-chip-label),
:deep(.confirm-dialog .p-inputtext),
:deep(.confirm-dialog .p-textarea) {
  font-weight: 400 !important;
}
:deep(.rule-dialog .p-message-text),
:deep(.confirm-dialog label),
:deep(.confirm-dialog .p-message-text) {
  font-weight: 400;
}
:deep(.confirm-dialog label) {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
:deep(.technical-field .p-inputtext) {
  color: var(--text-secondary);
  font:
    400 0.82rem/1.35 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.dialog-spacer {
  flex: 1;
}
.simulator-dialog {
  width: min(1320px, calc(100vw - 32px));
}
.simulator-note {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--p-green-500) 10%, transparent);
  margin-bottom: 12px;
}
.simulator-note > div {
  display: grid;
  gap: 2px;
}
.simulator-note span {
  color: var(--text-color-secondary);
}
.preset-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.simulator-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.78fr) minmax(0, 1.22fr);
  gap: 14px;
  min-height: 520px;
}
.step-builder,
.simulation-result {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  min-width: 0;
}
.simulator-subhead {
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.add-step {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin: 14px 0;
}
.step-list,
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.step-list li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.step-list li > span,
.timeline-marker {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--soft);
  color: var(--primary-color);
  font-weight: 800;
}
.step-summary {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  gap: 3px;
  padding: 7px;
  border-radius: 9px;
  cursor: pointer;
}
.step-summary:hover,
.step-summary:focus-visible {
  background: var(--soft);
  outline: 0;
}
.step-actions {
  display: flex;
  gap: 2px;
}
.step-list small {
  color: var(--text-color-secondary);
}
.check-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 9px;
}
.run-button {
  width: 100%;
  margin-top: 14px;
}
.result-empty {
  display: grid;
  justify-items: center;
  gap: 7px;
  margin-top: 16px;
}
.timeline {
  gap: 0;
  margin-top: 12px;
}
.timeline li {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  position: relative;
}
.timeline li:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 13px;
  top: 30px;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.timeline article {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}
.timeline article > small {
  display: block;
  margin-top: 8px;
  color: var(--text-color-secondary);
}
.timeline-title,
.result-facts,
.counter-diff {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.timeline-title > div {
  display: grid;
  gap: 3px;
}
.decision-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: 11px;
  overflow: hidden;
  background: var(--surface-subtle);
}
.decision-flow li {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-width: 0;
  padding: 11px 12px;
  border-right: 1px solid var(--line);
}
.decision-flow li:last-child {
  border-right: 0;
}
.decision-flow li > span {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--action-primary);
  background: color-mix(
    in srgb,
    var(--action-primary) 10%,
    var(--surface-card)
  );
  font-size: 0.7rem;
  font-weight: 700;
}
.decision-flow li > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.decision-flow small {
  color: var(--text-color-secondary);
  font-size: 0.68rem;
  font-weight: 500;
}
.decision-flow strong {
  font-size: 0.78rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.timeline-outcome {
  margin-top: 10px !important;
}
.timeline-details {
  margin-top: 10px;
  border-top: 1px solid var(--line);
}
.timeline-details summary {
  padding: 10px 0 2px;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 600;
}
.timeline-details[open] summary {
  color: var(--text-primary);
}
.counter-diff,
.result-facts {
  justify-content: flex-start;
  margin-top: 9px;
  color: var(--text-color-secondary);
  font-size: 0.82rem;
}
.counter-diff span,
.result-facts span {
  padding: 4px 7px;
  border-radius: 7px;
  background: var(--surface-ground);
}
.timeline p {
  margin: 9px 0 0;
  color: var(--text-color-secondary);
}
@media (max-width: 900px) {
  .handoff-brief,
  .routing-section,
  .simulator-grid {
    grid-template-columns: 1fr;
  }
  .handoff-path,
  .request-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .handoff-path li:nth-child(2) {
    border-right: 0;
  }
  .handoff-path li:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line);
  }
  .rule-group--exception {
    grid-column: 1/-1;
  }
  .brief-actions {
    grid-row: 3;
  }
  .threshold-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .simulator-grid {
    min-height: 0;
  }
  .simulation-result {
    min-height: 400px;
  }
}
@media (max-width: 600px) {
  .escalation-page {
    padding: 14px 12px 96px;
  }
  .page-header {
    display: grid;
  }
  .header-actions {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }
  .release-workspace-link {
    grid-column: 1 / -1;
    justify-content: center;
  }
  .header-actions :deep(.p-button) {
    flex: 1;
  }
  .section-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .section-tabs a {
    padding: 9px 8px;
    justify-content: center;
    white-space: normal;
    text-align: center;
    line-height: 1.25;
  }
  .section-tabs a i {
    display: none;
  }
  .handoff-brief,
  .policy-section,
  .safety-section {
    padding: 16px;
  }
  .brief-actions,
  .section-heading,
  .rule-group__head {
    display: grid;
  }
  .brief-actions :deep(.p-button),
  .rule-group__head :deep(.p-button),
  .section-heading :deep(.p-button) {
    width: 100%;
  }
  .brief-facts,
  .handoff-path,
  .request-groups,
  .threshold-grid,
  .threshold-grid--two,
  .outcome-list,
  .safety-classes,
  .field-grid {
    grid-template-columns: 1fr;
  }
  .handoff-path li,
  .handoff-path li:nth-child(2) {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .handoff-path li:last-child {
    border-bottom: 0;
  }
  .rule-group--exception {
    grid-column: auto;
  }
  .brief-facts div {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .rule-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .rule-row :deep(.p-tag) {
    grid-column: 2;
  }
  .scenario-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .scenario-meta {
    grid-column: 1/-1;
    justify-content: flex-start;
  }
  .action-bar {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: 8px;
    display: grid;
  }
  .action-bar > div:last-child {
    display: grid;
    grid-template-columns: 1fr;
  }
  .action-bar :deep(.p-button) {
    width: 100%;
  }
  .simulator-grid {
    display: flex;
    flex-direction: column;
  }
  .decision-flow {
    grid-template-columns: 1fr;
  }
  .decision-flow li,
  .decision-flow li:last-child {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .decision-flow li:last-child {
    border-bottom: 0;
  }
  .mobile-simulator-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }
  .mobile-pane--hidden {
    display: none;
  }
  .preset-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .add-step {
    grid-template-columns: 1fr;
  }
  .recovery {
    display: grid;
  }
  .safety-heading {
    display: grid;
  }
  .safety-heading :deep(.p-tag) {
    justify-self: start;
  }
}
@media (prefers-reduced-motion: reduce) {
  .section-tabs a,
  .rule-row,
  .scenario-row {
    transition: none;
  }
}
</style>
