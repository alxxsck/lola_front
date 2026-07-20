import { describe, expect, it } from 'vitest'
import type { UiElement } from '@/shared/types/domain'
import {
  aiAliases,
  aiExposureChanged,
  aiTargetBound,
  requiresUiElementAiAuditReason,
  toUiElementAiExposureUpdate,
  validateUiElementAiExposure,
} from './ui-element-ai-exposure'

const current: UiElement = {
  id: 'ui-1',
  projectId: 'project-1',
  code: 'bonuses',
  name: 'Бонусы',
  kind: 'PAGE',
  route: '/bonuses',
  config: {},
  enabled: true,
  aiEnabled: false,
  aiDescription: null,
  aiAliases: [],
}

const draft = {
  code: 'bonuses',
  kind: 'PAGE' as const,
  selector: '',
  route: '/bonuses',
  modalName: '',
  enabled: true,
  aiEnabled: true,
  aiDescription: 'Страница с доступными пользователю бонусами.',
  aiAliasesText: ' награды, rewards, награды ',
  aiAuditReason: 'Разрешаем безопасный переход к бонусам',
}

describe('UiElement AI exposure policy', () => {
  it('normalizes aliases and derives binding from the target kind', () => {
    expect(aiAliases(draft.aiAliasesText)).toEqual(['награды', 'rewards'])
    expect(aiTargetBound(draft)).toBe(true)
    expect(aiTargetBound({ ...draft, route: '' })).toBe(false)
  })

  it('requires audited OWNER authority only while AI remains enabled and exposure broadens', () => {
    expect(aiExposureChanged(current, draft)).toBe(true)
    expect(requiresUiElementAiAuditReason(current, draft)).toBe(true)
    expect(
      requiresUiElementAiAuditReason(
        {
          ...current,
          aiEnabled: true,
          aiDescription: draft.aiDescription,
          aiAliases: ['награды', 'rewards'],
        },
        draft,
      ),
    ).toBe(false)
    expect(
      requiresUiElementAiAuditReason(
        { ...current, aiEnabled: true },
        { ...draft, aiEnabled: false },
      ),
    ).toBe(false)
  })

  it('validates role, binding, description, aliases and audit reason before serialization', () => {
    expect(
      validateUiElementAiExposure(
        current,
        {
          ...draft,
          route: '',
          aiDescription: 'short',
          aiAliasesText: 'x'.repeat(101),
          aiAuditReason: 'short',
        },
        false,
      ),
    ).toEqual([
      'Разрешать Lola новые элементы может только владелец проекта.',
      'Сначала заполните адрес страницы, имя окна или признак элемента и включите его.',
      'Описание для Lola должно содержать от 20 до 1000 символов.',
      'Можно указать не более 20 дополнительных названий длиной до 100 символов.',
      'Объясните, зачем Lola нужен доступ: от 10 до 500 символов.',
    ])
    expect(validateUiElementAiExposure(current, draft, true)).toEqual([])
    expect(toUiElementAiExposureUpdate(current, draft, true)).toEqual({
      aiEnabled: true,
      aiDescription: draft.aiDescription,
      aiAliases: ['награды', 'rewards'],
      auditReason: draft.aiAuditReason,
    })

    const exposed = {
      ...current,
      aiEnabled: true,
      aiDescription: draft.aiDescription,
      aiAliases: ['награды', 'rewards'],
    }
    expect(
      toUiElementAiExposureUpdate(
        exposed,
        { ...draft, route: '/rewards' },
        true,
      ),
    ).toEqual({
      auditReason: draft.aiAuditReason,
    })
  })
})
