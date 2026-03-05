import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, fmt, maskPhone, smartDocument } from '../components/UI'

const empty = { type:'client', name:'', document:'', email:'', phone:'', address:'', city:'', state:'', notes:'' }

export default function Clients() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(empty)
  const [editId, setEditId]   = useState(null)
  const [search, setSearch]   = useState('')
  const [type, setType]       = useState('')
  const [saving, setSaving]   = useState(false)
  const { toast, confirm } = useToast()

  const load = () => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (type)   p.set('type', type)
    setLoading(true)
    api.get(`/clients?${p}`).then(r=>setRows(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => { load() }, [search, type])

  const openNew  = () => { setForm(empty); setEditId(null); setModal(true) }
  const openEdit = row => { setForm({...row}); setEditId(row.id); setModal(true) }
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
    { key:'email',    label:'E-mail'   },
    { key:'city',     label:'Cidade'   },
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size="sm" variant="ghost"  onClick={e=>{e.stopPropagation();openEdit(row)}}>✏️</Btn>
        <Btn size="sm" variant="danger" onClick={async e=>{e.stopPropagation();if(await confirm('Desativar?'))api.delete(`/clients/${row.id}`).then(load)}}>🗑</Btn>
      </div>
    )}
  ]

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Clientes e fornecedores" icon={Users} action={<Btn onClick={openNew}>+ Novo</Btn>}/>

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nome, CPF/CNPJ ou telefone..."
            style={{ flex:1, minWidth:200, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none' }}/>
          {['','client','supplier','both'].map(t=>(
            <Btn key={t} size="sm" variant={type===t?'primary':'ghost'} onClick={()=>setType(t)}>
              {t===''?'Todos': typeMap[t]?.label}
            </Btn>
          ))}
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openEdit}/>}</Card>

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
              <input
                value={form.document}
                onChange={e => f({ document: smartDocument(e.target.value) })}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                maxLength={18}
                style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'}
              />
            </div>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Celular / Telefone</label>
              <input
                value={form.phone}
                onChange={e => f({ phone: maskPhone(e.target.value) })}
                placeholder="(11) 99999-9999"
                maxLength={15}
                style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', width:'100%' }}
                onFocus={e=>e.target.style.borderColor='var(--primary)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'}
              />
            </div>
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={e=>f({email:e.target.value})}/>
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
    </div>
  )
}
