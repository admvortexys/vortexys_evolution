import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', padding: 40,
        background: 'var(--bg)', color: 'var(--text)',
      }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 40, maxWidth: 480, width: '100%',
          textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,.2)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <AlertTriangle size={28} color="#ef4444"/>
          </div>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 8 }}>
            Algo deu errado
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.5, marginBottom: 24 }}>
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          {this.state.error && (
            <pre style={{
              background: 'var(--bg-card2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 12, fontSize: '.75rem', color: '#ef4444',
              textAlign: 'left', overflowX: 'auto', marginBottom: 20,
              maxHeight: 120, overflowY: 'auto',
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 24px', borderRadius: 8,
              background: 'var(--grad)', border: 'none', color: '#fff',
              fontWeight: 600, fontSize: '.9rem', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={16}/>
            Recarregar página
          </button>
        </div>
      </div>
    )
  }
}
