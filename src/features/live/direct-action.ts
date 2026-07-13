import type { DirectAdminAction, DirectAdminActionType } from '@/shared/types/domain'

export interface DirectActionInput {
  type: string
  label: string
  action: string
  target: string
  animation: string
}

export interface IdempotencyAttempt { fingerprint: string; key: string }

export function resolveIdempotencyAttempt(
  fingerprint: string,
  current: IdempotencyAttempt | null,
  createKey: () => string = () => globalThis.crypto.randomUUID(),
): IdempotencyAttempt {
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: createKey() }
}

export function buildDirectActions(input: DirectActionInput): DirectAdminAction[] | undefined {
  if (input.type === 'ANIMATION') {
    return [{ type: 'PLAY_ANIMATION', config: { animation: input.animation } }]
  }
  if (input.type === 'BUTTON') {
    if (!['OPEN_PAGE', 'OPEN_MODAL'].includes(input.action)) return undefined
    const action = input.action === 'OPEN_MODAL' ? 'open_modal' : 'open_page'
    const targetKey = action === 'open_modal' ? 'modalId' : 'pageId'
    return [{ type: 'SHOW_CTA', config: { label: input.label.trim(), action, [targetKey]: input.target } }]
  }
  if (input.type === 'COMMAND') {
    const type = input.action as DirectAdminActionType
    const targetKey = type === 'OPEN_MODAL' ? 'modalId' : type === 'OPEN_PAGE' ? 'pageId' : 'target'
    return [{ type, config: { [targetKey]: input.target } }]
  }
  return undefined
}
