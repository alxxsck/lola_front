<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import {
  VueFlow,
  type Node,
  type NodeDragEvent,
  type ViewportTransform,
} from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";
import ScenarioFlowNode from "@/features/scenarios/ScenarioFlowNode.vue";
import ScenarioFlowEdge from "@/features/scenarios/ScenarioFlowEdge.vue";
import ScenarioFlowControls from "@/features/scenarios/ScenarioFlowControls.vue";
import ScenarioGraphLayoutToolbar from "@/features/scenarios/ScenarioGraphLayoutToolbar.vue";
import ScenarioActionInspectorDock from "@/features/scenarios/ScenarioActionInspectorDock.vue";
import {
  SCENARIO_ACTION_CANVAS_MIN_WIDTH,
  SCENARIO_ACTION_COMPACT_MAX_WIDTH,
  SCENARIO_ACTION_INSPECTOR_MAX_WIDTH,
  SCENARIO_ACTION_INSPECTOR_MIN_WIDTH,
  SCENARIO_ACTION_OUTLINE_WIDTH,
  clampScenarioActionInspectorWidth,
  scenarioActionInspectorMaxWidth,
} from "@/features/scenarios/model/scenario-action-workspace";
import {
  layoutScenarioGraphViewModel,
  mergeScenarioGraphPresentation,
  type ScenarioGraphLayoutEngine,
} from "@/features/scenarios/model/scenario-graph-auto-layout";
import { createScenarioGraphLayoutWorker } from "@/features/scenarios/model/scenario-graph-layout-worker";
import {
  applyScenarioGraphLayout,
  createAutoScenarioGraphLayout,
  createManualScenarioGraphLayout,
  loadScenarioGraphLayout,
  moveScenarioGraphNode,
  nudgeScenarioGraphNode,
  persistScenarioGraphLayout,
  reconcileScenarioGraphLayout,
  removeScenarioGraphLayout,
  renameScenarioGraphLayoutNode,
  updateScenarioGraphViewport,
  type ScenarioGraphLayout,
  type ScenarioGraphLayoutMode,
  type ScenarioGraphLayoutScope,
  type ScenarioGraphNudgeDirection,
} from "@/features/scenarios/model/scenario-graph-layout";
import { measureScenarioGraphEdgeLabel } from "@/features/scenarios/scenario-graph-label-measurer";
import ScenarioNodeInspector from "@/features/scenarios/ScenarioNodeInspector.vue";
import ScenarioActionChangeDialog, {
  type ScenarioActionChangePreview,
} from "@/features/scenarios/ScenarioActionChangeDialog.vue";
import ActionPicker from "@/features/actions/ActionPicker.vue";
import ScenarioActionTargetPicker, {
  type ScenarioActionTargetOption,
} from "@/features/actions/ScenarioActionTargetPicker.vue";
import EventDefinitionSelect from "@/features/events/EventDefinitionSelect.vue";
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
import { scenarioGraphWorkspaceEnabled } from "@/shared/config/features";
import { useProjectActionsStore } from "@/features/project-actions/model/project-actions.store";
import {
  projectScenarioActionCatalog,
  scenarioAvailableActions,
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
import { hasProjectPermission } from "@/features/auth/permission-access";
import { scenarioAdmissionApi } from "@/features/scenario-admission/scenario-admission.api";
import {
  importanceClassOptions,
  type ScenarioImportanceClass,
} from "@/features/scenario-admission/scenario-admission.model";
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import { repository } from "@/shared/api/repository";
import type { UpdateScenarioMetadata } from "@/shared/api/repository/contracts";
import {
  scenarioAuthoringRepository,
  type ScenarioAuthoringContract,
  type SegmentSummaryResponseDto,
} from "@/shared/api/repository/scenario-authoring";
import type {
  ConversationPolicy,
  EventDefinition,
  ScenarioAction,
  ScenarioStatus,
  UiElement,
} from "@/shared/types/domain";
import type { ScenarioLocalizationPolicyDto } from "@/shared/api/generated/models";
import type { ScenarioAdmissionSettingsResponseDto } from "@/shared/api/generated/models";
import {
  createActionConfig,
  findScenarioActionCatalogItem,
  validateScenarioActionConfig,
} from "@/shared/lib/scenario-action-catalog";
import { slugify } from "@/shared/lib/format";
import { localeDisplayName } from "@/shared/lib/locale";
import { useUnsavedChangesGuard } from "@/shared/lib/use-unsaved-changes-guard";
import {
  choiceOptions,
  conditionBranches,
  createScenarioNode,
  graphTransitions,
  normalizePositions,
  renameScenarioNode,
  sortScenarioActions,
  toPlainScenarioAction,
  usesExplicitTransitions,
  validateScenarioGraph,
} from "@/features/scenarios/model/scenario-graph";
import {
  planScenarioActionTypeReplacement,
  planScenarioEntryPointChange,
} from "@/features/scenarios/model/scenario-action-change";
import {
  buildScenarioGraphViewModel,
  scenarioGraphNodePresentation,
} from "@/features/scenarios/model/scenario-graph-view-model";
import {
  scenarioGraphBranchNodeIds,
  scenarioGraphShowsMinimap,
  scenarioGraphViewportDuration,
} from "@/features/scenarios/model/scenario-graph-navigation";

interface ScenarioForm {
  id?: string;
  updatedAt?: string;
  code: string;
  name: string;
  description: string;
  eventDefinitionId: string;
  status: ScenarioStatus;
  conversationPolicy: ConversationPolicy;
  priority: number;
  importanceClass: ScenarioImportanceClass;
  respectsQuietHours: boolean;
  cooldownSeconds?: number;
  maxRunsPerUser?: number;
  activeFrom?: string;
  activeTo?: string;
  actions: ScenarioAction[];
}

type StudioStage =
  "trigger" | "audience" | "eligibility" | "actions" | "delivery";

const systemEventNames: Record<string, string> = {
  "retenive.activity_day_started": "Начался день активности",
  "retenive.became_offline": "Пользователь вышел из сети",
  "retenive.became_online": "Пользователь появился в сети",
  "retenive.visit_started": "Начался визит",
};

function eventDisplayName(code: string, fallback: string) {
  return systemEventNames[code] ?? fallback;
}

function russianCount(count: number, one: string, few: string, many: string) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} ${many}`;
  if (last === 1) return `${count} ${one}`;
  if (last >= 2 && last <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectActionsStore = useProjectActionsStore();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const saveError = ref("");
const saveNotice = ref("");
const authoringError = ref("");
const actionsLoadError = ref("");
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
  create: createAuthoringScenario,
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
const actionChangePreview = ref<ScenarioActionChangePreview | null>(null);
const pendingActionChangePreview = ref<ScenarioActionChangePreview | null>(null);
const changeDraftStarted = ref(false);
const focusedLocalizedFieldPath = ref("");
const focusedLocale = ref("");
const inspectorMode = ref<"node" | "settings">("settings");
const compactActionLayout = ref(false);
const graphExpanded = ref(false);
const graphLocale = ref("");
const actionOutlineQuery = ref("");
const actionOutlineIssuesOnly = ref(false);
const graphMinimapVisible = ref(true);
const actionInspectorWidth = ref(380);
const actionInspectorMaxWidth = ref(SCENARIO_ACTION_INSPECTOR_MAX_WIDTH);
const actionWorkspaceWidth = ref(0);
const studioGridElement = ref<HTMLElement | null>(null);
const graphCanvasElement = ref<HTMLElement | null>(null);
const actionInspector = ref<{ focus?: () => void } | null>(null);
let actionViewReturnFocus: HTMLElement | null = null;
let graphExpandedFromOutlineCenter = false;
const publishPending = ref(false);
const admissionSettings = ref<ScenarioAdmissionSettingsResponseDto | null>(
  null,
);
const codeTouched = ref(false);
const initialSnapshot = ref("");
let actionWorkspaceResizeObserver: ResizeObserver | null = null;

const form = reactive<ScenarioForm>({
  code: "",
  name: "",
  description: "",
  eventDefinitionId: "",
  status: "DRAFT",
  priority: 0,
  importanceClass: "GENERAL",
  respectsQuietHours: false,
  conversationPolicy: "create_new",
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
  const action = form.actions.find(
    (candidate) => candidate.nodeKey === nodeKey,
  );
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
      authoringContract.value?.localization?.defaultLocale ??
        snapshot.sourceLocale,
    );
    const result = applyTranslationResult({
      current,
      snapshot,
      translatedText: text,
    });
    if (result.outcome === "APPLIED")
      reference.container[reference.key] = result.value;
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
  void translationController
    .retry(payload.fieldPath, payload.locale)
    .catch((cause: unknown) => {
      saveError.value = scenarioApiErrorMessage(
        cause,
        "Не удалось повторить перевод.",
      );
    });
}

function cancelTranslation(fieldPath: string) {
  void translationController.cancel(fieldPath).catch((cause: unknown) => {
    saveError.value = scenarioApiErrorMessage(
      cause,
      "Не удалось отменить перевод.",
    );
  });
}

function markTranslationManual(payload: { fieldPath: string; locale: string }) {
  translationStates[payload.fieldPath] = {
    ...(translationStates[payload.fieldPath] ?? {}),
    [payload.locale]: "MANUAL",
  };
}

const canReadProjectActions = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.actions.read",
  ),
);
const projectActions = computed(() =>
  canReadProjectActions.value
    ? projectActionsStore.actionsForProject(auth.project?.id ?? "")
    : [],
);
const actionCatalogProjection = computed(() =>
  projectScenarioActionCatalog(projectActions.value),
);
const actionCatalog = computed(() => actionCatalogProjection.value.catalog);
const scenarioPickerActions = computed(() =>
  scenarioAvailableActions(actionCatalog.value),
);
const actionsError = computed(
  () =>
    actionsLoadError.value ||
    actionCatalogProjection.value.error?.message ||
    "",
);
const selectedAction = computed(
  () =>
    form.actions.find((action) => action.nodeKey === selectedNodeKey.value) ??
    null,
);
const firstAction = computed(() => form.actions[0] ?? null);
const firstActionDefinition = computed(() =>
  firstAction.value
    ? findScenarioActionCatalogItem(actionCatalog.value, firstAction.value.type)
    : undefined,
);
const firstActionOptions = computed<ScenarioActionTargetOption[]>(() =>
  form.actions.map((action) => {
    const definition = findScenarioActionCatalogItem(
      actionCatalog.value,
      action.type,
    );
    return {
      value: action.nodeKey ?? "",
      name: definition?.name ?? action.type,
      code: action.nodeKey ?? `Шаг ${action.position + 1}`,
      description: definition?.description ?? nodeSummary(action),
      kind: "existing",
      executor: definition?.executor,
      position: action.position,
    };
  }),
);
const canChooseFirstAction = computed(
  () => canEdit.value && form.actions.length > 1,
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
      findScenarioActionCatalogItem(actionCatalog.value, action.type),
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
const actionOutlineItems = computed(() =>
  form.actions.map((action) => {
    const definition = findScenarioActionCatalogItem(
      actionCatalog.value,
      action.type,
    );
    const issues = actionIssues.value.filter(
      (issue) => issue.nodeKey === action.nodeKey,
    );
    const executor = definition?.executor ?? "SERVER";
    const semantics = scenarioGraphNodePresentation(action.type, executor);
    return {
      action,
      label: definition?.name ?? semantics.kindLabel,
      summary: nodeSummary(action),
      issueCount: issues.length,
      executor,
      ...semantics,
    };
  }),
);
const filteredActionOutlineItems = computed(() => {
  const query = actionOutlineQuery.value.trim().toLocaleLowerCase("ru");
  return actionOutlineItems.value.filter((item) => {
    if (actionOutlineIssuesOnly.value && !item.issueCount) return false;
    if (!query) return true;
    return [
      item.label,
      item.action.type,
      item.action.nodeKey,
      item.summary,
    ].some((value) => String(value ?? "").toLocaleLowerCase("ru").includes(query));
  });
});
const actionOutlineIssueCount = computed(
  () => actionOutlineItems.value.filter(({ issueCount }) => issueCount > 0).length,
);
const graphIsLarge = computed(() =>
  scenarioGraphShowsMinimap(form.actions.length),
);
const graphMinimapDimensions = computed(() =>
  actionWorkspaceWidth.value > 0 && actionWorkspaceWidth.value <= 400
    ? { width: 104, height: 76 }
    : actionWorkspaceWidth.value > 0 && actionWorkspaceWidth.value <= 600
      ? { width: 156, height: 116 }
      : { width: 180, height: 116 },
);
const actionWorkspaceStyle = computed(() => ({
  "--action-outline-width": `${SCENARIO_ACTION_OUTLINE_WIDTH}px`,
  "--action-canvas-min-width": `${SCENARIO_ACTION_CANVAS_MIN_WIDTH}px`,
  "--action-inspector-min-width": `${SCENARIO_ACTION_INSPECTOR_MIN_WIDTH}px`,
  "--action-inspector-width": `${actionInspectorWidth.value}px`,
}));
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
    JSON.stringify(localizationPolicy.value) !==
      initialLocalizationSnapshot.value,
);
const durableSourceIsDirty = computed(
  () =>
    formIsDirty.value ||
    ruleIsDirty.value ||
    audienceIsDirty.value ||
    deliveryIsDirty.value ||
    localizationIsDirty.value,
);
const canManage = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.scenarios.write",
  ),
);
const canPublishScenario = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.scenarios.publish",
  ),
);
const canClassifySecurity = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.scenarios.classify_security",
  ),
);
const selectableImportanceClasses = computed(() =>
  importanceClassOptions.filter(
    (option) =>
      option.value !== "SECURITY" ||
      canClassifySecurity.value ||
      form.importanceClass === "SECURITY",
  ),
);
const usesGlobalFrequency = computed(
  () => admissionSettings.value?.mode === "PROJECT_GLOBAL_V1",
);
const publishedHeadWithoutDraft = computed(
  () => Boolean(form.id && currentRevisionId.value && currentDraftVersion.value === null),
);
const canEdit = computed(
  () => canManage.value && authoringEditable.value && (
    !publishedHeadWithoutDraft.value || changeDraftStarted.value
  ),
);
const sourceSnapshotUnavailable = computed(
  () =>
    !authoringEditable.value &&
    authoringUnavailableReason.value === "SOURCE_SNAPSHOT_UNAVAILABLE",
);
const readonlyExplanation = computed(() =>
  !canManage.value
    ? "У вас есть право просмотра. Изменение и сохранение сценария недоступны для вашей роли."
    : sourceSnapshotUnavailable.value
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
const ruleSerialization = computed(() =>
  ruleContext.value
    ? serializeRuleDraft(ruleDraft.value, ruleContext.value)
    : null,
);
const ruleValidationStatus = computed(() => {
  const leaves = ruleSummary.value?.leaves ?? 0;
  if (!leaves) {
    return {
      ready: false,
      title: "Добавьте хотя бы одно условие",
      detail: "После этого можно проверить правило на тестовом пользователе.",
    };
  }
  if (ruleSerialization.value?.ok) {
    return {
      ready: true,
      title: "Условия готовы к проверке",
      detail: `Настроено: ${russianCount(leaves, "условие", "условия", "условий")}.`,
    };
  }
  const issueCount = ruleSerialization.value?.issues.length ?? 0;
  return {
    ready: false,
    title: "Завершите настройку условий",
    detail: `Нужно заполнить: ${russianCount(issueCount, "поле", "поля", "полей")}.`,
  };
});
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
    detail: `${russianCount(form.actions.length, "действие", "действия", "действий")} · ${russianCount(form.actions.filter((action) => action.type === "WAIT_FOR_GOAL").length, "цель", "цели", "целей")}`,
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
const flowEdgeTypes = markRaw({ scenario: ScenarioFlowEdge });

const graphLocaleOptions = computed(
  () => (authoringContract.value?.localization?.locales ?? []).map((locale) => ({
    ...locale,
    label: localeDisplayName(locale.code),
  })),
);

watch(
  () => authoringContract.value?.localization,
  (catalog) => {
    if (!catalog) {
      graphLocale.value = "";
      return;
    }
    if (!catalog.locales.some(({ code }) => code === graphLocale.value)) {
      graphLocale.value = catalog.defaultLocale;
    }
  },
  { immediate: true },
);

const flowTransitions = computed(() => {
  const defaultLocale = authoringContract.value?.localization?.defaultLocale;
  return graphTransitions(form.actions, {
    requestedLocale: graphLocale.value || defaultLocale,
    defaultLocale,
  });
});

const baseGraphViewModel = computed(() =>
  buildScenarioGraphViewModel({
    actions: form.actions,
    transitions: flowTransitions.value,
    triggerLabel: selectedEvent.value
      ? eventDisplayName(selectedEvent.value.code, selectedEvent.value.name)
      : "Выберите событие",
    presentAction: (action) => {
      const item = actionOutlineItems.value.find(
        ({ action: candidate }) => candidate === action,
      );
      const definition = findScenarioActionCatalogItem(actionCatalog.value, action.type);
      const semantics = scenarioGraphNodePresentation(
        action.type,
        definition?.executor ?? "SERVER",
      );
      return {
        label: item?.label ?? definition?.name ?? semantics.kindLabel,
        nodeKey: action.nodeKey ?? "",
        icon: semantics.icon,
        executor: definition?.executor ?? "SERVER",
        summary: item?.summary ?? nodeSummary(action),
        issueCount: item?.issueCount ?? 0,
      };
    },
  }),
);

const graphPresentationLayout = ref<ScenarioGraphLayout>(
  createAutoScenarioGraphLayout(),
);
const graphPresentationScope = computed<ScenarioGraphLayoutScope | null>(() => {
  const operatorId = auth.user?.id;
  const projectId = auth.project?.id;
  const routeScenarioId =
    typeof route.params.scenarioId === "string"
      ? route.params.scenarioId
      : "new";
  const scenarioId = form.id ?? (routeScenarioId !== "new" ? routeScenarioId : "");
  return operatorId && projectId && scenarioId
    ? { operatorId, projectId, scenarioId }
    : null;
});
let activeGraphPresentationScope: ScenarioGraphLayoutScope | null = null;

function graphPresentationStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persistGraphPresentation(
  layout = graphPresentationLayout.value,
  scope = graphPresentationScope.value,
) {
  const storage = graphPresentationStorage();
  if (storage && scope) persistScenarioGraphLayout(storage, scope, layout);
}

function setGraphPresentationLayout(layout: ScenarioGraphLayout) {
  graphPresentationLayout.value = layout;
  persistGraphPresentation(layout);
}

watch(
  graphPresentationScope,
  (scope) => {
    if (!scope) {
      activeGraphPresentationScope = null;
      graphPresentationLayout.value = createAutoScenarioGraphLayout();
      const storage = graphPresentationStorage();
      const operatorId = auth.user?.id;
      const projectId = auth.project?.id;
      if (storage && operatorId && projectId) {
        removeScenarioGraphLayout(storage, {
          operatorId,
          projectId,
          scenarioId: "new",
        });
      }
      return;
    }
    const storage = graphPresentationStorage();
    const previous = activeGraphPresentationScope;
    activeGraphPresentationScope = scope;
    if (!previous && graphPresentationLayout.value.mode === "manual") {
      persistGraphPresentation(graphPresentationLayout.value, scope);
      return;
    }
    if (!storage) return;
    graphPresentationLayout.value = loadScenarioGraphLayout(storage, scope);
  },
  { immediate: true },
);

const graphViewModel = shallowRef(baseGraphViewModel.value);
const graphLayoutStatus = ref<"idle" | "loading" | "laid-out" | "fallback">(
  "idle",
);
let graphLayoutRequest = 0;
let graphLayoutFingerprint = "";
let graphLayoutCompleted = false;
let graphLayoutTimer: ReturnType<typeof setTimeout> | undefined;
let graphLayoutEngine: ScenarioGraphLayoutEngine | undefined;
let pendingGraphCenterNodeKey: string | null = null;
let graphHasInitialFit = false;
let graphFitPending = false;
interface ScenarioGraphFlowApi {
  findNode?: (nodeId: string) => {
    computedPosition: { x: number; y: number };
    dimensions: { width: number; height: number };
  } | undefined;
  fitView: (options?: Record<string, unknown>) => Promise<boolean>;
  getViewport?: () => ViewportTransform;
  setCenter?: (
    x: number,
    y: number,
    options?: { zoom?: number; duration?: number },
  ) => Promise<boolean>;
  setViewport?: (
    viewport: ViewportTransform,
    options?: { duration?: number },
  ) => Promise<boolean>;
}
let graphFlowApi: ScenarioGraphFlowApi | undefined;

async function waitGraphViewportFrame() {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else setTimeout(resolve, 16);
  });
}

async function restoreGraphViewport(
  instance: ScenarioGraphFlowApi,
  viewport: ViewportTransform,
  attempt = 0,
): Promise<boolean> {
  graphFitPending = true;
  await nextTick();
  if (graphFlowApi !== instance || !instance.setViewport) return false;
  try {
    const restored = await instance.setViewport(viewport, { duration: 0 });
    if (graphFlowApi !== instance) return false;
    if (restored) {
      graphFitPending = false;
      graphHasInitialFit = true;
      return true;
    }
  } catch {
    if (graphFlowApi !== instance) return false;
  }
  if (attempt < 2) {
    await waitGraphViewportFrame();
    return restoreGraphViewport(instance, viewport, attempt + 1);
  }
  return false;
}

async function fitGraphAfterLayout(attempt = 0): Promise<boolean> {
  graphFitPending = true;
  await nextTick();
  const flowApi = graphFlowApi;
  if (!flowApi) return false;
  try {
    const fitted = await flowApi.fitView({
      padding: 0.16,
      duration: scenarioGraphViewportDuration(),
    });
    if (fitted) {
      if (graphFlowApi === flowApi) graphFitPending = false;
      return true;
    }
    if (graphFlowApi === flowApi && attempt < 2) {
      await waitGraphViewportFrame();
      return fitGraphAfterLayout(attempt + 1);
    }
    return false;
  } catch {
    // Viewport fitting is non-critical and may race a conditional canvas unmount.
    return false;
  }
}

function graphLayoutKey(model: typeof baseGraphViewModel.value) {
  return JSON.stringify({
    nodes: model.nodes.map(({ id }) => id),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      label: edge.data?.label,
      kind: edge.data?.kind,
    })),
    layout: model.layout,
  });
}

function cancelGraphLayout() {
  if (graphLayoutTimer !== undefined) clearTimeout(graphLayoutTimer);
  graphLayoutTimer = undefined;
  graphLayoutRequest += 1;
  graphLayoutEngine?.terminateWorker?.();
  graphLayoutEngine = undefined;
}

async function performGraphAutoLayout(
  model: typeof baseGraphViewModel.value,
  fingerprint: string,
  explicit: boolean,
) {
  const request = ++graphLayoutRequest;
  try {
    graphLayoutEngine = createScenarioGraphLayoutWorker();
  } catch {
    if (request !== graphLayoutRequest) return;
    graphViewModel.value = model;
    graphLayoutStatus.value = "fallback";
    graphLayoutCompleted = true;
    return;
  }
  const engine = graphLayoutEngine;
  graphLayoutStatus.value = "loading";
  const result = await layoutScenarioGraphViewModel(model, {
    engine,
    measureLabel: measureScenarioGraphEdgeLabel,
  });
  if (request !== graphLayoutRequest) return;
  engine.terminateWorker?.();
  if (graphLayoutEngine === engine) graphLayoutEngine = undefined;
  if (fingerprint !== graphLayoutFingerprint) return;
  graphViewModel.value = mergeScenarioGraphPresentation(
    result.viewModel,
    baseGraphViewModel.value,
  );
  graphLayoutStatus.value = result.status;
  graphLayoutCompleted = true;
  const shouldFit = explicit || (!graphHasInitialFit && model.nodes.length > 1);
  if (shouldFit && await fitGraphAfterLayout()) graphHasInitialFit = true;
  if (pendingGraphCenterNodeKey) {
    const nodeKey = pendingGraphCenterNodeKey;
    if (await focusGraphNodeInViewport(nodeKey)) {
      if (pendingGraphCenterNodeKey === nodeKey) pendingGraphCenterNodeKey = null;
    }
  }
}

function queueGraphAutoLayout(
  model: typeof baseGraphViewModel.value,
  fingerprint: string,
  explicit = false,
) {
  cancelGraphLayout();
  if (model.nodes.length <= 1 || typeof window === "undefined") {
    graphViewModel.value = model;
    graphLayoutStatus.value = "idle";
    return;
  }
  const run = () => {
    graphLayoutTimer = undefined;
    void performGraphAutoLayout(model, fingerprint, explicit);
  };
  if (explicit || !graphLayoutCompleted) run();
  else graphLayoutTimer = setTimeout(run, 120);
}

function requestExplicitGraphAutoLayout() {
  setGraphPresentationLayout(
    createAutoScenarioGraphLayout(),
  );
  const model = baseGraphViewModel.value;
  const fingerprint = graphLayoutKey(model);
  graphLayoutFingerprint = fingerprint;
  queueGraphAutoLayout(model, fingerprint, true);
}

function initializeGraphFlow(instance: ScenarioGraphFlowApi) {
  graphFlowApi = instance;
  const centerPendingNode = () => {
    const nodeKey = pendingGraphCenterNodeKey;
    if (
      !nodeKey
      || graphLayoutTimer !== undefined
      || graphLayoutEngine
      || graphLayoutStatus.value === "loading"
    ) return;
    void focusGraphNodeInViewport(nodeKey).then((centered) => {
      if (centered && pendingGraphCenterNodeKey === nodeKey) {
        pendingGraphCenterNodeKey = null;
      }
    });
  };
  const savedViewport = graphPresentationLayout.value.viewport;
  if (
    savedViewport &&
    instance.setViewport
  ) {
    void restoreGraphViewport(instance, savedViewport).then((restored) => {
      if (graphFlowApi !== instance) return;
      if (restored) {
        centerPendingNode();
      } else if (graphLayoutCompleted) {
        void fitGraphAfterLayout().then((fitted) => {
          if (fitted) graphHasInitialFit = true;
          centerPendingNode();
        });
      }
    });
    return;
  }
  if (graphFitPending || graphLayoutCompleted) {
    void fitGraphAfterLayout().then((fitted) => {
      if (fitted) graphHasInitialFit = true;
      centerPendingNode();
    });
    return;
  }
  centerPendingNode();
}

watch(
  baseGraphViewModel,
  (model) => {
    if (graphPresentationLayout.value.mode === "manual") {
      cancelGraphLayout();
      if (loading.value && model.nodes.length <= 1) {
        graphViewModel.value = model;
        graphLayoutStatus.value = "idle";
        return;
      }
      const reconciled = reconcileScenarioGraphLayout(
        graphPresentationLayout.value,
        model,
      );
      if (JSON.stringify(reconciled) !== JSON.stringify(graphPresentationLayout.value)) {
        setGraphPresentationLayout(reconciled);
      }
      graphViewModel.value = applyScenarioGraphLayout(
        mergeScenarioGraphPresentation(graphViewModel.value, model),
        reconciled,
      );
      graphLayoutStatus.value = "idle";
      return;
    }
    const fingerprint = graphLayoutKey(model);
    if (fingerprint === graphLayoutFingerprint) {
      graphViewModel.value = mergeScenarioGraphPresentation(
        graphViewModel.value,
        model,
      );
      return;
    }
    graphLayoutFingerprint = fingerprint;
    graphViewModel.value = model;
    queueGraphAutoLayout(model, fingerprint);
  },
  { immediate: true },
);

const flowNodes = computed(() =>
  graphViewModel.value.nodes.map((node) => ({
    ...node,
    selected: node.id !== "trigger" && node.id === selectedNodeKey.value,
  })),
);
const flowEdges = computed(() => graphViewModel.value.edges);
const selectedGraphBranchNodeIds = computed(() =>
  scenarioGraphBranchNodeIds(selectedNodeKey.value, flowEdges.value),
);
const graphLayoutMode = computed(() => graphPresentationLayout.value.mode);
const selectedGraphNodeLabel = computed(() => {
  const action = selectedAction.value;
  if (!action) return "";
  return (
    findScenarioActionCatalogItem(actionCatalog.value, action.type)?.name ??
    scenarioGraphNodePresentation(action.type).kindLabel
  );
});

function selectGraphLayoutMode(mode: ScenarioGraphLayoutMode) {
  if (mode === graphPresentationLayout.value.mode) return;
  if (mode === "auto") {
    requestExplicitGraphAutoLayout();
    return;
  }
  if (!canEdit.value) return;
  cancelGraphLayout();
  const viewport = graphFlowApi?.getViewport?.();
  const manual = createManualScenarioGraphLayout(
    graphViewModel.value,
    viewport,
  );
  setGraphPresentationLayout(manual);
  graphViewModel.value = applyScenarioGraphLayout(
    graphViewModel.value,
    manual,
  );
  graphLayoutStatus.value = "idle";
}

function moveGraphNode(event: NodeDragEvent) {
  if (!canEdit.value || graphPresentationLayout.value.mode !== "manual") return;
  const next = moveScenarioGraphNode(
    graphPresentationLayout.value,
    event.node.id,
    event.node.position,
  );
  if (next === graphPresentationLayout.value) return;
  setGraphPresentationLayout(next);
  graphViewModel.value = applyScenarioGraphLayout(
    mergeScenarioGraphPresentation(graphViewModel.value, baseGraphViewModel.value),
    next,
  );
}

function nudgeGraphNode(direction: ScenarioGraphNudgeDirection) {
  if (!canEdit.value || !selectedNodeKey.value) return;
  const next = nudgeScenarioGraphNode(
    graphPresentationLayout.value,
    selectedNodeKey.value,
    direction,
  );
  if (next === graphPresentationLayout.value) return;
  setGraphPresentationLayout(next);
  graphViewModel.value = applyScenarioGraphLayout(
    mergeScenarioGraphPresentation(graphViewModel.value, baseGraphViewModel.value),
    next,
  );
}

function rememberGraphViewport(viewport: ViewportTransform) {
  const next = updateScenarioGraphViewport(
    graphPresentationLayout.value,
    viewport,
  );
  setGraphPresentationLayout(next);
}

watch(
  () => form.name,
  (name) => {
    if (!codeTouched.value) form.code = slugify(name);
  },
);

function syncActionWorkspaceWidth() {
  const workspaceWidth = studioGridElement.value?.clientWidth ?? 0;
  actionWorkspaceWidth.value = workspaceWidth;
  compactActionLayout.value = workspaceWidth
    ? workspaceWidth <= SCENARIO_ACTION_COMPACT_MAX_WIDTH
    : Boolean(window.matchMedia?.("(max-width: 1100px)").matches);
  if (!workspaceWidth || compactActionLayout.value) {
    actionInspectorMaxWidth.value = SCENARIO_ACTION_INSPECTOR_MAX_WIDTH;
    return;
  }
  const maxWidth = scenarioActionInspectorMaxWidth(workspaceWidth);
  actionInspectorMaxWidth.value = maxWidth;
  if (actionInspectorWidth.value > maxWidth) actionInspectorWidth.value = maxWidth;
}

watch(
  studioGridElement,
  (element) => {
    actionWorkspaceResizeObserver?.disconnect();
    actionWorkspaceResizeObserver = null;
    if (element && typeof ResizeObserver !== "undefined") {
      actionWorkspaceResizeObserver = new ResizeObserver(syncActionWorkspaceWidth);
      actionWorkspaceResizeObserver.observe(element);
    }
    syncActionWorkspaceWidth();
  },
  { flush: "post" },
);

onMounted(() => {
  syncActionWorkspaceWidth();
  window.addEventListener("resize", syncActionWorkspaceWidth);
  void load();
});

onBeforeUnmount(() => {
  cancelGraphLayout();
  pendingGraphCenterNodeKey = null;
  graphFlowApi = undefined;
  graphFitPending = false;
  actionWorkspaceResizeObserver?.disconnect();
  actionWorkspaceResizeObserver = null;
  window.removeEventListener("resize", syncActionWorkspaceWidth);
  translationController.dispose();
});

watch(
  () => [studioStage.value, compactActionLayout.value, graphExpanded.value] as const,
  ([stage, compact, expanded]) => {
    if (stage !== "actions" || (compact && !expanded)) {
      graphFlowApi = undefined;
      graphFitPending = false;
    }
  },
);

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  loading.value = true;
  error.value = "";
  authoringError.value = "";
  audienceSegmentsError.value = "";
  actionsLoadError.value = "";
  templatePolicyError.value = "";
  templateAttributeKeys.value = null;
  templateAttributes.value = [];
  templatePolicyWarnings.value = [];
  changeDraftStarted.value = false;
  pendingActionChangePreview.value = null;
  actionChangePreview.value = null;
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
      canReadProjectActions.value
        ? projectActionsStore
            .ensureLoaded(projectId)
            .catch((cause: unknown) => {
              actionsLoadError.value = scenarioApiErrorMessage(
                cause,
                "Не удалось загрузить настройки действий проекта",
              );
            })
        : Promise.resolve().then(() => {
            actionsLoadError.value =
              "У вас нет права читать Project Actions этого проекта.";
          }),
      scenarioAuthoringRepository.getContract(projectId).then(async (value) => {
        authoringContract.value = value;
        if (value.audience) await refreshAudienceSegments();
      }),
      repository.mode === "api"
        ? scenarioAdmissionApi
            .get(projectId)
            .then((value) => {
              admissionSettings.value = value;
            })
            .catch(() => {
              admissionSettings.value = null;
            })
        : Promise.resolve(),
      repository.mode === "api"
        ? attributeContractRepository
            .workspace(projectId)
            .then((workspace) => {
              const publishedFields =
                workspace.currentPublication?.document.fields ?? [];
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
        updatedAt: scenario.updatedAt,
        code: scenario.code,
        name: scenario.name,
        description: scenario.description ?? "",
        eventDefinitionId: scenario.eventDefinitionId,
        status: scenario.status,
        conversationPolicy: scenario.conversationPolicy ?? "create_new",
        priority: scenario.priority,
        importanceClass: scenario.importanceClass ?? "GENERAL",
        respectsQuietHours: scenario.respectsQuietHours ?? false,
        cooldownSeconds: scenario.cooldownSeconds,
        maxRunsPerUser: scenario.maxRunsPerUser,
        activeFrom: scenario.activeFrom,
        activeTo: scenario.activeTo,
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
      form.importanceClass = "GENERAL";
      form.respectsQuietHours =
        admissionSettings.value?.quietHours.enabled === true;
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
    initialLocalizationSnapshot.value = JSON.stringify(
      localizationPolicy.value,
    );
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
  if (stage !== "actions") graphExpanded.value = false;
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
    graphExpanded.value = false;
    const index = Number(issue.path.match(/actions(?:\.|\[)(\d+)/)?.[1]);
    const action = Number.isInteger(index) ? form.actions[index] : undefined;
    selectedNodeKey.value = action?.nodeKey ?? null;
    inspectorMode.value = action ? "node" : "settings";
    if (action) {
      const projectLocales = new Set(
        authoringContract.value?.localization?.locales.map(
          ({ code }) => code,
        ) ?? [],
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
      focusActionInspector();
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
  const publishedStateUnchanged =
    currentRuleSnapshot === snapshot.ruleSnapshot &&
    (!snapshot.audienceSnapshot ||
      currentAudienceSnapshot === snapshot.audienceSnapshot) &&
    currentDeliverySnapshot === snapshot.deliverySnapshot &&
    currentAuthoringSnapshot === snapshot.authoringSnapshot;
  changeDraftStarted.value = !publishedStateUnchanged;
  saveNotice.value =
    publishedStateUnchanged
      ? `Опубликована версия ${revisionId}. Новые запуски будут использовать её.`
      : `Опубликована версия ${revisionId}, но в этой вкладке уже есть более новые изменения. Проверьте и опубликуйте их отдельно.`;
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
      const defaultLocale =
        authoringContract.value?.localization?.defaultLocale;
      const preferred = defaultLocale ? map[defaultLocale] : undefined;
      if (typeof preferred === "string") return preferred;
      return (
        Object.values(map).find(
          (item): item is string => typeof item === "string",
        ) ?? ""
      );
    }
    return "";
  };
  if (action.type === "ASK_CHOICE")
    return (
      displayText(action.config.message) || "Настройте вопрос и варианты ответа"
    );
  if (action.type === "CONDITION")
    return `${russianCount(Array.isArray(action.config.branches) ? action.config.branches.length : 0, "ветка", "ветки", "веток")} и запасной переход`;
  if (action.type === "WAIT_FOR_GOAL") {
    return authoringContract.value
      ? summarizeGoalDraft(
          goalDraftFromConfig(action.config),
          authoringContract.value,
        )
      : "Настройте цель · конечный срок · 2 ветки";
  }
  const first = Object.values(action.config).map(displayText).find(Boolean);
  return first ? first : "Настройте параметры действия";
}

function appendNode(type: string, connectPrevious: boolean) {
  rememberActionViewFocus();
  const definition = findScenarioActionCatalogItem(actionCatalog.value, type);
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
    !usesExplicitTransitions(previous.type) &&
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
  graphExpanded.value = false;
  studioStage.value = "actions";
  focusActionInspector();
  return node;
}

function addNode(type: string) {
  const node = appendNode(type, true);
  void nextTick(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-action-node-key="${node.nodeKey}"]`,
      ),
    );
    actionViewReturnFocus =
      candidates.find((candidate) => candidate.getClientRects().length > 0) ??
      candidates[0] ??
      null;
  });
}

function rememberActionViewFocus() {
  if (document.activeElement instanceof HTMLElement) {
    actionViewReturnFocus = document.activeElement;
  }
}

function focusActionInspector() {
  void nextTick(() => actionInspector.value?.focus?.());
}

function visibleActionFocusFallback() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".action-outline-item, .mobile-node-card, [data-testid='action-picker-trigger'], .mobile-graph-button",
    ),
  );
  return (
    candidates.find((candidate) => candidate.getClientRects().length > 0) ??
    candidates[0] ??
    null
  );
}

function restoreActionViewFocus() {
  const target = actionViewReturnFocus;
  actionViewReturnFocus = null;
  void nextTick(() => {
    const targetVisible =
      target?.isConnected && target.getClientRects().length > 0;
    (targetVisible ? target : visibleActionFocusFallback())?.focus();
  });
}

function toggleGraphExpanded() {
  if (graphExpanded.value) {
    const openedFromOutlineCenter = graphExpandedFromOutlineCenter;
    graphExpanded.value = false;
    if (openedFromOutlineCenter) {
      selectedNodeKey.value = null;
      inspectorMode.value = "settings";
      graphExpandedFromOutlineCenter = false;
    }
    if (
      compactActionLayout.value &&
      selectedAction.value &&
      !openedFromOutlineCenter
    ) {
      focusActionInspector();
    } else {
      restoreActionViewFocus();
    }
    return;
  }
  graphExpandedFromOutlineCenter = false;
  rememberActionViewFocus();
  graphExpanded.value = true;
  void nextTick(() => graphCanvasElement.value?.focus());
}

function createTarget(
  type: string,
  kind: "next" | "choice" | "timeout" | "condition" | "fallback" | "goal",
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
  else if (kind === "timeout")
    source.config = { ...source.config, onTimeout: target };
  else if (kind === "goal")
    source.config = { ...source.config, onGoal: target };
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
  rememberActionViewFocus();
  graphExpandedFromOutlineCenter = false;
  selectedNodeKey.value = event.node.id;
  inspectorMode.value = "node";
  studioStage.value = "actions";
  const keepManualCanvasOpen =
    compactActionLayout.value &&
    graphExpanded.value &&
    graphPresentationLayout.value.mode === "manual";
  if (keepManualCanvasOpen) {
    void nextTick(() => graphCanvasElement.value?.focus());
    return;
  }
  graphExpanded.value = false;
  focusActionInspector();
}

function activateGraphNodeFromKeyboard(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as HTMLElement | null;
  const nodeElement = target?.closest<HTMLElement>(
    ".vue-flow__node[data-id]",
  );
  if (!nodeElement || target !== nodeElement) return;
  const node = flowNodes.value.find(
    (candidate) => candidate.id === nodeElement.dataset.id,
  );
  if (!node) return;
  event.preventDefault();
  event.stopPropagation();
  selectNode({ node });
}

function openNode(nodeKey: string) {
  rememberActionViewFocus();
  selectedNodeKey.value = nodeKey;
  inspectorMode.value = "node";
  graphExpanded.value = false;
  studioStage.value = "actions";
  focusActionInspector();
}

function resizeActionInspector(width: number) {
  actionInspectorWidth.value = clampScenarioActionInspectorWidth(
    width,
    SCENARIO_ACTION_INSPECTOR_MIN_WIDTH,
    actionInspectorMaxWidth.value,
  );
}

function centerFirstActionOutlineResult() {
  const first = filteredActionOutlineItems.value[0]?.action.nodeKey;
  if (first) void centerGraphNode(first);
}

async function centerGraphNode(nodeKey: string) {
  pendingGraphCenterNodeKey = nodeKey;
  if (compactActionLayout.value) {
    rememberActionViewFocus();
    graphExpandedFromOutlineCenter = true;
    selectedNodeKey.value = nodeKey;
    inspectorMode.value = "node";
    studioStage.value = "actions";
    graphExpanded.value = true;
    void nextTick(() => graphCanvasElement.value?.focus());
  } else {
    openNode(nodeKey);
  }
  if (graphLayoutTimer !== undefined || graphLayoutEngine || graphLayoutStatus.value === "loading") return;
  if (await focusGraphNodeInViewport(nodeKey)) pendingGraphCenterNodeKey = null;
}

async function focusGraphNodeInViewport(nodeKey: string) {
  await nextTick();
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
  const node = graphFlowApi?.findNode?.(nodeKey);
  const zoom = graphFlowApi?.getViewport?.().zoom;
  if (node && zoom && graphFlowApi?.setCenter) {
    return await graphFlowApi.setCenter(
      node.computedPosition.x + node.dimensions.width / 2,
      node.computedPosition.y + node.dimensions.height / 2,
      { zoom, duration: scenarioGraphViewportDuration() },
    );
  }
  return await graphFlowApi?.fitView({
    nodes: [nodeKey],
    padding: 0.75,
    ...(zoom ? { minZoom: zoom, maxZoom: zoom } : {}),
    duration: scenarioGraphViewportDuration(),
  }) ?? false;
}

function openFirstAction() {
  if (firstAction.value?.nodeKey) openNode(firstAction.value.nodeKey);
}

function actionChangeFingerprint() {
  return JSON.stringify(form.actions.map(toPlainScenarioAction));
}

function changeFirstAction(nodeKey: string) {
  if (!canEdit.value || !firstAction.value?.nodeKey) return;
  scheduleActionChangePreview({
    kind: "entry-point",
    currentNodeKey: firstAction.value.nodeKey,
    targetNodeKey: nodeKey,
    plan: planScenarioEntryPointChange(form.actions, nodeKey),
    sourceFingerprint: actionChangeFingerprint(),
  });
}

function closeNodeInspector() {
  selectedNodeKey.value = null;
  inspectorMode.value = "settings";
  restoreActionViewFocus();
}

function changeType(type: string) {
  if (!selectedAction.value) return;
  const preview = createTypeReplacementPreview(selectedAction.value, type);
  if (preview) scheduleActionChangePreview(preview);
}

function createTypeReplacementPreview(
  action: ScenarioAction,
  type: string,
  refreshed = false,
): ScenarioActionChangePreview | null {
  const definition = findScenarioActionCatalogItem(actionCatalog.value, type);
  const currentDefinition = findScenarioActionCatalogItem(
    actionCatalog.value,
    action.type,
  );
  if (!definition || type === action.type) return null;
  const defaultConfig = {
    ...(definition ? createActionConfig(definition) : {}),
    ...createScenarioNode(
      type,
      action.position,
      form.actions.map((item) => item.nodeKey ?? ""),
    ).config,
  };
  const localizedKeys = new Set(
    authoringContract.value?.localization?.paths.flatMap((descriptor) => {
      if (descriptor.actionType !== type) return [];
      const match = descriptor.path.match(/^config\.([^.]+)$/);
      return match?.[1] ? [match[1]] : [];
    }) ?? [],
  );
  return {
    kind: "type-replacement",
    currentName: currentDefinition?.name ?? action.type,
    targetName: definition.name,
    targetType: type,
    plan: planScenarioActionTypeReplacement(
      action,
      definition,
      defaultConfig,
      localizedKeys,
    ),
    sourceFingerprint: actionChangeFingerprint(),
    ...(refreshed ? { refreshed: true } : {}),
  };
}

function scheduleActionChangePreview(
  preview: ScenarioActionChangePreview,
) {
  pendingActionChangePreview.value = preview;
}

function showPendingActionChange() {
  if (!pendingActionChangePreview.value) return;
  actionChangePreview.value = pendingActionChangePreview.value;
  pendingActionChangePreview.value = null;
}

function cancelActionChange() {
  pendingActionChangePreview.value = null;
  actionChangePreview.value = null;
}

function applyActionChange() {
  const preview = actionChangePreview.value;
  if (!preview || !canEdit.value) return;
  const currentFingerprint = actionChangeFingerprint();
  if (currentFingerprint !== preview.sourceFingerprint) {
    if (preview.kind === "entry-point") {
      const currentRoot = firstAction.value?.nodeKey;
      actionChangePreview.value = {
        ...preview,
        currentNodeKey: currentRoot ?? preview.currentNodeKey,
        plan: planScenarioEntryPointChange(form.actions, preview.targetNodeKey),
        sourceFingerprint: currentFingerprint,
        refreshed: true,
      };
    } else {
      const currentAction = form.actions.find(
        (action) => action.nodeKey === preview.plan.replacement.nodeKey,
      );
      const refreshed = currentAction
        ? createTypeReplacementPreview(currentAction, preview.targetType, true)
        : null;
      if (refreshed) actionChangePreview.value = refreshed;
      else cancelActionChange();
    }
    return;
  }
  if (preview.kind === "entry-point") {
    if (preview.plan.status !== "ready") return;
    form.actions.splice(0, form.actions.length, ...preview.plan.actions);
    selectedNodeKey.value = preview.targetNodeKey;
  } else {
    const index = form.actions.findIndex(
      (action) => action.nodeKey === preview.plan.replacement.nodeKey,
    );
    if (index < 0) return;
    let replacement = preview.plan.replacement;
    if (authoringContract.value?.localization?.enabled) {
      const [localizedAction] = normalizeLocalizedActionContent(
        [replacement],
        authoringContract.value.localization,
      );
      if (localizedAction) replacement = localizedAction;
    }
    form.actions.splice(index, 1, replacement);
  }
  actionChangePreview.value = null;
}

function startChangeDraft() {
  if (!canManage.value || !authoringEditable.value) return;
  changeDraftStarted.value = true;
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
  if (renameScenarioNode(form.actions, oldKey, newKey)) {
    const renamedLayout = renameScenarioGraphLayoutNode(
      graphPresentationLayout.value,
      oldKey,
      newKey,
    );
    if (renamedLayout !== graphPresentationLayout.value) {
      setGraphPresentationLayout(renamedLayout);
    }
    selectedNodeKey.value = newKey;
  }
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
  restoreActionViewFocus();
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
      findScenarioActionCatalogItem(actionCatalog.value, action.type),
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
    const payload = {
      id: form.id,
      updatedAt: form.updatedAt,
      name: form.name.trim(),
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      eventDefinitionId: form.eventDefinitionId,
      status: form.status,
      conversationPolicy: form.conversationPolicy,
      priority: form.priority,
      importanceClass: form.importanceClass,
      respectsQuietHours:
        form.importanceClass === "SECURITY" ? false : form.respectsQuietHours,
      cooldownSeconds: usesGlobalFrequency.value
        ? undefined
        : form.cooldownSeconds || undefined,
      maxRunsPerUser: usesGlobalFrequency.value
        ? undefined
        : form.maxRunsPerUser || undefined,
      activeFrom: form.activeFrom,
      activeTo: form.activeTo,
    };
    if (payload.status === "ARCHIVED") {
      throw new Error("Архивный сценарий нельзя изменить из редактора");
    }
    const draftContent = {
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
    };
    let scenarioId: string;
    let draft: Awaited<ReturnType<typeof saveAuthoringDraft>>;
    if (existingScenarioId) {
      scenarioId = existingScenarioId;
      draft = await saveAuthoringDraft(
        projectId,
        existingScenarioId,
        draftContent,
      );
      const metadata: UpdateScenarioMetadata = {
        name: payload.name,
        description: payload.description,
        eventDefinitionId: payload.eventDefinitionId,
        status: payload.status,
        conversationPolicy: payload.conversationPolicy,
        priority: payload.priority,
        importanceClass: payload.importanceClass,
        respectsQuietHours: payload.respectsQuietHours,
        ...(usesGlobalFrequency.value
          ? {}
          : {
              cooldownSeconds: payload.cooldownSeconds,
              maxRunsPerUser: payload.maxRunsPerUser,
            }),
        activeFrom: payload.activeFrom,
        activeTo: payload.activeTo,
        expectedUpdatedAt: form.updatedAt ?? "",
        reason: "Update scenario metadata from CMS editor",
      };
      if (!form.updatedAt)
        throw new Error("Не удалось определить версию сценария");
      const updated = await repository.updateScenarioMetadata(
        projectId,
        scenarioId,
        metadata,
      );
      form.updatedAt = updated.updatedAt;
    } else {
      const created = await createAuthoringScenario(projectId, {
        scenario: {
          code: payload.code,
          name: payload.name,
          ...(payload.description ? { description: payload.description } : {}),
          triggerEventDefinitionRevisionId: payload.eventDefinitionId,
          conversationPolicy: payload.conversationPolicy,
          priority: payload.priority,
          importanceClass: payload.importanceClass,
          respectsQuietHours: payload.respectsQuietHours,
          ...(payload.cooldownSeconds !== undefined
            ? { cooldownSeconds: payload.cooldownSeconds }
            : {}),
          ...(payload.maxRunsPerUser !== undefined
            ? { maxRunsPerUser: payload.maxRunsPerUser }
            : {}),
          ...(payload.activeFrom ? { activeFrom: payload.activeFrom } : {}),
          ...(payload.activeTo ? { activeTo: payload.activeTo } : {}),
        },
        draft: draftContent,
      });
      scenarioId = created.scenarioId;
      draft = created.draft;
      form.id = scenarioId;
    }
    initialSnapshot.value = JSON.stringify(form);
    initialRuleSnapshot.value = JSON.stringify(ruleDraft.value);
    initialAudienceSnapshot.value = JSON.stringify(audienceDraft.value);
    initialDeliverySnapshot.value = JSON.stringify(deliveryPolicy.value);
    initialLocalizationSnapshot.value = JSON.stringify(
      localizationPolicy.value,
    );
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
              ? russianCount(
                  actionIssues.length,
                  "ошибка в действиях",
                  "ошибки в действиях",
                  "ошибок в действиях",
                )
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
          v-if="authoringEditable && !error"
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
    <div v-else-if="loading" class="studio-loading" role="status" aria-live="polite">
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
        v-if="!canManage || !authoringEditable"
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
      <section
        v-else-if="publishedHeadWithoutDraft"
        class="readonly-notice change-draft-notice"
        role="status"
        aria-label="Редактирование опубликованной версии"
      >
        <i :class="changeDraftStarted ? 'pi pi-file-edit' : 'pi pi-lock'" />
        <div>
          <strong v-if="!changeDraftStarted">
            Опубликованная версия {{ currentRevisionId }} не изменится
          </strong>
          <strong v-else>Черновик изменений открыт</strong>
          <p v-if="!changeDraftStarted">
            Создайте черновик на её основе. Новые запуски получат изменения только после публикации, а активные продолжат исходную версию.
          </p>
          <p v-else>
            Новые запуски перейдут на неё только после публикации. Активные запуски останутся на исходной версии; их миграция выполняется отдельно.
          </p>
        </div>
        <Button
          v-if="!changeDraftStarted && canManage"
          label="Создать черновик изменений"
          icon="pi pi-plus"
          size="small"
          @click="startChangeDraft"
        />
      </section>
      <div
        ref="studioGridElement"
        class="studio-grid"
        :style="actionWorkspaceStyle"
        :class="[
          `stage-${studioStage}`,
          scenarioGraphWorkspaceEnabled
            ? 'graph-workspace-v2'
            : 'graph-workspace-fallback',
          {
            'has-action-inspector':
              studioStage === 'actions' &&
              Boolean(selectedAction) &&
              !graphExpanded,
            'graph-is-expanded': studioStage === 'actions' && graphExpanded,
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
          <section v-if="studioStage === 'actions'" class="action-workflow-nav">
            <header class="action-workflow-head">
              <div>
                <span>Сценарий</span>
                <strong>Действия</strong>
              </div>
              <small>{{ form.actions.length }}</small>
            </header>
            <div v-if="form.actions.length" class="action-outline-tools">
              <label class="action-outline-search">
                <i class="pi pi-search" aria-hidden="true" />
                <input
                  v-model="actionOutlineQuery"
                  type="search"
                  aria-label="Найти действие"
                  aria-keyshortcuts="Enter"
                  placeholder="Название или код"
                  @keydown.enter.prevent="centerFirstActionOutlineResult"
                />
              </label>
              <button
                type="button"
                class="action-outline-error-filter"
                :class="{ active: actionOutlineIssuesOnly }"
                :aria-pressed="actionOutlineIssuesOnly"
                aria-label="Показать только действия с ошибками"
                :disabled="!actionOutlineIssueCount"
                @click="actionOutlineIssuesOnly = !actionOutlineIssuesOnly"
              ><i class="pi pi-exclamation-circle" aria-hidden="true" />{{ actionOutlineIssueCount }}</button>
            </div>
            <div v-if="filteredActionOutlineItems.length" class="action-outline-list">
              <div
                v-for="item in filteredActionOutlineItems"
                :key="item.action.nodeKey"
                class="action-outline-row"
                :data-action-node-key="item.action.nodeKey"
                :class="{
                  active: selectedNodeKey === item.action.nodeKey && !graphExpanded,
                }"
              >
                <button
                  type="button"
                  class="action-outline-item action-outline-main"
                  :aria-label="`Настроить действие ${item.label}`"
                  @click="openNode(item.action.nodeKey ?? '')"
                >
                  <span><i :class="item.icon" /></span>
                  <div>
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.summary }}</small>
                    <code>{{ item.action.nodeKey }}</code>
                  </div>
                  <em v-if="item.issueCount">{{ item.issueCount }}</em>
                </button>
                <button
                  type="button"
                  class="action-outline-center"
                  :aria-label="`Показать ${item.action.nodeKey} на схеме`"
                  :title="`Показать ${item.action.nodeKey} на схеме`"
                  @click="centerGraphNode(item.action.nodeKey ?? '')"
                ><i class="pi pi-crosshairs" aria-hidden="true" /></button>
              </div>
            </div>
            <p v-else-if="form.actions.length" class="action-outline-empty" role="status">
              {{ actionOutlineIssuesOnly ? "Действий с ошибками не найдено." : "Поиск не нашёл действий." }}
            </p>
            <p v-else class="action-outline-empty">
              Здесь появятся добавленные действия.
            </p>

            <ActionPicker
              v-if="canEdit"
              class="action-library-picker"
              model-value=""
              :catalog="scenarioPickerActions"
              label="Добавить действие"
              placeholder="Добавить действие"
              hide-label
              apply-label="Добавить действие"
              @update:model-value="addNode"
            />
          </section>
        </aside>

        <main
          v-if="studioStage === 'actions'"
          ref="graphCanvasElement"
          class="graph-canvas"
          :class="{ 'graph-expanded': graphExpanded }"
          tabindex="-1"
          aria-label="Схема сценария"
          @keydown.esc="graphExpanded && toggleGraphExpanded()"
        >
          <header v-if="form.actions.length" class="graph-toolbar">
            <div>
              <span>Схема сценария</span>
              <small>{{
                graphExpanded ? "Полный обзор" : "Обзор связей между действиями"
              }}</small>
            </div>
            <div class="graph-toolbar-actions">
              <div
                v-if="graphLocaleOptions.length > 1"
                class="graph-locale-control"
              >
                <i class="pi pi-language" aria-hidden="true" />
                <Select
                  v-model="graphLocale"
                  class="graph-locale-select"
                  :options="graphLocaleOptions"
                  option-label="label"
                  option-value="code"
                  aria-label="Язык подписей графа"
                />
              </div>
              <button
                type="button"
                :aria-label="
                  graphExpanded
                    ? 'Вернуться к настройке действия'
                    : 'Развернуть схему сценария'
                "
                @click="toggleGraphExpanded"
              >
                <i :class="graphExpanded ? 'pi pi-compress' : 'pi pi-expand'" />
                {{ graphExpanded ? "К настройке" : "Развернуть" }}
              </button>
            </div>
          </header>
          <details
            v-if="authoringContract?.localization"
            class="localization-policy-card"
          >
            <summary>
              Языки контента ·
              {{
                localizationPolicy.mode === "ALL_PROJECT_LOCALES"
                  ? "все языки проекта"
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
                ><strong>{{
                  russianCount(
                    form.actions.length,
                    "действие",
                    "действия",
                    "действий",
                  )
                }}</strong>
              </div>
              <small
                >Выберите действие для настройки или откройте схему
                целиком.</small
              >
            </header>
            <button
              v-if="form.actions.length"
              type="button"
              class="mobile-graph-button"
              @click="toggleGraphExpanded"
            >
              <i class="pi pi-sitemap" />Открыть схему
            </button>
            <div v-if="form.actions.length" class="action-outline-tools mobile-action-outline-tools">
              <label class="action-outline-search">
                <i class="pi pi-search" aria-hidden="true" />
                <input
                  v-model="actionOutlineQuery"
                  type="search"
                  aria-label="Найти действие"
                  aria-keyshortcuts="Enter"
                  placeholder="Название или код"
                  @keydown.enter.prevent="centerFirstActionOutlineResult"
                />
              </label>
              <button
                type="button"
                class="action-outline-error-filter"
                :class="{ active: actionOutlineIssuesOnly }"
                :aria-pressed="actionOutlineIssuesOnly"
                aria-label="Показать только действия с ошибками"
                :disabled="!actionOutlineIssueCount"
                @click="actionOutlineIssuesOnly = !actionOutlineIssuesOnly"
              ><i class="pi pi-exclamation-circle" aria-hidden="true" />{{ actionOutlineIssueCount }}</button>
            </div>
            <button
              v-for="item in filteredActionOutlineItems"
              :key="item.action.nodeKey"
              type="button"
              class="mobile-node-card"
              :data-action-node-key="item.action.nodeKey"
              :aria-label="`Открыть узел ${item.action.nodeKey}`"
              @click="openNode(item.action.nodeKey ?? '')"
            >
              <span><i :class="item.icon" /></span>
              <div>
                <strong>{{ item.label }}</strong
                ><small>{{ item.action.nodeKey }} · {{ item.summary }}</small>
              </div>
              <em v-if="item.issueCount">{{ item.issueCount }}</em
              ><i class="pi pi-chevron-right" />
            </button>
            <p
              v-if="form.actions.length && !filteredActionOutlineItems.length"
              class="mobile-empty"
              role="status"
            >{{ actionOutlineIssuesOnly ? "Действий с ошибками не найдено." : "Поиск не нашёл действий." }}</p>
            <p v-if="!form.actions.length" class="mobile-empty">
              Добавьте первое действие из списка ниже.
            </p>
            <ActionPicker
              v-if="canEdit"
              class="mobile-library-picker"
              model-value=""
              :catalog="scenarioPickerActions"
              label="Добавить действие"
              placeholder="Добавить действие"
              hide-label
              apply-label="Добавить действие"
              @update:model-value="addNode"
            />
          </section>
          <ScenarioGraphLayoutToolbar
            v-if="(!compactActionLayout || graphExpanded) && form.actions.length"
            :mode="graphLayoutMode"
            :can-arrange="canEdit"
            :layouting="graphLayoutStatus === 'loading'"
            :layout-failed="graphLayoutStatus === 'fallback'"
            :selected-node-label="selectedGraphNodeLabel"
            @mode-change="selectGraphLayoutMode"
            @auto-layout="requestExplicitGraphAutoLayout"
            @nudge="nudgeGraphNode"
          />
          <VueFlow
            v-if="
              (!compactActionLayout || graphExpanded) && form.actions.length
            "
            :nodes="flowNodes"
            :edges="flowEdges"
            :node-types="flowNodeTypes"
            :edge-types="flowEdgeTypes"
            :fit-view-on-init="graphViewModel.viewport.fitViewOnInit"
            :min-zoom="
              compactActionLayout
                ? graphViewModel.viewport.compactMinZoom
                : graphViewModel.viewport.minZoom
            "
            :max-zoom="graphViewModel.viewport.maxZoom"
            :nodes-draggable="canEdit && graphLayoutMode === 'manual'"
            :nodes-connectable="false"
            @init="initializeGraphFlow"
            @keydown="activateGraphNodeFromKeyboard"
            @node-click="selectNode"
            @node-drag-stop="moveGraphNode"
            @viewport-change-end="rememberGraphViewport"
          >
            <Background
              pattern-color="var(--graph-edge)"
              :gap="graphViewModel.viewport.backgroundGap"
            />
            <MiniMap
              v-if="graphIsLarge && graphMinimapVisible"
              id="scenario-graph-minimap"
              class="scenario-graph-minimap"
              aria-label="Мини-карта большого сценария"
              position="bottom-left"
              pannable
              zoomable
              :width="graphMinimapDimensions.width"
              :height="graphMinimapDimensions.height"
              :node-border-radius="6"
              node-color="var(--status-accent-text)"
              node-stroke-color="var(--status-accent-text)"
              mask-color="color-mix(in srgb, var(--surface-canvas) 68%, transparent)"
              mask-stroke-color="var(--status-accent)"
            />
            <ScenarioFlowControls
              :selected-node-id="selectedNodeKey"
              :branch-node-ids="selectedGraphBranchNodeIds"
              :large-graph="graphIsLarge"
              :minimap-visible="graphMinimapVisible"
              @toggle-minimap="graphMinimapVisible = !graphMinimapVisible"
            />
          </VueFlow>
          <section
            v-if="!compactActionLayout && !form.actions.length"
            class="action-empty"
            role="status"
            aria-label="Сценарий пока не содержит действий"
          >
            <span class="action-empty-icon"><i class="pi pi-bolt" /></span>
            <div>
              <h1>Добавьте первое действие</h1>
              <p>
                Например, отправьте сообщение или дождитесь события. После
                добавления откроется схема сценария.
              </p>
            </div>
            <ActionPicker
              v-if="canEdit && scenarioPickerActions.length"
              class="action-empty-picker"
              model-value=""
              :catalog="scenarioPickerActions"
              label="Первое действие"
              placeholder="Выбрать первое действие"
              hide-label
              apply-label="Добавить действие"
              @update:model-value="addNode"
            />
          </section>
        </main>

        <main v-else-if="studioStage === 'eligibility'" class="rule-canvas">
          <header class="stage-section-header">
            <div>
              <span>Условия запуска</span>
              <h1 id="rule-builder-title">
                Что должно произойти перед запуском
              </h1>
              <p>
                Добавьте проверки текущего события или недавних действий
                пользователя.
              </p>
            </div>
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
          <footer
            v-if="ruleContext && canEdit"
            class="rule-validation-actions"
            data-testid="rule-validation-actions"
          >
            <div
              class="rule-validation-status"
              :class="{ ready: ruleValidationStatus.ready }"
              role="status"
            >
              <i
                :class="
                  ruleValidationStatus.ready
                    ? 'pi pi-check-circle'
                    : 'pi pi-info-circle'
                "
                aria-hidden="true"
              />
              <span>
                <strong>{{ ruleValidationStatus.title }}</strong>
                <small>{{ ruleValidationStatus.detail }}</small>
              </span>
            </div>
            <Button
              label="Проверить условия"
              icon="pi pi-check-circle"
              @click="validationOpen = true"
            />
          </footer>
          <div v-else-if="ruleContext" class="stage-empty">
            <i class="pi pi-lock" />
            <h2>Условия только для просмотра</h2>
            <template v-if="sourceSnapshotUnavailable">
              <p><strong>Исходные условия недоступны</strong></p>
              <p>
                Сценарий продолжает использовать условия опубликованной версии,
                но показать их без сохранённого исходника редактора нельзя.
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
            <Button
              label="Открыть настройки запуска"
              @click="selectStage('trigger')"
            />
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
              <p v-else>
                {{ audienceSummary?.text ?? "Аудитория не ограничена" }}
              </p>
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
            />
            <div v-else class="readonly-stage-card">
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
              v-if="ruleContext && canEdit && canPublishScenario"
              :project-id="auth.project?.id ?? ''"
              :scenario-id="form.id ?? ''"
              :draft="ruleDraft"
              :context="ruleContext"
              :audience-draft="audienceDraft"
              :audience-context="audienceContext ?? undefined"
              :delivery-policy="deliveryPolicy"
              :actions="form.actions"
              :localization-policy="localizationPolicy"
              :importance-class="form.importanceClass"
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
            /><Message
              v-else-if="!canPublishScenario"
              severity="info"
              :closable="false"
              >У вас нет права публиковать сценарии.</Message
            ><Message
              v-else-if="!canManage"
              severity="info"
              :closable="false"
              >У вас есть право публикации, но нет права изменять сценарий.
              Попросите редактора подготовить и сохранить новую версию.</Message
            ><Message
              v-else-if="!authoringEditable"
              severity="info"
              :closable="false"
              >Чтобы изменить настройки и выпустить новую версию, восстановите
              исходник редактора или создайте новый сценарий.</Message
            ><Message
              v-else-if="!canEdit"
              severity="info"
              :closable="false"
              >Сначала создайте черновик изменений на основе опубликованной
              версии. После сохранения его можно проверить и опубликовать.</Message
            ><Message v-else severity="warn" :closable="false"
              >Сначала выберите событие запуска из каталога сценариев.</Message
            ><ScenarioRevisionHistory
              v-if="form.id"
              :project-id="auth.project?.id ?? ''"
              :scenario-id="form.id"
              :current-revision-id="currentRevisionId"
              :localization-catalog="authoringContract?.localization"
              :readonly="!canPublishScenario"
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
        <ScenarioActionInspectorDock
          v-else-if="
            studioStage === 'actions' &&
            inspectorMode === 'node' &&
            selectedAction &&
            !graphExpanded
          "
          :width="actionInspectorWidth"
          :max-width="actionInspectorMaxWidth"
          @resize="resizeActionInspector"
        >
          <ScenarioNodeInspector
            v-if="canEdit"
            ref="actionInspector"
            :project-id="auth.project?.id ?? ''"
            :action="selectedAction"
            :actions="form.actions"
            :action-catalog="actionCatalog"
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
            @type-picker-closed="showPendingActionChange"
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
            v-else
            class="readonly-panel readonly-action-panel"
            aria-label="Действие только для просмотра"
          >
            <div class="settings-head readonly-action-head">
              <div>
                <small>Режим просмотра</small>
                <h2>
                  {{
                    findScenarioActionCatalogItem(
                      actionCatalog,
                      selectedAction.type,
                    )?.name ?? selectedAction.type
                  }}
                </h2>
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
                <dd>
                  <code>{{ selectedAction.nodeKey }}</code>
                </dd>
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
              {{
                sourceSnapshotUnavailable
                  ? "Изменить этот шаг нельзя: исходные настройки опубликованной версии не сохранились в формате редактора."
                  : "Изменение этого шага недоступно для вашей роли. Настройки показаны без возможности редактирования."
              }}
            </p>
          </aside>
        </ScenarioActionInspectorDock>
        <aside
          v-else-if="studioStage === 'trigger' && !canEdit"
          class="readonly-panel"
          aria-label="Сводка сценария"
        >
          <div class="settings-head">
            <small>Режим просмотра</small>
            <h2>Настройки запуска</h2>
            <p>Здесь показаны сохранённые настройки сценария.</p>
          </div>
          <dl>
            <div>
              <dt>Название</dt>
              <dd>{{ form.name }}</dd>
            </div>
            <div>
              <dt>Системный код</dt>
              <dd>
                <code>{{ form.code }}</code>
              </dd>
            </div>
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
            <div>
              <dt>Статус</dt>
              <dd>{{ form.status === "ACTIVE" ? "Активен" : "Черновик" }}</dd>
            </div>
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
            <EventDefinitionSelect
              v-model="form.eventDefinitionId"
              :project-id="auth.project?.id ?? ''"
              value-field="currentRevisionId"
              label="Событие запуска *"
              placeholder="Выберите событие запуска"
              required
              :disabled="!canEdit"
            />
            <div class="field">
              <label>Первое действие</label>
              <div
                v-if="firstAction"
                class="first-action-card"
                data-testid="scenario-first-action"
              >
                <span><i class="pi pi-play" /></span>
                <div>
                  <strong>{{
                    firstActionDefinition?.name ?? firstAction.type
                  }}</strong>
                  <small>{{ firstAction.nodeKey }}</small>
                </div>
                <ScenarioActionTargetPicker
                  v-if="canChooseFirstAction"
                  :model-value="firstAction.nodeKey ?? ''"
                  :options="firstActionOptions"
                  label="Изменить точку входа"
                  placeholder="Выберите действие"
                  hide-label
                  apply-label="Проверить изменение"
                  eyebrow="Маршрут сценария"
                  title="Изменить точку входа"
                  description="Выберите шаг запуска и проверьте, какие связи и действия изменятся."
                  @update:model-value="changeFirstAction"
                  @closed="showPendingActionChange"
                />
                <Button
                  label="Заменить первое действие"
                  icon="pi pi-pencil"
                  severity="secondary"
                  outlined
                  :disabled="!canEdit"
                  @click="openFirstAction"
                />
              </div>
              <small v-if="firstAction && form.actions.length > 1 && canEdit">
                Сначала покажем влияние на связи и недостижимые шаги. Изменение применится только после подтверждения.
              </small>
              <small v-else-if="!firstAction"
                >Добавьте действие на этапе «Действия» — оно станет первым после
                события запуска.</small
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
                <label for="scenario-importance">Класс важности</label>
                <Select
                  input-id="scenario-importance"
                  aria-label="Класс важности"
                  v-model="form.importanceClass"
                  :options="selectableImportanceClasses"
                  option-label="title"
                  option-value="value"
                  :disabled="!canEdit"
                >
                  <template #option="{ option }">
                    <div class="importance-option">
                      <strong>{{ option.title }}</strong>
                      <small>{{ option.description }}</small>
                    </div>
                  </template>
                </Select>
              </div>
              <div class="field">
                <label for="scenario-priority">Приоритет</label>
                <InputNumber
                  input-id="scenario-priority"
                  v-model="form.priority"
                  :min="-1000"
                  :max="1000"
                />
              </div>
            </div>
            <Message
              v-if="form.importanceClass === 'SECURITY'"
              severity="warn"
              :closable="false"
            >
              <strong>Вне общих лимитов.</strong> Сценарий безопасности
              игнорирует частоту и тихие часы. Для сохранения и публикации нужны
              специальные права и причина.
            </Message>
            <label class="quiet-hours-control">
              <span>
                <strong>Соблюдать тихие часы проекта</strong>
                <small v-if="form.importanceClass === 'SECURITY'">
                  Сообщения безопасности всегда обходят тихие часы.
                </small>
                <small
                  v-else-if="
                    admissionSettings && !admissionSettings.quietHours.enabled
                  "
                >
                  В проекте тихие часы выключены; настройка сохранится на
                  будущее.
                </small>
                <small v-else>
                  Подавленный запуск появится в журнале и не израсходует лимит.
                </small>
              </span>
              <ToggleSwitch
                v-model="form.respectsQuietHours"
                :disabled="!canEdit || form.importanceClass === 'SECURITY'"
              />
            </label>
            <p class="priority-helper">
              Если одно событие подходит нескольким сценариям, запускается один:
              сначала класс «Безопасность», затем большее значение priority. При
              равенстве порядок детерминирован системой.
            </p>
            <Message
              v-if="usesGlobalFrequency"
              severity="info"
              :closable="false"
            >
              Частота задаётся общими настройками проекта. Индивидуальные лимиты
              этого сценария доступны только в технической истории.
            </Message>
            <template v-else>
              <div class="settings-row legacy-frequency-fields">
                <div class="field">
                  <label for="scenario-max-runs">Макс. запусков</label
                  ><InputNumber
                    input-id="scenario-max-runs"
                    v-model="form.maxRunsPerUser"
                    :min="1"
                    placeholder="Без лимита"
                  />
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
              </div>
              <small class="legacy-frequency-note"
                >Устаревающий режим. Перейдите на общую частоту в настройках
                проекта.</small
              >
            </template>
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
      <ScenarioActionChangeDialog
        :visible="Boolean(actionChangePreview)"
        :preview="actionChangePreview"
        @cancel="cancelActionChange"
        @apply="applyActionChange"
      />
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
  font: 700 0.86rem var(--font-display);
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
  grid-template-columns: 208px minmax(0, 1fr);
  overflow: hidden;
}
.studio-grid.graph-workspace-v2.stage-actions.has-action-inspector {
  grid-template-columns:
    var(--action-outline-width)
    minmax(var(--action-canvas-min-width), 1fr)
    minmax(var(--action-inspector-min-width), var(--action-inspector-width));
  grid-template-rows: minmax(0, 1fr);
}
.studio-grid.graph-workspace-v2.stage-actions.has-action-inspector > .studio-sidebar {
  grid-column: 1;
  grid-row: 1;
}
.studio-grid.graph-workspace-v2.stage-actions.has-action-inspector > .graph-canvas {
  grid-column: 2;
  grid-row: 1;
}
.studio-grid.graph-workspace-v2.stage-actions.has-action-inspector > .scenario-action-inspector-dock {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
}
.studio-grid.graph-workspace-fallback.stage-actions.has-action-inspector {
  grid-template-columns: 208px minmax(0, 1fr);
  grid-template-rows: minmax(260px, 34%) minmax(0, 66%);
}
.studio-grid.graph-workspace-fallback.stage-actions.has-action-inspector > .studio-sidebar {
  grid-column: 1;
  grid-row: 1 / 3;
}
.studio-grid.graph-workspace-fallback.stage-actions.has-action-inspector > .graph-canvas {
  grid-column: 2;
  grid-row: 1;
}
.studio-grid.graph-workspace-fallback.stage-actions.has-action-inspector > .scenario-action-inspector-dock {
  grid-column: 2;
  grid-row: 2;
  min-height: 0;
  border-top: 1px solid var(--line);
  border-left: 0;
}
.studio-grid.graph-workspace-fallback :deep(.scenario-action-inspector-resizer) {
  display: none;
}
.studio-grid.stage-actions.graph-is-expanded {
  grid-template-columns: 240px minmax(0, 1fr);
}
.studio-grid.stage-actions.graph-is-expanded > .graph-canvas {
  grid-column: 2;
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
  background: var(--status-accent-soft);
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
.action-workflow-nav {
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid var(--line);
}
.action-workflow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 7px 10px;
}
.action-workflow-head span,
.action-workflow-head strong {
  display: block;
}
.action-workflow-head span {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.action-workflow-head strong {
  margin-top: 3px;
  font: 700 0.85rem var(--font-display);
}
.action-workflow-head > small {
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  border-radius: 9px;
  background: var(--surface-active);
  color: var(--text-secondary);
  font-size: 0.65rem;
  font-weight: 800;
}
.action-outline-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 6px;
  padding: 0 2px 10px;
}
.action-outline-search {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 40px;
  padding: 0 9px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-small-muted);
}
.action-outline-search:focus-within {
  border-color: var(--status-accent-text);
  box-shadow: 0 0 0 2px var(--status-accent-soft);
}
.action-outline-search i { font-size: 0.72rem; }
.action-outline-search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: 600 0.67rem var(--font-display);
}
.action-outline-search input::placeholder { color: var(--text-small-muted); }
.action-outline-error-filter,
.action-outline-center {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
}
.action-outline-error-filter {
  grid-template-columns: auto auto;
  gap: 3px;
  min-width: 40px;
  min-height: 40px;
  font: 800 0.61rem var(--font-display);
  font-variant-numeric: tabular-nums;
}
.action-outline-error-filter.active {
  border-color: var(--status-danger);
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.action-outline-error-filter:disabled { cursor: default; opacity: 0.45; }
.action-outline-list {
  display: grid;
  gap: 6px;
  padding-inline: 2px;
}
.action-outline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  align-items: center;
  gap: 3px;
  border: 1px solid transparent;
  border-radius: 12px;
  transition: border-color 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
.action-outline-row:hover {
  border-color: var(--border-default);
  background: var(--surface-card);
}
.action-outline-row.active {
  border-color: var(--status-accent);
  background: var(--surface-card);
  box-shadow: 0 0 0 2px var(--status-accent-soft);
}
.action-outline-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 62px;
  padding: 8px 5px 8px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.action-outline-item > span {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.action-outline-item > div {
  min-width: 0;
}
.action-outline-item strong,
.action-outline-item small,
.action-outline-item code {
  display: block;
}
.action-outline-item strong {
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.action-outline-item small {
  margin-top: 2px;
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.64rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.action-outline-item code {
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-small-muted);
  font-size: 0.57rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-outline-item em {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
  font-size: 0.6rem;
  font-style: normal;
}
.action-outline-center {
  width: 40px;
  height: 40px;
  border-color: transparent;
  background: transparent;
  opacity: 0;
  transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1), color 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
.action-outline-row:hover .action-outline-center,
.action-outline-row:focus-within .action-outline-center,
.action-outline-row.active .action-outline-center { opacity: 1; }
.action-outline-center:hover,
.action-outline-center:focus-visible {
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.action-outline-empty {
  margin: 4px 7px 12px;
  color: var(--text-small-muted);
  font-size: 0.66rem;
  line-height: 1.45;
}
@media (prefers-reduced-motion: reduce) {
  .action-outline-row,
  .action-outline-center { transition: none; }
}
.action-library-picker {
  margin: 10px 2px 0;
  --catalog-picker-trigger-height: 42px;
}
.action-library-picker :deep(.catalog-picker__trigger) {
  grid-template-columns: 26px minmax(0, 1fr) 28px;
  gap: 7px;
  padding: 5px 7px;
}
.action-library-picker :deep(.catalog-picker__trigger-icon) {
  width: 26px;
  height: 26px;
  font-size: 0.76rem;
}
.action-library-picker :deep(.catalog-picker__trigger-copy strong) {
  font-size: 0.78rem;
}
.action-library-picker :deep(.catalog-picker__trigger-action) {
  justify-content: center;
  width: 28px;
  min-height: 28px;
  padding: 0;
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
.graph-canvas {
  container: scenario-graph / inline-size;
}
.graph-toolbar {
  position: absolute;
  z-index: 6;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  max-width: calc(100% - 24px);
  padding: 9px 10px 9px 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-card) 94%, transparent);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(10px);
}
.graph-toolbar span,
.graph-toolbar small {
  display: block;
}
.graph-toolbar span {
  font-size: 0.7rem;
  font-weight: 800;
}
.graph-toolbar small {
  margin-top: 2px;
  color: var(--text-small-muted);
  font-size: 0.58rem;
}
.graph-toolbar button,
.mobile-graph-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: 750 0.66rem var(--font-display);
  cursor: pointer;
}
.graph-toolbar-actions,
.graph-locale-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.graph-locale-control {
  min-height: 40px;
  padding-left: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-secondary);
}
.graph-locale-control :deep(.graph-locale-select) {
  min-width: 126px;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.graph-locale-control :deep(.p-select-label) {
  padding-block: 8px;
  padding-left: 8px;
  font: 700 0.66rem var(--font-display);
}
.graph-locale-control:focus-within {
  border-color: var(--status-accent-text);
  box-shadow: 0 0 0 2px var(--status-accent-soft);
}
.graph-toolbar button:hover,
.mobile-graph-button:hover {
  border-color: var(--status-accent);
  color: var(--status-accent-text);
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
.rule-validation-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px 22px;
  border-top: 1px solid var(--line);
  background: var(--surface-card);
}
.rule-validation-status {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--text-secondary);
}
.rule-validation-status > i {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-small-muted);
}
.rule-validation-status.ready > i {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.rule-validation-status strong,
.rule-validation-status small {
  display: block;
}
.rule-validation-status strong {
  font-size: var(--font-size-body-small);
}
.rule-validation-status small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: var(--font-size-caption);
  line-height: 1.4;
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
  height: calc(100% - 194px);
  margin-top: 194px;
  --vf-node-bg: var(--graph-node);
  --vf-node-text: var(--text-primary);
  --vf-node-color: var(--graph-selection);
  --vf-connection-path: var(--graph-edge);
  --vf-handle: var(--graph-selection);
  --vf-box-shadow: var(--graph-selection);
}
.graph-canvas > :deep(.scenario-layout-toolbar) {
  position: absolute;
  z-index: 6;
  top: 82px;
  left: 12px;
  max-width: calc(100% - 24px);
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
  font: 700 0.75rem var(--font-display);
}
.graph-canvas :deep(.vue-flow__controls),
.graph-canvas :deep(.vue-flow__minimap) {
  border: 1px solid var(--line);
  border-radius: 11px;
  box-shadow: none;
  overflow: hidden;
}
.graph-canvas :deep(.scenario-graph-minimap) {
  margin: 12px;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
}
@container scenario-graph (max-width: 600px) {
  .graph-canvas :deep(.scenario-graph-minimap) {
    margin: 8px;
  }
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
.stage-actions .localization-policy-card {
  top: 66px;
}
.localization-policy-card summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 750;
}
.localization-policy-card[open] summary {
  margin-bottom: 12px;
}
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
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
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
.action-empty-picker {
  width: min(380px, 100%);
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
.first-action-card {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px 12px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.first-action-card > span {
  display: grid;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  place-items: center;
}
.first-action-card > div {
  min-width: 0;
}
.first-action-card strong,
.first-action-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.first-action-card small {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.67rem;
}
.first-action-card > :deep(.p-select),
.first-action-card > :deep(.p-button) {
  grid-column: 1 / -1;
  width: 100%;
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
  color: var(--status-accent-text);
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
.legacy-frequency-note {
  display: block;
  margin-top: 7px;
  color: var(--text-small-muted);
  font-size: 0.67rem;
  line-height: 1.45;
}
.importance-option {
  display: grid;
  gap: 3px;
  max-width: 440px;
  white-space: normal;
}
.importance-option strong {
  font-size: 0.72rem;
}
.importance-option small {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  line-height: 1.4;
}
.quiet-hours-control {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-top: 13px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 11px;
  background: var(--surface-subtle);
}
.quiet-hours-control > span {
  display: grid;
  gap: 4px;
}
.quiet-hours-control strong {
  font-size: 0.72rem;
}
.quiet-hours-control small,
.priority-helper {
  color: var(--text-small-muted);
  font-size: 0.64rem;
  line-height: 1.45;
}
.priority-helper {
  margin: 12px 0;
}
.section-copy h3 {
  margin: 0;
  font-size: 0.8rem;
}
.stage-aside {
  padding: 24px;
  border-left: 1px solid var(--line);
  background: var(--surface-card);
}
.stage-aside > i {
  color: var(--status-accent);
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
.change-draft-notice {
  border-color: color-mix(in srgb, var(--brand) 42%, var(--border-default));
  background: color-mix(in srgb, var(--brand) 7%, var(--surface-card));
  color: var(--text-primary);
  animation: change-draft-enter 180ms ease-out;
}
.change-draft-notice > i {
  color: var(--brand);
}
@keyframes change-draft-enter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .change-draft-notice {
    animation: none;
  }
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
  border: 1px solid var(--status-accent);
  border-radius: 14px;
  background: var(--status-accent-soft);
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
  color: var(--status-accent-text);
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
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
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
.mobile-library-picker {
  --catalog-picker-trigger-height: 44px;
}
.mobile-graph-button {
  width: 100%;
  min-height: 44px;
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
@container scenario-studio (max-width:860px) {
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
  .studio-grid:is(.graph-workspace-v2, .graph-workspace-fallback).stage-actions.has-action-inspector {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }
  .studio-grid:is(.graph-workspace-v2, .graph-workspace-fallback).stage-actions.has-action-inspector > .studio-sidebar,
  .studio-grid:is(.graph-workspace-v2, .graph-workspace-fallback).stage-actions.has-action-inspector > .graph-canvas,
  .studio-grid:is(.graph-workspace-v2, .graph-workspace-fallback).stage-actions.has-action-inspector > .scenario-action-inspector-dock {
    grid-column: 1;
    grid-row: auto;
  }
  .studio-grid:is(.graph-workspace-v2, .graph-workspace-fallback).stage-actions.has-action-inspector > .scenario-action-inspector-dock {
    min-height: 320px;
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
  .action-workflow-nav {
    display: none;
  }
  .graph-canvas {
    min-height: 65vh;
    padding: 12px;
  }
  .graph-canvas :deep(.vue-flow) {
    display: none;
  }
  .graph-toolbar {
    display: none;
  }
  .graph-canvas.graph-expanded {
    position: fixed;
    z-index: 1100;
    inset: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    align-content: stretch;
    min-height: 0;
    padding: 0;
    border: 0;
  }
  .graph-canvas.graph-expanded .graph-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    position: static;
    inset: auto;
    width: calc(100% - 24px);
    max-width: none;
    margin: 12px 12px 0;
  }
  .graph-canvas:not(.graph-expanded) .localization-policy-card {
    position: static;
    width: 100%;
    margin-bottom: 12px;
  }
  .graph-toolbar-actions {
    width: 100%;
  }
  .graph-locale-control {
    flex: 1;
    min-width: 0;
    min-height: 44px;
  }
  .graph-locale-control :deep(.graph-locale-select) {
    flex: 1;
    min-width: 0;
  }
  .graph-toolbar button {
    min-height: 44px;
  }
  .graph-canvas.graph-expanded .mobile-action-outline,
  .graph-canvas.graph-expanded .localization-policy-card,
  .graph-canvas.graph-expanded .actions-warning {
    display: none;
  }
  .graph-canvas.graph-expanded :deep(.vue-flow) {
    display: block;
    min-height: 0;
    height: 100%;
    margin-top: 0;
  }
  .graph-canvas.graph-expanded > :deep(.scenario-layout-toolbar) {
    position: static;
    width: calc(100% - 16px);
    max-width: none;
    margin: 8px;
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
  .stage-section-header {
    padding: 16px;
  }
  .rule-validation-actions {
    align-items: stretch;
    flex-direction: column;
    padding: 14px 16px 18px;
  }
  .rule-validation-actions > .p-button {
    width: 100%;
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
  .graph-canvas.graph-expanded :deep(.vue-flow) {
    display: block;
    min-height: 0;
    height: 100%;
    margin-top: 0;
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
