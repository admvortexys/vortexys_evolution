/**
 * Clientes com crédito: clientes que possuem saldo de crédito gerado em devoluções.
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Search } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Card, Table, Btn, Modal, Badge, Spinner, fmt } from '../components/UI'

export default function ClientCredits() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailClient, setDetailClient] = useState(null)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search.trim().length >= 2) params.search = search.trim()
      const { data } = await api.get('/credits/clients-with-balance', { params })
      setRows(data)
    } catch {
      toast.error('Erro ao carregar clientes com crédito')
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => { load() }, [load])

  const openDetail = async (row) => {
    setDetailClient(row)
    try {
      const { data } = await api.get(`/credits/client/${row.client_id}`)
      setDetail(data)
    } catch {
      toast.error('Erro ao carregar detalhes')
    }
  }

  const totalBalance = rows.reduce((s, r) => s + parseFloat(r.total_balance || 0), 0)

  const cols = [
    { key: 'client_name', label: 'Cliente', render: (v, row) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v || '—'}</div>
        {row.client_document && <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{row.client_document}</div>}
      </div>
    ) },
    { key: 'client_phone', label: 'Telefone', render: v => v || '—' },
    { key: 'credit_count', label: 'Créditos', render: v => <Badge color="#10b981">{v} documento{v !== 1 ? 's' : ''}</Badge> },
    { key: 'total_balance', label: 'Saldo disponível', render: v => (
      <span style={{ fontWeight: 700, color: '#10b981', fontSize: '1.02rem' }}>{fmt.brl(v)}</span>
    ) },
  ]

  return (
    <div>
      <PageHeader
        title="Clientes com Crédito"
        subtitle="Clientes com saldo de crédito gerado em devoluções"
        icon={Wallet}
      />

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
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
          <Table
            columns={cols}
            data={rows}
            onRow={r => openDetail(r)}
          />
        )}
      </Card>

      {detail && (
        <Modal open={!!detail} onClose={() => { setDetail(null); setDetailClient(null); }} title={detailClient ? `Créditos — ${detailClient.client_name}` : 'Créditos do cliente'} width={560}>
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
              {(detail.credits || []).map((c) => {
                const usedOn = Array.isArray(c.used_on_orders) ? c.used_on_orders : []
                return (
                  <div
                    key={c.id}
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
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{c.number}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '.8rem', marginLeft: 8 }}>{c.reason}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: parseFloat(c.balance) > 0 ? '#10b981' : 'var(--muted)' }}>
                          Saldo: {fmt.brl(c.balance)}
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                          {c.status === 'active' ? 'Ativo' : c.status === 'exhausted' ? 'Utilizado' : c.status} · Origem: {fmt.brl(c.amount)}
                        </div>
                      </div>
                    </div>
                    {usedOn.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Histórico de utilização</div>
                        {usedOn.map((u, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', padding: '2px 0' }}>
                            <span>Pedido {u.order_number || `#${u.order_id}`} — {u.date ? new Date(u.date).toLocaleDateString('pt-BR') : '—'}</span>
                            <span style={{ fontWeight: 600, color: '#ef4444' }}>-{fmt.brl(u.amount)}</span>
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
