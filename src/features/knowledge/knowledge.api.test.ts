import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/http/orval-mutator'
import {
  deleteKnowledgeDocument,
  uploadKnowledgeFile,
} from './knowledge.api'

vi.mock('@/shared/api/http/orval-mutator', () => ({ request: vi.fn() }))
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }))

const document = {
  id: 'document-1',
  projectId: 'project-1',
  sourceType: 'FILE',
  title: 'FAQ',
  filename: 'faq.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 5,
  status: 'INDEXING',
  locale: 'ru',
  category: 'faq',
  errorCode: null,
  error: null,
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z',
}

describe('knowledge API', () => {
  beforeEach(() => vi.mocked(request).mockReset())

  it('uses a dedicated upload timeout and sends the per-file title', async () => {
    vi.mocked(request).mockResolvedValue({ document, duplicate: false })

    await uploadKnowledgeFile('project-1', {
      file: new File(['%PDF-'], 'faq.pdf', { type: 'application/pdf' }),
      title: 'Product FAQ',
      locale: 'ru',
    })

    const config = vi.mocked(request).mock.calls[0]?.[0]
    expect(config).toMatchObject({ method: 'POST', timeout: 300_000 })
    expect(config?.data).toBeInstanceOf(FormData)
    expect((config?.data as FormData).get('title')).toBe('Product FAQ')
  })

  it('rejects a malformed or mismatched delete response', async () => {
    vi.mocked(request).mockResolvedValue({
      deleted: true,
      id: 'another-document',
    })

    await expect(
      deleteKnowledgeDocument('project-1', 'document-1'),
    ).rejects.toThrow('некорректные данные')
  })
})
