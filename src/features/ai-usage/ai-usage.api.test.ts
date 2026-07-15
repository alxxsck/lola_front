import { describe, expect, it } from 'vitest'
import type { AiUsageReportResponseDto } from '@/shared/api/generated/models'
import { parseAiUsageReport } from './ai-usage.api'

const currentTotals = {
  records: 2,
  unpricedRecords: 0,
  inputCharacters: 0,
  totalTokens: 120,
  inputTokens: 80,
  cachedInputTokens: 20,
  outputTokens: 40,
  reasoningTokens: 0,
  inputTextTokens: 80,
  outputTextTokens: 40,
  inputAudioTokens: 0,
  outputAudioTokens: 0,
  durationSeconds: '0.000000000000',
  providerBilledUnits: '0.000000000000',
  estimatedCost: '0.001200000000',
  billedCost: '0.000000000000',
}

const response = {
  projectId: 'project-1',
  range: { from: null, to: null },
  totals: currentTotals,
  breakdown: [{
    provider: 'openai',
    model: 'gpt-5.4-mini',
    operation: 'responses',
    currency: 'usd',
    records: 2,
    inputCharacters: 0,
    totalTokens: 120,
    inputTokens: 80,
    cachedInputTokens: 20,
    outputTokens: 40,
    reasoningTokens: 0,
    inputTextTokens: 80,
    outputTextTokens: 40,
    inputAudioTokens: 0,
    outputAudioTokens: 0,
    durationSeconds: '0.000000000000',
    providerBilledUnits: '0.000000000000',
    estimatedCost: '0.001200000000',
    billedCost: '0.000000000000',
  }],
  items: [],
  nextCursor: null,
} satisfies AiUsageReportResponseDto

describe('AI usage API response validation', () => {
  it('normalizes decimal strings without exposing raw ledger rows', () => {
    expect(parseAiUsageReport(response, 'project-1')).toMatchObject({
      projectId: 'project-1',
      totals: { inputCharacters: 0, providerBilledUnits: 0, estimatedCost: 0.0012 },
      breakdown: [{ model: 'gpt-5.4-mini', inputCharacters: 0, providerBilledUnits: 0, estimatedCost: 0.0012 }],
    })
  })

  it('zero-fills modality details that are not part of the current backend DTO', () => {
    expect(parseAiUsageReport(response, 'project-1')?.totals).toMatchObject({
      cacheWriteInputTokens: 0,
      cachedInputTextTokens: 0,
      cachedInputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
    })
  })

  it('keeps compatible detail fields returned by an older backend', () => {
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

    expect(parseAiUsageReport(legacyResponse, 'project-1')?.totals).toMatchObject({
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
    expect(parseAiUsageReport({ ...response, totals: { ...response.totals, totalTokens: -1 } }, 'project-1')).toBeUndefined()
    expect(parseAiUsageReport({ ...response, breakdown: Array.from({ length: 1_001 }) }, 'project-1')).toBeUndefined()
  })
})
