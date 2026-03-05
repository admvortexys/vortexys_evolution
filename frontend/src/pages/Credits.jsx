import { useEffect, useState } from 'react'
import { RotateCcw, Search, Eye, XCircle, FileText, User, Calendar } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Badge, Spinner, fmt } from '../components/UI'

const STATUS_MAP = {
  active:   { label:'Ativo', color:'#10b981' },
  exhausted:{ label:'Utilizado', color:'#6b7280' },
  settled:  { label:'Liquidado', color:'#3b82f6' },
  cancelled:{ label:'Cancelado', color:'#ef4444' },
  expired:  { label:'Expirado', color:'#f59e0b' },
}

const TYPE_MAP = {
  store_credit:'Crédito loja',
  refund:'Estorno financeiro',
}

export default function Credits() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/credits', { params })
      setRows(data)
    } catch { toast.error('Erro ao carregar créditos') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter])

  const openDetail = async id => {
    try {
      const { data } = await api.get(`/credits/${id}`)
      setDetail(data)
    } catch { toast.error('Erro ao carregar detalhes') }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Informe o motivo')
    setSaving(true)
    try {
      await api.patch(`/credits/${cancelModal}/cancel`, { reason: cancelReason })
      toast.success('Crédito cancelado')
      setCancelModal(null)
      setDetail(null)
      load()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const printCredit = (doc) => {
    const w = window.open('', '_blank', 'width=420,height=700')
    const items = Array.isArray(doc.order_items) ? doc.order_items : []
    const usedOn = Array.isArray(doc.used_on_orders) ? doc.used_on_orders : []
    w.document.write(`<!DOCTYPE html><html><head><title>Crédito ${doc.number}</title>
<style>
  body{font-family:Arial,sans-serif;padding:20px;font-size:13px;color:#1a1a1a;max-width:380px;margin:0 auto}
  h2{text-align:center;margin:0 0 4px;font-size:16px} .sub{text-align:center;color:#888;font-size:11px;margin-bottom:16px}
  .sep{border:none;border-top:1px dashed #ccc;margin:12px 0} table{width:100%;border-collapse:collapse}
  td{padding:3px 0;font-size:12px;vertical-align:top} .r{text-align:right} .b{font-weight:700}
  .total{font-size:16px;font-weight:900;text-align:center;margin:12px 0}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
  .footer{text-align:center;font-size:10px;color:#999;margin-top:20px}
</style></head><body>
<h2>${doc.type === 'refund' ? 'COMPROVANTE DE ESTORNO' : 'CRÉDITO NA LOJA'}</h2>
<div class="sub">Documento de devolução</div>
<hr class="sep"/>
<table>
  <tr><td class="b">Nº Documento</td><td class="r">${doc.number}</td></tr>
  <tr><td class="b">Pedido origem</td><td class="r">${doc.order_number || '—'}</td></tr>
  <tr><td class="b">Data</td><td class="r">${new Date(doc.created_at).toLocaleString('pt-BR')}</td></tr>
  <tr><td class="b">Cliente</td><td class="r">${doc.client_name || '—'}</td></tr>
  ${doc.client_document ? `<tr><td class="b">Documento</td><td class="r">${doc.client_document}</td></tr>` : ''}
  <tr><td class="b">Tipo</td><td class="r"><span class="badge" style="background:${doc.type==='refund'?'#dbeafe':'#d1fae5'};color:${doc.type==='refund'?'#2563eb':'#059669'}">${TYPE_MAP[doc.type]||doc.type}</span></td></tr>
  <tr><td class="b">Status</td><td class="r"><span class="badge" style="background:${(STATUS_MAP[doc.status]?.color||'#6b7280')+'22'};color:${STATUS_MAP[doc.status]?.color||'#6b7280'}">${STATUS_MAP[doc.status]?.label||doc.status}</span></td></tr>
  <tr><td class="b">Responsável</td><td class="r">${doc.created_by_name || '—'}</td></tr>
</table>
<hr class="sep"/>
<div class="b" style="margin-bottom:6px">Motivo:</div>
<div style="font-size:12px;margin-bottom:8px">${doc.reason}</div>
${items.length > 0 ? `
<hr class="sep"/>
<div class="b" style="margin-bottom:6px">Itens devolvidos:</div>
<table>${items.map(it => `<tr><td>${it.product_name} (${it.sku||'—'})</td><td class="r">x${it.quantity} = ${fmt.brl(it.total)}</td></tr>`).join('')}</table>
` : ''}
<hr class="sep"/>
<div class="total">VALOR: ${fmt.brl(doc.amount)}</div>
${doc.type === 'store_credit' ? `
<div class="total" style="font-size:14px;color:#059669">SALDO DISPONÍVEL: ${fmt.brl(doc.balance)}</div>
` : ''}
${usedOn.length > 0 ? `
<hr class="sep"/>
<div class="b" style="margin-bottom:6px">Utilizações:</div>
<table>${usedOn.map(u => `<tr><td>Pedido ${u.order_number||u.order_id}</td><td class="r">${fmt.brl(u.amount)} em ${new Date(u.date).toLocaleDateString('pt-BR')}</td></tr>`).join('')}</table>
` : ''}
<hr class="sep"/>
<div class="footer">Documento gerado automaticamente para fins de auditoria.<br/>Impresso em ${new Date().toLocaleString('pt-BR')}</div>
<script>setTimeout(()=>window.print(),200)</script>
</body></html>`)
    w.document.close()
  }

  const cols = [
    { key:'number', label:'Documento', render:v => <span style={{ fontWeight:700, fontFamily:'monospace' }}>{v}</span> },
    { key:'type', label:'Tipo', render:v => TYPE_MAP[v] || v },
    { key:'client_name', label:'Cliente', render:v => v || '—' },
    { key:'order_number', label:'Pedido', render:v => v ? <span style={{ fontFamily:'monospace' }}>{v}</span> : '—' },
    { key:'amount', label:'Valor', render:v => <span style={{ fontWeight:700 }}>{fmt.brl(v)}</span> },
    { key:'balance', label:'Saldo', render:(v,row) => row.type==='store_credit' ? <span style={{ fontWeight:700, color: parseFloat(v)>0?'#10b981':'var(--muted)' }}>{fmt.brl(v)}</span> : '—' },
    { key:'status', label:'Status', render:v => { const s=STATUS_MAP[v]||{label:v,color:'#6b7280'}; return <Badge color={s.color}>{s.label}</Badge> }},
    { key:'created_at', label:'Data', render:v => fmt.date(v) },
  ]

  return (
    <div>
      <PageHeader title="Créditos e Devoluções" subtitle="Documentos de crédito, estorno e auditoria" icon={RotateCcw} />

      <Card>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <Search size={15} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&load()}
              placeholder="Buscar por nº documento, pedido, cliente, motivo..."
              style={{ width:'100%', paddingLeft:32, height:36, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.85rem', outline:'none' }}/>
          </div>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            style={{ height:36, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.85rem', padding:'0 10px' }}>
            <option value="">Todos status</option>
            {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Btn onClick={load} variant="ghost" size="sm">Buscar</Btn>
        </div>

        {loading ? <Spinner/> : (
          rows.length === 0
            ? <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Nenhum documento encontrado</div>
            : <Table columns={cols} data={rows} onRow={r=>openDetail(r.id)}/>
        )}
      </Card>

      {/* Detail */}
      {detail && (
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={`Documento ${detail.number}`} width={640}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Header */}
            <div style={{
              background: detail.type==='refund' ? 'rgba(59,130,246,.08)' : 'rgba(16,185,129,.08)',
              border: `1px solid ${detail.type==='refund' ? 'rgba(59,130,246,.25)' : 'rgba(16,185,129,.25)'}`,
              borderRadius:10, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <div>
                <div style={{ fontSize:'.78rem', fontWeight:700, color: detail.type==='refund' ? '#3b82f6' : '#10b981', textTransform:'uppercase' }}>
                  {TYPE_MAP[detail.type] || detail.type}
                </div>
                <div style={{ fontWeight:900, fontSize:'1.3rem', marginTop:2 }}>{fmt.brl(detail.amount)}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <Badge color={STATUS_MAP[detail.status]?.color || '#6b7280'}>{STATUS_MAP[detail.status]?.label || detail.status}</Badge>
                {detail.type === 'store_credit' && parseFloat(detail.balance) > 0 && (
                  <div style={{ fontSize:'.78rem', color:'#10b981', fontWeight:700, marginTop:4 }}>Saldo: {fmt.brl(detail.balance)}</div>
                )}
              </div>
            </div>

            {/* Info grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}><FileText size={11} style={{ verticalAlign:'middle', marginRight:4 }}/>Nº Documento</div>
                <div style={{ fontWeight:700, fontFamily:'monospace' }}>{detail.number}</div>
              </div>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Pedido origem</div>
                <div style={{ fontWeight:700, fontFamily:'monospace' }}>{detail.order_number || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}><User size={11} style={{ verticalAlign:'middle', marginRight:4 }}/>Cliente</div>
                <div style={{ fontWeight:600 }}>{detail.client_name || '—'}</div>
                {detail.client_document && <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{detail.client_document}</div>}
                {detail.client_phone && <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{detail.client_phone}</div>}
              </div>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}><Calendar size={11} style={{ verticalAlign:'middle', marginRight:4 }}/>Data</div>
                <div>{new Date(detail.created_at).toLocaleString('pt-BR')}</div>
              </div>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Responsável</div>
                <div>{detail.created_by_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Valor do pedido</div>
                <div>{fmt.brl(detail.order_total)}</div>
              </div>
            </div>

            {/* Reason */}
            <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:'.75rem', fontWeight:700, color:'var(--muted)', marginBottom:4 }}>MOTIVO DA DEVOLUÇÃO</div>
              <div style={{ fontSize:'.88rem' }}>{detail.reason}</div>
            </div>

            {/* Items */}
            {Array.isArray(detail.order_items) && detail.order_items.length > 0 && (
              <div>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:6 }}>ITENS DEVOLVIDOS</div>
                {detail.order_items.map((it, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:'.85rem' }}>
                    <div>
                      <span style={{ fontWeight:600 }}>{it.product_name}</span>
                      {it.sku && <span style={{ color:'var(--muted)', fontSize:'.75rem', marginLeft:6 }}>{it.sku}</span>}
                      <span style={{ color:'var(--muted)', marginLeft:6 }}>x{it.quantity}</span>
                    </div>
                    <span style={{ fontWeight:600 }}>{fmt.brl(it.total)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Usage history */}
            {detail.type === 'store_credit' && Array.isArray(detail.used_on_orders) && detail.used_on_orders.length > 0 && (
              <div>
                <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--muted)', marginBottom:6 }}>UTILIZAÇÕES DO CRÉDITO</div>
                {detail.used_on_orders.map((u, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:'.85rem' }}>
                    <span>Pedido {u.order_number || `#${u.order_id}`} — {new Date(u.date).toLocaleDateString('pt-BR')}</span>
                    <span style={{ fontWeight:600 }}>{fmt.brl(u.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.notes && (
              <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'8px 12px', fontSize:'.85rem', color:'var(--muted)' }}>{detail.notes}</div>
            )}

            {/* Actions */}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              <Btn variant="ghost" size="sm" onClick={()=>printCredit(detail)}>
                <FileText size={14}/> Imprimir
              </Btn>
              {detail.status === 'active' && (
                <Btn variant="danger" size="sm" onClick={()=>{setCancelReason('');setCancelModal(detail.id)}}>
                  <XCircle size={14}/> Cancelar crédito
                </Btn>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel credit modal */}
      {cancelModal && (
        <Modal open={!!cancelModal} onClose={()=>setCancelModal(null)} title="Cancelar crédito" width={420}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, padding:'8px 12px', fontSize:'.85rem', color:'#ef4444' }}>
              Essa ação não pode ser desfeita. O saldo restante será zerado.
            </div>
            <div>
              <label style={{ fontSize:'.72rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Motivo *</label>
              <textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={3} placeholder="Descreva o motivo do cancelamento..."
                style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <Btn variant="ghost" onClick={()=>setCancelModal(null)}>Voltar</Btn>
              <Btn variant="danger" onClick={handleCancel} disabled={saving}>{saving ? 'Aguarde...' : 'Confirmar cancelamento'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
