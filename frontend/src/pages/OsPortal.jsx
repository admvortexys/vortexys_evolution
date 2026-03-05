import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Wrench, CheckCircle2 } from 'lucide-react'
import api from '../services/api'

const STATUS_LABELS = {
  received: { l: 'Recebido', c: '#6366f1' },
  analysis: { l: 'Em análise', c: '#3b82f6' },
  awaiting_approval: { l: 'Aguardando aprovação', c: '#f59e0b' },
  awaiting_part: { l: 'Aguardando peça', c: '#f97316' },
  repair: { l: 'Em reparo', c: '#8b5cf6' },
  testing: { l: 'Testes', c: '#06b6d4' },
  ready: { l: 'Pronto para retirada', c: '#10b981' },
  delivered: { l: 'Entregue', c: '#22c55e' },
  cancelled: { l: 'Cancelado', c: '#ef4444' },
}

const STATUS_ORDER = ['received', 'analysis', 'awaiting_approval', 'awaiting_part', 'repair', 'testing', 'ready', 'delivered']

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function OsPortal() {
  const { number } = useParams()
  const [os, setOs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!number) return setLoading(false)
    setLoading(true)
    setError(null)
    api.get(`/public/os/${encodeURIComponent(number)}`)
      .then(r => setOs(r.data))
      .catch(e => setError(e.response?.status === 404 ? 'OS não encontrada' : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [number])

  if (loading) {
    return (
      <div className="os-portal-page" style={styles.page}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <p style={{ color: 'var(--text-2)', marginTop: 12 }}>Carregando...</p>
        </div>
      </div>
    )
  }

  if (error || !os) {
    return (
      <div className="os-portal-page" style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 360, textAlign: 'center', padding: 40 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-card3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Wrench size={28} color="var(--muted)" />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>OS não encontrada</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.5 }}>Verifique o número e tente novamente.</p>
        </div>
      </div>
    )
  }

  const currentIdx = STATUS_ORDER.indexOf(os.status)
  const statusInfo = STATUS_LABELS[os.status] || { l: os.status, c: '#6366f1' }
  const numDisplay = String(os.number || '').replace(/^OS-?/i, '')

  return (
    <div className="os-portal-page" style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <span style={styles.brand}>Vortexys</span>
          <h1 style={styles.title}>OS #{numDisplay}</h1>
          <p style={styles.subtitle}>{os.device || 'Aparelho'}{os.clientName ? ` · ${os.clientName}` : ''}</p>
        </header>

        <div style={{ ...styles.card, ...styles.statusCard, borderLeft: `4px solid ${statusInfo.c}` }}>
          <div style={styles.statusRow}>
            <div>
              <div style={styles.statusLabel}>Status atual</div>
              <div style={{ ...styles.statusValue, color: statusInfo.c }}>{os.statusLabel}</div>
            </div>
            <div style={styles.meta}>
              <div><span style={styles.metaLabel}>Entrada</span> {fmtDate(os.receivedAt) || '—'}</div>
              <div><span style={styles.metaLabel}>Previsão</span> {fmtDate(os.estimatedAt) || 'A definir'}</div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.timelineTitle}>Andamento do reparo</div>
          <div style={styles.timeline}>
            {STATUS_ORDER.map((s, i) => {
              const done = i <= currentIdx
              const info = STATUS_LABELS[s]
              const isLast = i === STATUS_ORDER.length - 1
              return (
                <div key={s} style={styles.timelineItem}>
                  <div style={styles.timelineRow}>
                    <div style={{
                      ...styles.timelineDot,
                      background: done ? info?.c : 'transparent',
                      borderColor: done ? info?.c : 'var(--border, #2a2a35)',
                      borderWidth: 2,
                    }}>
                      {done ? <CheckCircle2 size={12} color="#fff" strokeWidth={2.5} /> : null}
                    </div>
                    {!isLast && <div style={{ ...styles.timelineLine, background: done ? info?.c : 'var(--border)' }} />}
                  </div>
                  <div style={{
                    ...styles.timelineContent,
                    opacity: done ? 1 : 0.5,
                    fontWeight: done && i === currentIdx ? 600 : 400,
                  }}>
                    {info?.l || s}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {os.defectReported && (
          <div style={styles.card}>
            <div style={styles.sectionLabel}>Defeito relatado</div>
            <p style={{ margin: 0, fontSize: '.95rem', lineHeight: 1.5 }}>{os.defectReported}</p>
          </div>
        )}

        <p style={styles.footer}>Dúvidas? Entre em contato com a assistência.</p>
      </div>

      <style>{`
        .os-portal-page { --bg: #0f0f14; --card: #18181f; --card2: #1f1f28; --border: #2a2a35; --text: #f1f5f9; --text2: #94a3b8; --primary: #6366f1; }
        @media (prefers-color-scheme: light) {
          .os-portal-page { --bg: #f8fafc; --card: #fff; --card2: #f1f5f9; --border: #e2e8f0; --text: #0f172a; --text2: #64748b; }
        }
      `}</style>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg, #0f0f14)',
    color: 'var(--text, #f1f5f9)',
    padding: 24,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 15,
  },
  container: { maxWidth: 420, margin: '0 auto' },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  spinner: { width: 40, height: 40, border: '3px solid var(--border, #2a2a35)', borderTopColor: 'var(--primary, #6366f1)', borderRadius: '50%', animation: 'spin .8s linear infinite' },
  card: {
    background: 'var(--card, #18181f)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    border: '1px solid var(--border, #2a2a35)',
  },
  header: { textAlign: 'center', marginBottom: 24 },
  brand: { fontSize: '.75rem', fontWeight: 600, letterSpacing: '.12em', color: 'var(--text2, #94a3b8)', display: 'block', marginBottom: 8 },
  title: { fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-.02em' },
  subtitle: { fontSize: '.9rem', color: 'var(--text2, #94a3b8)', marginTop: 6 },
  statusCard: { padding: 20 },
  statusRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  statusLabel: { fontSize: '.7rem', fontWeight: 600, letterSpacing: '.06em', color: 'var(--text2, #94a3b8)', marginBottom: 4 },
  statusValue: { fontSize: '1.15rem', fontWeight: 700 },
  meta: { fontSize: '.85rem', color: 'var(--text2, #94a3b8)', textAlign: 'right' },
  metaLabel: { display: 'block', fontSize: '.7rem', marginBottom: 2 },
  timelineTitle: { fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', color: 'var(--text2, #94a3b8)', marginBottom: 16 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 0 },
  timelineItem: { display: 'flex', gap: 12 },
  timelineRow: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
  timelineDot: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid', boxSizing: 'border-box' },
  timelineLine: { flex: 1, width: 2, minHeight: 20 },
  timelineContent: { paddingBottom: 16, fontSize: '.9rem' },
  sectionLabel: { fontSize: '.7rem', fontWeight: 600, letterSpacing: '.06em', color: 'var(--text2, #94a3b8)', marginBottom: 6 },
  footer: { textAlign: 'center', marginTop: 24, fontSize: '.8rem', color: 'var(--text2, #94a3b8)' },
}
