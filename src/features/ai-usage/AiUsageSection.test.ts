import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiUsageSection from './AiUsageSection.vue'

const mocks = vi.hoisted(() => ({ fetchReport: vi.fn() }))

vi.mock('./ai-usage.api', () => ({ fetchAiUsageReport: mocks.fetchReport }))
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }))

describe('AiUsageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchReport.mockResolvedValue({
      projectId: 'project-1',
      totals: {
        records: 1,
        unpricedRecords: 1,
        inputCharacters: 1_200,
        providerBilledUnits: 1_250,
        totalTokens: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        inputTextTokens: 0,
        cachedInputTextTokens: 0,
        outputTextTokens: 0,
        inputAudioTokens: 0,
        cachedInputAudioTokens: 0,
        outputAudioTokens: 0,
        inputImageTokens: 0,
        cachedInputImageTokens: 0,
        outputImageTokens: 0,
        durationSeconds: 0,
        estimatedCost: 0,
        billedCost: 0,
      },
      breakdown: [{
        provider: 'elevenlabs',
        model: 'eleven_v3',
        operation: 'speech',
        currency: 'usd',
        records: 1,
        inputCharacters: 1_200,
        providerBilledUnits: 1_250,
        totalTokens: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        inputTextTokens: 0,
        outputTextTokens: 0,
        inputAudioTokens: 0,
        outputAudioTokens: 0,
        durationSeconds: 0,
        estimatedCost: 0,
        billedCost: 0,
      }],
    })
  })

  it('shows provider-reported ElevenLabs usage without presenting it as a zero-cost request', async () => {
    const wrapper = shallowMount(AiUsageSection, { props: { projectId: 'project-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('Usage ElevenLabs')
    expect(wrapper.text()).toContain('Нет оценки')
    expect(wrapper.text()).toContain('Расчётная стоимость может отличаться от фактического списания')
    expect(wrapper.text()).toContain('character-cost')
  })
})
