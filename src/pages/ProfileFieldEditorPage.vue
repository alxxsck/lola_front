<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/features/auth/auth.store";
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import {
  createContractField,
  fieldNeedsPurpose,
  parseAllowedValues,
  validateContractDocument,
} from "@/features/end-user-attributes/model/contract-domain";
import {
  applyProfileFieldPreset,
  profileFieldPreset,
  profileFieldPresets,
  type PresetSuggestedIdentity,
  type ProfileFieldKind,
} from "@/features/end-user-attributes/model/profile-field-presets";
import {
  readDemoContractDraft,
  writeDemoContractDraft,
} from "@/features/end-user-attributes/model/demo-draft-storage";
import { repository } from "@/shared/api/repository";
import type {
  AttributeContractDraftFieldDto,
  AttributeContractWorkspaceResponseDto,
} from "@/shared/api/generated/models";
import { canonicalLocale, localeDisplayName } from "@/shared/lib/locale";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string>>({});
const workspace = ref<AttributeContractWorkspaceResponseDto | null>(null);
const editingIndex = ref<number | null>(null);
const form = ref<AttributeContractDraftFieldDto>(createContractField());
const allowedValuesInput = ref("");
const localeInput = ref("");
const selectedFieldKind = ref<ProfileFieldKind | null>(null);
const suggestedIdentity = ref<PresetSuggestedIdentity | null>(null);
const pendingPreset = ref<ProfileFieldKind | null>(null);
const presetChangeSummary = ref<string[]>([]);
const baseline = ref("");

interface PresetSessionDraft {
  valueType: AttributeContractDraftFieldDto["valueType"];
  constraints: AttributeContractDraftFieldDto["constraints"];
  semanticRole: AttributeContractDraftFieldDto["semanticRole"];
  allowedValuesInput: string;
  suggestedIdentity: PresetSuggestedIdentity | null;
}

const presetDrafts = new Map<ProfileFieldKind, PresetSessionDraft>();

const isEditing = computed(() => route.name === "profile-field-edit");
const dirty = computed(
  () =>
    !loading.value &&
    JSON.stringify({
      form: form.value,
      allowedValuesInput: allowedValuesInput.value,
      selectedFieldKind: selectedFieldKind.value,
    }) !== baseline.value,
);
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
const requirementOptions = [
  { value: "OPTIONAL", label: "Можно не передавать" },
  {
    value: "REQUIRED_WARN",
    label: "Предупреждать, если значения нет",
  },
  {
    value: "REQUIRED_ENFORCED",
    label: "Не принимать профиль без значения",
  },
];
const classificationOptions = [
  { value: "INTERNAL", label: "Служебные данные" },
  { value: "PERSONAL", label: "Персональные данные" },
  { value: "SENSITIVE", label: "Чувствительные данные" },
];
const lifecycleOptions = [
  { value: "ACTIVE", label: "Активно" },
  { value: "DEPRECATED", label: "Выводится из использования" },
];
const indexOptions = [
  { value: "NONE", label: "Не использовать для поиска" },
  { value: "EXACT", label: "Искать по точному значению" },
  { value: "RANGE_SORT", label: "Фильтровать и сортировать" },
];
const identityLocked = computed(() => {
  const definitionId = form.value.definitionId;
  return Boolean(
    definitionId &&
    workspace.value?.currentRevision?.fields.some(
      (field) => field.definitionId === definitionId,
    ),
  );
});
const publishedSystemPurpose = computed(
  () =>
    workspace.value?.currentRevision?.fields.find(
      (field) => field.definitionId === form.value.definitionId,
    )?.semanticRole ?? null,
);
const isLocaleField = computed(() => form.value.semanticRole === "LOCALE");
const fieldKind = computed(() => selectedFieldKind.value);
const localeValues = computed(() =>
  (form.value.constraints.allowedValues ?? []).filter(
    (value): value is string => typeof value === "string",
  ),
);
const usedSystemPurposeFields = computed(() => {
  const entries = (workspace.value?.draft.document.fields ?? []).flatMap(
    (field, index) =>
      index !== editingIndex.value &&
      field.lifecycle === "ACTIVE" &&
      field.semanticRole
        ? ([[field.semanticRole, field]] as const)
        : [],
  );
  return new Map(entries);
});
const usedSystemPurposes = computed(
  () => new Set(usedSystemPurposeFields.value.keys()),
);
const showsAllowedValues = computed(
  () => !["BOOLEAN", "DATETIME"].includes(form.value.valueType),
);
const showsTextLimits = computed(() => form.value.valueType === "STRING");
const showsNumberLimits = computed(() =>
  ["INTEGER", "DECIMAL"].includes(form.value.valueType),
);
const showsDecimalSettings = computed(() => form.value.valueType === "DECIMAL");
const typeHelp = computed(
  () =>
    ({
      STRING: "Для имён, статусов и других текстовых значений.",
      BOOLEAN: "Для признака с двумя значениями: да или нет.",
      INTEGER: "Целое число без дробной части, например количество заказов.",
      DECIMAL:
        "Для денег, балансов и рейтингов. Передавайте без пробелов, например 1250.50.",
      DATE: "Календарная дата без времени, например 2026-07-19.",
      DATETIME: "Дата и время с часовым поясом, например 2026-07-19T08:30:00Z.",
      COUNTRY_CODE: "Двухбуквенный код страны, например ES или RU.",
      CURRENCY_CODE: "Трёхбуквенный код валюты, например EUR или RUB.",
    })[form.value.valueType],
);
const purposeRequired = computed(() => fieldNeedsPurpose(form.value));

watch(
  () => form.value.semanticRole,
  (role, previous) => {
    if (!role) return;
    const preset = profileFieldPreset(role);
    if (usedSystemPurposes.value.has(role)) {
      form.value.semanticRole = previous ?? null;
      error.value = `Системное назначение «${preset.label}» уже используется другим активным полем.`;
      return;
    }
    if (preset.valueType && form.value.valueType !== preset.valueType) {
      if (identityLocked.value) {
        form.value.semanticRole = previous ?? null;
        error.value = `Для назначения «${preset.label}» нужен другой тип данных, а тип опубликованного поля изменить нельзя.`;
        return;
      }
      const confirmed =
        !form.value.definitionId ||
        window.confirm(
          `Для назначения «${preset.label}» нужен совместимый тип данных. Изменить тип поля?`,
        );
      if (!confirmed) {
        form.value.semanticRole = previous ?? null;
        return;
      }
      form.value.valueType = preset.valueType;
    }
    selectedFieldKind.value ??= role;
  },
);

function presetUnavailable(kind: ProfileFieldKind) {
  if (kind === fieldKind.value) return false;
  if (publishedSystemPurpose.value) return true;
  if (kind === "CUSTOM") return false;
  if (identityLocked.value) return true;
  const preset = profileFieldPreset(kind);
  return (
    usedSystemPurposes.value.has(kind) ||
    Boolean(
      identityLocked.value &&
      preset.valueType &&
      preset.valueType !== form.value.valueType,
    )
  );
}

function presetUnavailableReason(kind: ProfileFieldKind) {
  if (kind !== fieldKind.value && publishedSystemPurpose.value)
    return "Назначение опубликованного поля зафиксировано";
  if (kind !== "CUSTOM" && usedSystemPurposes.value.has(kind))
    return "Уже используется";
  if (kind !== fieldKind.value && identityLocked.value)
    return "Для опубликованного поля создайте поле-замену";
  if (presetUnavailable(kind)) return "Несовместимо с опубликованным типом";
  return "";
}

function occupiedSystemField(kind: ProfileFieldKind) {
  return kind === "CUSTOM" ? null : usedSystemPurposeFields.value.get(kind);
}

function presetSwitchSummary(kind: ProfileFieldKind) {
  const summary: string[] = [];
  const next = profileFieldPreset(kind);
  if (next.valueType && next.valueType !== form.value.valueType)
    summary.push(
      `Тип данных изменится на «${valueTypeLabel(next.valueType)}».`,
    );
  if (
    Object.values(form.value.constraints).some((value) => value !== undefined)
  )
    summary.push(
      "Ограничения текущей заготовки будут сохранены в её черновике.",
    );
  if (allowedValuesInput.value.trim() && !isLocaleField.value)
    summary.push(
      "Допустимые значения останутся в черновике текущей заготовки.",
    );
  return summary;
}

function valueTypeLabel(value: AttributeContractDraftFieldDto["valueType"]) {
  return valueTypes.find((option) => option.value === value)?.label ?? value;
}

function requestFieldKind(kind: ProfileFieldKind) {
  if (kind === fieldKind.value || presetUnavailable(kind)) return;
  const summary = fieldKind.value ? presetSwitchSummary(kind) : [];
  if (summary.length) {
    pendingPreset.value = kind;
    presetChangeSummary.value = summary;
    return;
  }
  applyFieldKind(kind);
}

function snapshotCurrentPreset() {
  if (!fieldKind.value) return;
  presetDrafts.set(fieldKind.value, {
    valueType: form.value.valueType,
    constraints: structuredClone(toRaw(form.value.constraints)),
    semanticRole: form.value.semanticRole,
    allowedValuesInput: allowedValuesInput.value,
    suggestedIdentity: structuredClone(toRaw(suggestedIdentity.value)),
  });
}

function applyFieldKind(kind: ProfileFieldKind) {
  error.value = "";
  snapshotCurrentPreset();
  const cached = presetDrafts.get(kind);
  if (cached) {
    const next = structuredClone(toRaw(form.value));
    if (
      !next.label.trim() ||
      (suggestedIdentity.value?.label &&
        next.label === suggestedIdentity.value.label)
    )
      next.label = cached.suggestedIdentity?.label ?? next.label;
    if (
      !next.key.trim() ||
      (suggestedIdentity.value?.key && next.key === suggestedIdentity.value.key)
    )
      next.key = cached.suggestedIdentity?.key ?? next.key;
    next.valueType = cached.valueType;
    next.constraints = structuredClone(cached.constraints);
    next.semanticRole = cached.semanticRole;
    form.value = next;
    allowedValuesInput.value = cached.allowedValuesInput;
    suggestedIdentity.value = structuredClone(cached.suggestedIdentity);
  } else {
    const next = structuredClone(toRaw(form.value));
    next.constraints = {};
    suggestedIdentity.value = applyProfileFieldPreset(
      next,
      kind,
      suggestedIdentity.value,
    );
    form.value = next;
    allowedValuesInput.value = "";
  }
  selectedFieldKind.value = kind;
  localeInput.value = "";
  pendingPreset.value = null;
  presetChangeSummary.value = [];
}

function cancelPresetChange() {
  pendingPreset.value = null;
  presetChangeSummary.value = [];
}

function confirmPresetChange() {
  if (pendingPreset.value) applyFieldKind(pendingPreset.value);
}

function syncLocaleInput() {
  allowedValuesInput.value = localeValues.value.join("\n");
}

function addLocale() {
  error.value = "";
  const canonical = canonicalLocale(localeInput.value);
  if (!canonical) {
    error.value = "Введите корректный BCP 47 tag, например en или pt-BR.";
    return;
  }
  if (
    localeValues.value.some((locale) => canonicalLocale(locale) === canonical)
  ) {
    error.value = `Язык ${canonical} уже добавлен.`;
    return;
  }
  if (localeValues.value.length >= 20) {
    error.value = "Можно добавить не больше 20 языков.";
    return;
  }
  form.value.constraints.allowedValues = [...localeValues.value, canonical];
  form.value.constraints.defaultLocale ??= canonical;
  localeInput.value = "";
  syncLocaleInput();
}

function removeLocale(locale: string) {
  if (localeValues.value.length === 1) {
    error.value = "Нельзя удалить последний язык проекта.";
    return;
  }
  if (form.value.constraints.defaultLocale === locale) {
    error.value = "Сначала выберите другой основной язык проекта.";
    return;
  }
  form.value.constraints.allowedValues = localeValues.value.filter(
    (candidate) => candidate !== locale,
  );
  syncLocaleInput();
}

function moveLocale(locale: string, offset: number) {
  const values = [...localeValues.value];
  const index = values.indexOf(locale);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= values.length) return;
  [values[index], values[target]] = [values[target]!, values[index]!];
  form.value.constraints.allowedValues = values;
  syncLocaleInput();
}

function userFacingError(cause: unknown, fallback: string) {
  if (cause instanceof Error && /[А-Яа-яЁё]/.test(cause.message))
    return cause.message;
  return fallback;
}

onMounted(load);
onBeforeRouteLeave(() =>
  !dirty.value
    ? true
    : window.confirm("Уйти со страницы и потерять изменения поля?"),
);

function mockWorkspace(): AttributeContractWorkspaceResponseDto {
  const projectId = auth.project?.id ?? "demo";
  const first = createContractField(10);
  const fields: AttributeContractDraftFieldDto[] = [
    {
      ...first,
      definitionId: "attr-name",
      key: "displayName",
      label: "Отображаемое имя",
      purpose: "Показывать имя пользователя в интерфейсе и сообщениях",
      semanticRole: "DISPLAY_NAME",
      policies: { ...first.policies, clientRead: true, templateRead: true },
    },
    {
      ...createContractField(20),
      definitionId: "attr-tier",
      key: "loyaltyTier",
      label: "Уровень лояльности",
      purpose: "Собирать сегменты и подставлять уровень в сообщения",
      constraints: { allowedValues: ["basic", "silver", "gold"] },
      policies: {
        ...createContractField().policies,
        audienceRead: true,
        templateRead: true,
        indexPolicy: "EXACT",
      },
    },
    {
      ...createContractField(30),
      definitionId: "attr-balance",
      key: "accountBalance",
      label: "Баланс",
      valueType: "DECIMAL",
      classification: "SENSITIVE",
      purpose: "Персонализация ответа о балансе",
      policies: {
        ...createContractField().policies,
        adminRead: true,
        aiRead: true,
      },
    },
  ];
  return {
    currentRevision: null,
    draft: {
      projectId,
      draftVersion: 3,
      baseContractRevisionId: null,
      updatedById: null,
      document: readDemoContractDraft(projectId, { fields }),
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
  error.value = "";
  fieldErrors.value = {};
  try {
    workspace.value =
      repository.mode === "mock"
        ? mockWorkspace()
        : await attributeContractRepository.workspace(projectId);
    if (isEditing.value) {
      const identity = String(route.params.definitionId ?? "");
      const index = workspace.value.draft.document.fields.findIndex(
        (field) => field.definitionId === identity || field.key === identity,
      );
      if (index < 0) throw new Error("Поле не найдено в текущем черновике.");
      editingIndex.value = index;
      form.value = structuredClone(
        toRaw(workspace.value.draft.document.fields[index]!),
      );
      selectedFieldKind.value = form.value.semanticRole ?? "CUSTOM";
      allowedValuesInput.value = (form.value.constraints.allowedValues ?? [])
        .map(String)
        .join("\n");
    } else {
      const position =
        Math.max(
          0,
          ...workspace.value.draft.document.fields.map(
            (field) => field.position,
          ),
        ) + 10;
      form.value = createContractField(position);
      const requestedPreset = profileFieldPresets.find(
        (preset) => preset.value === route.query?.semanticRole,
      );
      if (requestedPreset) {
        if (presetUnavailable(requestedPreset.value))
          error.value = `Нельзя выбрать «${requestedPreset.label}»: ${presetUnavailableReason(requestedPreset.value).toLowerCase()}.`;
        else applyFieldKind(requestedPreset.value);
      }
    }
    baseline.value = JSON.stringify({
      form: form.value,
      allowedValuesInput: allowedValuesInput.value,
      selectedFieldKind: selectedFieldKind.value,
    });
  } catch (cause) {
    error.value = userFacingError(cause, "Не удалось открыть поле.");
  } finally {
    loading.value = false;
  }
}

async function save() {
  const projectId = auth.project?.id;
  if (!projectId || !workspace.value) return;
  error.value = "";
  try {
    if (isLocaleField.value) {
      if (!localeValues.value.length)
        throw new Error("Добавьте хотя бы один язык контента.");
      if (!form.value.constraints.defaultLocale)
        throw new Error("Выберите основной язык проекта.");
    } else {
      form.value.constraints.allowedValues = parseAllowedValues(
        form.value.valueType,
        allowedValuesInput.value,
      );
      delete form.value.constraints.defaultLocale;
    }
    const document = structuredClone(toRaw(workspace.value.draft.document));
    if (editingIndex.value === null)
      document.fields.push(structuredClone(toRaw(form.value)));
    else
      document.fields[editingIndex.value] = structuredClone(toRaw(form.value));
    const validationErrors = validateContractDocument(document).filter(
      (issue) => issue.severity === "error",
    );
    fieldErrors.value = Object.fromEntries(
      validationErrors.map((issue) => [
        issue.path.split(".").at(-1),
        issue.message,
      ]),
    );
    const firstError = validationErrors[0];
    if (firstError) {
      error.value = firstError.message;
      await nextTick();
      const fieldName = firstError.path.split(".").at(-1);
      const selector =
        fieldName === "label"
          ? "#profile-field-label"
          : fieldName === "key"
            ? "#profile-field-key"
            : fieldName === "purpose"
              ? "#profile-field-purpose"
              : ".form-error";
      window.document.querySelector<HTMLElement>(selector)?.focus();
      return;
    }
    saving.value = true;
    if (repository.mode === "mock") writeDemoContractDraft(projectId, document);
    else
      await attributeContractRepository.saveDraft(projectId, {
        expectedDraftVersion: workspace.value.draft.draftVersion,
        document,
      });
    baseline.value = JSON.stringify({
      form: form.value,
      allowedValuesInput: allowedValuesInput.value,
      selectedFieldKind: selectedFieldKind.value,
    });
    toast.add({
      severity: "success",
      summary: isEditing.value ? "Изменения сохранены" : "Поле добавлено",
      detail: "Поле находится в черновике. Проверьте и опубликуйте изменения.",
      life: 3200,
    });
    await router.push("/profile-fields");
  } catch (cause) {
    error.value = userFacingError(
      cause,
      "Не удалось сохранить поле. Проверьте обязательные настройки и повторите попытку.",
    );
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="page field-editor-page">
    <RouterLink to="/profile-fields" class="back-link">
      <i class="pi pi-arrow-left" /> К полям профиля
    </RouterLink>
    <header class="editor-header">
      <div>
        <div class="eyebrow">Поля профиля пользователей</div>
        <h1>{{ isEditing ? "Изменить поле" : "Новое поле профиля" }}</h1>
        <p class="subtitle">
          Укажите, какие данные передаёт ваш продукт и где Lola сможет их
          использовать.
        </p>
      </div>
      <div class="editor-support">
        <Button
          label="Полное руководство"
          icon="pi pi-book"
          severity="secondary"
          text
          as="router-link"
          :to="{ name: 'profile-fields-guide' }"
        />
        <div class="draft-state">
          <i class="pi pi-file-edit" /> Изменения попадут в черновик
        </div>
      </div>
    </header>

    <Dialog
      :visible="Boolean(pendingPreset)"
      class="preset-switch-dialog"
      modal
      header="Сменить заготовку поля?"
      :closable="false"
      :draggable="false"
      :style="{ width: 'min(480px, calc(100vw - 28px))' }"
      @update:visible="!$event && cancelPresetChange()"
    >
      <div class="preset-dialog-copy">
        <p>
          Вы выбрали заготовку
          <strong>«{{ profileFieldPreset(pendingPreset).label }}»</strong>.
        </p>
        <div class="preset-dialog-notice">
          <i class="pi pi-history" />
          <span>
            Заполненные данные сохранятся в черновике текущей заготовки и
            восстановятся, если вы вернётесь.
          </span>
        </div>
        <ul>
          <li v-for="item in presetChangeSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
      <template #footer>
        <div class="preset-dialog-actions">
          <Button
            type="button"
            label="Не менять"
            severity="secondary"
            outlined
            @click="cancelPresetChange"
          />
          <Button
            type="button"
            label="Сменить"
            icon="pi pi-check"
            @click="confirmPresetChange"
          />
        </div>
      </template>
    </Dialog>

    <div v-if="loading" class="editor-loading">
      <Skeleton height="180px" border-radius="18px" />
      <Skeleton height="320px" border-radius="18px" />
    </div>
    <Message v-else-if="error && !workspace" severity="error" :closable="false">
      {{ error }}
    </Message>
    <form
      v-else
      class="editor-layout"
      :class="{ 'preset-only': !fieldKind }"
      @submit.prevent="save"
    >
      <Message
        v-if="error"
        class="form-error"
        severity="error"
        :closable="false"
        tabindex="-1"
        >{{ error }}</Message
      >
      <main class="editor-main">
        <fieldset
          class="editor-section preset-section card"
          aria-describedby="profile-field-kind-description"
        >
          <legend class="visually-hidden">
            Как Lola должна понимать это поле?
          </legend>
          <div
            id="profile-field-kind-description"
            class="section-heading preset-heading"
          >
            <span class="section-number"><i class="pi pi-sparkles" /></span>
            <span>
              <span class="preset-title"
                >Как Lola должна понимать это поле?</span
              >
              <small>
                Сначала выберите назначение. Для системного поля Lola подставит
                безопасную заготовку и сразу покажет нужные настройки.
              </small>
              <small class="preset-required">Выберите один вариант.</small>
            </span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in profileFieldPresets"
              :key="preset.value"
              class="preset-option"
              :class="{
                selected: fieldKind === preset.value,
                unavailable: presetUnavailable(preset.value),
              }"
            >
              <input
                :id="`profile-field-kind-${preset.value}`"
                type="radio"
                name="profile-field-kind"
                :value="preset.value"
                :checked="fieldKind === preset.value"
                :disabled="presetUnavailable(preset.value)"
                @click.prevent="requestFieldKind(preset.value)"
              />
              <label
                class="preset-choice"
                :for="`profile-field-kind-${preset.value}`"
              >
                <span class="preset-icon"
                  ><i :class="['pi', preset.icon]"
                /></span>
                <span class="preset-copy">
                  <strong>{{ preset.label }}</strong>
                  <small>{{ preset.hint }}</small>
                  <small
                    v-if="presetUnavailableReason(preset.value)"
                    class="preset-unavailable"
                    >{{ presetUnavailableReason(preset.value) }}</small
                  >
                  <small
                    v-else-if="fieldKind === preset.value"
                    class="preset-selected"
                  >
                    <i class="pi pi-check" /> Выбрано
                  </small>
                </span>
              </label>
              <RouterLink
                v-if="occupiedSystemField(preset.value)"
                class="preset-existing-link"
                :to="`/profile-fields/${occupiedSystemField(preset.value)?.definitionId ?? occupiedSystemField(preset.value)?.key}`"
              >
                Открыть «{{ occupiedSystemField(preset.value)?.label }}»
                <i class="pi pi-arrow-right" />
              </RouterLink>
            </div>
          </div>
          <p class="preset-note">
            Системное назначение бывает только у одного активного поля в
            проекте. Обычные поля можно добавлять без ограничений.
          </p>
        </fieldset>

        <template v-if="fieldKind">
          <section class="editor-section card">
            <div class="section-heading">
              <span class="section-number">1</span>
              <div>
                <h2>Что хранится в поле</h2>
                <p>
                  Название увидит администратор, а ключ будет использовать ваш
                  сервер.
                </p>
              </div>
            </div>
            <div class="form-grid two-columns">
              <label class="field-control">
                <span>Название поля *</span>
                <InputText
                  id="profile-field-label"
                  v-model="form.label"
                  :aria-invalid="Boolean(fieldErrors.label)"
                  maxlength="120"
                  placeholder="Например, уровень лояльности"
                />
                <small v-if="fieldErrors.label" class="control-error">{{
                  fieldErrors.label
                }}</small>
                <small>Так поле будет называться в Lola.</small>
              </label>
              <label class="field-control">
                <span>Ключ для передачи данных *</span>
                <InputText
                  id="profile-field-key"
                  v-model="form.key"
                  class="mono"
                  :aria-invalid="Boolean(fieldErrors.key)"
                  :disabled="identityLocked"
                  placeholder="loyaltyTier"
                />
                <small v-if="fieldErrors.key" class="control-error">{{
                  fieldErrors.key
                }}</small>
                <small
                  >Латинские буквы без пробелов. После первой публикации ключ и
                  тип данных изменить нельзя.</small
                >
              </label>
              <label class="field-control">
                <span>Тип данных</span>
                <Select
                  v-model="form.valueType"
                  :options="valueTypes"
                  option-label="label"
                  option-value="value"
                  :disabled="identityLocked || fieldKind === 'LOCALE'"
                />
                <small v-if="fieldKind === 'LOCALE'"
                  >Тип задан системным назначением языка. {{ typeHelp }}</small
                >
                <small v-else-if="fieldKind !== 'CUSTOM'"
                  >Заготовка рекомендует этот тип, но до публикации его можно
                  изменить. {{ typeHelp }}</small
                >
                <small v-else>{{ typeHelp }}</small>
              </label>
              <label class="field-control">
                <span>Обязательно ли передавать поле?</span>
                <Select
                  v-model="form.requirement"
                  :options="requirementOptions"
                  option-label="label"
                  option-value="value"
                />
                <small
                  >Обязательность начнёт действовать после публикации.</small
                >
              </label>
            </div>
            <label class="field-control">
              <span>Описание</span>
              <Textarea
                v-model="form.description"
                rows="3"
                auto-resize
                maxlength="2000"
                placeholder="Что означает это поле и откуда берётся значение?"
              />
            </label>
            <label class="field-control purpose-control">
              <span
                >Для чего нужно это поле?{{ purposeRequired ? " *" : "" }}</span
              >
              <Textarea
                id="profile-field-purpose"
                v-model="form.purpose"
                :aria-invalid="Boolean(fieldErrors.purpose)"
                rows="2"
                auto-resize
                maxlength="500"
                placeholder="Например, уровень программы лояльности клиента. Используется для сегментов и ответов о доступных привилегиях."
              />
              <small v-if="fieldErrors.purpose" class="control-error">{{
                fieldErrors.purpose
              }}</small>
              <small v-if="purposeRequired"
                >Обязательно для персональных и чувствительных данных, а также
                если поле доступно хотя бы в одном разделе.</small
              >
              <small v-else
                >Необязательно для внутреннего поля, недоступного другим
                разделам.</small
              >
              <small class="purpose-example">
                <i class="pi pi-sparkles" />
                <span
                  ><strong>Пример для ИИ.</strong> «Уровень программы лояльности
                  клиента. Учитывай его, когда объясняешь доступные
                  привилегии».</span
                >
              </small>
            </label>
            <div v-if="isLocaleField" class="locale-editor">
              <div>
                <strong>Языки контента</strong>
                <p>
                  Значение этого атрибута у пользователя определяет язык
                  сообщений сценария.
                </p>
              </div>
              <div class="locale-add-row">
                <InputText
                  v-model="localeInput"
                  placeholder="Название или tag, например pt-BR"
                  aria-label="Добавить язык контента"
                  @keydown.enter.prevent="addLocale"
                />
                <Button
                  type="button"
                  label="Добавить язык"
                  icon="pi pi-plus"
                  @click="addLocale"
                />
              </div>
              <div
                v-if="localeValues.length"
                class="locale-chips"
                aria-label="Выбранные языки"
              >
                <div
                  v-for="(locale, index) in localeValues"
                  :key="locale"
                  class="locale-chip"
                >
                  <span
                    ><strong>{{ localeDisplayName(locale) }}</strong
                    ><code>{{ locale }}</code></span
                  >
                  <div>
                    <Button
                      type="button"
                      icon="pi pi-arrow-up"
                      text
                      rounded
                      :disabled="index === 0"
                      :aria-label="`Поднять ${locale}`"
                      @click="moveLocale(locale, -1)"
                    />
                    <Button
                      type="button"
                      icon="pi pi-arrow-down"
                      text
                      rounded
                      :disabled="index === localeValues.length - 1"
                      :aria-label="`Опустить ${locale}`"
                      @click="moveLocale(locale, 1)"
                    />
                    <Button
                      type="button"
                      icon="pi pi-times"
                      text
                      rounded
                      severity="danger"
                      :aria-label="`Удалить ${locale}`"
                      @click="removeLocale(locale)"
                    />
                  </div>
                </div>
              </div>
              <label v-if="localeValues.length" class="field-control">
                <span>Основной язык проекта *</span>
                <Select
                  v-model="form.constraints.defaultLocale"
                  :options="
                    localeValues.map((locale) => ({
                      label: `${localeDisplayName(locale)} (${locale})`,
                      value: locale,
                    }))
                  "
                  option-label="label"
                  option-value="value"
                />
                <small
                  >Он показывается первым в редакторе и используется как
                  безопасный fallback.</small
                >
              </label>
              <small>{{ localeValues.length }}/20 языков</small>
            </div>
            <label
              v-if="showsAllowedValues && !isLocaleField"
              class="field-control"
            >
              <span>Допустимые значения</span>
              <Textarea
                v-model="allowedValuesInput"
                rows="3"
                auto-resize
                :placeholder="
                  form.valueType === 'DECIMAL'
                    ? '10.00\n99.95'
                    : 'basic\npremium'
                "
              />
              <small
                >Необязательно. Укажите по одному значению на строку, если
                список должен быть ограничен.</small
              >
            </label>
          </section>

          <section class="editor-section card">
            <div class="section-heading">
              <span class="section-number">2</span>
              <div>
                <h2>Где можно использовать поле</h2>
                <p>
                  Включайте только те разделы, которым действительно нужны эти
                  данные.
                </p>
              </div>
            </div>
            <div class="classification-panel">
              <span class="classification-icon"
                ><i class="pi pi-shield"
              /></span>
              <label class="field-control">
                <span>Категория данных</span>
                <Select
                  v-model="form.classification"
                  :options="classificationOptions"
                  option-label="label"
                  option-value="value"
                />
                <small
                  >Сначала оцените чувствительность данных, затем включайте
                  доступ для ИИ, сайта и экспорта.</small
                >
              </label>
            </div>
            <div class="usage-grid">
              <label class="usage-option">
                <span
                  ><i class="pi pi-user-edit" /><strong
                    >Показывать администраторам</strong
                  ><small>Поле видно в карточке пользователя.</small></span
                >
                <ToggleSwitch v-model="form.policies.adminRead" />
              </label>
              <label class="usage-option">
                <span
                  ><i class="pi pi-filter" /><strong
                    >Использовать в сегментах</strong
                  ><small>По значению можно собирать аудитории.</small></span
                >
                <ToggleSwitch v-model="form.policies.audienceRead" />
              </label>
              <label class="usage-option">
                <span
                  ><i class="pi pi-comment" /><strong
                    >Использовать в шаблонах</strong
                  ><small>Значение можно подставлять в сообщения.</small></span
                >
                <ToggleSwitch v-model="form.policies.templateRead" />
              </label>
              <label class="usage-option">
                <span
                  ><i class="pi pi-sparkles" /><strong
                    >Разрешить ИИ использовать значение</strong
                  ><small
                    >ИИ получит значение и описание поля, чтобы понимать, что
                    оно означает. Не включайте для паролей и токенов.</small
                  ></span
                >
                <ToggleSwitch v-model="form.policies.aiRead" />
              </label>
              <label class="usage-option">
                <span
                  ><i class="pi pi-desktop" /><strong
                    >Показывать на сайте</strong
                  ><small
                    >Поле придёт во фронтенд, и его можно будет увидеть в
                    браузере пользователя. Не включайте для секретов.</small
                  ></span
                >
                <ToggleSwitch v-model="form.policies.clientRead" />
              </label>
              <label class="usage-option">
                <span
                  ><i class="pi pi-download" /><strong>Разрешить экспорт</strong
                  ><small>Значение попадёт в выгрузки.</small></span
                >
                <ToggleSwitch v-model="form.policies.exportRead" />
              </label>
            </div>
          </section>

          <details class="advanced-section card">
            <summary>
              <span class="advanced-icon"><i class="pi pi-sliders-h" /></span>
              <span
                ><strong>Расширенные настройки</strong
                ><small
                  >Ограничения значений, поиск и вывод поля из
                  использования.</small
                ></span
              >
              <i class="pi pi-chevron-down" />
            </summary>
            <div class="advanced-content">
              <div class="form-grid two-columns">
                <label class="field-control">
                  <span>Поиск и фильтрация</span>
                  <Select
                    v-model="form.policies.indexPolicy"
                    :options="indexOptions"
                    option-label="label"
                    option-value="value"
                  />
                </label>
                <label class="field-control">
                  <span>Состояние поля</span>
                  <Select
                    v-model="form.lifecycle"
                    :options="lifecycleOptions"
                    option-label="label"
                    option-value="value"
                  />
                </label>
              </div>
              <div
                v-if="showsTextLimits || showsNumberLimits"
                class="limits-panel"
              >
                <h3>Ограничения значения</h3>
                <div class="form-grid two-columns">
                  <label v-if="showsTextLimits" class="field-control"
                    ><span>Минимальная длина</span
                    ><InputNumber v-model="form.constraints.minLength" :min="0"
                  /></label>
                  <label v-if="showsTextLimits" class="field-control"
                    ><span>Максимальная длина</span
                    ><InputNumber v-model="form.constraints.maxLength" :min="0"
                  /></label>
                  <label v-if="showsNumberLimits" class="field-control"
                    ><span>Минимальное значение</span
                    ><InputText
                      :model-value="String(form.constraints.minimum ?? '')"
                      @update:model-value="
                        form.constraints.minimum = $event || undefined
                      "
                  /></label>
                  <label v-if="showsNumberLimits" class="field-control"
                    ><span>Максимальное значение</span
                    ><InputText
                      :model-value="String(form.constraints.maximum ?? '')"
                      @update:model-value="
                        form.constraints.maximum = $event || undefined
                      "
                  /></label>
                  <label v-if="showsDecimalSettings" class="field-control"
                    ><span>Всего цифр</span
                    ><InputNumber
                      v-model="form.constraints.precision"
                      :min="1"
                      :max="38"
                    /><small>Например, 6 для числа 1250.50.</small></label
                  >
                  <label v-if="showsDecimalSettings" class="field-control"
                    ><span>Знаков после запятой</span
                    ><InputNumber
                      v-model="form.constraints.scale"
                      :min="0"
                      :max="38"
                    /><small>Например, 2 для числа 1250.50.</small></label
                  >
                </div>
              </div>
              <div v-if="form.lifecycle === 'DEPRECATED'" class="limits-panel">
                <h3>Как вывести поле из использования</h3>
                <div class="form-grid two-columns">
                  <label class="field-control"
                    ><span>ID поля-замены</span
                    ><InputText
                      v-model="form.replacementDefinitionId"
                      class="mono"
                  /></label>
                  <label class="field-control"
                    ><span>Не использовать после</span
                    ><InputText
                      v-model="form.sunsetAt"
                      placeholder="2026-12-31T00:00:00Z"
                  /></label>
                </div>
              </div>
            </div>
          </details>
        </template>
      </main>

      <aside v-if="fieldKind" class="editor-aside">
        <div class="save-card">
          <span class="save-icon"><i class="pi pi-file-edit" /></span>
          <div>
            <strong>{{
              dirty ? "Есть несохранённые изменения" : "Изменений пока нет"
            }}</strong>
            <p>
              После сохранения вернитесь к списку, проверьте черновик и
              опубликуйте его.
            </p>
          </div>
          <Button
            type="submit"
            :label="isEditing ? 'Сохранить изменения' : 'Добавить в черновик'"
            icon="pi pi-check"
            :loading="saving"
            :disabled="!form.label.trim() || !form.key.trim()"
          />
          <Button
            type="button"
            label="Отмена"
            severity="secondary"
            text
            @click="router.push('/profile-fields')"
          />
        </div>
      </aside>
    </form>
  </section>
</template>

<style scoped>
.field-editor-page {
  max-width: 1180px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
  color: var(--status-violet-text);
  font-size: 0.76rem;
  font-weight: 800;
}
.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 26px;
}
.draft-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 13px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}
.editor-support {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.editor-loading {
  display: grid;
  gap: 16px;
}
.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: start;
}
.editor-layout.preset-only {
  grid-template-columns: 1fr;
}
.form-error {
  grid-column: 1 / -1;
}
.editor-main {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.editor-section {
  padding: 24px;
}
.preset-section {
  min-width: 0;
  margin: 0;
  border: 1px solid var(--border-default);
}
.preset-heading > span:last-child {
  display: block;
  min-width: 0;
}
.preset-title {
  display: block;
  color: var(--text-primary);
  font: 750 1.05rem var(--font-display);
}
.preset-heading small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.73rem;
  line-height: 1.45;
}
.preset-heading .preset-required {
  color: var(--text-primary);
  font-weight: 800;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.preset-option {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 112px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.preset-option:hover:not(.unavailable) {
  transform: translateY(-1px);
  border-color: var(--status-violet);
}
.preset-option.selected {
  border-color: var(--status-violet);
  background: var(--status-violet-soft);
  box-shadow: inset 0 0 0 1px var(--status-violet);
}
.preset-option.unavailable {
  opacity: 0.58;
}
.preset-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
.preset-choice {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 11px;
  flex: 1;
  width: 100%;
  padding: 14px;
  cursor: pointer;
}
.preset-option.unavailable .preset-choice {
  cursor: not-allowed;
}
.preset-option:has(input:focus-visible) {
  outline: 3px solid color-mix(in srgb, var(--status-violet) 45%, transparent);
  outline-offset: 2px;
}
.preset-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--status-violet-text);
}
.preset-copy strong,
.preset-copy small {
  display: block;
}
.preset-copy strong {
  font-size: 0.75rem;
  line-height: 1.35;
}
.preset-copy small {
  margin-top: 5px;
  color: var(--muted);
  font-size: 0.64rem;
  line-height: 1.4;
}
.preset-copy .preset-selected {
  color: var(--status-success-text);
  font-weight: 800;
}
.preset-copy .preset-unavailable {
  color: var(--text-secondary);
  font-weight: 800;
}
.preset-existing-link {
  align-self: flex-start;
  margin: -5px 14px 14px 63px;
  color: var(--text-link);
  font-size: 0.64rem;
  font-weight: 800;
  line-height: 1.35;
}
.preset-existing-link i {
  margin-left: 3px;
  font-size: 0.58rem;
}
.preset-note {
  margin: 13px 0 0;
  color: var(--muted);
  font-size: 0.67rem;
  line-height: 1.45;
}
.preset-dialog-copy p {
  margin: 0;
  line-height: 1.55;
}
.preset-dialog-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  margin-top: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.45;
}
.preset-dialog-notice i {
  margin-top: 2px;
  color: var(--status-violet-text);
}
.preset-dialog-copy ul {
  display: grid;
  gap: 7px;
  padding-left: 20px;
  margin: 14px 0 0;
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.45;
}
.preset-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}
:global(.preset-switch-dialog) {
  overflow: hidden;
  border-radius: 18px;
}
:global(.preset-switch-dialog .p-dialog-header) {
  padding: 22px 24px 14px;
  border-bottom: 0;
}
:global(.preset-switch-dialog .p-dialog-title) {
  color: var(--text-primary);
  font: 800 1.05rem/1.3 var(--font-display);
}
:global(.preset-switch-dialog .p-dialog-content) {
  padding: 0 24px 6px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
:global(.preset-switch-dialog .p-dialog-footer) {
  padding: 18px 24px 24px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
}
.section-number {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--surface-emphasis);
  color: var(--accent);
  font: 700 0.75rem var(--font-display);
}
.section-heading h2 {
  font-size: 1.05rem;
}
.section-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.73rem;
}
.form-grid {
  display: grid;
  gap: 17px;
  min-width: 0;
}
.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.field-control {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  margin-top: 17px;
}
.field-control :deep(.p-inputtext),
.field-control :deep(.p-inputnumber),
.field-control :deep(.p-select),
.field-control :deep(textarea) {
  width: 100%;
  min-width: 0;
}
.form-grid .field-control {
  margin-top: 0;
}
.field-control > span {
  font-size: 0.76rem;
  font-weight: 800;
}
.field-control small {
  color: var(--muted);
  font-size: 0.67rem;
  line-height: 1.45;
}
.field-control .control-error {
  color: var(--status-danger-text);
  font-weight: 800;
}
.usage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.classification-panel {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: start;
  gap: 13px;
  padding: 15px;
  margin-bottom: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.classification-panel .field-control {
  margin-top: 0;
}
.classification-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.usage-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 88px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.usage-option > span {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  column-gap: 10px;
  min-width: 0;
}
.usage-option :deep(.p-toggleswitch) {
  flex: 0 0 auto;
  justify-self: end;
}
.usage-option i {
  grid-row: 1/3;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--status-violet-text);
}
.usage-option strong,
.usage-option small {
  display: block;
}
.usage-option strong {
  font-size: 0.74rem;
}
.usage-option small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.64rem;
  line-height: 1.35;
}
.purpose-control {
  padding: 15px;
  border-radius: 14px;
  background: var(--status-violet-soft);
}
.field-control .purpose-example {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 3px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--status-violet) 18%, transparent);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.purpose-example i {
  margin-top: 2px;
  color: var(--status-violet-text);
}
.purpose-example strong {
  font-weight: 700;
}
.locale-editor {
  display: grid;
  gap: 12px;
  margin-top: 17px;
  padding: 16px;
  border: 1px solid var(--status-violet);
  border-radius: 14px;
  background: var(--status-violet-soft);
}
.locale-editor p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 0.7rem;
}
.locale-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.locale-chips {
  display: grid;
  gap: 6px;
}
.locale-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px;
  border-radius: 10px;
  background: var(--surface-card);
}
.locale-chip > span {
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.locale-chip code {
  color: var(--muted);
  font-size: 0.68rem;
}
.locale-chip > div {
  display: flex;
}
.advanced-section {
  overflow: hidden;
}
.advanced-section summary {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  cursor: pointer;
  list-style: none;
}
.advanced-section summary::-webkit-details-marker {
  display: none;
}
.advanced-section summary > span:nth-child(2) strong,
.advanced-section summary > span:nth-child(2) small {
  display: block;
}
.advanced-section summary > span:nth-child(2) strong {
  font-size: 0.82rem;
}
.advanced-section summary > span:nth-child(2) small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.67rem;
}
.advanced-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.advanced-section[open] summary > i {
  transform: rotate(180deg);
}
.advanced-content {
  box-sizing: border-box;
  min-width: 0;
  padding: 0 20px 22px;
  border-top: 1px solid var(--border-subtle);
}
.advanced-content > .form-grid {
  padding-top: 20px;
}
.limits-panel {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
}
.limits-panel h3 {
  margin: 0 0 14px;
  font-size: 0.82rem;
}
.editor-aside {
  position: sticky;
  top: 24px;
}
.save-card {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 20px;
  border-radius: 18px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  box-shadow: var(--shadow-raised);
}
.save-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: var(--border-on-emphasis);
  color: var(--accent);
}
.save-card strong {
  font-size: 0.8rem;
}
.save-card p {
  margin: 5px 0 0;
  color: var(--text-on-emphasis-muted);
  font-size: 0.68rem;
  line-height: 1.45;
}
.save-card :deep(.p-button-secondary.p-button-text) {
  color: var(--text-on-emphasis-muted);
}
@media (max-width: 900px) {
  .editor-header {
    flex-direction: column;
  }
  .editor-layout {
    grid-template-columns: 1fr;
  }
  .editor-aside {
    position: static;
  }
  .save-card {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
  }
  .save-card > .p-button {
    grid-column: 1/-1;
  }
  .two-columns,
  .usage-grid {
    grid-template-columns: 1fr;
  }
  .preset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 620px) {
  .field-editor-page {
    padding-left: 14px;
    padding-right: 14px;
  }
  .editor-section {
    padding: 18px;
  }
  .preset-grid {
    grid-template-columns: 1fr;
  }
  .preset-option {
    min-height: auto;
  }
  .preset-dialog-actions {
    flex-direction: column-reverse;
  }
  .preset-dialog-actions :deep(.p-button) {
    justify-content: center;
    width: 100%;
  }
  .advanced-section summary {
    padding: 15px;
  }
  .advanced-content {
    padding: 0 15px 18px;
  }
  .draft-state {
    width: 100%;
  }
  .editor-support {
    width: 100%;
    justify-content: flex-start;
  }
  .locale-add-row {
    grid-template-columns: 1fr;
  }
  .locale-add-row :deep(.p-button) {
    width: 100%;
  }
  .locale-chip {
    align-items: stretch;
    flex-direction: column;
  }
  .locale-chip > span {
    flex-wrap: wrap;
    min-width: 0;
  }
  .locale-chip > div {
    justify-content: flex-end;
  }
}
</style>
