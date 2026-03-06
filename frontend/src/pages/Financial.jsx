/**
 * Módulo Financeiro: Contas a pagar com categorias e contas recorrentes.
 */
import { useEffect, useState, useMemo } from 'react'
import { Wallet, Settings2 } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import {
  PageHeader, Btn, Modal, Input, Select, Badge, Spinner, KpiCard, fmt, FormRow
} from '../components/UI'

const RECURRENCE_TYPES = [
  { value: '', label: 'Não recorrente' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
]

const emptyForm = {
  title: '',
  amount: '',
  due_date: '',
  category_id: '',
  is_recurring: false,
  recurrence_type: 'monthly',
  recurrence_end: '',
  notes: '',
}

export default function Financial() {
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [categoriesModal, setCategoriesModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterPaid, setFilterPaid] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const { toast, confirm } = useToast()

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams({ type: 'expense', month, year })
    if (filterPaid !== '') params.set('paid', filterPaid)
    if (filterCategory) params.set('category_id', filterCategory)
    api.get(`/transactions?${params}`)
      .then(r => setRows(r.data))
      .catch(() => toast.error('Erro ao carregar'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    api.get('/transactions/categories?type=expense')
      .then(r => setCategories(r.data))
      .catch(() => setCategories([]))
  }

  useEffect(() => { load() }, [month, year, filterPaid, filterCategory])
  useEffect(() => { loadCategories() }, [])

  const openNew = () => {
    const d = new Date()
    setForm({
      ...emptyForm,
      due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    })
    setEditId(null)
    setModal(true)
  }

  const openEdit = row => {
    setForm({
      title: row.title || '',
      amount: String(row.amount || ''),
      due_date: row.due_date ? row.due_date.slice(0, 10) : '',
      category_id: row.category_id || '',
      is_recurring: !!row.is_recurring,
      recurrence_type: row.recurrence_type || 'monthly',
      recurrence_end: row.recurrence_end ? row.recurrence_end.slice(0, 10) : '',
      notes: row.notes || '',
    })
    setEditId(row.id)
    setModal(true)
  }

  const f = v => setForm(p => ({ ...p, ...v }))

  const save = async e => {
    e.preventDefault()
    if (!form.title?.trim()) return toast.error('Descrição é obrigatória')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Valor inválido')
    if (!form.due_date) return toast.error('Data de vencimento é obrigatória')
    setSaving(true)
    try {
      const payload = {
        type: 'expense',
        title: form.title.trim(),
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        category_id: form.category_id || null,
        notes: form.notes || null,
        paid: false,
        is_recurring: !!form.is_recurring,
        recurrence_type: form.is_recurring ? (form.recurrence_type || 'monthly') : null,
        recurrence_end: form.is_recurring && form.recurrence_end ? form.recurrence_end : null,
      }
      if (editId) {
        await api.put(`/transactions/${editId}`, payload)
        toast.success('Conta atualizada')
      } else {
        await api.post('/transactions', payload)
        toast.success('Conta cadastrada')
      }
      setModal(false)
      load()
      loadCategories()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const togglePaid = async row => {
    try {
      if (row.paid) {
        await api.patch(`/transactions/${row.id}/reverse`)
        toast.success('Marcada como não paga')
      } else {
        await api.patch(`/transactions/${row.id}/pay`, {
          paid_date: new Date().toISOString().slice(0, 10),
        })
        toast.success('Marcada como paga')
      }
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    }
  }

  const del = async row => {
    if (!(await confirm('Excluir esta conta?'))) return
    try {
      await api.delete(`/transactions/${row.id}`)
      toast.success('Excluída')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    }
  }

  const kpis = useMemo(() => {
    const pending = rows.filter(r => !r.paid)
    const totalPending = pending.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
    const overdue = pending.filter(r => new Date(r.due_date) < new Date())
    const totalOverdue = overdue.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
    return {
      pending: pending.length,
      totalPending,
      overdue: overdue.length,
      totalOverdue,
    }
  }, [rows])

  const cols = [
    {
      key: 'paid',
      label: '',
      render: (_, row) => (
        <button
          type="button"
          onClick={() => togglePaid(row)}
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            border: `2px solid ${row.paid ? '#10b981' : 'var(--border)'}`,
            background: row.paid ? '#10b981' : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {row.paid && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
        </button>
      ),
    },
    {
      key: 'title',
      label: 'Descrição',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.title}</div>
          {row.is_recurring && (
            <Badge color="#8b5cf6" size="xs">Recorrente ({row.recurrence_type === 'monthly' ? 'Mensal' : row.recurrence_type === 'weekly' ? 'Semanal' : 'Anual'})</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'category_name',
      label: 'Categoria',
      render: (_, row) =>
        row.category_name ? (
          <Badge color={row.category_color || '#6b7280'} size="xs">{row.category_name}</Badge>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        ),
    },
    {
      key: 'due_date',
      label: 'Vencimento',
      render: (_, row) => {
        const overdue = !row.paid && new Date(row.due_date) < new Date()
        return (
          <span style={{ color: overdue ? '#ef4444' : 'inherit' }}>
            {row.due_date ? fmt.date(row.due_date) : '—'}
            {overdue && ' (atrasada)'}
          </span>
        )
      },
    },
    {
      key: 'amount',
      label: 'Valor',
      render: (_, row) => (
        <span style={{ fontWeight: 700 }}>{fmt.brl(row.amount)}</span>
      ),
    },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <Btn size="sm" variant="ghost" onClick={() => openEdit(row)} title="Editar">✏️</Btn>
          <Btn size="sm" variant="ghost" onClick={() => del(row)} title="Excluir" style={{ color: '#ef4444' }}>🗑</Btn>
        </div>
      ),
    },
  ]

  return (
    <div className="page" style={{ minWidth: 0 }}>
      <PageHeader
        title="Contas a pagar"
        subtitle="Gerencie suas despesas, categorias e contas recorrentes"
        icon={Wallet}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" onClick={() => setCategoriesModal(true)}>
              <Settings2 size={14} style={{ marginRight: 4 }} /> Categorias
            </Btn>
            <Btn onClick={openNew}>+ Nova conta</Btn>
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Select
          label="Mês/Ano"
          value={`${year}-${String(month).padStart(2, '0')}`}
          onChange={e => {
            const [y, m] = e.target.value.split('-')
            setYear(parseInt(y))
            setMonth(parseInt(m))
          }}
          style={{ width: 140 }}
        >
          {Array.from({ length: 24 }, (_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const m = d.getMonth() + 1
            const y = d.getFullYear()
            return (
              <option key={`${y}-${m}`} value={`${y}-${String(m).padStart(2, '0')}`}>
                {d.toLocaleString('pt-BR', { month: 'short' })} {y}
              </option>
            )
          })}
        </Select>
        <Select
          label="Status"
          value={filterPaid}
          onChange={e => setFilterPaid(e.target.value)}
          style={{ width: 140 }}
        >
          <option value="">Todos</option>
          <option value="false">Pendentes</option>
          <option value="true">Pagas</option>
        </Select>
        <Select
          label="Categoria"
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">Todas</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard icon={Wallet} label="Pendentes" value={kpis.pending} color="#f59e0b" />
        <KpiCard icon={Wallet} label="Total pendente" value={fmt.brl(kpis.totalPending)} color="#f59e0b" />
        <KpiCard icon={Wallet} label="Atrasadas" value={kpis.overdue} color="#ef4444" />
        <KpiCard icon={Wallet} label="Total atrasado" value={fmt.brl(kpis.totalOverdue)} color="#ef4444" />
      </div>

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
          Nenhuma conta a pagar no período.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                {cols.map(c => (
                  <th key={c.key} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: row.paid ? 0.7 : 1,
                  }}
                >
                  {cols.map(c => (
                    <td key={c.key} style={{ padding: '12px 16px', fontSize: '.88rem' }}>
                      {c.render ? c.render(row[c.key], row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nova/Editar conta */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar conta' : 'Nova conta a pagar'} width={480}>
        <form onSubmit={save}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Descrição *" value={form.title} onChange={e => f({ title: e.target.value })} placeholder="Ex: Aluguel, Luz" required />
            <FormRow cols={2}>
              <Input label="Valor (R$) *" type="number" step="0.01" value={form.amount} onChange={e => f({ amount: e.target.value })} placeholder="0,00" required />
              <Input label="Vencimento *" type="date" value={form.due_date} onChange={e => f({ due_date: e.target.value })} required />
            </FormRow>
            <Select label="Categoria" value={form.category_id} onChange={e => f({ category_id: e.target.value || '' })}>
              <option value="">— Selecione —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_recurring} onChange={e => f({ is_recurring: e.target.checked })} />
              Conta recorrente
            </label>
            {form.is_recurring && (
              <FormRow cols={2}>
                <Select label="Recorrência" value={form.recurrence_type} onChange={e => f({ recurrence_type: e.target.value })}>
                  {RECURRENCE_TYPES.filter(r => r.value).map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
                <Input label="Até (data)" type="date" value={form.recurrence_end} onChange={e => f({ recurrence_end: e.target.value })} />
              </FormRow>
            )}
            <Input label="Observações" value={form.notes} onChange={e => f({ notes: e.target.value })} placeholder="Opcional" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
            <Btn type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal Categorias */}
      <CategoriesModal
        open={categoriesModal}
        onClose={() => setCategoriesModal(false)}
        categories={categories}
        loadCategories={loadCategories}
        toast={toast}
      />
    </div>
  )
}

function CategoriesModal({ open, onClose, categories, loadCategories, toast }) {
  const [form, setForm] = useState({ name: '', color: '#7c3aed' })
  const [saving, setSaving] = useState(false)

  const add = async e => {
    e.preventDefault()
    if (!form.name?.trim()) return toast.error('Nome é obrigatório')
    setSaving(true)
    try {
      await api.post('/transactions/categories', { name: form.name.trim(), type: 'expense', color: form.color })
      toast.success('Categoria adicionada')
      setForm({ name: '', color: '#7c3aed' })
      loadCategories()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const remove = async id => {
    try {
      await api.delete(`/transactions/categories/${id}`)
      toast.success('Categoria removida')
      loadCategories()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    }
  }

  if (!open) return null

  return (
    <Modal open onClose={onClose} title="Categorias de contas a pagar" width={420}>
      <form onSubmit={add} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Aluguel, Fornecedores"
            style={{ flex: 1 }}
          />
          <input
            type="color"
            value={form.color}
            onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
            style={{ width: 44, height: 38, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
          />
          <Btn type="submit" size="sm" disabled={saving}>+ Adicionar</Btn>
        </div>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categories.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Nenhuma categoria cadastrada</div>
        ) : (
          categories.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--bg-card2)',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: 4, background: c.color || '#7c3aed' }} />
                <span style={{ fontWeight: 600 }}>{c.name}</span>
              </div>
              <Btn size="xs" variant="danger" onClick={() => remove(c.id)}>Excluir</Btn>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
