import { describe, expect, it } from 'vitest'
import { parseAiUsageReport } from './ai-usage.api'

const integerFields = {
  records: 2,
  unpricedRecords: 0,
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
}

const response = {
  projectId: 'project-1',
  totals: {
    ...integerFields,
    durationSeconds: '0.000000000000',
    estimatedCost: '0.001200000000',
    billedCost: '0.000000000000',
  },
  breakdown: [{
    provider: 'openai',
    model: 'gpt-5.4-mini',
    operation: 'responses',
    currency: 'usd',
    records: 2,
    totalTokens: 120,
    inputTokens: 80,
    cachedInputTokens: 20,
    outputTokens: 40,
    inputTextTokens: 80,
    outputTextTokens: 40,
    inputAudioTokens: 0,
    outputAudioTokens: 0,
    durationSeconds: '0.000000000000',
    estimatedCost: '0.001200000000',
    billedCost: '0.000000000000',
  }],
  items: [{}],
  nextCursor: null,
}

describe('AI usage API response validation', () => {
  it('normalizes decimal strings without exposing raw ledger rows', () => {
    expect(parseAiUsageReport(response, 'project-1')).toMatchObject({
      projectId: 'project-1',
      totals: { estimatedCost: 0.0012 },
      breakdown: [{ model: 'gpt-5.4-mini', estimatedCost: 0.0012 }],
    })
  })

  it('rejects cross-project, negative and oversized responses', () => {
    expect(parseAiUsageReport(response, 'project-2')).toBeUndefined()
    expect(parseAiUsageReport({ ...response, totals: { ...response.totals, totalTokens: -1 } }, 'project-1')).toBeUndefined()
    expect(parseAiUsageReport({ ...response, breakdown: Array.from({ length: 1_001 }) }, 'project-1')).toBeUndefined()
  })
})
