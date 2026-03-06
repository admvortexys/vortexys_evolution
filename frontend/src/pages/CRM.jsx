/**
 * CRM: Kanban de leads por pipeline. Criar/editar lead, atividades, ganhar/perder.
 * Filtros por origem, responsável, valor. Automações em backend ao criar/atualizar.
 */
import { useEffect, useState, useMemo } from 'react'
import { Target, Filter, Settings } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Btn, Modal, Input, Select, Badge, Spinner, fmt, Autocomplete } from '../components/UI'

const actTypes = { call:'📞 Ligação', email:'📧 E-mail', meeting:'🤝 Reunião', note:'📝 Nota', task:'✅ Tarefa', visit:'🏠 Visita', demo:'💻 Demo', followup:'🔄 Follow-up' }
const eventIcons = { created:'🟢', moved:'➡️', won:'🏆', lost:'❌', converted:'👤', activity:'📌', proposal:'📋' }

export default function CRM() {
  const [board, setBoard]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detail, setDetail]     = useState(null)
  const [actModal, setActModal] = useState(false)
  const [lostModal, setLostModal] = useState(null)
  const [lostReason, setLostReason] = useState('')
  const [pipelines, setPipelines] = useState([])
  const [users, setUsers]       = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters]   = useState({ source:'', user_id:'', min_value:'', max_value:'' })
  const [form, setForm]         = useState({ name:'', company:'', email:'', phone:'', document:'', source:'', pipeline_id:'', estimated_value:'', probability:0, expected_close:'', notes:'' })
  const [actForm, setActForm]   = useState({ lead_id:'', type:'call', title:'', description:'', due_date:'' })
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState(null)
  const [drag, setDrag]         = useState(null)
  const [prodSearch, setProdSearch] = useState('')
  const [tab, setTab]           = useState('detail')
  const [autoModal, setAutoModal] = useState(false)
  const [automations, setAutomations] = useState([])
  const [autoForm, setAutoForm] = useState({ name:'', trigger:'lead_created', condition:{}, action:'create_activity', config:{}, active:true })
  const [autoEditId, setAutoEditId] = useState(null)
  const { toast, confirm } = useToast()

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.source) params.set('source', filters.source)
    if (filters.user_id) params.set('user_id', filters.user_id)
    if (filters.min_value) params.set('min_value', filters.min_value)
    if (filters.max_value) params.set('max_value', filters.max_value)
    Promise.all([
      api.get(`/leads/kanban?${params}`),
      api.get('/pipelines'),
      api.get('/users').catch(() => ({ data: [] }))
    ]).then(([b, p, u]) => {
      setBoard(b.data)
      setPipelines(p.data)
      setUsers(u.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setForm({ name:'', company:'', email:'', phone:'', document:'', source:'', pipeline_id: pipelines[0]?.id||'', estimated_value:'', probability:0, expected_close:'', notes:'' })
    setEditId(null); setModal(true)
  }

  const openDetail = async lead => {
    setDetail({ name: lead.name, loading: true })
    setTab('detail')
    try {
      const r = await api.get(`/leads/${lead.id}`)
      setDetail(r.data)
    } catch {
      toast.error('Erro ao carregar detalhes do lead')
      setDetail(null)
    }
  }

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/leads/${editId}`, form)
      else        await api.post('/leads', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const drop = async (e, pipelineId) => {
    e.preventDefault()
    if (!drag) return
    try {
      await api.patch(`/leads/${drag}/move`, { pipeline_id: pipelineId })
      load()
    } catch { toast.error('Erro ao mover lead') }
    setDrag(null)
  }

  const addActivity = async e => {
    e.preventDefault(); setSaving(true)
    try {
      await api.post('/activities', actForm)
      setActModal(false)
      const r = await api.get(`/leads/${actForm.lead_id}`)
      setDetail(r.data)
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const markDone = async (actId, leadId) => {
    await api.patch(`/activities/${actId}/done`)
    const r = await api.get(`/leads/${leadId}`)
    setDetail(r.data)
  }

  const wonLead = async id => {
    const targetPipe = pipelines.find(p => p.name.toLowerCase().includes('ganho'))
    await api.put(`/leads/${id}`, { ...detail, status: 'won', pipeline_id: targetPipe?.id || detail.pipeline_id })
    setDetail(null); load()
  }

  const lostLead = async () => {
    if (!lostModal) return
    const targetPipe = pipelines.find(p => p.name.toLowerCase().includes('perdido'))
    await api.put(`/leads/${lostModal}`, { ...detail, status: 'lost', lost_reason: lostReason, pipeline_id: targetPipe?.id || detail.pipeline_id })
    setLostModal(null); setLostReason(''); setDetail(null); load()
  }

  const convertToClient = async id => {
    try {
      const r = await api.post(`/leads/${id}/convert`)
      if (r.data.existing) toast.info('Lead já convertido em cliente')
      else toast.success('Lead convertido em cliente com sucesso!')
      const d = await api.get(`/leads/${id}`)
      setDetail(d.data)
    } catch(err) { toast.error(err.response?.data?.error || 'Erro ao converter') }
  }

  const addProduct = async (leadId, product) => {
    try {
      await api.post(`/leads/${leadId}/products`, { product_id: product.id })
      const r = await api.get(`/leads/${leadId}`)
      setDetail(r.data)
      setProdSearch('')
    } catch(err) { toast.error(err.response?.data?.error || 'Erro') }
  }

  const removeProduct = async (leadId, prodId) => {
    await api.delete(`/leads/${leadId}/products/${prodId}`)
    const r = await api.get(`/leads/${leadId}`)
    setDetail(r.data)
  }

  const f = v => setForm(p=>({...p,...v}))

  const loadAutomations = () => api.get('/automations').then(r => setAutomations(r.data))
  const openAutoModal = () => { loadAutomations(); setAutoModal(true); setAutoEditId(null); setAutoForm({ name:'', trigger:'lead_created', condition:{}, action:'create_activity', config:{}, active:true }) }
  const saveAutomation = async () => {
    if (!autoForm.name) return toast.error('Nome é obrigatório')
    try {
      if (autoEditId) await api.put(`/automations/${autoEditId}`, autoForm)
      else await api.post('/automations', autoForm)
      loadAutomations(); setAutoEditId(null); setAutoForm({ name:'', trigger:'lead_created', condition:{}, action:'create_activity', config:{}, active:true })
      toast.success('Automação salva!')
    } catch(err) { toast.error(err.response?.data?.error || 'Erro') }
  }
  const deleteAutomation = async id => {
    if (await confirm('Excluir automação?')) { await api.delete(`/automations/${id}`); loadAutomations() }
  }

  const triggerLabels = { lead_created:'Lead criado', lead_moved:'Lead movido', lead_won:'Lead ganho', lead_lost:'Lead perdido', activity_overdue:'Atividade atrasada' }
  const actionLabels = { move_pipeline:'Mover etapa', assign_user:'Atribuir responsável', create_activity:'Criar atividade', change_status:'Mudar status', notify:'Notificar' }

  const uniqueBoard = board.filter((col, idx, arr) => arr.findIndex(c => c.name === col.name) === idx)

  const hasFilters = filters.source || filters.user_id || filters.min_value || filters.max_value

  if (loading) return <Spinner/>

  return (
    <div>
      <PageHeader title="CRM — Funil de Vendas" subtitle="Gerencie leads e oportunidades" icon={Target} action={
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Btn variant="ghost" onClick={openAutoModal} title="Automações">
            <Settings size={14} style={{ marginRight:4 }}/> Automações
          </Btn>
          <Btn variant={hasFilters ? 'primary' : 'ghost'} onClick={()=>setShowFilters(!showFilters)}>
            <Filter size={14} style={{ marginRight:4 }}/> Filtros {hasFilters && '●'}
          </Btn>
          <Btn onClick={openNew}>+ Novo lead</Btn>
        </div>
      }/>

      {showFilters && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:16, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:'1 1 140px' }}>
            <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Origem</label>
            <select value={filters.source} onChange={e=>setFilters(p=>({...p,source:e.target.value}))}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'7px 10px', fontSize:'.85rem' }}>
              <option value="">Todas</option>
              {['Site','Indicação','WhatsApp','Instagram','LinkedIn','Prospecção','Outro'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex:'1 1 140px' }}>
            <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Responsável</label>
            <select value={filters.user_id} onChange={e=>setFilters(p=>({...p,user_id:e.target.value}))}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'7px 10px', fontSize:'.85rem' }}>
              <option value="">Todos</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ flex:'1 1 100px' }}>
            <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Valor min</label>
            <input type="number" value={filters.min_value} onChange={e=>setFilters(p=>({...p,min_value:e.target.value}))}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'7px 10px', fontSize:'.85rem' }} placeholder="0"/>
          </div>
          <div style={{ flex:'1 1 100px' }}>
            <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Valor max</label>
            <input type="number" value={filters.max_value} onChange={e=>setFilters(p=>({...p,max_value:e.target.value}))}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'7px 10px', fontSize:'.85rem' }} placeholder="999999"/>
          </div>
          <Btn size="sm" onClick={()=>{ load() }}>Aplicar</Btn>
          <Btn size="sm" variant="ghost" onClick={()=>{ setFilters({source:'',user_id:'',min_value:'',max_value:''}); setTimeout(load, 50) }}>Limpar</Btn>
        </div>
      )}

      {/* Kanban */}
      <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:12 }}>
        {uniqueBoard.map(col => (
          <div key={col.id}
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>drop(e,col.id)}
            style={{ minWidth:240, flex:'0 0 240px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ width:10, height:10, borderRadius:'50%', background:col.color, display:'inline-block' }}/>
                <span style={{ fontWeight:700, fontSize:'.88rem' }}>{col.name}</span>
              </div>
              <span style={{ fontSize:'.75rem', color:'var(--muted)', background:'var(--bg-card2)', padding:'2px 8px', borderRadius:99 }}>{col.leads.length}</span>
            </div>
            <div style={{ padding:10, display:'flex', flexDirection:'column', gap:8, minHeight:120 }}>
              {col.leads.map(lead => (
                <div key={lead.id}
                  draggable={lead.status === 'open'}
                  onDragStart={()=>lead.status === 'open' && setDrag(lead.id)}
                  onClick={()=>openDetail(lead)}
                  style={{
                    background: lead.status === 'won' ? 'rgba(16,185,129,.1)' : lead.status === 'lost' ? 'rgba(239,68,68,.08)' : 'var(--bg-card2)',
                    border: `1px solid ${lead.status === 'won' ? 'rgba(16,185,129,.3)' : lead.status === 'lost' ? 'rgba(239,68,68,.2)' : 'var(--border)'}`,
                    borderRadius:9, padding:'12px', cursor:'pointer', transition:'border-color .15s',
                    opacity: lead.status === 'lost' ? 0.7 : 1,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--primary)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=lead.status === 'won' ? 'rgba(16,185,129,.3)' : lead.status === 'lost' ? 'rgba(239,68,68,.2)' : 'var(--border)'}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontWeight:600, fontSize:'.88rem' }}>{lead.name}</span>
                    {lead.status !== 'open' && <span style={{ fontSize:'.65rem', fontWeight:700, color: lead.status === 'won' ? '#10b981' : '#ef4444' }}>{lead.status === 'won' ? '🏆' : '❌'}</span>}
                  </div>
                  {lead.company && <div style={{ fontSize:'.78rem', color:'var(--muted)', marginBottom:6 }}>🏢 {lead.company}</div>}
                  {lead.phone && <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>📱 {lead.phone}</div>}
                  {parseFloat(lead.estimated_value)>0 && (
                    <div style={{ fontSize:'.8rem', fontWeight:700, background:'var(--grad)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                      {fmt.brl(lead.estimated_value)}
                    </div>
                  )}
                  {lead.source === 'whatsapp' && <div style={{ fontSize:'.68rem', color:'#25d366', marginTop:4 }}>💬 WhatsApp</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* New/Edit lead modal */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar lead':'Novo lead'} width={560}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
            <Input label="Empresa" value={form.company} onChange={e=>f({company:e.target.value})}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="E-mail" type="email" value={form.email} onChange={e=>f({email:e.target.value})}/>
            <Input label="Telefone" value={form.phone} onChange={e=>f({phone:e.target.value})}/>
          </div>
          <Input label="CPF/CNPJ" value={form.document} onChange={e=>f({document:e.target.value})}/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Select label="Etapa" value={form.pipeline_id} onChange={e=>f({pipeline_id:e.target.value})}>
              {pipelines.filter((p,i,arr)=>arr.findIndex(x=>x.name===p.name)===i).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select label="Origem" value={form.source} onChange={e=>f({source:e.target.value})}>
              <option value="">Selecione...</option>
              {['Site','Indicação','WhatsApp','Instagram','LinkedIn','Prospecção','Outro'].map(s=><option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <Input label="Valor estimado (R$)" type="number" step="0.01" value={form.estimated_value} onChange={e=>f({estimated_value:e.target.value})}/>
            <Input label="Probabilidade %" type="number" min="0" max="100" value={form.probability} onChange={e=>f({probability:e.target.value})}/>
            <Input label="Previsão fechamento" type="date" value={form.expected_close} onChange={e=>f({expected_close:e.target.value})}/>
          </div>
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Observações</label>
            <textarea value={form.notes} onChange={e=>f({notes:e.target.value})} rows={2}
              style={{ width:'100%',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',padding:'9px 12px',fontSize:'.9rem',outline:'none',resize:'vertical' }}/>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Detail modal */}
      {detail && !detail.loading && (
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={detail.name} width={640}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Tabs */}
            <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
              {[{k:'detail',l:'Detalhes'},{k:'timeline',l:'Timeline'},{k:'products',l:'Produtos'},{k:'proposals',l:'Propostas'}].map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k)}
                  style={{ padding:'8px 16px', fontSize:'.82rem', fontWeight: tab===t.k?700:500, color: tab===t.k?'var(--primary)':'var(--muted)',
                    background:'transparent', border:'none', borderBottom: tab===t.k?'2px solid var(--primary)':'2px solid transparent',
                    cursor:'pointer', transition:'all .15s' }}>
                  {t.l}
                </button>
              ))}
            </div>

            {tab === 'detail' && <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {detail.company && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Empresa</div><div style={{ fontWeight:600 }}>{detail.company}</div></div>}
                {detail.phone   && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Telefone</div><div>{detail.phone}</div></div>}
                {detail.email   && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>E-mail</div><div>{detail.email}</div></div>}
                {detail.document && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>CPF/CNPJ</div><div>{detail.document}</div></div>}
                {parseFloat(detail.estimated_value)>0 && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Valor estimado</div><div style={{ fontWeight:700 }}>{fmt.brl(detail.estimated_value)}</div></div>}
                {detail.probability > 0 && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Probabilidade</div><div>{detail.probability}%</div></div>}
                {detail.expected_close && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Previsão fechamento</div><div>{fmt.date(detail.expected_close)}</div></div>}
                <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Etapa</div><div><Badge color="#8b5cf6">{detail.pipeline_name||'—'}</Badge></div></div>
                <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Responsável</div><div>{detail.user_name||'—'}</div></div>
                <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Origem</div><div>{detail.source||'—'}</div></div>
                <div>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Status</div>
                  <Badge color={detail.status==='won'?'#10b981':detail.status==='lost'?'#ef4444':'#6366f1'}>
                    {detail.status==='won'?'🏆 Ganho':detail.status==='lost'?'❌ Perdido':'🔵 Aberto'}
                  </Badge>
                </div>
                {detail.client_name && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Cliente vinculado</div><div style={{ fontWeight:600, color:'var(--primary)' }}>{detail.client_name}</div></div>}
              </div>

              {detail.notes && <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 12px', fontSize:'.88rem', color:'var(--muted)' }}>{detail.notes}</div>}
              {detail.lost_reason && <div style={{ background:'rgba(239,68,68,.08)', borderRadius:8, padding:'10px 12px', fontSize:'.88rem', color:'#ef4444' }}>Motivo da perda: {detail.lost_reason}</div>}

              {/* Activities */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <span style={{ fontWeight:700, fontSize:'.9rem' }}>Atividades</span>
                  <Btn size="sm" variant="ghost" onClick={()=>{setActForm({lead_id:detail.id,type:'call',title:'',description:'',due_date:''});setActModal(true)}}>+ Atividade</Btn>
                </div>
                {(detail.activities||[]).length === 0
                  ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhuma atividade registrada</p>
                  : (detail.activities||[]).map(a => (
                    <div key={a.id} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                      <span>{actTypes[a.type]?.split(' ')[0]}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'.88rem', fontWeight:600, textDecoration:a.done?'line-through':'' }}>{a.title}</div>
                        {a.description && <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{a.description}</div>}
                        {a.due_date && <div style={{ fontSize:'.75rem', color: !a.done && new Date(a.due_date) < new Date() ? '#ef4444' : 'var(--muted)' }}>📅 {fmt.date(a.due_date)}</div>}
                      </div>
                      {!a.done && <Btn size="sm" variant="success" onClick={()=>markDone(a.id,detail.id)}>✓</Btn>}
                    </div>
                  ))
                }
              </div>
            </>}

            {tab === 'timeline' && (
              <div>
                {(detail.events||[]).length === 0
                  ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhum evento registrado</p>
                  : (detail.events||[]).map(ev => (
                    <div key={ev.id} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--bg-card2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.8rem', flexShrink:0 }}>
                        {eventIcons[ev.type] || '📌'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'.88rem', fontWeight:600 }}>{ev.description}</div>
                        <div style={{ fontSize:'.72rem', color:'var(--muted)', display:'flex', gap:10, marginTop:2 }}>
                          <span>{ev.user_name || 'Sistema'}</span>
                          <span>{fmt.date(ev.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {tab === 'products' && (
              <div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:'.75rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Adicionar produto de interesse</label>
                  <Autocomplete
                    value={prodSearch}
                    onChange={setProdSearch}
                    onSelect={opt => addProduct(detail.id, opt)}
                    fetchFn={async q => { const r = await api.get(`/products/search?q=${q}`); return r.data }}
                    renderOption={p => `${p.sku} — ${p.name} (${fmt.brl(p.sale_price)})`}
                    placeholder="Buscar produto..."
                    clearOnSelect
                  />
                </div>
                {(detail.products||[]).length === 0
                  ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhum produto vinculado</p>
                  : (detail.products||[]).map(p => (
                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize:'.88rem', fontWeight:600 }}>{p.product_name || 'Produto'}</div>
                        <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{p.sku} — {fmt.brl(p.sale_price)} × {p.quantity}</div>
                      </div>
                      <Btn size="sm" variant="danger" onClick={()=>removeProduct(detail.id, p.id)}>✕</Btn>
                    </div>
                  ))
                }
              </div>
            )}

            {tab === 'proposals' && (
              <div>
                {(detail.proposals||[]).length === 0
                  ? <p style={{ color:'var(--muted)', fontSize:'.85rem' }}>Nenhuma proposta vinculada</p>
                  : (detail.proposals||[]).map(p => (
                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize:'.88rem', fontWeight:600 }}>{p.number} — {p.title}</div>
                        <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{fmt.brl(p.total)} • {fmt.date(p.created_at)}</div>
                      </div>
                      <Badge color={p.status==='approved'?'#10b981':p.status==='sent'?'#3b82f6':p.status==='rejected'?'#ef4444':'#6b7280'}>
                        {p.status==='draft'?'Rascunho':p.status==='sent'?'Enviada':p.status==='approved'?'Aprovada':'Rejeitada'}
                      </Badge>
                    </div>
                  ))
                }
              </div>
            )}

            <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'1px solid var(--border)', flexWrap:'wrap' }}>
              {detail.status === 'open' && <>
                <Btn variant="success" onClick={()=>wonLead(detail.id)}>🏆 Ganho</Btn>
                <Btn variant="danger" onClick={()=>{setLostModal(detail.id);setLostReason('')}}>❌ Perdido</Btn>
                {!detail.client_id && <Btn variant="ghost" onClick={()=>convertToClient(detail.id)}>👤 Converter em cliente</Btn>}
              </>}
              {detail.status !== 'open' && (
                <Btn variant="ghost" onClick={async ()=>{
                  const firstPipe = pipelines.find(p => !p.name.toLowerCase().includes('ganho') && !p.name.toLowerCase().includes('perdido'))
                  await api.put(`/leads/${detail.id}`, { ...detail, status:'open', pipeline_id: firstPipe?.id || detail.pipeline_id })
                  setDetail(null); load()
                }}>🔄 Reabrir</Btn>
              )}
              <Btn variant="ghost" onClick={()=>{setForm({...detail,pipeline_id:detail.pipeline_id});setEditId(detail.id);setDetail(null);setModal(true)}}>✏️ Editar</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Lost reason modal */}
      <Modal open={!!lostModal} onClose={()=>setLostModal(null)} title="Motivo da perda" width={420}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ color:'var(--muted)', fontSize:'.88rem' }}>Informe o motivo pelo qual este negócio foi perdido:</p>
          <Select label="Motivo" value={lostReason} onChange={e=>setLostReason(e.target.value)}>
            <option value="">Selecione ou digite abaixo...</option>
            <option value="Preço alto">Preço alto</option>
            <option value="Concorrência">Concorrência</option>
            <option value="Sem orçamento">Sem orçamento</option>
            <option value="Sem resposta">Sem resposta</option>
            <option value="Produto inadequado">Produto inadequado</option>
            <option value="Timing errado">Timing errado</option>
          </Select>
          <Input label="Ou descreva" value={lostReason} onChange={e=>setLostReason(e.target.value)} placeholder="Motivo personalizado..."/>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setLostModal(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={lostLead}>Confirmar perda</Btn>
          </div>
        </div>
      </Modal>

      {/* Automations modal */}
      <Modal open={autoModal} onClose={()=>setAutoModal(false)} title="Automações do CRM" width={640}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'var(--bg-card2)', borderRadius:10, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:'.9rem', marginBottom:4 }}>{autoEditId ? 'Editar automação' : 'Nova automação'}</div>
            <Input label="Nome *" value={autoForm.name} onChange={e=>setAutoForm(p=>({...p,name:e.target.value}))}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Select label="Quando (trigger)" value={autoForm.trigger} onChange={e=>setAutoForm(p=>({...p,trigger:e.target.value}))}>
                {Object.entries(triggerLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </Select>
              <Select label="Ação" value={autoForm.action} onChange={e=>setAutoForm(p=>({...p,action:e.target.value}))}>
                {Object.entries(actionLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            {autoForm.action === 'move_pipeline' && (
              <Select label="Para qual etapa?" value={autoForm.config.pipeline_id||''} onChange={e=>setAutoForm(p=>({...p,config:{...p.config,pipeline_id:e.target.value}}))}>
                <option value="">Selecione...</option>
                {pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
            {autoForm.action === 'assign_user' && (
              <Select label="Atribuir a" value={autoForm.config.user_id||''} onChange={e=>setAutoForm(p=>({...p,config:{...p.config,user_id:e.target.value}}))}>
                <option value="">Selecione...</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            )}
            {autoForm.action === 'create_activity' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <Input label="Título da atividade" value={autoForm.config.activity_title||''} onChange={e=>setAutoForm(p=>({...p,config:{...p.config,activity_title:e.target.value}}))}/>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <Select label="Tipo" value={autoForm.config.activity_type||'task'} onChange={e=>setAutoForm(p=>({...p,config:{...p.config,activity_type:e.target.value}}))}>
                    {Object.entries(actTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </Select>
                  <Input label="Prazo (dias)" type="number" value={autoForm.config.due_days||1} onChange={e=>setAutoForm(p=>({...p,config:{...p.config,due_days:e.target.value}}))}/>
                </div>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)' }}>Filtrar por origem:</label>
              <select value={autoForm.condition.source||''} onChange={e=>setAutoForm(p=>({...p,condition:{...p.condition,source:e.target.value||undefined}}))}
                style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', padding:'5px 8px', fontSize:'.82rem' }}>
                <option value="">Qualquer</option>
                {['Site','Indicação','WhatsApp','Instagram','LinkedIn','Prospecção'].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              {autoEditId && <Btn size="sm" variant="ghost" onClick={()=>{setAutoEditId(null);setAutoForm({name:'',trigger:'lead_created',condition:{},action:'create_activity',config:{},active:true})}}>Cancelar</Btn>}
              <Btn size="sm" onClick={saveAutomation}>{autoEditId ? 'Atualizar' : 'Criar automação'}</Btn>
            </div>
          </div>

          {automations.length > 0 && (
            <div>
              <div style={{ fontWeight:700, fontSize:'.9rem', marginBottom:8 }}>Automações ativas</div>
              {automations.map(a => (
                <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'.88rem' }}>{a.name}</div>
                    <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>
                      Quando: {triggerLabels[a.trigger]||a.trigger} → {actionLabels[a.action]||a.action}
                      {!a.active && <span style={{ color:'#ef4444', marginLeft:8 }}>(desativada)</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <Btn size="sm" variant="ghost" onClick={()=>{
                      setAutoEditId(a.id)
                      setAutoForm({ name:a.name, trigger:a.trigger, condition: typeof a.condition === 'string' ? JSON.parse(a.condition) : (a.condition||{}), action:a.action, config: typeof a.config === 'string' ? JSON.parse(a.config) : (a.config||{}), active:a.active })
                    }}>✏️</Btn>
                    <Btn size="sm" variant="danger" onClick={()=>deleteAutomation(a.id)}>🗑</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Activity modal */}
      <Modal open={actModal} onClose={()=>setActModal(false)} title="Nova atividade">
        <form onSubmit={addActivity} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Tipo" value={actForm.type} onChange={e=>setActForm(p=>({...p,type:e.target.value}))}>
            {Object.entries(actTypes).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </Select>
          <Input label="Título *" value={actForm.title} onChange={e=>setActForm(p=>({...p,title:e.target.value}))} required/>
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Descrição</label>
            <textarea value={actForm.description} onChange={e=>setActForm(p=>({...p,description:e.target.value}))} rows={2}
              style={{ width:'100%',background:'var(--bg-card2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',padding:'9px 12px',fontSize:'.9rem',outline:'none',resize:'vertical' }}/>
          </div>
          <Input label="Data prevista" type="datetime-local" value={actForm.due_date} onChange={e=>setActForm(p=>({...p,due_date:e.target.value}))}/>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setActModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
