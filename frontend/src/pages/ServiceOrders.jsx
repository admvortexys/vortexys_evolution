import { useEffect, useState, useCallback, useRef } from 'react'
import { Wrench, Plus, Search, MessageSquare, CheckCircle2, Clock, Package, FileText,
  ChevronRight, X, Send, AlertTriangle, Camera, User } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, Textarea, FormRow, KpiCard, fmt } from '../components/UI'
import { Settings2 } from 'lucide-react'

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
  const [clients, setClients] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const { toast } = useToast()

  const [form, setForm] = useState({
    client_id: '', walk_in_name: '', walk_in_phone: '', walk_in_doc: '',
  })
  const [detailTab, setDetailTab] = useState('resumo')
  const [newItem, setNewItem] = useState({ type: 'service', service_id: '', product_id: '', description: '', quantity: 1, unit_price: '', unit_cost: '', discount: 0 })
  const [waModal, setWaModal] = useState(null)
  const [waSending, setWaSending] = useState(false)
  const [servicesModal, setServicesModal] = useState(false)
  const [templatesModal, setTemplatesModal] = useState(false)
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
      api.get('/clients', { params: { limit: 300 } }).then(r => setClients(r.data?.rows || r.data || [])),
      api.get('/service-orders/meta/technicians').then(r => setTechnicians(r.data)),
      api.get('/service-orders/services').then(r => setServices(r.data)),
      api.get('/products', { params: { limit: 500 } }).then(r => setProducts(r.data?.rows || r.data || [])),
    ]).catch(() => {}).finally(() => setLoading(false))
  }, [filterStatus, filterTech, searchText])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setForm({ client_id: '', walk_in_name: '', walk_in_phone: '', walk_in_doc: '' })
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

  const cols = [
    { key: 'number', label: 'Nº', render: v => <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{v}</span> },
    { key: 'client_name', label: 'Cliente', render: (v, r) => v || r.walk_in_name || '—' },
    { key: 'brand', label: 'Aparelho', render: (_, r) => (r.brand || r.model) ? `${r.brand || ''} ${r.model || ''}`.trim() : '—' },
    { key: 'status', label: 'Status', render: v => <Badge color={STATUS_MAP[v]?.c || '#6b7280'}>{STATUS_MAP[v]?.l || v}</Badge> },
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
      <Modal open={modal} onClose={() => setModal(false)} title="Nova Ordem de Serviço" width={480}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={createOs} disabled={saving}>{saving ? 'Criando...' : 'Criar OS'}</Btn>
        </div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Cliente" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, walk_in_name: e.target.value ? '' : f.walk_in_name }))}>
            <option value="">— Sem cadastro (informar nome) —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
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
                <div style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace' }}>{detail.number}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{detail.client_name || detail.walk_in_name || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge color={STATUS_MAP[detail.status]?.c || '#6b7280'}>{STATUS_MAP[detail.status]?.l || detail.status}</Badge>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={20} /></button>
              </div>
            </div>

            {/* Status pipeline */}
            <div style={{ padding: '10px 20px', background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, overflowX: 'auto' }}>
              {['received', 'analysis', 'awaiting_approval', 'awaiting_part', 'repair', 'testing', 'ready', 'delivered'].map(s => (
                <button key={s} onClick={() => !['delivered', 'cancelled'].includes(detail.status) && changeStatus(s)}
                  style={{ padding: '4px 8px', fontSize: '.68rem', fontWeight: 600, borderRadius: 6, border: 'none', cursor: detail.status === s ? 'default' : 'pointer', whiteSpace: 'nowrap',
                    background: detail.status === s ? STATUS_MAP[s]?.c : 'transparent', color: detail.status === s ? '#fff' : 'var(--muted)' }}>
                  {STATUS_MAP[s]?.l}
                </button>
              ))}
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
                <ResumoTab detail={detail} updateOs={updateOs} updateOsDebounced={updateOsDebounced} addDevice={addDevice} technicians={technicians} />
              )}
              {detailTab === 'orcamento' && (
                <OrcamentoTab detail={detail} newItem={newItem} setNewItem={setNewItem} addItem={addItem} services={services} products={products} totalBudget={totalBudget}
                  approveQuote={approveQuote} deductPart={deductPart} saving={saving} onOpenServices={() => setServicesModal(true)} />
              )}
              {detailTab === 'checklist' && (
                <ChecklistTab detail={detail} setDetail={setDetail} updateChecklist={updateChecklist} addChecklist={addChecklist} toast={toast} />
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
    </div>
  )
}

function ResumoTab({ detail, updateOs, updateOsDebounced, addDevice, technicians }) {
  const [devForm, setDevForm] = useState({ brand: '', model: '', color: '', storage: '', imei: '', serial: '' })
  const save = updateOsDebounced || updateOs
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FormRow cols={2}>
        <Select label="Técnico" value={detail.technician_id} onChange={e => updateOs('technician_id', e.target.value || null)}>
          <option value="">— nenhum —</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Input label="Prioridade" value={detail.priority} onChange={e => save('priority', e.target.value)} />
      </FormRow>
      <Input label="Defeito relatado" value={detail.defect_reported} onChange={e => save('defect_reported', e.target.value)} />
      <Input label="Acessórios deixados" value={detail.accessories} onChange={e => save('accessories', e.target.value)} placeholder="Capa, chip, carregador..." />
      <Input label="Estado do aparelho" value={detail.device_state} onChange={e => save('device_state', e.target.value)} placeholder="Arranhado, trincado, liga/não liga" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem' }}>
        <input type="checkbox" checked={detail.password_informed} onChange={e => updateOs('password_informed', e.target.checked)} />
        Cliente informou senha?
      </label>
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
        const msg = (t.msg || t.message || '')
          .replace(/{nome}/g, detail?.client_name || detail?.walk_in_name || 'Cliente')
          .replace(/{numero}/g, detail?.number || '')
          .replace(/{dias}/g, String(detail?.warranty_days || 90))
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
  const interpolate = (msg) => (msg || '')
    .replace(/{nome}/g, detail?.client_name || detail?.walk_in_name || 'Cliente')
    .replace(/{numero}/g, detail?.number || '')
    .replace(/{dias}/g, String(detail?.warranty_days || 90))
  const onSelectTemplate = (t) => {
    setWaModal(m => ({ ...m, template: t.k, message: interpolate(t.msg) }))
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
        <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Use {'{nome}'}, {'{numero}'} e {'{dias}'} nas mensagens para preencher automaticamente.</p>
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
                    placeholder="Mensagem com {nome}, {numero}, {dias}..."
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

function ChecklistTab({ detail, setDetail, updateChecklist, addChecklist, toast }) {
  const [newEntry, setNewEntry] = useState('')
  const [newExit, setNewExit] = useState('')
  const byPhase = (phase) => (detail?.checklists || []).filter(c => c.phase === phase)

  const addCustomItem = async (phase, label) => {
    const lbl = (label || '').trim()
    if (!lbl) return toast?.error?.('Digite um item para adicionar')
    const key = 'custom_' + Date.now()
    try {
      const { data } = await api.post(`/service-orders/${detail.id}/checklist`, { phase, item_key: key, label: lbl })
      setDetail(d => ({ ...d, checklists: [...(d.checklists || []), data] }))
      if (phase === 'entry') setNewEntry('')
      else setNewExit('')
      toast?.success?.('Item adicionado')
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro ao adicionar') }
  }

  const removeItem = async (ck) => {
    try {
      await api.delete(`/service-orders/${detail.id}/checklist/${ck.id}`)
      setDetail(d => ({ ...d, checklists: (d.checklists || []).filter(c => c.id !== ck.id) }))
    } catch (e) { toast?.error?.(e.response?.data?.error || 'Erro ao remover') }
  }

  const renderPhase = (phase) => {
    const items = byPhase(phase)
    const title = phase === 'entry' ? 'Entrada' : 'Pós-reparo'
    const newLabel = phase === 'entry' ? newEntry : newExit
    const setNewLabel = phase === 'entry' ? setNewEntry : setNewExit
    return (
      <div key={phase} style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 12, color: 'var(--text)' }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(ck => (
            <div key={ck.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: '.88rem', color: 'var(--text)' }}>{ck.label || ck.item_key}</span>
              <select value={ck.value || ''} onChange={e => updateChecklist(ck.id, e.target.value || null)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.82rem', minWidth: 90 }}>
                <option value="">—</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
                <option value="n_a">N/A</option>
              </select>
              <button onClick={() => removeItem(ck)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }} title="Remover">×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomItem(phase, newLabel)}
            placeholder="Adicionar item..." style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-card3)', color: 'var(--text)', fontSize: '.85rem', outline: 'none' }} />
          <Btn size="sm" onClick={() => addCustomItem(phase, newLabel)} style={{ background: 'var(--primary)' }}>+ Adicionar</Btn>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 16 }}>Adicione os itens do checklist conforme necessário. Cada OS pode ter itens diferentes.</p>
      {renderPhase('entry')}
      {renderPhase('exit')}
    </div>
  )
}

function MensagensTab({ detail, setWaModal, sendWa, waModal, waSending }) {
  const phone = detail?.client_phone || detail?.walk_in_phone
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {WA_TEMPLATES.map(t => (
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

function HistoricoTab({ detail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(detail?.logs || []).map(l => (
        <div key={l.id} style={{ padding: 10, background: 'var(--bg-card2)', borderRadius: 8, fontSize: '.85rem' }}>
          <div style={{ fontWeight: 600 }}>{l.action}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{l.user_name || '—'} — {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : ''}</div>
          {l.old_value && <div style={{ fontSize: '.78rem' }}>Antes: {l.old_value}</div>}
          {l.new_value && <div style={{ fontSize: '.78rem' }}>Depois: {l.new_value}</div>}
        </div>
      ))}
      {(detail?.logs || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Nenhum registro</div>}
    </div>
  )
}
