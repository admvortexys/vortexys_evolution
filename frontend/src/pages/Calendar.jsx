import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Calendar as CalendarIcon, Plus, List, Grid3X3, ChevronLeft, ChevronRight, Clock,
  CheckCircle2, Send, Phone, MessageSquare, AlertTriangle, Trash2, Edit3, X,
  RotateCcw, ExternalLink, Search } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Btn, Badge, Spinner, Modal, Input, Select, Textarea, FormRow, fmt } from '../components/UI'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAY_NAMES  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
const SHORT_DAYS = ['D','S','T','Q','Q','S','S']

const EVENT_TYPES = {
  task:      { label:'Tarefa',         icon:'✅', color:'#6366f1' },
  call:      { label:'Ligação',        icon:'📞', color:'#3b82f6' },
  meeting:   { label:'Reunião',        icon:'🤝', color:'#8b5cf6' },
  followup:  { label:'Follow-up',      icon:'🔄', color:'#f59e0b' },
  delivery:  { label:'Entrega',        icon:'📦', color:'#10b981' },
  service:   { label:'Assistência/OS', icon:'🔧', color:'#ef4444' },
  billing:   { label:'Cobrança',       icon:'💰', color:'#f97316' },
  birthday:  { label:'Aniversário',    icon:'🎂', color:'#ec4899' },
  recurring: { label:'Recorrente',     icon:'🔁', color:'#6b7280' },
  visit:     { label:'Visita',         icon:'🏠', color:'#14b8a6' },
  whatsapp:  { label:'WhatsApp',       icon:'💬', color:'#22c55e' },
  note:      { label:'Nota',           icon:'📝', color:'#64748b' },
  email:     { label:'E-mail',         icon:'📧', color:'#0ea5e9' },
  internal:  { label:'Interno',        icon:'🏢', color:'#78716c' },
}

const PRIORITIES = [
  { value:'low',    label:'Baixa',  color:'#6b7280' },
  { value:'normal', label:'Normal', color:'#3b82f6' },
  { value:'high',   label:'Alta',   color:'#f97316' },
  { value:'urgent', label:'Urgente',color:'#ef4444' },
]

const WA_TEMPLATES = [
  { value:'return_quote',      label:'Retorno de orçamento',      text:'Olá {nome}! Tudo bem? Vimos que você se interessou por {produto}. Posso te ajudar a finalizar?' },
  { value:'order_ready',       label:'Pedido pronto',             text:'Olá {nome}! Seu pedido está pronto para retirada. Horário de funcionamento: 9h às 18h.' },
  { value:'service_done',      label:'OS finalizada',             text:'Olá {nome}! Seu aparelho ficou pronto. Pode retirar em nosso endereço.' },
  { value:'billing_reminder',  label:'Lembrete de parcela',       text:'Olá {nome}, passando para lembrar da parcela com vencimento em {data}. Qualquer dúvida estamos à disposição.' },
  { value:'birthday',          label:'Aniversário',               text:'Parabéns {nome}! 🎉 Temos um desconto especial esperando por você. Venha conferir!' },
  { value:'custom',            label:'Personalizado',             text:'' },
]

function toDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function toTimeStr(d) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
}
function getCalendarDays(year, month) {
  const first = new Date(year, month - 1, 1)
  const last  = new Date(year, month, 0)
  const days  = []
  const startDay = first.getDay()
  for (let i = startDay - 1; i >= 0; i--) days.push({ date: new Date(year, month - 1, -i), current: false })
  for (let i = 1; i <= last.getDate(); i++) days.push({ date: new Date(year, month - 1, i), current: true })
  while (days.length % 7 !== 0) days.push({ date: new Date(year, month, days.length - startDay - last.getDate() + 1), current: false })
  return days
}

const emptyForm = {
  title:'', description:'', event_type:'task', due_date:'', end_date:'', all_day:false,
  client_id:'', lead_id:'', order_id:'', transaction_id:'', seller_id:'', priority:'normal', color:'',
  wa_scheduled:false, wa_send_at:'', wa_phone:'', wa_message:'', wa_template:'',
}

/* ─── Event Drawer ─── */
function EventDrawer({ event, onClose, onSave, onDelete, onDone, onReopen, onWaSend, clients, sellers }) {
  if (!event) return null
  const et = EVENT_TYPES[event.event_type||event.type] || EVENT_TYPES.task
  const isPast = event.due_date && new Date(event.due_date) < new Date() && !event.done
  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:420, maxWidth:'100vw',
      background:'var(--bg-card)', boxShadow:'-4px 0 24px rgba(0,0,0,.15)', zIndex:1100,
      display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:'1.4rem' }}>{et.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:'.95rem', color:'var(--text)' }}>{event.title}</div>
          <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{et.label}</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}><X size={20}/></button>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
        {isPast && (
          <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px',
            display:'flex', alignItems:'center', gap:8, fontSize:'.8rem', color:'#ef4444' }}>
            <AlertTriangle size={14}/> Evento atrasado
          </div>
        )}
        {event.done && (
          <div style={{ background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)', borderRadius:8, padding:'8px 12px',
            display:'flex', alignItems:'center', gap:8, fontSize:'.8rem', color:'#10b981' }}>
            <CheckCircle2 size={14}/> Concluído em {event.completed_at ? fmt.date(event.completed_at) : ''}
          </div>
        )}
        <InfoRow label="Data/Hora" value={event.due_date ? `${fmt.date(event.due_date)} ${toTimeStr(event.due_date)}` : '—'} />
        {event.end_date && <InfoRow label="Término" value={`${fmt.date(event.end_date)} ${toTimeStr(event.end_date)}`}/>}
        {event.client_name && <InfoRow label="Cliente" value={event.client_name}/>}
        {event.lead_name && <InfoRow label="Lead" value={event.lead_name}/>}
        {event.order_number && <InfoRow label="Pedido" value={`#${event.order_number}`}/>}
        {event.seller_name && <InfoRow label="Responsável" value={event.seller_name}/>}
        {event.user_name && <InfoRow label="Criado por" value={event.user_name}/>}
        {event.priority && event.priority !== 'normal' && (
          <InfoRow label="Prioridade" value={<span style={{ color: PRIORITIES.find(p=>p.value===event.priority)?.color }}>
            {PRIORITIES.find(p=>p.value===event.priority)?.label}
          </span>}/>
        )}
        {event.description && (
          <div style={{ padding:'10px 14px', background:'var(--bg-card2)', borderRadius:8, fontSize:'.85rem', color:'var(--text)', lineHeight:1.5 }}>
            {event.description}
          </div>
        )}
        {event.wa_scheduled && (
          <div style={{ marginTop:8, padding:12, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', borderRadius:8 }}>
            <div style={{ fontSize:'.78rem', fontWeight:600, color:'#22c55e', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
              <MessageSquare size={14}/> WhatsApp agendado
            </div>
            <div style={{ fontSize:'.8rem', color:'var(--text)', marginBottom:4 }}>📱 {event.wa_phone}</div>
            <div style={{ fontSize:'.8rem', color:'var(--muted)', marginBottom:6, lineHeight:1.4 }}>{event.wa_message}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <WaStatusBadge status={event.wa_status}/>
              {event.wa_send_at && <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>Envio: {fmt.date(event.wa_send_at)} {toTimeStr(event.wa_send_at)}</span>}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', flexWrap:'wrap', gap:8 }}>
        {!event.done && <Btn size="sm" onClick={() => onDone(event.id)} icon={<CheckCircle2 size={14}/>}>Concluir</Btn>}
        {event.done && <Btn size="sm" variant="ghost" onClick={() => onReopen(event.id)} icon={<RotateCcw size={14}/>}>Reabrir</Btn>}
        {event.wa_scheduled && event.wa_status !== 'sent' && (
          <Btn size="sm" variant="ghost" onClick={() => onWaSend(event.id)} icon={<Send size={14}/>} style={{ color:'#22c55e' }}>Enviar WA</Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={() => onSave(event)} icon={<Edit3 size={14}/>}>Editar</Btn>
        <Btn size="sm" variant="ghost" onClick={() => onDelete(event.id)} icon={<Trash2 size={14}/>} style={{ color:'#ef4444' }}>Excluir</Btn>
      </div>
    </div>
  )
}
function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'.83rem' }}>
      <span style={{ color:'var(--muted)' }}>{label}</span>
      <span style={{ color:'var(--text)', fontWeight:500, textAlign:'right' }}>{value}</span>
    </div>
  )
}
function WaStatusBadge({ status }) {
  const map = { pending:'Pendente', scheduled:'Agendado', sent:'Enviado', delivered:'Entregue', read:'Lido', failed:'Falhou' }
  const colors = { pending:'#6b7280', scheduled:'#f59e0b', sent:'#3b82f6', delivered:'#10b981', read:'#10b981', failed:'#ef4444' }
  return <Badge color={colors[status]||'#6b7280'} size="xs">{map[status]||status}</Badge>
}

/* ─── MAIN COMPONENT ─── */
export default function Calendar() {
  const today = new Date()
  const { toast } = useToast()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [view, setView] = useState('month')
  const [selectedDate, setSelectedDate] = useState(toDateKey(today))
  const [activities, setActivities] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [drawerEvent, setDrawerEvent] = useState(null)
  const [clients, setClients] = useState([])
  const [sellers, setSellers] = useState([])
  const [filterType, setFilterType] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [dragId, setDragId] = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cal, up, cl, sl] = await Promise.all([
        api.get('/activities/calendar', { params: { month, year } }).then(r => r.data || []),
        api.get('/activities/upcoming', { params: { days: 7 } }).then(r => r.data || []),
        api.get('/clients', { params: { limit: 500 } }).then(r => (r.data?.rows || r.data || [])),
        api.get('/sellers').then(r => r.data || []).catch(() => []),
      ])
      setActivities(cal)
      setUpcoming(up)
      setClients(cl)
      setSellers(sl)
    } catch { /* ignore */ }
    setLoading(false)
  }, [month, year])

  useEffect(() => { loadAll() }, [loadAll])

  const activitiesByDate = useMemo(() => activities.reduce((acc, a) => {
    const key = toDateKey(new Date(a.due_date))
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {}), [activities])

  const filteredActivities = useMemo(() => {
    let list = [...activities]
    if (filterType) list = list.filter(a => (a.event_type || a.type) === filterType)
    if (filterSearch) {
      const s = filterSearch.toLowerCase()
      list = list.filter(a => (a.title||'').toLowerCase().includes(s) || (a.client_name||'').toLowerCase().includes(s) || (a.lead_name||'').toLowerCase().includes(s) || (a.order_number||'').toLowerCase().includes(s))
    }
    return list.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
  }, [activities, filterType, filterSearch])

  const selectedActivities = useMemo(() => {
    let list = activitiesByDate[selectedDate] || []
    if (filterType) list = list.filter(a => (a.event_type || a.type) === filterType)
    return list.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
  }, [activitiesByDate, selectedDate, filterType])

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month])
  const isToday = d => toDateKey(d) === toDateKey(today)
  const isSelected = d => toDateKey(d) === selectedDate

  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setSelectedDate(toDateKey(today)) }
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const openNew = (date) => {
    const d = date || selectedDate
    setForm({ ...emptyForm, due_date: `${d}T09:00` })
    setEditId(null)
    setModal(true)
  }
  const openEdit = (evt) => {
    setForm({
      title: evt.title || '',
      description: evt.description || '',
      event_type: evt.event_type || evt.type || 'task',
      due_date: evt.due_date ? evt.due_date.slice(0, 16) : '',
      end_date: evt.end_date ? evt.end_date.slice(0, 16) : '',
      all_day: evt.all_day || false,
      client_id: evt.client_id || '',
      lead_id: evt.lead_id || '',
      order_id: evt.order_id || '',
      transaction_id: evt.transaction_id || '',
      seller_id: evt.seller_id || '',
      priority: evt.priority || 'normal',
      color: evt.color || '',
      wa_scheduled: evt.wa_scheduled || false,
      wa_send_at: evt.wa_send_at ? evt.wa_send_at.slice(0, 16) : '',
      wa_phone: evt.wa_phone || '',
      wa_message: evt.wa_message || '',
      wa_template: evt.wa_template || '',
    })
    setEditId(evt.id)
    setDrawerEvent(null)
    setModal(true)
  }

  const save = async () => {
    if (!form.title) return toast('Título é obrigatório', 'error')
    setSaving(true)
    try {
      const body = { ...form }
      if (!body.client_id) body.client_id = null
      if (!body.seller_id) body.seller_id = null
      if (!body.order_id)  body.order_id = null
      if (!body.wa_send_at) body.wa_send_at = null
      body.type = body.event_type
      if (editId) await api.put(`/activities/${editId}`, body)
      else await api.post('/activities', body)
      toast(editId ? 'Evento atualizado' : 'Evento criado', 'success')
      setModal(false)
      loadAll()
    } catch(e) { toast(e.response?.data?.error || 'Erro ao salvar', 'error') }
    setSaving(false)
  }

  const markDone = async (id) => {
    try { await api.patch(`/activities/${id}/done`); toast('Concluído!', 'success'); setDrawerEvent(null); loadAll() }
    catch { toast('Erro', 'error') }
  }
  const reopen = async (id) => {
    try { await api.patch(`/activities/${id}/reopen`); toast('Reaberto', 'success'); setDrawerEvent(null); loadAll() }
    catch { toast('Erro', 'error') }
  }
  const del = async (id) => {
    if (!confirm('Excluir este evento?')) return
    try { await api.delete(`/activities/${id}`); toast('Excluído', 'success'); setDrawerEvent(null); loadAll() }
    catch { toast('Erro', 'error') }
  }
  const sendWa = async (id) => {
    try { await api.post(`/activities/${id}/wa-send`); toast('WhatsApp enviado!', 'success'); loadAll() }
    catch(e) { toast(e.response?.data?.error || 'Erro ao enviar', 'error') }
  }
  const moveEvent = async (id, newDate) => {
    try { await api.patch(`/activities/${id}/move`, { due_date: `${newDate}T09:00:00` }); loadAll() }
    catch { toast('Erro ao mover', 'error') }
  }

  const handleTemplatePick = (tplVal) => {
    const tpl = WA_TEMPLATES.find(t => t.value === tplVal)
    const clientName = form.client_id ? (clients.find(c => String(c.id) === String(form.client_id))?.name || '{nome}') : '{nome}'
    const clientPhone = form.client_id ? (clients.find(c => String(c.id) === String(form.client_id))?.phone || '') : ''
    setForm(f => ({
      ...f,
      wa_template: tplVal,
      wa_message: tpl ? tpl.text.replace('{nome}', clientName) : f.wa_message,
      wa_phone: clientPhone || f.wa_phone,
    }))
  }

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const kpis = useMemo(() => {
    const todayKey = toDateKey(today)
    const todayCount = (activitiesByDate[todayKey] || []).filter(a => !a.done).length
    const overdue = activities.filter(a => !a.done && a.due_date && new Date(a.due_date) < today).length
    const done = activities.filter(a => a.done).length
    const total = activities.length
    return { todayCount, overdue, done, total }
  }, [activities, activitiesByDate])

  return (
    <div className="page" style={{ minWidth:0 }}>
      <PageHeader title="Agenda" subtitle="Compromissos e atividades" icon={CalendarIcon}
        action={<Btn onClick={() => openNew()} icon={<Plus size={16}/>}>Novo evento</Btn>} />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:18 }}>
        <MiniKpi icon={<CalendarIcon size={16}/>} label="Eventos no mês" value={kpis.total} color="#6366f1"/>
        <MiniKpi icon={<Clock size={16}/>} label="Hoje pendentes" value={kpis.todayCount} color="#3b82f6"/>
        <MiniKpi icon={<AlertTriangle size={16}/>} label="Atrasados" value={kpis.overdue} color="#ef4444"/>
        <MiniKpi icon={<CheckCircle2 size={16}/>} label="Concluídos" value={kpis.done} color="#10b981"/>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, background:'var(--bg-card)', borderRadius:8, padding:2, border:'1px solid var(--border)' }}>
          <ToolBtn active={view==='month'} onClick={() => setView('month')} icon={<Grid3X3 size={15}/>} label="Mês"/>
          <ToolBtn active={view==='list'}  onClick={() => setView('list')}  icon={<List size={15}/>} label="Lista"/>
        </div>
        <Btn size="sm" variant="ghost" onClick={goToday}>Hoje</Btn>
        <div style={{ display:'flex', alignItems:'center', gap:2 }}>
          <button onClick={prevMonth} style={navBtnStyle}><ChevronLeft size={18}/></button>
          <span style={{ fontWeight:700, fontSize:'1rem', color:'var(--text)', minWidth:170, textAlign:'center' }}>
            {MONTH_NAMES[month-1]} {year}
          </span>
          <button onClick={nextMonth} style={navBtnStyle}><ChevronRight size={18}/></button>
        </div>
        <div style={{ flex:1 }}/>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="">Todos os tipos</option>
          {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <div style={{ position:'relative', flex:'0 1 220px' }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
          <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar evento..."
            style={{ ...inputStyle, paddingLeft:32 }}/>
        </div>
      </div>

      {loading ? <Spinner text="Carregando agenda..."/> : (
        <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>

          {/* Main area */}
          <div style={{ flex:'1 1 600px', minWidth:0 }}>
            {view === 'month' ? (
              <MonthView
                days={calendarDays} activitiesByDate={activitiesByDate}
                isToday={isToday} isSelected={isSelected} selectedDate={selectedDate}
                onSelectDate={setSelectedDate} onClickDay={openNew} filterType={filterType}
                dragId={dragId} setDragId={setDragId} moveEvent={moveEvent}
                onClickEvent={setDrawerEvent}
              />
            ) : (
              <ListView activities={filteredActivities} onClickEvent={setDrawerEvent} onDone={markDone}/>
            )}

            {/* Selected day detail (month view only) */}
            {view === 'month' && (
              <Card style={{ marginTop:16, padding:0 }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <h3 style={{ fontWeight:700, fontSize:'.9rem', color:'var(--text)', margin:0 }}>
                    {fmt.date(selectedDate)} — {selectedActivities.length} evento(s)
                  </h3>
                  <Btn size="xs" variant="ghost" onClick={() => openNew(selectedDate)} icon={<Plus size={14}/>}>Novo</Btn>
                </div>
                {selectedActivities.length === 0 ? (
                  <p style={{ color:'var(--muted)', fontSize:'.82rem', padding:'24px 18px', textAlign:'center' }}>Nenhum evento neste dia</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column' }}>
                    {selectedActivities.map(a => <EventRow key={a.id} event={a} onClick={() => setDrawerEvent(a)} onDone={markDone}/>)}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Side panel — Próximos eventos */}
          <div style={{ flex:'0 0 300px', minWidth:260 }}>
            <Card style={{ padding:0 }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
                <h3 style={{ fontWeight:700, fontSize:'.9rem', color:'var(--text)', margin:0, display:'flex', alignItems:'center', gap:6 }}>
                  <Clock size={15}/> Próximos 7 dias
                </h3>
              </div>
              {upcoming.length === 0 ? (
                <p style={{ color:'var(--muted)', fontSize:'.82rem', padding:'24px 16px', textAlign:'center' }}>Nenhum evento próximo</p>
              ) : (
                <div style={{ maxHeight:480, overflow:'auto' }}>
                  {upcoming.map(a => <UpcomingRow key={a.id} event={a} onClick={() => setDrawerEvent(a)} onDone={markDone} onWaSend={sendWa}/>)}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Event Drawer */}
      {drawerEvent && (
        <>
          <div onClick={() => setDrawerEvent(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:1099 }}/>
          <EventDrawer event={drawerEvent} onClose={() => setDrawerEvent(null)}
            onSave={openEdit} onDelete={del} onDone={markDone} onReopen={reopen} onWaSend={sendWa}
            clients={clients} sellers={sellers}/>
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar evento' : 'Novo evento'} width={620}
        footer={<div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Salvando...' : (editId ? 'Salvar' : 'Criar')}</Btn>
        </div>}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <FormRow cols={3}>
            <div style={{ gridColumn:'span 2' }}>
              <Input label="Título *" value={form.title} onChange={e => f('title', e.target.value)} placeholder="Ex: Retorno João, Entrega pedido #123"/>
            </div>
            <Select label="Tipo" value={form.event_type} onChange={e => f('event_type', e.target.value)}>
              {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </Select>
          </FormRow>
          <FormRow cols={3}>
            <Input label="Início *" type="datetime-local" value={form.due_date} onChange={e => f('due_date', e.target.value)}/>
            <Input label="Término" type="datetime-local" value={form.end_date} onChange={e => f('end_date', e.target.value)}/>
            <Select label="Prioridade" value={form.priority} onChange={e => f('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </FormRow>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.82rem', color:'var(--text)', cursor:'pointer' }}>
            <input type="checkbox" checked={form.all_day} onChange={e => f('all_day', e.target.checked)}/> Dia inteiro
          </label>
          <FormRow cols={2}>
            <Select label="Cliente" value={form.client_id} onChange={e => {
              f('client_id', e.target.value)
              const cl = clients.find(c => String(c.id) === e.target.value)
              if (cl?.phone) f('wa_phone', cl.phone)
            }}>
              <option value="">— nenhum —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Responsável" value={form.seller_id} onChange={e => f('seller_id', e.target.value)}>
              <option value="">— nenhum —</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormRow>
          <Textarea label="Descrição" value={form.description} onChange={e => f('description', e.target.value)} rows={2}/>

          {/* WhatsApp */}
          <div style={{ padding:14, background:'rgba(34,197,94,.05)', border:'1px solid rgba(34,197,94,.15)', borderRadius:10 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:600, color:'#22c55e', cursor:'pointer', marginBottom: form.wa_scheduled ? 12 : 0 }}>
              <input type="checkbox" checked={form.wa_scheduled} onChange={e => f('wa_scheduled', e.target.checked)}/>
              <MessageSquare size={15}/> Agendar WhatsApp
            </label>
            {form.wa_scheduled && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <FormRow cols={2}>
                  <Input label="Telefone" value={form.wa_phone} onChange={e => f('wa_phone', e.target.value)} placeholder="11999999999"/>
                  <Input label="Data/Hora do envio" type="datetime-local" value={form.wa_send_at} onChange={e => f('wa_send_at', e.target.value)}/>
                </FormRow>
                <Select label="Template" value={form.wa_template} onChange={e => handleTemplatePick(e.target.value)}>
                  <option value="">Escolher template...</option>
                  {WA_TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <Textarea label="Mensagem" value={form.wa_message} onChange={e => f('wa_message', e.target.value)} rows={3}
                  placeholder="Use {nome} para nome do cliente"/>
                {form.wa_message && (
                  <div style={{ padding:10, background:'var(--bg-card2)', borderRadius:8, fontSize:'.8rem' }}>
                    <div style={{ fontSize:'.7rem', color:'var(--muted)', marginBottom:4 }}>Preview:</div>
                    <div style={{ color:'var(--text)', lineHeight:1.4 }}>{form.wa_message}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ─── Sub Components ─── */

function MiniKpi({ icon, label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'var(--bg-card)',
      borderRadius:10, border:'1px solid var(--border)' }}>
      <div style={{ color, display:'flex' }}>{icon}</div>
      <div>
        <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text)' }}>{value}</div>
        <div style={{ fontSize:'.7rem', color:'var(--muted)' }}>{label}</div>
      </div>
    </div>
  )
}
function ToolBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 10px', borderRadius:6,
      border:'none', cursor:'pointer', fontSize:'.78rem', fontWeight:600,
      background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--muted)',
      transition:'all .15s' }}>
      {icon}{label}
    </button>
  )
}

function MonthView({ days, activitiesByDate, isToday, isSelected, selectedDate, onSelectDate, onClickDay, filterType,
  dragId, setDragId, moveEvent, onClickEvent }) {
  return (
    <Card style={{ padding:0, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ padding:'8px 4px', fontSize:'.7rem', fontWeight:700, color:'var(--muted)',
            textTransform:'uppercase', letterSpacing:'.06em', textAlign:'center', background:'var(--bg-card2)',
            borderRight:'1px solid var(--border)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {days.map(({ date, current }, i) => {
          const key = toDateKey(date)
          let dayActs = activitiesByDate[key] || []
          if (filterType) dayActs = dayActs.filter(a => (a.event_type || a.type) === filterType)
          const sel = isSelected(date)
          const todayCell = isToday(date)
          return (
            <div key={i} onClick={() => onSelectDate(key)}
              onDoubleClick={() => onClickDay(key)}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'rgba(168,85,247,.2)' }}
              onDragLeave={e => { e.currentTarget.style.background = sel ? 'rgba(168,85,247,.12)' : 'var(--bg-card)' }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.background = sel ? 'rgba(168,85,247,.12)' : 'var(--bg-card)'; if (dragId) { moveEvent(dragId, key); setDragId(null) } }}
              style={{ minHeight:88, borderBottom:'1px solid var(--border)', borderRight: (i+1)%7!==0 ? '1px solid var(--border)' : 'none',
                background: sel ? 'rgba(168,85,247,.12)' : 'var(--bg-card)', padding:'6px 6px 4px', cursor:'pointer',
                opacity: current ? 1 : .4, transition:'background .12s', position:'relative' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:'.82rem', fontWeight: todayCell ? 800 : 500, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center',
                  borderRadius:'50%', background: todayCell ? 'var(--primary)' : 'transparent', color: todayCell ? '#fff' : 'var(--text)' }}>
                  {date.getDate()}
                </span>
                {dayActs.length > 0 && (
                  <span style={{ fontSize:'.65rem', color:'var(--muted)', fontWeight:600 }}>{dayActs.length}</span>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {dayActs.slice(0, 2).map(a => {
                  const et = EVENT_TYPES[a.event_type || a.type] || EVENT_TYPES.task
                  return (
                    <div key={a.id} draggable
                      onDragStart={e => { e.stopPropagation(); setDragId(a.id) }}
                      onClick={e => { e.stopPropagation(); onClickEvent(a) }}
                      style={{ display:'flex', alignItems:'center', gap:3, padding:'1px 4px', borderRadius:4,
                        background: a.done ? 'rgba(107,114,128,.15)' : `${et.color}18`, cursor:'grab',
                        fontSize:'.68rem', color: a.done ? 'var(--muted)' : et.color, fontWeight:500,
                        overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis',
                        textDecoration: a.done ? 'line-through' : 'none', borderLeft:`2px solid ${et.color}` }}>
                      <span>{a.due_date ? toTimeStr(a.due_date) : ''}</span>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{a.title}</span>
                    </div>
                  )
                })}
                {dayActs.length > 2 && (
                  <span style={{ fontSize:'.62rem', color:'var(--primary)', fontWeight:600, paddingLeft:4 }}>+{dayActs.length - 2} mais</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ListView({ activities, onClickEvent, onDone }) {
  const grouped = useMemo(() => {
    const map = {}
    activities.forEach(a => {
      const key = a.due_date ? toDateKey(new Date(a.due_date)) : 'sem-data'
      if (!map[key]) map[key] = []
      map[key].push(a)
    })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
  }, [activities])
  const todayKey = toDateKey(new Date())
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {grouped.length === 0 && <Card><p style={{ color:'var(--muted)', fontSize:'.85rem', textAlign:'center', padding:20 }}>Nenhum evento encontrado</p></Card>}
      {grouped.map(([dateKey, evts]) => (
        <Card key={dateKey} style={{ padding:0 }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8,
            background: dateKey === todayKey ? 'rgba(99,102,241,.08)' : 'var(--bg-card2)' }}>
            <span style={{ fontWeight:700, fontSize:'.85rem', color: dateKey === todayKey ? 'var(--primary)' : 'var(--text)' }}>
              {dateKey === 'sem-data' ? 'Sem data' : fmt.date(dateKey)}
            </span>
            {dateKey === todayKey && <Badge color="var(--primary)" size="xs">Hoje</Badge>}
            <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>{evts.length} evento(s)</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {evts.map(a => <EventRow key={a.id} event={a} onClick={() => onClickEvent(a)} onDone={onDone} showDate={false}/>)}
          </div>
        </Card>
      ))}
    </div>
  )
}

function EventRow({ event, onClick, onDone, showDate = true }) {
  const et = EVENT_TYPES[event.event_type || event.type] || EVENT_TYPES.task
  const isPast = event.due_date && new Date(event.due_date) < new Date() && !event.done
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', cursor:'pointer',
      borderBottom:'1px solid var(--border)', transition:'background .12s', opacity: event.done ? .6 : 1 }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ width:4, height:36, borderRadius:2, background: event.done ? '#6b7280' : et.color, flexShrink:0 }}/>
      <span style={{ fontSize:'1.1rem', flexShrink:0 }}>{et.icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <span style={{ fontWeight:600, fontSize:'.85rem', color:'var(--text)', textDecoration: event.done ? 'line-through' : 'none' }}>{event.title}</span>
          {event.wa_scheduled && <span style={{ fontSize:'.7rem', color:'#22c55e' }}>💬</span>}
          {event.order_number && <span style={{ fontSize:'.68rem', color:'var(--primary)', fontWeight:500 }}>Ped #{event.order_number}</span>}
          {isPast && <Badge color="#ef4444" size="xs">Atrasado</Badge>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', fontSize:'.75rem', color:'var(--muted)', marginTop:2 }}>
          {event.due_date && <span>{toTimeStr(event.due_date)}</span>}
          {event.client_name && <span>{event.client_name}</span>}
          {event.seller_name && <span>{event.seller_name}</span>}
        </div>
      </div>
      {!event.done && (
        <button onClick={e => { e.stopPropagation(); onDone(event.id) }} title="Concluir"
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4, borderRadius:4,
            transition:'color .15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#10b981'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
          <CheckCircle2 size={18}/>
        </button>
      )}
      {event.done && <CheckCircle2 size={18} style={{ color:'#10b981', flexShrink:0 }}/>}
    </div>
  )
}

function UpcomingRow({ event, onClick, onDone, onWaSend }) {
  const et = EVENT_TYPES[event.event_type || event.type] || EVENT_TYPES.task
  const todayKey = toDateKey(new Date())
  const evtKey = event.due_date ? toDateKey(new Date(event.due_date)) : ''
  const isToday = evtKey === todayKey
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = evtKey === toDateKey(tomorrow)
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer',
      borderBottom:'1px solid var(--border)', transition:'background .12s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ width:3, height:32, borderRadius:2, background: et.color, flexShrink:0 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span style={{ fontSize:'.8rem' }}>{et.icon}</span>
          <span style={{ fontWeight:600, fontSize:'.8rem', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.title}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.7rem', color:'var(--muted)' }}>
          {event.due_date && <span>{toTimeStr(event.due_date)}</span>}
          {isToday && <Badge color="var(--primary)" size="xs">Hoje</Badge>}
          {isTomorrow && <Badge color="#f59e0b" size="xs">Amanhã</Badge>}
          {!isToday && !isTomorrow && event.due_date && <span>{fmt.date(event.due_date)}</span>}
          {event.client_name && <span>{event.client_name}</span>}
        </div>
      </div>
      <div style={{ display:'flex', gap:2, flexShrink:0 }}>
        {!event.done && (
          <button onClick={e => { e.stopPropagation(); onDone(event.id) }} title="Concluir"
            style={iconBtnStyle}><CheckCircle2 size={15}/></button>
        )}
        {event.wa_scheduled && event.wa_status !== 'sent' && (
          <button onClick={e => { e.stopPropagation(); onWaSend(event.id) }} title="Enviar WhatsApp"
            style={{ ...iconBtnStyle, color:'#22c55e' }}><Send size={15}/></button>
        )}
      </div>
    </div>
  )
}

/* ─── Styles ─── */
const navBtnStyle = { background:'none', border:'none', cursor:'pointer', color:'var(--text)', padding:4, borderRadius:6,
  display:'flex', alignItems:'center' }
const selectStyle = { padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card)',
  color:'var(--text)', fontSize:'.8rem', outline:'none', cursor:'pointer' }
const inputStyle  = { padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card)',
  color:'var(--text)', fontSize:'.8rem', outline:'none', width:'100%', boxSizing:'border-box' }
const iconBtnStyle = { background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:3, borderRadius:4,
  display:'flex', alignItems:'center' }
