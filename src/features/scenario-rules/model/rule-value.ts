export function cloneRuleValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneRuleValue) as T
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneRuleValue(item)])) as T
}
