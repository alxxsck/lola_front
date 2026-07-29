<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { DocumentationCallout } from "@/features/documentation/ui";
import {
  eventDefinitionError,
  type EventDefinitionError,
} from "@/features/events/event-definition-error";
import {
  buildEventSchemaExample,
  parseEventSchema,
  serializeEventSchema,
  validateEventSchemaDraft,
} from "@/features/event-schema/model/event-schema";
import type {
  EventSchemaDraft,
  EventSchemaDraftIssue,
} from "@/features/event-schema/model/event-schema";
import { findCatalogEventForDefinition } from "@/features/event-schema/model/event-schema-capability";
import EventPayloadStudio from "@/features/event-schema/ui/EventPayloadStudio.vue";
import EventDefinitionHistory from "@/features/events/EventDefinitionHistory.vue";
import {
  eventCatalogRepository,
  type EventCatalogDefinition,
} from "@/shared/api/repository/event-catalog";
import { isMockMode } from "@/shared/config/data-mode";
import { scenarioAuthoringRepository } from "@/shared/api/repository/scenario-authoring";
import type { ScenarioAuthoringContract } from "@/shared/api/repository/scenario-authoring";
import { formatEventContractMarkdown } from "@/shared/lib/data-contract-markdown";
import { slugify } from "@/shared/lib/format";
import { useUnsavedChangesGuard } from "@/shared/lib/use-unsaved-changes-guard";
import type { EventDefinition } from "@/shared/types/domain";

interface EventForm {
  id?: string;
  name: string;
  code: string;
  description: string;
  enabled: boolean;
  clientIngestible: boolean;
  countsAsActivity: boolean;
  schema: EventSchemaDraft;
}

type EventPayload = Partial<EventDefinition> &
  Pick<EventDefinition, "name" | "code" | "payloadSchema">;
type EventOwnershipFilter = "ALL" | "SYSTEM" | "CUSTOM";
type EventReceptionFilter = "ALL" | "ENABLED" | "DISABLED";
type FrontendReceptionState =
  "ACCEPTING" | "POLICY_BLOCKED" | "BACKEND_DISABLED";
type FrontendReceptionFilter = "ALL" | FrontendReceptionState;
type EventSort = "NAME" | "CODE" | "UPDATED" | "STATUS" | "VERSION";
type PolicyFeedback = {
  tone: "pending" | "success" | "error";
  message: string;
};

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const events = ref<EventDefinition[]>([]);
const catalogDefinitions = ref<EventCatalogDefinition[]>([]);
const search = ref("");
const ownershipFilter = ref<EventOwnershipFilter>("ALL");
const receptionFilter = ref<EventReceptionFilter>("ALL");
const frontendReceptionFilter = ref<FrontendReceptionFilter>("ALL");
const sortMode = ref<EventSort>("NAME");
const expandedDescriptions = ref<Set<string>>(new Set());
const retainedAfterPolicyChangeIds = ref<Set<string>>(new Set());
const policyFeedbackByEventId = ref<Record<string, PolicyFeedback>>({});
const loading = ref(true);
const saving = ref(false);
const togglingId = ref<string | null>(null);
const loadError = ref("");
const catalogError = ref("");
const authoringContract = ref<ScenarioAuthoringContract | null>(null);
const formError = ref<EventDefinitionError | null>(null);
const dialogVisible = ref(false);
const eventFormStep = ref(0);
const nameError = ref("");
const codeError = ref("");
const schemaIssues = ref<EventSchemaDraftIssue[]>([]);
const formErrorSummary = ref<HTMLElement | null>(null);
const eventStepPanel = ref<HTMLElement | null>(null);
const payloadStudio = ref<{ discardAdvancedDraft?: () => void } | null>(null);
const hasTechnicalDraft = ref(false);
const codeTouched = ref(false);
const form = ref<EventForm>(emptyForm());
const canManage = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.event_catalog.write",
  ),
);
const lifecycle = computed<"ACTIVE" | "ARCHIVED">(() =>
  route.query.lifecycle === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
);
const initialFormSnapshot = ref("");
const initialSchemaSnapshot = ref("");
const baselineSchema = ref<Record<string, unknown> | undefined>();
let eventsRequestId = 0;
let contractRequestId = 0;
const isFormDirty = computed(
  () =>
    dialogVisible.value &&
    (hasTechnicalDraft.value ||
      (Boolean(initialFormSnapshot.value) &&
        JSON.stringify(form.value) !== initialFormSnapshot.value)),
);
const { confirmDiscard } = useUnsavedChangesGuard(
  isFormDirty,
  "Есть несохранённые изменения события. Закрыть форму?",
);

const eventSteps = [
  { label: "Смысл", description: "Что произошло" },
  { label: "Данные", description: "Какие поля придут" },
  { label: "Пример", description: "Как выглядит событие" },
  { label: "Изменения", description: "Что будет опубликовано" },
] as const;
const ownershipOptions = [
  { label: "Все события", value: "ALL" },
  { label: "Системные", value: "SYSTEM" },
  { label: "Пользовательские", value: "CUSTOM" },
];
const receptionOptions = [
  { label: "Любой приём", value: "ALL" },
  { label: "Приём включён", value: "ENABLED" },
  { label: "Приём выключен", value: "DISABLED" },
];
const frontendReceptionOptions = [
  { label: "Любой статус", value: "ALL" },
  { label: "Фронтенд принимает", value: "ACCEPTING" },
  { label: "Запрещён политикой", value: "POLICY_BLOCKED" },
  { label: "Бэкенд выключен", value: "BACKEND_DISABLED" },
];
const sortOptions = [
  { label: "По названию", value: "NAME" },
  { label: "По коду", value: "CODE" },
  { label: "Сначала обновлённые", value: "UPDATED" },
  { label: "По статусу", value: "STATUS" },
  { label: "По версии", value: "VERSION" },
];

const activeStudioSection = computed(
  () => (["payload", "sample", "review"] as const)[eventFormStep.value - 1],
);

const filteredEvents = computed(() => {
  const query = search.value.trim().toLowerCase();
  return events.value
    .filter(
      (item) =>
        (!query ||
          item.name.toLowerCase().includes(query) ||
          item.code.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)) &&
        (ownershipFilter.value === "ALL" ||
          (ownershipFilter.value === "SYSTEM") === isSystemEvent(item)) &&
        (retainedAfterPolicyChangeIds.value.has(item.id) ||
          ((receptionFilter.value === "ALL" ||
            (receptionFilter.value === "ENABLED") === item.enabled) &&
            matchesFrontendReceptionFilter(item))),
    )
    .sort(compareEvents);
});
const eventGroups = computed(() =>
  [
    {
      key: "system",
      title: "Системные события Lola",
      description: "Создаются и обновляются системой",
      items: filteredEvents.value.filter(isSystemEvent),
    },
    {
      key: "project",
      title: "События проекта",
      description: "Настраиваются командой проекта",
      items: filteredEvents.value.filter((item) => !isSystemEvent(item)),
    },
  ].filter((group) => group.items.length),
);
const activeFilterCount = computed(
  () =>
    Number(ownershipFilter.value !== "ALL") +
    Number(receptionFilter.value !== "ALL") +
    Number(frontendReceptionFilter.value !== "ALL"),
);
const hasActiveFilters = computed(
  () =>
    Boolean(search.value.trim()) ||
    ownershipFilter.value !== "ALL" ||
    receptionFilter.value !== "ALL" ||
    frontendReceptionFilter.value !== "ALL",
);

watch(
  [search, ownershipFilter, receptionFilter, frontendReceptionFilter, sortMode],
  () => {
    retainedAfterPolicyChangeIds.value = new Set();
  },
);

const eventExample = computed(() =>
  JSON.stringify(
    {
      userId: "customer_12345",
      externalEventId: "event_12345",
      eventCode: form.value.code.trim(),
      payload: buildEventSchemaExample(form.value.schema),
    },
    null,
    2,
  ),
);
const enabledCount = computed(
  () => events.value.filter((item) => item.enabled).length,
);
const catalogEvent = computed(() =>
  findCatalogEventForDefinition(authoringContract.value, form.value.id),
);

onMounted(async () => {
  await loadEvents();
  await loadAuthoringContract();
  const requestedEvent =
    typeof route.query.event === "string" ? route.query.event : "";
  const item = events.value.find(
    (event) => event.id === requestedEvent || event.code === requestedEvent,
  );
  if (item) openEdit(item);
});
watch(
  () => [auth.project?.id, lifecycle.value] as const,
  ([projectId, nextLifecycle], [previousProjectId, previousLifecycle]) => {
    if (projectId === previousProjectId && nextLifecycle === previousLifecycle)
      return;
    eventsRequestId += 1;
    contractRequestId += 1;
    events.value = [];
    catalogDefinitions.value = [];
    authoringContract.value = null;
    loadError.value = "";
    catalogError.value = "";
    loading.value = Boolean(projectId);
    search.value = "";
    expandedDescriptions.value = new Set();
    void loadEvents();
    void loadAuthoringContract();
  },
);

function emptyForm(): EventForm {
  return {
    name: "",
    code: "",
    description: "",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: false,
    schema: parseEventSchema({
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    }),
  };
}

async function loadEvents() {
  const projectId = auth.project?.id;
  const requestedLifecycle = lifecycle.value;
  const requestId = ++eventsRequestId;
  if (!projectId) {
    events.value = [];
    catalogDefinitions.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = "";
  try {
    const loaded = await eventCatalogRepository.listDefinitions(
      projectId,
      requestedLifecycle,
    );
    if (!isCurrentEventsRequest(projectId, requestedLifecycle, requestId))
      return;
    catalogDefinitions.value = loaded;
    events.value = catalogDefinitions.value.map(toEventCard);
  } catch (cause) {
    if (!isCurrentEventsRequest(projectId, requestedLifecycle, requestId))
      return;
    loadError.value = errorMessage(cause, "Не удалось загрузить события");
  } finally {
    if (isCurrentEventsRequest(projectId, requestedLifecycle, requestId)) {
      loading.value = false;
    }
  }
}

function isCurrentEventsRequest(
  projectId: string,
  requestedLifecycle: "ACTIVE" | "ARCHIVED",
  requestId: number,
) {
  return (
    requestId === eventsRequestId &&
    auth.project?.id === projectId &&
    lifecycle.value === requestedLifecycle
  );
}

async function loadAuthoringContract() {
  const projectId = auth.project?.id;
  const requestId = ++contractRequestId;
  if (!projectId || isMockMode) return;
  catalogError.value = "";
  try {
    const loaded = await scenarioAuthoringRepository.getContract(projectId);
    if (requestId !== contractRequestId || auth.project?.id !== projectId)
      return;
    authoringContract.value = loaded;
  } catch (cause) {
    if (requestId !== contractRequestId || auth.project?.id !== projectId)
      return;
    catalogError.value = errorMessage(
      cause,
      "Не удалось загрузить capabilities сценариев",
    );
  }
}

function openCreate() {
  if (!canManage.value || lifecycle.value === "ARCHIVED") return;
  form.value = emptyForm();
  codeTouched.value = false;
  formError.value = null;
  resetLocalValidation();
  eventFormStep.value = 0;
  hasTechnicalDraft.value = false;
  initialSchemaSnapshot.value = "";
  baselineSchema.value = undefined;
  initialFormSnapshot.value = JSON.stringify(form.value);
  dialogVisible.value = true;
}

function compareEvents(left: EventDefinition, right: EventDefinition) {
  if (sortMode.value === "CODE") return left.code.localeCompare(right.code);
  if (sortMode.value === "UPDATED")
    return eventUpdatedAt(right) - eventUpdatedAt(left);
  if (sortMode.value === "STATUS")
    return eventStatusRank(left) - eventStatusRank(right);
  if (sortMode.value === "VERSION")
    return right.version - left.version || left.name.localeCompare(right.name);
  return left.name.localeCompare(right.name, "ru");
}

function eventUpdatedAt(item: EventDefinition) {
  const timestamp = Date.parse(item.updatedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function frontendReception(item: EventDefinition): {
  state: FrontendReceptionState;
  label: string;
  tone: "positive" | "negative";
} {
  if (!item.enabled) {
    return {
      state: "BACKEND_DISABLED",
      label: "Недоступен: бэкенд выключен",
      tone: "negative",
    };
  }
  if (!item.clientIngestible) {
    return {
      state: "POLICY_BLOCKED",
      label: "Запрещён политикой",
      tone: "negative",
    };
  }
  return {
    state: "ACCEPTING",
    label: "Принимает",
    tone: "positive",
  };
}

function eventStatusRank(item: EventDefinition) {
  return {
    ACCEPTING: 0,
    POLICY_BLOCKED: 1,
    BACKEND_DISABLED: 2,
  }[frontendReception(item).state];
}

function matchesFrontendReceptionFilter(item: EventDefinition) {
  return (
    frontendReceptionFilter.value === "ALL" ||
    frontendReception(item).state === frontendReceptionFilter.value
  );
}

function resetFilters() {
  search.value = "";
  ownershipFilter.value = "ALL";
  receptionFilter.value = "ALL";
  frontendReceptionFilter.value = "ALL";
}

function isLongDescription(item: EventDefinition) {
  return (item.description?.trim().length ?? 0) > 140;
}

function isDescriptionExpanded(item: EventDefinition) {
  return expandedDescriptions.value.has(item.id);
}

function toggleDescription(item: EventDefinition) {
  const next = new Set(expandedDescriptions.value);
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  expandedDescriptions.value = next;
}

function openEdit(item: EventDefinition) {
  return router.push({
    name: "event-definition-workspace",
    params: { definitionKeyId: item.definitionKeyId ?? item.id },
  });
}

function requestDialogVisibility(value: boolean) {
  if (value) {
    dialogVisible.value = true;
    return;
  }
  afterTechnicalDraftGuard(() => {
    if (!confirmDiscard()) return;
    dialogVisible.value = false;
  });
}

function onEventNameInput() {
  nameError.value = "";
  if (!codeTouched.value && !form.value.id)
    form.value.code = slugify(form.value.name);
}

function onEventCodeInput() {
  codeTouched.value = true;
  codeError.value = "";
}

async function copyEventExample() {
  try {
    await navigator.clipboard.writeText(eventExample.value);
    toast.add({ severity: "success", summary: "JSON скопирован", life: 2200 });
  } catch {
    toast.add({
      severity: "error",
      summary: "Не удалось скопировать",
      detail: "Выделите и скопируйте JSON вручную.",
      life: 3200,
    });
  }
}

async function copyEventContract(item: EventDefinition) {
  try {
    await navigator.clipboard.writeText(
      formatEventContractMarkdown({
        name: item.name,
        code: item.code,
        version: item.version,
        payloadSchema: item.payloadSchema,
      }),
    );
    toast.add({
      severity: "success",
      summary: "Контракт события скопирован",
      detail:
        "Event code, параметры, типы и обязательность готовы для передачи команде.",
      life: 2600,
    });
  } catch {
    toast.add({
      severity: "error",
      summary: "Не удалось скопировать контракт",
      detail: "Разрешите доступ к буферу обмена и повторите попытку.",
      life: 3200,
    });
  }
}

function resetLocalValidation() {
  nameError.value = "";
  codeError.value = "";
  schemaIssues.value = [];
}

function validateMeaning(): string | null {
  nameError.value = form.value.name.trim()
    ? ""
    : "Укажите понятное название события.";
  codeError.value = !/^[a-z][a-z0-9_.-]*$/.test(form.value.code.trim())
    ? "Имя для интеграции должно начинаться с латинской буквы и содержать только a–z, 0–9, точку, дефис или подчёркивание."
    : !form.value.id &&
        events.value.some((item) => item.code === form.value.code.trim())
      ? "Событие с таким именем для интеграции уже существует."
      : "";
  return nameError.value || codeError.value || null;
}

function validatePayload(): string | null {
  schemaIssues.value = validateEventSchemaDraft(form.value.schema);
  return schemaIssues.value[0]?.message ?? null;
}

function showLocalError(message: string, step: number) {
  formError.value = { message, scenarios: [] };
  eventFormStep.value = step;
  void nextTick(() => formErrorSummary.value?.focus());
}

function setStep(step: number) {
  formError.value = null;
  eventFormStep.value = step;
  void nextTick(() => eventStepPanel.value?.focus());
}

function goToStep(step: number) {
  if (step === eventFormStep.value) return;
  afterTechnicalDraftGuard(() => setStep(step));
}

function goToNextStep() {
  const error =
    eventFormStep.value === 0
      ? validateMeaning()
      : eventFormStep.value === 1
        ? validatePayload()
        : null;
  if (error) {
    showLocalError(error, eventFormStep.value);
    return;
  }
  afterTechnicalDraftGuard(() => setStep(Math.min(3, eventFormStep.value + 1)));
}

function afterTechnicalDraftGuard(action: () => void) {
  if (!hasTechnicalDraft.value) {
    action();
    return;
  }
  confirm.require({
    header: "Отменить изменения JSON?",
    message:
      "В технических деталях есть неприменённые изменения. Они не попадут в настройку события.",
    rejectLabel: "Продолжить редактирование",
    acceptLabel: "Отменить изменения",
    accept: () => {
      payloadStudio.value?.discardAdvancedDraft?.();
      hasTechnicalDraft.value = false;
      action();
    },
  });
}

function updateSchema(schema: EventSchemaDraft) {
  form.value.schema = schema;
  schemaIssues.value = [];
}

function focusFirstSchemaIssue() {
  const fieldId = schemaIssues.value[0]?.fieldId;
  if (fieldId) document.getElementById(`field-wire-${fieldId}`)?.focus();
}

function submitEvent() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  const meaningError = validateMeaning();
  if (meaningError) {
    showLocalError(meaningError, 0);
    return;
  }
  const payloadError = validatePayload();
  if (payloadError) {
    showLocalError(payloadError, 1);
    return;
  }
  formError.value = null;

  const common = {
    name: form.value.name.trim(),
    description: form.value.description.trim() || undefined,
    payloadSchema: serializeEventSchema(form.value.schema),
    clientIngestible: form.value.clientIngestible,
    countsAsActivity: form.value.countsAsActivity,
    enabled: form.value.enabled,
  };
  const value = form.value.id
    ? ({ ...common } as EventPayload)
    : ({ ...common, code: form.value.code.trim() } as EventPayload);
  if (form.value.id)
    attachUpdateIdentity(value, form.value.id, form.value.code.trim());

  const schemaChanged =
    Boolean(form.value.id) &&
    canonicalJson(value.payloadSchema) !== initialSchemaSnapshot.value;
  if (schemaChanged) {
    confirm.require({
      header: "Опубликовать новую версию события?",
      message:
        "Система не может проверить приложения, которые отправляют это событие. Убедитесь, что они готовы передавать данные в новом формате.",
      icon: "pi pi-exclamation-triangle",
      rejectLabel: "Вернуться к проверке",
      acceptLabel: "Опубликовать версию",
      accept: () => persistEvent(projectId, value),
    });
    return;
  }

  return persistEvent(projectId, value);
}

async function persistEvent(projectId: string, value: EventPayload) {
  saving.value = true;
  try {
    if (form.value.id)
      throw new Error("Редактирование выполняется в workspace события");
    const saved = await eventCatalogRepository.createDefinition(projectId, {
      code: value.code,
      name: value.name,
      description: value.description,
      payloadSchema: value.payloadSchema,
      enabled: value.enabled,
      clientIngestible: value.clientIngestible,
      countsAsActivity: value.countsAsActivity,
    });
    await loadEvents();
    initialFormSnapshot.value = "";
    dialogVisible.value = false;
    toast.add({
      severity: "success",
      summary: "Событие создано",
      detail: saved.metadata.name,
      life: 2800,
    });
    void loadAuthoringContract();
  } catch (cause) {
    formError.value = eventDefinitionError(
      cause,
      "Не удалось сохранить событие",
    );
    void nextTick(() => formErrorSummary.value?.focus());
  } finally {
    saving.value = false;
  }
}

async function toggleEvent(item: EventDefinition, enabled: boolean) {
  const projectId = auth.project?.id;
  if (!projectId || item.readOnly) return;
  const current = catalogDefinition(item);
  if (!current) return;
  if (!enabled) {
    try {
      const usage = await eventCatalogRepository.getUsage(
        projectId,
        current.definitionKeyId,
      );
      if (usage.scenarios.total > 0 || usage.activeWaitCount > 0) {
        confirm.require({
          header: "Выключить приём событий?",
          message: `Новые события перестанут запускать и продвигать сценарии. Связано сценариев: ${usage.scenarios.total}.`,
          rejectLabel: "Отмена",
          acceptLabel: "Выключить",
          accept: () => applyPolicyToggle(projectId, current, false),
        });
        return;
      }
    } catch (cause) {
      setPolicyFeedback(item.id, "error", errorMessage(cause));
      toast.add({
        severity: "error",
        summary: "Статус не изменён",
        detail: errorMessage(cause),
        life: 3500,
      });
      return;
    }
  }
  return applyPolicyToggle(projectId, current, enabled);
}

async function applyPolicyToggle(
  projectId: string,
  current: EventCatalogDefinition,
  enabled: boolean,
) {
  const eventId = current.currentSchema.revisionId;
  togglingId.value = eventId;
  setPolicyFeedback(eventId, "pending", "Сохраняем изменение…");
  try {
    await eventCatalogRepository.updatePolicy(
      projectId,
      current.definitionKeyId,
      {
        enabled,
        clientIngestible: current.policy.clientIngestible,
        countsAsActivity: current.policy.countsAsActivity,
        expectedVersion: current.policy.version,
        reason: enabled ? "Enabled from CMS" : "Disabled from CMS",
      },
    );
    retainedAfterPolicyChangeIds.value = new Set([
      ...retainedAfterPolicyChangeIds.value,
      eventId,
    ]);
    const changedEvent = events.value.find((item) => item.id === eventId);
    if (changedEvent) changedEvent.enabled = enabled;
    setPolicyFeedback(
      eventId,
      "success",
      enabled ? "Приём включён" : "Приём выключен",
    );
    await loadEvents();
  } catch (cause) {
    const message = eventDefinitionError(cause, "Произошла ошибка").message;
    setPolicyFeedback(eventId, "error", message);
    toast.add({
      severity: "error",
      summary: "Статус не изменён",
      detail: message,
      life: 3500,
    });
  } finally {
    togglingId.value = null;
  }
}

function setPolicyFeedback(
  eventId: string,
  tone: PolicyFeedback["tone"],
  message: string,
) {
  policyFeedbackByEventId.value = {
    ...policyFeedbackByEventId.value,
    [eventId]: { tone, message },
  };
}

function attachUpdateIdentity(
  value: Partial<EventDefinition>,
  id: string,
  code: string,
) {
  if (isMockMode) {
    value.id = id;
    value.code = code;
    return;
  }
  Object.defineProperties(value, {
    id: { value: id, enumerable: false },
    code: { value: code, enumerable: false },
  });
}

function catalogDefinition(item: EventDefinition) {
  return catalogDefinitions.value.find(
    (definition) =>
      definition.definitionKeyId === (item.definitionKeyId ?? item.id),
  );
}

function toEventCard(definition: EventCatalogDefinition): EventDefinition {
  return {
    id: definition.currentSchema.revisionId,
    projectId: definition.projectId,
    definitionKeyId: definition.definitionKeyId,
    currentRevisionId: definition.currentSchema.revisionId,
    isCurrent: true,
    code: definition.code,
    name: definition.metadata.name,
    description: definition.metadata.description ?? undefined,
    version: definition.currentSchema.revisionNumber,
    payloadSchema: definition.currentSchema.payloadSchema,
    enabled: definition.policy.enabled,
    clientIngestible: definition.policy.clientIngestible,
    countsAsActivity: definition.policy.countsAsActivity,
    origin: definition.origin,
    readOnly: definition.readOnly,
    createdAt: definition.currentSchema.publishedAt,
    updatedAt: definition.lifecycleUpdatedAt,
  };
}

function eventFields(item: EventDefinition) {
  const properties = item.payloadSchema?.properties;
  return properties && typeof properties === "object"
    ? Object.keys(properties)
    : [];
}

function isSystemEvent(item: EventDefinition) {
  return item.origin === "LOLA_MANAGED" || Boolean(item.readOnly);
}

function openEventLogs(item: EventDefinition) {
  return router.push({ name: "event-logs", query: { eventCode: item.code } });
}

function requiredCount(item: EventDefinition) {
  return Array.isArray(item.payloadSchema?.required)
    ? item.payloadSchema.required.length
    : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function errorMessage(cause: unknown, fallback = "Произошла ошибка") {
  return cause instanceof Error ? cause.message : fallback;
}
</script>

<template>
  <section class="page events-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Каталог событий</div>
        <h1>События</h1>
        <p class="subtitle">
          Опишите сигналы продукта и данные, с которыми будут запускаться
          сценарии.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Журнал"
          icon="pi pi-list"
          severity="secondary"
          outlined
          @click="router.push({ name: 'event-logs' })"
        /><Button
          v-if="canManage && lifecycle === 'ACTIVE'"
          label="Новое событие"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>
    </header>

    <DocumentationCallout
      title="Как события запускают сценарии"
      text="Разберитесь в событиях, версиях схемы, передаваемых данных и условиях запуска перед настройкой каталога."
      icon="pi pi-bolt"
    />

    <nav class="lifecycle-switch card" aria-label="Состояние каталога">
      <button
        type="button"
        :class="{ active: lifecycle === 'ACTIVE' }"
        :aria-pressed="lifecycle === 'ACTIVE'"
        @click="router.push({ name: 'events' })"
      >
        Активные
      </button>
      <button
        type="button"
        :class="{ active: lifecycle === 'ARCHIVED' }"
        :aria-pressed="lifecycle === 'ARCHIVED'"
        @click="
          router.push({ name: 'events', query: { lifecycle: 'ARCHIVED' } })
        "
      >
        Архив
      </button>
    </nav>

    <div class="summary-grid">
      <div class="summary-card card">
        <span class="summary-icon bolt"><i class="pi pi-bolt" /></span>
        <div>
          <strong>{{ events.length }}</strong
          ><small>событий в каталоге</small>
        </div>
      </div>
      <div class="summary-card card">
        <span class="summary-icon live"><i class="pi pi-check" /></span>
        <div>
          <strong>{{ enabledCount }}</strong
          ><small>принимают данные</small>
        </div>
      </div>
      <div class="contract-note card">
        <i class="pi pi-shield" />
        <div>
          <strong>Проверка данных</strong
          ><span
            >Система сверяет поля, типы и обязательность до запуска
            сценария.</span
          >
        </div>
      </div>
    </div>

    <div class="toolbar card">
      <label class="catalog-control search-control">
        <span>Поиск</span>
        <span class="search-box"
          ><i class="pi pi-search" /><InputText
            v-model="search"
            placeholder="Название, код или описание"
        /></span>
      </label>
      <label class="catalog-control">
        <span>Тип</span>
        <Select
          v-model="ownershipFilter"
          :options="ownershipOptions"
          option-label="label"
          option-value="value"
          aria-label="Тип события"
        />
      </label>
      <label class="catalog-control">
        <span>Приём</span>
        <Select
          v-model="receptionFilter"
          :options="receptionOptions"
          option-label="label"
          option-value="value"
          aria-label="Приём события"
        />
      </label>
      <label class="catalog-control">
        <span>Фронтенд</span>
        <Select
          v-model="frontendReceptionFilter"
          :options="frontendReceptionOptions"
          option-label="label"
          option-value="value"
          aria-label="Приём с фронтенда"
        />
      </label>
      <label class="catalog-control">
        <span>Сортировка</span>
        <Select
          v-model="sortMode"
          :options="sortOptions"
          option-label="label"
          option-value="value"
          aria-label="Сортировка событий"
        />
      </label>
      <div class="toolbar-result">
        <span class="toolbar-result-label">Результат</span>
        <div class="toolbar-result-content">
          <span
            class="result-count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ filteredEvents.length }} из {{ events.length }}
          </span>
          <span v-if="activeFilterCount" class="active-filter-count">
            Фильтров: {{ activeFilterCount }}
          </span>
          <Button
            v-if="hasActiveFilters"
            label="Сбросить"
            icon="pi pi-filter-slash"
            severity="secondary"
            text
            size="small"
            @click="resetFilters"
          />
        </div>
      </div>
    </div>

    <Message v-if="loadError" severity="error" :closable="false"
      ><div class="message-content">
        <span>{{ loadError }}</span
        ><Button label="Повторить" size="small" text @click="loadEvents" /></div
    ></Message>

    <div v-if="loading" class="events-list">
      <div v-for="index in 4" :key="index" class="event-card card">
        <Skeleton shape="circle" size="3rem" />
        <div class="skeleton-copy">
          <Skeleton width="48%" height="1.15rem" /><Skeleton width="70%" />
        </div>
      </div>
    </div>
    <div v-else-if="filteredEvents.length" class="event-groups">
      <section
        v-for="group in eventGroups"
        :key="group.key"
        class="event-group"
        :aria-labelledby="`event-group-${group.key}`"
      >
        <header class="event-group-header">
          <div>
            <h2 :id="`event-group-${group.key}`">{{ group.title }}</h2>
            <p>{{ group.description }}</p>
          </div>
          <span>{{ group.items.length }}</span>
        </header>
        <div class="events-list">
          <article
            v-for="item in group.items"
            :key="item.id"
            class="event-card card"
            :class="{ inactive: !item.enabled, system: isSystemEvent(item) }"
          >
            <span class="event-icon"><i class="pi pi-bolt" /></span>
            <div class="event-main">
              <div class="event-heading">
                <div class="event-title">
                  <h3>{{ item.name }}</h3>
                  <span class="event-origin">
                    {{ isSystemEvent(item) ? "Системное" : "Проектное" }}
                  </span>
                  <span v-if="lifecycle === 'ARCHIVED'" class="event-status"
                    >В архиве</span
                  >
                  <span v-else-if="!item.enabled" class="event-status"
                    >Выключено</span
                  >
                  <span
                    v-if="isSystemEvent(item)"
                    class="system-lock"
                    tabindex="0"
                    aria-label="Почему событие нельзя изменить"
                    :aria-describedby="`system-event-tooltip-${item.id}`"
                  >
                    <i class="pi pi-lock" aria-hidden="true" />
                    <span
                      :id="`system-event-tooltip-${item.id}`"
                      class="system-tooltip"
                      role="tooltip"
                      >Это системное событие Lola. Его техническое имя и схема
                      данных задаются системой и недоступны для изменения.</span
                    >
                  </span>
                </div>
              </div>
              <div class="event-meta">
                <code>{{ item.code }}</code
                ><span>Версия {{ item.version }}</span>
              </div>
              <dl class="event-signals">
                <div
                  :class="{ positive: item.enabled, negative: !item.enabled }"
                >
                  <dt><i class="pi pi-server" />Бэкенд</dt>
                  <dd>{{ item.enabled ? "Принимает" : "Не принимает" }}</dd>
                </div>
                <div :class="frontendReception(item).tone">
                  <dt><i class="pi pi-desktop" />Фронтенд</dt>
                  <dd>{{ frontendReception(item).label }}</dd>
                </div>
                <div>
                  <dt><i class="pi pi-chart-line" />Активность</dt>
                  <dd>
                    {{
                      item.countsAsActivity
                        ? "Считает активность"
                        : "Не считает активность"
                    }}
                  </dd>
                </div>
                <div>
                  <dt><i class="pi pi-database" />Данные</dt>
                  <dd>
                    {{ eventFields(item).length }} полей ·
                    {{ requiredCount(item) }} обязательных
                  </dd>
                </div>
              </dl>
              <div v-if="item.description" class="event-description-block">
                <p
                  :id="`event-description-${item.id}`"
                  class="event-description"
                  :class="{
                    'system-description': isSystemEvent(item),
                    clamped:
                      isLongDescription(item) && !isDescriptionExpanded(item),
                  }"
                >
                  {{ item.description }}
                </p>
                <Button
                  v-if="isLongDescription(item)"
                  :label="
                    isDescriptionExpanded(item)
                      ? 'Свернуть описание'
                      : 'Показать полностью'
                  "
                  severity="secondary"
                  text
                  size="small"
                  class="description-toggle"
                  :aria-expanded="isDescriptionExpanded(item)"
                  :aria-controls="`event-description-${item.id}`"
                  @click="toggleDescription(item)"
                />
              </div>
              <p v-else class="event-description event-description-empty">
                Описание не добавлено.
              </p>
              <div class="field-pills">
                <span
                  v-for="field in eventFields(item).slice(0, 5)"
                  :key="field"
                  ><code>{{ field }}</code
                  ><i
                    v-if="item.payloadSchema.required?.includes(field)"
                    title="Обязательное поле"
                    >*</i
                  ></span
                >
                <span v-if="eventFields(item).length > 5"
                  >+{{ eventFields(item).length - 5 }}</span
                >
                <small v-if="!eventFields(item).length"
                  >Без дополнительных данных</small
                >
              </div>
            </div>
            <div class="event-actions">
              <div class="event-policy-control">
                <div>
                  <strong>Приём события</strong>
                  <small>{{
                    item.readOnly
                      ? "Управляется Lola"
                      : item.enabled
                        ? "Новые события принимаются"
                        : "Новые события отклоняются"
                  }}</small>
                  <small
                    v-if="policyFeedbackByEventId[item.id]"
                    class="event-policy-feedback"
                    :class="policyFeedbackByEventId[item.id]!.tone"
                    role="status"
                    aria-live="polite"
                  >
                    {{ policyFeedbackByEventId[item.id]!.message }}
                  </small>
                </div>
                <label class="event-policy-switch-target">
                  <ToggleSwitch
                    :model-value="item.enabled"
                    :disabled="
                      lifecycle === 'ARCHIVED' ||
                      !canManage ||
                      item.readOnly ||
                      togglingId === item.id
                    "
                    :aria-label="`Приём события ${item.name}`"
                    @update:model-value="toggleEvent(item, $event)"
                  />
                </label>
              </div>
              <div class="event-action-buttons">
                <Button
                  :label="item.readOnly ? 'Просмотреть' : 'Редактировать'"
                  :icon="item.readOnly ? 'pi pi-eye' : 'pi pi-pencil'"
                  size="small"
                  :aria-label="`${item.readOnly ? 'Просмотреть' : 'Редактировать'} ${item.name}`"
                  @click="openEdit(item)"
                />
                <Button
                  v-if="canManage"
                  label="Журнал"
                  icon="pi pi-list"
                  severity="secondary"
                  text
                  size="small"
                  :aria-label="`Открыть журнал ${item.name}`"
                  @click="openEventLogs(item)"
                />
                <details class="event-more-actions">
                  <summary
                    :aria-label="`Другие действия для ${item.name}`"
                    title="Другие действия"
                  >
                    <i class="pi pi-ellipsis-h" aria-hidden="true" />
                  </summary>
                  <div class="event-more-menu">
                    <Button
                      label="Скопировать контракт"
                      icon="pi pi-copy"
                      severity="secondary"
                      text
                      size="small"
                      :aria-label="`Скопировать контракт события ${item.name}`"
                      @click="copyEventContract(item)"
                    />
                    <EventDefinitionHistory
                      v-if="auth.project?.id && catalogDefinition(item)"
                      :project-id="auth.project.id"
                      :event="catalogDefinition(item)!"
                    />
                  </div>
                </details>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
    <div v-else class="empty card">
      <i :class="search ? 'pi pi-search' : 'pi pi-bolt'" />
      <strong>{{
        hasActiveFilters
          ? "События не найдены"
          : lifecycle === "ARCHIVED"
            ? "Архив пуст"
            : "Каталог событий пока пуст"
      }}</strong>
      <p>
        {{
          hasActiveFilters
            ? "Измените фильтры или сбросьте их, чтобы увидеть весь каталог."
            : lifecycle === "ARCHIVED"
              ? "Архивированные события появятся здесь."
              : "Опишите первое событие, которое сможет запускать сценарий."
        }}
      </p>
      <Button
        v-if="!hasActiveFilters && lifecycle === 'ACTIVE'"
        label="Создать событие"
        icon="pi pi-plus"
        size="small"
        @click="openCreate"
      />
      <Button
        v-else-if="hasActiveFilters"
        label="Сбросить фильтры"
        icon="pi pi-filter-slash"
        severity="secondary"
        @click="resetFilters"
      />
    </div>

    <Dialog
      :visible="dialogVisible"
      modal
      :header="form.id ? 'Изменить событие' : 'Новое событие'"
      class="event-dialog"
      :style="{ width: 'min(920px, calc(100vw - 28px))' }"
      @update:visible="requestDialogVisibility"
    >
      <form
        id="event-form"
        class="dialog-form"
        @submit.prevent="eventFormStep === 3 ? submitEvent() : goToNextStep()"
      >
        <nav class="event-steps" aria-label="Шаги настройки события">
          <button
            v-for="(step, index) in eventSteps"
            :key="step.label"
            type="button"
            :class="{ active: eventFormStep === index }"
            :aria-current="eventFormStep === index ? 'step' : undefined"
            @click="goToStep(index)"
          >
            <span>{{ index + 1 }}</span
            ><strong>{{ step.label }}</strong
            ><small>{{ step.description }}</small>
          </button>
        </nav>

        <section
          v-if="eventFormStep === 0"
          ref="eventStepPanel"
          class="event-step-panel"
          aria-labelledby="event-meaning-title"
          tabindex="-1"
        >
          <header class="step-intro">
            <span>Шаг 1 из 4</span>
            <h3 id="event-meaning-title">Что означает событие?</h3>
            <p>
              Опишите бизнес-факт понятными словами. Техническое имя потребуется
              интеграции один раз.
            </p>
          </header>
          <div class="form-grid">
            <div class="field">
              <label for="event-name">Название</label
              ><InputText
                id="event-name"
                v-model="form.name"
                autofocus
                placeholder="Успешный депозит"
                :invalid="Boolean(nameError)"
                :aria-describedby="nameError ? 'event-name-error' : undefined"
                @input="onEventNameInput"
              /><small
                v-if="nameError"
                id="event-name-error"
                class="field-error"
                >{{ nameError }}</small
              >
            </div>
            <div class="field">
              <label for="event-code">Имя для интеграции</label
              ><InputText
                id="event-code"
                v-model="form.code"
                class="mono"
                :disabled="Boolean(form.id)"
                placeholder="deposit.succeeded"
                :invalid="Boolean(codeError)"
                :aria-describedby="codeError ? 'event-code-error' : undefined"
                @input="onEventCodeInput"
              /><small
                v-if="codeError"
                id="event-code-error"
                class="field-error"
                >{{ codeError }}</small
              ><small v-else-if="form.id"
                >После первой публикации это имя не меняется.</small
              >
            </div>
          </div>
          <div class="field">
            <label for="event-description"
              >Описание <span>необязательно</span></label
            ><Textarea
              id="event-description"
              v-model="form.description"
              rows="3"
              auto-resize
              placeholder="Когда именно продукт отправляет это событие и что оно означает"
            />
          </div>
          <div class="toggle-grid">
            <div class="enabled-row surface-soft">
              <div>
                <strong>Принимать событие</strong
                ><span
                  >Если выключить, настройка останется в каталоге, но новые
                  события приниматься не будут.</span
                >
              </div>
              <ToggleSwitch
                v-model="form.enabled"
                aria-label="Принимать событие"
              />
            </div>
            <div class="enabled-row surface-soft">
              <div>
                <strong>Можно отправлять из браузера</strong
                ><span
                  >Включайте только для данных, которым можно доверять со
                  стороны клиента.</span
                >
              </div>
              <ToggleSwitch
                v-model="form.clientIngestible"
                aria-label="Можно отправлять из браузера"
              />
            </div>
            <div class="enabled-row activity-setting surface-soft">
              <div>
                <strong>Засчитывать как активность пользователя</strong
                ><span
                  >Событие продлевает текущий визит и отмечает активный
                  календарный день. Техническое переподключение само по себе
                  новым визитом не считается.</span
                >
              </div>
              <ToggleSwitch
                v-model="form.countsAsActivity"
                aria-label="Засчитывать событие как активность"
              />
            </div>
          </div>
        </section>

        <section
          v-else
          ref="eventStepPanel"
          class="fields-builder surface-soft event-step-panel"
          tabindex="-1"
        >
          <div v-if="eventFormStep === 1" class="catalog-status">
            <span v-if="catalogError"
              >Возможности полей могут быть устаревшими:
              {{ catalogError }}</span
            >
            <span v-else-if="authoringContract"
              >Возможности использования полей в сценариях обновлены.</span
            >
            <span v-else
              >После создания события здесь появится информация о его
              использовании в сценариях.</span
            >
            <Button
              v-if="!isMockMode"
              type="button"
              label="Обновить возможности"
              icon="pi pi-refresh"
              size="small"
              severity="secondary"
              text
              @click="loadAuthoringContract"
            />
          </div>
          <EventPayloadStudio
            ref="payloadStudio"
            :model-value="form.schema"
            :active-section="activeStudioSection"
            :issues="schemaIssues"
            :baseline-schema="baselineSchema"
            :catalog-event="catalogEvent"
            :catalog-revision="authoringContract?.revision"
            @update:model-value="updateSchema"
            @technical-draft-change="hasTechnicalDraft = $event"
          />
          <details v-if="eventFormStep === 2" class="integration-example">
            <summary>Технический пример для разработчика</summary>
            <header>
              <span>Готовый формат события для интеграции.</span
              ><Button
                type="button"
                icon="pi pi-copy"
                size="small"
                severity="secondary"
                aria-label="Копировать технический пример"
                title="Копировать"
                @click="copyEventExample"
              />
            </header>
            <pre>{{ eventExample }}</pre>
          </details>
          <div v-if="eventFormStep === 3" class="publication-note">
            <strong>{{
              form.id
                ? "Будет создана новая опубликованная версия"
                : "Событие будет создано и станет доступно интеграции"
            }}</strong>
            <p v-if="form.id">
              Система публикует следующую версию сразу после подтверждения.
              Полная история и оценка влияния пока недоступны, поэтому проверьте
              интеграцию перед сохранением.
            </p>
            <p v-else>
              Проверьте смысл, поля и пример. Имя для интеграции после первой
              публикации не меняется; остальные настройки обновляются новой
              версией.
            </p>
            <dl class="event-review-summary">
              <div>
                <dt>Название</dt>
                <dd>{{ form.name || "Не указано" }}</dd>
              </div>
              <div>
                <dt>Имя для интеграции</dt>
                <dd>
                  <code>{{ form.code || "Не указано" }}</code>
                </dd>
              </div>
              <div class="wide">
                <dt>Описание</dt>
                <dd>{{ form.description || "Не указано" }}</dd>
              </div>
              <div>
                <dt>Принимать событие</dt>
                <dd>{{ form.enabled ? "Да" : "Нет" }}</dd>
              </div>
              <div>
                <dt>Можно отправлять из браузера</dt>
                <dd>{{ form.clientIngestible ? "Да" : "Нет" }}</dd>
              </div>
              <div>
                <dt>Засчитывать как активность</dt>
                <dd>{{ form.countsAsActivity ? "Да" : "Нет" }}</dd>
              </div>
              <div>
                <dt>Полей данных</dt>
                <dd>{{ form.schema.fields.length }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <Message
          v-if="formError"
          severity="error"
          size="small"
          :closable="false"
        >
          <div ref="formErrorSummary" class="event-error-message" tabindex="-1">
            <strong>{{ formError.message }}</strong
            ><Button
              v-if="schemaIssues[0]?.fieldId"
              type="button"
              label="Перейти к полю"
              size="small"
              text
              @click="focusFirstSchemaIssue"
            />
            <ul v-if="formError.scenarios.length" class="dependency-list">
              <li
                v-for="scenario in formError.scenarios"
                :key="scenario.id || scenario.code"
              >
                <div>
                  <span>{{ scenario.name }}</span
                  ><code v-if="scenario.code">{{ scenario.code }}</code>
                </div>
                <ul v-if="scenario.issues.length">
                  <li v-for="issue in scenario.issues" :key="issue">
                    {{ issue }}
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </Message>
      </form>
      <template #footer>
        <div class="event-dialog-footer">
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="requestDialogVisibility(false)"
          />
          <div>
            <Button
              v-if="eventFormStep > 0"
              label="Назад"
              severity="secondary"
              outlined
              @click="goToStep(eventFormStep - 1)"
            /><Button
              v-if="eventFormStep < 3"
              label="Далее"
              icon="pi pi-arrow-right"
              icon-pos="right"
              @click="goToNextStep"
            /><Button
              v-else
              form="event-form"
              type="submit"
              :label="form.id ? 'Создать новую версию' : 'Создать событие'"
              icon="pi pi-check"
              :loading="saving"
            />
          </div>
        </div>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.events-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.events-page .page-header {
  margin-bottom: 0;
}
.header-actions {
  display: flex;
  gap: 9px;
}
.lifecycle-switch {
  display: flex;
  align-self: flex-start;
  gap: 4px;
  padding: 4px;
}
.lifecycle-switch button {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font:
    700 0.72rem var(--font-display),
    sans-serif;
  padding: 9px 15px;
}
.lifecycle-switch button.active {
  background: var(--surface-active);
  color: var(--text-primary);
}
.lifecycle-switch button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.toggle-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.activity-setting {
  grid-column: 1/-1;
}
.catalog-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.76rem;
}
.catalog-status code {
  font-size: 0.72rem;
}
.summary-grid {
  display: grid;
  grid-template-columns: minmax(190px, 220px) minmax(190px, 220px) minmax(
      360px,
      1fr
    );
  gap: 12px;
  margin-bottom: 18px;
}
.summary-card,
.contract-note {
  min-height: 88px;
  padding: 15px 17px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.summary-icon,
.event-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 13px;
}
.summary-icon.bolt,
.event-icon {
  background: var(--status-violet-soft);
  color: var(--status-violet);
}
.summary-icon.live {
  background: var(--status-success-soft);
  color: var(--status-success);
}
.summary-card strong,
.summary-card small {
  display: block;
}
.summary-card strong {
  font:
    700 1.35rem var(--font-display),
    sans-serif;
}
.summary-card small {
  color: var(--muted);
  font-size: 0.68rem;
  margin-top: 2px;
}
.contract-note {
  justify-content: flex-start;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  border-color: var(--surface-emphasis);
}
.contract-note > i {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 13px;
  background: var(--surface-emphasis-raised);
  color: var(--brand);
}
.contract-note strong,
.contract-note span {
  display: block;
}
.contract-note strong {
  font-size: 0.78rem;
}
.contract-note span {
  max-width: 520px;
  color: var(--text-on-emphasis-muted);
  font-size: 0.68rem;
  line-height: 1.45;
  margin-top: 3px;
}
.toolbar {
  display: grid;
  grid-template-columns:
    minmax(240px, 420px)
    repeat(4, minmax(145px, 220px))
    minmax(100px, 1fr);
  align-items: end;
  gap: 10px;
  padding: 14px 15px;
  margin-bottom: 15px;
}
.catalog-control {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.catalog-control > span:first-child,
.toolbar-result-label {
  color: var(--text-secondary);
  font-size: 0.63rem;
  font-weight: 700;
}
.catalog-control :deep(.p-select) {
  width: 100%;
  min-height: 42px;
}
.catalog-control :deep(.p-select-label) {
  overflow: hidden;
  font-size: 0.73rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-box {
  position: relative;
  display: block;
  min-width: 0;
}
.search-box > i {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  color: var(--text-secondary);
}
.search-box :deep(input) {
  width: 100%;
  min-height: 42px;
  padding-left: 38px;
  font-size: 0.73rem;
}
.toolbar-result {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.toolbar-result-content {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.result-count {
  white-space: nowrap;
  font-size: 0.75rem;
  color: var(--muted);
}
.active-filter-count {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
}
.message-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.event-groups {
  display: grid;
  gap: 24px;
}
.event-group {
  display: grid;
  gap: 10px;
}
.event-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-inline: 2px;
}
.event-group-header h2,
.event-group-header p {
  margin: 0;
}
.event-group-header h2 {
  font-size: 0.9rem;
}
.event-group-header p {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.event-group-header > span {
  display: grid;
  min-width: 29px;
  height: 29px;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
}
.events-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(370px, 100%), 1fr));
  align-items: stretch;
  gap: 12px;
}
.event-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  align-items: start;
  gap: 0 14px;
  min-height: 100%;
  padding: 18px;
  transition:
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background-color 0.18s ease;
}
.event-card:hover {
  box-shadow: var(--shadow-raised);
  border-color: var(--border-strong);
}
.event-card.system {
  background: color-mix(
    in srgb,
    var(--status-violet-soft) 20%,
    var(--surface-card)
  );
}
.event-card > .event-icon {
  margin-top: 2px;
}
.event-main {
  min-width: 0;
  align-self: stretch;
}
.event-heading {
  min-width: 0;
}
.event-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.event-title h3 {
  min-width: 0;
  margin: 0;
  font-size: 1rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.event-origin {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1;
}
.event-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1;
}
.event-status::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}
.system-lock {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.76rem;
  cursor: help;
}
.system-lock:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.system-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 9px);
  z-index: 20;
  width: 280px;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--surface-emphasis);
  box-shadow: var(--shadow-raised);
  color: var(--text-on-emphasis);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.45;
  text-align: left;
  transform: translate(-50%, 4px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.14s ease,
    transform 0.14s ease,
    visibility 0.14s ease;
}
.system-tooltip::after {
  position: absolute;
  top: 100%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--surface-emphasis);
  content: "";
  transform: translate(-50%, -50%) rotate(45deg);
}
.system-lock:hover .system-tooltip,
.system-lock:focus-visible .system-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}
.event-description {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.event-description.clamped {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}
.description-toggle {
  min-height: 44px;
  margin-top: 2px;
  margin-left: -10px;
}
.description-toggle :deep(.p-button-label) {
  font-size: 0.68rem;
}
.system-description {
  margin-top: 4px;
}
.event-description-empty {
  font-style: italic;
}
.event-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 0.69rem;
  font-weight: 600;
}
.event-meta code {
  max-width: 100%;
  overflow-wrap: anywhere;
  border-radius: 6px;
  background: var(--surface-subtle);
  padding: 3px 7px;
  color: inherit;
  font-size: inherit;
  font-weight: 500;
}
.event-meta span {
  white-space: nowrap;
}
.event-signals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin: 14px 0 0;
}
.event-signals > div {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-subtle);
}
.event-signals dt {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 700;
}
.event-signals dt i {
  font-size: 0.67rem;
}
.event-signals dd {
  margin: 4px 0 0;
  color: var(--text-primary);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.3;
}
.event-signals .positive {
  border-color: color-mix(
    in srgb,
    var(--status-success) 25%,
    var(--border-default)
  );
  background: color-mix(
    in srgb,
    var(--status-success-soft) 55%,
    var(--surface-subtle)
  );
}
.event-signals .negative {
  border-color: color-mix(
    in srgb,
    var(--status-danger) 20%,
    var(--border-default)
  );
}
.field-pills {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.field-pills > span {
  font-size: 0.66rem;
  border: 1px solid var(--border-default);
  background: var(--surface-subtle);
  border-radius: 6px;
  padding: 3px 6px;
  color: var(--text-secondary);
}
.field-pills i {
  color: var(--status-danger);
  font-style: normal;
  margin-left: 2px;
}
.field-pills small {
  font-size: 0.67rem;
  color: var(--text-secondary);
}
.event-actions {
  grid-column: 1/-1;
  display: grid;
  gap: 9px;
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.event-policy-control,
.event-action-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.event-policy-control {
  justify-content: space-between;
}
.event-policy-control strong,
.event-policy-control small {
  display: block;
}
.event-policy-control strong {
  font-size: 0.69rem;
}
.event-policy-control small {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 0.62rem;
}
.event-policy-control .event-policy-feedback.pending {
  color: var(--text-secondary);
}
.event-policy-control .event-policy-feedback.success {
  color: var(--status-success);
}
.event-policy-control .event-policy-feedback.error {
  color: var(--status-danger);
}
.event-policy-switch-target {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  cursor: pointer;
}
.event-policy-switch-target:has(.p-disabled) {
  cursor: default;
}
.event-action-buttons {
  min-width: 0;
}
.event-action-buttons > :first-child {
  flex: 1;
}
.event-action-buttons :deep(.p-button) {
  min-height: 44px;
}
.event-more-actions {
  position: relative;
  flex: 0 0 auto;
}
.event-more-actions summary {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-secondary);
  cursor: pointer;
  list-style: none;
}
.event-more-actions summary::-webkit-details-marker {
  display: none;
}
.event-more-actions summary:hover {
  background: var(--surface-subtle);
}
.event-more-actions summary:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.event-more-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 7px);
  z-index: 15;
  display: grid;
  width: 210px;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--border-default);
  border-radius: 11px;
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.event-more-menu :deep(.p-button) {
  width: 100%;
  justify-content: flex-start;
}
.skeleton-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty strong {
  display: block;
  color: var(--ink);
}
.empty p {
  margin: 7px 0 18px;
}
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 4px;
}
.event-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.event-steps button {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--muted);
  cursor: pointer;
  text-align: left;
}
.event-steps button > span {
  grid-row: 1/3;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-active);
  color: var(--text-secondary);
  font-weight: 700;
}
.event-steps button strong {
  color: var(--text-primary);
  font-size: 0.76rem;
}
.event-steps button small {
  font-size: 0.66rem;
}
.event-steps button.active {
  border-color: var(--status-violet);
  background: var(--status-violet-soft);
}
.event-steps button.active > span {
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.event-steps button.active strong {
  color: var(--status-violet-text);
}
.event-step-panel {
  display: flex;
  flex-direction: column;
  gap: 17px;
}
.event-step-panel:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 4px;
}
.step-intro span {
  color: var(--status-violet);
  font-size: 0.72rem;
  font-weight: 700;
}
.step-intro h3 {
  margin: 4px 0 5px;
  font-size: 1rem;
}
.step-intro p {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.45;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.field label span,
.field small {
  font-weight: 400;
  color: var(--text-secondary);
}
.field small {
  font-size: 0.74rem;
}
.field .field-error {
  color: var(--status-danger-text);
}
.fields-builder {
  padding: 16px;
}
.integration-example {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-card);
}
.integration-example summary {
  padding: 12px 14px;
  cursor: pointer;
  color: var(--text-link);
  font-size: 0.76rem;
  font-weight: 700;
}
.integration-example header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 0.74rem;
}
.integration-example pre {
  margin: 0;
  padding: 15px;
  max-height: 260px;
  overflow: auto;
  background: var(--code-background);
  color: var(--code-text);
  font-size: 0.74rem;
  line-height: 1.55;
}
.publication-note {
  padding: 14px;
  border-radius: 10px;
  background: var(--status-violet-soft);
}
.publication-note strong {
  font-size: 0.8rem;
}
.publication-note p {
  margin: 5px 0 0;
  color: var(--status-violet-text);
  font-size: 0.76rem;
  line-height: 1.45;
}
.event-review-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 14px 0 0;
}
.event-review-summary div {
  padding: 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-card) 70%, transparent);
}
.event-review-summary dt {
  color: var(--muted);
  font-size: 0.68rem;
}
.event-review-summary dd {
  margin: 3px 0 0;
  font-size: 0.76rem;
  font-weight: 700;
}
.enabled-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 15px;
}
.enabled-row strong,
.enabled-row span {
  display: block;
}
.enabled-row strong {
  font-size: 0.82rem;
}
.enabled-row span {
  font-size: 0.74rem;
  color: var(--muted);
  margin-top: 3px;
  line-height: 1.4;
}
.event-error-message > strong {
  display: block;
}
.event-error-message:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 4px;
}
.event-dialog-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.event-dialog-footer > div {
  display: flex;
  gap: 8px;
}
.dependency-list {
  margin: 10px 0 0;
  padding-left: 20px;
}
.dependency-list > li + li {
  margin-top: 9px;
}
.dependency-list li > div {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.dependency-list code {
  font-size: 0.68rem;
  background: color-mix(in srgb, var(--surface-card) 65%, transparent);
  border-radius: 5px;
  padding: 2px 5px;
}
.dependency-list ul {
  margin: 5px 0 0;
  padding-left: 19px;
  font-size: 0.72rem;
}
.delete-error-content > p {
  margin: 0;
  color: var(--muted);
}
.dependency-stat {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 16px;
  padding: 11px 13px;
  background: var(--status-warning-soft);
  border-radius: 11px;
  color: var(--status-warning-text);
  font-size: 0.8rem;
}
.event-review-summary .wide {
  grid-column: 1/-1;
}
@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }
  .contract-note {
    grid-column: 1/-1;
  }
  .toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .search-control {
    grid-column: 1/-1;
  }
  .toolbar-result {
    grid-column: 1/-1;
  }
}
@media (max-width: 767px) {
  .event-steps {
    grid-template-columns: 1fr 1fr;
  }
  .event-steps button small {
    display: none;
  }
  .event-dialog-footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }
  .event-dialog-footer > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .event-dialog-footer :deep(.p-button) {
    justify-content: center;
  }
  .publication-note {
    padding: 12px;
  }
}
@media (max-width: 620px) {
  .summary-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .contract-note {
    grid-column: 1/-1;
  }
  .toolbar {
    grid-template-columns: 1fr;
  }
  .search-control,
  .toolbar-result {
    grid-column: auto;
  }
  .toolbar-result-content {
    justify-content: space-between;
  }
  .events-list {
    gap: 10px;
  }
  .event-card {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    padding: 14px;
  }
  .event-card > .event-icon {
    display: none;
  }
  .event-main {
    width: 100%;
  }
  .event-title h3 {
    flex-basis: 100%;
    font-size: 0.94rem;
  }
  .event-meta {
    gap: 5px 8px;
    margin-top: 6px;
  }
  .event-signals {
    grid-template-columns: 1fr;
    gap: 0;
    overflow: hidden;
    margin-top: 12px;
    border: 1px solid var(--border-default);
    border-radius: 11px;
  }
  .event-signals > div {
    display: grid;
    grid-template-columns: minmax(84px, 0.8fr) minmax(0, 1.2fr);
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border: 0;
    border-radius: 0;
  }
  .event-signals > div + div {
    border-top: 1px solid var(--border-default);
  }
  .event-signals dd {
    margin: 0;
  }
  .event-description {
    margin-top: 10px;
  }
  .field-pills {
    margin-top: 8px;
  }
  .event-actions {
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
  }
  .event-policy-control {
    padding: 9px 10px 9px 12px;
    border: 1px solid var(--border-default);
    border-radius: 11px;
    background: var(--surface-subtle);
  }
  .event-action-buttons {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 44px;
    gap: 6px;
  }
  .event-action-buttons > :first-child {
    width: 100%;
  }
  .event-action-buttons :deep(.p-button-label) {
    font-size: 0.76rem;
  }
  .event-title {
    align-items: center;
  }
  .system-tooltip {
    right: -6px;
    left: auto;
    width: min(280px, calc(100vw - 48px));
    transform: translateY(4px);
  }
  .system-tooltip::after {
    right: 8px;
    left: auto;
    transform: translateY(-50%) rotate(45deg);
  }
  .system-lock:hover .system-tooltip,
  .system-lock:focus-visible .system-tooltip {
    transform: translateY(0);
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .enabled-row {
    align-items: flex-start;
  }
  .header-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .toggle-grid {
    grid-template-columns: 1fr;
  }
  .fields-builder {
    padding: 12px;
  }
}
@media (max-width: 360px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
  .contract-note {
    grid-column: auto;
  }
  .event-action-buttons {
    grid-template-columns: minmax(0, 1fr) 44px;
  }
  .event-action-buttons > :first-child {
    grid-column: 1/-1;
  }
  .event-more-actions {
    grid-column: 2;
  }
}
</style>
