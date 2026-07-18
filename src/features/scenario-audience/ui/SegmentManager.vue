<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import Message from 'primevue/message'
import { ApiError } from '@/shared/api/http/api-error'
import { scenarioAuthoringRepository, type AudienceCatalogResponseDto, type SegmentDetailResponseDto, type SegmentSummaryResponseDto } from '@/shared/api/repository/scenario-authoring'
import { createAudienceDraft, deserializeAudience, mapAudienceIssues, serializeAudienceDraft, summarizeAudience, type AudienceDomainContext, type AudienceDraft } from '../model'
import AudienceRuleBuilder from './AudienceRuleBuilder.vue'

const props = defineProps<{ projectId: string; catalog: AudienceCatalogResponseDto; readonly?: boolean; refreshCatalog?: () => Promise<AudienceCatalogResponseDto> }>()
const emit = defineEmits<{ changed: [] }>()
const loading = ref(false)
const error = ref('')
const notice = ref('')
const query = ref('')
const appliedQuery = ref<string | undefined>()
const items = ref<SegmentSummaryResponseDto[]>([])
const nextCursor = ref<string | null>(null)
const detail = ref<SegmentDetailResponseDto | null>(null)
const detailLoading = ref(false)
const editorOpen = ref(false)
const editorDirty = ref(false)
const editorBaseline = ref('')
const saving = ref(false)
const recoveryKind = ref<'catalog' | 'head' | null>(null)
const audienceBuilder = ref<{ focusIssue: (issue: { nodeId?: string; fieldPath?: string; message?: string }) => void } | null>(null)
const editorDialog = ref<HTMLElement | null>(null)
const detailDialog = ref<HTMLElement | null>(null)
let searchSequence = 0
let detailSequence = 0
let dialogOpener: HTMLElement | null = null
const draft = ref<AudienceDraft>(createAudienceDraft())
const form = reactive({ segmentId: null as string | null, expectedCurrentRevisionId: null as string | null, key: '', name: '', description: '' })
const segmentContext = computed<AudienceDomainContext>(() => ({ catalog: props.catalog, segments: [], allowSegments: false }))
const summary = computed(() => summarizeAudience(draft.value, segmentContext.value))
const serialization = computed(() => serializeAudienceDraft(draft.value, segmentContext.value))
const canPublish = computed(() => !props.readonly && Boolean(form.name.trim()) && (!form.segmentId ? /^[a-z][a-z0-9_-]{0,63}$/.test(form.key) : true) && serialization.value.ok && !saving.value)

onMounted(() => void searchSegments())

function message(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiError)) return cause instanceof Error ? cause.message : fallback
  const messages: Record<string, string> = {
    AUDIENCE_CATALOG_REVISION_STALE: 'Каталог Audience обновился. Подтяните его ниже: редактор сохранит ваш черновик для повторной проверки.',
    SEGMENT_REVISION_CONFLICT: 'Другой администратор уже опубликовал новую версию. Подтяните новый head ниже — ваш черновик останется в редакторе.',
    SEGMENT_KEY_CONFLICT: 'Такой ключ сегмента уже используется в проекте. Выберите другой ключ.',
    SEGMENT_ARCHIVED: 'Сегмент уже архивирован. Его immutable-версии доступны только для истории и pinned сценариев.',
    SEGMENT_RULE_INVALID: 'Backend отклонил правило сегмента. Перейдите к отмеченному условию и исправьте его.',
    PROJECT_RESOURCE_NOT_FOUND: 'Сегмент недоступен в текущем проекте или у вас нет доступа.',
  }
  return (cause.code ? messages[cause.code] : undefined) ?? cause.message ?? fallback
}

async function searchSegments(append = false) {
  const request = ++searchSequence
  const requestQuery = append ? appliedQuery.value : query.value.trim() || undefined
  const requestCursor = append ? nextCursor.value ?? undefined : undefined
  loading.value = true
  error.value = ''
  try {
    const response = await scenarioAuthoringRepository.searchSegments(props.projectId, { query: requestQuery, limit: 25, includeArchived: true, cursor: requestCursor })
    if (request !== searchSequence) return
    items.value = append ? [...items.value, ...response.items] : response.items
    if (!append) appliedQuery.value = requestQuery
    nextCursor.value = response.nextCursor ?? null
  } catch (cause) { if (request === searchSequence) error.value = message(cause, 'Не удалось загрузить сегменты') } finally { if (request === searchSequence) loading.value = false }
}

async function openDetail(segment: SegmentSummaryResponseDto) {
  const request = ++detailSequence
  dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  detailLoading.value = true
  error.value = ''
  try {
    const response = await scenarioAuthoringRepository.getSegment(props.projectId, segment.segmentId)
    if (request !== detailSequence) return
    detail.value = response
    void nextTick(() => detailDialog.value?.querySelector<HTMLElement>('button')?.focus())
  } catch (cause) { if (request === detailSequence) error.value = message(cause, 'Не удалось открыть сегмент') } finally { if (request === detailSequence) detailLoading.value = false }
}

function createSegment() {
  if (props.readonly) return
  dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  form.segmentId = null
  form.expectedCurrentRevisionId = null
  form.key = ''
  form.name = ''
  form.description = ''
  draft.value = createAudienceDraft()
  editorBaseline.value = editorSnapshot()
  editorOpen.value = true
  void nextTick(() => editorDialog.value?.querySelector<HTMLInputElement>('input[aria-label="Название сегмента"]')?.focus())
}

function editCurrentRevision() {
  if (props.readonly) return
  const segment = detail.value
  if (!segment?.currentRevision) return
  form.segmentId = segment.segmentId
  form.expectedCurrentRevisionId = segment.currentRevision.segmentRevisionId
  form.key = segment.key
  form.name = segment.name
  form.description = segment.description ?? ''
  draft.value = deserializeAudience(segment.currentRevision.rule, segmentContext.value).draft
  editorBaseline.value = editorSnapshot()
  detail.value = null
  editorOpen.value = true
  void nextTick(() => editorDialog.value?.querySelector<HTMLInputElement>('input[aria-label="Название сегмента"]')?.focus())
}

function editorSnapshot() {
  return JSON.stringify({ form: { ...form }, draft: draft.value })
}

function closeEditor() {
  if ((editorDirty.value || editorSnapshot() !== editorBaseline.value) && !window.confirm('Закрыть редактор и потерять неопубликованные изменения сегмента?')) return
  editorOpen.value = false
  editorDirty.value = false
  recoveryKind.value = null
  void nextTick(() => dialogOpener?.focus())
}

async function publish() {
  if (!canPublish.value || !serialization.value.ok) return
  saving.value = true
  error.value = ''
  try {
    const payload = {
      catalogRevision: props.catalog.revision,
      expectedCurrentRevisionId: form.expectedCurrentRevisionId,
      ...(!form.segmentId ? { key: form.key } : {}),
      name: form.name.trim(),
      description: form.description.trim() || null,
      rule: serialization.value.value,
    }
    if (form.segmentId) await scenarioAuthoringRepository.publishSegmentRevision(props.projectId, form.segmentId, payload)
    else await scenarioAuthoringRepository.createSegment(props.projectId, payload)
    notice.value = form.segmentId ? 'Новая immutable-версия сегмента опубликована.' : 'Сегмент создан и первая immutable-версия опубликована.'
    editorOpen.value = false
    detail.value = null
    editorDirty.value = false
    emit('changed')
    await searchSegments()
  } catch (cause) {
    error.value = message(cause, 'Не удалось опубликовать сегмент')
    if (cause instanceof ApiError && cause.code === 'AUDIENCE_CATALOG_REVISION_STALE') recoveryKind.value = 'catalog'
    if (cause instanceof ApiError && cause.code === 'SEGMENT_REVISION_CONFLICT') recoveryKind.value = 'head'
    if (cause instanceof ApiError && cause.code === 'SEGMENT_RULE_INVALID' && serialization.value.ok) {
      const details = cause.details && typeof cause.details === 'object' ? cause.details as { issues?: unknown; details?: unknown } : null
      const nested = details?.details && typeof details.details === 'object' ? details.details as { issues?: unknown } : null
      const rawIssues = details?.issues ?? nested?.issues
      const issues = Array.isArray(rawIssues) ? rawIssues.filter((issue): issue is { code: string; message: string; path: string } => Boolean(issue && typeof issue === 'object' && 'code' in issue && 'message' in issue && 'path' in issue)) : []
      const first = mapAudienceIssues(issues, serialization.value.pathIndex)[0]
      if (first) { error.value = first.message; void nextTick(() => audienceBuilder.value?.focusIssue(first)) }
    }
  } finally { saving.value = false }
}

async function recoverEditor() {
  const recovery = recoveryKind.value
  if (!recovery) return
  saving.value = true
  error.value = ''
  try {
    if (recovery === 'catalog') {
      if (!props.refreshCatalog) throw new Error('Обновление каталога аудитории недоступно без перезагрузки страницы.')
      const catalog = await props.refreshCatalog()
      notice.value = `Каталог обновлён до ${catalog.revision}. Черновик сохранён — проверьте отмеченные условия и повторите публикацию.`
    } else if (form.segmentId) {
      const latest = await scenarioAuthoringRepository.getSegment(props.projectId, form.segmentId)
      form.expectedCurrentRevisionId = latest.currentRevision?.segmentRevisionId ?? null
      notice.value = `Текущая опубликованная версия обновлена до ${form.expectedCurrentRevisionId ?? 'пустой'}. Ваш черновик сохранён; проверьте его перед повторной публикацией.`
    }
    recoveryKind.value = null
  } catch (cause) { error.value = message(cause, 'Не удалось обновить данные для повторной публикации') } finally { saving.value = false }
}

async function archive(segment: SegmentSummaryResponseDto) {
  if (props.readonly) return
  if (!window.confirm(`Архивировать «${segment.name}»? Новые сценарии больше не смогут выбрать сегмент, но закреплённые версии продолжат работать.`)) return
  error.value = ''
  try {
    await scenarioAuthoringRepository.archiveSegment(props.projectId, segment.segmentId)
    notice.value = 'Сегмент архивирован. Опубликованные сценарии продолжают использовать закреплённые версии.'
    detail.value = null
    emit('changed')
    await searchSegments()
  } catch (cause) { error.value = message(cause, 'Не удалось архивировать сегмент') }
}

function date(value: string) { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

function closeDetail() {
  detail.value = null
  detailLoading.value = false
  detailSequence += 1
  void nextTick(() => dialogOpener?.focus())
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const controls = [...(container?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
</script>

<template>
  <section class="segment-manager" aria-labelledby="segment-title">
    <header><div><span class="eyebrow">Переиспользуемые аудитории</span><h3 id="segment-title">Сегменты проекта</h3><p>Сегмент имеет постоянный идентификатор и неизменяемые версии. Сценарий всегда закрепляет точную опубликованную версию.</p></div><button v-if="!readonly" type="button" class="primary" aria-label="Создать сегмент" @click="createSegment"><i class="pi pi-plus" /> Новый сегмент</button></header>
    <Message v-if="readonly" severity="info" :closable="false">Режим просмотра: создавать версии и архивировать сегменты могут только владельцы и администраторы.</Message>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message><Message v-if="notice" severity="success" :closable="false">{{ notice }}</Message>
    <div v-if="recoveryKind" class="recovery" role="alert"><span>Неопубликованный черновик сохранён в редакторе.</span><button type="button" :disabled="saving" @click="recoverEditor">{{ recoveryKind === 'catalog' ? 'Обновить каталог' : 'Загрузить новую версию' }}</button></div>
    <form class="search" @submit.prevent="searchSegments()"><label><span class="sr-only">Поиск сегментов</span><i class="pi pi-search" /><input v-model="query" aria-label="Поиск сегментов" placeholder="Название или ключ"><button type="submit">Найти</button></label></form>
    <div v-if="loading && !items.length" class="empty">Загружаем сегменты…</div><div v-else-if="!items.length" class="empty"><i class="pi pi-users" /><strong>Сегментов пока нет</strong><span>Создайте первый, чтобы переиспользовать одну аудиторию в нескольких сценариях.</span></div>
    <ul v-else class="segments"><li v-for="segment in items" :key="segment.segmentId"><button type="button" class="segment-main" :aria-label="`Открыть сегмент ${segment.name}`" @click="openDetail(segment)"><span class="status" :class="segment.status.toLowerCase()">{{ segment.status === 'ACTIVE' ? 'Активен' : 'Архив' }}</span><strong>{{ segment.name }}</strong><code>{{ segment.key }}</code><small v-if="segment.currentRevision">Версия {{ segment.currentRevision.revision }} · {{ date(segment.currentRevision.publishedAt) }}</small></button><button v-if="segment.status === 'ACTIVE' && !readonly" type="button" class="archive" :aria-label="`Архивировать сегмент ${segment.name}`" @click="archive(segment)"><i class="pi pi-box" /></button></li></ul>
    <button v-if="nextCursor" type="button" class="more" :disabled="loading" @click="searchSegments(true)">Показать ещё</button>

    <div v-if="detail || detailLoading" class="detail-backdrop" role="presentation" @mousedown.self="closeDetail"><aside ref="detailDialog" class="detail" role="dialog" aria-modal="true" aria-labelledby="segment-detail-title" @keydown.esc="closeDetail" @keydown.tab="trapFocus($event, detailDialog)"><header><div><span>Определение сегмента</span><h3 id="segment-detail-title">{{ detail?.name ?? 'Загрузка…' }}</h3><code v-if="detail">{{ detail.key }}</code></div><button type="button" aria-label="Закрыть карточку сегмента" @click="closeDetail"><i class="pi pi-times" /></button></header><template v-if="detail"><p>{{ detail.description || 'Описание не задано.' }}</p><div class="detail-actions"><button v-if="detail.status === 'ACTIVE' && !readonly" type="button" class="primary" @click="editCurrentRevision"><i class="pi pi-plus" /> Новая версия</button></div><section><h4>Текущая версия</h4><div v-if="detail.currentRevision" class="revision current"><strong>Версия {{ detail.currentRevision.revision }}</strong><span>{{ date(detail.currentRevision.publishedAt) }}</span><code>{{ detail.currentRevision.contentHash }}</code></div><p v-else>Опубликованных версий нет.</p></section><section><h4>История версий</h4><ol><li v-for="revision in detail.revisions" :key="revision.segmentRevisionId" class="revision"><strong>Версия {{ revision.revision }}</strong><span>{{ date(revision.publishedAt) }}</span><code>{{ revision.contentHash }}</code></li></ol><small>История доступна только для чтения: новая публикация создаёт следующую версию и не изменяет предыдущие.</small></section></template></aside></div>

    <div v-if="editorOpen" class="editor-backdrop"><section ref="editorDialog" class="editor" role="dialog" aria-modal="true" aria-labelledby="segment-editor-title" @keydown.esc="closeEditor" @keydown.tab="trapFocus($event, editorDialog)"><header><div><span>Неизменяемая версия сегмента</span><h3 id="segment-editor-title">{{ form.segmentId ? 'Новая версия сегмента' : 'Новый сегмент' }}</h3><p>{{ form.segmentId ? `Текущая опубликованная версия ${form.expectedCurrentRevisionId}` : 'Постоянный идентификатор и первая версия будут созданы атомарно.' }}</p></div><button type="button" aria-label="Закрыть редактор сегмента" @click="closeEditor"><i class="pi pi-times" /></button></header><div class="fields"><label><span>Название *</span><input v-model="form.name" aria-label="Название сегмента" maxlength="128" placeholder="Например, Русскоязычные VIP"></label><label v-if="!form.segmentId"><span>Стабильный ключ *</span><input v-model="form.key" aria-label="Ключ сегмента" maxlength="64" placeholder="russian_vip"><small>Начинается с латинской буквы; допустимы a-z, 0-9, _ и -. После создания постоянный ключ не меняется.</small></label><label class="wide"><span>Описание</span><textarea v-model="form.description" maxlength="1000" rows="2" aria-label="Описание сегмента" /></label></div><AudienceRuleBuilder ref="audienceBuilder" v-model="draft" :context="segmentContext" @editing-dirty="editorDirty = $event" /><footer><div><strong>{{ summary.text }}</strong><small>Каталог {{ catalog.revision }}</small></div><button type="button" class="secondary" @click="closeEditor">Отмена</button><button type="button" class="primary" aria-label="Опубликовать сегмент" :disabled="!canPublish" @click="publish">{{ saving ? 'Публикуем…' : 'Опубликовать версию' }}</button></footer></section></div>
  </section>
</template>

<style scoped>
.segment-manager{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--status-violet);border-radius:16px;background:var(--status-violet-soft)}.segment-manager>header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.segment-manager h3{margin:3px 0 0;font-size:.9rem}.segment-manager header p{max-width:680px;margin:4px 0 0;color:var(--text-small-muted);font-size:.65rem;line-height:1.45}.primary,.secondary{padding:9px 12px;border-radius:9px;font-size:.65rem;font-weight:800;cursor:pointer}.primary{border:1px solid var(--surface-emphasis-raised);background:var(--surface-emphasis-raised);color:var(--text-on-emphasis)}.primary:disabled{opacity:.4}.secondary{border:1px solid var(--border-default);background:var(--surface-card)}.search label{display:flex;align-items:center;gap:8px;padding:5px 5px 5px 11px;border:1px solid var(--border-default);border-radius:11px;background:var(--surface-card)}.search input{flex:1;min-width:0;border:0;outline:0;font:inherit}.search button{padding:7px 10px;border:0;border-radius:7px;background:var(--status-violet-soft);color:var(--status-violet-text);font-weight:800}.segments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0}.segments li{display:grid;grid-template-columns:minmax(0,1fr) auto;border:1px solid var(--border-default);border-radius:12px;background:var(--surface-card);overflow:hidden}.segment-main{display:flex;flex-direction:column;align-items:flex-start;padding:11px;border:0;background:transparent;text-align:left;cursor:pointer}.segment-main strong{margin-top:5px;font-size:.72rem}.segment-main code{margin-top:2px;color:var(--text-small-muted);font-size:.6rem}.segment-main small{margin-top:7px;color:var(--text-small-muted);font-size:.58rem}.status{padding:3px 6px;border-radius:999px;background:var(--status-success-soft);color:var(--status-success-text);font-size:.53rem;font-weight:900;text-transform:uppercase}.status.archived{background:var(--surface-subtle);color:var(--text-secondary)}.archive{width:38px;border:0;border-left:1px solid var(--surface-subtle);background:var(--surface-subtle);color:var(--text-secondary);cursor:pointer}.more{align-self:center;padding:7px 12px;border:1px solid var(--border-default);border-radius:9px;background:var(--surface-card)}.empty{display:flex;flex-direction:column;align-items:center;padding:22px;border:1px dashed var(--border-default);border-radius:12px;color:var(--text-small-muted);text-align:center;font-size:.64rem}.empty strong{margin-top:6px;color:var(--ink)}.empty span{margin-top:4px}.detail-backdrop,.editor-backdrop{position:fixed;inset:0;z-index:1250;background:var(--overlay-backdrop)}.detail{position:absolute;top:0;right:0;width:min(520px,100%);height:100%;padding:22px;background:var(--surface-card);overflow:auto}.detail>header,.editor>header{display:flex;justify-content:space-between;gap:12px}.detail>header span,.editor>header span{color:var(--status-violet-text);font-size:.58rem;font-weight:900;text-transform:uppercase}.detail>header h3,.editor>header h3{margin:4px 0}.detail>header button,.editor>header button{width:34px;height:34px;border:0;border-radius:50%;background:var(--surface-subtle)}.detail>p{color:var(--text-small-muted);font-size:.68rem}.detail section{margin-top:18px}.detail h4{font-size:.7rem}.detail ol{display:flex;flex-direction:column;gap:7px;padding:0}.revision{display:grid;grid-template-columns:1fr auto;gap:4px;padding:10px;border:1px solid var(--border-default);border-radius:10px}.revision strong,.revision span{font-size:.63rem}.revision code{grid-column:1/3;color:var(--text-small-muted);font-size:.56rem}.revision.current{border-color:var(--status-success);background:var(--status-success-soft)}.detail section>small{color:var(--text-small-muted);font-size:.6rem}.editor-backdrop{z-index:1300;overflow:auto;padding:18px}.editor{width:min(1040px,100%);margin:auto;padding:20px;border-radius:18px;background:var(--surface-card)}.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.fields label{display:flex;flex-direction:column;gap:5px}.fields span{font-size:.65rem;font-weight:800}.fields input,.fields textarea{padding:9px 10px;border:1px solid var(--border-default);border-radius:9px;font:inherit}.fields small{color:var(--text-small-muted);font-size:.58rem}.fields .wide{grid-column:1/3}.editor>footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:14px}.editor>footer>div{margin-right:auto}.editor>footer strong,.editor>footer small{display:block}.editor>footer strong{font-size:.65rem}.editor>footer small{margin-top:3px;color:var(--text-small-muted);font-size:.58rem}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:720px){.segment-manager>header{flex-direction:column}.segments{grid-template-columns:1fr}.editor-backdrop{padding:0}.editor{min-height:100%;border-radius:0;padding:14px}.fields{grid-template-columns:1fr}.fields .wide{grid-column:1}.editor>footer{align-items:stretch;flex-wrap:wrap}.editor>footer>div{width:100%}}
.recovery{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--status-warning);border-radius:10px;background:var(--status-warning-soft);font-size:.64rem}.recovery button{padding:7px 10px;border:1px solid var(--status-warning-text);border-radius:8px;background:var(--surface-card);color:var(--status-warning-text);font-weight:800;cursor:pointer}
</style>
