import type { ConditionCatalogResponseDto } from '@/shared/api/generated/models'
import { segmentCatalogCatalog } from '@/shared/api/generated/lola-backend'
import { normalizeApiError } from '@/shared/api/http/api-error'

export const segmentCatalogRepository = {
  async get(projectId: string): Promise<NonNullable<ConditionCatalogResponseDto['audience']>> {
    try {
      const catalog: ConditionCatalogResponseDto = await segmentCatalogCatalog(projectId)
      if (!catalog.audience) throw new Error('Segment catalog has no audience definition')
      return catalog.audience
    } catch (cause) {
      throw normalizeApiError(cause)
    }
  },
}
