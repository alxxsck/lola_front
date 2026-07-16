import { flushPromises, shallowMount } from '@vue/test-utils'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
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
    expect(mocks.updateProject.mock.calls[0]?.[1]).toHaveProperty('settings')
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

  it('collapses voice chat settings to the section header', async () => {
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    const toggle = wrapper.find('[aria-controls="voice-chat-settings"]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('#voice-chat-settings').attributes('style')).toContain('display: none')
    expect(toggle.element.closest('section')?.classList).toContain('collapsed')
  })

  it('keeps project connection and OpenAI Realtime settings editable in API mode', async () => {
    mocks.getProject.mockResolvedValue(
      project({
        settings: {
          description: 'Before',
          timezone: 'Europe/Madrid',
          apiBaseUrl: 'https://old.example.com',
          wsUrl: 'wss://old.example.com',
          allowedOrigins: ['https://old.example.com'],
          voiceEnabled: true,
          voiceTranscriptEnabled: true,
          voice: 'marin',
          speechSynthesis: { schemaVersion: 2, voiceId: 'server-owned-voice' },
        },
      }),
    )
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    const description = wrapper
      .findAllComponents(Textarea)
      .find((component) => component.attributes('id') === 'project-description')!
    const apiUrl = wrapper
      .findAllComponents(InputText)
      .find((component) => component.attributes('id') === 'api-url')!
    const wsUrl = wrapper
      .findAllComponents(InputText)
      .find((component) => component.attributes('id') === 'ws-url')!
    const timezone = wrapper
      .findAllComponents(InputText)
      .find((component) => component.attributes('id') === 'timezone')!
    const allowedOrigins = wrapper
      .findAllComponents(Textarea)
      .find((component) => component.attributes('id') === 'allowed-origins')!
    const voiceEnabled = wrapper
      .findAllComponents(ToggleSwitch)
      .find((component) => component.attributes('input-id') === 'voice-enabled')!
    const voice = wrapper
      .findAllComponents(Select)
      .find((component) => component.attributes('id') === 'voice')!
    const voiceTranscriptEnabled = wrapper
      .findAllComponents(ToggleSwitch)
      .find((component) => component.attributes('input-id') === 'voice-transcripts')!

    for (const component of [
      description,
      apiUrl,
      wsUrl,
      timezone,
      allowedOrigins,
      voiceEnabled,
      voice,
      voiceTranscriptEnabled,
    ]) {
      expect(component.attributes('disabled')).toBe('false')
    }
    expect(wrapper.text()).not.toContain('Project PATCH больше не принимает общий settings')

    description.vm.$emit('update:modelValue', 'After')
    apiUrl.vm.$emit('update:modelValue', 'https://api.example.com')
    wsUrl.vm.$emit('update:modelValue', 'wss://api.example.com')
    timezone.vm.$emit('update:modelValue', 'UTC')
    allowedOrigins.vm.$emit('update:modelValue', 'https://one.example.com\nhttps://two.example.com')
    voice.vm.$emit('update:modelValue', 'cedar')
    voiceTranscriptEnabled.vm.$emit('update:modelValue', false)
    voiceEnabled.vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        settings: expect.objectContaining({
          description: 'After',
          apiBaseUrl: 'https://api.example.com',
          wsUrl: 'wss://api.example.com',
          timezone: 'UTC',
          allowedOrigins: ['https://one.example.com', 'https://two.example.com'],
          voiceEnabled: false,
          voiceTranscriptEnabled: false,
          voice: 'cedar',
          speechSynthesis: { schemaVersion: 2, voiceId: 'server-owned-voice' },
        }),
      }),
    )
  })
})
