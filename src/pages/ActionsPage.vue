<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useActionDefinitionsStore } from '@/features/actions/action-definitions.store'
import { actionFieldOptions } from '@/shared/lib/action-definition'
import { useAuthStore } from '@/features/auth/auth.store'
import type { ActionControl, ActionExecutor, ActionUiField, ActionUiOption, ScenarioActionDefinition } from '@/shared/types/domain'

const auth = useAuthStore()
const actionDefinitions = useActionDefinitionsStore()
const search = ref('')
const status = ref<'ALL' | 'ENABLED' | 'DISABLED'>('ALL')
const selected = shallowRef<ScenarioActionDefinition | null>(null)

const projectId = computed(() => auth.project?.id ?? '')
const definitions = computed(() => actionDefinitions.forProject(projectId.value))
const loading = computed(() => Boolean(actionDefinitions.loadingByProject[projectId.value]))
const error = computed(() => actionDefinitions.errorsByProject[projectId.value] ?? '')
const enabledCount = computed(() => definitions.value.filter((item) => item.enabled).length)
const frontendCount = computed(() => definitions.value.filter((item) => item.executor === 'FRONTEND').length)
const serverCount = computed(() => definitions.value.filter((item) => item.executor === 'SERVER').length)
const selectedFields = computed<ActionUiField[]>(() => selected.value?.uiSchema.fields ?? [])
const filtered = computed<ScenarioActionDefinition[]>(() => {
  const query = search.value.trim().toLowerCase()
  return definitions.value.filter((item) => {
    const matchesStatus = status.value === 'ALL' || (status.value === 'ENABLED' ? item.enabled : !item.enabled)
    const matchesQuery = !query
      || item.name.toLowerCase().includes(query)
      || item.type.toLowerCase().includes(query)
      || item.description?.toLowerCase().includes(query)
    return matchesStatus && matchesQuery
  })
})

const statusOptions = [
  { label: 'Все действия', value: 'ALL' },
  { label: 'Доступные', value: 'ENABLED' },
  { label: 'Выключенные', value: 'DISABLED' },
]

onMounted(load)

async function load() {
  if (!projectId.value) return
  try {
    await actionDefinitions.ensureLoaded(projectId.value)
  } catch {
    // Store exposes the request error in errorsByProject for the page message.
  }
}

async function refresh() {
  if (!projectId.value) return
  try {
    await actionDefinitions.refresh(projectId.value)
  } catch {
    // Store exposes the request error in errorsByProject for the page message.
  }
}

function icon(executor: ActionExecutor) {
  return executor === 'SERVER' ? 'pi pi-server' : 'pi pi-desktop'
}

function executionLabel(executor: ActionExecutor) {
  return executor === 'SERVER' ? 'Выполняет backend' : 'Выполняет интерфейс'
}

function routeLabel(executor: ActionExecutor, serverHandler: string | null, commandType: string | null) {
  return executor === 'SERVER'
    ? serverHandler || 'Обработчик проекта'
    : commandType || 'Команда интерфейса'
}

function controlLabel(control: ActionControl) {
  const labels: Record<ActionControl, string> = {
    text: 'Текст',
    textarea: 'Большой текст',
    number: 'Число',
    select: 'Выбор',
    target: 'Объект интерфейса',
    event: 'Событие',
    json: 'JSON-объект',
    boolean: 'Да / нет',
  }
  return labels[control]
}

function isRequired(item: ScenarioActionDefinition, field: ActionUiField) {
  return item.configSchema.required.includes(field.key)
}

function selectedFieldRequired(field: ActionUiField) {
  return selected.value ? isRequired(selected.value, field) : false
}

function selectedFieldDetails(field: ActionUiField) {
  return selected.value ? fieldDetails(selected.value, field) : ''
}

function fieldDetails(item: ScenarioActionDefinition, field: ActionUiField) {
  const property = item.configSchema.properties[field.key]
  const details: string[] = []
  const options = actionFieldOptions(field, property)
  if (options.length) details.push(`Значения: ${options.map(optionLabel).join(', ')}`)
  if (field.targetKinds?.length) details.push(`Объекты: ${field.targetKinds.join(', ')}`)
  if (field.allowCustom) details.push('Можно ввести свой код')
  if (field.supportsTemplates) details.push('Поддерживает переменные сценария')
  if (typeof property?.minimum === 'number') details.push(`Минимум: ${property.minimum}`)
  if (typeof property?.maximum === 'number') details.push(`Максимум: ${property.maximum}`)
  if (typeof property?.minLength === 'number') details.push(`Минимум символов: ${property.minLength}`)
  if (typeof property?.maxLength === 'number') details.push(`Максимум символов: ${property.maxLength}`)
  if (field.visibleWhen) details.push(`Показывается при ${Object.entries(field.visibleWhen).map(([key, value]) => `${key} = ${value}`).join(', ')}`)
  return details.join(' · ')
}

function optionLabel(option: ActionUiOption) {
  return option !== null && typeof option === 'object' && 'label' in option ? option.label : String(option)
}

function openDefinition(item: ScenarioActionDefinition) {
  selected.value = item
}
</script>

<template>
  <div class="page actions-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Action registry</div>
        <h1>Действия</h1>
        <p class="subtitle">Все шаги, которые можно использовать в сценариях. Состав и настройки загружаются из backend для текущего проекта.</p>
      </div>
      <Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="refresh" />
    </header>

    <section class="action-hero card">
      <div class="hero-copy">
        <span class="hero-icon"><i class="pi pi-bolt" /></span>
        <div><strong>Каталог действий проекта</strong><p>Здесь видно, какие параметры принимает каждый шаг. Тот же список используется в редакторе сценариев.</p></div>
      </div>
      <div class="hero-metrics">
        <div><strong>{{ enabledCount }}</strong><span>доступно</span></div>
        <div><strong>{{ frontendCount }}</strong><span>в интерфейсе</span></div>
        <div><strong>{{ serverCount }}</strong><span>на backend</span></div>
      </div>
    </section>

    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
      <Button label="Повторить" size="small" text @click="refresh" />
    </Message>

    <section class="catalog card">
      <div class="catalog-toolbar">
        <div class="search-box"><i class="pi pi-search" /><InputText v-model="search" placeholder="Название, тип или описание" /></div>
        <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="status-filter" />
        <span class="result-count">{{ filtered.length }} из {{ definitions.length }}</span>
      </div>

      <div v-if="loading && !definitions.length" class="action-grid loading-grid">
        <div v-for="index in 6" :key="index" class="action-card skeleton-card"><Skeleton width="44px" height="44px" border-radius="13px" /><div><Skeleton width="60%" height="16px" /><Skeleton width="38%" height="11px" /><Skeleton width="90%" height="11px" /></div></div>
      </div>
      <div v-else-if="filtered.length" class="action-grid">
        <button v-for="item in filtered" :key="item.id" type="button" class="action-card" :class="{ disabled: !item.enabled }" @click="openDefinition(item)">
          <span class="action-icon" :class="item.executor.toLowerCase()"><i :class="icon(item.executor)" /></span>
          <span class="action-main">
            <span class="action-topline"><strong>{{ item.name }}</strong><Tag :value="item.enabled ? 'Доступно' : 'Выключено'" :severity="item.enabled ? 'success' : 'secondary'" /></span>
            <code>{{ item.type }}</code>
            <span class="description">{{ item.description || 'Описание не добавлено' }}</span>
            <span class="action-meta"><span><i :class="icon(item.executor)" /> {{ executionLabel(item.executor) }}</span><span><i class="pi pi-sliders-h" /> {{ item.uiSchema.fields.length }} параметров</span></span>
          </span>
          <i class="pi pi-arrow-up-right open-icon" />
        </button>
      </div>
      <div v-else class="empty"><i class="pi pi-search" /><strong>Действия не найдены</strong><p>Измените поисковый запрос или фильтр доступности.</p></div>
    </section>

    <Dialog :visible="Boolean(selected)" modal :header="selected?.name" class="action-dialog" :style="{ width: 'min(760px, 94vw)' }" @update:visible="!$event && (selected = null)">
      <template v-if="selected">
        <div class="dialog-intro">
          <span class="dialog-icon" :class="selected.executor.toLowerCase()"><i :class="icon(selected.executor)" /></span>
          <div><div class="dialog-tags"><Tag :value="selected.enabled ? 'Доступно в сценариях' : 'Выключено'" :severity="selected.enabled ? 'success' : 'secondary'" /><Tag :value="selected.builtIn ? 'Системное' : 'Проектное'" severity="contrast" /></div><code>{{ selected.type }}</code></div>
        </div>
        <p class="dialog-description">{{ selected.description || 'Для этого действия пока нет описания.' }}</p>

        <div class="execution-card">
          <div><small>Где выполняется</small><strong>{{ executionLabel(selected.executor) }}</strong></div>
          <div><small>{{ selected.executor === 'SERVER' ? 'Handler' : 'Команда' }}</small><strong class="mono">{{ routeLabel(selected.executor, selected.serverHandler, selected.commandType) }}</strong></div>
        </div>

        <section class="settings-section">
          <div class="section-title"><div><h3>Что нужно настроить</h3><p>Поля формируются из актуальной схемы backend.</p></div><span>{{ selectedFields.length }}</span></div>
          <div v-if="selectedFields.length" class="field-list">
            <article v-for="(field, fieldIndex) in selectedFields" :key="field.key" class="field-card">
              <span class="field-number">{{ fieldIndex + 1 }}</span>
              <div class="field-copy"><div><strong>{{ field.label }}</strong><Tag v-if="selectedFieldRequired(field)" value="Обязательно" severity="warn" /><Tag v-else value="Опционально" severity="secondary" /></div><code>{{ field.key }}</code><p v-if="selectedFieldDetails(field)">{{ selectedFieldDetails(field) }}</p></div>
              <span class="control-type">{{ controlLabel(field.control) }}</span>
            </article>
          </div>
          <div v-else class="no-settings"><i class="pi pi-check-circle" /><div><strong>Настройки не требуются</strong><span>Действие можно добавить в сценарий без дополнительных данных.</span></div></div>
        </section>
      </template>
      <template #footer><Button label="Закрыть" severity="secondary" @click="selected = null" /></template>
    </Dialog>
  </div>
</template>

<style scoped>
.actions-page{display:flex;flex-direction:column;gap:20px}.page-header{margin-bottom:0}.action-hero{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:18px 20px;background:#24271f;color:#f4f5ef;border-color:#24271f;overflow:hidden}.hero-copy{display:flex;align-items:center;gap:14px;min-width:0}.hero-icon{display:grid;place-items:center;flex:0 0 44px;height:44px;border-radius:14px;background:var(--accent);color:#24271f}.hero-copy strong{font:700 .9rem Manrope}.hero-copy p{margin:4px 0 0;color:#adb2a5;font-size:.74rem}.hero-metrics{display:flex;align-items:center}.hero-metrics>div{min-width:90px;padding:0 18px;border-left:1px solid #41453c}.hero-metrics strong,.hero-metrics span{display:block}.hero-metrics strong{font:700 1.2rem Manrope;color:#fff}.hero-metrics span{margin-top:3px;color:#9ca194;font-size:.66rem}.catalog{overflow:hidden}.catalog-toolbar{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}.search-box{position:relative;width:min(430px,100%)}.search-box>i{position:absolute;z-index:2;left:13px;top:50%;transform:translateY(-50%);color:#969b90;font-size:.8rem}.search-box .p-inputtext{padding-left:36px}.status-filter{width:180px}.result-count{margin-left:auto;color:var(--muted);font-size:.75rem}.action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:18px}.action-card{position:relative;display:flex;align-items:flex-start;gap:13px;width:100%;padding:17px;border:1px solid var(--line);border-radius:16px;background:#fff;color:inherit;text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.action-card:hover{transform:translateY(-2px);border-color:#cfd2c7;box-shadow:0 12px 30px rgba(37,41,32,.07)}.action-card.disabled{background:#fafaf8}.action-icon,.dialog-icon{display:grid;place-items:center;flex:0 0 42px;height:42px;border-radius:13px}.action-icon.frontend,.dialog-icon.frontend{background:#f0edff;color:#6e58d0}.action-icon.server,.dialog-icon.server{background:#e9f6df;color:#4c9550}.action-main{display:block;min-width:0;flex:1}.action-topline{display:flex;align-items:center;gap:8px}.action-topline strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 .86rem Manrope}.action-main code,.dialog-intro code{display:block;margin-top:5px;color:#72776d;font-size:.65rem}.description{display:-webkit-box;min-height:36px;margin-top:9px;overflow:hidden;color:var(--muted);font-size:.74rem;line-height:1.45;-webkit-line-clamp:2;-webkit-box-orient:vertical}.action-meta{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;color:#777c72;font-size:.65rem}.action-meta i{margin-right:4px}.open-icon{margin:3px 0 0 auto;color:#a8aca2;font-size:.72rem}.skeleton-card{cursor:default}.skeleton-card>div{display:flex;flex:1;flex-direction:column;gap:9px}.dialog-intro{display:flex;align-items:center;gap:13px}.dialog-tags{display:flex;gap:7px}.dialog-description{margin:16px 0;color:#5f645a;font-size:.86rem}.execution-card{display:grid;grid-template-columns:1fr 1fr;gap:1px;padding:1px;border-radius:14px;background:var(--line);overflow:hidden}.execution-card>div{padding:14px;background:#f8f8f5}.execution-card small,.execution-card strong{display:block}.execution-card small{color:var(--muted);font-size:.66rem;text-transform:uppercase;letter-spacing:.08em}.execution-card strong{margin-top:5px;font-size:.78rem}.settings-section{margin-top:24px}.section-title{display:flex;align-items:center;justify-content:space-between}.section-title h3{margin:0;font-size:1rem}.section-title p{margin:4px 0 0;color:var(--muted);font-size:.72rem}.section-title>span{display:grid;place-items:center;width:31px;height:31px;border-radius:10px;background:#eff0eb;font:700 .72rem Manrope}.field-list{display:flex;flex-direction:column;gap:8px;margin-top:13px}.field-card{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:start;gap:11px;padding:13px;border:1px solid var(--line);border-radius:13px}.field-number{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#24271f;color:#fff;font:700 .65rem Manrope}.field-copy>div{display:flex;align-items:center;gap:8px}.field-copy strong{font-size:.79rem}.field-copy code{display:block;margin-top:4px;color:#777c72;font-size:.64rem}.field-copy p{margin:6px 0 0;color:var(--muted);font-size:.68rem}.control-type{padding:5px 8px;border-radius:8px;background:#f0edff;color:#6752c6;font-size:.65rem;white-space:nowrap}.no-settings{display:flex;align-items:center;gap:11px;margin-top:13px;padding:16px;border-radius:13px;background:#f1f7e8;color:#526d39}.no-settings>i{font-size:1.25rem}.no-settings strong,.no-settings span{display:block}.no-settings strong{font-size:.8rem}.no-settings span{margin-top:3px;font-size:.7rem;color:#70805f}@media(max-width:900px){.action-hero{align-items:stretch;flex-direction:column}.hero-metrics>div:first-child{border-left:0;padding-left:0}.action-grid{grid-template-columns:1fr}}@media(max-width:620px){.catalog-toolbar{flex-wrap:wrap}.search-box,.status-filter{width:100%}.result-count{margin-left:0}.hero-metrics{justify-content:space-between}.hero-metrics>div{min-width:0;flex:1;padding:0 10px}.execution-card{grid-template-columns:1fr}.field-card{grid-template-columns:30px 1fr}.control-type{grid-column:2;justify-self:start}}
</style>
