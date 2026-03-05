import { useEffect, useState, useMemo, useCallback } from 'react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { KpiCard, Card, Spinner, Badge, fmt } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import {
  ShoppingCart, Package, Target, TrendingUp, TrendingDown, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, DollarSign, Users, BarChart3, ArrowUpRight, ArrowDownRight, Wallet,
  ChevronLeft, ChevronRight, User, Tag, Layers, Award, Percent
} from 'lucide-react'

const C = { green:'#22c55e', red:'#ef4444', yellow:'#f59e0b', purple:'#a855f7', indigo:'#6366f1', blue:'#3b82f6', muted:'#71717a', bronze:'#cd7f32', cyan:'#06b6d4', pink:'#ec4899' }
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTH_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function Bar({ value, max, color = C.purple, h = 6 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ width:'100%', height:h, background:'var(--bg-card2)', borderRadius:99, overflow:'hidden' }}>
      <div style={{ width:`${pct}%`, height:'100%', borderRadius:99, background:`linear-gradient(90deg,${color},${color}bb)`, transition:'width .6s' }} />
    </div>
  )
}
function MiniBarChart({ data = [], labelKey = 'label', valueKey = 'value', color = C.purple }) {
  const max = Math.max(...data.map(d => parseFloat(d[valueKey]) || 0), 1)
  if (!data.length) return <p style={{ color:'var(--muted)', fontSize:'.84rem', padding:'28px 0', textAlign:'center' }}>Sem dados</p>
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130, padding:'12px 4px 0' }}>
      {data.map((d, i) => {
        const val = parseFloat(d[valueKey]) || 0
        const pct = Math.max((val / max) * 100, 6)
        const isLast = i === data.length - 1
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
            <span style={{ fontSize:'.68rem', color: isLast ? '#fff' : 'var(--muted)', fontWeight:700 }}>{fmt.compact(val)}</span>
            <div style={{ width:'100%', maxWidth:42, height:`${pct}%`, minHeight:6,
              background: isLast ? `linear-gradient(180deg,${color},${color}aa)` : `linear-gradient(180deg,${color}55,${color}22)`,
              borderRadius:'6px 6px 2px 2px', transition:'height .5s' }} />
            <span style={{ fontSize:'.66rem', fontWeight:600, color: isLast ? color : 'var(--muted-2)' }}>{d[labelKey]}</span>
          </div>
        )
      })}
    </div>
  )
}
function MiniDonut({ segments = [], size = 82 }) {
  const total = segments.reduce((s, x) => s + (parseFloat(x.value) || 0), 0)
  if (!total) return null
  let cumDeg = 0
  const parts = segments.map(seg => { const deg = (seg.value / total) * 360; const p = `${seg.color} ${cumDeg}deg ${cumDeg + deg}deg`; cumDeg += deg; return p })
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:`conic-gradient(${parts.join(',')})`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <div style={{ width:size-16, height:size-16, borderRadius:'50%', background:'var(--bg-card)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.7rem', fontWeight:800 }}>
        {fmt.compact(total)}
      </div>
    </div>
  )
}
function TabBtn({ active, children, onClick }) {
  return <button onClick={onClick} style={{ padding:'8px 16px', fontSize:'.8rem', fontWeight: active ? 700 : 500, color: active ? '#fff' : 'var(--muted)', background: active ? 'var(--primary)' : 'transparent', border:'none', borderRadius:8, cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap' }}>{children}</button>
}
function SectionTitle({ icon: Icon, title, color = C.indigo }) {
  return <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16 }}><Icon size={16} color={color}/><h3 style={{ fontWeight:700, fontSize:'.95rem' }}>{title}</h3></div>
}
function RankRow({ rank, name, sub, value, maxVal, color }) {
  const medals = ['🥇','🥈','🥉']
  return (
    <div style={{ padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:'.9rem', width:22, textAlign:'center' }}>{rank < 3 ? medals[rank] : <span style={{ color:'var(--muted)', fontWeight:700, fontSize:'.78rem' }}>{rank+1}º</span>}</span>
          <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{name}</div>{sub && <div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{sub}</div>}</div>
        </div>
        <span style={{ fontWeight:700, fontSize:'.84rem', color: color || C.green }}>{value}</span>
      </div>
      <Bar value={parseFloat(String(value).replace(/[^\d.,]/g,'').replace(',','.'))||0} max={maxVal||1} color={color||C.indigo} h={3}/>
    </div>
  )
}
const st = {
  row: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' },
  lbl: { fontSize:'.82rem', color:'var(--text-2)', fontWeight:500 },
  val: { fontSize:'.82rem', fontWeight:700 },
  empty: { color:'var(--muted)', fontSize:'.84rem', padding:'28px 0', textAlign:'center' },
}

export default function Dashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear]   = useState(today.getFullYear())
  const [tab, setTab]     = useState('geral')
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState(null)
  const [biSellers, setBiSellers] = useState(null)
  const [biProducts, setBiProducts] = useState(null)
  const [biClients, setBiClients]   = useState(null)
  const [biCrm, setBiCrm]           = useState(null)
  const [selSeller, setSelSeller]   = useState('')

  const loadMain = useCallback(async () => {
    setLoading(true)
    try {
      const { data: d } = await api.get('/dashboard', { params: { month, year } })
      setData(d)
    } catch { toast.error('Erro ao carregar BI') }
    setLoading(false)
  }, [month, year])

  const loadSellers = useCallback(async () => {
    try {
      const { data: d } = await api.get('/dashboard/bi/sellers', { params: { month, year, seller_id: selSeller || undefined } })
      setBiSellers(d)
    } catch { /* ignore */ }
  }, [month, year, selSeller])

  const loadProducts = useCallback(async () => {
    try { const { data: d } = await api.get('/dashboard/bi/products', { params: { month, year } }); setBiProducts(d) } catch {}
  }, [month, year])

  const loadClients = useCallback(async () => {
    try { const { data: d } = await api.get('/dashboard/bi/clients', { params: { month, year } }); setBiClients(d) } catch {}
  }, [month, year])

  const loadCrm = useCallback(async () => {
    try { const { data: d } = await api.get('/dashboard/bi/crm', { params: { month, year } }); setBiCrm(d) } catch {}
  }, [month, year])

  useEffect(() => { loadMain() }, [loadMain])
  useEffect(() => { if (tab === 'vendedores') loadSellers() }, [tab, loadSellers])
  useEffect(() => { if (tab === 'produtos') loadProducts() }, [tab, loadProducts])
  useEffect(() => { if (tab === 'clientes') loadClients() }, [tab, loadClients])
  useEffect(() => { if (tab === 'crm') loadCrm() }, [tab, loadCrm])

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const goToday   = () => { setMonth(today.getMonth() + 1); setYear(today.getFullYear()) }

  const chartData = useMemo(() => {
    if (!data?.revenueByMonth) return []
    return data.revenueByMonth.map(m => { const [, mm] = m.month.split('-'); return { label: MONTH_NAMES[parseInt(mm)-1], value: parseFloat(m.revenue)||0 } })
  }, [data])

  const d   = data || {}
  const fin = d.finance || {}
  const crmWon = parseFloat(d.leads?.won_value || 0)
  const inPaid  = parseFloat(fin.income_paid || 0)
  const exPaid  = parseFloat(fin.expense_paid || 0)
  const inPend  = parseFloat(fin.income_pending || 0)
  const exPend  = parseFloat(fin.expense_pending || 0)
  const totalIn = inPaid + inPend + crmWon
  const totalEx = exPaid + exPend
  const balance = (inPaid + crmWon) - exPaid

  const firstName = user?.name?.split(' ')[0] ?? 'usuário'
  const hour = today.getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="page" style={{ minWidth:0 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:'1.4rem', fontWeight:900, letterSpacing:'-.03em', marginBottom:4 }}>{greet}, {firstName}</h1>
          <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Business Intelligence</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:2, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, padding:2 }}>
            <button onClick={prevMonth} style={navBtn}><ChevronLeft size={16}/></button>
            <span style={{ fontWeight:700, fontSize:'.88rem', minWidth:130, textAlign:'center', color:'var(--text)' }}>{MONTH_FULL[month-1]} {year}</span>
            <button onClick={nextMonth} style={navBtn}><ChevronRight size={16}/></button>
          </div>
          <button onClick={goToday} style={{ ...navBtn, padding:'6px 12px', fontSize:'.78rem', fontWeight:600 }}>Hoje</button>
          <button onClick={loadMain} style={{ ...navBtn, padding:'6px 12px', display:'flex', alignItems:'center', gap:4, fontSize:'.78rem' }}><RefreshCw size={13}/>Atualizar</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:18, overflowX:'auto', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:3, width:'fit-content' }}>
        {[{k:'geral',l:'Geral'},{k:'vendedores',l:'Vendedores'},{k:'produtos',l:'Produtos'},{k:'clientes',l:'Clientes'},{k:'crm',l:'CRM'}].map(t =>
          <TabBtn key={t.k} active={tab===t.k} onClick={() => setTab(t.k)}>{t.l}</TabBtn>
        )}
      </div>

      {loading && !data ? <Spinner text="Carregando..."/> : (
        <>
          {tab === 'geral' && <GeralTab d={d} fin={fin} inPaid={inPaid} exPaid={exPaid} inPend={inPend} exPend={exPend} balance={balance} totalIn={totalIn} totalEx={totalEx} chartData={chartData} crmWon={crmWon}/>}
          {tab === 'vendedores' && <VendedoresTab data={biSellers} selSeller={selSeller} setSelSeller={setSelSeller} loadSellers={loadSellers} month={month} year={year}/>}
          {tab === 'produtos' && <ProdutosTab data={biProducts}/>}
          {tab === 'clientes' && <ClientesTab data={biClients}/>}
          {tab === 'crm' && <CrmTab data={biCrm}/>}
        </>
      )}
    </div>
  )
}

/* ══════════════════ TAB GERAL ══════════════════ */
function GeralTab({ d, inPaid, exPaid, inPend, exPend, balance, totalIn, totalEx, chartData, crmWon = 0 }) {
  const totalOrders = parseInt(d.orders?.total || 0)
  const delivered   = parseInt(d.orders?.delivered || 0)
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:18 }}>
        <KpiCard icon={DollarSign} label="Receita do mês" value={fmt.brl((parseFloat(d.orders?.revenue)||0) + (parseFloat(d.leads?.won_value)||0))} sub={`${totalOrders} pedidos · ${delivered} entregues`} color={C.green}/>
        <KpiCard icon={Package} label="Produtos ativos" value={fmt.num(d.products?.total)} sub={`${d.products?.low_stock||0} com estoque baixo`} color={C.indigo}/>
        <KpiCard icon={Target} label="Leads em aberto" value={fmt.num(d.leads?.open)} sub={`${d.leads?.won||0} ganhos`} color={C.yellow}/>
        <KpiCard icon={balance>=0?TrendingUp:TrendingDown} label="Saldo do mês" value={fmt.brl(balance)} sub={`A receber: ${fmt.brl(inPend)}${crmWon>0 ? ` + ${fmt.brl(crmWon)} CRM` : ''}`} color={balance>=0?C.green:C.red}/>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <Card>
          <SectionTitle icon={Wallet} title="Financeiro do mês" color={C.green}/>
          <div style={{ display:'flex', gap:20, marginBottom:16 }}>
            <MiniDonut size={82} segments={[{value:inPaid,color:C.green},{value:inPend,color:`${C.green}55`},{value:crmWon,color:C.yellow},{value:exPaid,color:C.red},{value:exPend,color:`${C.red}44`}]}/>
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap:8 }}>
              <LegendRow color={C.green} label="Receita recebida" value={fmt.brl(inPaid)}/>
              <LegendRow color={`${C.green}55`} label="Receita pendente" value={fmt.brl(inPend)} valueColor={C.yellow}/>
              {crmWon > 0 && <LegendRow color={C.yellow} label="Valor ganho CRM" value={fmt.brl(crmWon)} valueColor={C.green}/>}
              <LegendRow color={C.red} label="Despesa paga" value={fmt.brl(exPaid)} valueColor={C.red}/>
              <LegendRow color={`${C.red}55`} label="Despesa pendente" value={fmt.brl(exPend)} valueColor={C.yellow}/>
            </div>
          </div>
          <BarLabel icon={ArrowUpRight} label="Receita total" value={fmt.brl(totalIn)} color={C.green}/>
          <Bar value={inPaid} max={totalIn||1} color={C.green}/>
          <div style={{ height:10 }}/>
          <BarLabel icon={ArrowDownRight} label="Despesa total" value={fmt.brl(totalEx)} color={C.red}/>
          <Bar value={exPaid} max={totalEx||1} color={C.red}/>
          <div style={{ marginTop:14, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderRadius:10, background: balance>=0 ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)', border:`1px solid ${balance>=0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)'}` }}>
            <span style={{ fontSize:'.84rem', fontWeight:600 }}>Saldo líquido</span>
            <span style={{ fontSize:'1rem', fontWeight:800, color: balance>=0?C.green:C.red }}>{fmt.brl(balance)}</span>
          </div>
        </Card>
        <Card>
          <SectionTitle icon={BarChart3} title="Receita mensal" color={C.purple}/>
          <MiniBarChart data={chartData} color={C.purple}/>
        </Card>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <Card>
          <SectionTitle icon={ShoppingCart} title="Pedidos por status" color={C.indigo}/>
          {!(d.ordersByStatus||[]).length ? <p style={st.empty}>Nenhum pedido</p> :
            (d.ordersByStatus||[]).map(s => (
              <div key={s.status} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:10, height:10, borderRadius:99, background: s.color || C.muted, flexShrink:0 }}/>
                <span style={{ fontSize:'.84rem', flex:1 }}>{s.label || s.status}</span>
                <span style={{ fontSize:'.78rem', color:'var(--muted)', marginRight:10 }}>{s.count}x</span>
                <span style={{ fontSize:'.84rem', fontWeight:700, minWidth:95, textAlign:'right' }}>{fmt.brl(s.amount)}</span>
              </div>
            ))}
        </Card>
        <Card>
          <SectionTitle icon={Users} title="Top vendedores" color={C.yellow}/>
          {!(d.topSellers||[]).length ? <p style={st.empty}>Nenhuma venda</p> :
            (() => { const max = Math.max(...(d.topSellers||[]).map(s => parseFloat(s.total_sold)||0), 1);
              return (d.topSellers||[]).map((s, i) => <RankRow key={s.id} rank={i} name={s.name} sub={`${s.total_orders} pedidos`} value={fmt.brl(s.total_sold)} maxVal={max} color={[C.yellow,'#a1a1aa',C.bronze,C.indigo,C.purple][i]}/>)
            })()}
        </Card>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
        <Card>
          <SectionTitle icon={ShoppingCart} title="Últimos pedidos" color={C.purple}/>
          {!(d.recentOrders||[]).length ? <p style={st.empty}>Nenhum pedido</p> :
            (d.recentOrders||[]).map(o => (
              <div key={o.id} style={st.row}>
                <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{o.number}</div><div style={{ color:'var(--muted)', fontSize:'.72rem', marginTop:2 }}>{o.client_name||'—'}</div></div>
                <span style={{ fontWeight:700, fontSize:'.84rem' }}>{fmt.brl(o.total)}</span>
              </div>
            ))}
        </Card>
        <Card>
          <SectionTitle icon={AlertTriangle} title="Estoque baixo" color={C.yellow}/>
          {!(d.lowStock||[]).length ? <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'28px 0', gap:8 }}><CheckCircle2 size={28} color={C.green} strokeWidth={1.5}/><p style={{ color:'var(--muted)', fontSize:'.84rem' }}>Tudo em ordem!</p></div> :
            (d.lowStock||[]).map(p => { const r = p.min_stock > 0 ? p.stock_quantity / p.min_stock : 1; const bc = r<=.3?C.red:r<=.7?C.yellow:C.green; return (
              <div key={p.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <div><div style={{ fontWeight:600, fontSize:'.82rem' }}>{p.name}</div><div style={{ color:'var(--muted)', fontSize:'.68rem' }}>SKU: {p.sku}</div></div>
                  <div style={{ textAlign:'right' }}><div style={{ fontWeight:700, color:bc, fontSize:'.82rem' }}>{fmt.num(p.stock_quantity)} {p.unit}</div><div style={{ color:'var(--muted)', fontSize:'.68rem' }}>mín: {fmt.num(p.min_stock)}</div></div>
                </div>
                <Bar value={parseFloat(p.stock_quantity)} max={parseFloat(p.min_stock)} color={bc} h={3}/>
              </div>
            )})}
        </Card>
        <Card>
          <SectionTitle icon={Target} title="CRM do mês" color={C.yellow}/>
          {[{l:'Total leads',v:fmt.num(d.leads?.total),i:Target,c:C.indigo},{l:'Em aberto',v:fmt.num(d.leads?.open),i:Clock,c:C.yellow},{l:'Ganhos',v:fmt.num(d.leads?.won),i:CheckCircle2,c:C.green},{l:'Valor ganho',v:fmt.brl(d.leads?.won_value),i:DollarSign,c:C.green}].map(r => {
            const I = r.i; return <div key={r.l} style={st.row}><div style={{ display:'flex', alignItems:'center', gap:8 }}><I size={13} color={r.c}/><span style={st.lbl}>{r.l}</span></div><span style={st.val}>{r.v}</span></div>
          })}
        </Card>
      </div>
    </>
  )
}

/* ══════════════════ TAB VENDEDORES ══════════════════ */
function VendedoresTab({ data, selSeller, setSelSeller, loadSellers }) {
  if (!data) return <Spinner/>
  const ranking = data.ranking || []
  const detail  = data.detail
  const maxRev  = Math.max(...ranking.map(r => parseFloat(r.revenue)||0), 1)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
      <Card>
        <SectionTitle icon={Award} title="Ranking de vendedores" color={C.yellow}/>
        {ranking.map((s, i) => (
          <div key={s.id} onClick={() => { setSelSeller(String(s.id)); setTimeout(loadSellers, 50) }}
            style={{ padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer', opacity: selSeller && selSeller !== String(s.id) ? .5 : 1, transition:'opacity .2s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:'.9rem', width:22, textAlign:'center' }}>{i<3?['🥇','🥈','🥉'][i]:<span style={{ color:'var(--muted)', fontWeight:700, fontSize:'.78rem' }}>{i+1}º</span>}</span>
                <div>
                  <div style={{ fontWeight:600, fontSize:'.84rem' }}>{s.name}</div>
                  <div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{s.orders} pedidos · {s.commission}% comissão</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(s.revenue)}</div>
                <div style={{ fontSize:'.68rem', color:'var(--muted)' }}>Com. {fmt.brl(s.commission_value)}</div>
              </div>
            </div>
            <Bar value={parseFloat(s.revenue)||0} max={maxRev} color={[C.yellow,'#a1a1aa',C.bronze,C.indigo,C.purple][i]||C.indigo} h={3}/>
          </div>
        ))}
      </Card>
      <Card>
        <SectionTitle icon={BarChart3} title={selSeller ? 'Detalhe do vendedor' : 'Selecione um vendedor'} color={C.blue}/>
        {!detail ? <p style={st.empty}>Clique em um vendedor para ver o detalhe</p> : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontWeight:700, fontSize:'.85rem', color:'var(--muted)' }}>Top produtos vendidos</div>
            {(detail.topProducts||[]).map((p, i) => (
              <div key={p.id} style={st.row}>
                <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{p.name}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{p.sku} · {parseFloat(p.qty).toFixed(0)} un.</div></div>
                <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(p.revenue)}</span>
              </div>
            ))}
            <div style={{ fontWeight:700, fontSize:'.85rem', color:'var(--muted)', marginTop:8 }}>Pedidos por status</div>
            {(detail.byStatus||[]).map(s => (
              <div key={s.status} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0' }}>
                <div style={{ width:8, height:8, borderRadius:99, background: s.color || C.muted }}/>
                <span style={{ flex:1, fontSize:'.82rem' }}>{s.label || s.status}</span>
                <span style={{ fontSize:'.78rem', color:'var(--muted)' }}>{s.count}x</span>
                <span style={{ fontWeight:700, fontSize:'.82rem' }}>{fmt.brl(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ══════════════════ TAB PRODUTOS ══════════════════ */
function ProdutosTab({ data }) {
  if (!data) return <Spinner/>
  const maxQty = Math.max(...(data.topSold||[]).map(p => parseFloat(p.qty_sold)||0), 1)
  const maxRev = Math.max(...(data.topRevenue||[]).map(p => parseFloat(p.revenue)||0), 1)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
      <Card>
        <SectionTitle icon={Package} title="Mais vendidos (quantidade)" color={C.indigo}/>
        {(data.topSold||[]).map((p, i) => (
          <div key={p.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.84rem' }}>{i+1}. {p.name}</div>
                <div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{p.sku} {p.brand ? `· ${p.brand}` : ''}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700, fontSize:'.84rem' }}>{parseFloat(p.qty_sold).toFixed(0)} un.</div>
                <div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{p.orders} pedidos</div>
              </div>
            </div>
            <Bar value={parseFloat(p.qty_sold)||0} max={maxQty} color={C.indigo} h={3}/>
          </div>
        ))}
      </Card>
      <Card>
        <SectionTitle icon={DollarSign} title="Mais vendidos (receita)" color={C.green}/>
        {(data.topRevenue||[]).map((p, i) => (
          <div key={p.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{i+1}. {p.name}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{p.sku}</div></div>
              <div style={{ textAlign:'right' }}><div style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(p.revenue)}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{parseFloat(p.qty_sold).toFixed(0)} un.</div></div>
            </div>
            <Bar value={parseFloat(p.revenue)||0} max={maxRev} color={C.green} h={3}/>
          </div>
        ))}
      </Card>
      <Card>
        <SectionTitle icon={Layers} title="Por categoria" color={C.purple}/>
        {(data.categories||[]).map(c => (
          <div key={c.id||c.category} style={st.row}>
            <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{c.category || 'Sem categoria'}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{c.products} produtos · {parseFloat(c.qty||0).toFixed(0)} un.</div></div>
            <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(c.revenue)}</span>
          </div>
        ))}
        {!(data.categories||[]).length && <p style={st.empty}>Sem dados</p>}
      </Card>
      <Card>
        <SectionTitle icon={AlertTriangle} title="Estoque baixo" color={C.red}/>
        {(data.lowStock||[]).map(p => { const r = p.min_stock > 0 ? p.stock_quantity/p.min_stock : 1; const bc = r<=.3?C.red:r<=.7?C.yellow:C.green; return (
          <div key={p.id} style={st.row}>
            <div><div style={{ fontWeight:600, fontSize:'.82rem' }}>{p.name}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{p.sku}</div></div>
            <span style={{ fontWeight:700, color:bc, fontSize:'.82rem' }}>{fmt.num(p.stock_quantity)} / {fmt.num(p.min_stock)}</span>
          </div>
        )})}
        {!(data.lowStock||[]).length && <p style={st.empty}>Tudo em ordem!</p>}
      </Card>
    </div>
  )
}

/* ══════════════════ TAB CLIENTES ══════════════════ */
function ClientesTab({ data }) {
  if (!data) return <Spinner/>
  const maxRev = Math.max(...(data.topClients||[]).map(c => parseFloat(c.revenue)||0), 1)
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
      <Card style={{ gridColumn:'span 2' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:16 }}>
          <MiniKpi icon={Users} label="Novos no mês" value={data.newClients || 0} color={C.indigo}/>
          <MiniKpi icon={ShoppingCart} label="Compraram no mês" value={(data.topClients||[]).length} color={C.green}/>
          <MiniKpi icon={DollarSign} label="Receita clientes" value={fmt.brl((data.topClients||[]).reduce((s,c) => s+parseFloat(c.revenue||0),0))} color={C.green}/>
        </div>
      </Card>
      <Card>
        <SectionTitle icon={Award} title="Top clientes (receita)" color={C.green}/>
        {(data.topClients||[]).map((c, i) => (
          <div key={c.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.84rem' }}>{i+1}. {c.name}</div>
                <div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{c.type} · {c.orders} pedidos · TM {fmt.brl(c.ticket)}</div>
              </div>
              <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(c.revenue)}</span>
            </div>
            <Bar value={parseFloat(c.revenue)||0} max={maxRev} color={C.green} h={3}/>
          </div>
        ))}
        {!(data.topClients||[]).length && <p style={st.empty}>Sem dados</p>}
      </Card>
      <Card>
        <SectionTitle icon={Tag} title="Por tipo de cliente" color={C.purple}/>
        {(data.byType||[]).map(t => (
          <div key={t.type} style={st.row}>
            <div><div style={{ fontWeight:600, fontSize:'.84rem', textTransform:'capitalize' }}>{t.type}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{t.clients} clientes · {t.orders} pedidos</div></div>
            <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(t.revenue)}</span>
          </div>
        ))}
        {!(data.byType||[]).length && <p style={st.empty}>Sem dados</p>}
      </Card>
    </div>
  )
}

/* ══════════════════ TAB CRM ══════════════════ */
function CrmTab({ data }) {
  if (!data) return <Spinner/>
  const ov = data.overview || {}
  const convRate = ov.total > 0 ? ((ov.won / ov.total) * 100).toFixed(1) : '0.0'
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
      <Card style={{ gridColumn:'span 2' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
          <MiniKpi icon={Target} label="Total leads" value={ov.total||0} color={C.indigo}/>
          <MiniKpi icon={Clock} label="Em aberto" value={ov.open||0} color={C.yellow}/>
          <MiniKpi icon={CheckCircle2} label="Ganhos" value={ov.won||0} color={C.green}/>
          <MiniKpi icon={AlertTriangle} label="Perdidos" value={ov.lost||0} color={C.red}/>
          <MiniKpi icon={Percent} label="Conversão" value={`${convRate}%`} color={C.purple}/>
          <MiniKpi icon={DollarSign} label="Valor ganho" value={fmt.brl(ov.won_value)} color={C.green}/>
          <MiniKpi icon={Wallet} label="Pipeline" value={fmt.brl(ov.pipeline_value)} color={C.blue}/>
          <MiniKpi icon={Clock} label="Tempo médio (dias)" value={data.avgDaysOpen} color={C.yellow}/>
        </div>
      </Card>
      <Card>
        <SectionTitle icon={Layers} title="Por pipeline" color={C.purple}/>
        {(data.byPipeline||[]).map(p => (
          <div key={p.id} style={st.row}>
            <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{p.pipeline}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{p.leads} leads · {p.won} ganhos · {p.lost} perdidos</div></div>
            <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(p.won_value)}</span>
          </div>
        ))}
        {!(data.byPipeline||[]).length && <p style={st.empty}>Sem pipelines</p>}
      </Card>
      <Card>
        <SectionTitle icon={Target} title="Por origem" color={C.cyan}/>
        {(data.bySource||[]).map(s => (
          <div key={s.source} style={st.row}>
            <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{s.source}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{s.leads} leads · {s.won} ganhos</div></div>
            <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(s.won_value)}</span>
          </div>
        ))}
        {!(data.bySource||[]).length && <p style={st.empty}>Sem dados</p>}
      </Card>
      <Card style={{ gridColumn:'span 2' }}>
        <SectionTitle icon={CheckCircle2} title="Últimos negócios ganhos" color={C.green}/>
        {(data.recentWon||[]).map(l => (
          <div key={l.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <div><div style={{ fontWeight:600, fontSize:'.84rem' }}>{l.name}</div><div style={{ fontSize:'.68rem', color:'var(--muted)' }}>{l.pipeline} · {parseFloat(l.days_in_pipeline).toFixed(0)} dias no pipeline</div></div>
            <span style={{ fontWeight:700, fontSize:'.84rem', color:C.green }}>{fmt.brl(l.estimated_value)}</span>
          </div>
        ))}
        {!(data.recentWon||[]).length && <p style={st.empty}>Nenhum negócio ganho</p>}
      </Card>
    </div>
  )
}

/* ── helpers ── */
function LegendRow({ color, label, value, valueColor }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between' }}>
      <span style={{ fontSize:'.7rem', color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
        <span style={{ width:8, height:8, borderRadius:99, background:color, display:'inline-block' }}/>{label}
      </span>
      <span style={{ fontSize:'.78rem', fontWeight:700, color: valueColor || C.green }}>{value}</span>
    </div>
  )
}
function BarLabel({ icon: I, label, value, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
      <span style={{ fontSize:'.72rem', color:'var(--muted)' }}><I size={11} style={{ verticalAlign:'middle' }}/> {label}</span>
      <span style={{ fontSize:'.72rem', fontWeight:700, color }}>{value}</span>
    </div>
  )
}
function MiniKpi({ icon: I, label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'var(--bg-card)', borderRadius:10, border:'1px solid var(--border)' }}>
      <div style={{ color, display:'flex' }}><I size={16}/></div>
      <div><div style={{ fontSize:'1.05rem', fontWeight:700, color:'var(--text)' }}>{value}</div><div style={{ fontSize:'.7rem', color:'var(--muted)' }}>{label}</div></div>
    </div>
  )
}
const navBtn = { background:'none', border:'none', cursor:'pointer', color:'var(--text)', padding:4, borderRadius:6, display:'flex', alignItems:'center' }
