// Light/dark theme, persisted in localStorage and applied as a data-theme
// attribute on <html> (the CSS defines variables for both). Defaults to dark.

import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'openbao-gui.theme'

export function applyStoredTheme() {
  const t = (localStorage.getItem(KEY) as Theme) || 'dark'
  document.documentElement.setAttribute('data-theme', t)
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(KEY) as Theme) || 'dark',
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(KEY, theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}
