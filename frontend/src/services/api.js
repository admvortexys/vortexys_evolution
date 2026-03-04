import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// Injeta token em toda requisição
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('vrx_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Redireciona para login em 401 (exceto na própria rota de login)
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/login')) {
      localStorage.removeItem('vrx_token')
      localStorage.removeItem('vrx_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
