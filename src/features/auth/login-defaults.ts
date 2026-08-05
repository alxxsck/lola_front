import type { RepositoryMode } from '@/shared/api/repository/contracts'

export function loginDefaults(mode: RepositoryMode) {
  return mode === 'mock'
    ? { login: 'admin@retenive.ai', password: 'demo-owner' }
    : { login: '', password: '' }
}
