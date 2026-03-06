import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useState } from 'react'
import {
  LayoutDashboard, Package, RefreshCw, ShoppingCart, Users,
  Trophy, Target, MessageCircle, DollarSign, Settings,
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronExpand,
  LogOut, Zap,
  FileText, BarChart3, Calendar, RotateCcw, Wrench
} from 'lucide-react'

const NAV_GROUPS = [
  { label: 'Principal', items: [
    { to:'/',          key:'dashboard', Icon:LayoutDashboard, label:'Dashboard'     },
  ]},
  { label: 'Vendas', items: [
    { to:'/products',  key:'products',  Icon:Package,         label:'Produtos'      },
    { to:'/stock',     key:'stock',     Icon:RefreshCw,       label:'Estoque'       },
    { to:'/orders',    key:'orders',    Icon:ShoppingCart,    label:'Pedidos'       },
    { to:'/returns',   key:'orders',    Icon:RotateCcw,       label:'Devoluções'    },
  ]},
  { label: 'Pessoas', items: [
    { to:'/clients',   key:'clients',   Icon:Users,           label:'Clientes'      },
    { to:'/sellers',   key:'sellers',   Icon:Trophy,          label:'Vendedores'    },
  ]},
  { label: 'CRM', items: [
    { to:'/crm',       key:'crm',       Icon:Target,          label:'CRM'           },
    { to:'/proposals', key:'crm',       Icon:FileText,        label:'Propostas'     },
    { to:'/calendar',  key:'crm',       Icon:Calendar,        label:'Agenda'        },
  ]},
  { label: 'Serviços', items: [
    { to:'/service-orders', key:'crm', Icon:Wrench,          label:'Assistência'   },
  ]},
  { label: 'Comunicação', items: [
    { to:'/whatsapp',  key:'whatsapp',  Icon:MessageCircle,   label:'WhatsApp'      },
  ]},
  { label: 'Financeiro', items: [
    { to:'/financial', key:'financial', Icon:DollarSign,      label:'Financeiro'    },
  ]},
  { label: 'Sistema', items: [
    { to:'/settings',  key:'settings',  Icon:Settings,        label:'Configurações' },
  ]},
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
  const { company, logoUrl } = useTheme()
  const navigate          = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState(() =>
    Object.fromEntries(NAV_GROUPS.map(g => [g.label, false]))
  )

  const toggleGroup = (label) => setExpandedGroups(p => ({ ...p, [label]: !p[label] }))

  const perms = user?.permissions || {}
  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(n => user?.role === 'admin' || !!perms[n.key]),
  })).filter(g => g.items.length > 0)
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
          {logoUrl ? (
            <img src={logoUrl} alt={company} style={{ height:32, objectFit:'contain', maxWidth: collapsed ? 32 : 140 }}/>
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
                  {company}
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
          {visibleGroups.map(({ label: groupLabel, items }) => {
            const isExpanded = expandedGroups[groupLabel] !== false
            return (
              <div key={groupLabel} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {collapsed ? (
                  items.map(({ to, Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      title={label}
                      style={({ isActive }) => ({
                        display:'flex', alignItems:'center', justifyContent:'center',
                        padding:'10px 0', borderRadius:'var(--radius-sm)',
                        fontSize:'.875rem', fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#fff' : 'var(--muted)',
                        background: isActive ? 'rgba(168,85,247,.18)' : 'transparent',
                        transition:'all .15s', textDecoration:'none',
                      })}
                    >
                      {({ isActive }) => (
                        <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? 'var(--primary-light)' : 'var(--muted)'} style={{ flexShrink:0 }}/>
                      )}
                    </NavLink>
                  ))
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupLabel)}
                      style={{
                        display:'flex', alignItems:'center', gap:8, width:'100%',
                        padding:'8px 12px', borderRadius:'var(--radius-sm)',
                        background:'transparent', border:'none',
                        color:'var(--muted)', fontSize:'.65rem', fontWeight:700,
                        textTransform:'uppercase', letterSpacing:'.1em',
                        cursor:'pointer', textAlign:'left', transition:'all .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      {isExpanded ? <ChevronDown size={12} style={{ flexShrink:0 }}/> : <ChevronExpand size={12} style={{ flexShrink:0 }}/>}
                      {groupLabel}
                    </button>
                    {isExpanded && items.map(({ to, Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        style={({ isActive }) => ({
                          display:'flex', alignItems:'center',
                          gap:10, padding:'9px 12px 9px 28px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize:'.875rem', fontWeight: isActive ? 600 : 500,
                          color: isActive ? '#fff' : 'var(--muted)',
                          background: isActive ? 'rgba(168,85,247,.18)' : 'transparent',
                          borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                          transition:'all .15s', whiteSpace:'nowrap', overflow:'hidden',
                          textDecoration:'none',
                        })}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? 'var(--primary-light)' : 'var(--muted)'} style={{ flexShrink:0 }}/>
                            {label}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </>
                )}
              </div>
            )
          })}
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
