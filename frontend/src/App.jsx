import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
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

function Protected({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.force_password_change) return <Navigate to="/change-password" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<Protected><Layout /></Protected>}>
              <Route index                 element={<Dashboard />} />
              <Route path="products"       element={<Products />} />
              <Route path="orders"         element={<Orders />} />
              <Route path="clients"        element={<Clients />} />
              <Route path="sellers"        element={<Sellers />} />
              <Route path="crm"            element={<CRM />} />
              <Route path="whatsapp"       element={<WhatsApp />} />
              <Route path="financial"      element={<Financial />} />
              <Route path="stock"          element={<Stock />} />
              <Route path="settings"       element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
