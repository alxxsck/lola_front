<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'

import { scenarioAuthoringRepository, type ScenarioRevisionDetailResponseDto, type ScenarioRevisionListItemResponseDto } from '@/shared/api/repository/scenario-authoring'
import { scenarioApiErrorMessage } from '@/features/scenarios/scenario-api-error'
import { formatDate } from '@/shared/lib/format'

const props = defineProps<{
  projectId: string
  scenarioId: string
  currentRevisionId: string | null
  readonly?: boolean
}>()

const emit = defineEmits<{ 'head-change': [revisionId: string] }>()

const revisions = ref<ScenarioRevisionListItemResponseDto[]>([])
const nextCursor = ref<string | null>(null)
const selected = ref<ScenarioRevisionDetailResponseDto | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const detailLoading = ref(false)
const rollingBack = ref(false)
const error = ref('')

async function load(reset = true) {
  if (!props.projectId || !props.scenarioId || (!reset && !nextCursor.value)) return
  if (reset) loading.value = true
  else loadingMore.value = true
  error.value = ''
  try {
    const page = await scenarioAuthoringRepository.getScenarioRevisions(props.projectId, props.scenarioId, {
      limit: 25,
      ...(!reset && nextCursor.value ? { cursor: nextCursor.value } : {}),
    })
    revisions.value = reset ? page.items : [...revisions.value, ...page.items]
    nextCursor.value = page.nextCursor ?? null
  } catch (cause) {
    error.value = scenarioApiErrorMessage(cause, 'Не удалось загрузить историю версий')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function openRevision(revision: ScenarioRevisionListItemResponseDto) {
  detailLoading.value = true
  error.value = ''
  try {
    selected.value = await scenarioAuthoringRepository.getScenarioRevision(props.projectId, props.scenarioId, revision.id)
  } catch (cause) {
    error.value = scenarioApiErrorMessage(cause, 'Не удалось загрузить версию')
  } finally {
    detailLoading.value = false
  }
}

async function rollback(revision: ScenarioRevisionListItemResponseDto) {
  if (props.readonly || revision.current || !revision.editable || !props.currentRevisionId) return
  if (!window.confirm(`Создать новую версию на основе №${revision.revisionNumber}? История останется неизменной.`)) return
  rollingBack.value = true
  error.value = ''
  try {
    await scenarioAuthoringRepository.rollbackScenario(
      props.projectId,
      props.scenarioId,
      revision.id,
      props.currentRevisionId,
    )
    const document = await scenarioAuthoringRepository.getScenarioDocument(props.projectId, props.scenarioId)
    if (document.currentRevisionId) emit('head-change', document.currentRevisionId)
    selected.value = null
    await load()
  } catch (cause) {
    error.value = scenarioApiErrorMessage(cause, 'Не удалось выполнить безопасный откат')
  } finally {
    rollingBack.value = false
  }
}

watch(() => [props.projectId, props.scenarioId], () => void load())
onMounted(() => void load())
</script>

<template>
  <section class="revision-history" aria-labelledby="revision-history-title">
    <header><div><span>Неизменяемая история</span><h2 id="revision-history-title">История публикаций</h2><p>Откат не переписывает прошлое — он создаёт новую версию-наследника.</p></div><Button icon="pi pi-refresh" text rounded aria-label="Обновить историю версий" :loading="loading" @click="load()" /></header>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <div v-if="loading" class="revision-list"><Skeleton v-for="item in 3" :key="item" height="72px" /></div>
    <div v-else class="revision-list">
      <article v-for="revision in revisions" :key="revision.id" :class="{ current: revision.current }">
        <button type="button" class="revision-main" :aria-label="`Открыть версию ${revision.revisionNumber}`" @click="openRevision(revision)">
          <span><strong>Версия №{{ revision.revisionNumber }}</strong><small>{{ formatDate(revision.publishedAt) }} · {{ revision.publishedByAdminId ?? 'система' }}</small></span>
          <code :title="`Хеш содержимого: ${revision.contentHash}`">{{ revision.contentHash }}</code><em v-if="revision.current">текущая</em><i class="pi pi-chevron-right" />
        </button>
        <Button
          label="Откатить"
          icon="pi pi-history"
          severity="secondary"
          size="small"
          :aria-label="`Откатить к версии ${revision.revisionNumber}`"
          :disabled="readonly || revision.current || !revision.editable || !currentRevisionId"
          :loading="rollingBack"
          @click="rollback(revision)"
        />
      </article>
      <Button v-if="nextCursor" label="Загрузить более ранние" icon="pi pi-chevron-down" severity="secondary" text aria-label="Загрузить более ранние версии" :loading="loadingMore" @click="load(false)" />
    </div>
    <aside v-if="selected || detailLoading" class="revision-detail">
      <Skeleton v-if="detailLoading" height="100px" />
      <template v-else-if="selected"><div><strong>Версия №{{ selected.revisionNumber }}</strong><button type="button" aria-label="Закрыть сведения о версии" @click="selected = null">×</button></div><dl><dt>Хеш содержимого</dt><dd><code>{{ selected.contentHash }}</code></dd><dt>Версия каталога</dt><dd><code>{{ selected.catalogRevision }}</code></dd><dt>Автор</dt><dd>{{ selected.publishedByAdminId ?? 'система' }}</dd><dt>Исходные настройки</dt><dd>{{ selected.editable ? 'доступны для восстановления' : 'доступен только снимок выполнения' }}</dd></dl></template>
    </aside>
  </section>
</template>

<style scoped>
.revision-history{display:grid;gap:12px;padding-top:18px;border-top:1px solid var(--line)}header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}header span{color:var(--text-small-muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.1em}header h2{margin:4px 0 0;font-size:1.05rem}header p{margin:4px 0 0;color:var(--text-small-muted);font-size:.68rem}.revision-list{display:grid;gap:8px}.revision-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--surface-card)}.revision-list article.current{border-color:var(--status-success);background:var(--status-success-soft)}.revision-main{display:grid;grid-template-columns:minmax(150px,1fr) minmax(100px,.7fr) auto auto;align-items:center;gap:9px;min-width:0;border:0;background:transparent;text-align:left;cursor:pointer}.revision-main strong,.revision-main small{display:block}.revision-main strong{font-size:.72rem}.revision-main small{margin-top:3px;color:var(--text-small-muted);font-size:.61rem}.revision-main code{overflow:hidden;color:var(--text-small-muted);font-size:.6rem;text-overflow:ellipsis}.revision-main em{padding:3px 6px;border-radius:7px;background:var(--status-success-soft);color:var(--status-success-text);font-size:.58rem;font-style:normal}.revision-detail{padding:13px;border-radius:12px;background:var(--surface-subtle)}.revision-detail>div{display:flex;justify-content:space-between}.revision-detail button{border:0;background:transparent;font-size:1.1rem}.revision-detail dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px;margin:10px 0 0;font-size:.65rem}.revision-detail dt{color:var(--text-small-muted)}.revision-detail dd{min-width:0;margin:0;overflow-wrap:anywhere}@media(max-width:620px){.revision-list article{grid-template-columns:1fr}.revision-main{grid-template-columns:1fr auto}.revision-main code{grid-column:1/3}.revision-list article :deep(.p-button){width:100%}}
</style>
