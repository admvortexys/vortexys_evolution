import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { Award, DollarSign, Layers3, ShoppingCart, UserRound } from 'lucide-react'
import { fmt } from '../../UI'
import { BI_COLORS } from '../biTheme'
import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, MetricCard, SectionHeading } from '../primitives'

export default function SalesTab({ data, selSeller, setSelSeller, loadSellers }) {
  if (!data) return <EmptyAnalyticsState title="Carregando performance comercial" />

  const ranking = data.ranking || []
  const detail = data.detail
  const rankingChart = ranking.map(item => ({
    name: item.name?.split(' ')[0] || item.name,
    receita: parseFloat(item.revenue) || 0,
  }))
  const selectedSeller = ranking.find(item => String(item.id) === String(selSeller))
  const sellerTrend = (detail?.byDay || []).map(row => ({
    day: row.day,
    revenue: parseFloat(row.revenue) || 0,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeading
        title="Vendas e performance"
        description="Ranking comercial, detalhamento por vendedor e produtos que puxaram resultado."
      />

      <div className="bi-grid bi-grid--sales-top">
        <ChartCard title="Ranking de vendedores" subtitle="Clique em um vendedor para abrir o drilldown." style={{ gridColumn: 'span 2' }}>
          {ranking.length ? (
            <div className="bi-chart-with-side-list">
              <div style={{ flex: 1, minWidth: 320, height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.12)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                    <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => fmt.brl(value)} />} />
                    <Bar dataKey="receita" fill={BI_COLORS.yellow} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bi-side-list">
                {ranking.map((seller, index) => (
                  <button
                    key={seller.id}
                    className={`bi-side-list__item${String(selSeller) === String(seller.id) ? ' is-active' : ''}`}
                    onClick={() => { setSelSeller(String(seller.id)); setTimeout(loadSellers, 40) }}
                  >
                    <div>
                      <div className="bi-side-list__title">{index + 1}o {seller.name}</div>
                      <div className="bi-side-list__meta">{seller.orders} pedidos · ticket {fmt.brl(seller.ticket)}</div>
                    </div>
                    <div className="bi-side-list__value">{fmt.brl(seller.revenue)}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EmptyAnalyticsState title="Sem ranking comercial" />
          )}
        </ChartCard>
      </div>

      <div className="bi-metric-grid">
        <MetricCard icon={Award} label="Vendedor selecionado" value={selectedSeller?.name || 'Nenhum'} sub="Use o ranking para alternar o drilldown." color={BI_COLORS.blue} />
        <MetricCard icon={DollarSign} label="Receita do vendedor" value={fmt.brl(selectedSeller?.revenue || 0)} sub={`Comissao ${fmt.brl(selectedSeller?.commission_value || 0)}`} color={BI_COLORS.green} />
        <MetricCard icon={ShoppingCart} label="Pedidos fechados" value={fmt.num(selectedSeller?.orders || 0)} sub={`Ticket ${fmt.brl(selectedSeller?.ticket || 0)}`} color={BI_COLORS.yellow} />
        <MetricCard icon={UserRound} label="Comissao" value={fmt.brl(selectedSeller?.commission_value || 0)} sub={`${selectedSeller?.commission || 0}% configurado`} color={BI_COLORS.purple} />
      </div>

      <div className="bi-grid bi-grid--sales-bottom">
        <ChartCard title={selectedSeller ? `Evolucao de ${selectedSeller.name}` : 'Evolucao por vendedor'} subtitle="Linha diaria de receita no periodo.">
          {sellerTrend.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sellerTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.12)" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.compact(v)} />
                  <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => fmt.brl(value)} />} />
                  <Line type="monotone" dataKey="revenue" stroke={BI_COLORS.blue} strokeWidth={2.4} dot={{ r: 3, fill: BI_COLORS.blue }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyAnalyticsState title="Selecione um vendedor com historico" />
          )}
        </ChartCard>

        <DataListCard
          title="Top produtos do vendedor"
          items={detail?.topProducts || []}
          emptyMessage="Sem produtos para este vendedor"
          renderItem={(item) => (
            <div key={item.id} className="bi-data-list__row">
              <div>
                <div className="bi-data-list__title">{item.name}</div>
                <div className="bi-data-list__meta">{item.sku} · {fmt.num(item.qty)} un.</div>
              </div>
              <div className="bi-data-list__value">{fmt.brl(item.revenue)}</div>
            </div>
          )}
        />

        <DataListCard
          title="Mix de status do vendedor"
          items={detail?.byStatus || []}
          emptyMessage="Sem status para este vendedor"
          renderItem={(item) => (
            <div key={item.status} className="bi-data-list__row">
              <div>
                <div className="bi-data-list__title">{item.label || item.status}</div>
                <div className="bi-data-list__meta">{fmt.num(item.count)} pedidos</div>
              </div>
              <div className="bi-data-list__value">{fmt.brl(item.amount)}</div>
            </div>
          )}
        />
      </div>
    </div>
  )
}
