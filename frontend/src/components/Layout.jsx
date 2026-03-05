import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { COMPANY, LOGO_URL } from '../contexts/ThemeContext'
import { useState } from 'react'
import {
  LayoutDashboard, Package, RefreshCw, ShoppingCart, Users,
  Trophy, Target, MessageCircle, DollarSign, Settings,
  ChevronLeft, ChevronRight, LogOut, Zap,
  FileText, BarChart3, Calendar, RotateCcw
} from 'lucide-react'

const ALL_NAV = [
  { to:'/',          key:'dashboard', Icon:LayoutDashboard, label:'Dashboard'     },
  { to:'/products',  key:'products',  Icon:Package,         label:'Produtos'      },
  { to:'/stock',     key:'stock',     Icon:RefreshCw,       label:'Estoque'       },
  { to:'/orders',    key:'orders',    Icon:ShoppingCart,    label:'Pedidos'       },
  { to:'/returns',   key:'orders',    Icon:RotateCcw,       label:'Devoluções'    },
  { to:'/clients',   key:'clients',   Icon:Users,           label:'Clientes'      },
  { to:'/sellers',   key:'sellers',   Icon:Trophy,          label:'Vendedores'    },
  { to:'/crm',       key:'crm',       Icon:Target,          label:'CRM'           },
  { to:'/proposals', key:'crm',       Icon:FileText,        label:'Propostas'     },
  { to:'/reports',   key:'crm',       Icon:BarChart3,       label:'Relatórios'    },
  { to:'/calendar',  key:'crm',       Icon:Calendar,        label:'Agenda'        },
  { to:'/whatsapp',  key:'whatsapp',  Icon:MessageCircle,   label:'WhatsApp'      },
  { to:'/financial', key:'financial', Icon:DollarSign,      label:'Financeiro'    },
  { to:'/settings',  key:'settings',  Icon:Settings,        label:'Configurações' },
]

const sidebarStyle = (collapsed) => ({
  width: collapsed ? 'var(--sidebar-w-sm)' : 'var(--sidebar-w)',
  height: '100vh',
  position: 'sticky',
  top: 0,
  flexShrink: 0,
  background: 'var(--bg-card)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'width .22s cubic-bezier(.4,0,.2,1)',
  overflow: 'hidden',
  zIndex: 10,
})

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate          = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const perms = user?.permissions || {}
  const nav = ALL_NAV.filter(n =>
    user?.role === 'admin' || !!perms[n.key]
  )
  const handleLogout = () => { logout(); navigate('/login') }

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside style={sidebarStyle(collapsed)}>

        {/* Brand */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          minHeight: 68,
        }}>
          {LOGO_URL ? (
            <img src={LOGO_URL} alt={COMPANY} style={{ height:32, objectFit:'contain', maxWidth: collapsed ? 32 : 140 }}/>
          ) : (
            <>
              <div style={{
                width:34, height:34, borderRadius:10,
                background:'var(--grad)',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexShrink:0, boxShadow:'var(--shadow-glow)',
              }}>
                <Zap size={17} color="#fff" fill="#fff"/>
              </div>
              {!collapsed && (
                <span style={{ fontWeight:800, fontSize:'1rem', whiteSpace:'nowrap', letterSpacing:'-.02em' }}>
                  {COMPANY}
                </span>
              )}
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{
          flex:1, padding:'10px 8px',
          display:'flex', flexDirection:'column', gap:2,
          overflowY:'auto', overflowX:'hidden',
        }}>
          {nav.map(({ to, Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center',
                gap:10, padding: collapsed ? '10px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-sm)',
                fontSize:'.875rem', fontWeight: isActive ? 600 : 500,
                color: isActive ? '#fff' : 'var(--muted)',
                background: isActive ? 'rgba(168,85,247,.18)' : 'transparent',
                borderLeft: collapsed ? 'none' : (isActive ? '3px solid var(--primary)' : '3px solid transparent'),
                transition:'all .15s',
                whiteSpace:'nowrap', overflow:'hidden',
                textDecoration:'none',
                position:'relative',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    color={isActive ? 'var(--primary-light)' : 'var(--muted)'}
                    style={{ flexShrink:0 }}
                  />
                  {!collapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + collapse */}
        <div style={{
          padding:'10px 8px', borderTop:'1px solid var(--border)',
          display:'flex', flexDirection:'column', gap:6,
        }}>
          {/* User row */}
          <div style={{
            display:'flex', alignItems:'center', gap:10,
            padding: collapsed ? '6px 0' : '6px 8px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:'var(--radius-sm)',
          }}>
            <div style={{
              width:32, height:32, borderRadius:'50%',
              background:'var(--grad)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'.82rem', fontWeight:700, flexShrink:0,
              boxShadow:'0 2px 8px rgba(168,85,247,.3)',
            }}>
              {initial}
            </div>
            {!collapsed && (
              <>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'.82rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {user?.name}
                  </div>
                  <div style={{ fontSize:'.7rem', color:'var(--muted)', textTransform:'capitalize' }}>
                    {user?.role}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  style={{
                    background:'transparent', border:'none',
                    color:'var(--muted)', padding:6, cursor:'pointer',
                    borderRadius:6, display:'flex', alignItems:'center',
                    transition:'all .15s', flexShrink:0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                >
                  <LogOut size={15}/>
                </button>
              </>
            )}
          </div>

          {/* Collapse button */}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            style={{
              width: '100%',
              padding: '7px 8px',
              borderRadius:'var(--radius-sm)',
              background:'transparent', border:'1px solid var(--border)',
              color:'var(--muted)', fontSize:'.8rem', cursor:'pointer',
              display:'flex', alignItems:'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap:6,
              transition:'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            {collapsed
              ? <ChevronRight size={15} />
              : <><ChevronLeft size={15} /><span style={{ whiteSpace:'nowrap' }}>Recolher</span></>
            }
          </button>
        </div>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────────── */}
      <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {/* Content */}
        <div style={{ flex:1, overflow:'auto', padding:'28px 32px', minWidth:0 }} className="page">
          <Outlet/>
        </div>
      </main>
    </div>
  )
}
