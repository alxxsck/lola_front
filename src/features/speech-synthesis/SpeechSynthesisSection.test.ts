import { flushPromises, shallowMount } from '@vue/test-utils'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechSettingsResponseDto } from '@/shared/api/generated/models'
import SpeechSynthesisSection from './SpeechSynthesisSection.vue'

const mocks = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  fetchVoices: vi.fn(),
  updateSettings: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock('./speech-synthesis.api', () => ({
  fetchSpeechSettings: mocks.fetchSettings,
  fetchSpeechVoices: mocks.fetchVoices,
  updateSpeechSettings: mocks.updateSettings,
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: mocks.addToast }),
}))

vi.mock('@/shared/lib/use-unsaved-changes-guard', () => ({
  useUnsavedChangesGuard: vi.fn(),
}))

function settings(): SpeechSettingsResponseDto {
  return {
    settings: {
      schemaVersion: 2,
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      languageOverride: 'ru',
      stability: 0.5,
    },
    integration: {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      configured: true,
      model: 'eleven_v3',
      defaults: { voiceId: '21m00Tcm4TlvDq8ikWAM' },
      capabilities: {
        streaming: true,
        voices: true,
        languageOverride: true,
        outputFormat: 'pcm_24000',
        unsupportedForModel: ['useSpeakerBoost'],
        settings: {
          stability: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
        },
      },
    },
  }
}

describe('SpeechSynthesisSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchSettings.mockResolvedValue(settings())
    mocks.fetchVoices.mockResolvedValue({
      items: [{
        id: '21m00Tcm4TlvDq8ikWAM',
        name: 'Rachel',
        provider: 'elevenlabs',
        category: 'premade',
        description: 'Warm voice',
        previewUrl: 'https://example.com/rachel.mp3',
        labels: {},
        languages: ['en', 'ru'],
      }],
      hasMore: false,
      nextCursor: null,
    })
    mocks.updateSettings.mockResolvedValue(settings())
  })

  it('loads dedicated settings and the current provider voice catalog', async () => {
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru', 'en'] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Озвучивание текста')
    expect(wrapper.text()).toContain('Голос для озвучивания текста')
    expect(wrapper.text()).not.toContain('Поиск по каталогу')
    expect(wrapper.text()).not.toContain('Загрузить ещё голоса')
    expect(mocks.fetchSettings).toHaveBeenCalledWith('project-1', expect.any(AbortSignal))
    expect(mocks.fetchVoices).toHaveBeenCalledWith(
      'project-1',
      { limit: 20 },
      expect.any(AbortSignal),
    )
  })

  it('saves only the eleven_v3 settings supported by the CMS contract', async () => {
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()

    const voice = wrapper.findAllComponents(Select)
      .find((component) => component.attributes('id') === 'tts-voice')!
    voice.vm.$emit('update:modelValue', 'EXAVITQu4vr4xnSDxMaL')
    const language = wrapper.findAllComponents(Select)
      .find((component) => component.attributes('id') === 'tts-language')!
    language.vm.$emit('update:modelValue', 'en')
    wrapper.findAllComponents(InputNumber)
      .find((component) => component.attributes('id') === 'tts-stability')!
      .vm.$emit('update:modelValue', 0.35)
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateSettings).toHaveBeenCalledWith('project-1', {
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      languageOverride: 'en',
      stability: 0.35,
    })
  })

  it('starts collapsed to the header and exposes the expanded state', async () => {
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()

    const toggle = wrapper.find('[aria-controls="tts-content"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('#tts-content').attributes('style')).toContain('display: none')
    expect(wrapper.classes()).toContain('collapsed')
    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#tts-content').attributes('style')).not.toContain('display: none')
  })

  it('clears the previous project state when the next project fails to load', async () => {
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)

    mocks.fetchSettings.mockRejectedValueOnce(new Error('Project unavailable'))
    await wrapper.setProps({ projectId: 'project-2' })
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('message-stub[severity="error"]').exists()).toBe(true)
  })

  it('does not apply a late save response to another project', async () => {
    let resolveUpdate!: (value: SpeechSettingsResponseDto) => void
    mocks.updateSettings.mockImplementationOnce(() => new Promise((resolve) => { resolveUpdate = resolve }))
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()

    const stability = wrapper.findAllComponents(InputNumber)
      .find((component) => component.attributes('id') === 'tts-stability')!
    stability.vm.$emit('update:modelValue', 0.7)
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await wrapper.setProps({ projectId: 'project-2' })
    await flushPromises()

    const staleResponse = settings()
    staleResponse.settings.stability = 0.8
    resolveUpdate(staleResponse)
    await flushPromises()

    const currentStability = wrapper.findAllComponents(InputNumber)
      .find((component) => component.attributes('id') === 'tts-stability')!
    expect(currentStability.attributes('modelvalue')).toBe('0.5')
    expect(mocks.addToast).not.toHaveBeenCalled()
  })

  it('requires an explicit voice when backend has no server default', async () => {
    const withoutDefault = settings()
    withoutDefault.settings.voiceId = undefined
    withoutDefault.integration.defaults = { voiceId: null }
    mocks.fetchSettings.mockResolvedValueOnce(withoutDefault)
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()

    const voice = wrapper.findAllComponents(Select)
      .find((component) => component.attributes('id') === 'tts-voice')!
    expect(voice.attributes('modelvalue')).toBe('')
    expect(wrapper.text()).not.toContain('Текущий голос')
    expect(wrapper.text()).toContain('выберите голос проекта')
  })

  it('identifies the server-default voice by its catalog metadata', async () => {
    const withServerDefault = settings()
    withServerDefault.settings.voiceId = undefined
    mocks.fetchSettings.mockResolvedValueOnce(withServerDefault)
    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Server default: Rachel')
  })

  it('clears an aborted voice spinner when the next project has no voice catalog', async () => {
    mocks.fetchVoices.mockImplementationOnce((_projectId, _request, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const unconfigured = settings()
    unconfigured.integration.configured = false
    mocks.fetchSettings
      .mockResolvedValueOnce(settings())
      .mockResolvedValueOnce(unconfigured)

    const wrapper = shallowMount(SpeechSynthesisSection, {
      props: { projectId: 'project-1', supportedLocales: ['ru'] },
    })
    await flushPromises()
    await wrapper.setProps({ projectId: 'project-2' })
    await flushPromises()

    const voice = wrapper.findAllComponents(Select)
      .find((component) => component.attributes('id') === 'tts-voice')!
    expect(voice.props('loading')).not.toBe(true)
  })
})
