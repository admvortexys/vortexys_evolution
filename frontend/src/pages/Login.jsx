import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Eye, EyeOff, Zap, ArrowRight, AlertCircle, Loader2 } from 'lucide-react'

export default function Login() {
  const { login }  = useAuth()
  const { company, logoUrl } = useTheme()
  const navigate   = useNavigate()
  const [username, setUsername]  = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handle = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Usuário ou senha incorretos')
    } finally { setLoading(false) }
  }

  const labelStyle = {
    fontSize: '.75rem', fontWeight: 600,
    color: 'var(--muted)', display: 'block',
    marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase',
  }
  const inputStyle = {
    width:'100%', background:'var(--bg-card2)',
    border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
    color:'var(--text)', padding:'11px 14px',
    fontSize:'.9rem', outline:'none', transition:'border-color .15s',
  }

  return (
    <div style={{
      minHeight:'100vh', background:'var(--bg)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding: '20px',
      backgroundImage:`
        radial-gradient(ellipse 80% 60% at 10% 30%, rgba(168,85,247,.1) 0%, transparent 55%),
        radial-gradient(ellipse 60% 50% at 90% 70%, rgba(249,115,22,.07) 0%, transparent 55%)
      `,
    }}>
      <div style={{ width:'100%', maxWidth:420 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          {logoUrl ? (
            <img src={logoUrl} alt={company} style={{ height:52, objectFit:'contain', margin:'0 auto' }}/>
          ) : (
            <div style={{ display:'inline-flex', alignItems:'center', gap:12 }}>
              <div style={{
                width:48, height:48, borderRadius:14,
                background:'var(--grad)', display:'flex',
                alignItems:'center', justifyContent:'center',
                boxShadow:'var(--shadow-glow)',
              }}>
                <Zap size={22} color="#fff" fill="#fff"/>
              </div>
              <span style={{ fontSize:'1.65rem', fontWeight:900, letterSpacing:'-.03em' }}>{company}</span>
            </div>
          )}
          <p style={{ color:'var(--muted)', fontSize:'.85rem', marginTop:10, letterSpacing:'.02em' }}>
            Sistema de Gestão Empresarial
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:'var(--bg-card)',
          border:'1px solid var(--border)',
          borderRadius:'var(--radius-lg)',
          padding:'36px 32px',
          boxShadow:'var(--shadow)',
          backdropFilter:'blur(12px)',
        }}>
          <h2 style={{ fontWeight:800, fontSize:'1.2rem', marginBottom:4, letterSpacing:'-.02em' }}>
            Bem-vindo de volta
          </h2>
          <p style={{ color:'var(--muted)', fontSize:'.875rem', marginBottom:28 }}>
            Entre com suas credenciais para acessar
          </p>

          <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:18 }}>

            {/* Usuário */}
            <div>
              <label style={labelStyle}>Usuário</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="seu.usuario"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Senha */}
            <div>
              <label style={labelStyle}>Senha</label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight:42 }}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{
                    position:'absolute', right:12, top:'50%',
                    transform:'translateY(-50%)',
                    background:'transparent', border:'none',
                    color:'var(--muted)', cursor:'pointer', padding:2,
                    display:'flex', alignItems:'center',
                  }}
                >
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                background:'var(--danger-bg)', border:'1px solid rgba(239,68,68,.25)',
                borderRadius:'var(--radius-sm)', padding:'10px 14px',
                color:'var(--danger)', fontSize:'.85rem',
              }}>
                <AlertCircle size={15} style={{ flexShrink:0 }}/>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'var(--bg-card3)' : 'var(--grad)',
                color: '#fff', border: 'none',
                borderRadius: 'var(--radius-sm)', padding: '13px',
                fontSize: '.9rem', fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
                boxShadow: loading ? 'none' : '0 0 28px rgba(168,85,247,.35)',
                marginTop: 2, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, transition: 'all .2s',
              }}
            >
              {loading
                ? <><Loader2 size={16} style={{ animation:'spin .7s linear infinite' }}/>Entrando...</>
                : <>Entrar<ArrowRight size={16}/></>
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', color:'var(--muted-2)', fontSize:'.72rem', marginTop:24, letterSpacing:'.02em' }}>
          {company} © {new Date().getFullYear()} — Acesso restrito
        </p>
      </div>
    </div>
  )
}
