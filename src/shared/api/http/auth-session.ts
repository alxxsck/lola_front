const PROJECT_KEY = 'lola-cms-selected-project-v1'
const TRANSLATION_JOB_PREFIX = 'lola:translation-jobs:'

let accessToken: string | null = null
let accessExpiresAt = 0

export function getAccessToken(): string | null {
  return accessToken && accessExpiresAt > Date.now() ? accessToken : null
}

export function getSelectedProjectId(): string | undefined {
  return sessionStorage.getItem(PROJECT_KEY) ?? undefined
}

export function storeAccessToken(tokens: {
  accessToken: string
  expiresIn: number
}): void {
  accessToken = tokens.accessToken
  accessExpiresAt = Date.now() + tokens.expiresIn * 1_000
}

export function storeSelectedProjectId(projectId: string): void {
  sessionStorage.setItem(PROJECT_KEY, projectId)
}

export function clearAuthSession(): void {
  accessToken = null
  accessExpiresAt = 0
  sessionStorage.removeItem(PROJECT_KEY)
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index)
    if (key?.startsWith(TRANSLATION_JOB_PREFIX)) sessionStorage.removeItem(key)
  }
}
