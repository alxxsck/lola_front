import { describe, expect, it } from 'vitest'
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  formatKnowledgeSize,
  parseKnowledgeDelete,
  parseKnowledgeDocumentPage,
  validateKnowledgeFile,
} from './knowledge.model'

const document = {
  id: 'document-1',
  projectId: 'project-1',
  sourceType: 'FILE',
  title: 'FAQ',
  filename: 'faq.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  status: 'READY',
  locale: 'ru',
  category: 'faq',
  errorCode: null,
  error: null,
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z',
}

describe('knowledge model', () => {
  it('accepts a project-scoped document page', () => {
    expect(
      parseKnowledgeDocumentPage(
        { items: [document], nextCursor: null },
        'project-1',
      ),
    ).toEqual({ items: [document], nextCursor: null })
  })

  it('rejects documents from another project', () => {
    expect(
      parseKnowledgeDocumentPage(
        { items: [{ ...document, projectId: 'project-2' }], nextCursor: null },
        'project-1',
      ),
    ).toBeUndefined()
  })

  it('validates file extension and size before upload', () => {
    expect(
      validateKnowledgeFile(
        new File(['hello'], 'guide.md', { type: 'text/markdown' }),
      ),
    ).toBeNull()
    expect(
      validateKnowledgeFile(
        new File(['a,b'], 'users.csv', { type: 'text/csv' }),
      ),
    ).toContain('не поддерживается')
    const oversized = new File(['x'], 'large.pdf', { type: 'application/pdf' })
    Object.defineProperty(oversized, 'size', {
      value: MAX_KNOWLEDGE_FILE_BYTES + 1,
    })
    expect(validateKnowledgeFile(oversized)).toContain('25 МБ')
  })

  it('formats file sizes for the interface', () => {
    expect(formatKnowledgeSize(900)).toBe('900 Б')
    expect(formatKnowledgeSize(2048)).toBe('2 КБ')
  })

  it('accepts only a matching successful delete response', () => {
    expect(
      parseKnowledgeDelete({ deleted: true, id: 'document-1' }, 'document-1'),
    ).toBe(true)
    expect(
      parseKnowledgeDelete({ deleted: true, id: 'document-2' }, 'document-1'),
    ).toBe(false)
    expect(
      parseKnowledgeDelete({ deleted: false, id: 'document-1' }, 'document-1'),
    ).toBe(false)
  })
})
