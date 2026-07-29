import { config, flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiUsageSection from './AiUsageSection.vue'
import AiModelUsageChart from './components/AiModelUsageChart.vue'
import AiModalityChart from './components/AiModalityChart.vue'

config.global.stubs.ProjectSettingsSectionHeader = false

const mocks = vi.hoisted(() => ({
  fetchReport: vi.fn(),
  fetchEventQueryUsage: vi.fn(),
}))

vi.mock('./ai-usage.api', () => ({ fetchAiUsageReport: mocks.fetchReport }))
vi.mock('@/features/event-query/api/event-query-repository', () => ({
  eventQueryRepository: { usage: mocks.fetchEventQueryUsage },
}))
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }))

describe('AiUsageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchEventQueryUsage.mockResolvedValue({
      from: '2026-07-29T00:00:00.000Z',
      to: '2026-07-29T12:00:00.000Z',
      scope: { endUserId: null, audience: null },
      calls: 6,
      resultBytes: 3_300,
      estimatedAddedInputTokens: 1_119,
      exactAiUsage: {
        records: 6,
        inputTokens: 60_000,
        outputTokens: 14_546,
        totalTokens: 74_546,
        billedCostUsd: '0.0295008',
        estimatedCostUsd: null,
      },
      byOrigin: {},
      byAudience: {},
    })
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
      categories: [],
    })
  })

  it('shows the loading state while the first report is pending', async () => {
    mocks.fetchReport.mockReturnValue(new Promise(() => {}))

    const wrapper = shallowMount(AiUsageSection, { props: { projectId: 'project-1' } })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Загрузка статистики"]').exists()).toBe(true)
    expect(wrapper.find('.provider-stack').exists()).toBe(false)
  })

  it('starts collapsed and expands the report without reloading it', async () => {
    const wrapper = shallowMount(AiUsageSection, { props: { projectId: 'project-1' } })
    await flushPromises()

    const toggle = wrapper.get('[aria-controls="ai-usage-content"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('#ai-usage-content').attributes('style')).toContain('display: none')
    expect(mocks.fetchReport).toHaveBeenCalledTimes(1)

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#ai-usage-content').attributes('style')).not.toContain('display: none')
    expect(mocks.fetchReport).toHaveBeenCalledTimes(1)
  })

  it('shows a load error and retries the request', async () => {
    const report = await mocks.fetchReport()
    mocks.fetchReport
      .mockRejectedValueOnce(new Error('AI usage недоступен'))
      .mockResolvedValueOnce(report)
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: 'project-1' },
      global: { stubs: { Message: { template: '<div class="message-stub"><slot /></div>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('AI usage недоступен')
    await wrapper.find('button-stub[label="Повторить"]').trigger('click')
    await flushPromises()

    expect(mocks.fetchReport).toHaveBeenCalledTimes(3)
    expect(wrapper.find('.provider-stack').exists()).toBe(true)
  })

  it('keeps the cost mode disabled when the report has no priced xAI operations', async () => {
    const report = await mocks.fetchReport()
    report.breakdown[0].billedCost = 0
    report.breakdown[0].estimatedCost = 0
    mocks.fetchReport.mockResolvedValueOnce(report)

    const wrapper = shallowMount(AiUsageSection, { props: { projectId: 'project-1' } })
    await flushPromises()

    const costButton = wrapper.findAll('.metric-switch button')[1]!
    expect(costButton.attributes('disabled')).toBeDefined()
    await costButton.trigger('click')
    expect(wrapper.getComponent(AiModalityChart).props('metric')).toBe('tokens')
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
    expect(wrapper.text()).toContain('< 0,01 $')
    expect(wrapper.text()).toContain('Стоимость Grok')
    expect(wrapper.text()).toContain('По данным xAI')
    expect(wrapper.text()).toContain('Стоимость голосового Grok рассчитывается')
    expect(wrapper.text()).not.toContain('Расчётная стоимость')
    expect(wrapper.text()).not.toContain('операция ElevenLabs учтена')
    expect(wrapper.text()).not.toContain('character-cost')
    expect(wrapper.text()).not.toContain('Расчётная стоимость может отличаться')
    expect(wrapper.findAll('.metric-switch button')[1]!.attributes('disabled')).toBeUndefined()
  })

  it('shows Event Query consumption inside the Grok panel', async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: {
        projectId: 'project-1',
        canReadEventQueryUsage: true,
      },
    })
    await flushPromises()

    expect(mocks.fetchEventQueryUsage).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      }),
    )
    expect(wrapper.get('.xai-panel').text()).toContain('Запросы к событиям')
    expect(wrapper.get('.event-query-usage').text()).toContain('6')
    expect(wrapper.get('.event-query-usage').text()).toContain('3,2 КБ')
    expect(wrapper.get('.event-query-usage').text()).toContain(
      '1,1\u00a0тыс. токенов',
    )
    expect(wrapper.get('.event-query-usage').text()).toContain(
      '74,5\u00a0тыс. токенов',
    )
    expect(wrapper.get('.event-query-usage').text()).toContain('0,03\u00a0$')
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

  it('shows AI-created case consumption with its operation breakdown', async () => {
    const baseReport = await mocks.fetchReport()
    const xAiRow = baseReport.breakdown[0]
    mocks.fetchReport.mockResolvedValue({
      ...baseReport,
      totals: {
        ...baseReport.totals,
        records: 25,
        totalTokens: 41_219,
        inputTokens: 32_616,
        outputTokens: 8_603,
        billedCost: 0.0902324,
      },
      breakdown: [
        ...baseReport.breakdown,
        {
          ...xAiRow,
          operation: 'case_router',
          records: 18,
          totalTokens: 29_670,
          inputTokens: 24_447,
          outputTokens: 5_223,
          billedCost: 0.055208,
        },
        {
          ...xAiRow,
          operation: 'case_aggregator',
          records: 5,
          totalTokens: 11_429,
          inputTokens: 8_089,
          outputTokens: 3_340,
          billedCost: 0.0338244,
        },
      ],
      categories: [
        {
          category: 'CASE_INTELLIGENCE',
          currency: 'usd',
          records: 23,
          inputCharacters: 0,
          providerBilledUnits: 0,
          totalTokens: 41_099,
          inputTokens: 32_536,
          cachedInputTokens: 16_128,
          cacheWriteInputTokens: 0,
          outputTokens: 8_563,
          reasoningTokens: 6_302,
          inputTextTokens: 32_536,
          cachedInputTextTokens: 16_128,
          outputTextTokens: 8_563,
          inputAudioTokens: 0,
          cachedInputAudioTokens: 0,
          outputAudioTokens: 0,
          inputImageTokens: 0,
          cachedInputImageTokens: 0,
          outputImageTokens: 0,
          durationSeconds: 0,
          estimatedCost: 0,
          billedCost: 0.0890324,
        },
      ],
    })

    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: 'project-1' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('AI-кейсы')
    expect(wrapper.text()).toContain('Анализ и проверка обращений')
    expect(wrapper.text()).toContain('Маршрутизация')
    expect(wrapper.text()).toContain('Агрегация')
    expect(wrapper.text()).toContain('0,09 $')
    expect(wrapper.text()).toContain('41,1 тыс.')
  })

  it('includes all estimated Voice costs from the backend response', async () => {
    const baseReport = await mocks.fetchReport()
    const textUsage = baseReport.breakdown[0]
    mocks.fetchReport.mockResolvedValue({
      ...baseReport,
      totals: {
        ...baseReport.totals,
        records: 4,
        estimatedCostRecords: 2,
        durationSeconds: 170.35,
        estimatedCost: 0.197958333333,
      },
      breakdown: [
        ...baseReport.breakdown,
        {
          ...textUsage,
          model: 'grok-voice-latest',
          operation: 'realtime_response',
          records: 2,
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          inputTextTokens: 0,
          cachedInputTextTokens: 0,
          outputTextTokens: 0,
          durationSeconds: 170.35,
          estimatedCost: 0.141958333333,
          billedCost: 0,
        },
        {
          ...textUsage,
          model: 'grok-voice-latest',
          operation: 'realtime_text_input',
          records: 2,
          providerBilledUnits: 14,
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          inputTextTokens: 0,
          cachedInputTextTokens: 0,
          outputTextTokens: 0,
          durationSeconds: 0,
          estimatedCost: 0.056,
          billedCost: 0,
        },
      ],
    })

    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: 'project-1' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('0,20 $')
    expect(wrapper.text()).toContain('< 0,01 $ фактически')
    expect(wrapper.text()).toContain('0,20 $ расчётно')
    expect(wrapper.text()).toContain('0,05 $ за минуту отправленного и полученного аудио')
    expect(wrapper.text()).toContain('Если ставка изменилась, сообщите в поддержку')
    expect(wrapper.get('.voice-pricing-note a').attributes()).toMatchObject({
      href: 'https://docs.x.ai/developers/pricing#voice-api',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })
})
