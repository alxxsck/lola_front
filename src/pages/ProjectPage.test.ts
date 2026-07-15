import { flushPromises, shallowMount } from '@vue/test-utils'
import Textarea from 'primevue/textarea'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@/shared/types/domain'
import ProjectPage from './ProjectPage.vue'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
  updateAuthProject: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    mode: 'api',
    getProject: mocks.getProject,
    updateProject: mocks.updateProject,
  },
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: { id: 'project-1', name: 'Lola' },
    updateProject: mocks.updateAuthProject,
  }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: mocks.addToast }),
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-router')>(),
  onBeforeRouteLeave: vi.fn(),
}))

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Lola',
    slug: 'lola',
    status: 'ACTIVE',
    publicKey: 'public',
    defaultLocale: 'ru',
    supportedLocales: ['ru'],
    assistantName: 'Lola',
    systemPrompt: 'Помогай пользователю.',
    voiceInstructions: 'Говори спокойно.',
    settings: {
      description: '',
      voiceEnabled: true,
      voiceTranscriptEnabled: true,
      voice: 'marin',
    },
    ...overrides,
  }
}

function voiceInstructionsInput(wrapper: ReturnType<typeof shallowMount>) {
  return wrapper.findAllComponents(Textarea).find((component) => component.attributes('id') === 'voice-instructions')!
}

describe('ProjectPage voice instructions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProject.mockResolvedValue(project())
    mocks.updateProject.mockImplementation(async (_projectId: string, patch: Partial<Project>) => project(patch))
  })

  it('loads and saves the voice instruction without changing its whitespace', async () => {
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    const input = voiceInstructionsInput(wrapper)
    expect(input.attributes('modelvalue')).toBe('Говори спокойно.')
    expect(input.attributes('maxlength')).toBe('20000')

    const voiceInstructions = '  Говори мягко.\nДелай паузы.  '
    input.vm.$emit('update:modelValue', voiceInstructions)
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({ voiceInstructions }))
    expect(mocks.updateProject.mock.calls[0]?.[1]).not.toHaveProperty('settings')
  })

  it('does not save a voice instruction longer than the API limit', async () => {
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    voiceInstructionsInput(wrapper).vm.$emit('update:modelValue', 'a'.repeat(20_001))
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')

    expect(mocks.updateProject).not.toHaveBeenCalled()
    expect(wrapper.find('message-stub[severity="warn"]').exists()).toBe(true)
  })
})
