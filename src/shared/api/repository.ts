import type { ReteniveRepository } from './repository/contracts'
import { apiRepository } from './repository/api-repository'
import { mockRepository } from './repository/mock-repository'
import { isMockMode } from '@/shared/config/data-mode'

export type { ReteniveRepository, RepositoryCapabilities } from './repository/contracts'
export { UnsupportedRepositoryCapabilityError } from './repository/contracts'

export const repository: ReteniveRepository = isMockMode ? mockRepository : apiRepository
