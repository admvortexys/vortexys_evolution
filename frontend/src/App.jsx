/**
 * App principal: providers (Theme, Auth, Toast), rotas e layout.
 * Rotas públicas: login, change-password, portal OS.
 * Rotas protegidas: layout com sidebar + conteúdo por módulo.
 * SmartRedirect: na raiz, redireciona para Dashboard ou primeiro módulo permitido.
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import Layout         from './components/Layout'
import Login          from './pages/Login'
import ChangePassword from './pages/ChangePassword'
const Dashboard = lazy(() => import('./pages/Dashboard'))
import Products       from './pages/Products'
import Orders         from './pages/Orders'
import Clients        from './pages/Clients'
import Fornecedores   from './pages/Fornecedores'
import CRM            from './pages/CRM'
import WhatsApp       from './pages/WhatsApp'
import Stock          from './pages/Stock'
import Credits        from './pages/Credits'
import ClientCredits  from './pages/ClientCredits'
import Returns        from './pages/Returns'
import Settings       from './pages/Settings'
import Sellers        from './pages/Sellers'
import CalendarPage   from './pages/Calendar'
import ServiceOrders  from './pages/ServiceOrders'
import Financial      from './pages/Financial'
import CashFlowProjection from './pages/CashFlowProjection'
import OsPortal        from './pages/OsPortal'
import PDV             from './pages/PDV'

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
  { path: '/pdv',       key: 'orders'    },
  { path: '/orders',    key: 'orders'    },
  { path: '/credits',        key: 'orders'  },
  { path: '/client-credits', key: 'orders' },
  { path: '/returns',   key: 'orders'    },
  { path: '/clients',      key: 'clients' },
  { path: '/fornecedores', key: 'clients' },
  { path: '/sellers',   key: 'sellers'   },
  { path: '/crm',       key: 'crm'       },
  { path: '/calendar',  key: 'crm'       },
  { path: '/service-orders', key: 'crm' },
  { path: '/whatsapp',  key: 'whatsapp'  },
  { path: '/settings',  key: 'settings'  },
]

function SmartRedirect() {
  const { user } = useAuth()
  if (user?.role === 'admin') return <Suspense fallback={<div style={{ display:'flex', justifyContent:'center', padding:80, color:'var(--muted)' }}>Carregando...</div>}><Dashboard /></Suspense>
  const perms = user?.permissions || {}
  if (perms.dashboard) return <Suspense fallback={<div style={{ display:'flex', justifyContent:'center', padding:80, color:'var(--muted)' }}>Carregando...</div>}><Dashboard /></Suspense>
  const first = ROUTE_ORDER.find(r => r.key !== 'dashboard' && perms[r.key])
  if (first) return <Navigate to={first.path} replace />
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:56, gap:16 }}>
      <p style={{ color:'var(--muted)', fontSize:'.9rem' }}>Nenhum módulo disponível. Solicite acesso ao administrador.</p>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/os/:number"      element={<OsPortal />} />
            <Route path="/login"           element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index                 element={<SmartRedirect />} />
              <Route path="products"       element={<Products />} />
              <Route path="pdv"            element={<PDV />} />
              <Route path="orders"         element={<Orders />} />
              <Route path="credits"        element={<Credits />} />
              <Route path="client-credits" element={<ClientCredits />} />
              <Route path="returns"        element={<Returns />} />
              <Route path="clients"        element={<Clients />} />
              <Route path="fornecedores"   element={<Fornecedores />} />
              <Route path="sellers"        element={<Sellers />} />
              <Route path="crm"            element={<CRM />} />
              <Route path="reports"        element={<Navigate to="/?tab=crm" replace />} />
              <Route path="proposals"       element={<Navigate to="/crm" replace />} />
              <Route path="calendar"       element={<CalendarPage />} />
              <Route path="service-orders" element={<ServiceOrders />} />
              <Route path="financial"       element={<Financial />} />
              <Route path="financial/fluxo-caixa" element={<CashFlowProjection />} />
              <Route path="whatsapp"       element={<WhatsApp />} />
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
