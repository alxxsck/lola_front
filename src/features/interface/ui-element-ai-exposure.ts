import type { UpdateUiElement } from '@/shared/api/repository/contracts'
import type { UiElement } from '@/shared/types/domain'
import type { InterfaceSection } from './ui-action-integration'

export interface UiElementAiExposureDraft {
  code: string
  kind: InterfaceSection
  selector: string
  route: string
  modalName: string
  enabled: boolean
  aiEnabled: boolean
  aiDescription: string
  aiAliasesText: string
  aiAuditReason: string
}

export function aiAliases(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ]
}

export function aiTargetBound(draft: UiElementAiExposureDraft): boolean {
  if (draft.kind === 'PAGE') return Boolean(draft.route.trim())
  if (draft.kind === 'MODAL') return Boolean(draft.modalName.trim())
  return Boolean(draft.selector.trim())
}

export function aiExposureChanged(
  current: UiElement | null,
  draft: UiElementAiExposureDraft,
): boolean {
  if (!current) return draft.aiEnabled
  return (
    draft.aiEnabled !== current.aiEnabled ||
    draft.aiDescription.trim() !== (current.aiDescription ?? '') ||
    JSON.stringify(aiAliases(draft.aiAliasesText)) !==
      JSON.stringify(current.aiAliases)
  )
}

export function requiresUiElementAiAuditReason(
  current: UiElement | null,
  draft: UiElementAiExposureDraft,
): boolean {
  return (
    draft.aiEnabled &&
    (!current?.aiEnabled ||
      aiExposureChanged(current, draft) ||
      aiEffectChanged(current, draft))
  )
}

export function validateUiElementAiExposure(
  current: UiElement | null,
  draft: UiElementAiExposureDraft,
  canManageAi: boolean,
): string[] {
  const issues: string[] = []
  const exposureChanged = aiExposureChanged(current, draft)
  if (exposureChanged && !canManageAi)
    issues.push('Разрешать Lola новые элементы может только владелец проекта.')
  if (draft.aiEnabled && !draft.enabled)
    issues.push('Сначала включите элемент, а затем разрешите его Lola.')
  if (draft.aiEnabled && !aiTargetBound(draft))
    issues.push(
      'Сначала заполните адрес страницы, имя окна или признак элемента и включите его.',
    )
  const descriptionLength = draft.aiDescription.trim().length
  if (draft.aiEnabled && (descriptionLength < 20 || descriptionLength > 1000)) {
    issues.push('Описание для Lola должно содержать от 20 до 1000 символов.')
  }
  const aliases = aiAliases(draft.aiAliasesText)
  if (aliases.length > 20 || aliases.some((alias) => alias.length > 100)) {
    issues.push(
      'Можно указать не более 20 дополнительных названий длиной до 100 символов.',
    )
  }
  const auditReasonLength = draft.aiAuditReason.trim().length
  if (
    requiresUiElementAiAuditReason(current, draft) &&
    (auditReasonLength < 10 || auditReasonLength > 500)
  ) {
    issues.push('Объясните, зачем Lola нужен доступ: от 10 до 500 символов.')
  }
  return issues
}

export function toUiElementAiExposureUpdate(
  current: UiElement,
  draft: UiElementAiExposureDraft,
  canManageAi: boolean,
): UpdateUiElement {
  const exposureChanged = aiExposureChanged(current, draft)
  const auditRequired = requiresUiElementAiAuditReason(current, draft)
  if (!canManageAi || (!exposureChanged && !auditRequired)) return {}
  return {
    ...(exposureChanged
      ? {
          aiEnabled: draft.aiEnabled,
          aiDescription: draft.aiDescription.trim() || null,
          aiAliases: aiAliases(draft.aiAliasesText),
        }
      : {}),
    ...(auditRequired ? { auditReason: draft.aiAuditReason.trim() } : {}),
  }
}

function aiEffectChanged(
  current: UiElement,
  draft: UiElementAiExposureDraft,
): boolean {
  const currentKind = current.kind === 'BUTTON' ? 'ELEMENT' : current.kind
  return (
    draft.code.trim() !== current.code ||
    draft.kind !== currentKind ||
    draft.selector.trim() !== (current.selector ?? '') ||
    draft.route.trim() !== (current.route ?? '') ||
    draft.modalName.trim() !== (current.modalName ?? '') ||
    draft.enabled !== current.enabled
  )
}
