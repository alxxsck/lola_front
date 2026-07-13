import type { RepositoryMode } from '@/shared/api/repository/contracts'

// Production-safe default: demo data is available only when explicitly requested.
export const dataMode: RepositoryMode = import.meta.env.VITE_DATA_MODE === 'mock' ? 'mock' : 'api'

export const isMockMode = dataMode === 'mock'
