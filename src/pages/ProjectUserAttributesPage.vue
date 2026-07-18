<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import { repository } from '@/shared/api/repository'
import { allowedValuesText, buildUserAttributeValidation } from '@/shared/lib/user-attributes'
import { formatDate } from '@/shared/lib/format'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'
import type { UserAttributeDefinition, UserAttributeMutation, UserAttributeSchema, UserAttributeType } from '@/shared/types/domain'

interface AttributeForm {
  id?: string
  key: string
  label: string
  description: string
  type: UserAttributeType
  required: boolean
  clientVisible: boolean
  enabled: boolean
  position: number
  minLength: number | null
  maxLength: number | null
  minimum: number | null
  maximum: number | null
  allowedValues: string
}

const typeOptions: Array<{ value: UserAttributeType; label: string; hint: string; icon: string }> = [
  { value: 'STRING', label: 'Строка', hint: 'Текст', icon: 'pi pi-align-left' },
  { value: 'NUMBER', label: 'Число', hint: 'Целое или дробное', icon: 'pi pi-hashtag' },
  { value: 'BOOLEAN', label: 'Да / нет', hint: 'true или false', icon: 'pi pi-check-square' },
  { value: 'DATETIME', label: 'Дата и время', hint: 'RFC 3339', icon: 'pi pi-calendar' },
]

const auth = useAuthStore()
const confirm = useConfirm()
const toast = useToast()
const schema = ref<UserAttributeSchema>({ definitions: [], currentRevision: null })
const loading = ref(true)
const loaded = ref(false)
const saving = ref(false)
const error = ref('')
const formError = ref('')
const dialogVisible = ref(false)
const schemaVisible = ref(false)
const form = ref<AttributeForm>(emptyForm())
const initialFormSnapshot = ref('')
const isFormDirty = computed(() => dialogVisible.value && Boolean(initialFormSnapshot.value) && JSON.stringify(form.value) !== initialFormSnapshot.value)
const { confirmDiscard } = useUnsavedChangesGuard(isFormDirty, 'Есть несохранённые изменения поля. Закрыть форму?')
const canManage = computed(() => auth.user?.role === 'OWNER' || auth.user?.role === 'ADMIN')
const activeDefinitions = computed(() => schema.value.definitions.filter((item) => item.enabled))
const requiredCount = computed(() => activeDefinitions.value.filter((item) => item.required).length)
const publicCount = computed(() => activeDefinitions.value.filter((item) => item.clientVisible).length)
const orderedDefinitions = computed(() => [...schema.value.definitions].sort((left, right) => left.position - right.position || left.key.localeCompare(right.key)))
const schemaJson = computed(() => JSON.stringify(schema.value.currentRevision?.schema ?? { type: 'object', properties: {}, additionalProperties: false }, null, 2))
let reconcileSequence = 0

onMounted(load)

function emptyForm(): AttributeForm {
  const nextPosition = Math.min(10_000, Math.max(0, ...schema.value.definitions.map((item) => item.position)) + 10)
  return { key: '', label: '', description: '', type: 'STRING', required: false, clientVisible: false, enabled: true, position: nextPosition, minLength: null, maxLength: null, minimum: null, maximum: null, allowedValues: '' }
}

async function load() {
  const projectId = auth.project?.id
  if (!projectId) return
  loading.value = true
  loaded.value = false
  error.value = ''
  try {
    schema.value = await repository.getUserAttributeSchema(projectId)
    loaded.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить контракт пользовательских полей'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = emptyForm()
  formError.value = ''
  initialFormSnapshot.value = JSON.stringify(form.value)
  dialogVisible.value = true
}

function openEdit(item: UserAttributeDefinition) {
  form.value = {
    id: item.id,
    key: item.key,
    label: item.label,
    description: item.description ?? '',
    type: item.type,
    required: item.required,
    clientVisible: item.clientVisible,
    enabled: item.enabled,
    position: item.position,
    minLength: item.validation.minLength ?? null,
    maxLength: item.validation.maxLength ?? null,
    minimum: item.validation.minimum ?? null,
    maximum: item.validation.maximum ?? null,
    allowedValues: allowedValuesText(item.validation),
  }
  formError.value = ''
  initialFormSnapshot.value = JSON.stringify(form.value)
  dialogVisible.value = true
}

async function submit() {
  const projectId = auth.project?.id
  if (!projectId || !canManage.value) return
  formError.value = ''
  if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(form.value.key.trim())) formError.value = 'Ключ должен начинаться со строчной латинской буквы и содержать только буквы, цифры или подчёркивание.'
  else if (!form.value.label.trim()) formError.value = 'Укажите понятное название поля.'
  else if (form.value.label.trim().length > 120) formError.value = 'Название не должно превышать 120 символов.'
  else if (form.value.description.length > 2000) formError.value = 'Описание не должно превышать 2 000 символов.'
  else if (!Number.isInteger(form.value.position) || form.value.position < 0 || form.value.position > 10_000) formError.value = 'Позиция должна быть целым числом от 0 до 10 000.'
  else if (!form.value.id && schema.value.definitions.some((item) => item.key === form.value.key.trim())) formError.value = 'Поле с таким ключом уже существует.'
  if (formError.value) return

  let validation
  try {
    validation = buildUserAttributeValidation(form.value)
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Проверьте ограничения поля.'
    return
  }

  saving.value = true
  try {
    const common = {
      label: form.value.label.trim(),
      required: form.value.required,
      clientVisible: form.value.clientVisible,
      enabled: form.value.enabled,
      position: form.value.position,
      validation,
    }
    const mutation = form.value.id
      ? await repository.updateUserAttributeDefinition(projectId, form.value.id, { ...common, description: form.value.description.trim() || null })
      : await repository.createUserAttributeDefinition(projectId, { ...common, description: form.value.description.trim() || undefined, key: form.value.key.trim(), type: form.value.type })
    applyMutation(mutation)
    void reconcileSchema(projectId)
    initialFormSnapshot.value = ''
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: form.value.id ? 'Поле обновлено' : 'Поле создано', detail: `Опубликована схема v${schema.value.currentRevision?.version ?? '—'}`, life: 3200 })
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'Не удалось сохранить поле'
  } finally {
    saving.value = false
  }
}

function requestDialogVisibility(value: boolean) {
  if (!value && !confirmDiscard()) return
  dialogVisible.value = value
}

function askDelete(item: UserAttributeDefinition) {
  confirm.require({
    header: 'Удалить поле из контракта?',
    message: `«${item.label}» (${item.key}) исчезнет из следующей ревизии. Сохранённые snapshots пользователей не переписываются.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Отмена',
    acceptLabel: 'Удалить поле',
    acceptProps: { severity: 'danger' },
    accept: () => deleteDefinition(item),
  })
}

async function deleteDefinition(item: UserAttributeDefinition) {
  const projectId = auth.project?.id
  if (!projectId || !canManage.value) return
  try {
    const mutation = await repository.deleteUserAttributeDefinition(projectId, item.id)
    applyMutation(mutation, item.id)
    void reconcileSchema(projectId)
    toast.add({ severity: 'success', summary: 'Поле удалено', detail: `Опубликована схема v${schema.value.currentRevision?.version ?? '—'}`, life: 3000 })
  } catch (cause) {
    toast.add({ severity: 'error', summary: 'Не удалось удалить поле', detail: cause instanceof Error ? cause.message : 'Произошла ошибка', life: 4200 })
  }
}

function applyMutation(mutation: UserAttributeMutation, deletedId?: string) {
  const definitions = deletedId
    ? schema.value.definitions.filter((item) => item.id !== deletedId)
    : [...schema.value.definitions.filter((item) => item.id !== mutation.definition.id), mutation.definition]
  schema.value = { definitions, currentRevision: mutation.currentRevision }
}

async function reconcileSchema(projectId: string) {
  const sequence = ++reconcileSequence
  try {
    const latestSchema = await repository.getUserAttributeSchema(projectId)
    if (sequence === reconcileSequence) schema.value = latestSchema
  } catch {
    // The atomic mutation response is already authoritative for this change.
  }
}

function typeMeta(type: UserAttributeType) {
  return typeOptions.find((item) => item.value === type) ?? typeOptions[0]!
}

function validationSummary(item: UserAttributeDefinition) {
  const parts: string[] = []
  if (item.validation.minLength !== undefined || item.validation.maxLength !== undefined) parts.push(`длина ${item.validation.minLength ?? 0}–${item.validation.maxLength ?? '∞'}`)
  if (item.validation.minimum !== undefined || item.validation.maximum !== undefined) parts.push(`диапазон ${item.validation.minimum ?? '−∞'}–${item.validation.maximum ?? '∞'}`)
  if (item.validation.allowedValues?.length) parts.push(`${item.validation.allowedValues.length} enum`)
  return parts.join(' · ') || 'Без ограничений'
}
</script>

<template>
  <section class="page attributes-page">
    <header class="page-header">
      <div><div class="eyebrow">Проект · Контракт данных</div><h1>Поля пользователя</h1><p class="subtitle">Опишите полный snapshot, который backend продукта передаёт при создании и обновлении пользовательской сессии.</p></div>
      <div class="header-actions"><Button label="Настройки проекта" icon="pi pi-arrow-left" severity="secondary" text as="router-link" to="/project" /><Button v-if="canManage && loaded" label="Добавить поле" icon="pi pi-plus" @click="openCreate" /></div>
    </header>

    <Message v-if="!canManage" severity="info" :closable="false">Контракт доступен для просмотра. Изменять и публиковать поля могут только OWNER и ADMIN.</Message>
    <Message v-if="error" severity="error" :closable="false" class="page-message"><div class="message-row"><span>{{ error }}</span><Button label="Повторить" size="small" text @click="load" /></div></Message>

    <div v-if="loading" class="loading-grid"><Skeleton v-for="item in 4" :key="item" height="118px" border-radius="18px" /></div>
    <template v-else-if="loaded">
      <div class="contract-summary">
        <article class="summary-card card"><span class="summary-icon lime"><i class="pi pi-code" /></span><div><small>Текущая ревизия</small><strong>v{{ schema.currentRevision?.version ?? 0 }}</strong><span>{{ schema.currentRevision ? formatDate(schema.currentRevision.createdAt) : 'Контракт ещё не публиковался' }}</span></div></article>
        <article class="summary-card card"><span class="summary-icon violet"><i class="pi pi-list" /></span><div><small>Активные поля</small><strong>{{ activeDefinitions.length }}</strong><span>{{ requiredCount }} обязательных</span></div></article>
        <article class="summary-card card"><span class="summary-icon green"><i class="pi pi-eye" /></span><div><small>Доступны браузеру</small><strong>{{ publicCount }}</strong><span>только clientVisible</span></div></article>
        <button type="button" class="schema-card card" @click="schemaVisible = true"><i class="pi pi-file" /><span><strong>JSON Schema</strong><small>Посмотреть опубликованный контракт</small></span><i class="pi pi-arrow-up-right" /></button>
      </div>

      <div class="breaking-note card"><i class="pi pi-info-circle" /><div><strong>Изменения публикуются атомарно</strong><span>Каждое сохранение создаёт immutable revision. Новое required‑поле — breaking change: сначала создайте его выключенным, обновите интеграцию продукта, затем включите.</span></div></div>

      <div v-if="orderedDefinitions.length" class="attribute-list">
        <article v-for="item in orderedDefinitions" :key="item.id" class="attribute-card card" :class="{ disabled: !item.enabled }">
          <span class="type-icon"><i :class="typeMeta(item.type).icon" /></span>
          <div class="attribute-main"><div class="attribute-title"><h2>{{ item.label }}</h2><code>{{ item.key }}</code><Tag :value="typeMeta(item.type).label" severity="secondary" /></div><p>{{ item.description || typeMeta(item.type).hint }}</p><div class="attribute-flags"><span v-if="item.required" class="required"><i class="pi pi-asterisk" /> Обязательное</span><span v-if="item.clientVisible"><i class="pi pi-eye" /> Browser visible</span><span><i class="pi pi-filter" /> {{ validationSummary(item) }}</span></div></div>
          <div class="attribute-state"><span :class="{ on: item.enabled }" /><div><strong>{{ item.enabled ? 'В контракте' : 'Выключено' }}</strong><small>Позиция {{ item.position }}</small></div></div>
          <div v-if="canManage" class="attribute-actions"><Button icon="pi pi-pencil" severity="secondary" text rounded :aria-label="`Изменить ${item.label}`" @click="openEdit(item)" /><Button icon="pi pi-trash" severity="danger" text rounded :aria-label="`Удалить ${item.label}`" @click="askDelete(item)" /></div>
        </article>
      </div>
      <div v-else class="empty card"><i class="pi pi-id-card" /><strong>Поля пользователя ещё не настроены</strong><p>Без определений backend принимает только пустой объект attributes.</p><Button v-if="canManage" label="Добавить первое поле" icon="pi pi-plus" @click="openCreate" /></div>
    </template>

    <Dialog :visible="dialogVisible" modal :header="form.id ? 'Изменить поле' : 'Новое поле пользователя'" :style="{ width: 'min(760px, calc(100vw - 28px))' }" @update:visible="requestDialogVisibility">
      <form id="attribute-form" class="attribute-form" @submit.prevent="submit">
        <div class="form-grid"><div class="field"><label for="attribute-label">Название</label><InputText id="attribute-label" v-model="form.label" autofocus placeholder="Тариф пользователя" /></div><div class="field"><label for="attribute-key">Ключ</label><InputText id="attribute-key" v-model="form.key" class="mono" :disabled="Boolean(form.id)" placeholder="plan" /><small v-if="form.id">Ключ опубликованного поля неизменяем.</small></div></div>
        <div class="form-grid"><div class="field"><label for="attribute-type">Тип</label><Select id="attribute-type" v-model="form.type" :options="typeOptions" option-label="label" option-value="value" :disabled="Boolean(form.id)" /></div><div class="field"><label for="attribute-position">Позиция</label><InputNumber v-model="form.position" input-id="attribute-position" :min="0" :max="10000" :use-grouping="false" /></div></div>
        <div class="field"><label for="attribute-description">Описание <span>необязательно</span></label><Textarea id="attribute-description" v-model="form.description" rows="2" auto-resize maxlength="2000" placeholder="Откуда продукт берёт значение и как оно используется" /></div>

        <section v-if="form.type === 'STRING'" class="constraints surface-soft"><strong>Ограничения строки</strong><div class="form-grid"><div class="field"><label for="min-length">Минимальная длина</label><InputNumber v-model="form.minLength" input-id="min-length" :min="0" :use-grouping="false" placeholder="0" /></div><div class="field"><label for="max-length">Максимальная длина</label><InputNumber v-model="form.maxLength" input-id="max-length" :min="0" :use-grouping="false" placeholder="Без ограничения" /></div></div></section>
        <section v-if="form.type === 'NUMBER'" class="constraints surface-soft"><strong>Диапазон числа</strong><div class="form-grid"><div class="field"><label for="minimum">Минимум</label><InputNumber v-model="form.minimum" input-id="minimum" :use-grouping="false" placeholder="Без ограничения" /></div><div class="field"><label for="maximum">Максимум</label><InputNumber v-model="form.maximum" input-id="maximum" :use-grouping="false" placeholder="Без ограничения" /></div></div></section>
        <div class="field"><label for="allowed-values">Допустимые значения <span>необязательно, по одному в строке</span></label><Textarea id="allowed-values" v-model="form.allowedValues" rows="3" class="mono" :placeholder="form.type === 'BOOLEAN' ? 'true\nfalse' : form.type === 'DATETIME' ? '2026-07-16T12:00:00Z' : form.type === 'NUMBER' ? '10\n25\n50' : 'free\npremium'" /><small>Если список пуст, разрешено любое значение выбранного типа.</small></div>

        <div class="toggle-grid"><label class="toggle-card surface-soft"><div><strong>Обязательное поле</strong><span>Каждый полный snapshot обязан содержать этот key.</span></div><ToggleSwitch v-model="form.required" /></label><label class="toggle-card surface-soft"><div><strong>Доступно браузеру</strong><span>Значение вернётся в interaction session response.</span></div><ToggleSwitch v-model="form.clientVisible" /></label><label class="toggle-card surface-soft full"><div><strong>Включено в контракт</strong><span>Выключенное поле хранится в CMS, но не входит в JSON Schema.</span></div><ToggleSwitch v-model="form.enabled" /></label></div>
        <Message v-if="form.clientVisible" severity="warn" size="small" :closable="false">Не помечайте clientVisible поля, содержащие секреты, платёжные данные или внутренние risk‑признаки.</Message>
        <Message v-if="formError" severity="error" size="small" :closable="false">{{ formError }}</Message>
      </form>
      <template #footer><Button label="Отмена" severity="secondary" text @click="requestDialogVisibility(false)" /><Button form="attribute-form" type="submit" label="Сохранить и опубликовать" icon="pi pi-check" :loading="saving" /></template>
    </Dialog>

    <Dialog v-model:visible="schemaVisible" modal header="Опубликованная JSON Schema" :style="{ width: 'min(720px, calc(100vw - 28px))' }"><div class="schema-meta"><span>Revision v{{ schema.currentRevision?.version ?? 0 }}</span><code>{{ schema.currentRevision?.id ?? 'not-published' }}</code></div><pre class="schema-json">{{ schemaJson }}</pre></Dialog>
  </section>
</template>

<style scoped>
.header-actions{display:flex;align-items:center;gap:8px}.page-message{margin-bottom:16px}.message-row{display:flex;justify-content:space-between;align-items:center;gap:16px;width:100%}.loading-grid,.contract-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.summary-card,.schema-card{min-height:104px;padding:17px;display:flex;align-items:center;gap:13px}.summary-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;flex:0 0 auto}.summary-icon.lime{background:var(--status-success-soft);color:var(--status-success-text)}.summary-icon.violet{background:var(--status-violet-soft);color:var(--status-violet-text)}.summary-icon.green{background:var(--status-success-soft);color:var(--status-success-text)}.summary-card small,.summary-card strong,.summary-card span{display:block}.summary-card small{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:.58rem;font-weight:700}.summary-card strong{font:700 1.35rem Manrope;margin:3px 0}.summary-card span{color:var(--text-secondary);font-size:.63rem}.schema-card{width:100%;font:inherit;text-align:left;cursor:pointer;background:var(--surface-emphasis-raised);color:var(--text-on-emphasis);border-color:var(--surface-emphasis-raised)}.schema-card>i:first-child{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--surface-emphasis-hover);color:var(--brand)}.schema-card>span{flex:1}.schema-card strong,.schema-card small{display:block}.schema-card strong{font-size:.8rem}.schema-card small{color:var(--text-on-emphasis-muted);font-size:.65rem;margin-top:4px}.schema-card>i:last-child{color:var(--text-on-emphasis-muted);font-size:.75rem}.breaking-note{display:flex;align-items:flex-start;gap:12px;padding:15px 17px;margin-bottom:16px;background:var(--status-warning-soft);border-color:var(--status-warning)}.breaking-note>i{color:var(--status-warning-text);margin-top:2px}.breaking-note strong,.breaking-note span{display:block}.breaking-note strong{font-size:.79rem}.breaking-note span{color:var(--status-warning-text);font-size:.69rem;line-height:1.5;margin-top:3px}.attribute-list{display:flex;flex-direction:column;gap:9px}.attribute-card{display:grid;grid-template-columns:auto minmax(0,1fr) 120px auto;align-items:center;gap:15px;padding:16px 18px}.attribute-card.disabled{opacity:.62}.type-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--status-violet-soft);color:var(--status-violet-text)}.attribute-main{min-width:0}.attribute-title{display:flex;align-items:center;gap:8px;min-width:0}.attribute-title h2{font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.attribute-title code{font-size:.68rem;color:var(--text-secondary);background:var(--surface-subtle);padding:3px 6px;border-radius:6px}.attribute-main p{font-size:.72rem;color:var(--muted);margin:5px 0 8px}.attribute-flags{display:flex;gap:6px;flex-wrap:wrap}.attribute-flags span{font-size:.62rem;color:var(--text-secondary);border:1px solid var(--surface-subtle);border-radius:7px;padding:4px 6px}.attribute-flags .required{color:var(--status-danger-text);background:var(--status-danger-soft);border-color:var(--status-danger-soft)}.attribute-flags i{font-size:.58rem;margin-right:3px}.attribute-state{display:flex;align-items:center;gap:8px;border-left:1px solid var(--line);padding-left:15px}.attribute-state>span{width:8px;height:8px;border-radius:50%;background:var(--border-default)}.attribute-state>span.on{background:var(--status-success-text);box-shadow:0 0 0 4px var(--status-success-soft)}.attribute-state strong,.attribute-state small{display:block}.attribute-state strong{font-size:.68rem}.attribute-state small{font-size:.6rem;color:var(--muted);margin-top:3px}.attribute-actions{display:flex}.empty strong{display:block;color:var(--ink)}.empty p{margin:7px 0 16px}.attribute-form{display:flex;flex-direction:column;gap:16px;padding-top:3px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field label span,.field small{font-weight:400;color:var(--text-secondary)}.field small{font-size:.67rem}.constraints{padding:14px}.constraints>strong{display:block;font-size:.78rem;margin-bottom:11px}.toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.toggle-card{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:13px 14px}.toggle-card.full{grid-column:1/-1}.toggle-card strong,.toggle-card span{display:block}.toggle-card strong{font-size:.77rem}.toggle-card span{color:var(--muted);font-size:.66rem;line-height:1.4;margin-top:3px}.schema-meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;color:var(--muted);font-size:.68rem}.schema-meta code{overflow:hidden;text-overflow:ellipsis}.schema-json{margin:0;max-height:65vh;overflow:auto;padding:17px;border-radius:14px;background:var(--surface-emphasis);color:var(--status-success);font:500 .7rem/1.55 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:1050px){.loading-grid,.contract-summary{grid-template-columns:1fr 1fr}.attribute-card{grid-template-columns:auto minmax(0,1fr) auto}.attribute-state{grid-column:2}.attribute-actions{grid-column:3;grid-row:1/3}}
@media(max-width:650px){.header-actions{width:100%;display:grid;grid-template-columns:1fr 1fr}.loading-grid,.contract-summary,.form-grid,.toggle-grid{grid-template-columns:1fr}.attribute-card{grid-template-columns:auto minmax(0,1fr);align-items:start}.attribute-title{flex-wrap:wrap}.attribute-title h2{width:100%}.attribute-state{grid-column:1/3;border-left:0;border-top:1px solid var(--line);padding:11px 0 0}.attribute-actions{grid-column:1/3;grid-row:auto;justify-content:flex-end}.toggle-card.full{grid-column:auto}.breaking-note{align-items:flex-start}}
</style>
