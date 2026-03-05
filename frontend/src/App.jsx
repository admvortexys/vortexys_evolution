import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import Layout         from './components/Layout'
import Login          from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard      from './pages/Dashboard'
import Products       from './pages/Products'
import Orders         from './pages/Orders'
import Clients        from './pages/Clients'
import CRM            from './pages/CRM'
import WhatsApp       from './pages/WhatsApp'
import Financial      from './pages/Financial'
import Stock          from './pages/Stock'
import Settings       from './pages/Settings'
import Sellers        from './pages/Sellers'
import Proposals      from './pages/Proposals'
import Reports        from './pages/Reports'
import CalendarPage   from './pages/Calendar'

function Protected({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.force_password_change) return <Navigate to="/change-password" replace />
  return children
}

const ROUTE_ORDER = [
  { path: '/',          key: 'dashboard' },
  { path: '/products',  key: 'products'  },
  { path: '/stock',     key: 'stock'     },
  { path: '/orders',    key: 'orders'    },
  { path: '/clients',   key: 'clients'   },
  { path: '/sellers',   key: 'sellers'   },
  { path: '/crm',       key: 'crm'       },
  { path: '/proposals', key: 'crm'       },
  { path: '/reports',   key: 'crm'       },
  { path: '/calendar',  key: 'crm'       },
  { path: '/whatsapp',  key: 'whatsapp'  },
  { path: '/financial', key: 'financial' },
  { path: '/settings',  key: 'settings'  },
]

function SmartRedirect() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <Dashboard />
  const perms = user?.permissions || {}
  if (perms.dashboard) return <Dashboard />
  const first = ROUTE_ORDER.find(r => r.key !== 'dashboard' && perms[r.key])
  if (first) return <Navigate to={first.path} replace />
  return <Dashboard />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index                 element={<SmartRedirect />} />
              <Route path="products"       element={<Products />} />
              <Route path="orders"         element={<Orders />} />
              <Route path="clients"        element={<Clients />} />
              <Route path="sellers"        element={<Sellers />} />
              <Route path="crm"            element={<CRM />} />
              <Route path="proposals"      element={<Proposals />} />
              <Route path="reports"        element={<Reports />} />
              <Route path="calendar"       element={<CalendarPage />} />
              <Route path="whatsapp"       element={<WhatsApp />} />
              <Route path="financial"      element={<Financial />} />
              <Route path="stock"          element={<Stock />} />
              <Route path="settings"       element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
