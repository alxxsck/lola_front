import { describe, expect, it } from 'vitest'
import {
  aggregateCreditUsage,
  aggregateModelUsage,
  aggregateProviderUsage,
  getAiUsageRange,
  getModalityUsage,
  getProviderBreakdown,
  getReportCurrency,
  hasEstimatedCost,
  pluralizeRu,
  type AiUsageBreakdown,
  type AiUsageReport,
  type AiUsageTotals,
} from './ai-usage.model'

const totals: AiUsageTotals = {
  records: 3,
  unpricedRecords: 0,
  providerReportedUsageRecords: 0,
  estimatedCostRecords: 3,
  inputCharacters: 0,
  providerBilledUnits: 0,
  totalTokens: 1_300,
  inputTokens: 900,
  cachedInputTokens: 200,
  cacheWriteInputTokens: 0,
  outputTokens: 400,
  reasoningTokens: 0,
  inputTextTokens: 600,
  cachedInputTextTokens: 150,
  outputTextTokens: 250,
  inputAudioTokens: 300,
  cachedInputAudioTokens: 50,
  outputAudioTokens: 150,
  inputImageTokens: 0,
  cachedInputImageTokens: 0,
  outputImageTokens: 0,
  durationSeconds: 0,
  estimatedCost: 0.03,
  billedCost: 0,
}

function breakdown(patch: Partial<AiUsageBreakdown> = {}): AiUsageBreakdown {
  return {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    operation: 'responses',
    currency: 'usd',
    records: 1,
    inputCharacters: 0,
    providerBilledUnits: 0,
    totalTokens: 100,
  inputTokens: 70,
  cachedInputTokens: 10,
  cacheWriteInputTokens: 0,
  outputTokens: 30,
  reasoningTokens: 0,
  inputTextTokens: 70,
  cachedInputTextTokens: 10,
  outputTextTokens: 30,
  inputAudioTokens: 0,
  cachedInputAudioTokens: 0,
  outputAudioTokens: 0,
  inputImageTokens: 0,
  cachedInputImageTokens: 0,
  outputImageTokens: 0,
    durationSeconds: 0,
    estimatedCost: 0.01,
    billedCost: 0,
    ...patch,
  }
}

describe('AI usage model', () => {
  it('builds calendar ranges in the browser timezone', () => {
    const now = new Date(2026, 6, 14, 15, 30)
    const expectedStart = new Date(now)
    expectedStart.setHours(0, 0, 0, 0)

    expect(getAiUsageRange('today', now)).toEqual({
      from: expectedStart.toISOString(),
      to: now.toISOString(),
    })

    expectedStart.setDate(expectedStart.getDate() - 6)
    expect(getAiUsageRange('7d', now).from).toBe(expectedStart.toISOString())
    expect(getAiUsageRange('all', now)).toEqual({})
  })

  it('combines operations of the same provider model and currency', () => {
    const result = aggregateModelUsage([
      breakdown({ inputCharacters: 100, providerBilledUnits: 110 }),
      breakdown({
        operation: 'scripted_intro',
        records: 2,
        inputCharacters: 200,
        providerBilledUnits: 220,
        totalTokens: 200,
        estimatedCost: 0.02,
      }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      records: 3,
      inputCharacters: 300,
      providerBilledUnits: 330,
      totalTokens: 300,
      estimatedCost: 0.03,
    })
  })

  it('keeps currencies separate and refuses to combine their total', () => {
    const report: AiUsageReport = {
      projectId: 'project-1',
      totals,
      breakdown: [breakdown(), breakdown({ currency: 'eur' })],
    }

    expect(aggregateModelUsage(report.breakdown)).toHaveLength(2)
    expect(getReportCurrency(report)).toBeUndefined()
  })

  it('separates provider totals and credit usage before presentation', () => {
    const openAi = breakdown()
    const elevenLabs = breakdown({
      provider: 'elevenlabs',
      model: 'eleven_v3',
      operation: 'speech',
      records: 3,
      inputCharacters: 1_200,
      providerBilledUnits: 1_250,
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      inputTextTokens: 0,
      outputTextTokens: 0,
      estimatedCost: 0,
    })

    const openAiUsage = aggregateProviderUsage(
      getProviderBreakdown([openAi, elevenLabs], 'openai'),
    )
    const elevenLabsUsage = aggregateProviderUsage(
      getProviderBreakdown([openAi, elevenLabs], 'elevenlabs'),
    )
    const creditRows = aggregateCreditUsage([elevenLabs])

    expect(openAiUsage).toMatchObject({
      records: 1,
      totalTokens: 100,
      providerBilledUnits: 0,
    })
    expect(elevenLabsUsage).toMatchObject({
      records: 3,
      totalTokens: 0,
      providerBilledUnits: 1_250,
    })
    expect(creditRows).toEqual([
      expect.objectContaining({
        model: 'eleven_v3',
        operation: 'speech',
        records: 3,
        inputCharacters: 1_200,
        providerBilledUnits: 1_250,
      }),
    ])
  })

  it('does not present provider-reported ElevenLabs units as a zero-cost estimate', () => {
    const row = aggregateModelUsage([
      breakdown({
        provider: 'elevenlabs',
        model: 'eleven_v3',
        totalTokens: 0,
        providerBilledUnits: 125,
        estimatedCost: 0,
      }),
    ])[0]!

    expect(hasEstimatedCost(row)).toBe(false)
  })

  it('keeps rejected zero-unit ElevenLabs requests unpriced', () => {
    const row = aggregateModelUsage([
      breakdown({
        provider: 'elevenlabs',
        model: 'eleven_v3',
        totalTokens: 0,
        providerBilledUnits: 0,
        estimatedCost: 0,
      }),
    ])[0]!

    expect(hasEstimatedCost(row)).toBe(false)
  })

  it('uses non-overlapping text, audio and image modality totals', () => {
    expect(getModalityUsage(totals).map((item) => item.tokens)).toEqual([
      850, 450, 0,
    ])
  })

  it('uses correct Russian plural forms', () => {
    expect(
      [1, 2, 5, 11, 21, 24].map((value) =>
        pluralizeRu(value, 'модель', 'модели', 'моделей'),
      ),
    ).toEqual(['модель', 'модели', 'моделей', 'моделей', 'модель', 'модели'])
  })
})
