<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
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
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import {
  createContractField,
  parseAllowedValues,
  validateContractDocument,
} from "@/features/end-user-attributes/model/contract-domain";
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
const errors = computed(() => [
  ...localIssues.value.filter((issue) => issue.severity === "error"),
  ...(validation.value?.issues.filter((issue) => issue.severity === "ERROR") ??
    []),
]);
const warnings = computed(() => [
  ...localIssues.value.filter((issue) => issue.severity === "warning"),
  ...(validation.value?.issues.filter((issue) => issue.severity !== "ERROR") ??
    []),
]);
const dirty = computed(() =>
  workspace.value
    ? JSON.stringify(workspace.value.draft.document) !==
      JSON.stringify(
        workspace.value.currentRevision?.fields.map(toDraftField)
          ? {
              fields: workspace.value.currentRevision?.fields.map(toDraftField),
            }
          : { fields: [] },
      )
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
  "STRING",
  "BOOLEAN",
  "INTEGER",
  "DECIMAL",
  "DATETIME",
  "DATE",
  "COUNTRY_CODE",
  "CURRENCY_CODE",
].map((value) => ({ value, label: value }));
const lifecycleOptions = [
  { value: "ACTIVE", label: "Активно" },
  { value: "DEPRECATED", label: "Deprecated" },
];
const requirementOptions = [
  { value: "OPTIONAL", label: "Необязательно" },
  { value: "REQUIRED_WARN", label: "Обязательно, warning" },
  { value: "REQUIRED_ENFORCED", label: "Обязательно, reject" },
];
const classificationOptions = ["INTERNAL", "PERSONAL", "SENSITIVE"].map(
  (value) => ({ value, label: value }),
);
const indexOptions = ["NONE", "EXACT", "RANGE_SORT"].map((value) => ({
  value,
  label: value,
}));
const semanticRoleOptions = [
  "DISPLAY_NAME",
  "EMAIL",
  "COUNTRY",
  "CURRENCY",
].map((value) => ({ value, label: value }));

onMounted(load);
onBeforeRouteLeave(() =>
  !hasUnsavedDraftEdits.value
    ? true
    : window.confirm(
        "Покинуть Contract Workspace и потерять несохранённые изменения?",
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
  const base = createContractField(10);
  const demoFields: AttributeContractDraftFieldDto[] = [
    {
      ...base,
      definitionId: "attr-name",
      key: "displayName",
      label: "Отображаемое имя",
      semanticRole: "DISPLAY_NAME",
      policies: { ...base.policies, clientRead: true, templateRead: true },
    },
    {
      ...base,
      definitionId: "attr-tier",
      key: "loyaltyTier",
      label: "Уровень лояльности",
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
  return {
    currentRevision: null,
    draft: {
      projectId: auth.project?.id ?? "demo",
      draftVersion: 3,
      baseContractRevisionId: null,
      updatedById: null,
      document: { fields: demoFields },
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
        : "Не удалось загрузить Contract Workspace";
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
        : "Не удалось обновить метрики Current Profile";
  }
}

function openCreate() {
  const position =
    Math.max(0, ...fields.value.map((item) => item.position)) + 10;
  editingIndex.value = null;
  form.value = createContractField(position);
  allowedValuesInput.value = "";
  fieldFormError.value = "";
  editorVisible.value = true;
}

function openEdit(field: AttributeContractDraftFieldDto) {
  editingIndex.value = fields.value.indexOf(field);
  form.value = structuredClone(field);
  allowedValuesInput.value = (field.constraints.allowedValues ?? [])
    .map(String)
    .join("\n");
  fieldFormError.value = "";
  editorVisible.value = true;
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
      cause instanceof Error ? cause.message : "Проверьте allowed values.";
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
  if (!workspace.value || field.definitionId) return;
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
      detail: `Версия черновика ${workspace.value.draft.draftVersion}`,
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
          "Черновик изменён другим администратором. Локальная версия сохранена ниже для явного reconciliation.";
      } catch {
        error.value =
          "Конфликт черновика. Локальные изменения сохранены в браузере; повторите загрузку server draft позже.";
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
        summary: "Контракт валиден",
        detail: "Artifact и validation hash готовы к публикации.",
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
        detail:
          "Pinned consumers продолжат использовать прежние immutable revisions.",
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
      summary: "Контракт опубликован",
      detail: "Создана новая immutable revision.",
      life: 3500,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Публикация отклонена backend";
  } finally {
    publishing.value = false;
  }
}

function typeHint(type: string) {
  return (
    {
      DECIMAL: "Точная строка decimal; не преобразуется в JS number.",
      DATE: "Календарная дата YYYY-MM-DD без timezone shift.",
      DATETIME: "RFC 3339 instant.",
      COUNTRY_CODE: "ISO 3166-1 alpha-2.",
      CURRENCY_CODE: "ISO 4217.",
    }[type] ?? type
  );
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
      cause instanceof Error ? cause.message : "Не удалось загрузить impact";
  } finally {
    impactLoading.value = false;
  }
}

function archiveImpactedField() {
  if (!workspace.value || !impact.value?.canArchive || !impactField.value)
    return;
  if (
    !window.confirm(
      `Архивировать «${impactField.value.label}» в следующей Contract revision? Поле исчезнет из новых projections; существующие snapshots и pinned revisions сохранят историческую семантику.`,
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
    detail: "Сохраните, проверьте и опубликуйте новую Contract revision.",
    life: 3500,
  });
}
</script>

<template>
  <section class="page contract-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">End User Attribute Platform</div>
        <h1>Contract Workspace</h1>
        <p class="subtitle">
          Черновик, совместимость, политики потребителей и immutable публикации
          Current Profile.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Integration guide"
          icon="pi pi-code"
          severity="secondary"
          outlined
          @click="integrationVisible = true"
        /><Button
          v-if="canManageAiContext"
          label="AI Context"
          icon="pi pi-sparkles"
          severity="secondary"
          outlined
          @click="aiContextVisible = true"
        /><Button
          label="История"
          icon="pi pi-history"
          severity="secondary"
          text
          @click="historyVisible = true"
        />
      </div>
    </header>

    <Message v-if="!canManage" severity="info" :closable="false"
      >Режим просмотра. Менять и публиковать контракт могут OWNER и
      ADMIN.</Message
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
            >Server draft {{ draftConflict.serverDraft.draftVersion }} и
            локальный документ не объединяются автоматически.</span
          >
        </div>
        <Button
          label="Скопировать локальный JSON"
          severity="secondary"
          text
          @click="copyLocalConflict"
        />
        <Button
          label="Принять server draft"
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
      <section class="summary-grid">
        <article class="metric card">
          <span>Опубликовано</span
          ><strong>{{
            workspace.currentRevision
              ? `v${workspace.currentRevision.version}`
              : "Ещё нет"
          }}</strong
          ><small>{{
            workspace.currentRevision?.canonicalHash?.slice(0, 12) ??
            "Первый publish создаст revision"
          }}</small>
        </article>
        <article class="metric card">
          <span>Черновик</span
          ><strong>draft {{ workspace.draft.draftVersion }}</strong
          ><small>{{
            dirty ? "Есть изменения относительно head" : "Синхронизирован"
          }}</small>
        </article>
        <article class="metric card">
          <span>Profile coverage · {{ healthWindow }}</span
          ><strong>{{
            health ? `${Math.round(health.coverage * 100)}%` : "—"
          }}</strong
          ><small>{{
            health
              ? `${health.usersWithSnapshot} из ${health.totalUsers} пользователей`
              : "Health недоступен"
          }}</small>
        </article>
        <article
          class="metric card"
          :class="{ ready: health?.readiness.ready }"
        >
          <span>Readiness</span
          ><strong>{{
            health?.readiness.ready ? "Готово" : "Нужны действия"
          }}</strong
          ><small
            >{{ health?.readiness.oldContractIntegrationCount ?? 0 }} legacy
            integrations</small
          >
        </article>
      </section>

      <div class="toolbar card">
        <div>
          <strong>{{ fields.length }} полей</strong
          ><span>До 50 определений · порядок задаётся position</span>
        </div>
        <Select
          v-model="healthWindow"
          :options="['24h', '7d', '30d']"
          aria-label="Окно Profile Health"
          @change="loadHealth"
        />
        <Button
          v-if="canManage"
          label="Добавить поле"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </div>

      <details v-if="health" class="health-evidence card">
        <summary>Profile Health evidence · {{ healthWindow }}</summary>
        <div class="fact-grid">
          <div>
            <span>Requests</span><strong>{{ health.requestCount }}</strong>
          </div>
          <div>
            <span>Accepted with snapshot</span
            ><strong>{{ health.sessionRequestsWithSnapshot }}</strong>
          </div>
          <div>
            <span>Without snapshot</span
            ><strong>{{ health.sessionRequestsWithoutSnapshot }}</strong>
          </div>
          <div>
            <span>Idempotency conflicts</span
            ><strong>{{ health.idempotencyConflicts }}</strong>
          </div>
          <div>
            <span>Last accepted</span
            ><strong>{{
              health.lastSuccessfulSnapshotAt
                ? new Date(health.lastSuccessfulSnapshotAt).toLocaleString(
                    "ru-RU",
                  )
                : "—"
            }}</strong>
          </div>
          <div>
            <span>Pending cleanup</span
            ><strong>{{ health.readiness.pendingCleanupRequests }}</strong>
          </div>
        </div>
        <div class="health-columns">
          <section>
            <h3>Outcomes</h3>
            <code>{{ JSON.stringify(health.outcomes, null, 2) }}</code>
          </section>
          <section>
            <h3>Invalid reasons</h3>
            <code>{{ JSON.stringify(health.invalidReasons, null, 2) }}</code>
          </section>
          <section>
            <h3>Profile age</h3>
            <code>{{
              JSON.stringify(health.profileAgeDistribution, null, 2)
            }}</code>
          </section>
        </div>
        <section v-if="health.fieldCoverage.length">
          <h3>Field coverage</h3>
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
          >{{ health.oldContractIntegrations.length }} integration credentials
          всё ещё используют старую Contract revision.</Message
        >
      </details>

      <Message v-if="errors.length" severity="error" :closable="false"
        ><strong>{{ errors.length }} ошибок блокируют публикацию.</strong>
        <ul>
          <li
            v-for="issue in errors"
            :key="`${issue.code}:${'path' in issue ? issue.path : issue.field}`"
          >
            {{ issue.message }}
          </li>
        </ul></Message
      >
      <Message v-if="warnings.length" severity="warn" :closable="false"
        ><strong
          >{{ warnings.length }} предупреждений совместимости или
          безопасности.</strong
        >
        <ul>
          <li v-for="issue in warnings" :key="`${issue.code}:${issue.message}`">
            {{ issue.message }}
          </li>
        </ul></Message
      >

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
              ><Tag :value="field.valueType" severity="secondary" /><Tag
                :value="field.lifecycle"
                :severity="
                  field.lifecycle === 'ACTIVE'
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
                field.requirement
              }}</span
              ><span v-if="field.policies.audienceRead">Audience</span
              ><span v-if="field.policies.templateRead">Templates</span
              ><span v-if="field.policies.aiRead"
                >AI · {{ field.purpose || "цель не задана" }}</span
              ><span v-if="field.policies.clientRead">Browser</span
              ><span v-if="field.policies.exportRead">Export</span
              ><span>{{ field.classification }}</span
              ><span>{{ field.policies.indexPolicy }}</span>
            </div>
          </div>
          <div class="field-actions">
            <Button
              v-if="field.definitionId"
              icon="pi pi-share-alt"
              severity="secondary"
              text
              rounded
              :aria-label="`Impact ${field.label}`"
              @click="openImpact(field)"
            /><Button
              v-if="canManage"
              icon="pi pi-pencil"
              severity="secondary"
              text
              rounded
              :aria-label="`Изменить ${field.label}`"
              @click="openEdit(field)"
            /><Button
              v-if="canManage && !field.definitionId"
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
        <i class="pi pi-id-card" /><strong>Контракт пока пуст</strong>
        <p>
          Это реальное пустое состояние после успешной загрузки. Добавьте первое
          поле Current Profile.
        </p>
        <Button v-if="canManage" label="Добавить поле" @click="openCreate" />
      </div>

      <footer v-if="canManage" class="workspace-footer card">
        <div>
          <strong>{{
            validation?.valid && !hasUnsavedDraftEdits
              ? "Проверка пройдена"
              : "Сначала сохраните и проверьте черновик"
          }}</strong
          ><small
            >Publish принимает только validation hash текущей
            draftVersion.</small
          >
        </div>
        <Button
          label="Сохранить черновик"
          severity="secondary"
          outlined
          :loading="saving"
          @click="saveDraft"
        /><Button
          label="Проверить"
          icon="pi pi-check-circle"
          severity="secondary"
          :disabled="hasUnsavedDraftEdits"
          :loading="validating"
          @click="validateDraft"
        /><Button
          label="Опубликовать"
          icon="pi pi-send"
          :disabled="
            hasUnsavedDraftEdits ||
            !validation?.valid ||
            validation.draftVersion !== workspace.draft.draftVersion
          "
          @click="publishingVisible = true"
        />
      </footer>
    </template>

    <Dialog
      v-model:visible="editorVisible"
      modal
      :header="
        editingIndex === null ? 'Новое поле Current Profile' : 'Изменить поле'
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
              :disabled="Boolean(form.definitionId)"
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
              :disabled="Boolean(form.definitionId)" /></label
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
            ><span>Semantic role</span
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
          ><span>Purpose / legal use</span
          ><Textarea
            v-model="form.purpose"
            rows="2"
            auto-resize
            maxlength="500"
            placeholder="Обязательно при AI read"
        /></label>
        <section class="policy-editor surface-soft">
          <h3>Политики потребителей</h3>
          <div class="toggle-grid">
            <label
              ><span>Admin read</span
              ><ToggleSwitch v-model="form.policies.adminRead" /></label
            ><label
              ><span>Audience</span
              ><ToggleSwitch v-model="form.policies.audienceRead" /></label
            ><label
              ><span>Templates</span
              ><ToggleSwitch v-model="form.policies.templateRead" /></label
            ><label
              ><span>AI read</span
              ><ToggleSwitch v-model="form.policies.aiRead" /></label
            ><label
              ><span>Browser</span
              ><ToggleSwitch v-model="form.policies.clientRead" /></label
            ><label
              ><span>Export</span
              ><ToggleSwitch v-model="form.policies.exportRead" /></label
            ><label
              ><span>Index</span
              ><Select
                v-model="form.policies.indexPolicy"
                :options="indexOptions"
                option-label="label"
                option-value="value"
            /></label>
          </div>
          <label class="allowed-values"
            ><span>Allowed values · по одному в строке</span
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
              >DECIMAL сохраняется точной строкой; INTEGER и BOOLEAN проверяются
              до отправки на backend.</small
            ></label
          >
        </section>
        <section class="policy-editor surface-soft">
          <h3>Ограничения</h3>
          <div class="form-grid triple">
            <label
              ><span>Min length</span
              ><InputNumber
                v-model="form.constraints.minLength"
                :min="0" /></label
            ><label
              ><span>Max length</span
              ><InputNumber
                v-model="form.constraints.maxLength"
                :min="0" /></label
            ><label
              ><span>Precision</span
              ><InputNumber
                v-model="form.constraints.precision"
                :min="1"
                :max="38" /></label
            ><label
              ><span>Scale</span
              ><InputNumber
                v-model="form.constraints.scale"
                :min="0"
                :max="38" /></label
            ><label
              ><span>Minimum</span
              ><InputText
                :model-value="String(form.constraints.minimum ?? '')"
                @update:model-value="
                  form.constraints.minimum = $event || undefined
                " /></label
            ><label
              ><span>Maximum</span
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
            ><span>Replacement definition ID</span
            ><InputText
              v-model="form.replacementDefinitionId"
              class="mono" /></label
          ><label
            ><span>Sunset RFC 3339</span
            ><InputText
              v-model="form.sunsetAt"
              placeholder="2026-12-31T00:00:00Z"
          /></label>
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
      header="Опубликовать immutable revision"
      :style="{ width: 'min(650px, calc(100vw - 24px))' }"
    >
      <div class="publish-form">
        <Message severity="warn" :closable="false"
          >Публикация не переписывает snapshots и pinned consumers. Breaking
          changes требуют плана и readiness evidence.</Message
        ><label
          ><span>Причина изменения *</span
          ><Textarea
            v-model="publishForm.reason"
            rows="3"
            maxlength="1000" /></label
        ><label
          ><span>Compatibility grace, дней</span
          ><InputNumber
            v-model="publishForm.graceDays"
            :min="0"
            :max="30" /></label
        ><label
          ><span>План breaking change</span
          ><Textarea
            v-model="publishForm.breakingChangePlan"
            rows="3"
            maxlength="2000" /></label
        ><label
          ><span>Readiness evidence ID</span
          ><InputText
            v-model="publishForm.readinessEvidenceId"
            class="mono"
          /><small v-if="requiresReadinessEvidence"
            >Обязательно: контракт изменяет режим обязательности поля.</small
          ></label
        ><label class="security-confirm"
          ><ToggleSwitch v-model="publishForm.confirmSecurity" /><span
            >Я проверил доступы sensitive/client/template/audience/export/AI и
            последствия публикации.<template
              v-if="requiresSecurityConfirmation"
            >
              Подтверждение обязательно для изменения exposure или
              classification.</template
            ></span
          ></label
        >
        <Message
          v-if="requiresSecurityConfirmation && !canManageAiContext"
          severity="error"
          :closable="false"
          >Новый sensitive exposure может подтвердить и опубликовать только
          OWNER.</Message
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
      header="AI Context · bounded projection"
      :style="{ width: 'min(780px, calc(100vw - 24px))' }"
    >
      <div class="guide">
        <Message severity="warn" :closable="false"
          >Preview полностью синтетический. Значения Current Profile считаются
          untrusted data и не становятся инструкциями для модели.</Message
        >
        <div class="form-grid">
          <label
            ><span>Формат</span
            ><Select
              v-model="aiFormat"
              :options="[
                { value: 'STRUCTURED_JSON', label: 'Structured JSON' },
                { value: 'COMPACT_TEXT', label: 'Compact text' },
              ]"
              option-label="label"
              option-value="value" /></label
          ><label
            ><span>Максимальный размер, символов</span
            ><InputNumber v-model="aiBudget" :min="256" :max="12000"
          /></label>
        </div>
        <p>
          Используется только опубликованная Contract revision и поля с
          <code>aiRead=true</code>. Изменение policy проходит обычную
          validation, security review и immutable publish.
        </p>
        <div v-if="publishedAiFields.length" class="policy-list">
          <span
            v-for="field in publishedAiFields"
            :key="field.definitionRevisionId"
            >{{ field.label }} · {{ field.classification }}</span
          >
        </div>
        <div v-else class="empty">
          В опубликованном контракте AI Context выключен.
        </div>
        <pre><code>{{ syntheticAiPreview || "{}" }}</code></pre>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="integrationVisible"
      modal
      header="Integration guide"
      :style="{ width: 'min(820px, calc(100vw - 24px))' }"
    >
      <div class="guide">
        <p>
          Product backend передаёт полный snapshot. Integration scope:
          <code>profile:snapshot:write</code>. Более высокий sourceSequence не
          может быть перезаписан старым; повтор той же операции идемпотентен.
        </p>
        <h3>Прямой sync · PUT /api/v1/end-user-profile-snapshots</h3>
        <pre><code>curl -X PUT "$LOLA_URL/api/v1/end-user-profile-snapshots" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{
  "externalUserId": "user-123",
  "contractRevision": {{ workspace?.currentRevision?.version ?? 1 }},
  "observedAt": "2026-07-19T08:30:00Z",
  "sourceSequence": "42",
  "attributes": { "displayName": "Ada", "loyaltyTier": "gold" }
}'</code></pre>
        <h3>Atomic session snapshot · POST /api/v1/interaction-sessions</h3>
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
        <h3>Сгенерированный JSON Schema</h3>
        <pre><code>{{ schemaJson }}</code></pre>
        <Message severity="info" :closable="false"
          >DECIMAL передавайте строкой, DATE — YYYY-MM-DD, DATETIME — RFC 3339.
          Полный snapshot заменяет предыдущее состояние. Backend проверяет
          additionalProperties=false, contract revision, порядок sourceSequence
          и защищает от downgrade.</Message
        >
      </div>
    </Dialog>

    <Dialog
      v-model:visible="historyVisible"
      modal
      header="История Contract revisions"
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
      header="Impact / used by"
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
              ? "Backend разрешает архивирование после review зависимостей."
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
        <div v-else class="empty">
          Backend не нашёл потребителей этого definition.
        </div>
        <Message severity="warn" :closable="false"
          >Архивирование не удаляет старые snapshots или immutable revisions.
          Для новых projections поле станет недоступно после публикации Contract
          revision.</Message
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
  max-width: 1320px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
  margin-bottom: 14px;
}
.health-evidence summary {
  cursor: pointer;
  font-weight: 800;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
.field-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 16px;
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
  font-size: 0.9rem;
  margin: 0;
}
.field-title code {
  color: var(--muted);
  font-size: 0.68rem;
}
.field-main p {
  margin: 7px 0;
  color: var(--muted);
  font-size: 0.73rem;
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
  font-size: 0.57rem;
  font-weight: 700;
}
.field-actions {
  display: flex;
}
.workspace-footer {
  position: sticky;
  bottom: 12px;
  z-index: 5;
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
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .toggle-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 620px) {
  .summary-grid,
  .loading-grid,
  .form-grid,
  .form-grid.triple {
    grid-template-columns: 1fr;
  }
  .field-card {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .field-actions {
    grid-column: 2;
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
</style>
