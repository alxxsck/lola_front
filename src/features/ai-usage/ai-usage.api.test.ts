import { describe, expect, it } from 'vitest'
import type { AiUsageReportResponseDto } from '@/shared/api/generated/models'
import { parseAiUsageReport } from './ai-usage.api'

const currentTotals = {
  records: 2,
  unpricedRecords: 0,
  providerReportedUsageRecords: 0,
  estimatedCostRecords: 2,
  providerReportedCostRecords: 0,
  estimatedRecords: 2,
  providerUnitOnlyRecords: 0,
  inputCharacters: 0,
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
  durationSeconds: '0.000000000000',
  providerBilledUnits: '0.000000000000',
  estimatedCost: '0.001200000000',
  billedCost: '0.000000000000',
  providerReportedCost: '0.000000000000',
  estimatedFallbackCost: '0.001200000000',
  effectiveCost: '0.001200000000',
}

const response = {
  projectId: 'project-1',
  range: { from: null, to: null },
  textToSpeechPricing: {
    current: {
      rate: '15',
      currency: 'usd',
      unit: 'per_million_input_characters',
      effectiveFrom: '2026-07-29T10:00:00.000Z',
    },
    sourceUrl: 'https://docs.x.ai/developers/pricing',
  },
  totals: currentTotals,
  breakdown: [
    {
      provider: 'xai',
      model: 'grok-4.5',
      operation: 'responses',
      currency: 'usd',
      records: 2,
      inputCharacters: 0,
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
      durationSeconds: '0.000000000000',
      providerBilledUnits: '0.000000000000',
      estimatedCost: '0.001200000000',
      billedCost: '0.000000000000',
      providerReportedCost: '0.000000000000',
      estimatedFallbackCost: '0.001200000000',
      effectiveCost: '0.001200000000',
    },
  ],
  categories: [],
  items: [],
  nextCursor: null,
} satisfies AiUsageReportResponseDto

describe('AI usage API response validation', () => {
  it('normalizes decimal strings without exposing raw ledger rows', () => {
    expect(parseAiUsageReport(response, 'project-1')).toMatchObject({
      projectId: 'project-1',
      totals: {
        inputCharacters: 0,
        providerBilledUnits: 0,
        estimatedCost: 0.0012,
      },
      breakdown: [
        {
          model: 'grok-4.5',
          inputCharacters: 0,
          providerBilledUnits: 0,
          estimatedCost: 0.0012,
        },
      ],
    })
  })

  it('parses modality details from the current backend DTO', () => {
    expect(parseAiUsageReport(response, 'project-1')?.totals).toMatchObject({
      cacheWriteInputTokens: 0,
      cachedInputTextTokens: 20,
      cachedInputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
    })
  })

  it('parses the backend-owned current TTS pricing explanation', () => {
    expect(
      parseAiUsageReport(response, 'project-1')?.textToSpeechPricing,
    ).toEqual({
      current: {
        rate: '15',
        currency: 'usd',
        unit: 'per_million_input_characters',
        effectiveFrom: '2026-07-29T10:00:00.000Z',
      },
      sourceUrl: 'https://docs.x.ai/developers/pricing',
    })

    expect(
      parseAiUsageReport(
        {
          ...response,
          textToSpeechPricing: {
            ...response.textToSpeechPricing,
            current: null,
          },
        },
        'project-1',
      )?.textToSpeechPricing.current,
    ).toBeNull()
  })

  it('rejects unsafe or malformed TTS pricing context', () => {
    for (const textToSpeechPricing of [
      {
        ...response.textToSpeechPricing,
        sourceUrl: 'http://docs.x.ai/developers/pricing',
      },
      {
        ...response.textToSpeechPricing,
        current: { ...response.textToSpeechPricing.current, rate: '0' },
      },
      {
        ...response.textToSpeechPricing,
        current: {
          ...response.textToSpeechPricing.current,
          rate: '0.1234567890123',
        },
      },
      {
        ...response.textToSpeechPricing,
        current: {
          ...response.textToSpeechPricing.current,
          unit: 'per_thousand_characters',
        },
      },
      {
        ...response.textToSpeechPricing,
        current: {
          ...response.textToSpeechPricing.current,
          effectiveFrom: 'not-a-date',
        },
      },
    ]) {
      expect(
        parseAiUsageReport({ ...response, textToSpeechPricing }, 'project-1'),
      ).toBeUndefined()
    }
  })

  it('accepts a nullable model only for xAI Text-to-Speech usage', () => {
    const speech = {
      ...response.breakdown[0],
      model: null,
      operation: 'speech',
      records: 1,
      inputCharacters: 240,
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      inputTextTokens: 0,
      cachedInputTextTokens: 0,
      outputTextTokens: 0,
      estimatedCost: '0.003600000000',
      estimatedFallbackCost: '0.003600000000',
      effectiveCost: '0.003600000000',
    }

    expect(
      parseAiUsageReport({ ...response, breakdown: [speech] }, 'project-1')
        ?.breakdown[0],
    ).toMatchObject({
      provider: 'xai',
      model: null,
      operation: 'speech',
      inputCharacters: 240,
      effectiveCost: 0.0036,
    })
    expect(
      parseAiUsageReport(
        {
          ...response,
          breakdown: [{ ...speech, operation: 'responses' }],
        },
        'project-1',
      ),
    ).toBeUndefined()
  })

  it('parses case intelligence as a project usage category', () => {
    const responseWithCaseUsage = {
      ...response,
      categories: [
        {
          ...response.breakdown[0],
          category: 'CASE_INTELLIGENCE',
          records: 23,
          totalTokens: 41_099,
          billedCost: '0.089032400000',
        },
      ],
    }

    expect(
      parseAiUsageReport(responseWithCaseUsage, 'project-1'),
    ).toMatchObject({
      categories: [
        {
          category: 'CASE_INTELLIGENCE',
          records: 23,
          totalTokens: 41_099,
          billedCost: 0.0890324,
        },
      ],
    })
  })

  it('parses provider-reported xAI billed cost when estimated cost is zero', () => {
    const providerReportedResponse = {
      ...response,
      totals: {
        ...response.totals,
        providerReportedUsageRecords: 2,
        estimatedCostRecords: 0,
        estimatedCost: '0.000000000000',
        billedCost: '0.018152000000',
      },
      breakdown: [
        {
          ...response.breakdown[0],
          estimatedCost: '0.000000000000',
          billedCost: '0.018152000000',
        },
      ],
    }

    expect(
      parseAiUsageReport(providerReportedResponse, 'project-1'),
    ).toMatchObject({
      totals: { estimatedCost: 0, billedCost: 0.018152 },
      breakdown: [{ estimatedCost: 0, billedCost: 0.018152 }],
    })
  })

  it('parses nonzero cache and image modality details', () => {
    const legacyResponse = {
      ...response,
      totals: {
        ...response.totals,
        cacheWriteInputTokens: 3,
        cachedInputTextTokens: 4,
        cachedInputAudioTokens: 5,
        inputImageTokens: 6,
        cachedInputImageTokens: 7,
        outputImageTokens: 8,
      },
    }

    expect(
      parseAiUsageReport(legacyResponse, 'project-1')?.totals,
    ).toMatchObject({
      cacheWriteInputTokens: 3,
      cachedInputTextTokens: 4,
      cachedInputAudioTokens: 5,
      inputImageTokens: 6,
      cachedInputImageTokens: 7,
      outputImageTokens: 8,
    })
  })

  it('rejects cross-project, negative and oversized responses', () => {
    expect(parseAiUsageReport(response, 'project-2')).toBeUndefined()
    expect(
      parseAiUsageReport(
        { ...response, totals: { ...response.totals, totalTokens: -1 } },
        'project-1',
      ),
    ).toBeUndefined()
    expect(
      parseAiUsageReport(
        { ...response, breakdown: Array.from({ length: 1_001 }) },
        'project-1',
      ),
    ).toBeUndefined()
  })
})
