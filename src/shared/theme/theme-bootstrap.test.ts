/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTheme, THEME_STORAGE_KEY } from './theme'

const bootstrapSource = readFileSync(`${process.cwd()}/public/theme-bootstrap.js`, 'utf8')

describe('theme bootstrap', () => {
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

  it('applies a saved theme synchronously before the app starts', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    window.eval(bootstrapSource)

    expect({
      hasDarkClass: document.documentElement.classList.contains('lola-dark'),
      colorScheme: document.documentElement.style.colorScheme,
    }).toEqual({ hasDarkClass: true, colorScheme: 'dark' })
  })

  it.each([
    { storedTheme: 'dark', systemDark: false, expected: 'dark' },
    { storedTheme: 'light', systemDark: true, expected: 'light' },
    { storedTheme: null, systemDark: true, expected: 'dark' },
  ])('stays in parity with runtime initialization', ({ storedTheme, systemDark, expected }) => {
    if (storedTheme) localStorage.setItem(THEME_STORAGE_KEY, storedTheme)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: systemDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    window.eval(bootstrapSource)
    const bootstrapTheme = document.documentElement.classList.contains('lola-dark') ? 'dark' : 'light'
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''

    const runtimeTheme = initializeTheme()

    expect({ bootstrapTheme, runtimeTheme }).toEqual({ bootstrapTheme: expected, runtimeTheme: expected })
  })
})
