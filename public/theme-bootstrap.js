/* global window */
(() => {
  let theme = 'light'
  try {
    let storedTheme = window.localStorage.getItem('retenive-theme')
    if (storedTheme !== 'light' && storedTheme !== 'dark') {
      const legacyTheme = window.localStorage.getItem('lola-theme')
      if (legacyTheme === 'light' || legacyTheme === 'dark') {
        storedTheme = legacyTheme
        window.localStorage.setItem('retenive-theme', legacyTheme)
      }
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    theme = storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark) ? 'dark' : 'light'
  } catch {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  window.document.documentElement.classList.toggle('retenive-dark', theme === 'dark')
  window.document.documentElement.style.colorScheme = theme
})()
