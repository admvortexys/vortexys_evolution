import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import api from '../services/api'
import { PageHeader, Card, Btn, Badge, Spinner, fmt } from '../components/UI'

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

const ACTIVITY_ICONS = {
  call: '📞',
  email: '📧',
  meeting: '🤝',
  note: '📝',
  task: '✅',
  visit: '🏠',
  demo: '💻',
  followup: '🔄',
}

function getCalendarDays(year, month) {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const days = []
  const startDay = first.getDay()
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i)
    days.push({ date: d, current: false })
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push({ date: new Date(year, month - 1, i), current: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month, days.length - startDay - last.getDate() + 1)
    days.push({ date: d, current: false })
  }
  return days
}

function toDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Calendar() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(toDateKey(today))
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/activities/calendar', { params: { month, year } })
      .then(r => setActivities(r.data || []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [month, year])

  const calendarDays = getCalendarDays(year, month)
  const activitiesByDate = activities.reduce((acc, a) => {
    const key = toDateKey(new Date(a.due_date))
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  const selectedActivities = (activitiesByDate[selectedDate] || []).sort(
    (a, b) => new Date(a.due_date) - new Date(b.due_date)
  )

  const isToday = (d) => toDateKey(d) === toDateKey(today)
  const isSelected = (d) => toDateKey(d) === selectedDate

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else {
      setMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else {
      setMonth(m => m + 1)
    }
  }

  return (
    <div className="page" style={{ minWidth: 0 }}>
      <PageHeader
        title="Agenda"
        subtitle="Compromissos e atividades"
        icon={CalendarIcon}
      />

      {/* Month navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={prevMonth} icon={<span style={{ fontSize: '.9rem' }}>‹</span>}>
            Previous
          </Btn>
          <span style={{
            fontWeight: 700,
            fontSize: '1.1rem',
            color: 'var(--text)',
            minWidth: 180,
            textAlign: 'center',
          }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Btn variant="ghost" size="sm" onClick={nextMonth} icon={<span style={{ fontSize: '.9rem' }}>›</span>}>
            Next
          </Btn>
        </div>
      </div>

      {/* Calendar grid */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Spinner text="Carregando agenda..." />
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: '1px solid var(--border)',
            }}>
              {DAY_NAMES.map(day => (
                <div
                  key={day}
                  style={{
                    padding: '10px 8px',
                    fontSize: '.7rem',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    textAlign: 'center',
                    background: 'var(--bg-card2)',
                    borderRight: '1px solid var(--border)',
                  }}
                >
                  {day}
                </div>
              ))}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
            }}>
              {calendarDays.map(({ date, current }, i) => {
                const key = toDateKey(date)
                const dayActivities = activitiesByDate[key] || []
                const selected = isSelected(date)
                const todayCell = isToday(date)
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDate(key)}
                    style={{
                      minHeight: 80,
                      border: `1px solid ${todayCell ? 'var(--primary)' : 'var(--border)'}`,
                      borderTop: 'none',
                      borderLeft: i % 7 === 0 ? 'none' : undefined,
                      background: selected ? 'rgba(168,85,247,.15)' : 'var(--bg-card)',
                      padding: 8,
                      cursor: 'pointer',
                      opacity: current ? 1 : 0.5,
                      transition: 'background .15s, border-color .15s',
                    }}
                    onMouseEnter={e => {
                      if (!selected) e.currentTarget.style.background = 'var(--bg-card2)'
                    }}
                    onMouseLeave={e => {
                      if (!selected) e.currentTarget.style.background = 'var(--bg-card)'
                    }}
                  >
                    <div style={{
                      fontSize: '.85rem',
                      fontWeight: todayCell ? 800 : 600,
                      color: 'var(--text)',
                      marginBottom: 6,
                    }}>
                      {date.getDate()}
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 4,
                    }}>
                      {dayActivities.slice(0, 5).map(a => (
                        <span
                          key={a.id}
                          title={a.title}
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: a.done ? 'var(--success)' : 'var(--primary)',
                          }}
                        />
                      ))}
                      {dayActivities.length > 5 && (
                        <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
                          +{dayActivities.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {/* Selected day activities */}
      <Card style={{ marginTop: 24 }}>
        <h3 style={{
          fontWeight: 700,
          fontSize: '.95rem',
          marginBottom: 16,
          color: 'var(--text)',
        }}>
          Atividades de {fmt.date(selectedDate)}
        </h3>
        {selectedActivities.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '.875rem', padding: '20px 0' }}>
            Nenhuma atividade neste dia
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedActivities.map(a => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  background: 'var(--bg-card2)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>
                  {ACTIVITY_ICONS[a.type] || '📌'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 4,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: '.9rem', color: 'var(--text)' }}>
                      {a.title}
                    </span>
                    {a.done && (
                      <Badge color="var(--success)" size="xs">Concluído</Badge>
                    )}
                  </div>
                  <div style={{
                    fontSize: '.78rem',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}>
                    <span>
                      {a.due_date
                        ? new Date(a.due_date).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                    <span>{a.lead_name || a.client_name || '—'}</span>
                    {a.user_name && <span>{a.user_name}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
