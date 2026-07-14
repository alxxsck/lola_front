export type KnowledgeSourceType = 'FILE' | 'TEXT'
export type KnowledgeDocumentStatus = 'INDEXING' | 'READY' | 'FAILED'

export interface KnowledgeDocument {
  id: string
  projectId: string
  sourceType: KnowledgeSourceType
  title: string
  filename: string
  mimeType: string
  sizeBytes: number
  status: KnowledgeDocumentStatus
  locale: string | null
  category: string | null
  errorCode: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  contentText: string | null
}

export interface KnowledgeDocumentPage {
  items: KnowledgeDocument[]
  nextCursor: string | null
}

export interface KnowledgeDocumentMutation {
  document: KnowledgeDocument
  duplicate: boolean
}

export type KnowledgeProjectRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface KnowledgeTextInput {
  title: string
  text: string
  locale?: string
  category?: string
}

export interface KnowledgeFileInput {
  file: File
  title?: string
  locale?: string
  category?: string
}

export const MAX_KNOWLEDGE_FILE_BYTES = 25 * 1024 * 1024
export const MAX_KNOWLEDGE_TEXT_LENGTH = 500_000
export const KNOWLEDGE_FILE_EXTENSIONS = [
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.doc',
  '.docx',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.md',
  '.pdf',
  '.php',
  '.pptx',
  '.py',
  '.rb',
  '.sh',
  '.tex',
  '.ts',
  '.txt',
] as const
export const KNOWLEDGE_FILE_ACCEPT = KNOWLEDGE_FILE_EXTENSIONS.join(',')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maximum
  )
}

function nullableString(
  value: unknown,
  maximum: number,
): value is string | null {
  return (
    value === null || (typeof value === 'string' && value.length <= maximum)
  )
}

function parseDocument(
  value: unknown,
  projectId: string,
): KnowledgeDocument | undefined {
  if (!isRecord(value) || value.projectId !== projectId) return undefined
  if (!boundedString(value.id, 200) || !boundedString(value.title, 200))
    return undefined
  if (
    !boundedString(value.filename, 255) ||
    !boundedString(value.mimeType, 200)
  )
    return undefined
  if (value.sourceType !== 'FILE' && value.sourceType !== 'TEXT')
    return undefined
  if (
    value.status !== 'INDEXING' &&
    value.status !== 'READY' &&
    value.status !== 'FAILED'
  )
    return undefined
  if (!Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 0)
    return undefined
  if (!nullableString(value.locale, 20) || !nullableString(value.category, 80))
    return undefined
  if (
    !nullableString(value.errorCode, 200) ||
    !nullableString(value.error, 4_000)
  )
    return undefined
  if (
    !boundedString(value.createdAt, 64) ||
    !boundedString(value.updatedAt, 64)
  )
    return undefined

  return value as unknown as KnowledgeDocument
}

export function parseKnowledgeDocumentPage(
  value: unknown,
  projectId: string,
): KnowledgeDocumentPage | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    return undefined
  if (value.nextCursor !== null && !boundedString(value.nextCursor, 200))
    return undefined
  const items: KnowledgeDocument[] = []
  for (const item of value.items) {
    const parsed = parseDocument(item, projectId)
    if (!parsed) return undefined
    items.push(parsed)
  }
  return { items, nextCursor: value.nextCursor as string | null }
}

export function parseKnowledgeDelete(
  value: unknown,
  documentId: string,
): boolean {
  return isRecord(value) && value.deleted === true && value.id === documentId
}

export function parseKnowledgeDocumentDetail(
  value: unknown,
  projectId: string,
): KnowledgeDocumentDetail | undefined {
  const document = parseDocument(value, projectId)
  if (!document || !isRecord(value)) return undefined
  if (value.contentText !== null && typeof value.contentText !== 'string')
    return undefined
  if (
    typeof value.contentText === 'string' &&
    value.contentText.length > MAX_KNOWLEDGE_TEXT_LENGTH
  )
    return undefined
  return { ...document, contentText: value.contentText as string | null }
}

export function parseKnowledgeMutation(
  value: unknown,
  projectId: string,
): KnowledgeDocumentMutation | undefined {
  if (!isRecord(value) || typeof value.duplicate !== 'boolean') return undefined
  const document = parseDocument(value.document, projectId)
  return document ? { document, duplicate: value.duplicate } : undefined
}

export function validateKnowledgeFile(file: File): string | null {
  if (!file.size) return 'Файл пустой.'
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES)
    return 'Файл превышает ограничение 25 МБ.'
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (!(KNOWLEDGE_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Формат не поддерживается базой знаний.'
  }
  return null
}

export function formatKnowledgeSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} Б`
  if (bytes < 1_024 * 1_024)
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(bytes / 1_024)} КБ`
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(bytes / (1_024 * 1_024))} МБ`
}
