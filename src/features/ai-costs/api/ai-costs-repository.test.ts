import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axiosInstance } from '@/shared/api/http/axios-instance';

vi.mock('@/shared/api/http/axios-instance', () => ({
  axiosInstance: { get: vi.fn() },
}));

import { aiCostsRepository } from './ai-costs-repository';

const range = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-02T00:00:00.000Z',
};

const costs = {
  providerReportedCostUsd: '0.100000000001',
  estimatedFallbackCostUsd: '0.020000000002',
  effectiveCostUsd: '0.120000000003',
  pricedCostRecords: 3,
};
const projection = {
  status: 'FRESH',
  timezone: 'Europe/Madrid',
  asOf: '2026-08-02T00:00:00.000Z',
  lastReconciledAt: '2026-08-02T00:00:00.000Z',
  sourceRecords: '4',
  projectedRecords: '4',
  rebuildGeneration: '1',
  driftDetected: false,
};

describe('aiCostsRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and validates all three Project-scoped read models', async () => {
    vi.mocked(axiosInstance.get)
      .mockResolvedValueOnce({
        data: {
          range,
          timezone: 'Europe/Madrid',
          projection,
          totals: costs,
          completeness: {
            totalRecords: 4,
            providerReportedRecords: 2,
            estimatedRecords: 1,
            unpricedRecords: 1,
            pricedPercent: '75.00',
          },
          categories: [{ category: 'CHAT', records: 4, ...costs }],
          daily: [{ day: '2026-08-01', records: 4, ...costs }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          range,
          projection,
          items: [
            {
              endUserId: 'user-1',
              externalId: 'external-1',
              segment: 'vip',
              records: 3,
              unpricedRecords: 1,
              ...costs,
            },
          ],
          pagination: {
            limit: 25,
            offset: 0,
            hasMore: true,
            nextOffset: 25,
            truncated: false,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          range,
          projection,
          items: [
            {
              cmsUserId: 'cms-1',
              email: 'operator@example.test',
              records: 2,
              unpricedRecords: 0,
              ...costs,
            },
          ],
          pagination: {
            limit: 25,
            offset: 0,
            hasMore: false,
            nextOffset: null,
            truncated: false,
          },
        },
      });

    const [overview, users, employees] = await Promise.all([
      aiCostsRepository.overview('project-1', range),
      aiCostsRepository.users('project-1', {
        ...range,
        sort: 'effectiveCostUsd',
        direction: 'desc',
        limit: 25,
        offset: 0,
      }),
      aiCostsRepository.cmsUsers('project-1', {
        ...range,
        sort: 'identity',
        direction: 'asc',
        limit: 25,
        offset: 0,
      }),
    ]);

    expect(overview.totals.effectiveCostUsd).toBe('0.120000000003');
    expect(users.items[0]?.endUserId).toBe('user-1');
    expect(employees.items[0]?.cmsUserId).toBe('cms-1');
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/admin/projects/project-1/ai-costs/users',
      {
        params: {
          ...range,
          sort: 'effectiveCostUsd',
          direction: 'desc',
          limit: 25,
          offset: 0,
        },
      },
    );
  });

  it('rejects a response that coerces monetary values to numbers', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        range,
        timezone: 'UTC',
        projection,
        totals: { ...costs, effectiveCostUsd: 0.12 },
        completeness: {
          totalRecords: 0,
          providerReportedRecords: 0,
          estimatedRecords: 0,
          unpricedRecords: 0,
          pricedPercent: '100.00',
        },
        categories: [],
        daily: [],
      },
    });

    await expect(aiCostsRepository.overview('project-1', range)).rejects.toThrow(
      'некорректные данные',
    );
  });

  it('preserves fully unpriced nullable totals instead of presenting zero USD', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        range,
        timezone: 'Europe/Madrid',
        projection,
        totals: {
          providerReportedCostUsd: null,
          estimatedFallbackCostUsd: null,
          effectiveCostUsd: null,
          pricedCostRecords: 0,
        },
        completeness: {
          totalRecords: 1,
          providerReportedRecords: 0,
          estimatedRecords: 0,
          unpricedRecords: 1,
          pricedPercent: '0',
        },
        categories: [],
        daily: [],
      },
    });
    await expect(aiCostsRepository.overview('project-1', range)).resolves.toMatchObject({
      totals: { effectiveCostUsd: null, pricedCostRecords: 0 },
    });
  });
});
