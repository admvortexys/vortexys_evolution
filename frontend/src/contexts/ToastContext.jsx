import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'

const ToastCtx = createContext(null)

let _nextId = 0

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS = {
  success: { bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.3)', color: '#10b981' },
  error:   { bg: 'rgba(239,68,68,.12)',  border: 'rgba(239,68,68,.3)',  color: '#ef4444' },
  warning: { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)', color: '#f59e0b' },
  info:    { bg: 'rgba(99,102,241,.12)', border: 'rgba(99,102,241,.3)', color: '#6366f1' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirm, setConfirm] = useState(null)
  const confirmResolve = useRef(null)

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++_nextId
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) setTimeout(() => removeToast(id), duration)
    return id
  }, [])

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback({
    success: (msg, dur) => addToast(msg, 'success', dur),
    error:   (msg, dur) => addToast(msg, 'error', dur ?? 6000),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info:    (msg, dur) => addToast(msg, 'info', dur),
  }, [addToast])

  const showConfirm = useCallback((message, { title = 'Confirmar', confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'danger' } = {}) => {
    return new Promise(resolve => {
      confirmResolve.current = resolve
      setConfirm({ message, title, confirmText, cancelText, variant })
    })
  }, [])

  const handleConfirm = useCallback(result => {
    confirmResolve.current?.(result)
    confirmResolve.current = null
    setConfirm(null)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast, confirm: showConfirm }}>
      {children}

      {/* Toast container */}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none', maxWidth: 420,
      }}>
        {toasts.map(t => {
          const c = COLORS[t.type] || COLORS.info
          const Icon = ICONS[t.type] || Info
          return (
            <div key={t.id} style={{
              background: 'var(--bg-card)', border: `1px solid ${c.border}`,
              borderLeft: `4px solid ${c.color}`,
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,.25)',
              animation: 'toastIn .25s ease both',
              pointerEvents: 'auto', minWidth: 280,
            }}>
              <Icon size={18} color={c.color} style={{ flexShrink: 0, marginTop: 1 }}/>
              <span style={{ flex: 1, fontSize: '.88rem', color: 'var(--text)', lineHeight: 1.4 }}>{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Fechar notificação"
                style={{
                  background: 'transparent', border: 'none', color: 'var(--muted)',
                  cursor: 'pointer', padding: 2, flexShrink: 0,
                }}
              >
                <X size={14}/>
              </button>
            </div>
          )
        })}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
            backdropFilter: 'blur(4px)', zIndex: 9998,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, animation: 'fadeIn .15s ease both',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={e => e.target === e.currentTarget && handleConfirm(false)}
          onKeyDown={e => e.key === 'Escape' && handleConfirm(false)}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 420,
            boxShadow: 'var(--shadow)', padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: confirm.variant === 'danger' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={20} color={confirm.variant === 'danger' ? '#ef4444' : '#f59e0b'}/>
              </div>
              <h3 id="confirm-title" style={{ fontWeight: 700, fontSize: '1rem' }}>{confirm.title}</h3>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.5, marginBottom: 20 }}>
              {confirm.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleConfirm(false)}
                style={{
                  padding: '9px 18px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card2)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: '.875rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {confirm.cancelText}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                autoFocus
                style={{
                  padding: '9px 18px', borderRadius: 'var(--radius-sm)',
                  background: confirm.variant === 'danger' ? 'var(--danger)' : 'var(--primary)',
                  border: 'none', color: '#fff', fontSize: '.875rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {confirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes toastIn { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
    </ToastCtx.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
