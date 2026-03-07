import { ChevronLeft, ChevronRight, RefreshCw, CalendarDays, Download } from 'lucide-react'
import { Card, Empty } from '../UI'
import { MONTH_FULL, formatBiPeriodLabel, getDeltaColor } from './biTheme'

const navBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text)',
  padding: 4,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
}

export function DashboardShell({ greeting, subtitle, periodLabel, toolbar, tabs, children }) {
  return (
    <div className="page bi-shell">
      <section className="bi-hero">
        <div className="bi-hero__copy">
          <span className="bi-eyebrow">Business Intelligence</span>
          <h1 className="bi-title">{greeting}</h1>
          {subtitle && <p className="bi-subtitle">{subtitle}</p>}
        </div>
        <div className="bi-hero__meta">
          <span className="bi-period-chip">
            <CalendarDays size={14} />
            {periodLabel}
          </span>
        </div>
      </section>

      <section className="bi-toolbar-shell">{toolbar}</section>
      <section className="bi-tabs-shell">{tabs}</section>
      <section className="bi-content">{children}</section>
    </div>
  )
}

export function DashboardToolbar({
  filterMode, setFilterMode, month, setMonth, year, setYear,
  singleDate, setSingleDate, startDate, setStartDate, endDate, setEndDate,
  onRefresh, onToday, onExport,
}) {
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const periodLabel = formatBiPeriodLabel(filterMode, { month, year, singleDate, startDate, endDate })

  return (
    <div className="bi-toolbar">
      <div className="bi-toolbar__left">
        <div className="bi-segmented">
          {[
            { key: 'month', label: 'Mês' },
            { key: 'date', label: 'Data' },
            { key: 'period', label: 'Período' },
          ].map(item => (
            <button
              key={item.key}
              className={`bi-segmented__btn${filterMode === item.key ? ' is-active' : ''}`}
              onClick={() => setFilterMode(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {filterMode === 'month' && (
          <div className="bi-month-nav">
            <button onClick={prevMonth} style={navBtn}><ChevronLeft size={16} /></button>
            <span>{MONTH_FULL[month - 1]} {year}</span>
            <button onClick={nextMonth} style={navBtn}><ChevronRight size={16} /></button>
          </div>
        )}

        {filterMode === 'date' && (
          <input className="bi-date-input" type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)} />
        )}

        {filterMode === 'period' && (
          <div className="bi-date-range">
            <input className="bi-date-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span className="bi-range-separator">até</span>
            <input className="bi-date-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        )}
      </div>

      <div className="bi-toolbar__right">
        <span className="bi-filter-chip">{periodLabel}</span>
        <button className="bi-action-btn" onClick={onToday}>Hoje</button>
        <button className="bi-action-btn" onClick={onRefresh}>
          <RefreshCw size={14} />
          Atualizar
        </button>
        <button className="bi-action-btn bi-action-btn--primary" onClick={onExport}>
          <Download size={14} />
          Exportar
        </button>
      </div>
    </div>
  )
}

export function DashboardTabs({ tabs, active, onChange }) {
  return (
    <div className="bi-tabs">
      {tabs.map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.k}
            className={`bi-tab${active === tab.k ? ' is-active' : ''}`}
            onClick={() => onChange(tab.k)}
          >
            <Icon size={14} />
            {tab.l}
          </button>
        )
      })}
    </div>
  )
}

export function MetricCard({ icon: Icon, label, value, sub, trend, color = 'var(--primary)' }) {
  return (
    <div className="bi-metric-card">
      <div className="bi-metric-card__glow" style={{ background: `${color}18` }} />
      <div className="bi-metric-card__top">
        <div className="bi-metric-card__icon" style={{ color, borderColor: `${color}35`, background: `${color}18` }}>
          <Icon size={18} />
        </div>
        {trend !== undefined && (
          <span className="bi-metric-card__trend" style={{ color: getDeltaColor(trend) }}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="bi-metric-card__value">{value}</div>
      <div className="bi-metric-card__label">{label}</div>
      {sub && <div className="bi-metric-card__sub">{sub}</div>}
    </div>
  )
}

export function ChartCard({ title, subtitle, actions, children, footer, style, className = '', bodyClassName = '' }) {
  return (
    <Card style={{ height: '100%', ...style }} hover>
      <div className={`bi-chart-card${className ? ` ${className}` : ''}`}>
        <div className="bi-chart-card__header">
          <div>
            <h3 className="bi-chart-card__title">{title}</h3>
            {subtitle && <p className="bi-chart-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
        <div className={`bi-chart-card__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
        {footer && <div className="bi-chart-card__footer">{footer}</div>}
      </div>
    </Card>
  )
}

export function SectionHeading({ title, description, action }) {
  return (
    <div className="bi-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function EmptyAnalyticsState({ title = 'Sem dados para exibir', description = 'Ajuste os filtros ou aguarde novos registros.', action }) {
  return (
    <div className="bi-empty-state">
      <Empty message={title} />
      <p>{description}</p>
      {action && <div>{action}</div>}
    </div>
  )
}

export function AnalyticsSkeleton({ cards = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="bi-skeleton-grid">
        {Array.from({ length: cards }).map((_, idx) => (
          <div key={idx} className="bi-skeleton-card" />
        ))}
      </div>
      <div className="bi-skeleton-panel" />
      <div className="bi-skeleton-panel" />
    </div>
  )
}

export function AnalyticsTooltip({
  active,
  payload,
  label,
  valueFormatter = (value) => value,
  labelFormatter = (value) => value,
  hideLabel = false,
  getExtraRows,
}) {
  if (!active || !payload?.length) return null

  const cleanPayload = payload.filter(entry => entry && entry.value !== null && entry.value !== undefined)
  if (!cleanPayload.length) return null
  const point = cleanPayload[0]?.payload
  const extraRows = getExtraRows ? getExtraRows(point) : []

  return (
    <div className="bi-tooltip">
      {!hideLabel && label !== undefined && label !== null && (
        <div className="bi-tooltip__title">{labelFormatter(label, point)}</div>
      )}
      {cleanPayload.map((entry, idx) => (
        <div key={`${entry.name || entry.dataKey}-${idx}`} className="bi-tooltip__row">
          <div className="bi-tooltip__row-left">
            <span className="bi-tooltip__swatch" style={{ background: entry.color || entry.fill || 'var(--primary)' }} />
            <span>{entry.name || entry.dataKey}</span>
          </div>
          <strong>{valueFormatter(entry.value, entry.name, entry.payload, entry)}</strong>
        </div>
      ))}
      {extraRows.map((row, idx) => (
        <div key={`extra-${idx}`} className="bi-tooltip__row bi-tooltip__row--muted">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  )
}

export function LegendList({ items, valueFormatter = (value) => value }) {
  return (
    <div className="bi-legend-list">
      {items.map((item, idx) => (
        <div key={item.name || idx} className="bi-legend-list__item">
          <div className="bi-legend-list__meta">
            <span className="bi-legend-list__swatch" style={{ background: item.color }} />
            <span>{item.name}</span>
          </div>
          <strong>{valueFormatter(item.value, item)}</strong>
        </div>
      ))}
    </div>
  )
}

export function DataListCard({ title, items, renderItem, emptyMessage = 'Sem registros', style }) {
  return (
    <ChartCard title={title} style={style} bodyClassName="bi-chart-card__body--list">
      {items?.length ? (
        <div className="bi-data-list">
          {items.map(renderItem)}
        </div>
      ) : (
        <EmptyAnalyticsState title={emptyMessage} />
      )}
    </ChartCard>
  )
}
