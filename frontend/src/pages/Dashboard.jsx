import { useEffect, useState } from 'react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { KpiCard, Card, Spinner, StatusBadge, fmt } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import {
  ShoppingCart, Package, Target, TrendingUp,
  TrendingDown, Clock, CheckCircle2, AlertTriangle,
  RefreshCw
} from 'lucide-react'

export default function Dashboard() {
  const { user }  = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [error, setError] = useState(null)
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    setError(null)
    api.get('/dashboard')
      .then(r => { setData(r.data); setLastRefresh(new Date()) })
      .catch(() => setError('Erro ao carregar dashboard. Tente novamente.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return <Spinner text="Carregando dashboard..."/>

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 56, gap: 16 }}>
      <p style={{ color: 'var(--danger)', fontSize: '.9rem' }}>{error}</p>
      <button onClick={load} style={{ padding: '8px 16px', background: 'var(--grad)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
        Tentar novamente
      </button>
    </div>
  )

  const d       = data || {}
  const balance = parseFloat(d.finance?.income || 0) - parseFloat(d.finance?.expense || 0)
  const firstName = user?.name?.split(' ')[0] ?? 'usuário'

  const now   = new Date()
  const hour  = now.getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="page">

      {/* ── Greeting ──────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:'1.6rem', fontWeight:900, letterSpacing:'-.03em', marginBottom:5 }}>
            {greet}, {firstName} 👋
          </h1>
          <p style={{ color:'var(--muted)', fontSize:'.9rem' }}>
            Aqui está o resumo do mês atual
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display:'flex', alignItems:'center', gap:7, padding:'8px 14px',
            background:'var(--bg-card2)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-sm)', color:'var(--muted)',
            fontSize:'.8rem', cursor:'pointer', transition:'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='var(--border-strong)'; e.currentTarget.style.color='var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}
        >
          <RefreshCw size={13}/>
          Atualizar
        </button>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))', gap:16, marginBottom:24 }}>
        <KpiCard
          icon={ShoppingCart}
          label="Receita do mês"
          value={fmt.brl(d.orders?.revenue)}
          sub={`${d.orders?.total || 0} pedidos no mês`}
          color="#a855f7"
        />
        <KpiCard
          icon={Package}
          label="Produtos ativos"
          value={fmt.num(d.products?.total)}
          sub={`${d.products?.low_stock || 0} com estoque baixo`}
          color="#6366f1"
        />
        <KpiCard
          icon={Target}
          label="Leads em aberto"
          value={fmt.num(d.leads?.open)}
          sub={`${d.leads?.won || 0} ganhos no mês`}
          color="#f59e0b"
        />
        <KpiCard
          icon={balance >= 0 ? TrendingUp : TrendingDown}
          label="Saldo do mês"
          value={fmt.brl(balance)}
          sub={`A receber: ${fmt.brl(d.finance?.income_pending)}`}
          color={balance >= 0 ? '#22c55e' : '#ef4444'}
        />
      </div>

      {/* ── Grids ──────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:16 }}>

        {/* Últimos pedidos */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <ShoppingCart size={16} color="var(--primary-light)"/>
            <h3 style={{ fontWeight:700, fontSize:'.95rem' }}>Últimos pedidos</h3>
          </div>
          {(d.recentOrders || []).length === 0 ? (
            <p style={{ color:'var(--muted)', fontSize:'.85rem', padding:'20px 0' }}>
              Nenhum pedido ainda
            </p>
          ) : (d.recentOrders || []).map(o => (
            <div key={o.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'11px 0', borderBottom:'1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.875rem' }}>{o.number}</div>
                <div style={{ color:'var(--muted)', fontSize:'.78rem', marginTop:2 }}>
                  {o.client_name || '—'}
                </div>
              </div>
              <div style={{ textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                <span style={{ fontWeight:700, fontSize:'.875rem' }}>{fmt.brl(o.total)}</span>
                <StatusBadge status={o.status}/>
              </div>
            </div>
          ))}
        </Card>

        {/* Estoque baixo */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <AlertTriangle size={16} color="var(--warning)"/>
            <h3 style={{ fontWeight:700, fontSize:'.95rem' }}>Estoque baixo</h3>
          </div>
          {(d.lowStock || []).length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'20px 0', gap:8 }}>
              <CheckCircle2 size={28} color="var(--success)" strokeWidth={1.5}/>
              <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Tudo em ordem!</p>
            </div>
          ) : (d.lowStock || []).map(p => (
            <div key={p.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'11px 0', borderBottom:'1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.875rem' }}>{p.name}</div>
                <div style={{ color:'var(--muted)', fontSize:'.78rem', marginTop:2 }}>SKU: {p.sku}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700, color:'var(--danger)', fontSize:'.875rem' }}>
                  {fmt.num(p.stock_quantity)} {p.unit}
                </div>
                <div style={{ color:'var(--muted)', fontSize:'.73rem', marginTop:2 }}>
                  mín: {fmt.num(p.min_stock)}
                </div>
              </div>
            </div>
          ))}
        </Card>

        {/* Financeiro */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <TrendingUp size={16} color="var(--success)"/>
            <h3 style={{ fontWeight:700, fontSize:'.95rem' }}>Financeiro do mês</h3>
          </div>
          {[
            { label:'Receitas recebidas',  value:d.finance?.income_paid,    color:'var(--success)', icon:CheckCircle2 },
            { label:'Receitas pendentes',  value:d.finance?.income_pending, color:'var(--warning)', icon:Clock        },
            { label:'Despesas pagas',      value:d.finance?.expense_paid,   color:'var(--danger)',  icon:CheckCircle2 },
            { label:'Despesas pendentes',  value:d.finance?.expense_pending,color:'var(--warning)', icon:Clock        },
          ].map(row => (
            <div key={row.label} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0', borderBottom:'1px solid var(--border)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <row.icon size={13} color={row.color}/>
                <span style={{ fontSize:'.875rem', color:'var(--text-2)' }}>{row.label}</span>
              </div>
              <span style={{ fontWeight:700, fontSize:'.875rem', color:row.color }}>
                {fmt.brl(row.value)}
              </span>
            </div>
          ))}
        </Card>

        {/* CRM */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <Target size={16} color="#f59e0b"/>
            <h3 style={{ fontWeight:700, fontSize:'.95rem' }}>CRM do mês</h3>
          </div>
          {[
            { label:'Total de leads',    value:fmt.num(d.leads?.total)     },
            { label:'Leads em aberto',   value:fmt.num(d.leads?.open)      },
            { label:'Negócios ganhos',   value:fmt.num(d.leads?.won)       },
            { label:'Valor ganho',       value:fmt.brl(d.leads?.won_value) },
          ].map(row => (
            <div key={row.label} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0', borderBottom:'1px solid var(--border)',
            }}>
              <span style={{ fontSize:'.875rem', color:'var(--text-2)' }}>{row.label}</span>
              <span style={{ fontWeight:700, fontSize:'.875rem' }}>{row.value}</span>
            </div>
          ))}
        </Card>

      </div>

      {/* Last refresh */}
      <p style={{ color:'var(--muted-2)', fontSize:'.72rem', textAlign:'right', marginTop:16 }}>
        Atualizado às {lastRefresh.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
      </p>
    </div>
  )
}
