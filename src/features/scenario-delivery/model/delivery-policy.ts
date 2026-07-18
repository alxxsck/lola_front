import type { PublishScenarioDtoDeliveryPolicy } from '@/shared/api/repository/scenario-authoring'

export type DeliveryPolicyKind = PublishScenarioDtoDeliveryPolicy['kind']
export type DeliveryPolicyDraft =
  | { kind: 'IMMEDIATE' | 'SKIP_IF_OFFLINE' | 'FAIL_IF_OFFLINE' }
  | { kind: 'WAIT_UNTIL_ONLINE'; expiryMs: number; recheckEligibility: boolean }

export type DeliveryPolicyResult =
  | { ok: true; value: PublishScenarioDtoDeliveryPolicy }
  | { ok: false; issues: Array<{ code: string; message: string; field: string }> }

export function createDeliveryPolicyDraft(): DeliveryPolicyDraft {
  return { kind: 'IMMEDIATE' }
}

export function deserializeDeliveryPolicy(value: unknown): DeliveryPolicyDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createDeliveryPolicyDraft()
  const source = value as Record<string, unknown>
  if (source.kind === 'WAIT_UNTIL_ONLINE'
    && typeof source.expiryMs === 'number'
    && Number.isInteger(source.expiryMs)
    && typeof source.recheckEligibility === 'boolean') {
    return { kind: source.kind, expiryMs: source.expiryMs, recheckEligibility: source.recheckEligibility }
  }
  if (source.kind === 'IMMEDIATE' || source.kind === 'SKIP_IF_OFFLINE' || source.kind === 'FAIL_IF_OFFLINE') {
    return { kind: source.kind }
  }
  return createDeliveryPolicyDraft()
}

export function serializeDeliveryPolicy(draft: DeliveryPolicyDraft): DeliveryPolicyResult {
  if (draft.kind !== 'WAIT_UNTIL_ONLINE') return { ok: true, value: { kind: draft.kind } }
  if (!Number.isInteger(draft.expiryMs) || draft.expiryMs < 1_000 || draft.expiryMs > 7 * 86_400_000) {
    return { ok: false, issues: [{ code: 'expiry-invalid', field: 'expiryMs', message: 'Срок ожидания появления в сети должен быть от 1 секунды до 7 дней.' }] }
  }
  return { ok: true, value: { kind: draft.kind, expiryMs: draft.expiryMs, recheckEligibility: draft.recheckEligibility } }
}

export function deliveryPolicySummary(draft: DeliveryPolicyDraft): string {
  if (draft.kind === 'IMMEDIATE') return 'Выполнить сразу, даже если пользователь не в сети'
  if (draft.kind === 'SKIP_IF_OFFLINE') return 'Пропустить действие, если пользователь не в сети'
  if (draft.kind === 'FAIL_IF_OFFLINE') return 'Завершить действие ошибкой, если пользователь не в сети'
  const wait = draft as Extract<DeliveryPolicyDraft, { kind: 'WAIT_UNTIL_ONLINE' }>
  return `Ждать появления в сети не дольше ${formatDuration(wait.expiryMs)}${wait.recheckEligibility ? ' и повторно проверить условия' : ''}`
}

function formatDuration(milliseconds: number): string {
  let seconds = Math.floor(milliseconds / 1_000)
  const parts: string[] = []
  const units = [{ size: 86_400, label: 'дн.' }, { size: 3_600, label: 'ч.' }, { size: 60, label: 'мин.' }]
  for (const unit of units) {
    const amount = Math.floor(seconds / unit.size)
    if (amount) parts.push(`${amount} ${unit.label}`)
    seconds %= unit.size
  }
  if (seconds || !parts.length) parts.push(`${seconds} сек.`)
  return parts.join(' ')
}
