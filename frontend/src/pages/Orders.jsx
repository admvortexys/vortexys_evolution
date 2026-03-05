import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, Autocomplete, fmt } from '../components/UI'

const emptyForm = { client_id:'', client_label:'', seller_id:'', items:[], discount:0, notes:'' }

function ImeiSelect({ productId, value, onChange }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!productId) return
    setLoading(true)
    api.get(`/products/${productId}/units?status=available`).then(r => setUnits(r.data)).finally(() => setLoading(false))
  }, [productId])
  if (loading) return <span style={{ fontSize:'.78rem', color:'var(--muted)' }}>Carregando IMEIs...</span>
  if (!units.length) return <span style={{ fontSize:'.78rem', color:'var(--danger)' }}>Sem IMEI disponível</span>
  return (
    <div>
      <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>IMEI / Serial</label>
      <select value={value||''} onChange={e=>onChange(e.target.value ? parseInt(e.target.value) : null)}
        style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 10px', fontSize:'.82rem', fontFamily:'monospace' }}>
        <option value="">Selecionar IMEI...</option>
        {units.map(u => <option key={u.id} value={u.id}>{u.imei || u.serial || `#${u.id}`}{u.imei2 ? ` / ${u.imei2}` : ''}</option>)}
      </select>
    </div>
  )
}

// ─── Gerenciar status customizados ────────────────────────────────────────
function StatusManager({ onClose, onRefresh }) {
  const [statuses, setStatuses] = useState([])
  const [form, setForm]         = useState({ label:'', color:'#6366f1', stock_action:'none' })
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const { toast, confirm } = useToast()

  const load = () => api.get('/order-statuses').then(r => setStatuses(r.data))
  useEffect(() => { load() }, [])

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/order-statuses/${editId}`, form)
      else        await api.post('/order-statuses', form)
      setForm({ label:'', color:'#6366f1', stock_action:'none' })
      setEditId(null); load(); onRefresh()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const del = async id => {
    if (!await confirm('Excluir status?')) return
    try { await api.delete(`/order-statuses/${id}`); load(); onRefresh() }
    catch(err) { toast.error(err.response?.data?.error||'Erro') }
  }

  const stockLabels = { none:'Nenhuma', deduct:'Dá baixa no estoque', return:'Devolve ao estoque', reserve:'Reserva estoque', cancel:'Cancela/devolve estoque' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ padding:'10px 14px', background:'rgba(180,79,255,.1)', borderRadius:8, border:'1px solid rgba(180,79,255,.2)', fontSize:'.82rem', color:'var(--muted)' }}>
        💡 Status de sistema não podem ser editados ou excluídos.
      </div>
      <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Input label="Nome do status *" value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} required/>
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Cor</label>
            <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
              style={{ width:'100%', height:38, padding:2, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', cursor:'pointer' }}/>
          </div>
        </div>
        <Select label="Ação no estoque" value={form.stock_action} onChange={e=>setForm(p=>({...p,stock_action:e.target.value}))}>
          <option value="none">Nenhuma ação</option>
          <option value="deduct">Dar baixa no estoque (ex: Pago, Entregue)</option>
          <option value="return">Devolver ao estoque (ex: Devolução)</option>
          <option value="reserve">Reservar estoque (sem dar baixa)</option>
          <option value="cancel">Cancelar (devolve se havia baixa)</option>
        </Select>
        <div style={{ display:'flex', gap:8 }}>
          <Btn type="submit" disabled={saving} size="sm">{editId ? 'Salvar' : '+ Adicionar status'}</Btn>
          {editId && <Btn variant="ghost" size="sm" onClick={()=>{setEditId(null);setForm({label:'',color:'#6366f1',stock_action:'none'})}}>Cancelar</Btn>}
        </div>
      </form>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {statuses.map(s => (
          <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ width:12, height:12, borderRadius:3, background:s.color, display:'inline-block', flexShrink:0 }}/>
              <div>
                <span style={{ fontSize:'.9rem', fontWeight:600 }}>{s.label}</span>
                {s.is_system && <span style={{ marginLeft:6, fontSize:'.7rem', color:'var(--muted)' }}>(sistema)</span>}
                <div style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:1 }}>
                  📦 {stockLabels[s.stock_action]||'Nenhuma ação'}
                </div>
              </div>
            </div>
            {!s.is_system && (
              <div style={{ display:'flex', gap:6 }}>
                <Btn size="sm" variant="ghost" onClick={()=>{setEditId(s.id);setForm({label:s.label,color:s.color,stock_action:s.stock_action})}}>✏️</Btn>
                <Btn size="sm" variant="danger" onClick={()=>del(s.id)}>🗑</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Orders() {
  const [rows, setRows]         = useState([])
  const [statuses, setStatuses] = useState([])
  const [sellers, setSellers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detail, setDetail]     = useState(null)
  const [statusModal, setStatusModal] = useState(false)
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [filter, setFilter]     = useState('')
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const { toast, confirm } = useToast()

  const loadStatuses = () => api.get('/order-statuses').then(r => setStatuses(r.data))

  const load = () => {
    const p = filter ? `?status=${filter}` : ''
    setLoading(true)
    api.get(`/orders${p}`).then(r=>setRows(r.data)).finally(()=>setLoading(false))
  }
  useEffect(() => {
    loadStatuses()
    api.get('/sellers').then(r => setSellers(r.data.filter(s=>s.active)))
  }, [])
  useEffect(() => { load() }, [filter])

  const openNew = () => { setForm(emptyForm); setEditId(null); setModal(true) }

  const openEdit = async row => {
    if (row.status !== 'draft') { openDetail(row); return }
    const r = await api.get(`/orders/${row.id}`)
    setForm({
      client_id: r.data.client_id,
      client_label: r.data.client_name||'',
      seller_id: r.data.seller_id||'',
      discount: r.data.discount,
      notes: r.data.notes||'',
      items: r.data.items.map(it=>({
        product_id: it.product_id,
        product_label: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount: it.discount,
        controls_imei: !!it.controls_imei,
        unit_id: it.unit_id||null,
      }))
    })
    setEditId(row.id); setModal(true)
  }

  const openDetail = async row => {
    setLoadingDetail(true)
    try {
      const r = await api.get(`/orders/${row.id}`)
      setDetail(r.data)
    } catch(err) {
      toast.error('Erro ao carregar detalhes do pedido')
    } finally {
      setLoadingDetail(false)
    }
  }

  const fetchClients  = q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r=>r.data)
  const fetchProducts = q => api.get(`/products/search?q=${encodeURIComponent(q)}`).then(r=>r.data)

  const addItem = () => setForm(f=>({...f, items:[...f.items, {product_id:'',product_label:'',quantity:1,unit_price:0,discount:0,controls_imei:false,unit_id:null}]}))
  const removeItem = i => setForm(f=>({...f, items:f.items.filter((_,idx)=>idx!==i)}))
  const setItem = (i, key, val) => setForm(f=>{ const items=[...f.items]; items[i]={...items[i],[key]:val}; return {...f,items} })

  const subtotal = form.items.reduce((s,it)=>s+(parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0),0)
  const total    = subtotal - (parseFloat(form.discount)||0)

  const save = async e => {
    e.preventDefault()
    if (!form.client_id) return toast.error('Selecione um cliente')
    if (!form.items.length) return toast.error('Adicione pelo menos um item')
    setSaving(true)
    try {
      if (editId) await api.put(`/orders/${editId}`, form)
      else        await api.post('/orders', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const changeStatus = async (id, statusSlug) => {
    const sdef = statuses.find(s => s.slug === statusSlug)
    if (!sdef) return
    if (sdef.stock_action === 'cancel') {
      setCancelReason('')
      setCancelModal({ id, statusSlug, statusName: sdef.label })
      return
    }
    if (!await confirm(`Alterar para "${sdef.label}"?`)) return
    try {
      await api.patch(`/orders/${id}/status`, { status: statusSlug })
      setDetail(null); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
  }

  const confirmCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Informe o motivo')
    setSaving(true)
    try {
      await api.patch(`/orders/${cancelModal.id}/status`, { status: cancelModal.statusSlug, cancel_reason: cancelReason })
      setCancelModal(null); setDetail(null); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const getStatusDef = slug => statuses.find(s => s.slug === slug)

  const cols = [
    { key:'number',       label:'Nº Pedido'  },
    { key:'client_name',  label:'Cliente'    },
    { key:'seller_name',  label:'Vendedor', render: v => v||'—' },
    { key:'status',       label:'Status', render:(v,row) => {
      const s = getStatusDef(v)
      return <Badge color={s?.color||'#6b7280'}>{row.status_label||v}</Badge>
    }},
    { key:'total',       label:'Total', render: v => fmt.brl(v) },
    { key:'created_at',  label:'Data',  render: v => fmt.date(v) },
    { key:'user_name',   label:'Criado por' },
  ]

  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Pedidos de venda" icon={ShoppingCart}
        action={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" onClick={()=>setStatusModal(true)}>⚙️ Status</Btn>
            <Btn onClick={openNew}>+ Novo pedido</Btn>
          </div>
        }
      />

      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Btn size="sm" variant={filter===''?'primary':'ghost'} onClick={()=>setFilter('')}>Todos</Btn>
          {statuses.map(s => (
            <Btn key={s.slug} size="sm"
              variant={filter===s.slug?'primary':'ghost'}
              style={filter===s.slug?{}:{ borderColor: s.color+'55', color: s.color }}
              onClick={()=>setFilter(s.slug)}>
              {s.label}
            </Btn>
          ))}
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={openEdit}/>}</Card>

      {/* Criar / Editar pedido */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar pedido (rascunho)':'Novo pedido'} width={720}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Autocomplete
              label="Cliente *"
              value={{ label: form.client_label }}
              fetchFn={fetchClients}
              onSelect={c => setForm(f=>({...f, client_id:c.id, client_label:c.name}))}
              renderOption={c => (
                <div>
                  <div style={{ fontWeight:600 }}>{c.name}</div>
                  <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{[c.document,c.phone].filter(Boolean).join(' · ')}</div>
                </div>
              )}
              placeholder="Buscar por nome, CPF, CNPJ..."
            />
            <Select label="Vendedor" value={form.seller_id} onChange={e=>setForm(f=>({...f,seller_id:e.target.value}))}>
              <option value="">Sem vendedor</option>
              {sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          {form.client_id && <div style={{ marginTop:-10, fontSize:'.78rem', color:'var(--success)' }}>✓ Cliente selecionado</div>}

          {/* Itens */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <label style={{ fontSize:'.82rem', fontWeight:600, color:'var(--muted)' }}>Itens do pedido</label>
              <Btn size="sm" variant="ghost" type="button" onClick={addItem}>+ Item</Btn>
            </div>
            {form.items.length === 0 && (
              <p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center', padding:'16px 0' }}>Clique em "+ Item" para adicionar produtos</p>
            )}
            {form.items.map((it, i) => (
              <div key={i} style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, padding:12, marginBottom:8 }}>
                <Autocomplete
                  clearOnSelect={false}
                  value={{ label: it.product_label }}
                  fetchFn={fetchProducts}
                  onSelect={p => {
                    setItem(i,'product_id',p.id)
                    setItem(i,'product_label',p.name)
                    setItem(i,'unit_price',p.sale_price)
                    setItem(i,'controls_imei',!!p.controls_imei)
                    setItem(i,'unit_id',null)
                  }}
                  renderOption={p => (
                    <div>
                      <div style={{ fontWeight:600 }}>{p.name}</div>
                      <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>
                        SKU: {p.sku}{p.brand?` · ${p.brand}`:''}{p.model?` ${p.model}`:''}{p.barcode?` · ${p.barcode}`:''} · Est: {fmt.num(p.stock_quantity)} · {fmt.brl(p.sale_price)}
                        {p.controls_imei && ' · 📱 IMEI'}
                      </div>
                    </div>
                  )}
                  placeholder="Buscar por nome, SKU ou código de barras..."
                />
                {it.controls_imei && (
                  <div style={{ marginTop:8 }}>
                    <ImeiSelect productId={it.product_id} value={it.unit_id} onChange={v=>setItem(i,'unit_id',v)}/>
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:8, marginTop:8, alignItems:'end' }}>
                  <Input label="Qtd" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e=>setItem(i,'quantity',e.target.value)}/>
                  <Input label="Preço unit. (R$)" type="number" step="0.01" value={it.unit_price} onChange={e=>setItem(i,'unit_price',e.target.value)}/>
                  <Input label="Desconto (R$)" type="number" step="0.01" value={it.discount} onChange={e=>setItem(i,'discount',e.target.value)}/>
                  <div>
                    <div style={{ fontSize:'.78rem', color:'var(--muted)', marginBottom:5 }}>Total</div>
                    <div style={{ fontWeight:700, fontSize:'.9rem', paddingTop:2 }}>
                      {fmt.brl((parseFloat(it.quantity)||0)*(parseFloat(it.unit_price)||0)-(parseFloat(it.discount)||0))}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={()=>removeItem(i)} style={{ background:'none', border:'none', color:'var(--danger)', fontSize:'.78rem', cursor:'pointer', marginTop:6, padding:0 }}>✕ Remover item</button>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Desconto geral (R$)" type="number" step="0.01" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))}/>
            <div style={{ padding:'9px 12px', background:'var(--bg-card2)', borderRadius:8 }}>
              <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Total do pedido</div>
              <div style={{ fontSize:'1.3rem', fontWeight:900, background:'var(--grad)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{fmt.brl(total)}</div>
            </div>
          </div>

          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Observações</label>
            <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
              style={{ width:'100%',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',padding:'9px 12px',fontSize:'.9rem',outline:'none',resize:'vertical' }}/>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':editId?'Salvar alterações':'Criar pedido'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Detalhe do pedido */}
      {detail && (
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={`Pedido ${detail.number}`} width={640}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Cliente</div><div style={{ fontWeight:600 }}>{detail.client_name||'—'}</div></div>
              <div>
                <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Status</div>
                <Badge color={getStatusDef(detail.status)?.color||'#6b7280'}>{detail.status_label||detail.status}</Badge>
              </div>
              <div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Total</div><div style={{ fontWeight:700, fontSize:'1.1rem' }}>{fmt.brl(detail.total)}</div></div>
              <div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Data</div><div>{fmt.date(detail.created_at)}</div></div>
              {detail.seller_name && <div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Vendedor</div><div style={{ fontWeight:600 }}>{detail.seller_name}</div></div>}
              {detail.client_phone && <div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>Telefone</div><div>{detail.client_phone}</div></div>}
            </div>

            {detail.cancel_reason && (
              <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:'#ef4444', marginBottom:2 }}>Motivo do cancelamento</div>
                <div style={{ fontSize:'.88rem' }}>{detail.cancel_reason}</div>
              </div>
            )}

            <div>
              <div style={{ fontSize:'.82rem', fontWeight:700, color:'var(--muted)', marginBottom:8 }}>ITENS</div>
              {(detail.items||[]).map(it=>(
                <div key={it.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:'.88rem' }}>
                  <div>
                    <span style={{ fontWeight:600 }}>{it.product_name}</span>
                    <span style={{ color:'var(--muted)', marginLeft:6 }}>×{it.quantity}</span>
                    {it.barcode && <span style={{ color:'var(--muted)', marginLeft:6, fontSize:'.75rem' }}>({it.barcode})</span>}
                    {it.unit_imei && <div style={{ fontSize:'.75rem', color:'var(--primary)', fontFamily:'monospace', marginTop:2 }}>IMEI: {it.unit_imei}{it.unit_imei2 ? ` / ${it.unit_imei2}` : ''}</div>}
                    {it.unit_serial && <div style={{ fontSize:'.75rem', color:'var(--primary)', fontFamily:'monospace', marginTop:2 }}>Serial: {it.unit_serial}</div>}
                  </div>
                  <span style={{ fontWeight:600 }}>{fmt.brl(it.total)}</span>
                </div>
              ))}
              {detail.discount > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:'.88rem', color:'var(--muted)' }}>
                  <span>Desconto geral</span><span>-{fmt.brl(detail.discount)}</span>
                </div>
              )}
            </div>

            {detail.notes && (
              <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 12px', fontSize:'.88rem', color:'var(--muted)' }}>{detail.notes}</div>
            )}

            {/* Botões de status (baseados na lista de statuses) */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              {detail.status === 'draft' && (
                <Btn variant="secondary" size="sm" onClick={()=>{setDetail(null);openEdit(detail)}}>✏️ Editar rascunho</Btn>
              )}
              {statuses
                .filter(s => s.slug !== detail.status && s.slug !== 'draft')
                .map(s => (
                  <Btn key={s.slug} size="sm"
                    style={{ background:s.color+'22', color:s.color, border:`1px solid ${s.color}55` }}
                    onClick={()=>changeStatus(detail.id, s.slug)}>
                    {s.label}
                  </Btn>
                ))
              }
            </div>
          </div>
        </Modal>
      )}

      {/* Modal cancelamento */}
      {cancelModal && (
        <Modal open={!!cancelModal} onClose={()=>setCancelModal(null)} title={`❌ ${cancelModal.statusName}`}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'10px 14px', fontSize:'.88rem', color:'#ef4444' }}>
              ⚠️ Se o pedido já tinha itens com baixa de estoque, eles serão devolvidos automaticamente.
            </div>
            <div>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Motivo *</label>
              <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={3}
                placeholder="Descreva o motivo..."
                style={{ width:'100%',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',padding:'9px 12px',fontSize:'.9rem',outline:'none',resize:'vertical' }}/>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setCancelModal(null)}>Voltar</Btn>
              <Btn variant="danger" onClick={confirmCancel} disabled={saving}>{saving?'Aguarde...':'Confirmar'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal gerenciar status */}
      <Modal open={statusModal} onClose={()=>{setStatusModal(false);loadStatuses()}} title="⚙️ Gerenciar Status de Pedidos" width={540}>
        <StatusManager onClose={()=>setStatusModal(false)} onRefresh={loadStatuses}/>
      </Modal>
    </div>
  )
}
