import './Financial.css'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Wallet,
} from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import {
  PageHeader,
  Btn,
  Modal,
  Input,
  Select,
  Badge,
  Spinner,
  KpiCard,
  Table,
  Textarea,
  fmt,
  FormRow,
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

const emptyPayForm = {
  paid_date: '',
  paid_amount: '',
  notes: '',
}

function capitalize(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function toLocalDate(value) {
  if (!value) return null
  return new Date(`${String(value).slice(0, 10)}T12:00:00`)
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
}

function dayDistance(value, today = startOfToday()) {
  const date = toLocalDate(value)
  if (!date) return null
  return Math.round((date.getTime() - today.getTime()) / 86400000)
}

function isOverdue(row, today = startOfToday()) {
  const due = toLocalDate(row.due_date)
  return Boolean(!row.paid && due && due < today)
}

function isDueSoon(row, today = startOfToday()) {
  const due = toLocalDate(row.due_date)
  if (!due || row.paid || due < today) return false
  const limit = new Date(today)
  limit.setDate(limit.getDate() + 7)
  return due <= limit
}

function recurrenceLabel(type) {
  return RECURRENCE_TYPES.find((item) => item.value === type)?.label || 'Recorrente'
}

function dueWindowLabel(row, today = startOfToday()) {
  if (row.paid) {
    return row.paid_date ? `Baixada em ${fmt.date(row.paid_date)}` : 'Conta já baixada'
  }

  const delta = dayDistance(row.due_date, today)
  if (delta === null) return 'Sem vencimento definido'
  if (delta < 0) return `${Math.abs(delta)} dia(s) em atraso`
  if (delta === 0) return 'Vence hoje'
  if (delta === 1) return 'Vence amanhã'
  return `Vence em ${delta} dia(s)`
}

function getStatusMeta(row, today = startOfToday()) {
  if (row.paid) {
    return {
      label: 'Paga',
      color: '#10b981',
      detail: row.paid_date ? `Baixada em ${fmt.date(row.paid_date)}` : 'Conta já baixada',
    }
  }
  if (isOverdue(row, today)) {
    return { label: 'Atrasada', color: '#ef4444', detail: 'Requer ação imediata' }
  }
  if (isDueSoon(row, today)) {
    return { label: 'Vence em breve', color: '#f59e0b', detail: 'Dentro dos próximos 7 dias' }
  }
  return { label: 'Pendente', color: '#7c3aed', detail: 'Dentro do prazo' }
}

function buildMonthOptions() {
  const base = new Date()
  base.setDate(1)
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - index, 1)
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    const monthLabel = capitalize(date.toLocaleDateString('pt-BR', { month: 'short' }))
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      month,
      year,
      label: `${monthLabel} ${year}`,
    }
  })
}

export default function Financial() {
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal] = useState(false)
  const [categoriesModal, setCategoriesModal] = useState(false)
  const [payModalRow, setPayModalRow] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [payForm, setPayForm] = useState(emptyPayForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [processingRowId, setProcessingRowId] = useState(null)
  const [filterPaid, setFilterPaid] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const { toast, confirm } = useToast()

  const monthOptions = useMemo(() => buildMonthOptions(), [])
  const periodLabel = useMemo(
    () => capitalize(new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })),
    [month, year]
  )

  const load = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)

    try {
      const params = {
        type: 'expense',
        month,
        year,
      }
      if (filterPaid !== '') params.paid = filterPaid
      if (filterCategory) params.category_id = filterCategory
      const response = await api.get('/transactions', { params })
      setRows(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao carregar contas a pagar')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const loadCategories = async () => {
    try {
      const response = await api.get('/transactions/categories?type=expense')
      setCategories(Array.isArray(response.data) ? response.data : [])
    } catch {
      setCategories([])
    }
  }

  useEffect(() => {
    void load()
  }, [month, year, filterPaid, filterCategory])

  useEffect(() => {
    void loadCategories()
  }, [])

  const openNew = () => {
    const now = new Date()
    setForm({
      ...emptyForm,
      due_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    })
    setEditId(null)
    setModal(true)
  }

  const openEdit = (row) => {
    setForm({
      title: row.title || '',
      amount: String(row.amount || ''),
      due_date: row.due_date ? String(row.due_date).slice(0, 10) : '',
      category_id: row.category_id || '',
      is_recurring: Boolean(row.is_recurring),
      recurrence_type: row.recurrence_type || 'monthly',
      recurrence_end: row.recurrence_end ? String(row.recurrence_end).slice(0, 10) : '',
      notes: row.notes || '',
    })
    setEditId(row.id)
    setModal(true)
  }

  const openPayModal = (row) => {
    const today = new Date()
    setPayModalRow(row)
    setPayForm({
      paid_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
      paid_amount: String(row.amount || ''),
      notes: '',
    })
  }

  const updateForm = (value) => setForm((prev) => ({ ...prev, ...value }))
  const updatePayForm = (value) => setPayForm((prev) => ({ ...prev, ...value }))

  const save = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) return toast.error('Descrição é obrigatória')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Informe um valor válido')
    if (!form.due_date) return toast.error('Data de vencimento é obrigatória')

    setSaving(true)
    try {
      const current = rows.find((row) => row.id === editId)
      const payload = {
        type: 'expense',
        title: form.title.trim(),
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        category_id: form.category_id || null,
        notes: form.notes?.trim() || null,
        paid: current?.paid ?? false,
        paid_date: current?.paid_date ?? null,
        account_id: current?.account_id || null,
        payment_method: current?.payment_method || null,
        client_id: current?.client_id || null,
        seller_id: current?.seller_id || null,
        order_id: current?.order_id || null,
        document_ref: current?.document_ref || null,
        fee_amount: current?.fee_amount ?? 0,
        discount_amount: current?.discount_amount ?? 0,
        is_recurring: Boolean(form.is_recurring),
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
      setForm(emptyForm)
      await load({ silent: true })
      await loadCategories()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar conta')
    } finally {
      setSaving(false)
    }
  }

  const submitPay = async (event) => {
    event.preventDefault()
    if (!payModalRow) return
    if (!payForm.paid_date) return toast.error('Informe a data de pagamento')
    if (!payForm.paid_amount || parseFloat(payForm.paid_amount) <= 0) return toast.error('Informe um valor pago válido')

    setSavingPayment(true)
    try {
      await api.patch(`/transactions/${payModalRow.id}/pay`, {
        paid_date: payForm.paid_date,
        paid_amount: parseFloat(payForm.paid_amount),
        notes: payForm.notes?.trim() || null,
      })
      toast.success('Conta baixada com sucesso')
      setPayModalRow(null)
      setPayForm(emptyPayForm)
      await load({ silent: true })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao baixar conta')
    } finally {
      setSavingPayment(false)
    }
  }

  const togglePaid = async (row) => {
    if (processingRowId) return
    if (!row.paid) {
      openPayModal(row)
      return
    }

    if (!(await confirm('Estornar o pagamento desta conta?'))) return

    setProcessingRowId(row.id)
    try {
      await api.patch(`/transactions/${row.id}/reverse`)
      toast.success('Pagamento estornado')
      await load({ silent: true })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao estornar pagamento')
    } finally {
      setProcessingRowId(null)
    }
  }

  const remove = async (row) => {
    if (!(await confirm('Excluir esta conta?'))) return
    setProcessingRowId(row.id)
    try {
      await api.delete(`/transactions/${row.id}`)
      toast.success('Conta excluída')
      await load({ silent: true })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao excluir conta')
    } finally {
      setProcessingRowId(null)
    }
  }

  const clearFilters = () => {
    setFilterPaid('')
    setFilterCategory('')
    setSearch('')
  }

  const goCurrentMonth = () => {
    const now = new Date()
    setMonth(now.getMonth() + 1)
    setYear(now.getFullYear())
  }

  const visibleRows = useMemo(() => {
    const query = normalizeText(search)
    const sorted = [...rows].sort((left, right) => {
      if (left.paid !== right.paid) return Number(left.paid) - Number(right.paid)
      const leftDate = toLocalDate(left.due_date)?.getTime() || 0
      const rightDate = toLocalDate(right.due_date)?.getTime() || 0
      return leftDate - rightDate
    })
    if (!query) return sorted
    return sorted.filter((row) => normalizeText([
      row.title,
      row.category_name,
      row.notes,
      row.due_date,
      row.recurrence_type,
    ].join(' ')).includes(query))
  }, [rows, search])

  const summary = useMemo(() => {
    const today = startOfToday()
    const pendingRows = visibleRows.filter((row) => !row.paid)
    const overdueRows = pendingRows.filter((row) => isOverdue(row, today))
    const dueSoonRows = pendingRows.filter((row) => isDueSoon(row, today))
    const paidRows = visibleRows.filter((row) => row.paid)

    const totalPending = pendingRows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
    const totalOverdue = overdueRows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
    const totalDueSoon = dueSoonRows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
    const totalPaid = paidRows.reduce((sum, row) => sum + parseFloat(row.paid_amount || row.amount || 0), 0)
    const listedTotal = visibleRows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
    const recurring = visibleRows.filter((row) => row.is_recurring).length
    const avgPending = pendingRows.length ? totalPending / pendingRows.length : 0

    return {
      pending: pendingRows.length,
      totalPending,
      overdue: overdueRows.length,
      totalOverdue,
      dueSoon: dueSoonRows.length,
      totalDueSoon,
      paid: paidRows.length,
      totalPaid,
      listedTotal,
      recurring,
      avgPending,
    }
  }, [visibleRows])

  const upcomingRows = useMemo(() => {
    const today = startOfToday()
    return visibleRows
      .filter((row) => !row.paid && !isOverdue(row, today))
      .sort((left, right) => (toLocalDate(left.due_date)?.getTime() || 0) - (toLocalDate(right.due_date)?.getTime() || 0))
      .slice(0, 6)
  }, [visibleRows])

  const overdueRows = useMemo(() => {
    const today = startOfToday()
    return visibleRows
      .filter((row) => isOverdue(row, today))
      .sort((left, right) => (toLocalDate(left.due_date)?.getTime() || 0) - (toLocalDate(right.due_date)?.getTime() || 0))
      .slice(0, 4)
  }, [visibleRows])

  const categoryHighlights = useMemo(() => {
    const bucket = new Map()
    for (const row of visibleRows) {
      const key = row.category_name || 'Sem categoria'
      if (!bucket.has(key)) {
        bucket.set(key, {
          name: key,
          color: row.category_color || '#6b7280',
          total: 0,
          count: 0,
        })
      }
      const current = bucket.get(key)
      current.total += parseFloat(row.amount || 0)
      current.count += 1
    }

    const total = visibleRows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0) || 1
    return [...bucket.values()]
      .sort((left, right) => right.total - left.total)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        share: Math.max(8, Math.round((item.total / total) * 100)),
      }))
  }, [visibleRows])

  const hasActiveFilters = filterPaid !== '' || filterCategory !== '' || search.trim() !== ''
  const headerMeta = visibleRows.length === rows.length
    ? `${fmt.num(visibleRows.length)} contas exibidas no período.`
    : `${fmt.num(visibleRows.length)} de ${fmt.num(rows.length)} contas após a busca.`
  const columns = [
    {
      key: 'title',
      label: 'Conta',
      render: (_, row) => (
        <div className="financial-title-cell">
          <div className="financial-title-cell__main">{row.title}</div>
          <div className="financial-title-cell__meta">
            <Badge color={row.category_color || '#6b7280'} size="xs">{row.category_name || 'Sem categoria'}</Badge>
            {row.is_recurring && <Badge color="#8b5cf6" size="xs">{recurrenceLabel(row.recurrence_type)}</Badge>}
          </div>
          {row.notes ? <div className="financial-title-cell__note">{row.notes}</div> : null}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const status = getStatusMeta(row)
        return (
          <div className="financial-status-cell">
            <div className="financial-status-row">
              <span className="financial-dot" style={{ background: status.color }} />
              <Badge color={status.color} size="xs">{status.label}</Badge>
            </div>
            <span className="financial-subtext">{status.detail}</span>
          </div>
        )
      },
    },
    {
      key: 'due_date',
      label: 'Vencimento',
      render: (_, row) => (
        <div className="financial-date-cell">
          <strong style={{ color: isOverdue(row) ? '#ef4444' : 'var(--text)', fontSize: '0.98rem' }}>{fmt.date(row.due_date)}</strong>
          <span className="financial-subtext">{dueWindowLabel(row)}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Valor',
      render: (_, row) => {
        const effectiveValue = row.paid ? row.paid_amount ?? row.amount : row.amount
        const changedValue = row.paid && row.paid_amount && Number(row.paid_amount) !== Number(row.amount)
        return (
          <div className="financial-value-cell">
            <strong>{fmt.brl(effectiveValue)}</strong>
            <span className="financial-subtext">{changedValue ? `Original ${fmt.brl(row.amount)}` : row.document_ref ? `Doc. ${row.document_ref}` : 'Sem ajustes financeiros'}</span>
          </div>
        )
      },
    },
    {
      key: 'id',
      label: 'Ações',
      render: (_, row) => (
        <div className="financial-row-actions" onClick={(event) => event.stopPropagation()}>
          <Btn
            size="sm"
            variant={row.paid ? 'secondary' : 'primary'}
            disabled={processingRowId === row.id}
            onClick={() => void togglePaid(row)}
            icon={row.paid
              ? <RefreshCw size={14} className={processingRowId === row.id ? 'financial-spin' : ''} />
              : <CheckCircle2 size={14} />}
          >
            {row.paid ? 'Estornar' : 'Baixar'}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => openEdit(row)} icon={<Pencil size={14} />}>
            Editar
          </Btn>
          <Btn
            size="sm"
            variant="ghost"
            disabled={processingRowId === row.id}
            onClick={() => void remove(row)}
            icon={<Trash2 size={14} />}
            style={{ color: '#ef4444' }}
          >
            Excluir
          </Btn>
        </div>
      ),
    },
  ]

  return (
    <div className="page financial-page" style={{ minWidth: 0 }}>
      <PageHeader
        title="Contas a pagar"
        subtitle="Organize vencimentos, baixe despesas e acompanhe o peso financeiro do mês com mais clareza."
        icon={Wallet}
        action={<Btn onClick={openNew} icon={<Plus size={14} />}>Nova conta</Btn>}
      />

      <div className="financial-hero">
        <section className="financial-panel financial-panel--accent">
          <div className="financial-panel__eyebrow">
            <ReceiptText size={14} />
            Panorama do período
          </div>
          <h2 className="financial-panel__title">Fechamento de {periodLabel}</h2>
          <p className="financial-panel__desc">
            {summary.pending > 0
              ? `${fmt.num(summary.pending)} contas seguem em aberto, somando ${fmt.brl(summary.totalPending)} neste recorte.`
              : `Nenhuma pendência aberta em ${periodLabel.toLowerCase()}.`}
          </p>
          <div className="financial-chip-row">
            <div className="financial-chip">
              <CalendarDays size={14} />
              Total listado <strong>{fmt.brl(summary.listedTotal)}</strong>
            </div>
            <div className="financial-chip">
              <CheckCircle2 size={14} />
              Quitadas <strong>{fmt.brl(summary.totalPaid)}</strong>
            </div>
            <div className="financial-chip">
              <Clock3 size={14} />
              Ticket médio pendente <strong>{fmt.brl(summary.avgPending)}</strong>
            </div>
            <div className="financial-chip">
              <ReceiptText size={14} />
              Recorrentes <strong>{fmt.num(summary.recurring)}</strong>
            </div>
          </div>
        </section>

        <section className="financial-panel">
          <div className="financial-panel__eyebrow">
            <Settings2 size={14} />
            Filtros e ações
          </div>
          <h2 className="financial-panel__title">Refine a agenda financeira</h2>
          <p className="financial-panel__desc">
            Selecione a competência, isole o status desejado e encontre rapidamente uma despesa específica.
          </p>
          <div className="financial-toolbar">
            <Select
              label="Competência"
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={(event) => {
                const [nextYear, nextMonth] = event.target.value.split('-')
                setYear(Number(nextYear))
                setMonth(Number(nextMonth))
              }}
            >
              {monthOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </Select>

            <Select label="Status" value={filterPaid} onChange={(event) => setFilterPaid(event.target.value)}>
              <option value="">Todos</option>
              <option value="false">Pendentes</option>
              <option value="true">Pagas</option>
            </Select>

            <Select label="Categoria" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>

            <div className="financial-toolbar__search">
              <Input
                label="Buscar"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar por descrição, categoria ou observações"
                prefix={<Search size={15} />}
              />
            </div>
          </div>
          <div className="financial-toolbar__actions">
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => void load({ silent: true })}
              icon={<RefreshCw size={14} className={refreshing ? 'financial-spin' : ''} />}
            >
              Atualizar
            </Btn>
            <Btn variant="ghost" size="sm" onClick={goCurrentMonth}>
              Ir para o mês atual
            </Btn>
            {hasActiveFilters && (
              <Btn variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Btn>
            )}
            <Btn variant="ghost" size="sm" onClick={() => setCategoriesModal(true)} icon={<Settings2 size={14} />}>
              Categorias
            </Btn>
          </div>
        </section>
      </div>

      <div className="financial-kpi-grid">
        <KpiCard icon={Wallet} label="Pendentes" value={fmt.num(summary.pending)} sub={fmt.brl(summary.totalPending)} color="#f59e0b" />
        <KpiCard icon={AlertTriangle} label="Atrasadas" value={fmt.num(summary.overdue)} sub={fmt.brl(summary.totalOverdue)} color="#ef4444" />
        <KpiCard icon={Clock3} label="Vencem em 7 dias" value={fmt.num(summary.dueSoon)} sub={fmt.brl(summary.totalDueSoon)} color="#06b6d4" />
        <KpiCard icon={CheckCircle2} label="Quitadas" value={fmt.num(summary.paid)} sub={fmt.brl(summary.totalPaid)} color="#10b981" />
      </div>

      <div className="financial-main">
        <section className="financial-panel">
          <div className="financial-list-header">
            <div>
              <h2 className="financial-panel__title" style={{ fontSize: '1.18rem' }}>Agenda do período</h2>
              <div className="financial-list-header__meta">{headerMeta}</div>
            </div>
            <div className="financial-pill-row">
              <div className="financial-pill">Pendentes <strong>{fmt.brl(summary.totalPending)}</strong></div>
              <div className="financial-pill">Quitadas <strong>{fmt.brl(summary.totalPaid)}</strong></div>
              <div className="financial-pill">Vencem em breve <strong>{fmt.num(summary.dueSoon)}</strong></div>
            </div>
          </div>

          {loading ? (
            <Spinner text="Carregando contas do período" />
          ) : visibleRows.length === 0 ? (
            <div className="financial-empty">
              <ReceiptText size={30} />
              <strong>{rows.length === 0 ? 'Nenhuma conta cadastrada neste período.' : 'Nenhuma conta encontrada com os filtros atuais.'}</strong>
              <span>{rows.length === 0 ? 'Cadastre a primeira despesa para começar a acompanhar a agenda financeira.' : 'Ajuste os filtros ou limpe a busca para voltar a ver a lista completa.'}</span>
              {rows.length === 0 ? (
                <Btn onClick={openNew} icon={<Plus size={14} />}>Lançar primeira conta</Btn>
              ) : hasActiveFilters ? (
                <Btn variant="ghost" onClick={clearFilters}>Limpar filtros</Btn>
              ) : null}
            </div>
          ) : (
            <>
              <div className="financial-table-shell financial-desktop-table">
                <Table columns={columns} data={visibleRows} onRow={openEdit} />
              </div>

              <div className="financial-mobile-list">
                {visibleRows.map((row) => {
                  const status = getStatusMeta(row)
                  const effectiveValue = row.paid ? row.paid_amount ?? row.amount : row.amount
                  return (
                    <article key={row.id} className="financial-mobile-card">
                      <div className="financial-mobile-card__top">
                        <div>
                          <div className="financial-title-cell__main">{row.title}</div>
                          <div className="financial-mobile-card__meta">
                            <Badge color={row.category_color || '#6b7280'} size="xs">{row.category_name || 'Sem categoria'}</Badge>
                            {row.is_recurring && <Badge color="#8b5cf6" size="xs">{recurrenceLabel(row.recurrence_type)}</Badge>}
                          </div>
                        </div>
                        <Badge color={status.color} size="xs">{status.label}</Badge>
                      </div>

                      {row.notes ? <div className="financial-title-cell__note" style={{ marginTop: 10 }}>{row.notes}</div> : null}

                      <div className="financial-mobile-card__bottom" style={{ marginTop: 14 }}>
                        <div>
                          <div className="financial-subtext">Vencimento</div>
                          <strong style={{ color: isOverdue(row) ? '#ef4444' : 'var(--text)' }}>{fmt.date(row.due_date)}</strong>
                          <div className="financial-subtext">{dueWindowLabel(row)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="financial-subtext">Valor</div>
                          <strong>{fmt.brl(effectiveValue)}</strong>
                          <div className="financial-subtext">{status.detail}</div>
                        </div>
                      </div>

                      <div className="financial-mobile-card__actions">
                        <Btn
                          size="sm"
                          variant={row.paid ? 'secondary' : 'primary'}
                          disabled={processingRowId === row.id}
                          onClick={() => void togglePaid(row)}
                          icon={row.paid
                            ? <RefreshCw size={14} className={processingRowId === row.id ? 'financial-spin' : ''} />
                            : <CheckCircle2 size={14} />}
                        >
                          {row.paid ? 'Estornar' : 'Baixar'}
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => openEdit(row)} icon={<Pencil size={14} />}>
                          Editar
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => void remove(row)} icon={<Trash2 size={14} />} style={{ color: '#ef4444' }}>
                          Excluir
                        </Btn>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <aside className="financial-side-stack">
          <section className="financial-panel">
            <div className="financial-panel__eyebrow">
              <Clock3 size={14} />
              Próximos vencimentos
            </div>
            <h2 className="financial-panel__title" style={{ fontSize: '1.08rem' }}>O que vence primeiro</h2>
            <p className="financial-panel__desc">Priorize as próximas baixas e evite virar contas simples em atraso.</p>
            <div className="financial-mini-list">
              {upcomingRows.length === 0 ? (
                <div className="financial-subtext">Nenhuma conta pendente futura dentro deste recorte.</div>
              ) : upcomingRows.map((row) => (
                <div key={row.id} className="financial-mini-item">
                  <div>
                    <strong>{row.title}</strong>
                    <div className="financial-subtext">{fmt.date(row.due_date)} · {row.category_name || 'Sem categoria'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="financial-mini-item__value">{fmt.brl(row.amount)}</div>
                    <div className="financial-subtext">{dueWindowLabel(row)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="financial-panel">
            <div className="financial-panel__eyebrow">
              <AlertTriangle size={14} />
              Ponto de atenção
            </div>
            <h2 className="financial-panel__title" style={{ fontSize: '1.08rem' }}>Contas atrasadas</h2>
            <p className="financial-panel__desc">Essas despesas já passaram do vencimento e merecem tratamento imediato.</p>
            <div className="financial-mini-list">
              {overdueRows.length === 0 ? (
                <div className="financial-subtext">Nenhuma conta atrasada neste período.</div>
              ) : overdueRows.map((row) => (
                <div key={row.id} className="financial-mini-item">
                  <div>
                    <strong>{row.title}</strong>
                    <div className="financial-subtext">{fmt.date(row.due_date)} · {row.category_name || 'Sem categoria'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="financial-mini-item__value" style={{ color: '#ef4444' }}>{fmt.brl(row.amount)}</div>
                    <div className="financial-subtext">{dueWindowLabel(row)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="financial-panel">
            <div className="financial-panel__eyebrow">
              <ReceiptText size={14} />
              Peso por categoria
            </div>
            <h2 className="financial-panel__title" style={{ fontSize: '1.08rem' }}>Onde o caixa está concentrado</h2>
            <p className="financial-panel__desc">Use este resumo para enxergar rápido quais categorias dominam a saída do mês.</p>
            <div className="financial-mini-list">
              {categoryHighlights.length === 0 ? (
                <div className="financial-subtext">Sem categorias para analisar no período atual.</div>
              ) : categoryHighlights.map((item) => (
                <div key={item.name} className="financial-mini-item" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>{item.name}</strong>
                      <div className="financial-subtext">{fmt.num(item.count)} lançamento(s)</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="financial-mini-item__value">{fmt.brl(item.total)}</div>
                      <div className="financial-subtext">{fmt.pct(item.share)}</div>
                    </div>
                  </div>
                  <div className="financial-category-bar">
                    <span style={{ width: `${item.share}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar conta' : 'Nova conta a pagar'} width={620}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Descrição"
            value={form.title}
            onChange={(event) => updateForm({ title: event.target.value })}
            placeholder="Ex.: aluguel da loja, mídia paga, fornecedor principal"
            required
          />

          <FormRow cols={2}>
            <Input
              label="Valor"
              type="number"
              step="0.01"
              min="0"
              prefix="R$"
              value={form.amount}
              onChange={(event) => updateForm({ amount: event.target.value })}
              required
            />
            <Input
              label="Vencimento"
              type="date"
              value={form.due_date}
              onChange={(event) => updateForm({ due_date: event.target.value })}
              required
            />
          </FormRow>

          <Select label="Categoria" value={form.category_id} onChange={(event) => updateForm({ category_id: event.target.value || '' })}>
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text)', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(event) => updateForm({ is_recurring: event.target.checked })}
            />
            Repetir automaticamente esta conta
          </label>

          {form.is_recurring && (
            <FormRow cols={2}>
              <Select label="Frequência" value={form.recurrence_type} onChange={(event) => updateForm({ recurrence_type: event.target.value })}>
                {RECURRENCE_TYPES.filter((item) => item.value).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
              <Input
                label="Encerrar em"
                type="date"
                value={form.recurrence_end}
                onChange={(event) => updateForm({ recurrence_end: event.target.value })}
              />
            </FormRow>
          )}

          <Textarea
            label="Observações"
            value={form.notes}
            onChange={(event) => updateForm({ notes: event.target.value })}
            rows={4}
            placeholder="Anotações úteis para a equipe financeira."
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar conta'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(payModalRow)} onClose={() => !savingPayment && setPayModalRow(null)} title="Baixar conta" width={540}>
        {payModalRow && (
          <form onSubmit={submitPay} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="financial-chip-row" style={{ marginTop: 0 }}>
              <div className="financial-chip">
                <ReceiptText size={14} />
                Conta <strong>{payModalRow.title}</strong>
              </div>
              <div className="financial-chip">
                <CalendarDays size={14} />
                Vencimento <strong>{fmt.date(payModalRow.due_date)}</strong>
              </div>
              <div className="financial-chip">
                <Wallet size={14} />
                Original <strong>{fmt.brl(payModalRow.amount)}</strong>
              </div>
            </div>

            <FormRow cols={2}>
              <Input
                label="Data de pagamento"
                type="date"
                value={payForm.paid_date}
                onChange={(event) => updatePayForm({ paid_date: event.target.value })}
                required
              />
              <Input
                label="Valor pago"
                type="number"
                step="0.01"
                min="0"
                prefix="R$"
                value={payForm.paid_amount}
                onChange={(event) => updatePayForm({ paid_amount: event.target.value })}
                required
              />
            </FormRow>

            <Textarea
              label="Observações da baixa"
              value={payForm.notes}
              onChange={(event) => updatePayForm({ notes: event.target.value })}
              rows={4}
              placeholder="Ex.: desconto negociado, ajuste manual, observação bancária."
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setPayModalRow(null)} disabled={savingPayment}>Cancelar</Btn>
              <Btn type="submit" disabled={savingPayment} icon={<CheckCircle2 size={14} />}>
                {savingPayment ? 'Baixando...' : 'Confirmar baixa'}
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <CategoriesModal
        open={categoriesModal}
        onClose={() => setCategoriesModal(false)}
        categories={categories}
        loadCategories={loadCategories}
        toast={toast}
        confirm={confirm}
      />
    </div>
  )
}

function CategoriesModal({ open, onClose, categories, loadCategories, toast, confirm }) {
  const [form, setForm] = useState({ name: '', color: '#7c3aed' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const add = async (event) => {
    event.preventDefault()
    if (!form.name?.trim()) return toast.error('Nome da categoria é obrigatório')
    setSaving(true)
    try {
      await api.post('/transactions/categories', { name: form.name.trim(), type: 'expense', color: form.color })
      toast.success('Categoria adicionada')
      setForm({ name: '', color: '#7c3aed' })
      await loadCategories()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao adicionar categoria')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (category) => {
    if (!(await confirm(`Excluir a categoria "${category.name}"?`))) return
    setDeletingId(category.id)
    try {
      await api.delete(`/transactions/categories/${category.id}`)
      toast.success('Categoria removida')
      await loadCategories()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao excluir categoria')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Categorias de contas a pagar" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p className="financial-panel__desc" style={{ marginTop: 0, maxWidth: 'none' }}>
          Centralize aqui as categorias usadas pela equipe financeira para manter o lançamento das despesas mais consistente.
        </p>

        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10, alignItems: 'end' }}>
          <Input
            label="Nova categoria"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Ex.: aluguel, marketing, fornecedores"
          />
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Cor
            </label>
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
              style={{ width: 48, height: 42, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card3)', cursor: 'pointer' }}
            />
          </div>
          <Btn type="submit" disabled={saving} icon={<Plus size={14} />}>
            {saving ? 'Salvando...' : 'Adicionar'}
          </Btn>
        </form>

        <div className="financial-mini-list">
          {categories.length === 0 ? (
            <div className="financial-subtext">Nenhuma categoria cadastrada até agora.</div>
          ) : categories.map((category) => (
            <div key={category.id} className="financial-mini-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="financial-dot" style={{ background: category.color || '#7c3aed', boxShadow: 'none' }} />
                <div>
                  <strong>{category.name}</strong>
                  <div className="financial-subtext">Disponível para lançamentos de despesa</div>
                </div>
              </div>
              <Btn
                size="sm"
                variant="ghost"
                disabled={deletingId === category.id}
                onClick={() => void remove(category)}
                icon={<Trash2 size={14} />}
                style={{ color: '#ef4444' }}
              >
                Excluir
              </Btn>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
