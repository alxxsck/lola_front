<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
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
  readDemoContractDraft,
  writeDemoContractDraft,
} from "@/features/end-user-attributes/model/demo-draft-storage";
import { repository } from "@/shared/api/repository";
import type {
  AttributeContractDraftFieldDto,
  AttributeContractWorkspaceResponseDto,
} from "@/shared/api/generated/models";

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
const baseline = ref("");

const isEditing = computed(() => route.name === "profile-field-edit");
const dirty = computed(
  () =>
    !loading.value &&
    JSON.stringify({
      form: form.value,
      allowedValuesInput: allowedValuesInput.value,
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
const semanticRoleOptions = [
  { value: "DISPLAY_NAME", label: "Имя пользователя" },
  { value: "EMAIL", label: "Электронная почта" },
  { value: "COUNTRY", label: "Страна" },
  { value: "CURRENCY", label: "Валюта" },
];
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

function userFacingError(cause: unknown, fallback: string) {
  if (
    cause instanceof Error &&
    /[А-Яа-яЁё]/.test(cause.message)
  )
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
    }
    baseline.value = JSON.stringify({
      form: form.value,
      allowedValuesInput: allowedValuesInput.value,
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
    form.value.constraints.allowedValues = parseAllowedValues(
      form.value.valueType,
      allowedValuesInput.value,
    );
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
      <div class="draft-state">
        <i class="pi pi-file-edit" /> Изменения попадут в черновик
      </div>
    </header>

    <div v-if="loading" class="editor-loading">
      <Skeleton height="180px" border-radius="18px" />
      <Skeleton height="320px" border-radius="18px" />
    </div>
    <Message v-else-if="error && !workspace" severity="error" :closable="false">
      {{ error }}
    </Message>
    <form v-else class="editor-layout" @submit.prevent="save">
      <Message
        v-if="error"
        class="form-error"
        severity="error"
        :closable="false"
        tabindex="-1"
        >{{ error }}</Message
      >
      <main class="editor-main">
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
                autofocus
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
                :disabled="Boolean(form.definitionId)"
                placeholder="loyaltyTier"
              />
              <small v-if="fieldErrors.key" class="control-error">{{
                fieldErrors.key
              }}</small>
              <small
                >Латинские буквы без пробелов. После создания ключ изменить
                нельзя.</small
              >
            </label>
            <label class="field-control">
              <span>Тип данных</span>
              <Select
                v-model="form.valueType"
                :options="valueTypes"
                option-label="label"
                option-value="value"
                :disabled="Boolean(form.definitionId)"
              />
              <small>{{ typeHelp }}</small>
            </label>
            <label class="field-control">
              <span>Обязательно ли передавать поле?</span>
              <Select
                v-model="form.requirement"
                :options="requirementOptions"
                option-label="label"
                option-value="value"
              />
              <small>Обязательность начнёт действовать после публикации.</small>
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
          <label v-if="showsAllowedValues" class="field-control">
            <span>Допустимые значения</span>
            <Textarea
              v-model="allowedValuesInput"
              rows="3"
              auto-resize
              :placeholder="
                form.valueType === 'DECIMAL' ? '10.00\n99.95' : 'basic\npremium'
              "
            />
            <small
              >Необязательно. Укажите по одному значению на строку, если список
              должен быть ограничен.</small
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
                  >ИИ получит значение и описание поля, чтобы понимать, что оно
                  означает. Не включайте для паролей и токенов.</small
                ></span
              >
              <ToggleSwitch v-model="form.policies.aiRead" />
            </label>
            <label class="usage-option">
              <span
                ><i class="pi pi-desktop" /><strong>Показывать на сайте</strong
                ><small
                  >Поле придёт во фронтенд, и его можно будет увидеть в браузере
                  пользователя. Не включайте для секретов.</small
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
                <span>Категория данных</span>
                <Select
                  v-model="form.classification"
                  :options="classificationOptions"
                  option-label="label"
                  option-value="value"
                />
                <small
                  >Чувствительные данные требуют дополнительной проверки
                  доступа.</small
                >
              </label>
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
                <span>Системное назначение</span>
                <Select
                  v-model="form.semanticRole"
                  :options="semanticRoleOptions"
                  option-label="label"
                  option-value="value"
                  show-clear
                  placeholder="Не задано"
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
      </main>

      <aside class="editor-aside">
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
.form-error {
  grid-column: 1 / -1;
}
.editor-main {
  display: grid;
  gap: 16px;
}
.editor-section {
  padding: 24px;
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
  font: 700 0.75rem Manrope;
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
}
.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.field-control {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 17px;
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
}
@media (max-width: 620px) {
  .field-editor-page {
    padding-left: 14px;
    padding-right: 14px;
  }
  .editor-section {
    padding: 18px;
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
}
</style>
