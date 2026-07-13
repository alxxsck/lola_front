<script setup lang="ts">
import { computed, reactive, ref, toRaw, watch } from 'vue'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import ActionConfigFields from '@/features/actions/ActionConfigFields.vue'
import type {
  ActionType,
  EventDefinition,
  Scenario,
  ScenarioAction,
  ScenarioActionDefinition,
  ScenarioCondition,
  ScenarioStatus,
  UiElement,
} from '@/shared/types/domain'
import { slugify, uid } from '@/shared/lib/format'
import {
  createActionConfig,
  findActionDefinition,
  sanitizeActionConfig,
  validateScenarioActionConfig,
} from '@/shared/lib/action-definition'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'

type ScenarioPayload = Partial<Scenario> &
  Pick<Scenario, 'name' | 'code' | 'eventDefinitionId' | 'actions'>

interface ScenarioForm {
  id?: string
  name: string
  code: string
  description: string
  status: ScenarioStatus
  eventDefinitionId: string
  priority: number
  cooldownSeconds: number | null
  maxRunsPerUser: number | null
  activeFrom: string
  activeTo: string
  conditions: ScenarioCondition[]
  actions: ScenarioAction[]
}

const props = defineProps<{
  visible: boolean
  scenario: Scenario | null
  events: EventDefinition[]
  elements: UiElement[]
  actionDefinitions: ScenarioActionDefinition[]
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  save: [value: ScenarioPayload]
}>()

const statusOptions: { label: string; value: ScenarioStatus }[] = [
  { label: 'Черновик', value: 'DRAFT' },
  { label: 'Активен', value: 'ACTIVE' },
  { label: 'На паузе', value: 'PAUSED' },
  { label: 'В архиве', value: 'ARCHIVED' },
]

const conditionOperators = [
  { label: 'равно', value: 'eq' }, { label: 'не равно', value: 'neq' },
  { label: 'больше', value: 'gt' }, { label: 'не меньше', value: 'gte' },
  { label: 'меньше', value: 'lt' }, { label: 'не больше', value: 'lte' },
  { label: 'в списке', value: 'in' }, { label: 'содержит', value: 'contains' },
  { label: 'существует', value: 'exists' },
]

const createForm = (): ScenarioForm => ({
  id: undefined,
  name: '',
  code: '',
  description: '',
  status: 'DRAFT',
  eventDefinitionId: '',
  priority: 0,
  cooldownSeconds: null,
  maxRunsPerUser: null,
  activeFrom: '',
  activeTo: '',
  conditions: [],
  actions: [],
})

const form = reactive<ScenarioForm>(createForm())
const formError = ref('')
const codeTouched = ref(false)
const actionToAdd = ref<ActionType>('')
const invalidActionKeys = ref(new Set<string>())
const initialSnapshot = ref('')
const isDirty = computed(() => props.visible && Boolean(initialSnapshot.value) && JSON.stringify(form) !== initialSnapshot.value)
const { confirmDiscard } = useUnsavedChangesGuard(isDirty, 'Есть несохранённые изменения сценария. Закрыть редактор?')

const actionOptions = computed(() => props.actionDefinitions
  .filter((definition) => definition.enabled)
  .map((definition) => ({ label: definition.name, value: definition.type })),
)
const unsupportedActions = computed(() => [...new Set(form.actions
  .filter((action) => !definitionFor(action.type)?.enabled)
  .map((action) => action.type))])

const eventOptions = computed(() =>
  props.events.map((event) => ({ label: event.name, code: event.code, value: event.id })),
)
const selectedTrigger = computed(() =>
  props.events.find((event) => event.id === form.eventDefinitionId),
)
const templateVariables = computed(() => {
  const eventFields = Object.keys(selectedTrigger.value?.payloadSchema?.properties ?? {})
  return ['{{ user.displayName }}', '{{ user.segment }}', ...eventFields.map((field) => `{{ event.payload.${field} }}`)]
})

const flowNodes = computed<Node[]>(() => {
  const nodes: Node[] = [
    {
      id: 'trigger',
      type: 'input',
      position: { x: 24, y: 58 },
      data: { label: selectedTrigger.value?.name ?? 'Выберите событие' },
    },
  ]

  form.actions.forEach((action, index) => {
    nodes.push({
      id: action.id ?? `action-${index}`,
      position: { x: 250 + index * 220, y: 58 },
      data: { label: `${index + 1}. ${actionLabel(action.type)}` },
    })
  })
  return nodes
})

const flowEdges = computed<Edge[]>(() => {
  const ids = flowNodes.value.map((node) => node.id)
  return ids.slice(1).map((id, index) => ({
    id: `edge-${ids[index]}-${id}`,
    source: ids[index],
    target: id,
    animated: true,
  }))
})

watch(
  () => [props.visible, props.scenario] as const,
  ([visible]) => {
    if (!visible) return
    const source = props.scenario
    Object.assign(form, createForm(), source ? {
      id: source.id,
      name: source.name,
      code: source.code,
      description: source.description ?? '',
      status: source.status,
      eventDefinitionId: source.eventDefinitionId,
      priority: source.priority,
      cooldownSeconds: source.cooldownSeconds ?? null,
      maxRunsPerUser: source.maxRunsPerUser ?? null,
      activeFrom: toLocalDateTime(source.activeFrom),
      activeTo: toLocalDateTime(source.activeTo),
      conditions: cloneFormData(source.conditions ?? []),
      actions: cloneFormData(source.actions).sort((a, b) => a.position - b.position),
    } : {})
    codeTouched.value = Boolean(source)
    formError.value = ''
    invalidActionKeys.value = new Set()
    actionToAdd.value = actionOptions.value[0]?.value ?? ''
    initialSnapshot.value = JSON.stringify(form)
  },
  { immediate: true },
)

watch(actionOptions, (options) => {
  if (!options.some((option) => option.value === actionToAdd.value)) actionToAdd.value = options[0]?.value ?? ''
}, { immediate: true })

function requestVisibility(value: boolean) {
  if (!value && !confirmDiscard()) return
  emit('update:visible', value)
}

function actionLabel(type: ActionType) {
  return definitionFor(type)?.name ?? type
}

function actionIcon(type: ActionType) {
  return definitionFor(type)?.executor === 'SERVER' ? 'pi pi-server' : 'pi pi-desktop'
}

function definitionFor(type: ActionType) {
  return findActionDefinition(props.actionDefinitions, type)
}

function updateName(value: string | undefined) {
  form.name = value ?? ''
  if (!codeTouched.value) form.code = slugify(form.name)
}

function defaultConfig(type: ActionType): Record<string, unknown> {
  const definition = definitionFor(type)
  return definition ? createActionConfig(definition) : {}
}

function addCondition() {
  form.conditions.push({ path: 'user.segment', operator: 'eq', value: '' })
}

function removeCondition(index: number) {
  form.conditions.splice(index, 1)
}

function addAction() {
  if (!actionToAdd.value || !definitionFor(actionToAdd.value)?.enabled) return
  form.actions.push({
    id: uid('act'),
    position: form.actions.length,
    type: actionToAdd.value,
    config: defaultConfig(actionToAdd.value),
  })
}

function changeActionType(action: ScenarioAction, type: ActionType) {
  setActionConfigValidity(action, true)
  action.type = type
  action.config = defaultConfig(type)
}

function removeAction(index: number) {
  setActionConfigValidity(form.actions[index], true)
  form.actions.splice(index, 1)
  normalizePositions()
}

function moveAction(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= form.actions.length) return
  const [action] = form.actions.splice(index, 1)
  form.actions.splice(target, 0, action)
  normalizePositions()
}

function normalizePositions() {
  form.actions.forEach((action, index) => { action.position = index })
}

function actionValidationError(action: ScenarioAction) {
  return validateScenarioActionConfig(action, definitionFor(action.type))
}

function updateActionConfig(action: ScenarioAction, config: Record<string, unknown>) {
  const definition = definitionFor(action.type)
  action.config = definition ? sanitizeActionConfig(definition, config) : config
}

function actionKey(action: ScenarioAction) {
  return action.id ?? `position-${action.position}`
}

function setActionConfigValidity(action: ScenarioAction, valid: boolean) {
  const next = new Set(invalidActionKeys.value)
  if (valid) next.delete(actionKey(action))
  else next.add(actionKey(action))
  invalidActionKeys.value = next
}

function submit() {
  formError.value = ''
  if (!form.name.trim()) formError.value = 'Укажите название сценария.'
  else if (!form.code.trim()) formError.value = 'Укажите системный код.'
  else if (!/^[a-z][a-z0-9_.-]*$/.test(form.code)) formError.value = 'Код должен начинаться с буквы и может содержать строчные буквы, цифры, _, . и -.'
  else if (!form.eventDefinitionId) formError.value = 'Выберите событие-триггер.'
  else if (!form.actions.length) formError.value = 'Добавьте хотя бы одно действие.'
  else if (form.actions.length > 50) formError.value = 'Backend принимает не больше 50 действий.'
  else if (invalidActionKeys.value.size) formError.value = 'Исправьте JSON в настройках действий перед сохранением.'
  else if (unsupportedActions.value.length) formError.value = `В каталоге проекта нет активных действий: ${unsupportedActions.value.join(', ')}. Удалите или замените эти шаги.`
  else if (form.activeFrom && form.activeTo && new Date(form.activeFrom) >= new Date(form.activeTo)) formError.value = 'Дата начала должна быть раньше даты окончания.'
  else {
    const invalidCondition = form.conditions.findIndex((condition) => !/^(event|user|project|scenario)(\.[a-zA-Z0-9_-]+)+$/.test(condition.path.trim()))
    if (invalidCondition >= 0) formError.value = `Условие ${invalidCondition + 1}: путь должен начинаться с event, user, project или scenario.`
  }
  if (!formError.value) {
    const invalidIndex = form.actions.findIndex((action) => actionValidationError(action))
    if (invalidIndex >= 0) formError.value = `Шаг ${invalidIndex + 1}: ${actionValidationError(form.actions[invalidIndex])}`
  }

  if (formError.value) return
  normalizePositions()
  emit('save', {
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(),
    code: form.code.trim(),
    description: form.description.trim() || undefined,
    status: form.status,
    eventDefinitionId: form.eventDefinitionId,
    priority: form.priority,
    cooldownSeconds: form.cooldownSeconds ?? undefined,
    maxRunsPerUser: form.maxRunsPerUser ?? undefined,
    activeFrom: toIsoDateTime(form.activeFrom),
    activeTo: toIsoDateTime(form.activeTo),
    conditions: form.conditions.map((condition) => ({
      path: condition.path.trim(),
      operator: condition.operator,
      ...(condition.operator === 'exists' ? {} : { value: condition.value }),
    })),
    actions: cloneFormData(form.actions),
  })
}

function cloneFormData<T extends object>(value: T): T {
  return structuredClone(toRaw(value))
}

function toLocalDateTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : undefined
}
</script>

<template>
  <Drawer
    :visible="visible"
    position="right"
    class="scenario-drawer"
    :style="{ width: 'min(980px, 100vw)' }"
    @update:visible="requestVisibility"
  >
    <template #header>
      <div>
        <div class="eyebrow">{{ scenario ? 'Редактирование' : 'Новый сценарий' }}</div>
        <h2>{{ scenario?.name ?? 'Соберите реакцию Lola' }}</h2>
      </div>
    </template>

    <form class="editor" @submit.prevent="submit">
      <section class="editor-section surface-soft">
        <div class="section-heading">
          <span class="section-number">01</span>
          <div><h3>Основное</h3><p>Событие запуска и правила выполнения сценария.</p></div>
        </div>
        <div class="form-grid">
          <div class="field field-wide">
            <label for="scenario-name">Название</label>
            <InputText id="scenario-name" :model-value="form.name" placeholder="После регистрации" @update:model-value="updateName" />
          </div>
          <div class="field">
            <label for="scenario-code">Системный код</label>
            <InputText id="scenario-code" v-model="form.code" class="mono" placeholder="after_registration" @input="codeTouched = true" />
          </div>
          <div class="field">
            <label for="scenario-status">Статус</label>
            <Select id="scenario-status" v-model="form.status" :options="statusOptions" option-label="label" option-value="value" />
          </div>
          <div class="field field-wide">
            <label for="scenario-description">Описание</label>
            <Textarea id="scenario-description" v-model="form.description" rows="2" auto-resize placeholder="Что должен сделать этот сценарий" />
          </div>
          <div class="field trigger-field">
            <label for="scenario-event">Событие-триггер</label>
            <Select id="scenario-event" v-model="form.eventDefinitionId" :options="eventOptions" option-label="label" option-value="value" placeholder="Выберите событие">
              <template #option="slotProps">
                <div><strong>{{ slotProps.option.label }}</strong><small class="mono">{{ slotProps.option.code }}</small></div>
              </template>
            </Select>
          </div>
          <div class="field">
            <label for="scenario-priority">Приоритет</label>
            <InputNumber id="scenario-priority" v-model="form.priority" :min="0" :max="1000" show-buttons />
          </div>
          <div class="field">
            <label for="scenario-cooldown">Пауза, секунд</label>
            <InputNumber id="scenario-cooldown" v-model="form.cooldownSeconds" :min="0" placeholder="Без ограничения" />
          </div>
          <div class="field">
            <label for="scenario-runs">Запусков на пользователя</label>
            <InputNumber id="scenario-runs" v-model="form.maxRunsPerUser" :min="1" placeholder="Без ограничения" />
          </div>
          <div class="field field-wide">
            <label for="scenario-active-from">Активен с</label>
            <InputText id="scenario-active-from" v-model="form.activeFrom" type="datetime-local" />
          </div>
          <div class="field field-wide">
            <label for="scenario-active-to">Активен до</label>
            <InputText id="scenario-active-to" v-model="form.activeTo" type="datetime-local" />
          </div>
        </div>
        <div class="conditions-block">
          <div class="row-between"><div><strong>Условия запуска</strong><p>Все условия проверяются одновременно. Поддерживаются `user.*` и `event.payload.*`.</p></div><Button type="button" label="Добавить условие" icon="pi pi-plus" size="small" severity="secondary" @click="addCondition" /></div>
          <div v-if="form.conditions.length" class="condition-list"><div v-for="(condition, index) in form.conditions" :key="index" class="condition-row"><InputText v-model="condition.path" class="mono" placeholder="user.segment" /><Select v-model="condition.operator" :options="conditionOperators" option-label="label" option-value="value" /><InputText :model-value="String(condition.value ?? '')" placeholder="new_user" :disabled="condition.operator === 'exists'" @update:model-value="condition.value = $event" /><Button type="button" icon="pi pi-times" severity="danger" text rounded aria-label="Удалить условие" @click="removeCondition(index)" /></div></div>
          <div v-else class="no-conditions">Без дополнительных условий — сценарий запустится для любого пользователя.</div>
        </div>
      </section>

      <section class="editor-section flow-section">
        <div class="section-heading">
          <span class="section-number">02</span>
          <div><h3>Схема</h3><p>Backend сохранит действия в том же линейном порядке.</p></div>
        </div>
        <div class="flow-preview">
          <VueFlow :nodes="flowNodes" :edges="flowEdges" :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="false" fit-view-on-init :min-zoom="0.35" :max-zoom="1.15">
            <Background :gap="20" :size="1" pattern-color="#dcddd7" />
            <Controls :show-interactive="false" />
          </VueFlow>
        </div>
      </section>

      <section class="editor-section">
        <div class="section-heading actions-heading">
          <span class="section-number">03</span>
          <div><h3>Действия</h3><p>Добавляйте шаги и меняйте их порядок.</p></div>
          <span class="action-count">{{ form.actions.length }} шагов</span>
        </div>

        <Message severity="secondary" :closable="false" class="activation-note">
          Доступные шаги и их поля синхронизированы с каталогом backend для текущего проекта.
        </Message>
        <Message v-if="unsupportedActions.length" severity="warn" :closable="false" class="unsupported-note">
          Отключённые или удалённые действия: <strong>{{ unsupportedActions.join(', ') }}</strong>. Такие шаги доступны только для чтения; удалите или замените их перед сохранением.
        </Message>

        <div v-if="form.actions.length" class="action-list">
          <article v-for="(action, index) in form.actions" :key="action.id ?? index" class="action-card">
            <div class="action-rail"><span>{{ index + 1 }}</span><i v-if="index < form.actions.length - 1" /></div>
            <div class="action-body">
              <div class="action-toolbar">
                <div class="action-title"><span class="action-icon"><i :class="actionIcon(action.type)" /></span><strong>{{ actionLabel(action.type) }}</strong></div>
                <div class="action-buttons">
                  <Button type="button" icon="pi pi-arrow-up" text rounded size="small" aria-label="Переместить выше" :disabled="index === 0" @click="moveAction(index, -1)" />
                  <Button type="button" icon="pi pi-arrow-down" text rounded size="small" aria-label="Переместить ниже" :disabled="index === form.actions.length - 1" @click="moveAction(index, 1)" />
                  <Button type="button" icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Удалить шаг" @click="removeAction(index)" />
                </div>
              </div>

              <div v-if="!definitionFor(action.type)?.enabled" class="unsupported-action">
                <i class="pi pi-lock" />
                <div><strong>Шаг доступен только для чтения</strong><span>Тип {{ action.type }} отключён или отсутствует в каталоге текущего проекта.</span></div>
              </div>
              <div v-else-if="definitionFor(action.type)" class="action-fields">
                <div class="field action-type-field">
                  <label>Тип действия</label>
                  <Select :model-value="action.type" :options="actionOptions" option-label="label" option-value="value" @update:model-value="changeActionType(action, $event as ActionType)" />
                </div>
                <ActionConfigFields
                  class="field-fill"
                  :definition="definitionFor(action.type)!"
                  :model-value="action.config"
                  :events="events"
                  :elements="elements"
                  :instance-id="actionKey(action)"
                  :template-variables="templateVariables"
                  @update:model-value="updateActionConfig(action, $event)"
                  @validity-change="setActionConfigValidity(action, $event)"
                />
              </div>
              <small v-if="actionValidationError(action)" class="action-error">{{ actionValidationError(action) }}</small>
            </div>
          </article>
        </div>
        <div v-else class="empty-actions"><i class="pi pi-sitemap" /><strong>Действий пока нет</strong><span>Добавьте первый шаг — например, сообщение или анимацию.</span></div>

        <div class="add-action surface-soft">
          <Select v-model="actionToAdd" :options="actionOptions" option-label="label" option-value="value" />
          <Button type="button" label="Добавить действие" icon="pi pi-plus" @click="addAction" />
        </div>
      </section>

      <Message v-if="formError" severity="error" :closable="false">{{ formError }}</Message>

      <footer class="editor-footer">
        <Button type="button" label="Отмена" severity="secondary" outlined @click="requestVisibility(false)" />
        <Button type="submit" :label="scenario ? 'Сохранить изменения' : 'Создать сценарий'" icon="pi pi-check" :loading="saving" />
      </footer>
    </form>
  </Drawer>
</template>

<style scoped>
.editor{display:flex;flex-direction:column;gap:24px;padding:2px 2px 16px}.editor-section{padding:22px;border-radius:18px;background:#fff;border:1px solid var(--line)}.editor-section.surface-soft{background:#f8f8f5}.section-heading{display:flex;align-items:flex-start;gap:12px;margin-bottom:20px}.section-heading h3{margin:0;font:700 1rem Manrope}.section-heading p{margin:4px 0 0;color:var(--muted);font-size:.8rem}.section-number{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:11px;background:#e8f3c8;color:#596b26;font:700 .68rem Manrope}.form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.field-wide{grid-column:span 2}.trigger-field{grid-column:span 2}.p-select small{display:block;margin-top:3px;color:var(--muted);font-size:.68rem}.flow-section{padding-bottom:18px}.flow-preview{height:190px;border-radius:14px;overflow:hidden;background:#fafaf8;border:1px solid #ecece7}.action-count{margin-left:auto;padding:6px 9px;background:#f0f1eb;border-radius:8px;color:var(--muted);font-size:.72rem}.action-list{display:flex;flex-direction:column}.action-card{display:grid;grid-template-columns:42px minmax(0,1fr)}.action-rail{display:flex;align-items:center;flex-direction:column}.action-rail span{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#22251f;color:#fff;font:700 .7rem Manrope}.action-rail i{width:1px;flex:1;min-height:22px;background:#dfe0da}.action-body{margin:0 0 14px;padding:16px;border:1px solid var(--line);border-radius:16px;background:#fff}.action-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.action-title{display:flex;align-items:center;gap:9px}.action-title strong{font-size:.88rem}.action-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#f0edff;color:#6853ca}.action-buttons{display:flex;gap:2px}.action-fields{display:grid;grid-template-columns:minmax(190px,.75fr) repeat(2,minmax(150px,1fr));gap:12px;align-items:end}.action-type-field{grid-column:span 1}.field-fill{grid-column:span 2}.no-config{grid-column:span 2;align-self:end;padding:11px 13px;border-radius:11px;background:#f4f6ed;color:#626858;font-size:.79rem}.no-config i{color:#75a536;margin-right:6px}.action-error{display:block;color:#c44747;margin-top:9px}.empty-actions{padding:40px 18px;text-align:center;color:var(--muted);border:1px dashed #d7d9d0;border-radius:16px}.empty-actions i,.empty-actions strong,.empty-actions span{display:block}.empty-actions i{font-size:1.7rem;margin-bottom:10px;color:#a9aea2}.empty-actions strong{color:var(--ink);font-size:.9rem}.empty-actions span{font-size:.78rem;margin-top:5px}.add-action{display:flex;gap:10px;padding:12px;margin:6px 0 0 42px}.add-action .p-select{flex:1}.editor-footer{position:sticky;bottom:-16px;z-index:4;display:flex;justify-content:flex-end;gap:10px;padding:16px 0 0;background:linear-gradient(transparent,#fff 22%)}
:deep(.vue-flow__node){min-width:170px;padding:11px 14px;border-radius:12px;border:1px solid #dfe0da;box-shadow:0 8px 24px rgba(38,42,33,.07);font:600 .75rem 'DM Sans';background:#fff}:deep(.vue-flow__node-input){background:#22251f;color:#fff;border-color:#22251f}:deep(.vue-flow__edge-path){stroke:#8e77f5;stroke-width:2}:deep(.vue-flow__controls){box-shadow:none;border:1px solid var(--line);border-radius:9px;overflow:hidden}:deep(.vue-flow__controls-button){border:0;border-bottom:1px solid var(--line)}
@media(max-width:760px){.editor-section{padding:16px}.form-grid{grid-template-columns:1fr}.field-wide,.trigger-field{grid-column:auto}.action-fields{grid-template-columns:1fr}.action-type-field,.field-fill,.no-config{grid-column:auto}.action-card{grid-template-columns:32px minmax(0,1fr)}.action-body{padding:13px}.action-toolbar{align-items:flex-start}.add-action{margin-left:32px;flex-direction:column}.flow-preview{height:160px}.editor-footer{bottom:-16px}.actions-heading{flex-wrap:wrap}.action-count{margin-left:46px}}
.conditions-block{margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.conditions-block strong{font-size:.82rem}.conditions-block p{margin:4px 0 0;color:var(--muted);font-size:.72rem}.condition-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}.condition-row{display:grid;grid-template-columns:1fr 160px 1fr auto;gap:8px;align-items:center}.no-conditions{margin-top:12px;padding:11px;border:1px dashed #d7d9d0;border-radius:11px;color:var(--muted);font-size:.74rem}@media(max-width:760px){.conditions-block>.row-between{align-items:flex-start;flex-direction:column}.condition-row{grid-template-columns:1fr}.condition-row .p-button{justify-self:end}}
.variable-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.variable-pills button{border:1px solid #dddfe6;background:#f7f6ff;color:#6753c6;border-radius:7px;padding:4px 7px;font:500 .62rem ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.variable-pills button:hover{background:#ece8ff;border-color:#cfc6fb}
.activation-note,.unsupported-note{margin:0 0 14px}.unsupported-action{display:flex;align-items:flex-start;gap:11px;padding:14px;border:1px solid #eadba9;border-radius:12px;background:#fffaf0;color:#725f28}.unsupported-action>i{margin-top:2px}.unsupported-action strong,.unsupported-action span{display:block}.unsupported-action strong{font-size:.82rem}.unsupported-action span{margin-top:3px;font-size:.72rem;color:#897741}
</style>
