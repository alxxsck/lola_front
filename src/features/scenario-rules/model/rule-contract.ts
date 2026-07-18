export const RULE_LIMITS = {
  maxDepth: 4,
  maxLeaves: 50,
  maxAggregateLeaves: 10,
  maxNodes: 100,
  maxGroupChildren: 20,
  maxFilters: 10,
  maxLiteralArrayItems: 100,
  maxLiteralStringLength: 10_000,
  maxWindowMs: 90 * 86_400_000,
  maxTotalWindowMs: 365 * 86_400_000,
  maxStreakDays: 365,
} as const
