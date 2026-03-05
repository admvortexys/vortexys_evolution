import { useEffect, useState, useMemo } from 'react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { KpiCard, Card, Spinner, StatusBadge, fmt } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import {
  ShoppingCart, Package, Target, TrendingUp,
  TrendingDown, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, DollarSign, Users, BarChart3,
  ArrowUpRight, ArrowDownRight, Wallet, CreditCard
} from 'lucide-react'

/* ── Mini bar chart (puro CSS, sem lib) ─────────────────────────────────── */
function MiniBarChart({ data = [], labelKey = 'label', valueKey = 'value', color = '#a855f7' }) {
  const max = Math.max(...data.map(d => parseFloat(d[valueKey]) || 0), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '8px 0' }}>
      {data.map((d, i) => {
        const val = parseFloat(d[valueKey]) || 0
        const pct = Math.max((val / max) * 100, 4)
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600 }}>
              {fmt.compact(val)}
            </span>
            <div style={{
              width: '100%', maxWidth: 40, height: `${pct}%`, minHeight: 4,
              background: `linear-gradient(180deg, ${color}, ${color}88)`,
              borderRadius: '4px 4px 2px 2px', transition: 'height .4s ease',
            }} />
            <span style={{ fontSize: '.62rem', color: 'var(--muted-2)', fontWeight: 500 }}>
              {d[labelKey]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Progress bar ──────────────────────────────────────────────────────── */
function ProgressBar({ value, max, color = '#a855f7', height = 6 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ width: '100%', height, background: 'var(--bg-card2)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: 99,
        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
        transition: 'width .5s ease',
      }} />
    </div>
  )
}

/* ── Status color map ──────────────────────────────────────────────────── */
const STATUS_COLORS = {
  delivered:  '#22c55e',
  confirmed:  '#6366f1',
  processing: '#f59e0b',
  shipped:    '#3b82f6',
  draft:      '#6b7280',
  cancelled:  '#ef4444',
}
const STATUS_LABELS = {
  delivered:  'Entregue',
  confirmed:  'Confirmado',
  processing: 'Processando',
  shipped:    'Enviado',
  draft:      'Rascunho',
  cancelled:  'Cancelado',
}

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

  // Dados formatados para o gráfico de receita mensal
  const chartData = useMemo(() => {
    if (!data?.revenueByMonth) return []
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return data.revenueByMonth.map(m => {
      const [, mm] = m.month.split('-')
      return { label: months[parseInt(mm) - 1], value: parseFloat(m.revenue) || 0, orders: m.orders_count }
    })
  }, [data])

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
  const fin     = d.finance || {}
  const incomePaid    = parseFloat(fin.income_paid    || 0)
  const expensePaid   = parseFloat(fin.expense_paid   || 0)
  const incomePending = parseFloat(fin.income_pending || 0)
  const expensePending= parseFloat(fin.expense_pending|| 0)
  const balance       = incomePaid - expensePaid
  const totalIncome   = incomePaid + incomePending
  const totalExpense  = expensePaid + expensePending

  const firstName = user?.name?.split(' ')[0] ?? 'usuário'
  const now   = new Date()
  const hour  = now.getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const totalOrdersMonth = parseInt(d.orders?.total || 0)
  const deliveredCount   = parseInt(d.orders?.delivered || 0)

  return (
    <div className="page" style={{ minWidth: 0 }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 28, flexWrap:'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize:'1.6rem', fontWeight: 900, letterSpacing:'-.03em', marginBottom: 5 }}>
            {greet}, {firstName} 👋
          </h1>
          <p style={{ color:'var(--muted)', fontSize:'.88rem' }}>
            Aqui está o resumo do mês de {now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display:'flex', alignItems:'center', gap: 7, padding:'8px 14px',
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

      {/* ── KPIs (4 cards) ──────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(230px,1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard
          icon={DollarSign}
          label="Receita do mês"
          value={fmt.brl(d.orders?.revenue)}
          sub={`${totalOrdersMonth} pedidos · ${deliveredCount} entregues`}
          color="#22c55e"
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
          sub={`A receber: ${fmt.brl(incomePending)}`}
          color={balance >= 0 ? '#22c55e' : '#ef4444'}
        />
      </div>

      {/* ── Linha principal: Receita mensal + Financeiro ──── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Gráfico de receita mensal */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 16 }}>
            <div style={{ display:'flex', alignItems:'center', gap: 9 }}>
              <BarChart3 size={16} color="#a855f7"/>
              <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>Receita mensal</h3>
            </div>
          </div>
          {chartData.length > 0 ? (
            <MiniBarChart data={chartData} color="#a855f7" />
          ) : (
            <p style={{ color:'var(--muted)', fontSize:'.85rem', padding:'30px 0', textAlign:'center' }}>
              Sem dados de receita no período
            </p>
          )}
        </Card>

        {/* Financeiro do mês (corrigido) */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 16 }}>
            <Wallet size={16} color="#22c55e"/>
            <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>Financeiro do mês</h3>
          </div>

          {/* Receita */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <ArrowUpRight size={14} color="#22c55e"/>
                <span style={{ fontSize:'.82rem', color:'var(--text-2)', fontWeight: 500 }}>Receitas</span>
              </div>
              <span style={{ fontSize:'.82rem', fontWeight: 700, color:'#22c55e' }}>
                {fmt.brl(totalIncome)}
              </span>
            </div>
            <ProgressBar value={incomePaid} max={totalIncome || 1} color="#22c55e" />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop: 4 }}>
              <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>
                <CheckCircle2 size={10} style={{ verticalAlign:'middle', marginRight: 3 }}/> Recebido: {fmt.brl(incomePaid)}
              </span>
              <span style={{ fontSize:'.7rem', color:'var(--warning)' }}>
                <Clock size={10} style={{ verticalAlign:'middle', marginRight: 3 }}/> Pendente: {fmt.brl(incomePending)}
              </span>
            </div>
          </div>

          {/* Despesa */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <ArrowDownRight size={14} color="#ef4444"/>
                <span style={{ fontSize:'.82rem', color:'var(--text-2)', fontWeight: 500 }}>Despesas</span>
              </div>
              <span style={{ fontSize:'.82rem', fontWeight: 700, color:'#ef4444' }}>
                {fmt.brl(totalExpense)}
              </span>
            </div>
            <ProgressBar value={expensePaid} max={totalExpense || 1} color="#ef4444" />
            <div style={{ display:'flex', justifyContent:'space-between', marginTop: 4 }}>
              <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>
                <CheckCircle2 size={10} style={{ verticalAlign:'middle', marginRight: 3 }}/> Pago: {fmt.brl(expensePaid)}
              </span>
              <span style={{ fontSize:'.7rem', color:'var(--warning)' }}>
                <Clock size={10} style={{ verticalAlign:'middle', marginRight: 3 }}/> Pendente: {fmt.brl(expensePending)}
              </span>
            </div>
          </div>

          {/* Saldo */}
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'10px 12px', borderRadius: 8,
            background: balance >= 0 ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
            border: `1px solid ${balance >= 0 ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'}`,
          }}>
            <span style={{ fontSize:'.82rem', fontWeight: 600, color:'var(--text)' }}>Saldo líquido</span>
            <span style={{ fontSize:'.95rem', fontWeight: 800, color: balance >= 0 ? '#22c55e' : '#ef4444' }}>
              {fmt.brl(balance)}
            </span>
          </div>
        </Card>
      </div>

      {/* ── Linha 2: Pedidos por status + Top vendedores ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Pedidos por status */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 16 }}>
            <ShoppingCart size={16} color="#6366f1"/>
            <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>Pedidos por status</h3>
          </div>
          {(d.ordersByStatus || []).length === 0 ? (
            <p style={{ color:'var(--muted)', fontSize:'.85rem', padding:'20px 0', textAlign:'center' }}>
              Nenhum pedido no mês
            </p>
          ) : (d.ordersByStatus || []).map(s => {
            const color = STATUS_COLORS[s.status] || '#6b7280'
            const label = STATUS_LABELS[s.status] || s.status
            return (
              <div key={s.status} style={{
                display:'flex', alignItems:'center', gap: 10,
                padding:'9px 0', borderBottom:'1px solid var(--border)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />
                <span style={{ fontSize:'.84rem', color:'var(--text-2)', flex: 1 }}>{label}</span>
                <span style={{ fontSize:'.82rem', fontWeight: 600, color:'var(--muted)', marginRight: 8 }}>
                  {s.count} {parseInt(s.count) === 1 ? 'pedido' : 'pedidos'}
                </span>
                <span style={{ fontSize:'.84rem', fontWeight: 700, minWidth: 90, textAlign:'right' }}>
                  {fmt.brl(s.amount)}
                </span>
              </div>
            )
          })}
        </Card>

        {/* Top vendedores */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 16 }}>
            <Users size={16} color="#f59e0b"/>
            <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>Top vendedores do mês</h3>
          </div>
          {(d.topSellers || []).length === 0 ? (
            <p style={{ color:'var(--muted)', fontSize:'.85rem', padding:'20px 0', textAlign:'center' }}>
              Nenhuma venda no mês
            </p>
          ) : (() => {
            const maxSold = Math.max(...(d.topSellers || []).map(s => parseFloat(s.total_sold) || 0), 1)
            return (d.topSellers || []).map((s, i) => {
              const sold = parseFloat(s.total_sold) || 0
              const medals = ['🥇','🥈','🥉']
              return (
                <div key={s.id} style={{ padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 5 }}>
                    <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                      <span style={{ fontSize:'.85rem', width: 22 }}>
                        {i < 3 ? medals[i] : <span style={{ color:'var(--muted)', fontWeight:600 }}>{i+1}º</span>}
                      </span>
                      <span style={{ fontSize:'.84rem', fontWeight: 600 }}>{s.name}</span>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:'.84rem', fontWeight: 700, color:'#22c55e' }}>
                        {fmt.brl(sold)}
                      </span>
                      <span style={{ fontSize:'.72rem', color:'var(--muted)', marginLeft: 6 }}>
                        {s.total_orders} ped.
                      </span>
                    </div>
                  </div>
                  <ProgressBar value={sold} max={maxSold} color={i === 0 ? '#f59e0b' : i === 1 ? '#a1a1aa' : i === 2 ? '#cd7f32' : '#6366f1'} height={4} />
                </div>
              )
            })
          })()}
        </Card>
      </div>

      {/* ── Linha 3: Últimos pedidos + Estoque baixo + CRM ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>

        {/* Últimos pedidos */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 18 }}>
            <ShoppingCart size={16} color="var(--primary-light)"/>
            <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>Últimos pedidos</h3>
          </div>
          {(d.recentOrders || []).length === 0 ? (
            <p style={{ color:'var(--muted)', fontSize:'.85rem', padding:'20px 0' }}>
              Nenhum pedido ainda
            </p>
          ) : (d.recentOrders || []).map(o => (
            <div key={o.id} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0', borderBottom:'1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize:'.85rem' }}>{o.number}</div>
                <div style={{ color:'var(--muted)', fontSize:'.75rem', marginTop: 2 }}>
                  {o.client_name || '—'}
                </div>
              </div>
              <div style={{ textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 5 }}>
                <span style={{ fontWeight: 700, fontSize:'.85rem' }}>{fmt.brl(o.total)}</span>
                <StatusBadge status={o.status}/>
              </div>
            </div>
          ))}
        </Card>

        {/* Estoque baixo */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 18 }}>
            <AlertTriangle size={16} color="var(--warning)"/>
            <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>Estoque baixo</h3>
          </div>
          {(d.lowStock || []).length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'28px 0', gap: 8 }}>
              <CheckCircle2 size={28} color="var(--success)" strokeWidth={1.5}/>
              <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Tudo em ordem!</p>
            </div>
          ) : (d.lowStock || []).map(p => {
            const ratio = p.min_stock > 0 ? (p.stock_quantity / p.min_stock) : 1
            const barColor = ratio <= 0.3 ? '#ef4444' : ratio <= 0.7 ? '#f59e0b' : '#22c55e'
            return (
              <div key={p.id} style={{
                padding:'10px 0', borderBottom:'1px solid var(--border)',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize:'.84rem' }}>{p.name}</div>
                    <div style={{ color:'var(--muted)', fontSize:'.72rem', marginTop: 1 }}>SKU: {p.sku}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight: 700, color: barColor, fontSize:'.84rem' }}>
                      {fmt.num(p.stock_quantity)} {p.unit}
                    </div>
                    <div style={{ color:'var(--muted)', fontSize:'.7rem', marginTop: 1 }}>
                      mín: {fmt.num(p.min_stock)}
                    </div>
                  </div>
                </div>
                <ProgressBar value={parseFloat(p.stock_quantity)} max={parseFloat(p.min_stock)} color={barColor} height={3} />
              </div>
            )
          })}
        </Card>

        {/* CRM do mês */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap: 9, marginBottom: 18 }}>
            <Target size={16} color="#f59e0b"/>
            <h3 style={{ fontWeight: 700, fontSize:'.95rem' }}>CRM do mês</h3>
          </div>
          {[
            { label:'Total de leads',    value: fmt.num(d.leads?.total),     icon: Target,      color:'#6366f1'  },
            { label:'Leads em aberto',   value: fmt.num(d.leads?.open),      icon: Clock,       color:'#f59e0b'  },
            { label:'Negócios ganhos',   value: fmt.num(d.leads?.won),       icon: CheckCircle2,color:'#22c55e'  },
            { label:'Valor ganho',       value: fmt.brl(d.leads?.won_value), icon: DollarSign,  color:'#22c55e'  },
          ].map(row => {
            const Icon = row.icon
            return (
              <div key={row.label} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'10px 0', borderBottom:'1px solid var(--border)',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                  <Icon size={13} color={row.color}/>
                  <span style={{ fontSize:'.84rem', color:'var(--text-2)' }}>{row.label}</span>
                </div>
                <span style={{ fontWeight: 700, fontSize:'.84rem' }}>{row.value}</span>
              </div>
            )
          })}
        </Card>

      </div>

      {/* Last refresh */}
      <p style={{ color:'var(--muted-2)', fontSize:'.72rem', textAlign:'right', marginTop: 16 }}>
        Atualizado às {lastRefresh.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
      </p>
    </div>
  )
}
