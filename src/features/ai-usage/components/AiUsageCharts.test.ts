import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type {
  AiCreditUsage,
  AiModelUsage,
  AiProviderUsage,
  AiUsageBreakdown,
} from '../ai-usage.model'
import AiModalityChart from './AiModalityChart.vue'
import AiModelUsageChart from './AiModelUsageChart.vue'
import ElevenLabsCreditChart from './ElevenLabsCreditChart.vue'

const xAiRow: AiModelUsage = {
  key: 'xai\u0000grok-4.5\u0000usd',
  provider: 'xai',
  model: 'grok-4.5',
  currency: 'usd',
  records: 3,
  inputCharacters: 0,
  providerBilledUnits: 0,
  totalTokens: 1_250,
  inputTokens: 1_000,
  cachedInputTokens: 200,
  outputTokens: 250,
  durationSeconds: 0,
  estimatedCost: 0.005,
  billedCost: 0.025,
}

const voiceRow: AiModelUsage = {
  ...xAiRow,
  key: 'xai\u0000grok-voice-latest\u0000usd',
  model: 'grok-voice-latest',
  records: 4,
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  durationSeconds: 170.35,
  estimatedCost: 0.197958333333,
  billedCost: 0,
}

const elevenLabsRow: AiCreditUsage = {
  key: 'elevenlabs\u0000eleven_v3\u0000speech',
  provider: 'elevenlabs',
  model: 'eleven_v3',
  operation: 'speech',
  records: 3,
  inputCharacters: 1_200,
  providerBilledUnits: 1_250,
}

const emptyXAiUsage: AiProviderUsage = {
  records: 0,
  inputCharacters: 0,
  providerBilledUnits: 0,
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
}

const xAiBreakdown: AiUsageBreakdown = {
  provider: 'xai',
  model: 'grok-4.5',
  operation: 'web_search',
  currency: 'usd',
  records: 3,
  inputCharacters: 0,
  providerBilledUnits: 0,
  totalTokens: 1_250,
  inputTokens: 1_000,
  cachedInputTokens: 200,
  cacheWriteInputTokens: 0,
  outputTokens: 250,
  reasoningTokens: 0,
  inputTextTokens: 1_000,
  cachedInputTextTokens: 200,
  outputTextTokens: 250,
  inputAudioTokens: 0,
  cachedInputAudioTokens: 0,
  outputAudioTokens: 0,
  inputImageTokens: 0,
  cachedInputImageTokens: 0,
  outputImageTokens: 0,
  durationSeconds: 0,
  estimatedCost: 0.005,
  billedCost: 0.025,
}

describe('AI usage charts', () => {
  it('renders the Grok model chart using the metric controlled by its parent', async () => {
    const wrapper = mount(AiModelUsageChart, {
      props: { rows: [xAiRow], metric: 'tokens' },
    })

    expect(wrapper.text()).toContain('1,3 тыс. токенов')

    await wrapper.setProps({ metric: 'cost' })
    expect(wrapper.text()).toContain('0,0300 $')
  })

  it('keeps a Voice model visible when xAI reports duration and cost without tokens', async () => {
    const wrapper = mount(AiModelUsageChart, {
      props: { rows: [xAiRow, voiceRow], metric: 'tokens' },
    })

    expect(wrapper.text()).toContain('grok-voice-latest')
    expect(wrapper.text()).toContain('170,4 сек. аудио · токены не переданы')
    expect(wrapper.text()).not.toContain('Ещё 1 модель')

    await wrapper.setProps({ metric: 'cost' })
    expect(wrapper.text()).toContain('0,197958 $')
  })

  it('shows ElevenLabs credit usage by model and operation', () => {
    const wrapper = mount(ElevenLabsCreditChart, {
      props: { rows: [elevenLabsRow] },
    })

    expect(wrapper.text()).toContain('Куда расходуются credits')
    expect(wrapper.text()).toContain('eleven_v3')
    expect(wrapper.text()).toContain('Text to Speech')
    expect(wrapper.text()).toContain('1,3 тыс. credits')
    expect(wrapper.text()).toContain('1,2 тыс. символов')
    expect(wrapper.text()).toContain('а не USD')
  })

  it('keeps the Grok modality empty state provider-specific', () => {
    const wrapper = mount(AiModalityChart, {
      props: {
        totals: emptyXAiUsage,
        breakdown: [],
        metric: 'tokens',
      },
    })

    expect(wrapper.text()).toContain('Форматы токенов Grok')
    expect(wrapper.text()).toContain('Детализация по форматам пока отсутствует')
    expect(wrapper.text()).not.toContain('ElevenLabs')
  })

  it('switches the Grok donut from token formats to total cost by operation', async () => {
    const wrapper = mount(AiModalityChart, {
      props: {
        totals: {
          ...emptyXAiUsage,
          records: 3,
          totalTokens: 1_250,
          inputTokens: 1_000,
          cachedInputTokens: 200,
          outputTokens: 250,
          inputTextTokens: 1_000,
          cachedInputTextTokens: 200,
          outputTextTokens: 250,
          estimatedCost: 0.005,
          billedCost: 0.025,
        },
        breakdown: [xAiBreakdown],
        metric: 'tokens',
        currency: 'USD',
      },
    })

    expect(wrapper.text()).toContain('Форматы токенов Grok')
    expect(wrapper.text()).toContain('1,3 тыс. токенов')

    await wrapper.setProps({ metric: 'cost' })
    expect(wrapper.text()).toContain('Структура стоимости Grok')
    expect(wrapper.text()).toContain('Web search')
    expect(wrapper.text()).toContain('0,0300 $')
    expect(wrapper.text()).toContain('Фактическая и расчётная стоимость')
  })

  it('shows Voice duration when xAI does not return audio tokens', () => {
    const wrapper = mount(AiModalityChart, {
      props: {
        totals: {
          ...emptyXAiUsage,
          records: 4,
          totalTokens: 100,
          inputTokens: 80,
          outputTokens: 20,
          inputTextTokens: 80,
          outputTextTokens: 20,
          durationSeconds: 170.35,
          estimatedCost: 0.197958333333,
        },
        breakdown: [],
        metric: 'tokens',
      },
    })

    expect(wrapper.text()).toContain('Голос')
    expect(wrapper.text()).toContain('170,4 сек. аудио · токены не переданы')
  })

  it('labels Voice text operations in the cost breakdown', () => {
    const wrapper = mount(AiModalityChart, {
      props: {
        totals: {
          ...emptyXAiUsage,
          records: 2,
          estimatedCost: 0.056,
        },
        breakdown: [
          {
            ...xAiBreakdown,
            model: 'grok-voice-latest',
            operation: 'realtime_text_input',
            records: 2,
            totalTokens: 0,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            inputTextTokens: 0,
            cachedInputTextTokens: 0,
            outputTextTokens: 0,
            estimatedCost: 0.056,
            billedCost: 0,
          },
        ],
        metric: 'cost',
        currency: 'USD',
      },
    })

    expect(wrapper.text()).toContain('Текстовые команды Voice')
    expect(wrapper.text()).toContain('0,0560 $')
  })
})
