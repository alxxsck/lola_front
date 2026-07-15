<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import { buildUiActionIntegrationGuide, isUiElementInSection, type InterfaceSection } from '@/features/interface/ui-action-integration'
import { repository } from '@/shared/api/repository'
import type { CreateUiElement, UpdateUiElement } from '@/shared/api/repository/contracts'
import { slugify } from '@/shared/lib/format'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'
import type { EntityKind, UiElement } from '@/shared/types/domain'

type InterfaceKind = InterfaceSection

interface ElementForm {
  id?: string
  name: string
  code: string
  kind: InterfaceKind
  persistedKind?: EntityKind
  legacyUnboundModal: boolean
  selector: string
  route: string
  modalName: string
  handler: string
  configText: string
  enabled: boolean
}

const kindOptions: Array<{ value: InterfaceKind; label: string; icon: string; description: string }> = [
  { value: 'ELEMENT', label: 'Элементы', icon: 'pi pi-stop', description: 'Кнопки, блоки и другие цели подсветки' },
  { value: 'PAGE', label: 'Страницы', icon: 'pi pi-file', description: 'Маршруты для переходов' },
  { value: 'MODAL', label: 'Модальные окна', icon: 'pi pi-window-maximize', description: 'Окна, которые открывает Lola' },
]

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const elements = ref<UiElement[]>([])
const activeKind = ref<InterfaceKind>('ELEMENT')
const search = ref('')
const loading = ref(true)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const loadError = ref('')
const formError = ref('')
const dialogVisible = ref(false)
const integrationElement = ref<UiElement | null>(null)
const integrationVisible = ref(false)
const codeTouched = ref(false)
const form = ref<ElementForm>(emptyForm('ELEMENT'))
const initialFormSnapshot = ref('')
const isFormDirty = computed(() => dialogVisible.value && Boolean(initialFormSnapshot.value) && JSON.stringify(form.value) !== initialFormSnapshot.value)
const { confirmDiscard } = useUnsavedChangesGuard(isFormDirty, 'Есть несохранённые изменения элемента. Закрыть форму?')

const filteredElements = computed(() => {
  const query = search.value.trim().toLowerCase()
  return elements.value.filter((item) => {
    if (!isInSection(item, activeKind.value)) return false
    return !query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query)
  })
})

const currentKind = computed(() => kindOptions.find((item) => item.value === activeKind.value)!)
const integrationGuide = computed(() => integrationElement.value ? buildUiActionIntegrationGuide(integrationElement.value) : null)
const fieldMeta = computed(() => {
  if (form.value.kind === 'PAGE') return { key: 'route' as const, label: 'Путь страницы', placeholder: '/account', required: true }
  if (form.value.kind === 'MODAL') return { key: 'modalName' as const, label: 'Имя модального окна', placeholder: 'deposit', required: !isLegacyUnboundModal.value }
  return { key: 'selector' as const, label: 'CSS-селектор', placeholder: "[data-lola='deposit']", required: false }
})
const isLegacyUnboundModal = computed(() => form.value.kind === 'MODAL' && form.value.legacyUnboundModal)

watch(
  () => route.params.kind,
  (value) => {
    const candidate = String(value ?? '').toUpperCase()
    if (candidate === 'BUTTON') { activeKind.value = 'ELEMENT'; return }
    if (kindOptions.some((item) => item.value === candidate)) activeKind.value = candidate as InterfaceKind
  },
  { immediate: true },
)

onMounted(loadElements)

function emptyForm(kind: InterfaceKind): ElementForm {
  return { name: '', code: '', kind, legacyUnboundModal: false, selector: '', route: '', modalName: '', handler: '', configText: '{}', enabled: true }
}

function kindCount(kind: InterfaceKind) {
  return elements.value.filter((item) => isInSection(item, kind)).length
}

function isInSection(item: UiElement, kind: InterfaceKind) {
  return isUiElementInSection(item.kind, kind)
}

function selectKind(kind: InterfaceKind) {
  activeKind.value = kind
  void router.replace({ name: 'interface', params: { kind: kind.toLowerCase() } })
}

async function loadElements() {
  const projectId = auth.project?.id
  if (!projectId) return
  loading.value = true
  loadError.value = ''
  try {
    elements.value = await repository.getElements(projectId)
  } catch (cause) {
    loadError.value = errorMessage(cause, 'Не удалось загрузить элементы интерфейса')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = emptyForm(activeKind.value)
  codeTouched.value = false
  formError.value = ''
  initialFormSnapshot.value = JSON.stringify(form.value)
  dialogVisible.value = true
}

function openEdit(item: UiElement) {
  form.value = {
    id: item.id,
    name: item.name,
    code: item.code,
    kind: item.kind === 'BUTTON' ? 'ELEMENT' : item.kind as InterfaceKind,
    persistedKind: item.kind,
    legacyUnboundModal: item.kind === 'MODAL' && !item.modalName,
    selector: item.selector ?? '',
    route: item.route ?? '',
    modalName: item.modalName ?? '',
    handler: item.handler ?? '',
    configText: JSON.stringify(item.config ?? {}, null, 2),
    enabled: item.enabled,
  }
  codeTouched.value = true
  formError.value = ''
  initialFormSnapshot.value = JSON.stringify(form.value)
  dialogVisible.value = true
}

function requestDialogVisibility(value: boolean) {
  if (!value && !confirmDiscard()) return
  dialogVisible.value = value
}

function onNameInput() {
  if (!codeTouched.value) form.value.code = slugify(form.value.name)
}

function onCodeInput() {
  codeTouched.value = true
}

function parseConfig(): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(form.value.configText || '{}') as unknown
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error()
    return parsed as Record<string, unknown>
  } catch {
    formError.value = 'Конфигурация должна быть валидным JSON-объектом.'
    return null
  }
}

async function saveElement() {
  const projectId = auth.project?.id
  const name = form.value.name.trim()
  const code = form.value.code.trim()
  formError.value = ''
  if (!projectId) return
  if (!name) { formError.value = 'Укажите название элемента.'; return }
  if (name.length > 100) { formError.value = 'Название не должно превышать 100 символов.'; return }
  if (!/^[a-z][a-z0-9_.-]*$/.test(code)) { formError.value = 'Код должен начинаться с буквы и содержать только a–z, 0–9, точку, дефис или подчёркивание.'; return }
  if (code.length > 200) { formError.value = 'Код не должен превышать 200 символов.'; return }
  if (elements.value.some((item) => item.code === code && item.id !== form.value.id)) { formError.value = 'Элемент с таким кодом уже существует.'; return }
  if (form.value.kind === 'PAGE' && !form.value.route.trim()) { formError.value = 'Укажите путь страницы.'; return }
  if (form.value.kind === 'MODAL' && !form.value.modalName.trim() && !isLegacyUnboundModal.value) { formError.value = 'Укажите имя модального окна.'; return }
  const config = parseConfig()
  if (!config) return

  saving.value = true
  try {
    let saved: UiElement
    if (!form.value.id) {
      const common = { name, code, config, enabled: form.value.enabled }
      let value: CreateUiElement
      if (form.value.kind === 'PAGE') value = { ...common, kind: 'PAGE', route: form.value.route.trim() }
      else if (form.value.kind === 'MODAL') value = { ...common, kind: 'MODAL', modalName: form.value.modalName.trim() }
      else value = { ...common, kind: 'ELEMENT', selector: form.value.selector.trim() }
      saved = await repository.createElement(projectId, value)
    } else {
      const current = elements.value.find((item) => item.id === form.value.id)
      if (!current) throw new Error('Элемент больше не существует. Обновите список.')
      const kind = form.value.kind === 'ELEMENT' && form.value.persistedKind === 'BUTTON' ? 'BUTTON' : form.value.kind
      const value: UpdateUiElement = {}
      if (name !== current.name) value.name = name
      if (code !== current.code) value.code = code
      if (kind !== current.kind) value.kind = kind
      if (JSON.stringify(config) !== JSON.stringify(current.config)) value.config = config
      if (form.value.enabled !== current.enabled) value.enabled = form.value.enabled
      if (form.value.kind === 'ELEMENT' && form.value.selector.trim() !== (current.selector ?? '')) value.selector = form.value.selector.trim()
      if (form.value.kind === 'PAGE' && form.value.route.trim() !== (current.route ?? '')) value.route = form.value.route.trim()
      if (form.value.kind === 'MODAL' && form.value.modalName.trim() !== (current.modalName ?? '')) value.modalName = form.value.modalName.trim()
      saved = Object.keys(value).length ? await repository.updateElement(projectId, current.id, value) : current
    }
    const index = elements.value.findIndex((item) => item.id === saved.id)
    if (index >= 0) elements.value.splice(index, 1, saved)
    else elements.value.push(saved)
    activeKind.value = saved.kind === 'BUTTON' ? 'ELEMENT' : saved.kind as InterfaceKind
    initialFormSnapshot.value = ''
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: form.value.id ? 'Элемент обновлён' : 'Элемент добавлен', detail: saved.name, life: 2800 })
  } catch (cause) {
    formError.value = errorMessage(cause, 'Не удалось сохранить элемент')
  } finally {
    saving.value = false
  }
}

async function toggleElement(item: UiElement, enabled: boolean) {
  const projectId = auth.project?.id
  if (!projectId) return
  togglingId.value = item.id
  try {
    const saved = await repository.updateElement(projectId, item.id, { enabled })
    Object.assign(item, saved)
  } catch (cause) {
    toast.add({ severity: 'error', summary: 'Статус не изменён', detail: errorMessage(cause), life: 3500 })
  } finally {
    togglingId.value = null
  }
}

function askDelete(item: UiElement) {
  confirm.require({
    header: 'Удалить элемент?',
    message: `«${item.name}» станет недоступен в новых сценариях.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Отмена',
    acceptLabel: 'Удалить',
    acceptProps: { severity: 'danger' },
    accept: () => deleteElement(item),
  })
}

function openIntegration(item: UiElement) {
  integrationElement.value = item
  integrationVisible.value = true
}

async function copyIntegrationGuide() {
  if (!integrationGuide.value) return
  try {
    await navigator.clipboard.writeText(integrationGuide.value)
    toast.add({ severity: 'success', summary: 'Инструкция скопирована', detail: integrationElement.value?.name, life: 2400 })
  } catch {
    toast.add({ severity: 'error', summary: 'Не удалось скопировать', detail: 'Выделите и скопируйте инструкцию вручную.', life: 3500 })
  }
}

async function deleteElement(item: UiElement) {
  const projectId = auth.project?.id
  if (!projectId) return
  try {
    await repository.deleteElement(projectId, item.id)
    elements.value = elements.value.filter((value) => value.id !== item.id)
    toast.add({ severity: 'success', summary: 'Элемент удалён', detail: item.name, life: 2500 })
  } catch (cause) {
    toast.add({ severity: 'error', summary: 'Не удалось удалить', detail: errorMessage(cause), life: 4000 })
  }
}

function errorMessage(cause: unknown, fallback = 'Произошла ошибка') {
  return cause instanceof Error ? cause.message : fallback
}
</script>

<template>
  <section class="page interface-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">UI registry</div>
        <h1>Интерфейс продукта</h1>
        <p class="subtitle">Зарегистрируйте безопасные цели, с которыми сценарии Lola могут взаимодействовать.</p>
      </div>
      <Button label="Добавить элемент" icon="pi pi-plus" @click="openCreate" />
    </header>

    <div class="kind-tabs" role="tablist" aria-label="Тип элемента">
      <button v-for="item in kindOptions" :key="item.value" type="button" role="tab" :aria-selected="activeKind === item.value" :class="{ active: activeKind === item.value }" @click="selectKind(item.value)">
        <span class="tab-icon"><i :class="item.icon" /></span>
        <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
        <b>{{ kindCount(item.value) }}</b>
      </button>
    </div>

    <div class="toolbar card">
      <span class="search-box"><i class="pi pi-search" /><InputText v-model="search" :placeholder="`Найти в разделе «${currentKind.label}»`" /></span>
      <span class="result-count">{{ filteredElements.length }} из {{ kindCount(activeKind) }}</span>
    </div>

    <Message v-if="loadError" severity="error" :closable="false"><div class="message-content"><span>{{ loadError }}</span><Button label="Повторить" size="small" text @click="loadElements" /></div></Message>

    <div v-if="loading" class="elements-grid">
      <div v-for="index in 6" :key="index" class="element-card card"><Skeleton width="3rem" height="3rem" border-radius="14px" /><Skeleton width="70%" height="1.2rem" /><Skeleton width="45%" /></div>
    </div>
    <div v-else-if="filteredElements.length" class="elements-grid">
      <article v-for="item in filteredElements" :key="item.id" class="element-card card" :class="{ disabled: !item.enabled }">
        <div class="element-head">
          <span class="element-icon"><i :class="currentKind.icon" /></span>
          <div class="element-title"><h2>{{ item.name }}</h2><code>{{ item.code }}</code></div>
          <ToggleSwitch :model-value="item.enabled" :disabled="togglingId === item.id" :aria-label="`Включить ${item.name}`" @update:model-value="toggleElement(item, $event)" />
        </div>
        <div class="element-target surface-soft">
          <span>{{ item.kind === 'BUTTON' || item.kind === 'ELEMENT' ? 'CSS-селектор' : item.kind === 'PAGE' ? 'Путь страницы' : 'Имя модального окна' }}</span>
          <code>{{ item.selector || item.route || item.modalName || 'Не задан — заполните binding' }}</code>
          <small v-if="item.kind === 'MODAL' && item.handler"><i class="pi pi-history" /> Legacy handler: <code>{{ item.handler }}</code></small>
        </div>
        <div class="element-meta">
          <Tag :value="item.kind === 'BUTTON' ? 'ELEMENT' : item.kind" severity="secondary" />
          <span><i class="pi pi-sliders-h" /> {{ Object.keys(item.config ?? {}).length }} параметров</span>
        </div>
        <footer>
          <div class="card-actions"><Button v-if="buildUiActionIntegrationGuide(item)" label="Интеграция" icon="pi pi-code" size="small" text @click="openIntegration(item)" /><Button label="Изменить" icon="pi pi-pencil" size="small" text @click="openEdit(item)" /></div>
          <Button icon="pi pi-trash" severity="danger" size="small" text rounded :aria-label="`Удалить ${item.name}`" @click="askDelete(item)" />
        </footer>
      </article>
    </div>
    <div v-else class="empty card">
      <i :class="search ? 'pi pi-search' : currentKind.icon" />
      <strong>{{ search ? 'Ничего не найдено' : `Пока нет элементов типа «${currentKind.label}»` }}</strong>
      <p>{{ search ? 'Попробуйте изменить поисковый запрос.' : 'Добавьте первый элемент, чтобы использовать его в сценариях.' }}</p>
      <Button v-if="!search" label="Добавить" icon="pi pi-plus" size="small" @click="openCreate" />
    </div>

    <Dialog :visible="dialogVisible" modal :header="form.id ? 'Изменить элемент' : 'Новый элемент'" class="entity-dialog" :style="{ width: 'min(640px, calc(100vw - 28px))' }" @update:visible="requestDialogVisibility">
      <form id="element-form" class="dialog-form" @submit.prevent="saveElement">
        <div class="form-grid">
          <div class="field"><label for="element-name">Название</label><InputText id="element-name" v-model="form.name" autofocus maxlength="100" placeholder="Блок пополнения" @input="onNameInput" /></div>
          <div class="field"><label for="element-code">Код</label><InputText id="element-code" v-model="form.code" class="mono" maxlength="200" placeholder="deposit_element" @input="onCodeInput" /></div>
        </div>
        <div class="field">
          <label>Тип элемента</label>
          <div class="type-picker">
            <button v-for="item in kindOptions" :key="item.value" type="button" :class="{ active: form.kind === item.value }" @click="form.kind = item.value"><i :class="item.icon" />{{ item.label }}</button>
          </div>
        </div>
        <div class="field"><label :for="`element-${fieldMeta.key}`">{{ fieldMeta.label }} <span>{{ fieldMeta.required ? 'обязательно' : 'необязательно' }}</span></label><InputText :id="`element-${fieldMeta.key}`" v-model="form[fieldMeta.key]" class="mono" :placeholder="fieldMeta.placeholder" :maxlength="form.kind === 'PAGE' ? 1000 : form.kind === 'MODAL' ? 200 : 500" /></div>
        <Message v-if="isLegacyUnboundModal" severity="warn" size="small" :closable="false">Это legacy-модалка без <code>modalName</code>. Её можно сохранить как есть во время миграции, но новые команды останутся на legacy-контракте, пока binding не будет заполнен.</Message>
        <div v-if="form.kind === 'MODAL' && form.handler" class="field legacy-field"><label for="element-handler">Старый handler <span>только для сверки</span></label><InputText id="element-handler" :model-value="form.handler" class="mono" disabled /><small>Устаревшее поле: runtime его не исполняет и CMS не переносит значение в modalName автоматически.</small></div>
        <div class="field"><label for="element-config">Конфигурация JSON</label><Textarea id="element-config" v-model="form.configText" class="config-editor mono" rows="7" spellcheck="false" /></div>
        <div class="enabled-row surface-soft"><div><strong>Элемент активен</strong><span>Неактивные элементы остаются в реестре, но не предлагаются для новых действий.</span></div><ToggleSwitch v-model="form.enabled" /></div>
        <Message v-if="formError" severity="error" size="small" :closable="false">{{ formError }}</Message>
      </form>
      <template #footer><Button label="Отмена" severity="secondary" text @click="requestDialogVisibility(false)" /><Button form="element-form" type="submit" label="Сохранить" icon="pi pi-check" :loading="saving" /></template>
    </Dialog>

    <Dialog v-model:visible="integrationVisible" modal header="Интеграция с AI Assistant" class="entity-dialog" :style="{ width: 'min(720px, calc(100vw - 28px))' }">
      <div v-if="integrationElement && integrationGuide" class="integration-guide">
        <div class="integration-summary surface-soft"><i class="pi pi-code" /><div><strong>{{ integrationElement.name }}</strong><span>Callback регистрируется один раз, а SDK передаёт значения этой записи.</span></div></div>
        <pre>{{ integrationGuide }}</pre>
      </div>
      <template #footer><Button label="Закрыть" severity="secondary" text @click="integrationVisible = false" /><Button label="Скопировать инструкцию" icon="pi pi-copy" @click="copyIntegrationGuide" /></template>
    </Dialog>
  </section>
</template>

<style scoped>
.interface-page{--kind-color:#8e77f5}.kind-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}.kind-tabs>button{appearance:none;border:1px solid var(--line);background:#fff;border-radius:17px;padding:15px;display:flex;align-items:center;gap:12px;text-align:left;color:var(--ink);cursor:pointer;transition:.18s ease}.kind-tabs>button:hover{border-color:#cfd1c8;transform:translateY(-1px)}.kind-tabs>button.active{border-color:#b9aefb;background:linear-gradient(145deg,#fff 20%,#f4f1ff)}.tab-icon,.element-icon{display:grid;place-items:center;width:40px;height:40px;flex:0 0 auto;border-radius:12px;background:#f0edff;color:#7059df}.kind-tabs strong,.kind-tabs small{display:block}.kind-tabs strong{font-size:.88rem}.kind-tabs small{font-size:.7rem;color:var(--muted);margin-top:3px}.kind-tabs b{margin-left:auto;background:#f1f2ed;border-radius:20px;padding:4px 8px;font-size:.7rem}.kind-tabs>button.active b{background:#e7e1ff;color:#6049ce}.toolbar{padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px}.search-box{position:relative;display:block;max-width:440px;flex:1}.search-box>i{position:absolute;left:13px;top:50%;transform:translateY(-50%);z-index:1;color:#90948b}.search-box :deep(input){padding-left:38px;border:0;background:#f6f6f3}.result-count{font-size:.75rem;color:var(--muted);white-space:nowrap}.message-content{display:flex;align-items:center;justify-content:space-between;gap:16px}.elements-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.element-card{padding:18px;display:flex;flex-direction:column;gap:17px;min-height:238px;transition:.18s ease}.element-card:hover{box-shadow:var(--shadow);transform:translateY(-2px)}.element-card.disabled{opacity:.62}.element-head{display:flex;align-items:center;gap:11px}.element-title{min-width:0;flex:1}.element-title h2{font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.element-title code{display:block;color:#777c72;font-size:.7rem;margin-top:4px;overflow:hidden;text-overflow:ellipsis}.element-target{padding:12px}.element-target>span,.element-target>code{display:block}.element-target>span{text-transform:uppercase;letter-spacing:.08em;color:#8a8f84;font-size:.62rem;font-weight:700;margin-bottom:7px}.element-target>code{font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.element-target small{display:flex;align-items:center;gap:5px;margin-top:8px;color:#9a7842;font-size:.62rem}.element-target small code{overflow:hidden;text-overflow:ellipsis}.element-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted);font-size:.7rem}.element-meta i{font-size:.65rem}.element-card footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:2px;border-top:1px solid #eeeeea}.card-actions{display:flex;align-items:center;gap:2px}.empty strong{display:block;color:var(--ink)}.empty p{margin:7px 0 18px}.dialog-form{display:flex;flex-direction:column;gap:18px;padding-top:4px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field label span{font-weight:400;color:#999d94}.legacy-field small{display:block;margin-top:6px;color:var(--muted);font-size:.68rem}.type-picker{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.type-picker button{border:1px solid var(--line);background:#fafaf8;border-radius:11px;padding:10px;color:#5f645b;cursor:pointer}.type-picker button i{margin-right:7px;font-size:.8rem}.type-picker button.active{background:#f0edff;border-color:#b9aefb;color:#5d46ca;font-weight:600}.config-editor{font-size:.78rem;line-height:1.55;resize:vertical}.enabled-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 15px}.enabled-row strong,.enabled-row span{display:block}.enabled-row strong{font-size:.82rem}.enabled-row span{font-size:.7rem;color:var(--muted);margin-top:3px;max-width:440px}.integration-guide{display:flex;flex-direction:column;gap:14px}.integration-summary{display:flex;align-items:center;gap:11px;padding:13px}.integration-summary>i{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:#e8e3ff;color:#6752c6}.integration-summary strong,.integration-summary span{display:block}.integration-summary strong{font-size:.8rem}.integration-summary span{margin-top:3px;color:var(--muted);font-size:.7rem}.integration-guide pre{max-height:480px;margin:0;padding:16px;overflow:auto;border-radius:13px;background:#252821;color:#e4e9d9;white-space:pre-wrap;font:500 .7rem/1.55 'SFMono-Regular',Consolas,monospace}
@media(max-width:1080px){.elements-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.kind-tabs small{display:none}}
@media(max-width:680px){.kind-tabs{grid-template-columns:1fr}.kind-tabs>button{padding:11px 13px}.kind-tabs small{display:block}.elements-grid{grid-template-columns:1fr}.toolbar{align-items:stretch;flex-direction:column}.search-box{max-width:none;width:100%}.result-count{align-self:flex-end}.form-grid{grid-template-columns:1fr}.type-picker{grid-template-columns:1fr}.type-picker button{text-align:left}}
</style>
