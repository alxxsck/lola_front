import { aiUsageReport } from '@/shared/api/generated/lola-backend'
import { isMockMode } from '@/shared/config/data-mode'
import type {
  AiUsageBreakdown,
  AiUsageCategory,
  AiUsageCategoryBreakdown,
  AiUsageRangeQuery,
  AiUsageReport,
  AiTextToSpeechPricingContext,
  AiUsageTotals,
} from './ai-usage.model'
import { AI_USAGE_CATEGORIES } from './ai-usage.model'

const demoReport = (projectId: string): AiUsageReport => ({
  projectId,
  totals: {
    records: 210,
    unpricedRecords: 0,
    providerReportedUsageRecords: 136,
    estimatedCostRecords: 74,
    inputCharacters: 18_460,
    providerBilledUnits: 0,
    totalTokens: 184_720,
    inputTokens: 127_980,
    cachedInputTokens: 38_420,
    cacheWriteInputTokens: 0,
    outputTokens: 56_740,
    reasoningTokens: 8_120,
    inputTextTokens: 98_600,
    cachedInputTextTokens: 31_100,
    outputTextTokens: 43_200,
    inputAudioTokens: 29_380,
    cachedInputAudioTokens: 7_320,
    outputAudioTokens: 13_540,
    inputImageTokens: 0,
    cachedInputImageTokens: 0,
    outputImageTokens: 0,
    durationSeconds: 428,
    estimatedCost: 1.384999,
    billedCost: 0.1765,
    providerReportedCost: 0.1765,
    estimatedFallbackCost: 1.384999,
    effectiveCost: 1.561499,
  },
  breakdown: [
    {
      provider: 'xai',
      model: 'grok-4.5',
      operation: 'response',
      currency: 'usd',
      records: 112,
      inputCharacters: 0,
      providerBilledUnits: 0,
      totalTokens: 108_420,
      inputTokens: 78_100,
      cachedInputTokens: 25_600,
      cacheWriteInputTokens: 0,
      outputTokens: 30_320,
      reasoningTokens: 8_120,
      inputTextTokens: 78_100,
      cachedInputTextTokens: 25_600,
      outputTextTokens: 30_320,
      inputAudioTokens: 0,
      cachedInputAudioTokens: 0,
      outputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
      durationSeconds: 0,
      estimatedCost: 0,
      billedCost: 0.1765,
      providerReportedCost: 0.1765,
      estimatedFallbackCost: 0,
      effectiveCost: 0.1765,
    },
    {
      provider: 'xai',
      model: 'grok-voice-think-fast-1.0',
      operation: 'realtime_response',
      currency: 'usd',
      records: 51,
      inputCharacters: 0,
      providerBilledUnits: 0,
      totalTokens: 58_360,
      inputTokens: 37_640,
      cachedInputTokens: 11_420,
      cacheWriteInputTokens: 0,
      outputTokens: 20_720,
      reasoningTokens: 0,
      inputTextTokens: 11_900,
      cachedInputTextTokens: 4_100,
      outputTextTokens: 9_220,
      inputAudioTokens: 25_740,
      cachedInputAudioTokens: 7_320,
      outputAudioTokens: 11_500,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
      durationSeconds: 0,
      estimatedCost: 0.8467,
      billedCost: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0.8467,
      effectiveCost: 0.8467,
    },
    {
      provider: 'xai',
      model: 'grok-voice-think-fast-1.0',
      operation: 'realtime_text_input',
      currency: 'usd',
      records: 9,
      inputCharacters: 0,
      providerBilledUnits: 0,
      totalTokens: 7_180,
      inputTokens: 3_740,
      cachedInputTokens: 1_400,
      cacheWriteInputTokens: 0,
      outputTokens: 3_440,
      reasoningTokens: 0,
      inputTextTokens: 2_100,
      cachedInputTextTokens: 1_400,
      outputTextTokens: 1_400,
      inputAudioTokens: 1_640,
      cachedInputAudioTokens: 0,
      outputAudioTokens: 2_040,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
      durationSeconds: 0,
      estimatedCost: 0.1964,
      billedCost: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0.1964,
      effectiveCost: 0.1964,
    },
    {
      provider: 'xai',
      model: 'grok-voice-think-fast-1.0',
      operation: 'realtime_transcription',
      currency: 'usd',
      records: 14,
      inputCharacters: 0,
      providerBilledUnits: 0,
      totalTokens: 10_760,
      inputTokens: 8_500,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 2_260,
      reasoningTokens: 0,
      inputTextTokens: 6_500,
      cachedInputTextTokens: 0,
      outputTextTokens: 2_260,
      inputAudioTokens: 2_000,
      cachedInputAudioTokens: 0,
      outputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
      durationSeconds: 428,
      estimatedCost: 0.064999,
      billedCost: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0.064999,
      effectiveCost: 0.064999,
    },
    {
      provider: 'xai',
      model: null,
      operation: 'speech',
      currency: 'usd',
      records: 24,
      inputCharacters: 18_460,
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
      estimatedCost: 0.2769,
      billedCost: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0.2769,
      effectiveCost: 0.2769,
    },
  ],
  categories: [
    {
      category: 'VOICE',
      currency: 'usd',
      records: 74,
      inputCharacters: 0,
      providerBilledUnits: 0,
      totalTokens: 76_300,
      inputTokens: 49_880,
      cachedInputTokens: 12_820,
      cacheWriteInputTokens: 0,
      outputTokens: 26_420,
      reasoningTokens: 0,
      inputTextTokens: 20_500,
      cachedInputTextTokens: 5_500,
      outputTextTokens: 12_880,
      inputAudioTokens: 29_380,
      cachedInputAudioTokens: 7_320,
      outputAudioTokens: 13_540,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
      durationSeconds: 428,
      estimatedCost: 1.108099,
      billedCost: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 1.108099,
      effectiveCost: 1.108099,
    },
    {
      category: 'SPEECH',
      currency: 'usd',
      records: 24,
      inputCharacters: 18_460,
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
      estimatedCost: 0.2769,
      billedCost: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0.2769,
      effectiveCost: 0.2769,
    },
  ],
  textToSpeechPricing: {
    current: {
      rate: '15',
      currency: 'usd',
      unit: 'per_million_input_characters',
      effectiveFrom: '2026-07-29T10:00:00.000Z',
    },
    sourceUrl: 'https://docs.x.ai/developers/pricing',
  },
})

const totalsIntegerKeys = [
  'records',
  'unpricedRecords',
  'inputCharacters',
  'totalTokens',
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'reasoningTokens',
  'inputTextTokens',
  'outputTextTokens',
  'inputAudioTokens',
  'outputAudioTokens',
] as const
const totalsLegacyIntegerKeys = [
  'cacheWriteInputTokens',
  'cachedInputTextTokens',
  'cachedInputAudioTokens',
  'inputImageTokens',
  'cachedInputImageTokens',
  'outputImageTokens',
] as const
const breakdownIntegerKeys = [
  'records',
  'inputCharacters',
  'totalTokens',
  'inputTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'reasoningTokens',
  'inputTextTokens',
  'cachedInputTextTokens',
  'outputTextTokens',
  'inputAudioTokens',
  'cachedInputAudioTokens',
  'outputAudioTokens',
  'inputImageTokens',
  'cachedInputImageTokens',
  'outputImageTokens',
] as const
const decimalKeys = [
  'providerBilledUnits',
  'durationSeconds',
  'estimatedCost',
  'billedCost',
  'providerReportedCost',
  'estimatedFallbackCost',
  'effectiveCost',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

function safeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

function decimal(value: unknown): number | undefined {
  if (
    typeof value === 'string' &&
    (value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value))
  )
    return undefined
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined
}

function normalizeNumbers(
  source: Record<string, unknown>,
  integerKeys: readonly string[],
  optionalIntegerKeys: readonly string[] = [],
): Record<string, number> | undefined {
  const normalized: Record<string, number> = {}
  for (const key of integerKeys) {
    const value = safeInteger(source[key])
    if (value === undefined) return undefined
    normalized[key] = value
  }
  for (const key of optionalIntegerKeys) {
    if (source[key] === undefined) {
      normalized[key] = 0
      continue
    }
    const value = safeInteger(source[key])
    if (value === undefined) return undefined
    normalized[key] = value
  }
  for (const key of decimalKeys) {
    const value = decimal(source[key])
    if (value === undefined) return undefined
    normalized[key] = value
  }
  return normalized
}

function parseTotals(value: unknown): AiUsageTotals | undefined {
  if (!isRecord(value)) return undefined
  const numbers = normalizeNumbers(
    value,
    totalsIntegerKeys,
    totalsLegacyIntegerKeys,
  )
  if (!numbers) return undefined
  for (const key of [
    'providerReportedUsageRecords',
    'estimatedCostRecords',
    'providerReportedCostRecords',
    'estimatedRecords',
    'providerUnitOnlyRecords',
  ] as const) {
    if (value[key] === undefined) continue
    const parsed = safeInteger(value[key])
    if (parsed === undefined) return undefined
    numbers[key] = parsed
  }
  return numbers as unknown as AiUsageTotals
}

function parseBreakdown(value: unknown): AiUsageBreakdown | undefined {
  if (!isRecord(value)) return undefined
  const model = boundedString(value.model, 1, 160)
    ? value.model
    : value.model === null &&
        value.provider === 'xai' &&
        value.operation === 'speech'
      ? null
      : undefined
  if (
    !boundedString(value.provider, 1, 80) ||
    model === undefined ||
    !boundedString(value.operation, 1, 120) ||
    !boundedString(value.currency, 3, 8)
  )
    return undefined
  const numbers = normalizeNumbers(value, breakdownIntegerKeys)
  if (!numbers) return undefined
  return {
    provider: value.provider,
    model,
    operation: value.operation,
    currency: value.currency,
    ...numbers,
  } as unknown as AiUsageBreakdown
}

const usageCategories = new Set<AiUsageCategory>(AI_USAGE_CATEGORIES)

function parseCategory(value: unknown): AiUsageCategoryBreakdown | undefined {
  if (!isRecord(value)) return undefined
  if (
    typeof value.category !== 'string' ||
    !usageCategories.has(value.category as AiUsageCategory) ||
    !boundedString(value.currency, 3, 8)
  )
    return undefined
  const numbers = normalizeNumbers(value, breakdownIntegerKeys)
  if (!numbers) return undefined
  return {
    category: value.category as AiUsageCategory,
    currency: value.currency,
    ...numbers,
  } as unknown as AiUsageCategoryBreakdown
}

function parseHttpsUrl(value: unknown): string | undefined {
  if (!boundedString(value, 1, 2_048)) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export function parseTextToSpeechPricing(
  value: unknown,
): AiTextToSpeechPricingContext | undefined {
  if (!isRecord(value)) return undefined
  const sourceUrl = parseHttpsUrl(value.sourceUrl)
  if (!sourceUrl) return undefined
  if (value.current === null) return { current: null, sourceUrl }
  if (!isRecord(value.current)) return undefined

  const { rate, currency, unit, effectiveFrom } = value.current
  if (
    !boundedString(rate, 1, 64) ||
    !/^\d+(?:\.\d+)?$/.test(rate) ||
    Number(rate) <= 0 ||
    currency !== 'usd' ||
    unit !== 'per_million_input_characters' ||
    !boundedString(effectiveFrom, 1, 64)
  )
    return undefined
  const date = new Date(effectiveFrom)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== effectiveFrom)
    return undefined

  return {
    current: { rate, currency, unit, effectiveFrom },
    sourceUrl,
  }
}

export function parseAiUsageReport(
  value: unknown,
  projectId: string,
): AiUsageReport | undefined {
  if (!isRecord(value) || value.projectId !== projectId) return undefined
  if (!Array.isArray(value.breakdown) || value.breakdown.length > 1_000)
    return undefined
  if (!Array.isArray(value.categories) || value.categories.length > 100)
    return undefined
  if (!Array.isArray(value.items) || value.items.length > 1) return undefined
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string')
    return undefined
  const totals = parseTotals(value.totals)
  if (!totals) return undefined
  const textToSpeechPricing = parseTextToSpeechPricing(
    value.textToSpeechPricing,
  )
  if (!textToSpeechPricing) return undefined
  const breakdown: AiUsageBreakdown[] = []
  for (const item of value.breakdown) {
    const parsed = parseBreakdown(item)
    if (!parsed) return undefined
    breakdown.push(parsed)
  }
  const categories: AiUsageCategoryBreakdown[] = []
  for (const item of value.categories) {
    const parsed = parseCategory(item)
    if (!parsed) return undefined
    categories.push(parsed)
  }
  return {
    projectId,
    totals,
    breakdown,
    categories,
    textToSpeechPricing,
  }
}

export async function fetchAiUsageReport(
  projectId: string,
  range: AiUsageRangeQuery,
  signal?: AbortSignal,
): Promise<AiUsageReport> {
  if (isMockMode) return demoReport(projectId)

  const response: unknown = await aiUsageReport(
    projectId,
    { ...range, limit: 1 },
    { signal },
  )
  const parsed = parseAiUsageReport(response, projectId)
  if (!parsed)
    throw new Error('Сервер вернул некорректные данные статистики AI')
  return parsed
}
