export type AiUsageRangeKey = 'today' | '7d' | '30d' | 'all'
export type AiUsageMetric = 'tokens' | 'cost'
export const AI_USAGE_CATEGORIES = [
  'CHAT',
  'VOICE',
  'SPEECH',
  'MEMORY',
  'AI_REVIEW',
  'CASE_INTELLIGENCE',
  'PROJECT_OVERHEAD',
] as const
export type AiUsageCategory = (typeof AI_USAGE_CATEGORIES)[number]

export interface AiUsageRangeQuery {
  from?: string
  to?: string
}

export interface AiUsageTotals {
  records: number
  unpricedRecords: number
  providerReportedUsageRecords?: number
  estimatedCostRecords?: number
  providerReportedCostRecords?: number
  estimatedRecords?: number
  providerUnitOnlyRecords?: number
  inputCharacters: number
  providerBilledUnits: number
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
  reasoningTokens: number
  inputTextTokens: number
  cachedInputTextTokens: number
  outputTextTokens: number
  inputAudioTokens: number
  cachedInputAudioTokens: number
  outputAudioTokens: number
  inputImageTokens: number
  cachedInputImageTokens: number
  outputImageTokens: number
  durationSeconds: number
  estimatedCost: number
  billedCost: number
  providerReportedCost: number
  estimatedFallbackCost: number
  effectiveCost: number
}

export interface AiUsageBreakdown {
  provider: string
  model: string | null
  operation: string
  currency: string
  records: number
  inputCharacters: number
  providerBilledUnits: number
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
  reasoningTokens: number
  inputTextTokens: number
  cachedInputTextTokens: number
  outputTextTokens: number
  inputAudioTokens: number
  cachedInputAudioTokens: number
  outputAudioTokens: number
  inputImageTokens: number
  cachedInputImageTokens: number
  outputImageTokens: number
  durationSeconds: number
  estimatedCost: number
  billedCost: number
  providerReportedCost: number
  estimatedFallbackCost: number
  effectiveCost: number
}

export interface AiUsageCategoryBreakdown extends Omit<
  AiUsageBreakdown,
  'provider' | 'model' | 'operation'
> {
  category: AiUsageCategory
}

export interface AiProviderUsage {
  records: number
  inputCharacters: number
  providerBilledUnits: number
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
  reasoningTokens: number
  inputTextTokens: number
  cachedInputTextTokens: number
  outputTextTokens: number
  inputAudioTokens: number
  cachedInputAudioTokens: number
  outputAudioTokens: number
  inputImageTokens: number
  cachedInputImageTokens: number
  outputImageTokens: number
  durationSeconds: number
  estimatedCost: number
  billedCost: number
  providerReportedCost: number
  estimatedFallbackCost: number
  effectiveCost: number
}

export interface AiUsageReport {
  projectId: string
  totals: AiUsageTotals
  breakdown: AiUsageBreakdown[]
  categories: AiUsageCategoryBreakdown[]
  textToSpeechPricing: AiTextToSpeechPricingContext
}

export interface AiTextToSpeechPricingContext {
  current: {
    rate: string
    currency: 'usd'
    unit: 'per_million_input_characters'
    effectiveFrom: string
  } | null
  sourceUrl: string
}

export interface AiModelUsage {
  key: string
  provider: string
  model: string
  currency: string
  records: number
  inputCharacters: number
  providerBilledUnits: number
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  durationSeconds: number
  estimatedCost: number
  billedCost: number
}

export interface AiModalityUsage {
  key: 'text' | 'audio' | 'image'
  label: string
  tokens: number
}

export const AI_USAGE_RANGE_OPTIONS: ReadonlyArray<{
  label: string
  value: AiUsageRangeKey
}> = [
  { label: 'Сегодня', value: 'today' },
  { label: '7 дней', value: '7d' },
  { label: '30 дней', value: '30d' },
  { label: 'Всё время', value: 'all' },
]

export const AI_USAGE_CATEGORY_LABELS: Record<AiUsageCategory, string> = {
  CHAT: 'Чат с Lola',
  VOICE: 'Голос',
  SPEECH: 'Озвучивание',
  MEMORY: 'Память Lola',
  AI_REVIEW: 'AI Review',
  CASE_INTELLIGENCE: 'Анализ и проверка обращений',
  PROJECT_OVERHEAD: 'Системные операции',
}

export function getAiUsageRange(
  key: AiUsageRangeKey,
  now = new Date(),
): AiUsageRangeQuery {
  if (key === 'all') return {}

  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  if (key === '7d') from.setDate(from.getDate() - 6)
  if (key === '30d') from.setDate(from.getDate() - 29)

  return { from: from.toISOString(), to: now.toISOString() }
}

export function aggregateModelUsage(
  breakdown: readonly AiUsageBreakdown[],
): AiModelUsage[] {
  const models = new Map<string, AiModelUsage>()

  for (const item of breakdown) {
    if (item.model === null) continue
    const key = `${item.provider}\u0000${item.model}\u0000${item.currency}`
    const current = models.get(key)
    if (current) {
      current.records += item.records
      current.inputCharacters += item.inputCharacters
      current.providerBilledUnits += item.providerBilledUnits
      current.totalTokens += item.totalTokens
      current.inputTokens += item.inputTokens
      current.cachedInputTokens += item.cachedInputTokens
      current.outputTokens += item.outputTokens
      current.durationSeconds += item.durationSeconds
      current.estimatedCost += item.estimatedCost
      current.billedCost += item.billedCost
      continue
    }

    models.set(key, {
      key,
      provider: item.provider,
      model: item.model,
      currency: item.currency,
      records: item.records,
      inputCharacters: item.inputCharacters,
      providerBilledUnits: item.providerBilledUnits,
      totalTokens: item.totalTokens,
      inputTokens: item.inputTokens,
      cachedInputTokens: item.cachedInputTokens,
      outputTokens: item.outputTokens,
      durationSeconds: item.durationSeconds,
      estimatedCost: item.estimatedCost,
      billedCost: item.billedCost,
    })
  }

  return [...models.values()]
}

export function getProviderBreakdown(
  breakdown: readonly AiUsageBreakdown[],
  provider: string,
): AiUsageBreakdown[] {
  const normalizedProvider = provider.toLowerCase()
  return breakdown.filter(
    (item) => item.provider.toLowerCase() === normalizedProvider,
  )
}

const VOICE_OPERATIONS = new Set([
  'realtime_response',
  'realtime_transcription',
  'realtime_text_input',
  'realtime_speech',
])

export function getModelBreakdown(
  breakdown: readonly AiUsageBreakdown[],
): AiUsageBreakdown[] {
  return breakdown.filter(
    (item) =>
      item.provider.toLowerCase() === 'xai' &&
      item.operation !== 'speech' &&
      !VOICE_OPERATIONS.has(item.operation),
  )
}

export function getCategoryUsage(
  report: AiUsageReport,
  category: AiUsageCategory,
): AiUsageCategoryBreakdown | undefined {
  return report.categories.find((item) => item.category === category)
}

export function aggregateProviderUsage(
  breakdown: readonly AiUsageBreakdown[],
): AiProviderUsage {
  const totals: AiProviderUsage = {
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
    providerReportedCost: 0,
    estimatedFallbackCost: 0,
    effectiveCost: 0,
  }

  for (const item of breakdown) {
    for (const key of Object.keys(totals) as Array<keyof AiProviderUsage>) {
      totals[key] += item[key]
    }
  }

  return totals
}

export function getModalityUsage(
  totals: AiUsageTotals | AiProviderUsage,
): AiModalityUsage[] {
  return [
    {
      key: 'text',
      label: 'Текст',
      tokens: totals.inputTextTokens + totals.outputTextTokens,
    },
    {
      key: 'audio',
      label: 'Голос',
      tokens: totals.inputAudioTokens + totals.outputAudioTokens,
    },
    {
      key: 'image',
      label: 'Изображения',
      tokens: totals.inputImageTokens + totals.outputImageTokens,
    },
  ]
}

export function getReportCurrency(report: AiUsageReport): string | undefined {
  return getUsageCurrency(report.breakdown)
}

export function getUsageCurrency(
  breakdown: readonly AiUsageBreakdown[],
): string | undefined {
  const currencies = new Set(
    breakdown.map((item) => item.currency.toUpperCase()),
  )
  if (currencies.size === 0) return 'USD'
  return currencies.size === 1 ? currencies.values().next().value : undefined
}

export function getUsageCost(
  usage: Pick<AiModelUsage, 'billedCost' | 'estimatedCost'>,
): number {
  return usage.billedCost + usage.estimatedCost
}

export function hasUsageCost(row: AiModelUsage): boolean {
  return getUsageCost(row) > 0
}

export function formatTokenCount(value: number): string {
  if (value < 1_000) return new Intl.NumberFormat('ru-RU').format(value)
  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatMoney(value: number, currency: string): string {
  const normalizedCurrency = /^[a-z]{3}$/i.test(currency)
    ? currency.toUpperCase()
    : 'USD'
  const formatter = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (value > 0 && value < 0.01) return `< ${formatter.format(0.01)}`
  return formatter.format(value)
}

export function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.round(value))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (!minutes) return `${remainder} сек`
  if (!remainder) return `${minutes} мин`
  return `${minutes} мин ${remainder} сек`
}

export function usageOperationLabel(operation: string): string {
  const labels: Record<string, string> = {
    responses: 'Текст',
    response: 'Текст',
    web_search: 'Web search',
    knowledge_search: 'Knowledge search',
    realtime_response: 'Голосовой ответ',
    voice_response: 'Голосовой ответ',
    realtime_text_input: 'Текстовые команды Voice',
    speech: 'Озвучивание текста',
    transcription: 'Транскрипция',
    input_transcription: 'Входная транскрипция',
    output_transcription: 'Выходная транскрипция',
    case_router: 'Маршрутизация',
    case_aggregator: 'Агрегация',
  }
  return labels[operation] ?? operation.replaceAll(/[_-]+/g, ' ')
}

export function pluralizeRu(
  value: number,
  one: string,
  few: string,
  many: string,
): string {
  const absolute = Math.abs(value)
  const lastTwo = absolute % 100
  const last = absolute % 10
  if (last === 1 && lastTwo !== 11) return one
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few
  return many
}
