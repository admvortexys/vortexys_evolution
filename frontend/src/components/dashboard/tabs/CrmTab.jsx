import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, CheckCircle2, Clock3, DollarSign, Layers3, Percent, Target, Wallet } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS } from '../biTheme'
import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function CrmTab({ data }) {
  if (!data) return <EmptyAnalyticsState title="Carregando CRM" />

  const overview = data.overview || {}
  const conversionRate = overview.total > 0 ? ((overview.won / overview.total) * 100).toFixed(1) : '0.0'
  const pipelineData = (data.byPipeline || []).map((item, idx) => ({
    name: item.pipeline,
    value: parseFloat(item.won_value) || 0,
    leads: item.leads,
    won: item.won,
    lost: item.lost,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  })).filter(item => item.name)
  const sourceData = (data.bySource || []).map((item, idx) => ({
    name: item.source,
    value: parseFloat(item.won_value) || 0,
    leads: item.leads,
    won: item.won,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  })).filter(item => item.value > 0 || item.leads > 0)

  return (
    <div className="bi-tab-layout">
      <SectionHeading
        title="CRM e conversão"
        description="Pipeline, origens, conversão e negócios ganhos no período."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={Target} label="Leads totais" value={fmt.num(overview.total || 0)} sub="Base no período selecionado" color={BI_COLORS.indigo} />
        <MetricCard icon={Clock3} label="Em aberto" value={fmt.num(overview.open || 0)} sub={`Pipeline ${fmt.brl(overview.pipeline_value || 0)}`} color={BI_COLORS.yellow} />
        <MetricCard icon={CheckCircle2} label="Ganhos" value={fmt.num(overview.won || 0)} sub={fmt.brl(overview.won_value || 0)} color={BI_COLORS.green} />
        <MetricCard icon={AlertTriangle} label="Perdidos" value={fmt.num(overview.lost || 0)} sub="Negócios fora do funil" color={BI_COLORS.red} />
        <MetricCard icon={Percent} label="Conversão" value={`${conversionRate}%`} sub={`Ticket médio ${fmt.brl(overview.avg_deal || 0)}`} color={BI_COLORS.purple} />
        <MetricCard icon={Wallet} label="Tempo médio aberto" value={`${data.avgDaysOpen || 0} dias`} sub="Leads ainda ativos" color={BI_COLORS.blue} />
        {(data.proposalsStats?.enviadas > 0 || data.proposalsStats?.aprovadas > 0) && (
          <MetricCard icon={Target} label="Propostas aprovadas" value={data.proposalsStats.aprovadas || 0} sub={`${data.proposalsStats.enviadas || 0} enviadas · ${fmt.brl(data.proposalsStats.valor_aprovado || 0)}`} color={BI_COLORS.green} />
        )}
        {data.valorGanhoPerdido && (
          <MetricCard icon={DollarSign} label="Ganho x Perdido" value={fmt.brl((data.valorGanhoPerdido.ganho || 0) - (data.valorGanhoPerdido.perdido || 0))} sub={`Ganho ${fmt.brl(data.valorGanhoPerdido.ganho)} · Perdido ${fmt.brl(data.valorGanhoPerdido.perdido)}`} color={BI_COLORS.indigo} />
        )}
      </div>

      <div className="bi-grid bi-grid--crm-top">
        <ChartCard title="Valor ganho por pipeline" subtitle="Onde os negócios estão convertendo melhor." style={{ height: 'auto', alignSelf: 'start' }}>
          {pipelineData.length ? (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.12)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip
                    content={(
                      <AnalyticsTooltip
                        valueFormatter={(value) => fmt.brl(value)}
                        getExtraRows={(point) => point ? [
                          { label: 'Leads', value: fmt.num(point.leads) },
                          { label: 'Ganhos', value: fmt.num(point.won) },
                          { label: 'Perdidos', value: fmt.num(point.lost) },
                        ] : []}
                      />
                    )}
                  />
                  <Bar dataKey="value" name="Valor ganho" fill={BI_COLORS.purple} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem pipelines para analisar" />
          )}
        </ChartCard>

        <ChartCard title="Origem dos ganhos" subtitle="Canais que mais trazem valor." style={{ height: 'auto', alignSelf: 'start' }}>
          {sourceData.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 240, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData} innerRadius={56} outerRadius={92} dataKey="value">
                      {sourceData.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip
                      content={(
                        <AnalyticsTooltip
                          hideLabel
                          valueFormatter={(value) => fmt.brl(value)}
                          getExtraRows={(point) => point ? [
                            { label: 'Leads', value: fmt.num(point.leads) },
                            { label: 'Ganhos', value: fmt.num(point.won) },
                          ] : []}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={sourceData} valueFormatter={(value) => fmt.brl(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem origens para analisar" />
          )}
        </ChartCard>
      </div>

      {(data.lostReasons || []).length > 0 && (
        <ChartCard title="Motivos de perda" subtitle="Por que negócios saem do funil.">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data.lostReasons || []).map((r, idx) => ({ ...r, value: parseFloat(r.valor_perdido) || 0 }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                <XAxis type="number" tickFormatter={v => fmt.compact(v)} />
                <YAxis type="category" dataKey="motivo" width={120} tick={{ fontSize: 11 }} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(v) => fmt.brl(v)} getExtraRows={(p) => p ? [{ label: 'Qtde', value: p.count }] : []} />} />
                <Bar dataKey="value" fill={BI_COLORS.red} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      <DataListCard
        title="Negócios ganhos recentemente"
        items={data.recentWon || []}
        emptyMessage="Sem negócios ganhos"
        renderItem={(lead) => (
          <div key={lead.id} className="bi-data-list__row">
            <div>
              <div className="bi-data-list__title">{lead.name}</div>
              <div className="bi-data-list__meta">{lead.pipeline} · {fmt.num(lead.days_in_pipeline || 0)} dias no pipeline</div>
            </div>
            <div className="bi-data-list__value">{fmt.brl(lead.estimated_value)}</div>
          </div>
        )}
      />
    </div>
  )
}
