import { createContext, useContext, useState } from 'react'
import api from '../services/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vrx_user') || 'null') } catch { return null }
  })

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('vrx_token', data.token)
    localStorage.setItem('vrx_user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* ignora falha de rede */ }
    localStorage.removeItem('vrx_token')
    localStorage.removeItem('vrx_user')
    setUser(null)
  }

  return <AuthCtx.Provider value={{ user, setUser, login, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
