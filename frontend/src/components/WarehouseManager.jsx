import { useEffect, useState } from 'react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { Btn, Input } from './UI'

export default function WarehouseManager({ onRefresh }) {
  const [whs, setWhs] = useState([])
  const [form, setForm] = useState({ name: '', location: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast, confirm } = useToast()

  const load = () => api.get('/categories/warehouses').then(r => setWhs(r.data))

  useEffect(() => { load() }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) await api.put(`/categories/warehouses/${editId}`, form)
      else await api.post('/categories/warehouses', form)
      setForm({ name: '', location: '' })
      setEditId(null)
      load()
      onRefresh?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const editWarehouse = (warehouse) => {
    setEditId(warehouse.id)
    setForm({ name: warehouse.name, location: warehouse.location || '' })
  }

  const removeWarehouse = async (id) => {
    if (!await confirm('Desativar?')) return
    await api.delete(`/categories/warehouses/${id}`)
    load()
    onRefresh?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <form onSubmit={save} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input label="Nome *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required style={{ flex: 1, minWidth: 150 }} />
        <Input label="Localização" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} style={{ flex: 1, minWidth: 150 }} />
        <Btn type="submit" disabled={saving} size="sm">{editId ? 'Salvar' : '+ Adicionar'}</Btn>
        {editId && <Btn variant="ghost" size="sm" onClick={() => { setEditId(null); setForm({ name: '', location: '' }) }}>Cancelar</Btn>}
      </form>

      {whs.map((warehouse) => (
        <div key={warehouse.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontWeight: 600 }}>{warehouse.name}</span>
            {warehouse.location && <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: '.8rem' }}>({warehouse.location})</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant="ghost" onClick={() => editWarehouse(warehouse)}>✏️</Btn>
            <Btn size="sm" variant="danger" onClick={() => removeWarehouse(warehouse.id)}>🗑</Btn>
          </div>
        </div>
      ))}
    </div>
  )
}
