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

function getStatusMeta(row, today = startOfToday()) {
  if (row.paid) return { label: 'Paga', color: '#10b981', detail: row.paid_date ? `Baixada em ${fmt.date(row.paid_date)}` : 'Conta já baixada' }
  if (isOverdue(row, today)) return { label: 'Atrasada', color: '#ef4444', detail: 'Requer ação imediata' }
  if (isDueSoon(row, today)) return { label: 'Vence em breve', color: '#f59e0b', detail: 'Dentro dos próximos 7 dias' }
  return { label: 'Pendente', color: '#7c3aed', detail: 'Dentro do prazo' }
}

function buildMonthOptions() {
  const base = new Date()
  base.setDate(1)
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - index, 1)
    const month = date.getMonth() + 1
    const year = date.getFullYear()
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      month,
      year,
      label: capitalize(date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })),
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
      const payload = {
        type: 'expense',
        title: form.title.trim(),
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        category_id: form.category_id || null,
        notes: form.notes?.trim() || null,
        paid: false,
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