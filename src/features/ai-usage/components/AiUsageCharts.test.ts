import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { AiModelUsage, AiUsageTotals } from '../ai-usage.model'
import AiModalityChart from './AiModalityChart.vue'
import AiModelUsageChart from './AiModelUsageChart.vue'

const elevenLabsRow: AiModelUsage = {
  key: 'elevenlabs\u0000eleven_v3\u0000usd',
  provider: 'elevenlabs',
  model: 'eleven_v3',
  currency: 'usd',
  records: 3,
  inputCharacters: 1_200,
  providerBilledUnits: 1_250,
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  estimatedCost: 0,
}

const elevenLabsTotals: AiUsageTotals = {
  records: 3,
  unpricedRecords: 0,
  providerReportedUsageRecords: 3,
  estimatedCostRecords: 0,
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
}

describe('AI usage charts', () => {
  it('opens an ElevenLabs-only report on characters instead of showing zero tokens', async () => {
    const wrapper = mount(AiModelUsageChart, {
      props: { rows: [elevenLabsRow], currency: 'USD' },
    })

    expect(wrapper.find('button.active').text()).toBe('Символы')
    expect(wrapper.text()).toContain('eleven_v3')
    expect(wrapper.text()).toContain('1,2 тыс. символов')

    await wrapper.get('button:nth-child(1)').trigger('click')
    expect(wrapper.text()).not.toContain('eleven_v3')
  })

  it('explains why ElevenLabs has no OpenAI token modality breakdown', () => {
    const wrapper = mount(AiModalityChart, {
      props: { totals: elevenLabsTotals },
    })

    expect(wrapper.text()).toContain('Форматы токенов OpenAI')
    expect(wrapper.text()).toContain('ElevenLabs считает символы и credits')
  })
})
