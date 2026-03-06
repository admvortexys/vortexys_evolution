/**
 * Fornecedores: CRUD e busca de fornecedores.
 */
import { useEffect, useState, useMemo } from 'react'
import { Package } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Badge, Spinner, KpiCard, fmt, maskPhone, smartDocument } from '../components/UI'

const empty = { type:'supplier', name:'', document:'', email:'', phone:'', address:'', city:'', state:'', notes:'', tags:[] }
const TAG_OPTIONS = ['Atacado','Indústria','Distribuidor','Importador','Revenda','Parceiro']

export default function Fornecedores() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(empty)
  const [editId, setEditId]   = useState(null)
  const [search, setSearch]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [dupWarning, setDupWarning] = useState(null)
  const { toast } = useToast()

  const load = () => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    p.set('type', 'supplier')
    setLoading(true)
    api.get(`/clients?${p}`).then(r=>setRows(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => { load() }, [search])

  const openNew  = () => { setForm(empty); setEditId(null); setDupWarning(null); setModal(true) }
  const openEdit = row => { setForm({...row}); setEditId(row.id); setDupWarning(null); setModal(true) }
  const f = v => setForm(p=>({...p,...v}))

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/clients/${editId}`, { ...form, type: form.type || 'supplier' })
      else        await api.post('/clients', { ...form, type: 'supplier' })
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const typeMap = {
    supplier: {label:'Fornecedor', color:'#f59e0b'},
    both:     {label:'Ambos',      color:'#10b981'},
  }

  const checkDuplicate = async (field, value) => {
    if (!value || value.length < 3 || editId) return
    const clean = value.replace(/\D/g, '')
    if (clean.length < 5) return
    try {
      const { data } = await api.get(`/clients?type=supplier&search=${encodeURIComponent(value)}`)
      const dup = data.find(c => c.id !== editId && (
        (field === 'phone' && c.phone?.replace(/\D/g, '') === clean) ||
        (field === 'document' && c.document?.replace(/\D/g, '') === clean)
      ))
      setDupWarning(dup ? `Já existe: ${dup.name} (${field === 'phone' ? dup.phone : dup.document})` : null)
    } catch {}
  }

  const cols = [
    { key:'name', label:'Nome', render:(_,row) => (
      <div>
        <div style={{ fontWeight:600 }}>{row.name}</div>
        {(() => {
          const tags = Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? (() => { try { const p = JSON.parse(row.tags); return Array.isArray(p) ? p : []; } catch { return []; } })() : [])
          return tags.length > 0 && (
            <div style={{ display:'flex', gap:3, marginTop:2 }}>{tags.slice(0,3).map((t,i) => <span key={i} style={{ fontSize:'.65rem', background:'rgba(245,158,11,.12)', color:'#f59e0b', padding:'1px 5px', borderRadius:4 }}>{String(t)}</span>)}</div>
          )
        })()}
      </div>
    )},
    { key:'type', label:'Tipo', render: v => {
      const t = typeMap[v || 'supplier'] || typeMap.supplier
      return <Badge color={t.color}>{t.label}</Badge>
    }},
    { key:'phone', label:'Telefone' },
    { key:'document', label:'CPF/CNPJ', render: v => v || '—' },
    { key:'city', label:'Cidade', render: v => v || '—' },
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:4 }} onClick={e=>e.stopPropagation()}>
        <Btn size="sm" variant="ghost" onClick={()=>openEdit(row)} title="Editar">✏️</Btn>
      </div>
    )}
  ]

  const kpis = useMemo(() => ({ total: rows.length }), [rows])

  return (
    <div>
      <PageHeader title="Fornecedores" subtitle="Cadastro de fornecedores" icon={Package} action={<Btn onClick={openNew}>+ Novo fornecedor</Btn>}/>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12, marginBottom:18 }}>
        <KpiCard icon="📦" label="Total cadastrados" value={kpis.total} color="#f59e0b"/>
      </div>

      <Card style={{ marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nome, CPF/CNPJ ou telefone..."
          style={{ flex:1, minWidth:200, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}/>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={row=>openEdit(row)}/>}</Card>

      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar fornecedor':'Novo fornecedor'} width={560}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
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
          <Input label="E-mail" type="email" value={form.email} onChange={e=>f({email:e.target.value})}/>
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
                  style={{ padding:'4px 10px', fontSize:'.78rem', borderRadius:6, border:`1px solid ${active?'#f59e0b':'var(--border)'}`,
                    background:active?'rgba(245,158,11,.15)':'transparent', color:active?'#f59e0b':'var(--muted)', cursor:'pointer', fontWeight:active?600:400 }}>
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
    </div>
  )
}
