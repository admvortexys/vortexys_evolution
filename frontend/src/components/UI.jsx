// ─── Shared UI primitives ────────────────────────────────────────────────────
import { useState, useRef, useEffect } from 'react'
import { Search, Loader2, X, ChevronDown } from 'lucide-react'

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style, hover = false }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered && hover ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: 24,
        transition: 'border-color .2s, box-shadow .2s',
        boxShadow: hovered && hover ? 'var(--shadow-glow)' : 'none',
        ...style,
      }}
      onMouseEnter={hover ? () => setHovered(true)  : undefined}
      onMouseLeave={hover ? () => setHovered(false) : undefined}
    >
      {children}
    </div>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', size = 'md', type = 'button', disabled, style, icon }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    fontFamily: 'inherit', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none', borderRadius: 'var(--radius-sm)',
    transition: 'all .18s', opacity: disabled ? .55 : 1,
    whiteSpace: 'nowrap',
  }
  const sizes = {
    xs:  { padding: '5px 10px',  fontSize: '.75rem' },
    sm:  { padding: '6px 13px',  fontSize: '.8rem'  },
    md:  { padding: '9px 18px',  fontSize: '.875rem'},
    lg:  { padding: '12px 26px', fontSize: '.95rem' },
  }
  const variants = {
    primary:   { background: 'var(--grad)',      color: '#fff', boxShadow: '0 0 20px rgba(168,85,247,.25)' },
    secondary: { background: 'var(--bg-card2)',  color: 'var(--text)',  border: '1px solid var(--border)' },
    danger:    { background: 'var(--danger)',     color: '#fff' },
    success:   { background: 'var(--success)',    color: '#fff' },
    ghost:     { background: 'transparent',       color: 'var(--muted)', border: '1px solid var(--border)' },
    warning:   { background: 'var(--warning)',    color: '#fff' },
    outline:   { background: 'transparent',       color: 'var(--primary)', border: '1px solid var(--primary)' },
  }
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {icon && icon}
      {children}
    </button>
  )
}

// ── Input ──────────────────────────────────────────────────────────────────────
export function Input({ label, error, prefix, suffix, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{
          fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)',
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 12, color: 'var(--muted)',
            fontSize: '.85rem', pointerEvents: 'none', display: 'flex', alignItems: 'center',
          }}>
            {prefix}
          </span>
        )}
        <input
          style={{
            background: 'var(--bg-card2)',
            border: `1px solid ${error ? 'var(--danger)' : focused ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            padding: `10px ${suffix ? '38px' : '13px'} 10px ${prefix ? '36px' : '13px'}`,
            fontSize: '.875rem', outline: 'none', width: '100%',
            transition: 'border-color .15s',
          }}
          onFocus={e => { setFocused(true); props.onFocus?.(e) }}
          onBlur={e  => { setFocused(false); props.onBlur?.(e) }}
          {...props}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 12, color: 'var(--muted)',
            fontSize: '.85rem', pointerEvents: 'none', display: 'flex', alignItems: 'center',
          }}>
            {suffix}
          </span>
        )}
      </div>
      {error && <span style={{ fontSize: '.73rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// ── Textarea ────────────────────────────────────────────────────────────────────
export function Textarea({ label, error, rows = 3, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{
          fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)',
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        style={{
          background: 'var(--bg-card2)',
          border: `1px solid ${error ? 'var(--danger)' : focused ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text)', padding: '10px 13px',
          fontSize: '.875rem', outline: 'none', width: '100%',
          transition: 'border-color .15s', resize: 'vertical',
          lineHeight: 1.5,
        }}
        onFocus={e => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e  => { setFocused(false); props.onBlur?.(e) }}
        {...props}
      />
      {error && <span style={{ fontSize: '.73rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// ── Select ──────────────────────────────────────────────────────────────────────
export function Select({ label, children, error, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{
          fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)',
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          style={{
            background: 'var(--bg-card2)',
            border: `1px solid ${error ? 'var(--danger)' : focused ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)', padding: '10px 36px 10px 13px',
            fontSize: '.875rem', outline: 'none', width: '100%',
            transition: 'border-color .15s', appearance: 'none', cursor: 'pointer',
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          style={{
            position: 'absolute', right: 12, top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)', pointerEvents: 'none',
          }}
        />
      </div>
      {error && <span style={{ fontSize: '.73rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────────
export function Badge({ children, color = '#6366f1', size = 'sm' }) {
  const sizes = { xs: '.65rem', sm: '.72rem', md: '.8rem' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: size === 'xs' ? '2px 7px' : '3px 10px',
      borderRadius: 99, fontSize: sizes[size], fontWeight: 700,
      background: `${color}18`, color, border: `1px solid ${color}35`,
      letterSpacing: '.03em',
    }}>
      {children}
    </span>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 540, footer }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)',
        zIndex: 999, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
        animation: 'fadeIn .15s ease both',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: width,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
        }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-.01em' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--muted)',
              cursor: 'pointer', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card2)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            <X size={18}/>
          </button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────────
export function Table({ columns, data, onRow }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map(c => (
              <th key={c.key} style={{
                padding: '10px 16px', textAlign: 'left',
                fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '.08em',
                whiteSpace: 'nowrap', background: 'var(--bg-card2)',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{
                padding: '40px 16px', textAlign: 'center',
                color: 'var(--muted)', fontSize: '.88rem',
              }}>
                Nenhum registro encontrado
              </td>
            </tr>
          )}
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={() => onRow?.(row)}
              style={{
                borderBottom: '1px solid var(--border)',
                cursor: onRow ? 'pointer' : 'default',
                transition: 'background .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {columns.map(c => (
                <td key={c.key} style={{
                  padding: '12px 16px', fontSize: '.875rem',
                  color: 'var(--text)', whiteSpace: 'nowrap',
                }}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── PageHeader ─────────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {Icon && (
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(168,85,247,.12)',
            border: '1px solid rgba(168,85,247,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={20} color="var(--primary-light)"/>
          </div>
        )}
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: 'var(--muted)', fontSize: '.875rem' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── KpiCard ────────────────────────────────────────────────────────────────────
export function KpiCard({ icon: Icon, label, value, sub, color = 'var(--primary)', trend }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      transition: 'border-color .2s',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: `${color}12`, pointerEvents: 'none',
      }}/>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${color}15`, border: `1px solid ${color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {Icon ? <Icon size={18} color={color}/> : null}
        </div>
        {trend !== undefined && (
          <span style={{
            fontSize: '.72rem', fontWeight: 700, padding: '3px 8px',
            borderRadius: 99, background: trend >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: trend >= 0 ? 'var(--success)' : 'var(--danger)',
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 5, fontWeight: 500 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: '.73rem', color: 'var(--muted-2)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── StatusBadge ────────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    draft:     { label: 'Rascunho',    color: '#6b7280' },
    confirmed: { label: 'Confirmado',  color: '#6366f1' },
    separated: { label: 'Separado',    color: '#f59e0b' },
    delivered: { label: 'Entregue',    color: '#22c55e' },
    cancelled: { label: 'Cancelado',   color: '#ef4444' },
    open:      { label: 'Aberto',      color: '#6366f1' },
    won:       { label: 'Ganho',       color: '#22c55e' },
    lost:      { label: 'Perdido',     color: '#ef4444' },
    pending:   { label: 'Pendente',    color: '#f59e0b' },
    paid:      { label: 'Pago',        color: '#22c55e' },
    active:    { label: 'Ativo',       color: '#22c55e' },
    inactive:  { label: 'Inativo',     color: '#6b7280' },
  }
  const s = map[status] ?? { label: status ?? '—', color: '#6b7280' }
  return <Badge color={s.color}>{s.label}</Badge>
}

// ── Spinner ────────────────────────────────────────────────────────────────────
export function Spinner({ size = 36, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 56, gap: 14 }}>
      <div style={{
        width: size, height: size,
        border: '3px solid var(--border)',
        borderTopColor: 'var(--primary)',
        borderRadius: '50%',
        animation: 'spin .7s linear infinite',
      }}/>
      {text && <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{text}</span>}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────────
export function Empty({ message = 'Nenhum registro encontrado', icon: Icon }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '56px 24px', gap: 14,
      color: 'var(--muted)',
    }}>
      {Icon && <Icon size={36} strokeWidth={1.2} color="var(--muted-2)"/>}
      <p style={{ fontSize: '.9rem' }}>{message}</p>
    </div>
  )
}

// ── SearchBar ──────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Pesquisar...' }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Search size={15} style={{ position: 'absolute', left: 12, color: 'var(--muted)', pointerEvents: 'none' }}/>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--bg-card2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', color: 'var(--text)',
          padding: '9px 13px 9px 36px', fontSize: '.875rem',
          outline: 'none', width: 240, transition: 'all .15s',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.width = '280px' }}
        onBlur={e  => { e.target.style.borderColor = 'var(--border)';  e.target.style.width = '240px' }}
      />
    </div>
  )
}

// ── Divider ────────────────────────────────────────────────────────────────────
export function Divider({ label }) {
  if (!label) return <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }}/>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, borderTop: '1px solid var(--border)' }}/>
      <span style={{ fontSize: '.73rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <div style={{ flex: 1, borderTop: '1px solid var(--border)' }}/>
    </div>
  )
}

// ── FormRow ────────────────────────────────────────────────────────────────────
export function FormRow({ children, cols = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 14,
    }}>
      {children}
    </div>
  )
}

// ── Alert ──────────────────────────────────────────────────────────────────────
export function Alert({ type = 'info', children }) {
  const map = {
    info:    { bg: 'var(--info-bg)',    border: 'rgba(99,102,241,.3)',  color: 'var(--info)'    },
    success: { bg: 'var(--success-bg)', border: 'rgba(34,197,94,.3)',   color: 'var(--success)' },
    warning: { bg: 'var(--warning-bg)', border: 'rgba(245,158,11,.3)',  color: 'var(--warning)' },
    danger:  { bg: 'var(--danger-bg)',  border: 'rgba(239,68,68,.3)',   color: 'var(--danger)'  },
  }
  const s = map[type]
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 'var(--radius-sm)', padding: '11px 14px',
      color: s.color, fontSize: '.85rem',
    }}>
      {children}
    </div>
  )
}

// ── Autocomplete ───────────────────────────────────────────────────────────────
export function Autocomplete({ label, value, onChange, onSelect, fetchFn, renderOption, placeholder, clearOnSelect = false }) {
  const [query,   setQuery]   = useState(value?.label || '')
  const [options, setOptions] = useState([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const ref   = useRef(null)

  useEffect(() => {
    if (value?.label !== undefined) setQuery(value.label)
  }, [value?.label])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = e => {
    const q = e.target.value
    setQuery(q)
    onChange?.(q)
    clearTimeout(timer.current)
    if (q.length < 2) { setOptions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try { const res = await fetchFn(q); setOptions(res); setOpen(true) }
      finally { setLoading(false) }
    }, 280)
  }

  const handleSelect = opt => {
    onSelect(opt)
    setQuery(clearOnSelect ? '' : (opt.label || opt.name || ''))
    setOpen(false); setOptions([])
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{
          fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)',
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}/>
        <input
          value={query}
          onChange={handleChange}
          placeholder={placeholder || 'Digite para buscar...'}
          style={{
            background: 'var(--bg-card2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text)',
            padding: '10px 36px 10px 36px', fontSize: '.875rem',
            outline: 'none', width: '100%', transition: 'border-color .15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border)'}
        />
        {loading && (
          <Loader2 size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', animation: 'spin .7s linear infinite' }}/>
        )}
      </div>
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {options.map((opt, i) => (
            <div
              key={opt.id ?? i}
              onMouseDown={() => handleSelect(opt)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '.875rem', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {renderOption ? renderOption(opt) : (opt.name || opt.label)}
            </div>
          ))}
        </div>
      )}
      {open && options.length === 0 && !loading && query.length >= 2 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '12px 14px',
          fontSize: '.85rem', color: 'var(--muted)',
        }}>
          Nenhum resultado para "{query}"
        </div>
      )}
    </div>
  )
}

// ── Máscaras ────────────────────────────────────────────────────────────────────
export function maskCPF(v) {
  return v.replace(/\D/g,'').slice(0,11)
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d{1,2})$/,'$1-$2')
}
export function maskCNPJ(v) {
  return v.replace(/\D/g,'').slice(0,14)
    .replace(/(\d{2})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1/$2')
    .replace(/(\d{4})(\d{1,2})$/,'$1-$2')
}
export function maskPhone(v) {
  const d = v.replace(/\D/g,'').slice(0,11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'')
}
export function smartDocument(v) {
  const d = v.replace(/\D/g,'')
  return d.length <= 11 ? maskCPF(v) : maskCNPJ(v)
}

// ── Formatters ─────────────────────────────────────────────────────────────────
export const fmt = {
  brl:  v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  date: v => v ? new Date(v).toLocaleDateString('pt-BR') : '—',
  num:  v => Number(v || 0).toLocaleString('pt-BR'),
  pct:  v => `${Number(v || 0).toFixed(1)}%`,
  margin: (cost, sale) => {
    const c = parseFloat(cost) || 0, s = parseFloat(sale) || 0
    if (!s) return null
    const pct = (s - c) / s * 100
    return { pct: pct.toFixed(1), color: pct < 0 ? '#ef4444' : pct < 20 ? '#f59e0b' : '#22c55e' }
  },
}
