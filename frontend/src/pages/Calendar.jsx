/**
 * Agenda: calendário mensal de eventos e atividades.
 */
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, Plus, List, Grid3X3, ChevronLeft, ChevronRight, Clock,
  CheckCircle2, Send, Phone, MessageSquare, AlertTriangle, Trash2, Edit3, X,
  RotateCcw, ExternalLink, Search } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Btn, Badge, Spinner, Modal, Input, Select, Textarea, FormRow, fmt, Autocomplete } from '../components/UI'

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
function parseDateValue(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(value)
}
function toParsedDateKey(value) {
  const parsed = parseDateValue(value)
  return parsed ? toDateKey(parsed) : ''
}
function compareDateValues(a, b) {
  const left = parseDateValue(a)?.getTime() || 0
  const right = parseDateValue(b)?.getTime() || 0
  return left - right
}
function isPastDateValue(value) {
  const parsed = parseDateValue(value)
  return !!parsed && parsed < new Date()
}
function toTimeStr(d) {
  const parsed = parseDateValue(d)
  return parsed ? parsed.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : ''
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
  client_id:'', client_label:'', lead_id:'', order_id:'', transaction_id:'', seller_id:'', seller_label:'', priority:'normal', color:'',
  wa_scheduled:false, wa_send_at:'', wa_phone:'', wa_message:'', wa_template:'',
}

/* ─── Event Drawer ─── */
function EventDrawer({ event, onClose, onSave, onDelete, onDone, onReopen, onWaSend, clients, sellers }) {
  if (!event) return null
  const et = EVENT_TYPES[event.event_type||event.type] || EVENT_TYPES.task
  const isPast = event.due_date && isPastDateValue(event.due_date) && !event.done
  return (
    <div onClick={e => e.stopPropagation()} style={{ position:'fixed', inset:'0 0 0 auto', width:'min(420px, 100vw)', maxWidth:'100vw',
      height:'100vh', maxHeight:'100dvh', overflow:'hidden', background:'var(--bg-card)', boxShadow:'-4px 0 24px rgba(0,0,0,.15)', zIndex:1100,
      display:'grid', gridTemplateRows:'auto minmax(0, 1fr) auto', borderLeft:'1px solid var(--border)' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:'1.4rem' }}>{et.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:'.95rem', color:'var(--text)' }}>{event.title}</div>
          <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{et.label}</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}><X size={20}/></button>
      </div>
      <div style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
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
      <div style={{ padding:'14px 20px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop:'1px solid var(--border)', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:8, background:'var(--bg-card)', boxShadow:'0 -10px 24px rgba(0,0,0,.18)' }}>
        {!event.done && <Btn size="sm" onClick={() => onDone(event.id)} icon={<CheckCircle2 size={14}/>} style={{ width:'100%', justifyContent:'center' }}>Concluir</Btn>}
        {event.done && <Btn size="sm" variant="ghost" onClick={() => onReopen(event.id)} icon={<RotateCcw size={14}/>} style={{ width:'100%', justifyContent:'center' }}>Reabrir</Btn>}
        {event.wa_scheduled && event.wa_status !== 'sent' && (
          <Btn size="sm" variant="ghost" onClick={() => onWaSend(event.id)} icon={<Send size={14}/>} style={{ width:'100%', justifyContent:'center', color:'#22c55e' }}>Enviar WA</Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={() => onSave(event)} icon={<Edit3 size={14}/>} style={{ width:'100%', justifyContent:'center' }}>Editar</Btn>
        <Btn size="sm" variant="ghost" onClick={() => onDelete(event.id)} icon={<Trash2 size={14}/>} style={{ width:'100%', justifyContent:'center', color:'#ef4444' }}>Excluir</Btn>
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

  useEffect(() => {
    if (!drawerEvent) return undefined
    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBodyOverflow
      document.documentElement.style.overflow = prevHtmlOverflow
    }
  }, [drawerEvent])

  const activitiesByDate = useMemo(() => activities.reduce((acc, a) => {
    const key = toParsedDateKey(a.due_date)
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
    return list.sort((a, b) => compareDateValues(a.due_date, b.due_date))
  }, [activities, filterType, filterSearch])

  const selectedActivities = useMemo(() => {
    let list = activitiesByDate[selectedDate] || []
    if (filterType) list = list.filter(a => (a.event_type || a.type) === filterType)
    return list.sort((a, b) => compareDateValues(a.due_date, b.due_date))
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
      client_label: evt.client_name || '',
      lead_id: evt.lead_id || '',
      order_id: evt.order_id || '',
      transaction_id: evt.transaction_id || '',
      seller_id: evt.seller_id || '',
      seller_label: evt.seller_name || '',
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
    if (!form.title) return toast.error('Título é obrigatório')
    setSaving(true)
    try {
      const body = { ...form }
      if (!body.client_id) body.client_id = null
      if (!body.seller_id) body.seller_id = null
      if (!body.order_id) body.order_id = null
      if (!body.wa_send_at) body.wa_send_at = null
      body.type = body.event_type
      if (editId) await api.put(`/activities/${editId}`, body)
      else await api.post('/activities', body)
      toast.success(editId ? 'Evento atualizado' : 'Evento criado')
      setModal(false)
      await loadAll()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const markDone = async (id) => {
    try {
      await api.patch(`/activities/${id}/done`)
      toast.success('Concluído!')
      setDrawerEvent(null)
      await loadAll()
    } catch {
      toast.error('Erro')
    }
  }
  const reopen = async (id) => {
    try {
      await api.patch(`/activities/${id}/reopen`)
      toast.success('Reaberto')
      setDrawerEvent(null)
      await loadAll()
    } catch {
      toast.error('Erro')
    }
  }
  const del = async (id) => {
    if (!confirm('Excluir este evento?')) return
    try {
      await api.delete(`/activities/${id}`)
      toast.success('Excluído')
      setDrawerEvent(null)
      await loadAll()
    } catch {
      toast.error('Erro')
    }
  }
  const sendWa = async (id) => {
    try {
      await api.post(`/activities/${id}/wa-send`)
      toast.success('WhatsApp enviado!')
      await loadAll()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar')
    }
  }
  const moveEvent = async (id, newDate) => {
    try {
      await api.patch(`/activities/${id}/move`, { due_date: `${newDate}T09:00:00` })
      await loadAll()
    } catch {
      toast.error('Erro ao mover')
    }
  }

  const handleTemplatePick = (tplVal) => {
    const tpl = WA_TEMPLATES.find(t => t.value === tplVal)
    const clientName = form.client_label || '{nome}'
    setForm(prev => ({
      ...prev,
      wa_template: tplVal,
      wa_message: tpl ? tpl.text.replace('{nome}', clientName) : prev.wa_message,
      wa_phone: prev.wa_phone || '',
    }))
  }

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const kpis = useMemo(() => {
    const todayKey = toDateKey(today)
    const todayCount = (activitiesByDate[todayKey] || []).filter(a => !a.done).length
    const overdue = activities.filter(a => !a.done && a.due_date && isPastDateValue(a.due_date)).length
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
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:0, background:'var(--bg-card2)', borderRadius:10, padding:3, border:'1px solid var(--border)', boxShadow:'0 2px 8px rgba(0,0,0,.15)' }}>
          <ToolBtn active={view==='month'} onClick={() => setView('month')} icon={<Grid3X3 size={15}/>} label="Mês"/>
          <ToolBtn active={view==='list'}  onClick={() => setView('list')}  icon={<List size={15}/>} label="Lista"/>
        </div>
        <Btn size="sm" variant="outline" onClick={goToday} style={{ borderStyle:'dashed' }}>Hoje</Btn>
        <div style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', background:'var(--bg-card2)', borderRadius:10, border:'1px solid var(--border)' }}>
          <button onClick={prevMonth} style={navBtnStyle} title="Mês anterior"><ChevronLeft size={18}/></button>
          <span style={{ fontWeight:800, fontSize:'1.05rem', color:'var(--text)', minWidth:150, textAlign:'center', letterSpacing:'-.02em' }}>
            {MONTH_NAMES[month-1]} {year}
          </span>
          <button onClick={nextMonth} style={navBtnStyle} title="Próximo mês"><ChevronRight size={18}/></button>
        </div>
        <div style={{ flex:1 }}/>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="">Todos os tipos</option>
          {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <div style={{ position:'relative', flex:'0 1 220px' }}>
          <Search size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
          <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buscar evento..."
            style={{ ...inputStyle, paddingLeft:36, borderRadius:10 }}/>
        </div>
      </div>

      {loading ? <Spinner text="Carregando agenda..."/> : (
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {/* Calendário + lista do dia (sem painel lateral fixo) */}
          <div style={{ minWidth: 0 }}>
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
              <Card style={{ marginTop:18, padding:0, boxShadow:'0 4px 20px rgba(0,0,0,.2)', border:'1px solid var(--border)' }}>
                <div style={{
                  padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between',
                  background:'linear-gradient(135deg, rgba(168,85,247,.08) 0%, transparent 100%)',
                }}>
                  <h3 style={{ fontWeight:800, fontSize:'1rem', color:'var(--text)', margin:0, letterSpacing:'-.02em' }}>
                    {fmt.date(selectedDate)} — {selectedActivities.length} evento{selectedActivities.length !== 1 ? 's' : ''}
                  </h3>
                  <Btn size="sm" variant="primary" onClick={() => openNew(selectedDate)} icon={<Plus size={14}/>}>Novo</Btn>
                </div>
                {selectedActivities.length === 0 ? (
                  <p style={{ color:'var(--muted)', fontSize:'.85rem', padding:'32px 20px', textAlign:'center' }}>Nenhum evento neste dia</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column' }}>
                    {selectedActivities.map(a => <EventRow key={a.id} event={a} onClick={() => setDrawerEvent(a)} onDone={markDone}/>)}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Event Drawer */}
      {drawerEvent && createPortal(
        <>
          <div onClick={() => setDrawerEvent(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', zIndex:1099 }}/>
          <EventDrawer event={drawerEvent} onClose={() => setDrawerEvent(null)}
            onSave={openEdit} onDelete={del} onDone={markDone} onReopen={reopen} onWaSend={sendWa}
            clients={clients} sellers={sellers}/>
        </>,
        document.body
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
            <Autocomplete label="Cliente" value={{ label: form.client_label }}
              fetchFn={q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r => r.data)}
              onSelect={c => { f('client_id', c.id); f('client_label', c.name); if (c.phone) f('wa_phone', c.phone) }}
              renderOption={c => (<div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{[c.document, c.phone].filter(Boolean).join(' · ')}</div></div>)}
              placeholder="Buscar cliente..."
            />
            <Autocomplete label="Responsável" value={{ label: form.seller_label }}
              fetchFn={q => api.get(`/sellers/search?q=${encodeURIComponent(q)}`).then(r => r.data)}
              onSelect={s => { f('seller_id', s.id); f('seller_label', s.name) }}
              renderOption={s => (<div><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{[s.email, s.phone].filter(Boolean).join(' · ')}</div></div>)}
              placeholder="Buscar vendedor..."
            />
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
    <div style={{
      display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
      background:'var(--bg-card)', borderRadius:12, border:'1px solid var(--border)',
      boxShadow:'0 2px 8px rgba(0,0,0,.2)', transition:'all .2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}20` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.2)' }}>
      <div style={{ width:40, height:40, borderRadius:10, background:`${color}20`, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0 }}>
        {icon}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--text)', letterSpacing:'-.02em' }}>{value}</div>
        <div style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:500, marginTop:1 }}>{label}</div>
      </div>
    </div>
  )
}
function ToolBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8,
      border:'none', cursor:'pointer', fontSize:'.8rem', fontWeight:600,
      background: active ? 'var(--primary)' : 'transparent',
      color: active ? '#fff' : 'var(--muted)',
      boxShadow: active ? '0 2px 12px rgba(168,85,247,.35)' : 'none',
      transition:'all .2s',
    }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-hover)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' } }}>
      {icon}{label}
    </button>
  )
}

function MonthView({ days, activitiesByDate, isToday, isSelected, selectedDate, onSelectDate, onClickDay, filterType,
  dragId, setDragId, moveEvent, onClickEvent }) {
  return (
    <Card style={{ padding:0, overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,.25)', border:'1px solid var(--border)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)', background:'var(--bg-card2)' }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ padding:'10px 4px', fontSize:'.7rem', fontWeight:700, color:'var(--muted)',
            textTransform:'uppercase', letterSpacing:'.08em', textAlign:'center',
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
              onDragLeave={e => { e.currentTarget.style.background = sel ? 'rgba(168,85,247,.1)' : 'var(--bg-card)' }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.background = sel ? 'rgba(168,85,247,.1)' : 'var(--bg-card)'; if (dragId) { moveEvent(dragId, key); setDragId(null) } }}
              style={{
                minHeight:100, borderBottom:'1px solid var(--border)', borderRight: (i+1)%7!==0 ? '1px solid var(--border)' : 'none',
                background: sel ? 'rgba(168,85,247,.1)' : 'var(--bg-card)', padding:'8px 8px 6px', cursor:'pointer',
                opacity: current ? 1 : .45, transition:'background .15s', position:'relative', minWidth:0,
              }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{
                  fontSize:'.85rem', fontWeight: todayCell ? 800 : 600, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
                  borderRadius:8, background: todayCell ? 'var(--primary)' : (sel ? 'rgba(168,85,247,.2)' : 'transparent'),
                  color: todayCell ? '#fff' : 'var(--text)', boxShadow: todayCell ? '0 2px 8px rgba(168,85,247,.4)' : 'none',
                }}>
                  {date.getDate()}
                </span>
                {dayActs.length > 0 && (
                  <span style={{ fontSize:'.65rem', color:'var(--muted)', fontWeight:700, background:'var(--bg-card2)', padding:'2px 6px', borderRadius:6 }}>
                    {dayActs.length}
                  </span>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:0, overflow:'visible' }}>
                {dayActs.slice(0, 2).map(a => {
                  const et = EVENT_TYPES[a.event_type || a.type] || EVENT_TYPES.task
                  return (
                    <div key={a.id} draggable
                      onDragStart={e => { e.stopPropagation(); setDragId(a.id) }}
                      onClick={e => { e.stopPropagation(); onSelectDate(key); onClickEvent(a) }}
                      style={{
                        display:'flex', alignItems:'center', gap:4, padding:'5px 6px', borderRadius:6,
                        background: a.done ? 'rgba(107,114,128,.12)' : `${et.color}22`,
                        cursor:'grab', fontSize:'.7rem', color: a.done ? 'var(--muted)' : et.color,
                        fontWeight:500, minHeight:24, lineHeight:1.2,
                        textDecoration: a.done ? 'line-through' : 'none',
                        borderLeft:`3px solid ${et.color}`, boxShadow:'0 1px 3px rgba(0,0,0,.15)',
                        transition:'box-shadow .15s', minWidth:0, overflow:'hidden',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,.25)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.15)' }}
                      title={`${a.due_date ? toTimeStr(a.due_date) + ' — ' : ''}${a.title}`}>
                      <span style={{ flexShrink:0, minWidth:32 }}>{a.due_date ? toTimeStr(a.due_date) : ''}</span>
                      <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</span>
                    </div>
                  )
                })}
                {dayActs.length > 2 && (
                  <div
                    onClick={e => { e.stopPropagation(); onSelectDate(key) }}
                    style={{ fontSize:'.7rem', color:'var(--primary)', fontWeight:700, padding:'4px 6px', borderRadius:6,
                      background:'rgba(168,85,247,.15)', cursor:'pointer', transition:'background .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,.15)' }}
                  >
                    +{dayActs.length - 2} mais
                  </div>
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
      const key = a.due_date ? toParsedDateKey(a.due_date) : 'sem-data'
      if (!map[key]) map[key] = []
      map[key].push(a)
    })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
  }, [activities])
  const todayKey = toDateKey(new Date())
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {grouped.length === 0 && (
        <Card style={{ boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
          <p style={{ color:'var(--muted)', fontSize:'.88rem', textAlign:'center', padding:40 }}>Nenhum evento encontrado</p>
        </Card>
      )}
      {grouped.map(([dateKey, evts]) => (
        <Card key={dateKey} style={{ padding:0, boxShadow:'0 4px 20px rgba(0,0,0,.2)', border:'1px solid var(--border)' }}>
          <div style={{
            padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10,
            background: dateKey === todayKey ? 'linear-gradient(135deg, rgba(168,85,247,.15) 0%, transparent 100%)' : 'var(--bg-card2)',
          }}>
            <span style={{ fontWeight:800, fontSize:'.95rem', color: dateKey === todayKey ? 'var(--primary)' : 'var(--text)', letterSpacing:'-.02em' }}>
              {dateKey === 'sem-data' ? 'Sem data' : fmt.date(dateKey)}
            </span>
            {dateKey === todayKey && <Badge color="var(--primary)" size="xs">Hoje</Badge>}
            <span style={{ fontSize:'.72rem', color:'var(--muted)', fontWeight:500 }}>{evts.length} evento{evts.length !== 1 ? 's' : ''}</span>
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
  const isPast = event.due_date && isPastDateValue(event.due_date) && !event.done
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:12, padding:'12px 18px', cursor:'pointer',
      borderBottom:'1px solid var(--border)', transition:'background .15s', opacity: event.done ? .7 : 1,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ width:4, height:40, borderRadius:2, background: event.done ? '#6b7280' : et.color, flexShrink:0 }}/>
      <div style={{ width:36, height:36, borderRadius:8, background:`${et.color}22`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span style={{ fontSize:'1rem' }}>{et.icon}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <span style={{ fontWeight:600, fontSize:'.9rem', color:'var(--text)', textDecoration: event.done ? 'line-through' : 'none' }}>{event.title}</span>
          {event.wa_scheduled && <span style={{ fontSize:'.7rem', color:'#22c55e' }}>💬</span>}
          {event.order_number && <span style={{ fontSize:'.68rem', color:'var(--primary)', fontWeight:600 }}>Ped #{event.order_number}</span>}
          {isPast && <Badge color="#ef4444" size="xs">Atrasado</Badge>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', fontSize:'.75rem', color:'var(--muted)', marginTop:3 }}>
          {event.due_date && <span>{toTimeStr(event.due_date)}</span>}
          {event.client_name && <span>{event.client_name}</span>}
          {event.seller_name && <span>{event.seller_name}</span>}
        </div>
      </div>
      {!event.done && (
        <button onClick={e => { e.stopPropagation(); onDone(event.id) }} title="Concluir"
          style={{ background:'rgba(16,185,129,.1)', border:'none', cursor:'pointer', color:'#10b981', padding:6, borderRadius:8, transition:'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,.2)'; e.currentTarget.style.transform = 'scale(1.05)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,.1)'; e.currentTarget.style.transform = 'scale(1)' }}>
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
  const evtKey = event.due_date ? toParsedDateKey(event.due_date) : ''
  const isToday = evtKey === todayKey
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = evtKey === toDateKey(tomorrow)
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10, padding:'12px 14px', marginBottom:6, cursor:'pointer',
      borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-card2)',
      transition:'all .15s', boxShadow:'0 1px 4px rgba(0,0,0,.1)',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.1)' }}>
      <div style={{ width:4, height:40, borderRadius:2, background: et.color, flexShrink:0 }}/>
      <div style={{ width:34, height:34, borderRadius:8, background:`${et.color}22`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span style={{ fontSize:'.9rem' }}>{et.icon}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap' }}>
          <span style={{ fontWeight:600, fontSize:'.85rem', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis' }}>{event.title}</span>
          {isToday && <Badge color="var(--primary)" size="xs">Hoje</Badge>}
          {isTomorrow && <Badge color="#f59e0b" size="xs">Amanhã</Badge>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.72rem', color:'var(--muted)' }}>
          {event.due_date && <span>{toTimeStr(event.due_date)}</span>}
          {!isToday && !isTomorrow && event.due_date && <span>{fmt.date(event.due_date)}</span>}
          {event.client_name && <span>{event.client_name}</span>}
        </div>
      </div>
      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
        {!event.done && (
          <button onClick={e => { e.stopPropagation(); onDone(event.id) }} title="Concluir"
            style={{ ...iconBtnStyle, color:'#10b981', background:'rgba(16,185,129,.1)', padding:6, borderRadius:8 }}>
            <CheckCircle2 size={16}/>
          </button>
        )}
        {event.wa_scheduled && event.wa_status !== 'sent' && (
          <button onClick={e => { e.stopPropagation(); onWaSend(event.id) }} title="Enviar WhatsApp"
            style={{ ...iconBtnStyle, color:'#22c55e', background:'rgba(34,197,94,.1)', padding:6, borderRadius:8 }}>
            <Send size={16}/>
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Styles ─── */
const navBtnStyle = {
  background:'var(--bg-hover)', border:'none', cursor:'pointer', color:'var(--text)', padding:6, borderRadius:8,
  display:'flex', alignItems:'center', transition:'all .15s',
}
const selectStyle = {
  padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-card2)',
  color:'var(--text)', fontSize:'.82rem', outline:'none', cursor:'pointer', minWidth:140,
}
const inputStyle = {
  padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-card2)',
  color:'var(--text)', fontSize:'.82rem', outline:'none', width:'100%', boxSizing:'border-box',
}
const iconBtnStyle = {
  background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:3, borderRadius:6,
  display:'flex', alignItems:'center', transition:'all .15s',
}
