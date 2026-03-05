import { useEffect, useState, useMemo } from 'react'
import { DollarSign, Wallet, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Clock, CreditCard, Banknote } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, KpiCard, Badge, Spinner, Autocomplete, fmt } from '../components/UI'

const empty = { type:'income', title:'', amount:'', due_date:'', category_id:'', client_id:'', client_label:'',
  notes:'', paid:false, paid_date:'', account_id:'', payment_method:'', installment_total:1,
  seller_id:'', seller_label:'', order_id:'', document_ref:'', fee_amount:'', discount_amount:'' }

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTH_NAMES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const PAY_METHODS = [
  {v:'dinheiro',l:'Dinheiro'},{v:'pix',l:'PIX'},{v:'debito',l:'Débito'},{v:'credito',l:'Crédito'},
  {v:'boleto',l:'Boleto'},{v:'transferencia',l:'Transferência'},{v:'cheque',l:'Cheque'},{v:'credito_loja',l:'Crédito loja'},{v:'outro',l:'Outro'}
]

function getPeriods(count = 6) {
  const now = new Date(); const periods = []
  for (let i = count-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
    periods.push({ month: d.getMonth()+1, year: d.getFullYear(), label: `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}` })
  }
  return periods
}

// ── Gerenciar categorias financeiras ──
function FinCategoryManager({ onRefresh }) {
  const [cats, setCats] = useState([])
  const [form, setForm] = useState({ name:'', type:'income', color:'#10b981' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()
  const load = () => api.get('/categories/financial').then(r => setCats(r.data))
  useEffect(() => { load() }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/categories/financial/${editId}`, form)
      else        await api.post('/categories/financial', form)
      setForm({ name:'', type:'income', color:'#10b981' }); setEditId(null); load(); onRefresh()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  const del = async id => { if (!await confirm('Excluir?')) return; try { await api.delete(`/categories/financial/${id}`); load(); onRefresh() } catch(e) { toast.error('Categoria em uso') } }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <form onSubmit={save} style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Input label="Nome" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required style={{ flex:'1 1 150px' }}/>
        <Select label="Tipo" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={{ flex:'0 1 120px' }}>
          <option value="income">Receita</option><option value="expense">Despesa</option>
        </Select>
        <div>
          <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:5 }}>Cor</label>
          <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
            style={{ width:42, height:38, padding:2, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-card2)', cursor:'pointer' }}/>
        </div>
        <Btn type="submit" disabled={saving} size="sm">{editId?'Salvar':'+ Add'}</Btn>
        {editId && <Btn variant="ghost" size="sm" onClick={()=>{setEditId(null);setForm({name:'',type:'income',color:'#10b981'})}}>✕</Btn>}
      </form>
      {cats.map(c=>(
        <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:10, height:10, borderRadius:3, background:c.color||'#7c3aed' }}/>
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
  )
}

// ── Contas financeiras ──
function AccountManager() {
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({ name:'', type:'bank', initial_balance:0 })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const load = () => api.get('/transactions/accounts').then(r => setAccounts(r.data))
  useEffect(() => { load() }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true)
    try { await api.post('/transactions/accounts', form); setForm({ name:'', type:'bank', initial_balance:0 }); load() }
    catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  const TYPES = {cash:'Caixa',bank:'Banco',card_machine:'Maquininha',pix:'PIX',other:'Outro'}
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <form onSubmit={save} style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Input label="Nome" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required style={{ flex:'1 1 150px' }}/>
        <Select label="Tipo" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={{ flex:'0 1 130px' }}>
          {Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label="Saldo inicial" type="number" step="0.01" value={form.initial_balance} onChange={e=>setForm(p=>({...p,initial_balance:e.target.value}))} style={{ flex:'0 1 120px' }}/>
        <Btn type="submit" size="sm" disabled={saving}>+ Add</Btn>
      </form>
      {accounts.map(a=>(
        <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:'.9rem' }}>{a.name}</div>
            <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{TYPES[a.type]||a.type}</div>
          </div>
          <div style={{ fontWeight:700, fontSize:'.95rem', color: parseFloat(a.current_balance)>=0 ? '#10b981' : '#ef4444' }}>
            {fmt.brl(a.current_balance)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Drawer de baixa/recebimento ──
function PayDrawer({ transaction, onClose, onPaid, accounts }) {
  const t = transaction
  const [form, setForm] = useState({
    paid_date: new Date().toISOString().split('T')[0],
    paid_amount: t?.amount || '',
    payment_method: t?.payment_method || '',
    account_id: t?.account_id || '',
    fee_amount: '', discount_amount: '', interest_amount: '', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  if (!t) return null

  const finalAmount = () => {
    const base = parseFloat(form.paid_amount) || parseFloat(t.amount)
    const fee = parseFloat(form.fee_amount) || 0
    const disc = parseFloat(form.discount_amount) || 0
    const interest = parseFloat(form.interest_amount) || 0
    return base - disc + interest - fee
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.patch(`/transactions/${t.id}/pay`, form)
      toast.success(t.type==='income' ? 'Recebido!' : 'Pago!')
      onPaid()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const isOverdue = !t.paid && new Date(t.due_date) < new Date()
  return (
    <div style={{ position:'fixed', inset:0, zIndex:998, display:'flex', justifyContent:'flex-end' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:420, maxWidth:'100%', height:'100%', background:'var(--bg-card)', borderLeft:'1px solid var(--border)',
        padding:'24px 20px', overflowY:'auto', animation:'slideIn .2s ease' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontWeight:700 }}>{t.type==='income' ? '💰 Receber' : '💸 Pagar'}</h3>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1.2rem' }}>✕</button>
        </div>

        <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:14, marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:'.95rem', marginBottom:4 }}>{t.title}</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.85rem', color:'var(--muted)' }}>
            <span>Vencimento: {fmt.date(t.due_date)}</span>
            {isOverdue && <Badge color="#ef4444">ATRASADO</Badge>}
          </div>
          {t.client_name && <div style={{ fontSize:'.82rem', color:'var(--muted)', marginTop:4 }}>{t.client_name}</div>}
          {t.order_number && <div style={{ fontSize:'.82rem', color:'var(--primary)', marginTop:2 }}>Pedido: {t.order_number}</div>}
          {t.installment_total > 1 && <div style={{ fontSize:'.78rem', color:'var(--muted)', marginTop:2 }}>Parcela {t.installment_number}/{t.installment_total}</div>}
        </div>

        <div style={{ fontWeight:900, fontSize:'1.4rem', textAlign:'center', marginBottom:16, color: t.type==='income'?'#10b981':'#ef4444' }}>
          {fmt.brl(t.amount)}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Valor pago" type="number" step="0.01" value={form.paid_amount} onChange={e=>setForm(p=>({...p,paid_amount:e.target.value}))}/>
            <Input label="Data pagamento" type="date" value={form.paid_date} onChange={e=>setForm(p=>({...p,paid_date:e.target.value}))}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Select label="Forma" value={form.payment_method} onChange={e=>setForm(p=>({...p,payment_method:e.target.value}))}>
              <option value="">—</option>
              {PAY_METHODS.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
            </Select>
            <Select label="Conta" value={form.account_id} onChange={e=>setForm(p=>({...p,account_id:e.target.value}))}>
              <option value="">—</option>
              {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <Input label="Desconto" type="number" step="0.01" value={form.discount_amount} onChange={e=>setForm(p=>({...p,discount_amount:e.target.value}))} placeholder="0"/>
            <Input label="Juros/Multa" type="number" step="0.01" value={form.interest_amount} onChange={e=>setForm(p=>({...p,interest_amount:e.target.value}))} placeholder="0"/>
            <Input label="Taxa cartão" type="number" step="0.01" value={form.fee_amount} onChange={e=>setForm(p=>({...p,fee_amount:e.target.value}))} placeholder="0"/>
          </div>
          <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'.85rem', color:'var(--muted)' }}>Valor líquido</span>
            <span style={{ fontWeight:900, fontSize:'1.1rem' }}>{fmt.brl(finalAmount())}</span>
          </div>
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observações</label>
            <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
          </div>
          <Btn onClick={save} disabled={saving} style={{ width:'100%' }}>
            {saving ? 'Processando...' : t.type==='income' ? '✓ Confirmar recebimento' : '✓ Confirmar pagamento'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Caixa do dia ──
function CashRegister({ onClose }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openBal, setOpenBal] = useState('')
  const [closeBal, setCloseBal] = useState('')
  const [movForm, setMovForm] = useState({ type:'out', amount:'', description:'' })
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()

  const load = () => { setLoading(true); api.get('/transactions/cash/current').then(r => setSession(r.data)).finally(()=>setLoading(false)) }
  useEffect(() => { load() }, [])

  const openCash = async () => {
    setSaving(true)
    try { await api.post('/transactions/cash/open', { opening_balance: parseFloat(openBal)||0 }); load() }
    catch(e) { toast.error(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const closeCash = async () => {
    if (!await confirm('Fechar o caixa?')) return
    setSaving(true)
    try { await api.post('/transactions/cash/close', { closing_balance: parseFloat(closeBal)||undefined }); load() }
    catch(e) { toast.error(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const addMov = async e => {
    e.preventDefault(); setSaving(true)
    try { await api.post('/transactions/cash/movement', movForm); setMovForm({ type:'out', amount:'', description:'' }); load() }
    catch(e) { toast.error(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  if (loading) return <Spinner/>

  if (!session) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:16, alignItems:'center', padding:20 }}>
        <Banknote size={40} color="var(--primary)" strokeWidth={1.5}/>
        <h3 style={{ fontWeight:700 }}>Abrir caixa do dia</h3>
        <Input label="Saldo inicial (R$)" type="number" step="0.01" value={openBal} onChange={e=>setOpenBal(e.target.value)} placeholder="0.00" style={{ width:200 }}/>
        <Btn onClick={openCash} disabled={saving}>{saving ? 'Abrindo...' : 'Abrir caixa'}</Btn>
      </div>
    )
  }

  const movs = session.movements || []
  const totalIn = movs.filter(m=>m.type==='in'||m.type==='supply').reduce((s,m)=>s+parseFloat(m.amount),0)
  const totalOut = movs.filter(m=>m.type==='out'||m.type==='bleed').reduce((s,m)=>s+parseFloat(m.amount),0)
  const expected = parseFloat(session.opening_balance) + totalIn - totalOut

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>Aberto em {new Date(session.opened_at).toLocaleString('pt-BR')}</div>
          <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>Por: {session.opened_by_name}</div>
        </div>
        <Badge color="#10b981">ABERTO</Badge>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:12, textAlign:'center' }}>
          <div style={{ fontSize:'.72rem', color:'var(--muted)' }}>Abertura</div>
          <div style={{ fontWeight:700 }}>{fmt.brl(session.opening_balance)}</div>
        </div>
        <div style={{ background:'rgba(16,185,129,.08)', borderRadius:8, padding:12, textAlign:'center' }}>
          <div style={{ fontSize:'.72rem', color:'#10b981' }}>Entradas</div>
          <div style={{ fontWeight:700, color:'#10b981' }}>+{fmt.brl(totalIn)}</div>
        </div>
        <div style={{ background:'rgba(239,68,68,.08)', borderRadius:8, padding:12, textAlign:'center' }}>
          <div style={{ fontSize:'.72rem', color:'#ef4444' }}>Saídas</div>
          <div style={{ fontWeight:700, color:'#ef4444' }}>-{fmt.brl(totalOut)}</div>
        </div>
      </div>

      <div style={{ background:'var(--bg-card2)', borderRadius:8, padding:14, textAlign:'center' }}>
        <div style={{ fontSize:'.78rem', color:'var(--muted)' }}>Saldo esperado</div>
        <div style={{ fontWeight:900, fontSize:'1.3rem', color: expected>=0?'#10b981':'#ef4444' }}>{fmt.brl(expected)}</div>
      </div>

      <form onSubmit={addMov} style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <Select label="Tipo" value={movForm.type} onChange={e=>setMovForm(p=>({...p,type:e.target.value}))} style={{ flex:'0 0 110px' }}>
          <option value="in">Entrada</option>
          <option value="out">Saída</option>
          <option value="bleed">Sangria</option>
          <option value="supply">Suprimento</option>
        </Select>
        <Input label="Valor" type="number" step="0.01" value={movForm.amount} onChange={e=>setMovForm(p=>({...p,amount:e.target.value}))} required style={{ flex:'0 0 100px' }}/>
        <Input label="Descrição" value={movForm.description} onChange={e=>setMovForm(p=>({...p,description:e.target.value}))} style={{ flex:1 }}/>
        <Btn type="submit" size="sm" disabled={saving}>+ Lançar</Btn>
      </form>

      {movs.length > 0 && (
        <div style={{ maxHeight:200, overflowY:'auto' }}>
          {movs.map(m => (
            <div key={m.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:'.82rem' }}>
              <div>
                <span style={{ color: m.type==='in'||m.type==='supply'?'#10b981':'#ef4444', fontWeight:600 }}>
                  {m.type==='in'?'↑ Entrada':m.type==='out'?'↓ Saída':m.type==='bleed'?'↓ Sangria':'↑ Suprimento'}
                </span>
                {m.description && <span style={{ color:'var(--muted)', marginLeft:8 }}>{m.description}</span>}
              </div>
              <span style={{ fontWeight:700 }}>{fmt.brl(m.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
        <h4 style={{ fontWeight:700, marginBottom:10, fontSize:'.88rem' }}>Fechar caixa</h4>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
          <Input label="Saldo em caixa (contagem)" type="number" step="0.01" value={closeBal} onChange={e=>setCloseBal(e.target.value)} placeholder={expected.toFixed(2)} style={{ flex:1 }}/>
          <Btn variant="danger" onClick={closeCash} disabled={saving}>Fechar caixa</Btn>
        </div>
      </div>
    </div>
  )
}

// ── Recorrentes ──
function RecurringManager({ cats }) {
  const [items, setItems] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ type:'expense', title:'', amount:'', category_id:'', day_of_month:1, frequency:'monthly', notes:'' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()
  const [genMonth, setGenMonth] = useState({ month: new Date().getMonth()+1, year: new Date().getFullYear() })
  const load = () => api.get('/transactions/recurring').then(r => setItems(r.data))
  useEffect(() => { load() }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/transactions/recurring/${editId}`, form)
      else        await api.post('/transactions/recurring', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }
  const gen = async id => {
    setSaving(true)
    try { await api.post(`/transactions/recurring/${id}/generate`, genMonth); toast.success('Gerado!'); load() }
    catch(e) { toast.error(e.response?.data?.error||'Já existe ou erro') }
    finally { setSaving(false) }
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', background:'var(--bg-card2)', borderRadius:8, padding:14 }}>
        <span style={{ fontSize:'.82rem', fontWeight:600, color:'var(--muted)' }}>Gerar para:</span>
        <select value={genMonth.month} onChange={e=>setGenMonth(p=>({...p,month:parseInt(e.target.value)}))}
          style={{ height:34, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text)', fontSize:'.85rem', padding:'0 8px' }}>
          {MONTH_NAMES_FULL.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={genMonth.year} onChange={e=>setGenMonth(p=>({...p,year:parseInt(e.target.value)}))}
          style={{ width:70, height:34, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text)', fontSize:'.85rem', padding:'0 8px', textAlign:'center' }}/>
      </div>
      <Btn size="sm" onClick={()=>{setForm({type:'expense',title:'',amount:'',category_id:'',day_of_month:1,frequency:'monthly',notes:''});setEditId(null);setModal(true)}}>+ Nova recorrente</Btn>
      {items.map(it=>(
        <div key={it.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:'.88rem' }}>{it.title}</div>
            <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{it.category_name||'Sem categoria'} • {it.recurrence_type==='monthly'?'Mensal':it.recurrence_type==='weekly'?'Semanal':'Anual'}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:700, color: it.type==='income'?'#10b981':'#ef4444' }}>{fmt.brl(it.amount)}</span>
            <Btn size="sm" variant="ghost" onClick={()=>gen(it.id)}>Gerar</Btn>
          </div>
        </div>
      ))}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar recorrente':'Nova recorrente'}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Select label="Tipo" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
            <option value="income">Receita</option><option value="expense">Despesa</option>
          </Select>
          <Input label="Descrição *" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} required/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} required/>
            <Input label="Dia do mês" type="number" min="1" max="31" value={form.day_of_month} onChange={e=>setForm(p=>({...p,day_of_month:e.target.value}))}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Select label="Frequência" value={form.frequency} onChange={e=>setForm(p=>({...p,frequency:e.target.value}))}>
              <option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="yearly">Anual</option>
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export default function Financial() {
  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth()+1)
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const periods = useMemo(() => getPeriods(6), [])

  const [rows, setRows]           = useState([])
  const [cats, setCats]           = useState([])
  const [accounts, setAccounts]   = useState([])
  const [sellers, setSellers]     = useState([])
  const [summary, setSummary]     = useState({})
  const [evolution, setEvolution] = useState([])
  const [byCat, setByCat]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [catModal, setCatModal]   = useState(false)
  const [recurModal, setRecurModal] = useState(false)
  const [acctModal, setAcctModal] = useState(false)
  const [cashModal, setCashModal] = useState(false)
  const [form, setForm]           = useState(empty)
  const [editId, setEditId]       = useState(null)
  const [payDrawer, setPayDrawer] = useState(null)

  const [filterType, setFilterType]       = useState('')
  const [filterPaid, setFilterPaid]       = useState('')
  const [filterMethod, setFilterMethod]   = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterSearch, setFilterSearch]   = useState('')
  const [saving, setSaving]       = useState(false)
  const { toast, confirm } = useToast()

  const loadCats = () => api.get('/categories/financial').then(r => setCats(r.data))
  const loadAccounts = () => api.get('/transactions/accounts').then(r => setAccounts(r.data)).catch(()=>{})

  const load = () => {
    const p = new URLSearchParams()
    if (filterType) p.set('type', filterType)
    if (filterPaid !== '') p.set('paid', filterPaid)
    if (filterMethod) p.set('payment_method', filterMethod)
    if (filterAccount) p.set('account_id', filterAccount)
    if (filterSearch) p.set('search', filterSearch)
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

  useEffect(() => { loadCats(); loadAccounts(); api.get('/sellers').then(r=>setSellers(r.data)).catch(()=>{}) }, [])
  useEffect(() => { load() }, [filterType, filterPaid, filterMethod, filterAccount, filterSearch, selMonth, selYear])

  const openNew  = (type='income') => { setForm({...empty,type,due_date:new Date().toISOString().split('T')[0]}); setEditId(null); setModal(true) }
  const openEdit = row => {
    if (row.paid) return
    setForm({...row, category_id:row.category_id||'', client_id:row.client_id||'', client_label:row.client_name||'',
      account_id:row.account_id||'', payment_method:row.payment_method||'', seller_id:row.seller_id||'', seller_label:row.seller_name||'',
      installment_total:row.installment_total||1, fee_amount:row.fee_amount||'', discount_amount:row.discount_amount||''})
    setEditId(row.id); setModal(true)
  }
  const f = v => setForm(p=>({...p,...v}))
  const fetchClients = q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r=>r.data)
  const fetchSellers = q => api.get(`/sellers/search?q=${encodeURIComponent(q)}`).then(r=>r.data)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/transactions/${editId}`, form)
      else        await api.post('/transactions', form)
      setModal(false); load()
    } catch(err) { toast.error(err.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const pay = row => setPayDrawer(row)
  const reverse = async id => {
    const reason = prompt('Motivo do estorno:')
    if (reason === null) return
    try { await api.patch(`/transactions/${id}/reverse`, { reason }); toast.success('Estornado'); load() }
    catch(e) { toast.error(e.response?.data?.error||'Erro') }
  }
  const del = async id => { if (!await confirm('Excluir lançamento?')) return; await api.delete(`/transactions/${id}`); load() }

  const crmWon = parseFloat(summary.crm_won_value||0)
  const balance = (parseFloat(summary.income_paid||0) + crmWon) - parseFloat(summary.expense_paid||0)
  const balanceTot = parseFloat(summary.income_paid||0) + parseFloat(summary.income_pending||0) + crmWon
                   - parseFloat(summary.expense_paid||0) - parseFloat(summary.expense_pending||0)

  const expCats = byCat.filter(c=>c.type==='expense' && parseFloat(c.total)>0)
  const totalExp = expCats.reduce((s,c)=>s+parseFloat(c.total),0)

  const isOverdue = r => !r.paid && new Date(r.due_date) < new Date()
  const methodLabel = v => PAY_METHODS.find(m=>m.v===v)?.l || v || '—'

  const cols = [
    { key:'due_date', label:'Vencimento', render:(v,row) => (
      <div>
        <div style={{ fontWeight:500 }}>{fmt.date(v)}</div>
        {isOverdue(row) && <span style={{ fontSize:'.68rem', fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,.1)', padding:'1px 5px', borderRadius:3 }}>ATRASADO</span>}
      </div>
    )},
    { key:'title', label:'Descrição', render:(_,row) => (
      <div>
        <div style={{ fontWeight:600, fontSize:'.88rem' }}>{row.title}</div>
        {row.installment_total > 1 && <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>Parcela {row.installment_number}/{row.installment_total}</span>}
        {row.order_number && <span style={{ fontSize:'.7rem', color:'var(--primary)', marginLeft:6 }}>Ped: {row.order_number}</span>}
      </div>
    )},
    { key:'type', label:'Tipo', render: v => <span style={{ fontSize:'.78rem', fontWeight:700, color:v==='income'?'#10b981':'#ef4444' }}>{v==='income'?'▲ Receita':'▼ Despesa'}</span> },
    { key:'category_name', label:'Categoria', render:(v,row) => (
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        {row.category_color && <span style={{ width:8, height:8, borderRadius:2, background:row.category_color, flexShrink:0 }}/>}
        <span style={{ fontSize:'.85rem' }}>{v||'—'}</span>
      </div>
    )},
    { key:'payment_method', label:'Forma', render: v => <span style={{ fontSize:'.8rem' }}>{methodLabel(v)}</span> },
    { key:'account_name', label:'Conta', render: v => <span style={{ fontSize:'.8rem' }}>{v||'—'}</span> },
    { key:'client_name', label:'Cliente', render: v => <span style={{ fontSize:'.85rem' }}>{v||'—'}</span> },
    { key:'amount', label:'Valor', render:(v,row) => (
      <span style={{ fontWeight:700, color:row.type==='income'?'var(--success)':'var(--danger)' }}>{fmt.brl(v)}</span>
    )},
    { key:'paid', label:'Status', render:(v,row) => (
      v ? <span style={{ fontSize:'.78rem', color:'#10b981', fontWeight:700 }}>✅ {row.paid_date?fmt.date(row.paid_date):'Pago'}</span>
        : <span style={{ fontSize:'.78rem', color:isOverdue(row)?'#ef4444':'#f59e0b', fontWeight:700 }}>{isOverdue(row)?'🔴 Atrasado':'⏳ Pendente'}</span>
    )},
    { key:'id', label:'', render:(_,row)=>(
      <div style={{ display:'flex', gap:4 }} onClick={e=>e.stopPropagation()}>
        {!row.paid && <Btn size="sm" variant="success" onClick={()=>pay(row)} title={row.type==='income'?'Receber':'Pagar'}>💰</Btn>}
        {row.paid && <Btn size="sm" variant="ghost" onClick={()=>reverse(row.id)} title="Estornar">↩️</Btn>}
        {!row.paid && <Btn size="sm" variant="ghost" onClick={()=>openEdit(row)} title="Editar">✏️</Btn>}
        <Btn size="sm" variant="danger" onClick={()=>del(row.id)} title="Excluir">🗑</Btn>
      </div>
    )}
  ]

  return (
    <div style={{ minWidth:0, overflow:'hidden' }}>
      <PageHeader title="Financeiro" subtitle="Contas a pagar, receber e caixa" icon={DollarSign}
        action={
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <Btn variant="ghost" size="sm" onClick={()=>setCashModal(true)}>💵 Caixa</Btn>
            <Btn variant="ghost" size="sm" onClick={()=>setAcctModal(true)}>🏦 Contas</Btn>
            <Btn variant="ghost" size="sm" onClick={()=>setCatModal(true)}>🏷 Categorias</Btn>
            <Btn variant="ghost" size="sm" onClick={()=>setRecurModal(true)}>🔁 Recorrentes</Btn>
            <Btn variant="secondary" size="sm" onClick={()=>openNew('expense')}>+ Despesa</Btn>
            <Btn size="sm" onClick={()=>openNew('income')}>+ Receita</Btn>
          </div>
        }
      />

      {/* Período */}
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
          <select value={selMonth} onChange={e=>setSelMonth(parseInt(e.target.value))}
            style={{ height:32, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.82rem', padding:'0 8px' }}>
            {MONTH_NAMES_FULL.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <input type="number" value={selYear} onChange={e=>setSelYear(parseInt(e.target.value))}
            style={{ width:72, height:32, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.82rem', padding:'0 8px', textAlign:'center' }}/>
        </div>
      </Card>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:18 }}>
        <KpiCard icon={ArrowDownCircle} label="Receitas recebidas" value={fmt.brl((parseFloat(summary.income_paid)||0) + crmWon)} color="#10b981"/>
        <KpiCard icon={ArrowUpCircle}   label="Despesas pagas"     value={fmt.brl(summary.expense_paid)} color="#ef4444"/>
        <KpiCard icon={Clock}           label="A receber"          value={fmt.brl(summary.income_pending)} color="#f59e0b"/>
        <KpiCard icon={Clock}           label="A pagar"            value={fmt.brl(summary.expense_pending)} color="#f97316"/>
        <KpiCard icon={Wallet}          label="Saldo realizado"    value={fmt.brl(balance)} color={balance>=0?'#10b981':'#ef4444'}/>
        {crmWon > 0 && <KpiCard icon={ArrowDownCircle} label="Valor ganho CRM" value={fmt.brl(crmWon)} color="#22d3ee"/>}
        <KpiCard icon={AlertTriangle}   label={`Atrasados (${summary.overdue_count||0})`}
          value={fmt.brl((parseFloat(summary.income_overdue||0)+parseFloat(summary.expense_overdue||0)))} color="#ef4444"/>
      </div>

      {/* Categoria breakdown */}
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
                      <span style={{ width:10, height:10, borderRadius:3, background:c.color||'#6366f1' }}/>
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
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${evolution.length},minmax(50px,1fr))`, gap:8, overflowX:'auto' }}>
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
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#10b981', borderRadius:2, marginRight:4 }}/>Receitas</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'#ef4444', borderRadius:2, marginRight:4 }}/>Despesas</span>
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {[{v:'',l:'Todos'},{v:'income',l:'📈 Receitas'},{v:'expense',l:'📉 Despesas'}].map(t=>(
            <Btn key={t.v} size="sm" variant={filterType===t.v?'primary':'ghost'} onClick={()=>setFilterType(t.v)}>{t.l}</Btn>
          ))}
          <span style={{ width:1, height:20, background:'var(--border)', margin:'0 4px' }}/>
          {[{v:'',l:'Todos'},{v:'false',l:'⏳ Pendentes'},{v:'true',l:'✅ Pagos'}].map(t=>(
            <Btn key={t.v} size="sm" variant={filterPaid===t.v?'primary':'ghost'} onClick={()=>setFilterPaid(t.v)}>{t.l}</Btn>
          ))}
          <div style={{ flex:1 }}/>
          <select value={filterMethod} onChange={e=>setFilterMethod(e.target.value)}
            style={{ height:30, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.8rem', padding:'0 8px' }}>
            <option value="">Forma: Todas</option>
            {PAY_METHODS.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <select value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}
            style={{ height:30, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.8rem', padding:'0 8px' }}>
            <option value="">Conta: Todas</option>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input value={filterSearch} onChange={e=>setFilterSearch(e.target.value)} placeholder="Buscar..."
            style={{ width:160, height:30, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card2)', color:'var(--text)', fontSize:'.8rem', padding:'0 8px', outline:'none' }}/>
        </div>
      </Card>

      <Card>{loading ? <Spinner/> : <Table columns={cols} data={rows} onRow={row=>row.paid?null:pay(row)}/>}</Card>

      {/* Modal lançamento */}
      <Modal open={modal} onClose={()=>setModal(false)} title={editId?'Editar lançamento':'Novo lançamento'} width={600}>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <Select label="Tipo" value={form.type} onChange={e=>f({type:e.target.value})}>
              <option value="income">Receita</option><option value="expense">Despesa</option>
            </Select>
            <Select label="Forma pgto" value={form.payment_method} onChange={e=>f({payment_method:e.target.value})}>
              <option value="">—</option>
              {PAY_METHODS.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
            </Select>
            <Select label="Conta" value={form.account_id} onChange={e=>f({account_id:e.target.value})}>
              <option value="">—</option>
              {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <Input label="Descrição *" value={form.title} onChange={e=>f({title:e.target.value})} required/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <Input label="Valor (R$) *" type="number" step="0.01" value={form.amount} onChange={e=>f({amount:e.target.value})} required/>
            <Input label="Vencimento *" type="date" value={form.due_date} onChange={e=>f({due_date:e.target.value})} required/>
            <Input label="Parcelas" type="number" min="1" max="48" value={form.installment_total} onChange={e=>f({installment_total:parseInt(e.target.value)||1})}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Select label="Categoria" value={form.category_id} onChange={e=>f({category_id:e.target.value})}>
              <option value="">Selecione...</option>
              {cats.filter(c=>c.type===form.type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Autocomplete label="Vendedor" value={{ label: form.seller_label }}
              fetchFn={fetchSellers}
              onSelect={s => f({ seller_id: s.id, seller_label: s.name })}
              renderOption={s => (<div><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{[s.email, s.phone].filter(Boolean).join(' · ')}</div></div>)}
              placeholder="Buscar vendedor..."
            />
          </div>
          <Autocomplete label="Cliente / Fornecedor" value={{ label: form.client_label }}
            fetchFn={fetchClients}
            onSelect={c => f({ client_id:c.id, client_label:c.name })}
            renderOption={c=>(<div><div style={{ fontWeight:600 }}>{c.name}</div><div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{[c.document,c.phone].filter(Boolean).join(' · ')}</div></div>)}
            placeholder="Buscar por nome, CPF/CNPJ..."
          />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Input label="Documento ref." value={form.document_ref} onChange={e=>f({document_ref:e.target.value})} placeholder="NF-e, NFC-e, etc."/>
            <div style={{ display:'flex', gap:10 }}>
              <Input label="Taxa" type="number" step="0.01" value={form.fee_amount} onChange={e=>f({fee_amount:e.target.value})} placeholder="0" style={{ flex:1 }}/>
              <Input label="Desconto" type="number" step="0.01" value={form.discount_amount} onChange={e=>f({discount_amount:e.target.value})} placeholder="0" style={{ flex:1 }}/>
            </div>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.88rem', cursor:'pointer' }}>
            <input type="checkbox" checked={form.paid} onChange={e=>f({paid:e.target.checked})}/> Já foi pago
          </label>
          {form.paid && <Input label="Data do pagamento" type="date" value={form.paid_date||''} onChange={e=>f({paid_date:e.target.value})}/>}
          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Observações</label>
            <textarea value={form.notes||''} onChange={e=>f({notes:e.target.value})} rows={2}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':(form.installment_total > 1 ? `Salvar (${form.installment_total} parcelas)` : 'Salvar')}</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal categorias */}
      <Modal open={catModal} onClose={()=>setCatModal(false)} title="🏷 Categorias Financeiras" width={560}>
        <FinCategoryManager onRefresh={loadCats}/>
      </Modal>

      {/* Modal contas */}
      <Modal open={acctModal} onClose={()=>{setAcctModal(false);loadAccounts()}} title="🏦 Contas Financeiras" width={520}>
        <AccountManager/>
      </Modal>

      {/* Modal recorrentes */}
      <Modal open={recurModal} onClose={()=>setRecurModal(false)} title="🔁 Despesas Recorrentes" width={600}>
        <RecurringManager cats={cats}/>
      </Modal>

      {/* Modal caixa */}
      <Modal open={cashModal} onClose={()=>setCashModal(false)} title="💵 Caixa do Dia" width={500}>
        <CashRegister onClose={()=>setCashModal(false)}/>
      </Modal>

      {/* Drawer de baixa */}
      {payDrawer && (
        <PayDrawer transaction={payDrawer} accounts={accounts}
          onClose={()=>setPayDrawer(null)} onPaid={()=>{ setPayDrawer(null); load(); loadAccounts() }}/>
      )}
    </div>
  )
}
