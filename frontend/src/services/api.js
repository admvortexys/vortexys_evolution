/**
 * Cliente HTTP (Axios) para a API.
 * Sessao usa cookies HttpOnly; em 401 tenta refresh e repete a request.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  withCredentials: true,
})

let isRedirecting = false
let refreshPromise = null

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config || {}
    const url = original.url || ''
    const status = err.response?.status

    if (
      status === 401 &&
      !original._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      original._retry = true
      try {
        if (!refreshPromise) refreshPromise = api.post('/auth/refresh')
        await refreshPromise
        return api(original)
      } catch (refreshErr) {
        const isPublicOsRoute = window.location.pathname.startsWith('/os/')
        const isBootstrapRequest = url.includes('/auth/me')
        if (!isBootstrapRequest && !isPublicOsRoute && !isRedirecting && window.location.pathname !== '/login') {
          isRedirecting = true
          window.location.href = '/login'
        }
        return Promise.reject(refreshErr)
      } finally {
        refreshPromise = null
      }
    }

    return Promise.reject(err)
  }
)

export default api

