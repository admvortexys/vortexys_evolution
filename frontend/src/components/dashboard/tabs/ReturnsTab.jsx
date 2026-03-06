import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { DollarSign, RotateCcw, ShieldAlert } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS } from '../biTheme'
import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function ReturnsTab({ data }) {
  if (!data) return <EmptyAnalyticsState title="Carregando devoluções" />

  const summary = data.summary || {}
  const byStatus = (data.byStatus || []).map((item, idx) => ({
    name: item.status,
    count: Number(item.count) || 0,
    amount: parseFloat(item.refund_amount) || 0,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }))
  const byType = (data.byType || []).map((item, idx) => ({
    name: item.type || 'Outros',
    count: Number(item.count) || 0,
    amount: parseFloat(item.refund_amount) || 0,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Devolucoes e reembolsos"
        description="Volume de devoluções, impacto financeiro e leitura por tipo e status."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={RotateCcw} label="Total de devoluções" value={fmt.num(summary.total || 0)} sub="Registros no período" color={BI_COLORS.indigo} />
        <MetricCard icon={DollarSign} label="Valor devolvido" value={fmt.brl(summary.total_refund || 0)} sub="Pressão de reembolso" color={BI_COLORS.red} />
        <MetricCard icon={ShieldAlert} label="Tipos monitorados" value={fmt.num(byType.length)} sub="Categorias de devolução ativas" color={BI_COLORS.yellow} />
      </div>

      <div className="bi-grid bi-grid--returns-top">
        <ChartCard title="Status das devoluções" subtitle="Leitura do fluxo atual de tratamento.">
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
                          getExtraRows={(point) => point ? [{ label: 'Valor', value: fmt.brl(point.amount) }] : []}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={byStatus.map(item => ({ ...item, value: item.count }))} valueFormatter={(value) => fmt.num(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem status de devolução" />
          )}
        </ChartCard>

        <ChartCard title="Tipos de devolução" subtitle="Quantidade por tipo e impacto associado.">
          {byType.length ? (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip
                    content={(
                      <AnalyticsTooltip
                        valueFormatter={(value) => fmt.num(value)}
                        getExtraRows={(point) => point ? [{ label: 'Valor', value: fmt.brl(point.amount) }] : []}
                      />
                    )}
                  />
                  <Bar dataKey="count" fill={BI_COLORS.cyan} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem tipos de devolução" />
          )}
        </ChartCard>
      </div>

      <DataListCard
        title="Resumo por tipo"
        items={byType}
        emptyMessage="Sem resumo de devoluções"
        renderItem={(item) => (
          <div key={item.name} className="bi-data-list__row">
            <div>
              <div className="bi-data-list__title">{item.name}</div>
              <div className="bi-data-list__meta">{fmt.num(item.count)} ocorrencias</div>
            </div>
            <div className="bi-data-list__value">{fmt.brl(item.amount)}</div>
          </div>
        )}
      />
    </div>
  )
}
