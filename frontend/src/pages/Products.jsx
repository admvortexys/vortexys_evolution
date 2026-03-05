import { useEffect, useState, useRef } from 'react'
import { Package } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, fmt } from '../components/UI'

const empty = { sku:'', name:'', description:'', category_id:'', unit:'un', cost_price:'', sale_price:'', stock_quantity:'', min_stock:'', warehouse_id:'', barcode:'', image_base64:'' }

// ─── Upload de imagem ──────────────────────────────────────────────────────
function ImageUpload({ value, onChange }) {
  const ref = useRef()
  const { toast } = useToast()
  const handleFile = e => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Selecione uma imagem')
    if (file.size > 2 * 1024 * 1024) return toast.error('Imagem deve ter menos de 2MB')
    const reader = new FileReader()
    reader.onload = ev => onChange(ev.target.result)
    reader.readAsDataURL(file)
  }
  return (
    <div>
      <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Imagem do produto</label>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div
          onClick={() => ref.current.click()}
          style={{ width:72, height:72, borderRadius:10, border:'2px dashed var(--border)', background:'var(--bg-card2)',
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden',
            flexShrink:0 }}>
          {value
            ? <img src={value} alt="produto" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <span style={{ fontSize:'1.6rem' }}>📷</span>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <Btn size="sm" variant="ghost" onClick={() => ref.current.click()}>
            {value ? '🔄 Trocar imagem' : '+ Carregar imagem'}
          </Btn>
          {value && (
            <Btn size="sm" variant="danger" onClick={() => onChange('')}>🗑 Remover</Btn>
          )}
          <span style={{ fontSize:'.72rem', color:'var(--muted)' }}>JPG, PNG, WebP — máx. 2MB</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile}/>
    </div>
  )
}

// ─── Gerenciar categorias ─────────────────────────────────────────────────
function CategoryManager({ onClose, onRefresh }) {
  const [cats, setCats]     = useState([])
  const [form, setForm]     = useState({ name:'', color:'#7c3aed' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()

  const load = () => api.get('/categories?type=product').then(r => setCats(r.data))
  useEffect(() => { load() }, [])

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/categories/${editId}`, form)
      else        await api.post('/categories', { ...form, type:'product' })
      setForm({ name:'', color:'#7c3aed' }); setEditId(null); load(); onRefresh()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  const del = async id => {
    if (!await confirm('Excluir categoria?')) return
    try { await api.delete(`/categories/${id}`); load(); onRefresh() }
    catch(err) { toast.error(err.response?.data?.error||'Categoria em uso') }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <form onSubmit={save} style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
        <Input label="Nome" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required style={{ flex:1 }}/>
        <div>
          <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Cor</label>
          <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
            style={{ width:42, height:38, padding:2, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', cursor:'pointer' }}/>
        </div>
        <Btn type="submit" disabled={saving} size="sm">{editId ? 'Salvar' : '+ Adicionar'}</Btn>
        {editId && <Btn variant="ghost" size="sm" onClick={()=>{setEditId(null);setForm({name:'',color:'#7c3aed'})}}>Cancelar</Btn>}
      </form>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {cats.map(c => (
          <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:12, height:12, borderRadius:3, background:c.color||'#7c3aed', display:'inline-block' }}/>
              <span style={{ fontSize:'.9rem' }}>{c.name}</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <Btn size="sm" variant="ghost" onClick={()=>{setEditId(c.id);setForm({name:c.name,color:c.color||'#7c3aed'})}}>✏️</Btn>
              <Btn size="sm" variant="danger" onClick={()=>del(c.id)}>🗑</Btn>
            </div>
          </div>
        ))}
        {cats.length===0 && <p style={{ color:'var(--muted)', fontSize:'.88rem', textAlign:'center', padding:12 }}>Nenhuma categoria ainda</p>}
      </div>
    </div>
  )
}

export default function Products() {
  const [rows, setRows]         = useState([])
  const [cats, setCats]         = useState([])
  const [whs, setWhs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [catModal, setCatModal] = useState(false)
  const [form, setForm]         = useState(empty)
  const [editId, setEditId]     = useState(null)
  const [search, setSearch]     = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [saving, setSaving]     = useState(false)
  const { toast, confirm } = useToast()

  const loadCats = () => api.get('/categories?type=product').then(r => setCats(r.data))
  const load = () => {
    const p = new URLSearchParams()
    if (search)   p.set('search', search)
    if (lowStock) p.set('low_stock', 'true')
    setLoading(true)
    api.get(`/products?${p}`).then(r => setRows(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { loadCats(); api.get('/categories/warehouses').then(r => setWhs(r.data)) }, [])
  useEffect(() => { load() }, [search, lowStock])

  const openNew  = () => { setForm(empty); setEditId(null); setModal(true) }
  const openEdit = row => {
    setForm({
      ...row,
      category_id:  row.category_id||'',
      warehouse_id: row.warehouse_id||'',
      barcode:      row.barcode||'',
      image_base64: row.image_base64||''
    })
    setEditId(row.id); setModal(true)
  }
  const f = v => setForm(p => ({...p,...v}))

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/products/${editId}`, form)
      else        await api.post('/products', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const margin = fmt.margin(form.cost_price, form.sale_price)

  const cols = [
    { key:'image_base64', label:'', render: v => v
      ? <img src={v} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:'cover', border:'1px solid var(--border)' }}/>
      : <div style={{ width:36, height:36, borderRadius:6, background:'var(--bg-card2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>📦</div>
    },
    { key:'sku',            label:'SKU'       },
    { key:'name',           label:'Produto'   },
    { key:'barcode',        label:'Cód. Barras', render: v => v || '—' },
    { key:'category_name',  label:'Categoria' },
    { key:'stock_quantity', label:'Estoque', render:(v,row) => (
      <span style={{ color:parseFloat(v)<=parseFloat(row.min_stock)?'var(--danger)':'var(--success)', fontWeight:700 }}>
        {fmt.num(v)} {row.unit}
      </span>
    )},
    { key:'cost_price',  label:'Custo',  render: v => fmt.brl(v) },
    { key:'sale_price',  label:'Venda',  render: v => fmt.brl(v) },
    { key:'margin',  label:'Margem', render:(v,row) => {
      const m = fmt.margin(row.cost_price, v)
      return m ? <span style={{ color:m.color, fontWeight:700 }}>{m.pct}%</span> : '—'
    }},
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size="sm" variant="ghost"  onClick={e=>{e.stopPropagation();openEdit(row)}}>✏️</Btn>
        <Btn size="sm" variant="danger" onClick={async e=>{e.stopPropagation();if(await confirm('Desativar?'))api.delete(`/products/${row.id}`).then(load)}}>🗑</Btn>
      </div>
    )}
  ]

  return (
    <div>
      <PageHeader title="Produtos" subtitle="Catálogo e controle de produtos" icon={Package}
        action={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" onClick={()=>setCatModal(true)}>🏷 Categorias</Btn>
            <Btn onClick={openNew}>+ Novo produto</Btn>
          </div>
        }
      />

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nome, SKU ou código de barras..."
            style={{ flex:1, minWidth:200, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none' }}/>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.88rem', color:'var(--muted)', cursor:'pointer' }}>
            <input type="checkbox" checked={lowStock} onChange={e=>setLowStock(e.target.checked)}/> Estoque baixo
          </label>
        </div>
      </Card>

      <Card>
        {loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openEdit}/>}
      </Card>

      {/* Modal produto */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar produto':'Novo produto'} width={600}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Imagem */}
          <ImageUpload value={form.image_base64} onChange={v => f({ image_base64:v })}/>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="SKU *" value={form.sku} onChange={e=>f({sku:e.target.value})} required disabled={!!editId}/>
            <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Código de barras" value={form.barcode} onChange={e=>f({barcode:e.target.value})} placeholder="EAN-13, etc."/>
            <Select label="Unidade" value={form.unit} onChange={e=>f({unit:e.target.value})}>
              {['un','kg','g','l','ml','m','cm','cx','pc'].map(u=><option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <Select label="Categoria" value={form.category_id} onChange={e=>f({category_id:e.target.value})}>
                <option value="">Selecione...</option>
                {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <button type="button" onClick={()=>setCatModal(true)} style={{ background:'none', border:'none', color:'var(--primary)', fontSize:'.75rem', cursor:'pointer', marginTop:4, padding:0 }}>+ Gerenciar categorias</button>
            </div>
            <Select label="Depósito" value={form.warehouse_id} onChange={e=>f({warehouse_id:e.target.value})}>
              <option value="">Selecione...</option>
              {whs.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <Input label="Preço de custo (R$)" type="number" step="0.01" value={form.cost_price} onChange={e=>f({cost_price:e.target.value})}/>
            <Input label="Preço de venda (R$)" type="number" step="0.01" value={form.sale_price} onChange={e=>f({sale_price:e.target.value})}/>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Margem</label>
              <div style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', fontSize:'1rem', fontWeight:900, color:margin?.color||'var(--muted)' }}>
                {margin ? `${margin.pct}%` : '—'}
              </div>
            </div>
          </div>

          {!editId && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <Input label="Estoque inicial" type="number" step="0.01" value={form.stock_quantity} onChange={e=>f({stock_quantity:e.target.value})}/>
              <Input label="Estoque mínimo"  type="number" step="0.01" value={form.min_stock}      onChange={e=>f({min_stock:e.target.value})}/>
            </div>
          )}
          {editId && <Input label="Estoque mínimo" type="number" step="0.01" value={form.min_stock} onChange={e=>f({min_stock:e.target.value})}/>}

          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Descrição</label>
            <textarea value={form.description||''} onChange={e=>f({description:e.target.value})} rows={2}
              style={{ width:'100%',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',padding:'9px 12px',fontSize:'.9rem',outline:'none',resize:'vertical' }}/>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={catModal} onClose={()=>setCatModal(false)} title="🏷 Gerenciar Categorias de Produtos" width={440}>
        <CategoryManager onClose={()=>setCatModal(false)} onRefresh={loadCats}/>
      </Modal>
    </div>
  )
}
