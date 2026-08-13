import { describe, expect, it } from 'vitest';
import {
  defaultEndUserCaseFilters,
  endUserCaseListParams,
  endUserCaseStatusesForPreset,
  isEndUserCaseRealtimeEvent,
  isTerminalEndUserCase,
} from './end-user-case';

describe('End User Case model', () => {
  it('maps presets and bounded filters to the backend query contract', () => {
    expect(endUserCaseStatusesForPreset('ACTIVE')).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'WAITING_END_USER',
      'WAITING_SYSTEM',
      'WAITING_ADMIN',
    ]);
    expect(
      endUserCaseListParams(
        {
          ...defaultEndUserCaseFilters(),
          preset: 'ATTENTION',
          priority: ['CRITICAL', 'URGENT'],
          groupCode: 'PAYMENTS',
          assignment: 'UNASSIGNED',
          channel: ['VOICE', 'CMS'],
          aiCapabilityCode: 'check_deposit',
          aiCapabilityOutcome: ['COMPLETED', 'FAILED'],
          recontacted: 'YES',
          degraded: 'YES',
        },
        'signed-cursor',
      ),
    ).toEqual({
      status: ['OPEN', 'IN_PROGRESS', 'WAITING_END_USER', 'WAITING_SYSTEM', 'WAITING_ADMIN'],
      adminAttention: 'OPEN',
      priority: ['CRITICAL', 'URGENT'],
      groupCode: 'PAYMENTS',
      assignment: 'UNASSIGNED',
      channel: ['VOICE', 'CMS'],
      aiCapabilityCode: 'check_deposit',
      aiCapabilityOutcome: ['COMPLETED', 'FAILED'],
      recontacted: 'YES',
      degraded: 'YES',
      sort: 'ATTENTION_FIRST',
      cursor: 'signed-cursor',
      limit: 30,
    });
  });

  it('rejects malformed realtime envelopes', () => {
    expect(
      isEndUserCaseRealtimeEvent({
        type: 'end_user_case.updated',
        contractVersion: 1,
        eventId: 'event-1',
        projectSequence: '8',
        data: { case: { id: 'case-1', version: 2 } },
      }),
    ).toBe(true);
    expect(
      isEndUserCaseRealtimeEvent({
        type: 'end_user_case.updated',
        contractVersion: 2,
        eventId: 'event-1',
      }),
    ).toBe(false);
  });

  it('maps every preset and optional filter without leaking empty values', () => {
    expect(endUserCaseStatusesForPreset('WAITING')).toEqual([
      'WAITING_END_USER',
      'WAITING_SYSTEM',
      'WAITING_ADMIN',
    ]);
    expect(endUserCaseStatusesForPreset('RESOLVED')).toEqual([
      'RESOLVED',
      'UNRESOLVED',
      'CANCELLED',
    ]);
    expect(endUserCaseStatusesForPreset('ALL')).toBeUndefined();
    expect(
      endUserCaseListParams({
        preset: 'ALL',
        sort: 'PRIORITY',
        status: ['OPEN'],
        impact: ['HIGH'],
        urgency: ['IMMEDIATE'],
        resolutionAssessment: ['INCONCLUSIVE'],
        resolutionSource: ['TRUSTED_VERIFICATION'],
        endUserId: 'user-1',
        assignedCmsUserId: 'admin-1',
        primaryLanguage: 'ru',
        adminAttention: 'NONE',
        cmsParticipation: 'YES',
        reopened: 'YES',
        stale: 'NO',
        createdFrom: '2026-07-01T00:00:00Z',
        createdTo: '2026-07-02T00:00:00Z',
        lastActivityFrom: '2026-07-03T00:00:00Z',
        lastActivityTo: '2026-07-04T00:00:00Z',
      }),
    ).toEqual({
      status: ['OPEN'],
      impact: ['HIGH'],
      urgency: ['IMMEDIATE'],
      resolutionAssessment: ['INCONCLUSIVE'],
      resolutionSource: ['TRUSTED_VERIFICATION'],
      endUserId: 'user-1',
      assignedCmsUserId: 'admin-1',
      primaryLanguage: 'ru',
      adminAttention: 'NONE',
      cmsParticipation: 'YES',
      reopened: 'YES',
      stale: 'NO',
      createdFrom: '2026-07-01T00:00:00Z',
      createdTo: '2026-07-02T00:00:00Z',
      lastActivityFrom: '2026-07-03T00:00:00Z',
      lastActivityTo: '2026-07-04T00:00:00Z',
      sort: 'PRIORITY',
      limit: 30,
    });
    expect(
      endUserCaseListParams({
        preset: 'ALL',
        sort: 'LAST_ACTIVITY',
        priority: [],
        channel: [],
        aiCapabilityOutcome: [],
      }),
    ).toEqual({ sort: 'LAST_ACTIVITY', limit: 30 });
  });

  it('accepts only the two exact realtime payload shapes', () => {
    expect(
      isEndUserCaseRealtimeEvent({
        type: 'end_user_case.summary',
        contractVersion: 1,
        eventId: 'event-summary',
        projectSequence: '9',
        data: { lastProjectSequence: '9', openCount: 3 },
      }),
    ).toBe(true);
    for (const value of [
      null,
      [],
      { contractVersion: 1, eventId: 3, projectSequence: '1', data: {} },
      {
        type: 'end_user_case.summary',
        contractVersion: 1,
        eventId: 'event',
        projectSequence: '1',
        data: null,
      },
      {
        type: 'end_user_case.summary',
        contractVersion: 1,
        eventId: 'event',
        projectSequence: '1',
        data: { lastProjectSequence: 1, openCount: '3' },
      },
      {
        type: 'future',
        contractVersion: 1,
        eventId: 'event',
        projectSequence: '1',
        data: {},
      },
      {
        type: 'end_user_case.created',
        contractVersion: 1,
        eventId: 'event',
        projectSequence: '1',
        data: { case: [] },
      },
      {
        type: 'end_user_case.updated',
        contractVersion: 1,
        eventId: 'event',
        projectSequence: '1',
        data: { case: { id: 1, version: '2' } },
      },
    ]) {
      expect(isEndUserCaseRealtimeEvent(value)).toBe(false);
    }
  });

  it('recognizes only terminal workflow states', () => {
    expect(isTerminalEndUserCase('RESOLVED')).toBe(true);
    expect(isTerminalEndUserCase('UNRESOLVED')).toBe(true);
    expect(isTerminalEndUserCase('CANCELLED')).toBe(true);
    expect(isTerminalEndUserCase('WAITING_END_USER')).toBe(false);
  });
});
