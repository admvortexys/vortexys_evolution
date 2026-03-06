import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Bar, BarChart, Legend,
} from 'recharts'
import { AlertTriangle, Calendar, Clock3, CreditCard, DollarSign, Receipt, Tag, TrendingDown, Wallet } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS, MONTH_FULL, MONTH_NAMES } from '../biTheme'
import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function FinanceTab({ data, filterMode, month, year, singleDate, startDate, endDate }) {
  if (!data) return <EmptyAnalyticsState title="Carregando financeiro" description="Buscando métricas financeiras do período." />

  const summary = data.summary || {}
  const evolution = data.evolution || []
  const byCat = data.byCat || []

  const crmWon = parseFloat(summary.crm_won_value || 0)
  const osRev = parseFloat(summary.os_revenue || 0)
  const ordersRev = parseFloat(summary.orders_revenue || 0)
  const received = parseFloat(summary.income_paid || 0) + crmWon + osRev
  const expenses = parseFloat(summary.expense_paid || 0)
  const receivable = parseFloat(summary.income_pending || 0)
  const payable = parseFloat(summary.expense_pending || 0)
  const incomeOverdue = parseFloat(summary.income_overdue || 0)
  const expenseOverdue = parseFloat(summary.expense_overdue || 0)
  const balance = received - expenses

  const evolutionData = evolution.map(item => ({
    label: `${MONTH_NAMES[Number(item.month) - 1]}/${String(item.year).slice(-2)}`,
    receita: parseFloat(item.income) || 0,
    despesa: parseFloat(item.expense) || 0,
  }))

  const expenseCategories = byCat
    .filter(item => item.type === 'expense' && parseFloat(item.total) > 0)
    .map((item, idx) => ({
      name: item.name || 'Sem categoria',
      value: parseFloat(item.total) || 0,
      color: item.color || CHART_COLORS[idx % CHART_COLORS.length],
    }))

  const financeMix = [
    { name: 'Recebido', value: received, color: BI_COLORS.green },
    { name: 'A receber', value: receivable, color: BI_COLORS.yellow },
    { name: 'Pago', value: expenses, color: BI_COLORS.red },
    { name: 'A pagar', value: payable, color: BI_COLORS.orange },
  ].filter(item => item.value > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Financeiro"
        description="Visão de liquidez, compromissos e composição do caixa."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={DollarSign} label="Entradas realizadas" value={fmt.brl(received)} sub={`Pedidos ${fmt.brl(ordersRev)} · CRM ${fmt.brl(crmWon)} · Assistência ${fmt.brl(osRev)}`} color={BI_COLORS.green} />
        <MetricCard icon={TrendingDown} label="Saídas realizadas" value={fmt.brl(expenses)} sub="Despesas liquidadas no período" color={BI_COLORS.red} />
        <MetricCard icon={Clock3} label="A receber" value={fmt.brl(receivable)} sub={`Vencido ${fmt.brl(incomeOverdue)}`} color={BI_COLORS.yellow} />
        <MetricCard icon={Receipt} label="A pagar" value={fmt.brl(payable)} sub={`Vencido ${fmt.brl(expenseOverdue)}`} color={BI_COLORS.orange} />
        <MetricCard icon={Wallet} label="Saldo realizado" value={fmt.brl(balance)} sub={`Taxas ${fmt.brl(parseFloat(summary.total_fees || 0))}`} color={balance >= 0 ? BI_COLORS.green : BI_COLORS.red} />
        {incomeOverdue > 0 && (
          <MetricCard icon={AlertTriangle} label="Inadimplência" value={fmt.brl(incomeOverdue)} sub="Receitas vencidas não pagas" color={BI_COLORS.red} />
        )}
      </div>

      <div className="bi-grid bi-grid--finance-top">
        <ChartCard
          title="Linha de resultado"
          subtitle="Comparativo mensal entre entradas e saídas realizadas."
          style={{ gridColumn: 'span 2' }}
        >
          {evolutionData.length ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionData}>
                  <defs>
                    <linearGradient id="financeIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BI_COLORS.green} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={BI_COLORS.green} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="financeExpenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BI_COLORS.red} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={BI_COLORS.red} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.12)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => fmt.brl(value)} />} />
                  <Legend wrapperStyle={{ color: 'var(--text-2)' }} />
                  <Area type="monotone" dataKey="receita" stroke={BI_COLORS.green} fill="url(#financeIncomeGradient)" strokeWidth={2.1} name="Entradas" />
                  <Area type="monotone" dataKey="despesa" stroke={BI_COLORS.red} fill="url(#financeExpenseGradient)" strokeWidth={2.1} name="Saídas" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem histórico financeiro" />
          )}
        </ChartCard>

        <ChartCard title="Mix financeiro do período" subtitle="Distribuição de realizados e pendências.">
          {financeMix.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 220, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={financeMix} innerRadius={58} outerRadius={92} dataKey="value" stroke="rgba(255,255,255,.06)" strokeWidth={1}>
                      {financeMix.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.brl(value)} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={financeMix} valueFormatter={(value) => fmt.brl(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem mix financeiro" />
          )}
        </ChartCard>
      </div>

      <div className="bi-grid bi-grid--finance-bottom">
        <ChartCard title="Despesas por categoria" subtitle="Onde o caixa esta sendo consumido.">
          {expenseCategories.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 240, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseCategories} innerRadius={56} outerRadius={92} dataKey="value">
                      {expenseCategories.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.brl(value)} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={expenseCategories} valueFormatter={(value) => fmt.brl(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem categorias com despesa" />
          )}
        </ChartCard>

        <ChartCard title="Previsão de entradas" subtitle={(() => {
            let daysLabel = 'Conforme filtro'
            if (filterMode === 'month' && month && year) {
              const daysInMonth = new Date(year, month, 0).getDate()
              daysLabel = `${daysInMonth} dias de ${MONTH_FULL[month - 1]}`
            } else if (filterMode === 'period' && startDate && endDate) {
              const d1 = new Date(startDate)
              const d2 = new Date(endDate)
              const days = Math.ceil((d2 - d1) / (24 * 60 * 60 * 1000)) + 1
              daysLabel = `${days} dias do período`
            } else if (filterMode === 'date' && (singleDate || startDate)) {
              daysLabel = '1 dia'
            }
            return `${daysLabel}. Faturamento real nos dias passados, projeção por ticket médio nos restantes.`
          })()} style={{ gridColumn: 'span 2', alignSelf: 'start' }}>
          {(() => {
            const cf = data.cashFlowProjected || []
            const hasData = cf.some((d) => (parseFloat(d.receita) || 0) !== 0 || (parseFloat(d.acumulado) || 0) !== 0)
            if (!hasData) {
              return (
                <EmptyAnalyticsState
                  title="Sem dados de previsão"
                  description="Nenhum faturamento ou projeção para o período."
                />
              )
            }
            const min = Math.min(...cf.map((d) => parseFloat(d.acumulado) || 0))
            const max = Math.max(...cf.map((d) => parseFloat(d.acumulado) || 0))
            const pad = Math.max(Math.abs(max - min) * 0.15 || 1000, 500)
            const domain = [Math.min(min - pad, 0), Math.max(max + pad, 0)]
            return (
              <div style={{ height: 220, minHeight: 220, maxHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cf} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.12)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--muted)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={36}
                      tickFormatter={(v) => v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : ''}
                    />
                    <YAxis
                      domain={domain}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => fmt.compact(v)}
                      width={44}
                    />
                    <Tooltip
                      content={<AnalyticsTooltip
                        valueFormatter={(v) => fmt.brl(v)}
                        labelFormatter={(l) => l ? new Date(l).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                        getExtraRows={(p) => p ? [
                          { label: 'Entrada', value: fmt.brl(p.receita) },
                          { label: 'Acumulado', value: fmt.brl(p.acumulado) },
                        ] : []}
                      />}
                    />
                    <defs>
                      <linearGradient id="cashFlowGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BI_COLORS.indigo} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={BI_COLORS.indigo} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="acumulado" stroke={BI_COLORS.indigo} fill="url(#cashFlowGradient)" strokeWidth={2} name="Entradas acumuladas" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </ChartCard>

        {(data.byMethod || []).length > 0 && (
          <ChartCard title="Recebimento por método" subtitle="Formas de pagamento no período.">
            <div className="bi-chart-with-legend">
              <div style={{ height: 200, minWidth: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(data.byMethod || []).filter(m => m.type === 'income' && parseFloat(m.total) > 0).map((m, idx) => ({
                        name: (m.payment_method || 'Outro').replace('_', ' '),
                        value: parseFloat(m.total) || 0,
                        color: CHART_COLORS[idx % CHART_COLORS.length],
                      }))}
                      innerRadius={48}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {((data.byMethod || []).filter(m => m.type === 'income' && parseFloat(m.total) > 0) || []).map((item, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(v) => fmt.brl(v)} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={(data.byMethod || []).filter(m => m.type === 'income' && parseFloat(m.total) > 0).map((m, idx) => ({
                name: (m.payment_method || 'Outro').replace('_', ' '),
                value: parseFloat(m.total) || 0,
                color: CHART_COLORS[idx % CHART_COLORS.length],
              }))} valueFormatter={(v) => fmt.brl(v)} />
            </div>
          </ChartCard>
        )}

        {(data.overdue?.items || []).length > 0 && (
          <DataListCard
            title="Inadimplência"
            items={(data.overdue?.items || []).slice(0, 10)}
            emptyMessage=""
            renderItem={(item) => (
              <div key={item.id} className="bi-data-list__row">
                <div>
                  <div className="bi-data-list__title">{item.title}</div>
                  <div className="bi-data-list__meta">{item.client_name || item.order_number || '—'} · venc. {fmt.date(item.due_date)}</div>
                </div>
                <div className="bi-data-list__value" style={{ color: BI_COLORS.red }}>{fmt.brl(item.amount)}</div>
              </div>
            )}
          />
        )}

        <ChartCard title="Saídas por categoria" subtitle="Comparativo em barras para leitura rápida.">
          {expenseCategories.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseCategories} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.brl(value)} />} />
                  <Bar dataKey="value" fill={BI_COLORS.orange} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem barras para exibir" />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
