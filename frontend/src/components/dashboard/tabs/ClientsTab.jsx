import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { DollarSign, ShoppingCart, Users } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS } from '../biTheme'
import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function ClientsTab({ data }) {
  if (!data) return <EmptyAnalyticsState title="Carregando clientes" />

  const topClients = (data.topClients || []).slice(0, 10).map(item => ({
    name: item.name?.length > 20 ? `${item.name.slice(0, 18)}...` : item.name,
    fullName: item.name,
    revenue: parseFloat(item.revenue) || 0,
    orders: item.orders,
    ticket: parseFloat(item.ticket) || 0,
  }))
  const byType = (data.byType || []).map((item, idx) => ({
    name: item.type || 'Outros',
    value: parseFloat(item.revenue) || 0,
    clients: item.clients,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  })).filter(item => item.value > 0)
  const totalRevenue = (data.topClients || []).reduce((sum, item) => sum + (parseFloat(item.revenue) || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Clientes"
        description="Quem compra mais, como a base se distribui e o peso de cada segmento no faturamento."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={Users} label="Novos clientes" value={fmt.num(data.newClients || 0)} sub="Cadastros criados no periodo" color={BI_COLORS.indigo} />
        <MetricCard icon={ShoppingCart} label="Clientes compradores" value={fmt.num(data.topClients?.length || 0)} sub="Base com compra no periodo" color={BI_COLORS.green} />
        <MetricCard icon={DollarSign} label="Receita cliente" value={fmt.brl(totalRevenue)} sub="Receita acumulada nos principais clientes" color={BI_COLORS.yellow} />
      </div>

      <div className="bi-grid bi-grid--clients-top">
        <ChartCard title="Top clientes por receita" subtitle="Quem mais concentra faturamento.">
          {topClients.length ? (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClients} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={(
                      <AnalyticsTooltip
                        hideLabel
                        valueFormatter={(value) => fmt.brl(value)}
                        getExtraRows={(point) => point ? [
                          { label: 'Pedidos', value: fmt.num(point.orders) },
                          { label: 'Ticket', value: fmt.brl(point.ticket) },
                        ] : []}
                      />
                    )}
                  />
                  <Bar dataKey="revenue" fill={BI_COLORS.green} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem top clientes" />
          )}
        </ChartCard>

        <ChartCard title="Receita por tipo de cliente" subtitle="Participacao por segmento.">
          {byType.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 240, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byType} innerRadius={56} outerRadius={92} dataKey="value">
                      {byType.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip
                      content={(
                        <AnalyticsTooltip
                          hideLabel
                          valueFormatter={(value) => fmt.brl(value)}
                          getExtraRows={(point) => point ? [{ label: 'Clientes', value: fmt.num(point.clients) }] : []}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={byType} valueFormatter={(value) => fmt.brl(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem segmentacao de clientes" />
          )}
        </ChartCard>
      </div>

      <DataListCard
        title="Carteira em destaque"
        items={data.topClients || []}
        emptyMessage="Sem clientes com compra"
        renderItem={(item) => (
          <div key={item.id} className="bi-data-list__row">
            <div>
              <div className="bi-data-list__title">{item.name}</div>
              <div className="bi-data-list__meta">{item.type} · {fmt.num(item.orders)} pedidos</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="bi-data-list__value">{fmt.brl(item.revenue)}</div>
              <div className="bi-data-list__meta">ticket {fmt.brl(item.ticket)}</div>
            </div>
          </div>
        )}
      />
    </div>
  )
}
