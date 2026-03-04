import { createContext, useContext, useEffect } from 'react'

const primary   = import.meta.env.VITE_PRIMARY_COLOR   || '#a855f7'
const secondary = import.meta.env.VITE_SECONDARY_COLOR || '#f97316'

export const COMPANY  = import.meta.env.VITE_COMPANY_NAME || 'Vortexys'
export const LOGO_URL = import.meta.env.VITE_LOGO_URL     || ''

const ThemeCtx = createContext({ primary, secondary })

export function ThemeProvider({ children }) {
  useEffect(() => {
    const r = document.documentElement
    r.style.setProperty('--primary',       primary)
    r.style.setProperty('--primary-light', primary + 'cc')
    r.style.setProperty('--secondary',     secondary)
    r.style.setProperty('--grad',
      `linear-gradient(135deg, ${primary}, ${secondary})`)
    r.style.setProperty('--grad-subtle',
      `linear-gradient(135deg, ${primary}26, ${secondary}14)`)
    r.style.setProperty('--shadow-glow',   `0 0 32px ${primary}33`)
  }, [])

  return (
    <ThemeCtx.Provider value={{ primary, secondary }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)
