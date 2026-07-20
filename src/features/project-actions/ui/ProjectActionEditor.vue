<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import type { CmsUser } from "@/shared/types/domain";
import {
  canConfigureProjectActions,
  createProjectActionDraft,
  requiresAiAuditReason,
  toConfigureProjectActionInput,
  validateProjectActionDraft,
  type AiCapabilityPreview,
  type ConfigureProjectActionInput,
  type ProjectAction,
  type ProjectActionDraftIssue,
} from "../model/project-action";
import type { ProjectActionError } from "../model/project-action-error";
import {
  actionConfirmationLabel,
  actionExecutorLabel,
  actionOriginLabel,
  actionRiskLabel,
  needsInterfaceSetup,
  projectActionDescription,
  projectActionName,
} from "../model/project-action-presentation";
import {
  buildProjectActionForm,
  validateProjectActionConfiguration,
} from "../model/schema-form";
import AiCapabilityPreviewPanel from "./AiCapabilityPreview.vue";
import ProjectActionSchemaForm from "./ProjectActionSchemaForm.vue";

const props = defineProps<{
  action: ProjectAction;
  role: CmsUser["role"];
  preview?: AiCapabilityPreview;
  previewLoading?: boolean;
  previewError?: ProjectActionError | null;
  saving?: boolean;
  mutationError?: ProjectActionError | null;
}>();
const emit = defineEmits<{
  save: [input: ConfigureProjectActionInput];
  archive: [];
  retryPreview: [];
}>();

const draft = ref(createProjectActionDraft(props.action));
const issues = ref<ProjectActionDraftIssue[]>([]);
const confirmSaveVisible = ref(false);
const confirmArchiveVisible = ref(false);
const canEdit = computed(
  () =>
    canConfigureProjectActions(props.role) &&
    props.action.lifecycle !== "ARCHIVED",
);
const supportsScenario = computed(() =>
  props.action.actionTypeRevision.supportedSurfaces.includes("SCENARIO"),
);
const supportsAi = computed(() =>
  props.action.actionTypeRevision.supportedSurfaces.includes("AI"),
);
const needsAuditReason = computed(() =>
  requiresAiAuditReason(props.action, draft.value),
);
const schemaForm = computed(() =>
  buildProjectActionForm(
    props.action.actionTypeRevision.projectConfigSchema,
    props.action.actionTypeRevision.uiSchema,
  ),
);
const originLabel = computed(() =>
  actionOriginLabel(props.action.actionType.origin),
);
const executorLabel = computed(() =>
  actionExecutorLabel(props.action.actionTypeRevision.executorAdapter),
);
const riskLabel = computed(() =>
  actionRiskLabel(props.action.actionTypeRevision.risk),
);
const confirmationLabel = computed(() =>
  actionConfirmationLabel(props.action.actionTypeRevision.confirmationPolicy),
);
const description = computed(() => projectActionDescription(props.action));
const name = computed(() => projectActionName(props.action));
const showInterfaceSetup = computed(() =>
  needsInterfaceSetup(props.action.code),
);

watch(
  () => props.action,
  (action) => {
    draft.value = createProjectActionDraft(action);
    issues.value = [];
    confirmSaveVisible.value = false;
  },
  { deep: true },
);

function submit() {
  issues.value = validateProjectActionDraft(
    props.action,
    draft.value,
    props.role,
  );
  if (schemaForm.value.blocked) {
    issues.value.push({
      field: "configuration",
      code: "PROJECT_ACTION_CONFIGURATION_SCHEMA_UNSUPPORTED",
      message:
        "Эти настройки пока нельзя безопасно изменить в Lola. Обратитесь к разработчику проекта.",
    });
  } else {
    issues.value.push(
      ...validateProjectActionConfiguration(
        schemaForm.value,
        draft.value.configuration,
      ).map((issue) => ({
        field: "configuration" as const,
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  if (issues.value.length) return;
  confirmSaveVisible.value = true;
}

function confirmSave() {
  confirmSaveVisible.value = false;
  emit("save", toConfigureProjectActionInput(draft.value));
}

function confirmArchive() {
  confirmArchiveVisible.value = false;
  emit("archive");
}
</script>

<template>
  <form class="project-action-editor" novalidate @submit.prevent="submit">
    <section class="contract-summary">
      <div class="summary-heading">
        <span class="eyebrow">Сведения о действии</span>
        <span class="origin"
          >{{ originLabel }} · версия
          {{ action.actionTypeRevision.version }}</span
        >
      </div>
      <p class="contract-effect">
        <strong>Что произойдёт</strong>{{ description }}
      </p>
      <dl>
        <div>
          <dt>Где выполняется</dt>
          <dd>{{ executorLabel }}</dd>
        </div>
        <div>
          <dt>Что изменяет</dt>
          <dd>{{ riskLabel }}</dd>
        </div>
        <div>
          <dt>Подтверждение</dt>
          <dd>{{ confirmationLabel }}</dd>
        </div>
      </dl>
    </section>

    <Message v-if="!canEdit" severity="info" :closable="false">
      {{
        action.lifecycle === "ARCHIVED"
          ? "Архивное действие доступно только для чтения."
          : "Просматривать могут все участники проекта. Изменять и архивировать может только владелец проекта."
      }}
    </Message>
    <Message v-if="mutationError" severity="error" :closable="false"
      >{{ mutationError.message
      }}<small v-if="mutationError.requestId"
        >Код обращения: {{ mutationError.requestId }}</small
      ></Message
    >
    <Message
      v-if="issues.length"
      severity="error"
      :closable="false"
      role="alert"
      aria-labelledby="project-action-validation-title"
    >
      <strong id="project-action-validation-title"
        >Исправьте настройки перед публикацией</strong
      >
      <ul>
        <li v-for="issue in issues" :key="`${issue.field}:${issue.code}`">
          {{ issue.message }}
        </li>
      </ul>
    </Message>

    <section class="editor-section">
      <div class="section-heading">
        <div>
          <h3>Доступность</h3>
          <p>
            Выберите, где можно использовать действие. Каждое разрешение
            сохраняется отдельно.
          </p>
        </div>
      </div>
      <div class="surface-controls">
        <label
          class="surface-control"
          :class="{ unsupported: !supportsScenario }"
        >
          <span class="surface-copy"
            ><strong
              ><i class="pi pi-sitemap" /> Использовать в сценариях</strong
            ><small>{{
              supportsScenario
                ? "Появится в новых сценариях после сохранения."
                : "Это действие нельзя добавить в сценарий."
            }}</small></span
          >
          <ToggleSwitch
            v-model="draft.scenarioEnabled"
            aria-label="Использовать в сценариях"
            :disabled="!canEdit || !supportsScenario"
          />
        </label>
        <label class="surface-control ai" :class="{ unsupported: !supportsAi }">
          <span class="surface-copy"
            ><strong
              ><i class="pi pi-sparkles" /> Разрешить помощнику Lola</strong
            ><small>{{
              supportsAi
                ? "Lola сможет выбрать это действие, когда оно подходит к запросу пользователя."
                : "Lola не умеет самостоятельно выбирать это действие."
            }}</small></span
          >
          <ToggleSwitch
            v-model="draft.aiEnabled"
            aria-label="Разрешить помощнику Lola"
            :disabled="!canEdit || !supportsAi"
          />
        </label>
      </div>
    </section>

    <section v-if="supportsAi" class="editor-section ai-setup">
      <div class="section-heading">
        <div>
          <h3>Когда Lola может выбрать действие</h3>
          <p>
            Объясните простыми словами, в каких запросах пользователя это
            действие уместно, а в каких — нет.
          </p>
        </div>
        <span>{{ draft.aiUsageDescription.trim().length }}/2000</span>
      </div>
      <label for="ai-usage-description" class="field-label"
        >Подсказка для Lola</label
      >
      <Textarea
        id="ai-usage-description"
        v-model="draft.aiUsageDescription"
        rows="4"
        minlength="20"
        maxlength="2000"
        :disabled="!canEdit"
        placeholder="Используй, когда пользователь явно просит… Не используй, когда…"
      />
      <div class="effect-lock">
        <i class="pi pi-lock" /><span
          ><strong>Эта подсказка не меняет результат действия:</strong>
          {{ description }}</span
        >
      </div>
      <label v-if="needsAuditReason" for="ai-audit-reason" class="audit-field">
        <span class="field-label"
          >Зачем Lola нужен доступ <em>обязательно</em></span
        >
        <InputText
          id="ai-audit-reason"
          v-model="draft.auditReason"
          minlength="10"
          maxlength="500"
          :disabled="!canEdit"
          placeholder="Например: пользователи часто просят открыть окно пополнения"
        />
        <small
          >Причина сохранится в истории изменений для администраторов.</small
        >
      </label>
    </section>

    <section class="editor-section">
      <div class="section-heading">
        <div>
          <h3>Настройки действия</h3>
          <p>
            Здесь показаны только настройки, которые можно менять безопасно.
            Адреса, ключи доступа и программный код Lola не принимает.
          </p>
        </div>
      </div>
      <aside v-if="showInterfaceSetup" class="setup-notice">
        <i class="pi pi-info-circle" />
        <div>
          <strong>Сначала добавьте доступный элемент интерфейса</strong>
          <p>
            Откройте раздел «Интерфейс», добавьте страницу, окно, анимацию или
            элемент и разрешите его использование. После публикации он станет
            доступен здесь и в сценариях.
          </p>
          <RouterLink to="/interface">Открыть раздел «Интерфейс»</RouterLink>
        </div>
      </aside>
      <ProjectActionSchemaForm
        v-model="draft.configuration"
        :schema="action.actionTypeRevision.projectConfigSchema"
        :ui-schema="action.actionTypeRevision.uiSchema"
        :disabled="!canEdit"
      />
    </section>

    <section v-if="supportsAi" class="editor-section preview-section">
      <AiCapabilityPreviewPanel
        :preview="preview"
        :loading="previewLoading"
        :error="previewError"
        @retry="emit('retryPreview')"
      />
    </section>

    <footer class="editor-actions">
      <Button
        v-if="canEdit"
        data-test="archive-project-action"
        label="Архивировать"
        icon="pi pi-archive"
        severity="danger"
        text
        type="button"
        :disabled="saving"
        @click="confirmArchiveVisible = true"
      />
      <span v-else />
      <Button
        data-test="save-project-action"
        label="Проверить и сохранить"
        icon="pi pi-check"
        type="submit"
        :loading="saving"
        :disabled="!canEdit || schemaForm.blocked"
      />
    </footer>
  </form>

  <Dialog
    v-model:visible="confirmSaveVisible"
    modal
    header="Проверьте изменения перед сохранением"
    :style="{ width: 'min(620px, 94vw)' }"
  >
    <div class="confirmation">
      <Message severity="warn" :closable="false"
        ><strong>Настройки вступят в силу сразу после сохранения.</strong>
        Использование в сценариях и доступ для Lola включаются независимо друг
        от друга.</Message
      >
      <dl>
        <div>
          <dt>Действие</dt>
          <dd>
            {{ name }} · версия
            {{ action.actionTypeRevision.version }}
          </dd>
        </div>
        <div>
          <dt>Сценарии</dt>
          <dd>{{ draft.scenarioEnabled ? "Включено" : "Выключено" }}</dd>
        </div>
        <div>
          <dt>Для Lola</dt>
          <dd>{{ draft.aiEnabled ? "Включено" : "Выключено" }}</dd>
        </div>
        <div v-if="draft.aiEnabled">
          <dt>Когда Lola может выбрать действие</dt>
          <dd>{{ draft.aiUsageDescription.trim() }}</dd>
        </div>
        <div>
          <dt>Дополнительные настройки</dt>
          <dd>
            {{
              Object.keys(draft.configuration).length
                ? "Заполнена"
                : "Не требуется"
            }}
          </dd>
        </div>
        <div>
          <dt>Что произойдёт</dt>
          <dd>{{ description }}</dd>
        </div>
        <div>
          <dt>Что может измениться</dt>
          <dd>{{ riskLabel }}</dd>
        </div>
        <div>
          <dt>Что изменится после сохранения</dt>
          <dd>
            Lola применит выбранные разрешения к версии
            {{ action.actionTypeRevision.version }} этого действия.
          </dd>
        </div>
        <div v-if="needsAuditReason">
          <dt>Причина изменения</dt>
          <dd>{{ draft.auditReason.trim() }}</dd>
        </div>
      </dl>
      <Message v-if="draft.aiEnabled" severity="info" :closable="false"
        >После сохранения Lola автоматически обновит опубликованные настройки
        действия.</Message
      >
    </div>
    <template #footer
      ><Button
        label="Отмена"
        severity="secondary"
        text
        @click="confirmSaveVisible = false" /><Button
        data-test="confirm-project-action-save"
        label="Подтвердить и сохранить"
        @click="confirmSave"
    /></template>
  </Dialog>

  <Dialog
    v-model:visible="confirmArchiveVisible"
    modal
    header="Архивировать действие?"
    :style="{ width: 'min(520px, 94vw)' }"
  >
    <p>
      Действие нельзя будет архивировать, пока оно используется в активном
      сценарии или выполняется по текущему запросу пользователя.
    </p>
    <template #footer
      ><Button
        label="Отмена"
        severity="secondary"
        text
        @click="confirmArchiveVisible = false" /><Button
        label="Архивировать"
        severity="danger"
        @click="confirmArchive"
    /></template>
  </Dialog>
</template>

<style scoped>
.project-action-editor {
  display: grid;
  gap: 12px;
}
.contract-summary,
.editor-section {
  display: grid;
  gap: 11px;
  padding: 14px;
  background: var(--surface-raised);
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.setup-notice {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  padding: 12px;
  color: var(--status-info-text, var(--text-primary));
  background: var(--status-info-soft, var(--surface-subtle));
  border: 1px solid
    color-mix(in srgb, var(--text-link) 20%, var(--border-default));
  border-radius: 10px;
}
.setup-notice > i {
  margin-top: 2px;
  color: var(--text-link);
}
.setup-notice p {
  margin: 4px 0 7px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.setup-notice a {
  color: var(--text-link);
  font-size: 11px;
  font-weight: 700;
}
.summary-heading,
.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: start;
}
.eyebrow {
  color: var(--status-violet-text);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.origin {
  padding: 4px 8px;
  color: var(--text-secondary);
  font-size: 9px;
  background: var(--surface-subtle);
  border-radius: 999px;
}
.contract-summary > p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.contract-effect {
  display: grid;
  gap: 3px;
}
.contract-effect strong {
  color: var(--text-primary);
  font-size: 11px;
}
dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
}
dl div {
  display: grid;
  gap: 3px;
  padding: 8px 9px;
  background: var(--surface-subtle);
  border-radius: 8px;
}
dt {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
dd {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.section-heading h3 {
  margin: 0 0 3px;
  font-size: 14px;
}
.section-heading > span {
  color: var(--text-secondary);
  font-size: 11px;
}
.surface-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.surface-control {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 11px 12px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}
.surface-control.ai {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 32%,
    var(--border-default)
  );
}
.surface-control.unsupported {
  opacity: 0.65;
}
.surface-copy {
  display: grid;
  gap: 3px;
}
.surface-copy strong {
  font-size: 12px;
}
.surface-copy small,
.audit-field small {
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.35;
}
.field-label {
  font-size: 12px;
  font-weight: 700;
}
.field-label em {
  color: var(--status-warning-text);
  font-size: 9px;
  font-style: normal;
  text-transform: uppercase;
}
.ai-setup :deep(textarea),
.audit-field :deep(input) {
  width: 100%;
}
.effect-lock {
  display: flex;
  gap: 9px;
  align-items: start;
  padding: 9px 10px;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.4;
  background: var(--surface-subtle);
  border-radius: 8px;
}
.effect-lock i {
  margin-top: 2px;
  color: var(--status-success-text);
}
.audit-field {
  display: grid;
  gap: 7px;
}
.preview-section {
  background: color-mix(
    in srgb,
    var(--action-primary) 4%,
    var(--surface-raised)
  );
}
.editor-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
}
.confirmation {
  display: grid;
  gap: 14px;
}
ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
.confirmation pre {
  overflow: auto;
  margin: 0;
  max-width: 100%;
  white-space: pre-wrap;
}
.p-message small {
  display: block;
  margin-top: 5px;
}
@media (max-width: 680px) {
  .surface-controls {
    grid-template-columns: 1fr;
  }
  dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-heading,
  .section-heading {
    display: grid;
  }
  .editor-actions {
    display: grid;
  }
  .editor-actions :deep(button) {
    width: 100%;
  }
}
@media (max-width: 420px) {
  dl {
    grid-template-columns: 1fr;
  }
}
</style>
