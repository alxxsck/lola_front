import { readonly, ref } from 'vue'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'lola-theme'

const activeTheme = ref<Theme>('light')
let systemThemeQuery: MediaQueryList | null = null
let systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark'
}

function resolveThemePreference(): { theme: Theme; mediaQuery: MediaQueryList | null } {
  let storedTheme: string | null = null
  try {
    storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Storage can be denied by browser privacy policy; system preference remains usable.
  }
  if (isTheme(storedTheme)) return { theme: storedTheme, mediaQuery: null }
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  return { theme: mediaQuery?.matches ? 'dark' : 'light', mediaQuery }
}

export function resolveInitialTheme(): Theme {
  return resolveThemePreference().theme
}

export function applyTheme(theme: Theme): void {
  activeTheme.value = theme
  document.documentElement.classList.toggle('lola-dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

function stopFollowingSystemTheme(): void {
  if (systemThemeQuery && systemThemeListener) {
    systemThemeQuery.removeEventListener('change', systemThemeListener)
  }
  systemThemeQuery = null
  systemThemeListener = null
}

export function initializeTheme(): Theme {
  stopFollowingSystemTheme()
  const { theme, mediaQuery } = resolveThemePreference()
  applyTheme(theme)
  if (mediaQuery) {
    systemThemeQuery = mediaQuery
    systemThemeListener = (event) => applyTheme(event.matches ? 'dark' : 'light')
    systemThemeQuery.addEventListener('change', systemThemeListener)
  }
  return theme
}

export function setTheme(theme: Theme): void {
  stopFollowingSystemTheme()
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Applying the in-memory theme must not depend on persistent storage access.
  }
  applyTheme(theme)
}

export function useTheme() {
  return readonly(activeTheme)
}
