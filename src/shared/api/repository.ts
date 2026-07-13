import type { LolaRepository } from './repository/contracts'
import { apiRepository } from './repository/api-repository'
import { mockRepository } from './repository/mock-repository'
import { isMockMode } from '@/shared/config/data-mode'

export type { LolaRepository, RepositoryCapabilities } from './repository/contracts'
export { UnsupportedRepositoryCapabilityError } from './repository/contracts'

export const repository: LolaRepository = isMockMode ? mockRepository : apiRepository
