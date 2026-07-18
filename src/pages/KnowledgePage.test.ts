import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KnowledgePage from './KnowledgePage.vue'

const mocks = vi.hoisted(() => ({
  listKnowledgeDocuments: vi.fn(),
  getKnowledgeProjectRole: vi.fn(),
  confirmClose: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: { id: 'project-1', name: 'Lola', supportedLocales: ['ru'], defaultLocale: 'ru' },
    user: { id: 'user-1', email: 'owner@lola.ai' },
  }),
}))

vi.mock('@/features/knowledge/knowledge.api', () => ({
  createKnowledgeText: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  getKnowledgeDocument: vi.fn(),
  getKnowledgeProjectRole: mocks.getKnowledgeProjectRole,
  listKnowledgeDocuments: mocks.listKnowledgeDocuments,
  retryKnowledgeDocument: vi.fn(),
  uploadKnowledgeFile: vi.fn(),
}))

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: vi.fn(), close: mocks.confirmClose }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

vi.mock('@/shared/lib/use-unsaved-changes-guard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: vi.fn(() => true) }),
}))

function mountKnowledge() {
  return shallowMount(KnowledgePage, {
    global: {
      stubs: {
        Message: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('KnowledgePage states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listKnowledgeDocuments.mockReset().mockResolvedValue({ items: [], nextCursor: null })
    mocks.getKnowledgeProjectRole.mockReset().mockResolvedValue('OWNER')
  })

  it('shows loading and then the empty state', async () => {
    const wrapper = mountKnowledge()

    expect(wrapper.findAll('.document-skeleton')).toHaveLength(5)

    await flushPromises()

    expect(wrapper.get('.documents-empty').text()).toContain('Добавьте первый материал')
  })

  it('shows a list error and retries', async () => {
    mocks.listKnowledgeDocuments
      .mockRejectedValueOnce(new Error('Сбой базы знаний'))
      .mockResolvedValue({ items: [], nextCursor: null })
    const wrapper = mountKnowledge()
    await flushPromises()

    expect(wrapper.text()).toContain('Сбой базы знаний')

    await wrapper.get('button-stub[label="Повторить"]').trigger('click')
    await flushPromises()

    expect(mocks.listKnowledgeDocuments).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Сбой базы знаний')
  })

  it('disables mutations for a viewer', async () => {
    mocks.getKnowledgeProjectRole.mockResolvedValue('VIEWER')
    const wrapper = mountKnowledge()
    await flushPromises()

    expect(wrapper.get('button-stub[label="Добавить текст"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('button-stub[label="Загрузить файлы"]').attributes()).toHaveProperty('disabled')
  })

  it('opens the text dialog for an owner', async () => {
    const wrapper = mountKnowledge()
    await flushPromises()

    await wrapper.get('button-stub[label="Добавить текст"]').trigger('click')

    expect(wrapper.get('dialog-stub[header="Добавить текст"]').attributes('visible')).toBe('true')
  })
})
