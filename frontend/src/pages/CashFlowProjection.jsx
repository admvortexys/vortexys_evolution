/**
 * Fluxo de Caixa Projetado: contas a receber e a pagar em aberto com vencimento futuro.
 * Saldo inicial = saldo da conta selecionada. Grafico + tabela por periodo.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  RefreshCw,
  Scale,
  Wallet,
} from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { Badge, Btn, Card, KpiCard, PageHeader, Select, Spinner, fmt } from '../components/UI'

const GROUP_OPTIONS = [
  { value: 'day', label: 'Diario' },
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensal' },
]

const DAYS_OPTIONS = [
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
  { value: 180, label: '180 dias' },
]

function capitalize(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function parseLocalDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 12)
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number)
    return new Date(year, month - 1, 1, 12)
  }
  return new Date(value)
}

function formatPeriodo(key, group) {
  const date = parseLocalDate(key)
  if (!date) return ''
  if (group === 'day') return capitalize(date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))
  if (group === 'week') return `Sem ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
  return capitalize(date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }))
}

function formatPeriodoLong(key, group) {
  const date = parseLocalDate(key)
  if (!date) return ''
  if (group === 'day') {
    return capitalize(date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }))
  }
  if (group === 'week') {
    return `Semana iniciando em ${date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })}`
  }
  return capitalize(date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
}

function groupHint(group) {
  if (group === 'day') return 'Leitura fina do caixa previsto dia a dia'
  if (group === 'week') return 'Boa para enxergar semanas mais apertadas'
  return 'Resumo executivo do horizonte por mes'
}

function daysHint(days) {
  if (days <= 30) return 'Curto prazo'
  if (days <= 90) return 'Janela tatica'
  return 'Janela estendida'
}

function getBalanceTone(value) {
  if (value < 0) return '#fb7185'
  if (value === 0) return '#f59e0b'
  return '#a855f7'
}

function ToggleChipGroup({ label, value, options, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={controlLabelStyle}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const active = String(option.value) === String(value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                padding: '9px 12px',
                borderRadius: 999,
                border: active ? '1px solid rgba(168,85,247,.55)' : '1px solid rgba(168,85,247,.18)',
                background: active ? 'linear-gradient(135deg, rgba(168,85,247,.28), rgba(59,130,246,.18))' : 'rgba(10,6,18,.55)',
                color: active ? '#fff' : 'var(--muted)',
                fontSize: '.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: active ? '0 8px 22px rgba(168,85,247,.18)' : 'none',
                transition: 'all .18s ease',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LegendPill({ color, label }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 10px',
      borderRadius: 999,
      background: 'rgba(255,255,255,.03)',
      border: '1px solid rgba(168,85,247,.12)',
      color: 'var(--muted)',
      fontSize: '.76rem',
      fontWeight: 600,
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, boxShadow: `0 0 0 4px ${color}22` }} />
      {label}
    </div>
  )
}

function InsightCard({ label, value, hint, tone = 'neutral' }) {
  const tones = {
    positive: { color: '#22c55e', bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.18)' },
    warning: { color: '#fb7185', bg: 'rgba(251,113,133,.10)', border: 'rgba(251,113,133,.18)' },
    accent: { color: '#a855f7', bg: 'rgba(168,85,247,.10)', border: 'rgba(168,85,247,.18)' },
    neutral: { color: '#94a3b8', bg: 'rgba(148,163,184,.10)', border: 'rgba(148,163,184,.18)' },
  }
  const meta = tones[tone] || tones.neutral
  return (
    <div style={{
      padding: 14,
      borderRadius: 16,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: '.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 800, color: meta.color, letterSpacing: '-.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
        {hint}
      </div>
    </div>
  )
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
      if (accountId && !(data.accounts || []).some((account) => String(account.id) === String(accountId))) {
        setAccountId('')
      }
    } catch {
      toast.error('Erro ao carregar fluxo de caixa')
      setProjection([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [group, days, accountId])

  const selectedAccount = useMemo(
    () => accounts.find((account) => String(account.id) === String(accountId)) || null,
    [accounts, accountId]
  )

  const chartData = useMemo(
    () => projection.map((row) => ({
      ...row,
      periodoLabel: formatPeriodo(row.periodo, group),
      periodoLongo: formatPeriodoLong(row.periodo, group),
    })),
    [projection, group]
  )

  const summary = useMemo(() => {
    const totalEntradas = projection.reduce((sum, row) => sum + (Number(row.entradas) || 0), 0)
    const totalSaidas = projection.reduce((sum, row) => sum + (Number(row.saidas) || 0), 0)
    const saldoFinal = projection.length ? Number(projection[projection.length - 1].saldo_acumulado || 0) : Number(saldoInicial || 0)
    const fluxoLiquido = totalEntradas - totalSaidas
    const periodsWithMovement = projection.filter((row) => (Number(row.entradas) || 0) > 0 || (Number(row.saidas) || 0) > 0).length
    const firstNegative = projection.find((row) => Number(row.saldo_acumulado || 0) < 0) || null
    const lowestBalance = projection.reduce((lowest, row) => {
      if (!lowest || Number(row.saldo_acumulado || 0) < Number(lowest.saldo_acumulado || 0)) return row
      return lowest
    }, null)
    const highestInflow = projection.reduce((highest, row) => {
      if (!highest || Number(row.entradas || 0) > Number(highest.entradas || 0)) return row
      return highest
    }, null)
    const highestOutflow = projection.reduce((highest, row) => {
      if (!highest || Number(row.saidas || 0) > Number(highest.saidas || 0)) return row
      return highest
    }, null)
    return {
      totalEntradas,
      totalSaidas,
      saldoFinal,
      fluxoLiquido,
      periodsWithMovement,
      firstNegative,
      lowestBalance,
      highestInflow,
      highestOutflow,
    }
  }, [projection, saldoInicial])

  const statusMeta = useMemo(() => {
    if (!summary.periodsWithMovement) {
      return {
        label: 'Sem movimentacao futura',
        tone: 'neutral',
        detail: 'Nenhuma entrada ou saida prevista dentro do horizonte filtrado.',
      }
    }
    if (summary.firstNegative) {
      return {
        label: 'Risco de caixa negativo',
        tone: 'warning',
        detail: `A primeira ruptura aparece em ${formatPeriodo(summary.firstNegative.periodo, group)}.`,
      }
    }
    if (summary.fluxoLiquido < 0) {
      return {
        label: 'Queima de caixa controlada',
        tone: 'accent',
        detail: 'O saldo segue positivo, mas o horizonte consome mais caixa do que gera.',
      }
    }
    return {
      label: 'Trajetoria saudavel',
      tone: 'positive',
      detail: 'As entradas previstas sustentam o saldo ao longo do periodo analisado.',
    }
  }, [summary, group])

  const hasMovement = summary.periodsWithMovement > 0
  const rangeLabel = projection.length
    ? `${formatPeriodoLong(projection[0].periodo, group)} ate ${formatPeriodoLong(projection[projection.length - 1].periodo, group)}`
    : 'Sem horizonte disponivel'

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Fluxo de Caixa Projetado"
        subtitle="Antecipe semanas de pressao, compare entradas x saidas e acompanhe o saldo futuro do caixa."
        icon={Wallet}
        action={
          <Btn size="sm" variant="ghost" onClick={() => void load()} icon={<RefreshCw size={14} />}>
            Atualizar
          </Btn>
        }
      />

      <Card style={{
        padding: 0,
        overflow: 'hidden',
        border: '1px solid rgba(168,85,247,.22)',
        background: 'radial-gradient(circle at top left, rgba(34,197,94,.16), transparent 28%), radial-gradient(circle at right center, rgba(168,85,247,.22), transparent 32%), linear-gradient(135deg, rgba(15,10,26,.98), rgba(9,6,18,.98))',
        boxShadow: '0 24px 48px rgba(0,0,0,.28)',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          padding: 24,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Badge color={selectedAccount ? '#0ea5e9' : '#a855f7'}>
                {selectedAccount ? `Conta: ${selectedAccount.name}` : 'Consolidado de contas'}
              </Badge>
              <Badge color="#22c55e">{daysHint(days)}</Badge>
              <Badge color="#f59e0b">{groupHint(group)}</Badge>
            </div>

            <div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 8 }}>
                Horizonte analisado
              </div>
              <h2 style={{ margin: 0, fontSize: '1.8rem', lineHeight: 1.05, letterSpacing: '-.04em', maxWidth: 640 }}>
                Visao projetada do caixa para agir antes do aperto aparecer.
              </h2>
              <p style={{ marginTop: 10, color: 'var(--muted)', fontSize: '.9rem', maxWidth: 700, lineHeight: 1.6 }}>
                {rangeLabel}
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}>
              <div style={heroMetricStyle}>
                <span style={heroMetricLabelStyle}>Saldo inicial</span>
                <strong style={{ fontSize: '1.35rem', letterSpacing: '-.03em' }}>{fmt.brl(saldoInicial)}</strong>
                <span style={heroMetricHintStyle}>
                  {selectedAccount ? 'Base atual da conta escolhida' : 'Soma dos saldos disponiveis'}
                </span>
              </div>
              <div style={heroMetricStyle}>
                <span style={heroMetricLabelStyle}>Saldo final</span>
                <strong style={{ fontSize: '1.35rem', letterSpacing: '-.03em', color: getBalanceTone(summary.saldoFinal) }}>
                  {fmt.brl(summary.saldoFinal)}
                </strong>
                <span style={heroMetricHintStyle}>Depois de aplicar todo o fluxo futuro</span>
              </div>
            </div>
          </div>

          <div style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(168,85,247,.14)',
            borderRadius: 22,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                  Radar do horizonte
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: 4 }}>{statusMeta.label}</div>
              </div>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: statusMeta.tone === 'warning' ? 'rgba(251,113,133,.14)' : statusMeta.tone === 'positive' ? 'rgba(34,197,94,.14)' : 'rgba(168,85,247,.14)',
                border: `1px solid ${statusMeta.tone === 'warning' ? 'rgba(251,113,133,.22)' : statusMeta.tone === 'positive' ? 'rgba(34,197,94,.22)' : 'rgba(168,85,247,.22)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <AlertTriangle size={18} color={statusMeta.tone === 'warning' ? '#fb7185' : statusMeta.tone === 'positive' ? '#22c55e' : '#a855f7'} />
              </div>
            </div>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '.86rem', lineHeight: 1.6 }}>
              {statusMeta.detail}
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 10,
            }}>
              <InsightCard
                label="Pior saldo"
                value={summary.lowestBalance ? fmt.brl(summary.lowestBalance.saldo_acumulado) : fmt.brl(saldoInicial)}
                hint={summary.lowestBalance ? formatPeriodoLong(summary.lowestBalance.periodo, group) : 'Sem oscilacao registrada'}
                tone={summary.lowestBalance && Number(summary.lowestBalance.saldo_acumulado || 0) < 0 ? 'warning' : 'accent'}
              />
              <InsightCard
                label="Maior saida"
                value={summary.highestOutflow ? fmt.brl(summary.highestOutflow.saidas) : fmt.brl(0)}
                hint={summary.highestOutflow ? formatPeriodo(summary.highestOutflow.periodo, group) : 'Nenhuma saida prevista'}
                tone="warning"
              />
              <InsightCard
                label="Maior entrada"
                value={summary.highestInflow ? fmt.brl(summary.highestInflow.entradas) : fmt.brl(0)}
                hint={summary.highestInflow ? formatPeriodo(summary.highestInflow.periodo, group) : 'Nenhuma entrada prevista'}
                tone="positive"
              />
            </div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(168,85,247,.14)',
          padding: 20,
          background: 'linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0))',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={controlLabelStyle}>Conta/Caixa</span>
              <Select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                style={{ minWidth: 220 }}
              >
                <option value="">Consolidado (todas)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={String(account.id)}>
                    {account.name} ({fmt.brl(account.current_balance)})
                  </option>
                ))}
              </Select>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <ToggleChipGroup label="Agrupamento" value={group} options={GROUP_OPTIONS} onChange={setGroup} />
              <ToggleChipGroup label="Janela" value={days} options={DAYS_OPTIONS} onChange={(value) => setDays(Number(value))} />
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card style={{ padding: 14 }}>
          <Spinner text="Montando projecao..." />
        </Card>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
          }}>
            <KpiCard
              icon={ArrowUpRight}
              label="Entradas previstas"
              value={fmt.brl(summary.totalEntradas)}
              sub={`${summary.periodsWithMovement} periodo(s) com movimento`}
              color="#22c55e"
            />
            <KpiCard
              icon={ArrowDownRight}
              label="Saidas previstas"
              value={fmt.brl(summary.totalSaidas)}
              sub={hasMovement ? 'Compromissos a pagar no horizonte' : 'Sem saidas projetadas'}
              color="#ef4444"
            />
            <KpiCard
              icon={Scale}
              label="Fluxo liquido"
              value={fmt.brl(summary.fluxoLiquido)}
              sub={summary.fluxoLiquido >= 0 ? 'Entradas superam saidas' : 'Saidas acima das entradas'}
              color={summary.fluxoLiquido >= 0 ? '#22c55e' : '#f59e0b'}
            />
            <KpiCard
              icon={Activity}
              label="Saldo final projetado"
              value={fmt.brl(summary.saldoFinal)}
              sub={summary.firstNegative ? 'Ha ruptura prevista no periodo' : 'Encerramento esperado do horizonte'}
              color={summary.firstNegative ? '#fb7185' : '#a855f7'}
            />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '18px 20px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                flexWrap: 'wrap',
                borderBottom: '1px solid rgba(168,85,247,.14)',
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, letterSpacing: '-.02em' }}>
                    Mapa visual da projecao
                  </h3>
                  <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '.84rem', lineHeight: 1.5 }}>
                    Barras para entradas e saidas, linha para o saldo acumulado.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <LegendPill color="#22c55e" label="Entradas previstas" />
                  <LegendPill color="#fb7185" label="Saidas previstas" />
                  <LegendPill color="#a855f7" label="Saldo acumulado" />
                </div>
              </div>

              {hasMovement ? (
                <div style={{ height: 390, padding: '16px 12px 10px 4px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 26, left: 10, bottom: 18 }}>
                      <defs>
                        <linearGradient id="projectionBalanceGlow" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(168,85,247,.10)" vertical={false} />
                      <XAxis
                        dataKey="periodoLabel"
                        tick={{ fontSize: 11, fill: 'var(--muted)' }}
                        axisLine={false}
                        tickLine={false}
                        angle={chartData.length > 14 ? -28 : 0}
                        textAnchor={chartData.length > 14 ? 'end' : 'middle'}
                        height={chartData.length > 14 ? 58 : 34}
                      />
                      <YAxis
                        yAxisId="movimento"
                        tick={{ fontSize: 11, fill: 'var(--muted)' }}
                        tickFormatter={(value) => fmt.compact(value)}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                      />
                      <YAxis
                        yAxisId="saldo"
                        orientation="right"
                        tick={{ fontSize: 11, fill: 'var(--muted)' }}
                        tickFormatter={(value) => fmt.compact(value)}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(168,85,247,.08)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const point = payload[0]?.payload
                          if (!point) return null
                          return (
                            <div style={{
                              minWidth: 220,
                              borderRadius: 16,
                              background: 'rgba(12,9,21,.96)',
                              border: '1px solid rgba(168,85,247,.22)',
                              boxShadow: '0 18px 44px rgba(0,0,0,.35)',
                              padding: 14,
                            }}>
                              <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
                                {point.periodoLongo}
                              </div>
                              <div style={{ display: 'grid', gap: 6, fontSize: '.84rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                  <span style={{ color: '#22c55e' }}>Entradas</span>
                                  <strong>{fmt.brl(point.entradas)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                  <span style={{ color: '#fb7185' }}>Saidas</span>
                                  <strong>{fmt.brl(point.saidas)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                  <span style={{ color: point.fluxo_liquido >= 0 ? '#22c55e' : '#fb7185' }}>Fluxo liquido</span>
                                  <strong>{fmt.brl(point.fluxo_liquido)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 6, borderTop: '1px solid rgba(168,85,247,.14)' }}>
                                  <span style={{ color: '#a855f7' }}>Saldo acumulado</span>
                                  <strong>{fmt.brl(point.saldo_acumulado)}</strong>
                                </div>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <ReferenceLine yAxisId="saldo" y={0} stroke="rgba(251,113,133,.34)" strokeDasharray="5 5" />
                      <Bar yAxisId="movimento" dataKey="entradas" fill="#22c55e" radius={[6, 6, 0, 0]} barSize={18} />
                      <Bar yAxisId="movimento" dataKey="saidas" fill="#fb7185" radius={[6, 6, 0, 0]} barSize={18} />
                      <Area yAxisId="saldo" type="monotone" dataKey="saldo_acumulado" fill="url(#projectionBalanceGlow)" stroke="none" />
                      <Line
                        yAxisId="saldo"
                        type="monotone"
                        dataKey="saldo_acumulado"
                        stroke="#a855f7"
                        strokeWidth={2.7}
                        dot={chartData.length <= 12 ? { r: 3, strokeWidth: 0, fill: '#d8b4fe' } : false}
                        activeDot={{ r: 5, strokeWidth: 0, fill: '#f5d0fe' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{
                  padding: '42px 24px',
                  display: 'grid',
                  gap: 12,
                  placeItems: 'center',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    background: 'rgba(168,85,247,.12)',
                    border: '1px solid rgba(168,85,247,.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Wallet size={24} color="#a855f7" />
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800 }}>
                    Nenhuma movimentacao futura neste recorte
                  </div>
                  <div style={{ maxWidth: 540, color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6 }}>
                    O saldo permanece estavel porque nao ha contas a receber nem a pagar previstas para esta combinacao de conta, janela e agrupamento.
                  </div>
                </div>
              )}
            </Card>

            <div style={{ display: 'grid', gap: 18 }}>
              <Card style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: '.76rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
                      Leitura executiva
                    </div>
                    <div style={{ marginTop: 5, fontSize: '1.02rem', fontWeight: 800 }}>
                      O que merece atencao agora
                    </div>
                  </div>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    background: 'rgba(168,85,247,.12)',
                    border: '1px solid rgba(168,85,247,.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Landmark size={18} color="#a855f7" />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  <InsightCard
                    label="Fluxo liquido do horizonte"
                    value={fmt.brl(summary.fluxoLiquido)}
                    hint={summary.fluxoLiquido >= 0 ? 'As entradas cobrem as saidas previstas.' : 'O horizonte fecha com consumo liquido de caixa.'}
                    tone={summary.fluxoLiquido >= 0 ? 'positive' : 'warning'}
                  />
                  <InsightCard
                    label="Primeira ruptura"
                    value={summary.firstNegative ? formatPeriodo(summary.firstNegative.periodo, group) : 'Nao ha ruptura'}
                    hint={summary.firstNegative ? `Saldo projetado em ${fmt.brl(summary.firstNegative.saldo_acumulado)}.` : 'Nenhum periodo cruza a linha negativa.'}
                    tone={summary.firstNegative ? 'warning' : 'positive'}
                  />
                  <InsightCard
                    label="Base analisada"
                    value={selectedAccount ? selectedAccount.name : 'Consolidado'}
                    hint={selectedAccount ? 'Somente lancamentos vinculados a esta conta.' : 'Considera todas as contas e saldo consolidado.'}
                    tone="accent"
                  />
                </div>
              </Card>

              <Card style={{
                padding: 18,
                borderColor: 'rgba(168,85,247,.18)',
                background: 'linear-gradient(180deg, rgba(168,85,247,.08), rgba(168,85,247,.03))',
              }}>
                <div style={{ fontSize: '.76rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 10 }}>
                  Premissas da projecao
                </div>
                <div style={{ display: 'grid', gap: 10, fontSize: '.84rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  <div>Entradas consideram recebiveis em aberto e, no consolidado, a projecao historica de vendas, CRM e assistencia.</div>
                  <div>Saidas consideram compromissos financeiros futuros ainda nao quitados.</div>
                  <div>Ao trocar o agrupamento, os mesmos dados sao reorganizados para facilitar a leitura taticamente.</div>
                </div>
              </Card>
            </div>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '18px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
              borderBottom: '1px solid rgba(168,85,247,.14)',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, letterSpacing: '-.02em' }}>
                  Tabela por periodo
                </h3>
                <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '.84rem', lineHeight: 1.5 }}>
                  Detalhe da curva projetada para conferencia rapida e tomada de decisao.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge color="#22c55e">{fmt.brl(summary.totalEntradas)} em entradas</Badge>
                <Badge color="#fb7185">{fmt.brl(summary.totalSaidas)} em saidas</Badge>
              </div>
            </div>

            {hasMovement ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,.02)' }}>
                      <th style={tableHeadStyle}>Periodo</th>
                      <th style={tableHeadRightStyle}>Entradas</th>
                      <th style={tableHeadRightStyle}>Saidas</th>
                      <th style={tableHeadRightStyle}>Fluxo liquido</th>
                      <th style={tableHeadRightStyle}>Saldo acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((row, index) => {
                      const isNegative = Number(row.saldo_acumulado || 0) < 0
                      const isLowest = summary.lowestBalance?.periodo === row.periodo
                      const isFirstNegative = summary.firstNegative?.periodo === row.periodo
                      return (
                        <tr
                          key={row.periodo}
                          style={{
                            borderTop: '1px solid rgba(168,85,247,.10)',
                            background: isFirstNegative
                              ? 'rgba(251,113,133,.07)'
                              : isLowest
                                ? 'rgba(168,85,247,.06)'
                                : index % 2 === 0
                                  ? 'transparent'
                                  : 'rgba(255,255,255,.015)',
                          }}
                        >
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{formatPeriodo(row.periodo, group)}</div>
                              {isFirstNegative && <Badge color="#fb7185">Ruptura</Badge>}
                              {!isFirstNegative && isLowest && <Badge color="#a855f7">Menor saldo</Badge>}
                            </div>
                            <div style={{ marginTop: 4, fontSize: '.76rem', color: 'var(--muted)' }}>
                              {formatPeriodoLong(row.periodo, group)}
                            </div>
                          </td>
                          <td style={{ ...tableCellRightStyle, color: '#22c55e' }}>{fmt.brl(row.entradas)}</td>
                          <td style={{ ...tableCellRightStyle, color: '#fb7185' }}>{fmt.brl(row.saidas)}</td>
                          <td style={{ ...tableCellRightStyle, color: Number(row.fluxo_liquido || 0) >= 0 ? '#22c55e' : '#fb7185', fontWeight: 700 }}>
                            {fmt.brl(row.fluxo_liquido)}
                          </td>
                          <td style={{ ...tableCellRightStyle, color: isNegative ? '#fb7185' : 'var(--text)', fontWeight: 800 }}>
                            {fmt.brl(row.saldo_acumulado)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--muted)', fontSize: '.9rem' }}>
                Nenhum periodo com movimentacao para listar.
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

const controlLabelStyle = {
  fontSize: '.73rem',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  fontWeight: 700,
}

const heroMetricStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 14,
  borderRadius: 18,
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(168,85,247,.14)',
}

const heroMetricLabelStyle = {
  fontSize: '.72rem',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  fontWeight: 700,
}

const heroMetricHintStyle = {
  fontSize: '.78rem',
  color: 'var(--muted)',
  lineHeight: 1.5,
}

const tableHeadStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '.76rem',
  fontWeight: 800,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
}

const tableHeadRightStyle = {
  ...tableHeadStyle,
  textAlign: 'right',
}

const tableCellRightStyle = {
  padding: '14px 16px',
  textAlign: 'right',
  fontSize: '.86rem',
}

