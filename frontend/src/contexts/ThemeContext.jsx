/**
 * Tema white-label: nome, cores, logo.
 * Busca de GET /api/settings/theme ao carregar. applyTheme define --primary, --grad etc.
 * refreshTheme(data?) — se data, aplica direto; senão faz fetch.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ENV = {
  primary:   import.meta.env.VITE_PRIMARY_COLOR   || '#a855f7',
  secondary: import.meta.env.VITE_SECONDARY_COLOR || '#f97316',
  company:   import.meta.env.VITE_COMPANY_NAME    || 'Vortexys',
  logoUrl:   import.meta.env.VITE_LOGO_URL        || '',
}

const ThemeCtx = createContext({
  primary: ENV.primary,
  secondary: ENV.secondary,
  company: ENV.company,
  logoUrl: ENV.logoUrl,
  refreshTheme: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState({
    primary: ENV.primary,
    secondary: ENV.secondary,
    company: ENV.company,
    logoUrl: ENV.logoUrl,
  })

  const applyTheme = useCallback((t) => {
    const p = t?.primary_color || t?.primary   || ENV.primary
    const s = t?.secondary_color || t?.secondary || ENV.secondary
    const r = document.documentElement
    r.style.setProperty('--primary',       p)
    r.style.setProperty('--primary-light', p + 'cc')
    r.style.setProperty('--secondary',     s)
    r.style.setProperty('--grad',          `linear-gradient(135deg, ${p}, ${s})`)
    r.style.setProperty('--grad-subtle',   `linear-gradient(135deg, ${p}26, ${s}14)`)
    r.style.setProperty('--shadow-glow',   `0 0 32px ${p}33`)
    setTheme({
      primary: p,
      secondary: s,
      company: t?.company_name ?? ENV.company,
      logoUrl: t?.logo_url ?? ENV.logoUrl,
    })
  }, [])

  const refreshTheme = useCallback(async (dataOverride) => {
    if (dataOverride) {
      applyTheme(dataOverride)
      return
    }
    try {
      const base = import.meta.env.VITE_API_URL || '/api'
      const apiBase = base.startsWith('http') ? base.replace(/\/$/, '') + '/api' : base
      const res = await fetch(`${apiBase}/settings/theme`)
      if (res.ok) {
        const data = await res.json()
        applyTheme(data)
      }
    } catch {}
  }, [applyTheme])

  useEffect(() => {
    applyTheme({ primary: ENV.primary, secondary: ENV.secondary, company_name: ENV.company, logo_url: ENV.logoUrl })
  }, [applyTheme])

  useEffect(() => {
    refreshTheme()
  }, [refreshTheme])

  return (
    <ThemeCtx.Provider value={{ ...theme, refreshTheme }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)

// Compatibilidade: exports estáticos (usados antes do primeiro fetch)
export const COMPANY  = ENV.company
export const LOGO_URL = ENV.logoUrl
