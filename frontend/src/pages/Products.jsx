import { useEffect, useState, useRef } from 'react'
import { Package, Search } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, fmt } from '../components/UI'

const emptyForm = {
  sku:'', name:'', description:'', category_id:'', unit:'un', cost_price:'', sale_price:'', stock_quantity:'', min_stock:'',
  warehouse_id:'', barcode:'', image_base64:'',
  brand:'', model:'', color:'', condition:'new', supplier:'', gtin:'', photos:[], variations:[],
  promotion_price:'', pix_price:'', card_price:'', commission:'',
  ncm:'', cest:'', cst_csosn:'', cfop:'', fiscal_origin:'0', nfe_rules:{},
  controls_stock:true, controls_imei:false, controls_serial:false, location:'',
  warranty_manufacturer:'', warranty_store:'', exchange_policy:'', technical_support:'',
  ram:'', storage:'', screen:'', battery:'', is_5g:false, dual_chip:false, esim:false,
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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
      <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Imagem principal</label>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div onClick={()=>ref.current.click()}
          style={{ width:72, height:72, borderRadius:10, border:'2px dashed var(--border)', background:'var(--bg-card2)',
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden', flexShrink:0 }}>
          {value ? <img src={value} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:'1.6rem' }}>📷</span>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <Btn size="sm" variant="ghost" onClick={()=>ref.current.click()}>{value?'🔄 Trocar':'+ Carregar'}</Btn>
          {value && <Btn size="sm" variant="danger" onClick={()=>onChange('')}>🗑 Remover</Btn>}
          <span style={{ fontSize:'.72rem', color:'var(--muted)' }}>JPG, PNG, WebP — max 2MB</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile}/>
    </div>
  )
}

function TabBtn({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'9px 16px', fontSize:'.82rem', fontWeight: active?700:500,
      color: active?'#fff':'var(--muted)', background: active?'rgba(168,85,247,.2)':'transparent',
      border:'none', borderBottom: active?'2px solid var(--primary)':'2px solid transparent',
      cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap',
    }}>{children}</button>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:'.88rem' }}>
      <div onClick={()=>onChange(!value)} style={{
        width:40, height:22, borderRadius:11, background: value?'var(--primary)':'var(--border)',
        position:'relative', transition:'background .2s', cursor:'pointer',
      }}>
        <div style={{
          width:18, height:18, borderRadius:'50%', background:'#fff',
          position:'absolute', top:2, left: value?20:2, transition:'left .2s',
        }}/>
      </div>
      <span style={{ color: value?'var(--text)':'var(--muted)' }}>{label}</span>
    </label>
  )
}

function WarehouseManager({ onClose, onRefresh }) {
  const [whs, setWhs] = useState([])
  const [form, setForm] = useState({ name:'', location:'' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()
  const load = () => api.get('/categories/warehouses').then(r => setWhs(r.data))
  useEffect(() => { load() }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/categories/warehouses/${editId}`, form)
      else await api.post('/categories/warehouses', form)
      setForm({ name:'', location:'' }); setEditId(null); load(); onRefresh()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <form onSubmit={save} style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Input label="Nome *" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required style={{ flex:1, minWidth:150 }}/>
        <Input label="Localização" value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} style={{ flex:1, minWidth:150 }}/>
        <Btn type="submit" disabled={saving} size="sm">{editId?'Salvar':'+ Adicionar'}</Btn>
        {editId && <Btn variant="ghost" size="sm" onClick={()=>{setEditId(null);setForm({name:'',location:''})}}>Cancelar</Btn>}
      </form>
      {whs.map(w => (
        <div key={w.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div><span style={{ fontWeight:600 }}>{w.name}</span>{w.location && <span style={{ color:'var(--muted)', marginLeft:8, fontSize:'.8rem' }}>({w.location})</span>}</div>
          <div style={{ display:'flex', gap:6 }}>
            <Btn size="sm" variant="ghost" onClick={()=>{setEditId(w.id);setForm({name:w.name,location:w.location||''})}}>✏️</Btn>
            <Btn size="sm" variant="danger" onClick={async()=>{if(await confirm('Desativar?')){await api.delete(`/categories/warehouses/${w.id}`);load();onRefresh()}}}>🗑</Btn>
          </div>
        </div>
      ))}
    </div>
  )
}

function CategoryManager({ onClose, onRefresh }) {
  const [cats, setCats] = useState([])
  const [form, setForm] = useState({ name:'', color:'#7c3aed' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()
  const load = () => api.get('/categories?type=product').then(r => setCats(r.data))
  useEffect(() => { load() }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/categories/${editId}`, form)
      else await api.post('/categories', { ...form, type:'product' })
      setForm({ name:'', color:'#7c3aed' }); setEditId(null); load(); onRefresh()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <form onSubmit={save} style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
        <Input label="Nome" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required style={{ flex:1 }}/>
        <div>
          <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Cor</label>
          <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
            style={{ width:42, height:38, padding:2, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', cursor:'pointer' }}/>
        </div>
        <Btn type="submit" disabled={saving} size="sm">{editId?'Salvar':'+ Adicionar'}</Btn>
      </form>
      {cats.map(c => (
        <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:12, height:12, borderRadius:3, background:c.color, display:'inline-block' }}/>
            <span>{c.name}</span>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <Btn size="sm" variant="ghost" onClick={()=>{setEditId(c.id);setForm({name:c.name,color:c.color})}}>✏️</Btn>
            <Btn size="sm" variant="danger" onClick={async()=>{if(await confirm('Excluir?')){await api.delete(`/categories/${c.id}`);load();onRefresh()}}}>🗑</Btn>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── IMEIs Manager (inside detail modal) ─────────────────────────────────

function UnitsManager({ productId, onStockChange }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState({ imei:'', imei2:'', serial:'', condition:'new', supplier:'', notes:'' })
  const [batchMode, setBatchMode] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()

  const load = () => {
    setLoading(true)
    api.get(`/products/${productId}/units`).then(r=>setUnits(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => { load() }, [productId])

  const addUnit = async e => {
    e.preventDefault(); setSaving(true)
    try {
      await api.post(`/products/${productId}/units`, addForm)
      setAddForm({ imei:'', imei2:'', serial:'', condition:'new', supplier:'', notes:'' })
      load(); onStockChange?.()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const addBatch = async () => {
    const lines = batchText.split('\n').map(l=>l.trim()).filter(l=>l)
    if (!lines.length) return toast.error('Insira ao menos um IMEI')
    setSaving(true)
    try {
      const payload = lines.map(l => ({ imei: l, condition: 'new' }))
      const r = await api.post(`/products/${productId}/units/batch`, { units: payload })
      toast.success(`${r.data.added} unidades adicionadas`)
      setBatchText(''); setBatchMode(false); load(); onStockChange?.()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const deleteUnit = async id => {
    if (!await confirm('Excluir unidade?')) return
    try { await api.delete(`/products/units/${id}`); load(); onStockChange?.() }
    catch(err) { toast.error(err.response?.data?.error||'Erro') }
  }

  const statusColor = { available:'#10b981', sold:'#6366f1', reserved:'#f59e0b', defective:'#ef4444', returned:'#8b5cf6' }
  const statusLabel = { available:'Disponível', sold:'Vendido', reserved:'Reservado', defective:'Defeito', returned:'Devolvido' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontWeight:700, fontSize:'.9rem' }}>Unidades ({units.length})</span>
        <div style={{ display:'flex', gap:6 }}>
          <Btn size="sm" variant={batchMode?'primary':'ghost'} onClick={()=>setBatchMode(!batchMode)}>Lote</Btn>
        </div>
      </div>

      {batchMode ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)' }}>Um IMEI por linha</label>
          <textarea value={batchText} onChange={e=>setBatchText(e.target.value)} rows={5} placeholder="352345678901234&#10;352345678901235&#10;352345678901236"
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.85rem', outline:'none', resize:'vertical', fontFamily:'monospace' }}/>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <Btn size="sm" variant="ghost" onClick={()=>setBatchMode(false)}>Cancelar</Btn>
            <Btn size="sm" onClick={addBatch} disabled={saving}>{saving?'Adicionando...':'Adicionar lote'}</Btn>
          </div>
        </div>
      ) : (
        <form onSubmit={addUnit} style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
          <Input label="IMEI" value={addForm.imei} onChange={e=>setAddForm(p=>({...p,imei:e.target.value}))} style={{ flex:'1 1 140px' }} placeholder="352345678901234" maxLength={20}/>
          <Input label="IMEI 2" value={addForm.imei2} onChange={e=>setAddForm(p=>({...p,imei2:e.target.value}))} style={{ flex:'1 1 140px' }} maxLength={20}/>
          <Input label="Serial" value={addForm.serial} onChange={e=>setAddForm(p=>({...p,serial:e.target.value}))} style={{ flex:'1 1 120px' }}/>
          <Select label="Estado" value={addForm.condition} onChange={e=>setAddForm(p=>({...p,condition:e.target.value}))} style={{ flex:'0 0 110px' }}>
            <option value="new">Novo</option>
            <option value="used">Usado</option>
            <option value="seminovo">Seminovo</option>
          </Select>
          <Btn type="submit" size="sm" disabled={saving}>+ Adicionar</Btn>
        </form>
      )}

      {loading ? <Spinner/> : units.length === 0 ? (
        <p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center', padding:16 }}>Nenhuma unidade cadastrada</p>
      ) : (
        <div style={{ maxHeight:300, overflowY:'auto' }}>
          {units.map(u => (
            <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)', gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:'.85rem', fontFamily:'monospace' }}>
                  {u.imei || u.serial || '—'}
                  {u.imei2 && <span style={{ color:'var(--muted)', fontWeight:400 }}> / {u.imei2}</span>}
                </div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)', display:'flex', gap:8, flexWrap:'wrap' }}>
                  {u.condition && <span>{u.condition === 'new' ? 'Novo' : u.condition === 'used' ? 'Usado' : 'Seminovo'}</span>}
                  {u.supplier && <span>• {u.supplier}</span>}
                  {u.order_number && <span>• Pedido #{u.order_number}</span>}
                </div>
              </div>
              <Badge color={statusColor[u.status]}>{statusLabel[u.status]}</Badge>
              {u.status !== 'sold' && <Btn size="sm" variant="danger" onClick={()=>deleteUnit(u.id)}>✕</Btn>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── IMEI Search Modal ───────────────────────────────────────────────────

function ImeiSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (query.length < 3) return
    setLoading(true)
    try {
      const r = await api.get(`/products/units/search?q=${encodeURIComponent(query)}`)
      setResults(r.data)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (query.length >= 3) { const t = setTimeout(search, 300); return () => clearTimeout(t) } else setResults([]) }, [query])

  const statusColor = { available:'#10b981', sold:'#6366f1', reserved:'#f59e0b', defective:'#ef4444', returned:'#8b5cf6' }
  const statusLabel = { available:'Disponível', sold:'Vendido', reserved:'Reservado', defective:'Defeito', returned:'Devolvido' }

  return (
    <Modal open={open} onClose={onClose} title="Buscar IMEI / Serial" width={560}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ position:'relative' }}>
          <Search size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Digite o IMEI ou serial..."
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'10px 12px 10px 38px', fontSize:'.9rem', outline:'none', fontFamily:'monospace' }}
            autoFocus/>
        </div>
        {loading ? <Spinner/> : results.length === 0 ? (
          query.length >= 3 && <p style={{ color:'var(--muted)', textAlign:'center', fontSize:'.85rem' }}>Nenhum resultado</p>
        ) : results.map(u => (
          <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:'.88rem' }}>{u.product_name}</div>
              <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{u.sku} • {u.brand} {u.model}</div>
              <div style={{ fontSize:'.82rem', fontFamily:'monospace', marginTop:2 }}>IMEI: {u.imei || '—'}{u.imei2 ? ` / ${u.imei2}` : ''}{u.serial ? ` | Serial: ${u.serial}` : ''}</div>
            </div>
            <Badge color={statusColor[u.status]}>{statusLabel[u.status]}</Badge>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

export default function Products() {
  const [rows, setRows]         = useState([])
  const [cats, setCats]         = useState([])
  const [whs, setWhs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [catModal, setCatModal] = useState(false)
  const [whModal, setWhModal]   = useState(false)
  const [imeiSearch, setImeiSearch] = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [search, setSearch]     = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [condFilter, setCondFilter] = useState('')
  const [saving, setSaving]     = useState(false)
  const [tab, setTab]           = useState(0)
  const { toast, confirm } = useToast()

  const loadCats = () => api.get('/categories?type=product').then(r => setCats(r.data))
  const loadWhs = () => api.get('/categories/warehouses').then(r => setWhs(r.data))
  const load = () => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (lowStock) p.set('low_stock', 'true')
    if (condFilter) p.set('condition', condFilter)
    setLoading(true)
    api.get(`/products?${p}`).then(r => setRows(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { loadCats(); loadWhs() }, [])
  useEffect(() => { load() }, [search, lowStock, condFilter])

  const openNew = () => {
    setForm(emptyForm); setEditId(null); setTab(0); setModal(true)
    api.get('/products/next-sku').then(r => setForm(p => ({ ...p, sku: r.data.sku }))).catch(() => {})
  }

  const openEdit = row => {
    api.get(`/products/${row.id}`).then(r => {
      const p = r.data
      setForm({
        ...emptyForm, ...p,
        category_id: p.category_id||'', warehouse_id: p.warehouse_id||'',
        barcode: p.barcode||'', image_base64: p.image_base64||'',
        photos: p.photos || [], variations: p.variations || [],
        nfe_rules: p.nfe_rules || {},
      })
      setEditId(p.id); setTab(0); setModal(true)
    }).catch(err => toast.error(err.response?.data?.error || 'Erro ao carregar produto'))
  }

  const f = v => setForm(p => ({...p,...v}))

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/products/${editId}`, form)
      else await api.post('/products', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const margin = fmt.margin(form.cost_price, form.sale_price)
  const condLabel = { new:'Novo', used:'Usado', seminovo:'Seminovo' }
  const condColor = { new:'#10b981', used:'#f59e0b', seminovo:'#3b82f6' }

  const cols = [
    { key:'image_base64', label:'', render: v => v
      ? <img src={v} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:'cover', border:'1px solid var(--border)' }}/>
      : <div style={{ width:36, height:36, borderRadius:6, background:'var(--bg-card2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>📦</div>
    },
    { key:'sku', label:'SKU' },
    { key:'name', label:'Produto', render:(_,row) => (
      <div>
        <div style={{ fontWeight:600 }}>{row.name}</div>
        {(row.brand || row.model) && <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{[row.brand, row.model].filter(Boolean).join(' ')}</div>}
      </div>
    )},
    { key:'condition', label:'Estado', render: v => v ? <Badge color={condColor[v]}>{condLabel[v]||v}</Badge> : '—' },
    { key:'category_name', label:'Categoria' },
    { key:'stock_quantity', label:'Estoque', render:(_,row) => (
      <div>
        <span style={{ color:parseFloat(row.stock_quantity)<=parseFloat(row.min_stock)?'var(--danger)':'var(--success)', fontWeight:700 }}>
          {fmt.num(row.stock_quantity)}
        </span>
        {row.controls_imei && row.units_available !== undefined && (
          <span style={{ fontSize:'.72rem', color:'var(--muted)', marginLeft:4 }}>({row.units_available} disp.)</span>
        )}
      </div>
    )},
    { key:'cost_price', label:'Custo', render: v => fmt.brl(v) },
    { key:'sale_price', label:'Venda', render: v => fmt.brl(v) },
    { key:'id', label:'', render:(_,row) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();openEdit(row)}}>✏️</Btn>
        <Btn size="sm" variant="danger" onClick={async e=>{e.stopPropagation();if(await confirm('Desativar?'))api.delete(`/products/${row.id}`).then(load)}}>🗑</Btn>
      </div>
    )}
  ]

  const TABS = ['Geral','Comercial','Fiscal','Estoque','Garantia','Técnica']

  return (
    <div>
      <PageHeader title="Produtos" subtitle="Catálogo completo com IMEI e fiscal" icon={Package}
        action={
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <Btn variant="ghost" onClick={()=>setImeiSearch(true)}>🔍 Buscar IMEI</Btn>
            <Btn variant="ghost" onClick={()=>setCatModal(true)}>🏷 Categorias</Btn>
            <Btn variant="ghost" onClick={()=>setWhModal(true)}>🏭 Depósitos</Btn>
            <Btn onClick={openNew}>+ Novo produto</Btn>
          </div>
        }
      />

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar por nome, SKU, marca, modelo ou código de barras..."
            style={{ flex:1, minWidth:220, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.9rem', outline:'none' }}/>
          <select value={condFilter} onChange={e=>setCondFilter(e.target.value)}
            style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 10px', fontSize:'.85rem' }}>
            <option value="">Todos estados</option>
            <option value="new">Novo</option>
            <option value="seminovo">Seminovo</option>
            <option value="used">Usado</option>
          </select>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.85rem', color:'var(--muted)', cursor:'pointer' }}>
            <input type="checkbox" checked={lowStock} onChange={e=>setLowStock(e.target.checked)}/> Estoque baixo
          </label>
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openEdit}/>}</Card>

      {/* ── Modal de produto (6 abas) ──────────────────────────────── */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar produto':'Novo produto'} width={700}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)', marginBottom:16, overflowX:'auto' }}>
            {TABS.map((t,i) => <TabBtn key={i} active={tab===i} onClick={()=>setTab(i)}>{t}</TabBtn>)}
          </div>

          {/* ── Aba 1: Geral ── */}
          {tab === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <ImageUpload value={form.image_base64} onChange={v=>f({image_base64:v})}/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
                <Input label="SKU (automático)" value={form.sku} onChange={e=>f({sku:e.target.value})} disabled={!!editId}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                <Input label="Marca" value={form.brand} onChange={e=>f({brand:e.target.value})} placeholder="Apple, Samsung..."/>
                <Input label="Modelo" value={form.model} onChange={e=>f({model:e.target.value})} placeholder="iPhone 15 Pro"/>
                <Input label="Cor" value={form.color} onChange={e=>f({color:e.target.value})} placeholder="Preto"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                <Select label="Categoria" value={form.category_id} onChange={e=>f({category_id:e.target.value})}>
                  <option value="">Selecione...</option>
                  {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Select label="Estado" value={form.condition} onChange={e=>f({condition:e.target.value})}>
                  <option value="new">Novo</option>
                  <option value="seminovo">Seminovo</option>
                  <option value="used">Usado</option>
                </Select>
                <Input label="EAN / GTIN" value={form.gtin} onChange={e=>f({gtin:e.target.value})} placeholder="7891234567890"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="Código de barras" value={form.barcode} onChange={e=>f({barcode:e.target.value})}/>
                <Input label="Fornecedor" value={form.supplier} onChange={e=>f({supplier:e.target.value})}/>
              </div>
              <div>
                <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Descrição</label>
                <textarea value={form.description||''} onChange={e=>f({description:e.target.value})} rows={2}
                  style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', resize:'vertical' }}/>
              </div>
            </div>
          )}

          {/* ── Aba 2: Comercial ── */}
          {tab === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                <Input label="Preço de custo (R$)" type="number" step="0.01" value={form.cost_price} onChange={e=>f({cost_price:e.target.value})}/>
                <Input label="Preço de venda (R$)" type="number" step="0.01" value={form.sale_price} onChange={e=>f({sale_price:e.target.value})}/>
                <div>
                  <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Margem</label>
                  <div style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', fontSize:'1rem', fontWeight:900, color:margin?.color||'var(--muted)' }}>
                    {margin ? `${margin.pct}%` : '—'}
                  </div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                <Input label="Preço promoção (R$)" type="number" step="0.01" value={form.promotion_price} onChange={e=>f({promotion_price:e.target.value})}/>
                <Input label="Preço PIX (R$)" type="number" step="0.01" value={form.pix_price} onChange={e=>f({pix_price:e.target.value})}/>
                <Input label="Preço cartão (R$)" type="number" step="0.01" value={form.card_price} onChange={e=>f({card_price:e.target.value})}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="Comissão (%)" type="number" step="0.01" value={form.commission} onChange={e=>f({commission:e.target.value})} placeholder="5.00"/>
                <Select label="Unidade" value={form.unit} onChange={e=>f({unit:e.target.value})}>
                  {['un','kg','g','l','ml','m','cm','cx','pc'].map(u=><option key={u} value={u}>{u}</option>)}
                </Select>
              </div>
            </div>
          )}

          {/* ── Aba 3: Fiscal ── */}
          {tab === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'rgba(168,85,247,.08)', borderRadius:8, padding:'10px 14px', fontSize:'.82rem', color:'var(--muted)' }}>
                Dados fiscais para emissao de NF-e e NFC-e. Preencha conforme orientacao do seu contador.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="NCM" value={form.ncm} onChange={e=>f({ncm:e.target.value})} placeholder="8517.12.31"/>
                <Input label="CEST" value={form.cest} onChange={e=>f({cest:e.target.value})} placeholder="21.053.00"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="CST / CSOSN" value={form.cst_csosn} onChange={e=>f({cst_csosn:e.target.value})} placeholder="102"/>
                <Input label="CFOP" value={form.cfop} onChange={e=>f({cfop:e.target.value})} placeholder="5102"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="GTIN" value={form.gtin} onChange={e=>f({gtin:e.target.value})} placeholder="7891234567890"/>
                <Select label="Origem" value={form.fiscal_origin} onChange={e=>f({fiscal_origin:e.target.value})}>
                  <option value="0">0 - Nacional</option>
                  <option value="1">1 - Estrangeira (importação direta)</option>
                  <option value="2">2 - Estrangeira (mercado interno)</option>
                  <option value="3">3 - Nacional com conteúdo importado 40-70%</option>
                  <option value="5">5 - Nacional com conteúdo importado inferior a 40%</option>
                  <option value="8">8 - Nacional com conteúdo importado superior a 70%</option>
                </Select>
              </div>
            </div>
          )}

          {/* ── Aba 4: Estoque ── */}
          {tab === 3 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                <Toggle label="Controla estoque" value={form.controls_stock} onChange={v=>f({controls_stock:v})}/>
                <Toggle label="Controla IMEI" value={form.controls_imei} onChange={v=>f({controls_imei:v})}/>
                <Toggle label="Controla serial" value={form.controls_serial} onChange={v=>f({controls_serial:v})}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {!editId && <Input label="Estoque inicial" type="number" step="0.01" value={form.stock_quantity} onChange={e=>f({stock_quantity:e.target.value})}/>}
                <Input label="Estoque mínimo" type="number" step="0.01" value={form.min_stock} onChange={e=>f({min_stock:e.target.value})}/>
                <Input label="Localização" value={form.location} onChange={e=>f({location:e.target.value})} placeholder="Prateleira A3"/>
                <div>
                  <Select label="Depósito" value={form.warehouse_id} onChange={e=>f({warehouse_id:e.target.value})}>
                    <option value="">Selecione...</option>
                    {whs.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                  <button type="button" onClick={()=>setWhModal(true)} style={{ background:'none', border:'none', color:'var(--primary)', fontSize:'.72rem', cursor:'pointer', marginTop:3, padding:0 }}>+ Gerenciar depósitos</button>
                </div>
              </div>
              {editId && (form.controls_imei || form.controls_serial) && (
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                  <UnitsManager productId={editId} onStockChange={load}/>
                </div>
              )}
              {!editId && (form.controls_imei || form.controls_serial) && (
                <div style={{ background:'rgba(168,85,247,.08)', borderRadius:8, padding:'12px 14px', fontSize:'.85rem', color:'var(--muted)' }}>
                  Salve o produto primeiro para gerenciar unidades (IMEI/Serial).
                </div>
              )}
            </div>
          )}

          {/* ── Aba 5: Garantia ── */}
          {tab === 4 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="Garantia fabricante" value={form.warranty_manufacturer} onChange={e=>f({warranty_manufacturer:e.target.value})} placeholder="12 meses"/>
                <Input label="Garantia loja" value={form.warranty_store} onChange={e=>f({warranty_store:e.target.value})} placeholder="3 meses"/>
              </div>
              <div>
                <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Política de troca</label>
                <textarea value={form.exchange_policy||''} onChange={e=>f({exchange_policy:e.target.value})} rows={3}
                  style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', resize:'vertical' }}/>
              </div>
              <div>
                <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Assistência técnica</label>
                <textarea value={form.technical_support||''} onChange={e=>f({technical_support:e.target.value})} rows={3}
                  style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', resize:'vertical' }}/>
              </div>
            </div>
          )}

          {/* ── Aba 6: Técnica ── */}
          {tab === 5 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'rgba(168,85,247,.08)', borderRadius:8, padding:'10px 14px', fontSize:'.82rem', color:'var(--muted)' }}>
                Especificacoes tecnicas do produto (celulares, tablets, etc.)
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                <Input label="RAM" value={form.ram} onChange={e=>f({ram:e.target.value})} placeholder="8GB"/>
                <Input label="Armazenamento" value={form.storage} onChange={e=>f({storage:e.target.value})} placeholder="256GB"/>
                <Input label="Cor" value={form.color} onChange={e=>f({color:e.target.value})} placeholder="Preto Titânio"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <Input label="Tela" value={form.screen} onChange={e=>f({screen:e.target.value})} placeholder='6.7" Super Retina XDR'/>
                <Input label="Bateria" value={form.battery} onChange={e=>f({battery:e.target.value})} placeholder="4422 mAh"/>
              </div>
              <div style={{ display:'flex', gap:20, flexWrap:'wrap', paddingTop:6 }}>
                <Toggle label="5G" value={form.is_5g} onChange={v=>f({is_5g:v})}/>
                <Toggle label="Dual Chip" value={form.dual_chip} onChange={v=>f({dual_chip:v})}/>
                <Toggle label="eSIM" value={form.esim} onChange={v=>f({esim:v})}/>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:18, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      <ImeiSearch open={imeiSearch} onClose={()=>setImeiSearch(false)}/>

      <Modal open={catModal} onClose={()=>setCatModal(false)} title="Gerenciar Categorias" width={440}>
        <CategoryManager onClose={()=>setCatModal(false)} onRefresh={loadCats}/>
      </Modal>

      <Modal open={whModal} onClose={()=>setWhModal(false)} title="Gerenciar Depósitos" width={480}>
        <WarehouseManager onClose={()=>setWhModal(false)} onRefresh={loadWhs}/>
      </Modal>
    </div>
  )
}
