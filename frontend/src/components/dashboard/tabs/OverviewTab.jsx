import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertTriangle, BarChart3, DollarSign, Package, ShoppingCart, Target, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS, CHART_COLORS, MONTH_NAMES } from '../biTheme'
import {
  AnalyticsTooltip,
  ChartCard,
  DataListCard,
  EmptyAnalyticsState,
  LegendList,
  MetricCard,
  SectionHeading,
} from '../primitives'

export default function OverviewTab({ data }) {
  const d = data || {}
  const fin = d.finance || {}
  const crmWon = parseFloat(d.leads?.won_value || 0)
  const osRev = parseFloat(fin.os_revenue || 0)
  const inPaid = parseFloat(fin.income_paid || 0)
  const exPaid = parseFloat(fin.expense_paid || 0)
  const inPend = parseFloat(fin.income_pending || 0)
  const receitaMes = (parseFloat(d.orders?.revenue) || 0) + crmWon + osRev
  const balance = (inPaid + crmWon + osRev) - exPaid

  const trendData = (d.revenueByMonth || []).map(month => ({
    label: MONTH_NAMES[Number(String(month.month).split('-')[1]) - 1] || month.month,
    receita: parseFloat(month.revenue) || 0,
  }))
  const orderStatusData = (d.ordersByStatus || []).map((item, idx) => ({
    name: item.label || item.status,
    value: parseFloat(item.amount) || 0,
    count: Number(item.count) || 0,
    color: item.color || CHART_COLORS[idx % CHART_COLORS.length],
  })).filter(item => item.value > 0)
  const topSellerData = (d.topSellers || []).map(item => ({
    name: item.name?.split(' ')[0] || item.name,
    value: parseFloat(item.total_sold) || 0,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Visao executiva"
        description="O panorama principal do negocio no periodo selecionado."
      />

      <div className="bi-metric-grid">
        <MetricCard icon={DollarSign} label="Receita consolidada" value={fmt.brl(receitaMes)} sub={`${d.orders?.total || 0} pedidos no periodo`} color={BI_COLORS.green} />
        <MetricCard icon={balance >= 0 ? TrendingUp : TrendingDown} label="Saldo operacional" value={fmt.brl(balance)} sub={`Recebido ${fmt.brl(inPaid)} · Pago ${fmt.brl(exPaid)}`} color={balance >= 0 ? BI_COLORS.green : BI_COLORS.red} />
        <MetricCard icon={Package} label="Produtos ativos" value={fmt.num(d.products?.total)} sub={`${d.products?.low_stock || 0} com estoque baixo`} color={BI_COLORS.indigo} />
        <MetricCard icon={Target} label="Pipeline comercial" value={fmt.num(d.leads?.open)} sub={`${d.leads?.won || 0} leads ganhos`} color={BI_COLORS.yellow} />
      </div>

      <div className="bi-grid bi-grid--overview-top">
        <ChartCard
          title="Evolucao de receita"
          subtitle="Pedidos, CRM ganho e assistencia consolidados em uma linha executiva."
          style={{ gridColumn: 'span 2' }}
        >
          {trendData.length ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="overviewRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BI_COLORS.purple} stopOpacity={0.38} />
                      <stop offset="95%" stopColor={BI_COLORS.purple} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.12)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => fmt.brl(value)} />} />
                  <Area type="monotone" dataKey="receita" stroke={BI_COLORS.purple} fill="url(#overviewRevenueGradient)" strokeWidth={2.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem evolucao de receita" />
          )}
        </ChartCard>

        <ChartCard title="Pedidos por status" subtitle="Participacao por valor faturado.">
          {orderStatusData.length ? (
            <div className="bi-chart-with-legend">
              <div style={{ height: 220, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={orderStatusData} innerRadius={58} outerRadius={92} paddingAngle={3} dataKey="value" stroke="rgba(255,255,255,.06)" strokeWidth={1}>
                      {orderStatusData.map((item, idx) => <Cell key={idx} fill={item.color} />)}
                    </Pie>
                    <Tooltip
                      content={(
                        <AnalyticsTooltip
                          hideLabel
                          valueFormatter={(value) => fmt.brl(value)}
                          getExtraRows={(point) => point ? [{ label: 'Quantidade', value: fmt.num(point.count) }] : []}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={orderStatusData} valueFormatter={(value) => fmt.brl(value)} />
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem distribuicao de pedidos" />
          )}
        </ChartCard>
      </div>

      <div className="bi-grid bi-grid--overview-bottom">
        <ChartCard title="Top vendedores" subtitle="Quem mais puxou receita no periodo.">
          {topSellerData.length ? (
            <div style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSellerData} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />
                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.brl(value)} />} />
                  <Bar dataKey="value" fill={BI_COLORS.yellow} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem performance de vendas" />
          )}
        </ChartCard>

        <DataListCard
          title="Alertas de estoque"
          items={d.lowStock || []}
          emptyMessage="Sem alertas de estoque"
          renderItem={(product) => {
            const ratio = product.min_stock > 0 ? product.stock_quantity / product.min_stock : 1
            const color = ratio <= 0.3 ? BI_COLORS.red : ratio <= 0.7 ? BI_COLORS.yellow : BI_COLORS.green
            return (
              <div key={product.id} className="bi-data-list__row">
                <div>
                  <div className="bi-data-list__title">{product.name}</div>
                  <div className="bi-data-list__meta">SKU {product.sku}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="bi-data-list__value" style={{ color }}>{fmt.num(product.stock_quantity)}</div>
                  <div className="bi-data-list__meta">min. {fmt.num(product.min_stock)} {product.unit}</div>
                </div>
              </div>
            )
          }}
        />

        <ChartCard title="Radar operacional" subtitle="Indicadores de liquidez e tracao comercial.">
          <div className="bi-overview-radar">
            <div className="bi-overview-radar__item">
              <span>Receita recebida</span>
              <strong>{fmt.brl(inPaid)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>A receber</span>
              <strong>{fmt.brl(inPend)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>CRM ganho</span>
              <strong>{fmt.brl(crmWon)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>Assistencia</span>
              <strong>{fmt.brl(osRev)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>Despesas pagas</span>
              <strong>{fmt.brl(exPaid)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>Despesas pendentes</span>
              <strong>{fmt.brl(parseFloat(fin.expense_pending || 0))}</strong>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="bi-grid bi-grid--overview-lists">
        <DataListCard
          title="Pedidos recentes"
          items={d.recentOrders || []}
          emptyMessage="Sem pedidos no periodo"
          style={{ gridColumn: 'span 2' }}
          renderItem={(order) => (
            <div key={order.id} className="bi-data-list__row">
              <div>
                <div className="bi-data-list__title">{order.number}</div>
                <div className="bi-data-list__meta">{order.client_name || 'Cliente nao identificado'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="bi-data-list__value">{fmt.brl(order.total)}</div>
                <div className="bi-data-list__meta">{order.status}</div>
              </div>
            </div>
          )}
        />

        <ChartCard title="Pulso do funil" subtitle="Leads e ganho comercial no periodo.">
          <div className="bi-overview-radar">
            <div className="bi-overview-radar__item">
              <span>Leads totais</span>
              <strong>{fmt.num(d.leads?.total)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>Em aberto</span>
              <strong>{fmt.num(d.leads?.open)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>Ganhos</span>
              <strong>{fmt.num(d.leads?.won)}</strong>
            </div>
            <div className="bi-overview-radar__item">
              <span>Valor ganho</span>
              <strong>{fmt.brl(d.leads?.won_value)}</strong>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
