/**
 * Fluxo de Caixa Projetado: contas a receber e a pagar em aberto com vencimento futuro.
 * Saldo inicial = saldo da conta selecionada. Gráfico + tabela por período.
 */
import { useEffect, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Wallet } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { PageHeader, Btn, Select, Spinner, fmt } from '../components/UI'
import { Card } from '../components/UI'

const GROUP_OPTIONS = [
  { value: 'day', label: 'Diário' },
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensal' },
]

const DAYS_OPTIONS = [
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
  { value: 180, label: '180 dias' },
]

function formatPeriodo(key, group) {
  if (!key) return ''
  if (group === 'day') return new Date(key).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  if (group === 'week') return `Sem. ${new Date(key).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
  return new Date(key + '-01').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

export default function CashFlowProjection() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [saldoInicial, setSaldoInicial] = useState(0)
  const [projection, setProjection] = useState([])
  const [group, setGroup] = useState('day')
  const [days, setDays] = useState(90)
  const [accountId, setAccountId] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ group, days })
      if (accountId) params.set('account_id', accountId)
      const { data } = await api.get(`/transactions/cash-flow-projection?${params}`)
      setAccounts(data.accounts || [])
      setSaldoInicial(data.saldo_inicial ?? 0)
      setProjection(data.projection || [])
      if (accountId && !(data.accounts || []).some(a => String(a.id) === String(accountId))) setAccountId('')
    } catch {
      toast.error('Erro ao carregar fluxo de caixa')
      setProjection([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [group, days, accountId])

  const chartData = projection.map(p => ({
    ...p,
    periodoLabel: formatPeriodo(p.periodo, group),
  }))

  const hasData = projection.some(p => (p.entradas || 0) > 0 || (p.saidas || 0) > 0)

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Fluxo de Caixa Projetado"
        subtitle="Contas a receber e a pagar em aberto com vencimento futuro"
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <Select
          label="Conta/Caixa"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          style={{ minWidth: 200 }}
        >
          <option value="">Consolidado (todas)</option>
          {accounts.map(a => (
            <option key={a.id} value={String(a.id)}>
              {a.name} ({fmt.brl(a.current_balance)})
            </option>
          ))}
        </Select>
        <Select
          label="Agrupamento"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          style={{ minWidth: 120 }}
        >
          {GROUP_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select
          label="Período"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ minWidth: 120 }}
        >
          {DAYS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner />
        </div>
      ) : (
        <>
          <Card style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(34,197,94,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={22} color="#22c55e" />
              </div>
              <div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Saldo inicial</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{fmt.brl(saldoInicial)}</div>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800 }}>Projeção</h3>
            {hasData ? (
              <div style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 50, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                    <XAxis
                      dataKey="periodoLabel"
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      angle={chartData.length > 15 ? -35 : 0}
                      textAnchor={chartData.length > 15 ? 'end' : 'middle'}
                      height={chartData.length > 15 ? 50 : 30}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: 'var(--muted)' }}
                      tickFormatter={(v) => fmt.compact(v)}
                    />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmt.compact(v)} />
                    <Tooltip
                      formatter={(value) => fmt.brl(value)}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.periodo ? new Date(payload[0].payload.periodo).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0]?.payload
                        if (!p) return null
                        return (
                          <div style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 12, border: '1px solid var(--border)', minWidth: 200 }}>
                            <div style={{ marginBottom: 8, fontWeight: 700 }}>{formatPeriodo(p.periodo, group)}</div>
                            <div style={{ fontSize: '.85rem', color: 'var(--text-2)' }}>Entradas: {fmt.brl(p.entradas)}</div>
                            <div style={{ fontSize: '.85rem', color: 'var(--text-2)' }}>Saídas: {fmt.brl(p.saidas)}</div>
                            <div style={{ fontSize: '.85rem', color: 'var(--text-2)' }}>Fluxo líquido: {fmt.brl(p.fluxo_liquido)}</div>
                            <div style={{ fontSize: '.85rem', fontWeight: 700, marginTop: 4 }}>Saldo acum.: {fmt.brl(p.saldo_acumulado)}</div>
                          </div>
                        )
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="entradas" fill="#22c55e" name="Entradas previstas" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar yAxisId="left" dataKey="saidas" fill="#ef4444" name="Saídas previstas" radius={[4, 4, 0, 0]} barSize={20} />
                    <Line yAxisId="right" type="monotone" dataKey="saldo_acumulado" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 3 }} name="Saldo acumulado" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
                Sem contas a receber ou a pagar com vencimento futuro no período.
              </div>
            )}
          </Card>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <h3 style={{ margin: 0, padding: '16px 20px', fontSize: '1rem', fontWeight: 800, borderBottom: '1px solid var(--border)' }}>
              Tabela por período
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.02)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)' }}>Período</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)' }}>Entradas</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)' }}>Saídas</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)' }}>Fluxo líquido</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)' }}>Saldo acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.map((row, i) => (
                    <tr key={row.periodo} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: '.85rem' }}>{formatPeriodo(row.periodo, group)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.85rem', color: '#22c55e' }}>{fmt.brl(row.entradas)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.85rem', color: '#ef4444' }}>{fmt.brl(row.saidas)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.85rem', color: row.fluxo_liquido >= 0 ? '#22c55e' : '#ef4444' }}>
                        {fmt.brl(row.fluxo_liquido)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '.85rem', fontWeight: 600 }}>{fmt.brl(row.saldo_acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasData && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}>
                Nenhum dado para exibir
              </div>
            )}
          </Card>

          <Card style={{ padding: 16, borderColor: 'rgba(168,85,247,.2)', background: 'rgba(168,85,247,.04)' }}>
            <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted)' }}>
              No consolidado, as entradas somam recebíveis lançados e a projeção histórica de vendas, CRM e assistência.
              Ao selecionar uma conta específica, o fluxo considera apenas lançamentos vinculados a essa conta.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
