<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import type { CmsUser } from '@/shared/types/domain'
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
} from '../model/project-action'
import type { ProjectActionError } from '../model/project-action-error'
import { buildProjectActionForm, validateProjectActionConfiguration } from '../model/schema-form'
import AiCapabilityPreviewPanel from './AiCapabilityPreview.vue'
import ProjectActionSchemaForm from './ProjectActionSchemaForm.vue'

const props = defineProps<{
  action: ProjectAction
  role: CmsUser['role']
  preview?: AiCapabilityPreview
  previewLoading?: boolean
  previewError?: ProjectActionError | null
  saving?: boolean
  mutationError?: ProjectActionError | null
}>()
const emit = defineEmits<{
  save: [input: ConfigureProjectActionInput]
  archive: []
  retryPreview: []
}>()

const draft = ref(createProjectActionDraft(props.action))
const issues = ref<ProjectActionDraftIssue[]>([])
const confirmSaveVisible = ref(false)
const confirmArchiveVisible = ref(false)
const canEdit = computed(() => canConfigureProjectActions(props.role) && props.action.lifecycle !== 'ARCHIVED')
const supportsScenario = computed(() => props.action.actionTypeRevision.supportedSurfaces.includes('SCENARIO'))
const supportsAi = computed(() => props.action.actionTypeRevision.supportedSurfaces.includes('AI'))
const needsAuditReason = computed(() => requiresAiAuditReason(props.action, draft.value))
const schemaForm = computed(() => buildProjectActionForm(
  props.action.actionTypeRevision.projectConfigSchema,
  props.action.actionTypeRevision.uiSchema,
))

watch(() => props.action, (action) => {
  draft.value = createProjectActionDraft(action)
  issues.value = []
  confirmSaveVisible.value = false
}, { deep: true })

function submit() {
  issues.value = validateProjectActionDraft(props.action, draft.value, props.role)
  if (schemaForm.value.blocked) {
    issues.value.push({
      field: 'configuration',
      code: 'PROJECT_ACTION_CONFIGURATION_SCHEMA_UNSUPPORTED',
      message: 'Конфигурацию нельзя сохранить, пока backend schema не поддерживается безопасным редактором.',
    })
  } else {
    issues.value.push(...validateProjectActionConfiguration(
      schemaForm.value,
      draft.value.configuration,
    ).map((issue) => ({
      field: 'configuration' as const,
      code: issue.code,
      message: issue.message,
    })))
  }
  if (issues.value.length) return
  confirmSaveVisible.value = true
}

function confirmSave() {
  confirmSaveVisible.value = false
  emit('save', toConfigureProjectActionInput(draft.value))
}

function confirmArchive() {
  confirmArchiveVisible.value = false
  emit('archive')
}
</script>

<template>
  <form class="project-action-editor" novalidate @submit.prevent="submit">
    <section class="contract-summary">
      <div class="summary-heading">
        <div><span class="eyebrow">Закреплённый контракт</span><h2>{{ action.nameOverride || action.actionTypeRevision.name }}</h2><code>{{ action.code }}</code></div>
        <span class="origin">{{ action.actionType.origin === 'SYSTEM' ? 'System' : 'Integration' }} · revision {{ action.actionTypeRevision.version }}</span>
      </div>
      <p>{{ action.descriptionOverride || action.actionTypeRevision.description }}</p>
      <dl>
        <div><dt>Фактический эффект</dt><dd>{{ action.actionTypeRevision.description }}</dd></div>
        <div><dt>Executor</dt><dd>{{ action.actionTypeRevision.executorAdapter }}</dd></div>
        <div><dt>Риск</dt><dd>{{ action.actionTypeRevision.risk }}</dd></div>
        <div><dt>Подтверждение</dt><dd>{{ action.actionTypeRevision.confirmationPolicy }}</dd></div>
      </dl>
    </section>

    <Message v-if="!canEdit" severity="info" :closable="false">
      {{ action.lifecycle === 'ARCHIVED' ? 'Архивное действие доступно только для чтения.' : 'Просматривать могут все участники проекта. Изменять и архивировать может только OWNER.' }}
    </Message>
    <Message v-if="mutationError" severity="error" :closable="false">{{ mutationError.message }}<small v-if="mutationError.requestId">Request ID: {{ mutationError.requestId }}</small></Message>
    <Message v-if="issues.length" severity="error" :closable="false" role="alert" aria-labelledby="project-action-validation-title">
      <strong id="project-action-validation-title">Исправьте настройки перед публикацией</strong>
      <ul><li v-for="issue in issues" :key="`${issue.field}:${issue.code}`">{{ issue.message }}</li></ul>
    </Message>

    <section class="editor-section">
      <div class="section-heading"><div><h3>Поверхности</h3><p>Scenario и AI включаются независимо. Backend повторно проверит поддержку и права.</p></div></div>
      <div class="surface-controls">
        <label class="surface-control" :class="{ unsupported: !supportsScenario }">
          <span class="surface-copy"><strong><i class="pi pi-sitemap" /> Использовать в сценариях</strong><small>{{ supportsScenario ? 'Действие появится в новых сценариях после сохранения.' : 'Action Type не поддерживает Scenario surface.' }}</small></span>
          <ToggleSwitch v-model="draft.scenarioEnabled" aria-label="Использовать в сценариях" :disabled="!canEdit || !supportsScenario" />
        </label>
        <label class="surface-control ai" :class="{ unsupported: !supportsAi }">
          <span class="surface-copy"><strong><i class="pi pi-sparkles" /> Разрешить AI</strong><small>{{ supportsAi ? 'Grok получит только backend-скомпилированный strict tool.' : 'Action Type не поддерживает AI surface.' }}</small></span>
          <ToggleSwitch v-model="draft.aiEnabled" aria-label="Разрешить AI" :disabled="!canEdit || !supportsAi" />
        </label>
      </div>
    </section>

    <section v-if="supportsAi" class="editor-section ai-setup">
      <div class="section-heading"><div><h3>AI Usage Description</h3><p>Опишите, когда Grok должен вызывать действие и когда не должен. Не меняйте заявленный фактический эффект.</p></div><span>{{ draft.aiUsageDescription.trim().length }}/2000</span></div>
      <label for="ai-usage-description" class="field-label">Описание для AI</label>
      <Textarea id="ai-usage-description" v-model="draft.aiUsageDescription" rows="5" minlength="20" maxlength="2000" :disabled="!canEdit" placeholder="Используй, когда пользователь явно просит… Не используй, когда…" />
      <div class="effect-lock"><i class="pi pi-lock" /><span><strong>Эффект нельзя переопределить текстом:</strong> {{ action.actionTypeRevision.description }}</span></div>
      <label v-if="needsAuditReason" for="ai-audit-reason" class="audit-field">
        <span class="field-label">Причина включения или расширения AI <em>обязательно</em></span>
        <InputText id="ai-audit-reason" v-model="draft.auditReason" minlength="10" maxlength="500" :disabled="!canEdit" placeholder="Почему проекту нужен этот AI-доступ" />
        <small>Причина попадёт в audit атомарно с изменением authority.</small>
      </label>
    </section>

    <section class="editor-section">
      <div class="section-heading"><div><h3>Безопасная конфигурация</h3><p>Редактор принимает только поддерживаемые поля из projectConfigSchema. Route, selector, URL, token, handler и script недоступны.</p></div></div>
      <ProjectActionSchemaForm v-model="draft.configuration" :schema="action.actionTypeRevision.projectConfigSchema" :ui-schema="action.actionTypeRevision.uiSchema" :disabled="!canEdit" />
    </section>

    <section v-if="supportsAi" class="editor-section preview-section">
      <AiCapabilityPreviewPanel :preview="preview" :loading="previewLoading" :error="previewError" @retry="emit('retryPreview')" />
    </section>

    <footer class="editor-actions">
      <Button v-if="canEdit" data-test="archive-project-action" label="Архивировать" icon="pi pi-archive" severity="danger" text type="button" :disabled="saving" @click="confirmArchiveVisible = true" />
      <span v-else />
      <Button data-test="save-project-action" label="Проверить и сохранить" icon="pi pi-check" type="submit" :loading="saving" :disabled="!canEdit || schemaForm.blocked" />
    </footer>
  </form>

  <Dialog v-model:visible="confirmSaveVisible" modal header="Подтвердите изменение AI authority" :style="{ width: 'min(620px, 94vw)' }">
    <div class="confirmation">
      <Message severity="warn" :closable="false"><strong>Backend применит authoritative policy.</strong> Изменение Scenario и AI surfaces не объединяется в один общий статус.</Message>
      <dl>
        <div><dt>Действие</dt><dd>{{ action.code }} · revision {{ action.actionTypeRevision.version }}</dd></div>
        <div><dt>Сценарии</dt><dd>{{ draft.scenarioEnabled ? 'Включено' : 'Выключено' }}</dd></div>
        <div><dt>AI</dt><dd>{{ draft.aiEnabled ? 'Включено' : 'Выключено' }}</dd></div>
        <div v-if="draft.aiEnabled"><dt>AI Usage Description</dt><dd>{{ draft.aiUsageDescription.trim() }}</dd></div>
        <div><dt>Конфигурация</dt><dd><pre>{{ JSON.stringify(draft.configuration, null, 2) }}</pre></dd></div>
        <div><dt>Фактический эффект</dt><dd>{{ action.actionTypeRevision.description }}</dd></div>
        <div><dt>Риск</dt><dd>{{ action.actionTypeRevision.risk }}</dd></div>
        <div><dt>Revision impact</dt><dd>Остаётся закреплена revision {{ action.actionTypeRevision.version }}. Backend вернёт authoritative published view.</dd></div>
        <div v-if="needsAuditReason"><dt>Audit reason</dt><dd>{{ draft.auditReason.trim() }}</dd></div>
      </dl>
      <Message v-if="draft.aiEnabled" severity="info" :closable="false">Текущий backend preview ниже относится к опубликованной конфигурации. После сохранения CMS запросит его заново и покажет точный effective tool.</Message>
    </div>
    <template #footer><Button label="Отмена" severity="secondary" text @click="confirmSaveVisible = false" /><Button data-test="confirm-project-action-save" label="Подтвердить и сохранить" @click="confirmSave" /></template>
  </Dialog>

  <Dialog v-model:visible="confirmArchiveVisible" modal header="Архивировать действие?" :style="{ width: 'min(520px, 94vw)' }">
    <p>Backend заблокирует архивирование, если действие используется активными сценариями или открытыми AI invocations.</p>
    <template #footer><Button label="Отмена" severity="secondary" text @click="confirmArchiveVisible = false" /><Button label="Архивировать" severity="danger" @click="confirmArchive" /></template>
  </Dialog>
</template>

<style scoped>
.project-action-editor { display: grid; gap: 18px; }
.contract-summary, .editor-section { display: grid; gap: 14px; padding: 18px; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 15px; }
.summary-heading, .section-heading { display: flex; justify-content: space-between; gap: 18px; align-items: start; }
.summary-heading h2 { margin: 3px 0; font-size: 20px; }
.summary-heading code { color: var(--text-color-secondary); font-size: 11px; }
.eyebrow { color: var(--primary-color); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.origin { padding: 5px 9px; color: var(--text-color-secondary); font-size: 10px; background: var(--surface-ground); border-radius: 999px; }
.contract-summary > p, .section-heading p { margin: 0; color: var(--text-color-secondary); font-size: 12px; line-height: 1.5; }
dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin: 0; }
dl div { display: grid; gap: 4px; padding: 10px; background: var(--surface-ground); border-radius: 9px; }
dt { color: var(--text-color-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase; }
dd { margin: 0; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.section-heading h3 { margin: 0 0 4px; font-size: 15px; }
.section-heading > span { color: var(--text-color-secondary); font-size: 11px; }
.surface-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.surface-control { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 14px; background: var(--surface-ground); border: 1px solid var(--surface-border); border-radius: 12px; }
.surface-control.ai { border-color: color-mix(in srgb, var(--primary-color) 22%, var(--surface-border)); }
.surface-control.unsupported { opacity: .65; }
.surface-copy { display: grid; gap: 5px; }
.surface-copy strong { font-size: 13px; }
.surface-copy small, .audit-field small { color: var(--text-color-secondary); font-size: 11px; line-height: 1.4; }
.field-label { font-size: 12px; font-weight: 700; }
.field-label em { color: var(--orange-600); font-size: 9px; font-style: normal; text-transform: uppercase; }
.ai-setup :deep(textarea), .audit-field :deep(input) { width: 100%; }
.effect-lock { display: flex; gap: 9px; align-items: start; padding: 10px 12px; color: var(--text-color-secondary); font-size: 11px; line-height: 1.45; background: var(--surface-ground); border-radius: 9px; }
.effect-lock i { margin-top: 2px; color: var(--green-600); }
.audit-field { display: grid; gap: 7px; }
.preview-section { background: color-mix(in srgb, var(--primary-color) 3%, var(--surface-card)); }
.editor-actions { display: flex; justify-content: space-between; gap: 12px; padding-top: 4px; }
.confirmation { display: grid; gap: 14px; }
ul { margin: 8px 0 0; padding-left: 20px; }
.confirmation pre { overflow: auto; margin: 0; max-width: 100%; white-space: pre-wrap; }
.p-message small { display: block; margin-top: 5px; }
@media (max-width: 680px) { .surface-controls, dl { grid-template-columns: 1fr; } .summary-heading, .section-heading { display: grid; } .editor-actions { display: grid; } .editor-actions :deep(button) { width: 100%; } }
</style>
