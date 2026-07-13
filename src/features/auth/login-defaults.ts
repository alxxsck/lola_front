import type { RepositoryMode } from '@/shared/api/repository/contracts'

export function loginDefaults(mode: RepositoryMode) {
  return mode === 'mock'
    ? { login: 'admin@lola.ai', password: 'demo-owner' }
    : { login: '', password: '' }
}
