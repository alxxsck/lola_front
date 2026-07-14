import type { AxiosProgressEvent } from 'axios'
import { request } from '@/shared/api/http/orval-mutator'
import { isMockMode } from '@/shared/config/data-mode'
import {
  parseKnowledgeDocumentDetail,
  parseKnowledgeDocumentPage,
  parseKnowledgeDelete,
  parseKnowledgeMutation,
  type KnowledgeDocument,
  type KnowledgeDocumentDetail,
  type KnowledgeDocumentMutation,
  type KnowledgeDocumentPage,
  type KnowledgeFileInput,
  type KnowledgeProjectRole,
  type KnowledgeTextInput,
} from './knowledge.model'

const DEMO_KEY = 'lola-cms-demo-knowledge-v1'
const DEMO_AUTH_KEY = 'lola-cms-demo-auth-v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function demoStorageKey(): string {
  try {
    const auth = JSON.parse(sessionStorage.getItem(DEMO_AUTH_KEY) ?? '{}') as {
      user?: { email?: unknown }
    }
    const identity =
      typeof auth.user?.email === 'string'
        ? auth.user.email.toLowerCase()
        : 'anonymous'
    return `${DEMO_KEY}:${identity}`
  } catch {
    return `${DEMO_KEY}:anonymous`
  }
}

function knowledgePath(projectId: string, suffix: string): string {
  return `/api/v1/admin/projects/${encodeURIComponent(projectId)}/knowledge/${suffix}`
}

function invalidResponse(): never {
  throw new Error('Сервер вернул некорректные данные базы знаний')
}

function toSummary(document: KnowledgeDocumentDetail): KnowledgeDocument {
  return {
    id: document.id,
    projectId: document.projectId,
    sourceType: document.sourceType,
    title: document.title,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    locale: document.locale,
    category: document.category,
    errorCode: document.errorCode,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

function demoSeed(projectId: string): KnowledgeDocumentDetail[] {
  const timestamp = new Date(Date.now() - 86_400_000).toISOString()
  return [
    {
      id: 'demo-knowledge-ready',
      projectId,
      sourceType: 'TEXT',
      title: 'Правила пополнения',
      filename: 'pravila-popolneniya.md',
      mimeType: 'text/markdown',
      sizeBytes: 1840,
      status: 'READY',
      locale: 'ru',
      category: 'payments',
      errorCode: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      contentText:
        '## Пополнение баланса\n\nПлатёж банковской картой обычно зачисляется в течение одной минуты.',
    },
    {
      id: 'demo-knowledge-file',
      projectId,
      sourceType: 'FILE',
      title: 'FAQ продукта',
      filename: 'product-faq.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 482_320,
      status: 'READY',
      locale: 'ru',
      category: 'faq',
      errorCode: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      contentText: null,
    },
  ]
}

function readDemo(projectId: string): KnowledgeDocumentDetail[] {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(demoStorageKey()) ?? '{}',
    ) as Record<string, KnowledgeDocumentDetail[]>
    const documents = parsed[projectId] ?? demoSeed(projectId)
    const now = Date.now()
    let changed = false
    for (const document of documents) {
      if (
        document.status === 'INDEXING' &&
        now - Date.parse(document.updatedAt) > 4_000
      ) {
        document.status = 'READY'
        document.updatedAt = new Date().toISOString()
        changed = true
      }
    }
    if (!parsed[projectId] || changed) writeDemo(projectId, documents, parsed)
    return documents
  } catch {
    const documents = demoSeed(projectId)
    writeDemo(projectId, documents)
    return documents
  }
}

function writeDemo(
  projectId: string,
  documents: KnowledgeDocumentDetail[],
  current?: Record<string, KnowledgeDocumentDetail[]>,
) {
  let data = current ?? {}
  if (!current) {
    try {
      data = JSON.parse(
        sessionStorage.getItem(demoStorageKey()) ?? '{}',
      ) as Record<string, KnowledgeDocumentDetail[]>
    } catch {
      data = {}
    }
  }
  sessionStorage.setItem(
    demoStorageKey(),
    JSON.stringify({ ...data, [projectId]: documents }),
  )
}

export async function getKnowledgeProjectRole(
  projectId: string,
  adminUserId: string,
  adminEmail: string,
  signal?: AbortSignal,
): Promise<KnowledgeProjectRole> {
  if (isMockMode) return 'OWNER'
  const response = await request<unknown>({
    url: `/api/v1/admin/projects/${encodeURIComponent(projectId)}/members`,
    method: 'GET',
    signal,
  })
  if (!Array.isArray(response) || response.length > 1_000)
    return invalidResponse()
  const email = adminEmail.trim().toLowerCase()
  for (const value of response) {
    if (!isRecord(value) || value.projectId !== projectId) continue
    const matchesUser =
      value.adminUserId === adminUserId ||
      (typeof value.email === 'string' && value.email.toLowerCase() === email)
    if (!matchesUser) continue
    if (
      value.role === 'OWNER' ||
      value.role === 'ADMIN' ||
      value.role === 'EDITOR' ||
      value.role === 'VIEWER'
    )
      return value.role
    return invalidResponse()
  }
  throw new Error('Не удалось определить роль пользователя в текущем проекте')
}

function newDemoDocument(
  projectId: string,
  input: KnowledgeTextInput | KnowledgeFileInput,
): KnowledgeDocumentDetail {
  const now = new Date().toISOString()
  const isFile = 'file' in input
  const title =
    input.title?.trim() ||
    (isFile ? input.file.name.replace(/\.[^.]+$/, '') : '')
  return {
    id: globalThis.crypto.randomUUID(),
    projectId,
    sourceType: isFile ? 'FILE' : 'TEXT',
    title,
    filename: isFile
      ? input.file.name
      : `${
          title
            .toLowerCase()
            .replace(/[^a-zа-яё0-9]+/giu, '-')
            .replace(/^-|-$/g, '') || 'knowledge'
        }.md`,
    mimeType: isFile
      ? input.file.type || 'application/octet-stream'
      : 'text/markdown',
    sizeBytes: isFile ? input.file.size : new Blob([input.text]).size,
    status: 'INDEXING',
    locale: input.locale?.trim() || null,
    category: input.category?.trim() || null,
    errorCode: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    contentText: isFile ? null : input.text.trim(),
  }
}

export async function listKnowledgeDocuments(
  projectId: string,
  query: { limit?: number; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<KnowledgeDocumentPage> {
  if (isMockMode) {
    const documents = readDemo(projectId)
    const offset = query.cursor
      ? documents.findIndex((item) => item.id === query.cursor) + 1
      : 0
    const limit = query.limit ?? 30
    const items = documents.slice(offset, offset + limit).map(toSummary)
    return {
      items,
      nextCursor: documents[offset + limit] ? (items.at(-1)?.id ?? null) : null,
    }
  }
  const response = await request<unknown>({
    url: knowledgePath(projectId, 'documents'),
    method: 'GET',
    params: query,
    signal,
  })
  return parseKnowledgeDocumentPage(response, projectId) ?? invalidResponse()
}

export async function getKnowledgeDocument(
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<KnowledgeDocumentDetail> {
  if (isMockMode) {
    const document = readDemo(projectId).find((item) => item.id === documentId)
    if (!document) throw new Error('Документ не найден')
    return structuredClone(document)
  }
  const response = await request<unknown>({
    url: knowledgePath(
      projectId,
      `documents/${encodeURIComponent(documentId)}`,
    ),
    method: 'GET',
    signal,
  })
  return parseKnowledgeDocumentDetail(response, projectId) ?? invalidResponse()
}

export async function createKnowledgeText(
  projectId: string,
  input: KnowledgeTextInput,
  signal?: AbortSignal,
): Promise<KnowledgeDocumentMutation> {
  if (isMockMode) {
    const documents = readDemo(projectId)
    const document = newDemoDocument(projectId, input)
    documents.unshift(document)
    writeDemo(projectId, documents)
    return { document, duplicate: false }
  }
  const response = await request<unknown>({
    url: knowledgePath(projectId, 'texts'),
    method: 'POST',
    data: input,
    signal,
  })
  return parseKnowledgeMutation(response, projectId) ?? invalidResponse()
}

export async function uploadKnowledgeFile(
  projectId: string,
  input: KnowledgeFileInput,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<KnowledgeDocumentMutation> {
  if (isMockMode) {
    onProgress?.(100)
    const documents = readDemo(projectId)
    const document = newDemoDocument(projectId, input)
    documents.unshift(document)
    writeDemo(projectId, documents)
    return { document, duplicate: false }
  }
  const data = new FormData()
  data.append('file', input.file, input.file.name)
  if (input.title?.trim()) data.append('title', input.title.trim())
  if (input.locale?.trim()) data.append('locale', input.locale.trim())
  if (input.category?.trim()) data.append('category', input.category.trim())
  const response = await request<unknown>({
    url: knowledgePath(projectId, 'files'),
    method: 'POST',
    data,
    signal,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300_000,
    onUploadProgress: (event: AxiosProgressEvent) => {
      if (event.total)
        onProgress?.(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        )
    },
  })
  return parseKnowledgeMutation(response, projectId) ?? invalidResponse()
}

export async function retryKnowledgeDocument(
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<KnowledgeDocumentMutation> {
  if (isMockMode) {
    const documents = readDemo(projectId)
    const document = documents.find((item) => item.id === documentId)
    if (!document) throw new Error('Документ не найден')
    document.status = 'INDEXING'
    document.error = null
    document.errorCode = null
    document.updatedAt = new Date().toISOString()
    writeDemo(projectId, documents)
    return { document, duplicate: false }
  }
  const response = await request<unknown>({
    url: knowledgePath(
      projectId,
      `documents/${encodeURIComponent(documentId)}/retry`,
    ),
    method: 'POST',
    signal,
  })
  return parseKnowledgeMutation(response, projectId) ?? invalidResponse()
}

export async function deleteKnowledgeDocument(
  projectId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<void> {
  if (isMockMode) {
    writeDemo(
      projectId,
      readDemo(projectId).filter((item) => item.id !== documentId),
    )
    return
  }
  const response = await request<unknown>({
    url: knowledgePath(
      projectId,
      `documents/${encodeURIComponent(documentId)}`,
    ),
    method: 'DELETE',
    signal,
  })
  if (!parseKnowledgeDelete(response, documentId)) invalidResponse()
}
