import { useEffect, useState, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import api from '../services/api'
import { PageHeader, Card, KpiCard, Select, Spinner, Input, Btn, fmt } from '../components/UI'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function getPeriods(count = 6) {
  const now = new Date()
  const periods = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      label: `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`,
    })
  }
  return periods
}

export default function Reports({ embedded = false }) {
  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selYear, setSelYear] = useState(now.getFullYear())
  const periods = useMemo(() => getPeriods(6), [])

  const [summary, setSummary] = useState({})
  const [bySource, setBySource] = useState([])
  const [byUser, setByUser] = useState([])
  const [byPipeline, setByPipeline] = useState([])
  const [lostReasons, setLostReasons] = useState([])
  const [monthlyEvolution, setMonthlyEvolution] = useState([])
  const [funnel, setFunnel] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get(`/reports/crm?month=${selMonth}&year=${selYear}`),
      api.get('/reports/crm/funnel'),
    ])
      .then(([crm, funnelRes]) => {
        const d = crm.data || {}
        setSummary(d.summary || {})
        setBySource(d.by_source || [])
        setByUser(d.by_user || [])
        setByPipeline(d.by_pipeline || [])
        setLostReasons(d.lost_reasons || [])
        setMonthlyEvolution(d.monthly_evolution || [])
        setFunnel(funnelRes.data || [])
      })
      .catch(() => {
        setSummary({})
        setBySource([])
        setByUser([])
        setByPipeline([])
        setLostReasons([])
        setMonthlyEvolution([])
        setFunnel([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [selMonth, selYear])

  const s = summary
  const maxFunnel = Math.max(...funnel.map((f) => Number(f.total) || 0), 1)
  const evolutionLast12 = (monthlyEvolution || []).slice(-12)
  const maxEvo = Math.max(
    ...evolutionLast12.flatMap((e) => [
      Number(e.total) || 0,
      Number(e.won) || 0,
      Number(e.lost) || 0,
    ]),
    1
  )

  const sortedByUser = [...byUser].sort(
    (a, b) => parseFloat(b.won_value || 0) - parseFloat(a.won_value || 0)
  )

  const sourceColors = ['#a855f7', '#f97316', '#22c55e', '#6366f1', '#ec4899', '#14b8a6']

  if (loading && !Object.keys(summary).length) {
    return <Spinner text="Carregando relatórios..." />
  }

  return (
    <div className="page" style={{ minWidth: 0 }}>
      {!embedded && (
        <PageHeader
          title="Relatórios CRM"
          subtitle="Métricas comerciais"
          icon={BarChart3}
        />
      )}
      {embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BarChart3 size={20} color="var(--primary-light)" />
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>Relatórios</h2>
        </div>
      )}

      {/* Month/Year selector */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '.78rem',
              color: 'var(--muted)',
              fontWeight: 600,
              marginRight: 4,
            }}
          >
            PERÍODO:
          </span>
          {periods.map((p) => (
            <Btn
              key={`${p.month}-${p.year}`}
              size="sm"
              variant={selMonth === p.month && selYear === p.year ? 'primary' : 'ghost'}
              onClick={() => {
                setSelMonth(p.month)
                setSelYear(p.year)
              }}
            >
              {p.label}
            </Btn>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            marginTop: 12,
          }}
        >
          <Select
            label=""
            value={selMonth}
            onChange={(e) => setSelMonth(parseInt(e.target.value))}
          >
            {MONTH_NAMES_FULL.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            label=""
            value={selYear}
            onChange={(e) => setSelYear(parseInt(e.target.value) || selYear)}
            style={{ width: 100 }}
          />
        </div>
      </Card>

      {/* KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <KpiCard
          icon="📊"
          label="Total de leads"
          value={fmt.num(s.total_leads)}
          color="#6366f1"
        />
        <KpiCard
          icon="📈"
          label="Taxa de conversão"
          value={`${Number(s.conversion_rate || 0).toFixed(1)}%`}
          color="#22c55e"
        />
        <KpiCard
          icon="💰"
          label="Ticket médio"
          value={fmt.brl(s.avg_ticket)}
          color="#a855f7"
        />
        <KpiCard
          icon="⏱"
          label="Tempo médio"
          value={`${Number(s.avg_days_to_close || 0).toFixed(0)} dias`}
          color="#f59e0b"
        />
        <KpiCard
          icon="🏆"
          label="Leads ganhos"
          value={fmt.num(s.won)}
          color="#22c55e"
        />
        <KpiCard
          icon="❌"
          label="Leads perdidos"
          value={fmt.num(s.lost)}
          color="#ef4444"
        />
      </div>

      {/* Two-column grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Funil de vendas */}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: '.85rem',
              color: 'var(--muted)',
              marginBottom: 14,
            }}
          >
            FUNIL DE VENDAS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {funnel.length === 0 ? (
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: '.88rem',
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                Nenhum dado no funil
              </p>
            ) : (
              funnel
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map((stage) => {
                  const total = Number(stage.total) || 0
                  const pct = maxFunnel > 0 ? (total / maxFunnel) * 100 : 0
                  const color = stage.color || '#a855f7'
                  return (
                    <div key={stage.name || stage.position}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                          fontSize: '.85rem',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: color,
                              display: 'inline-block',
                            }}
                          />
                          {stage.name || 'Etapa'}
                        </span>
                        <span style={{ fontWeight: 700 }}>
                          {fmt.num(total)}
                          {stage.value != null && (
                            <span
                              style={{
                                marginLeft: 6,
                                color: 'var(--muted)',
                                fontWeight: 500,
                              }}
                            >
                              {fmt.brl(stage.value)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: 'var(--bg-card2)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: color,
                            borderRadius: 3,
                            transition: 'width .3s',
                          }}
                        />
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </Card>

        {/* Origens dos leads */}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: '.85rem',
              color: 'var(--muted)',
              marginBottom: 14,
            }}
          >
            ORIGENS DOS LEADS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bySource.length === 0 ? (
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: '.88rem',
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                Nenhuma origem registrada
              </p>
            ) : (
              bySource.map((src, i) => {
                const total = Number(src.total) || 0
                const won = Number(src.won) || 0
                const conv = total > 0 ? (won / total) * 100 : 0
                const maxSrc = Math.max(...bySource.map((x) => Number(x.total) || 0), 1)
                const pct = (total / maxSrc) * 100
                const color = sourceColors[i % sourceColors.length]
                return (
                  <div key={src.source || i}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 3,
                        fontSize: '.82rem',
                      }}
                    >
                      <span>{src.source || 'Outro'}</span>
                      <span style={{ fontWeight: 700 }}>
                        {fmt.num(total)} · {fmt.num(won)} ganhos ·{' '}
                        <span style={{ color: 'var(--success)' }}>
                          {conv.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 3,
                        background: 'var(--bg-card2)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: color,
                          borderRadius: 3,
                          transition: 'width .3s',
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>

        {/* Ranking de vendedores */}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: '.85rem',
              color: 'var(--muted)',
              marginBottom: 14,
            }}
          >
            RANKING DE VENDEDORES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedByUser.length === 0 ? (
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: '.88rem',
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                Nenhum vendedor com leads
              </p>
            ) : (
              sortedByUser.map((u, i) => {
                const total = Number(u.total) || 0
                const won = Number(u.won) || 0
                const conv = total > 0 ? (won / total) * 100 : 0
                return (
                  <div
                    key={u.user_id || i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-card2)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      fontSize: '.85rem',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {u.user_name || 'Sem nome'}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>{fmt.num(total)}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      {fmt.brl(u.won_value)}
                    </span>
                    <span
                      style={{
                        fontSize: '.78rem',
                        fontWeight: 700,
                        color: 'var(--primary-light)',
                      }}
                    >
                      {conv.toFixed(1)}%
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </Card>

        {/* Motivos de perda */}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: '.85rem',
              color: 'var(--muted)',
              marginBottom: 14,
            }}
          >
            MOTIVOS DE PERDA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lostReasons.length === 0 ? (
              <p
                style={{
                  color: 'var(--muted)',
                  fontSize: '.88rem',
                  textAlign: 'center',
                  padding: 20,
                }}
              >
                Nenhum motivo registrado
              </p>
            ) : (
              (() => {
                const maxLost = Math.max(
                  ...lostReasons.map((r) => Number(r.count) || 0),
                  1
                )
                return lostReasons.map((r, i) => {
                  const count = Number(r.count) || 0
                  const pct = (count / maxLost) * 100
                  return (
                    <div key={r.reason || i}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 3,
                          fontSize: '.82rem',
                        }}
                      >
                        <span>{r.reason || 'Outro'}</span>
                        <span style={{ fontWeight: 700 }}>{fmt.num(count)}</span>
                      </div>
                      <div
                        style={{
                          height: 5,
                          borderRadius: 3,
                          background: 'var(--bg-card2)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: '#ef4444',
                            borderRadius: 3,
                            transition: 'width .3s',
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              })()
            )}
          </div>
        </Card>
      </div>

      {/* Evolução mensal - full width */}
      <Card>
        <div
          style={{
            fontWeight: 700,
            fontSize: '.85rem',
            color: 'var(--muted)',
            marginBottom: 14,
          }}
        >
          EVOLUÇÃO MENSAL — ÚLTIMOS 12 MESES
        </div>
        {evolutionLast12.length === 0 ? (
          <p
            style={{
              color: 'var(--muted)',
              fontSize: '.88rem',
              textAlign: 'center',
              padding: 40,
            }}
          >
            Nenhum dado de evolução
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${evolutionLast12.length}, minmax(50px, 1fr))`,
                gap: 8,
                overflowX: 'auto',
              }}
            >
              {evolutionLast12.map((e) => {
                const total = parseFloat(e.total) || 0
                const won = parseFloat(e.won) || 0
                const lost = parseFloat(e.lost) || 0
                const totalH = (total / maxEvo) * 80
                const wonH = (won / maxEvo) * 80
                const lostH = (lost / maxEvo) * 80
                const month = e.month != null ? e.month : 0
                return (
                  <div
                    key={`${e.year}-${e.month}`}
                    style={{ textAlign: 'center' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        gap: 3,
                        height: 88,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: `${totalH}px`,
                          background: 'var(--primary)',
                          borderRadius: 3,
                          transition: 'height .3s',
                        }}
                        title={`Total: ${fmt.num(total)}`}
                      />
                      <div
                        style={{
                          width: 14,
                          height: `${wonH}px`,
                          background: '#22c55e',
                          borderRadius: 3,
                          transition: 'height .3s',
                        }}
                        title={`Ganhos: ${fmt.num(won)}`}
                      />
                      <div
                        style={{
                          width: 14,
                          height: `${lostH}px`,
                          background: '#ef4444',
                          borderRadius: 3,
                          transition: 'height .3s',
                        }}
                        title={`Perdidos: ${fmt.num(lost)}`}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: '.7rem',
                        color: 'var(--muted)',
                      }}
                    >
                      {MONTH_NAMES[month - 1] || '—'}
                    </div>
                    <div
                      style={{
                        fontSize: '.65rem',
                        color: 'var(--primary-light)',
                        fontWeight: 700,
                      }}
                    >
                      {fmt.num(total)}
                    </div>
                    <div
                      style={{
                        fontSize: '.65rem',
                        color: '#22c55e',
                        fontWeight: 700,
                      }}
                    >
                      {fmt.num(won)}
                    </div>
                    <div
                      style={{
                        fontSize: '.65rem',
                        color: '#ef4444',
                        fontWeight: 700,
                      }}
                    >
                      {fmt.num(lost)}
                    </div>
                  </div>
                )
              })}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 16,
                justifyContent: 'center',
                marginTop: 10,
                fontSize: '.75rem',
                color: 'var(--muted)',
              }}
            >
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: 'var(--primary)',
                    borderRadius: 2,
                    marginRight: 4,
                  }}
                />
                Total
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#22c55e',
                    borderRadius: 2,
                    marginRight: 4,
                  }}
                />
                Ganhos
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    background: '#ef4444',
                    borderRadius: 2,
                    marginRight: 4,
                  }}
                />
                Perdidos
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
