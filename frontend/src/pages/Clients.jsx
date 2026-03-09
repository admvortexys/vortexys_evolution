/**
 * Clientes: CRUD, busca, filtros e histórico de compras.
 */
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, KpiCard, fmt, maskPhone, smartDocument } from '../components/UI'

const empty = { type:'client', name:'', document:'', email:'', phone:'', address:'', city:'', state:'', notes:'', birthday:'', tags:[] }
const TAG_OPTIONS = ['VIP','Atacado','Garantia','Manutenção','Revenda','Funcionário','Inadimplente']

export default function Clients() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(empty)
  const [editId, setEditId]   = useState(null)
  const [search, setSearch]   = useState('')
  const [type, setType]       = useState('client')
  const [hasOrders, setHasOrders] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [histModal, setHistModal] = useState(null)
  const [history, setHistory] = useState(null)
  const [dupWarning, setDupWarning] = useState(null)
  const { toast, confirm } = useToast()

  const load = () => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (type)   p.set('type', type)
    if (hasOrders) p.set('has_orders', hasOrders)
    setLoading(true)
    api.get(`/clients?${p}`).then(r=>setRows(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => { load() }, [search, type, hasOrders])

  const openNew  = () => { setForm(empty); setEditId(null); setDupWarning(null); setModal(true) }
  const openEdit = row => { setForm({...row, birthday: row.birthday ? row.birthday.slice(0,10) : ''}); setEditId(row.id); setDupWarning(null); setModal(true) }
  const f = v => setForm(p=>({...p,...v}))

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/clients/${editId}`, { ...form, type: form.type || 'client' })
      else        await api.post('/clients', { ...form, type: 'client' })
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const openHistory = async row => {
    setHistModal({ name: row.name, loading: true })
    try {
      const [client, hist] = await Promise.all([
        api.get(`/clients/${row.id}`),
        api.get(`/clients/${row.id}/history`)
      ])
      setHistory(hist.data)
      setHistModal({ ...client.data, id: row.id })
    } catch {
      toast.error('Erro ao carregar histórico')
      setHistModal(null)
    }
  }

  const typeMap = {
    client:   {label:'Cliente',    color:'#6366f1'},
    supplier: {label:'Fornecedor', color:'#f59e0b'},
    both:     {label:'Ambos',      color:'#10b981'},
  }

  const checkDuplicate = async (field, value) => {
    if (!value || value.length < 3 || editId) return
    const clean = value.replace(/\D/g, '')
    if (clean.length < 5) return
    try {
      const { data } = await api.get(`/clients?search=${encodeURIComponent(value)}`)
      const dup = data.find(c => c.id !== editId && (
        (field === 'phone' && c.phone?.replace(/\D/g, '') === clean) ||
        (field === 'document' && c.document?.replace(/\D/g, '') === clean)
      ))
      setDupWarning(dup ? `Já existe: ${dup.name} (${field === 'phone' ? dup.phone : dup.document})` : null)
    } catch {}
  }

  const cols = [
    { key:'name',     label:'Nome', render:(_,row) => (
      <div>
        <div style={{ fontWeight:600 }}>{row.name}</div>
        {(() => {
          const tags = Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? (() => { try { const p = JSON.parse(row.tags); return Array.isArray(p) ? p : []; } catch { return []; } })() : [])
          return tags.length > 0 && (
            <div style={{ display:'flex', gap:3, marginTop:2 }}>{tags.slice(0,3).map((t,i) => <span key={i} style={{ fontSize:'.65rem', background:'rgba(99,102,241,.12)', color:'#6366f1', padding:'1px 5px', borderRadius:4 }}>{String(t)}</span>)}</div>
          )
        })()}
      </div>
    )},
    { key:'type',     label:'Tipo', render: v => {
      const t = typeMap[v || 'client'] || typeMap.client
      return <Badge color={t.color}>{t.label}</Badge>
    }},
    { key:'phone',    label:'Telefone' },
    { key:'order_count', label:'Pedidos', render: v => <span style={{ fontWeight:600 }}>{v || 0}</span> },
    { key:'last_order', label:'Última compra', render: v => v ? fmt.date(v) : '—' },
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:4 }} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>navigate('/orders', { state: { prefillClient: { id: row.id, name: row.name } } })} title="Novo pedido">🛒</Btn>
        <Btn size="sm" variant="ghost" onClick={()=>openEdit(row)} title="Editar">✏️</Btn>
      </div>
    )}
  ]

  const histTab = ['orders','transactions','leads','activities','conversations']
  const [hTab, setHTab] = useState('orders')

  const kpis = useMemo(() => {
    const total = rows.length
    const withOrders = rows.filter(r => r.order_count > 0).length
    const now = new Date()
    const thisMonth = rows.filter(r => r.last_order && new Date(r.last_order).getMonth() === now.getMonth() && new Date(r.last_order).getFullYear() === now.getFullYear()).length
    return { total, withOrders, thisMonth }
  }, [rows])

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Cadastro e histórico de clientes" icon={Users} action={<Btn onClick={openNew}>+ Novo cliente</Btn>}/>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12, marginBottom:18 }}>
        <KpiCard icon="👥" label="Total cadastrados" value={kpis.total} color="var(--primary)"/>
        <KpiCard icon="🛒" label="Com compras" value={kpis.withOrders} sub={`${kpis.total - kpis.withOrders} sem compra`} color="#10b981"/>
        <KpiCard icon="📅" label="Compraram no mês" value={kpis.thisMonth} color="#f59e0b"/>
      </div>

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nome, CPF/CNPJ ou telefone..."
            style={{ flex:1, minWidth:200, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none' }}/>
          <Btn size="sm" variant={showFilters?'primary':'ghost'} onClick={()=>setShowFilters(!showFilters)}>🔍 Filtros</Btn>
          {['','client'].map(t=>(
            <Btn key={t} size="sm" variant={type===t?'primary':'ghost'} onClick={()=>setType(t)}>
              {t===''?'Todos': 'Clientes'}
            </Btn>
          ))}
        </div>
        {showFilters && (
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Com compras</label>
              <select value={hasOrders} onChange={e=>setHasOrders(e.target.value)}
                style={{ height:34, padding:'0 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.85rem' }}>
                <option value="">Todos</option>
                <option value="true">Com compras</option>
                <option value="false">Sem compras</option>
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'flex-end' }}>
              <Btn variant="ghost" size="sm" onClick={()=>{ setHasOrders('') }}>Limpar filtros</Btn>
            </div>
          </div>
        )}
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openHistory}/>}</Card>

      {/* New/Edit modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar cliente':'Novo cliente'} width={560}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>CPF / CNPJ</label>
              <input value={form.document} onChange={e => f({ document: smartDocument(e.target.value) })} placeholder="000.000.000-00" maxLength={18}
                onBlur={e => { e.target.style.borderColor='var(--border)'; checkDuplicate('document', form.document) }}
                style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'}/>
            </div>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Celular / Telefone</label>
              <input value={form.phone} onChange={e => f({ phone: maskPhone(e.target.value) })} placeholder="(11) 99999-9999" maxLength={15}
                onBlur={e => { e.target.style.borderColor='var(--border)'; checkDuplicate('phone', form.phone) }}
                style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'}/>
            </div>
            {dupWarning && (
              <div style={{ gridColumn:'1/-1', background:'rgba(249,115,22,.1)', border:'1px solid rgba(249,115,22,.3)', borderRadius:8, padding:'8px 12px', fontSize:'.82rem', color:'#f97316' }}>
                ⚠️ {dupWarning}
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="E-mail" type="email" value={form.email} onChange={e=>f({email:e.target.value})}/>
            <Input label="Aniversário" type="date" value={form.birthday} onChange={e=>f({birthday:e.target.value})}/>
          </div>
          <Input label="Endereço" value={form.address} onChange={e=>f({address:e.target.value})}/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Cidade" value={form.city} onChange={e=>f({city:e.target.value})}/>
            <Input label="Estado" value={form.state} onChange={e=>f({state:e.target.value})} placeholder="SP"/>
          </div>
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Tags</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {TAG_OPTIONS.map(tag => {
                const active = (form.tags||[]).includes(tag)
                return <button key={tag} type="button" onClick={()=>f({tags: active ? (form.tags||[]).filter(t=>t!==tag) : [...(form.tags||[]), tag]})}
                  style={{ padding:'4px 10px', fontSize:'.78rem', borderRadius:6, border:`1px solid ${active?'var(--primary)':'var(--border)'}`,
                    background:active?'rgba(168,85,247,.15)':'transparent', color:active?'var(--primary)':'var(--muted)', cursor:'pointer', fontWeight:active?600:400 }}>
                  {tag}
                </button>
              })}
            </div>
          </div>
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Observações</label>
            <textarea value={form.notes} onChange={e=>f({notes:e.target.value})} rows={2}
              style={{ width:'100%',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',padding:'9px 12px',fontSize:'.9rem',outline:'none',resize:'vertical' }}/>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      {/* History modal */}
      {histModal && !histModal.loading && (
        <Modal open={!!histModal} onClose={()=>{setHistModal(null);setHistory(null)}} title={`${histModal.name} — Histórico`} width={640}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Client info summary */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10 }}>
              {histModal.phone && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Telefone</div><div>{histModal.phone}</div></div>}
              {histModal.email && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>E-mail</div><div>{histModal.email}</div></div>}
              {histModal.document && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>CPF/CNPJ</div><div>{histModal.document}</div></div>}
              {histModal.city && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Cidade</div><div>{histModal.city}{histModal.state ? ` / ${histModal.state}` : ''}</div></div>}
              {histModal.birthday && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Aniversário</div><div>{fmt.date(histModal.birthday)}</div></div>}
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)' }}>
              {[{k:'orders',l:'Pedidos',c:history?.orders?.length},{k:'leads',l:'Leads',c:history?.leads?.length},{k:'activities',l:'Atividades',c:history?.activities?.length},{k:'conversations',l:'WhatsApp',c:history?.conversations?.length}].map(t=>(
                <button key={t.k} onClick={()=>setHTab(t.k)}
                  style={{ padding:'8px 14px', fontSize:'.8rem', fontWeight: hTab===t.k?700:500, color: hTab===t.k?'var(--primary)':'var(--muted)',
                    background:'transparent', border:'none', borderBottom: hTab===t.k?'2px solid var(--primary)':'2px solid transparent', cursor:'pointer' }}>
                  {t.l} {t.c > 0 && <span style={{ fontSize:'.7rem', opacity:.7 }}>({t.c})</span>}
                </button>
              ))}
            </div>

            {history && <>
              {hTab === 'orders' && (
                history.orders.length === 0 ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhum pedido</p> :
                history.orders.map(o => (
                  <div key={o.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div><div style={{ fontWeight:600, fontSize:'.88rem' }}>#{o.number}</div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{fmt.date(o.created_at)}</div></div>
                    <div style={{ textAlign:'right' }}><div style={{ fontWeight:700 }}>{fmt.brl(o.total)}</div><Badge color={o.status==='delivered'?'#10b981':o.status==='cancelled'?'#ef4444':'#3b82f6'}>{o.status}</Badge></div>
                  </div>
                ))
              )}
              {hTab === 'leads' && (
                history.leads.length === 0 ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhum lead</p> :
                history.leads.map(l => (
                  <div key={l.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div><div style={{ fontWeight:600, fontSize:'.88rem' }}>{l.name}</div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{l.pipeline_name} • {fmt.date(l.created_at)}</div></div>
                    <Badge color={l.status==='won'?'#10b981':l.status==='lost'?'#ef4444':'#6366f1'}>{l.status==='won'?'Ganho':l.status==='lost'?'Perdido':'Aberto'}</Badge>
                  </div>
                ))
              )}
              {hTab === 'activities' && (
                history.activities.length === 0 ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhuma atividade</p> :
                history.activities.map(a => (
                  <div key={a.id} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <span>{a.type === 'call' ? '📞' : a.type === 'email' ? '📧' : a.type === 'meeting' ? '🤝' : '📝'}</span>
                    <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:'.88rem', textDecoration: a.done ? 'line-through' : '' }}>{a.title}</div>
                    {a.description && <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{a.description}</div>}
                    <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>{a.user_name} • {fmt.date(a.created_at)}</div></div>
                  </div>
                ))
              )}
              {hTab === 'conversations' && (
                history.conversations.length === 0 ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhuma conversa</p> :
                history.conversations.map(c => (
                  <div key={c.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div><div style={{ fontWeight:600, fontSize:'.88rem' }}>💬 {c.contact_name || c.contact_phone}</div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{c.last_message?.substring(0,60)}</div></div>
                    <Badge color={c.status==='closed'?'#6b7280':'#10b981'}>{c.status}</Badge>
                  </div>
                ))
              )}
            </>}

            <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" onClick={()=>openEdit(histModal)}>✏️ Editar</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
