<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ActionConfigFields from '@/features/actions/ActionConfigFields.vue'
import { ScenarioGoalEditor, ScenarioGoalPreview } from '@/features/scenario-goals/ui'
import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import ScenarioConditionRows from './ScenarioConditionRows.vue'
import type { EventDefinition, ScenarioAction, ScenarioActionDefinition, UiElement } from '@/shared/types/domain'
import { availableTargets, choiceOptions, choiceReminders, conditionBranches } from './model/scenario-graph'
import { createActionConfig, findActionDefinition } from '@/shared/lib/action-definition'
import { slugify } from '@/shared/lib/format'

const props = defineProps<{
  projectId: string
  action: ScenarioAction
  actions: ScenarioAction[]
  actionDefinitions: ScenarioActionDefinition[]
  events: EventDefinition[]
  elements: UiElement[]
  templateVariables: string[]
  conditionPaths: string[]
  issues: string[]
  authoringContract: ScenarioAuthoringContract | null
}>()
const emit = defineEmits<{
  changeType: [type: string]
  createTarget: [type: string, kind: 'next' | 'choice' | 'timeout' | 'condition' | 'fallback', index?: number]
  remove: []
  validity: [valid: boolean]
  update: [action: ScenarioAction]
  rename: [oldKey: string, newKey: string]
  close: []
}>()

const createTargetPrefix = '__create__:'
const definition = computed(() => findActionDefinition(props.actionDefinitions, props.action.type))
const targets = computed(() => availableTargets(props.actions, props.action).map((target) => {
  const action = props.actions.find((item) => item.nodeKey === target.value)
  const targetDefinition = action ? findActionDefinition(props.actionDefinitions, action.type) : undefined
  return { ...target, label: `${targetDefinition?.name ?? action?.type ?? target.label} · ${target.value}` }
}))
const actionOptions = computed(() => props.actionDefinitions.filter((item) => item.enabled).map((item) => ({ label: item.name, value: item.type })))
const targetOptions = computed(() => [
  ...targets.value,
  ...actionOptions.value.map((option) => ({ label: `＋ Создать: ${option.label}`, value: `${createTargetPrefix}${option.value}` })),
])
const reminderActionOptions = computed(() => props.actionDefinitions
  .filter((item) => item.enabled && (item.type === 'SAY' || item.executor === 'FRONTEND'))
  .map((item) => ({ label: item.name, value: item.type })))
const genericDefinition = computed(() => {
  if (props.action.type === 'WAIT_FOR_GOAL') return undefined
  if (!definition.value || !['ASK_CHOICE', 'CONDITION'].includes(props.action.type)) return definition.value
  const hidden = props.action.type === 'ASK_CHOICE' ? new Set(['options', 'onTimeout', 'reminders']) : new Set(['branches', 'fallbackNodeKey'])
  return { ...definition.value, uiSchema: { ...definition.value.uiSchema, fields: definition.value.uiSchema.fields.filter((field) => !hidden.has(field.key)) } }
})

function updateAction(patch: Partial<ScenarioAction>) { emit('update', { ...props.action, ...patch }) }
function setConfig(key: string, value: unknown) { updateAction({ config: { ...props.action.config, [key]: value } }) }
function setOptions(value: ReturnType<typeof choiceOptions>) { setConfig('options', value) }
function setReminders(value: ReturnType<typeof choiceReminders>) { setConfig('reminders', value) }
function setBranches(value: ReturnType<typeof conditionBranches>) { setConfig('branches', value) }
function nextOptionId() {
  const used = new Set(choiceOptions(props.action).map((item) => item.id))
  let index = used.size + 1
  while (used.has(`option_${index}`)) index += 1
  return `option_${index}`
}
function addChoice() {
  setOptions([...choiceOptions(props.action), { id: nextOptionId(), label: '', nextNodeKey: '' }])
}
function updateChoice(index: number, patch: Record<string, string>) {
  setOptions(choiceOptions(props.action).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
}
function addBranch() {
  setBranches([...conditionBranches(props.action), { conditions: [{ path: props.conditionPaths[0] ?? 'user.segment', operator: 'eq', value: '' }], nextNodeKey: '' }])
}
function selectTarget(value: unknown, kind: 'next' | 'choice' | 'timeout' | 'condition' | 'fallback', index?: number) {
  const target = String(value ?? '')
  if (target.startsWith(createTargetPrefix)) {
    emit('createTarget', target.slice(createTargetPrefix.length), kind, index)
    return
  }
  if (kind === 'next') updateAction({ nextNodeKey: target || null })
  else if (kind === 'choice' && index !== undefined) updateChoice(index, { nextNodeKey: target })
  else if (kind === 'timeout') setConfig('onTimeout', target)
  else if (kind === 'condition' && index !== undefined) setBranches(conditionBranches(props.action).map((item, itemIndex) => itemIndex === index ? { ...item, nextNodeKey: target } : item))
  else if (kind === 'fallback') setConfig('fallbackNodeKey', target)
}
function addReminder() {
  const type = reminderActionOptions.value[0]?.value ?? 'SAY'
  const actionDefinition = findActionDefinition(props.actionDefinitions, type)
  setReminders([...choiceReminders(props.action), { afterMs: 10_000, actions: [{ type, config: actionDefinition ? createActionConfig(actionDefinition) : {} }] }])
}
function addReminderAction(reminderIndex: number) {
  const reminders = choiceReminders(props.action)
  const type = reminderActionOptions.value[0]?.value ?? 'SAY'
  const actionDefinition = findActionDefinition(props.actionDefinitions, type)
  reminders[reminderIndex].actions.push({ type, config: actionDefinition ? createActionConfig(actionDefinition) : {} })
  setReminders(reminders)
}
function changeReminderType(reminderIndex: number, actionIndex: number, type: string) {
  const reminders = choiceReminders(props.action)
  const actionDefinition = findActionDefinition(props.actionDefinitions, type)
  reminders[reminderIndex].actions[actionIndex] = { type, config: actionDefinition ? createActionConfig(actionDefinition) : {} }
  setReminders(reminders)
}
function updateNodeKey(value: string | undefined) {
  const oldKey = props.action.nodeKey
  const newKey = slugify(value ?? '').replace(/\./g, '_')
  emit('rename', oldKey ?? '', newKey)
}
</script>

<template>
  <aside class="inspector">
    <div class="inspector-head"><div><small>Узел {{ action.position + 1 }}</small><h2>{{ definition?.name ?? action.type }}</h2></div><div class="inspector-actions"><Button icon="pi pi-times" text rounded aria-label="Закрыть инспектор узла" @click="emit('close')" /><Button icon="pi pi-trash" text rounded severity="danger" aria-label="Удалить узел" @click="emit('remove')" /></div></div>
    <div v-if="issues.length" class="issue-box"><i class="pi pi-exclamation-circle" /><div><strong>Нужно исправить</strong><span v-for="issue in issues" :key="issue">{{ issue }}</span></div></div>
    <section>
      <h3>Основное</h3>
      <div class="field"><label>Тип действия</label><Select :model-value="action.type" :options="actionOptions" option-label="label" option-value="value" @update:model-value="emit('changeType', $event)" /></div>
      <div class="field"><label>Ключ узла</label><InputText :model-value="action.nodeKey" class="mono" @update:model-value="updateNodeKey" /><small>Стабильный ID для переходов, answers и results.</small></div>
      <div v-if="!['ASK_CHOICE', 'CONDITION', 'WAIT_FOR_GOAL'].includes(action.type)" class="field"><label>Следующее действие</label><Select :model-value="action.nextNodeKey" :options="targetOptions" option-label="label" option-value="value" show-clear placeholder="Завершить или выбрать действие" @update:model-value="selectTarget($event, 'next')" /></div>
    </section>
    <section>
      <h3>Параметры</h3>
      <ActionConfigFields v-if="genericDefinition" :model-value="action.config" :definition="genericDefinition" :elements="elements" :events="events" :template-variables="templateVariables" @update:model-value="updateAction({ config: $event })" @validity-change="emit('validity', $event)" />
      <ScenarioGoalEditor v-else-if="action.type === 'WAIT_FOR_GOAL' && authoringContract" :model-value="action.config" :contract="authoringContract" :targets="targets" @update:model-value="updateAction({ config: $event })" @validity-change="emit('validity', $event)" />
      <ScenarioGoalPreview v-if="action.type === 'WAIT_FOR_GOAL' && authoringContract" :project-id="projectId" :config="action.config" :contract="authoringContract" />
      <div v-else-if="action.type === 'WAIT_FOR_GOAL'" class="issue-box"><i class="pi pi-exclamation-circle" /><div><strong>Каталог недоступен</strong><span>Цель нельзя настроить без Scenario Authoring catalog.</span></div></div>
    </section>

    <section v-if="action.type === 'ASK_CHOICE'">
      <div class="section-title"><div><h3>Варианты ответа</h3><p>Выберите существующее следующее действие или создайте новое.</p></div><Button icon="pi pi-plus" text rounded aria-label="Добавить вариант" @click="addChoice" /></div>
      <div class="choice-card" v-for="(option, index) in choiceOptions(action)" :key="index">
        <div class="choice-grid"><InputText :model-value="option.label" placeholder="Текст кнопки" @update:model-value="updateChoice(index, { label: String($event ?? ''), id: option.id === `option_${index + 1}` ? slugify(String($event ?? '')) || option.id : option.id })" /><InputText :model-value="option.id" class="mono" placeholder="option_id" @update:model-value="updateChoice(index, { id: String($event ?? '') })" /></div>
        <div class="choice-target"><i class="pi pi-arrow-right" /><Select :model-value="option.nextNodeKey" :options="targetOptions" option-label="label" option-value="value" placeholder="Следующее действие" @update:model-value="selectTarget($event, 'choice', index)" /><Button icon="pi pi-trash" text rounded severity="danger" @click="setOptions(choiceOptions(action).filter((_, itemIndex) => itemIndex !== index))" /></div>
      </div>
      <div class="field timeout-field"><label>Действие по timeout</label><Select :model-value="action.config.onTimeout" :options="targetOptions" option-label="label" option-value="value" placeholder="Что выполнить без ответа" @update:model-value="selectTarget($event, 'timeout')" /></div>
    </section>

    <section v-if="action.type === 'CONDITION'">
      <div class="section-title"><div><h3>Runtime-ветки</h3><p>Проверяются сверху вниз; сработает первая.</p></div><Button icon="pi pi-plus" text rounded aria-label="Добавить ветку" @click="addBranch" /></div>
      <div class="branch-card" v-for="(branch, index) in conditionBranches(action)" :key="index">
        <div class="branch-head"><strong>Ветка {{ index + 1 }}</strong><Button icon="pi pi-trash" text rounded severity="danger" @click="setBranches(conditionBranches(action).filter((_, itemIndex) => itemIndex !== index))" /></div>
        <ScenarioConditionRows :model-value="branch.conditions" :paths="conditionPaths" @update:model-value="setBranches(conditionBranches(action).map((item, itemIndex) => itemIndex === index ? { ...item, conditions: $event } : item))" />
        <div class="branch-target"><span>Тогда</span><Select :model-value="branch.nextNodeKey" :options="targetOptions" option-label="label" option-value="value" placeholder="Следующее действие" @update:model-value="selectTarget($event, 'condition', index)" /></div>
      </div>
      <div class="field"><label>Иначе (fallback)</label><Select :model-value="action.config.fallbackNodeKey" :options="targetOptions" option-label="label" option-value="value" placeholder="Следующее действие" @update:model-value="selectTarget($event, 'fallback')" /></div>
    </section>

    <section v-if="action.type === 'ASK_CHOICE'">
      <div class="section-title"><div><h3>Напоминания</h3><p>Выполняются, пока вопрос ждёт ответа.</p></div><Button icon="pi pi-plus" text rounded aria-label="Добавить напоминание" @click="addReminder" /></div>
      <div class="reminder-card" v-for="(reminder, reminderIndex) in choiceReminders(action)" :key="reminderIndex">
        <div class="reminder-head"><div class="field"><label>Через, мс</label><InputNumber :model-value="reminder.afterMs" :min="1000" :max="86400000" :use-grouping="false" @update:model-value="setReminders(choiceReminders(action).map((item, index) => index === reminderIndex ? { ...item, afterMs: $event ?? 1000 } : item))" /></div><Button icon="pi pi-trash" text rounded severity="danger" @click="setReminders(choiceReminders(action).filter((_, index) => index !== reminderIndex))" /></div>
        <div class="reminder-action" v-for="(reminderAction, actionIndex) in reminder.actions" :key="actionIndex">
          <Select :model-value="reminderAction.type" :options="reminderActionOptions" option-label="label" option-value="value" @update:model-value="changeReminderType(reminderIndex, actionIndex, $event)" />
          <ActionConfigFields v-if="findActionDefinition(actionDefinitions, reminderAction.type)" :model-value="reminderAction.config" :definition="findActionDefinition(actionDefinitions, reminderAction.type)!" :elements="elements" :events="events" :template-variables="templateVariables" @update:model-value="setReminders(choiceReminders(action).map((item, index) => index === reminderIndex ? { ...item, actions: item.actions.map((nested, nestedIndex) => nestedIndex === actionIndex ? { ...nested, config: $event } : nested) } : item))" />
          <Button icon="pi pi-times" text rounded severity="danger" @click="setReminders(choiceReminders(action).map((item, index) => index === reminderIndex ? { ...item, actions: item.actions.filter((_, nestedIndex) => nestedIndex !== actionIndex) } : item))" />
        </div>
        <Button label="Добавить действие" icon="pi pi-plus" text size="small" @click="addReminderAction(reminderIndex)" />
      </div>
    </section>
  </aside>
</template>

<style scoped>
.inspector{height:100%;overflow:auto;background:var(--surface-card);border-left:1px solid var(--line)}.inspector-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid var(--line);background:var(--surface-card)}.inspector-head small{color:var(--text-small-muted);font-size:.67rem;text-transform:uppercase;letter-spacing:.1em}.inspector-head h2{margin-top:4px;font-size:1.05rem}.inspector section{padding:18px 20px;border-bottom:1px solid var(--line)}h3{margin:0 0 13px;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-secondary)}.field{margin-top:12px}.field:first-of-type{margin-top:0}.field>small{color:var(--text-small-muted);font-size:.67rem}.issue-box{display:flex;gap:10px;margin:14px;padding:12px;border:1px solid var(--status-danger);border-radius:12px;background:var(--status-danger-soft);color:var(--status-danger-text)}.issue-box strong,.issue-box span{display:block}.issue-box strong{font-size:.76rem}.issue-box span{margin-top:4px;font-size:.68rem}.section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.section-title h3{margin-bottom:2px}.section-title p{margin:0;color:var(--text-small-muted);font-size:.68rem}.choice-card,.branch-card,.reminder-card{margin-top:10px;padding:11px;border:1px solid var(--border-default);border-radius:12px;background:var(--surface-subtle)}.choice-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:7px}.choice-target,.branch-target{display:flex;align-items:center;gap:7px;margin-top:7px}.choice-target>i{color:var(--status-violet-text);font-size:.72rem}.choice-target .p-select,.branch-target .p-select{flex:1}.branch-head,.reminder-head{display:flex;align-items:center;justify-content:space-between}.branch-head strong{font-size:.75rem}.branch-target span{color:var(--text-small-muted);font-size:.7rem}.timeout-field{margin-top:14px}.reminder-head .field{flex:1;margin:0}.reminder-action{display:grid;grid-template-columns:1fr;gap:8px;margin:10px 0;padding:10px;background:var(--surface-card);border-radius:10px}.reminder-action>.p-button{justify-self:end}.inspector :deep(.schema-fields){grid-template-columns:1fr}.inspector :deep(.field-wide){grid-column:auto}
.inspector-actions{display:flex;gap:4px}
</style>
