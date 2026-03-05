import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Printer, RotateCcw } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, Autocomplete, fmt } from '../components/UI'

const CHANNELS = [
  { v:'balcao', l:'Balcão' }, { v:'delivery', l:'Delivery' },
  { v:'marketplace', l:'Marketplace' }, { v:'ecommerce', l:'E-commerce' }, { v:'whatsapp', l:'WhatsApp' },
]
const OP_TYPES = [
  { v:'quote', l:'Orçamento' }, { v:'order', l:'Pedido' }, { v:'direct_sale', l:'Venda direta' },
]
const PAY_METHODS = [
  { v:'pix', l:'PIX' }, { v:'dinheiro', l:'Dinheiro' }, { v:'debito', l:'Débito' },
  { v:'credito', l:'Crédito (cartão)' }, { v:'credito_loja', l:'Crédito da loja' },
  { v:'crediario', l:'Crediário' }, { v:'voucher', l:'Voucher/Vale' },
  { v:'sinal', l:'Sinal + Restante' },
]

const emptyForm = {
  client_id:'', client_label:'', seller_id:'', items:[], discount:0, notes:'',
  channel:'balcao', operation_type:'order', walk_in:false,
  walk_in_name:'', walk_in_document:'', walk_in_phone:'',
  warehouse_id:'', shipping:0, surcharge:0,
  payment_methods:[], fiscal_type:'', fiscal_notes:'',
}

const emptyPayment = { method:'pix', amount:'', installments:1, notes:'' }

// ─── IMEI select for items ───────────────────────────────────────────────

function ImeiSelect({ productId, value, onChange }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!productId) return
    setLoading(true)
    api.get(`/products/${productId}/units?status=available`).then(r => setUnits(r.data)).finally(() => setLoading(false))
  }, [productId])
  if (loading) return <span style={{ fontSize:'.78rem', color:'var(--muted)' }}>Carregando IMEIs...</span>
  if (!units.length) return <span style={{ fontSize:'.78rem', color:'var(--danger)' }}>Sem IMEI disponivel</span>
  return (
    <select value={value||''} onChange={e=>onChange(e.target.value ? parseInt(e.target.value) : null)}
      style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'7px 10px', fontSize:'.82rem', fontFamily:'monospace' }}>
      <option value="">Selecionar IMEI...</option>
      {units.map(u => <option key={u.id} value={u.id}>{u.imei || u.serial || `#${u.id}`}{u.imei2 ? ` / ${u.imei2}` : ''}</option>)}
    </select>
  )
}

// ─── Status manager ──────────────────────────────────────────────────────

function StatusManager({ onClose, onRefresh }) {
  const [statuses, setStatuses] = useState([])
  const [form, setForm] = useState({ label:'', color:'#6366f1', stock_action:'none', reserve_days:7 })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()
  const load = () => api.get('/order-statuses').then(r => setStatuses(r.data))
  useEffect(() => { load() }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/order-statuses/${editId}`, form)
      else await api.post('/order-statuses', form)
      setForm({ label:'', color:'#6366f1', stock_action:'none', reserve_days:7 }); setEditId(null); load(); onRefresh()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  const stockLabels = { none:'Nenhuma', deduct:'Baixa estoque', return:'Devolve estoque + crédito/estorno', reserve:'Reserva estoque' }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ padding:'8px 12px', background:'rgba(168,85,247,.08)', borderRadius:8, fontSize:'.8rem', color:'var(--muted)' }}>
        Status de sistema nao podem ser editados ou excluidos.
      </div>
      <form onSubmit={save} style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Input label="Nome *" value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} required style={{ flex:'1 1 140px' }}/>
        <div>
          <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Cor</label>
          <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
            style={{ width:42, height:36, padding:2, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', cursor:'pointer' }}/>
        </div>
        <Select label="Acao estoque" value={form.stock_action} onChange={e=>setForm(p=>({...p,stock_action:e.target.value}))} style={{ flex:'1 1 120px' }}>
          <option value="none">Nenhuma</option>
          <option value="deduct">Dar baixa</option>
          <option value="return">Devolver</option>
          <option value="reserve">Reservar</option>
        </Select>
        {form.stock_action === 'reserve' && (
          <Input label="Dias" type="number" min="1" max="90" value={form.reserve_days}
            onChange={e=>setForm(p=>({...p,reserve_days:parseInt(e.target.value)||7}))} style={{ flex:'0 0 60px' }}/>
        )}
        <Btn type="submit" size="sm" disabled={saving}>{editId?'Salvar':'+ Adicionar'}</Btn>
        {editId && <Btn variant="ghost" size="sm" onClick={()=>{setEditId(null);setForm({label:'',color:'#6366f1',stock_action:'none',reserve_days:7})}}>Cancelar</Btn>}
      </form>
      {statuses.map(s => (
        <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:10, height:10, borderRadius:3, background:s.color, flexShrink:0 }}/>
            <div>
              <span style={{ fontWeight:600, fontSize:'.88rem' }}>{s.label}</span>
              {s.is_system && <span style={{ marginLeft:5, fontSize:'.68rem', color:'var(--muted)' }}>(sistema)</span>}
              <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>
                {stockLabels[s.stock_action]||'—'}
                {s.stock_action === 'reserve' && s.reserve_days && <span> ({s.reserve_days} dias)</span>}
              </div>
            </div>
          </div>
          {!s.is_system && (
            <div style={{ display:'flex', gap:4 }}>
              <Btn size="sm" variant="ghost" onClick={()=>{setEditId(s.id);setForm({label:s.label,color:s.color,stock_action:s.stock_action,reserve_days:s.reserve_days||7})}}>✏️</Btn>
              <Btn size="sm" variant="danger" onClick={async()=>{if(await confirm('Excluir?')){await api.delete(`/order-statuses/${s.id}`);load();onRefresh()}}}>🗑</Btn>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Print receipt ───────────────────────────────────────────────────────

function printReceipt(detail) {
  const w = window.open('', '_blank', 'width=400,height=600')
  const channelLabels = { balcao:'Balcão', delivery:'Delivery', marketplace:'Marketplace', ecommerce:'E-commerce', whatsapp:'WhatsApp' }
  const items = (detail.items || []).map(it => `
    <tr>
      <td>${it.product_name}${it.unit_imei ? `<br><small>IMEI: ${it.unit_imei}${it.unit_imei2 ? ' / '+it.unit_imei2 : ''}</small>` : ''}${it.item_notes ? `<br><small>${it.item_notes}</small>` : ''}</td>
      <td style="text-align:center">${it.quantity}</td>
      <td style="text-align:right">R$ ${Number(it.unit_price).toFixed(2)}</td>
      <td style="text-align:right">R$ ${Number(it.total).toFixed(2)}</td>
    </tr>
  `).join('')
  const payments = (detail.payment_methods || []).map(p =>
    `<div>${p.method === 'credito_loja' ? 'CRÉDITO LOJA' : p.method.toUpperCase()}: R$ ${Number(p.amount).toFixed(2)}${p.installments > 1 ? ` (${p.installments}x)` : ''}</div>`
  ).join('')
  w.document.write(`<!DOCTYPE html><html><head><title>Pedido ${detail.number}</title>
    <style>body{font-family:monospace;font-size:12px;margin:20px;color:#000}
    table{width:100%;border-collapse:collapse}td,th{padding:3px 4px;border-bottom:1px dashed #ccc;font-size:11px}
    h2{margin:0 0 8px;font-size:16px}.line{border-top:1px dashed #000;margin:8px 0}
    @media print{body{margin:0}}</style></head><body>
    <h2 style="text-align:center">${detail.number}</h2>
    <div style="text-align:center;margin-bottom:8px">${new Date(detail.created_at).toLocaleString('pt-BR')}</div>
    <div class="line"></div>
    <div><strong>Cliente:</strong> ${detail.walk_in ? (detail.walk_in_name || 'Consumidor final') : (detail.client_name || '—')}</div>
    ${detail.walk_in_document ? `<div>Doc: ${detail.walk_in_document}</div>` : ''}
    ${detail.seller_name ? `<div>Vendedor: ${detail.seller_name}</div>` : ''}
    <div>Canal: ${channelLabels[detail.channel] || detail.channel || '—'}</div>
    <div class="line"></div>
    <table><thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${items}</tbody></table>
    <div class="line"></div>
    <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>R$ ${Number(detail.subtotal).toFixed(2)}</span></div>
    ${detail.discount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Desconto:</span><span>-R$ ${Number(detail.discount).toFixed(2)}</span></div>` : ''}
    ${detail.shipping > 0 ? `<div style="display:flex;justify-content:space-between"><span>Frete:</span><span>R$ ${Number(detail.shipping).toFixed(2)}</span></div>` : ''}
    <div class="line"></div>
    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold"><span>TOTAL:</span><span>R$ ${Number(detail.total).toFixed(2)}</span></div>
    ${payments ? `<div class="line"></div><div><strong>Pagamento:</strong></div>${payments}` : ''}
    ${detail.notes ? `<div class="line"></div><div><small>${detail.notes}</small></div>` : ''}
    ${detail.return_type ? `<div class="line"></div>
    <div style="text-align:center;font-weight:bold;color:#c00">*** DEVOLUÇÃO ***</div>
    <div>Tipo: ${detail.return_type === 'credit' ? 'Crédito na loja' : 'Estorno financeiro'}</div>
    <div>Valor: R$ ${Number(detail.credit_amount || detail.total).toFixed(2)}</div>
    ${detail.credit?.number ? `<div>Documento: ${detail.credit.number}</div>` : ''}
    ${detail.cancel_reason ? `<div>Motivo: ${detail.cancel_reason}</div>` : ''}` : ''}
    <div class="line"></div>
    <div style="text-align:center;font-size:10px;margin-top:10px">Obrigado pela preferencia!</div>
    <script>setTimeout(()=>window.print(),300)</script></body></html>`)
  w.document.close()
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

export default function Orders() {
  const navigate = useNavigate()
  const [rows, setRows]           = useState([])
  const [statuses, setStatuses]   = useState([])
  const [sellers, setSellers]     = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [detail, setDetail]       = useState(null)
  const [statusModal, setStatusModal] = useState(false)
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [returnModal, setReturnModal] = useState(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnType, setReturnType] = useState('credit')
  const [payModal, setPayModal]   = useState(null)
  const [filter, setFilter]       = useState('')
  const [searchText, setSearchText] = useState('')
  const [form, setForm]           = useState(emptyForm)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [tab, setTab]             = useState(0)
  const [clientCredits, setClientCredits] = useState([])
  const [creditBalance, setCreditBalance] = useState(0)
  const barcodeRef = useRef(null)
  const { toast, confirm } = useToast()

  const loadStatuses = () => api.get('/order-statuses').then(r => setStatuses(r.data))
  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filter) p.set('status', filter)
    if (searchText) p.set('search', searchText)
    setLoading(true)
    api.get(`/orders?${p}`).then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [filter, searchText])

  useEffect(() => {
    loadStatuses()
    api.get('/sellers').then(r => setSellers(r.data.filter(s => s.active))).catch(() => {})
    api.get('/categories/warehouses').then(r => setWarehouses(r.data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const f = v => setForm(p => ({ ...p, ...v }))

  const openNew = () => { setForm(emptyForm); setEditId(null); setTab(0); setClientCredits([]); setCreditBalance(0); setModal(true) }

  const openEdit = async row => {
    if (row.status !== 'draft') { openDetail(row); return }
    const r = await api.get(`/orders/${row.id}`)
    const d = r.data
    setForm({
      client_id: d.client_id || '', client_label: d.client_name || '',
      seller_id: d.seller_id || '', discount: d.discount || 0, notes: d.notes || '',
      channel: d.channel || 'balcao', operation_type: d.operation_type || 'order',
      walk_in: d.walk_in || false,
      walk_in_name: d.walk_in_name || '', walk_in_document: d.walk_in_document || '', walk_in_phone: d.walk_in_phone || '',
      warehouse_id: d.warehouse_id || '', shipping: d.shipping || 0, surcharge: d.surcharge || 0,
      payment_methods: d.payment_methods || [], fiscal_type: d.fiscal_type || '', fiscal_notes: d.fiscal_notes || '',
      items: d.items.map(it => ({
        product_id: it.product_id, product_label: it.product_name, quantity: it.quantity,
        unit_price: it.unit_price, discount: it.discount, controls_imei: !!it.controls_imei,
        unit_id: it.unit_id || null, item_notes: it.item_notes || '', stock_qty: it.stock_quantity,
        brand: it.brand, model: it.model, sku: it.sku,
      })),
    })
    setEditId(row.id); setTab(0); setModal(true)
  }

  const openDetail = async row => {
    try { const r = await api.get(`/orders/${row.id}`); setDetail(r.data) }
    catch { toast.error('Erro ao carregar') }
  }

  const fetchClients = q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r => r.data)
  const fetchProducts = q => api.get(`/products/search?q=${encodeURIComponent(q)}`).then(r => r.data)

  const loadClientCredits = async (clientId) => {
    if (!clientId) { setClientCredits([]); setCreditBalance(0); return }
    try {
      const { data } = await api.get(`/credits/client/${clientId}`)
      const active = (data.credits || []).filter(c => c.status === 'active' && parseFloat(c.balance) > 0)
      setClientCredits(active)
      setCreditBalance(parseFloat(data.summary?.total_available) || 0)
    } catch { setClientCredits([]); setCreditBalance(0) }
  }

  useEffect(() => { loadClientCredits(form.client_id) }, [form.client_id])

  const addItem = () => f({ items: [...form.items, { product_id:'', product_label:'', quantity:1, unit_price:0, discount:0, controls_imei:false, unit_id:null, item_notes:'', stock_qty:0 }] })
  const removeItem = i => f({ items: form.items.filter((_, idx) => idx !== i) })
  const setItem = (i, key, val) => {
    const items = [...form.items]; items[i] = { ...items[i], [key]: val }; f({ items })
  }

  const addBarcode = async code => {
    if (!code) return
    try {
      const r = await api.get(`/products/search?q=${encodeURIComponent(code)}`)
      if (r.data.length) {
        const p = r.data[0]
        f({ items: [...form.items, {
          product_id: p.id, product_label: p.name, quantity: 1, unit_price: p.sale_price,
          discount: 0, controls_imei: !!p.controls_imei, unit_id: null, item_notes: '',
          stock_qty: p.stock_quantity, brand: p.brand, model: p.model, sku: p.sku,
        }]})
        toast.success(`${p.name} adicionado`)
      } else toast.error('Produto nao encontrado')
    } catch { toast.error('Erro ao buscar') }
  }

  const addPayment = () => f({ payment_methods: [...form.payment_methods, { ...emptyPayment }] })
  const removePayment = i => f({ payment_methods: form.payment_methods.filter((_, idx) => idx !== i) })
  const setPayment = (i, key, val) => {
    const pm = [...form.payment_methods]
    pm[i] = { ...pm[i], [key]: val }
    if (key === 'method' && val === 'credito_loja') {
      const remaining = Math.max(total - form.payment_methods.reduce((s, p, idx) => idx === i ? s : s + (parseFloat(p.amount) || 0), 0), 0)
      pm[i].amount = String(Math.min(creditBalance, remaining).toFixed(2))
    }
    if (key === 'amount' && pm[i].method === 'credito_loja') {
      const maxCredit = creditBalance
      if (parseFloat(val) > maxCredit) { pm[i].amount = String(maxCredit.toFixed(2)) }
    }
    f({ payment_methods: pm })
  }
  const hasCredLojaPayment = form.payment_methods.some(p => p.method === 'credito_loja')

  const subtotal = form.items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0), 0)
  const total = subtotal - (parseFloat(form.discount) || 0) + (parseFloat(form.shipping) || 0) + (parseFloat(form.surcharge) || 0)
  const totalPaid = form.payment_methods.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

  const save = async e => {
    e?.preventDefault()
    if (!form.walk_in && !form.client_id) return toast.error('Selecione um cliente ou marque consumidor final')
    if (!form.items.length) return toast.error('Adicione pelo menos um item')
    const credLojaTotal = form.payment_methods.filter(p => p.method === 'credito_loja').reduce((s,p) => s + (parseFloat(p.amount)||0), 0)
    if (credLojaTotal > 0 && !form.client_id) return toast.error('Crédito da loja requer cliente cadastrado')
    if (credLojaTotal > creditBalance + 0.01) return toast.error(`Saldo de crédito insuficiente. Disponível: ${fmt.brl(creditBalance)}`)
    for (const it of form.items) {
      if (it.controls_imei && !it.unit_id) return toast.error(`Selecione o IMEI para: ${it.product_label}`)
    }
    setSaving(true)
    try {
      if (editId) await api.put(`/orders/${editId}`, form)
      else await api.post('/orders', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const [statusConfirm, setStatusConfirm] = useState(null)

  const changeStatus = (id, statusSlug) => {
    const sdef = statuses.find(s => s.slug === statusSlug)
    if (!sdef) return
    setDetail(null)
    if (sdef.slug === 'cancelled') { setCancelReason(''); setCancelModal({ id, statusSlug, statusName: sdef.label }); return }
    if (sdef.slug === 'returned') {
      const ord = rows.find(r=>r.id===id)
      navigate(`/returns?order=${encodeURIComponent(ord?.number||'')}`)
      return
    }
    setStatusConfirm({ id, statusSlug, statusName: sdef.label })
  }

  const doChangeStatus = async () => {
    if (!statusConfirm) return
    setSaving(true)
    try {
      await api.patch(`/orders/${statusConfirm.id}/status`, { status: statusConfirm.statusSlug })
      toast.success(`Status alterado para "${statusConfirm.statusName}"`)
      setStatusConfirm(null); load()
    } catch(err) { toast.error(err.response?.data?.error || 'Erro ao alterar status') }
    finally { setSaving(false) }
  }

  const confirmCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Informe o motivo')
    setSaving(true)
    try {
      await api.patch(`/orders/${cancelModal.id}/status`, { status: cancelModal.statusSlug, cancel_reason: cancelReason })
      setCancelModal(null); setDetail(null); load()
    } catch(err) { toast.error(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const confirmReturn = async () => {
    if (!returnReason.trim()) return toast.error('Informe o motivo da devolução')
    setSaving(true)
    try {
      const resp = await api.patch(`/orders/${returnModal.id}/status`, {
        status: returnModal.statusSlug,
        cancel_reason: returnReason,
        return_type: returnType,
      })
      const credit = resp.data?.credit
      if (credit) {
        toast.success(`Devolução processada! Documento: ${credit.number}`)
      } else {
        toast.success('Devolução processada!')
      }
      setReturnModal(null); setDetail(null); load()
    } catch(err) { toast.error(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const getStatusDef = slug => statuses.find(s => s.slug === slug)
  const channelLabel = { balcao:'Balcao', delivery:'Delivery', marketplace:'Marketplace', ecommerce:'E-commerce', whatsapp:'WhatsApp' }

  useEffect(() => {
    const handler = e => {
      if (!modal) return
      if (e.key === 'F2') { e.preventDefault(); barcodeRef.current?.focus() }
      if (e.key === 'F4') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modal, form])

  const cols = [
    { key:'number', label:'Pedido' },
    { key:'client_name', label:'Cliente', render:(_,row) => row.walk_in ? (row.walk_in_name || 'Consumidor final') : (row.client_name || '—') },
    { key:'channel', label:'Canal', render: v => <span style={{ fontSize:'.78rem' }}>{channelLabel[v] || v || '—'}</span> },
    { key:'seller_name', label:'Vendedor', render: v => v || '—' },
    { key:'status', label:'Status', render:(v,row) => { const s=getStatusDef(v); return <Badge color={s?.color||'#6b7280'}>{row.status_label||v}</Badge> }},
    { key:'total', label:'Total', render: v => fmt.brl(v) },
    { key:'created_at', label:'Data', render: v => fmt.date(v) },
  ]

  const TABS = ['Cliente e itens', 'Pagamento', 'Fiscal']

  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Vendas, orcamentos e entregas" icon={ShoppingCart}
        action={
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <Btn variant="ghost" onClick={()=>setStatusModal(true)}>Status</Btn>
            <Btn onClick={openNew}>+ Novo pedido</Btn>
          </div>
        }
      />

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <Btn size="sm" variant={filter===''?'primary':'ghost'} onClick={()=>setFilter('')}>Todos</Btn>
          {statuses.map(s => (
            <Btn key={s.slug} size="sm" variant={filter===s.slug?'primary':'ghost'}
              style={filter===s.slug?{}:{ borderColor:s.color+'55', color:s.color }}
              onClick={()=>setFilter(s.slug)}>{s.label}</Btn>
          ))}
          <div style={{ flex:1 }}/>
          <input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Buscar pedido ou cliente..."
            style={{ width:220, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'6px 10px', fontSize:'.85rem', outline:'none' }}/>
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openEdit}/>}</Card>

      {/* ── MODAL NOVO/EDITAR ──────────────────────────────────────── */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId ? 'Editar pedido' : 'Novo pedido'} width={780}>
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)', marginBottom:14 }}>
            {TABS.map((t,i) => (
              <button key={i} onClick={()=>setTab(i)} style={{
                padding:'8px 16px', fontSize:'.82rem', fontWeight:tab===i?700:500,
                color:tab===i?'#fff':'var(--muted)', background:tab===i?'rgba(168,85,247,.2)':'transparent',
                border:'none', borderBottom:tab===i?'2px solid var(--primary)':'2px solid transparent', cursor:'pointer',
              }}>{t}</button>
            ))}
            <div style={{ flex:1 }}/>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.72rem', color:'var(--muted)', paddingRight:8 }}>
              F2: Barcode | F4: Salvar
            </div>
          </div>

          {/* ── TAB 0: Cliente e Itens ── */}
          {tab === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Header row */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <Select label="Canal" value={form.channel} onChange={e=>f({channel:e.target.value})}>
                  {CHANNELS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </Select>
                <Select label="Tipo" value={form.operation_type} onChange={e=>f({operation_type:e.target.value})}>
                  {OP_TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </Select>
                <Select label="Deposito" value={form.warehouse_id} onChange={e=>f({warehouse_id:e.target.value})}>
                  <option value="">Nenhum</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>

              {/* Walk-in toggle */}
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'.88rem' }}>
                <input type="checkbox" checked={form.walk_in} onChange={e=>f({walk_in:e.target.checked, client_id: e.target.checked ? '' : form.client_id})}/>
                Consumidor final (sem cadastro)
              </label>

              {form.walk_in ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                  <Input label="Nome (opcional)" value={form.walk_in_name} onChange={e=>f({walk_in_name:e.target.value})} placeholder="Nome do cliente"/>
                  <Input label="CPF/CNPJ (opcional)" value={form.walk_in_document} onChange={e=>f({walk_in_document:e.target.value})} placeholder="000.000.000-00"/>
                  <Input label="Telefone (opcional)" value={form.walk_in_phone} onChange={e=>f({walk_in_phone:e.target.value})} placeholder="(11) 99999-9999"/>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <Autocomplete label="Cliente *" value={{ label: form.client_label }}
                    fetchFn={fetchClients}
                    onSelect={c => f({ client_id: c.id, client_label: c.name })}
                    renderOption={c => (<div><div style={{ fontWeight:600 }}>{c.name}</div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>{[c.document, c.phone].filter(Boolean).join(' · ')}</div></div>)}
                    placeholder="Buscar cliente..."/>
                  <Select label="Vendedor" value={form.seller_id} onChange={e=>f({seller_id:e.target.value})}>
                    <option value="">Sem vendedor</option>
                    {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
              )}

              {/* Barcode input */}
              <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>F2: Leitura de codigo de barras</label>
                  <input ref={barcodeRef} placeholder="Bipe ou digite o codigo e pressione Enter..."
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBarcode(e.target.value); e.target.value = '' } }}
                    style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', fontFamily:'monospace' }}/>
                </div>
                <Btn size="sm" variant="ghost" type="button" onClick={addItem}>+ Item manual</Btn>
              </div>

              {/* Items */}
              {form.items.length === 0 && (
                <p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center', padding:'12px 0' }}>Bipe um codigo ou clique em "+ Item manual"</p>
              )}
              {form.items.map((it, i) => (
                <div key={i} style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, padding:10, position:'relative' }}>
                  <button type="button" onClick={()=>removeItem(i)} title="Remover item"
                    style={{ position:'absolute', top:6, right:6, width:24, height:24, borderRadius:6, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', color:'#ef4444', fontSize:'.75rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
                  <Autocomplete clearOnSelect={false} value={{ label: it.product_label }}
                    fetchFn={fetchProducts}
                    onSelect={p => {
                      setItem(i, 'product_id', p.id); setItem(i, 'product_label', p.name)
                      setItem(i, 'unit_price', p.sale_price); setItem(i, 'controls_imei', !!p.controls_imei)
                      setItem(i, 'unit_id', null); setItem(i, 'stock_qty', p.stock_quantity)
                      setItem(i, 'brand', p.brand); setItem(i, 'model', p.model); setItem(i, 'sku', p.sku)
                    }}
                    renderOption={p => (<div><div style={{ fontWeight:600 }}>{p.name}</div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>SKU: {p.sku}{p.brand?` · ${p.brand}`:''}{p.model?` ${p.model}`:''} · Est: {fmt.num(p.stock_quantity)} · {fmt.brl(p.sale_price)}{p.controls_imei?' · IMEI':''}</div></div>)}
                    placeholder="Buscar produto..."/>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6, alignItems:'flex-end' }}>
                    <div style={{ flex:'0 0 60px' }}><Input label="Qtd" type="number" step="1" min="1" value={it.quantity} onChange={e=>setItem(i,'quantity',e.target.value)}/></div>
                    <div style={{ flex:'0 0 100px' }}><Input label="Preco (R$)" type="number" step="0.01" value={it.unit_price} onChange={e=>setItem(i,'unit_price',e.target.value)}/></div>
                    <div style={{ flex:'0 0 90px' }}><Input label="Desc (R$)" type="number" step="0.01" value={it.discount} onChange={e=>setItem(i,'discount',e.target.value)}/></div>
                    <div style={{ flex:'0 0 75px' }}>
                      <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:3 }}>Total</div>
                      <div style={{ fontWeight:700, fontSize:'.9rem' }}>{fmt.brl((parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0))}</div>
                    </div>
                    {it.stock_qty !== undefined && (
                      <div style={{ fontSize:'.72rem', color: parseFloat(it.quantity) > parseFloat(it.stock_qty) ? 'var(--danger)' : 'var(--muted)' }}>
                        Est: {fmt.num(it.stock_qty)}
                      </div>
                    )}
                  </div>
                  {it.controls_imei && (
                    <div style={{ marginTop:6 }}><ImeiSelect productId={it.product_id} value={it.unit_id} onChange={v=>setItem(i,'unit_id',v)}/></div>
                  )}
                  <input value={it.item_notes||''} onChange={e=>setItem(i,'item_notes',e.target.value)} placeholder="Obs do item (ex: pelicula instalada)"
                    style={{ width:'100%', marginTop:6, background:'transparent', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', padding:'5px 8px', fontSize:'.78rem', outline:'none' }}/>
                </div>
              ))}

              {/* Totals */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
                <Input label="Desconto (R$)" type="number" step="0.01" value={form.discount} onChange={e=>f({discount:e.target.value})}/>
                <Input label="Frete (R$)" type="number" step="0.01" value={form.shipping} onChange={e=>f({shipping:e.target.value})}/>
                <Input label="Acrescimo (R$)" type="number" step="0.01" value={form.surcharge} onChange={e=>f({surcharge:e.target.value})}/>
                <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'8px 12px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Total</div>
                  <div style={{ fontSize:'1.2rem', fontWeight:900, background:'var(--grad)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{fmt.brl(total)}</div>
                </div>
              </div>

              <div>
                <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observacoes</label>
                <textarea value={form.notes} onChange={e=>f({notes:e.target.value})} rows={2}
                  style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
              </div>
            </div>
          )}

          {/* ── TAB 1: Pagamento ── */}
          {tab === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:'1.1rem', fontWeight:900, background:'var(--grad)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Total: {fmt.brl(total)}</div>
                  <div style={{ fontSize:'.82rem', color: totalPaid >= total ? 'var(--success)' : 'var(--danger)' }}>
                    Pago: {fmt.brl(totalPaid)} {totalPaid >= total ? '(completo)' : `(falta ${fmt.brl(total - totalPaid)})`}
                  </div>
                  {form.payment_methods.some(p => p.method === 'dinheiro') && totalPaid > total && (
                    <div style={{ fontSize:'.82rem', color:'var(--primary)', fontWeight:700 }}>Troco: {fmt.brl(totalPaid - total)}</div>
                  )}
                </div>
                <Btn size="sm" variant="ghost" type="button" onClick={addPayment}>+ Forma de pagamento</Btn>
              </div>

              {/* Credit balance banner */}
              {!form.walk_in && form.client_id && creditBalance > 0 && (
                <div style={{ background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.25)', borderRadius:10, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:'.78rem', fontWeight:700, color:'#10b981' }}>CRÉDITO DISPONÍVEL NA LOJA</div>
                    <div style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:2 }}>
                      {clientCredits.length} crédito{clientCredits.length !== 1 ? 's' : ''} ativo{clientCredits.length !== 1 ? 's' : ''}
                      {clientCredits.map(c => ` • ${c.number}: ${fmt.brl(c.balance)}`).join('')}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ fontWeight:900, fontSize:'1.1rem', color:'#10b981' }}>{fmt.brl(creditBalance)}</div>
                    {!hasCredLojaPayment && (
                      <Btn size="sm" type="button" style={{ background:'#10b981', color:'#fff', border:'none' }}
                        onClick={()=>{
                          const remaining = Math.max(total - totalPaid, 0)
                          const useAmt = Math.min(creditBalance, remaining)
                          f({payment_methods:[...form.payment_methods, { method:'credito_loja', amount:String(useAmt.toFixed(2)), installments:1, notes:'' }]})
                        }}>
                        Usar crédito
                      </Btn>
                    )}
                  </div>
                </div>
              )}

              {form.payment_methods.length === 0 && (
                <p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center', padding:12 }}>Clique em "+ Forma de pagamento" para adicionar</p>
              )}

              {form.payment_methods.map((pm, i) => (
                <div key={i} style={{
                  display:'flex', gap:8, alignItems:'flex-end', borderRadius:8, padding:10, position:'relative',
                  background: pm.method === 'credito_loja' ? 'rgba(16,185,129,.06)' : 'var(--bg-card2)',
                  border: pm.method === 'credito_loja' ? '1px solid rgba(16,185,129,.3)' : '1px solid var(--border)',
                }}>
                  <button type="button" onClick={()=>removePayment(i)} title="Remover"
                    style={{ position:'absolute', top:6, right:6, width:24, height:24, borderRadius:6, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', color:'#ef4444', fontSize:'.75rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
                  <Select label="Forma" value={pm.method} onChange={e=>setPayment(i,'method',e.target.value)} style={{ flex:'1 1 120px' }}>
                    {PAY_METHODS.map(m => (
                      <option key={m.v} value={m.v} disabled={m.v === 'credito_loja' && creditBalance <= 0}>
                        {m.l}{m.v === 'credito_loja' ? (creditBalance > 0 ? ` (${fmt.brl(creditBalance)})` : ' (sem saldo)') : ''}
                      </option>
                    ))}
                  </Select>
                  <div style={{ flex:'1 1 100px' }}>
                    <Input label={pm.method === 'credito_loja' ? `Valor (max ${fmt.brl(creditBalance)})` : 'Valor (R$)'}
                      type="number" step="0.01" value={pm.amount}
                      max={pm.method === 'credito_loja' ? creditBalance : undefined}
                      onChange={e=>setPayment(i,'amount',e.target.value)} />
                  </div>
                  {pm.method === 'credito' && (
                    <Input label="Parcelas" type="number" min="1" max="24" value={pm.installments} onChange={e=>setPayment(i,'installments',e.target.value)} style={{ flex:'0 0 70px' }}/>
                  )}
                  {pm.method === 'credito_loja' ? (
                    <div style={{ flex:'1 1 100px', fontSize:'.78rem', color:'#10b981', display:'flex', alignItems:'flex-end', paddingBottom:8 }}>
                      Saldo após: {fmt.brl(Math.max(creditBalance - (parseFloat(pm.amount) || 0), 0))}
                    </div>
                  ) : (
                    <Input label="Obs" value={pm.notes} onChange={e=>setPayment(i,'notes',e.target.value)} style={{ flex:'1 1 100px' }} placeholder="Bandeira, NSU..."/>
                  )}
                </div>
              ))}

              {/* Quick fill buttons */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {PAY_METHODS.filter(m => m.v !== 'credito_loja').slice(0,4).map(m => (
                  <Btn key={m.v} size="sm" variant="ghost" type="button"
                    onClick={()=>f({payment_methods:[...form.payment_methods, { method:m.v, amount:String(Math.max(total - totalPaid, 0).toFixed(2)), installments:1, notes:'' }]})}>
                    {m.l}: {fmt.brl(Math.max(total - totalPaid, 0))}
                  </Btn>
                ))}
              </div>
            </div>
          )}

          {/* ── TAB 2: Fiscal ── */}
          {tab === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'rgba(168,85,247,.08)', borderRadius:8, padding:'10px 14px', fontSize:'.82rem', color:'var(--muted)' }}>
                Dados fiscais para emissao de nota. Preencha conforme necessario.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <Select label="Tipo de documento" value={form.fiscal_type} onChange={e=>f({fiscal_type:e.target.value})}>
                  <option value="">Nenhum (sem nota)</option>
                  <option value="nfce">NFC-e (consumidor)</option>
                  <option value="nfe">NF-e</option>
                </Select>
                <div>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>Cliente na nota</div>
                  <div style={{ fontSize:'.88rem', fontWeight:600 }}>
                    {form.walk_in ? (form.walk_in_document ? `CPF: ${form.walk_in_document}` : 'Sem identificacao') : (form.client_label || '—')}
                  </div>
                </div>
              </div>
              <div>
                <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observacoes fiscais</label>
                <textarea value={form.fiscal_notes} onChange={e=>f({fiscal_notes:e.target.value})} rows={2}
                  style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
              </div>
            </div>
          )}

          {/* Save bar */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16, paddingTop:12, borderTop:'1px solid var(--border)' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar pedido (F4)'}</Btn>
          </div>
        </div>
      </Modal>

      {/* ── DETALHE ────────────────────────────────────────────────── */}
      {detail && (
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={`Pedido ${detail.number}`} width={680}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Header info */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Cliente</div><div style={{ fontWeight:600 }}>{detail.walk_in ? (detail.walk_in_name || 'Consumidor final') : (detail.client_name || '—')}</div>
                {detail.walk_in_document && <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>Doc: {detail.walk_in_document}</div>}
              </div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Status</div><Badge color={detail.status_color || getStatusDef(detail.status)?.color || '#6b7280'}>{detail.status_label || detail.status}</Badge></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Total</div><div style={{ fontWeight:900, fontSize:'1.1rem' }}>{fmt.brl(detail.total)}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Data</div><div>{new Date(detail.created_at).toLocaleString('pt-BR')}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Canal</div><div>{channelLabel[detail.channel] || detail.channel || '—'}</div></div>
              {detail.seller_name && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Vendedor</div><div>{detail.seller_name}</div></div>}
            </div>

            {detail.cancel_reason && (
              <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, padding:'8px 12px' }}>
                <div style={{ fontSize:'.75rem', fontWeight:700, color:'#ef4444' }}>
                  {detail.status === 'returned' ? 'Motivo da devolução' : 'Motivo do cancelamento'}
                </div>
                <div style={{ fontSize:'.85rem' }}>{detail.cancel_reason}</div>
              </div>
            )}

            {detail.reserved_until && detail.status === 'separated' && (
              <div style={{ background:'rgba(139,92,246,.08)', border:'1px solid rgba(139,92,246,.25)', borderRadius:8, padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:'.82rem', color:'#8b5cf6' }}>
                  <strong>Reservado até:</strong> {new Date(detail.reserved_until).toLocaleDateString('pt-BR')} às {new Date(detail.reserved_until).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
                </div>
                {new Date(detail.reserved_until) < new Date() && (
                  <span style={{ fontSize:'.75rem', fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,.1)', padding:'2px 8px', borderRadius:4 }}>EXPIRADA</span>
                )}
              </div>
            )}

            {detail.return_type && (
              <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ fontSize:'.78rem', fontWeight:700, color:'#f97316' }}>
                    <RotateCcw size={13} style={{ display:'inline', marginRight:4, verticalAlign:'middle' }}/>
                    DEVOLUÇÃO — {detail.return_type === 'credit' ? 'Crédito na loja' : 'Estorno financeiro'}
                  </div>
                  {detail.credit_amount > 0 && (
                    <div style={{ fontWeight:900, fontSize:'1rem', color:'#f97316' }}>{fmt.brl(detail.credit_amount)}</div>
                  )}
                </div>
                {detail.credit?.number && (
                  <div style={{ fontSize:'.82rem', color:'var(--text)' }}>
                    Documento: <span style={{ fontWeight:700, fontFamily:'monospace' }}>{detail.credit.number}</span>
                  </div>
                )}
              </div>
            )}

            {/* Items */}
            <div>
              <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:6 }}>ITENS</div>
              {(detail.items || []).map(it => (
                <div key={it.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:'.85rem' }}>
                  <div>
                    <div><span style={{ fontWeight:600 }}>{it.product_name}</span> <span style={{ color:'var(--muted)' }}>x{it.quantity}</span></div>
                    {(it.brand || it.sku) && <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>{it.sku}{it.brand ? ` — ${it.brand} ${it.model||''}` : ''}</div>}
                    {it.unit_imei && <div style={{ fontSize:'.72rem', color:'var(--primary)', fontFamily:'monospace' }}>IMEI: {it.unit_imei}{it.unit_imei2 ? ` / ${it.unit_imei2}` : ''}</div>}
                    {it.unit_serial && <div style={{ fontSize:'.72rem', color:'var(--primary)', fontFamily:'monospace' }}>Serial: {it.unit_serial}</div>}
                    {it.item_notes && <div style={{ fontSize:'.72rem', color:'var(--muted)', fontStyle:'italic' }}>{it.item_notes}</div>}
                  </div>
                  <span style={{ fontWeight:600 }}>{fmt.brl(it.total)}</span>
                </div>
              ))}
              {detail.discount > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'.85rem', color:'var(--muted)' }}><span>Desconto</span><span>-{fmt.brl(detail.discount)}</span></div>}
              {detail.shipping > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'.85rem', color:'var(--muted)' }}><span>Frete</span><span>{fmt.brl(detail.shipping)}</span></div>}
              {detail.surcharge > 0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'.85rem', color:'var(--muted)' }}><span>Acrescimo</span><span>{fmt.brl(detail.surcharge)}</span></div>}
            </div>

            {/* Payments */}
            {detail.payment_methods && detail.payment_methods.length > 0 && (
              <div>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:6 }}>PAGAMENTO</div>
                {detail.payment_methods.map((pm, i) => {
                  const label = pm.method === 'credito_loja' ? 'CRÉDITO LOJA' : pm.method.toUpperCase()
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'.85rem', borderBottom:'1px solid var(--border)' }}>
                      <span style={pm.method === 'credito_loja' ? { color:'#10b981', fontWeight:600 } : {}}>
                        {label}{pm.installments > 1 ? ` ${pm.installments}x` : ''}{pm.notes ? ` (${pm.notes})` : ''}
                      </span>
                      <span style={{ fontWeight:600 }}>{fmt.brl(pm.amount)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {detail.notes && <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'8px 12px', fontSize:'.85rem', color:'var(--muted)' }}>{detail.notes}</div>}

            {/* Actions */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" size="sm" onClick={()=>printReceipt(detail)}><Printer size={14}/> Imprimir</Btn>
              {detail.status === 'draft' && (
                <Btn variant="ghost" size="sm" onClick={()=>{setDetail(null);openEdit(detail)}}>✏️ Editar</Btn>
              )}
              {statuses.filter(s => s.slug !== detail.status && s.slug !== 'draft').map(s => (
                <Btn key={s.slug} size="sm" style={{ background:s.color+'22', color:s.color, border:`1px solid ${s.color}55` }}
                  onClick={()=>changeStatus(detail.id, s.slug)}>{s.label}</Btn>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Status confirm modal */}
      {statusConfirm && (
        <Modal open={!!statusConfirm} onClose={()=>setStatusConfirm(null)} title="Confirmar alteração" width={400}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <p style={{ fontSize:'.9rem', color:'var(--text)' }}>
              Alterar o status deste pedido para <strong>{statusConfirm.statusName}</strong>?
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setStatusConfirm(null)}>Cancelar</Btn>
              <Btn onClick={doChangeStatus} disabled={saving}>{saving ? 'Aguarde...' : 'Confirmar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <Modal open={!!cancelModal} onClose={()=>setCancelModal(null)} title={cancelModal.statusName}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, padding:'8px 12px', fontSize:'.85rem', color:'#ef4444' }}>
              Se o pedido ja tinha baixa de estoque, os itens serao devolvidos automaticamente.
            </div>
            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Motivo *</label>
              <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={3} placeholder="Descreva o motivo..."
                style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setCancelModal(null)}>Voltar</Btn>
              <Btn variant="danger" onClick={confirmCancel} disabled={saving}>{saving ? 'Aguarde...' : 'Confirmar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Return modal */}
      {returnModal && (
        <Modal open={!!returnModal} onClose={()=>setReturnModal(null)} title="Devolução de pedido" width={520}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'10px 14px', fontSize:'.85rem', color:'#f97316' }}>
              <RotateCcw size={14} style={{ display:'inline', marginRight:6, verticalAlign:'middle' }}/>
              O estoque será devolvido automaticamente e um documento de crédito/estorno será gerado para rastreamento e auditoria.
            </div>

            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6 }}>Tipo da devolução *</label>
              <div style={{ display:'flex', gap:10 }}>
                {[
                  { v:'credit', l:'Crédito na loja', desc:'Gera crédito para o cliente usar em compras futuras', icon:'🏷️' },
                  { v:'refund', l:'Estorno financeiro', desc:'Devolver o valor ao cliente (PIX, dinheiro, etc.)', icon:'💰' },
                ].map(opt => (
                  <div key={opt.v} onClick={()=>setReturnType(opt.v)}
                    style={{
                      flex:1, padding:'12px 14px', borderRadius:10, cursor:'pointer',
                      border: returnType===opt.v ? '2px solid var(--primary)' : '2px solid var(--border)',
                      background: returnType===opt.v ? 'var(--primary)11' : 'var(--bg-card2)',
                      transition:'all .15s',
                    }}>
                    <div style={{ fontSize:'1.1rem', marginBottom:4 }}>{opt.icon}</div>
                    <div style={{ fontWeight:700, fontSize:'.88rem' }}>{opt.l}</div>
                    <div style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:2 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Motivo da devolução *</label>
              <textarea value={returnReason} onChange={e=>setReturnReason(e.target.value)} rows={3}
                placeholder="Descreva o motivo da devolução (ex: produto com defeito, troca, arrependimento...)"
                style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
            </div>

            <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 14px', fontSize:'.82rem' }}>
              <div style={{ color:'var(--muted)', marginBottom:4 }}>Ao confirmar:</div>
              <div>• Estoque será restituído</div>
              <div>• Unidades (IMEI/Serial) voltam a "disponível"</div>
              {returnType === 'credit' && <div>• Crédito será gerado no valor total do pedido</div>}
              {returnType === 'refund' && <div>• Transação de estorno será registrada no financeiro</div>}
              <div>• Documento rastreável será gerado com nº do pedido</div>
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setReturnModal(null)}>Voltar</Btn>
              <Btn style={{ background:'#f97316', color:'#fff', border:'none' }} onClick={confirmReturn} disabled={saving}>
                {saving ? 'Processando...' : 'Confirmar devolução'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Status manager */}
      <Modal open={statusModal} onClose={()=>{setStatusModal(false);loadStatuses()}} title="Gerenciar Status" width={520}>
        <StatusManager onClose={()=>setStatusModal(false)} onRefresh={loadStatuses}/>
      </Modal>
    </div>
  )
}
