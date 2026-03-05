import { useEffect, useState, useRef, useCallback } from 'react'
import { RefreshCw, Search, X, ChevronDown } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, Autocomplete, KpiCard, fmt } from '../components/UI'

const MOVE_TYPES = {
  purchase:        { label:'Compra',               color:'#3b82f6', icon:'📥' },
  sale:            { label:'Venda',                color:'#8b5cf6', icon:'🛒' },
  return_client:   { label:'Devol. cliente',       color:'#10b981', icon:'↩️' },
  return_supplier: { label:'Devol. fornecedor',    color:'#f97316', icon:'↪️' },
  transfer_out:    { label:'Saída transf.',        color:'#eab308', icon:'📤' },
  transfer_in:     { label:'Entrada transf.',      color:'#06b6d4', icon:'📥' },
  adjustment_pos:  { label:'Ajuste +',             color:'#22c55e', icon:'➕' },
  adjustment_neg:  { label:'Ajuste −',             color:'#ef4444', icon:'➖' },
  inventory:       { label:'Inventário',           color:'#1e40af', icon:'📋' },
  reserve:         { label:'Reserva',              color:'#6b7280', icon:'🔒' },
  unreserve:       { label:'Baixa reserva',        color:'#9ca3af', icon:'🔓' },
  service_in:      { label:'Entr. assistência',    color:'#ec4899', icon:'🔧' },
  service_out:     { label:'Saída assistência',    color:'#be185d', icon:'🔧' },
  service_discard: { label:'Descarte assist.',     color:'#991b1b', icon:'🗑' },
}

const oldTypeMap = { in:'Entrada', out:'Saída', adjustment:'Ajuste' }
const oldTypeColor = { in:'#10b981', out:'#ef4444', adjustment:'#f59e0b' }

function getMoveLabel(row) {
  if (row.movement_type && MOVE_TYPES[row.movement_type]) return MOVE_TYPES[row.movement_type]
  return { label: oldTypeMap[row.type] || row.type, color: oldTypeColor[row.type] || '#6b7280', icon: row.type === 'in' ? '📥' : '📤' }
}

function DatePresets({ onSelect }) {
  const today = new Date().toISOString().slice(0,10)
  const d = n => { const dt = new Date(); dt.setDate(dt.getDate()-n); return dt.toISOString().slice(0,10) }
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10)
  return (
    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
      {[
        { l:'Hoje', s:today, e:today },
        { l:'7 dias', s:d(7), e:today },
        { l:'30 dias', s:d(30), e:today },
        { l:'Mês', s:firstOfMonth, e:today },
      ].map(p => (
        <button key={p.l} onClick={()=>onSelect(p.s,p.e)} style={{
          padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)',
          background:'var(--bg-card2)', color:'var(--muted)', fontSize:'.72rem',
          cursor:'pointer', whiteSpace:'nowrap',
        }}>{p.l}</button>
      ))}
    </div>
  )
}

// ─── KPI bar for selected product ────────────────────────────────────────

function ProductKpis({ productId }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!productId) return
    api.get(`/stock/summary/${productId}`).then(r => setData(r.data)).catch(() => {})
  }, [productId])
  if (!data) return null
  const s = data.stock
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10, marginBottom:16 }}>
      <KpiCard icon="📦" label="Saldo físico" value={fmt.num(s.physical)} color="#8b5cf6"/>
      <KpiCard icon="✅" label="Disponível" value={fmt.num(s.available)} color="#10b981"/>
      <KpiCard icon="🔒" label="Reservado" value={fmt.num(s.reserved)} color="#eab308"/>
      <KpiCard icon="🔧" label="Em assistência" value={fmt.num(s.in_service)} color="#ec4899"/>
      {s.units_total > 0 && (
        <KpiCard icon="📱" label="Unidades (IMEI)" value={`${s.units_available} / ${s.units_total}`} color="#3b82f6"/>
      )}
    </div>
  )
}

// ─── IMEI Unit timeline ──────────────────────────────────────────────────

function UnitTimeline({ unitId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get(`/stock/unit/${unitId}/history`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [unitId])
  if (loading) return <Spinner/>
  if (!data) return <p style={{ color:'var(--muted)' }}>Erro ao carregar</p>
  const u = data.unit
  const statusColor = { available:'#10b981', sold:'#6366f1', reserved:'#f59e0b', defective:'#ef4444', returned:'#8b5cf6' }
  const statusLabel = { available:'Disponível', sold:'Vendido', reserved:'Reservado', defective:'Defeito', returned:'Devolvido' }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Produto</div>
          <div style={{ fontWeight:700 }}>{u.product_name}</div>
          <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{u.sku} — {[u.brand,u.model].filter(Boolean).join(' ')}</div>
        </div>
        <div>
          <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Status</div>
          <Badge color={statusColor[u.status]}>{statusLabel[u.status]||u.status}</Badge>
        </div>
        {u.imei && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>IMEI 1</div><div style={{ fontFamily:'monospace', fontWeight:600 }}>{u.imei}</div></div>}
        {u.imei2 && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>IMEI 2</div><div style={{ fontFamily:'monospace' }}>{u.imei2}</div></div>}
        {u.serial && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Serial</div><div style={{ fontFamily:'monospace' }}>{u.serial}</div></div>}
        {u.order_number && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Pedido vinculado</div><div style={{ fontWeight:600, color:'var(--primary)' }}>#{u.order_number}</div></div>}
        {u.purchase_date && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Data compra</div><div>{fmt.date(u.purchase_date)}</div></div>}
        {u.supplier && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Fornecedor</div><div>{u.supplier}</div></div>}
      </div>
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
        <div style={{ fontWeight:700, fontSize:'.88rem', marginBottom:10 }}>Timeline ({data.movements.length})</div>
        {data.movements.length === 0 ? (
          <p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center' }}>Nenhuma movimentação registrada</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {data.movements.map((m,i) => {
              const mt = getMoveLabel(m)
              return (
                <div key={m.id} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom: i < data.movements.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:mt.color, marginTop:6, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <Badge color={mt.color}>{mt.label}</Badge>
                        {m.cancelled && <Badge color="#991b1b">Cancelada</Badge>}
                      </div>
                      <span style={{ fontSize:'.72rem', color:'var(--muted)' }}>{fmt.date(m.created_at)}</span>
                    </div>
                    <div style={{ fontSize:'.8rem', color:'var(--muted)', marginTop:3 }}>
                      {m.qty_in > 0 && <span style={{ color:'#10b981', fontWeight:600 }}>+{fmt.num(m.qty_in)} </span>}
                      {m.qty_out > 0 && <span style={{ color:'#ef4444', fontWeight:600 }}>-{fmt.num(m.qty_out)} </span>}
                      {m.reason && <span>— {m.reason}</span>}
                    </div>
                    {m.user_name && <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>por {m.user_name}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Movement detail ─────────────────────────────────────────────────────

function MovementDetail({ movId, onClose, onCancelled }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()

  useEffect(() => {
    api.get(`/stock/movement/${movId}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }, [movId])

  const doCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Informe o motivo do estorno')
    setSaving(true)
    try {
      await api.post(`/stock/movement/${movId}/cancel`, { cancel_reason: cancelReason })
      toast.success('Movimentação estornada')
      setCancelOpen(false)
      onCancelled?.()
      onClose()
    } catch(err) { toast.error(err.response?.data?.error || 'Erro ao estornar') }
    finally { setSaving(false) }
  }

  if (loading) return <Spinner/>
  if (!data) return <p style={{ color:'var(--muted)' }}>Erro ao carregar</p>
  const mt = getMoveLabel(data)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {data.image_base64
          ? <img src={data.image_base64} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:'cover', border:'1px solid var(--border)' }}/>
          : <div style={{ width:48, height:48, borderRadius:8, background:'var(--bg-card2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>📦</div>
        }
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700 }}>{data.product_name}</div>
          <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{data.sku}{data.brand ? ` — ${data.brand} ${data.model||''}` : ''}</div>
        </div>
        <div style={{ display:'flex', gap:6, flexDirection:'column', alignItems:'flex-end' }}>
          <Badge color={mt.color}>{mt.icon} {mt.label}</Badge>
          {data.cancelled && <Badge color="#991b1b">Cancelada</Badge>}
        </div>
      </div>

      {/* Grid de info */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, background:'var(--bg-card2)', borderRadius:8, padding:14 }}>
        <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Data/Hora</div><div style={{ fontWeight:600, fontSize:'.88rem' }}>{data.created_at ? new Date(data.created_at).toLocaleString('pt-BR') : '—'}</div></div>
        <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Usuário</div><div style={{ fontWeight:600, fontSize:'.88rem' }}>{data.user_name||'—'}</div></div>
        <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Movimentação #</div><div style={{ fontWeight:600, fontSize:'.88rem' }}>{data.id}</div></div>
      </div>

      {/* Quantidades */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <div style={{ background:'rgba(16,185,129,.08)', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
          <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Entrada</div>
          <div style={{ fontSize:'1.2rem', fontWeight:900, color:'#10b981' }}>{data.qty_in > 0 ? `+${fmt.num(data.qty_in)}` : '—'}</div>
        </div>
        <div style={{ background:'rgba(239,68,68,.08)', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
          <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Saída</div>
          <div style={{ fontSize:'1.2rem', fontWeight:900, color:'#ef4444' }}>{data.qty_out > 0 ? `-${fmt.num(data.qty_out)}` : '—'}</div>
        </div>
        <div style={{ background:'rgba(139,92,246,.08)', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
          <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Saldo após</div>
          <div style={{ fontSize:'1.2rem', fontWeight:900, color:'var(--primary)' }}>{fmt.num(data.new_qty)}</div>
        </div>
      </div>

      {/* Details grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {data.document_type && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Tipo documento</div><div>{data.document_type}</div></div>}
        {(data.document_number || data.order_number) && (
          <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Nº documento</div><div style={{ fontWeight:600, color:'var(--primary)' }}>{data.document_number || data.order_number}</div></div>
        )}
        {(data.partner_name || data.partner_client_name) && (
          <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Parceiro</div><div>{data.partner_name || data.partner_client_name}</div></div>
        )}
        {data.warehouse_name && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Depósito</div><div>{data.warehouse_name}</div></div>}
        {data.warehouse_dest_name && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Depósito destino</div><div>{data.warehouse_dest_name}</div></div>}
        {data.channel && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Canal</div><div>{data.channel}</div></div>}
        {data.cost_unit != null && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Custo unitário</div><div>{fmt.brl(data.cost_unit)}</div></div>}
        {data.cost_avg_after != null && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Custo médio após</div><div>{fmt.brl(data.cost_avg_after)}</div></div>}
        {data.value_total != null && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Valor total</div><div style={{ fontWeight:700 }}>{fmt.brl(data.value_total)}</div></div>}
      </div>

      {/* IMEI */}
      {(data.unit_imei || data.unit_serial) && (
        <div style={{ background:'rgba(59,130,246,.08)', borderRadius:8, padding:'10px 14px' }}>
          <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>Unidade (IMEI/Serial)</div>
          <div style={{ fontFamily:'monospace', fontWeight:600 }}>
            {data.unit_imei && <>IMEI: {data.unit_imei}{data.unit_imei2 ? ` / ${data.unit_imei2}` : ''}</>}
            {data.unit_serial && <>{data.unit_imei ? ' | ' : ''}Serial: {data.unit_serial}</>}
          </div>
          {data.unit_status && <Badge color={data.unit_status === 'available' ? '#10b981' : '#6b7280'}>{data.unit_status}</Badge>}
        </div>
      )}

      {/* Reason / notes */}
      {(data.reason || data.notes) && (
        <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 14px' }}>
          {data.reason && <div style={{ fontSize:'.88rem' }}><strong>Motivo:</strong> {data.reason}</div>}
          {data.notes && data.notes !== data.reason && <div style={{ fontSize:'.88rem', marginTop:4 }}><strong>Obs:</strong> {data.notes}</div>}
        </div>
      )}

      {/* Cancellation info */}
      {data.cancelled && (
        <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, padding:'10px 14px' }}>
          <div style={{ fontWeight:700, color:'#ef4444', fontSize:'.82rem', marginBottom:4 }}>Movimentação cancelada/estornada</div>
          {data.cancel_reason && <div style={{ fontSize:'.85rem' }}>Motivo: {data.cancel_reason}</div>}
          {data.cancelled_by_name && <div style={{ fontSize:'.78rem', color:'var(--muted)', marginTop:2 }}>Por: {data.cancelled_by_name} em {data.cancelled_at ? new Date(data.cancelled_at).toLocaleString('pt-BR') : '—'}</div>}
        </div>
      )}

      {/* Actions */}
      {!data.cancelled && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
          {!cancelOpen ? (
            <Btn variant="danger" size="sm" onClick={()=>setCancelOpen(true)}>↩️ Estornar movimentação</Btn>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, padding:'10px 14px', fontSize:'.85rem', color:'#ef4444' }}>
                O estorno cria uma movimentação inversa e marca esta como cancelada. Esta ação não pode ser desfeita.
              </div>
              <div>
                <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Motivo do estorno *</label>
                <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={2}
                  style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <Btn variant="ghost" size="sm" onClick={()=>setCancelOpen(false)}>Cancelar</Btn>
                <Btn variant="danger" size="sm" onClick={doCancel} disabled={saving}>{saving ? 'Estornando...' : 'Confirmar estorno'}</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── New movement modal ──────────────────────────────────────────────────

function NewMovementModal({ open, onClose, onSaved, warehouses }) {
  const [mode, setMode] = useState('movement')
  const [form, setForm] = useState({
    product_id:'', product_label:'', type:'in', movement_type:'purchase',
    quantity:'', reason:'', document_type:'', document_number:'',
    partner_name:'', warehouse_id:'', warehouse_dest_id:'',
    cost_unit:'', channel:'', unit_id:'', notes:'',
    counted_qty:'',
  })
  const [saving, setSaving] = useState(false)
  const [availableUnits, setAvailableUnits] = useState([])
  const [productHasImei, setProductHasImei] = useState(false)
  const { toast } = useToast()

  const f = v => setForm(p => ({...p, ...v}))

  const fetchProducts = q => api.get(`/products/search?q=${encodeURIComponent(q)}`).then(r => r.data)

  const onProductSelect = p => {
    f({ product_id: p.id, product_label: p.name, unit_id: '' })
    setProductHasImei(!!p.controls_imei)
    if (p.controls_imei) {
      api.get(`/products/${p.id}/units?status=available`).then(r => setAvailableUnits(r.data)).catch(() => setAvailableUnits([]))
    } else {
      setAvailableUnits([])
    }
  }

  const moveTypeToBaseType = mt => {
    const inTypes = ['purchase','return_client','transfer_in','adjustment_pos','service_out','unreserve']
    const outTypes = ['sale','return_supplier','transfer_out','adjustment_neg','service_in','service_discard','reserve']
    if (inTypes.includes(mt)) return 'in'
    if (outTypes.includes(mt)) return 'out'
    return 'adjustment'
  }

  const save = async () => {
    if (!form.product_id) return toast.error('Selecione um produto')
    setSaving(true)
    try {
      if (mode === 'transfer') {
        if (!form.warehouse_id || !form.warehouse_dest_id) return toast.error('Selecione origem e destino')
        if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Quantidade inválida')
        await api.post('/stock/transfer', {
          product_id: form.product_id, quantity: form.quantity,
          warehouse_id: form.warehouse_id, warehouse_dest_id: form.warehouse_dest_id,
          reason: form.reason, unit_id: form.unit_id || null,
        })
      } else if (mode === 'inventory') {
        if (!form.reason) return toast.error('Motivo é obrigatório para inventário')
        await api.post('/stock/inventory', {
          product_id: form.product_id, counted_qty: form.counted_qty, reason: form.reason,
        })
      } else {
        if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Quantidade inválida')
        const baseType = moveTypeToBaseType(form.movement_type)
        await api.post('/stock', {
          product_id: form.product_id, type: baseType, movement_type: form.movement_type,
          quantity: form.quantity, reason: form.reason,
          document_type: form.document_type || null, document_number: form.document_number || null,
          partner_name: form.partner_name || null, warehouse_id: form.warehouse_id || null,
          cost_unit: form.cost_unit || null, channel: form.channel || null,
          unit_id: form.unit_id || null, notes: form.notes || null,
        })
      }
      onSaved()
      onClose()
    } catch(err) { toast.error(err.response?.data?.error || 'Erro ao registrar') }
    finally { setSaving(false) }
  }

  useEffect(() => {
    if (open) {
      setForm({
        product_id:'', product_label:'', type:'in', movement_type:'purchase',
        quantity:'', reason:'', document_type:'', document_number:'',
        partner_name:'', warehouse_id:'', warehouse_dest_id:'',
        cost_unit:'', channel:'', unit_id:'', notes:'', counted_qty:'',
      })
      setMode('movement')
      setProductHasImei(false)
      setAvailableUnits([])
    }
  }, [open])

  const moveTypeOptions = Object.entries(MOVE_TYPES)
    .filter(([k]) => !['transfer_out','transfer_in','inventory'].includes(k))
    .map(([k,v]) => ({ value:k, label:`${v.icon} ${v.label}` }))

  return (
    <Modal open={open} onClose={onClose} title="Nova movimentação" width={600}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* Mode tabs */}
        <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)', marginBottom:4 }}>
          {[{k:'movement',l:'Movimentação'},{k:'transfer',l:'Transferência'},{k:'inventory',l:'Inventário'}].map(t => (
            <button key={t.k} onClick={()=>setMode(t.k)} style={{
              padding:'8px 16px', fontSize:'.82rem', fontWeight:mode===t.k?700:500,
              color:mode===t.k?'#fff':'var(--muted)', background:mode===t.k?'rgba(168,85,247,.2)':'transparent',
              border:'none', borderBottom:mode===t.k?'2px solid var(--primary)':'2px solid transparent',
              cursor:'pointer',
            }}>{t.l}</button>
          ))}
        </div>

        {/* Product selection */}
        <Autocomplete
          label="Produto *"
          value={{ label: form.product_label }}
          fetchFn={fetchProducts}
          onSelect={onProductSelect}
          renderOption={p => (
            <div>
              <div style={{ fontWeight:600 }}>{p.name}</div>
              <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>
                SKU: {p.sku}{p.brand ? ` — ${p.brand}` : ''}{p.model ? ` ${p.model}` : ''} · Est: {fmt.num(p.stock_quantity)}
                {p.controls_imei && ' · 📱 IMEI'}
              </div>
            </div>
          )}
          placeholder="Buscar por nome, SKU, marca, modelo..."
        />
        {form.product_id && <div style={{ marginTop:-10, fontSize:'.78rem', color:'var(--success)' }}>Produto selecionado</div>}

        {mode === 'movement' && (
          <>
            <Select label="Tipo de movimentação *" value={form.movement_type} onChange={e=>f({movement_type:e.target.value})}>
              {moveTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Input label="Quantidade *" type="number" step="0.01" min="0.01" value={form.quantity} onChange={e=>f({quantity:e.target.value})}/>
              <Input label="Custo unitário (R$)" type="number" step="0.01" value={form.cost_unit} onChange={e=>f({cost_unit:e.target.value})}/>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Select label="Tipo documento" value={form.document_type} onChange={e=>f({document_type:e.target.value})}>
                <option value="">Nenhum</option>
                <option value="nfe">NF-e</option>
                <option value="nfce">NFC-e</option>
                <option value="order">Pedido</option>
                <option value="os">OS</option>
                <option value="manual">Manual</option>
              </Select>
              <Input label="Nº documento" value={form.document_number} onChange={e=>f({document_number:e.target.value})} placeholder="Chave/número"/>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Input label="Parceiro (cliente/fornecedor)" value={form.partner_name} onChange={e=>f({partner_name:e.target.value})}/>
              <Select label="Depósito" value={form.warehouse_id} onChange={e=>f({warehouse_id:e.target.value})}>
                <option value="">Nenhum</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Select label="Canal" value={form.channel} onChange={e=>f({channel:e.target.value})}>
                <option value="">Nenhum</option>
                <option value="balcao">Balcão</option>
                <option value="delivery">Delivery</option>
                <option value="marketplace">Marketplace</option>
                <option value="ecommerce">E-commerce</option>
                <option value="whatsapp">WhatsApp</option>
              </Select>
              {productHasImei && (
                <Select label="IMEI / Serial" value={form.unit_id} onChange={e=>f({unit_id:e.target.value})}>
                  <option value="">Nenhum</option>
                  {availableUnits.map(u => <option key={u.id} value={u.id}>{u.imei || u.serial || `#${u.id}`}</option>)}
                </Select>
              )}
            </div>
          </>
        )}

        {mode === 'transfer' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Select label="Depósito origem *" value={form.warehouse_id} onChange={e=>f({warehouse_id:e.target.value})}>
                <option value="">Selecione...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
              <Select label="Depósito destino *" value={form.warehouse_dest_id} onChange={e=>f({warehouse_dest_id:e.target.value})}>
                <option value="">Selecione...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <Input label="Quantidade *" type="number" step="0.01" min="0.01" value={form.quantity} onChange={e=>f({quantity:e.target.value})}/>
            {productHasImei && (
              <Select label="IMEI / Serial" value={form.unit_id} onChange={e=>f({unit_id:e.target.value})}>
                <option value="">Nenhum</option>
                {availableUnits.map(u => <option key={u.id} value={u.id}>{u.imei || u.serial || `#${u.id}`}</option>)}
              </Select>
            )}
          </>
        )}

        {mode === 'inventory' && (
          <Input label="Quantidade contada *" type="number" step="0.01" min="0" value={form.counted_qty} onChange={e=>f({counted_qty:e.target.value})}/>
        )}

        {/* Reason/notes (always) */}
        <Input label={['adjustment_pos','adjustment_neg','inventory'].includes(form.movement_type) || mode === 'inventory' ? 'Motivo *' : 'Motivo'}
          value={form.reason} onChange={e=>f({reason:e.target.value})} placeholder="Motivo da movimentação"/>

        <div>
          <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observações</label>
          <textarea value={form.notes} onChange={e=>f({notes:e.target.value})} rows={2}
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:8, borderTop:'1px solid var(--border)' }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─── IMEI Search modal ───────────────────────────────────────────────────

function ImeiSearchModal({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState(null)

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setSelectedUnit(null) }
  }, [open])

  useEffect(() => {
    if (query.length < 3) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.get(`/products/units/search?q=${encodeURIComponent(query)}`)
        setResults(r.data)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const statusColor = { available:'#10b981', sold:'#6366f1', reserved:'#f59e0b', defective:'#ef4444', returned:'#8b5cf6' }
  const statusLabel = { available:'Disponível', sold:'Vendido', reserved:'Reservado', defective:'Defeito', returned:'Devolvido' }

  if (selectedUnit) {
    return (
      <Modal open={open} onClose={onClose} title="Histórico da Unidade" width={600}>
        <Btn variant="ghost" size="sm" onClick={()=>setSelectedUnit(null)} style={{ marginBottom:10 }}>← Voltar à busca</Btn>
        <UnitTimeline unitId={selectedUnit}/>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Buscar IMEI / Serial" width={560}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ position:'relative' }}>
          <Search size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Digite IMEI ou serial..."
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'10px 12px 10px 38px', fontSize:'.9rem', outline:'none', fontFamily:'monospace' }}
            autoFocus/>
        </div>
        {loading ? <Spinner/> : results.length === 0 ? (
          query.length >= 3 && <p style={{ color:'var(--muted)', textAlign:'center', fontSize:'.85rem' }}>Nenhum resultado</p>
        ) : results.map(u => (
          <div key={u.id} onClick={()=>setSelectedUnit(u.id)} style={{
            display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px',
            background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)', cursor:'pointer',
            transition:'border-color .15s',
          }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='var(--primary)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <div>
              <div style={{ fontWeight:700, fontSize:'.88rem' }}>{u.product_name}</div>
              <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{u.sku} — {[u.brand,u.model].filter(Boolean).join(' ')}</div>
              <div style={{ fontFamily:'monospace', fontSize:'.82rem', marginTop:2 }}>
                {u.imei && <>IMEI: {u.imei}{u.imei2 ? ` / ${u.imei2}` : ''}</>}
                {u.serial && <>{u.imei ? ' | ' : ''}Serial: {u.serial}</>}
              </div>
            </div>
            <Badge color={statusColor[u.status]}>{statusLabel[u.status]||u.status}</Badge>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

export default function Stock() {
  const [rows, setRows]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [warehouses, setWarehouses]   = useState([])
  const [users, setUsers]             = useState([])
  const [filters, setFilters]         = useState({
    start_date:'', end_date:'', movement_type:'', warehouse_id:'',
    document_number:'', partner_name:'', user_id:'', imei_search:'',
    search:'', cancelled:'false',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [newModal, setNewModal]       = useState(false)
  const [imeiModal, setImeiModal]     = useState(false)
  const [detailId, setDetailId]       = useState(null)

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productSearch, setProductSearch]     = useState('')
  const [productResults, setProductResults]   = useState([])
  const [searchingProduct, setSearchingProduct] = useState(false)
  const searchTimer = useRef(null)

  const { toast } = useToast()

  const loadMeta = () => {
    api.get('/categories/warehouses').then(r => setWarehouses(r.data)).catch(() => {})
    api.get('/stock/users').then(r => setUsers(r.data)).catch(() => {})
  }

  const load = useCallback(() => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) { if (v) p.set(k, v) }
    if (selectedProduct) p.set('product_id', selectedProduct.id)
    setLoading(true)
    api.get(`/stock?${p}`).then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [filters, selectedProduct])

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { load() }, [load])

  const handleProductSearch = e => {
    const q = e.target.value
    setProductSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setProductResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchingProduct(true)
      try { setProductResults((await api.get(`/stock/product-search?q=${encodeURIComponent(q)}`)).data) }
      catch { setProductResults([]) }
      finally { setSearchingProduct(false) }
    }, 350)
  }

  const selectProduct = p => {
    setSelectedProduct(p); setProductSearch(''); setProductResults([])
  }

  const ff = v => setFilters(p => ({...p, ...v}))

  const cols = [
    { key:'created_at', label:'Data/Hora', render: v => v ? (
      <div>
        <div style={{ fontSize:'.82rem' }}>{new Date(v).toLocaleDateString('pt-BR')}</div>
        <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>{new Date(v).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</div>
      </div>
    ) : '—' },
    { key:'movement_type', label:'Tipo', render:(_,row) => {
      const mt = getMoveLabel(row)
      return (
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <Badge color={mt.color}>{mt.label}</Badge>
          {row.cancelled && <span style={{ fontSize:'.68rem', color:'#ef4444', fontWeight:700 }}>CANC</span>}
        </div>
      )
    }},
    { key:'product_name', label:'Produto', render:(_,row) => (
      <div style={{ textDecoration: row.cancelled ? 'line-through' : 'none', opacity: row.cancelled ? 0.5 : 1 }}>
        <div style={{ fontWeight:600, fontSize:'.85rem' }}>{row.product_name}</div>
        <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>{row.sku}{row.brand ? ` — ${row.brand}` : ''}</div>
      </div>
    )},
    { key:'document_number', label:'Documento', render:(_,row) => {
      const doc = row.document_number || row.order_number
      if (!doc) return <span style={{ color:'var(--muted)' }}>—</span>
      return <span style={{ fontSize:'.82rem', fontWeight:600 }}>{doc}</span>
    }},
    { key:'partner_name', label:'Parceiro', render:(_,row) => row.partner_name || row.partner_client_name || <span style={{ color:'var(--muted)' }}>—</span> },
    { key:'warehouse_name', label:'Depósito', render: v => v || <span style={{ color:'var(--muted)' }}>—</span> },
    { key:'qty_in', label:'Entrada', render:(_,row) => {
      const val = parseFloat(row.qty_in) || (row.type === 'in' ? parseFloat(row.quantity) : 0)
      return val > 0 ? <span style={{ color:'#10b981', fontWeight:700 }}>+{fmt.num(val)}</span> : '—'
    }},
    { key:'qty_out', label:'Saída', render:(_,row) => {
      const val = parseFloat(row.qty_out) || (row.type === 'out' ? parseFloat(row.quantity) : 0)
      return val > 0 ? <span style={{ color:'#ef4444', fontWeight:700 }}>-{fmt.num(val)}</span> : '—'
    }},
    { key:'new_qty', label:'Saldo após', render: v => <span style={{ fontWeight:700, color:'var(--primary)' }}>{fmt.num(v)}</span> },
    { key:'user_name', label:'Usuário', render: v => <span style={{ fontSize:'.82rem' }}>{v || '—'}</span> },
    { key:'unit_imei', label:'IMEI', render:(_,row) => {
      if (!row.unit_imei && !row.unit_serial) return null
      return <span style={{ fontFamily:'monospace', fontSize:'.72rem' }}>{row.unit_imei || row.unit_serial}</span>
    }},
  ]

  return (
    <div>
      <PageHeader title="Estoque" subtitle="Movimentações, kardex, IMEI e inventário" icon={RefreshCw}
        action={
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <Btn variant="ghost" onClick={()=>setImeiModal(true)}>📱 Buscar IMEI</Btn>
            <Btn variant="ghost" onClick={()=>setShowFilters(!showFilters)}>{showFilters ? '✕ Filtros' : '🔍 Filtros'}</Btn>
            <Btn onClick={()=>setNewModal(true)}>+ Movimentar</Btn>
          </div>
        }
      />

      {/* Product selector */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ marginBottom: selectedProduct ? 12 : 0 }}>
          <label style={{ fontSize:'.82rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6 }}>
            Buscar produto para ver kardex
          </label>
          <div style={{ position:'relative' }}>
            <Search size={16} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
            <input value={productSearch} onChange={handleProductSearch}
              placeholder="Nome, SKU, marca, modelo, código de barras..."
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'9px 12px 9px 38px', fontSize:'.9rem', outline:'none' }}/>
            {searchingProduct && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:'.75rem', color:'var(--muted)' }}>🔄</span>}
          </div>
        </div>

        {productResults.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
            {productResults.map(p => (
              <div key={p.id} onClick={()=>selectProduct(p)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8,
                background:'var(--bg-card2)', border:'1px solid var(--border)', cursor:'pointer', transition:'border-color .15s',
              }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--primary)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                {p.image_base64
                  ? <img src={p.image_base64} alt="" style={{ width:32, height:32, borderRadius:5, objectFit:'cover' }}/>
                  : <span style={{ fontSize:'1.2rem' }}>📦</span>}
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:'.9rem' }}>{p.name}</div>
                  <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>
                    SKU: {p.sku}{p.brand ? ` — ${p.brand}` : ''}{p.model ? ` ${p.model}` : ''}{p.barcode ? ` · ${p.barcode}` : ''}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:700, color:'var(--primary)', fontSize:'.9rem' }}>{fmt.num(p.stock_quantity)} {p.unit}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedProduct && (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'rgba(168,85,247,.06)', borderRadius:8, marginTop:8, border:'1px solid rgba(168,85,247,.2)' }}>
            {selectedProduct.image_base64
              ? <img src={selectedProduct.image_base64} alt="" style={{ width:40, height:40, borderRadius:8, objectFit:'cover' }}/>
              : <span style={{ fontSize:'1.4rem' }}>📦</span>}
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700 }}>{selectedProduct.name}</div>
              <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>
                SKU: {selectedProduct.sku}{selectedProduct.brand ? ` — ${selectedProduct.brand}` : ''}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--primary)' }}>{fmt.num(selectedProduct.stock_quantity)} {selectedProduct.unit}</div>
            </div>
            <button onClick={()=>setSelectedProduct(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1.1rem', padding:4 }}>
              <X size={18}/>
            </button>
          </div>
        )}
      </Card>

      {/* KPIs */}
      {selectedProduct && <ProductKpis productId={selectedProduct.id}/>}

      {/* Filters */}
      {showFilters && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:10, marginBottom:10 }}>
            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Período</label>
              <div style={{ display:'flex', gap:6 }}>
                <input type="date" value={filters.start_date} onChange={e=>ff({start_date:e.target.value})}
                  style={{ flex:1, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', padding:'6px 8px', fontSize:'.82rem' }}/>
                <input type="date" value={filters.end_date} onChange={e=>ff({end_date:e.target.value})}
                  style={{ flex:1, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', padding:'6px 8px', fontSize:'.82rem' }}/>
              </div>
              <DatePresets onSelect={(s,e)=>ff({start_date:s,end_date:e})}/>
            </div>
            <Select label="Tipo" value={filters.movement_type} onChange={e=>ff({movement_type:e.target.value})}>
              <option value="">Todos</option>
              {Object.entries(MOVE_TYPES).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </Select>
            <Select label="Depósito" value={filters.warehouse_id} onChange={e=>ff({warehouse_id:e.target.value})}>
              <option value="">Todos</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Input label="Documento" value={filters.document_number} onChange={e=>ff({document_number:e.target.value})} placeholder="Nº ou chave"/>
            <Input label="Parceiro" value={filters.partner_name} onChange={e=>ff({partner_name:e.target.value})} placeholder="Cliente ou fornecedor"/>
            <Select label="Usuário" value={filters.user_id} onChange={e=>ff({user_id:e.target.value})}>
              <option value="">Todos</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Input label="IMEI / Serial" value={filters.imei_search} onChange={e=>ff({imei_search:e.target.value})} placeholder="Buscar IMEI..." style={{ fontFamily:'monospace' }}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'space-between', alignItems:'center' }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.82rem', color:'var(--muted)', cursor:'pointer' }}>
              <input type="checkbox" checked={filters.cancelled==='true'} onChange={e=>ff({cancelled:e.target.checked?'true':'false'})}/> Mostrar canceladas
            </label>
            <Btn variant="ghost" size="sm" onClick={()=>setFilters({
              start_date:'', end_date:'', movement_type:'', warehouse_id:'',
              document_number:'', partner_name:'', user_id:'', imei_search:'',
              search:'', cancelled:'false',
            })}>Limpar filtros</Btn>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card>
        {loading ? <Spinner/> : rows.length === 0 ? (
          <p style={{ color:'var(--muted)', textAlign:'center', padding:24 }}>Nenhuma movimentação encontrada</p>
        ) : (
          <Table columns={cols} data={rows} onRow={row => setDetailId(row.id)}/>
        )}
      </Card>

      {/* Modals */}
      <NewMovementModal open={newModal} onClose={()=>setNewModal(false)} onSaved={load} warehouses={warehouses}/>
      <ImeiSearchModal open={imeiModal} onClose={()=>setImeiModal(false)}/>

      <Modal open={!!detailId} onClose={()=>setDetailId(null)} title="Detalhe da movimentação" width={620}>
        {detailId && <MovementDetail movId={detailId} onClose={()=>setDetailId(null)} onCancelled={load}/>}
      </Modal>
    </div>
  )
}
