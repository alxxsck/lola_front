<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { Position, VueFlow, type Edge, type Node } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import ScenarioFlowNode from "@/features/scenarios/ScenarioFlowNode.vue";
import ScenarioNodeInspector from "@/features/scenarios/ScenarioNodeInspector.vue";
import ScenarioConditionRows from "@/features/scenarios/ScenarioConditionRows.vue";
import {
  createRuleDraft,
  mapBackendRuleIssues,
  serializeRuleDraft,
  summarizeRule,
  type RuleDomainContext,
  type RuleDraft,
} from "@/features/scenario-rules/model";
import { ScenarioRuleBuilder } from "@/features/scenario-rules/ui";
import {
  createAudienceDraft,
  mapAudienceIssues,
  serializeAudienceDraft,
  summarizeAudience,
  type AudienceDomainContext,
  type AudienceDraft,
} from "@/features/scenario-audience/model";
import { AudienceRuleBuilder } from "@/features/scenario-audience/ui";
import RuleValidationPreview from "@/features/scenario-publishing/ui/RuleValidationPreview.vue";
import ScenarioPublishPanel from "@/features/scenario-publishing/ui/ScenarioPublishPanel.vue";
import ScenarioRevisionHistory from "@/features/scenario-publishing/ui/ScenarioRevisionHistory.vue";
import {
  createDeliveryPolicyDraft,
  deliveryPolicySummary,
  serializeDeliveryPolicy,
  type DeliveryPolicyDraft,
} from "@/features/scenario-delivery/model";
import { DeliveryPolicyEditor } from "@/features/scenario-delivery/ui";
import {
  goalDraftFromConfig,
  summarizeGoalDraft,
  validateGoalDraft,
} from "@/features/scenario-goals/model";
import {
  restoreScenarioAuthoringSource,
  useScenarioAuthoringDocument,
} from "@/features/scenario-authoring/model/use-scenario-authoring-document";
import { scenarioApiErrorMessage } from "@/features/scenarios/scenario-api-error";
import { useActionDefinitionsStore } from "@/features/actions/action-definitions.store";
import { useProjectActionsStore } from "@/features/project-actions/model/project-actions.store";
import {
  scenarioEligibleActionDefinitions,
  scenarioProjectActionAvailabilityIssue,
} from "@/features/project-actions/model/scenario-project-actions";
import {
  applyTranslationResult,
  createTranslationJobController,
  defaultLocalizationPolicy,
  localizedValue,
  normalizeLocalizedActionContent,
} from "@/features/scenario-localization/model";
import {
  ScenarioLocalePreview,
  ScenarioLocalizationPolicyControl,
  type TranslationUiState,
} from "@/features/scenario-localization/ui";
import { useAuthStore } from "@/features/auth/auth.store";
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import { repository } from "@/shared/api/repository";
import type {
  SaveScenario,
  UpdateScenarioMetadata,
} from "@/shared/api/repository/contracts";
import {
  scenarioAuthoringRepository,
  type ScenarioAuthoringContract,
  type SegmentSummaryResponseDto,
} from "@/shared/api/repository/scenario-authoring";
import type {
  ConversationPolicy,
  EventDefinition,
  Scenario,
  ScenarioAction,
  ScenarioStatus,
  UiElement,
} from "@/shared/types/domain";
import type { ScenarioLocalizationPolicyDto } from "@/shared/api/generated/models";
import {
  createActionConfig,
  findActionDefinition,
  validateScenarioActionConfig,
} from "@/shared/lib/action-definition";
import { slugify } from "@/shared/lib/format";
import { useUnsavedChangesGuard } from "@/shared/lib/use-unsaved-changes-guard";
import {
  choiceOptions,
  conditionBranches,
  createScenarioNode,
  graphTransitions,
  normalizePositions,
  normalizeScenarioActions,
  renameScenarioNode,
  sortScenarioActions,
  toPlainScenarioAction,
  validateScenarioGraph,
} from "@/features/scenarios/model/scenario-graph";

interface ScenarioForm {
  id?: string;
  code: string;
  name: string;
  description: string;
  eventDefinitionId: string;
  status: ScenarioStatus;
  conversationPolicy: ConversationPolicy;
  priority: number;
  conditions: Scenario["conditions"];
  cooldownSeconds?: number;
  maxRunsPerUser?: number;
  activeFrom?: string;
  activeTo?: string;
  actions: ScenarioAction[];
}

type StudioStage =
  "trigger" | "audience" | "eligibility" | "actions" | "delivery";

const systemEventNames: Record<string, string> = {
  "lola.activity_day_started": "Начался день активности",
  "lola.became_offline": "Пользователь вышел из сети",
  "lola.became_online": "Пользователь появился в сети",
  "lola.visit_started": "Начался визит",
};

function eventDisplayName(code: string, fallback: string) {
  return systemEventNames[code] ?? fallback;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const actionDefinitionsStore = useActionDefinitionsStore();
const projectActionsStore = useProjectActionsStore();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const saveError = ref("");
const saveNotice = ref("");
const authoringError = ref("");
const actionsError = ref("");
const templatePolicyError = ref("");
const templateAttributeKeys = ref<string[] | null>(null);
const templateAttributes = ref<
  Array<{
    key: string;
    label: string;
    valueType: string;
    lifecycle: string;
    replacementDefinitionId?: string | null;
  }>
>([]);
const templatePolicyWarnings = ref<string[]>([]);
const events = ref<EventDefinition[]>([]);
const elements = ref<UiElement[]>([]);
const authoringContract = ref<ScenarioAuthoringContract | null>(null);
const ruleDraft = ref<RuleDraft>(createRuleDraft());
const ruleDraftRevision = ref(0);
const audienceDraft = ref<AudienceDraft>(createAudienceDraft());
const audienceDraftRevision = ref(0);
const audienceSegments = ref<SegmentSummaryResponseDto[]>([]);
const audienceSegmentsError = ref("");
const ruleEditorDirty = ref(false);
const initialRuleSnapshot = ref("");
const initialAudienceSnapshot = ref("");
const deliveryPolicy = ref<DeliveryPolicyDraft>(createDeliveryPolicyDraft());
const initialDeliverySnapshot = ref("");
const localizationPolicy = ref<ScenarioLocalizationPolicyDto>(
  defaultLocalizationPolicy(),
);
const initialLocalizationSnapshot = ref("");
const {
  currentRevisionId,
  currentDraftVersion,
  authoringEditable,
  authoringUnavailableReason,
  draftConflict,
  load: loadAuthoringDocument,
  reset: resetAuthoringDocument,
  save: saveAuthoringDraft,
} = useScenarioAuthoringDocument();
const studioStage = ref<StudioStage>("trigger");
const validationOpen = ref(false);
watch(studioStage, (stage) => {
  if (stage !== "eligibility") validationOpen.value = false;
});
const ruleBuilder = ref<{
  focusIssue: (target: {
    nodeId?: string;
    fieldPath?: string;
    message?: string;
  }) => void;
} | null>(null);
const audienceBuilder = ref<{
  focusIssue: (target: {
    nodeId?: string;
    fieldPath?: string;
    message?: string;
  }) => void;
} | null>(null);
const deliveryEditor = ref<{ focusIssue: (path: string) => void } | null>(null);
const selectedNodeKey = ref<string | null>(null);
const focusedLocalizedFieldPath = ref("");
const focusedLocale = ref("");
const inspectorMode = ref<"node" | "settings">("settings");
const compactActionLayout = ref(false);
const publishPending = ref(false);
const codeTouched = ref(false);
const initialSnapshot = ref("");
let compactActionMedia: MediaQueryList | null = null;

const form = reactive<ScenarioForm>({
  code: "",
  name: "",
  description: "",
  eventDefinitionId: "",
  status: "DRAFT",
  priority: 0,
  conversationPolicy: "create_new",
  conditions: [],
  cooldownSeconds: undefined,
  maxRunsPerUser: undefined,
  actions: [],
});
const translationStates = reactive<
  Record<string, Record<string, TranslationUiState>>
>({});

function localizedFieldReference(fieldPath: string) {
  const prefix = "graph.actions.";
  if (!fieldPath.startsWith(prefix)) return null;
  const segments = fieldPath.slice(prefix.length).split(".");
  const nodeKey = segments.shift();
  const action = form.actions.find((candidate) => candidate.nodeKey === nodeKey);
  if (!action || segments.length < 2) return null;
  let container: unknown = action;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(container)) {
      const index = Number(segment);
      container = Number.isInteger(index)
        ? container[index]
        : container.find(
            (candidate) =>
              candidate &&
              typeof candidate === "object" &&
              (candidate as Record<string, unknown>).id === segment,
          );
    } else if (container && typeof container === "object") {
      container = (container as Record<string, unknown>)[segment];
    } else return null;
  }
  if (!container || typeof container !== "object") return null;
  return {
    container: container as Record<string, unknown>,
    key: segments.at(-1)!,
  };
}

const translationController = createTranslationJobController({
  context: () => ({
    projectId: auth.project?.id ?? "",
    scenarioId: form.id ?? "new",
  }),
  getValue: (fieldPath) => {
    const reference = localizedFieldReference(fieldPath);
    return localizedValue(
      reference?.container[reference.key],
      authoringContract.value?.localization?.defaultLocale ?? "",
    );
  },
  apply: (fieldPath, _locale, text, snapshot) => {
    const reference = localizedFieldReference(fieldPath);
    if (!reference) return "TARGET_CONFLICT";
    const current = localizedValue(
      reference.container[reference.key],
      authoringContract.value?.localization?.defaultLocale ?? snapshot.sourceLocale,
    );
    const result = applyTranslationResult({ current, snapshot, translatedText: text });
    if (result.outcome === "APPLIED") reference.container[reference.key] = result.value;
    return result.outcome;
  },
  state: (fieldPath, locale, state) => {
    translationStates[fieldPath] = {
      ...(translationStates[fieldPath] ?? {}),
      [locale]: state,
    };
  },
});

function requestTranslation(payload: { fieldPath: string; targets: string[] }) {
  const sourceLocale = authoringContract.value?.localization?.defaultLocale;
  if (!sourceLocale) return;
  saveError.value = "";
  void translationController
    .start({ ...payload, sourceLocale })
    .catch((cause: unknown) => {
      saveError.value = scenarioApiErrorMessage(
        cause,
        "Не удалось запустить перевод. Заполните варианты вручную или повторите позже.",
      );
    });
}

function retryTranslation(payload: { fieldPath: string; locale: string }) {
  void translationController.retry(payload.fieldPath, payload.locale).catch(
    (cause: unknown) => {
      saveError.value = scenarioApiErrorMessage(cause, "Не удалось повторить перевод.");
    },
  );
}

function cancelTranslation(fieldPath: string) {
  void translationController.cancel(fieldPath).catch((cause: unknown) => {
    saveError.value = scenarioApiErrorMessage(cause, "Не удалось отменить перевод.");
  });
}

function markTranslationManual(payload: { fieldPath: string; locale: string }) {
  translationStates[payload.fieldPath] = {
    ...(translationStates[payload.fieldPath] ?? {}),
    [payload.locale]: "MANUAL",
  };
}

const actionDefinitions = computed(() =>
  actionDefinitionsStore.forProject(auth.project?.id ?? ""),
);
const projectActions = computed(() =>
  projectActionsStore.actionsForProject(auth.project?.id ?? ""),
);
const scenarioPickerActionDefinitions = computed(() =>
  scenarioEligibleActionDefinitions(
    actionDefinitions.value,
    projectActions.value,
  ),
);
const selectedAction = computed(
  () =>
    form.actions.find((action) => action.nodeKey === selectedNodeKey.value) ??
    null,
);
const graphIssues = computed(() => validateScenarioGraph(form.actions));
const goalIssues = computed(() =>
  form.actions.flatMap((action) => {
    if (action.type !== "WAIT_FOR_GOAL") return [];
    if (!authoringContract.value)
      return [
        {
          nodeKey: action.nodeKey,
          message: "Каталог событий для проверки цели недоступен",
        },
      ];
    return validateGoalDraft(
      goalDraftFromConfig(action.config),
      authoringContract.value,
    )
      .filter(
        (issue) =>
          !["goal-branch-required", "timeout-branch-required"].includes(
            issue.code,
          ),
      )
      .map((issue) => ({ nodeKey: action.nodeKey, message: issue.message }));
  }),
);
const actionConfigIssues = computed(() =>
  form.actions.flatMap((action) => {
    const availabilityIssue = scenarioProjectActionAvailabilityIssue(
      action.type,
      projectActions.value,
    );
    if (availabilityIssue) {
      return [{ nodeKey: action.nodeKey, message: availabilityIssue }];
    }
    if (action.type === "WAIT_FOR_GOAL") return [];
    const message = validateScenarioActionConfig(
      action,
      findActionDefinition(actionDefinitions.value, action.type),
      authoringContract.value?.localization,
    );
    return message ? [{ nodeKey: action.nodeKey, message }] : [];
  }),
);
const actionIssues = computed(() => [
  ...graphIssues.value,
  ...goalIssues.value,
  ...actionConfigIssues.value,
]);
const selectedIssues = computed(() =>
  actionIssues.value
    .filter((issue) => issue.nodeKey === selectedNodeKey.value)
    .map((issue) => issue.message),
);
const formIsDirty = computed(
  () =>
    Boolean(initialSnapshot.value) &&
    JSON.stringify(form) !== initialSnapshot.value,
);
const ruleIsDirty = computed(
  () =>
    Boolean(initialRuleSnapshot.value) &&
    JSON.stringify(ruleDraft.value) !== initialRuleSnapshot.value,
);
const audienceIsDirty = computed(
  () =>
    Boolean(initialAudienceSnapshot.value) &&
    JSON.stringify(audienceDraft.value) !== initialAudienceSnapshot.value,
);
const deliveryIsDirty = computed(
  () =>
    Boolean(initialDeliverySnapshot.value) &&
    JSON.stringify(deliveryPolicy.value) !== initialDeliverySnapshot.value,
);
const localizationIsDirty = computed(
  () =>
    Boolean(initialLocalizationSnapshot.value) &&
    JSON.stringify(localizationPolicy.value) !== initialLocalizationSnapshot.value,
);
const durableSourceIsDirty = computed(
  () =>
    formIsDirty.value ||
    ruleIsDirty.value ||
    audienceIsDirty.value ||
    deliveryIsDirty.value ||
    localizationIsDirty.value,
);
const canManage = computed(
  () => auth.user?.role === "OWNER" || auth.user?.role === "ADMIN",
);
const canEdit = computed(() => canManage.value && authoringEditable.value);
const sourceSnapshotUnavailable = computed(
  () =>
    !authoringEditable.value &&
    authoringUnavailableReason.value === "SOURCE_SNAPSHOT_UNAVAILABLE",
);
const readonlyExplanation = computed(() =>
  sourceSnapshotUnavailable.value
    ? "Сценарий продолжает работать как раньше. Но исходные настройки этой версии не сохранились, поэтому открыть её в редакторе без потерь нельзя. Чтобы изменить логику, восстановите исходник на сервере или создайте новый сценарий вручную."
    : "Сценарий продолжает работать как раньше. Сейчас его настройки можно только просматривать.",
);
const isDirty = computed(
  () =>
    publishPending.value ||
    formIsDirty.value ||
    ruleIsDirty.value ||
    audienceIsDirty.value ||
    deliveryIsDirty.value ||
    localizationIsDirty.value ||
    ruleEditorDirty.value,
);
const publishBlockedReason = computed(() =>
  !form.id
    ? "Сначала сохраните новый сценарий и его граф."
    : !authoringEditable.value
      ? "Исходные настройки этой версии недоступны. Опубликованную модель выполнения нельзя безопасно восстановить."
      : durableSourceIsDirty.value
        ? "Сначала сохраните все изменения условий, аудитории, действий, целей и доставки, затем публикуйте сохранённую версию черновика."
        : actionIssues.value.length
          ? `Исправьте ошибки действий и целей (${actionIssues.value.length}), затем публикуйте версию V2.`
          : "",
);
const { confirmDiscard } = useUnsavedChangesGuard(
  isDirty,
  "Есть несохранённые изменения сценария. Покинуть редактор?",
);
onBeforeRouteLeave(() => {
  if (!publishPending.value) return true;
  saveError.value =
    "Дождитесь завершения публикации, чтобы не потерять её результат.";
  return false;
});
const selectedEvent = computed(() =>
  events.value.find((event) => event.id === form.eventDefinitionId),
);
const selectedAuthoringEvent = computed(() =>
  authoringContract.value?.events.find(
    (event) => event.definitionId === form.eventDefinitionId,
  ),
);
const ruleContext = computed<RuleDomainContext | null>(() =>
  authoringContract.value && selectedAuthoringEvent.value
    ? {
        triggerEventDefinitionId: selectedAuthoringEvent.value.definitionId,
        triggerEventCode: selectedAuthoringEvent.value.code,
        mode: "initialEligibility",
        contract: authoringContract.value,
      }
    : null,
);
const ruleSummary = computed(() =>
  ruleContext.value ? summarizeRule(ruleDraft.value, ruleContext.value) : null,
);
const audienceContext = computed<AudienceDomainContext | null>(() =>
  authoringContract.value?.audience
    ? {
        catalog: authoringContract.value.audience,
        segments: audienceSegments.value,
      }
    : null,
);
const audienceSummary = computed(() =>
  audienceContext.value
    ? summarizeAudience(audienceDraft.value, audienceContext.value)
    : null,
);
const stages = computed<
  Array<{
    key: StudioStage;
    label: string;
    detail: string;
    status: "empty" | "draft" | "invalid" | "valid" | "unavailable";
  }>
>(() => [
  {
    key: "trigger",
    label: "Запуск",
    detail: "Событие запуска",
    status: selectedAuthoringEvent.value ? "valid" : "invalid",
  },
  {
    key: "audience",
    label: "Аудитория",
    detail: sourceSnapshotUnavailable.value
      ? "Исходные настройки недоступны"
      : audienceContext.value
      ? (audienceSummary.value?.text ?? "Без ограничений")
      : "Пока недоступна",
    status: sourceSnapshotUnavailable.value
      ? "unavailable"
      : !audienceContext.value
      ? "unavailable"
      : audienceSummary.value?.status === "ready"
        ? "valid"
        : audienceSummary.value?.status === "empty"
          ? "empty"
          : "invalid",
  },
  {
    key: "eligibility",
    label: "Условия",
    detail: sourceSnapshotUnavailable.value
      ? "Исходные условия недоступны"
      : (ruleSummary.value?.text ?? "Выберите событие"),
    status: sourceSnapshotUnavailable.value
      ? "unavailable"
      : ruleSummary.value?.status === "ready"
        ? "valid"
        : ruleSummary.value?.status === "empty"
          ? "empty"
          : "invalid",
  },
  {
    key: "actions",
    label: "Действия",
    detail: `${form.actions.length} узлов · ${form.actions.filter((action) => action.type === "WAIT_FOR_GOAL").length} целей`,
    status: actionIssues.value.length
      ? "invalid"
      : form.actions.length
        ? "valid"
        : "empty",
  },
  {
    key: "delivery",
    label: "Доставка",
    detail: sourceSnapshotUnavailable.value
      ? "Исходные настройки недоступны"
      : deliveryPolicySummary(deliveryPolicy.value),
    status: sourceSnapshotUnavailable.value
      ? "unavailable"
      : serializeDeliveryPolicy(deliveryPolicy.value).ok
      ? "valid"
      : "invalid",
  },
]);
const eventOptions = computed(() =>
  events.value
    .filter((event) => event.enabled || event.id === form.eventDefinitionId)
    .map((event) => ({
      label: eventDisplayName(event.code, event.name),
      value: event.id,
      code: event.code,
    })),
);
const conditionPaths = computed(() => {
  const eventFields = Object.keys(
    selectedEvent.value?.payloadSchema?.properties ?? {},
  );
  const nodeKeys = form.actions.map((action) => action.nodeKey).filter(Boolean);
  const audience = authoringContract.value?.audience;
  const profilePaths =
    audience?.version === 2
      ? (
          templateAttributeKeys.value ??
          audience.attributes
            .filter(
              (attribute) => attribute.authoringAvailability === "AVAILABLE",
            )
            .map((attribute) => attribute.key)
        ).map((key) => `user.attributes.${key}`)
      : ["user.segment", "user.locale", "user.isGuest"];
  return [
    ...eventFields.map((field) => `event.payload.${field}`),
    ...profilePaths,
    "project.id",
    "scenario.code",
    ...nodeKeys.flatMap((key) => [
      `answers.${key}.optionId`,
      `results.${key}.result`,
    ]),
  ];
});
const triggerConditionPaths = computed(() =>
  conditionPaths.value.filter(
    (path) => !path.startsWith("answers.") && !path.startsWith("results."),
  ),
);
const templateVariables = computed(() => {
  const typedByPath = new Map(
    templateAttributes.value.map((attribute) => [
      `user.attributes.${attribute.key}`,
      attribute,
    ]),
  );
  return conditionPaths.value
    .filter((path) => path.startsWith("event.") || path.startsWith("user."))
    .map((path) => {
      const value = `{{ ${path} }}`;
      const attribute = typedByPath.get(path);
      return attribute
        ? {
            value,
            label: attribute.label,
            meta: `${attribute.valueType}${attribute.lifecycle === "DEPRECATED" ? ` · устарело${attribute.replacementDefinitionId ? ` · замена: ${attribute.replacementDefinitionId}` : ""}` : ""}`,
            disabled: attribute.lifecycle === "DEPRECATED",
          }
        : { value, label: path, meta: "Данные текущего запуска" };
    });
});
const statusOptions = [
  { label: "Черновик", value: "DRAFT" },
  { label: "На паузе", value: "PAUSED" },
  { label: "В архиве", value: "ARCHIVED" },
];
const conversationPolicyOptions: {
  label: string;
  value: ConversationPolicy;
}[] = [
  { label: "Создать новый чат", value: "create_new" },
  { label: "Продолжить текущий чат", value: "reuse_active" },
];
const flowNodeTypes = markRaw({ scenario: ScenarioFlowNode });

const actionGroups = computed(() => {
  const enabled = scenarioPickerActionDefinitions.value;
  return [
    {
      label: "Логика",
      items: enabled.filter((item) =>
        ["ASK_CHOICE", "CONDITION"].includes(item.type),
      ),
    },
    {
      label: "Ожидания",
      items: enabled.filter((item) =>
        ["WAIT_FOR", "WAIT_FOR_GOAL"].includes(item.type),
      ),
    },
    {
      label: "Действия",
      items: enabled.filter(
        (item) =>
          !["ASK_CHOICE", "CONDITION", "WAIT_FOR", "WAIT_FOR_GOAL"].includes(
            item.type,
          ),
      ),
    },
  ].filter((group) => group.items.length);
});

const flowNodes = computed<Node[]>(() => {
  const transitions = graphTransitions(form.actions);
  const depth = new Map<string, number>();
  form.actions.forEach((action, index) =>
    depth.set(action.nodeKey ?? "", index ? 1 : 0),
  );
  for (const action of form.actions) {
    const sourceDepth = depth.get(action.nodeKey ?? "") ?? 0;
    for (const transition of transitions.filter(
      (item) => item.source === action.nodeKey,
    )) {
      depth.set(
        transition.target,
        Math.max(depth.get(transition.target) ?? 0, sourceDepth + 1),
      );
    }
  }
  const levels = new Map<number, ScenarioAction[]>();
  for (const action of form.actions) {
    const level = depth.get(action.nodeKey ?? "") ?? action.position;
    levels.set(level, [...(levels.get(level) ?? []), action]);
  }
  const nodes: Node[] = [
    {
      id: "trigger",
      type: "input",
      position: { x: 332, y: 24 },
      sourcePosition: Position.Bottom,
      selectable: false,
      draggable: false,
      data: {
        label: selectedEvent.value
          ? eventDisplayName(selectedEvent.value.code, selectedEvent.value.name)
          : "Выберите событие",
      },
    },
  ];
  for (const [level, actions] of levels) {
    actions.forEach((action, column) => {
      const definition = findActionDefinition(
        actionDefinitions.value,
        action.type,
      );
      const totalWidth = (actions.length - 1) * 280;
      nodes.push({
        id: action.nodeKey ?? `step_${action.position}`,
        type: "scenario",
        position: {
          x: 320 - totalWidth / 2 + column * 280,
          y: 180 + level * 190,
        },
        data: {
          label: definition?.name ?? action.type,
          nodeKey: action.nodeKey,
          icon:
            action.type === "CONDITION"
              ? "pi pi-code"
              : action.type === "ASK_CHOICE"
                ? "pi pi-question-circle"
                : definition?.executor === "FRONTEND"
                  ? "pi pi-desktop"
                  : "pi pi-server",
          executor: definition?.executor ?? "SERVER",
          summary: nodeSummary(action),
          issueCount: actionIssues.value.filter(
            (issue) => issue.nodeKey === action.nodeKey,
          ).length,
        },
      });
    });
  }
  return nodes;
});

const flowEdges = computed<Edge[]>(() => {
  const edges: Edge[] = form.actions[0]?.nodeKey
    ? [
        {
          id: "trigger-edge",
          source: "trigger",
          target: form.actions[0].nodeKey,
          type: "smoothstep",
          animated: true,
        },
      ]
    : [];
  graphTransitions(form.actions).forEach((transition, index) =>
    edges.push({
      id: `${transition.source}-${transition.target}-${transition.kind}-${index}`,
      source: transition.source,
      target: transition.target,
      label: transition.label,
      type: "smoothstep",
      animated: transition.kind === "default",
      style: {
        stroke:
          transition.kind === "timeout"
            ? "var(--status-danger)"
            : transition.kind === "fallback"
              ? "var(--graph-edge)"
              : "var(--graph-selection)",
        strokeWidth: 2,
      },
      labelStyle: {
        fill: "var(--text-secondary)",
        fontSize: 11,
        fontWeight: 600,
      },
      labelBgStyle: { fill: "var(--graph-node)", fillOpacity: 0.92 },
    }),
  );
  return edges;
});

watch(
  () => form.name,
  (name) => {
    if (!codeTouched.value) form.code = slugify(name);
  },
);

function syncCompactActionLayout(event: MediaQueryListEvent | MediaQueryList) {
  compactActionLayout.value = event.matches;
}

onMounted(() => {
  if (typeof window !== "undefined" && window.matchMedia) {
    compactActionMedia = window.matchMedia("(max-width: 1024px)");
    syncCompactActionLayout(compactActionMedia);
    compactActionMedia.addEventListener("change", syncCompactActionLayout);
  }
  void load();
});

onBeforeUnmount(() => {
  compactActionMedia?.removeEventListener("change", syncCompactActionLayout);
  translationController.dispose();
});

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  loading.value = true;
  error.value = "";
  authoringError.value = "";
  audienceSegmentsError.value = "";
  actionsError.value = "";
  templatePolicyError.value = "";
  templateAttributeKeys.value = null;
  templateAttributes.value = [];
  templatePolicyWarnings.value = [];
  resetAuthoringDocument();
  ruleDraft.value = createRuleDraft();
  audienceDraft.value = createAudienceDraft();
  deliveryPolicy.value = createDeliveryPolicyDraft();
  localizationPolicy.value = defaultLocalizationPolicy();
  try {
    const [scenarios] = await Promise.all([
      repository.getScenarios(projectId),
      repository.getEvents(projectId).then((value) => {
        events.value = value;
      }),
      repository.getElements(projectId).then((value) => {
        elements.value = value;
      }),
      actionDefinitionsStore.ensureLoaded(projectId).catch((cause: unknown) => {
        actionsError.value = scenarioApiErrorMessage(cause);
      }),
      projectActionsStore.ensureLoaded(projectId).catch((cause: unknown) => {
        actionsError.value = scenarioApiErrorMessage(
          cause,
          "Не удалось загрузить настройки Project Actions",
        );
      }),
      scenarioAuthoringRepository
        .getContract(projectId)
        .then(async (value) => {
          authoringContract.value = value;
          if (value.audience) await refreshAudienceSegments();
        })
        .catch((cause: unknown) => {
          authoringError.value = scenarioApiErrorMessage(cause);
        }),
      repository.mode === "api"
        ? attributeContractRepository
            .workspace(projectId)
            .then((workspace) => {
              const publishedFields = workspace.currentRevision?.fields ?? [];
              templateAttributeKeys.value = publishedFields
                .filter(
                  (field) =>
                    field.policies.templateRead &&
                    field.lifecycle !== "ARCHIVED",
                )
                .map((field) => field.key);
              templateAttributes.value = publishedFields
                .filter(
                  (field) =>
                    field.policies.templateRead &&
                    field.lifecycle !== "ARCHIVED",
                )
                .map((field) => ({
                  key: field.key,
                  label: field.label,
                  valueType: field.valueType,
                  lifecycle: field.lifecycle,
                  replacementDefinitionId: field.replacementDefinitionId,
                }));
              templatePolicyWarnings.value = publishedFields
                .filter(
                  (field) =>
                    field.policies.templateRead &&
                    field.lifecycle === "DEPRECATED",
                )
                .map(
                  (field) =>
                    `${field.label} (${field.key}) устарело${field.replacementDefinitionId ? `; используйте вместо него ${field.replacementDefinitionId}` : ""}.`,
                );
            })
            .catch((cause: unknown) => {
              templateAttributeKeys.value = [];
              templatePolicyError.value = scenarioApiErrorMessage(cause);
            })
        : Promise.resolve(),
    ]);
    const scenarioId =
      typeof route.params.scenarioId === "string"
        ? route.params.scenarioId
        : "";
    const scenario =
      scenarioId && scenarioId !== "new"
        ? scenarios.find((item) => item.id === scenarioId)
        : null;
    if (scenarioId && scenarioId !== "new" && !scenario)
      throw new Error("Сценарий не найден");
    if (scenario) {
      Object.assign(form, {
        id: scenario.id,
        code: scenario.code,
        name: scenario.name,
        description: scenario.description ?? "",
        eventDefinitionId: scenario.eventDefinitionId,
        status: scenario.status,
        conversationPolicy: scenario.conversationPolicy ?? "create_new",
        priority: scenario.priority,
        conditions: structuredClone(scenario.conditions ?? []),
        cooldownSeconds: scenario.cooldownSeconds,
        maxRunsPerUser: scenario.maxRunsPerUser,
        activeFrom: scenario.activeFrom,
        activeTo: scenario.activeTo,
        actions: normalizeScenarioActions(scenario.actions),
      });
      codeTouched.value = true;
      const document = await loadAuthoringDocument(projectId, scenario.id);
      const durableSource = document.draft ?? document.source;
      if (durableSource) {
        const restored = restoreScenarioAuthoringSource(
          durableSource,
          ruleContext.value,
          audienceContext.value,
        );
        ruleDraft.value = restored.rule;
        audienceDraft.value = restored.audience;
        deliveryPolicy.value = restored.delivery;
        localizationPolicy.value = restored.localization;
        if (restored.actions) form.actions = restored.actions;
      }
    } else {
      const catalogDefinitionIds = new Set(
        authoringContract.value?.events.map((event) => event.definitionId) ??
          [],
      );
      form.eventDefinitionId =
        events.value.find(
          (event) => event.enabled && catalogDefinitionIds.has(event.id),
        )?.id ??
        events.value.find((event) => event.enabled)?.id ??
        "";
    }
    if (authoringContract.value?.localization?.enabled) {
      form.actions.splice(
        0,
        form.actions.length,
        ...normalizeLocalizedActionContent(
          form.actions,
          authoringContract.value.localization,
        ),
      );
    }
    initialSnapshot.value = JSON.stringify(form);
    initialRuleSnapshot.value = JSON.stringify(ruleDraft.value);
    initialAudienceSnapshot.value = JSON.stringify(audienceDraft.value);
    initialDeliverySnapshot.value = JSON.stringify(deliveryPolicy.value);
    initialLocalizationSnapshot.value = JSON.stringify(localizationPolicy.value);
    await translationController.recover();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось открыть редактор";
  } finally {
    loading.value = false;
  }
}

async function refreshAuthoringContract(): Promise<ScenarioAuthoringContract> {
  const projectId = auth.project?.id;
  if (!projectId) throw new Error("Проект не выбран");
  authoringError.value = "";
  try {
    const contract = await scenarioAuthoringRepository.getContract(projectId);
    authoringContract.value = contract;
    if (contract.audience) await refreshAudienceSegments();
    return contract;
  } catch (cause) {
    authoringError.value = scenarioApiErrorMessage(cause);
    throw cause;
  }
}

async function refreshAudienceSegments() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  audienceSegmentsError.value = "";
  try {
    const response = await scenarioAuthoringRepository.searchSegments(
      projectId,
      { limit: 100 },
    );
    audienceSegments.value = response.items;
  } catch (cause) {
    audienceSegmentsError.value = scenarioApiErrorMessage(
      cause,
      "Не удалось загрузить сегменты аудитории",
    );
  }
}

async function searchAudienceSegments(query: string) {
  const projectId = auth.project?.id;
  if (!projectId) return [];
  const response = await scenarioAuthoringRepository.searchSegments(projectId, {
    query: query || undefined,
    limit: 25,
  });
  const merged = new Map(
    audienceSegments.value.map((segment) => [segment.segmentId, segment]),
  );
  response.items.forEach((segment) => merged.set(segment.segmentId, segment));
  audienceSegments.value = [...merged.values()];
  return response.items;
}

function selectStage(stage: StudioStage) {
  if (stage !== studioStage.value && publishPending.value) {
    saveError.value =
      "Публикация ещё выполняется. Дождитесь результата, прежде чем менять этап.";
    return;
  }
  if (stage !== studioStage.value && ruleEditorDirty.value) {
    if (
      !window.confirm(
        "В условии есть несохранённые изменения. Закрыть его и перейти к другому этапу?",
      )
    )
      return;
    ruleEditorDirty.value = false;
  }
  studioStage.value = stage;
  if (stage === "trigger") {
    inspectorMode.value = "settings";
    selectedNodeKey.value = null;
  }
}

function updateRuleDraft(next: RuleDraft) {
  ruleDraft.value = next;
  ruleDraftRevision.value += 1;
  saveNotice.value = "";
}

function updateAudienceDraft(next: AudienceDraft) {
  audienceDraft.value = next;
  audienceDraftRevision.value += 1;
  saveNotice.value = "";
}

function focusRuleIssue(target: {
  nodeId?: string;
  fieldPath?: string;
  message?: string;
}) {
  studioStage.value = "eligibility";
  validationOpen.value = false;
  void nextTick(() => {
    ruleBuilder.value?.focusIssue(target);
  });
}

function focusAudienceIssue(target: {
  nodeId?: string;
  fieldPath?: string;
  message?: string;
}) {
  studioStage.value = "audience";
  void nextTick(() => audienceBuilder.value?.focusIssue(target));
}

function focusDraftIssue(issue: {
  code: string;
  path: string;
  message: string;
  locale?: string;
}) {
  if (issue.path.startsWith("audience")) {
    const serialized = audienceContext.value
      ? serializeAudienceDraft(audienceDraft.value, audienceContext.value)
      : null;
    const mapped = serialized?.ok
      ? mapAudienceIssues([issue], serialized.pathIndex)[0]
      : undefined;
    focusAudienceIssue({
      nodeId: mapped?.nodeId,
      fieldPath: mapped?.fieldPath,
      message: issue.message,
    });
    return;
  }
  if (issue.path.startsWith("deliveryPolicy")) {
    studioStage.value = "delivery";
    void nextTick(() => deliveryEditor.value?.focusIssue(issue.path));
    return;
  }
  if (
    issue.path.startsWith("graph") ||
    issue.path.includes("actions") ||
    issue.path.includes("goal")
  ) {
    studioStage.value = "actions";
    const index = Number(issue.path.match(/actions(?:\.|\[)(\d+)/)?.[1]);
    const action = Number.isInteger(index) ? form.actions[index] : undefined;
    selectedNodeKey.value = action?.nodeKey ?? null;
    inspectorMode.value = action ? "node" : "settings";
    if (action) {
      const projectLocales = new Set(
        authoringContract.value?.localization?.locales.map(({ code }) => code) ?? [],
      );
      const segments = issue.path.split(".");
      const pathLocale =
        issue.locale ??
        [...segments].reverse().find((segment) => projectLocales.has(segment));
      if (pathLocale && segments.at(-1) === pathLocale) segments.pop();
      let suffix = segments.slice(3).join(".");
      const optionMatch = suffix.match(/^config\.options\.(\d+)\.label$/);
      if (optionMatch) {
        const option = choiceOptions(action)[Number(optionMatch[1])];
        if (option) suffix = `config.options.${option.id}.label`;
      }
      focusedLocalizedFieldPath.value = `graph.actions.${action.nodeKey}.${suffix}`;
      focusedLocale.value = pathLocale ?? "";
    }
    return;
  }
  const serialized = ruleContext.value
    ? serializeRuleDraft(ruleDraft.value, ruleContext.value)
    : null;
  const mapped = serialized?.ok
    ? mapBackendRuleIssues([issue], serialized.pathIndex)[0]
    : undefined;
  focusRuleIssue({
    nodeId: mapped?.nodeId,
    fieldPath: mapped?.fieldPath,
    message: issue.message,
  });
}

async function reloadAfterConflict() {
  if (
    isDirty.value &&
    !window.confirm(
      "Локальные изменения будут заменены актуальным черновиком с сервера. Продолжить?",
    )
  )
    return;
  await load();
}

function requireDraftResave() {
  saveNotice.value =
    "Каталог изменился. Проверьте поля и снова сохраните черновик перед публикацией.";
}

function published(
  revisionId: string,
  snapshot: {
    ruleSnapshot: string;
    audienceSnapshot?: string;
    deliverySnapshot: string;
    authoringSnapshot: string;
  },
) {
  currentRevisionId.value = revisionId;
  currentDraftVersion.value = null;
  const currentRuleSnapshot = JSON.stringify(ruleDraft.value);
  const currentAudienceSnapshot = JSON.stringify(audienceDraft.value);
  const currentDeliverySnapshot = JSON.stringify(deliveryPolicy.value);
  const currentAuthoringSnapshot = JSON.stringify(form);
  if (currentRuleSnapshot === snapshot.ruleSnapshot)
    initialRuleSnapshot.value = currentRuleSnapshot;
  if (snapshot.audienceSnapshot === currentAudienceSnapshot)
    initialAudienceSnapshot.value = currentAudienceSnapshot;
  if (currentDeliverySnapshot === snapshot.deliverySnapshot)
    initialDeliverySnapshot.value = currentDeliverySnapshot;
  form.status = "ACTIVE";
  if (currentAuthoringSnapshot === snapshot.authoringSnapshot)
    initialSnapshot.value = JSON.stringify(form);
  saveNotice.value =
    currentRuleSnapshot === snapshot.ruleSnapshot &&
    (!snapshot.audienceSnapshot ||
      currentAudienceSnapshot === snapshot.audienceSnapshot) &&
    currentDeliverySnapshot === snapshot.deliverySnapshot &&
    currentAuthoringSnapshot === snapshot.authoringSnapshot
      ? `Опубликована неизменяемая версия ${revisionId}. Новые запуски будут использовать её.`
      : `Опубликована неизменяемая версия ${revisionId}, но в этой вкладке уже есть более новые изменения. Проверьте и опубликуйте их отдельно.`;
}

async function revisionHeadChanged(revisionId: string) {
  currentRevisionId.value = revisionId;
  saveNotice.value = `Создана новая версия ${revisionId} на основе выбранной. Загружены её исходные настройки.`;
  await load();
}

function nodeSummary(action: ScenarioAction) {
  const displayText = (value: unknown) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const map = value as Record<string, unknown>;
      const defaultLocale = authoringContract.value?.localization?.defaultLocale;
      const preferred = defaultLocale ? map[defaultLocale] : undefined;
      if (typeof preferred === "string") return preferred;
      return Object.values(map).find((item): item is string => typeof item === "string") ?? "";
    }
    return "";
  };
  if (action.type === "ASK_CHOICE")
    return displayText(action.config.message) || "Настройте вопрос и варианты ответа";
  if (action.type === "CONDITION")
    return `${Array.isArray(action.config.branches) ? action.config.branches.length : 0} runtime-веток + fallback`;
  if (action.type === "WAIT_FOR_GOAL") {
    return authoringContract.value
      ? summarizeGoalDraft(
          goalDraftFromConfig(action.config),
          authoringContract.value,
        )
      : "Настройте цель · конечный срок · 2 ветки";
  }
  const first = Object.values(action.config).map(displayText).find(Boolean);
  return first
    ? first
    : "Настройте параметры действия";
}

function appendNode(type: string, connectPrevious: boolean) {
  const definition = findActionDefinition(actionDefinitions.value, type);
  const node = createScenarioNode(
    type,
    form.actions.length,
    form.actions.map((action) => action.nodeKey ?? ""),
  );
  node.config = {
    ...(definition ? createActionConfig(definition) : {}),
    ...node.config,
  };
  const previous = form.actions.at(-1);
  if (
    connectPrevious &&
    previous &&
    !["ASK_CHOICE", "CONDITION", "WAIT_FOR_GOAL"].includes(previous.type) &&
    !previous.nextNodeKey
  )
    previous.nextNodeKey = node.nodeKey;
  form.actions.push(node);
  if (authoringContract.value?.localization?.enabled) {
    const [localizedNode] = normalizeLocalizedActionContent(
      [node],
      authoringContract.value.localization,
    );
    if (localizedNode) form.actions[form.actions.length - 1] = localizedNode;
  }
  selectedNodeKey.value = node.nodeKey ?? null;
  inspectorMode.value = "node";
  studioStage.value = "actions";
  return node;
}

function addNode(type: string) {
  appendNode(type, true);
}

function createTarget(
  type: string,
  kind: "next" | "choice" | "timeout" | "condition" | "fallback",
  index?: number,
) {
  const source = selectedAction.value;
  if (!source) return;
  const node = appendNode(type, false);
  const target = node.nodeKey ?? "";
  if (kind === "next") source.nextNodeKey = target;
  else if (kind === "choice" && index !== undefined)
    source.config.options = choiceOptions(source).map((option, optionIndex) =>
      optionIndex === index ? { ...option, nextNodeKey: target } : option,
    );
  else if (kind === "timeout") source.config.onTimeout = target;
  else if (kind === "condition" && index !== undefined)
    source.config.branches = conditionBranches(source).map(
      (branch, branchIndex) =>
        branchIndex === index ? { ...branch, nextNodeKey: target } : branch,
    );
  else if (kind === "fallback") source.config.fallbackNodeKey = target;
}

function selectNode(event: { node: Node }) {
  if (event.node.id === "trigger") {
    selectStage("trigger");
    return;
  }
  selectedNodeKey.value = event.node.id;
  inspectorMode.value = "node";
  studioStage.value = "actions";
}

function openNode(nodeKey: string) {
  selectedNodeKey.value = nodeKey;
  inspectorMode.value = "node";
  studioStage.value = "actions";
}

function closeNodeInspector() {
  selectedNodeKey.value = null;
  inspectorMode.value = "settings";
}

function changeType(type: string) {
  if (!selectedAction.value) return;
  const definition = findActionDefinition(actionDefinitions.value, type);
  selectedAction.value.type = type;
  selectedAction.value.config = {
    ...(definition ? createActionConfig(definition) : {}),
    ...createScenarioNode(
      type,
      selectedAction.value.position,
      form.actions.map((item) => item.nodeKey ?? ""),
    ).config,
  };
  selectedAction.value.nextNodeKey = null;
  if (authoringContract.value?.localization?.enabled) {
    const [localizedAction] = normalizeLocalizedActionContent(
      [selectedAction.value],
      authoringContract.value.localization,
    );
    if (localizedAction) updateSelected(localizedAction);
  }
}

function updateSelected(action: ScenarioAction) {
  const index = form.actions.findIndex(
    (item) => item.nodeKey === selectedNodeKey.value,
  );
  if (index < 0) return;
  form.actions.splice(
    index,
    1,
    action.type === "WAIT_FOR_GOAL" ? { ...action, nextNodeKey: null } : action,
  );
  form.actions.splice(
    0,
    form.actions.length,
    ...sortScenarioActions(form.actions),
  );
}

function renameNode(oldKey: string, newKey: string) {
  if (renameScenarioNode(form.actions, oldKey, newKey))
    selectedNodeKey.value = newKey;
}

function removeSelected() {
  const action = selectedAction.value;
  if (!action) return;
  const referenced = graphTransitions(form.actions).some(
    (transition) => transition.target === action.nodeKey,
  );
  if (referenced) {
    saveError.value = `Сначала удалите переходы в узел «${action.nodeKey}».`;
    return;
  }
  if (!window.confirm(`Удалить узел «${action.nodeKey}»?`)) return;
  form.actions.splice(action.position, 1);
  normalizePositions(form.actions);
  selectedNodeKey.value = null;
  inspectorMode.value = "settings";
}

async function save() {
  if (!canEdit.value) {
    saveError.value =
      authoringUnavailableReason.value ??
      "Исходные настройки доступны только для просмотра.";
    return;
  }
  if (publishPending.value) {
    saveError.value = "Дождитесь завершения публикации.";
    return;
  }
  saveError.value = "";
  saveNotice.value = "";
  draftConflict.value = false;
  if (!form.name.trim() || !form.code.trim() || !form.eventDefinitionId) {
    saveError.value = "Заполните название, код и событие запуска.";
    inspectorMode.value = "settings";
    return;
  }
  const issues = graphIssues.value;
  if (issues.length) {
    saveError.value = `Граф содержит ошибок: ${issues.length}. Исправьте отмеченные узлы.`;
    return;
  }
  if (goalIssues.value.length) {
    const issue = goalIssues.value[0]!;
    saveError.value = `Цель в узле «${issue.nodeKey}»: ${issue.message}`;
    selectedNodeKey.value = issue.nodeKey ?? null;
    inspectorMode.value = "node";
    studioStage.value = "actions";
    return;
  }
  for (const action of form.actions) {
    const configError = validateScenarioActionConfig(
      action,
      findActionDefinition(actionDefinitions.value, action.type),
      authoringContract.value?.localization,
    );
    if (configError) {
      saveError.value = `${action.nodeKey}: ${configError}`;
      selectedNodeKey.value = action.nodeKey ?? null;
      inspectorMode.value = "node";
      return;
    }
  }
  const projectId = auth.project?.id;
  if (!projectId) return;
  const context = ruleContext.value;
  if (!context) {
    saveError.value = "Каталог события запуска недоступен";
    return;
  }
  const currentRuleSummary = summarizeRule(ruleDraft.value, context);
  const ruleResult =
    currentRuleSummary.status === "empty"
      ? null
      : serializeRuleDraft(ruleDraft.value, context);
  if (ruleResult && !ruleResult.ok) {
    studioStage.value = "eligibility";
    saveError.value =
      ruleResult.issues[0]?.message ?? "Черновик условий заполнен не полностью";
    return;
  }
  const audienceSummaryValue = audienceContext.value
    ? summarizeAudience(audienceDraft.value, audienceContext.value)
    : null;
  const audienceResult =
    audienceContext.value && audienceSummaryValue?.status !== "empty"
      ? serializeAudienceDraft(audienceDraft.value, audienceContext.value)
      : null;
  if (audienceResult && !audienceResult.ok) {
    studioStage.value = "audience";
    saveError.value =
      audienceResult.issues[0]?.message ??
      "Черновик аудитории заполнен не полностью";
    return;
  }
  const deliveryResult = serializeDeliveryPolicy(deliveryPolicy.value);
  if (!deliveryResult.ok) {
    studioStage.value = "delivery";
    saveError.value =
      deliveryResult.issues[0]?.message ??
      "Политика доставки заполнена не полностью";
    return;
  }
  saving.value = true;
  try {
    const existingScenarioId = form.id;
    const payload: SaveScenario = {
      ...form,
      name: form.name.trim(),
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      cooldownSeconds: form.cooldownSeconds || undefined,
      maxRunsPerUser: form.maxRunsPerUser || undefined,
      actions: form.actions.map((action, position) => ({
        ...toPlainScenarioAction(action),
        position,
      })),
    };
    const scenarioId =
      existingScenarioId ??
      (await repository.saveScenario(projectId, payload)).id;
    form.id = scenarioId;
    const draft = await saveAuthoringDraft(projectId, scenarioId, {
      catalogRevision: context.contract.revision,
      ...(ruleResult?.ok ? { rule: ruleResult.value } : {}),
      ...(audienceResult?.ok ? { audience: audienceResult.value } : {}),
      ...(audienceContext.value?.catalog.version === 2
        ? {
            profileFreshness: audienceDraft.value.freshness ?? {
              mode: "USE_LAST_KNOWN",
            },
          }
        : {}),
      deliveryPolicy: deliveryResult.value,
      ...(authoringContract.value?.localization?.enabled
        ? { localization: localizationPolicy.value }
        : {}),
      graph: {
        actions: form.actions.map((action, position) => ({
          ...toPlainScenarioAction(action),
          position,
        })),
      },
    });
    if (existingScenarioId) {
      const metadata: UpdateScenarioMetadata = {
        name: payload.name,
        description: payload.description,
        eventDefinitionId: payload.eventDefinitionId,
        status: payload.status,
        conversationPolicy: payload.conversationPolicy,
        priority: payload.priority,
        conditions: payload.conditions,
        cooldownSeconds: payload.cooldownSeconds,
        maxRunsPerUser: payload.maxRunsPerUser,
        activeFrom: payload.activeFrom,
        activeTo: payload.activeTo,
      };
      await repository.updateScenarioMetadata(projectId, scenarioId, metadata);
    }
    initialSnapshot.value = JSON.stringify(form);
    initialRuleSnapshot.value = JSON.stringify(ruleDraft.value);
    initialAudienceSnapshot.value = JSON.stringify(audienceDraft.value);
    initialDeliverySnapshot.value = JSON.stringify(deliveryPolicy.value);
    initialLocalizationSnapshot.value = JSON.stringify(localizationPolicy.value);
    for (const states of Object.values(translationStates)) {
      for (const [locale, state] of Object.entries(states)) {
        if (state === "MACHINE_UNSAVED") delete states[locale];
      }
    }
    saveNotice.value = `Черновик v${draft.version} сохранён на сервере. Публикация будет использовать именно эту версию.`;
    if (route.params.scenarioId === "new")
      await router.replace({ name: "scenario-edit", params: { scenarioId } });
  } catch (cause) {
    saveError.value = draftConflict.value
      ? "Черновик изменён в другой вкладке. Локальные изменения не перезаписаны."
      : scenarioApiErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}

function leave() {
  if (publishPending.value) {
    saveError.value =
      "Дождитесь завершения публикации, чтобы не потерять её результат.";
    return;
  }
  if (confirmDiscard()) router.push("/scenarios");
}
</script>

<template>
  <div class="scenario-studio">
    <header class="studio-header">
      <div class="header-left">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          aria-label="Назад к сценариям"
          @click="leave"
        />
        <div>
          <span>Редактор сценария</span
          ><strong>{{ form.name || "Новый сценарий" }}</strong>
        </div>
      </div>
      <div class="header-center">
        <span>{{
          stages.find((stage) => stage.key === studioStage)?.label
        }}</span
        ><span v-if="currentDraftVersion"
          >Черновик v{{ currentDraftVersion }}</span
        ><span
          :class="{
            invalid:
              actionIssues.length ||
              ruleSummary?.status === 'incomplete' ||
              audienceSummary?.status === 'invalid' ||
              audienceSummary?.status === 'unsupported',
          }"
          >{{
            actionIssues.length
              ? `${actionIssues.length} ошибок действий`
              : audienceSummary?.status === "invalid"
                ? "Исправьте аудиторию"
                : audienceSummary?.status === "unsupported"
                  ? "Аудитория только для чтения"
                  : ruleSummary?.status === "ready"
                    ? "Условия готовы"
                    : "Черновик"
          }}</span
        >
      </div>
      <div class="header-actions">
        <Button
          label="Отмена"
          severity="secondary"
          outlined
          :disabled="publishPending"
          @click="leave"
        /><Button
          v-if="authoringEditable"
          label="Сохранить"
          icon="pi pi-check"
          :loading="saving"
          :disabled="publishPending || !canEdit"
          @click="save"
        />
      </div>
    </header>

    <Message v-if="error" severity="error" class="page-error">{{
      error
    }}</Message>
    <div v-else-if="loading" class="studio-loading">
      <i class="pi pi-spin pi-spinner" /><span>Загружаем редактор…</span>
    </div>
    <template v-else>
      <Message
        v-if="saveError"
        severity="error"
        class="save-error"
        closable
        @close="saveError = ''"
        ><span>{{ saveError }}</span
        ><Button
          v-if="draftConflict"
          label="Загрузить актуальный черновик"
          size="small"
          text
          @click="reloadAfterConflict"
      /></Message>
      <Message
        v-if="saveNotice"
        severity="info"
        class="save-error"
        closable
        @close="saveNotice = ''"
        >{{ saveNotice }}</Message
      >
      <section
        v-if="!authoringEditable"
        class="readonly-notice"
        role="status"
        aria-label="Сценарий открыт для просмотра"
      >
        <i class="pi pi-eye" />
        <div>
          <strong>Сценарий открыт для просмотра</strong>
          <p>{{ readonlyExplanation }}</p>
        </div>
        <Button
          v-if="canManage"
          label="Создать новый сценарий"
          size="small"
          severity="secondary"
          outlined
          @click="router.push({ name: 'scenario-create' })"
        />
      </section>
      <div
        class="studio-grid"
        :class="[
          `stage-${studioStage}`,
          {
            'has-action-inspector':
              studioStage === 'actions' && Boolean(selectedAction),
          },
        ]"
      >
        <aside class="studio-sidebar">
          <nav class="studio-stages" aria-label="Этапы настройки сценария">
            <button
              v-for="(stage, index) in stages"
              :key="stage.key"
              type="button"
              :class="{ active: studioStage === stage.key }"
              :aria-current="studioStage === stage.key ? 'step' : undefined"
              @click="selectStage(stage.key)"
            >
              <span class="stage-index" :class="`is-${stage.status}`"
                ><i v-if="stage.status === 'valid'" class="pi pi-check" /><i
                  v-else-if="stage.status === 'invalid'"
                  class="pi pi-exclamation-circle"
                /><span v-else>{{ index + 1 }}</span></span
              >
              <span class="stage-copy"
                ><strong>{{ stage.label }}</strong
                ><small>{{ stage.detail }}</small></span
              >
            </button>
          </nav>
          <div
            v-if="studioStage === 'actions' && canEdit"
            class="action-library"
          >
            <div class="library-head">
              <span>Библиотека</span><strong>Добавить узел</strong>
            </div>
            <div
              v-for="group in actionGroups"
              :key="group.label"
              class="library-group"
            >
              <h3>{{ group.label }}</h3>
              <button
                v-for="definition in group.items"
                :key="definition.type"
                type="button"
                @click="addNode(definition.type)"
              >
                <span
                  ><i
                    :class="
                      definition.type === 'CONDITION'
                        ? 'pi pi-code'
                        : definition.type === 'ASK_CHOICE'
                          ? 'pi pi-question-circle'
                          : definition.executor === 'FRONTEND'
                            ? 'pi pi-desktop'
                            : 'pi pi-server'
                    "
                /></span>
                <div>
                  <strong>{{ definition.name }}</strong
                  ><small>{{
                    definition.executor === "FRONTEND"
                      ? "В интерфейсе"
                      : "На сервере"
                  }}</small>
                </div>
                <i class="pi pi-plus" />
              </button>
            </div>
          </div>
        </aside>

        <main v-if="studioStage === 'actions'" class="graph-canvas">
          <details
            v-if="authoringContract?.localization"
            class="localization-policy-card"
          >
            <summary>
              Языки контента ·
              {{
                localizationPolicy.mode === 'ALL_PROJECT_LOCALES'
                  ? 'все языки проекта'
                  : `${localizationPolicy.locales.length} выбрано`
              }}
            </summary>
            <ScenarioLocalizationPolicyControl
              v-model="localizationPolicy"
              :catalog="authoringContract.localization"
              :readonly="!canEdit"
            />
            <ScenarioLocalePreview
              :actions="form.actions"
              :catalog="authoringContract.localization"
              :policy="localizationPolicy"
            />
          </details>
          <Message
            v-if="templatePolicyError"
            severity="warn"
            :closable="false"
            class="actions-warning"
            >Поля профиля для сообщений недоступны:
            {{ templatePolicyError }}</Message
          >
          <Message
            v-else-if="templatePolicyWarnings.length"
            severity="warn"
            :closable="false"
            class="actions-warning"
            ><strong>В сообщениях используются устаревшие поля</strong
            ><span v-for="warning in templatePolicyWarnings" :key="warning">{{
              warning
            }}</span></Message
          >
          <Message
            v-if="actionsError"
            severity="warn"
            :closable="false"
            class="actions-warning"
            >Не удалось загрузить каталог действий. {{ actionsError }}</Message
          >
          <section
            class="mobile-action-outline"
            aria-label="Линейный список действий и ожиданий"
          >
            <header>
              <div>
                <span>Действия и ожидания</span
                ><strong>{{ form.actions.length }} узлов</strong>
              </div>
              <small
                >На мобильном граф доступен как обзор; редактирование
                выполняется через список.</small
              >
            </header>
            <button
              v-for="action in form.actions"
              :key="action.nodeKey"
              type="button"
              class="mobile-node-card"
              :aria-label="`Открыть узел ${action.nodeKey}`"
              @click="openNode(action.nodeKey ?? '')"
            >
              <span
                ><i
                  :class="
                    action.type === 'WAIT_FOR_GOAL'
                      ? 'pi pi-clock'
                      : action.type === 'CONDITION'
                        ? 'pi pi-code'
                        : 'pi pi-bolt'
                  "
              /></span>
              <div>
                <strong>{{
                  findActionDefinition(actionDefinitions, action.type)?.name ??
                  action.type
                }}</strong
                ><small>{{ action.nodeKey }} · {{ nodeSummary(action) }}</small>
              </div>
              <em
                v-if="
                  actionIssues.filter(
                    (issue) => issue.nodeKey === action.nodeKey,
                  ).length
                "
                >{{
                  actionIssues.filter(
                    (issue) => issue.nodeKey === action.nodeKey,
                  ).length
                }}</em
              ><i class="pi pi-chevron-right" />
            </button>
            <p v-if="!form.actions.length" class="mobile-empty">
              Добавьте первый узел из библиотеки ниже.
            </p>
            <details v-if="canEdit" class="mobile-library">
              <summary>Добавить узел</summary>
              <div v-for="group in actionGroups" :key="group.label">
                <strong>{{ group.label }}</strong
                ><button
                  v-for="definition in group.items"
                  :key="definition.type"
                  type="button"
                  @click="addNode(definition.type)"
                >
                  <i class="pi pi-plus" />{{ definition.name }}
                </button>
              </div>
            </details>
          </section>
          <VueFlow
            v-if="!compactActionLayout && form.actions.length"
            :nodes="flowNodes"
            :edges="flowEdges"
            :node-types="flowNodeTypes"
            fit-view-on-init
            :min-zoom="0.25"
            :max-zoom="1.6"
            :nodes-draggable="false"
            :nodes-connectable="false"
            @node-click="selectNode"
          >
            <Background pattern-color="var(--graph-edge)" :gap="22" />
            <Controls :show-interactive="false" />
          </VueFlow>
          <section
            v-if="!compactActionLayout && !form.actions.length"
            class="action-empty"
          >
            <span class="action-empty-icon"><i class="pi pi-bolt" /></span>
            <div>
              <h1>Добавьте первое действие</h1>
              <p>
                Например, отправьте сообщение или дождитесь события. После
                добавления откроется схема сценария.
              </p>
            </div>
            <div v-if="canEdit && actionGroups.length" class="action-empty-options">
              <template v-for="group in actionGroups" :key="group.label">
                <button
                  v-for="definition in group.items"
                  :key="definition.type"
                  type="button"
                  @click="addNode(definition.type)"
                >
                  <i class="pi pi-plus" />{{ definition.name }}
                </button>
              </template>
            </div>
          </section>
        </main>

        <main v-else-if="studioStage === 'eligibility'" class="rule-canvas">
          <header class="stage-section-header">
            <div>
              <span>Условия запуска</span>
              <h1>Что должно произойти перед запуском</h1>
              <p>
                Добавьте проверки текущего события или недавних действий
                пользователя.
              </p>
            </div>
            <Button
              v-if="ruleContext && canEdit"
              label="Проверить условия"
              icon="pi pi-check-circle"
              severity="secondary"
              outlined
              @click="validationOpen = true"
            />
          </header>
          <Message v-if="authoringError" severity="error" :closable="false"
            >Не удалось загрузить каталог условий. {{ authoringError }}</Message
          >
          <ScenarioRuleBuilder
            v-if="ruleContext && canEdit"
            ref="ruleBuilder"
            :model-value="ruleDraft"
            :context="ruleContext"
            @update:model-value="updateRuleDraft"
            @editing-dirty="ruleEditorDirty = $event"
          />
          <div v-else-if="ruleContext" class="stage-empty">
            <i class="pi pi-lock" />
            <h2>Условия только для просмотра</h2>
            <template v-if="sourceSnapshotUnavailable">
              <p><strong>Исходные условия недоступны</strong></p>
              <p>
                Сценарий продолжает использовать условия опубликованной
                версии, но показать их без сохранённого исходника редактора
                нельзя.
              </p>
            </template>
            <p v-else>{{ summarizeRule(ruleDraft, ruleContext).text }}</p>
          </div>
          <div v-else class="stage-empty">
            <i class="pi pi-link" />
            <h2>Сначала выберите доступное событие запуска</h2>
            <p>
              Конструктор использует точную ревизию Event из каталога. Мы не
              связываем ревизии только по одинаковому коду.
            </p>
            <Button label="Открыть настройки запуска" @click="selectStage('trigger')" />
          </div>
        </main>

        <main
          v-else-if="studioStage === 'audience' && audienceContext"
          class="audience-canvas"
        >
          <Message v-if="!canManage" severity="info" :closable="false"
            >Аудитория и история сегментов доступны для просмотра. Изменять и
            публиковать их могут только владельцы и администраторы.</Message
          >
          <Message
            v-if="audienceSegmentsError"
            severity="warn"
            :closable="false"
            >{{ audienceSegmentsError }}. Условия по языку, стране и полям
            профиля остаются доступны.</Message
          >
          <nav class="segment-library-link" aria-label="Управление сегментами">
            <div>
              <strong>Сегменты живут в отдельной библиотеке</strong
              ><small
                >Сценарий только закрепляет точную опубликованную версию и
                никогда не обновляет её автоматически.</small
              >
            </div>
            <RouterLink :to="{ name: 'segments' }"
              >Управление сегментами</RouterLink
            ><RouterLink :to="{ name: 'segments-guide' }"
              >Как работают сегменты</RouterLink
            ><RouterLink
              v-if="canManage"
              :to="{
                name: 'segment-create',
                query: { returnTo: route.fullPath },
              }"
              >Создать сегмент</RouterLink
            >
          </nav>
          <AudienceRuleBuilder
            v-if="canEdit"
            ref="audienceBuilder"
            :model-value="audienceDraft"
            :context="audienceContext"
            :segment-search="searchAudienceSegments"
            @update:model-value="updateAudienceDraft"
            @editing-dirty="ruleEditorDirty = $event"
          />
          <div v-else class="readonly-stage-card">
            <i class="pi pi-eye" />
            <div>
              <h2>Аудитория только для просмотра</h2>
              <template v-if="sourceSnapshotUnavailable">
                <p><strong>Исходные настройки аудитории недоступны</strong></p>
                <p>
                  Опубликованная версия продолжает работать, но её аудиторию
                  нельзя достоверно восстановить по данным выполнения.
                </p>
              </template>
              <p v-else>{{ audienceSummary?.text ?? "Аудитория не ограничена" }}</p>
            </div>
          </div>
        </main>

        <main v-else class="stage-overview">
          <div v-if="studioStage === 'trigger'" class="overview-card">
            <span class="eyebrow">Этап 1</span>
            <h1>Событие запуска</h1>
            <p>
              Это событие становится поводом проверить сценарий. Поля текущего
              события затем доступны в конструкторе условий.
            </p>
            <div v-if="selectedAuthoringEvent" class="selected-trigger">
              <i class="pi pi-bolt" />
              <div>
                <strong>{{
                  eventDisplayName(
                    selectedAuthoringEvent.code,
                    selectedAuthoringEvent.name,
                  )
                }}</strong
                ><code>{{ selectedAuthoringEvent.code }}</code>
              </div>
              <span>Схема v{{ selectedAuthoringEvent.schemaVersion }}</span>
            </div>
            <Message v-else severity="warn" :closable="false"
              >Выбранная версия события отсутствует в каталоге сценариев.
              Выберите доступную версию.</Message
            >
          </div>
          <div
            v-else-if="studioStage === 'audience'"
            class="overview-card unavailable"
          >
            <span class="eyebrow">Этап 2</span>
            <h1>Аудитория временно недоступна</h1>
            <p>
              Каталог аудитории не пришёл в текущем контракте. Сценарий без
              аудитории остаётся совместимым и может быть опубликован как
              раньше.
            </p>
            <Message severity="warn" :closable="false"
              >Обновите серверный контракт и повторите загрузку. Старые условия
              user.* не переносятся автоматически: это защищает их
              семантику.</Message
            >
          </div>
          <div v-else-if="studioStage === 'delivery'" class="delivery-stage">
            <DeliveryPolicyEditor
              v-if="canManage && authoringEditable"
              ref="deliveryEditor"
              v-model="deliveryPolicy"
            /><div v-else-if="!authoringEditable" class="readonly-stage-card">
              <i class="pi pi-eye" />
              <div>
                <h2>Настройки доставки только для просмотра</h2>
                <template v-if="sourceSnapshotUnavailable">
                  <p><strong>Исходные настройки доставки недоступны</strong></p>
                  <p>
                    Сценарий продолжает доставлять сообщения по опубликованной
                    версии. Пустые значения редактора здесь не показываются,
                    чтобы не исказить фактическое поведение.
                  </p>
                </template>
                <p v-else>{{ deliveryPolicySummary(deliveryPolicy) }}</p>
              </div>
            </div>
            <Message severity="info" :closable="false"
              >Ожидание пользователя в сети не продлевает срок цели. При
              публикации условия и аудитория фиксируются по версии; перед
              доставкой обе проверки выполняются независимо.</Message
            ><ScenarioPublishPanel
              v-if="ruleContext && canEdit"
              :project-id="auth.project?.id ?? ''"
              :scenario-id="form.id ?? ''"
              :draft="ruleDraft"
              :context="ruleContext"
              :audience-draft="audienceDraft"
              :audience-context="audienceContext ?? undefined"
              :delivery-policy="deliveryPolicy"
              :actions="form.actions"
              :localization-policy="localizationPolicy"
              :authoring-snapshot="JSON.stringify(form)"
              :expected-current-revision-id="currentRevisionId"
              :expected-draft-version="currentDraftVersion"
              :blocked-reason="publishBlockedReason"
              :refresh-catalog="refreshAuthoringContract"
              @head-change="currentRevisionId = $event"
              @published="published"
              @publishing="publishPending = $event"
              @focus-issue="focusDraftIssue"
              @reload-request="reloadAfterConflict"
              @resave-required="requireDraftResave"
            /><Message v-else-if="!canManage" severity="info" :closable="false"
              >Публикация доступна только владельцам и администраторам.</Message
            ><Message
              v-else-if="!authoringEditable"
              severity="info"
              :closable="false"
              >Чтобы изменить настройки и выпустить новую версию, восстановите
              исходник редактора или создайте новый сценарий.</Message
            ><Message v-else severity="warn" :closable="false"
              >Сначала выберите событие запуска из каталога сценариев.</Message
            ><ScenarioRevisionHistory
              v-if="form.id"
              :project-id="auth.project?.id ?? ''"
              :scenario-id="form.id"
              :current-revision-id="currentRevisionId"
              :localization-catalog="authoringContract?.localization"
              :readonly="!canManage"
              @head-change="revisionHeadChanged"
            />
          </div>
        </main>

        <aside
          v-if="
            studioStage === 'eligibility' &&
            ruleContext &&
            canEdit &&
            validationOpen
          "
          class="validation-drawer"
          aria-label="Проверка условий"
        >
          <header>
            <div>
              <small>Проверка</small>
              <strong>Работают ли условия</strong>
            </div>
            <Button
              icon="pi pi-times"
              text
              rounded
              aria-label="Закрыть проверку условий"
              @click="validationOpen = false"
            />
          </header>
          <RuleValidationPreview
            :project-id="auth.project?.id ?? ''"
            :draft="ruleDraft"
            :context="ruleContext"
            :draft-revision="ruleDraftRevision"
            :audience-draft="audienceDraft"
            :audience-context="audienceContext ?? undefined"
            :audience-draft-revision="audienceDraftRevision"
            @focus-node="focusRuleIssue"
            @focus-audience-node="focusAudienceIssue"
          />
        </aside>
        <ScenarioNodeInspector
          v-else-if="
            studioStage === 'actions' &&
            inspectorMode === 'node' &&
            selectedAction &&
            canEdit
          "
          :project-id="auth.project?.id ?? ''"
          :action="selectedAction"
          :actions="form.actions"
          :action-definitions="actionDefinitions"
          :events="events"
          :elements="elements"
          :template-variables="templateVariables"
          :condition-paths="conditionPaths"
          :issues="selectedIssues"
          :authoring-contract="authoringContract"
          :localization-policy="localizationPolicy"
          :scenario-id="form.id ?? 'new'"
          :action-path="`graph.actions.${selectedAction.nodeKey}`"
          :translation-states="translationStates"
          :focus-field-path="focusedLocalizedFieldPath"
          :focus-locale="focusedLocale"
          @change-type="changeType"
          @create-target="createTarget"
          @remove="removeSelected"
          @update="updateSelected"
          @rename="renameNode"
          @close="closeNodeInspector"
          @translation-request="requestTranslation"
          @translation-retry="retryTranslation"
          @translation-cancel="cancelTranslation"
          @translation-manual-edit="markTranslationManual"
        />
        <aside
          v-else-if="
            studioStage === 'actions' &&
            inspectorMode === 'node' &&
            selectedAction
          "
          class="readonly-panel readonly-action-panel"
          aria-label="Действие только для просмотра"
        >
          <div class="settings-head readonly-action-head">
            <div>
              <small>Режим просмотра</small>
              <h2>{{
                findActionDefinition(actionDefinitions, selectedAction.type)
                  ?.name ?? selectedAction.type
              }}</h2>
            </div>
            <Button
              icon="pi pi-times"
              text
              rounded
              aria-label="Закрыть просмотр действия"
              @click="closeNodeInspector"
            />
          </div>
          <dl>
            <div>
              <dt>Код шага</dt>
              <dd><code>{{ selectedAction.nodeKey }}</code></dd>
            </div>
            <div>
              <dt>Что делает</dt>
              <dd>{{ nodeSummary(selectedAction) }}</dd>
            </div>
            <div>
              <dt>Следующий шаг</dt>
              <dd>{{ selectedAction.nextNodeKey || "Завершает сценарий" }}</dd>
            </div>
          </dl>
          <p class="readonly-action-note">
            Изменить этот шаг нельзя: исходные настройки опубликованной версии
            не сохранились в формате редактора.
          </p>
        </aside>
        <aside
          v-else-if="studioStage === 'trigger' && !canEdit"
          class="readonly-panel"
          aria-label="Сводка сценария"
        >
          <div class="settings-head">
            <small>Режим просмотра</small>
            <h2>Настройки запуска</h2>
            <p>Здесь показаны настройки опубликованной версии.</p>
          </div>
          <dl>
            <div><dt>Название</dt><dd>{{ form.name }}</dd></div>
            <div><dt>Системный код</dt><dd><code>{{ form.code }}</code></dd></div>
            <div>
              <dt>Событие запуска</dt>
              <dd>
                {{
                  selectedAuthoringEvent
                    ? eventDisplayName(
                        selectedAuthoringEvent.code,
                        selectedAuthoringEvent.name,
                      )
                    : selectedEvent
                      ? eventDisplayName(selectedEvent.code, selectedEvent.name)
                      : "Не выбрано"
                }}
              </dd>
            </div>
            <div><dt>Статус</dt><dd>{{ form.status === "ACTIVE" ? "Активен" : "Черновик" }}</dd></div>
          </dl>
        </aside>
        <aside v-else-if="studioStage === 'trigger'" class="settings-panel">
          <div class="settings-head">
            <small>Сценарий</small>
            <h2>Настройки запуска</h2>
            <p>Событие и фильтры проверяются до старта графа.</p>
          </div>
          <section>
            <div class="field">
              <label for="scenario-name">Название *</label
              ><InputText
                id="scenario-name"
                v-model="form.name"
                placeholder="Предложение бонуса"
              />
            </div>
            <div class="field">
              <label for="scenario-code">Системный код *</label
              ><InputText
                id="scenario-code"
                v-model="form.code"
                class="mono"
                placeholder="bonus_offer"
                @input="codeTouched = true"
              />
            </div>
            <div class="field">
              <label for="scenario-description">Описание</label
              ><Textarea
                id="scenario-description"
                v-model="form.description"
                rows="3"
                auto-resize
              />
            </div>
          </section>
          <section>
            <div class="field">
              <label for="scenario-trigger">Событие запуска *</label
              ><Select
                input-id="scenario-trigger"
                v-model="form.eventDefinitionId"
                :options="eventOptions"
                option-label="label"
                option-value="value"
                ><template #option="{ option }"
                  ><div class="event-option">
                    <span>{{ option.label }}</span
                    ><code>{{ option.code }}</code>
                  </div></template
                ></Select
              >
            </div>
            <div class="field">
              <label for="scenario-status">Статус</label>
              <div
                v-if="form.status === 'ACTIVE'"
                class="status-readonly"
                role="status"
                aria-label="Текущий статус сценария"
              >
                <i class="pi pi-check-circle" />
                <div>
                  <strong>Активен</strong
                  ><small
                    >Управление активной версией выполняется через публикацию
                    V2.</small
                  >
                </div>
              </div>
              <Select
                v-else
                input-id="scenario-status"
                v-model="form.status"
                :options="statusOptions"
                option-label="label"
                option-value="value"
                aria-label="Статус сценария"
              /><small v-if="form.status !== 'ACTIVE'"
                >Активация V2 выполняется только атомарной публикацией
                версии.</small
              >
            </div>
            <div class="field">
              <label for="scenario-conversation-policy">Чат для сообщений</label
              ><Select
                input-id="scenario-conversation-policy"
                v-model="form.conversationPolicy"
                :options="conversationPolicyOptions"
                option-label="label"
                option-value="value"
              /><small
                >Настройка применяется ко всем сообщениям в рамках запуска
                сценария.</small
              >
            </div>
            <div class="settings-row">
              <div class="field">
                <label for="scenario-priority">Приоритет</label
                ><InputNumber
                  input-id="scenario-priority"
                  v-model="form.priority"
                  :min="-1000"
                  :max="1000"
                />
              </div>
              <div class="field">
                <label for="scenario-max-runs">Макс. запусков</label
                ><InputNumber
                  input-id="scenario-max-runs"
                  v-model="form.maxRunsPerUser"
                  :min="1"
                  placeholder="Без лимита"
                />
              </div>
            </div>
            <div class="field">
              <label for="scenario-cooldown">Пауза, сек.</label
              ><InputNumber
                input-id="scenario-cooldown"
                v-model="form.cooldownSeconds"
                :min="0"
                placeholder="Без паузы"
              />
            </div>
          </section>
          <section v-if="form.conditions.length">
            <div class="section-copy">
              <h3>Условия старого формата</h3>
              <p>
                Эти условия нужны для совместимости со старыми версиями
                сценария. Новые условия настраиваются в разделе «Условия».
              </p>
            </div>
            <ScenarioConditionRows
              v-model="form.conditions"
              :paths="triggerConditionPaths"
            />
          </section>
        </aside>
        <aside
          v-else-if="studioStage === 'audience' || studioStage === 'delivery'"
          class="stage-aside"
        >
          <i class="pi pi-info-circle" /><strong>{{
            studioStage === "audience"
              ? "Аудитория закрепляется по версии"
              : "Отдельная политика доставки"
          }}</strong>
          <p>
            {{
              studioStage === "audience"
                ? "Сегменты публикуются отдельно. Сценарий хранит выбранную версию сегмента и повторно проверяет аудиторию перед отправкой."
                : deliveryPolicySummary(deliveryPolicy)
            }}
          </p>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.scenario-studio {
  container: scenario-studio / inline-size;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--surface-canvas);
}
.studio-header {
  height: 72px;
  flex: 0 0 72px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-card);
  z-index: 5;
}
.header-left,
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-left > div span,
.header-left > div strong {
  display: block;
}
.header-left > div span {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.header-left > div strong {
  margin-top: 3px;
  font: 700 0.86rem Manrope;
}
.header-center {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-small-muted);
  font-size: 0.68rem;
}
.header-center span {
  padding: 7px 9px;
  border-radius: 9px;
  background: var(--surface-subtle);
}
.header-center .invalid {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.header-actions {
  justify-content: flex-end;
}
.studio-grid {
  position: relative;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  overflow: hidden;
}
.studio-grid.stage-actions.has-action-inspector {
  grid-template-columns: 188px minmax(0, 1fr) 360px;
}
.studio-grid.stage-trigger > .stage-overview,
.studio-grid.stage-audience > .stage-aside,
.studio-grid.stage-delivery > .stage-aside {
  display: none;
}
.studio-grid.stage-trigger > .settings-panel,
.studio-grid.stage-trigger > .readonly-panel {
  grid-column: 2;
}
.studio-grid.stage-trigger > .settings-panel .settings-head,
.studio-grid.stage-trigger > .settings-panel section,
.studio-grid.stage-trigger > .readonly-panel .settings-head,
.studio-grid.stage-trigger > .readonly-panel dl {
  width: min(860px, 100%);
  margin-inline: auto;
}
.studio-sidebar {
  overflow: auto;
  padding: 15px 10px;
  border-right: 1px solid var(--line);
  background: var(--surface-subtle);
}
.studio-stages {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.studio-stages button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  padding: 9px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.studio-stages button:hover,
.studio-stages button.active {
  background: var(--status-violet-soft);
}
.stage-index {
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--surface-active);
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 800;
}
.stage-index.valid {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.stage-index.invalid {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.stage-copy {
  min-width: 0;
}
.stage-copy strong,
.stage-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-copy strong {
  font-size: 0.72rem;
}
.stage-copy small {
  margin-top: 2px;
  color: var(--text-small-muted);
  font-size: 0.58rem;
}
.action-library {
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid var(--line);
}
.library-head {
  padding: 0 7px 14px;
}
.library-head span,
.library-head strong {
  display: block;
}
.library-head span {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.library-head strong {
  margin-top: 3px;
  font: 700 0.85rem Manrope;
}
.library-group {
  margin-bottom: 19px;
}
.library-group h3 {
  margin: 0 7px 7px;
  color: var(--text-small-muted);
  font-size: 0.61rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.library-group button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 5px;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.library-group button:hover {
  border-color: var(--border-default);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.library-group button > span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.library-group button > div {
  min-width: 0;
  flex: 1;
}
.library-group button strong,
.library-group button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-group button strong {
  font-size: 0.72rem;
}
.library-group button small {
  margin-top: 2px;
  color: var(--text-small-muted);
  font-size: 0.6rem;
}
.library-group button > .pi-plus {
  color: var(--text-tertiary);
  font-size: 0.65rem;
}
.graph-canvas,
.rule-canvas,
.stage-overview {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--graph-canvas);
}
.scenario-studio :deep(.rule-validation-preview) {
  height: 100%;
  overflow: auto;
  padding: 20px;
  background: var(--surface-card);
}
.stage-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-card);
}
.stage-section-header > div {
  min-width: 0;
}
.stage-section-header span {
  color: var(--text-small-muted);
  font-size: var(--font-size-caption);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.stage-section-header h1 {
  margin: 4px 0 0;
  font-size: 1.15rem;
}
.stage-section-header p {
  margin: 5px 0 0;
  color: var(--text-small-muted);
  font-size: var(--font-size-body-small);
}
.validation-drawer {
  position: absolute;
  z-index: 10;
  top: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(460px, 100%);
  border-left: 1px solid var(--line);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.validation-drawer > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.validation-drawer > header small,
.validation-drawer > header strong {
  display: block;
}
.validation-drawer > header small {
  color: var(--text-small-muted);
  font-size: var(--font-size-caption);
  text-transform: uppercase;
}
.validation-drawer > header strong {
  margin-top: 3px;
  font-size: var(--font-size-body);
}
.graph-canvas :deep(.vue-flow) {
  height: 100%;
  --vf-node-bg: var(--graph-node);
  --vf-node-text: var(--text-primary);
  --vf-node-color: var(--graph-selection);
  --vf-connection-path: var(--graph-edge);
  --vf-handle: var(--graph-selection);
  --vf-box-shadow: var(--graph-selection);
}
.graph-canvas :deep(.vue-flow__edge-textbg) {
  fill: var(--graph-node);
}
.graph-canvas :deep(.vue-flow__controls-button) {
  background: var(--surface-raised);
  border-bottom: 1px solid var(--border-default);
  color: var(--text-primary);
}
.graph-canvas :deep(.vue-flow__controls-button:hover) {
  background: var(--surface-hover);
}
.graph-canvas :deep(.vue-flow__controls-button svg) {
  fill: currentColor;
}
.graph-canvas :deep(.vue-flow__node-input) {
  min-width: 205px;
  padding: 13px;
  border: 0;
  border-radius: 14px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  box-shadow: var(--shadow-raised);
  font: 700 0.75rem Manrope;
}
.graph-canvas :deep(.vue-flow__controls),
.graph-canvas :deep(.vue-flow__minimap) {
  border: 1px solid var(--line);
  border-radius: 11px;
  box-shadow: none;
  overflow: hidden;
}
.actions-warning {
  position: absolute;
  z-index: 3;
  top: 12px;
  left: 12px;
  width: min(520px, calc(100% - 24px));
}
.localization-policy-card {
  position: absolute;
  z-index: 5;
  top: 14px;
  right: 14px;
  width: min(390px, calc(100% - 28px));
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  box-shadow: var(--shadow-sm);
}
.localization-policy-card summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: .72rem;
  font-weight: 750;
}
.localization-policy-card[open] summary { margin-bottom: 12px; }
.action-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 18px;
  padding: 32px;
  background: var(--surface-canvas);
  text-align: center;
}
.action-empty-icon {
  display: grid;
  width: 54px;
  height: 54px;
  border-radius: 17px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  place-items: center;
}
.action-empty h1 {
  margin: 0;
  font-size: 1.35rem;
}
.action-empty p {
  max-width: 520px;
  margin: 8px 0 0;
  color: var(--text-small-muted);
  font-size: var(--font-size-body);
}
.action-empty-options {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 640px;
}
.action-empty-options button {
  min-height: var(--control-height);
  padding: 9px 13px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: 700 var(--font-size-button) Manrope;
  cursor: pointer;
}
.action-empty-options button:hover {
  border-color: var(--status-violet);
  background: var(--status-violet-soft);
}
.action-empty-options i {
  margin-right: 7px;
}
.stage-overview {
  display: grid;
  place-items: center;
  padding: 28px;
}
.overview-card {
  width: min(650px, 100%);
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface-card);
  box-shadow: var(--shadow);
}
.overview-card p {
  color: var(--text-small-muted);
}
.selected-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 15px;
  border-radius: 15px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.selected-trigger > i {
  color: var(--brand);
}
.selected-trigger div {
  min-width: 0;
  flex: 1;
}
.selected-trigger strong,
.selected-trigger code {
  display: block;
}
.selected-trigger code {
  margin-top: 4px;
  color: var(--text-on-emphasis-muted);
  font-size: 0.68rem;
}
.selected-trigger > span {
  font-size: 0.65rem;
}
.selected-trigger > span {
  font-size: 0.65rem;
}
.stage-empty {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
  padding: 34px;
  color: var(--text-small-muted);
  text-align: center;
}
.stage-empty > i {
  font-size: 2rem;
}
.stage-empty h2 {
  margin-top: 14px;
  color: var(--text-primary);
}
.stage-empty p {
  max-width: 520px;
}
.readonly-stage-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.readonly-stage-card > i {
  margin-top: 3px;
  color: var(--status-violet-text);
  font-size: 1.1rem;
}
.readonly-stage-card h2,
.readonly-stage-card p {
  margin: 0;
}
.readonly-stage-card h2 {
  font-size: 0.92rem;
}
.readonly-stage-card p {
  margin-top: 6px;
  color: var(--text-small-muted);
}
.settings-panel {
  height: 100%;
  overflow: auto;
  border-left: 1px solid var(--line);
  background: var(--surface-card);
}
.readonly-panel {
  height: 100%;
  overflow: auto;
  border-left: 1px solid var(--line);
  background: var(--surface-card);
}
.readonly-panel dl {
  display: grid;
  gap: 0;
  margin: 0;
}
.readonly-panel dl > div {
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}
.readonly-panel dt {
  color: var(--text-small-muted);
  font-size: var(--font-size-caption);
}
.readonly-panel dd {
  margin: 4px 0 0;
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.readonly-action-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.readonly-action-note {
  margin: 18px 20px;
  color: var(--text-small-muted);
  font-size: var(--font-size-body-small);
}
.settings-head {
  padding: 21px 20px 17px;
  border-bottom: 1px solid var(--line);
}
.settings-head small {
  color: var(--text-small-muted);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.settings-head h2 {
  margin-top: 4px;
  font-size: 1.08rem;
}
.settings-head p,
.section-copy p {
  margin: 5px 0 0;
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.settings-panel section {
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}
.settings-panel .field {
  margin-top: 13px;
}
.settings-panel .field:first-child {
  margin-top: 0;
}
.settings-panel .field > small {
  color: var(--text-small-muted);
  font-size: 0.67rem;
}
.settings-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.section-copy h3 {
  margin: 0;
  font-size: 0.8rem;
}
.event-option {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
}
.event-option code {
  color: var(--text-small-muted);
  font-size: 0.65rem;
}
.stage-aside {
  padding: 24px;
  border-left: 1px solid var(--line);
  background: var(--surface-card);
}
.stage-aside > i {
  color: var(--status-violet);
}
.stage-aside strong {
  display: block;
  margin-top: 12px;
  font-size: 0.8rem;
}
.stage-aside p {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.studio-loading {
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--text-small-muted);
}
.page-error {
  margin: 20px;
}
.save-error {
  position: fixed;
  z-index: 20;
  top: 82px;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 24px));
  box-shadow: var(--shadow);
}
.readonly-notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 12px 20px 0;
  padding: 14px 16px;
  border: 1px solid var(--status-warning);
  border-radius: 14px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.readonly-notice > i {
  margin-top: 2px;
  font-size: 1rem;
}
.readonly-notice > div {
  min-width: 0;
  flex: 1;
}
.readonly-notice > .p-button {
  flex: 0 0 auto;
}
.readonly-notice strong,
.readonly-notice p {
  display: block;
  margin: 0;
}
.readonly-notice p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
  line-height: 1.45;
}
.audience-canvas {
  position: relative;
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 18px;
  background: var(--graph-canvas);
}
.segment-library-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 15px;
  border: 1px solid var(--status-violet);
  border-radius: 14px;
  background: var(--status-violet-soft);
}
.segment-library-link div {
  min-width: 0;
  flex: 1;
}
.segment-library-link strong,
.segment-library-link small {
  display: block;
}
.segment-library-link strong {
  font-size: 0.72rem;
}
.segment-library-link small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.62rem;
}
.segment-library-link a {
  white-space: nowrap;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--status-violet-text);
  font-size: 0.65rem;
  font-weight: 800;
  text-decoration: none;
}
@media (max-width: 680px) {
  .segment-library-link {
    align-items: stretch;
    flex-direction: column;
  }
  .segment-library-link a {
    text-align: center;
  }
}
.status-readonly {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px;
  border: 1px solid var(--status-success);
  border-radius: 11px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.status-readonly strong,
.status-readonly small {
  display: block;
}
.status-readonly small {
  margin-top: 2px;
  color: var(--status-success-text);
  font-size: 0.62rem;
}
.delivery-stage {
  display: grid;
  gap: 14px;
  width: min(820px, 100%);
}
.mobile-action-outline {
  display: none;
}
.mobile-action-outline header span,
.mobile-action-outline header strong {
  display: block;
}
.mobile-action-outline header span {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
}
.mobile-action-outline header small {
  color: var(--text-small-muted);
  font-size: 0.66rem;
}
.mobile-node-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-card);
  padding: 10px;
  text-align: left;
}
.mobile-node-card > span {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.mobile-node-card strong,
.mobile-node-card small {
  display: block;
}
.mobile-node-card strong {
  font-size: 0.72rem;
}
.mobile-node-card small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.63rem;
}
.mobile-node-card em {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
  font-size: 0.62rem;
  font-style: normal;
}
.mobile-library {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-card);
  padding: 11px;
}
.mobile-library summary {
  cursor: pointer;
  font-weight: 700;
}
.mobile-library > div {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}
.mobile-library > div > strong {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
}
.mobile-library button {
  min-height: 40px;
  border: 0;
  border-radius: 9px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  text-align: left;
  padding: 9px;
}
.mobile-library button i {
  margin-right: 7px;
}
.mobile-empty {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.stage-index.is-valid {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.stage-index.is-invalid {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.studio-sidebar::-webkit-scrollbar {
  display: none;
}
@container scenario-studio (max-width:1024px) {
  .scenario-studio {
    height: 100dvh;
    min-height: 0;
  }
  .studio-header {
    grid-template-columns: 1fr 1fr;
  }
  .header-center {
    display: none;
  }
  .studio-grid {
    flex: 1;
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }
  .studio-grid.stage-actions.has-action-inspector {
    grid-template-columns: minmax(0, 1fr);
  }
  .studio-grid.stage-trigger > .settings-panel,
  .studio-grid.stage-trigger > .readonly-panel {
    grid-column: 1;
  }
  .studio-sidebar {
    position: sticky;
    top: 0;
    z-index: 4;
    overflow-x: auto;
    padding: 9px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
    scrollbar-width: none;
  }
  .studio-stages {
    flex-direction: row;
    min-width: max-content;
  }
  .studio-stages button {
    width: 142px;
  }
  .action-library {
    display: none;
  }
  .graph-canvas {
    min-height: 65vh;
    padding: 12px;
  }
  .graph-canvas :deep(.vue-flow) {
    display: none;
  }
  .mobile-action-outline {
    display: grid;
    gap: 10px;
  }
  .rule-canvas,
  .stage-overview {
    min-height: 55vh;
  }
  .settings-panel,
  .stage-aside,
  .inspector {
    height: auto;
    min-height: 320px;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .scenario-studio :deep(.rule-validation-preview) {
    height: 100%;
    min-height: 0;
    overflow: auto;
  }
}
@container scenario-studio (max-width:767px) {
  .scenario-studio {
    min-height: 0;
  }
  .studio-header {
    min-height: 70px;
    height: auto;
    padding: 10px 12px;
    gap: 8px;
  }
  .header-left > div span {
    display: none;
  }
  .header-actions .p-button:first-child {
    display: none;
  }
  .studio-stages button {
    width: 116px;
  }
  .stage-copy small {
    display: none;
  }
  .rule-canvas {
    min-height: 50vh;
  }
  .stage-overview {
    padding: 16px;
  }
  .overview-card {
    padding: 20px;
  }
  .readonly-notice {
    flex-wrap: wrap;
    margin: 10px 12px 0;
  }
  .readonly-notice > .p-button {
    width: 100%;
  }
  .settings-row {
    grid-template-columns: 1fr;
  }
  .selected-trigger {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .selected-trigger > span {
    width: 100%;
    padding-left: 28px;
  }
}
@container scenario-studio (max-width:767px) {
  .graph-canvas {
    min-height: 55vh;
    padding: 12px;
  }
  .graph-canvas :deep(.vue-flow) {
    display: none;
  }
  .mobile-action-outline {
    display: grid;
    gap: 10px;
  }
  .scenario-studio :deep(.inspector) {
    position: fixed;
    z-index: 1000;
    inset: 0;
    width: auto;
    height: 100dvh;
    border: 0;
  }
  .readonly-action-panel {
    position: fixed;
    z-index: 1000;
    inset: 0;
    width: auto;
    height: 100dvh;
    border: 0;
  }
  .scenario-studio :deep(.inspector-head) {
    padding-top: max(16px, env(safe-area-inset-top));
  }
}
@container scenario-studio (max-width:390px) {
  .studio-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .header-left {
    min-width: 0;
  }
  .header-left > div {
    min-width: 0;
  }
  .header-left strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-actions .p-button {
    padding-inline: 10px;
  }
  .header-actions .p-button :deep(.p-button-label) {
    display: none;
  }
  .studio-stages button {
    width: 104px;
    padding: 8px;
  }
  .stage-index {
    flex-basis: 25px;
    height: 25px;
  }
  .stage-overview {
    padding: 10px;
  }
  .overview-card {
    padding: 16px;
  }
  .save-error {
    top: 70px;
  }
}
@container scenario-studio (max-width:1024px) {
  .audience-canvas {
    min-height: 55vh;
  }
}
@media (max-width: 900px) {
  .scenario-studio {
    height: calc(100dvh - 60px);
  }
}
</style>
