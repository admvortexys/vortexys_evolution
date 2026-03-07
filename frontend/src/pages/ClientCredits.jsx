/**
 * Clientes com crédito: clientes que possuem saldo de crédito gerado em devoluções.
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Search, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Badge, Spinner, fmt } from '../components/UI'

export default function ClientCredits() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minBalance, setMinBalance] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailClient, setDetailClient] = useState(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search.trim().length >= 2) params.search = search.trim()
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      if (minBalance && parseFloat(minBalance) > 0) params.min_balance = parseFloat(minBalance)
      const { data } = await api.get('/credits/clients-with-balance', { params })
      setRows(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Erro ao carregar clientes com crédito')
    } finally {
      setLoading(false)
    }
  }, [search, startDate, endDate, minBalance, toast])

  useEffect(() => { void load() }, [load])

  const openDetail = async (row) => {
    setDetailClient(row)
    try {
      const { data } = await api.get(`/credits/client/${row.client_id}`)
      setDetail(data)
    } catch {
      toast.error('Erro ao carregar detalhes')
    }
  }

  const clearFilters = () => {
    setSearch('')
    setStartDate('')
    setEndDate('')
    setMinBalance('')
  }

  const exportXlsx = () => {
    if (!rows.length) return toast.error('Nenhum cliente para exportar')
    const data = rows.map(row => ({
      Cliente: row.client_name || '—',
      Documento: row.client_document || '—',
      Telefone: row.client_phone || '—',
      'Qtd. créditos': parseInt(row.credit_count || 0, 10),
      'Saldo disponível': parseFloat(row.total_balance) || 0,
      'Último crédito': row.latest_credit_at ? new Date(row.latest_credit_at).toLocaleDateString('pt-BR') : '—',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes com Crédito')
    XLSX.writeFile(wb, `clientes_com_credito_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Relatório exportado!')
  }

  const totalBalance = rows.reduce((sum, row) => sum + parseFloat(row.total_balance || 0), 0)
  const totalClients = rows.length
  const hasActiveFilters = Boolean(search.trim() || startDate || endDate || minBalance)

  const cols = [
    {
      key: 'client_name',
      label: 'Cliente',
      render: (value, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{value || '—'}</div>
          {row.client_document && <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{row.client_document}</div>}
        </div>
      ),
    },
    { key: 'client_phone', label: 'Telefone', render: value => value || '—' },
    {
      key: 'credit_count',
      label: 'Créditos',
      render: value => <Badge color="#10b981">{value} documento{value !== 1 ? 's' : ''}</Badge>,
    },
    {
      key: 'latest_credit_at',
      label: 'Último crédito',
      render: value => value ? fmt.date(value) : '—',
    },
    {
      key: 'total_balance',
      label: 'Saldo disponível',
      render: value => <span style={{ fontWeight: 700, color: '#10b981', fontSize: '1.02rem' }}>{fmt.brl(value)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Clientes com Crédito"
        subtitle="Clientes com saldo de crédito gerado em devoluções"
        icon={Wallet}
        action={
          <Btn variant="secondary" size="sm" onClick={exportXlsx} icon={<Download size={14} />} disabled={!rows.length}>
            Exportar relatório
          </Btn>
        }
      />

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
              style={{
                width: '100%', paddingLeft: 36, height: 40, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card2)',
                color: 'var(--text)', fontSize: '.9rem', outline: 'none',
              }}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>De</div>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{
                width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.85rem',
                padding: '0 10px', outline: 'none',
              }}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Até</div>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{
                width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.85rem',
                padding: '0 10px', outline: 'none',
              }}
            />
          </div>

          <div style={{ minWidth: 170 }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Saldo mínimo</div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={minBalance}
              onChange={e => setMinBalance(e.target.value)}
              placeholder="R$ 0,00"
              style={{
                width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '.85rem',
                padding: '0 10px', outline: 'none',
              }}
            />
          </div>

          {hasActiveFilters && <Btn variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Btn>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
            {totalClients} cliente(s) no recorte atual.
          </div>
          {rows.length > 0 && (
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              Total em créditos: <strong style={{ color: '#10b981' }}>{fmt.brl(totalBalance)}</strong>
            </div>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
            Nenhum cliente com saldo de crédito
          </div>
        ) : (
          <Table columns={cols} data={rows} onRow={row => openDetail(row)} />
        )}
      </Card>

      {detail && (
        <Modal
          open={!!detail}
          onClose={() => { setDetail(null); setDetailClient(null); }}
          title={detailClient ? `Créditos — ${detailClient.client_name}` : 'Créditos do cliente'}
          width={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {detail.summary && (
              <div style={{
                background: 'rgba(16,185,129,.08)',
                border: '1px solid rgba(16,185,129,.25)',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
                    Saldo disponível
                  </div>
                  <div style={{ fontWeight: 900, fontSize: '1.25rem', color: '#10b981' }}>
                    {fmt.brl(detail.summary.total_available)}
                  </div>
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {detail.summary.total_credits} crédito(s) · {fmt.brl(detail.summary.total_generated)} gerado
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
                Documentos de crédito (uso parcial permitido)
              </div>
              {(detail.credits || []).map((credit) => {
                const usedOn = Array.isArray(credit.used_on_orders) ? credit.used_on_orders : []
                return (
                  <div
                    key={credit.id}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-card2)',
                      borderRadius: 8,
                      marginBottom: 8,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{credit.number}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '.8rem', marginLeft: 8 }}>{credit.reason}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: parseFloat(credit.balance) > 0 ? '#10b981' : 'var(--muted)' }}>
                          Saldo: {fmt.brl(credit.balance)}
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                          {credit.status === 'active' ? 'Ativo' : credit.status === 'exhausted' ? 'Utilizado' : credit.status} · Origem: {fmt.brl(credit.amount)}
                        </div>
                      </div>
                    </div>
                    {usedOn.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Histórico de utilização</div>
                        {usedOn.map((usage, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', padding: '2px 0' }}>
                            <span>Pedido {usage.order_number || `#${usage.order_id}`} — {usage.date ? new Date(usage.date).toLocaleDateString('pt-BR') : '—'}</span>
                            <span style={{ fontWeight: 600, color: '#ef4444' }}>-{fmt.brl(usage.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <Btn variant="ghost" onClick={() => { setDetail(null); setDetailClient(null); }}>Fechar</Btn>
              <Btn onClick={() => {
                navigate('/pdv', {
                  state: {
                    prefillClient: { id: detailClient.client_id, name: detailClient.client_name },
                    prefillCredit: true,
                    creditBalance: parseFloat(detail.summary?.total_available || 0),
                  },
                })
                setDetail(null)
                setDetailClient(null)
              }}>
                Ir para PDV (usar crédito)
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
