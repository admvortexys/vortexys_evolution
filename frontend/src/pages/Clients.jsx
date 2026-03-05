import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, fmt, maskPhone, smartDocument } from '../components/UI'

const empty = { type:'client', name:'', document:'', email:'', phone:'', address:'', city:'', state:'', notes:'', birthday:'' }

export default function Clients() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(empty)
  const [editId, setEditId]   = useState(null)
  const [search, setSearch]   = useState('')
  const [type, setType]       = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [saving, setSaving]   = useState(false)
  const [histModal, setHistModal] = useState(null)
  const [history, setHistory] = useState(null)
  const { toast, confirm } = useToast()

  const load = () => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (type)   p.set('type', type)
    if (cityFilter) p.set('city', cityFilter)
    setLoading(true)
    api.get(`/clients?${p}`).then(r=>setRows(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => { load() }, [search, type, cityFilter])

  const openNew  = () => { setForm(empty); setEditId(null); setModal(true) }
  const openEdit = row => { setForm({...row, birthday: row.birthday ? row.birthday.slice(0,10) : ''}); setEditId(row.id); setModal(true) }
  const f = v => setForm(p=>({...p,...v}))

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/clients/${editId}`, form)
      else        await api.post('/clients', form)
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

  const cols = [
    { key:'name',     label:'Nome'  },
    { key:'type',     label:'Tipo', render: v => <Badge color={typeMap[v]?.color}>{typeMap[v]?.label}</Badge> },
    { key:'document', label:'CPF/CNPJ' },
    { key:'phone',    label:'Telefone' },
    { key:'city',     label:'Cidade'   },
    { key:'order_count', label:'Pedidos', render: v => v || 0 },
    { key:'total_bought', label:'Total comprado', render: v => v ? fmt.brl(v) : '—' },
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();openHistory(row)}} title="Histórico">📋</Btn>
        <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();openEdit(row)}}>✏️</Btn>
        <Btn size="sm" variant="danger" onClick={async e=>{e.stopPropagation();if(await confirm('Desativar?'))api.delete(`/clients/${row.id}`).then(load)}}>🗑</Btn>
      </div>
    )}
  ]

  const histTab = ['orders','transactions','leads','activities','conversations']
  const [hTab, setHTab] = useState('orders')

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Clientes, fornecedores e histórico" icon={Users} action={<Btn onClick={openNew}>+ Novo</Btn>}/>

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nome, CPF/CNPJ ou telefone..."
            style={{ flex:1, minWidth:200, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none' }}/>
          <input value={cityFilter} onChange={e=>setCityFilter(e.target.value)} placeholder="🏙️ Cidade..."
            style={{ width:140, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none' }}/>
          {['','client','supplier','both'].map(t=>(
            <Btn key={t} size="sm" variant={type===t?'primary':'ghost'} onClick={()=>setType(t)}>
              {t===''?'Todos': typeMap[t]?.label}
            </Btn>
          ))}
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openHistory}/>}</Card>

      {/* New/Edit modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar':'Novo cliente / fornecedor'} width={560}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Select label="Tipo" value={form.type} onChange={e=>f({type:e.target.value})}>
              <option value="client">Cliente</option>
              <option value="supplier">Fornecedor</option>
              <option value="both">Ambos</option>
            </Select>
            <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>CPF / CNPJ</label>
              <input value={form.document} onChange={e => f({ document: smartDocument(e.target.value) })} placeholder="000.000.000-00" maxLength={18}
                style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
            </div>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Celular / Telefone</label>
              <input value={form.phone} onChange={e => f({ phone: maskPhone(e.target.value) })} placeholder="(11) 99999-9999" maxLength={15}
                style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
            </div>
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
              {[{k:'orders',l:'Pedidos',c:history?.orders?.length},{k:'leads',l:'Leads',c:history?.leads?.length},{k:'transactions',l:'Financeiro',c:history?.transactions?.length},{k:'activities',l:'Atividades',c:history?.activities?.length},{k:'conversations',l:'WhatsApp',c:history?.conversations?.length}].map(t=>(
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
              {hTab === 'transactions' && (
                history.transactions.length === 0 ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhuma transação</p> :
                history.transactions.map(t => (
                  <div key={t.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div><div style={{ fontWeight:600, fontSize:'.88rem' }}>{t.title}</div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{fmt.date(t.due_date)}</div></div>
                    <div style={{ fontWeight:700, color: t.type==='income'?'#10b981':'#ef4444' }}>{t.type==='income'?'+':'-'}{fmt.brl(t.amount)}</div>
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
