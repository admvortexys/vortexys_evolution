/**
 * Ordens de serviço (assistência): lista, criar/editar, itens, orçamento.
 * Templates de WhatsApp configuráveis. Portal público para cliente acompanhar.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { Wrench, Plus, Search, MessageSquare, CheckCircle2, Clock, Package, FileText,
  ChevronRight, X, Send, AlertTriangle, Camera, User, Smartphone } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, Textarea, FormRow, KpiCard, fmt, Autocomplete } from '../components/UI'
import { Settings2 } from 'lucide-react'

const PRIORITY_MAP = {
  urgent: { l: 'Urgente', c: '#ef4444', dot: '🔴' },
  high: { l: 'Alta', c: '#f59e0b', dot: '🟡' },
  normal: { l: 'Normal', c: '#9ca3af', dot: '⚪' },
}
const STATUS_MAP = {
  received: { l: 'Recebido', c: '#6b7280' },
  analysis: { l: 'Em análise', c: '#3b82f6' },
  awaiting_approval: { l: 'Aguardando aprovação', c: '#f59e0b' },
  awaiting_part: { l: 'Aguardando peça', c: '#f97316' },
  repair: { l: 'Em reparo', c: '#8b5cf6' },
  testing: { l: 'Testes', c: '#06b6d4' },
  ready: { l: 'Pronto para retirada', c: '#10b981' },
  delivered: { l: 'Entregue', c: '#22c55e' },
  cancelled: { l: 'Cancelado', c: '#ef4444' },
}

const WA_TEMPLATES = [
  { k: 'received', l: 'Recebemos seu aparelho' },
  { k: 'quote_ready', l: 'Orçamento pronto' },
  { k: 'awaiting_approval', l: 'Aguardando aprovação' },
  { k: 'part_arrived', l: 'Peça chegou' },
  { k: 'ready', l: 'Pronto para retirada' },
  { k: 'delivered', l: 'Entregue' },
]

export default function ServiceOrders() {
  const [rows, setRows] = useState([])
  const [kpis, setKpis] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTech, setFilterTech] = useState('')
  const [searchText, setSearchText] = useState('')
  const [detail, setDetail] = useState(null)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [technicians, setTechnicians] = useState([])
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const { toast } = useToast()

  const [form, setForm] = useState({
    client_id: '', client_label: '', walk_in_name: '', walk_in_phone: '', walk_in_doc: '',
  })
  const [detailTab, setDetailTab] = useState('resumo')
  const [newItem, setNewItem] = useState({ type: 'service', service_id: '', product_id: '', description: '', quantity: 1, unit_price: '', unit_cost: '', discount: 0 })
  const [waModal, setWaModal] = useState(null)
  const [waSending, setWaSending] = useState(false)
  const [servicesModal, setServicesModal] = useState(false)
  const [templatesModal, setTemplatesModal] = useState(false)
  const [checklistTemplatesModal, setChecklistTemplatesModal] = useState(false)
  const debounceTimers = useRef({})
  const detailRef = useRef(detail)
  detailRef.current = detail

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filterStatus) p.set('status', filterStatus)
    if (filterTech) p.set('technician_id', filterTech)
    if (searchText) p.set('search', searchText)
    setLoading(true)
    Promise.all([
      api.get(`/service-orders?${p}`).then(r => setRows(r.data)),
      api.get('/service-orders/kpis').then(r => setKpis(r.data)),
      api.get('/service-orders/meta/technicians').then(r => setTechnicians(r.data)),
      api.get('/service-orders/services').then(r => setServices(r.data)),
      api.get('/products', { params: { limit: 500 } }).then(r => setProducts(r.data?.rows || r.data || [])),
    ]).catch(() => {}).finally(() => setLoading(false))
  }, [filterStatus, filterTech, searchText])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setForm({ client_id: '', client_label: '', walk_in_name: '', walk_in_phone: '', walk_in_doc: '' })
    setModal(true)
  }

  const createOs = async () => {
    if (!form.client_id && !form.walk_in_name) return toast.error('Cliente ou nome é obrigatório')
    setSaving(true)
    try {
      const { data } = await api.post('/service-orders', form)
      toast.success(`OS ${data.number} criada!`)
      setModal(false)
      load()
      openDetail(data.id)
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao criar OS') }
    finally { setSaving(false) }
  }

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/service-orders/${id}`)
      setDetail(data)
      setDetailTab('resumo')
    } catch { toast.error('Erro ao carregar OS') }
  }

  const updateOs = useCallback(async (field, value) => {
    const d = detailRef.current
    if (!d) return
    try {
      const { data } = await api.put(`/service-orders/${d.id}`, { ...d, [field]: value })
      setDetail(data)
      toast.success('Atualizado')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }, [])

  const updateOsDebounced = useCallback((field, value) => {
    const timer = debounceTimers.current[field]
    if (timer) clearTimeout(timer)
    debounceTimers.current[field] = setTimeout(() => updateOs(field, value), 600)
  }, [updateOs])

  // Atualiza a lateral imediatamente (otimista) e agenda o save na API
  const saveOptimistic = useCallback((field, value) => {
    setDetail(prev => prev ? { ...prev, [field]: value } : prev)
    const timer = debounceTimers.current[field]
    if (timer) clearTimeout(timer)
    debounceTimers.current[field] = setTimeout(() => updateOs(field, value), 600)
  }, [updateOs])

  const changeStatus = async (status) => {
    if (!detail) return
    setSaving(true)
    try {
      const { data } = await api.patch(`/service-orders/${detail.id}/status`, { status })
      setDetail(data)
      toast.success(`Status: ${STATUS_MAP[status]?.l || status}`)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const addDevice = async (dev) => {
    if (!detail) return
    try {
      const { data } = await api.post(`/service-orders/${detail.id}/devices`, dev)
      setDetail(d => ({ ...d, devices: [...(d.devices || []), data] }))
      toast.success('Aparelho adicionado')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const addItem = async () => {
    if (!detail) return
    if (newItem.type === 'service' && !newItem.service_id && !newItem.description) return toast.error('Serviço ou descrição obrigatório')
    if (newItem.type === 'part' && !newItem.product_id && !newItem.description) return toast.error('Peça ou descrição obrigatório')
    setSaving(true)
    try {
      const { data } = await api.post(`/service-orders/${detail.id}/items`, {
        ...newItem,
        unit_price: parseFloat(newItem.unit_price) || 0,
        unit_cost: parseFloat(newItem.unit_cost) || 0,
        discount: parseFloat(newItem.discount) || 0,
      })
      setDetail(d => ({ ...d, items: [...(d.items || []), data] }))
      setNewItem({ type: 'service', service_id: '', product_id: '', description: '', quantity: 1, unit_price: '', unit_cost: '', discount: 0 })
      toast.success('Item adicionado')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const deductPart = async (itemId) => {
    if (!detail) return
    try {
      await api.post(`/service-orders/${detail.id}/items/${itemId}/deduct`)
      setDetail(d => ({ ...d, items: d.items.map(it => it.id === itemId ? { ...it, stock_deducted: true } : it) }))
      toast.success('Peça baixada do estoque')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const approveQuote = async (approved, notes) => {
    if (!detail) return
    setSaving(true)
    try {
      await api.post(`/service-orders/${detail.id}/approve`, { approved, notes })
      setDetail(d => ({ ...d, status: approved ? 'repair' : 'cancelled' }))
      toast.success(approved ? 'Orçamento aprovado' : 'Orçamento recusado')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const sendWa = async (template, message, phone) => {
    if (!detail) return
    setWaSending(true)
    try {
      await api.post(`/service-orders/${detail.id}/wa-send`, { template, message, phone })
      toast.success('Mensagem enviada!')
      setWaModal(null)
      setDetail(d => ({ ...d, messages: [{ template, message, phone, status: 'sent', sent_at: new Date().toISOString() }, ...(d.messages || [])] }))
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao enviar') }
    finally { setWaSending(false) }
  }

  const updateChecklist = async (ckId, value) => {
    if (!detail) return
    try {
      const { data } = await api.patch(`/service-orders/${detail.id}/checklist/${ckId}`, { value })
      setDetail(d => ({ ...d, checklists: d.checklists.map(c => c.id === ckId ? data : c) }))
    } catch { /* ignore */ }
  }

  const addChecklist = async (phase, itemKey, label, value) => {
    if (!detail) return
    try {
      const { data } = await api.post(`/service-orders/${detail.id}/checklist`, { phase, item_key: itemKey, label, value })
      setDetail(d => ({ ...d, checklists: [...(d.checklists || []), data] }))
    } catch { /* ignore */ }
  }

  const formatTempoAberta = (row) => {
    const dt = row.received_at || row.created_at
    if (!dt) return '—'
    const ms = Date.now() - new Date(dt).getTime()
    if (ms < 60 * 60 * 1000) return `${Math.floor(ms / 60000)}min`
    if (ms < 24 * 60 * 60 * 1000) return `${Math.floor(ms / 3600000)}h`
    const d = Math.floor(ms / (24 * 60 * 60 * 1000))
    return `${d}d`
  }
  const cols = [
    { key: 'number', label: 'Nº', render: v => v ? <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '.9rem' }}>#{String(v).replace(/^OS-?/i, '')}</span> : '—' },
    { key: 'client_name', label: 'Cliente', render: (v, r) => v || r.walk_in_name || '—' },
    { key: 'brand', label: 'Aparelho', render: (_, r) => {
      const model = [r.brand, r.model].filter(Boolean).join(' ').trim() || null
      const color = r.device_color ? ` - ${r.device_color}` : ''
      return model ? `${model}${color}` : '—'
    }},
    { key: 'status', label: 'Status', render: v => <Badge color={STATUS_MAP[v]?.c || '#6b7280'}>{STATUS_MAP[v]?.l || v}</Badge> },
    { key: 'priority', label: 'Prioridade', render: v => {
      const p = PRIORITY_MAP[v || 'normal'] || PRIORITY_MAP.normal
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span>{p.dot}</span><span style={{ fontSize: '.78rem', color: p.c }}>{p.l}</span></span>
    }},
    { key: 'tempo', label: '⏱ Tempo', render: (_, r) => ['delivered', 'cancelled'].includes(r.status) ? '—' : <span title={r.received_at || r.created_at}>{formatTempoAberta(r)}</span> },
    { key: 'technician_name', label: 'Técnico', render: v => v || '—' },
    { key: 'received_at', label: 'Entrada', render: v => v ? fmt.date(v) : '—' },
  ]

  const totalBudget = (detail?.items || []).reduce((s, it) => s + (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0), 0)
  const TABS = [
    { k: 'resumo', l: 'Resumo', icon: FileText },
    { k: 'orcamento', l: 'Orçamento', icon: Package },
    { k: 'checklist', l: 'Checklist', icon: CheckCircle2 },
    { k: 'mensagens', l: 'Mensagens', icon: MessageSquare },
    { k: 'historico', l: 'Histórico', icon: Clock },
  ]

  return (
    <div className="page" style={{ minWidth: 0 }}>
      <PageHeader title="Assistência Técnica" subtitle="Ordens de serviço" icon={Wrench}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn variant="secondary" size="sm" onClick={() => setServicesModal(true)} title="Personalizar serviços (Troca de tela, Diagnóstico, etc.)">
              <Settings2 size={16} /> Personalizar serviços
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setTemplatesModal(true)} title="Configurar templates de WhatsApp">
              <MessageSquare size={16} /> Templates WhatsApp
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setChecklistTemplatesModal(true)} title="Checklist padrão">
              <CheckCircle2 size={16} /> Checklist padrão
            </Btn>
            <Btn onClick={openNew} icon={<Plus size={16} />}>Nova OS</Btn>
          </div>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        <KpiCard icon={Wrench} label="Em aberto" value={kpis.open || 0} color="#6366f1" />
        <KpiCard icon={Package} label="Prontos" value={kpis.ready || 0} color="#10b981" />
        <KpiCard icon={AlertTriangle} label="Aguard. aprovação" value={kpis.awaiting_approval || 0} color="#f59e0b" />
        <KpiCard icon={Clock} label="Aguard. peça" value={kpis.awaiting_part || 0} color="#f97316" />
        <KpiCard icon={CheckCircle2} label="Entradas hoje" value={kpis.today || 0} color="#3b82f6" />
        <KpiCard icon={CheckCircle2} label="Entregues hoje" value={kpis.delivered_today || 0} color="#22c55e" />
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="Buscar por nº OS, cliente, IMEI, modelo..."
              style={{ width: '100%', paddingLeft: 32, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.85rem', outline: 'none' }} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.85rem', padding: '0 10px' }}>
            <option value="">Todos status</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
          <select value={filterTech} onChange={e => setFilterTech(e.target.value)}
            style={{ height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.85rem', padding: '0 10px' }}>
            <option value="">Todos técnicos</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {loading ? <Spinner /> : rows.length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhuma OS encontrada</div>
          : <Table columns={cols} data={rows} onRow={r => openDetail(r.id)} />}
      </Card>

      {/* ── Modal Nova OS ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nova Ordem de Serviço" width={520}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={createOs} disabled={saving}>{saving ? 'Criando...' : 'Criar OS'}</Btn>
        </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <Autocomplete label="Cliente" value={{ label: form.client_label }}
              fetchFn={q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r => r.data)}
              onSelect={c => setForm(f => ({ ...f, client_id: c.id, client_label: c.name, walk_in_name: '', walk_in_phone: f.walk_in_phone }))}
              renderOption={c => (<div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>{[c.document, c.phone].filter(Boolean).join(' · ')}</div></div>)}
              placeholder="Digite nome, CPF ou telefone para buscar..."
            />
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>ou</span>
              <button type="button" className="btn-link" onClick={() => setForm(f => ({ ...f, client_id: '', client_label: '' }))}>
                Sem cadastro — informar nome
              </button>
            </div>
          </div>
          {!form.client_id && (
            <FormRow cols={2}>
              <Input label="Nome *" value={form.walk_in_name} onChange={e => setForm(f => ({ ...f, walk_in_name: e.target.value }))} placeholder="Nome do cliente" />
              <Input label="Telefone" value={form.walk_in_phone} onChange={e => setForm(f => ({ ...f, walk_in_phone: e.target.value }))} placeholder="11999999999" />
            </FormRow>
          )}
        </div>
      </Modal>

      {/* ── Drawer Detalhe OS ── */}
      {detail && (
        <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: Math.min(560, '100vw'), maxWidth: '100%', background: 'var(--bg-card)', boxShadow: '-4px 0 24px rgba(0,0,0,.2)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid var(--border)' }}>
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 999 }} />
          <div style={{ position: 'relative', zIndex: 1001, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', height: '100%' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace' }}>#{String(detail.number || '').replace(/^OS-?/i, '')}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{detail.client_name || detail.walk_in_name || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Btn size="sm" variant="secondary" onClick={() => setWaModal({ template: null, message: '', phone: detail.client_phone || detail.walk_in_phone })}
                  disabled={!(detail.client_phone || detail.walk_in_phone)} title="Enviar WhatsApp">
                  <Smartphone size={14} /> WhatsApp
                </Btn>
                <Badge color={STATUS_MAP[detail.status]?.c || '#6b7280'}>{STATUS_MAP[detail.status]?.l || detail.status}</Badge>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={20} /></button>
              </div>
            </div>

            {/* Status pipeline - clicável */}
            <div style={{ padding: '12px 20px', background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 8, letterSpacing: '.04em' }}>CLIQUE PARA ALTERAR STATUS</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['received', 'analysis', 'awaiting_approval', 'awaiting_part', 'repair', 'testing', 'ready', 'delivered'].map(s => {
                  const active = detail.status === s
                  const canChange = !['delivered', 'cancelled'].includes(detail.status)
                  return (
                    <button key={s} onClick={() => canChange && changeStatus(s)}
                      style={{ padding: '6px 12px', fontSize: '.75rem', fontWeight: 600, borderRadius: 8, border: active ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap',
                        background: active ? (STATUS_MAP[s]?.c || '#6b7280') : 'var(--bg-card3)', color: active ? '#fff' : 'var(--text-2)',
                        cursor: canChange ? 'pointer' : 'default', transition: 'all .15s' }}
                      onMouseEnter={e => canChange && !active && (e.currentTarget.style.background = 'var(--bg-hover)', e.currentTarget.style.borderColor = 'var(--primary)')}
                      onMouseLeave={e => canChange && !active && (e.currentTarget.style.background = 'var(--bg-card3)', e.currentTarget.style.borderColor = 'var(--border)')}>
                      {STATUS_MAP[s]?.l}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
              {TABS.map(t => (
                <button key={t.k} onClick={() => setDetailTab(t.k)}
                  style={{ padding: '10px 14px', fontSize: '.8rem', fontWeight: detailTab === t.k ? 700 : 500, color: detailTab === t.k ? 'var(--primary)' : 'var(--text-2)',
                    background: 'none', border: 'none', borderBottom: detailTab === t.k ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <t.icon size={14} />{t.l}
                </button>
              ))}
            </div>

            <div className="os-detail-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 20, paddingBottom: 40, WebkitOverflowScrolling: 'touch' }}>
              {detailTab === 'resumo' && (
                <ResumoTab detail={detail} updateOs={updateOs} saveOptimistic={saveOptimistic} addDevice={addDevice} technicians={technicians} />
              )}
              {detailTab === 'orcamento' && (
                <OrcamentoTab detail={detail} newItem={newItem} setNewItem={setNewItem} addItem={addItem} services={services} products={products} totalBudget={totalBudget}
                  approveQuote={approveQuote} deductPart={deductPart} saving={saving} onOpenServices={() => setServicesModal(true)} />
              )}
              {detailTab === 'checklist' && (
                <ChecklistTab detail={detail} setDetail={setDetail} updateChecklist={updateChecklist} addChecklist={addChecklist} toast={toast} onOpenTemplates={() => setChecklistTemplatesModal(true)} />
              )}
              {detailTab === 'mensagens' && (
                <MensagensTab detail={detail} setWaModal={setWaModal} sendWa={sendWa} waModal={waModal} waSending={waSending} />
              )}
              {detailTab === 'historico' && (
                <HistoricoTab detail={detail} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal WhatsApp ── */}
      {waModal && detail && (
        <WaModalDetail
          waModal={waModal} setWaModal={setWaModal} detail={detail} waSending={waSending}
          sendWa={sendWa}
        />
      )}

      {/* ── Modal Cadastro de Serviços ── */}
      {servicesModal && (
        <ServicesModal
          onClose={() => { load(); setServicesModal(false) }}
          toast={toast}
        />
      )}

      {/* ── Modal Configurar Templates WhatsApp ── */}
      {templatesModal && (
        <WaTemplatesModal
          onClose={() => { setTemplatesModal(false) }}
          toast={toast}
        />
      )}

      {/* ── Modal Checklist Padrão ── */}
      {checklistTemplatesModal && (
        <ChecklistTemplatesModal
          onClose={() => setChecklistTemplatesModal(false)}
          toast={toast}
        />
      )}
    </div>
  )
}

function PhotosSection({ detail, updateOs }) {
  const photos = Array.isArray(detail?.photos) ? detail.photos : []
  const addPhoto = (e) => {
    const file = e.target?.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result
      const label = file.name.replace(/\.[^.]+$/, '')
      const next = [...photos, { data, label: label || null }]
      updateOs('photos', next)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  const removePhoto = (i) => {
    const next = photos.filter((_, j) => j !== i)
    updateOs('photos', next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: 'relative', width: 100, height: 100, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <img src={p.data} alt={p.label || 'Foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>×</button>
            {p.label && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.7))', padding: '20px 6px 6px', fontSize: '.7rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>}
          </div>
        ))}
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg-card2)', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem', width: 'fit-content' }}>
        <Camera size={16} />
        Adicionar foto
        <input type="file" accept="image/*" onChange={addPhoto} style={{ display: 'none' }} />
      </label>
    </div>
  )
}

function ResumoTab({ detail, updateOs, saveOptimistic, addDevice, technicians }) {
  const [devForm, setDevForm] = useState({ brand: '', model: '', color: '', storage: '', imei: '', serial: '' })
  const save = saveOptimistic || updateOs
  const device = (detail.devices || [])[0]
  const deviceLabel = device ? [device.brand, device.model, device.color].filter(Boolean).join(' - ') : '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Card resumo no topo */}
      <div style={{ padding: 16, background: 'var(--bg-card2)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 20px', fontSize: '.85rem' }}>
          <div><span style={{ color: 'var(--muted)' }}>Cliente:</span> {detail.client_name || detail.walk_in_name || '—'}</div>
          <div><span style={{ color: 'var(--muted)' }}>Telefone:</span> {detail.client_phone || detail.walk_in_phone || '—'}</div>
          <div><span style={{ color: 'var(--muted)' }}>Aparelho:</span> {deviceLabel}</div>
          <div><span style={{ color: 'var(--muted)' }}>Defeito:</span> {(detail.defect_reported || '—').substring(0, 50)}{(detail.defect_reported || '').length > 50 ? '…' : ''}</div>
          <div><span style={{ color: 'var(--muted)' }}>Status:</span> <Badge color={STATUS_MAP[detail.status]?.c || '#6b7280'} size="xs">{STATUS_MAP[detail.status]?.l || detail.status}</Badge></div>
          <div><span style={{ color: 'var(--muted)' }}>Técnico:</span> {detail.technician_name || '—'}</div>
          <div><span style={{ color: 'var(--muted)' }}>Entrada:</span> {detail.received_at ? fmt.date(detail.received_at) : '—'}</div>
          <div><span style={{ color: 'var(--muted)' }}>Previsão:</span> {detail.estimated_at ? fmt.date(detail.estimated_at) : '—'}</div>
          {detail.password_informed && <div><span style={{ color: 'var(--muted)' }}>Senha:</span> {detail.device_password ? '••••••' : '—'}</div>}
          {detail.accessories && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--muted)' }}>Acessórios:</span> {detail.accessories}</div>}
          <div style={{ gridColumn: '1 / -1', fontSize: '.78rem', color: 'var(--muted)' }}>
            Link do cliente: <a href={`${typeof window !== 'undefined' ? window.location.origin : ''}/os/${detail.portal_token || ''}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>/os/{detail.portal_token || '—'}</a>
          </div>
        </div>
      </div>

      <FormRow cols={2}>
        <Select label="Técnico" value={detail.technician_id} onChange={e => updateOs('technician_id', e.target.value || null)}>
          <option value="">— nenhum —</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select label="Prioridade" value={detail.priority || 'normal'} onChange={e => save('priority', e.target.value)}>
          <option value="urgent">🔴 Urgente</option>
          <option value="high">🟡 Alta</option>
          <option value="normal">⚪ Normal</option>
        </Select>
      </FormRow>
      <Input label="Defeito relatado" value={detail.defect_reported} onChange={e => save('defect_reported', e.target.value)} />
      <Input label="Acessórios deixados" value={detail.accessories} onChange={e => save('accessories', e.target.value)} placeholder="Capa, chip, carregador..." />
      <Input label="Estado do aparelho" value={detail.device_state} onChange={e => save('device_state', e.target.value)} placeholder="Arranhado, trincado, liga/não liga" />
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', marginBottom: detail.password_informed ? 8 : 0 }}>
          <input type="checkbox" checked={detail.password_informed} onChange={e => updateOs('password_informed', e.target.checked)} />
          Cliente informou senha?
        </label>
        {detail.password_informed && (
          <Input
            label="Senha do aparelho"
            type="text"
            value={detail.device_password || ''}
            onChange={e => save('device_password', e.target.value)}
            placeholder="Digite a senha informada pelo cliente"
          />
        )}
      </div>

      {/* Fotos do aparelho */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 10 }}>📷 Fotos do aparelho</div>
        <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: 10 }}>Registre danos, arranhões e estado de entrada.</p>
        <PhotosSection detail={detail} updateOs={updateOs} />
      </div>
      <FormRow cols={2}>
        <Input label="Orçamento inicial (R$)" type="number" value={detail.initial_quote} onChange={e => save('initial_quote', e.target.value)} />
        <Input label="Garantia (dias)" type="number" value={detail.warranty_days} onChange={e => save('warranty_days', e.target.value)} />
      </FormRow>
      <Input label="Previsão" type="datetime-local" value={detail.estimated_at ? detail.estimated_at.slice(0, 16) : ''} onChange={e => updateOs('estimated_at', e.target.value || null)} />
      <Textarea label="Observações" value={detail.notes} onChange={e => save('notes', e.target.value)} rows={2} />

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 10 }}>Aparelho</div>
        {(detail.devices || []).map(d => (
          <div key={d.id} style={{ padding: 10, background: 'var(--bg-card2)', borderRadius: 8, marginBottom: 8 }}>
            {d.brand} {d.model} {d.color ? `(${d.color})` : ''} {d.storage ? `${d.storage}` : ''}
            {d.imei && <div style={{ fontSize: '.75rem', fontFamily: 'monospace', color: 'var(--muted)' }}>IMEI: {d.imei}</div>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input placeholder="Marca" value={devForm.brand} onChange={e => setDevForm(f => ({ ...f, brand: e.target.value }))} style={{ flex: '1 1 100px' }} />
          <Input placeholder="Modelo" value={devForm.model} onChange={e => setDevForm(f => ({ ...f, model: e.target.value }))} style={{ flex: '1 1 100px' }} />
          <Input placeholder="IMEI" value={devForm.imei} onChange={e => setDevForm(f => ({ ...f, imei: e.target.value }))} style={{ flex: '1 1 100px' }} />
          <Btn size="sm" onClick={() => { addDevice(devForm); setDevForm({ brand: '', model: '', color: '', storage: '', imei: '', serial: '' }) }} style={{ background: 'var(--primary)' }}>+ Aparelho</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Modal WhatsApp (template com autocomplete) ──
function WaModalDetail({ waModal, setWaModal, detail, waSending, sendWa }) {
  const [templates, setTemplates] = useState(WA_TEMPLATES)
  const [templateQuery, setTemplateQuery] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const templateRef = useRef(null)
  useEffect(() => {
    api.get('/service-orders/wa-templates').then(r => setTemplates(r.data || [])).catch(() => {})
  }, [])
  useEffect(() => {
    const t = templates.find(x => x.k === waModal?.template)
    if (t) {
      setTemplateQuery(t.l)
      if (!waModal?.message && (t.msg || t.message)) {
        const items = detail?.items || []
        const total = items.reduce((s, it) => s + (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0), 0)
        const valorStr = items.length ? fmt.brl(total) : '—'
        const itensStr = items.length ? items.map(it => {
          const desc = it.service_name || it.product_name || it.description || 'Item'
          const tot = (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0)
          return `• ${desc} - ${fmt.brl(tot)}`
        }).join('\n') : 'Sem itens no orçamento'
        const msg = (t.msg || t.message || '')
          .replace(/{nome}/g, detail?.client_name || detail?.walk_in_name || 'Cliente')
          .replace(/{numero}/g, detail?.number || '')
          .replace(/{dias}/g, String(detail?.warranty_days || 90))
          .replace(/{link}/g, typeof window !== 'undefined' && detail?.portal_token ? `${window.location.origin}/os/${detail.portal_token}` : '')
          .replace(/{valor}/g, valorStr)
          .replace(/{itens}/g, itensStr)
        setWaModal(m => ({ ...m, message: msg }))
      }
    } else if (!waModal?.template) setTemplateQuery('')
  }, [waModal?.template, waModal?.message, templates, detail?.client_name, detail?.walk_in_name, detail?.number, detail?.warranty_days])
  useEffect(() => {
    const h = e => { if (templateRef.current && !templateRef.current.contains(e.target)) setTemplateOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const filtered = templates.filter(t => !templateQuery || (t.l || '').toLowerCase().includes(templateQuery.toLowerCase()))
  const selected = templates.find(t => t.k === waModal.template)
  const portalLink = typeof window !== 'undefined' && detail?.portal_token ? `${window.location.origin}/os/${detail.portal_token}` : ''
  const items = detail?.items || []
  const totalBudget = items.reduce((s, it) => s + (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0), 0)
  const valorStr = items.length ? fmt.brl(totalBudget) : '—'
  const itensStr = items.length ? items.map(it => {
    const desc = it.service_name || it.product_name || it.description || 'Item'
    const tot = (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0)
    return `• ${desc} - ${fmt.brl(tot)}`
  }).join('\n') : 'Sem itens no orçamento'
  const interpolate = (msg) => (msg || '')
    .replace(/{nome}/g, detail?.client_name || detail?.walk_in_name || 'Cliente')
    .replace(/{numero}/g, detail?.number || '')
    .replace(/{dias}/g, String(detail?.warranty_days || 90))
    .replace(/{link}/g, portalLink)
    .replace(/{valor}/g, valorStr)
    .replace(/{itens}/g, itensStr)
  const onSelectTemplate = (t) => {
    setWaModal(m => ({ ...m, template: t.k, message: interpolate(t.msg || t.message) }))
    setTemplateQuery(t.l)
    setTemplateOpen(false)
  }
  return (
    <Modal open onClose={() => setWaModal(null)} title="Enviar WhatsApp" width={420}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={() => setWaModal(null)}>Cancelar</Btn>
        <Btn onClick={() => sendWa(waModal.template, waModal.message, waModal.phone)} disabled={waSending}>{waSending ? 'Enviando...' : 'Enviar'}</Btn>
      </div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Telefone" value={waModal.phone || detail?.client_phone || detail?.walk_in_phone} onChange={e => setWaModal(m => ({ ...m, phone: e.target.value }))} />
        <div ref={templateRef} style={{ position: 'relative' }}>
          <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Template</label>
          <input value={templateOpen ? templateQuery : (selected?.l || templateQuery)} onChange={e => { setTemplateQuery(e.target.value); setTemplateOpen(true) }}
            onFocus={() => setTemplateOpen(true)} placeholder="Digite para buscar..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none' }} />
          {templateOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4, maxHeight: 200, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
              {filtered.length ? filtered.map(t => (
                <div key={t.k} onClick={() => onSelectTemplate(t)} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '.88rem', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card2)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  {t.l}
                </div>
              )) : <div style={{ padding: 12, fontSize: '.85rem', color: 'var(--muted)' }}>Nenhum template encontrado</div>}
            </div>
          )}
        </div>
        <Textarea label="Mensagem" value={waModal.message} onChange={e => setWaModal(m => ({ ...m, message: e.target.value }))} rows={4} />
      </div>
    </Modal>
  )
}

// ── Modal Configurar Templates WhatsApp ──
function WaTemplatesModal({ onClose, toast }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.get('/service-orders/wa-templates').then(r => setList(r.data || [])).catch(() => setList(WA_TEMPLATES.map(t => ({ ...t, msg: '' })))).finally(() => setLoading(false))
  }, [])
  const update = (idx, field, val) => {
    setList(prev => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t))
  }
  const add = () => setList(prev => [...prev, { k: 'custom_' + Date.now(), l: 'Novo template', msg: 'Olá {nome}!' }])
  const remove = (idx) => setList(prev => prev.filter((_, i) => i !== idx))
  const save = async () => {
    setSaving(true)
    try {
      const r = await api.put('/service-orders/wa-templates', { templates: list })
      setList(r.data || list)
      toast.success('Templates salvos!')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar') }
    finally { setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title="Configurar templates WhatsApp" width={600}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
      </div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Use {'{nome}'}, {'{numero}'}, {'{dias}'}, {'{link}'} (URL acompanhamento), {'{valor}'} (total) e {'{itens}'} (lista do orçamento) nas mensagens.</p>
        {loading ? <Spinner /> : (
          <>
            <Btn size="sm" variant="secondary" onClick={add}>+ Novo template</Btn>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((t, i) => (
                <div key={t.k || i} style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={t.l || ''} onChange={e => update(i, 'l', e.target.value)}
                      placeholder="Nome (ex: Orçamento pronto)"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '.88rem' }} />
                    <Btn size="sm" variant="danger" onClick={() => remove(i)}>Excluir</Btn>
                  </div>
                  <textarea value={t.msg || t.message || ''} onChange={e => update(i, 'msg', e.target.value)}
                    placeholder="Mensagem com {nome}, {numero}, {valor}, {itens}, {link}..."
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '.88rem', resize: 'vertical' }} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Modal Checklist Padrão ──
function ChecklistTemplatesModal({ onClose, toast }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ phase: 'entry', label: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.get('/service-orders/checklist-templates').then(r => setList(r.data)).catch(() => setList([])).finally(() => setLoading(false))
  }, [])
  const add = async () => {
    if (!form.label?.trim()) return toast?.error?.('Label obrigatório')
    setSaving(true)
    try {
      const { data } = await api.post('/service-orders/checklist-templates', form)
      setList(prev => [...prev, data])
      setForm({ phase: 'entry', label: '' })
      toast?.success?.('Item adicionado')
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }
  const remove = async (id) => {
    try {
      await api.delete(`/service-orders/checklist-templates/${id}`)
      setList(prev => prev.filter(t => t.id !== id))
      toast?.success?.('Removido')
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro') }
  }
  return (
    <Modal open onClose={onClose} title="Checklist padrão" width={500}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
      </div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Itens padrão que aparecem ao clicar em &quot;Aplicar padrão&quot; no checklist de cada OS.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Ex: Tela trincada"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', outline: 'none' }} />
          <Btn size="sm" onClick={add} disabled={saving}>+ Adicionar</Btn>
        </div>
        {loading ? <Spinner /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-card2)', borderRadius: 8 }}>
                <span>{t.label}</span>
                <Btn size="xs" variant="danger" onClick={() => remove(t.id)}>Excluir</Btn>
              </div>
            ))}
            {!list.length && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Nenhum item</div>}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Modal Cadastro de Serviços ──
function ServicesModal({ onClose, toast }) {
  const [list, setList] = useState([])
  const [form, setForm] = useState({ name: '', description: '', default_price: '', avg_time_mins: 60 })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.get('/service-orders/services?all=1').then(r => setList(r.data)).catch(() => [])
  }, [])
  const save = async () => {
    if (!form.name?.trim()) return toast.error('Nome obrigatório')
    setSaving(true)
    try {
      if (editId) {
        await api.put(`/service-orders/services/${editId}`, form)
      } else {
        await api.post('/service-orders/services', form)
      }
      const r = await api.get('/service-orders/services?all=1')
      setList(r.data)
      setForm({ name: '', description: '', default_price: '', avg_time_mins: 60 })
      setEditId(null)
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }
  const del = async (id) => {
    try {
      await api.delete(`/service-orders/services/${id}`)
      setList(prev => prev.filter(s => s.id !== id))
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }
  return (
    <Modal open onClose={onClose} title="Cadastro de serviços" width={500}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? 'Salvando...' : editId ? 'Salvar' : 'Adicionar'}</Btn>
      </div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10, alignItems: 'flex-end' }}>
          <Input label="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Troca de tela" />
          <Input label="Preço padrão (R$)" type="number" value={form.default_price} onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))} placeholder="0" />
          <Input label="Tempo (min)" type="number" value={form.avg_time_mins} onChange={e => setForm(f => ({ ...f, avg_time_mins: e.target.value }))} />
        </div>
        <Input label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 10 }}>Serviços cadastrados</div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {list.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-card2)', borderRadius: 8, marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{s.name}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{fmt.brl(s.default_price)} {s.description && `· ${s.description}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditId(s.id); setForm({ name: s.name, description: s.description || '', default_price: s.default_price, avg_time_mins: s.avg_time_mins || 60 }) }}>Editar</Btn>
                  <Btn size="sm" variant="danger" onClick={() => del(s.id)}>Excluir</Btn>
                </div>
              </div>
            ))}
            {!list.length && <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: 20, textAlign: 'center' }}>Nenhum serviço cadastrado</div>}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function OrcamentoTab({ detail, newItem, setNewItem, addItem, services, products, totalBudget, approveQuote, deductPart, saving, onOpenServices }) {
  const items = detail?.items || []
  const hasApproval = !!detail?.approval
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <select value={newItem.type} onChange={e => setNewItem(n => ({ ...n, type: e.target.value }))}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', fontSize: '.85rem' }}>
          <option value="service">Serviço</option>
          <option value="part">Peça</option>
        </select>
        {newItem.type === 'service' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select value={newItem.service_id} onChange={e => {
              const s = services.find(sv => String(sv.id) === e.target.value)
              setNewItem(n => ({ ...n, service_id: e.target.value, description: s?.name || n.description, unit_price: s?.default_price || n.unit_price }))
            }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', minWidth: 160, background: 'var(--bg-card3)', color: 'var(--text)' }}>
              <option value="">— Serviço —</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt.brl(s.default_price)}</option>)}
            </select>
            {onOpenServices && <button type="button" onClick={onOpenServices} style={{ fontSize: '.72rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Gerenciar</button>}
          </div>
        )}
        {newItem.type === 'part' && (
          <select value={newItem.product_id} onChange={e => {
            const p = products.find(pr => String(pr.id) === e.target.value)
            setNewItem(n => ({ ...n, product_id: e.target.value, description: p?.name || n.description, unit_price: p?.sale_price || n.unit_price, unit_cost: p?.cost_price || n.unit_cost }))
          }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', minWidth: 200, fontSize: '.88rem' }}>
            <option value="">— Peça —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {fmt.brl(p.sale_price)}</option>)}
          </select>
        )}
        <input placeholder="Descrição" value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))}
          style={{ flex: 1, minWidth: 140, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', fontSize: '.88rem' }} />
        <input type="number" placeholder="Qtd" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))}
          style={{ width: 60, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', fontSize: '.88rem' }} />
        <input type="number" placeholder="Preço" value={newItem.unit_price} onChange={e => setNewItem(n => ({ ...n, unit_price: e.target.value }))}
          style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', fontSize: '.88rem' }} />
        <Btn size="sm" onClick={addItem} disabled={saving} style={{ background: 'var(--primary)' }}>+ Adicionar</Btn>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        {items.map(it => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1, fontSize: '.85rem' }}>{it.service_name || it.product_name || it.description}</span>
            <span style={{ fontSize: '.85rem' }}>x{it.quantity}</span>
            <span style={{ fontWeight: 600 }}>{fmt.brl((parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0))}</span>
            {it.type === 'part' && it.product_id && (
              it.stock_deducted
                ? <Badge color="#10b981" size="xs">Baixado</Badge>
                : <Btn size="xs" variant="ghost" onClick={() => deductPart(it.id)}>Baixar</Btn>
            )}
          </div>
        ))}
        <div style={{ marginTop: 12, fontWeight: 700, fontSize: '1.1rem' }}>Total: {fmt.brl(totalBudget)}</div>
      </div>

      {detail?.status === 'awaiting_approval' && !hasApproval && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn onClick={() => approveQuote(true)} disabled={saving}>Aprovar orçamento</Btn>
          <Btn variant="ghost" onClick={() => approveQuote(false)} disabled={saving} style={{ color: '#ef4444' }}>Recusar</Btn>
        </div>
      )}
    </div>
  )
}

function ChecklistTab({ detail, setDetail, updateChecklist, addChecklist, toast, onOpenTemplates }) {
  const [newEntry, setNewEntry] = useState('')
  const [applying, setApplying] = useState(false)

  const applyTemplates = async () => {
    if (!detail) return
    setApplying(true)
    try {
      const { data } = await api.post(`/service-orders/${detail.id}/apply-checklist-templates`)
      if (data.added?.length) {
        setDetail(d => ({ ...d, checklists: [...(d.checklists || []), ...data.added] }))
        toast?.success?.(`${data.count} itens do padrão adicionados`)
      } else {
        toast?.info?.('Checklist já possui todos os itens padrão')
      }
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro ao aplicar') }
    finally { setApplying(false) }
  }

  const addCustomItem = async (phase, label) => {
    const lbl = (label || '').trim()
    if (!lbl) return toast?.error?.('Digite um item para adicionar')
    const key = 'custom_' + Date.now()
    try {
      const { data } = await api.post(`/service-orders/${detail.id}/checklist`, { phase, item_key: key, label: lbl })
      setDetail(d => ({ ...d, checklists: [...(d.checklists || []), data] }))
      setNewEntry('')
      toast?.success?.('Item adicionado')
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro ao adicionar') }
  }

  const removeItem = async (ck) => {
    try {
      await api.delete(`/service-orders/${detail.id}/checklist/${ck.id}`)
      setDetail(d => ({ ...d, checklists: (d.checklists || []).filter(c => c.id !== ck.id) }))
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro ao remover') }
  }

  const allItems = (detail.checklists || []).sort((a, b) => (a.phase || '').localeCompare(b.phase || '') || (a.id - b.id))

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Btn size="sm" onClick={applyTemplates} disabled={applying}>
          Aplicar padrão
        </Btn>
        {onOpenTemplates && (
          <Btn size="sm" variant="ghost" onClick={onOpenTemplates}>Configurar checklist padrão</Btn>
        )}
      </div>
      <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 16 }}>Adicione os itens do checklist conforme necessário. Use &quot;Aplicar padrão&quot; para inserir itens configurados.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allItems.map(ck => {
          const isChecked = ck.value === 'sim' || ck.value === true || ck.value === 'true'
          return (
            <label key={ck.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card3)', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card3)' }}>
              <input type="checkbox" checked={!!isChecked} onChange={e => updateChecklist(ck.id, e.target.checked ? true : null)}
                style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '.9rem', color: 'var(--text)', textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.8 : 1 }}>{ck.label || ck.item_key}</span>
              <button type="button" onClick={e => { e.preventDefault(); removeItem(ck) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }} title="Remover">×</button>
            </label>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={newEntry} onChange={e => setNewEntry(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomItem('entry', newEntry)}
          placeholder="Adicionar item..." style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', fontSize: '.85rem', outline: 'none' }} />
        <Btn size="sm" onClick={() => addCustomItem('entry', newEntry)} style={{ background: 'var(--primary)' }}>+ Adicionar</Btn>
      </div>
    </div>
  )
}

function MensagensTab({ detail, setWaModal, sendWa, waModal, waSending }) {
  const [templates, setTemplates] = useState(WA_TEMPLATES)
  useEffect(() => {
    api.get('/service-orders/wa-templates').then(r => setTemplates(r.data || WA_TEMPLATES)).catch(() => {})
  }, [])
  const phone = detail?.client_phone || detail?.walk_in_phone
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {templates.map(t => (
          <Btn key={t.k} size="sm" variant="ghost" onClick={() => setWaModal({ template: t.k, message: '', phone })}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={14} />{t.l}
          </Btn>
        ))}
      </div>
      {!phone && <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Cliente sem telefone cadastrado.</div>}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 8 }}>Histórico</div>
        {(detail?.messages || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Nenhuma mensagem enviada</div>}
        {(detail?.messages || []).map(m => (
          <div key={m.id} style={{ padding: 10, background: 'var(--bg-card2)', borderRadius: 8, marginBottom: 8 }}>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>{m.template || 'Manual'} — {m.sent_at ? fmt.date(m.sent_at) : '—'}</div>
            <div style={{ fontSize: '.85rem' }}>{m.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatLogLabel(log) {
  if (log.action === 'created') return 'OS criada'
  if (log.action === 'status_changed' && log.new_value) return `Status → ${STATUS_MAP[log.new_value]?.l || log.new_value}`
  if (log.action === 'technician_changed') return 'Técnico alterado'
  if (log.action === 'approval') return log.field === 'approved' ? 'Cliente aprovou' : 'Cliente recusou'
  return log.action
}

function HistoricoTab({ detail }) {
  const logs = detail?.logs || []
  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: 'var(--border)', borderRadius: 1 }} />
      {logs.map((l, i) => (
        <div key={l.id} style={{ position: 'relative', paddingBottom: 16 }}>
          <div style={{ position: 'absolute', left: -18, top: 4, width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--bg-card)' }} />
          <div style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{formatLogLabel(l)}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 4 }}>
              {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              {l.user_name && ` · ${l.user_name}`}
            </div>
            {l.old_value && l.new_value && l.action !== 'status_changed' && (
              <div style={{ fontSize: '.78rem', marginTop: 6 }}>Antes: {l.old_value} → Depois: {l.new_value}</div>
            )}
          </div>
        </div>
      ))}
      {logs.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Nenhum registro no histórico</div>}
    </div>
  )
}
