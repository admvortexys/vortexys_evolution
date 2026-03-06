/**
 * Propostas comerciais: orçamentos enviados ao cliente. Status: rascunho, enviada, aprovada, rejeitada.
 */
import { useEffect, useState, useRef } from 'react'
import { FileText, Search, Trash2, Send, Check, X, Loader2 } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Input, Select, Badge, Spinner, Textarea, fmt, Autocomplete } from '../components/UI'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'sent', label: 'Enviada' },
  { value: 'approved', label: 'Aprovada' },
  { value: 'rejected', label: 'Rejeitada' },
]

const STATUS_MAP = {
  draft:    { label: 'Rascunho', color: '#6b7280' },
  sent:     { label: 'Enviada',  color: '#3b82f6' },
  approved: { label: 'Aprovada', color: '#10b981' },
  rejected: { label: 'Rejeitada', color: '#ef4444' },
}

function ProductSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setProducts([]); setOpen(false); return }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.get('/products/search', { params: { q: query } })
        setProducts(r.data)
        setOpen(true)
      } catch { setProducts([]) }
      finally { setLoading(false) }
    }, 280)
  }, [query])

  const handleSelect = p => {
    onSelect({
      product_id: p.id,
      product_name: p.name,
      quantity: 1,
      unit_price: parseFloat(p.sale_price) || 0,
      discount: 0,
    })
    setQuery('')
    setProducts([])
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}/>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar produto para adicionar..."
          style={{
            background: 'var(--bg-card2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text)',
            padding: '10px 36px 10px 36px', fontSize: '.875rem',
            outline: 'none', width: '100%', transition: 'border-color .15s',
          }}
        />
        {loading && (
          <Loader2 size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', animation: 'spin .7s linear infinite' }}/>
        )}
      </div>
      {open && products.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {products.map(p => (
            <div
              key={p.id}
              onMouseDown={() => handleSelect(p)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                fontSize: '.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span>{p.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{fmt.brl(p.sale_price)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Proposals() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [leads, setLeads] = useState([])
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()

  const [form, setForm] = useState({
    title: '',
    lead_id: '',
    client_id: '',
    client_label: '',
    items: [],
    discount: 0,
    notes: '',
    valid_until: '',
  })

  const load = () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)
    setLoading(true)
    api.get(`/proposals?${params}`).then(r => setRows(r.data)).finally(() => setLoading(false))
  }

  const loadLeads = () => api.get('/leads?status=open').then(r => setLeads(r.data)).catch(() => setLeads([]))

  useEffect(() => { load() }, [statusFilter, search])
  useEffect(() => { loadLeads() }, [])

  const openNew = () => {
    setForm({
      title: '',
      lead_id: '',
      client_id: '',
      client_label: '',
      items: [],
      discount: 0,
      notes: '',
      valid_until: '',
    })
    setEditId(null)
    setModal(true)
    api.get('/proposals/next-number').then(r => setForm(p => ({ ...p, number: r.data.number }))).catch(() => {})
  }

  const openEdit = row => {
    if (row.status !== 'draft') return
    setForm({
      title: row.title,
      lead_id: row.lead_id || '',
      client_id: row.client_id || '',
      client_label: row.client_name || '',
      items: Array.isArray(row.items) ? row.items.map(it => ({
        product_id: it.product_id,
        product_name: it.product_name || it.name || '—',
        quantity: it.quantity ?? 1,
        unit_price: it.unit_price ?? it.price ?? 0,
        discount: it.discount ?? 0,
      })) : [],
      discount: row.discount ?? 0,
      notes: row.notes || '',
      valid_until: row.valid_until ? row.valid_until.slice(0, 10) : '',
    })
    setEditId(row.id)
    setModal(true)
  }

  const f = v => setForm(p => ({ ...p, ...v }))

  const addItem = item => {
    setForm(p => ({ ...p, items: [...p.items, { ...item }] }))
  }

  const updateItem = (idx, updates) => {
    setForm(p => ({
      ...p,
      items: p.items.map((it, i) => i === idx ? { ...it, ...updates } : it),
    }))
  }

  const removeItem = idx => {
    setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
  }

  const subtotal = form.items.reduce((acc, it) => {
    const qty = parseFloat(it.quantity) || 0
    const price = parseFloat(it.unit_price) || 0
    const disc = parseFloat(it.discount) || 0
    return acc + (qty * price - disc)
  }, 0)
  const discountVal = parseFloat(form.discount) || 0
  const total = subtotal - discountVal

  const save = async e => {
    e.preventDefault()
    if (!form.title?.trim()) return toast.error('Título é obrigatório')
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        lead_id: form.lead_id || null,
        client_id: form.client_id || null,
        items: form.items.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: parseFloat(it.quantity) || 0,
          unit_price: parseFloat(it.unit_price) || 0,
          discount: parseFloat(it.discount) || 0,
        })),
        discount: discountVal,
        notes: form.notes || null,
        valid_until: form.valid_until || null,
      }
      if (editId) {
        await api.put(`/proposals/${editId}`, payload)
        toast.success('Proposta atualizada')
      } else {
        await api.post('/proposals', payload)
        toast.success('Proposta criada')
      }
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/proposals/${id}/status`, { status })
      toast.success(`Status alterado para ${STATUS_MAP[status]?.label || status}`)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar status')
    }
  }

  const del = async row => {
    if (row.status !== 'draft') return toast.error('Só é possível excluir propostas em rascunho')
    if (!await confirm('Excluir esta proposta?')) return
    try {
      await api.delete(`/proposals/${row.id}`)
      toast.success('Proposta excluída')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir')
    }
  }

  const cols = [
    { key: 'number', label: 'Nº' },
    { key: 'title', label: 'Título' },
    {
      key: 'lead_name',
      label: 'Lead / Cliente',
      render: (_, row) => row.lead_name || row.client_name || '—',
    },
    { key: 'total', label: 'Total', render: v => fmt.brl(v) },
    {
      key: 'status',
      label: 'Status',
      render: v => {
        const s = STATUS_MAP[v] ?? { label: v || '—', color: '#6b7280' }
        return <Badge color={s.color}>{s.label}</Badge>
      },
    },
    { key: 'created_at', label: 'Data', render: v => fmt.date(v) },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          {row.status === 'draft' && (
            <Btn size="sm" variant="ghost" onClick={() => openEdit(row)} title="Editar">✏️</Btn>
          )}
          {row.status === 'draft' && (
            <Btn size="sm" variant="ghost" onClick={() => changeStatus(row.id, 'sent')} title="Enviar">
              <Send size={14} />
            </Btn>
          )}
          {(row.status === 'sent' || row.status === 'draft') && (
            <>
              <Btn size="sm" variant="success" onClick={() => changeStatus(row.id, 'approved')} title="Aprovar">
                <Check size={14} />
              </Btn>
              <Btn size="sm" variant="danger" onClick={() => changeStatus(row.id, 'rejected')} title="Rejeitar">
                <X size={14} />
              </Btn>
            </>
          )}
          {row.status === 'draft' && (
            <Btn size="sm" variant="danger" onClick={() => del(row)} title="Excluir">
              <Trash2 size={14} />
            </Btn>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Propostas"
        subtitle="Orçamentos e propostas comerciais"
        icon={FileText}
        action={<Btn onClick={openNew}>+ Nova proposta</Btn>}
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ width: 160 }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título ou número..."
            style={{
              flex: 1,
              minWidth: 200,
              background: 'var(--bg-card2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              padding: '9px 13px',
              fontSize: '.875rem',
              outline: 'none',
            }}
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : (
          <Table columns={cols} data={rows} />
        )}
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editId ? 'Editar proposta' : 'Nova proposta'}
        width={680}
      >
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Título *"
            value={form.title}
            onChange={e => f({ title: e.target.value })}
            required
            placeholder="Ex: Proposta de serviços - Cliente X"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Select label="Lead" value={form.lead_id} onChange={e => f({ lead_id: e.target.value })}>
              <option value="">Nenhum</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>{l.name} {l.company ? `(${l.company})` : ''}</option>
              ))}
            </Select>
            <Autocomplete label="Cliente" value={{ label: form.client_label }}
              fetchFn={q => api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r => r.data)}
              onSelect={c => f({ client_id: c.id, client_label: c.name })}
              renderOption={c => (<div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{[c.document, c.phone].filter(Boolean).join(' · ')}</div></div>)}
              placeholder="Buscar cliente..."
            />
          </div>

          <div>
            <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Itens
            </label>
            <ProductSearch onSelect={addItem} />
            {form.items.length > 0 && (
              <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>Produto</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: 80, fontWeight: 600, color: 'var(--muted)' }}>Qtd</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: 100, fontWeight: 600, color: 'var(--muted)' }}>Preço</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: 80, fontWeight: 600, color: 'var(--muted)' }}>Desc.</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: 100, fontWeight: 600, color: 'var(--muted)' }}>Total</th>
                      <th style={{ width: 44 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => {
                      const qty = parseFloat(it.quantity) || 0
                      const price = parseFloat(it.unit_price) || 0
                      const disc = parseFloat(it.discount) || 0
                      const lineTotal = qty * price - disc
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{it.product_name}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.quantity}
                              onChange={e => updateItem(idx, { quantity: e.target.value })}
                              style={{
                                width: '100%', textAlign: 'right',
                                background: 'var(--bg-card2)', border: '1px solid var(--border)',
                                borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '.85rem',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.unit_price}
                              onChange={e => updateItem(idx, { unit_price: e.target.value })}
                              style={{
                                width: '100%', textAlign: 'right',
                                background: 'var(--bg-card2)', border: '1px solid var(--border)',
                                borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '.85rem',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.discount}
                              onChange={e => updateItem(idx, { discount: e.target.value })}
                              style={{
                                width: '100%', textAlign: 'right',
                                background: 'var(--bg-card2)', border: '1px solid var(--border)',
                                borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: '.85rem',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt.brl(lineTotal)}</td>
                          <td style={{ padding: '8px' }}>
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              style={{
                                background: 'transparent', border: 'none', color: 'var(--muted)',
                                cursor: 'pointer', padding: 4, borderRadius: 6,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 24, fontSize: '.9rem' }}>
              <span style={{ color: 'var(--muted)' }}>Subtotal:</span>
              <span style={{ fontWeight: 600 }}>{fmt.brl(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <Input
                label="Desconto geral (R$)"
                type="number"
                min="0"
                step="0.01"
                value={form.discount}
                onChange={e => f({ discount: e.target.value })}
                style={{ width: 140 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: '1rem', fontWeight: 700, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span>Total:</span>
              <span style={{ color: 'var(--primary)' }}>{fmt.brl(total)}</span>
            </div>
          </div>

          <Textarea
            label="Observações"
            value={form.notes}
            onChange={e => f({ notes: e.target.value })}
            rows={2}
            placeholder="Notas adicionais..."
          />

          <Input
            label="Válido até"
            type="date"
            value={form.valid_until}
            onChange={e => f({ valid_until: e.target.value })}
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn variant="ghost" type="button" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
