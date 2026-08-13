<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@/features/auth/auth.store';
import { hasProjectPermission } from '@/features/auth/permission-access';
import { DocumentationCallout } from '@/features/documentation/ui';
import { attributeContractRepository } from '@/features/end-user-attributes/api/attribute-contract-repository';
import type { AttributePublicationFormCommand } from '@/features/end-user-attributes/model/publication-domain';
import AttributePublicationHistory from '@/features/end-user-attributes/ui/AttributePublicationHistory.vue';
import ContractRevisionHistory from '@/features/end-user-attributes/ui/ContractRevisionHistory.vue';
import PublishAttributeChangesDialog from '@/features/end-user-attributes/ui/PublishAttributeChangesDialog.vue';
import CodeBlock from '@/shared/ui/CodeBlock.vue';
import {
  createContractField,
  validateContractDocument,
} from '@/features/end-user-attributes/model/contract-domain';
import { type ContractIssuePresentation } from '@/features/end-user-attributes/model/contract-issue-presentation';
import { useContractIssuePresentation } from '@/features/end-user-attributes/model/use-contract-issue-presentation';
import {
  readDemoContractDraft,
  writeDemoContractDraft,
} from '@/features/end-user-attributes/model/demo-draft-storage';
import { repository } from '@/shared/api/repository';
import { ApiError } from '@/shared/api/http/api-error';
import { formatProfileContractMarkdown } from '@/shared/lib/data-contract-markdown';
import type {
  AttributeContractDraftResponseDto,
  AttributeContractDraftFieldDto,
  AttributeContractRevisionResponseDto,
  AttributeContractRevisionSummaryResponseDto,
  AttributeDefinitionImpactResponseDto,
  AttributeContractValidationResponseDto,
  AttributeContractWorkspaceResponseDto,
  AttributePublicationResponseDto,
  AttributePublicationSummaryResponseDto,
  ProfileHealthResponseDto,
} from '@/shared/api/generated/models';

const auth = useAuthStore();
const toast = useToast();
const router = useRouter();
const loading = ref(true);
const loaded = ref(false);
const saving = ref(false);
const validating = ref(false);
const publishing = ref(false);
const error = ref('');
const workspace = ref<AttributeContractWorkspaceResponseDto | null>(null);
const draftConflict = ref<{
  serverDraft: AttributeContractDraftResponseDto;
  localDocument: AttributeContractDraftResponseDto['document'];
} | null>(null);
const validation = ref<AttributeContractValidationResponseDto | null>(null);
const health = ref<ProfileHealthResponseDto | null>(null);
const publications = ref<AttributePublicationSummaryResponseDto[]>([]);
const revisions = ref<AttributeContractRevisionSummaryResponseDto[]>([]);
const selectedPublication = ref<AttributePublicationResponseDto | null>(null);
const selectedRevision = ref<AttributeContractRevisionResponseDto | null>(null);
const historyTab = ref<'publications' | 'contracts'>('publications');
const historyDetailLoading = ref(false);
const publishingVisible = ref(false);
const historyVisible = ref(false);
const impactVisible = ref(false);
const aiContextVisible = ref(false);
const impactLoading = ref(false);
const impact = ref<AttributeDefinitionImpactResponseDto | null>(null);
const impactField = ref<AttributeContractDraftFieldDto | null>(null);
const healthWindow = ref<'24h' | '7d' | '30d'>('7d');
const aiFormat = ref<'STRUCTURED_JSON' | 'COMPACT_TEXT'>('STRUCTURED_JSON');
const aiBudget = ref(2000);
const savedDraftSnapshot = ref('');

const canManage = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    'project.profile_contract.write',
  ),
);
const canManageAiContext = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    'project.profile_contract.publish',
  ),
);
const canPublishContract = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    'project.profile_contract.publish',
  ),
);
const fields = computed(() => workspace.value?.draft.document.fields ?? []);
const orderedFields = computed(() =>
  [...fields.value].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key)),
);
const profileContractFields = computed(() =>
  fields.value.filter((field) => field.lifecycle !== 'ARCHIVED'),
);
const localIssues = computed(() =>
  workspace.value ? validateContractDocument(workspace.value.draft.document) : [],
);
const issueInputs = computed(() => [...localIssues.value, ...(validation.value?.issues ?? [])]);
const { errors, warnings } = useContractIssuePresentation(issueInputs, fields);
const dirty = computed(() =>
  workspace.value
    ? contractDocumentSignature(workspace.value.draft.document) !==
      contractDocumentSignature(workspace.value.currentPublication?.document ?? { fields: [] })
    : false,
);
const hasUnsavedDraftEdits = computed(
  () =>
    Boolean(workspace.value) &&
    JSON.stringify(workspace.value?.draft.document) !== savedDraftSnapshot.value,
);
const publishReady = computed(
  () =>
    canManage.value &&
    canPublishContract.value &&
    dirty.value &&
    !hasUnsavedDraftEdits.value &&
    Boolean(validation.value?.valid) &&
    validation.value?.draftVersion === workspace.value?.draft.draftVersion &&
    !errors.value.length,
);
const publishedAiFields = computed(() =>
  (workspace.value?.currentPublication?.document.fields ?? []).filter(
    (field) => field.lifecycle !== 'ARCHIVED' && field.policies.aiRead,
  ),
);
const syntheticAiPreview = computed(() => {
  const valueFor = (type: string) =>
    type === 'BOOLEAN'
      ? true
      : type === 'INTEGER'
        ? 42
        : type === 'DECIMAL'
          ? '42.50'
          : type === 'DATE'
            ? '2026-07-19'
            : type === 'DATETIME'
              ? '2026-07-19T08:30:00Z'
              : type === 'COUNTRY_CODE'
                ? 'ES'
                : type === 'CURRENCY_CODE'
                  ? 'EUR'
                  : 'synthetic-value';
  const projection = Object.fromEntries(
    publishedAiFields.value.map((field) => [
      field.key,
      {
        value: valueFor(field.valueType),
        untrusted: true,
        classification: field.classification,
        purpose: field.purpose ?? 'not declared',
      },
    ]),
  );
  return aiFormat.value === 'STRUCTURED_JSON'
    ? JSON.stringify(projection, null, 2).slice(0, aiBudget.value)
    : publishedAiFields.value
        .map((field) => `${field.label}: ${String(valueFor(field.valueType))}`)
        .join(' · ')
        .slice(0, aiBudget.value);
});

const valueTypes = [
  { value: 'STRING', label: 'Текст' },
  { value: 'BOOLEAN', label: 'Да или нет' },
  { value: 'INTEGER', label: 'Целое число' },
  { value: 'DECIMAL', label: 'Десятичное число' },
  { value: 'DATETIME', label: 'Дата и время' },
  { value: 'DATE', label: 'Дата' },
  { value: 'COUNTRY_CODE', label: 'Страна' },
  { value: 'CURRENCY_CODE', label: 'Валюта' },
];
const lifecycleOptions = [
  { value: 'ACTIVE', label: 'Активно' },
  { value: 'DEPRECATED', label: 'Выводится из использования' },
];
const requirementOptions = [
  { value: 'OPTIONAL', label: 'Можно не передавать' },
  {
    value: 'REQUIRED_WARN',
    label: 'Желательно — предупреждать, если поля нет',
  },
  {
    value: 'REQUIRED_ENFORCED',
    label: 'Обязательно — отклонять профиль без поля',
  },
];
const classificationOptions = [
  { value: 'INTERNAL', label: 'Служебные данные' },
  { value: 'PERSONAL', label: 'Персональные данные' },
  { value: 'SENSITIVE', label: 'Чувствительные данные' },
];
const indexOptions = [
  { value: 'NONE', label: 'Не использовать для поиска' },
  { value: 'EXACT', label: 'Искать по точному значению' },
  { value: 'RANGE_SORT', label: 'Фильтровать и сортировать' },
];
const healthWindowOptions = [
  { value: '24h', label: '24 часа' },
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
];

onMounted(load);
onBeforeRouteLeave(() =>
  !hasUnsavedDraftEdits.value
    ? true
    : window.confirm('Покинуть страницу и потерять несохранённые изменения полей профиля?'),
);

function toDraftField(field: Record<string, unknown>): AttributeContractDraftFieldDto {
  return {
    definitionId: String(field.definitionId ?? field.id ?? ''),
    key: String(field.key ?? ''),
    label: String(field.label ?? ''),
    description: (field.description as string | null | undefined) ?? null,
    purpose: (field.purpose as string | null | undefined) ?? null,
    valueType: field.valueType as AttributeContractDraftFieldDto['valueType'],
    lifecycle: field.lifecycle as AttributeContractDraftFieldDto['lifecycle'],
    classification: field.classification as AttributeContractDraftFieldDto['classification'],
    requirement: field.requirement as AttributeContractDraftFieldDto['requirement'],
    position: Number(field.position ?? 0),
    constraints: (field.constraints as AttributeContractDraftFieldDto['constraints']) ?? {},
    policies: field.policies as AttributeContractDraftFieldDto['policies'],
    replacementDefinitionId: (field.replacementDefinitionId as string | null | undefined) ?? null,
    sunsetAt: (field.sunsetAt as string | null | undefined) ?? null,
    semanticRole: (field.semanticRole as AttributeContractDraftFieldDto['semanticRole']) ?? null,
  };
}

function demoWorkspace(): AttributeContractWorkspaceResponseDto {
  const projectId = auth.project?.id ?? 'demo';
  const base: AttributeContractDraftFieldDto = {
    ...createContractField(10),
    classification: 'INTERNAL',
  };
  const demoFields: AttributeContractDraftFieldDto[] = [
    {
      ...base,
      definitionId: 'attr-name',
      key: 'displayName',
      label: 'Отображаемое имя',
      purpose: 'Показывать имя пользователя в интерфейсе и сообщениях',
      semanticRole: 'DISPLAY_NAME',
      policies: { ...base.policies, clientRead: true, templateRead: true },
    },
    {
      ...base,
      definitionId: 'attr-tier',
      key: 'loyaltyTier',
      label: 'Уровень лояльности',
      purpose: 'Собирать сегменты и подставлять уровень в сообщения',
      constraints: { allowedValues: ['basic', 'silver', 'gold'] },
      policies: {
        ...base.policies,
        audienceRead: true,
        templateRead: true,
        indexPolicy: 'EXACT',
      },
      position: 20,
    },
    {
      ...base,
      definitionId: 'attr-balance',
      key: 'accountBalance',
      label: 'Баланс',
      valueType: 'DECIMAL',
      classification: 'SENSITIVE',
      purpose: 'Персонализация ответа о балансе',
      policies: {
        ...base.policies,
        cmsRead: { mode: 'VISIBLE', access: 'RESTRICTED' },
        aiRead: true,
      },
      position: 30,
    },
  ];
  const publishedFields = demoFields.map((field) => ({
    ...field,
    classification: field.classification ?? 'INTERNAL',
    definitionRevisionId: `${field.definitionId}-revision`,
    definitionRevisionNumber: 1,
  }));
  const publishedDocument = {
    fields: publishedFields.map((field) => toDraftField(field)),
  };
  const changes = {
    contractChanged: false,
    contractCompatibility: 'UNCHANGED' as const,
    lifecycleChanged: false,
    metadataChanged: false,
    policyChanged: false,
  };
  const compatibilityReport = {
    valid: true,
    issues: [],
    lifecycleImpacts: [],
    authorization: {
      readinessEvidenceId: null,
      securityConfirmations: [],
      breakingChangePlan: null,
      compatibilityGraceDays: 7,
    },
  };
  const publishedAt = new Date().toISOString();
  return {
    currentPublication: {
      id: 'demo-publication',
      projectId,
      sequence: 4,
      canonicalHash: 'demo-publication',
      validationHash: 'demo',
      contractRevisionId: 'demo-revision',
      contractVersion: 3,
      changes,
      compatibilityReport,
      publishedById: null,
      publishedActorType: 'SYSTEM',
      publishedActorId: 'demo',
      publishReason: 'Демонстрационная публикация',
      publishedAt,
      document: publishedDocument,
    },
    currentContractRevision: {
      id: 'demo-revision',
      projectId,
      version: 3,
      canonicalHash: 'demo',
      validationHash: 'demo',
      acceptances: [],
      compatibilityReport,
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      },
      fields: publishedFields,
      publishedAt,
      publishedById: null,
      publishReason: 'Демонстрационная версия',
    },
    changes,
    draft: {
      projectId,
      draftVersion: 3,
      basePublicationId: 'demo-publication',
      updatedById: null,
      document: readDemoContractDraft(projectId, publishedDocument),
    },
    validation: {
      valid: true,
      draftVersion: 3,
      validationHash: 'demo',
      issues: [],
      artifact: {
        fields: [],
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          properties: {},
          required: [],
        },
      },
      changes,
    },
  };
}

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  loading.value = true;
  loaded.value = false;
  error.value = '';
  try {
    if (repository.mode === 'mock') {
      workspace.value = demoWorkspace();
      validation.value = workspace.value.validation;
      const publication = workspace.value.currentPublication;
      const revision = workspace.value.currentContractRevision;
      publications.value = publication
        ? [
            {
              ...publication,
              fieldCount: publication.document.fields.length,
            },
          ]
        : [];
      revisions.value = revision ? [{ ...revision, fieldCount: revision.fields.length }] : [];
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
      const [nextWorkspace, nextHealth, publicationHistory, contractHistory] = await Promise.all([
        attributeContractRepository.workspace(projectId),
        attributeContractRepository.health(projectId, {
          window: healthWindow.value,
        }),
        attributeContractRepository.publications(projectId, { limit: 25 }),
        attributeContractRepository.revisions(projectId, { limit: 25 }),
      ]);
      workspace.value = nextWorkspace;
      validation.value = nextWorkspace.validation;
      health.value = nextHealth;
      publications.value = publicationHistory.items;
      revisions.value = contractHistory.items;
    }
    savedDraftSnapshot.value = JSON.stringify(workspace.value.draft.document);
    loaded.value = true;
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Не удалось загрузить настройки полей профиля';
  } finally {
    loading.value = false;
  }
}

async function loadHealth() {
  const projectId = auth.project?.id;
  if (!projectId || repository.mode === 'mock') return;
  try {
    health.value = await attributeContractRepository.health(projectId, {
      window: healthWindow.value,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Не удалось обновить показатели профилей пользователей';
  }
}

function openCreate() {
  void router.push('/profile-fields/new');
}

function openEdit(field: AttributeContractDraftFieldDto) {
  void router.push(`/profile-fields/${field.definitionId || field.key}`);
}

function removeDraftField(field: AttributeContractDraftFieldDto) {
  if (!workspace.value || isPublishedField(field)) return;
  workspace.value.draft.document.fields = fields.value.filter((item) => item !== field);
  validation.value = null;
}

async function saveDraft() {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value || !canManage.value) return;
  saving.value = true;
  error.value = '';
  try {
    if (repository.mode === 'mock') {
      writeDemoContractDraft(projectId, workspace.value.draft.document);
      workspace.value.draft.draftVersion += 1;
    } else
      workspace.value.draft = await attributeContractRepository.saveDraft(projectId, {
        expectedDraftVersion: workspace.value.draft.draftVersion,
        document: workspace.value.draft.document,
      });
    savedDraftSnapshot.value = JSON.stringify(workspace.value.draft.document);
    validation.value = null;
    toast.add({
      severity: 'success',
      summary: 'Черновик сохранён',
      detail: 'Изменения сохранены и готовы к проверке.',
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
          'Другой администратор уже изменил черновик. Скопируйте свою версию и вручную сравните изменения.';
      } catch {
        error.value =
          'Конфликт черновика. Локальные изменения сохранены в браузере; попробуйте загрузить серверную версию позже.';
      }
    } else
      error.value =
        cause instanceof Error
          ? cause.message
          : 'Не удалось сохранить черновик. Возможно, его уже изменил другой администратор.';
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
  error.value = '';
}

async function copyLocalConflict() {
  if (!draftConflict.value) return;
  await navigator.clipboard.writeText(JSON.stringify(draftConflict.value.localDocument, null, 2));
  toast.add({
    severity: 'success',
    summary: 'Локальный JSON скопирован',
    life: 2000,
  });
}

async function copyProfileContract() {
  const revision = workspace.value?.currentContractRevision;
  if (!workspace.value || !profileContractFields.value.length) return;
  const copiesDraft = !revision || dirty.value || hasUnsavedDraftEdits.value;
  try {
    await navigator.clipboard.writeText(
      formatProfileContractMarkdown({
        version: revision?.version,
        draft: copiesDraft,
        fields: profileContractFields.value,
      }),
    );
    toast.add({
      severity: 'success',
      summary: 'Поля профиля скопированы',
      detail: copiesDraft
        ? 'Таблица помечена как черновик: ключи, типы и обязательность готовы для сверки.'
        : `Версия ${revision.version}: ключи, типы и обязательность готовы для передачи команде.`,
      life: 2600,
    });
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Не удалось скопировать контракт',
      detail: 'Разрешите доступ к буферу обмена и повторите попытку.',
      life: 3200,
    });
  }
}

async function validateDraft() {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value) return;
  if (hasUnsavedDraftEdits.value) {
    error.value = 'Сначала сохраните изменения черновика, затем запустите проверку.';
    return;
  }
  if (localIssues.value.some((issue) => issue.severity === 'error')) return;
  validating.value = true;
  error.value = '';
  try {
    if (repository.mode === 'mock') validation.value = demoWorkspace().validation;
    else
      validation.value = await attributeContractRepository.validate(
        projectId,
        workspace.value.draft.draftVersion,
      );
    if (validation.value.valid)
      toast.add({
        severity: 'success',
        summary: 'Ошибок не найдено',
        detail: 'Черновик можно опубликовать.',
        life: 3000,
      });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось проверить контракт';
  } finally {
    validating.value = false;
  }
}

async function publish(command: AttributePublicationFormCommand) {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value || !validation.value || !publishReady.value) return;
  publishing.value = true;
  error.value = '';
  try {
    if (repository.mode === 'mock') {
      publishingVisible.value = false;
      toast.add({
        severity: 'success',
        summary: 'Изменения опубликованы',
        detail: workspace.value.changes.contractChanged
          ? 'Созданы новая публикация и новая версия контракта.'
          : 'Создана новая публикация. Версия контракта не изменилась.',
        life: 3500,
      });
      return;
    }
    const result = await attributeContractRepository.publish(projectId, {
      expectedCurrentPublicationId: workspace.value.currentPublication?.id ?? null,
      expectedDraftVersion: workspace.value.draft.draftVersion,
      validationHash: validation.value.validationHash,
      ...command,
    });
    publishingVisible.value = false;
    await load();
    toast.add({
      severity: 'success',
      summary: `Публикация #${result.publication.sequence} создана`,
      detail: result.changes.contractChanged
        ? `Создан контракт v${result.contractRevision.version}. Команде продукта нужно обновить известную версию.`
        : `Контракт v${result.contractRevision.version} не изменился. Обновлять backend продукта и профили не нужно.`,
      life: 3500,
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Сервер отклонил публикацию';
  } finally {
    publishing.value = false;
  }
}

async function selectPublication(publicationId: string) {
  const projectId = auth.project?.id;
  if (!projectId) return;
  historyDetailLoading.value = true;
  try {
    selectedPublication.value =
      repository.mode === 'mock'
        ? (workspace.value?.currentPublication ?? null)
        : await attributeContractRepository.publication(projectId, publicationId);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить публикацию';
  } finally {
    historyDetailLoading.value = false;
  }
}

async function selectRevision(revisionId: string) {
  const projectId = auth.project?.id;
  if (!projectId) return;
  historyDetailLoading.value = true;
  try {
    selectedRevision.value =
      repository.mode === 'mock'
        ? (workspace.value?.currentContractRevision ?? null)
        : await attributeContractRepository.revision(projectId, revisionId);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить контракт';
  } finally {
    historyDetailLoading.value = false;
  }
}

function typeHint(type: string) {
  return (
    {
      STRING: 'Подходит для имён, статусов и других коротких текстовых значений.',
      BOOLEAN: 'Выберите для признака с двумя значениями: да или нет.',
      INTEGER: 'Целое число без дробной части, например количество заказов.',
      DECIMAL: 'Точное число с дробной частью. Подходит для денег, балансов и рейтингов.',
      DATE: 'Календарная дата без времени, например дата рождения.',
      DATETIME: 'Точная дата и время события с часовым поясом.',
      COUNTRY_CODE: 'Страна в двухбуквенном формате, например ES или RU.',
      CURRENCY_CODE: 'Валюта в трёхбуквенном формате, например EUR или RUB.',
    }[type] ?? 'Выберите формат данных, которые будет передавать ваш продукт.'
  );
}

function optionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function valueTypeLabel(value: string) {
  return optionLabel(valueTypes, value);
}

function lifecycleLabel(value: string) {
  return value === 'ARCHIVED' ? 'В архиве' : optionLabel(lifecycleOptions, value);
}

function requirementLabel(value: string) {
  return optionLabel(requirementOptions, value);
}

function classificationLabel(value: string | undefined) {
  return value ? optionLabel(classificationOptions, value) : 'Служебные данные';
}

function indexPolicyLabel(value: string) {
  return optionLabel(indexOptions, value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
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

function contractDocumentSignature(document: AttributeContractDraftResponseDto['document']) {
  return canonicalSignature({
    fields: [...document.fields]
      .sort(
        (left, right) =>
          left.position - right.position ||
          left.key.localeCompare(right.key) ||
          (left.definitionId ?? '').localeCompare(right.definitionId ?? ''),
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
  if (!published) return 'draft' as const;
  const publishedDraft = toDraftField(published as unknown as Record<string, unknown>);
  return contractFieldSignature(field) === contractFieldSignature(publishedDraft)
    ? ('published' as const)
    : ('changed' as const);
}

function publishedFieldFor(field: AttributeContractDraftFieldDto) {
  return workspace.value?.currentPublication?.document.fields.find(
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
  if (issue.fieldIdentity) void router.push(`/profile-fields/${issue.fieldIdentity}`);
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
      repository.mode === 'mock'
        ? {
            canArchive: true,
            definition: {
              id: field.definitionId,
              key: field.key,
              status: field.lifecycle,
            },
            dependencies: [],
          }
        : await attributeContractRepository.impact(projectId, field.definitionId);
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'Не удалось проверить, где используется поле';
  } finally {
    impactLoading.value = false;
  }
}

function archiveImpactedField() {
  if (!workspace.value || !impact.value?.canArchive || !impactField.value) return;
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
    lifecycle: 'ARCHIVED',
  };
  validation.value = null;
  impactVisible.value = false;
  toast.add({
    severity: 'warn',
    summary: 'Архивирование добавлено в черновик',
    detail: 'Сохраните, проверьте и опубликуйте новую версию.',
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
          Задайте, какие данные о пользователе Retenive получает от вашего продукта и где их можно
          использовать.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Скопировать контракт"
          icon="pi pi-copy"
          severity="secondary"
          outlined
          :disabled="!profileContractFields.length"
          :title="
            profileContractFields.length
              ? 'Скопировать текущий набор полей, их типы и обязательность'
              : 'Сначала добавьте хотя бы одно поле'
          "
          aria-label="Скопировать поля профиля"
          @click="copyProfileContract"
        />
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
      >Вы можете просматривать поля. Для изменения и публикации нужны соответствующие разрешения
      проекта.</Message
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
            >Другой администратор сохранил более новый черновик. Сравните его со своими изменениями
            перед продолжением.</span
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
      <Skeleton v-for="item in 5" :key="item" height="120px" border-radius="18px" />
    </div>

    <template v-else-if="loaded && workspace">
      <section class="setup-status card">
        <div class="setup-copy">
          <span class="setup-icon"><i class="pi pi-list-check" /></span>
          <div>
            <strong>Как настроить профиль пользователя</strong>
            <p>Добавьте поля, опубликуйте изменения и передайте тестовый профиль.</p>
          </div>
        </div>
        <ol>
          <li :class="{ done: fields.length > 0 }">
            <span>1</span>
            <div><strong>Добавьте поля</strong><small>Что хранить о пользователе</small></div>
          </li>
          <li :class="{ done: Boolean(workspace.currentPublication) }">
            <span>2</span>
            <div>
              <strong>Опубликуйте структуру</strong><small>Чтобы она начала действовать</small>
            </div>
          </li>
          <li :class="{ done: Boolean(health?.lastSuccessfulSnapshotAt) }">
            <span>3</span>
            <div><strong>Передайте профиль</strong><small>И проверьте результат</small></div>
          </li>
        </ol>
      </section>

      <section class="summary-grid">
        <article class="metric card">
          <span>Текущая публикация</span
          ><strong>{{
            workspace.currentPublication
              ? `Публикация #${workspace.currentPublication.sequence}`
              : 'Ещё не опубликовано'
          }}</strong
          ><small>{{
            workspace.currentPublication
              ? `Настройки Retenive · контракт v${workspace.currentPublication.contractVersion}`
              : 'Сначала добавьте хотя бы одно поле'
          }}</small>
        </article>
        <article class="metric card">
          <span>Интеграционный контракт</span
          ><strong>{{
            workspace.currentContractRevision
              ? `Контракт v${workspace.currentContractRevision.version}`
              : 'Ещё не создан'
          }}</strong
          ><small>Версия меняется только вместе с producer-visible структурой.</small>
        </article>
        <article class="metric card">
          <span>Текущий черновик</span
          ><strong>{{
            hasUnsavedDraftEdits
              ? 'Есть несохранённые изменения'
              : dirty
                ? 'Есть неопубликованные изменения'
                : 'Все изменения опубликованы'
          }}</strong
          ><small>{{
            hasUnsavedDraftEdits
              ? 'Сохраните изменения, чтобы проверить и опубликовать их.'
              : dirty
                ? workspace.currentPublication
                  ? `Сохранённый черновик отличается от публикации #${workspace.currentPublication.sequence}.`
                  : 'Сохранённый черновик ещё не опубликован.'
                : workspace.currentPublication
                  ? `Совпадает с публикацией #${workspace.currentPublication.sequence}.`
                  : 'Изменений для публикации нет.'
          }}</small>
        </article>
        <article class="metric card">
          <span>Профили с данными</span
          ><strong>{{ health ? `${Math.round(health.coverage * 100)}%` : '—' }}</strong
          ><small>{{
            health
              ? `${health.usersWithSnapshot} из ${health.totalUsers} · ${healthWindowLabel(healthWindow)}`
              : 'Статистика пока недоступна'
          }}</small>
        </article>
      </section>

      <div id="fields" class="toolbar card">
        <div>
          <strong>Поля профиля</strong
          ><span>{{
            fields.length
              ? `${fields.length} ${fields.length === 1 ? 'поле' : 'полей'} в черновике`
              : 'Добавьте первое поле, например имя, город или уровень лояльности'
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
            <p>Здесь видно, приходят ли профили и насколько хорошо заполняются поля.</p>
          </div>
        </header>
        <section v-if="health" id="quality" class="health-evidence card">
          <header class="health-header">
            <span class="health-icon"><i class="pi pi-chart-bar" /></span>
            <div>
              <h2>Качество поступающих данных</h2>
              <p>Показывает, получает ли Retenive профили и какие проблемы встречаются.</p>
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
              <span>Получено обновлений</span><strong>{{ health.requestCount }}</strong
              ><small>За выбранный период</small>
            </div>
            <div>
              <span>Сессии с профилем</span><strong>{{ health.sessionRequestsWithSnapshot }}</strong
              ><small>Данные были доступны</small>
            </div>
            <div>
              <span>Сессии без профиля</span
              ><strong>{{ health.sessionRequestsWithoutSnapshot }}</strong
              ><small>Нужно проверить передачу</small>
            </div>
            <div>
              <span>Конфликты повторов</span><strong>{{ health.idempotencyConflicts }}</strong
              ><small>Одинаковые запросы</small>
            </div>
            <div>
              <span>Последнее обновление</span
              ><strong>{{
                health.lastSuccessfulSnapshotAt
                  ? new Date(health.lastSuccessfulSnapshotAt).toLocaleString('ru-RU')
                  : 'Ещё не было'
              }}</strong
              ><small>Успешно принято Retenive</small>
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
              ><strong>{{ health.profileAgeDistribution.from24HoursTo7Days }}</strong>
            </div>
            <div>
              <span>От 7 до 30 дней</span
              ><strong>{{ health.profileAgeDistribution.from7To30Days }}</strong>
            </div>
            <div>
              <span>Старше 30 дней</span
              ><strong>{{ health.profileAgeDistribution.over30Days }}</strong>
            </div>
          </div>
          <section v-if="health.fieldCoverage.length">
            <h3>Заполненность полей</h3>
            <div class="policy-list">
              <span v-for="field in health.fieldCoverage" :key="field.definitionId"
                >{{ field.key }} · {{ Math.round(field.coverage * 100) }}%</span
              >
            </div>
          </section>
          <Message v-if="health.oldContractIntegrations.length" severity="warn" :closable="false"
            >{{ health.oldContractIntegrations.length }} подключений всё ещё используют старую
            версию полей. Обновите их перед публикацией.</Message
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

      <Message v-if="errors.length" class="validation-notice" severity="error" :closable="false">
        <span class="notice-title">Публикация недоступна: исправьте ошибки</span>
        <ul>
          <li v-for="issue in errors" :key="issue.key">
            <span class="notice-copy">
              <strong>{{ issue.title }}</strong>
              <small v-if="issue.detail">{{ issue.detail }}</small>
              <small
                >Код: <code>{{ issue.code }}</code></small
              >
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
      <Message v-if="warnings.length" class="validation-notice" severity="warn" :closable="false">
        <span class="notice-title">Что проверить перед публикацией</span>
        <ul>
          <li v-for="issue in warnings" :key="issue.key">
            <span class="notice-copy">
              <strong>{{ issue.title }}</strong>
              <small>{{ issue.detail }}</small>
              <small
                >Код: <code>{{ issue.code }}</code></small
              >
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
                    : field.valueType === 'DECIMAL' || field.valueType === 'INTEGER'
                      ? 'pi pi-hashtag'
                      : 'pi pi-align-left'
              "
            />
          </div>
          <div class="field-main">
            <div class="field-title">
              <h2>{{ field.label || 'Без названия' }}</h2>
              <code>{{ field.key || 'new_key' }}</code
              ><Tag :value="valueTypeLabel(field.valueType)" severity="secondary" /><Tag
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
              ><span v-if="field.policies.cmsRead.mode === 'VISIBLE'">Карточка пользователя</span
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
          Например, имя, город или уровень программы лояльности. Затем опубликуйте структуру и
          передайте тестовый профиль.
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
              ><small>Пошагово подключите сервер и отправьте тестовый профиль.</small></span
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
              ><small>Проверьте, какие опубликованные поля доступны функциям с ИИ.</small></span
            >
            <i class="pi pi-arrow-right" />
          </button>
        </section>
      </Teleport>

      <footer v-if="canManage" class="workspace-footer card">
        <div>
          <strong>{{
            !dirty
              ? 'Все изменения опубликованы'
              : errors.length
                ? 'Исправьте ошибки, чтобы опубликовать'
                : validation?.valid && !hasUnsavedDraftEdits
                  ? 'Черновик проверен — можно публиковать'
                  : hasUnsavedDraftEdits
                    ? 'Сохраните изменения, чтобы продолжить'
                    : 'Проверьте черновик перед публикацией'
          }}</strong
          ><small>{{
            dirty
              ? validation?.changes.contractChanged
                ? 'Публикация создаст новую версию интеграционного контракта.'
                : 'Настройки Retenive изменятся без новой версии контракта.'
              : 'Текущая публикация уже используется Retenive.'
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
          v-if="canPublishContract"
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
        /><Message v-else severity="info" :closable="false"
          >У вас нет права публиковать контракт.</Message
        >
      </footer>
      <div id="profile-quality-slot" class="content-slot" />
      <div id="profile-tools-slot" class="content-slot" />
    </template>

    <PublishAttributeChangesDialog
      v-if="validation"
      v-model:visible="publishingVisible"
      :can-confirm-security="canManageAiContext"
      :changes="validation.changes"
      :issues="validation.issues"
      :publishing="publishing"
      @publish="publish"
    />

    <Dialog
      v-model:visible="aiContextVisible"
      modal
      header="Какие данные доступны функциям с ИИ"
      :style="{ width: 'min(780px, calc(100vw - 24px))' }"
    >
      <div class="guide">
        <Message severity="warn" :closable="false"
          >В примере используются вымышленные значения. Данные профиля всегда считаются
          пользовательскими данными, а не инструкциями для ИИ.</Message
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
          Здесь показаны только опубликованные поля, для которых разрешено использование функциями с
          ИИ. Изменение доступа начнёт действовать после проверки и публикации.
        </p>
        <div v-if="publishedAiFields.length" class="policy-list">
          <span v-for="field in publishedAiFields" :key="field.definitionId ?? field.key"
            >{{ field.label }} · {{ field.classification }}</span
          >
        </div>
        <div v-else class="empty">В опубликованной версии нет полей, доступных функциям с ИИ.</div>
        <CodeBlock
          title="Пример данных для ИИ"
          :language="aiFormat === 'STRUCTURED_JSON' ? 'JSON' : 'Текст'"
          :code="syntheticAiPreview || '{}'"
        />
      </div>
    </Dialog>

    <Dialog
      v-model:visible="historyVisible"
      modal
      header="История изменений полей"
      :style="{ width: 'min(860px, calc(100vw - 24px))' }"
    >
      <div class="history-tabs" role="tablist" aria-label="Тип истории">
        <button
          id="publication-history-tab"
          type="button"
          role="tab"
          :aria-selected="historyTab === 'publications'"
          aria-controls="publication-history-panel"
          @click="historyTab = 'publications'"
        >
          Публикации
        </button>
        <button
          id="contract-history-tab"
          type="button"
          role="tab"
          :aria-selected="historyTab === 'contracts'"
          aria-controls="contract-history-panel"
          @click="historyTab = 'contracts'"
        >
          Версии контракта
        </button>
      </div>
      <div v-if="historyDetailLoading" class="history-loading">
        <Skeleton height="6rem" />
      </div>
      <div
        v-show="historyTab === 'publications'"
        id="publication-history-panel"
        role="tabpanel"
        aria-labelledby="publication-history-tab"
      >
        <AttributePublicationHistory
          :items="publications"
          :selected="selectedPublication"
          @select="selectPublication"
        />
      </div>
      <div
        v-show="historyTab === 'contracts'"
        id="contract-history-panel"
        role="tabpanel"
        aria-labelledby="contract-history-tab"
      >
        <ContractRevisionHistory
          :items="revisions"
          :selected="selectedRevision"
          @select="selectRevision"
        />
      </div>
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
        ><Message :severity="impact.canArchive ? 'info' : 'warn'" :closable="false">{{
          impact.canArchive
            ? 'Поле можно архивировать после проверки связанных разделов.'
            : 'Архивирование заблокировано активными зависимостями.'
        }}</Message>
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
              Поле не используется в активных сегментах, шаблонах или других настройках Retenive.
            </p>
          </div>
        </div>
        <Message severity="warn" :closable="false"
          >Архивирование не удаляет старые данные. Поле перестанет появляться в новых профилях после
          публикации изменений.</Message
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
.history-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.25rem;
  border-radius: 12px;
  background: var(--p-content-hover-background);
}
.history-tabs button {
  min-height: 44px;
  padding: 0.6rem 0.9rem;
  border: 0;
  border-radius: 9px;
  color: var(--p-text-muted-color);
  background: transparent;
  cursor: pointer;
}
.history-tabs button[aria-selected='true'] {
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
}
.history-tabs button:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}
.history-loading {
  margin-bottom: 1rem;
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
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
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
  font: 700 0.66rem var(--font-display);
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
  font: 700 1rem var(--font-display);
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
  color: var(--status-accent-text);
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
  font: 700 1.35rem var(--font-display);
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
  border-color: color-mix(in srgb, var(--status-accent) 26%, var(--border-default));
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
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
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
.guide {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
}
.empty-help {
  color: var(--status-accent-text);
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
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
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
