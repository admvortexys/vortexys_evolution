import {



  Area,



  AreaChart,



  Bar,



  BarChart,



  CartesianGrid,



  Cell,



  ComposedChart,



  Legend,



  Line,



  Pie,



  PieChart,



  ReferenceLine,



  ResponsiveContainer,



  Tooltip,



  XAxis,



  YAxis,



} from 'recharts'



import { AlertTriangle, Clock3, DollarSign, Receipt, TrendingDown, Wallet } from 'lucide-react'



import { fmt } from '../../UI'



import { BI_COLORS, CHART_COLORS, MONTH_FULL, MONTH_NAMES } from '../biTheme'



import { AnalyticsTooltip, ChartCard, DataListCard, EmptyAnalyticsState, LegendList, MetricCard, SectionHeading } from '../primitives'







function parseYmdDate(value) {



  if (!value) return null



  const [year, month, day] = String(value).split('-').map(Number)



  if (![year, month, day].every(Number.isFinite)) return null



  return new Date(year, month - 1, day)



}







function formatYmdDate(value, options) {



  const date = parseYmdDate(value)



  return date ? date.toLocaleDateString('pt-BR', options) : ''



}







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







  const evolutionData = evolution.map((item) => ({



    label: `${MONTH_NAMES[Number(item.month) - 1]}/${String(item.year).slice(-2)}`,



    receita: parseFloat(item.income) || 0,



    despesa: parseFloat(item.expense) || 0,



  }))







  const expenseCategories = byCat



    .filter((item) => item.type === 'expense' && parseFloat(item.total) > 0)



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



  ].filter((item) => item.value > 0)







  const cashFlow = (data.cashFlowProjected || []).map((item) => {



    const receita = parseFloat(item.receita) || 0



    const acumulado = parseFloat(item.acumulado) || 0



    const isProjected = Boolean(item.is_projected)







    return {



      ...item,



      receita,



      acumulado,



      isProjected,



      realizado: isProjected ? null : receita,



      projetado: isProjected ? receita : null,



    }



  })







  const hasCashFlowData = cashFlow.some((item) => item.receita !== 0 || item.acumulado !== 0)



  const projectedStart = cashFlow.find((item) => item.isProjected)?.date || null



  const lastRealPoint = [...cashFlow].reverse().find((item) => !item.isProjected) || null



  const lastCashFlowPoint = cashFlow.length ? cashFlow[cashFlow.length - 1] : null



  const realizedDays = cashFlow.filter((item) => !item.isProjected).length



  const projectedDays = cashFlow.filter((item) => item.isProjected).length



  const realizedTotal = cashFlow.reduce((total, item) => total + (item.isProjected ? 0 : item.receita), 0)



  const projectedRemaining = cashFlow.reduce((total, item) => total + (item.isProjected ? item.receita : 0), 0)



  const projectedTotal = lastCashFlowPoint?.acumulado || 0



  const hasProjectedWindow = projectedDays > 0



  const paceDays = projectedDays || Math.max(realizedDays, 1)



  const paceBase = projectedDays ? projectedRemaining : realizedTotal



  const dailyPace = paceBase / Math.max(paceDays, 1)



  const peakCashFlowPoint = cashFlow.reduce((top, item) => {



    if (!top || item.receita > top.receita) return item



    return top



  }, null)



  const maxDailyValue = Math.max(...cashFlow.map((item) => item.receita), 0)



  const maxAccumulatedValue = Math.max(...cashFlow.map((item) => item.acumulado), 0)



  const cashFlowDailyDomain = [0, Math.max(maxDailyValue * 1.25, 1000)]



  const cashFlowAccumulatedDomain = [0, Math.max(maxAccumulatedValue * 1.08, 1000)]







  const forecastSummary = [



    {



      label: 'Realizado',



      value: fmt.brl(realizedTotal),



      sub: realizedDays ? `${realizedDays} dia(s) consolidados` : 'Sem dias consolidados',



      color: BI_COLORS.green,



    },



    {



      label: hasProjectedWindow ? 'Fechamento previsto' : 'Fechamento do período',



      value: fmt.brl(projectedTotal),



      sub: hasProjectedWindow ? `${fmt.brl(projectedRemaining)} ainda estimados` : 'Período já encerrado',



      color: BI_COLORS.indigo,



    },



    {



      label: 'Ritmo diário',



      value: fmt.brl(dailyPace),



      sub: hasProjectedWindow ? 'Média usada na previsão' : 'Média real do período',



      color: BI_COLORS.cyan,



    },



    {



      label: 'Pico diário',



      value: fmt.brl(peakCashFlowPoint?.receita || 0),



      sub: peakCashFlowPoint?.date ? formatYmdDate(peakCashFlowPoint.date, { day: '2-digit', month: 'short' }) : 'Sem destaque',



      color: BI_COLORS.orange,



    },



  ]







  let forecastPeriodLabel = 'Conforme filtro'



  if (filterMode === 'month' && month && year) {



    const daysInMonth = new Date(year, month, 0).getDate()



    forecastPeriodLabel = `${daysInMonth} dias de ${MONTH_FULL[month - 1]}`



  } else if (filterMode === 'period' && startDate && endDate) {



    const d1 = parseYmdDate(startDate)



    const d2 = parseYmdDate(endDate)



    const diff = d1 && d2 ? Math.ceil((d2 - d1) / (24 * 60 * 60 * 1000)) + 1 : 0



    forecastPeriodLabel = `${diff || 0} dias do período`



  } else if (filterMode === 'date' && (singleDate || startDate)) {



    forecastPeriodLabel = '1 dia'



  }







  const forecastSubtitle = hasProjectedWindow
    ? `${forecastPeriodLabel}. Realizado até a data de corte, projeção pelo ritmo médio no restante.`
    : `${forecastPeriodLabel}. Período encerrado com valores realizados.`





  return (



    <div className="bi-tab-layout">



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



                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => fmt.compact(value)} />



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



        <ChartCard title="Despesas por categoria" subtitle="Onde o caixa está sendo consumido." style={{ height: 'auto', alignSelf: 'start' }}>



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







        <ChartCard title={hasProjectedWindow ? 'Previsão de entradas' : 'Entradas do período'} subtitle={forecastSubtitle} style={{ gridColumn: 'span 2', alignSelf: 'start', height: 'auto' }}>



          {hasCashFlowData ? (



            <div className="bi-forecast-card">



              <div className="bi-forecast-kpis">



                {forecastSummary.map((item) => (



                  <div



                    key={item.label}



                    className="bi-forecast-kpi"



                    style={{



                      borderColor: `${item.color}30`,



                      background: `linear-gradient(180deg, ${item.color}16, rgba(255,255,255,.02))`,



                    }}



                  >



                    <span className="bi-forecast-kpi__label">{item.label}</span>



                    <strong className="bi-forecast-kpi__value">{item.value}</strong>



                    <span className="bi-forecast-kpi__sub">{item.sub}</span>



                  </div>



                ))}



              </div>







              <div className="bi-forecast-note">



                <div className="bi-forecast-badges">



                  <span className="bi-forecast-badge">



                    <span className="bi-forecast-badge__swatch" style={{ background: BI_COLORS.green }} />



                    Receita realizada



                  </span>



                  {hasProjectedWindow && (



                    <span className="bi-forecast-badge">



                      <span className="bi-forecast-badge__swatch" style={{ background: BI_COLORS.cyan }} />



                      Receita projetada



                    </span>



                  )}



                  <span className="bi-forecast-badge">



                    <span className="bi-forecast-badge__swatch" style={{ background: BI_COLORS.indigo }} />



                    Acumulado do período



                  </span>



                </div>



                <div className="bi-forecast-caption">



                  {projectedStart && lastRealPoint?.date



                    ? `Realizado até ${formatYmdDate(lastRealPoint.date, { day: '2-digit', month: 'short' })}; projeção a partir de ${formatYmdDate(projectedStart, { day: '2-digit', month: 'short' })}.`



                    : 'Período fechado com dados realizados.'}



                </div>



              </div>







              <div style={{ height: 320, minHeight: 320, maxHeight: 320 }}>



                <ResponsiveContainer width="100%" height="100%">



                  <ComposedChart data={cashFlow} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>



                    <defs>



                      <linearGradient id="cashFlowAccumulated" x1="0" y1="0" x2="0" y2="1">



                        <stop offset="0%" stopColor={BI_COLORS.indigo} stopOpacity={0.32} />



                        <stop offset="100%" stopColor={BI_COLORS.indigo} stopOpacity={0} />



                      </linearGradient>



                      <linearGradient id="cashFlowRealBars" x1="0" y1="0" x2="0" y2="1">



                        <stop offset="0%" stopColor={BI_COLORS.green} stopOpacity={0.95} />



                        <stop offset="100%" stopColor={BI_COLORS.green} stopOpacity={0.38} />



                      </linearGradient>



                      <linearGradient id="cashFlowProjectedBars" x1="0" y1="0" x2="0" y2="1">



                        <stop offset="0%" stopColor={BI_COLORS.cyan} stopOpacity={0.92} />



                        <stop offset="100%" stopColor={BI_COLORS.cyan} stopOpacity={0.26} />



                      </linearGradient>



                    </defs>



                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(168,85,247,.10)" vertical={false} />



                    <XAxis



                      dataKey="date"



                      tick={{ fill: 'var(--muted)', fontSize: 10 }}



                      axisLine={false}



                      tickLine={false}



                      interval="preserveStartEnd"



                      minTickGap={28}



                      tickFormatter={(value) => formatYmdDate(value, { day: '2-digit', month: 'short' })}



                    />



                    <YAxis



                      yAxisId="left"



                      domain={cashFlowDailyDomain}



                      tick={{ fill: 'var(--muted)', fontSize: 11 }}



                      axisLine={false}



                      tickLine={false}



                      tickFormatter={(value) => fmt.compact(value)}



                      width={48}



                    />



                    <YAxis



                      yAxisId="right"



                      orientation="right"



                      domain={cashFlowAccumulatedDomain}



                      tick={{ fill: 'var(--text-2)', fontSize: 11 }}



                      axisLine={false}



                      tickLine={false}



                      tickFormatter={(value) => fmt.compact(value)}



                      width={54}



                    />



                    <Tooltip



                      content={<AnalyticsTooltip



                        valueFormatter={(value) => fmt.brl(value)}



                        labelFormatter={(value) => formatYmdDate(value, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}



                        getExtraRows={(point) => (point ? [



                          { label: 'Leitura', value: point.isProjected ? 'Projetada' : 'Realizada' },



                        ] : [])}



                      />}



                    />



                    {projectedStart && (



                      <ReferenceLine



                        x={projectedStart}



                        stroke="rgba(245,158,11,.55)"



                        strokeDasharray="6 6"



                        yAxisId="left"



                      />



                    )}



                    <Bar yAxisId="left" dataKey="realizado" fill="url(#cashFlowRealBars)" radius={[8, 8, 0, 0]} barSize={16} name="Receita realizada" />



                    <Bar yAxisId="left" dataKey="projetado" fill="url(#cashFlowProjectedBars)" radius={[8, 8, 0, 0]} barSize={16} name="Receita projetada" />



                    <Area yAxisId="right" type="monotone" dataKey="acumulado" stroke="none" fill="url(#cashFlowAccumulated)" isAnimationActive={false} />



                    <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke={BI_COLORS.indigo} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: BI_COLORS.indigo }} name="Acumulado do período" />



                  </ComposedChart>



                </ResponsiveContainer>



              </div>



            </div>



          ) : (



            <EmptyAnalyticsState



              title="Sem dados de previsão"



              description="Nenhum faturamento ou projeção para o período."



            />



          )}



        </ChartCard>







        {(data.byMethod || []).length > 0 && (



          <ChartCard title="Recebimento por método" subtitle="Formas de pagamento no período." style={{ height: 'auto', alignSelf: 'start' }}>



            <div className="bi-chart-with-legend">



              <div style={{ height: 200, minWidth: 180 }}>



                <ResponsiveContainer width="100%" height="100%">



                  <PieChart>



                    <Pie



                      data={(data.byMethod || []).filter((item) => item.type === 'income' && parseFloat(item.total) > 0).map((item, idx) => ({



                        name: (item.payment_method || 'Outro').replace('_', ' '),



                        value: parseFloat(item.total) || 0,



                        color: CHART_COLORS[idx % CHART_COLORS.length],



                      }))}



                      innerRadius={48}



                      outerRadius={80}



                      dataKey="value"



                    >



                      {((data.byMethod || []).filter((item) => item.type === 'income' && parseFloat(item.total) > 0) || []).map((item, idx) => (



                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />



                      ))}



                    </Pie>



                    <Tooltip content={<AnalyticsTooltip hideLabel valueFormatter={(value) => fmt.brl(value)} />} />



                  </PieChart>



                </ResponsiveContainer>



              </div>



              <LegendList



                items={(data.byMethod || []).filter((item) => item.type === 'income' && parseFloat(item.total) > 0).map((item, idx) => ({



                  name: (item.payment_method || 'Outro').replace('_', ' '),



                  value: parseFloat(item.total) || 0,



                  color: CHART_COLORS[idx % CHART_COLORS.length],



                }))}



                valueFormatter={(value) => fmt.brl(value)}



              />



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



                  <div className="bi-data-list__meta">{item.client_name || item.order_number || '-'} · venc. {fmt.date(item.due_date)}</div>



                </div>



                <div className="bi-data-list__value" style={{ color: BI_COLORS.red }}>{fmt.brl(item.amount)}</div>



              </div>



            )}



          />



        )}







        <ChartCard title="Saídas por categoria" subtitle="Comparativo em barras para leitura rápida." style={{ height: 'auto', alignSelf: 'start' }}>



          {expenseCategories.length ? (



            <div style={{ height: 280 }}>



              <ResponsiveContainer width="100%" height="100%">



                <BarChart data={expenseCategories} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>



                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,.1)" />



                  <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => fmt.compact(value)} />



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



