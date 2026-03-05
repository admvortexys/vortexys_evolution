import { useEffect, useState, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, fmt } from '../components/UI'

const typeColor = { in:'#10b981', out:'#ef4444', adjustment:'#f59e0b' }
const typeLabel = { in:'Entrada', out:'Saída', adjustment:'Ajuste' }

// ─── Movimentações de um produto ──────────────────────────────────────────
function ProductMovements({ product, onClose }) {
  const [movs, setMovs]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/stock/product/${product.id}/movements`)
      .then(r => setMovs(r.data))
      .finally(() => setLoading(false))
  }, [product.id])

  const cols = [
    { key:'created_at',  label:'Data',   render: v => fmt.date(v) },
    { key:'type',        label:'Tipo',   render: v => <Badge color={typeColor[v]}>{typeLabel[v]}</Badge> },
    { key:'quantity',    label:'Qtd',    render:(v,row) => (
      <span style={{ fontWeight:700, color:row.type==='in'?'var(--success)':'var(--danger)' }}>
        {row.type==='in'?'+':row.type==='out'?'-':''}{fmt.num(v)}
      </span>
    )},
    { key:'previous_qty', label:'Antes',  render: v => fmt.num(v) },
    { key:'new_qty',      label:'Depois', render: v => fmt.num(v) },
    { key:'reason',       label:'Motivo' },
    { key:'order_number', label:'Pedido', render: v => v
      ? <span style={{ fontSize:'.78rem', fontWeight:700, color:'var(--primary)' }}>{v}</span>
      : '—'
    },
    { key:'user_name',  label:'Usuário' },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        {product.image_base64
          ? <img src={product.image_base64} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:'cover', border:'1px solid var(--border)' }}/>
          : <div style={{ width:44, height:44, borderRadius:8, background:'var(--bg-card2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>📦</div>
        }
        <div>
          <div style={{ fontWeight:700 }}>{product.name}</div>
          <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>
            SKU: {product.sku}{product.barcode ? ` · Barcode: ${product.barcode}` : ''}
          </div>
          <div style={{ fontSize:'.82rem', marginTop:2 }}>
            Estoque atual: <strong style={{ color:'var(--primary)' }}>{fmt.num(product.stock_quantity)} {product.unit}</strong>
          </div>
        </div>
      </div>
      {loading ? <Spinner/> : (
        movs.length === 0
          ? <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Nenhuma movimentação registrada</p>
          : <Table columns={cols} data={movs}/>
      )}
    </div>
  )
}

export default function Stock() {
  const [rows, setRows]         = useState([])
  const [prods, setProds]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [search, setSearch]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [form, setForm]         = useState({ product_id:'', type:'in', quantity:'', reason:'' })
  const [saving, setSaving]     = useState(false)
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    api.get('/stock').then(r=>setRows(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => {
    load()
    api.get('/products').then(r=>setProds(r.data))
  }, [])

  const searchTimer = useRef(null)

  const handleSearch = e => {
    const q = e.target.value
    setSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await api.get(`/stock/product-search?q=${encodeURIComponent(q)}`)
        setSearchResults(r.data)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 350)
  }

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try { await api.post('/stock', form); setModal(false); load() }
    catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const movCols = [
    { key:'created_at',   label:'Data',   render: v => fmt.date(v) },
    { key:'product_name', label:'Produto' },
    { key:'sku',          label:'SKU'     },
    { key:'type',         label:'Tipo', render: v => <Badge color={typeColor[v]}>{typeLabel[v]}</Badge> },
    { key:'quantity',     label:'Qtd', render:(v,row) => (
      <span style={{ fontWeight:700, color: row.type==='in'?'var(--success)':'var(--danger)' }}>
        {row.type==='in'?'+':'-'}{fmt.num(v)}
      </span>
    )},
    { key:'previous_qty', label:'Antes',  render: v => fmt.num(v) },
    { key:'new_qty',      label:'Depois', render: v => fmt.num(v) },
    { key:'reason',       label:'Motivo' },
    { key:'order_number', label:'Pedido', render: v => v ? <span style={{ fontWeight:700, color:'var(--primary)', fontSize:'.78rem' }}>{v}</span> : '—' },
    { key:'user_name',    label:'Usuário' },
  ]

  return (
    <div>
      <PageHeader
        title="Movimentações de Estoque"
        subtitle="Entradas, saídas e ajustes"
        icon={RefreshCw}
        action={<Btn onClick={()=>{setForm({product_id:'',type:'in',quantity:'',reason:''});setModal(true)}}>+ Movimentar</Btn>}
      />

      {/* Busca de produto */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:'.82rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6 }}>
            🔍 Buscar produto para ver histórico de movimentações
          </label>
          <div style={{ position:'relative' }}>
            <input
              value={search}
              onChange={handleSearch}
              placeholder="Digite nome, SKU ou código de barras..."
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8,
                color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none' }}
            />
            {searching && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:'.75rem', color:'var(--muted)' }}>🔄</span>}
          </div>
        </div>

        {/* Resultados de busca */}
        {searchResults.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {searchResults.map(p => (
              <div key={p.id}
                onClick={() => { setSelectedProduct(p); setSearch(''); setSearchResults([]) }}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8,
                  background:'var(--bg-card2)', border:'1px solid var(--border)', cursor:'pointer',
                  transition:'all .15s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--primary)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
              >
                {p.image_base64
                  ? <img src={p.image_base64} alt="" style={{ width:32, height:32, borderRadius:5, objectFit:'cover' }}/>
                  : <span style={{ fontSize:'1.2rem' }}>📦</span>}
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:'.9rem' }}>{p.name}</div>
                  <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>
                    SKU: {p.sku}{p.barcode ? ` · Barcode: ${p.barcode}` : ''} · {p.category_name||'Sem categoria'}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:700, color:'var(--primary)', fontSize:'.9rem' }}>{fmt.num(p.stock_quantity)} {p.unit}</div>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>em estoque</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {search && searchResults.length === 0 && !searching && (
          <p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center', padding:'8px 0' }}>Nenhum produto encontrado</p>
        )}
      </Card>

      {/* Movimentações gerais */}
      <Card>
        {loading ? <Spinner/> : <Table columns={movCols} data={rows}/>}
      </Card>

      {/* Modal movimentação */}
      <Modal open={modal} onClose={()=>setModal(false)} title="Nova movimentação">
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Produto *" value={form.product_id} onChange={e=>setForm(p=>({...p,product_id:e.target.value}))} required>
            <option value="">Selecione o produto...</option>
            {prods.map(p=><option key={p.id} value={p.id}>{p.name} — {fmt.num(p.stock_quantity)} {p.unit}</option>)}
          </Select>
          <Select label="Tipo *" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
            <option value="in">Entrada</option>
            <option value="out">Saída</option>
            <option value="adjustment">Ajuste (define saldo)</option>
          </Select>
          <Input label="Quantidade *" type="number" step="0.01" value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))} required/>
          <Input label="Motivo" value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} placeholder="Ex: Compra fornecedor, venda, ajuste inventário..."/>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Confirmar'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal histórico do produto */}
      <Modal open={!!selectedProduct} onClose={()=>setSelectedProduct(null)} title="📋 Histórico de Movimentações" width={860}>
        {selectedProduct && (
          <ProductMovements product={selectedProduct} onClose={()=>setSelectedProduct(null)}/>
        )}
      </Modal>
    </div>
  )
}
