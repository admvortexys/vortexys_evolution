import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CheckCircle2, Clock3, DollarSign, Layers3, Wrench } from 'lucide-react'
import { Btn, fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS, MONTH_NAMES } from '../biTheme'
import { AnalyticsSkeleton, AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function ServiceTab({ data, loading = false, error = '', onRetry }) {
  if (loading) return <AnalyticsSkeleton cards={3} />
  if (error) {
    return (
      <EmptyAnalyticsState
        title="Falha ao carregar assistência"
        description={error}
        action={onRetry ? <Btn size="sm" onClick={onRetry}>Tentar novamente</Btn> : null}
      />
    )
  }
  if (!data) return <EmptyAnalyticsState title="Sem dados de assistência" description="Não foi possível localizar indicadores para este período." />

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
    <div className="bi-tab-layout">
      <SectionHeading
        title="Assistência técnica"
        description="Leitura do backlog, entregas e receita da operação de assistência."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={Wrench} label="Ordens abertas" value={fmt.num(kpis.open || 0)} sub="Backlog em andamento" color={BI_COLORS.yellow} />
        <MetricCard icon={CheckCircle2} label="Ordens entregues" value={fmt.num(kpis.delivered || 0)} sub="Fechadas no período" color={BI_COLORS.green} />
        <MetricCard icon={DollarSign} label="Receita de assistência" value={fmt.brl(kpis.total_revenue || 0)} sub="Itens e serviços entregues" color={BI_COLORS.cyan} />
        <MetricCard icon={Clock3} label="Prazo médio" value={`${Number(data.prazoMedioDias || 0).toFixed(1)} dias`} sub="Tempo até entrega" color={BI_COLORS.blue} />
        <MetricCard icon={DollarSign} label="Ticket médio" value={fmt.brl(data.ticketMedio || 0)} sub="Valor médio por OS entregue" color={BI_COLORS.purple} />
      </div>

      <div className="bi-grid bi-grid--service-top">
        <ChartCard title="Receita mensal de assistência" subtitle="Ordens entregues com valor consolidado.">
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
            <EmptyAnalyticsState title="Sem receita de assistência" />
          )}
        </ChartCard>

        <ChartCard title="Ordens por status" subtitle="Distribuição do fluxo operacional.">
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
            <EmptyAnalyticsState title="Sem status de assistência" />
          )}
        </ChartCard>
      </div>

      {(data.byTechnician || []).length > 0 && (
        <ChartCard title="OS por técnico" subtitle="Receita entregue por técnico.">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data.byTechnician || []).filter(t => t.revenue > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                <XAxis dataKey="technician_name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => fmt.compact(v)} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(v) => fmt.brl(v)} getExtraRows={(p) => p ? [{ label: 'OS entregues', value: p.count }] : []} />} />
                <Bar dataKey="revenue" fill={BI_COLORS.cyan} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      {((data.defects || []).length > 0 || (data.partsConsumed || []).length > 0) && (
        <div className="bi-grid bi-grid--service-top">
          {(data.defects || []).length > 0 && (
            <ChartCard title="Defeitos mais comuns" subtitle="Problema reportado na entrada.">
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(data.defects || []).slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                    <XAxis type="number" tickFormatter={v => fmt.compact(v)} />
                    <YAxis type="category" dataKey="defeito" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip content={<AnalyticsTooltip valueFormatter={(v) => fmt.num(v)} getExtraRows={(p) => p ? [{ label: 'Qtd', value: p.count }] : []} />} />
                    <Bar dataKey="count" fill={BI_COLORS.orange} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}
          {(data.partsConsumed || []).length > 0 && (
            <ChartCard title="Peças mais consumidas" subtitle="Por quantidade usada.">
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(data.partsConsumed || []).slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="peca" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip content={<AnalyticsTooltip valueFormatter={(v) => fmt.num(v)} getExtraRows={(p) => p ? [{ label: 'Valor', value: fmt.brl(p.valor) }] : []} />} />
                    <Bar dataKey="qty" fill={BI_COLORS.indigo} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}
        </div>
      )}

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
