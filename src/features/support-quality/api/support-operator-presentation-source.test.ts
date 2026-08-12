import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  supportPresentationsCatalogOperators,
  supportPresentationsResolveOperators,
} from '@/shared/api/generated/retenive-backend';
import { supportOperatorPresentationApiSource } from './support-operator-presentation-source';

vi.mock('@/shared/api/generated/retenive-backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/generated/retenive-backend')>()),
  supportPresentationsCatalogOperators: vi.fn(),
  supportPresentationsResolveOperators: vi.fn(),
}));

describe('supportOperatorPresentationApiSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a searchable catalog with a hard limit of one hundred', async () => {
    const controller = new AbortController();
    vi.mocked(supportPresentationsCatalogOperators).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await supportOperatorPresentationApiSource.catalog(
      'project-1',
      '  Марина  ',
      'cursor-1',
      controller.signal,
    );

    expect(supportPresentationsCatalogOperators).toHaveBeenCalledWith(
      'project-1',
      { limit: 100, search: 'Марина', cursor: 'cursor-1' },
      { signal: controller.signal },
    );
  });

  it('deduplicates and bounds presentation resolution', async () => {
    vi.mocked(supportPresentationsResolveOperators).mockResolvedValue({ items: [] });
    const cmsUserIds = [
      'operator-1',
      'operator-1',
      ...Array.from({ length: 120 }, (_, index) => `operator-${index + 2}`),
    ];

    await supportOperatorPresentationApiSource.resolve('project-1', cmsUserIds);

    const request = vi.mocked(supportPresentationsResolveOperators).mock.calls[0]![1];
    expect(request.cmsUserIds).toHaveLength(100);
    expect(new Set(request.cmsUserIds).size).toBe(100);
    expect(request.cmsUserIds[0]).toBe('operator-1');
  });

  it('does not call the backend for an empty resolution', async () => {
    await expect(supportOperatorPresentationApiSource.resolve('project-1', [])).resolves.toEqual({
      items: [],
    });
    expect(supportPresentationsResolveOperators).not.toHaveBeenCalled();
  });
});
