<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/features/auth/auth.store'
import {
  createKnowledgeText,
  deleteKnowledgeDocument,
  getKnowledgeProjectRole,
  getKnowledgeDocument,
  listKnowledgeDocuments,
  retryKnowledgeDocument,
  uploadKnowledgeFile,
} from '@/features/knowledge/knowledge.api'
import {
  KNOWLEDGE_FILE_ACCEPT,
  MAX_KNOWLEDGE_TEXT_LENGTH,
  formatKnowledgeSize,
  validateKnowledgeFile,
  type KnowledgeDocument,
  type KnowledgeDocumentDetail,
  type KnowledgeDocumentStatus,
  type KnowledgeProjectRole,
} from '@/features/knowledge/knowledge.model'
import { ApiError } from '@/shared/api/http/api-error'
import { useUnsavedChangesGuard } from '@/shared/lib/use-unsaved-changes-guard'

type StatusFilter = 'ALL' | KnowledgeDocumentStatus
type UploadStatus = 'QUEUED' | 'UPLOADING' | 'DONE' | 'ERROR'

interface UploadItem {
  id: string
  file: File
  title: string
  status: UploadStatus
  progress: number
  error: string
  clientRejected: boolean
  duplicate: boolean
}

const MAX_UPLOAD_BATCH_FILES = 50
const MAX_UPLOAD_BATCH_BYTES = 250 * 1024 * 1024

const localeNames: Record<string, string> = {
  ru: 'Русский',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
}
const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: 'Все', value: 'ALL' },
  { label: 'Готовы', value: 'READY' },
  { label: 'Индексируются', value: 'INDEXING' },
  { label: 'С ошибкой', value: 'FAILED' },
]

const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()
const documents = ref<KnowledgeDocument[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const refreshing = ref(false)
const loadError = ref('')
const search = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const uploadDialogVisible = ref(false)
const uploadItems = ref<UploadItem[]>([])
const uploadLocale = ref<string | null>(null)
const uploadCategory = ref('')
const uploadError = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadController = ref<AbortController | null>(null)
const textDialogVisible = ref(false)
const textMode = ref<'CREATE' | 'VERSION'>('CREATE')
const textSource = ref<KnowledgeDocumentDetail | null>(null)
const textTitle = ref('')
const textContent = ref('')
const textLocale = ref<string | null>(null)
const textCategory = ref('')
const textError = ref('')
const savingText = ref(false)
const initialTextSnapshot = ref('')
const detailsVisible = ref(false)
const detailsLoading = ref(false)
const detailsError = ref('')
const details = ref<KnowledgeDocumentDetail | null>(null)
const detailsController = ref<AbortController | null>(null)
const textController = ref<AbortController | null>(null)
const permissionController = ref<AbortController | null>(null)
const loadMoreController = ref<AbortController | null>(null)
const projectRole = ref<KnowledgeProjectRole | null>(null)
const permissionLoading = ref(true)
const permissionError = ref('')
const retryingIds = ref(new Set<string>())
const deletingIds = ref(new Set<string>())
let listController: AbortController | null = null
let pollTimer: number | undefined
let listGeneration = 0
let projectEpoch = 0
let pollGeneration = 0
const mutationControllers = new Set<AbortController>()

const projectId = computed(() => auth.project?.id ?? '')
const canManage = computed(
  () => projectRole.value !== null && projectRole.value !== 'VIEWER',
)
const uploading = computed(() =>
  uploadItems.value.some((item) => item.status === 'UPLOADING'),
)
const queuedUploads = computed(
  () =>
    uploadItems.value.filter(
      (item) => item.status === 'QUEUED' && !item.clientRejected,
    ).length,
)
const uploadDone = computed(
  () =>
    uploadItems.value.length > 0 &&
    uploadItems.value.every(
      (item) => item.status === 'DONE' || item.clientRejected,
    ),
)
const localeOptions = computed(() =>
  (auth.project?.supportedLocales ?? [auth.project?.defaultLocale ?? 'ru'])
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .map((value) => ({
      label: localeNames[value] ?? value.toUpperCase(),
      value,
    })),
)
const stats = computed(() => ({
  total: documents.value.length,
  ready: documents.value.filter((item) => item.status === 'READY').length,
  indexing: documents.value.filter((item) => item.status === 'INDEXING').length,
  failed: documents.value.filter((item) => item.status === 'FAILED').length,
}))
const filteredDocuments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('ru')
  return documents.value.filter((item) => {
    const matchesStatus =
      statusFilter.value === 'ALL' || item.status === statusFilter.value
    const matchesQuery =
      !query ||
      [item.title, item.filename, item.category, item.locale].some((value) =>
        value?.toLocaleLowerCase('ru').includes(query),
      )
    return matchesStatus && matchesQuery
  })
})
const textContentChanged = computed(
  () =>
    !textSource.value ||
    textContent.value.trim() !== (textSource.value.contentText ?? '').trim(),
)
const textSnapshot = computed(() =>
  JSON.stringify({
    title: textTitle.value,
    text: textContent.value,
    locale: textLocale.value,
    category: textCategory.value,
  }),
)
const textDirty = computed(
  () =>
    textDialogVisible.value &&
    Boolean(initialTextSnapshot.value) &&
    textSnapshot.value !== initialTextSnapshot.value,
)
const { confirmDiscard: confirmTextDiscard } = useUnsavedChangesGuard(
  textDirty,
  'Есть несохранённые изменения документа. Закрыть форму?',
)

function errorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError))
    return cause instanceof Error ? cause.message : fallback
  if (cause.status === 0)
    return 'Нет соединения с сервером. Проверьте сеть и повторите попытку.'
  if (cause.status === 403)
    return 'Недостаточно прав для управления базой знаний.'
  if (cause.status === 413) return 'Файл превышает допустимый размер 25 МБ.'
  if (cause.status === 415)
    return 'Сервер не поддерживает формат или MIME-тип файла.'
  if (cause.status === 409)
    return (
      cause.message || 'Операция конфликтует с текущим состоянием документа.'
    )
  const request = cause.requestId ? ` Код запроса: ${cause.requestId}.` : ''
  return `${cause.message || fallback}${request}`
}

function uploadFailureMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 0) {
    return 'Связь прервана или истёк таймаут. Результат может быть неизвестен — обновите список документов.'
  }
  return errorMessage(cause, 'Не удалось загрузить файл')
}

function invalidateListRequest() {
  listGeneration += 1
  pollGeneration += 1
  listController?.abort()
  listController = null
  loadMoreController.value?.abort()
  loadMoreController.value = null
  loadingMore.value = false
  refreshing.value = false
}

function mutationController(): AbortController {
  const controller = new AbortController()
  mutationControllers.add(controller)
  return controller
}

function releaseMutationController(controller: AbortController) {
  mutationControllers.delete(controller)
}

function mergeDocument(document: KnowledgeDocument) {
  if (document.projectId !== projectId.value) return
  const index = documents.value.findIndex((item) => item.id === document.id)
  if (index >= 0) documents.value.splice(index, 1, document)
  else documents.value.unshift(document)
  if (details.value?.id === document.id)
    details.value = { ...details.value, ...document }
  schedulePoll()
}

async function loadPermission() {
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  const user = auth.user
  if (!requestedProjectId || !user) {
    permissionLoading.value = false
    projectRole.value = null
    return
  }
  permissionController.value?.abort()
  const controller = new AbortController()
  permissionController.value = controller
  permissionLoading.value = true
  permissionError.value = ''
  projectRole.value = null
  try {
    const role = await getKnowledgeProjectRole(
      requestedProjectId,
      user.id,
      user.email,
      controller.signal,
    )
    if (
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      return
    projectRole.value = role
  } catch (cause) {
    if (controller.signal.aborted || requestedEpoch !== projectEpoch) return
    permissionError.value = errorMessage(
      cause,
      'Не удалось проверить права доступа',
    )
  } finally {
    if (requestedEpoch === projectEpoch) permissionLoading.value = false
  }
}

async function loadDocuments(force = false, resetWindow = false) {
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  if (!requestedProjectId) {
    loading.value = false
    loadError.value = 'Текущий проект не найден. Войдите заново.'
    return
  }
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  const generation = ++listGeneration
  if (!force) loading.value = true
  else refreshing.value = true
  loadError.value = ''
  try {
    const page = await listKnowledgeDocuments(
      requestedProjectId,
      {
        limit: resetWindow
          ? 30
          : Math.min(Math.max(documents.value.length, 30), 100),
      },
      controller.signal,
    )
    if (
      generation !== listGeneration ||
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      return
    documents.value = page.items
    nextCursor.value = page.nextCursor
  } catch (cause) {
    if (controller.signal.aborted || generation !== listGeneration) return
    loadError.value = errorMessage(cause, 'Не удалось загрузить документы')
  } finally {
    if (generation === listGeneration) {
      loading.value = false
      refreshing.value = false
      schedulePoll()
    }
  }
}

async function loadMore() {
  if (!projectId.value || !nextCursor.value || loadingMore.value) return
  const requestedProjectId = projectId.value
  const requestedCursor = nextCursor.value
  const requestedEpoch = projectEpoch
  loadMoreController.value?.abort()
  const controller = new AbortController()
  loadMoreController.value = controller
  loadingMore.value = true
  try {
    const page = await listKnowledgeDocuments(
      requestedProjectId,
      { limit: 30, cursor: requestedCursor },
      controller.signal,
    )
    if (
      controller.signal.aborted ||
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value ||
      requestedCursor !== nextCursor.value
    )
      return
    const existing = new Set(documents.value.map((item) => item.id))
    documents.value.push(...page.items.filter((item) => !existing.has(item.id)))
    nextCursor.value = page.nextCursor
  } catch (cause) {
    if (!controller.signal.aborted && requestedEpoch === projectEpoch)
      toast.add({
        severity: 'error',
        summary: 'Не удалось загрузить ещё',
        detail: errorMessage(cause, 'Повторите попытку'),
        life: 4500,
      })
  } finally {
    if (loadMoreController.value === controller) {
      loadMoreController.value = null
      loadingMore.value = false
      schedulePoll()
    }
  }
}

function schedulePoll() {
  if (pollTimer) window.clearTimeout(pollTimer)
  if (!documents.value.some((item) => item.status === 'INDEXING')) return
  pollTimer = window.setTimeout(async () => {
    if (document.hidden) {
      schedulePoll()
      return
    }
    const requestedProjectId = projectId.value
    const requestedEpoch = projectEpoch
    const requestedPollGeneration = pollGeneration
    const indexing = documents.value
      .filter((item) => item.status === 'INDEXING')
      .slice(0, 10)
    const updates = await Promise.allSettled(
      indexing.map((item) => getKnowledgeDocument(requestedProjectId, item.id)),
    )
    if (
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value ||
      requestedPollGeneration !== pollGeneration
    )
      return
    for (const update of updates) {
      if (update.status === 'fulfilled') mergeDocument(update.value)
    }
    schedulePoll()
  }, 5_000)
}

function openUploadDialog() {
  if (!canManage.value) return
  uploadItems.value = []
  uploadLocale.value = auth.project?.defaultLocale ?? null
  uploadCategory.value = ''
  uploadError.value = ''
  uploadDialogVisible.value = true
}

function requestUploadDialog(value: boolean) {
  if (!value && uploading.value) return
  uploadDialogVisible.value = value
}

function addFiles(files: File[]) {
  if (uploading.value || !files.length) return
  const available = Math.max(
    0,
    MAX_UPLOAD_BATCH_FILES - uploadItems.value.length,
  )
  const accepted = files.slice(0, available)
  let batchBytes = uploadItems.value.reduce(
    (total, item) => total + item.file.size,
    0,
  )
  let limited = files.length > accepted.length
  for (const file of accepted) {
    if (batchBytes + file.size > MAX_UPLOAD_BATCH_BYTES) {
      limited = true
      continue
    }
    batchBytes += file.size
    const error = validateKnowledgeFile(file) ?? ''
    uploadItems.value.push({
      id: globalThis.crypto.randomUUID(),
      file,
      title: file.name.replace(/\.[^.]+$/, '').slice(0, 200),
      status: error ? 'ERROR' : 'QUEUED',
      progress: 0,
      error,
      clientRejected: Boolean(error),
      duplicate: false,
    })
  }
  uploadError.value = limited
    ? 'За один запуск можно выбрать до 50 файлов общим размером не более 250 МБ.'
    : ''
  if (fileInput.value) fileInput.value.value = ''
}

function onFileSelection(event: Event) {
  addFiles(Array.from((event.target as HTMLInputElement).files ?? []))
}

function onDrop(event: DragEvent) {
  dragging.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

function removeUpload(id: string) {
  if (uploading.value) return
  uploadItems.value = uploadItems.value.filter((item) => item.id !== id)
}

function queueUploadAgain(item: UploadItem) {
  item.status = 'QUEUED'
  item.error = ''
  item.progress = 0
}

async function startUpload() {
  if (
    !canManage.value ||
    !projectId.value ||
    !queuedUploads.value ||
    uploading.value
  )
    return
  if (uploadCategory.value.trim().length > 80) {
    uploadError.value = 'Категория не должна превышать 80 символов.'
    return
  }
  const invalidTitle = uploadItems.value.find(
    (item) =>
      item.status === 'QUEUED' &&
      (!item.title.trim() || item.title.trim().length > 200),
  )
  if (invalidTitle) {
    uploadError.value = `Укажите название для файла «${invalidTitle.file.name}».`
    return
  }
  uploadError.value = ''
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  const batch = uploadItems.value.filter(
    (item) => item.status === 'QUEUED' && !item.clientRejected,
  )
  const controller = new AbortController()
  uploadController.value = controller
  let uploaded = 0
  let duplicates = 0
  for (const item of batch) {
    if (
      controller.signal.aborted ||
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      break
    item.status = 'UPLOADING'
    item.error = ''
    try {
      const result = await uploadKnowledgeFile(
        requestedProjectId,
        {
          file: item.file,
          title: item.title.trim(),
          locale: uploadLocale.value || undefined,
          category: uploadCategory.value.trim() || undefined,
        },
        controller.signal,
        (progress) => {
          item.progress = progress
        },
      )
      if (
        requestedEpoch !== projectEpoch ||
        requestedProjectId !== projectId.value
      )
        break
      invalidateListRequest()
      item.progress = 100
      item.status = 'DONE'
      item.duplicate = result.duplicate
      uploaded += 1
      if (result.duplicate) duplicates += 1
      mergeDocument(result.document)
    } catch (cause) {
      if (controller.signal.aborted) {
        item.status = 'ERROR'
        item.error =
          'Загрузка остановлена. Результат текущего запроса может быть неизвестен — обновите список.'
        break
      }
      item.status = 'ERROR'
      item.error = uploadFailureMessage(cause)
    }
  }
  if (uploadController.value === controller) uploadController.value = null
  if (uploaded && requestedEpoch === projectEpoch) {
    toast.add({
      severity: duplicates === uploaded ? 'info' : 'success',
      summary:
        duplicates === uploaded ? 'Файлы уже были загружены' : 'Файлы приняты',
      detail: duplicates
        ? `${uploaded} обработано, совпадений: ${duplicates}.`
        : `${uploaded} отправлено на индексацию.`,
      life: 3800,
    })
  }
}

function stopUpload() {
  uploadController.value?.abort()
}

function openCreateText() {
  if (!canManage.value) return
  textMode.value = 'CREATE'
  textSource.value = null
  textTitle.value = ''
  textContent.value = ''
  textLocale.value = auth.project?.defaultLocale ?? null
  textCategory.value = ''
  textError.value = ''
  initialTextSnapshot.value = textSnapshot.value
  textDialogVisible.value = true
}

function openNewVersion(document: KnowledgeDocumentDetail) {
  if (!canManage.value || document.projectId !== projectId.value) return
  textMode.value = 'VERSION'
  textSource.value = document
  textTitle.value = document.title
  textContent.value = document.contentText ?? ''
  textLocale.value = document.locale
  textCategory.value = document.category ?? ''
  textError.value = ''
  initialTextSnapshot.value = textSnapshot.value
  detailsVisible.value = false
  textDialogVisible.value = true
}

function requestTextDialog(value: boolean) {
  if (!value && savingText.value) return
  if (!value && !confirmTextDiscard()) return
  textDialogVisible.value = value
}

async function saveText() {
  if (!canManage.value || !projectId.value || savingText.value) return
  const title = textTitle.value.trim()
  const text = textContent.value.trim()
  if (!title) textError.value = 'Укажите название документа.'
  else if (title.length > 200)
    textError.value = 'Название не должно превышать 200 символов.'
  else if (!text) textError.value = 'Добавьте текст документа.'
  else if (text.length > MAX_KNOWLEDGE_TEXT_LENGTH)
    textError.value = 'Текст превышает ограничение 500 000 символов.'
  else if (textCategory.value.trim().length > 80)
    textError.value = 'Категория не должна превышать 80 символов.'
  else if (textMode.value === 'VERSION' && !textContentChanged.value)
    textError.value =
      'Backend пока не умеет менять только название или метаданные. Измените содержимое обновлённой копии.'
  else textError.value = ''
  if (textError.value) return

  savingText.value = true
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  const controller = new AbortController()
  textController.value = controller
  try {
    const result = await createKnowledgeText(
      requestedProjectId,
      {
        title,
        text,
        locale: textLocale.value || undefined,
        category: textCategory.value.trim() || undefined,
      },
      controller.signal,
    )
    if (
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      return
    invalidateListRequest()
    mergeDocument(result.document)
    initialTextSnapshot.value = ''
    textDialogVisible.value = false
    toast.add({
      severity: result.duplicate ? 'info' : 'success',
      summary: result.duplicate
        ? 'Такой материал уже есть'
        : textMode.value === 'VERSION'
          ? 'Обновлённая копия создана'
          : 'Текст принят',
      detail: result.duplicate
        ? 'Повторная копия не добавлена.'
        : 'Индексация продолжится в фоне.',
      life: 3600,
    })
  } catch (cause) {
    if (!controller.signal.aborted && requestedEpoch === projectEpoch)
      textError.value = errorMessage(cause, 'Не удалось сохранить текст')
  } finally {
    if (textController.value === controller) textController.value = null
    if (requestedEpoch === projectEpoch) savingText.value = false
  }
}

async function openDetails(document: KnowledgeDocument) {
  if (document.projectId !== projectId.value) return
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  detailsController.value?.abort()
  const controller = new AbortController()
  detailsController.value = controller
  details.value = null
  detailsError.value = ''
  detailsLoading.value = true
  detailsVisible.value = true
  try {
    const result = await getKnowledgeDocument(
      requestedProjectId,
      document.id,
      controller.signal,
    )
    if (
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      return
    details.value = result
  } catch (cause) {
    if (!controller.signal.aborted)
      detailsError.value = errorMessage(cause, 'Не удалось открыть документ')
  } finally {
    if (!controller.signal.aborted) detailsLoading.value = false
  }
}

function closeDetails() {
  detailsController.value?.abort()
  detailsVisible.value = false
}

async function retryDocument(document: KnowledgeDocument) {
  if (
    !canManage.value ||
    document.projectId !== projectId.value ||
    retryingIds.value.has(document.id)
  )
    return
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  const controller = mutationController()
  retryingIds.value = new Set(retryingIds.value).add(document.id)
  try {
    const result = await retryKnowledgeDocument(
      requestedProjectId,
      document.id,
      controller.signal,
    )
    if (
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      return
    invalidateListRequest()
    mergeDocument(result.document)
    toast.add({
      severity: 'success',
      summary: 'Повторная индексация запущена',
      detail: document.title,
      life: 3000,
    })
  } catch (cause) {
    if (!controller.signal.aborted && requestedEpoch === projectEpoch)
      toast.add({
        severity: 'error',
        summary: 'Не удалось повторить',
        detail: errorMessage(cause, 'Повторите попытку'),
        life: 4500,
      })
  } finally {
    releaseMutationController(controller)
    const next = new Set(retryingIds.value)
    next.delete(document.id)
    retryingIds.value = next
  }
}

function askDelete(document: KnowledgeDocument) {
  if (!canManage.value || document.projectId !== projectId.value) return
  confirm.require({
    header: 'Удалить документ?',
    message: `«${document.title}» перестанет использоваться в ответах Lola. Отменить удаление будет нельзя.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Отмена',
    acceptLabel: 'Удалить',
    acceptProps: { severity: 'danger' },
    accept: () => deleteDocument(document),
  })
}

async function deleteDocument(document: KnowledgeDocument) {
  if (
    !canManage.value ||
    document.projectId !== projectId.value ||
    deletingIds.value.has(document.id)
  )
    return
  const requestedProjectId = projectId.value
  const requestedEpoch = projectEpoch
  const controller = mutationController()
  deletingIds.value = new Set(deletingIds.value).add(document.id)
  const cursorDeleted = nextCursor.value === document.id
  try {
    await deleteKnowledgeDocument(
      requestedProjectId,
      document.id,
      controller.signal,
    )
    if (
      requestedEpoch !== projectEpoch ||
      requestedProjectId !== projectId.value
    )
      return
    invalidateListRequest()
    documents.value = documents.value.filter((item) => item.id !== document.id)
    schedulePoll()
    if (details.value?.id === document.id) closeDetails()
    if (cursorDeleted) await loadDocuments(true, true)
    toast.add({
      severity: 'success',
      summary: 'Документ удалён',
      detail: document.title,
      life: 2800,
    })
  } catch (cause) {
    if (!controller.signal.aborted && requestedEpoch === projectEpoch)
      toast.add({
        severity: 'error',
        summary: 'Не удалось удалить',
        detail: errorMessage(cause, 'Повторите попытку'),
        life: 4500,
      })
  } finally {
    releaseMutationController(controller)
    const next = new Set(deletingIds.value)
    next.delete(document.id)
    deletingIds.value = next
  }
}

function statusLabel(status: KnowledgeDocumentStatus): string {
  return { INDEXING: 'Индексируется', READY: 'Готов', FAILED: 'Ошибка' }[status]
}

function statusSeverity(
  status: KnowledgeDocumentStatus,
): 'success' | 'warn' | 'danger' {
  return { INDEXING: 'warn', READY: 'success', FAILED: 'danger' }[status] as
    'success' | 'warn' | 'danger'
}

function documentIcon(document: KnowledgeDocument): string {
  if (document.sourceType === 'TEXT') return 'pi pi-align-left'
  if (document.filename.toLowerCase().endsWith('.pdf')) return 'pi pi-file-pdf'
  if (/\.docx?$/.test(document.filename.toLowerCase())) return 'pi pi-file-word'
  return 'pi pi-file'
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

watch(projectId, (next, previous) => {
  if (next === previous) return
  projectEpoch += 1
  invalidateListRequest()
  loadMoreController.value?.abort()
  loadMoreController.value = null
  loadingMore.value = false
  detailsController.value?.abort()
  textController.value?.abort()
  permissionController.value?.abort()
  uploadController.value?.abort()
  textController.value = null
  permissionController.value = null
  uploadController.value = null
  savingText.value = false
  detailsLoading.value = false
  confirm.close()
  for (const controller of mutationControllers) controller.abort()
  mutationControllers.clear()
  if (pollTimer) window.clearTimeout(pollTimer)
  documents.value = []
  nextCursor.value = null
  details.value = null
  detailsVisible.value = false
  textDialogVisible.value = false
  initialTextSnapshot.value = ''
  uploadDialogVisible.value = false
  uploadItems.value = []
  retryingIds.value = new Set()
  deletingIds.value = new Set()
  projectRole.value = null
  permissionError.value = ''
  if (next) {
    void loadDocuments()
    void loadPermission()
  } else {
    loading.value = false
    permissionLoading.value = false
    loadError.value = 'Текущий проект не найден. Войдите заново.'
  }
})

onMounted(() => {
  void loadDocuments()
  void loadPermission()
})
onBeforeUnmount(() => {
  projectEpoch += 1
  listGeneration += 1
  listController?.abort()
  loadMoreController.value?.abort()
  detailsController.value?.abort()
  textController.value?.abort()
  permissionController.value?.abort()
  uploadController.value?.abort()
  confirm.close()
  for (const controller of mutationControllers) controller.abort()
  mutationControllers.clear()
  if (pollTimer) window.clearTimeout(pollTimer)
})
</script>

<template>
  <div class="page knowledge-page">
    <header class="page-header knowledge-header">
      <div>
        <div class="eyebrow">AI knowledge</div>
        <h1>База знаний</h1>
        <p class="subtitle">
          Материалы проекта {{ auth.project?.name }}, на которые Lola опирается
          в текстовых и голосовых ответах.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Добавить текст"
          icon="pi pi-pencil"
          severity="secondary"
          :disabled="!canManage"
          @click="openCreateText"
        />
        <Button
          label="Загрузить файлы"
          icon="pi pi-upload"
          :disabled="!canManage"
          @click="openUploadDialog"
        />
      </div>
    </header>

    <Message
      v-if="permissionError"
      severity="warn"
      :closable="false"
      class="permission-message"
    >
      <div class="message-row">
        <span
          >Права управления не подтверждены, доступен только просмотр.
          {{ permissionError }}</span
        ><Button
          label="Проверить снова"
          size="small"
          text
          @click="loadPermission"
        />
      </div>
    </Message>
    <Message
      v-else-if="!permissionLoading && projectRole === 'VIEWER'"
      severity="info"
      :closable="false"
      class="permission-message"
    >
      У вас доступ только для просмотра. Загружать, повторять индексацию и
      удалять документы могут OWNER, ADMIN и EDITOR.
    </Message>
    <Message
      v-if="loadError"
      severity="error"
      :closable="false"
      class="page-message"
    >
      <div class="message-row">
        <span>{{ loadError }}</span
        ><Button
          label="Повторить"
          icon="pi pi-refresh"
          size="small"
          text
          @click="loadDocuments()"
        />
      </div>
    </Message>

    <section class="knowledge-hero card">
      <div class="hero-copy">
        <span class="hero-icon"><i class="pi pi-sparkles" /></span>
        <div>
          <h2>Состояние базы знаний</h2>
          <p>
            Следите за загрузкой и индексацией материалов. Документы со статусом
            «Готово» уже участвуют в ответах Lola.
          </p>
        </div>
      </div>
      <div class="stat-grid" aria-label="Статусы документов">
        <div>
          <span>В списке</span
          ><strong>{{
            loadError && !documents.length ? '—' : stats.total
          }}</strong>
        </div>
        <div class="ready">
          <span>Готово</span
          ><strong>{{
            loadError && !documents.length ? '—' : stats.ready
          }}</strong>
        </div>
        <div class="indexing">
          <span>В работе</span
          ><strong>{{
            loadError && !documents.length ? '—' : stats.indexing
          }}</strong>
        </div>
        <div class="failed">
          <span>Ошибки</span
          ><strong>{{
            loadError && !documents.length ? '—' : stats.failed
          }}</strong>
        </div>
      </div>
    </section>

    <section class="documents-card card" aria-labelledby="documents-title">
      <header class="documents-toolbar">
        <div>
          <h2 id="documents-title">Документы</h2>
          <p>
            Статусы обновляются каждые 5 секунд. Поиск и счётчики относятся к
            показанным документам.
          </p>
        </div>
        <div class="toolbar-actions">
          <span class="search-control"
            ><i class="pi pi-search" /><InputText
              v-model="search"
              aria-label="Поиск документов"
              placeholder="Название, файл, категория"
          /></span>
          <Select
            v-model="statusFilter"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            aria-label="Фильтр по статусу"
          />
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            text
            rounded
            aria-label="Обновить документы"
            :loading="refreshing"
            @click="loadDocuments(true, true)"
          />
        </div>
      </header>

      <div
        v-if="loading"
        class="document-skeletons"
        aria-label="Загрузка документов"
      >
        <div v-for="item in 5" :key="item" class="document-skeleton">
          <Skeleton width="2.8rem" height="2.8rem" border-radius="13px" />
          <div>
            <Skeleton width="13rem" /><Skeleton width="18rem" height=".7rem" />
          </div>
          <Skeleton width="7rem" />
        </div>
      </div>

      <div
        v-else-if="loadError && !documents.length"
        class="empty documents-empty"
      >
        <span class="empty-illustration error"
          ><i class="pi pi-cloud-off"
        /></span>
        <h3>Документы пока недоступны</h3>
        <p>
          Не удалось определить, есть ли материалы в проекте. Повторите загрузку
          списка.
        </p>
        <div class="empty-actions">
          <Button
            label="Повторить"
            icon="pi pi-refresh"
            @click="loadDocuments()"
          />
        </div>
      </div>

      <div v-else-if="filteredDocuments.length" class="document-list">
        <article
          v-for="document in filteredDocuments"
          :key="document.id"
          class="document-row"
          :class="`status-${document.status.toLowerCase()}`"
        >
          <button
            type="button"
            class="document-main"
            :aria-label="`Открыть ${document.title}`"
            @click="openDetails(document)"
          >
            <span class="document-icon"
              ><i :class="documentIcon(document)"
            /></span>
            <span class="document-copy">
              <span class="document-title">{{ document.title }}</span>
              <span class="document-meta">
                <span>{{ document.filename }}</span
                ><span>·</span
                ><span>{{ formatKnowledgeSize(document.sizeBytes) }}</span
                ><span>·</span><span>{{ formatDate(document.createdAt) }}</span>
              </span>
              <span
                v-if="document.status === 'FAILED' && document.error"
                class="document-error"
                ><i class="pi pi-exclamation-circle" />
                {{ document.error }}</span
              >
            </span>
          </button>
          <div class="document-tags">
            <span v-if="document.locale" class="meta-chip">{{
              document.locale.toUpperCase()
            }}</span>
            <span v-if="document.category" class="meta-chip category">{{
              document.category
            }}</span>
          </div>
          <Tag
            :value="statusLabel(document.status)"
            :severity="statusSeverity(document.status)"
            rounded
          />
          <div class="document-actions">
            <Button
              icon="pi pi-eye"
              severity="secondary"
              text
              rounded
              aria-label="Открыть документ"
              @click="openDetails(document)"
            />
            <Button
              v-if="canManage && document.status === 'FAILED'"
              icon="pi pi-refresh"
              severity="secondary"
              text
              rounded
              aria-label="Повторить индексацию"
              :loading="retryingIds.has(document.id)"
              @click="retryDocument(document)"
            />
            <Button
              v-if="canManage"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              aria-label="Удалить документ"
              :loading="deletingIds.has(document.id)"
              @click="askDelete(document)"
            />
          </div>
        </article>
      </div>

      <div v-else class="empty documents-empty">
        <span class="empty-illustration"
          ><i :class="documents.length ? 'pi pi-search' : 'pi pi-book'"
        /></span>
        <h3>
          {{
            documents.length ? 'Ничего не найдено' : 'Добавьте первый материал'
          }}
        </h3>
        <p>
          {{
            documents.length
              ? 'Измените запрос или фильтр статуса.'
              : 'Загрузите файлы или добавьте структурированный текст, чтобы Lola отвечала точнее.'
          }}
        </p>
        <div v-if="!documents.length && canManage" class="empty-actions">
          <Button
            label="Добавить текст"
            icon="pi pi-pencil"
            severity="secondary"
            @click="openCreateText"
          /><Button
            label="Выбрать файлы"
            icon="pi pi-upload"
            @click="openUploadDialog"
          />
        </div>
      </div>

      <footer v-if="nextCursor" class="documents-footer">
        <Button
          label="Показать ещё"
          icon="pi pi-angle-down"
          severity="secondary"
          :loading="loadingMore"
          @click="loadMore"
        />
      </footer>
    </section>

    <aside class="privacy-note">
      <i class="pi pi-shield" />
      <p>
        <strong
          >Не загружайте секреты и персональные данные без
          необходимости.</strong
        >
        Файлы хранятся в OpenAI Files до удаления документа. Для балансов,
        заказов и другой изменяемой информации нужны backend tools, а не база
        знаний.
      </p>
    </aside>

    <Dialog
      :visible="uploadDialogVisible"
      modal
      header="Загрузить файлы"
      :closable="!uploading"
      :style="{ width: 'min(760px, calc(100vw - 28px))' }"
      @update:visible="requestUploadDialog"
    >
      <div class="dialog-stack">
        <Message severity="info" size="small" :closable="false"
          >Можно выбрать несколько файлов. Они отправятся по одному: backend
          принимает один файл в каждом запросе.</Message
        >
        <button
          type="button"
          class="dropzone"
          :class="{ dragging }"
          :disabled="uploading"
          @click="fileInput?.click()"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <span class="drop-icon"><i class="pi pi-cloud-upload" /></span>
          <strong>Перетащите файлы сюда</strong>
          <span>или нажмите, чтобы выбрать · до 25 МБ каждый</span>
          <small
            >PDF, DOC, DOCX, PPTX, TXT, MD, HTML, JSON и исходный код. CSV и
            Excel пока не поддерживаются.</small
          >
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          multiple
          :accept="KNOWLEDGE_FILE_ACCEPT"
          :disabled="uploading"
          @change="onFileSelection"
        />

        <div v-if="uploadItems.length" class="upload-list" aria-live="polite">
          <div v-for="item in uploadItems" :key="item.id" class="upload-row">
            <span class="upload-file-icon"><i class="pi pi-file" /></span>
            <div class="upload-copy">
              <strong>{{ item.file.name }}</strong
              ><span>{{ formatKnowledgeSize(item.file.size) }}</span
              ><InputText
                v-if="item.status === 'QUEUED'"
                v-model="item.title"
                maxlength="200"
                size="small"
                aria-label="Название документа"
                placeholder="Название в базе знаний"
              /><ProgressBar
                v-if="item.status === 'UPLOADING'"
                :value="item.progress"
                :show-value="false"
              />
            </div>
            <span v-if="item.status === 'DONE'" class="upload-result success"
              ><i class="pi pi-check" />
              {{ item.duplicate ? 'Уже есть' : 'Принят' }}</span
            >
            <span
              v-else-if="item.status === 'ERROR'"
              class="upload-result error"
              :title="item.error"
              ><i class="pi pi-times" /> {{ item.error }}</span
            >
            <span
              v-else-if="item.status === 'UPLOADING'"
              class="upload-result"
              >{{
                item.progress >= 100
                  ? 'Передаётся провайдеру'
                  : `${item.progress}%`
              }}</span
            >
            <Button
              v-if="item.status === 'ERROR' && !item.clientRejected"
              icon="pi pi-refresh"
              text
              rounded
              severity="secondary"
              aria-label="Повторить загрузку"
              @click="queueUploadAgain(item)"
            />
            <Button
              v-if="item.status === 'QUEUED' || item.clientRejected"
              icon="pi pi-times"
              text
              rounded
              severity="secondary"
              aria-label="Убрать файл"
              :disabled="uploading"
              @click="removeUpload(item.id)"
            />
          </div>
        </div>

        <div class="metadata-grid">
          <div class="field">
            <label for="upload-locale">Язык</label
            ><Select
              id="upload-locale"
              v-model="uploadLocale"
              :options="localeOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="Не указан"
              :disabled="uploading"
            />
          </div>
          <div class="field">
            <label for="upload-category">Категория</label
            ><InputText
              id="upload-category"
              v-model="uploadCategory"
              maxlength="80"
              placeholder="Например, payments"
              :disabled="uploading"
            /><small>{{ uploadCategory.length }}/80</small>
          </div>
        </div>
        <Message
          v-if="uploadError"
          severity="error"
          size="small"
          :closable="false"
          aria-live="polite"
          >{{ uploadError }}</Message
        >
        <p class="format-note">
          Backend дополнительно проверит расширение, MIME-тип и сигнатуру
          содержимого. Переименование опасного файла не позволит обойти
          проверку.
        </p>
      </div>
      <template #footer>
        <Button
          v-if="uploading"
          label="Остановить загрузку"
          icon="pi pi-stop"
          severity="danger"
          text
          @click="stopUpload"
        />
        <Button
          v-else
          :label="uploadDone ? 'Закрыть' : 'Отмена'"
          severity="secondary"
          text
          @click="requestUploadDialog(false)"
        />
        <Button
          label="Загрузить"
          icon="pi pi-upload"
          :loading="uploading"
          :disabled="!queuedUploads"
          @click="startUpload"
        />
      </template>
    </Dialog>

    <Dialog
      :visible="textDialogVisible"
      modal
      :header="
        textMode === 'VERSION' ? 'Обновлённая копия текста' : 'Добавить текст'
      "
      :closable="!savingText"
      :style="{ width: 'min(780px, calc(100vw - 28px))' }"
      @update:visible="requestTextDialog"
    >
      <form
        id="knowledge-text-form"
        class="dialog-stack"
        @submit.prevent="saveText"
      >
        <Message
          v-if="textMode === 'VERSION'"
          severity="warn"
          size="small"
          :closable="false"
          >Backend пока не связывает версии: будет создана отдельная обновлённая
          копия. Удаляйте исходник только после того, как копия получит статус
          «Готов».</Message
        >
        <div class="field">
          <label for="text-title">Название</label
          ><InputText
            id="text-title"
            v-model="textTitle"
            maxlength="200"
            placeholder="Например, Правила возврата"
            :disabled="savingText"
          /><small>{{ textTitle.length }}/200</small>
        </div>
        <div class="field text-field">
          <label for="text-content">Текст документа</label
          ><Textarea
            id="text-content"
            v-model="textContent"
            rows="14"
            :maxlength="MAX_KNOWLEDGE_TEXT_LENGTH"
            placeholder="Используйте понятные заголовки, списки и короткие абзацы…"
            :disabled="savingText"
          /><small
            >{{ new Intl.NumberFormat('ru-RU').format(textContent.length) }} /
            {{
              new Intl.NumberFormat('ru-RU').format(MAX_KNOWLEDGE_TEXT_LENGTH)
            }}</small
          >
        </div>
        <div class="metadata-grid">
          <div class="field">
            <label for="text-locale">Язык</label
            ><Select
              id="text-locale"
              v-model="textLocale"
              :options="localeOptions"
              option-label="label"
              option-value="value"
              show-clear
              placeholder="Не указан"
              :disabled="savingText"
            />
          </div>
          <div class="field">
            <label for="text-category">Категория</label
            ><InputText
              id="text-category"
              v-model="textCategory"
              maxlength="80"
              placeholder="Например, support"
              :disabled="savingText"
            /><small>{{ textCategory.length }}/80</small>
          </div>
        </div>
        <Message
          v-if="textError"
          severity="error"
          size="small"
          :closable="false"
          aria-live="polite"
          >{{ textError }}</Message
        >
      </form>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          :disabled="savingText"
          @click="requestTextDialog(false)" /><Button
          form="knowledge-text-form"
          type="submit"
          :label="
            textMode === 'VERSION'
              ? 'Создать обновлённую копию'
              : 'Добавить текст'
          "
          icon="pi pi-check"
          :loading="savingText"
      /></template>
    </Dialog>

    <Dialog
      :visible="detailsVisible"
      modal
      header="Документ"
      :style="{ width: 'min(820px, calc(100vw - 28px))' }"
      @update:visible="(value) => (value ? undefined : closeDetails())"
    >
      <div v-if="detailsLoading" class="details-skeleton">
        <Skeleton width="55%" height="1.5rem" /><Skeleton
          width="35%"
        /><Skeleton height="16rem" />
      </div>
      <Message v-else-if="detailsError" severity="error" :closable="false">{{
        detailsError
      }}</Message>
      <div v-else-if="details" class="details-content">
        <div class="details-heading">
          <span class="document-icon large"
            ><i :class="documentIcon(details)"
          /></span>
          <div>
            <h2>{{ details.title }}</h2>
            <p>{{ details.filename }}</p>
          </div>
          <Tag
            :value="statusLabel(details.status)"
            :severity="statusSeverity(details.status)"
            rounded
          />
        </div>
        <dl class="details-meta">
          <div>
            <dt>Тип</dt>
            <dd>
              {{
                details.sourceType === 'TEXT'
                  ? 'Текст из CMS'
                  : details.mimeType
              }}
            </dd>
          </div>
          <div>
            <dt>Размер</dt>
            <dd>{{ formatKnowledgeSize(details.sizeBytes) }}</dd>
          </div>
          <div>
            <dt>Язык</dt>
            <dd>{{ details.locale?.toUpperCase() ?? 'Не указан' }}</dd>
          </div>
          <div>
            <dt>Категория</dt>
            <dd>{{ details.category ?? 'Не указана' }}</dd>
          </div>
          <div>
            <dt>Создан</dt>
            <dd>{{ formatDate(details.createdAt) }}</dd>
          </div>
          <div>
            <dt>Обновлён</dt>
            <dd>{{ formatDate(details.updatedAt) }}</dd>
          </div>
        </dl>
        <Message
          v-if="details.status === 'FAILED'"
          severity="error"
          :closable="false"
          ><strong>{{ details.errorCode ?? 'Ошибка индексации' }}</strong
          ><br />{{
            details.error ?? 'Провайдер не смог обработать документ.'
          }}</Message
        >
        <section v-if="details.sourceType === 'TEXT'" class="text-preview">
          <header>
            <strong>Содержимое</strong
            ><span
              >{{
                new Intl.NumberFormat('ru-RU').format(
                  details.contentText?.length ?? 0,
                )
              }}
              символов</span
            >
          </header>
          <pre>{{ details.contentText }}</pre>
        </section>
        <Message v-else severity="secondary" size="small" :closable="false"
          >Backend хранит и показывает только метаданные файла. Скачивание
          оригинала не предусмотрено контрактом API.</Message
        >
      </div>
      <template #footer>
        <Button
          label="Закрыть"
          severity="secondary"
          text
          @click="closeDetails"
        />
        <Button
          v-if="canManage && details?.sourceType === 'TEXT'"
          label="Создать обновлённую копию"
          icon="pi pi-copy"
          severity="secondary"
          @click="openNewVersion(details)"
        />
        <Button
          v-if="canManage && details?.status === 'FAILED'"
          label="Повторить индексацию"
          icon="pi pi-refresh"
          :loading="retryingIds.has(details.id)"
          @click="retryDocument(details)"
        />
        <Button
          v-if="canManage && details"
          label="Удалить"
          icon="pi pi-trash"
          severity="danger"
          :loading="deletingIds.has(details.id)"
          @click="askDelete(details)"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.knowledge-page {
  max-width: 1500px;
}
.knowledge-header {
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.permission-message,
.page-message {
  margin-bottom: 18px;
}
.message-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.knowledge-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(440px, 0.8fr);
  gap: 30px;
  padding: 28px;
  background: linear-gradient(135deg, #252920 0%, #2f3429 100%);
  color: white;
  overflow: hidden;
  position: relative;
}
.knowledge-hero::after {
  content: '';
  position: absolute;
  width: 260px;
  height: 260px;
  right: -120px;
  top: -150px;
  border: 48px solid rgba(215, 255, 100, 0.08);
  border-radius: 50%;
}
.hero-copy {
  display: flex;
  align-items: center;
  gap: 17px;
  position: relative;
  z-index: 1;
}
.hero-icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 17px;
  background: var(--accent);
  color: #252920;
  font-size: 1.15rem;
}
.hero-copy h2 {
  font-size: 1.18rem;
}
.hero-copy p {
  max-width: 650px;
  margin: 7px 0 0;
  color: #b5baaf;
  font-size: 0.8rem;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  position: relative;
  z-index: 1;
}
.stat-grid > div {
  padding: 15px;
  border: 1px solid #484e42;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
}
.stat-grid span,
.stat-grid strong {
  display: block;
}
.stat-grid span {
  color: #aeb4a9;
  font-size: 0.65rem;
}
.stat-grid strong {
  margin-top: 7px;
  font: 700 1.35rem Manrope;
}
.stat-grid .ready strong {
  color: #91dd94;
}
.stat-grid .indexing strong {
  color: #ffd57e;
}
.stat-grid .failed strong {
  color: #ff987c;
}
.documents-card {
  margin-top: 18px;
  overflow: hidden;
}
.documents-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px;
  border-bottom: 1px solid var(--line);
}
.documents-toolbar h2 {
  font-size: 1.1rem;
}
.documents-toolbar p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.7rem;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-control {
  position: relative;
  display: block;
}
.search-control > i {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  color: #969b91;
  font-size: 0.78rem;
}
.search-control .p-inputtext {
  width: 240px;
  padding-left: 35px;
}
.toolbar-actions > .p-select {
  width: 145px;
}
.document-list {
  display: flex;
  flex-direction: column;
}
.document-row {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto auto auto;
  align-items: center;
  gap: 18px;
  min-height: 82px;
  padding: 13px 17px 13px 20px;
  border-bottom: 1px solid #ecece7;
  border-left: 3px solid transparent;
  transition: background 0.15s ease;
}
.document-row:hover {
  background: #fafbf8;
}
.document-row.status-indexing {
  border-left-color: #edbd54;
}
.document-row.status-failed {
  border-left-color: #eb795a;
}
.document-main {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.document-icon {
  width: 45px;
  height: 45px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid #e5e7df;
  border-radius: 13px;
  background: #f5f7ef;
  color: #768e32;
  font-size: 1.05rem;
}
.document-icon.large {
  width: 52px;
  height: 52px;
  border-radius: 15px;
}
.document-copy {
  min-width: 0;
}
.document-title,
.document-meta,
.document-error {
  display: block;
}
.document-title {
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.document-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  margin-top: 6px;
  color: #8b9086;
  font-size: 0.67rem;
  white-space: nowrap;
}
.document-meta span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.document-error {
  overflow: hidden;
  margin-top: 5px;
  color: #b94d34;
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.document-tags {
  display: flex;
  gap: 6px;
  max-width: 230px;
}
.meta-chip {
  padding: 5px 7px;
  border: 1px solid #e1e3dc;
  border-radius: 7px;
  background: #f7f8f4;
  color: #6e736a;
  font-size: 0.62rem;
  font-weight: 700;
}
.meta-chip.category {
  overflow: hidden;
  max-width: 170px;
  text-overflow: ellipsis;
}
.document-actions {
  display: flex;
  align-items: center;
}
.document-skeletons {
  padding: 3px 20px;
}
.document-skeleton {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  min-height: 80px;
  border-bottom: 1px solid #ecece7;
}
.document-skeleton > div {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.documents-empty h3 {
  margin: 16px 0 5px;
  color: var(--ink);
}
.documents-empty p {
  max-width: 470px;
  margin: 0 auto;
}
.empty-illustration {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  margin: 0 auto;
  border-radius: 20px;
  background: #eff4df;
  color: #819d32;
}
.empty-illustration.error {
  background: #fff0ec;
  color: #c65e43;
}
.empty-illustration i {
  margin: 0;
  color: inherit;
}
.empty-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 19px;
}
.documents-footer {
  padding: 16px;
  text-align: center;
  border-top: 1px solid var(--line);
}
.privacy-note {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid #dedfd8;
  border-radius: 16px;
  background: #edeee9;
  color: #6f746b;
}
.privacy-note > i {
  margin-top: 4px;
  color: #687a33;
}
.privacy-note p {
  margin: 0;
  font-size: 0.72rem;
}
.dialog-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 27px;
  border: 1.5px dashed #cfd4c5;
  border-radius: 17px;
  background: #f8faf4;
  color: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}
.dropzone:hover,
.dropzone.dragging {
  border-color: #99b24f;
  background: #f2f8df;
}
.dropzone:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
.drop-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 15px;
  background: #e8f5c3;
  color: #708e19;
  font-size: 1.15rem;
}
.dropzone > span:not(.drop-icon) {
  color: var(--muted);
  font-size: 0.75rem;
}
.dropzone small {
  margin-top: 6px;
  color: #92978d;
  font-size: 0.65rem;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.upload-list {
  max-height: 300px;
  overflow: auto;
  border: 1px solid #e7e8e2;
  border-radius: 14px;
}
.upload-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(70px, 180px) auto;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 9px 11px;
  border-bottom: 1px solid #ecece7;
}
.upload-row:last-child {
  border-bottom: 0;
}
.upload-file-icon {
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #f1f3ec;
  color: #78866a;
}
.upload-copy {
  min-width: 0;
}
.upload-copy strong,
.upload-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-copy .p-inputtext {
  height: 30px;
  margin-top: 7px;
  padding: 5px 8px;
  font-size: 0.68rem;
}
.upload-copy strong {
  font-size: 0.75rem;
}
.upload-copy span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.62rem;
}
.upload-copy .p-progressbar {
  height: 4px;
  margin-top: 7px;
}
.upload-result {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 0.63rem;
  text-align: right;
}
.upload-result.success {
  color: #478650;
}
.upload-result.error {
  color: #b94d34;
}
.metadata-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
}
.field small {
  align-self: flex-end;
  color: #9a9e96;
  font-size: 0.62rem;
}
.format-note {
  margin: 0;
  color: #858a80;
  font-size: 0.66rem;
  line-height: 1.5;
}
.text-field .p-textarea {
  min-height: 260px;
  resize: vertical;
}
.details-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.details-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.details-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
}
.details-heading h2 {
  font-size: 1.2rem;
}
.details-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}
.details-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid #e5e7df;
  border-radius: 14px;
  background: #e5e7df;
}
.details-meta > div {
  padding: 13px;
  background: #f8f9f6;
}
.details-meta dt {
  color: #8a8f85;
  font-size: 0.62rem;
}
.details-meta dd {
  overflow: hidden;
  margin: 5px 0 0;
  font-size: 0.72rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-preview {
  overflow: hidden;
  border: 1px solid #e3e5de;
  border-radius: 15px;
}
.text-preview header {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e3e5de;
  background: #f7f8f4;
  font-size: 0.7rem;
}
.text-preview header span {
  color: var(--muted);
}
.text-preview pre {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 17px;
  background: #fff;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    400 0.76rem/1.65 'DM Sans',
    sans-serif;
}
.document-actions :deep(.p-button) {
  width: 2.35rem;
  height: 2.35rem;
}
@media (max-width: 1100px) {
  .knowledge-hero {
    grid-template-columns: 1fr;
  }
  .document-row {
    grid-template-columns: minmax(260px, 1fr) auto auto;
  }
  .document-tags {
    display: none;
  }
  .documents-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .toolbar-actions {
    width: 100%;
  }
  .search-control {
    flex: 1;
  }
  .search-control .p-inputtext {
    width: 100%;
  }
}
@media (max-width: 700px) {
  .knowledge-header {
    align-items: stretch;
  }
  .header-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
  .knowledge-hero {
    padding: 22px;
  }
  .hero-copy {
    align-items: flex-start;
  }
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .toolbar-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px auto;
  }
  .documents-toolbar {
    padding: 19px;
  }
  .document-row {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 14px 11px;
  }
  .document-row > .p-tag {
    grid-column: 1;
    margin-left: 58px;
    justify-self: start;
  }
  .document-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .document-actions :deep(.p-button):first-child {
    display: none;
  }
  .document-meta span:nth-last-child(-n + 2) {
    display: none;
  }
  .metadata-grid,
  .details-meta {
    grid-template-columns: 1fr;
  }
  .dropzone {
    padding: 22px 13px;
  }
  .dropzone small {
    line-height: 1.45;
  }
  .upload-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .upload-result {
    grid-column: 2;
    text-align: left;
  }
  .upload-row > .p-button {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
  .details-heading {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .details-heading > .p-tag {
    grid-column: 2;
  }
  .privacy-note {
    padding: 14px;
  }
  .empty-actions {
    flex-direction: column;
  }
}
@media (max-width: 450px) {
  .header-actions {
    grid-template-columns: 1fr;
  }
  .toolbar-actions {
    grid-template-columns: 1fr auto;
  }
  .toolbar-actions > .p-select {
    grid-column: 1;
    width: 100%;
  }
  .toolbar-actions > .p-button {
    grid-column: 2;
    grid-row: 1;
  }
  .hero-icon {
    display: none;
  }
  .documents-toolbar p {
    line-height: 1.4;
  }
  .document-icon {
    width: 42px;
    height: 42px;
  }
  .document-row > .p-tag {
    margin-left: 55px;
  }
  .document-actions {
    flex-direction: column;
  }
}
</style>
