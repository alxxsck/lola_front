import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTheme, setTheme, THEME_STORAGE_KEY, useTheme } from './theme'

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  it('restores the saved dark theme on the document root', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    const theme = initializeTheme()

    expect({
      theme,
      hasDarkClass: document.documentElement.classList.contains('lola-dark'),
      colorScheme: document.documentElement.style.colorScheme,
    }).toEqual({ theme: 'dark', hasDarkClass: true, colorScheme: 'dark' })
  })

  it('applies and persists a manual theme choice', () => {
    setTheme('dark')

    expect({
      storedTheme: localStorage.getItem(THEME_STORAGE_KEY),
      hasDarkClass: document.documentElement.classList.contains('lola-dark'),
      colorScheme: document.documentElement.style.colorScheme,
    }).toEqual({ storedTheme: 'dark', hasDarkClass: true, colorScheme: 'dark' })
  })

  it('follows system theme changes until the user chooses a theme', () => {
    let onChange: ((event: MediaQueryListEvent) => void) | undefined
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => { onChange = listener },
      removeEventListener: vi.fn(),
    }))
    initializeTheme()

    onChange?.({ matches: true } as MediaQueryListEvent)

    expect({
      hasDarkClass: document.documentElement.classList.contains('lola-dark'),
      colorScheme: document.documentElement.style.colorScheme,
    }).toEqual({ hasDarkClass: true, colorScheme: 'dark' })
  })

  it('keeps a manual choice when the system theme changes afterwards', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const mediaQuery = {
      matches: false,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery))
    initializeTheme()
    setTheme('dark')

    listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent))

    expect({
      storedTheme: localStorage.getItem(THEME_STORAGE_KEY),
      hasDarkClass: document.documentElement.classList.contains('lola-dark'),
    }).toEqual({ storedTheme: 'dark', hasDarkClass: true })
  })

  it('exposes the active theme to Vue consumers', () => {
    const theme = useTheme()
    initializeTheme()

    setTheme('dark')

    expect(theme.value).toBe('dark')
  })

  it('falls back to the system theme when storage access is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    vi.mocked(matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)

    expect(() => initializeTheme()).not.toThrow()
    expect(document.documentElement.classList.contains('lola-dark')).toBe(true)
  })

  it('still applies a manual theme when storage persistence is denied', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })

    expect(() => setTheme('dark')).not.toThrow()
    expect(document.documentElement.classList.contains('lola-dark')).toBe(true)
  })
})
