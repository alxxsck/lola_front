import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiUsageSection from './AiUsageSection.vue'
import AiModelUsageChart from './components/AiModelUsageChart.vue'
import AiModalityChart from './components/AiModalityChart.vue'

const mocks = vi.hoisted(() => ({ fetchReport: vi.fn() }))

vi.mock('./ai-usage.api', () => ({ fetchAiUsageReport: mocks.fetchReport }))
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }))

describe('AiUsageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchReport.mockResolvedValue({
      projectId: 'project-1',
      totals: {
        records: 2,
        unpricedRecords: 0,
        providerReportedUsageRecords: 2,
        estimatedCostRecords: 0,
        inputCharacters: 1_200,
        providerBilledUnits: 1_250,
        totalTokens: 120,
        inputTokens: 80,
        cachedInputTokens: 20,
        cacheWriteInputTokens: 0,
        outputTokens: 40,
        reasoningTokens: 0,
        inputTextTokens: 80,
        cachedInputTextTokens: 20,
        outputTextTokens: 40,
        inputAudioTokens: 0,
        cachedInputAudioTokens: 0,
        outputAudioTokens: 0,
        inputImageTokens: 0,
        cachedInputImageTokens: 0,
        outputImageTokens: 0,
        durationSeconds: 0,
        estimatedCost: 0,
        billedCost: 0.0012,
      },
      breakdown: [
        {
          provider: 'xai',
          model: 'grok-4.5',
          operation: 'responses',
          currency: 'usd',
          records: 1,
          inputCharacters: 0,
          providerBilledUnits: 0,
          totalTokens: 120,
          inputTokens: 80,
          cachedInputTokens: 20,
          cacheWriteInputTokens: 0,
          outputTokens: 40,
          reasoningTokens: 0,
          inputTextTokens: 80,
          cachedInputTextTokens: 20,
          outputTextTokens: 40,
          inputAudioTokens: 0,
          cachedInputAudioTokens: 0,
          outputAudioTokens: 0,
          inputImageTokens: 0,
          cachedInputImageTokens: 0,
          outputImageTokens: 0,
          durationSeconds: 0,
          estimatedCost: 0,
          billedCost: 0.0012,
        },
        {
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
      ],
    })
  })

  it('shows xAI billed cost separately from ElevenLabs credits', async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: 'project-1' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('xAI · Grok')
    expect(wrapper.text()).toContain('ElevenLabs')
    expect(wrapper.text()).toContain('Использовано credits')
    expect(wrapper.text()).toContain('1,3 тыс.')
    expect(wrapper.text()).toContain('0,0012 $')
    expect(wrapper.text()).toContain('Стоимость Grok')
    expect(wrapper.text()).toContain('По данным xAI')
    expect(wrapper.text()).not.toContain('Расчётная стоимость')
    expect(wrapper.text()).not.toContain('операция ElevenLabs учтена')
    expect(wrapper.text()).not.toContain('character-cost')
    expect(wrapper.text()).not.toContain('Расчётная стоимость может отличаться')
    expect(wrapper.findAll('.metric-switch button')[1]!.attributes('disabled')).toBeUndefined()
  })

  it('uses one token and cost switch for both Grok charts', async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: 'project-1' },
    })
    await flushPromises()

    expect(wrapper.getComponent(AiModelUsageChart).props('metric')).toBe('tokens')
    expect(wrapper.getComponent(AiModalityChart).props('metric')).toBe('tokens')

    await wrapper.findAll('.metric-switch button')[1]!.trigger('click')

    expect(wrapper.getComponent(AiModelUsageChart).props('metric')).toBe('cost')
    expect(wrapper.getComponent(AiModalityChart).props('metric')).toBe('cost')
  })

  it('includes estimated Voice cost and explains the applied xAI rate', async () => {
    const baseReport = await mocks.fetchReport()
    const textUsage = baseReport.breakdown[0]
    mocks.fetchReport.mockResolvedValue({
      ...baseReport,
      totals: {
        ...baseReport.totals,
        records: 3,
        estimatedCostRecords: 1,
        durationSeconds: 60,
        estimatedCost: 0.05,
      },
      breakdown: [
        ...baseReport.breakdown,
        {
          ...textUsage,
          model: 'grok-voice-latest',
          operation: 'realtime_response',
          records: 1,
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          inputTextTokens: 0,
          cachedInputTextTokens: 0,
          outputTextTokens: 0,
          durationSeconds: 60,
          estimatedCost: 0.05,
          billedCost: 0,
        },
      ],
    })

    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: 'project-1' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('0,0512 $')
    expect(wrapper.text()).toContain('0,0012 $ фактически')
    expect(wrapper.text()).toContain('0,0500 $ расчётно')
    expect(wrapper.text()).toContain('0,05 $ за минуту отправленного и полученного аудио')
    expect(wrapper.text()).toContain('Если ставка изменилась, сообщите в поддержку')
    expect(wrapper.get('.voice-pricing-note a').attributes()).toMatchObject({
      href: 'https://docs.x.ai/developers/pricing#voice-api',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })
})
