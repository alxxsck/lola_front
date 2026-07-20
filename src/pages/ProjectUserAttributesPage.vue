<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/features/auth/auth.store";
import { DocumentationCallout } from "@/features/documentation/ui";
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import CodeBlock from "@/features/end-user-attributes/ui/CodeBlock.vue";
import {
  createContractField,
  parseAllowedValues,
  validateContractDocument,
} from "@/features/end-user-attributes/model/contract-domain";
import {
  type ContractIssuePresentation,
} from "@/features/end-user-attributes/model/contract-issue-presentation";
import { useContractIssuePresentation } from "@/features/end-user-attributes/model/use-contract-issue-presentation";
import {
  readDemoContractDraft,
  writeDemoContractDraft,
} from "@/features/end-user-attributes/model/demo-draft-storage";
import { repository } from "@/shared/api/repository";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  AttributeContractDraftResponseDto,
  AttributeContractDraftFieldDto,
  AttributeContractRevisionSummaryResponseDto,
  AttributeDefinitionImpactResponseDto,
  AttributeContractValidationResponseDto,
  AttributeContractWorkspaceResponseDto,
  ProfileHealthResponseDto,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const toast = useToast();
const router = useRouter();
const loading = ref(true);
const loaded = ref(false);
const saving = ref(false);
const validating = ref(false);
const publishing = ref(false);
const error = ref("");
const workspace = ref<AttributeContractWorkspaceResponseDto | null>(null);
const draftConflict = ref<{
  serverDraft: AttributeContractDraftResponseDto;
  localDocument: AttributeContractDraftResponseDto["document"];
} | null>(null);
const validation = ref<AttributeContractValidationResponseDto | null>(null);
const health = ref<ProfileHealthResponseDto | null>(null);
const revisions = ref<AttributeContractRevisionSummaryResponseDto[]>([]);
const editorVisible = ref(false);
const publishingVisible = ref(false);
const integrationVisible = ref(false);
const historyVisible = ref(false);
const impactVisible = ref(false);
const aiContextVisible = ref(false);
const impactLoading = ref(false);
const impact = ref<AttributeDefinitionImpactResponseDto | null>(null);
const impactField = ref<AttributeContractDraftFieldDto | null>(null);
const editingIndex = ref<number | null>(null);
const form = ref<AttributeContractDraftFieldDto>(createContractField());
const allowedValuesInput = ref("");
const fieldFormError = ref("");
const publishForm = ref({
  reason: "",
  graceDays: 7,
  breakingChangePlan: "",
  readinessEvidenceId: "",
  confirmSecurity: false,
});
const publishHelp = {
  reason:
    "Коротко опишите, что изменилось и зачем. Этот текст будет виден администраторам в истории публикаций.",
  graceDays:
    "Переходный период позволяет временно принимать предыдущую версию полей. Укажите количество дней, пока разработчики обновляют интеграцию, или 0, если все источники уже готовы.",
  breakingChangePlan:
    "Заполните, если старые запросы перестанут подходить новой структуре. Укажите, какие системы и в каком порядке обновит команда.",
  readinessEvidence:
    "Укажите номер задачи или проверки, где разработчики подтвердили, что готовы передавать новые обязательные поля.",
} as const;
const healthWindow = ref<"24h" | "7d" | "30d">("7d");
const aiFormat = ref<"STRUCTURED_JSON" | "COMPACT_TEXT">("STRUCTURED_JSON");
const aiBudget = ref(2000);
const savedDraftSnapshot = ref("");

const canManage = computed(
  () => auth.user?.role === "OWNER" || auth.user?.role === "ADMIN",
);
const canManageAiContext = computed(() => auth.user?.role === "OWNER");
const fields = computed(() => workspace.value?.draft.document.fields ?? []);
const orderedFields = computed(() =>
  [...fields.value].sort(
    (a, b) => a.position - b.position || a.key.localeCompare(b.key),
  ),
);
const localIssues = computed(() =>
  workspace.value
    ? validateContractDocument(workspace.value.draft.document)
    : [],
);
const issueInputs = computed(() => [
  ...localIssues.value,
  ...(validation.value?.issues ?? []),
]);
const { errors, warnings } = useContractIssuePresentation(
  issueInputs,
  fields,
);
const dirty = computed(() =>
  workspace.value
    ? contractDocumentSignature(workspace.value.draft.document) !==
      contractDocumentSignature({
        fields: (workspace.value.currentRevision?.fields ?? []).map(
          toDraftField,
        ),
      })
    : false,
);
const hasUnsavedDraftEdits = computed(
  () =>
    Boolean(workspace.value) &&
    JSON.stringify(workspace.value?.draft.document) !==
      savedDraftSnapshot.value,
);
const securityAffectedDefinitionIds = computed(() => [
  ...new Set(
    (validation.value?.issues ?? [])
      .filter(
        (issue) =>
          issue.compatibility === "SECURITY" && Boolean(issue.definitionId),
      )
      .map((issue) => issue.definitionId as string),
  ),
]);
const canPublish = computed(
  () =>
    canManage.value &&
    dirty.value &&
    !hasUnsavedDraftEdits.value &&
    validation.value?.valid &&
    validation.value.draftVersion === workspace.value?.draft.draftVersion &&
    !errors.value.length &&
    (!requiresReadinessEvidence.value ||
      publishForm.value.readinessEvidenceId.trim().length > 0) &&
    (!requiresSecurityConfirmation.value ||
      (canManageAiContext.value && publishForm.value.confirmSecurity)) &&
    publishForm.value.reason.trim().length > 0,
);
const requiresReadinessEvidence = computed(() =>
  (validation.value?.issues ?? []).some(
    (issue) =>
      issue.code === "ATTRIBUTE_REQUIREMENT_CHANGED" ||
      issue.code === "ATTRIBUTE_REQUIRED_ENFORCED_ADDED",
  ),
);
const requiresSecurityConfirmation = computed(() =>
  (validation.value?.issues ?? []).some(
    (issue) => issue.compatibility === "SECURITY",
  ),
);
const schemaJson = computed(() =>
  JSON.stringify(
    validation.value?.artifact.schema ??
      workspace.value?.currentRevision?.schema ?? {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    null,
    2,
  ),
);
const publishedAiFields = computed(() =>
  (workspace.value?.currentRevision?.fields ?? []).filter(
    (field) => field.lifecycle !== "ARCHIVED" && field.policies.aiRead,
  ),
);
const syntheticAiPreview = computed(() => {
  const valueFor = (type: string) =>
    type === "BOOLEAN"
      ? true
      : type === "INTEGER"
        ? 42
        : type === "DECIMAL"
          ? "42.50"
          : type === "DATE"
            ? "2026-07-19"
            : type === "DATETIME"
              ? "2026-07-19T08:30:00Z"
              : type === "COUNTRY_CODE"
                ? "ES"
                : type === "CURRENCY_CODE"
                  ? "EUR"
                  : "synthetic-value";
  const projection = Object.fromEntries(
    publishedAiFields.value.map((field) => [
      field.key,
      {
        value: valueFor(field.valueType),
        untrusted: true,
        classification: field.classification,
        purpose: field.purpose ?? "not declared",
      },
    ]),
  );
  return aiFormat.value === "STRUCTURED_JSON"
    ? JSON.stringify(projection, null, 2).slice(0, aiBudget.value)
    : publishedAiFields.value
        .map((field) => `${field.label}: ${String(valueFor(field.valueType))}`)
        .join(" · ")
        .slice(0, aiBudget.value);
});

const valueTypes = [
  { value: "STRING", label: "Текст" },
  { value: "BOOLEAN", label: "Да или нет" },
  { value: "INTEGER", label: "Целое число" },
  { value: "DECIMAL", label: "Десятичное число" },
  { value: "DATETIME", label: "Дата и время" },
  { value: "DATE", label: "Дата" },
  { value: "COUNTRY_CODE", label: "Страна" },
  { value: "CURRENCY_CODE", label: "Валюта" },
];
const lifecycleOptions = [
  { value: "ACTIVE", label: "Активно" },
  { value: "DEPRECATED", label: "Выводится из использования" },
];
const requirementOptions = [
  { value: "OPTIONAL", label: "Можно не передавать" },
  {
    value: "REQUIRED_WARN",
    label: "Желательно — предупреждать, если поля нет",
  },
  {
    value: "REQUIRED_ENFORCED",
    label: "Обязательно — отклонять профиль без поля",
  },
];
const classificationOptions = [
  { value: "INTERNAL", label: "Служебные данные" },
  { value: "PERSONAL", label: "Персональные данные" },
  { value: "SENSITIVE", label: "Чувствительные данные" },
];
const indexOptions = [
  { value: "NONE", label: "Не использовать для поиска" },
  { value: "EXACT", label: "Искать по точному значению" },
  { value: "RANGE_SORT", label: "Фильтровать и сортировать" },
];
const semanticRoleOptions = [
  { value: "DISPLAY_NAME", label: "Имя пользователя" },
  { value: "EMAIL", label: "Электронная почта" },
  { value: "COUNTRY", label: "Страна" },
  { value: "CURRENCY", label: "Валюта" },
];
const healthWindowOptions = [
  { value: "24h", label: "24 часа" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
];

onMounted(load);
onBeforeRouteLeave(() =>
  !hasUnsavedDraftEdits.value
    ? true
    : window.confirm(
        "Покинуть страницу и потерять несохранённые изменения полей профиля?",
      ),
);

function toDraftField(
  field: Record<string, unknown>,
): AttributeContractDraftFieldDto {
  return {
    definitionId: String(field.definitionId ?? field.id ?? ""),
    key: String(field.key ?? ""),
    label: String(field.label ?? ""),
    description: (field.description as string | null | undefined) ?? null,
    purpose: (field.purpose as string | null | undefined) ?? null,
    valueType: field.valueType as AttributeContractDraftFieldDto["valueType"],
    lifecycle: field.lifecycle as AttributeContractDraftFieldDto["lifecycle"],
    classification:
      field.classification as AttributeContractDraftFieldDto["classification"],
    requirement:
      field.requirement as AttributeContractDraftFieldDto["requirement"],
    position: Number(field.position ?? 0),
    constraints:
      (field.constraints as AttributeContractDraftFieldDto["constraints"]) ??
      {},
    policies: field.policies as AttributeContractDraftFieldDto["policies"],
    replacementDefinitionId:
      (field.replacementDefinitionId as string | null | undefined) ?? null,
    sunsetAt: (field.sunsetAt as string | null | undefined) ?? null,
    semanticRole:
      (field.semanticRole as AttributeContractDraftFieldDto["semanticRole"]) ??
      null,
  };
}

function demoWorkspace(): AttributeContractWorkspaceResponseDto {
  const projectId = auth.project?.id ?? "demo";
  const base: AttributeContractDraftFieldDto = {
    ...createContractField(10),
    classification: "INTERNAL",
  };
  const demoFields: AttributeContractDraftFieldDto[] = [
    {
      ...base,
      definitionId: "attr-name",
      key: "displayName",
      label: "Отображаемое имя",
      purpose: "Показывать имя пользователя в интерфейсе и сообщениях",
      semanticRole: "DISPLAY_NAME",
      policies: { ...base.policies, clientRead: true, templateRead: true },
    },
    {
      ...base,
      definitionId: "attr-tier",
      key: "loyaltyTier",
      label: "Уровень лояльности",
      purpose: "Собирать сегменты и подставлять уровень в сообщения",
      constraints: { allowedValues: ["basic", "silver", "gold"] },
      policies: {
        ...base.policies,
        audienceRead: true,
        templateRead: true,
        indexPolicy: "EXACT",
      },
      position: 20,
    },
    {
      ...base,
      definitionId: "attr-balance",
      key: "accountBalance",
      label: "Баланс",
      valueType: "DECIMAL",
      classification: "SENSITIVE",
      purpose: "Персонализация ответа о балансе",
      policies: { ...base.policies, adminRead: true, aiRead: true },
      position: 30,
    },
  ];
  const publishedFields = demoFields.map((field) => ({
    ...field,
    classification: field.classification ?? "INTERNAL",
    definitionRevisionId: `${field.definitionId}-revision`,
    definitionRevisionNumber: 1,
  }));
  const publishedDocument = {
    fields: publishedFields.map((field) => toDraftField(field)),
  };
  return {
    currentRevision: {
      id: "demo-revision",
      projectId,
      version: 3,
      canonicalHash: "demo",
      validationHash: "demo",
      acceptances: [],
      compatibilityReport: {
        valid: true,
        issues: [],
        lifecycleImpacts: [],
        authorization: {
          readinessEvidenceId: null,
          securityConfirmations: [],
          breakingChangePlan: null,
          compatibilityGraceDays: 7,
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      fields: publishedFields,
      publishedAt: new Date().toISOString(),
      publishedById: null,
      publishReason: "Демонстрационная версия",
    },
    draft: {
      projectId,
      draftVersion: 3,
      baseContractRevisionId: "demo-revision",
      updatedById: null,
      document: readDemoContractDraft(projectId, publishedDocument),
    },
    validation: {
      valid: true,
      draftVersion: 3,
      validationHash: "demo",
      issues: [],
      artifact: {
        fields: [],
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          additionalProperties: false,
          properties: {},
          required: [],
        },
      },
    },
  };
}

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  loading.value = true;
  loaded.value = false;
  error.value = "";
  try {
    if (repository.mode === "mock") {
      workspace.value = demoWorkspace();
      validation.value = workspace.value.validation;
      health.value = {
        since: new Date(Date.now() - 7 * 86400000).toISOString(),
        coverage: 0.84,
        requestCount: 1240,
        totalUsers: 860,
        usersWithSnapshot: 722,
        sessionRequestsWithSnapshot: 1184,
        sessionRequestsWithoutSnapshot: 56,
        idempotencyConflicts: 2,
        lastSuccessfulSnapshotAt: new Date(Date.now() - 90000).toISOString(),
        fieldCoverage: [],
        invalidReasons: {},
        oldContractIntegrations: [],
        outcomes: { ACCEPTED: 1184, REJECTED: 56 },
        profileAgeDistribution: {
          upTo24Hours: 691,
          from24HoursTo7Days: 25,
          from7To30Days: 6,
          over30Days: 0,
        },
        readiness: {
          ready: true,
          coverage: 0.84,
          oldContractIntegrationCount: 0,
          pendingCleanupRequests: 0,
        },
      };
    } else {
      const [nextWorkspace, nextHealth, history] = await Promise.all([
        attributeContractRepository.workspace(projectId),
        attributeContractRepository.health(projectId, {
          window: healthWindow.value,
        }),
        attributeContractRepository.revisions(projectId, { limit: 25 }),
      ]);
      workspace.value = nextWorkspace;
      validation.value = nextWorkspace.validation;
      health.value = nextHealth;
      revisions.value = history.items;
    }
    savedDraftSnapshot.value = JSON.stringify(workspace.value.draft.document);
    loaded.value = true;
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить настройки полей профиля";
  } finally {
    loading.value = false;
  }
}

async function loadHealth() {
  const projectId = auth.project?.id;
  if (!projectId || repository.mode === "mock") return;
  try {
    health.value = await attributeContractRepository.health(projectId, {
      window: healthWindow.value,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось обновить показатели профилей пользователей";
  }
}

function openCreate() {
  void router.push("/profile-fields/new");
}

function openEdit(field: AttributeContractDraftFieldDto) {
  void router.push(`/profile-fields/${field.definitionId || field.key}`);
}

function saveField() {
  if (!workspace.value) return;
  try {
    form.value.constraints.allowedValues = parseAllowedValues(
      form.value.valueType,
      allowedValuesInput.value,
    );
  } catch (cause) {
    fieldFormError.value =
      cause instanceof Error
        ? cause.message
        : "Проверьте список допустимых значений.";
    return;
  }
  const index = editingIndex.value;
  if (index === null)
    workspace.value.draft.document.fields.push(structuredClone(form.value));
  else
    workspace.value.draft.document.fields[index] = structuredClone(form.value);
  validation.value = null;
  editorVisible.value = false;
}

function removeDraftField(field: AttributeContractDraftFieldDto) {
  if (!workspace.value || isPublishedField(field)) return;
  workspace.value.draft.document.fields = fields.value.filter(
    (item) => item !== field,
  );
  validation.value = null;
}

async function saveDraft() {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value || !canManage.value) return;
  saving.value = true;
  error.value = "";
  try {
    if (repository.mode === "mock") {
      writeDemoContractDraft(projectId, workspace.value.draft.document);
      workspace.value.draft.draftVersion += 1;
    } else
      workspace.value.draft = await attributeContractRepository.saveDraft(
        projectId,
        {
          expectedDraftVersion: workspace.value.draft.draftVersion,
          document: workspace.value.draft.document,
        },
      );
    savedDraftSnapshot.value = JSON.stringify(workspace.value.draft.document);
    validation.value = null;
    toast.add({
      severity: "success",
      summary: "Черновик сохранён",
      detail: "Изменения сохранены и готовы к проверке.",
      life: 2500,
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) {
      const localDocument = structuredClone(workspace.value.draft.document);
      try {
        const latest = await attributeContractRepository.workspace(projectId);
        draftConflict.value = {
          serverDraft: latest.draft,
          localDocument,
        };
        error.value =
          "Другой администратор уже изменил черновик. Скопируйте свою версию и вручную сравните изменения.";
      } catch {
        error.value =
          "Конфликт черновика. Локальные изменения сохранены в браузере; попробуйте загрузить серверную версию позже.";
      }
    } else
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить черновик. Возможно, его уже изменил другой администратор.";
  } finally {
    saving.value = false;
  }
}

function acceptServerDraft() {
  if (!workspace.value || !draftConflict.value) return;
  workspace.value.draft = structuredClone(draftConflict.value.serverDraft);
  savedDraftSnapshot.value = JSON.stringify(workspace.value.draft.document);
  validation.value = null;
  draftConflict.value = null;
  error.value = "";
}

async function copyLocalConflict() {
  if (!draftConflict.value) return;
  await navigator.clipboard.writeText(
    JSON.stringify(draftConflict.value.localDocument, null, 2),
  );
  toast.add({
    severity: "success",
    summary: "Локальный JSON скопирован",
    life: 2000,
  });
}

async function validateDraft() {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value) return;
  if (hasUnsavedDraftEdits.value) {
    error.value =
      "Сначала сохраните изменения черновика, затем запустите проверку.";
    return;
  }
  if (localIssues.value.some((issue) => issue.severity === "error")) return;
  validating.value = true;
  error.value = "";
  try {
    if (repository.mode === "mock")
      validation.value = demoWorkspace().validation;
    else
      validation.value = await attributeContractRepository.validate(
        projectId,
        workspace.value.draft.draftVersion,
      );
    if (validation.value.valid)
      toast.add({
        severity: "success",
        summary: "Ошибок не найдено",
        detail: "Черновик можно опубликовать.",
        life: 3000,
      });
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось проверить контракт";
  } finally {
    validating.value = false;
  }
}

async function publish() {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value || !validation.value || !canPublish.value)
    return;
  publishing.value = true;
  error.value = "";
  try {
    if (repository.mode === "mock") {
      publishingVisible.value = false;
      toast.add({
        severity: "success",
        summary: "Ревизия опубликована",
        detail: "Новая версия полей профиля доступна для интеграций.",
        life: 3500,
      });
      return;
    }
    await attributeContractRepository.publish(projectId, {
      expectedCurrentRevisionId: workspace.value.currentRevision?.id ?? null,
      expectedDraftVersion: workspace.value.draft.draftVersion,
      validationHash: validation.value.validationHash,
      reason: publishForm.value.reason.trim(),
      compatibilityGraceDays: publishForm.value.graceDays,
      breakingChangePlan: publishForm.value.breakingChangePlan.trim() || null,
      readinessEvidenceId: publishForm.value.readinessEvidenceId.trim() || null,
      securityConfirmations: publishForm.value.confirmSecurity
        ? securityAffectedDefinitionIds.value
        : [],
    });
    publishingVisible.value = false;
    await load();
    toast.add({
      severity: "success",
      summary: "Поля профиля опубликованы",
      detail: "Создана новая версия настроек.",
      life: 3500,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Сервер отклонил публикацию";
  } finally {
    publishing.value = false;
  }
}

function typeHint(type: string) {
  return (
    {
      STRING:
        "Подходит для имён, статусов и других коротких текстовых значений.",
      BOOLEAN: "Выберите для признака с двумя значениями: да или нет.",
      INTEGER: "Целое число без дробной части, например количество заказов.",
      DECIMAL:
        "Точное число с дробной частью. Подходит для денег, балансов и рейтингов.",
      DATE: "Календарная дата без времени, например дата рождения.",
      DATETIME: "Точная дата и время события с часовым поясом.",
      COUNTRY_CODE: "Страна в двухбуквенном формате, например ES или RU.",
      CURRENCY_CODE: "Валюта в трёхбуквенном формате, например EUR или RUB.",
    }[type] ?? "Выберите формат данных, которые будет передавать ваш продукт."
  );
}

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function valueTypeLabel(value: string) {
  return optionLabel(valueTypes, value);
}

function lifecycleLabel(value: string) {
  return value === "ARCHIVED"
    ? "В архиве"
    : optionLabel(lifecycleOptions, value);
}

function requirementLabel(value: string) {
  return optionLabel(requirementOptions, value);
}

function classificationLabel(value: string | undefined) {
  return value ? optionLabel(classificationOptions, value) : "Служебные данные";
}

function indexPolicyLabel(value: string) {
  return optionLabel(indexOptions, value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

function canonicalSignature(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function contractDocumentSignature(
  document: AttributeContractDraftResponseDto["document"],
) {
  return canonicalSignature({
    fields: [...document.fields]
      .sort(
        (left, right) =>
          left.position - right.position ||
          left.key.localeCompare(right.key) ||
          (left.definitionId ?? "").localeCompare(right.definitionId ?? ""),
      )
      .map(comparableContractField),
  });
}

function comparableContractField(field: AttributeContractDraftFieldDto) {
  return {
    definitionId: field.definitionId ?? null,
    key: field.key,
    label: field.label.trim(),
    description: field.description?.trim() || null,
    purpose: field.purpose?.trim() || null,
    valueType: field.valueType,
    lifecycle: field.lifecycle,
    classification: field.classification,
    requirement: field.requirement,
    position: field.position,
    constraints: field.constraints,
    policies: field.policies,
    replacementDefinitionId: field.replacementDefinitionId ?? null,
    sunsetAt: field.sunsetAt ?? null,
    semanticRole: field.semanticRole ?? null,
  };
}

function contractFieldSignature(field: AttributeContractDraftFieldDto) {
  return canonicalSignature(comparableContractField(field));
}

function fieldPublicationState(field: AttributeContractDraftFieldDto) {
  const published = publishedFieldFor(field);
  if (!published) return "draft" as const;
  const publishedDraft = toDraftField(
    published as unknown as Record<string, unknown>,
  );
  return contractFieldSignature(field) === contractFieldSignature(publishedDraft)
    ? ("published" as const)
    : ("changed" as const);
}

function publishedFieldFor(field: AttributeContractDraftFieldDto) {
  return workspace.value?.currentRevision?.fields.find(
    (item) => item.definitionId === field.definitionId,
  );
}

function isPublishedField(field: AttributeContractDraftFieldDto) {
  return Boolean(field.definitionId && publishedFieldFor(field));
}

function healthWindowLabel(value: string) {
  return optionLabel(healthWindowOptions, value);
}

function fixIssue(issue: ContractIssuePresentation) {
  if (issue.fieldIdentity)
    void router.push(`/profile-fields/${issue.fieldIdentity}`);
}

async function openImpact(field: AttributeContractDraftFieldDto) {
  const projectId = auth.project?.id;
  if (!projectId || !field.definitionId) return;
  impactField.value = field;
  impactVisible.value = true;
  impactLoading.value = true;
  impact.value = null;
  try {
    impact.value =
      repository.mode === "mock"
        ? {
            canArchive: true,
            definition: {
              id: field.definitionId,
              key: field.key,
              status: field.lifecycle,
            },
            dependencies: [],
          }
        : await attributeContractRepository.impact(
            projectId,
            field.definitionId,
          );
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось проверить, где используется поле";
  } finally {
    impactLoading.value = false;
  }
}

function archiveImpactedField() {
  if (!workspace.value || !impact.value?.canArchive || !impactField.value)
    return;
  if (
    !window.confirm(
      `Архивировать «${impactField.value.label}» в следующей версии? Поле исчезнет из новых профилей, но сохранится в уже записанной истории.`,
    )
  )
    return;
  const index = fields.value.findIndex(
    (field) => field.definitionId === impactField.value?.definitionId,
  );
  if (index < 0) return;
  workspace.value.draft.document.fields[index] = {
    ...workspace.value.draft.document.fields[index]!,
    lifecycle: "ARCHIVED",
  };
  validation.value = null;
  impactVisible.value = false;
  toast.add({
    severity: "warn",
    summary: "Архивирование добавлено в черновик",
    detail: "Сохраните, проверьте и опубликуйте новую версию.",
    life: 3500,
  });
}
</script>

<template>
  <section class="page contract-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Данные пользователей</div>
        <h1>Поля профиля пользователей</h1>
        <p class="subtitle">
          Задайте, какие данные о пользователе Lola получает от вашего продукта
          и где их можно использовать.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Как передавать данные"
          icon="pi pi-send"
          severity="secondary"
          outlined
          as="router-link"
          to="/profile-fields/integration"
        /><Button
          label="История изменений"
          icon="pi pi-history"
          severity="secondary"
          outlined
          @click="historyVisible = true"
        /><Button
          v-if="canManage && loaded && workspace"
          label="Добавить поле"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>
    </header>

    <DocumentationCallout
      title="Как настроить поля профиля пользователей"
      text="Прочитайте перед работой: типы, обязательность, версии, публикация, зависимости, архивирование и качество данных."
      icon="pi pi-id-card"
      route-name="profile-fields-guide"
    />

    <nav class="section-nav card" aria-label="Разделы полей профиля">
      <a href="#fields" class="active"><i class="pi pi-list" />Поля</a>
      <RouterLink to="/profile-fields/integration"
        ><i class="pi pi-send" />Передача данных</RouterLink
      >
      <a href="#quality"><i class="pi pi-chart-bar" />Качество данных</a>
      <button type="button" @click="historyVisible = true">
        <i class="pi pi-history" />История
      </button>
    </nav>

    <Message v-if="!canManage" severity="info" :closable="false"
      >Вы можете просматривать поля. Изменять и публиковать их могут владелец и
      администратор проекта.</Message
    >
    <Message v-if="error" severity="error" :closable="false"
      ><div class="message-row">
        <span>{{ error }}</span
        ><Button label="Повторить" size="small" text @click="load" /></div
    ></Message>
    <Message v-if="draftConflict" severity="warn" :closable="false">
      <div class="conflict-recovery">
        <div>
          <strong>Нужна ручная сверка черновиков</strong>
          <span
            >Другой администратор сохранил более новый черновик. Сравните его со
            своими изменениями перед продолжением.</span
          >
        </div>
        <Button
          label="Скопировать свои изменения"
          severity="secondary"
          text
          @click="copyLocalConflict"
        />
        <Button
          label="Открыть сохранённую версию"
          severity="secondary"
          outlined
          @click="acceptServerDraft"
        />
      </div>
    </Message>
    <div v-if="loading" class="loading-grid">
      <Skeleton
        v-for="item in 5"
        :key="item"
        height="120px"
        border-radius="18px"
      />
    </div>

    <template v-else-if="loaded && workspace">
      <section class="setup-status card">
        <div class="setup-copy">
          <span class="setup-icon"><i class="pi pi-list-check" /></span>
          <div>
            <strong>Как настроить профиль пользователя</strong>
            <p>
              Добавьте поля, опубликуйте изменения и передайте тестовый профиль.
            </p>
          </div>
        </div>
        <ol>
          <li :class="{ done: fields.length > 0 }">
            <span>1</span>
            <div>
              <strong>Добавьте поля</strong
              ><small>Что хранить о пользователе</small>
            </div>
          </li>
          <li :class="{ done: Boolean(workspace.currentRevision) }">
            <span>2</span>
            <div>
              <strong>Опубликуйте структуру</strong
              ><small>Чтобы она начала действовать</small>
            </div>
          </li>
          <li :class="{ done: Boolean(health?.lastSuccessfulSnapshotAt) }">
            <span>3</span>
            <div>
              <strong>Передайте профиль</strong
              ><small>И проверьте результат</small>
            </div>
          </li>
        </ol>
      </section>

      <section class="summary-grid">
        <article class="metric card">
          <span>Опубликованная версия</span
          ><strong>{{
            workspace.currentRevision
              ? `Версия ${workspace.currentRevision.version}`
              : "Ещё не опубликовано"
          }}</strong
          ><small>{{
            workspace.currentRevision
              ? "Эта структура сейчас используется"
              : "Сначала добавьте хотя бы одно поле"
          }}</small>
        </article>
        <article class="metric card">
          <span>Текущий черновик</span
          ><strong>{{
            hasUnsavedDraftEdits
              ? "Есть несохранённые изменения"
              : dirty
                ? "Есть неопубликованные изменения"
                : "Все изменения опубликованы"
          }}</strong
          ><small>{{
            hasUnsavedDraftEdits
              ? "Сохраните изменения, чтобы проверить и опубликовать их."
              : dirty
                ? workspace.currentRevision
                  ? `Сохранённый черновик отличается от опубликованной версии ${workspace.currentRevision.version}.`
                  : "Сохранённый черновик ещё не опубликован."
                : workspace.currentRevision
                  ? `Совпадает с опубликованной версией ${workspace.currentRevision.version}.`
                  : "Изменений для публикации нет."
          }}</small>
        </article>
        <article class="metric card">
          <span>Профили с данными</span
          ><strong>{{
            health ? `${Math.round(health.coverage * 100)}%` : "—"
          }}</strong
          ><small>{{
            health
              ? `${health.usersWithSnapshot} из ${health.totalUsers} · ${healthWindowLabel(healthWindow)}`
              : "Статистика пока недоступна"
          }}</small>
        </article>
      </section>

      <div id="fields" class="toolbar card">
        <div>
          <strong>Поля профиля</strong
          ><span>{{
            fields.length
              ? `${fields.length} ${fields.length === 1 ? "поле" : "полей"} в черновике`
              : "Добавьте первое поле, например имя, город или уровень лояльности"
          }}</span>
        </div>
        <Button
          v-if="canManage"
          label="Добавить поле"
          icon="pi pi-plus"
          size="small"
          @click="openCreate"
        />
      </div>

      <Teleport defer to="#profile-quality-slot">
        <header class="quality-area-heading">
          <span class="quality-area-icon"><i class="pi pi-chart-line" /></span>
          <div>
            <span>После настройки</span>
            <h2>Статистика после публикации</h2>
            <p>
              Здесь видно, приходят ли профили и насколько хорошо заполняются
              поля.
            </p>
          </div>
        </header>
        <section v-if="health" id="quality" class="health-evidence card">
          <header class="health-header">
            <span class="health-icon"><i class="pi pi-chart-bar" /></span>
            <div>
              <h2>Качество поступающих данных</h2>
              <p>
                Показывает, получает ли Lola профили и какие проблемы
                встречаются.
              </p>
            </div>
            <Select
              v-model="healthWindow"
              :options="healthWindowOptions"
              option-label="label"
              option-value="value"
              aria-label="Период статистики"
              @change="loadHealth"
            />
          </header>
          <div class="fact-grid">
            <div>
              <span>Получено обновлений</span
              ><strong>{{ health.requestCount }}</strong
              ><small>За выбранный период</small>
            </div>
            <div>
              <span>Сессии с профилем</span
              ><strong>{{ health.sessionRequestsWithSnapshot }}</strong
              ><small>Данные были доступны</small>
            </div>
            <div>
              <span>Сессии без профиля</span
              ><strong>{{ health.sessionRequestsWithoutSnapshot }}</strong
              ><small>Нужно проверить передачу</small>
            </div>
            <div>
              <span>Конфликты повторов</span
              ><strong>{{ health.idempotencyConflicts }}</strong
              ><small>Одинаковые запросы</small>
            </div>
            <div>
              <span>Последнее обновление</span
              ><strong>{{
                health.lastSuccessfulSnapshotAt
                  ? new Date(health.lastSuccessfulSnapshotAt).toLocaleString(
                      "ru-RU",
                    )
                  : "Ещё не было"
              }}</strong
              ><small>Успешно принято Lola</small>
            </div>
            <div>
              <span>Ожидают обработки</span
              ><strong>{{ health.readiness.pendingCleanupRequests }}</strong
              ><small>Запросы в очереди</small>
            </div>
          </div>
          <div class="age-grid">
            <div>
              <span>До 24 часов</span
              ><strong>{{ health.profileAgeDistribution.upTo24Hours }}</strong>
            </div>
            <div>
              <span>От 1 до 7 дней</span
              ><strong>{{
                health.profileAgeDistribution.from24HoursTo7Days
              }}</strong>
            </div>
            <div>
              <span>От 7 до 30 дней</span
              ><strong>{{
                health.profileAgeDistribution.from7To30Days
              }}</strong>
            </div>
            <div>
              <span>Старше 30 дней</span
              ><strong>{{ health.profileAgeDistribution.over30Days }}</strong>
            </div>
          </div>
          <section v-if="health.fieldCoverage.length">
            <h3>Заполненность полей</h3>
            <div class="policy-list">
              <span
                v-for="field in health.fieldCoverage"
                :key="field.definitionId"
                >{{ field.key }} · {{ Math.round(field.coverage * 100) }}%</span
              >
            </div>
          </section>
          <Message
            v-if="health.oldContractIntegrations.length"
            severity="warn"
            :closable="false"
            >{{ health.oldContractIntegrations.length }} подключений всё ещё
            используют старую версию полей. Обновите их перед
            публикацией.</Message
          >
          <details class="raw-health">
            <summary>Посмотреть исходные данные для разработчика</summary>
            <div class="raw-health-grid">
              <CodeBlock
                title="Результаты обработки"
                :code="JSON.stringify(health.outcomes, null, 2)"
              />
              <CodeBlock
                title="Причины ошибок"
                :code="JSON.stringify(health.invalidReasons, null, 2)"
              />
            </div>
          </details>
        </section>
      </Teleport>

      <Message
        v-if="errors.length"
        class="validation-notice"
        severity="error"
        :closable="false"
      >
        <span class="notice-title">Публикация недоступна: исправьте ошибки</span>
        <ul>
          <li v-for="issue in errors" :key="issue.key">
            <span class="notice-copy">
              <strong>{{ issue.title }}</strong>
              <small v-if="issue.detail">{{ issue.detail }}</small>
              <small>Код: <code>{{ issue.code }}</code></small>
            </span>
            <Button
              v-if="issue.fieldIdentity"
              :label="issue.actionLabel"
              icon="pi pi-arrow-right"
              icon-pos="right"
              severity="danger"
              size="small"
              text
              @click="fixIssue(issue)"
            />
          </li>
        </ul>
      </Message>
      <Message
        v-if="warnings.length"
        class="validation-notice"
        severity="warn"
        :closable="false"
      >
        <span class="notice-title">Что проверить перед публикацией</span>
        <ul>
          <li v-for="issue in warnings" :key="issue.key">
            <span class="notice-copy">
              <strong>{{ issue.title }}</strong>
              <small>{{ issue.detail }}</small>
              <small>Код: <code>{{ issue.code }}</code></small>
            </span>
            <Button
              v-if="issue.fieldIdentity"
              :label="issue.actionLabel"
              icon="pi pi-arrow-right"
              icon-pos="right"
              severity="warn"
              size="small"
              text
              @click="fixIssue(issue)"
            />
          </li>
        </ul>
      </Message>

      <div v-if="orderedFields.length" class="field-list">
        <article
          v-for="field in orderedFields"
          :key="field.definitionId ?? `draft-${field.key}`"
          class="field-card card"
          :class="field.lifecycle.toLowerCase()"
        >
          <div class="field-type">
            <i
              :class="
                field.valueType === 'BOOLEAN'
                  ? 'pi pi-check-square'
                  : field.valueType.includes('DATE')
                    ? 'pi pi-calendar'
                    : field.valueType === 'DECIMAL' ||
                        field.valueType === 'INTEGER'
                      ? 'pi pi-hashtag'
                      : 'pi pi-align-left'
              "
            />
          </div>
          <div class="field-main">
            <div class="field-title">
              <h2>{{ field.label || "Без названия" }}</h2>
              <code>{{ field.key || "new_key" }}</code
              ><Tag
                :value="valueTypeLabel(field.valueType)"
                severity="secondary"
              /><Tag
                :value="
                  fieldPublicationState(field) === 'draft'
                    ? 'В черновике'
                    : fieldPublicationState(field) === 'changed'
                      ? 'Изменено в черновике'
                      : lifecycleLabel(field.lifecycle)
                "
                :title="
                  fieldPublicationState(field) === 'changed'
                    ? 'Сохранённые настройки поля отличаются от опубликованных. Чтобы они начали действовать, проверьте и опубликуйте черновик.'
                    : undefined
                "
                :severity="
                  fieldPublicationState(field) === 'draft'
                    ? 'secondary'
                    : fieldPublicationState(field) === 'changed'
                        ? 'warn'
                        : field.lifecycle === 'ACTIVE'
                          ? 'success'
                          : field.lifecycle === 'DEPRECATED'
                            ? 'warn'
                            : 'secondary'
                "
              />
            </div>
            <p>{{ field.description || typeHint(field.valueType) }}</p>
            <div class="policy-list">
              <span v-if="field.requirement !== 'OPTIONAL'">{{
                requirementLabel(field.requirement)
              }}</span
              ><span v-if="field.policies.adminRead">Карточка пользователя</span
              ><span v-if="field.policies.audienceRead">Сегменты</span
              ><span v-if="field.policies.templateRead">Шаблоны</span
              ><span v-if="field.policies.aiRead">Функции с ИИ</span
              ><span v-if="field.policies.clientRead">Сайт</span
              ><span v-if="field.policies.exportRead">Экспорт</span
              ><span>{{ classificationLabel(field.classification) }}</span
              ><span v-if="field.policies.indexPolicy !== 'NONE'">{{
                indexPolicyLabel(field.policies.indexPolicy)
              }}</span>
            </div>
          </div>
          <div class="field-actions">
            <Button
              v-if="field.definitionId"
              label="Где используется"
              icon="pi pi-share-alt"
              severity="secondary"
              text
              :aria-label="`Показать, где используется ${field.label}`"
              @click="openImpact(field)"
            /><Button
              v-if="canManage"
              label="Изменить"
              icon="pi pi-pencil"
              severity="secondary"
              text
              :aria-label="`Изменить ${field.label}`"
              @click="openEdit(field)"
            /><Button
              v-if="canManage && !isPublishedField(field)"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :aria-label="`Удалить ${field.label}`"
              @click="removeDraftField(field)"
            />
          </div>
        </article>
      </div>
      <div v-else class="empty card">
        <i class="pi pi-id-card" /><strong>Добавьте первое поле профиля</strong>
        <p>
          Например, имя, город или уровень программы лояльности. Затем
          опубликуйте структуру и передайте тестовый профиль.
        </p>
        <Button v-if="canManage" label="Добавить поле" @click="openCreate" />
        <RouterLink to="/profile-fields/integration" class="empty-help"
          >Как это работает</RouterLink
        >
      </div>

      <Teleport defer to="#profile-tools-slot">
        <section class="tools-grid">
          <RouterLink to="/profile-fields/integration" class="tool-card card">
            <span class="tool-icon"><i class="pi pi-send" /></span>
            <span
              ><strong>Передача данных</strong
              ><small
                >Пошагово подключите сервер и отправьте тестовый профиль.</small
              ></span
            >
            <i class="pi pi-arrow-right" />
          </RouterLink>
          <button
            v-if="canManageAiContext"
            type="button"
            class="tool-card card"
            @click="aiContextVisible = true"
          >
            <span class="tool-icon ai"><i class="pi pi-sparkles" /></span>
            <span
              ><strong>Данные для ИИ</strong
              ><small
                >Проверьте, какие опубликованные поля доступны функциям с
                ИИ.</small
              ></span
            >
            <i class="pi pi-arrow-right" />
          </button>
        </section>
      </Teleport>

      <footer v-if="canManage" class="workspace-footer card">
        <div>
          <strong>{{
            !dirty
              ? "Все изменения опубликованы"
              : errors.length
                ? "Исправьте ошибки, чтобы опубликовать"
                : validation?.valid && !hasUnsavedDraftEdits
                ? "Черновик проверен — можно публиковать"
                : hasUnsavedDraftEdits
                  ? "Сохраните изменения, чтобы продолжить"
                  : "Проверьте черновик перед публикацией"
          }}</strong
          ><small>{{
            dirty
              ? "Новая структура начнёт действовать только после публикации."
              : "Текущая структура уже используется Lola."
          }}</small>
        </div>
        <Button
          label="1. Сохранить"
          severity="secondary"
          outlined
          :disabled="!hasUnsavedDraftEdits"
          :loading="saving"
          @click="saveDraft"
        /><Button
          label="2. Проверить"
          icon="pi pi-check-circle"
          severity="secondary"
          :disabled="hasUnsavedDraftEdits || (!dirty && validation?.valid)"
          :loading="validating"
          @click="validateDraft"
        /><Button
          label="3. Опубликовать"
          icon="pi pi-send"
          :disabled="
            hasUnsavedDraftEdits ||
            errors.length > 0 ||
            !dirty ||
            !validation?.valid ||
            validation.draftVersion !== workspace.draft.draftVersion
          "
          @click="publishingVisible = true"
        />
      </footer>
      <div id="profile-quality-slot" class="content-slot" />
      <div id="profile-tools-slot" class="content-slot" />
    </template>

    <Dialog
      v-if="false"
      v-model:visible="editorVisible"
      modal
      :header="
        editingIndex === null ? 'Новое поле профиля пользователя' : 'Изменить поле'
      "
      :style="{ width: 'min(920px, calc(100vw - 24px))' }"
    >
      <form
        id="contract-field-form"
        class="editor-form"
        @submit.prevent="saveField"
      >
        <div class="form-grid triple">
          <label
            ><span>Название *</span
            ><InputText v-model="form.label" autofocus maxlength="120" /></label
          ><label
            ><span>Stable key *</span
            ><InputText
              v-model="form.key"
              class="mono"
              :disabled="isPublishedField(form)"
          /></label>
        </div>
        <div class="form-grid triple">
          <label
            ><span>Тип</span
            ><Select
              v-model="form.valueType"
              :options="valueTypes"
              option-label="label"
              option-value="value"
              :disabled="isPublishedField(form)" /></label
          ><label
            ><span>Lifecycle</span
            ><Select
              v-model="form.lifecycle"
              :options="lifecycleOptions"
              option-label="label"
              option-value="value" /></label
          ><label
            ><span>Position</span
            ><InputNumber
              v-model="form.position"
              :min="0"
              :max="10000"
              :use-grouping="false"
          /></label>
        </div>
        <small class="type-copy">{{ typeHint(form.valueType) }}</small>
        <div class="form-grid">
          <label
            ><span>Requirement</span
            ><Select
              v-model="form.requirement"
              :options="requirementOptions"
              option-label="label"
              option-value="value" /></label
          ><label
            ><span>Classification</span
            ><Select
              v-model="form.classification"
              :options="classificationOptions"
              option-label="label"
              option-value="value" /></label
          ><label
            ><span>Назначение данных</span
            ><Select
              v-model="form.semanticRole"
              :options="semanticRoleOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="Не задана"
          /></label>
        </div>
        <label
          ><span>Описание</span
          ><Textarea
            v-model="form.description"
            rows="2"
            auto-resize
            maxlength="2000"
        /></label>
        <label
          ><span>Цель и правовое основание</span
          ><Textarea
            v-model="form.purpose"
            rows="2"
            auto-resize
            maxlength="500"
            placeholder="Обязательно, если поле используют функции с ИИ"
        /></label>
        <section class="policy-editor surface-soft">
          <h3>Политики потребителей</h3>
          <div class="toggle-grid">
            <label
              ><span>Просмотр администраторами</span
              ><ToggleSwitch v-model="form.policies.adminRead" /></label
            ><label
              ><span>Условия аудитории</span
              ><ToggleSwitch v-model="form.policies.audienceRead" /></label
            ><label
              ><span>Шаблоны сообщений</span
              ><ToggleSwitch v-model="form.policies.templateRead" /></label
            ><label
              ><span>Функции с ИИ</span
              ><ToggleSwitch v-model="form.policies.aiRead" /></label
            ><label
              ><span>Интерфейс продукта</span
              ><ToggleSwitch v-model="form.policies.clientRead" /></label
            ><label
              ><span>Выгрузка</span
              ><ToggleSwitch v-model="form.policies.exportRead" /></label
            ><label
              ><span>Индексирование</span
              ><Select
                v-model="form.policies.indexPolicy"
                :options="indexOptions"
                option-label="label"
                option-value="value"
            /></label>
          </div>
          <label class="allowed-values"
            ><span>Допустимые значения · по одному в строке</span
            ><Textarea
              v-model="allowedValuesInput"
              rows="3"
              auto-resize
              :placeholder="
                form.valueType === 'BOOLEAN'
                  ? 'true\nfalse'
                  : form.valueType === 'DECIMAL'
                    ? '10.00\n99.95'
                    : 'basic\npremium'
              "
            /><small
              >Десятичные числа сохраняются без округления; целые числа и
              значения «да/нет» проверяются до отправки на сервер.</small
            ></label
          >
        </section>
        <section class="policy-editor surface-soft">
          <h3>Ограничения</h3>
          <div class="form-grid triple">
            <label
              ><span>Минимальная длина</span
              ><InputNumber
                v-model="form.constraints.minLength"
                :min="0" /></label
            ><label
              ><span>Максимальная длина</span
              ><InputNumber
                v-model="form.constraints.maxLength"
                :min="0" /></label
            ><label
              ><span>Всего цифр в числе</span
              ><InputNumber
                v-model="form.constraints.precision"
                :min="1"
                :max="38" /></label
            ><label
              ><span>Цифр после запятой</span
              ><InputNumber
                v-model="form.constraints.scale"
                :min="0"
                :max="38" /></label
            ><label
              ><span>Минимальное значение</span
              ><InputText
                :model-value="String(form.constraints.minimum ?? '')"
                @update:model-value="
                  form.constraints.minimum = $event || undefined
                " /></label
            ><label
              ><span>Максимальное значение</span
              ><InputText
                :model-value="String(form.constraints.maximum ?? '')"
                @update:model-value="
                  form.constraints.maximum = $event || undefined
                "
            /></label>
          </div>
        </section>
        <div v-if="form.lifecycle === 'DEPRECATED'" class="form-grid">
          <label
            ><span>ID поля, которое используется вместо этого</span
            ><InputText
              v-model="form.replacementDefinitionId"
              class="mono" /></label
          ><label
            ><span>Когда перестать принимать поле</span
            ><InputText
              v-model="form.sunsetAt"
              placeholder="2026-12-31T00:00:00Z"
            /><small
              >Укажите дату и время по UTC, например
              2026-12-31T00:00:00Z.</small
          ></label>
        </div>
        <Message v-if="fieldFormError" severity="error" :closable="false">{{
          fieldFormError
        }}</Message>
      </form>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="editorVisible = false" /><Button
          form="contract-field-form"
          type="submit"
          label="Применить в черновик"
          :disabled="!form.label.trim() || !form.key.trim()"
      /></template>
    </Dialog>

    <Dialog
      v-model:visible="publishingVisible"
      modal
      header="Опубликовать изменения"
      :style="{ width: 'min(650px, calc(100vw - 24px))' }"
    >
      <div class="publish-form">
        <Message severity="warn" :closable="false"
          >После публикации новая структура начнёт действовать. Уже сохранённые
          профили и старые версии останутся без изменений.</Message
        ><label
          ><span class="label-with-help">Причина изменения *
            <button
              type="button"
              class="help-button"
              :aria-label="`Подсказка: ${publishHelp.reason}`"
              :data-tooltip="publishHelp.reason"
            ><i class="pi pi-question-circle" /></button></span
          ><Textarea
            v-model="publishForm.reason"
            rows="3"
            maxlength="1000" /></label
        ><label
          ><span class="label-with-help">Переходный период, дней
            <button
              type="button"
              class="help-button"
              :aria-label="`Подсказка: ${publishHelp.graceDays}`"
              :data-tooltip="publishHelp.graceDays"
            ><i class="pi pi-question-circle" /></button></span
          ><InputNumber
            v-model="publishForm.graceDays"
            :min="0"
            :max="30" /></label
        ><label
          ><span class="label-with-help">План перехода для несовместимых изменений
            <button
              type="button"
              class="help-button"
              :aria-label="`Подсказка: ${publishHelp.breakingChangePlan}`"
              :data-tooltip="publishHelp.breakingChangePlan"
            ><i class="pi pi-question-circle" /></button></span
          ><Textarea
            v-model="publishForm.breakingChangePlan"
            rows="3"
            maxlength="2000" /></label
        ><label
          ><span class="label-with-help">Номер задачи о готовности интеграции
            <button
              type="button"
              class="help-button"
              :aria-label="`Подсказка: ${publishHelp.readinessEvidence}`"
              :data-tooltip="publishHelp.readinessEvidence"
            ><i class="pi pi-question-circle" /></button></span
          ><InputText
            v-model="publishForm.readinessEvidenceId"
            class="mono"
          /><small v-if="requiresReadinessEvidence"
            >Обязательно: контракт изменяет режим обязательности поля.</small
          ></label
        ><label class="security-confirm"
          ><ToggleSwitch v-model="publishForm.confirmSecurity" /><span
            >Я проверил, где будут доступны персональные и чувствительные
            данные.<template v-if="requiresSecurityConfirmation">
              Подтверждение обязательно, потому что меняется доступ к
              данным.</template
            ></span
          ></label
        >
        <Message
          v-if="requiresSecurityConfirmation && !canManageAiContext"
          severity="error"
          :closable="false"
          >Изменение доступа к чувствительным данным может подтвердить только
          владелец проекта.</Message
        >
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="publishingVisible = false" /><Button
          label="Опубликовать"
          icon="pi pi-send"
          :loading="publishing"
          :disabled="!canPublish"
          @click="publish"
      /></template>
    </Dialog>

    <Dialog
      v-model:visible="aiContextVisible"
      modal
      header="Какие данные доступны функциям с ИИ"
      :style="{ width: 'min(780px, calc(100vw - 24px))' }"
    >
      <div class="guide">
        <Message severity="warn" :closable="false"
          >В примере используются вымышленные значения. Данные профиля всегда
          считаются пользовательскими данными, а не инструкциями для
          ИИ.</Message
        >
        <div class="form-grid">
          <label
            ><span>Формат</span
            ><Select
              v-model="aiFormat"
              :options="[
                { value: 'STRUCTURED_JSON', label: 'Структурированный JSON' },
                { value: 'COMPACT_TEXT', label: 'Краткий текст' },
              ]"
              option-label="label"
              option-value="value" /></label
          ><label
            ><span>Максимальный размер, символов</span
            ><InputNumber v-model="aiBudget" :min="256" :max="12000"
          /></label>
        </div>
        <p>
          Здесь показаны только опубликованные поля, для которых разрешено
          использование функциями с ИИ. Изменение доступа начнёт действовать
          после проверки и публикации.
        </p>
        <div v-if="publishedAiFields.length" class="policy-list">
          <span
            v-for="field in publishedAiFields"
            :key="field.definitionRevisionId"
            >{{ field.label }} · {{ field.classification }}</span
          >
        </div>
        <div v-else class="empty">
          В опубликованной версии нет полей, доступных функциям с ИИ.
        </div>
        <CodeBlock
          title="Пример данных для ИИ"
          :language="aiFormat === 'STRUCTURED_JSON' ? 'JSON' : 'Текст'"
          :code="syntheticAiPreview || '{}'"
        />
      </div>
    </Dialog>

    <Dialog
      v-model:visible="integrationVisible"
      modal
      header="Как передавать профиль"
      :style="{ width: 'min(820px, calc(100vw - 24px))' }"
    >
      <div class="guide">
        <p>
          Сервер вашего продукта передаёт полный профиль. Токену нужен доступ
          <code>profile:snapshot:write</code>. Обновление с большим порядковым
          номером нельзя перезаписать более старым; один и тот же запрос можно
          безопасно повторить.
        </p>
        <h3>Обновление профиля · PUT /api/v1/end-user-profile-snapshots</h3>
        <pre><code>curl -X PUT "$LOLA_URL/api/v1/end-user-profile-snapshots" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{
  "externalUserId": "user-123",
  "contractRevision": {{ workspace?.currentRevision?.version ?? 1 }},
  "observedAt": "2026-07-19T08:30:00Z",
  "sourceSequence": "42",
  "attributes": { "displayName": "Ada", "loyaltyTier": "gold" }
}'</code></pre>
        <h3>Профиль при создании сессии · POST /api/v1/interaction-sessions</h3>
        <pre><code>const body = {
  externalUserId: "user-123",
  profileSnapshot: {
    contractRevision: {{ workspace?.currentRevision?.version ?? 1 }},
    idempotencyKey: "session:user-123:42",
    observedAt: "2026-07-19T08:30:00Z",
    sourceSequence: "42",
    attributes: { displayName: "Ada", loyaltyTier: "gold" }
  }
};
await fetch("/api/v1/interaction-sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer &lt;token&gt;" },
  body: JSON.stringify(body)
});</code></pre>
        <h3>Сгенерированная схема JSON</h3>
        <pre><code>{{ schemaJson }}</code></pre>
        <Message severity="info" :closable="false"
          >DECIMAL передавайте строкой, DATE — YYYY-MM-DD, DATETIME — RFC 3339.
          Полный профиль заменяет предыдущее состояние. Сервер проверяет
          список разрешённых полей, версию структуры и порядок обновлений
          и не даёт перезаписать данные более старой версией.</Message
        >
      </div>
    </Dialog>

    <Dialog
      v-model:visible="historyVisible"
      modal
      header="История изменений полей"
      :style="{ width: 'min(760px, calc(100vw - 24px))' }"
    >
      <ol v-if="revisions.length" class="history">
        <li v-for="revision in revisions" :key="revision.id">
          <div>
            <strong
              >v{{ revision.version }} · {{ revision.fieldCount }} полей</strong
            ><span>{{
              new Date(revision.publishedAt).toLocaleString("ru-RU")
            }}</span>
          </div>
          <p>{{ revision.publishReason }}</p>
          <code>{{ revision.canonicalHash }}</code>
        </li>
      </ol>
      <div v-else class="empty">Опубликованных ревизий пока нет.</div>
    </Dialog>
    <Dialog
      v-model:visible="impactVisible"
      modal
      header="Где используется поле"
      class="impact-dialog"
      :style="{ width: 'min(680px, calc(100vw - 24px))' }"
    >
      <div v-if="impactLoading" class="loading-grid">
        <Skeleton height="100px" />
      </div>
      <template v-else-if="impact"
        ><Message
          :severity="impact.canArchive ? 'info' : 'warn'"
          :closable="false"
          >{{
            impact.canArchive
              ? "Поле можно архивировать после проверки связанных разделов."
              : "Архивирование заблокировано активными зависимостями."
          }}</Message
        >
        <div v-if="impact.dependencies.length" class="impact-list">
          <article
            v-for="dependency in impact.dependencies"
            :key="`${dependency.kind}:${dependency.id}`"
          >
            <div>
              <strong>{{ dependency.name }}</strong
              ><code>{{ dependency.kind }} · {{ dependency.id }}</code>
            </div>
            <Tag :value="dependency.status" severity="secondary" />
          </article>
        </div>
        <div v-else class="impact-empty">
          <i class="pi pi-check-circle" />
          <div>
            <strong>Связанных разделов нет</strong>
            <p>
              Поле не используется в активных сегментах, шаблонах или других
              настройках Lola.
            </p>
          </div>
        </div>
        <Message severity="warn" :closable="false"
          >Архивирование не удаляет старые данные. Поле перестанет появляться в
          новых профилях после публикации изменений.</Message
        ><Button
          v-if="canManage && impactField?.lifecycle !== 'ARCHIVED'"
          label="Добавить архивирование в черновик"
          icon="pi pi-box"
          severity="danger"
          :disabled="!impact.canArchive"
          @click="archiveImpactedField"
      /></template>
    </Dialog>
  </section>
</template>

<style scoped>
.contract-page {
  display: flex;
  flex-direction: column;
  max-width: 1280px;
}
.content-slot {
  display: contents;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.header-actions :deep(.p-button-secondary.p-button-outlined) {
  border-color: var(--border-strong);
  background: var(--surface-card);
  color: var(--text-primary);
}
.section-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  margin: 14px 0 20px;
  padding: 5px;
  border-radius: 14px;
}
.section-nav a,
.section-nav button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 800;
}
.section-nav a.active {
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.setup-status {
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(520px, 1.15fr);
  align-items: center;
  gap: 24px;
  padding: 18px 20px;
  margin-bottom: 14px;
  overflow: hidden;
}
.setup-copy {
  display: flex;
  align-items: center;
  gap: 13px;
}
.setup-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.setup-copy strong,
.setup-copy p {
  display: block;
}
.setup-copy strong {
  font-size: 0.82rem;
}
.setup-copy p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.68rem;
}
.setup-status ol {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 1px;
  overflow: hidden;
  border-radius: 13px;
  background: var(--border-default);
  list-style: none;
}
.setup-status li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 11px;
  background: var(--surface-subtle);
}
.setup-status li > span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface-card);
  color: var(--muted);
  font: 700 0.66rem Manrope;
}
.setup-status li.done > span {
  background: var(--status-success-text);
  color: var(--status-success-soft);
}
.setup-status li strong,
.setup-status li small {
  display: block;
}
.setup-status li strong {
  font-size: 0.67rem;
}
.setup-status li small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.58rem;
}
.conflict-recovery {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.conflict-recovery div {
  display: grid;
  flex: 1 1 320px;
}
.health-evidence {
  padding: 20px;
  margin-bottom: 16px;
  scroll-margin-top: 24px;
}
.quality-area-heading {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  margin-top: 38px;
  padding-top: 28px;
  margin-bottom: 13px;
  border-top: 1px solid var(--border-strong);
}
.quality-area-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.quality-area-heading .quality-area-icon {
  display: grid;
}
.quality-area-heading span,
.quality-area-heading h2,
.quality-area-heading p {
  display: block;
}
.quality-area-heading > div > span {
  color: var(--muted);
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.quality-area-heading h2 {
  margin-top: 2px;
  font-size: 0.95rem;
}
.quality-area-heading p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 0.68rem;
}
.health-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 150px;
  align-items: center;
  gap: 13px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.health-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.health-header h2 {
  font-size: 1rem;
}
.health-header p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.7rem;
}
.fact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 15px;
}
.fact-grid > div {
  padding: 13px;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-subtle);
}
.fact-grid span,
.fact-grid strong,
.fact-grid small {
  display: block;
}
.fact-grid span {
  color: var(--muted);
  font-size: 0.62rem;
}
.fact-grid strong {
  margin-top: 5px;
  font: 700 1rem Manrope;
}
.fact-grid small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.58rem;
}
.age-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 14px;
  padding: 1px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--border-default);
}
.age-grid > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px;
  background: var(--surface-card);
}
.age-grid span {
  color: var(--muted);
  font-size: 0.62rem;
}
.age-grid strong {
  font-size: 0.72rem;
}
.raw-health {
  margin-top: 14px;
  border-top: 1px solid var(--border-subtle);
}
.raw-health summary {
  padding: 14px 0 0;
  cursor: pointer;
  color: var(--status-violet-text);
  font-size: 0.68rem;
  font-weight: 800;
}
.raw-health-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.health-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.health-columns section {
  display: grid;
  gap: 6px;
}
.health-columns code {
  white-space: pre-wrap;
}
.message-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.loading-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.metric {
  padding: 18px;
}
.metric span,
.metric strong,
.metric small {
  display: block;
}
.metric span {
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.metric strong {
  margin-top: 8px;
  font: 700 1.35rem Manrope;
}
.metric small {
  margin-top: 5px;
  color: var(--muted);
  font-size: 0.68rem;
}
.metric.ready {
  border-color: var(--status-success);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.toolbar > div {
  margin-right: auto;
}
.toolbar strong,
.toolbar span {
  display: block;
}
.toolbar span {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.68rem;
}
.field-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}
.validation-notice {
  margin: 12px 0;
}
.validation-notice :deep(.p-message-content),
.validation-notice :deep(.p-message-text) {
  width: 100%;
}
.validation-notice :deep(.p-message-text) {
  flex: 1 1 auto;
}
.notice-title {
  display: block;
  font-size: 0.71rem;
  font-weight: 600;
}
.validation-notice ul {
  display: grid;
  width: 100%;
  gap: 0;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.validation-notice li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 0;
  border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent);
}
.notice-copy {
  flex: 1 1 auto;
  min-width: 0;
}
.notice-copy strong,
.notice-copy small {
  display: block;
}
.notice-copy strong {
  font-size: 0.71rem;
  font-weight: 600;
}
.notice-copy small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 400;
  line-height: 1.45;
}
.validation-notice :deep(.p-button) {
  flex: 0 0 auto;
  padding-block: 5px;
}
.field-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 17px;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.field-card:hover {
  border-color: color-mix(
    in srgb,
    var(--status-violet) 26%,
    var(--border-default)
  );
  box-shadow: var(--shadow-raised);
}
.field-card.deprecated {
  border-color: var(--status-warning);
}
.field-card.archived {
  opacity: 0.65;
}
.field-type {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.field-title {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.field-title h2 {
  font-size: 0.84rem;
  font-weight: 700;
  margin: 0;
}
.field-title code {
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 500;
}
.field-title :deep(.p-tag) {
  padding: 3px 7px;
  font-size: 0.61rem;
  font-weight: 600;
}
.field-main p {
  margin: 7px 0;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 400;
  line-height: 1.45;
}
.policy-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.policy-list span {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--surface-subtle);
  font-size: 0.61rem;
  font-weight: 600;
}
.field-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}
.field-actions :deep(.p-button-label) {
  font-size: 0.66rem;
}
.workspace-footer {
  position: static;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 16px;
  margin-top: 18px;
  box-shadow: var(--shadow-raised);
}
.workspace-footer > div {
  margin-right: auto;
}
.workspace-footer strong,
.workspace-footer small {
  display: block;
}
.workspace-footer small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.66rem;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px;
  text-align: center;
  color: var(--muted);
}
.editor-form,
.publish-form,
.guide {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.editor-form > label,
.publish-form > label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.editor-form label > span,
.publish-form label > span {
  font-size: 0.68rem;
  font-weight: 700;
}
.label-with-help {
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
  width: fit-content;
}
.help-button {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--status-violet-text);
  cursor: help;
}
.help-button::after {
  position: absolute;
  z-index: 20;
  bottom: calc(100% + 8px);
  left: 50%;
  width: max-content;
  max-width: min(320px, calc(100vw - 48px));
  padding: 9px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-raised);
  color: var(--text-primary);
  content: attr(data-tooltip);
  font-size: var(--font-size-body-small);
  font-weight: 500;
  line-height: 1.4;
  opacity: 0;
  pointer-events: none;
  text-align: left;
  text-transform: none;
  transform: translate(-50%, 4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.help-button:hover::after,
.help-button:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.form-grid.triple {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.type-copy {
  color: var(--muted);
}
.policy-editor {
  padding: 14px;
}
.policy-editor h3 {
  margin: 0 0 12px;
  font-size: 0.78rem;
}
.allowed-values {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}
.allowed-values small {
  color: var(--muted);
  font-size: 0.62rem;
}
.toggle-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}
.toggle-grid label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px;
  background: var(--surface-card);
  border-radius: 10px;
}
.security-confirm {
  flex-direction: row !important;
  align-items: center;
  gap: 10px !important;
}
.guide pre {
  max-height: 360px;
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  font-size: 0.68rem;
}
.guide h3 {
  margin: 5px 0 0;
}
.history {
  display: grid;
  gap: 10px;
  padding: 0;
  list-style: none;
}
.history li {
  padding: 13px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.history li > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.history span,
.history code {
  color: var(--muted);
  font-size: 0.65rem;
}
.history p {
  margin: 7px 0;
  font-size: 0.75rem;
}
@media (max-width: 960px) {
  .setup-status {
    grid-template-columns: 1fr;
  }
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .fact-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .toggle-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
.empty-help {
  color: var(--status-violet-text);
  font-size: 0.7rem;
  font-weight: 800;
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.tool-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 15px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
button.tool-card {
  font: inherit;
}
.tool-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.tool-icon.ai {
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.tool-card strong,
.tool-card small {
  display: block;
}
.tool-card strong {
  font-size: 0.76rem;
}
.tool-card small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.64rem;
}
.tool-card > i {
  color: var(--muted);
  font-size: 0.7rem;
}
@media (max-width: 620px) {
  .header-actions,
  .header-actions :deep(.p-button) {
    width: 100%;
  }
  .section-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .section-nav a,
  .section-nav button {
    justify-content: center;
    min-width: 0;
  }
  .setup-status ol {
    grid-template-columns: 1fr;
  }
  .summary-grid,
  .loading-grid,
  .form-grid,
  .form-grid.triple,
  .fact-grid,
  .age-grid,
  .raw-health-grid,
  .tools-grid {
    grid-template-columns: 1fr;
  }
  .summary-grid .metric:last-child {
    grid-column: auto;
  }
  .health-header {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .health-header .p-select {
    grid-column: 1/-1;
  }
  .field-card {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .field-actions {
    grid-column: 2;
    flex-wrap: wrap;
  }
  .toolbar,
  .workspace-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .toolbar > div,
  .workspace-footer > div {
    margin-right: 0;
  }
  .workspace-footer {
    position: static;
  }
  .toggle-grid {
    grid-template-columns: 1fr;
  }
}
.impact-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.impact-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 11px;
}
.impact-list strong,
.impact-list code {
  display: block;
}
.impact-list code {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.62rem;
}
.impact-empty {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 11px;
  align-items: start;
  margin: 12px 0;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-subtle);
}
.impact-empty > i {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.impact-empty strong {
  font-size: 0.76rem;
  font-weight: 600;
}
.impact-empty p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 0.69rem;
  line-height: 1.45;
}
:global(.impact-dialog .p-message) {
  margin: 0 0 12px;
}
:global(.impact-dialog .p-button) {
  margin-top: 2px;
}
</style>
