/**
 * Vendedores: CRUD, comissão, metas de vendas.
 */
import { useEffect, useState, useMemo } from 'react'
import { Trophy } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import {
  PageHeader, Card, Table, Btn, Modal, Input, KpiCard,
  Badge, Spinner, fmt, maskPhone
} from '../components/UI'

const emptyForm = {
  name: '', email: '', phone: '', document: '',
  commission: 5, goal: '', notes: '', active: true
}

// ─── Barra de progresso da meta ───────────────────────────────────────────
function GoalBar({ value, goal }) {
  const pct   = goal > 0 ? Math.min((value / goal) * 100, 100) : 0
  const color = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#b44fff'
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>
        <span>{fmt.brl(value)}</span>
        <span style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height:5, background:'var(--bg-card2)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: pct >= 100 ? '#10b981' : 'var(--grad)', borderRadius:99, transition:'width .4s' }}/>
      </div>
      <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:3 }}>Meta: {fmt.brl(goal)}</div>
    </div>
  )
}

// ─── Drawer de detalhe do vendedor ────────────────────────────────────────
function SellerDetail({ seller, onClose, onEdit }) {
  if (!seller) return null

  const totalComissao = seller.commissions?.reduce((a, c) => a + Number(c.commission_total), 0) || 0

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:998, display:'flex', alignItems:'flex-start', justifyContent:'flex-end'
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 480, height:'100%', background:'var(--bg-card)',
        borderLeft:'1px solid var(--border)', padding:28, overflowY:'auto',
        animation:'slideIn .2s ease'
      }}>
        <style>{`@keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}`}</style>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:'var(--grad)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem', fontWeight:800, flexShrink:0 }}>
              {seller.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:'1.1rem' }}>{seller.name}</div>
              <div style={{ fontSize:'.78rem', color:'var(--muted)', marginTop:2 }}>{seller.email || '—'}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn size="sm" variant="secondary" onClick={() => onEdit(seller)}>✏️ Editar</Btn>
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', fontSize:'1.4rem', cursor:'pointer', padding:4 }}>×</button>
          </div>
        </div>

        {/* KPIs do vendedor */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
          <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:14, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>Comissão %</div>
            <div style={{ fontSize:'1.4rem', fontWeight:900, color:'var(--primary)' }}>{seller.commission}%</div>
          </div>
          <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:14, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>Comissões (6m)</div>
            <div style={{ fontSize:'1.4rem', fontWeight:900, color:'#10b981' }}>{fmt.brl(totalComissao)}</div>
          </div>
          <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:14, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>Pedidos</div>
            <div style={{ fontSize:'1.4rem', fontWeight:900 }}>{seller.orders?.length || 0}</div>
          </div>
          <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:14, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>Meta Mensal</div>
            <div style={{ fontSize:'1.1rem', fontWeight:700 }}>{fmt.brl(seller.goal)}</div>
          </div>
        </div>

        {/* Info pessoal */}
        <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:16, border:'1px solid var(--border)', marginBottom:20 }}>
          <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Informações</div>
          {[
            ['📞', 'Telefone', seller.phone],
            ['🪪', 'CPF/CNPJ', seller.document],
            ['📝', 'Notas', seller.notes],
          ].map(([icon, label, val]) => val ? (
            <div key={label} style={{ display:'flex', gap:10, marginBottom:8, fontSize:'.85rem' }}>
              <span>{icon}</span>
              <span style={{ color:'var(--muted)' }}>{label}:</span>
              <span>{val}</span>
            </div>
          ) : null)}
        </div>

        {/* Histórico de comissões mensais */}
        {seller.commissions?.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Comissões por Mês</div>
            {seller.commissions.map(c => (
              <div key={c.month} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)', marginBottom:6, fontSize:'.83rem' }}>
                <span style={{ color:'var(--muted)' }}>{c.month}</span>
                <span style={{ color:'var(--muted)' }}>Vendas: {fmt.brl(c.sales_total)}</span>
                <span style={{ color:'#10b981', fontWeight:700 }}>💰 {fmt.brl(c.commission_total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Últimos pedidos */}
        {seller.orders?.length > 0 && (
          <div>
            <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Últimos Pedidos</div>
            {seller.orders.slice(0, 10).map(o => (
              <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)', marginBottom:6, fontSize:'.82rem' }}>
                <div>
                  <div style={{ fontWeight:600 }}>{o.client_name || '—'}</div>
                  <div style={{ color:'var(--muted)', fontSize:'.75rem' }}>{o.code} · {fmt.date(o.created_at)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:700 }}>{fmt.brl(o.total)}</div>
                  <div style={{ fontSize:'.72rem', color: o.status === 'delivered' ? '#10b981' : o.status === 'cancelled' ? '#ef4444' : '#f59e0b' }}>
                    {o.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────
export default function Sellers() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(emptyForm)
  const [editId, setEditId]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [errors, setErrors]   = useState({})
  const [detail, setDetail]   = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const { toast, confirm } = useToast()

  const load = () => {
    setLoading(true)
    api.get('/sellers').then(r => setRows(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search) return rows
    const s = search.toLowerCase()
    return rows.filter(r =>
      r.name.toLowerCase().includes(s) ||
      r.email?.toLowerCase().includes(s) ||
      r.phone?.includes(s)
    )
  }, [rows, search])

  const kpis = useMemo(() => {
    const total  = rows.length
    const active = rows.filter(r => r.active).length
    const salesM = rows.reduce((a, r) => a + Number(r.sales_month || 0), 0)
    const ordersM = rows.reduce((a, r) => a + Number(r.orders_month || 0), 0)
    const commissionM = rows.reduce((a, r) => a + (Number(r.sales_month || 0) * Number(r.commission || 0) / 100), 0)
    return { total, active, salesM, ordersM, commissionM }
  }, [rows])

  // Abrir detalhe
  const openDetail = async (row) => {
    setLoadingDetail(true)
    setDetail({ name: row.name }) // optimistic
    try {
      const r = await api.get(`/sellers/${row.id}`)
      setDetail(r.data)
    } catch { setDetail(null) }
    finally { setLoadingDetail(false) }
  }

  const openNew = () => {
    setForm(emptyForm); setEditId(null); setErrors({}); setModal(true)
  }
  const openEdit = (s) => {
    setForm({ name: s.name, email: s.email||'', phone: s.phone||'', document: s.document||'', commission: s.commission, goal: s.goal, notes: s.notes||'', active: s.active })
    setEditId(s.id); setErrors({}); setModal(true)
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Nome obrigatório'
    if (form.commission < 0 || form.commission > 100) e.commission = '0 a 100%'
    return e
  }

  const save = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const payload = { ...form, commission: Number(form.commission), goal: Number(form.goal) || 0 }
      if (editId) await api.put(`/sellers/${editId}`, payload)
      else await api.post('/sellers', payload)
      setModal(false)
      load()
    } catch(err) {
      setErrors({ api: err.response?.data?.error || 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  const inactivate = async (id) => {
    const seller = rows.find(r => r.id === id)
    const action = seller?.active ? 'Inativar' : 'Reativar'
    if (!await confirm(`${action} este vendedor?`)) return
    try {
      await api.put(`/sellers/${id}`, { ...seller, active: !seller.active })
      load()
    } catch { toast.error('Erro ao alterar status') }
  }

  const cols = [
    {
      key: 'name', label: 'Vendedor',
      render: (v, row) => (
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'var(--grad)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'.9rem', flexShrink:0 }}>
            {v?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight:600, fontSize:'.88rem' }}>{v}</div>
            <div style={{ fontSize:'.73rem', color:'var(--muted)' }}>{row.email || row.phone || '—'}</div>
          </div>
        </div>
      )
    },
    {
      key: 'commission', label: 'Comissão %',
      render: v => <Badge color="#b44fff">{v}%</Badge>
    },
    {
      key: 'sales_month', label: 'Comissão R$',
      render: (v, row) => {
        const val = Number(v||0) * Number(row.commission||0) / 100
        return val > 0 ? <span style={{ fontWeight:700, color:'#f97316' }}>{fmt.brl(val)}</span> : '—'
      }
    },
    {
      key: 'sales_month', label: 'Vendas no Mês',
      render: (v, row) => <GoalBar value={Number(v||0)} goal={Number(row.goal||0)} />
    },
    {
      key: 'orders_month', label: 'Pedidos',
      render: v => <span style={{ fontWeight:700 }}>{v || 0}</span>
    },
    {
      key: 'active', label: 'Status',
      render: v => <Badge color={v ? '#10b981' : '#6b7280'}>{v ? 'Ativo' : 'Inativo'}</Badge>
    },
    {
      key: 'id', label: 'Ações',
      render: (v, row) => (
        <div style={{ display:'flex', gap:6 }} onClick={e => e.stopPropagation()}>
          <Btn size="sm" variant="secondary" onClick={() => openEdit(row)}>✏️</Btn>
          <Btn size="sm" variant={row.active ? 'danger' : 'success'} onClick={() => inactivate(v)}>
            {row.active ? 'Inativar' : 'Ativar'}
          </Btn>
        </div>
      )
    },
  ]

  return (
    <div>
      <PageHeader
        title="Vendedores"
        subtitle="Gerencie sua equipe de vendas e acompanhe comissões"
        icon={Trophy}
        action={<Btn onClick={openNew}>+ Novo Vendedor</Btn>}
      />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:14, marginBottom:24 }}>
        <KpiCard icon="👤" label="Vendedores Ativos" value={kpis.active} sub={`${kpis.total} total`} color="var(--primary)" />
        <KpiCard icon="💰" label="Vendas no Mês" value={fmt.brl(kpis.salesM)} sub="pedidos entregues" color="#10b981" />
        <KpiCard icon="🛒" label="Pedidos no Mês" value={kpis.ordersM} sub="todos os status" color="#f59e0b" />
        <KpiCard icon="📊" label="Ticket Médio" value={kpis.ordersM > 0 ? fmt.brl(kpis.salesM / kpis.ordersM) : '—'} sub="por pedido" color="#6366f1" />
        <KpiCard icon="💸" label="Comissão a Pagar" value={fmt.brl(kpis.commissionM)} sub="estimativa do mês" color="#f97316" />
      </div>

      <Card>
        {/* Busca */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, gap:12, flexWrap:'wrap' }}>
          <input
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 14px', fontSize:'.88rem', outline:'none', flex:'1 1 200px', minWidth:0 }}
          />
          <span style={{ fontSize:'.82rem', color:'var(--muted)', whiteSpace:'nowrap' }}>{filtered.length} vendedor{filtered.length !== 1 ? 'es' : ''}</span>
        </div>

        {loading ? <Spinner /> : (
          <Table
            columns={cols}
            data={filtered}
            onRow={openDetail}
          />
        )}
      </Card>

      {/* Modal Criar/Editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Vendedor' : 'Novo Vendedor'} width={560}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} error={errors.name} placeholder="Nome completo" />
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="email@exemplo.com" />
          <Input label="Telefone" value={form.phone} onChange={e => setForm(f => ({...f, phone: maskPhone(e.target.value)}))} placeholder="(11) 99999-9999" />
          <Input label="CPF / CNPJ" value={form.document} onChange={e => setForm(f => ({...f, document: e.target.value}))} placeholder="000.000.000-00" />
          <Input label="Comissão (%)" type="number" min={0} max={100} step={0.5} value={form.commission} onChange={e => setForm(f => ({...f, commission: e.target.value}))} error={errors.commission} />
          <Input label="Meta Mensal (R$)" type="number" min={0} value={form.goal} onChange={e => setForm(f => ({...f, goal: e.target.value}))} placeholder="0" />
          <div style={{ gridColumn:'1/-1' }}>
            <Input label="Observações" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Anotações sobre o vendedor..." />
          </div>
          {editId && (
            <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10 }}>
              <input type="checkbox" id="active_chk" checked={form.active} onChange={e => setForm(f => ({...f, active: e.target.checked}))} />
              <label htmlFor="active_chk" style={{ fontSize:'.88rem' }}>Vendedor ativo</label>
            </div>
          )}
          {errors.api && <div style={{ gridColumn:'1/-1', color:'var(--danger)', fontSize:'.82rem', background:'#ef444415', padding:'8px 12px', borderRadius:8 }}>{errors.api}</div>}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Salvando…' : editId ? 'Salvar Alterações' : 'Criar Vendedor'}</Btn>
        </div>
      </Modal>

      {/* Drawer de detalhe */}
      {detail && (
        <SellerDetail
          seller={detail}
          onClose={() => setDetail(null)}
          onEdit={(s) => { setDetail(null); openEdit(s) }}
        />
      )}
    </div>
  )
}
