import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import { eventPolicyConflictState, projectPolicyConflictState } from './event-query-conflict';

describe('event query concurrency conflict', () => {
  it('extracts the current Project state from a 409 response', () => {
    const current = {
      concurrencyToken: 'eq-project-v1.current',
      configured: { masterEnabled: true },
      effective: { masterEnabled: true },
      diagnostics: [],
    };

    expect(projectPolicyConflictState(new ApiError(409, 'Conflict', { current }))).toEqual(current);
  });

  it('extracts the current Event state from a 409 response', () => {
    const current = {
      concurrencyToken: 'eq-item-v1.current',
      configured: {
        enabled: true,
        endUserConversationEnabled: false,
        configuration: {},
      },
      definitionKeyId: 'definition-1',
      diagnostics: [],
      effective: { internalAi: true, endUserConversation: false },
      eventCode: 'deposit.completed',
      lifecycle: 'ACTIVE',
      lifecycleRestrictions: {
        canApply: true,
        canEnable: true,
        readOnly: false,
        reasons: [],
      },
    };

    expect(eventPolicyConflictState(new ApiError(409, 'Conflict', { current }))).toEqual(current);
  });
});
