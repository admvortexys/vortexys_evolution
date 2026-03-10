/**
 * Contexto de autenticacao: user, loading, login, logout e refresh do perfil.
 * A sessao fica em cookies HttpOnly; o frontend so mantem o usuario em memoria.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../services/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
      return data
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (window.location.pathname.startsWith('/os/')) {
      setLoading(false)
      return
    }
    refreshUser()
  }, [refreshUser])

  const login = async (identifier, password) => {
    const { data } = await api.post('/auth/login', { login: identifier, password })
    setUser(data.user)
    setLoading(false)
    return data
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    setUser(null)
    setLoading(false)
  }

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)

