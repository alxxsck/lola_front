import { describe, expect, it } from 'vitest';
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationDescriptionLabel,
  aiOperationOutcomeLabel,
  aiOperationSourceLabel,
  aiOperationStatusPresentation,
  aiOperationTitleLabel,
} from './project-ai-operation-presentation';

describe('project AI operation presentation', () => {
  it('uses explicit actor roles instead of inferring them from nullable IDs', () => {
    expect(
      aiOperationActorLabel({
        type: 'CMS_USER',
        id: 'admin-1',
        displayName: 'Анна',
      }),
    ).toBe('Анна');
    expect(aiOperationActorLabel({ type: 'SYSTEM' })).toBe('Система Retenive');
    expect(aiOperationActorLabel({ type: 'END_USER', id: 'user-1' })).toBe('Пользователь user-1');
  });

  it('keeps cost ownership distinct from data participation', () => {
    expect(aiOperationChargedAccountLabel('PROJECT_BUDGET')).toBe('Бюджет проекта');
    expect(aiOperationChargedAccountLabel('END_USER_ALLOWANCE')).toBe('AI-лимит пользователя');
  });

  it('formats stable status, category and monetary labels', () => {
    expect(aiOperationStatusPresentation('FAILED')).toEqual({
      label: 'Ошибка',
      severity: 'danger',
    });
    expect(aiOperationCategoryLabel('AI_ANALYSIS')).toBe('AI-анализ');
    expect(aiOperationCategoryLabel('CMS_AGENT')).toBe('AI-агент CMS');
    expect(aiOperationCostLabel('0.0245')).toContain('$0.0245');
  });

  it('turns known technical operation labels into readable Russian copy', () => {
    expect(aiOperationTitleLabel('User memory extraction', 'MEMORY')).toBe(
      'Извлечение фактов из диалога',
    );
    expect(aiOperationSourceLabel('CONVERSATION_TURN')).toBe('Ответ в диалоге');
    expect(aiOperationOutcomeLabel('COMPLETED')).toBe('Выполнено');
    expect(aiOperationDescriptionLabel('Ответить с bounded data access в read-only режиме')).toBe(
      'Ответить с ограниченным доступом к данным в режиме только для чтения',
    );
  });
});
