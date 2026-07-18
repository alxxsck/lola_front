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
      voice: 'eve',
    },
    ...overrides,
  }
}

function voiceInstructionsInput(wrapper: ReturnType<typeof shallowMount>) {
  return wrapper.findAllComponents(Textarea).find((component) => component.attributes('id') === 'voice-instructions')!
}

function systemPromptInput(wrapper: ReturnType<typeof shallowMount>) {
  return wrapper.findAllComponents(Textarea).find((component) => component.attributes('id') === 'system-prompt')!
}

describe('ProjectPage voice instructions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProject.mockResolvedValue(project())
    mocks.updateProject.mockImplementation(async (_projectId: string, patch: Partial<Project>) => project(patch))
  })

  it('shows the loading skeleton while the project is requested', async () => {
    mocks.getProject.mockReturnValue(new Promise(() => {}))

    const wrapper = shallowMount(ProjectPage)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.skeleton-card')).toHaveLength(2)
    expect(wrapper.find('#project-settings-form').exists()).toBe(false)
  })

  it('shows a recoverable error and retries loading the project', async () => {
    mocks.getProject
      .mockRejectedValueOnce(new Error('Сервис временно недоступен'))
      .mockResolvedValueOnce(project())

    const wrapper = shallowMount(ProjectPage, {
      global: {
        stubs: {
          Message: { template: '<div class="message-stub"><slot /></div>' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.message-stub').exists()).toBe(true)
    expect(wrapper.find('button-stub[label="Повторить"]').exists()).toBe(true)

    await wrapper.find('button-stub[label="Повторить"]').trigger('click')
    await flushPromises()

    expect(mocks.getProject).toHaveBeenCalledTimes(2)
    expect(wrapper.find('#project-settings-form').exists()).toBe(true)
    expect(wrapper.find('.message-stub').exists()).toBe(false)
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

  it('starts voice chat collapsed and expands it from the section header', async () => {
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    const toggle = wrapper.find('[aria-controls="voice-chat-settings"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('#voice-chat-settings').attributes('style')).toContain('display: none')
    expect(toggle.element.closest('section')?.classList).toContain('collapsed')
    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#voice-chat-settings').attributes('style')).not.toContain('display: none')
  })

  it('shows the system instruction in a compact manually resizable textarea', async () => {
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    const input = systemPromptInput(wrapper)
    expect(input.attributes('rows')).toBe('3')
    expect(input.attributes('auto-resize')).toBeUndefined()
    expect(input.classes()).toContain('system-prompt-textarea')
    expect(wrapper.find('.system-prompt-resizer').attributes('aria-label')).toBe('Изменить высоту системной инструкции')
  })

  it('keeps TTS in the settings column and submits the project form from the sidebar', async () => {
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    expect(wrapper.find('.settings-main > speech-synthesis-section-stub').exists()).toBe(true)
    expect(wrapper.get('#project-settings-form').element.parentElement).toBe(wrapper.get('.settings-main').element)
    expect(wrapper.get('.settings-aside').element.parentElement).toBe(wrapper.get('.settings-layout').element)
    expect(wrapper.find('button-stub[form="project-settings-form"]').exists()).toBe(true)
  })

  it('keeps project connection and Grok voice settings editable in API mode', async () => {
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
          voice: 'eve',
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
    allowedOrigins.vm.$emit('update:modelValue', 'https://one.example.com\nhttps://two.example.com')
    voice.vm.$emit('update:modelValue', 'rex')
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
          allowedOrigins: ['https://one.example.com', 'https://two.example.com'],
          voiceEnabled: false,
          voiceTranscriptEnabled: false,
          voice: 'rex',
          speechSynthesis: { schemaVersion: 2, voiceId: 'server-owned-voice' },
        }),
      }),
    )
  })

  it('preserves the latest dedicated activity timezone when the main project form is saved', async () => {
    mocks.getProject.mockResolvedValue(project({ settings: { timezone: 'UTC' } }))
    const wrapper = shallowMount(ProjectPage)
    await flushPromises()

    wrapper.getComponent({ name: 'ActivitySettingsSection' }).vm.$emit('change', {
      timezone: 'Europe/Madrid',
      visitInactivitySeconds: 1800,
      reconnectGraceSeconds: 30,
      limits: {
        visitInactivitySeconds: { min: 60, max: 86400 },
        reconnectGraceSeconds: { min: 0, max: 300 },
      },
    })
    voiceInstructionsInput(wrapper).vm.$emit('update:modelValue', 'Обновлённая инструкция')
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({
      settings: expect.objectContaining({ timezone: 'Europe/Madrid' }),
    }))
  })
})
