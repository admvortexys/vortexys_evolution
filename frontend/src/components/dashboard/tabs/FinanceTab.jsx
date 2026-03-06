import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Bar, BarChart, Legend,
} from 'recharts'
import { Clock3, DollarSign, Receipt, Tag, TrendingDown, Wallet } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS, MONTH_NAMES } from '../biTheme'
import { AnalyticsTooltip, ChartCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function FinanceTab({ data }) {
  if (!data) return <EmptyAnalyticsState title="Carregando financeiro" description="Buscando metricas financeiras do periodo." />

  const summary = data.summary || {}
  const evolution = data.evolution || []
  const byCat = data.byCat || []

  const crmWon = parseFloat(summary.crm_won_value || 0)
  const osRev = parseFloat(summary.os_revenue || 0)
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
        description="Visao de liquidez, compromissos e composicao do caixa."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={DollarSign} label="Entradas realizadas" value={fmt.brl(received)} sub={`CRM ${fmt.brl(crmWon)} · Assistencia ${fmt.brl(osRev)}`} color={BI_COLORS.green} />
        <MetricCard icon={TrendingDown} label="Saidas realizadas" value={fmt.brl(expenses)} sub={`Despesas liquidadas no periodo`} color={BI_COLORS.red} />
        <MetricCard icon={Clock3} label="A receber" value={fmt.brl(receivable)} sub={`Vencido ${fmt.brl(incomeOverdue)}`} color={BI_COLORS.yellow} />
        <MetricCard icon={Receipt} label="A pagar" value={fmt.brl(payable)} sub={`Vencido ${fmt.brl(expenseOverdue)}`} color={BI_COLORS.orange} />
        <MetricCard icon={Wallet} label="Saldo realizado" value={fmt.brl(balance)} sub={`Taxas ${fmt.brl(parseFloat(summary.total_fees || 0))}`} color={balance >= 0 ? BI_COLORS.green : BI_COLORS.red} />
      </div>

      <div className="bi-grid bi-grid--finance-top">
        <ChartCard
          title="Linha de resultado"
          subtitle="Comparativo mensal entre entradas e saidas realizadas."
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
                  <Area type="monotone" dataKey="despesa" stroke={BI_COLORS.red} fill="url(#financeExpenseGradient)" strokeWidth={2.1} name="Saidas" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem historico financeiro" />
          )}
        </ChartCard>

        <ChartCard title="Mix financeiro do periodo" subtitle="Distribuicao de realizados e pendencias.">
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

        <ChartCard title="Saidas por categoria" subtitle="Comparativo em barras para leitura rapida.">
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
