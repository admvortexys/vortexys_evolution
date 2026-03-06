import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import api from '../services/api'
import { Eye, EyeOff, ShieldCheck, ArrowRight, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'

const labelStyle = { fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }
const inputStyle = { width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text)', padding:'11px 42px 11px 14px', fontSize:'.9rem', outline:'none', transition:'border-color .15s' }

function PwField({ label, fieldKey, showKey, value, showPws, onChange, onToggle }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position:'relative' }}>
        <input
          type={showPws[showKey] ? 'text' : 'password'}
          value={value}
          required
          onChange={e => onChange(fieldKey, e.target.value)}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border)'}
        />
        <button
          type="button"
          onClick={() => onToggle(showKey)}
          style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center' }}
        >
          {showPws[showKey] ? <EyeOff size={15}/> : <Eye size={15}/>}
        </button>
      </div>
    </div>
  )
}

export default function ChangePassword() {
  const { user, setUser } = useAuth()
  const { company } = useTheme()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current: '', newPassword: '', confirm: '' })
  const [showPws, setShowPws] = useState({ current: false, new: false, confirm: false })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const toggle = key => setShowPws(p => ({ ...p, [key]: !p[key] }))
  const handleChange = (fieldKey, val) => setForm(p => ({ ...p, [fieldKey]: val }))

  const validations = [
    { ok: form.newPassword.length >= 8, label: 'Mínimo 8 caracteres' },
    { ok: /[A-Z]/.test(form.newPassword), label: 'Uma letra maiúscula' },
    { ok: /[0-9]/.test(form.newPassword), label: 'Um número' },
    { ok: form.newPassword === form.confirm && form.confirm.length > 0, label: 'Senhas coincidem' },
  ]

  const handle = async e => {
    e.preventDefault()
    setError('')
    if (form.newPassword.length < 8)          return setError('Nova senha deve ter no mínimo 8 caracteres')
    if (form.newPassword !== form.confirm)    return setError('As senhas não coincidem')
    setLoading(true)
    try {
      await api.post('/auth/change-password', { current: form.current, newPassword: form.newPassword })
      const updated = { ...user, force_password_change: false }
      localStorage.setItem('vrx_user', JSON.stringify(updated))
      setUser(updated)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao trocar senha')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:20,
      backgroundImage:'radial-gradient(ellipse 70% 60% at 20% 40%, rgba(168,85,247,.1) 0%,transparent 60%), radial-gradient(ellipse 50% 60% at 80% 60%, rgba(249,115,22,.07) 0%,transparent 60%)',
    }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:54, height:54, borderRadius:14, background:'var(--grad)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14, boxShadow:'var(--shadow-glow)' }}>
            <ShieldCheck size={24} color="#fff"/>
          </div>
          <h2 style={{ fontWeight:800, fontSize:'1.2rem', marginBottom:6, letterSpacing:'-.02em' }}>Troque sua senha</h2>
          <p style={{ color:'var(--muted)', fontSize:'.875rem' }}>
            Por segurança, defina uma nova senha antes de continuar.
          </p>
        </div>

        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'32px', boxShadow:'var(--shadow)' }}>
          <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <PwField label="Senha atual"         fieldKey="current"     showKey="current"  value={form.current}      showPws={showPws} onChange={handleChange} onToggle={toggle}/>
            <PwField label="Nova senha"          fieldKey="newPassword" showKey="new"      value={form.newPassword}  showPws={showPws} onChange={handleChange} onToggle={toggle}/>
            <PwField label="Confirmar nova senha" fieldKey="confirm"    showKey="confirm"  value={form.confirm}      showPws={showPws} onChange={handleChange} onToggle={toggle}/>

            {/* Password strength */}
            {form.newPassword.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {validations.map(v => (
                  <div key={v.label} style={{ display:'flex', alignItems:'center', gap:7, fontSize:'.78rem', color: v.ok ? 'var(--success)' : 'var(--muted)' }}>
                    <CheckCircle2 size={12} color={v.ok ? 'var(--success)' : 'var(--muted-2)'}/>
                    {v.label}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--danger-bg)', border:'1px solid rgba(239,68,68,.25)', borderRadius:'var(--radius-sm)', padding:'10px 14px', color:'var(--danger)', fontSize:'.85rem' }}>
                <AlertCircle size={14} style={{ flexShrink:0 }}/>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'var(--bg-card3)' : 'var(--grad)',
                color:'#fff', border:'none', borderRadius:'var(--radius-sm)', padding:'13px',
                fontSize:'.9rem', fontWeight:700, cursor:loading?'wait':'pointer',
                boxShadow: loading ? 'none' : '0 0 28px rgba(168,85,247,.35)',
                marginTop:4, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}
            >
              {loading
                ? <><Loader2 size={16} style={{ animation:'spin .7s linear infinite' }}/>Salvando...</>
                : <>Salvar nova senha<ArrowRight size={16}/></>
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', color:'var(--muted-2)', fontSize:'.72rem', marginTop:20 }}>
          {company} — Segurança da conta
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
