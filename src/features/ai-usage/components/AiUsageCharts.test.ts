import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type {
  AiCreditUsage,
  AiModelUsage,
  AiProviderUsage,
} from '../ai-usage.model'
import AiModalityChart from './AiModalityChart.vue'
import AiModelUsageChart from './AiModelUsageChart.vue'
import ElevenLabsCreditChart from './ElevenLabsCreditChart.vue'

const openAiRow: AiModelUsage = {
  key: 'openai\u0000gpt-5.4-mini\u0000usd',
  provider: 'openai',
  model: 'gpt-5.4-mini',
  currency: 'usd',
  records: 3,
  inputCharacters: 0,
  providerBilledUnits: 0,
  totalTokens: 1_250,
  inputTokens: 1_000,
  cachedInputTokens: 200,
  outputTokens: 250,
  estimatedCost: 0.025,
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

const emptyOpenAiUsage: AiProviderUsage = {
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

describe('AI usage charts', () => {
  it('switches the OpenAI model chart between tokens and cost only', async () => {
    const wrapper = mount(AiModelUsageChart, {
      props: { rows: [openAiRow], currency: 'USD' },
    })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Токены',
      'Стоимость',
    ])
    expect(wrapper.text()).toContain('1,3 тыс. токенов')

    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.text()).toContain('0,0250 $')
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

  it('keeps the OpenAI modality empty state provider-specific', () => {
    const wrapper = mount(AiModalityChart, {
      props: { totals: emptyOpenAiUsage },
    })

    expect(wrapper.text()).toContain('Форматы токенов OpenAI')
    expect(wrapper.text()).toContain('Детализация по форматам пока отсутствует')
    expect(wrapper.text()).not.toContain('ElevenLabs')
  })
})
