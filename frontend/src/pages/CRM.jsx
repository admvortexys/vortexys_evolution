import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Btn, Modal, Input, Select, Badge, Spinner, fmt } from '../components/UI'

export default function CRM() {
  const [board, setBoard]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detail, setDetail]     = useState(null)
  const [actModal, setActModal] = useState(false)
  const [pipelines, setPipelines] = useState([])
  const [form, setForm]         = useState({ name:'', company:'', email:'', phone:'', source:'', pipeline_id:'', estimated_value:'', probability:0, expected_close:'', notes:'' })
  const [actForm, setActForm]   = useState({ lead_id:'', type:'call', title:'', description:'', due_date:'' })
  const [saving, setSaving]     = useState(false)
  const [editId, setEditId]     = useState(null)
  const [drag, setDrag]         = useState(null)
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/leads/kanban'),
      api.get('/pipelines')
    ]).then(([b, p]) => {
      setBoard(b.data)
      setPipelines(p.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setForm({ name:'', company:'', email:'', phone:'', source:'', pipeline_id: pipelines[0]?.id||'', estimated_value:'', probability:0, expected_close:'', notes:'' })
    setEditId(null); setModal(true)
  }

  const openDetail = async lead => {
    setDetail({ name: lead.name, loading: true })
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
    } catch {
      toast.error('Erro ao mover lead')
    }
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

  const wonLost = async (id, status) => {
    // Encontra pipeline de Ganho ou Perdido
    const targetPipeline = pipelines.find(p =>
      status === 'won' ? p.name.toLowerCase().includes('ganho') : p.name.toLowerCase().includes('perdido')
    )
    await api.put(`/leads/${id}`, {
      ...detail,
      status,
      pipeline_id: targetPipeline?.id || detail.pipeline_id
    })
    setDetail(null)
    load()
  }

  const f = v => setForm(p=>({...p,...v}))

  const actTypes = { call:'📞 Ligação', email:'📧 E-mail', meeting:'🤝 Reunião', note:'📝 Nota', task:'✅ Tarefa' }

  // Colunas sem duplicatas (pela posição)
  const uniqueBoard = board.filter((col, idx, arr) => arr.findIndex(c => c.name === col.name) === idx)

  if (loading) return <Spinner/>

  return (
    <div>
      <PageHeader title="CRM — Funil de Vendas" subtitle="Gerencie leads e oportunidades" icon={Target} action={<Btn onClick={openNew}>+ Novo lead</Btn>}/>

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
                  draggable
                  onDragStart={()=>setDrag(lead.id)}
                  onClick={()=>openDetail(lead)}
                  style={{ background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:9, padding:'12px', cursor:'pointer', transition:'border-color .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--primary)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{ fontWeight:600, fontSize:'.88rem', marginBottom:4 }}>{lead.name}</div>
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
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar lead':'Novo lead'} width={540}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Nome *" value={form.name} onChange={e=>f({name:e.target.value})} required/>
            <Input label="Empresa" value={form.company} onChange={e=>f({company:e.target.value})}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="E-mail" type="email" value={form.email} onChange={e=>f({email:e.target.value})}/>
            <Input label="Telefone" value={form.phone} onChange={e=>f({phone:e.target.value})}/>
          </div>
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
      {detail && (
        <Modal open={!!detail} onClose={()=>setDetail(null)} title={detail.name} width={580}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {detail.company && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Empresa</div><div style={{ fontWeight:600 }}>{detail.company}</div></div>}
              {detail.phone   && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Telefone</div><div>{detail.phone}</div></div>}
              {detail.email   && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>E-mail</div><div>{detail.email}</div></div>}
              {parseFloat(detail.estimated_value)>0 && <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Valor estimado</div><div style={{ fontWeight:700 }}>{fmt.brl(detail.estimated_value)}</div></div>}
              <div><div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Etapa</div><div><Badge color="#8b5cf6">{detail.pipeline_name||'—'}</Badge></div></div>
              <div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Status</div>
                <div>
                  <Badge color={detail.status==='won'?'#10b981':detail.status==='lost'?'#ef4444':'#6366f1'}>
                    {detail.status==='won'?'🏆 Ganho':detail.status==='lost'?'❌ Perdido':'🔵 Aberto'}
                  </Badge>
                </div>
              </div>
            </div>

            {detail.notes && <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 12px', fontSize:'.88rem', color:'var(--muted)' }}>{detail.notes}</div>}

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
                    <span>{actTypes[a.type]?.charAt(0)}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'.88rem', fontWeight:600, textDecoration:a.done?'line-through':'' }}>{a.title}</div>
                      {a.description && <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>{a.description}</div>}
                      {a.due_date && <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>📅 {fmt.date(a.due_date)}</div>}
                    </div>
                    {!a.done && <Btn size="sm" variant="success" onClick={()=>markDone(a.id,detail.id)}>✓</Btn>}
                  </div>
                ))
              }
            </div>

            {detail.status === 'open' && (
              <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
                <Btn variant="success" onClick={()=>wonLost(detail.id,'won')}>🏆 Ganho</Btn>
                <Btn variant="danger"  onClick={()=>wonLost(detail.id,'lost')}>❌ Perdido</Btn>
                <Btn variant="ghost" onClick={()=>{setForm({...detail,pipeline_id:detail.pipeline_id});setEditId(detail.id);setDetail(null);setModal(true)}}>✏️ Editar</Btn>
              </div>
            )}
          </div>
        </Modal>
      )}

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
