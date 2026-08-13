import { describe, expect, it } from 'vitest';
import {
  readSupportSearchRoute,
  normalizeSupportSearchState,
  hasSupportSearchCriteria,
  writeSupportSearchRoute,
} from './support-search-route';

describe('support search route', () => {
  it('normalizes shareable search, filters and sort from an untrusted URL', () => {
    const state = readSupportSearchRoute({
      search: '  возврат   платежа  ',
      scope: 'cases',
      status: 'OPEN,WAITING_ADMIN,UNKNOWN,OPEN',
      priority: 'HIGH,CRITICAL',
      assignment: 'UNASSIGNED',
      unread: 'UNREAD',
      sort: 'SLA_DUE_AT',
      direction: 'ASC',
      cursor: 'must-not-be-shareable',
    });

    expect(state).toEqual({
      phrase: '',
      scope: 'CASES',
      filters: {
        statuses: ['OPEN', 'WAITING_ADMIN'],
        priorities: ['HIGH', 'CRITICAL'],
        assignmentStates: ['UNASSIGNED'],
        unreadState: 'UNREAD',
      },
      sort: { field: 'SLA_DUE_AT', direction: 'ASC' },
    });
    expect(writeSupportSearchRoute(state)).toEqual({
      scope: 'cases',
      status: 'OPEN,WAITING_ADMIN',
      priority: 'HIGH,CRITICAL',
      assignment: 'UNASSIGNED',
      unread: 'UNREAD',
      sort: 'SLA_DUE_AT',
      direction: 'ASC',
    });
  });

  it('drops Case-only filters and invalid relevance sort outside the Case scope', () => {
    expect(
      readSupportSearchRoute({
        search: 'deposit',
        scope: 'messages',
        status: 'OPEN',
        priority: 'HIGH',
        sort: 'SLA_DUE_AT',
        direction: 'ASC',
      }),
    ).toEqual({
      phrase: '',
      scope: 'MESSAGES',
      filters: {},
      sort: { field: 'RELEVANCE', direction: 'ASC' },
    });
  });

  it('drops unsupported End User sorting', () => {
    expect(
      readSupportSearchRoute({
        scope: 'users',
        sort: 'ACTIVITY_AT',
        direction: 'ASC',
      }).sort,
    ).toEqual({ field: 'RELEVANCE', direction: 'ASC' });
  });

  it('keeps free text local while normalizing it for the server', () => {
    const unsafe = {
      phrase: '  возврат   платежа  ',
      scope: 'CASES' as const,
      filters: {},
      sort: { field: 'RELEVANCE' as const, direction: 'DESC' as const },
    };
    expect(writeSupportSearchRoute(unsafe)).not.toHaveProperty('search');
    expect(normalizeSupportSearchState(unsafe).phrase).toBe('возврат платежа');
  });

  it('keeps exact external identities local and makes content sort executable', () => {
    const state = {
      phrase: '',
      scope: 'MESSAGES' as const,
      filters: { externalEndUserIds: ['  customer-17  '] },
      sort: { field: 'ACTIVITY_AT' as const, direction: 'DESC' as const },
    };

    expect(writeSupportSearchRoute(state)).not.toHaveProperty('externalEndUserId');
    expect(normalizeSupportSearchState(state).filters.externalEndUserIds).toEqual(['customer-17']);
    expect(hasSupportSearchCriteria(state)).toBe(true);
  });

  it('publishes a complete time range and rejects half-open or unknown closed filters', () => {
    expect(
      readSupportSearchRoute({
        scope: 'cases',
        from: '2026-08-01T00:00:00.000Z',
        category: 'UNKNOWN',
        sla: 'NOT_APPLICABLE',
        channel: 'WEB',
      }).filters,
    ).toEqual({});
    expect(
      readSupportSearchRoute({
        scope: 'cases',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-08T00:00:00.000Z',
        category: 'PROBLEM_RESOLUTION',
        sla: 'NOT_CONFIGURED',
        channel: 'TEXT',
      }).filters,
    ).toMatchObject({
      timeRange: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-08T00:00:00.000Z',
      },
      categoryCodes: ['PROBLEM_RESOLUTION'],
      slaStates: ['NOT_CONFIGURED'],
      channels: ['TEXT'],
    });
  });
});
