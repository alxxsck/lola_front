export type EmailActionKind = 'initial-access' | 'verification' | 'email-change' | 'password-reset'
export type EmailIdentityActionKind = Exclude<EmailActionKind, 'password-reset'>

const capabilities = new Map<EmailActionKind, string>()

export function captureEmailActionCapability(action: EmailActionKind, fragment: string): void {
  const token = new URLSearchParams(fragment.replace(/^#/u, '')).get('token')
  if (token) capabilities.set(action, token)
  else capabilities.delete(action)

  if (window.location.hash) {
    const sanitized = `${window.location.pathname}${window.location.search}`
    window.history.replaceState(window.history.state, '', sanitized)
  }
}

export function takeEmailActionCapability(action: EmailActionKind): string | null {
  const token = capabilities.get(action) ?? null
  capabilities.delete(action)
  return token
}

export function peekEmailActionCapability(action: EmailActionKind): string | null {
  return capabilities.get(action) ?? null
}

export function hasEmailActionCapability(action: EmailActionKind): boolean {
  return capabilities.has(action)
}

export function clearEmailActionCapability(action: EmailActionKind): void {
  capabilities.delete(action)
}
