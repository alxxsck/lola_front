/* global window */
(() => {
  let theme = 'light'
  try {
    const storedTheme = window.localStorage.getItem('lola-theme')
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    theme = storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark) ? 'dark' : 'light'
  } catch {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  window.document.documentElement.classList.toggle('lola-dark', theme === 'dark')
  window.document.documentElement.style.colorScheme = theme
})()
