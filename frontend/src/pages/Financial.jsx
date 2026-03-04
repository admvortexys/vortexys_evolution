import { useEffect, useState, useMemo } from 'react'
import { DollarSign } from 'lucide-react'
import api from '../services/api'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, KpiCard, Badge, Spinner, Autocomplete, fmt } from '../components/UI'

const empty = { type:'income', title:'', amount:'', due_date:'', category_id:'', client_id:'', client_label:'', notes:'', paid:false, paid_date:'' }
const emptyRecurring = { type:'expense', title:'', amount:'', category_id:'', day_of_month:1, frequency:'monthly', notes:'' }

// ─── Helpers de mês ────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTH_NAMES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function getPeriods(count = 6) {
  const now = new Date(); const periods = []
  for (let i = count-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
    periods.push({ month: d.getMonth()+1, year: d.getFullYear(), label: `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}` })
  }
  return periods
}

// ─── Gerenciar categorias financeiras ────────────────────────────────────
function FinCategoryManager({ onRefresh }) {
  const [cats, setCats]     = useState([])
  const [form, setForm]     = useState({ name:'', type:'income', color:'#10b981' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => api.get('/categories/financial').then(r => setCats(r.data))
  useEffect(() => { load() }, [])

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/categories/financial/${editId}`, form)
      else        await api.post('/categories/financial', form)
      setForm({ name:'', type:'income', color:'#10b981' }); setEditId(null); load(); onRefresh()
    } catch(err) { alert(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  const del = async id => {
    if (!confirm('Excluir categoria?')) return
    try { await api.delete(`/categories/financial/${id}`); load(); onRefresh() }
    catch(err) { alert(err.response?.data?.error||'Categoria em uso') }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <form onSubmit={save} style={{ display:'grid', gridTemplateColumns:'2fr 1fr auto auto', gap:10, alignItems:'flex-end' }}>
        <Input label="Nome" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required/>
        <Select label="Tipo" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
          <option value="income">Receita</option>
          <option value="expense">Despesa</option>
        </Select>
        <div>
          <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Cor</label>
          <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
            style={{ width:42, height:38, padding:2, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', cursor:'pointer' }}/>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
          <Btn type="submit" disabled={saving} size="sm">{editId?'Salvar':'+ Add'}</Btn>
          {editId && <Btn variant="ghost" size="sm" onClick={()=>{setEditId(null);setForm({name:'',type:'income',color:'#10b981'})}}>✕</Btn>}
        </div>
      </form>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {cats.map(c=>(
          <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:10, height:10, borderRadius:3, background:c.color||'#7c3aed', display:'inline-block' }}/>
              <span style={{ fontSize:'.9rem' }}>{c.name}</span>
              <Badge color={c.type==='income'?'#10b981':'#ef4444'} style={{ fontSize:'.7rem' }}>{c.type==='income'?'Receita':'Despesa'}</Badge>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <Btn size="sm" variant="ghost" onClick={()=>{setEditId(c.id);setForm({name:c.name,type:c.type,color:c.color||'#7c3aed'})}}>✏️</Btn>
              <Btn size="sm" variant="danger" onClick={()=>del(c.id)}>🗑</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Gestão de recorrentes ────────────────────────────────────────────────
function RecurringManager({ cats }) {
  const [items, setItems]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(emptyRecurring)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [genMonth, setGenMonth] = useState({ month: new Date().getMonth()+1, year: new Date().getFullYear() })

  const load = () => api.get('/transactions/recurring').then(r => setItems(r.data))
  useEffect(() => { load() }, [])

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/transactions/recurring/${editId}`, form)
      else        await api.post('/transactions/recurring', form)
      setModal(false); load()
    } catch(err) { alert(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const generate = async (id) => {
    try {
      await api.post(`/transactions/recurring/${id}/generate`, genMonth)
      alert('✅ Lançamento gerado com sucesso!')
    } catch(err) { alert(err.response?.data?.error||'Erro') }
  }

  const del = async id => {
    if (!confirm('Desativar recorrente?')) return
    try { await api.delete(`/transactions/recurring/${id}`); load() }
    catch(err) { alert(err.response?.data?.error||'Erro') }
  }

  const freqLabel = { monthly:'Mensal', weekly:'Semanal', yearly:'Anual' }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h4 style={{ fontWeight:700, fontSize:'.95rem' }}>🔁 Despesas/Receitas Recorrentes</h4>
        <Btn size="sm" onClick={()=>{setForm(emptyRecurring);setEditId(null);setModal(true)}}>+ Nova recorrente</Btn>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
        <span style={{ fontSize:'.8rem', color:'var(--muted)' }}>Gerar no mês:</span>
        <Select value={genMonth.month} onChange={e=>setGenMonth(p=>({...p,month:parseInt(e.target.value)}))}>
          {MONTH_NAMES_FULL.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
        </Select>
        <Input type="number" value={genMonth.year} onChange={e=>setGenMonth(p=>({...p,year:parseInt(e.target.value)}))} style={{ width:100 }}/>
      </div>

      {items.length === 0
        ? <p style={{ color:'var(--muted)', textAlign:'center', padding:20, fontSize:'.88rem' }}>Nenhuma recorrente cadastrada</p>
        : items.map(item => (
          <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)', marginBottom:8 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:'.9rem' }}>{item.title}</div>
              <div style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:2 }}>
                <span style={{ color:item.type==='income'?'#10b981':'#ef4444', fontWeight:700 }}>
                  {item.type==='income'?'▲':'▼'} {fmt.brl(item.amount)}
                </span>
                {' · '}Dia {item.day_of_month} · {freqLabel[item.frequency]||item.frequency}
                {item.category_name && ` · ${item.category_name}`}
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <Btn size="sm" variant="success" onClick={()=>generate(item.id)}>⚡ Gerar</Btn>
              <Btn size="sm" variant="ghost" onClick={()=>{setEditId(item.id);setForm({type:item.type,title:item.title,amount:item.amount,category_id:item.category_id||'',day_of_month:item.day_of_month,frequency:item.frequency,notes:item.notes||''});setModal(true)}}>✏️</Btn>
              <Btn size="sm" variant="danger" onClick={()=>del(item.id)}>🗑</Btn>
            </div>
          </div>
        ))
      }

      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar recorrente':'Nova recorrente'}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Tipo" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
            <option value="income">Receita</option>
            <option value="expense">Despesa</option>
          </Select>
          <Input label="Descrição *" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} required/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} required/>
            <Input label="Dia do mês *" type="number" min="1" max="31" value={form.day_of_month} onChange={e=>setForm(p=>({...p,day_of_month:e.target.value}))} required/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Select label="Frequência" value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))}>
              <option value="monthly">Mensal</option>
              <option value="weekly">Semanal</option>
              <option value="yearly">Anual</option>
            </Select>
            <Select label="Categoria" value={form.category_id} onChange={e=>setForm(p=>({...p,category_id:e.target.value}))}>
              <option value="">Sem categoria</option>
              {cats.filter(c=>c.type===form.type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default function Financial() {
  const now   = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth()+1)
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const periods = useMemo(() => getPeriods(6), [])

  const [rows, setRows]           = useState([])
  const [cats, setCats]           = useState([])
  const [summary, setSummary]     = useState({})
  const [evolution, setEvolution] = useState([])
  const [byCat, setByCat]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [catModal, setCatModal]   = useState(false)
  const [recurModal, setRecurModal] = useState(false)
  const [form, setForm]           = useState(empty)
  const [editId, setEditId]       = useState(null)
  const [filterType, setFilterType] = useState('')
  const [filterPaid, setFilterPaid] = useState('')
  const [saving, setSaving]       = useState(false)

  const loadCats = () => api.get('/categories/financial').then(r => setCats(r.data))

  const load = () => {
    const p = new URLSearchParams()
    if (filterType) p.set('type', filterType)
    if (filterPaid !== '') p.set('paid', filterPaid)
    p.set('month', selMonth); p.set('year', selYear)
    setLoading(true)
    Promise.all([
      api.get(`/transactions?${p}`),
      api.get(`/transactions/summary?month=${selMonth}&year=${selYear}`),
      api.get('/transactions/monthly-evolution'),
      api.get(`/transactions/by-category?month=${selMonth}&year=${selYear}`),
    ]).then(([t,s,ev,bc]) => {
      setRows(t.data); setSummary(s.data)
      setEvolution(ev.data); setByCat(bc.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadCats() }, [])
  useEffect(() => { load() }, [filterType, filterPaid, selMonth, selYear])

  const openNew  = (type='income') => { setForm({...empty,type}); setEditId(null); setModal(true) }
  const openEdit = row => {
    if (row.paid) return
    setForm({...row, category_id:row.category_id||'', client_id:row.client_id||'', client_label:row.client_name||''})
    setEditId(row.id); setModal(true)
  }
  const f = v => setForm(p=>({...p,...v}))
  const fetchClients = q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r=>r.data)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/transactions/${editId}`, form)
      else        await api.post('/transactions', form)
      setModal(false); load()
    } catch(err) { alert(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const pay = async id => {
    if (!confirm('Marcar como pago?')) return
    await api.patch(`/transactions/${id}/pay`); load()
  }

  const del = async id => {
    if (!confirm('Excluir lançamento?')) return
    await api.delete(`/transactions/${id}`); load()
  }

  const balance     = parseFloat(summary.income_paid||0) - parseFloat(summary.expense_paid||0)
  const balanceTot  = parseFloat(summary.income_paid||0) + parseFloat(summary.income_pending||0)
                    - parseFloat(summary.expense_paid||0) - parseFloat(summary.expense_pending||0)

  // ── Mini barra de categorias ──────────────────────────────────────────
  const expCats = byCat.filter(c=>c.type==='expense' && parseFloat(c.total)>0)
  const totalExp = expCats.reduce((s,c)=>s+parseFloat(c.total),0)

  const cols = [
    { key:'due_date',      label:'Vencimento', render: v => fmt.date(v) },
    { key:'title',         label:'Descrição'  },
    { key:'type',          label:'Tipo', render: v => <span style={{ fontSize:'.78rem', fontWeight:700, color:v==='income'?'#10b981':'#ef4444' }}>{v==='income'?'▲ Receita':'▼ Despesa'}</span> },
    { key:'category_name', label:'Categoria'  },
    { key:'client_name',   label:'Cliente'    },
    { key:'amount',        label:'Valor', render:(v,row)=>(
      <span style={{ fontWeight:700, color:row.type==='income'?'var(--success)':'var(--danger)' }}>{fmt.brl(v)}</span>
    )},
    { key:'paid', label:'Status', render:(v,row)=>(
      v ? <span style={{ fontSize:'.78rem', color:'#10b981', fontWeight:700 }}>✅ Pago {row.paid_date?fmt.date(row.paid_date):''}</span>
        : <span style={{ fontSize:'.78rem', color:'#f59e0b', fontWeight:700 }}>⏳ Pendente</span>
    )},
    { key:'id', label:'', render:(_,row)=>(
      <div style={{ display:'flex', gap:5 }}>
        {!row.paid && <Btn size="sm" variant="success" onClick={e=>{e.stopPropagation();pay(row.id)}}>✓</Btn>}
        {!row.paid && <Btn size="sm" variant="ghost"   onClick={e=>{e.stopPropagation();openEdit(row)}}>✏️</Btn>}
        <Btn size="sm" variant="danger" onClick={e=>{e.stopPropagation();del(row.id)}}>🗑</Btn>
      </div>
    )}
  ]

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Contas a pagar e receber" icon={DollarSign}
        action={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" onClick={()=>setCatModal(true)}>🏷 Categorias</Btn>
            <Btn variant="ghost" onClick={()=>setRecurModal(true)}>🔁 Recorrentes</Btn>
            <Btn variant="secondary" onClick={()=>openNew('expense')}>+ Despesa</Btn>
            <Btn onClick={()=>openNew('income')}>+ Receita</Btn>
          </div>
        }
      />

      {/* Seletor de meses */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:'.78rem', color:'var(--muted)', fontWeight:600, marginRight:4 }}>PERÍODO:</span>
          {periods.map(p => (
            <Btn key={`${p.month}-${p.year}`} size="sm"
              variant={selMonth===p.month && selYear===p.year ? 'primary' : 'ghost'}
              onClick={()=>{ setSelMonth(p.month); setSelYear(p.year) }}>
              {p.label}
            </Btn>
          ))}
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <Select value={selMonth} onChange={e=>setSelMonth(parseInt(e.target.value))} style={{ padding:'6px 10px', fontSize:'.8rem' }}>
              {MONTH_NAMES_FULL.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
            </Select>
            <Input type="number" value={selYear} onChange={e=>setSelYear(parseInt(e.target.value))} style={{ width:90, padding:'6px 10px', fontSize:'.8rem' }}/>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:20 }}>
        <KpiCard icon="📈" label="Receitas recebidas"   value={fmt.brl(summary.income_paid)}    color="#10b981"/>
        <KpiCard icon="📉" label="Despesas pagas"       value={fmt.brl(summary.expense_paid)}   color="#ef4444"/>
        <KpiCard icon="⏳" label="A receber"            value={fmt.brl(summary.income_pending)} color="#f59e0b"/>
        <KpiCard icon="💳" label="Saldo realizado"      value={fmt.brl(balance)}                color={balance>=0?'#10b981':'#ef4444'}/>
        <KpiCard icon="🔮" label="Projeção do mês"      value={fmt.brl(balanceTot)}             color={balanceTot>=0?'#6366f1':'#f97316'}/>
        <KpiCard icon="💸" label="Despesas pendentes"   value={fmt.brl(summary.expense_pending)} color="#f97316"/>
      </div>

      {/* Breakdown por categoria */}
      {expCats.length > 0 && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:'.85rem', color:'var(--muted)', marginBottom:12 }}>DESPESAS POR CATEGORIA — {MONTH_NAMES_FULL[selMonth-1]} {selYear}</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {expCats.slice(0,8).map(c => {
              const pct = totalExp > 0 ? (parseFloat(c.total)/totalExp*100) : 0
              return (
                <div key={c.name}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3, fontSize:'.82rem' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:10, height:10, borderRadius:3, background:c.color||'#6366f1', display:'inline-block' }}/>
                      {c.name}
                    </span>
                    <span style={{ fontWeight:700 }}>{fmt.brl(c.total)} <span style={{ color:'var(--muted)', fontWeight:400 }}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:'var(--bg-card2)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:c.color||'#6366f1', borderRadius:3, transition:'width .3s' }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Evolução mensal */}
      {evolution.length > 1 && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:'.85rem', color:'var(--muted)', marginBottom:14 }}>EVOLUÇÃO DOS ÚLTIMOS 6 MESES</div>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${evolution.length},1fr)`, gap:8 }}>
            {evolution.map(e => {
              const maxVal = Math.max(...evolution.map(x=>Math.max(parseFloat(x.income),parseFloat(x.expense)))) || 1
              const incH = (parseFloat(e.income)/maxVal*80).toFixed(0)
              const expH = (parseFloat(e.expense)/maxVal*80).toFixed(0)
              return (
                <div key={`${e.year}-${e.month}`} style={{ textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:3, height:88, marginBottom:4 }}>
                    <div style={{ width:14, height:`${incH}px`, background:'#10b981', borderRadius:3, transition:'height .3s' }} title={`Receitas: ${fmt.brl(e.income)}`}/>
                    <div style={{ width:14, height:`${expH}px`, background:'#ef4444', borderRadius:3, transition:'height .3s' }} title={`Despesas: ${fmt.brl(e.expense)}`}/>
                  </div>
                  <div style={{ fontSize:'.7rem', color:'var(--muted)' }}>{MONTH_NAMES[e.month-1]}</div>
                  <div style={{ fontSize:'.65rem', color:'#10b981', fontWeight:700 }}>{fmt.brl(e.income)}</div>
                  <div style={{ fontSize:'.65rem', color:'#ef4444', fontWeight:700 }}>{fmt.brl(e.expense)}</div>
                </div>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:10, fontSize:'.75rem', color:'var(--muted)' }}>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#10b981', borderRadius:2, marginRight:4 }}/>Receitas pagas</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#ef4444', borderRadius:2, marginRight:4 }}/>Despesas pagas</span>
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[{v:'',l:'Todos'},{v:'income',l:'Receitas'},{v:'expense',l:'Despesas'}].map(t=>(
            <Btn key={t.v} size="sm" variant={filterType===t.v?'primary':'ghost'} onClick={()=>setFilterType(t.v)}>{t.l}</Btn>
          ))}
          <div style={{ flex:1 }}/>
          {[{v:'',l:'Todos'},{v:'false',l:'Pendentes'},{v:'true',l:'Pagos'}].map(t=>(
            <Btn key={t.v} size="sm" variant={filterPaid===t.v?'primary':'ghost'} onClick={()=>setFilterPaid(t.v)}>{t.l}</Btn>
          ))}
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={row=>!row.paid&&openEdit(row)}/>}</Card>

      {/* Modal lançamento */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar lançamento':'Novo lançamento'}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Tipo" value={form.type} onChange={e=>f({type:e.target.value})}>
            <option value="income">Receita</option>
            <option value="expense">Despesa</option>
          </Select>
          <Input label="Descrição *" value={form.title} onChange={e=>f({title:e.target.value})} required/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" value={form.amount} onChange={e=>f({amount:e.target.value})} required/>
            <Input label="Vencimento *" type="date" value={form.due_date} onChange={e=>f({due_date:e.target.value})} required/>
          </div>
          <Select label="Categoria" value={form.category_id} onChange={e=>f({category_id:e.target.value})}>
            <option value="">Selecione...</option>
            {cats.filter(c=>c.type===form.type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Autocomplete
            label="Cliente / Fornecedor"
            value={{ label: form.client_label }}
            fetchFn={fetchClients}
            onSelect={c => f({ client_id:c.id, client_label:c.name })}
            renderOption={c=>(
              <div>
                <div style={{ fontWeight:600 }}>{c.name}</div>
                <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{[c.document,c.phone].filter(Boolean).join(' · ')}</div>
              </div>
            )}
            placeholder="Buscar por nome, CPF/CNPJ..."
          />
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.88rem', cursor:'pointer' }}>
            <input type="checkbox" checked={form.paid} onChange={e=>f({paid:e.target.checked})}/> Já foi pago
          </label>
          {form.paid && <Input label="Data do pagamento" type="date" value={form.paid_date||''} onChange={e=>f({paid_date:e.target.value})}/>}
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

      {/* Modal categorias */}
      <Modal open={catModal} onClose={()=>setCatModal(false)} title="🏷 Categorias Financeiras" width={560}>
        <FinCategoryManager onRefresh={loadCats}/>
      </Modal>

      {/* Modal recorrentes */}
      <Modal open={recurModal} onClose={()=>setRecurModal(false)} title="🔁 Despesas Recorrentes" width={600}>
        <RecurringManager cats={cats}/>
      </Modal>
    </div>
  )
}
