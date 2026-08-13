import { describe, expect, it } from 'vitest';
import {
  aiCostRouteQuery,
  parseAiCostRouteState,
  sortAiCostRows,
  type AiCostUserRow,
} from './ai-costs';

describe('AI cost route state', () => {
  it('builds exact midnight boundaries in the Project timezone across DST', () => {
    expect(
      parseAiCostRouteState(
        { period: 'custom', from: '2026-03-29', to: '2026-03-29' },
        new Date('2026-03-29T12:00:00.000Z'),
        'Europe/Madrid',
      ),
    ).toMatchObject({
      from: '2026-03-28T23:00:00.000Z',
      to: '2026-03-29T22:00:00.000Z',
    });
    expect(
      parseAiCostRouteState(
        { period: 'today' },
        new Date('2026-08-02T22:30:00.000Z'),
        'Europe/Madrid',
      ),
    ).toMatchObject({
      from: '2026-08-02T22:00:00.000Z',
      to: '2026-08-03T22:00:00.000Z',
    });
  });
  it('turns a seven-day URL preset into a half-open calendar range', () => {
    expect(
      parseAiCostRouteState(
        { period: '7d', tab: 'users', page: '2' },
        new Date('2026-08-02T12:00:00.000Z'),
      ),
    ).toMatchObject({
      tab: 'users',
      period: '7d',
      from: '2026-07-27T00:00:00.000Z',
      to: '2026-08-03T00:00:00.000Z',
      page: 2,
    });
  });

  it('round-trips the scoped allowance user and cursor without mixing cost pagination', () => {
    const state = parseAiCostRouteState({
      tab: 'journal',
      allowanceUser: 'user-1',
      allowanceCursor: '33333333-3333-4333-8333-333333333333',
    });
    expect(aiCostRouteQuery(state)).toMatchObject({
      tab: 'journal',
      allowanceUser: 'user-1',
      allowanceCursor: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('keeps custom inclusive dates in the URL and sends an exclusive upper bound', () => {
    expect(
      parseAiCostRouteState({
        period: 'custom',
        from: '2026-07-01',
        to: '2026-07-31',
      }),
    ).toMatchObject({
      period: 'custom',
      customFrom: '2026-07-01',
      customTo: '2026-07-31',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
  });

  it('accepts at most 366 inclusive calendar days', () => {
    expect(
      parseAiCostRouteState({
        period: 'custom',
        from: '2025-01-01',
        to: '2026-01-01',
      }),
    ).toMatchObject({
      period: 'custom',
      customFrom: '2025-01-01',
      customTo: '2026-01-01',
    });
    expect(
      parseAiCostRouteState({
        period: 'custom',
        from: '2025-01-01',
        to: '2026-01-02',
      }),
    ).toMatchObject({ period: '7d', customFrom: '', customTo: '' });
  });
});

describe('AI cost row sorting', () => {
  it('keeps unpriced rows last in both cost directions', () => {
    const base = {
      records: 1,
      unpricedRecords: 1,
      providerReportedCostUsd: null,
      estimatedFallbackCostUsd: null,
      effectiveCostUsd: null,
      pricedCostRecords: 0,
    } as const;
    const priced = {
      ...base,
      endUserId: 'priced',
      externalId: 'priced',
      segment: null,
      providerReportedCostUsd: '1' as const,
      effectiveCostUsd: '1' as const,
      pricedCostRecords: 1,
    };
    const unpriced = {
      ...base,
      endUserId: 'unpriced',
      externalId: 'unpriced',
      segment: null,
    };
    expect(sortAiCostRows([unpriced, priced], 'effectiveCostUsd', 'asc').at(-1)?.endUserId).toBe(
      'unpriced',
    );
    expect(sortAiCostRows([unpriced, priced], 'effectiveCostUsd', 'desc').at(-1)?.endUserId).toBe(
      'unpriced',
    );
  });
  it('sorts exact costs beyond Number precision without coercion', () => {
    const rows: AiCostUserRow[] = [
      {
        endUserId: 'low',
        externalId: 'low',
        segment: null,
        records: 1,
        unpricedRecords: 0,
        providerReportedCostUsd: '9007199254740992.000000000001',
        estimatedFallbackCostUsd: '0',
        effectiveCostUsd: '9007199254740992.000000000001',
        pricedCostRecords: 1,
      },
      {
        endUserId: 'high',
        externalId: 'high',
        segment: 'vip',
        records: 1,
        unpricedRecords: 0,
        providerReportedCostUsd: '9007199254740993.000000000001',
        estimatedFallbackCostUsd: '0',
        effectiveCostUsd: '9007199254740993.000000000001',
        pricedCostRecords: 1,
      },
    ];

    expect(sortAiCostRows(rows, 'effectiveCostUsd', 'desc')[0]?.endUserId).toBe('high');
  });
});
