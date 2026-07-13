const SESSION_KEY = 'lola-cms-auth-v1'

interface StoredAuthSession {
  refreshToken: string
  refreshExpiresAt: number
  projectId?: string
}

let accessToken: string | null = null
let accessExpiresAt = 0

function readStoredSession(): StoredAuthSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Partial<StoredAuthSession>
    if (typeof value.refreshToken !== 'string' || typeof value.refreshExpiresAt !== 'number') throw new Error()
    if (value.refreshExpiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return value as StoredAuthSession
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function getAccessToken(): string | null {
  return accessToken && accessExpiresAt > Date.now() ? accessToken : null
}

export function getRefreshToken(): string | null {
  return readStoredSession()?.refreshToken ?? null
}

export function getSelectedProjectId(): string | undefined {
  return readStoredSession()?.projectId
}

export function storeTokens(tokens: {
  accessToken: string
  expiresIn: number
  refreshToken: string
  refreshExpiresIn: number
}): void {
  const current = readStoredSession()
  accessToken = tokens.accessToken
  accessExpiresAt = Date.now() + tokens.expiresIn * 1_000
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: Date.now() + tokens.refreshExpiresIn * 1_000,
    ...(current?.projectId ? { projectId: current.projectId } : {}),
  } satisfies StoredAuthSession))
}

export function storeSelectedProjectId(projectId: string): void {
  const session = readStoredSession()
  if (!session) return
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, projectId }))
}

export function clearAuthSession(): void {
  accessToken = null
  accessExpiresAt = 0
  sessionStorage.removeItem(SESSION_KEY)
}
