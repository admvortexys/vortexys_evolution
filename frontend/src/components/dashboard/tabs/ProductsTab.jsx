import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, DollarSign, Layers3, Package, ShoppingBag } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS } from '../biTheme'
import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'

export default function ProductsTab({ data }) {
  if (!data) return <EmptyAnalyticsState title="Carregando performance de produtos" />

  const topSold = (data.topSold || []).slice(0, 10).map(item => ({
    name: item.name?.length > 20 ? `${item.name.slice(0, 18)}...` : item.name,
    fullName: item.name,
    qty: parseFloat(item.qty_sold) || 0,
  }))
  const topRevenue = (data.topRevenue || []).slice(0, 10).map(item => ({
    name: item.name?.length > 20 ? `${item.name.slice(0, 18)}...` : item.name,
    fullName: item.name,
    revenue: parseFloat(item.revenue) || 0,
  }))
  const categories = (data.categories || []).map((item, idx) => ({
    name: item.category || 'Sem categoria',
    value: parseFloat(item.revenue) || 0,
    quantity: parseFloat(item.qty || 0),
    color: CHART_COLORS[idx % CHART_COLORS.length],
  })).filter(item => item.value > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Produtos e estoque"
        description="Itens mais vendidos, categorias que lideram receita e alertas de abastecimento."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={Package} label="Produtos em destaque" value={fmt.num(data.topSold?.length || 0)} sub="Itens com giro no periodo" color={BI_COLORS.indigo} />
        <MetricCard icon={ShoppingBag} label="Volume vendido" value={fmt.num((data.topSold || []).reduce((sum, item) => sum + (parseFloat(item.qty_sold) || 0), 0))} sub="Unidades movimentadas" color={BI_COLORS.yellow} />
        <MetricCard icon={DollarSign} label="Receita lider" value={fmt.brl(data.topRevenue?.[0]?.revenue || 0)} sub={data.topRevenue?.[0]?.name || 'Sem lider'} color={BI_COLORS.green} />
        <MetricCard icon={AlertTriangle} label="Baixo estoque" value={fmt.num(data.lowStock?.length || 0)} sub="Itens pedindo reposicao" color={BI_COLORS.red} />
      </div>

      <div className="bi-grid bi-grid--products-top">
        <ChartCard title="Mais vendidos por quantidade" subtitle="O que gira com mais intensidade.">
          {topSold.length ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSold} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.num(value)} getExtraRows={(point) => point ? [{ label: 'Produto', value: point.fullName }] : []} />} />
                  <Bar dataKey="qty" fill={BI_COLORS.indigo} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem volume vendido" />
          )}
        </ChartCard>

        <ChartCard title="Mais vendidos por receita" subtitle="Itens que mais puxaram faturamento.">
          {topRevenue.length ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRevenue} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.brl(value)} getExtraRows={(point) => point ? [{ label: 'Produto', value: point.fullName }] : []} />} />
                  <Bar dataKey="revenue" fill={BI_COLORS.green} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem receita por produto" />
          )}
        </ChartCard>
      </div>

      <div className="bi-grid bi-grid--products-bottom">
        <ChartCard title="Receita por categoria" subtitle="Mix de categorias no periodo." style={{ gridColumn: 'span 2' }}>
          {categories.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 260, minWidth: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categories} innerRadius={64} outerRadius={96} dataKey="value">
                      {categories.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip
                      content={(
                        <AnalyticsTooltip
                          hideLabel
                          valueFormatter={(value) => fmt.brl(value)}
                          getExtraRows={(point) => point ? [{ label: 'Quantidade', value: fmt.num(point.quantity) }] : []}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={categories} valueFormatter={(value) => fmt.brl(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem categorias com receita" />
          )}
        </ChartCard>

        <DataListCard
          title="Itens em risco de ruptura"
          items={data.lowStock || []}
          emptyMessage="Sem produtos com estoque baixo"
          style={{ gridColumn: 'span 2' }}
          renderItem={(item) => (
            <div key={item.id} className="bi-data-list__row">
              <div>
                <div className="bi-data-list__title">{item.name}</div>
                <div className="bi-data-list__meta">{item.sku}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="bi-data-list__value" style={{ color: BI_COLORS.red }}>{fmt.num(item.stock_quantity)}</div>
                <div className="bi-data-list__meta">min. {fmt.num(item.min_stock)}</div>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  )
}
