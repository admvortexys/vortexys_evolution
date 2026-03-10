/**
 * App principal: providers (Theme, Auth, Toast), rotas e layout.
 * Rotas publicas: login, troca de senha e portal da OS.
 * Rotas protegidas: layout com sidebar + conteudo por modulo.
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
const Dashboard = lazy(() => import('./pages/Dashboard'))
import Products from './pages/Products'
import Orders from './pages/Orders'
import Clients from './pages/Clients'
import Fornecedores from './pages/Fornecedores'
import CRM from './pages/CRM'
import WhatsApp from './pages/WhatsApp'
import Stock from './pages/Stock'
import ClientCredits from './pages/ClientCredits'
import Returns from './pages/Returns'
import Settings from './pages/Settings'
import Sellers from './pages/Sellers'
import CalendarPage from './pages/Calendar'
import ServiceOrders from './pages/ServiceOrders'
import Financial from './pages/Financial'
import CashFlowProjection from './pages/CashFlowProjection'
import OsPortal from './pages/OsPortal'
import PDV from './pages/PDV'

const ROUTE_ORDER = [
  { path: '/', key: 'dashboard' },
  { path: '/pdv', key: 'pdv' },
  { path: '/products', key: 'products' },
  { path: '/stock', key: 'stock' },
  { path: '/orders', key: 'orders' },
  { path: '/returns', key: 'returns' },
  { path: '/client-credits', key: 'client_credits' },
  { path: '/clients', key: 'clients' },
  { path: '/fornecedores', key: 'suppliers' },
  { path: '/sellers', key: 'sellers' },
  { path: '/crm', key: 'crm' },
  { path: '/calendar', key: 'calendar' },
  { path: '/service-orders', key: 'service_orders' },
  { path: '/financial', key: 'financial' },
  { path: '/financial/fluxo-caixa', key: 'cash_flow_projection' },
  { path: '/whatsapp', key: 'whatsapp' },
  { path: '/settings', key: 'settings' },
]

function hasModuleAccess(user, permission) {
  if (user?.role === 'admin') return true
  const permissions = Array.isArray(permission) ? permission : [permission]
  const perms = user?.permissions || {}
  return permissions.some(key => !!perms[key])
}

function LoadingFallback() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 80, color: 'var(--muted)' }}>Carregando...</div>
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingFallback />
  if (!user) return <Navigate to="/login" replace />
  if (user.force_password_change) return <Navigate to="/change-password" replace />
  return children
}

function RequireModule({ permission, children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingFallback />
  if (!hasModuleAccess(user, permission)) return <Navigate to="/" replace />
  return children
}

function SmartRedirect() {
  const { user } = useAuth()
  if (hasModuleAccess(user, 'dashboard')) {
    return <Suspense fallback={<LoadingFallback />}><Dashboard /></Suspense>
  }
  const first = ROUTE_ORDER.find(route => route.key !== 'dashboard' && hasModuleAccess(user, route.key))
  if (first) return <Navigate to={first.path} replace />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 56, gap: 16 }}>
      <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Nenhum modulo disponivel. Solicite acesso ao administrador.</p>
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
              <Route path="/os/:number" element={<OsPortal />} />
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/" element={<Protected><Layout /></Protected>}>
                <Route index element={<SmartRedirect />} />
                <Route path="products" element={<RequireModule permission="products"><Products /></RequireModule>} />
                <Route path="pdv" element={<RequireModule permission="pdv"><PDV /></RequireModule>} />
                <Route path="orders" element={<RequireModule permission="orders"><Orders /></RequireModule>} />
                <Route path="credits" element={<RequireModule permission="client_credits"><Navigate to="/client-credits" replace /></RequireModule>} />
                <Route path="client-credits" element={<RequireModule permission="client_credits"><ClientCredits /></RequireModule>} />
                <Route path="returns" element={<RequireModule permission="returns"><Returns /></RequireModule>} />
                <Route path="clients" element={<RequireModule permission="clients"><Clients /></RequireModule>} />
                <Route path="fornecedores" element={<RequireModule permission="suppliers"><Fornecedores /></RequireModule>} />
                <Route path="sellers" element={<RequireModule permission="sellers"><Sellers /></RequireModule>} />
                <Route path="crm" element={<RequireModule permission="crm"><CRM /></RequireModule>} />
                <Route path="reports" element={<RequireModule permission="crm"><Navigate to="/?tab=crm" replace /></RequireModule>} />
                <Route path="proposals" element={<RequireModule permission="crm"><Navigate to="/crm" replace /></RequireModule>} />
                <Route path="calendar" element={<RequireModule permission="calendar"><CalendarPage /></RequireModule>} />
                <Route path="service-orders" element={<RequireModule permission="service_orders"><ServiceOrders /></RequireModule>} />
                <Route path="financial" element={<RequireModule permission="financial"><Financial /></RequireModule>} />
                <Route path="financial/fluxo-caixa" element={<RequireModule permission="cash_flow_projection"><CashFlowProjection /></RequireModule>} />
                <Route path="whatsapp" element={<RequireModule permission="whatsapp"><WhatsApp /></RequireModule>} />
                <Route path="stock" element={<RequireModule permission="stock"><Stock /></RequireModule>} />
                <Route path="settings" element={<RequireModule permission="settings"><Settings /></RequireModule>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
