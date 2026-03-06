import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CheckCircle2, DollarSign, Layers3, Wrench } from 'lucide-react'
import { Btn, fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS, MONTH_NAMES } from '../biTheme'
import { AnalyticsSkeleton, AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function ServiceTab({ data, loading = false, error = '', onRetry }) {
  if (loading) return <AnalyticsSkeleton cards={3} />
  if (error) {
    return (
      <EmptyAnalyticsState
        title="Falha ao carregar assistencia"
        description={error}
        action={onRetry ? <Btn size="sm" onClick={onRetry}>Tentar novamente</Btn> : null}
      />
    )
  }
  if (!data) return <EmptyAnalyticsState title="Sem dados de assistencia" description="Nao foi possivel localizar indicadores para este periodo." />

  const kpis = data.kpis || {}
  const byStatus = (data.byStatus || []).map((item, idx) => ({
    name: item.status,
    count: Number(item.count) || 0,
    revenue: parseFloat(item.revenue) || 0,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }))
  const revenueByMonth = (data.revenueByMonth || []).map(item => ({
    label: MONTH_NAMES[Number(String(item.month).split('-')[1]) - 1] || item.month,
    receita: parseFloat(item.revenue) || 0,
    entregues: Number(item.delivered) || 0,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Assistencia tecnica"
        description="Leitura do backlog, entregas e receita da operacao de assistencia."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={Wrench} label="Ordens abertas" value={fmt.num(kpis.open || 0)} sub="Backlog em andamento" color={BI_COLORS.yellow} />
        <MetricCard icon={CheckCircle2} label="Ordens entregues" value={fmt.num(kpis.delivered || 0)} sub="Fechadas no periodo" color={BI_COLORS.green} />
        <MetricCard icon={DollarSign} label="Receita de assistencia" value={fmt.brl(kpis.total_revenue || 0)} sub="Itens e servicos entregues" color={BI_COLORS.cyan} />
      </div>

      <div className="bi-grid bi-grid--service-top">
        <ChartCard title="Receita mensal de assistencia" subtitle="Ordens entregues com valor consolidado.">
          {revenueByMonth.length ? (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByMonth}>
                  <defs>
                    <linearGradient id="serviceRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BI_COLORS.cyan} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={BI_COLORS.cyan} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip
                    content={(
                      <AnalyticsTooltip
                        valueFormatter={(value) => fmt.brl(value)}
                        getExtraRows={(point) => point ? [{ label: 'Entregues', value: fmt.num(point.entregues) }] : []}
                      />
                    )}
                  />
                  <Area type="monotone" dataKey="receita" stroke={BI_COLORS.cyan} fill="url(#serviceRevenueGradient)" strokeWidth={2.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem receita de assistencia" />
          )}
        </ChartCard>

        <ChartCard title="Ordens por status" subtitle="Distribuicao do fluxo operacional.">
          {byStatus.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 240, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byStatus} innerRadius={56} outerRadius={92} dataKey="count">
                      {byStatus.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip
                      content={(
                        <AnalyticsTooltip
                          hideLabel
                          valueFormatter={(value) => fmt.num(value)}
                          getExtraRows={(point) => point ? [{ label: 'Receita', value: fmt.brl(point.revenue) }] : []}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={byStatus.map(item => ({ ...item, value: item.count }))} valueFormatter={(value) => fmt.num(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem status de assistencia" />
          )}
        </ChartCard>
      </div>

      <DataListCard
        title="Leitura de status"
        items={byStatus}
        emptyMessage="Sem detalhamento de status"
        renderItem={(item) => (
          <div key={item.name} className="bi-data-list__row">
            <div>
              <div className="bi-data-list__title">{item.name}</div>
              <div className="bi-data-list__meta">{fmt.num(item.count)} ordens</div>
            </div>
            <div className="bi-data-list__value">{fmt.brl(item.revenue)}</div>
          </div>
        )}
      />
    </div>
  )
}
