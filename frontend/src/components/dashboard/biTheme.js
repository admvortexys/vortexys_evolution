export const BI_COLORS = {
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
  purple: '#a855f7',
  indigo: '#6366f1',
  blue: '#3b82f6',
  muted: '#71717a',
  cyan: '#06b6d4',
  pink: '#ec4899',
  orange: '#f97316',
}

export const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const MONTH_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const CHART_COLORS = [
  BI_COLORS.purple,
  BI_COLORS.green,
  BI_COLORS.blue,
  BI_COLORS.yellow,
  BI_COLORS.cyan,
  BI_COLORS.pink,
  BI_COLORS.orange,
  BI_COLORS.indigo,
]

export function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatBiPeriodLabel(filterMode, { month, year, singleDate, startDate, endDate }) {
  if (filterMode === 'date') return singleDate
  if (filterMode === 'period') return `${startDate} até ${endDate}`
  return `${MONTH_FULL[(month || 1) - 1]} ${year}`
}

export function getDeltaColor(value) {
  if (value > 0) return 'var(--success)'
  if (value < 0) return 'var(--danger)'
  return 'var(--muted)'
}
