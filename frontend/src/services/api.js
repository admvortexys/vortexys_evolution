import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('vrx_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

let isRedirecting = false

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/login') && !isRedirecting) {
      isRedirecting = true
      localStorage.removeItem('vrx_token')
      localStorage.removeItem('vrx_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
