import { useEffect, useState, useCallback } from 'react'
import { RotateCcw, Search, Package, FileText, Printer, CheckCircle, XCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, fmt } from '../components/UI'

const STATUS_MAP = {
  draft:     { l:'Rascunho',    c:'#6b7280' },
  analyzing: { l:'Em análise',  c:'#f59e0b' },
  approved:  { l:'Aprovado',    c:'#3b82f6' },
  processed: { l:'Processado',  c:'#8b5cf6' },
  finished:  { l:'Finalizado',  c:'#10b981' },
  cancelled: { l:'Cancelado',   c:'#ef4444' },
}
const TYPE_MAP = { return_client:'Devolução cliente', exchange:'Troca', warranty:'Garantia', supplier_return:'Devol. fornecedor' }
const REASON_OPTS = [
  { v:'defect', l:'Defeito' }, { v:'regret', l:'Arrependimento' }, { v:'exchange', l:'Troca' },
  { v:'warranty', l:'Garantia' }, { v:'wrong_product', l:'Produto errado' }, { v:'other', l:'Outro' },
]
const COND_OPTS = [
  { v:'new', l:'Novo/lacrado' }, { v:'open', l:'Aberto' }, { v:'damaged', l:'Avariado' }, { v:'defective', l:'Defeituoso' },
]
const DEST_OPTS = [
  { v:'available', l:'Estoque disponível' }, { v:'quarantine', l:'Quarentena/testes' },
  { v:'service', l:'Assistência/OS' }, { v:'scrap', l:'Sucata/descarte' }, { v:'supplier_return', l:'Devol. fornecedor' },
]
const REFUND_OPTS = [
  { v:'credit', l:'Crédito na loja' }, { v:'refund', l:'Estorno financeiro' }, { v:'exchange', l:'Troca por outro produto' },
]
const REFUND_METHOD_OPTS = [
  { v:'pix', l:'PIX' }, { v:'dinheiro', l:'Dinheiro' }, { v:'cartao', l:'Cartão' },
]

export default function Returns() {
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [detail, setDetail] = useState(null)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusModal, setStatusModal] = useState(null)
  const { toast } = useToast()

  // New return wizard state
  const [step, setStep] = useState(0)
  const [orderSearch, setOrderSearch] = useState('')
  const [orderResults, setOrderResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderItems, setOrderItems] = useState([])
  const [returnType, setReturnType] = useState('return_client')
  const [checklist, setChecklist] = useState({ box:false, charger:false, cable:false, earphone:false, sim_tool:false, device_condition:'good', powers_on:true, locks_removed:true, notes:'' })
  const [refundType, setRefundType] = useState('credit')
  const [refundMethod, setRefundMethod] = useState('pix')
  const [returnNotes, setReturnNotes] = useState('')

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filter) p.set('status', filter)
    if (searchText) p.set('search', searchText)
    setLoading(true)
    api.get(`/returns?${p}`).then(r => setRows(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [filter, searchText])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const orderNum = searchParams.get('order')
    if (orderNum) {
      setOrderSearch(orderNum)
      openNewReturn(orderNum)
    }
  }, [])

  const openNewReturn = async (prefill) => {
    setStep(0); setSelectedOrder(null); setOrderItems([]); setOrderResults([])
    setReturnType('return_client'); setRefundType('credit'); setRefundMethod('pix')
    setChecklist({ box:false, charger:false, cable:false, earphone:false, sim_tool:false, device_condition:'good', powers_on:true, locks_removed:true, notes:'' })
    setReturnNotes(''); setModal(true)
    if (prefill) {
      setOrderSearch(prefill)
      doSearchOrders(prefill)
    }
  }

  const doSearchOrders = async (q) => {
    const term = q || orderSearch
    if (!term || term.length < 2) return
    setSearching(true)
    try {
      const { data } = await api.get(`/returns/find-order?q=${encodeURIComponent(term)}`)
      setOrderResults(data)
      if (data.length === 1) selectOrder(data[0])
    } catch { toast.error('Erro ao buscar pedidos') }
    finally { setSearching(false) }
  }

  const selectOrder = async (order) => {
    setSelectedOrder(order)
    try {
      const { data } = await api.get(`/returns/order-items/${order.id}`)
      setOrderItems(data.map(it => ({
        ...it, selected: it.returnable_qty > 0, qty_return: Math.min(it.returnable_qty, parseFloat(it.quantity)),
        reason: 'defect', condition: 'open',
        stock_destination: it.controls_imei ? 'quarantine' : 'available',
        item_notes: '',
      })))
      setStep(1)
    } catch { toast.error('Erro ao carregar itens') }
  }

  const hasImei = orderItems.some(it => it.selected && it.controls_imei)
  const selectedItems = orderItems.filter(it => it.selected && it.returnable_qty > 0)
  const totalRefund = selectedItems.reduce((s, it) => s + (parseFloat(it.qty_return) * parseFloat(it.unit_price) - parseFloat(it.discount || 0)), 0)

  const submitReturn = async () => {
    if (!selectedItems.length) return toast.error('Selecione pelo menos um item')
    setSaving(true)
    try {
      const payload = {
        order_id: selectedOrder.id,
        type: returnType,
        origin: selectedOrder.channel || 'balcao',
        refund_type: refundType,
        refund_method: refundType === 'refund' ? refundMethod : null,
        checklist: hasImei ? checklist : {},
        notes: returnNotes || null,
        items: selectedItems.map(it => ({
          order_item_id: it.id,
          product_id: it.product_id,
          unit_id: it.unit_id || null,
          quantity_returned: it.qty_return,
          total_refund: parseFloat(it.qty_return) * parseFloat(it.unit_price) - parseFloat(it.discount || 0),
          reason: it.reason,
          condition: it.condition,
          stock_destination: it.stock_destination,
          notes: it.item_notes || null,
        })),
      }
      await api.post('/returns', payload)
      toast.success('Devolução criada!')
      setModal(false); load()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao criar devolução') }
    finally { setSaving(false) }
  }

  const openDetail = async (id) => {
    try { const { data } = await api.get(`/returns/${id}`); setDetail(data) }
    catch { toast.error('Erro ao carregar') }
  }

  const changeStatus = (id, newStatus, label) => {
    setDetail(null)
    setStatusModal({ id, status: newStatus, label })
  }

  const doChangeStatus = async () => {
    if (!statusModal) return
    setSaving(true)
    try {
      await api.patch(`/returns/${statusModal.id}/status`, { status: statusModal.status })
      toast.success(`Status alterado para "${statusModal.label}"`)
      setStatusModal(null); load()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const TRANSITIONS = {
    draft: [{ s:'analyzing', l:'Enviar p/ análise' }, { s:'cancelled', l:'Cancelar' }],
    analyzing: [{ s:'approved', l:'Aprovar' }, { s:'cancelled', l:'Cancelar' }],
    approved: [{ s:'processed', l:'Processar (executar estoque + financeiro)' }],
    processed: [{ s:'finished', l:'Finalizar' }],
  }

  const printReturn = (doc) => {
    const w = window.open('', '_blank', 'width=420,height=700')
    const items = (doc.items || []).map(it =>
      `<tr><td>${it.product_name} ${it.sku ? `(${it.sku})` : ''}${it.imei ? `<br><small>IMEI: ${it.imei}${it.imei2?` / ${it.imei2}`:''}</small>` : ''}</td>
       <td class="r">x${it.quantity_returned}</td><td class="r">${fmt.brl(it.total_refund)}</td></tr>`
    ).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Devolução ${doc.number}</title>
<style>body{font-family:Arial,sans-serif;padding:20px;font-size:13px;color:#1a1a1a;max-width:380px;margin:0 auto}
h2{text-align:center;margin:0 0 4px;font-size:16px}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:16px}
.sep{border:none;border-top:1px dashed #ccc;margin:12px 0}table{width:100%;border-collapse:collapse}
td{padding:3px 0;font-size:12px;vertical-align:top}.r{text-align:right}.b{font-weight:700}
.total{font-size:16px;font-weight:900;text-align:center;margin:12px 0}
.footer{text-align:center;font-size:10px;color:#999;margin-top:20px}</style></head><body>
<h2>DEVOLUÇÃO ${doc.number}</h2>
<div class="sub">Pedido: ${doc.order_number}</div><hr class="sep"/>
<table><tr><td class="b">Cliente</td><td class="r">${doc.client_name||'—'}</td></tr>
<tr><td class="b">Data</td><td class="r">${new Date(doc.created_at).toLocaleString('pt-BR')}</td></tr>
<tr><td class="b">Tipo</td><td class="r">${TYPE_MAP[doc.type]||doc.type}</td></tr>
<tr><td class="b">Status</td><td class="r">${STATUS_MAP[doc.status]?.l||doc.status}</td></tr>
<tr><td class="b">Acerto</td><td class="r">${doc.refund_type === 'credit' ? 'Crédito loja' : doc.refund_type === 'refund' ? 'Estorno' : 'Troca'}</td></tr>
</table><hr class="sep"/>
<table><tr><th style="text-align:left">Produto</th><th class="r">Qtd</th><th class="r">Valor</th></tr>${items}</table>
<hr class="sep"/><div class="total">Total: ${fmt.brl(doc.total_refund)}</div>
${doc.notes ? `<hr class="sep"/><div><small>${doc.notes}</small></div>` : ''}
<hr class="sep"/><div class="footer">Documento de devolução para fins de auditoria.<br/>Impresso em ${new Date().toLocaleString('pt-BR')}</div>
<script>setTimeout(()=>window.print(),200)</script></body></html>`)
    w.document.close()
  }

  const cols = [
    { key:'number', label:'Nº', render:v => <span style={{ fontWeight:700, fontFamily:'monospace' }}>{v}</span> },
    { key:'order_number', label:'Pedido', render:v => <span style={{ fontFamily:'monospace' }}>{v}</span> },
    { key:'client_name', label:'Cliente', render:v => v || '—' },
    { key:'type', label:'Tipo', render:v => <span style={{ fontSize:'.78rem' }}>{TYPE_MAP[v]||v}</span> },
    { key:'status', label:'Status', render:v => { const s=STATUS_MAP[v]; return <Badge color={s?.c||'#6b7280'}>{s?.l||v}</Badge> }},
    { key:'total_refund', label:'Valor', render:v => <span style={{ fontWeight:700 }}>{fmt.brl(v)}</span> },
    { key:'created_at', label:'Data', render:v => fmt.date(v) },
  ]

  const STEPS = ['Localizar pedido', 'Selecionar itens', ...(hasImei ? ['Checklist'] : []), 'Acerto financeiro']

  return (
    <div>
      <PageHeader title="Devoluções" subtitle="Devoluções, trocas e garantias" icon={RotateCcw}
        action={<Btn onClick={()=>openNewReturn()}>+ Nova devolução</Btn>}/>
      <Card>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <Search size={15} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
            <input value={searchText} onChange={e=>setSearchText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}
              placeholder="Buscar por nº devolução, pedido, cliente..."
              style={{ width:'100%', paddingLeft:32, height:36, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.85rem', outline:'none' }}/>
          </div>
          <select value={filter} onChange={e=>setFilter(e.target.value)}
            style={{ height:36, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.85rem', padding:'0 10px' }}>
            <option value="">Todos status</option>
            {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
        </div>
        {loading ? <Spinner/> : rows.length === 0
          ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Nenhuma devolução encontrada</div>
          : <Table columns={cols} data={rows} onRow={r=>openDetail(r.id)}/>}
      </Card>

      {/* ── WIZARD: Nova devolução ── */}
      <Modal open={modal} onClose={()=>setModal(false)} title="Nova devolução" width={750}>
        {/* Step indicator */}
        <div style={{ display:'flex', gap:4, marginBottom:16 }}>
          {STEPS.map((s,i) => (
            <div key={i} style={{ flex:1, textAlign:'center', padding:'6px 0', fontSize:'.75rem', fontWeight:step===i?700:400,
              color:step===i?'var(--primary)':'var(--muted)', borderBottom:step===i?'2px solid var(--primary)':'2px solid var(--border)' }}>{s}</div>
          ))}
        </div>

        {/* Step 0: Find order */}
        {step === 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:'.85rem', color:'var(--muted)' }}>Busque o pedido por numero, CPF, telefone ou IMEI do aparelho.</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&doSearchOrders()}
                placeholder="Nº pedido, CPF, telefone, IMEI..."
                style={{ flex:1, height:40, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', padding:'0 12px', fontSize:'.9rem', outline:'none' }}/>
              <Btn onClick={()=>doSearchOrders()} disabled={searching}>{searching ? 'Buscando...' : 'Buscar'}</Btn>
            </div>
            {orderResults.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {orderResults.map(o => (
                  <div key={o.id} onClick={()=>selectOrder(o)}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', transition:'all .1s' }}
                    onMouseOver={e=>e.currentTarget.style.borderColor='var(--primary)'} onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}>
                    <div>
                      <div style={{ fontWeight:700, fontFamily:'monospace' }}>{o.number}</div>
                      <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>
                        {o.client_name || o.walk_in_name || 'Consumidor final'} — {fmt.brl(o.total)} — {new Date(o.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Badge color={o.status_color || '#6b7280'}>{o.status_label || o.status}</Badge>
                      <ChevronRight size={16} color="var(--muted)"/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {orderResults.length === 0 && orderSearch.length > 2 && !searching && (
              <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:'.85rem' }}>Nenhum pedido encontrado</div>
            )}
          </div>
        )}

        {/* Step 1: Select items */}
        {step === 1 && selectedOrder && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontWeight:700 }}>{selectedOrder.number}</div>
                <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{selectedOrder.client_name || selectedOrder.walk_in_name || 'Consumidor final'}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700 }}>{fmt.brl(selectedOrder.total)}</div>
                <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{new Date(selectedOrder.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
            </div>

            <Select label="Tipo de devolução" value={returnType} onChange={e=>setReturnType(e.target.value)}>
              <option value="return_client">Devolução cliente</option>
              <option value="exchange">Troca</option>
              <option value="warranty">Garantia/Assistência</option>
              <option value="supplier_return">Devolução ao fornecedor</option>
            </Select>

            <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)' }}>ITENS DO PEDIDO</div>
            {orderItems.map((it, i) => (
              <div key={it.id} style={{ background: it.selected ? 'rgba(99,102,241,.04)' : 'var(--bg-card2)', border: it.selected ? '1px solid rgba(99,102,241,.3)' : '1px solid var(--border)', borderRadius:8, padding:10, opacity: it.returnable_qty <= 0 ? .5 : 1 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor: it.returnable_qty > 0 ? 'pointer' : 'default', marginBottom:6 }}>
                  <input type="checkbox" checked={it.selected} disabled={it.returnable_qty <= 0}
                    onChange={e => { const arr=[...orderItems]; arr[i]={...arr[i], selected:e.target.checked}; setOrderItems(arr) }}/>
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:600, fontSize:'.88rem' }}>{it.product_name}</span>
                    {it.sku && <span style={{ color:'var(--muted)', fontSize:'.75rem', marginLeft:6 }}>{it.sku}</span>}
                    {it.controls_imei && it.imei && <span style={{ color:'var(--primary)', fontSize:'.72rem', marginLeft:6, fontFamily:'monospace' }}>IMEI: {it.imei}{it.imei2 ? ` / ${it.imei2}` : ''}</span>}
                  </div>
                  <div style={{ textAlign:'right', fontSize:'.82rem' }}>
                    <div>{fmt.brl(it.unit_price)} x{it.quantity}</div>
                    {it.already_returned > 0 && <div style={{ color:'#f59e0b', fontSize:'.72rem' }}>Já devolvido: {it.already_returned}</div>}
                  </div>
                </label>
                {it.selected && it.returnable_qty > 0 && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:6, borderTop:'1px solid var(--border)' }}>
                    <div style={{ flex:'0 0 60px' }}>
                      <label style={{ fontSize:'.68rem', color:'var(--muted)' }}>Qtd</label>
                      <input type="number" min="1" max={it.returnable_qty} step="1" value={it.qty_return}
                        onChange={e => { const arr=[...orderItems]; arr[i]={...arr[i], qty_return:Math.min(parseFloat(e.target.value)||1, it.returnable_qty)}; setOrderItems(arr) }}
                        style={{ width:'100%', height:32, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', padding:'0 6px', fontSize:'.82rem', outline:'none' }}/>
                    </div>
                    <div style={{ flex:'1 1 100px' }}>
                      <label style={{ fontSize:'.68rem', color:'var(--muted)' }}>Motivo</label>
                      <select value={it.reason} onChange={e => { const arr=[...orderItems]; arr[i]={...arr[i], reason:e.target.value}; setOrderItems(arr) }}
                        style={{ width:'100%', height:32, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', padding:'0 6px', fontSize:'.82rem', outline:'none' }}>
                        {REASON_OPTS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:'1 1 90px' }}>
                      <label style={{ fontSize:'.68rem', color:'var(--muted)' }}>Condição</label>
                      <select value={it.condition} onChange={e => { const arr=[...orderItems]; arr[i]={...arr[i], condition:e.target.value}; setOrderItems(arr) }}
                        style={{ width:'100%', height:32, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', padding:'0 6px', fontSize:'.82rem', outline:'none' }}>
                        {COND_OPTS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:'1 1 120px' }}>
                      <label style={{ fontSize:'.68rem', color:'var(--muted)' }}>Destino estoque</label>
                      <select value={it.stock_destination} onChange={e => { const arr=[...orderItems]; arr[i]={...arr[i], stock_destination:e.target.value}; setOrderItems(arr) }}
                        style={{ width:'100%', height:32, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', padding:'0 6px', fontSize:'.82rem', outline:'none' }}>
                        {DEST_OPTS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" onClick={()=>{setStep(0);setSelectedOrder(null)}}>Voltar</Btn>
              <div style={{ fontWeight:900, fontSize:'1.05rem' }}>Total devolução: {fmt.brl(totalRefund)}</div>
              <Btn onClick={()=>setStep(hasImei ? 2 : (STEPS.length - 1))} disabled={!selectedItems.length}>Avançar</Btn>
            </div>
          </div>
        )}

        {/* Step 2: Checklist (only if has IMEI items) */}
        {step === 2 && hasImei && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'rgba(249,115,22,.08)', border:'1px solid rgba(249,115,22,.25)', borderRadius:8, padding:'10px 14px', fontSize:'.85rem', color:'#f97316' }}>
              <AlertTriangle size={14} style={{ display:'inline', marginRight:6, verticalAlign:'middle' }}/>
              Conferência obrigatória para aparelhos celulares. Preencha todos os campos.
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { key:'box', label:'Caixa e nota presentes?' },
                { key:'charger', label:'Carregador presente?' },
                { key:'cable', label:'Cabo USB presente?' },
                { key:'earphone', label:'Fone de ouvido?' },
                { key:'sim_tool', label:'Chave SIM?' },
                { key:'powers_on', label:'Aparelho liga?' },
                { key:'locks_removed', label:'iCloud/FRP removido?' },
              ].map(item => (
                <label key={item.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', fontSize:'.85rem' }}>
                  <input type="checkbox" checked={!!checklist[item.key]}
                    onChange={e=>setChecklist(p=>({...p,[item.key]:e.target.checked}))}/>
                  {item.label}
                </label>
              ))}
            </div>

            <Select label="Estado do aparelho" value={checklist.device_condition} onChange={e=>setChecklist(p=>({...p,device_condition:e.target.value}))}>
              <option value="good">Sem marcas de uso</option>
              <option value="scratches">Riscos leves</option>
              <option value="damaged">Avariado/quebrado</option>
            </Select>

            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observações da conferência</label>
              <textarea value={checklist.notes||''} onChange={e=>setChecklist(p=>({...p,notes:e.target.value}))} rows={2}
                placeholder="Observações sobre o estado do aparelho..."
                style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.85rem', outline:'none', resize:'vertical' }}/>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" onClick={()=>setStep(1)}>Voltar</Btn>
              <Btn onClick={()=>setStep(STEPS.length - 1)}>Avançar</Btn>
            </div>
          </div>
        )}

        {/* Last step: Financial settlement */}
        {step === STEPS.length - 1 && selectedOrder && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)' }}>ACERTO FINANCEIRO</div>

            <div style={{ display:'flex', gap:10 }}>
              {REFUND_OPTS.map(opt => (
                <div key={opt.v} onClick={()=>setRefundType(opt.v)}
                  style={{ flex:1, padding:'12px 14px', borderRadius:10, cursor:'pointer',
                    border: refundType===opt.v ? '2px solid var(--primary)' : '2px solid var(--border)',
                    background: refundType===opt.v ? 'var(--primary)11' : 'var(--bg-card2)', transition:'all .15s' }}>
                  <div style={{ fontWeight:700, fontSize:'.85rem' }}>{opt.l}</div>
                </div>
              ))}
            </div>

            {refundType === 'refund' && (
              <Select label="Método do estorno" value={refundMethod} onChange={e=>setRefundMethod(e.target.value)}>
                {REFUND_METHOD_OPTS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </Select>
            )}

            {refundType === 'credit' && (
              <div style={{ background:'rgba(16,185,129,.08)', borderRadius:8, padding:'10px 14px', fontSize:'.85rem', color:'#10b981' }}>
                Será gerado um crédito de <strong>{fmt.brl(totalRefund)}</strong> para o cliente usar em compras futuras.
              </div>
            )}

            {refundType === 'exchange' && (
              <div style={{ background:'rgba(99,102,241,.08)', borderRadius:8, padding:'10px 14px', fontSize:'.85rem', color:'#6366f1' }}>
                Após processar a devolução, você poderá criar um novo pedido vinculado para a troca.
              </div>
            )}

            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observações gerais</label>
              <textarea value={returnNotes} onChange={e=>setReturnNotes(e.target.value)} rows={2}
                placeholder="Observações adicionais sobre a devolução..."
                style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.85rem', outline:'none', resize:'vertical' }}/>
            </div>

            {/* Summary */}
            <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:'14px 16px' }}>
              <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:8 }}>RESUMO</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:'.85rem' }}>
                <div>Pedido: <strong>{selectedOrder.number}</strong></div>
                <div>Cliente: <strong>{selectedOrder.client_name || selectedOrder.walk_in_name || 'Consumidor final'}</strong></div>
                <div>Itens: <strong>{selectedItems.length}</strong></div>
                <div>Tipo: <strong>{TYPE_MAP[returnType]}</strong></div>
                <div>Acerto: <strong>{REFUND_OPTS.find(r=>r.v===refundType)?.l}</strong></div>
                <div>Valor: <strong style={{ color:'var(--primary)' }}>{fmt.brl(totalRefund)}</strong></div>
              </div>
              {selectedItems.map(it => (
                <div key={it.id} style={{ fontSize:'.78rem', color:'var(--muted)', marginTop:4 }}>
                  {it.product_name} x{it.qty_return} — {DEST_OPTS.find(d=>d.v===it.stock_destination)?.l}
                  {it.imei && <span style={{ fontFamily:'monospace', marginLeft:4 }}>IMEI: {it.imei}</span>}
                </div>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" onClick={()=>setStep(hasImei ? 2 : 1)}>Voltar</Btn>
              <Btn onClick={submitReturn} disabled={saving}>{saving ? 'Criando...' : 'Criar devolução'}</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ── DETALHE ── */}
      {detail && (
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={`Devolução ${detail.number}`} width={680}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Pedido</div><div style={{ fontWeight:700, fontFamily:'monospace' }}>{detail.order_number}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Cliente</div><div style={{ fontWeight:600 }}>{detail.client_name||'—'}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Status</div><Badge color={STATUS_MAP[detail.status]?.c||'#6b7280'}>{STATUS_MAP[detail.status]?.l||detail.status}</Badge></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Tipo</div><div>{TYPE_MAP[detail.type]||detail.type}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Acerto</div><div>{detail.refund_type === 'credit' ? 'Crédito loja' : detail.refund_type === 'refund' ? 'Estorno' : 'Troca'}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Valor</div><div style={{ fontWeight:900, fontSize:'1.1rem' }}>{fmt.brl(detail.total_refund)}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Data</div><div>{new Date(detail.created_at).toLocaleString('pt-BR')}</div></div>
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Criado por</div><div>{detail.created_by_name||'—'}</div></div>
              {detail.approved_by_name && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Aprovado por</div><div>{detail.approved_by_name}</div></div>}
            </div>

            {detail.credit && (
              <div style={{ background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.25)', borderRadius:8, padding:'8px 12px' }}>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:'#10b981' }}>Crédito gerado: <span style={{ fontFamily:'monospace' }}>{detail.credit.number}</span> — {fmt.brl(detail.credit.balance)} disponível</div>
              </div>
            )}

            <div>
              <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:6 }}>ITENS DEVOLVIDOS</div>
              {(detail.items||[]).map(it => (
                <div key={it.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:'.85rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <div>
                      <span style={{ fontWeight:600 }}>{it.product_name}</span>
                      {it.sku && <span style={{ color:'var(--muted)', fontSize:'.72rem', marginLeft:6 }}>{it.sku}</span>}
                      <span style={{ color:'var(--muted)', marginLeft:6 }}>x{it.quantity_returned}</span>
                    </div>
                    <span style={{ fontWeight:600 }}>{fmt.brl(it.total_refund)}</span>
                  </div>
                  {it.imei && <div style={{ fontSize:'.72rem', color:'var(--primary)', fontFamily:'monospace' }}>IMEI: {it.imei}{it.imei2 ? ` / ${it.imei2}` : ''}</div>}
                  <div style={{ fontSize:'.72rem', color:'var(--muted)', display:'flex', gap:12, marginTop:2 }}>
                    <span>Motivo: {REASON_OPTS.find(r=>r.v===it.reason)?.l||it.reason}</span>
                    <span>Condição: {COND_OPTS.find(c=>c.v===it.condition)?.l||it.condition}</span>
                    <span>Destino: {DEST_OPTS.find(d=>d.v===it.stock_destination)?.l||it.stock_destination}</span>
                  </div>
                  {it.notes && <div style={{ fontSize:'.72rem', color:'var(--muted)', fontStyle:'italic' }}>{it.notes}</div>}
                </div>
              ))}
            </div>

            {detail.checklist && Object.keys(detail.checklist).length > 0 && detail.checklist.box !== undefined && (
              <div>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:6 }}>CHECKLIST DE CONFERÊNCIA</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:'.82rem' }}>
                  {[
                    { key:'box', l:'Caixa/nota' }, { key:'charger', l:'Carregador' }, { key:'cable', l:'Cabo' },
                    { key:'earphone', l:'Fone' }, { key:'sim_tool', l:'Chave SIM' },
                    { key:'powers_on', l:'Liga' }, { key:'locks_removed', l:'Bloqueios removidos' },
                  ].map(ck => (
                    <div key={ck.key} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {detail.checklist[ck.key] ? <CheckCircle size={14} color="#10b981"/> : <XCircle size={14} color="#ef4444"/>}
                      {ck.l}
                    </div>
                  ))}
                </div>
                {detail.checklist.device_condition && <div style={{ fontSize:'.78rem', marginTop:4 }}>Estado: {detail.checklist.device_condition === 'good' ? 'Sem marcas' : detail.checklist.device_condition === 'scratches' ? 'Riscos leves' : 'Avariado'}</div>}
                {detail.checklist.notes && <div style={{ fontSize:'.78rem', color:'var(--muted)', fontStyle:'italic', marginTop:2 }}>{detail.checklist.notes}</div>}
              </div>
            )}

            {detail.notes && <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'8px 12px', fontSize:'.85rem', color:'var(--muted)' }}>{detail.notes}</div>}

            <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" size="sm" onClick={()=>printReturn(detail)}><Printer size={14}/> Imprimir</Btn>
              {(TRANSITIONS[detail.status]||[]).map(t => (
                <Btn key={t.s} size="sm"
                  style={t.s==='cancelled' ? { background:'rgba(239,68,68,.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,.3)' }
                    : t.s==='processed' ? { background:'rgba(139,92,246,.15)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,.4)' }
                    : { background: (STATUS_MAP[t.s]?.c||'#6b7280')+'22', color: STATUS_MAP[t.s]?.c||'#6b7280', border:`1px solid ${(STATUS_MAP[t.s]?.c||'#6b7280')}55` }}
                  onClick={()=>changeStatus(detail.id, t.s, t.l)}>{t.l}</Btn>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Status confirm */}
      {statusModal && (
        <Modal open={!!statusModal} onClose={()=>setStatusModal(null)} title="Confirmar" width={420}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {statusModal.status === 'processed' && (
              <div style={{ background:'rgba(139,92,246,.08)', border:'1px solid rgba(139,92,246,.25)', borderRadius:8, padding:'10px 14px', fontSize:'.85rem', color:'#8b5cf6' }}>
                <strong>Atenção:</strong> Ao processar, o estoque será movimentado e o acerto financeiro será executado. Esta ação não pode ser desfeita.
              </div>
            )}
            <p style={{ fontSize:'.9rem' }}>Confirmar: <strong>{statusModal.label}</strong>?</p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setStatusModal(null)}>Cancelar</Btn>
              <Btn onClick={doChangeStatus} disabled={saving}
                style={statusModal.status === 'cancelled' ? { background:'#ef4444', color:'#fff', border:'none' } : {}}>
                {saving ? 'Aguarde...' : 'Confirmar'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
