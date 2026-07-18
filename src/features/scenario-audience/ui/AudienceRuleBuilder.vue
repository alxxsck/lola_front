<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Message from 'primevue/message'
import type { SegmentSummaryResponseDto } from '@/shared/api/repository/scenario-authoring'
import { applyAudienceCommand, AUDIENCE_LIMITS, serializeAudienceDraft, summarizeAudience, type AudienceCommand, type AudienceDomainContext, type AudienceDraft, type AudienceDraftNode, type AudienceLeafDraftNode, type AudienceLeafInput, type AudienceLeafKind } from '../model'
import AudienceLeafEditor from './AudienceLeafEditor.vue'
import AudienceNodeCard from './AudienceNodeCard.vue'

const props = defineProps<{ modelValue: AudienceDraft; context: AudienceDomainContext; segmentSearch?: (query: string) => Promise<SegmentSummaryResponseDto[]> }>()
const emit = defineEmits<{ 'update:modelValue': [draft: AudienceDraft]; 'editing-dirty': [dirty: boolean] }>()
const sourceSession = ref<{ parentNodeId: string; label: string; opener: HTMLElement } | null>(null)
const editorSession = ref<{ kind: AudienceLeafKind; nodeId?: string; parentNodeId?: string; opener: HTMLElement } | null>(null)
const commandError = ref('')
const activeIssue = ref<{ fieldPath?: string; message: string } | null>(null)
const sourceDialog = ref<HTMLElement | null>(null)
const searchedSegments = ref<SegmentSummaryResponseDto[]>([])
const effectiveContext = computed<AudienceDomainContext>(() => {
  const segments = new Map(props.context.segments.map((segment) => [segment.segmentId, segment]))
  searchedSegments.value.forEach((segment) => segments.set(segment.segmentId, segment))
  return { ...props.context, segments: [...segments.values()] }
})
const summary = computed(() => summarizeAudience(props.modelValue, effectiveContext.value))
const serialization = computed(() => serializeAudienceDraft(props.modelValue, effectiveContext.value))

function findNode(node: AudienceDraftNode, nodeId: string): AudienceDraftNode | undefined {
  if (node.nodeId === nodeId) return node
  if (node.kind === 'all' || node.kind === 'any') {
    for (const child of node.children) { const found = findNode(child, nodeId); if (found) return found }
  }
  return node.kind === 'not' ? findNode(node.child, nodeId) : undefined
}

const editedNode = computed(() => {
  const node = editorSession.value?.nodeId ? findNode(props.modelValue.root, editorSession.value.nodeId) : undefined
  return node && !['all', 'any', 'not', 'opaque'].includes(node.kind) ? node as AudienceLeafDraftNode : undefined
})

function runCommand(command: AudienceCommand) {
  const result = applyAudienceCommand(props.modelValue, command, effectiveContext.value)
  if (!result.ok) { commandError.value = result.error.message; return false }
  commandError.value = ''
  emit('update:modelValue', result.draft)
  return true
}

function openSources(parentNodeId: string, label: string, opener: HTMLElement) {
  sourceSession.value = { parentNodeId, label, opener }
  void nextTick(() => document.querySelector<HTMLElement>('.source-picker [data-audience-source]')?.focus())
}

function closeSources() {
  const opener = sourceSession.value?.opener
  sourceSession.value = null
  void nextTick(() => opener?.focus())
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const controls = [...(container?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function chooseSource(kind: AudienceLeafKind) {
  const source = sourceSession.value
  if (!source) return
  editorSession.value = { kind, parentNodeId: source.parentNodeId, opener: source.opener }
  sourceSession.value = null
}

function edit(nodeId: string, opener: HTMLElement) {
  const node = findNode(props.modelValue.root, nodeId)
  if (!node || !['locale', 'language', 'country', 'userAttribute', 'segmentMembership'].includes(node.kind)) return
  editorSession.value = { kind: node.kind as AudienceLeafKind, nodeId, opener }
}

function applyLeaf(leaf: AudienceLeafInput) {
  const session = editorSession.value
  if (!session) return
  const command: AudienceCommand = session.nodeId ? { type: 'replaceLeaf', nodeId: session.nodeId, leaf } : { type: 'add', parentNodeId: session.parentNodeId!, leaf }
  if (!runCommand(command)) return
  const opener = session.opener
  editorSession.value = null
  activeIssue.value = null
  emit('editing-dirty', false)
  void nextTick(() => opener.focus())
}

function closeEditor() {
  const opener = editorSession.value?.opener
  editorSession.value = null
  activeIssue.value = null
  emit('editing-dirty', false)
  void nextTick(() => opener?.focus())
}

async function searchSegments(query: string) {
  if (!props.segmentSearch) return []
  const items = await props.segmentSearch(query)
  const segments = new Map(searchedSegments.value.map((segment) => [segment.segmentId, segment]))
  items.forEach((segment) => segments.set(segment.segmentId, segment))
  searchedSegments.value = [...segments.values()]
  return items
}

function focusIssue(issue: { nodeId?: string; fieldPath?: string; message?: string }) {
  if (!issue.nodeId) return
  const node = findNode(props.modelValue.root, issue.nodeId)
  const opener = document.querySelector<HTMLElement>(`[data-audience-node="${issue.nodeId}"] article`)
  if (!node || !opener || !['locale', 'language', 'country', 'userAttribute', 'segmentMembership'].includes(node.kind)) return
  activeIssue.value = issue.message ? { fieldPath: issue.fieldPath, message: issue.message } : null
  editorSession.value = { kind: node.kind as AudienceLeafKind, nodeId: node.nodeId, opener }
  void nextTick(() => {
    const selector = issue.fieldPath === 'definitionId' ? '[aria-label="Атрибут пользователя"]' : issue.fieldPath === 'segmentId' ? '[aria-label="Сегмент аудитории"]' : issue.fieldPath === 'operator' ? '.leaf-editor select[aria-label^="Оператор"], .leaf-editor select[aria-label^="Проверка"]' : '.leaf-editor [aria-label^="Значение"], .leaf-editor [aria-label="ISO-код страны"]'
    document.querySelector<HTMLElement>(selector)?.focus()
  })
}

defineExpose({ focusIssue })
</script>

<template>
  <section class="audience-builder" aria-labelledby="audience-builder-title">
    <header class="builder-header"><div><span class="eyebrow">Аудитория</span><h2 id="audience-builder-title">Кто может войти в сценарий</h2><p>Ограничьте аудиторию по locale, языку, стране, типизированным атрибутам или опубликованным сегментам.</p></div><div class="health" :class="summary.status"><strong>{{ summary.leaves }} условий</strong><span>{{ summary.status === 'empty' ? 'Без ограничений' : serialization.ok ? 'Готово к проверке' : 'Нужно исправить' }}</span></div></header>
    <Message v-if="commandError" severity="error" :closable="false">{{ commandError }}</Message>
    <div class="semantics-note"><i class="pi pi-shield" /><div><strong>Отдельно от поведения</strong><span>Audience читает текущее состояние End User. История Events и поля Trigger остаются на этапе «Условия».</span></div></div>
    <details class="policy"><summary>Когда и как проверяется аудитория?</summary><p>Первое решение сохраняется в Run при старте. При включённой повторной проверке доставки backend применяет тот же pinned contract к текущему состоянию и хранит результат отдельно.</p><p>Отсутствующее или null-значение совпадает только с проверкой «не заполнено».</p></details>
    <ol class="audience-tree"><AudienceNodeCard :node="modelValue.root" :summary-by-node-id="summary.byNodeId" root @add-condition="openSources" @command="runCommand" @edit="edit" /></ol>
    <aside class="summary"><div><span>Итог</span><strong>{{ summary.text }}</strong></div><dl><div><dt>Условия</dt><dd>{{ summary.leaves }}</dd></div><div><dt>Сегменты</dt><dd>{{ summary.segmentLeaves }}</dd></div><div><dt>Скрытые</dt><dd>{{ summary.sensitiveLeaves }}</dd></div></dl><small>Audience catalog <code>{{ effectiveContext.catalog.revision }}</code> · {{ summary.nodes }}/{{ AUDIENCE_LIMITS.maxNodes }} узлов</small></aside>
    <div v-if="sourceSession" class="source-backdrop" role="presentation" @mousedown.self="closeSources"><section ref="sourceDialog" class="source-picker" role="dialog" aria-modal="true" aria-labelledby="audience-source-title" @keydown.esc="closeSources" @keydown.tab="trapFocus($event, sourceDialog)"><header><div><span>Новый признак</span><h3 id="audience-source-title">Что проверить</h3><p>В группе «{{ sourceSession.label }}»</p></div><button type="button" aria-label="Закрыть выбор признака" @click="closeSources"><i class="pi pi-times" /></button></header><div class="source-grid"><button type="button" data-audience-source="locale" @click="chooseSource('locale')"><i class="pi pi-globe" /><span><strong>Locale</strong><small>Точный locale проекта, например ru-RU.</small></span></button><button type="button" data-audience-source="language" @click="chooseSource('language')"><i class="pi pi-language" /><span><strong>Язык</strong><small>Основной язык locale: ru, en и другие.</small></span></button><button type="button" data-audience-source="country" @click="chooseSource('country')"><i class="pi pi-map-marker" /><span><strong>Страна</strong><small>ISO-код из профиля End User.</small></span></button><button type="button" data-audience-source="userAttribute" @click="chooseSource('userAttribute')"><i class="pi pi-id-card" /><span><strong>Атрибут</strong><small>Типизированное поле схемы пользователя.</small></span></button><button v-if="context.allowSegments !== false" type="button" data-audience-source="segmentMembership" @click="chooseSource('segmentMembership')"><i class="pi pi-users" /><span><strong>Сегмент</strong><small>Точная immutable версия сегмента.</small></span></button></div></section></div>
    <AudienceLeafEditor v-if="editorSession" :key="`${editorSession.kind}:${editorSession.nodeId ?? 'new'}`" :kind="editorSession.kind" :node="editedNode" :context="effectiveContext" :segment-search="props.segmentSearch ? searchSegments : undefined" :active-issue="activeIssue ?? undefined" @apply="applyLeaf" @close="closeEditor" @dirty-change="emit('editing-dirty', $event)" />
  </section>
</template>

<style scoped>
.audience-builder{container:audience-builder / inline-size;display:flex;flex-direction:column;gap:14px;min-width:0;padding:20px;background:#f5f6f1;color:var(--ink)}.builder-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.builder-header h2{font-size:1.1rem}.builder-header p{margin:5px 0 0;color:var(--muted);font-size:.72rem}.health{flex:0 0 auto;padding:9px 11px;border:1px solid #dfe2d8;border-radius:12px;background:#fff;text-align:right}.health strong,.health span{display:block}.health strong{font-size:.71rem}.health span{margin-top:3px;color:var(--muted);font-size:.62rem}.health.ready{border-color:#c8dfad;background:#f7fbea}.health.invalid,.health.unsupported{border-color:#edc5bd;background:#fff8f6}.semantics-note{display:flex;gap:10px;padding:12px 14px;border:1px solid #d9d4ef;border-radius:13px;background:#fbfaff;color:#504780}.semantics-note strong,.semantics-note span{display:block}.semantics-note strong{font-size:.7rem}.semantics-note span{margin-top:3px;font-size:.64rem;line-height:1.4}.policy{padding:0 3px;color:#656b62;font-size:.67rem}.policy summary{cursor:pointer;font-weight:800}.policy p{margin:7px 0 0;line-height:1.5}.audience-tree{margin:0;padding:0}.summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border-radius:15px;background:#242821;color:#f4f5f1}.summary span{display:block;color:#aeb3a8;font-size:.58rem;text-transform:uppercase}.summary strong{display:block;margin-top:4px;font-size:.7rem;line-height:1.45}.summary dl{display:flex;gap:14px;margin:0}.summary dl div{text-align:right}.summary dt{color:#aeb3a8;font-size:.57rem}.summary dd{margin:3px 0 0;font-size:.7rem;font-weight:800}.summary small{grid-column:1/3;color:#b9beb4;font-size:.6rem}.summary code{color:#d7ff64}.source-backdrop{position:fixed;inset:0;z-index:1190;display:grid;background:#20241f66;place-items:center;padding:18px}.source-picker{width:min(620px,100%);padding:20px;border-radius:18px;background:#fff;box-shadow:0 24px 70px #1115}.source-picker header{display:flex;justify-content:space-between}.source-picker header span{color:#7764d2;font-size:.58rem;font-weight:800;text-transform:uppercase}.source-picker h3{margin:3px 0 0}.source-picker p{margin:3px 0 0;color:var(--muted);font-size:.64rem}.source-picker header button{width:32px;height:32px;border:0;border-radius:50%;background:#f1f2ed}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.source-grid>button{display:flex;align-items:center;gap:10px;padding:13px;border:1px solid #dfe2d9;border-radius:12px;background:#fff;text-align:left;cursor:pointer}.source-grid>button:hover{border-color:#8875d8;background:#faf9ff}.source-grid i{color:#765fd2}.source-grid strong,.source-grid small{display:block}.source-grid strong{font-size:.7rem}.source-grid small{margin-top:3px;color:var(--muted);font-size:.6rem;line-height:1.35}@container audience-builder (max-width:520px){.audience-builder{padding:13px}.builder-header{flex-direction:column}.summary{grid-template-columns:1fr}.summary dl{justify-content:space-between}.summary small{grid-column:1}.source-grid{grid-template-columns:1fr}}
</style>
