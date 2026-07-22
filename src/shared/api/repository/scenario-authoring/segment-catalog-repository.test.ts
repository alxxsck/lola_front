import { beforeEach, describe, expect, it, vi } from 'vitest'
import { segmentCatalogCatalog } from '@/shared/api/generated/lola-backend'
import { segmentCatalogRepository } from './segment-catalog-repository'

vi.mock('@/shared/api/generated/lola-backend', () => ({ segmentCatalogCatalog: vi.fn() }))

describe('segment-owned catalog repository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads segment authoring fields without requiring scenario read authority', async () => {
    vi.mocked(segmentCatalogCatalog).mockResolvedValue({ audience: { revision: 'audience-1' } } as never)

    await expect(segmentCatalogRepository.get('project-1')).resolves.toEqual({
      revision: 'audience-1',
    })
    expect(segmentCatalogCatalog).toHaveBeenCalledWith('project-1')
  })
})
