/**
 * WhatsApp: conversas, mensagens, envio de mídia. Integração Evolution API.
 * Lista de conversas, chat com histórico, envio de texto/áudio/imagem.
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Btn, Modal, Input, Select, Badge, Spinner, fmt, maskPhone } from '../components/UI'

const STATUS_LABEL = { bot: 'Bot', queue: 'Fila', active: 'Ativo', closed: 'Fechado' }
const STATUS_COLOR = { bot: '#8b5cf6', queue: '#f59e0b', active: '#10b981', closed: '#6b7280' }

// ─── Utility: debounce ────────────────────────────────────────────────────────
function useDebounce(value, ms = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ─── Utility: format phone ────────────────────────────────────────────────────
function fmtPhone(phone) {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55'))
    return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 12 && d.startsWith('55'))
    return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return phone
}

// ─── WebSocket hook com backoff + keepalive ──────────────────────────────────
function useWS(token, onMessage) {
  const ws = useRef(null)
  const reconnectTimer = useRef(null)
  const pingTimer = useRef(null)
  const attempt = useRef(0)

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    // Token via Sec-WebSocket-Protocol (não na URL) para evitar vazamento em logs/proxies
    ws.current = new WebSocket(`${proto}://${host}/ws`, ['bearer', token])

    ws.current.onmessage = e => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'pong') return
        onMessage(data)
      } catch {}
    }

    ws.current.onclose = () => {
      clearInterval(pingTimer.current)
      const delay = Math.min(3000 * Math.pow(2, attempt.current), 30000)
      attempt.current++
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.current.onerror = () => ws.current?.close()

    ws.current.onopen = () => {
      clearTimeout(reconnectTimer.current)
      attempt.current = 0
      ws.current.send(JSON.stringify({ type: 'subscribe', room: 'inbox' }))
      clearInterval(pingTimer.current)
      pingTimer.current = setInterval(() => {
        if (ws.current?.readyState === 1)
          ws.current.send(JSON.stringify({ type: 'ping' }))
      }, 30000)
    }
  }, [token, onMessage])

  const subscribeConv = useCallback(id => {
    if (ws.current?.readyState === 1)
      ws.current.send(JSON.stringify({ type: 'subscribe', room: `conversation:${id}` }))
  }, [])

  const unsubscribeConv = useCallback(id => {
    if (ws.current?.readyState === 1)
      ws.current.send(JSON.stringify({ type: 'unsubscribe', room: `conversation:${id}` }))
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      clearInterval(pingTimer.current)
      ws.current?.close()
    }
  }, [connect])

  return { subscribeConv, unsubscribeConv }
}

// ─── Avatar com suporte a foto (busca profile-pic se src ausente e phone informado) ─
function Avatar({ name, src, phone, size = 38 }) {
  const [err, setErr] = useState(false)
  const [fetchedUrl, setFetchedUrl] = useState(null)
  const attempted = useRef(false)
  const url = src || fetchedUrl
  useEffect(() => {
    if (url || !phone || attempted.current) return
    attempted.current = true
    api.get(`/whatsapp/profile-pic/${encodeURIComponent(phone)}`)
      .then(r => { if (r.data?.url) setFetchedUrl(r.data.url) })
      .catch(() => {})
  }, [phone, url])
  if (url && !err) {
    return (
      <img src={url} alt="" onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}/>
    )
  }
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const hue = [...(name || '')].reduce((h, c) => h + c.charCodeAt(0), 0) % 360
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},60%,50%)`, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#fff', fontSize: size * .38 + 'px', fontWeight: 700 }}>
      {initials}
    </div>
  )
}

// ─── Media component (lazy load) ────────────────────────────────────────────
function MediaContent({ msg, onImageClick }) {
  const [media, setMedia] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const attempted = useRef(false)

  const needsLoad = msg.has_media && !msg.media_base64

  useEffect(() => {
    if (!needsLoad || attempted.current) return
    if (msg.type === 'text') return
    attempted.current = true
    setLoading(true)
    api.get(`/whatsapp/messages/${msg.id}/media`)
      .then(r => {
        const prefix = r.data.mimetype ? `data:${r.data.mimetype};base64,` : 'data:application/octet-stream;base64,'
        setMedia(prefix + r.data.base64)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [needsLoad, msg.id, msg.type])

  // Build media src
  let src = media || msg.media_base64 || msg.media_url || null
  if (src && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('blob:')) {
    const mime = msg.media_mimetype || 'application/octet-stream'
    src = `data:${mime};base64,${src}`
  }

  if (msg.type === 'text' && !msg.has_media) return null
  if (loading) return (
    <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', opacity: .6 }}>
      <Spinner size={14} /> Carregando mídia...
    </div>
  )
  if (error || (!src && msg.type !== 'text'))
    return <div style={{ fontSize: '.8rem', opacity: .5, fontStyle: 'italic', padding: '4px 0' }}>[{msg.type} indisponível]</div>
  if (!src) return null

  if (msg.type === 'image') {
    return <img src={src} alt="imagem"
      style={{ maxWidth: '100%', width: 'auto', height: 'auto', maxHeight: 200, borderRadius: 8, display: 'block', marginBottom: 4, cursor: 'pointer' }}
      onClick={() => onImageClick(src)}
      onError={e => { setError(true) }}
    />
  }

  if (msg.type === 'audio' || msg.type === 'ptt') return <AudioPlayer src={src} />

  if (msg.type === 'video')
    return <video controls src={src} preload="metadata"
      style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, display: 'block', marginBottom: 4 }} />

  if (msg.type === 'document')
    return (
      <a href={src} download={msg.media_filename} target="_blank" rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'rgba(255,255,255,.08)', borderRadius: 8, marginBottom: 4,
          color: 'inherit', textDecoration: 'none', fontSize: '.82rem',
          border: '1px solid rgba(255,255,255,.12)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        {msg.media_filename || 'documento'}
      </a>
    )

  if (msg.type === 'sticker')
    return <img src={src} alt="sticker" style={{ width: 100, height: 100 }}
      onError={e => { e.target.style.display = 'none' }} />

  return null
}

// ─── Audio player custom ────────────────────────────────────────────────────
function AudioPlayer({ src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) audioRef.current.pause()
    else audioRef.current.play().catch(() => {})
  }

  const fmtTime = s => {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const seekTo = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    if (audioRef.current) {
      audioRef.current.currentTime = pct * (audioRef.current.duration || 0)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', minWidth: 220, maxWidth: 280 }}>
      <audio ref={audioRef} src={src} preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          const a = audioRef.current
          if (a && a.duration) {
            setProgress(a.currentTime / a.duration)
            setCurrentTime(a.currentTime)
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0) }}
      />
      {/* Play/Pause button */}
      <button onClick={toggle}
        style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--primary, #8b5cf6)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'opacity .15s'
        }}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><polygon points="5,3 19,12 5,21"/></svg>
        }
      </button>
      {/* Waveform / progress */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 4, background: 'rgba(255,255,255,.18)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
          onClick={seekTo}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--primary, #8b5cf6)',
            borderRadius: 2, transition: 'width .1s' }} />
        </div>
        <div style={{ fontSize: '.68rem', opacity: .55 }}>
          {playing ? fmtTime(currentTime) : fmtTime(duration)}
        </div>
      </div>
    </div>
  )
}

// ─── Audio recorder hook ────────────────────────────────────────────────────
function useAudioRecorder() {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorder = useRef(null)
  const chunks = useRef([])
  const timerRef = useRef(null)
  const resolveRef = useRef(null)
  const streamRef = useRef(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunks.current = []

      // Pick best supported mimeType
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        ''
      ].find(t => t === '' || MediaRecorder.isTypeSupported(t))

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = () => resolveRef.current?.(reader.result)
        reader.readAsDataURL(blob)
      }
      mediaRecorder.current = mr
      mr.start(250) // timeslice so ondataavailable fires regularly
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000)
    } catch (e) {
      console.warn('Mic access denied or unavailable:', e)
      console.warn('[Audio] Mic access denied or requires HTTPS')
      return null
    }
  }, [])

  const stop = useCallback(() => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      clearInterval(timerRef.current)
      setRecording(false)
      setElapsed(0)
      if (mediaRecorder.current?.state === 'recording') {
        mediaRecorder.current.stop()
      } else {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        resolve(null)
      }
    })
  }, [])

  const cancel = useCallback(() => {
    clearInterval(timerRef.current)
    setRecording(false)
    setElapsed(0)
    resolveRef.current = null
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.ondataavailable = () => {}
      mediaRecorder.current.onstop = () => {}
      mediaRecorder.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  return { recording, elapsed, start, stop, cancel }
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  if (!src) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', backdropFilter: 'blur(8px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'zoom-out', animation: 'fadeIn .15s ease both'
    }}>
      <img src={src} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }} />
      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  )
}

// ─── Cores estilo WhatsApp (enviadas: verde teal, recebidas: cinza escuro) ───
const WA_SENT = '#005c4b'      // verde WhatsApp mensagens enviadas
const WA_RECEIVED = '#202c33'  // cinza WhatsApp mensagens recebidas
const WA_SENT_BOT = '#4a3f91'  // roxo para msgs do bot

// ─── Bubble de mensagem ─────────────────────────────────────────────────────
function MessageBubble({ msg, onQuote, onImageClick }) {
  const isOut = msg.direction === 'out'
  const isBot = msg.is_bot
  const bg = isOut ? (isBot ? WA_SENT_BOT : WA_SENT) : WA_RECEIVED

  return (
    <div style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 4, gap: 4, minWidth: 0 }}>
      {!isOut && <div style={{ width: 28, flexShrink: 0 }} />}
      <div style={{
        maxWidth: 'min(85%, 340px)', minWidth: 0, padding: '8px 12px',
        borderRadius: isOut ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: bg,
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
        position: 'relative',
        color: '#e9edef',
        overflow: 'hidden',
        overflowWrap: 'break-word', wordBreak: 'break-word',
      }}>
        {isBot && isOut && (
          <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.75)', marginBottom: 2, fontWeight: 600 }}>
            Bot
          </div>
        )}
        {msg.quoted_id && (
          <div style={{ borderLeft: '3px solid rgba(255,255,255,.4)', paddingLeft: 8, marginBottom: 6, fontSize: '.75rem', color: 'rgba(255,255,255,.9)' }}>
            Respondendo...
          </div>
        )}
        <MediaContent msg={msg} onImageClick={onImageClick} />
        {msg.body && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'sticker' && (
          <div style={{ fontSize: '.88rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word', color: '#e9edef', minWidth: 0 }}>
            {msg.body}
          </div>
        )}
        {msg.body && (msg.type === 'image' || msg.type === 'video') && msg.body !== '[imagem]' && msg.body !== '[video]' && (
          <div style={{ fontSize: '.82rem', lineHeight: 1.35, marginTop: 4, color: 'rgba(255,255,255,.9)', wordBreak: 'break-word', overflowWrap: 'break-word', minWidth: 0 }}>{msg.body}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.6)' }}>
            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {isOut && (
            <span style={{ fontSize: '.72rem', color: msg.status === 'read' ? '#53bdeb' : 'rgba(255,255,255,.7)' }}>
              {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
            </span>
          )}
        </div>
        <button onClick={() => onQuote(msg)}
          style={{ position: 'absolute', top: 4, right: isOut ? 'auto' : 4, left: isOut ? 4 : 'auto',
            background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0,
            fontSize: '.75rem', padding: '2px 4px', borderRadius: 4 }}
          className="quote-btn">↩</button>
      </div>
    </div>
  )
}

// ─── Tags da conversa ───────────────────────────────────────────────────────
function ConvTags({ convId, allTags }) {
  const [tags, setTags] = useState([])

  useEffect(() => {
    api.get(`/whatsapp/conversations/${convId}/tags`).then(r => setTags(r.data)).catch(() => {})
  }, [convId])

  const add = async tagId => {
    await api.post(`/whatsapp/conversations/${convId}/tags`, { tagId })
    const t = allTags.find(t => t.id === tagId)
    if (t && !tags.find(x => x.id === tagId)) setTags(prev => [...prev, t])
  }

  const remove = async tagId => {
    await api.delete(`/whatsapp/conversations/${convId}/tags/${tagId}`)
    setTags(prev => prev.filter(t => t.id !== tagId))
  }

  const available = allTags.filter(t => !tags.find(x => x.id === t.id))

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {tags.map(t => (
        <span key={t.id} style={{ background: t.color + '22', border: `1px solid ${t.color}`, color: t.color,
          borderRadius: 99, fontSize: '.68rem', fontWeight: 700, padding: '2px 8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3 }}
          onClick={() => remove(t.id)}>
          {t.name} ×
        </span>
      ))}
      {available.length > 0 && (
        <select onChange={e => { if (e.target.value) { add(parseInt(e.target.value)); e.target.value = '' } }}
          style={{ fontSize: '.7rem', background: 'var(--bg-card2)', border: '1px solid var(--border)',
            color: 'var(--muted)', borderRadius: 99, padding: '2px 6px', cursor: 'pointer', outline: 'none' }}>
          <option value="">+ tag</option>
          {available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </div>
  )
}

// ─── Painel de conversa ─────────────────────────────────────────────────────
function ConversationPanel({ conv, onUpdate, allTags, onNewMessage, onNewConv }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState('')
  const [quoted, setQuoted] = useState(null)
  const [quickReplies, setQuickReplies] = useState([])
  const [productSuggestions, setProductSuggestions] = useState([])
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [agents, setAgents] = useState([])
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [productPreviewOpen, setProductPreviewOpen] = useState(false)
  const [productPreviewProductId, setProductPreviewProductId] = useState(null)
  const messagesRef = useRef(null)
  const bottomRef = useRef()
  const inputRef = useRef()
  const fileRef = useRef()
  const isAtBottom = useRef(true)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const audioRecorder = useAudioRecorder()

  // ── Carregar mensagens ──
  const loadMessages = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/whatsapp/conversations/${conv.id}/messages?limit=80`)
      const data = r.data
      setMessages(data.messages || data)
      setHasMore(data.hasMore ?? false)
      api.patch(`/whatsapp/conversations/${conv.id}/read`).catch(() => {})
    } finally { setLoading(false) }
  }

  // ── Carregar mais mensagens (scroll up) ──
  const loadOlder = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const container = messagesRef.current
    const prevHeight = container?.scrollHeight || 0
    try {
      const oldestId = messages[0]?.id
      const r = await api.get(`/whatsapp/conversations/${conv.id}/messages?limit=80&before=${oldestId}`)
      const data = r.data
      const older = data.messages || data
      setHasMore(data.hasMore ?? false)
      setMessages(prev => [...older, ...prev])
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevHeight
      })
    } finally { setLoadingMore(false) }
  }

  useEffect(() => {
    loadMessages()
    api.get('/users').then(r => setAgents(r.data || [])).catch(() => {})
  }, [conv.id])

  // ── Scroll ao fundo ao abrir (força no fim da conversa) ──
  useEffect(() => {
    if (loading || messages.length === 0) return
    const el = messagesRef.current
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
        isAtBottom.current = true
        setShowScrollDown(false)
      })
    }
  }, [loading, conv.id])

  // ── Scroll automático quando novas mensagens (só se já no fundo) ──
  useEffect(() => {
    if (loading || !isAtBottom.current) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Detectar scroll ──
  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    if (el.scrollTop < 80 && hasMore && !loadingMore) loadOlder()
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    isAtBottom.current = atBottom
    setShowScrollDown(!atBottom)
  }, [hasMore, loadingMore])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    isAtBottom.current = true
    setShowScrollDown(false)
  }

  // ── Recebe nova mensagem ou edição via WebSocket ──
  useEffect(() => {
    if (!onNewMessage) return
    const unsub = onNewMessage(conv.id, msg => {
      if (msg.type === 'edit') {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, body: msg.body } : m))
        return
      }
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id || (msg.wa_message_id && m.wa_message_id === msg.wa_message_id))) return prev
        return [...prev, msg]
      })
      if (isAtBottom.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    })
    return unsub
  }, [conv.id, onNewMessage])

  // ── Quick replies e sugestões de produtos (com debounce) ──
  const debouncedText = useDebounce(text, 300)
  useEffect(() => {
    if (!debouncedText.startsWith('/')) {
      setQuickReplies([])
      setProductSuggestions([])
      return
    }
    if (debouncedText.toLowerCase().startsWith('/produto ')) {
      const term = debouncedText.slice(9).trim()
      if (term.length >= 2) {
        api.get(`/whatsapp/products/suggest?q=${encodeURIComponent(term)}`)
          .then(r => setProductSuggestions(r.data || []))
          .catch(() => setProductSuggestions([]))
      } else {
        setProductSuggestions([])
      }
      setQuickReplies([])
    } else {
      setProductSuggestions([])
      api.get(`/whatsapp/quick-replies?q=${encodeURIComponent(debouncedText)}&department_id=${conv.department_id || ''}`)
        .then(r => setQuickReplies(r.data)).catch(() => setQuickReplies([]))
    }
  }, [debouncedText, conv.department_id])

  // ── Verificar se é comando /produto id:X (mostra preview antes de enviar) ──
  const PRODUTO_ID_RE = /^\/produto\s+id:(\d+)$/i
  const tryProductPreview = () => {
    const m = text.trim().match(PRODUTO_ID_RE)
    return m ? parseInt(m[1], 10) : null
  }

  // ── Enviar texto ──
  const send = async () => {
    if (!text.trim() || sending) return
    const productId = tryProductPreview()
    if (productId) {
      setProductPreviewProductId(productId)
      setProductPreviewOpen(true)
      return
    }
    setSending(true)
    try {
      const r = await api.post(`/whatsapp/conversations/${conv.id}/messages`, {
        text: text.trim(), quotedId: quoted?.id || null
      })
      setMessages(prev => [...prev, r.data])
      setText(''); setQuoted(null)
      onUpdate(conv.id, { last_message: text.trim(), status: 'active' })
      isAtBottom.current = true
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao enviar') }
    finally { setSending(false) }
  }

  // ── Enviar arquivo ──
  const sendFile = async e => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 15MB)'); return }
    setUploading(true)
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = ev => res(ev.target.result)
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const mediatype = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio' : 'document'
      const r = await api.post(`/whatsapp/conversations/${conv.id}/media`, {
        mediatype,
        media: base64,
        mimetype: file.type,
        fileName: file.name,
        caption: ''
      })
      setMessages(prev => [...prev, { ...r.data, media_base64: base64 }])
      isAtBottom.current = true
      onUpdate(conv.id, {
        last_message: mediatype === 'image' ? '[imagem]' : '[arquivo]',
        last_message_id: r.data?.id,
        last_message_type: mediatype,
        last_message_at: r.data?.created_at,
        status: 'active'
      })
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao enviar arquivo') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // ── Enviar áudio gravado ──
  const sendAudio = async () => {
    const base64 = await audioRecorder.stop()
    if (!base64) return
    setSending(true)
    try {
      const r = await api.post(`/whatsapp/conversations/${conv.id}/audio`, { audio: base64 })
      setMessages(prev => [...prev, r.data])
      isAtBottom.current = true
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao enviar áudio') }
    finally { setSending(false) }
  }

  const createLead = async () => {
    try {
      await api.post(`/whatsapp/conversations/${conv.id}/create-lead`)
      toast.success('Lead criado no CRM com sucesso!')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const [quickClientModal, setQuickClientModal] = useState(false)
  const [clientExists, setClientExists] = useState(null)
  const checkClient = async () => {
    const phone = (conv.contact_phone || '').replace(/\D/g, '')
    if (!phone || phone.length < 10) return toast.error('Número inválido')
    try {
      const r = await api.get(`/clients/by-phone/${phone}`)
      if (r.data.exists) {
        toast.info(`Cliente já cadastrado: ${r.data.client?.name || ''}`)
      } else {
        setClientExists(false)
        setQuickClientModal(true)
      }
    } catch (e) { setQuickClientModal(true); setClientExists(false) }
  }

  const TAB_COMPLETE = { '/prod': '/produto ', '/pro': '/produto ', '/produ': '/produto ', '/produt': '/produto ',
    '/ola': '/ola ', '/aguarde': '/aguarde ', '/horario': '/horario ', '/obrigado': '/obrigado ' }
  const tabComplete = () => {
    if (!text.startsWith('/')) return
    const t = text.trim().toLowerCase()
    const match = TAB_COMPLETE[t] || ['/produto ', '/ola ', '/aguarde ', '/horario ', '/obrigado ']
      .find(c => c.toLowerCase().startsWith(t) && c.toLowerCase().length > t.length)
    if (match) {
      setText(match)
      setProductSuggestions([])
      setQuickReplies([])
      inputRef.current?.focus()
    }
  }
  const applyQuickReply = qr => { setText(qr.body); setQuickReplies([]); setProductSuggestions([]); inputRef.current?.focus() }
  const selectProduct = product => {
    setText(`/produto id:${product.id}`)
    setProductSuggestions([])
    inputRef.current?.focus()
  }
  const handleKeyDown = e => {
    if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); tabComplete(); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    if (e.key === 'Escape') { setQuoted(null); setQuickReplies([]); setProductSuggestions([]) }
  }

  const canSend = conv.status !== 'closed' && conv.status !== 'bot' && !conv.phone_invalid

  const fmtElapsed = s => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header — layout em colunas para evitar amontoamento */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)',
        display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
            <Avatar name={conv.contact_name || conv.contact_phone} src={conv.avatar_url} phone={conv.contact_phone} size={38} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 2 }}>{conv.contact_name || fmtPhone(conv.contact_phone)}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, rowGap: 4 }}>
                {conv.contact_name && <span>{fmtPhone(conv.contact_phone)}</span>}
                {conv.status !== 'closed' && (
                  <button
                    onClick={async () => {
                      const n = prompt('Corrigir número do contato (DDI+DDD+cel, ex: 5511979947004):', conv.contact_phone?.replace(/\D/g,'') || '')
                      if (n == null) return
                      const num = (n+'').replace(/\D/g,'')
                      if (!/^\d{10,15}$/.test(num)) return toast.error('Número inválido. Use ex: 5511999999999')
                      try {
                        await api.patch(`/whatsapp/conversations/${conv.id}`, { contact_phone: num, phone_invalid: false })
                        onUpdate(conv.id, { contact_phone: num, phone_invalid: false })
                      } catch(e) { toast.error('Erro: ' + (e.response?.data?.error || e.message)) }
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '.75rem', textDecoration: 'underline', padding: 0 }}
                    title="Corrigir número">
                    Editar número
                  </button>
                )}
                <span style={{ color: STATUS_COLOR[conv.status], fontWeight: 600 }}>{STATUS_LABEL[conv.status]}</span>
                {conv.dept_name && <span style={{ color: conv.dept_color }}>{conv.dept_name}</span>}
                {conv.agent_name && <span style={{ color: 'var(--primary)' }}>{conv.agent_name}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Btn size="sm" variant="ghost" onClick={checkClient} title="Cadastrar cliente">Cliente</Btn>
            <Btn size="sm" variant="ghost" onClick={createLead} title="Criar lead no CRM">CRM</Btn>
            {conv.status !== 'active' && conv.status !== 'closed' && (
              <Btn size="sm" variant="success" onClick={async () => {
                await api.patch(`/whatsapp/conversations/${conv.id}/assign`, { userId: user.id })
                onUpdate(conv.id, { status: 'active', agent_name: user.name })
              }}>Assumir</Btn>
            )}
            {agents.length > 1 && conv.status !== 'closed' && (
              <select onChange={async e => {
                if (!e.target.value) return
                await api.patch(`/whatsapp/conversations/${conv.id}/assign`, { userId: parseInt(e.target.value) })
                const ag = agents.find(a => a.id === parseInt(e.target.value))
                onUpdate(conv.id, { status: 'active', agent_name: ag?.name })
                e.target.value = ''
              }} style={{ fontSize: '.75rem', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                color: 'var(--text)', borderRadius: 6, padding: '6px 10px', outline: 'none', cursor: 'pointer' }}>
                <option value="">Atribuir...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            {conv.status !== 'closed' && (
              <Btn size="sm" variant="ghost" onClick={async () => {
                await api.patch(`/whatsapp/conversations/${conv.id}/close`)
                onUpdate(conv.id, { status: 'closed' })
              }}>Fechar</Btn>
            )}
            {conv.status === 'closed' && (
              <Btn size="sm" variant="ghost" onClick={async () => {
                try {
                  const r = await api.patch(`/whatsapp/conversations/${conv.id}/reopen`)
                  if (r.data?.id && r.data.id !== conv.id) { onNewConv && onNewConv(r.data) }
                  else { onUpdate(conv.id, { status: 'queue' }) }
                } catch (e) { toast.error(e.response?.data?.error || 'Erro ao reabrir') }
              }}>Nova conversa</Btn>
            )}
          </div>
        </div>
        {conv.phone_invalid && (
              <div style={{ fontSize: '.72rem', background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444',
                borderRadius: 6, padding: '4px 10px', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚠️ Número LID — não é possível responder</span>
                <button
                  onClick={async () => {
                    const n = prompt('Digite o número do contato (com DDI+DDD, ex: 5511999999999):')
                    if (!n) return
                    const num = n.replace(/\D/g,'')
                    if (!/^\d{10,15}$/.test(num)) return toast.error('Número inválido. Use formato: 5511999999999')
                    try {
                      await api.patch(`/whatsapp/conversations/${conv.id}`, { contact_phone: num, phone_invalid: false })
                      onUpdate(conv.id, { contact_phone: num, phone_invalid: false })
                      toast.success('Número corrigido! Agora você pode responder.')
                    } catch(e) { toast.error('Erro ao corrigir: ' + (e.response?.data?.error || e.message)) }
                  }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4,
                    padding: '2px 8px', cursor: 'pointer', fontSize: '.7rem', fontWeight: 700, flexShrink: 0 }}>
                  Corrigir número
                </button>
              </div>
            )}
            <ConvTags convId={conv.id} allTags={allTags} />
      </div>

      {/* Mensagens — fundo estilo WhatsApp (teal escuro) */}
      <div ref={messagesRef} onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', background: '#0b141a', position: 'relative' }}>
        <style>{`.quote-btn:hover { opacity: 1 !important; }`}</style>
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Spinner size={22} text="Carregando anteriores..." />
          </div>
        )}
        {hasMore && !loadingMore && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <button onClick={loadOlder} style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)',
              borderRadius: 99, color: 'var(--muted)', fontSize: '.78rem', padding: '5px 14px', cursor: 'pointer' }}>
              Carregar anteriores
            </button>
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><Spinner /></div>
        ) : messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.88rem', paddingTop: 40 }}>
            Nenhuma mensagem ainda
          </p>
        ) : (
          messages.map((m, i) => <MessageBubble key={m.id || m.wa_message_id || i} msg={m}
            onQuote={setQuoted} onImageClick={setLightboxSrc} />)
        )}
        <div ref={bottomRef} />
        {showScrollDown && (
          <button onClick={scrollToBottom}
            style={{ position: 'absolute', bottom: 16, right: 16, width: 40, height: 40, borderRadius: '50%',
              background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Ir para o final">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6,12 12,18 18,12"/><line x1="12" y1="6" x2="12" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Bot ativo */}
      {conv.status === 'bot' && (
        <div style={{ padding: '8px 16px', background: 'rgba(139,92,246,.15)', borderTop: '1px solid rgba(139,92,246,.3)',
          fontSize: '.82rem', color: '#8b5cf6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Bot está respondendo. Você pode acompanhar e assumir a qualquer momento.</span>
          <Btn size="sm" style={{ background: '#8b5cf6', color: '#fff' }} onClick={async () => {
            await api.patch(`/whatsapp/conversations/${conv.id}/assign`, { userId: user.id })
            onUpdate(conv.id, { status: 'active' })
          }}>Assumir agora</Btn>
        </div>
      )}

      {/* Citação */}
      {quoted && (
        <div style={{ padding: '8px 16px', background: 'var(--bg-card2)', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '.8rem' }}>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Respondendo: </span>
            <span style={{ color: 'var(--muted)' }}>{quoted.body?.substring(0, 60) || '[mídia]'}...</span>
          </div>
          <button onClick={() => setQuoted(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Sugestões de produtos (/produto) — clica só completa, edite e envie com Enter */}
      {productSuggestions.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', padding: '6px 14px', fontWeight: 600 }}>Clique para inserir (edite e envie com Enter)</div>
          {productSuggestions.map(p => (
            <div key={p.id} onClick={() => selectProduct(p)}
              style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg-card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}>📦</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{p.name}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                  {[p.brand, p.model].filter(Boolean).join(' · ')}
                  {(p.sale_price > 0 || p.pix_price > 0) && ` · ${fmt.brl(p.pix_price || p.sale_price)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Atalhos rápidos */}
      {quickReplies.length > 0 && productSuggestions.length === 0 && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', maxHeight: 180, overflowY: 'auto' }}>
          {quickReplies.map(qr => (
            <div key={qr.id} onClick={() => applyQuickReply(qr)}
              style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '.82rem', marginRight: 8 }}>{qr.shortcut}</span>
              <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{qr.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      {canSend ? (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)',
          display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          {audioRecorder.recording ? (
            /* Gravando áudio */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={audioRecorder.cancel}
                style={{ background: 'none', border: 'none', color: 'var(--danger, #ef4444)', cursor: 'pointer', padding: '6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Cancelar gravação">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/>
                  <path d="M9,6V4h6v2"/>
                </svg>
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
                  animation: 'blink 1s infinite', flexShrink: 0 }} />
                <span style={{ fontSize: '.88rem', color: 'var(--text)', fontFamily: 'monospace' }}>
                  {fmtElapsed(audioRecorder.elapsed)}
                </span>
                <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:.3 } }`}</style>
              </div>
              <Btn onClick={sendAudio} disabled={sending} style={{ flexShrink: 0 }}>
                {sending ? 'Enviando...' : 'Enviar'}
              </Btn>
            </div>
          ) : (
            /* Input normal */
            <>
              {/* Anexar arquivo */}
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ background: 'none', border: 'none', color: uploading ? 'var(--primary)' : 'var(--muted)',
                  cursor: 'pointer', padding: '6px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color .15s' }}
                onMouseEnter={e => { if (!uploading) e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { if (!uploading) e.currentTarget.style.color = 'var(--muted)' }}
                title="Anexar arquivo">
                {uploading
                  ? <Spinner size={18} />
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                }
              </button>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" />

              <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown} rows={1} placeholder="Digite uma mensagem... (/ para atalhos)"
                style={{ flex: 1, background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10,
                  color: 'var(--text)', padding: '9px 12px', fontSize: '.9rem', outline: 'none', resize: 'none',
                  maxHeight: 120, fontFamily: 'inherit', lineHeight: 1.4 }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
              />

              {text.trim() ? (
                /* Botão enviar */
                <button onClick={send} disabled={!text.trim() || sending}
                  style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'var(--primary, #8b5cf6)', color: '#fff', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: (!text.trim() || sending) ? .5 : 1, transition: 'opacity .15s' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              ) : (
                /* Botão microfone */
                <button onClick={() => audioRecorder.start()}
                  style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--muted)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color .15s, background .15s', position: 'relative' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'rgba(139,92,246,.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                  title={window.location.protocol !== 'https:' && window.location.hostname !== 'localhost'
                    ? 'Requer HTTPS para gravar áudio'
                    : 'Gravar áudio'}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  {window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && (
                    <span style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10,
                      borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bg-card)' }} />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)',
          textAlign: 'center', fontSize: '.82rem', color: 'var(--muted)' }}>
          {conv.phone_invalid
            ? '⚠️ Número inválido — não é possível responder. Quando o contato enviar uma nova mensagem, o número será corrigido automaticamente.'
            : conv.status === 'bot' ? 'Aguardando bot...' : 'Conversa fechada'}
        </div>
      )}

      {/* Lightbox */}
      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Modal preview de produto (editar preço/texto antes de enviar) */}
      {productPreviewOpen && productPreviewProductId && (
        <ProductPreviewModal
          convId={conv.id}
          productId={productPreviewProductId}
          onClose={() => { setProductPreviewOpen(false); setProductPreviewProductId(null) }}
          onSent={(msg) => {
            setMessages(prev => [...prev, msg])
            setText('')
            setProductSuggestions([])
            setProductPreviewOpen(false)
            setProductPreviewProductId(null)
            onUpdate(conv.id, { last_message: '[produto]', status: 'active' })
            isAtBottom.current = true
          }}
          toast={toast}
        />
      )}

      {/* Modal cadastro rápido de cliente */}
      {quickClientModal && (
        <QuickClientModal
          name={conv.contact_name || ''}
          phone={conv.contact_phone || ''}
          onClose={() => { setQuickClientModal(false); setClientExists(null) }}
          onSaved={async (client) => {
            setQuickClientModal(false)
            try {
              await api.patch(`/whatsapp/conversations/${conv.id}/link`, { clientId: client.id })
            } catch (_) {}
          }}
        />
      )}
    </div>
  )
}

// ─── Modal preview produto (editar preço/texto antes de enviar) ──────────────
function ProductPreviewModal({ convId, productId, onClose, onSent, toast }) {
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!productId) return
    setLoading(true)
    api.get(`/whatsapp/products/preview/${productId}`)
      .then(r => {
        setPreview(r.data)
        setCaption(r.data?.caption || '')
      })
      .catch(() => { toast?.error('Produto não encontrado'); onClose() })
      .finally(() => setLoading(false))
  }, [productId])

  const handleSend = async () => {
    setSending(true)
    try {
      const r = await api.post(`/whatsapp/conversations/${convId}/send-product`, {
        productId,
        customCaption: caption.trim() || undefined
      })
      onSent(r.data)
    } catch (e) {
      toast?.error(e.response?.data?.error || 'Erro ao enviar')
    } finally { setSending(false) }
  }

  if (!productId) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, width: 420, maxWidth: '95vw', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Previsualizar produto</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : preview ? (
          <>
            {preview.product?.image_base64 && (
              <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card2)' }}>
                <img src={preview.product.image_base64.startsWith('data:') ? preview.product.image_base64 : `data:image/jpeg;base64,${preview.product.image_base64}`}
                  alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'contain' }} />
              </div>
            )}
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 8 }}>{preview.product?.name}</div>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Mensagem (edite o preço ou texto antes de enviar)</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
              style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', padding: '10px 12px', fontSize: '.88rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
              <Btn onClick={handleSend} disabled={sending}>{sending ? 'Enviando...' : 'Enviar'}</Btn>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Modal cadastro rápido cliente ──────────────────────────────────────────
function QuickClientModal({ name, phone, onClose, onSaved }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ name: name || '', phone: (phone || '').replace(/\D/g, '') })
  const [saving, setSaving] = useState(false)
  useEffect(() => { setForm({ name: name || '', phone: (phone || '').replace(/\D/g, '') }) }, [name, phone])
  const save = async () => {
    if (!form.name?.trim()) return toast.error('Nome obrigatório')
    if (!form.phone || form.phone.length < 10) return toast.error('Telefone inválido')
    setSaving(true)
    try {
      const r = await api.post('/clients', { type: 'client', name: form.name.trim(), phone: form.phone })
      onSaved(r.data)
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao cadastrar') }
    finally { setSaving(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, width: 340, border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Cadastro rápido de cliente</div>
        <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Telefone *" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} placeholder="5511999999999" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ─── Miniatura da última imagem na lista (lazy load) ─────────────────────────
function LastMsgThumb({ msgId, mimetype }) {
  const [src, setSrc] = useState(null)
  const tried = useRef(false)
  useEffect(() => {
    if (!msgId || tried.current) return
    tried.current = true
    api.get(`/whatsapp/messages/${msgId}/media`)
      .then(r => {
        const b = r.data?.base64
        if (b) setSrc(b.startsWith('data:') ? b : `data:${r.data?.mimetype || 'image/jpeg'};base64,${b}`)
      })
      .catch(() => {})
  }, [msgId])
  if (!src) return <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>📷</span>
  return (
    <img src={src} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
  )
}

// ─── Item de conversa na lista ──────────────────────────────────────────────
function ConvItem({ conv, active, onClick }) {
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''
  const isLastImage = conv.last_message_type === 'image' && conv.last_message_id
  return (
    <div onClick={onClick}
      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
        background: active ? 'rgba(180,79,255,.12)' : 'transparent',
        borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
        transition: 'background .15s' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-card2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar name={conv.contact_name || conv.contact_phone} src={conv.avatar_url} phone={conv.contact_phone} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.contact_name || fmtPhone(conv.contact_phone)}
            </span>
            <span style={{ fontSize: '.68rem', color: 'var(--muted)', flexShrink: 0, marginLeft: 4 }}>{time}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, gap: 8 }}>
            <span style={{ fontSize: '.78rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isLastImage ? (
                <>
                  <LastMsgThumb msgId={conv.last_message_id} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>Foto</span>
                </>
              ) : (
                conv.last_message || 'Sem mensagens'
              )}
            </span>
            {conv.unread_count > 0 && (
              <span style={{ background: '#10b981', color: '#fff', borderRadius: 99, fontSize: '.65rem',
                padding: '1px 6px', fontWeight: 700, flexShrink: 0, marginLeft: 4 }}>{conv.unread_count}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3, alignItems: 'center' }}>
            <span style={{ fontSize: '.65rem', color: STATUS_COLOR[conv.status], fontWeight: 600 }}>
              {STATUS_LABEL[conv.status]}
            </span>
            {conv.dept_name && (
              <span style={{ fontSize: '.65rem', color: conv.dept_color, fontWeight: 600 }}>· {conv.dept_name}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Settings WhatsApp ──────────────────────────────────────────────────────
function WaSettings({ onClose }) {
  const { toast, confirm } = useToast()
  const [tab, setTab] = useState('instances')
  const [instances, setInstances] = useState([])
  const [departments, setDepartments] = useState([])
  const [quickReplies, setQR] = useState([])
  const [tags, setTags] = useState([])
  const [qrCode, setQrCode] = useState(null)
  const [qrInstId, setQrInstId] = useState(null)
  const [newInst, setNewInst] = useState('')
  const [newDept, setNewDept] = useState({ name: '', color: '#6366f1' })
  const [newQR, setNewQR] = useState({ shortcut: '', title: '', body: '' })
  const [newTag, setNewTag] = useState({ name: '', color: '#6366f1' })
  const [saving, setSaving] = useState(false)
  const pollRef = useRef()

  useEffect(() => {
    api.get('/whatsapp/instances').then(r => setInstances(r.data)).catch(() => {})
    api.get('/whatsapp/departments').then(r => {
      // Deduplicate by id in case of legacy DB duplicates
      const seen = new Set()
      setDepartments((r.data || []).filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true }))
    }).catch(() => {})
    api.get('/whatsapp/quick-replies').then(r => setQR(r.data)).catch(() => {})
    api.get('/whatsapp/tags').then(r => setTags(r.data)).catch(() => {})
    return () => clearInterval(pollRef.current)
  }, [])

  const startPolling = id => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/whatsapp/instances/${id}/status`)
        const st = r.data.status
        setInstances(prev => prev.map(i => i.id === id ? { ...i, status: st } : i))
        if (st === 'connected') { clearInterval(pollRef.current); setQrCode(null); setQrInstId(null) }
      } catch {}
    }, 3000)
  }

  const connectInst = async id => {
    try {
      const r = await api.post(`/whatsapp/instances/${id}/connect`)
      if (r.data.qrCode) { setQrCode(r.data.qrCode); setQrInstId(id) }
      setInstances(prev => prev.map(i => i.id === id ? { ...i, status: r.data.status || i.status } : i))
      startPolling(id)
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao conectar') }
  }

  const deleteInst = async id => {
    if (!await confirm('Excluir esta instância?')) return
    try {
      await api.delete(`/whatsapp/instances/${id}`)
      setInstances(prev => prev.filter(i => i.id !== id))
      if (qrInstId === id) { setQrCode(null); setQrInstId(null) }
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao excluir') }
  }

  const refreshWebhook = async id => {
    try {
      await api.post(`/whatsapp/instances/${id}/refresh-webhook`)
      toast.success('Webhook atualizado')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao atualizar webhook') }
  }

  const createInst = async () => {
    if (!newInst.trim()) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/instances', { name: newInst.toLowerCase().trim() })
      setInstances(prev => [...prev, r.data]); setNewInst('')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const createDept = async () => {
    if (!newDept.name.trim()) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/departments', newDept)
      setDepartments(prev => [...prev, r.data]); setNewDept({ name: '', color: '#6366f1' })
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const createQR = async () => {
    if (!newQR.shortcut || !newQR.body) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/quick-replies', newQR)
      setQR(prev => [...prev, r.data]); setNewQR({ shortcut: '', title: '', body: '' })
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const createTag = async () => {
    if (!newTag.name.trim()) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/tags', newTag)
      setTags(prev => [...prev, r.data]); setNewTag({ name: '', color: '#6366f1' })
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const delQR = async id => {
    if (!await confirm('Excluir atalho?')) return
    await api.delete(`/whatsapp/quick-replies/${id}`)
    setQR(prev => prev.filter(q => q.id !== id))
  }

  const statusColor = { connected: '#10b981', disconnected: '#ef4444', qr_code: '#f59e0b', connecting: '#f59e0b' }
  const statusLabel = { connected: 'Conectado', disconnected: 'Desconectado', qr_code: 'Aguardando QR', connecting: 'Conectando...' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['instances', 'Instâncias'], ['departments', 'Departamentos'], ['quickreplies', 'Atalhos'], ['tags', 'Tags']].map(([t, l]) => (
          <Btn key={t} size="sm" variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>{l}</Btn>
        ))}
      </div>

      {tab === 'instances' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input label="Nome da instância" value={newInst} onChange={e => setNewInst(e.target.value)} style={{ flex: 1 }} placeholder="ex: principal" />
            <div style={{ alignSelf: 'flex-end' }}><Btn size="sm" onClick={createInst} disabled={saving}>+ Criar</Btn></div>
          </div>
          {qrCode && (
            <div style={{ textAlign: 'center', padding: 16, background: '#fff', borderRadius: 12 }}>
              <p style={{ color: '#000', fontSize: '.85rem', marginBottom: 8 }}>Escaneie o QR Code no WhatsApp</p>
              <img src={qrCode} alt="QR Code" style={{ width: 220, height: 220 }} />
            </div>
          )}
          {instances.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'var(--bg-card2)', borderRadius: 8,
              border: `1px solid ${i.status === 'connected' ? '#10b981' : 'var(--border)'}` }}>
              <div>
                <span style={{ fontWeight: 600 }}>{i.name}</span>
                {i.phone && <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: 8 }}>{fmtPhone(i.phone)}</span>}
                <div style={{ fontSize: '.75rem', marginTop: 2 }}>
                  <span style={{ color: statusColor[i.status] || 'var(--muted)', fontWeight: 600 }}>
                    {statusLabel[i.status] || i.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {i.status !== 'connected' && <Btn size="sm" variant="success" onClick={() => connectInst(i.id)}>Conectar</Btn>}
                {i.status === 'connected' && <Btn size="sm" variant="secondary" onClick={() => refreshWebhook(i.id)}>Atualizar webhook</Btn>}
                <Btn size="sm" variant="danger" onClick={() => deleteInst(i.id)}>Excluir</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'departments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'flex-end' }}>
            <Input label="Nome" value={newDept.name} onChange={e => setNewDept(p => ({ ...p, name: e.target.value }))} />
            <div>
              <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cor</label>
              <input type="color" value={newDept.color} onChange={e => setNewDept(p => ({ ...p, color: e.target.value }))}
                style={{ width: 42, height: 36, padding: 2, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
            </div>
            <Btn size="sm" onClick={createDept} disabled={saving}>+</Btn>
          </div>
          {departments.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              background: 'var(--bg-card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, flex: 1 }}>{d.name}</span>
              <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{d.description || ''}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'quickreplies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input label="Atalho (ex: /ola)" value={newQR.shortcut} onChange={e => setNewQR(p => ({ ...p, shortcut: e.target.value }))} placeholder="/atalho" />
            <Input label="Título" value={newQR.title} onChange={e => setNewQR(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Mensagem *</label>
            <textarea value={newQR.body} onChange={e => setNewQR(p => ({ ...p, body: e.target.value }))} rows={3}
              style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', padding: '8px 12px', fontSize: '.88rem', outline: 'none', resize: 'vertical' }} />
          </div>
          <Btn size="sm" onClick={createQR} disabled={saving}>+ Adicionar atalho</Btn>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {quickReplies.map(qr => (
              <div key={qr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '8px 12px', background: 'var(--bg-card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '.82rem' }}>{qr.shortcut}</span>
                  <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: 8 }}>{qr.title}</span>
                  <div style={{ fontSize: '.8rem', color: 'var(--text)', marginTop: 3, opacity: .85 }}>
                    {qr.body.substring(0, 80)}{qr.body.length > 80 ? '...' : ''}
                  </div>
                </div>
                <Btn size="sm" variant="danger" onClick={() => delQR(qr.id)} style={{ marginLeft: 8 }}>Excluir</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tags' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'flex-end' }}>
            <Input label="Nome da tag" value={newTag.name} onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))} />
            <div>
              <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cor</label>
              <input type="color" value={newTag.color} onChange={e => setNewTag(p => ({ ...p, color: e.target.value }))}
                style={{ width: 42, height: 36, padding: 2, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
            </div>
            <Btn size="sm" onClick={createTag} disabled={saving}>+</Btn>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.map(t => (
              <span key={t.id} style={{ background: t.color + '22', border: `1px solid ${t.color}`, color: t.color,
                borderRadius: 99, fontSize: '.82rem', fontWeight: 700, padding: '4px 12px' }}>{t.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal nova conversa ────────────────────────────────────────────────────
function NewConvModal({ open, onClose, onCreated }) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [departments, setDepartments] = useState([])
  const [deptId, setDeptId] = useState('')
  const [saving, setSaving] = useState(false)
  const [waContacts, setWaContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactFilter, setContactFilter] = useState('')

  useEffect(() => {
    if (open) {
      api.get('/whatsapp/departments').then(r => setDepartments(r.data)).catch(() => {})
      setSearch(''); setResults([]); setPhone(''); setName(''); setContactFilter('')
      // Load WhatsApp phone book contacts
      setLoadingContacts(true)
      api.get('/whatsapp/contacts').then(r => setWaContacts(r.data || [])).catch(() => setWaContacts([])).finally(() => setLoadingContacts(false))
    }
  }, [open])

  const debouncedSearch = useDebounce(search, 300)
  useEffect(() => {
    if (debouncedSearch.length < 2) { setResults([]); return }
    api.get(`/whatsapp/contacts/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then(r => setResults(r.data)).catch(() => {})
  }, [debouncedSearch])

  const selectContact = c => {
    setPhone((c.phone || '').replace(/\D/g, ''))
    setName(c.name || c.phone || '')
    setSearch(''); setResults([])
  }

  const create = async () => {
    if (!phone) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/conversations/new', { phone, name, departmentId: deptId || null })
      onCreated(r.data)
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const filteredWaContacts = contactFilter.trim().length > 0
    ? waContacts.filter(c => {
        const q = contactFilter.toLowerCase()
        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      })
    : waContacts

  return (
    <Modal open={open} onClose={onClose} title="Nova conversa" width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* CRM search */}
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, lead ou contato no CRM..."
            style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: '.88rem', outline: 'none' }} />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 8, zIndex: 20, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
              {results.map((r, i) => (
                <div key={i} onClick={() => selectContact(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{r.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{fmtPhone(r.phone)}</div>
                  </div>
                  <span style={{ fontSize: '.68rem', color: 'var(--muted)', background: 'var(--bg-card2)',
                    padding: '2px 6px', borderRadius: 99 }}>
                    {r.type === 'client' ? 'Cliente' : r.type === 'lead' ? 'Lead' : 'Contato'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phone / Name fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Telefone (com DDD) *</label>
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="5511999999999"
              style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: '.88rem', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nome do contato</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Nome (opcional)"
              style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: '.88rem', outline: 'none' }} />
          </div>
        </div>

        {departments.length > 0 && (
          <div>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Departamento</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', padding: '9px 12px', fontSize: '.88rem', outline: 'none' }}>
              <option value="">Sem departamento</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}

        {/* WhatsApp phone book */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600 }}>
              📱 Contatos do WhatsApp {waContacts.length > 0 && `(${waContacts.length})`}
            </label>
            {waContacts.length === 0 && !loadingContacts && (
              <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Sincronize em Configurações → Instâncias</span>
            )}
          </div>
          {loadingContacts ? (
            <div style={{ fontSize: '.8rem', color: 'var(--muted)', padding: '8px 0' }}>Carregando contatos...</div>
          ) : waContacts.length > 0 ? (
            <>
              <input value={contactFilter} onChange={e => setContactFilter(e.target.value)}
                placeholder="Filtrar contatos..."
                style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', padding: '7px 12px', fontSize: '.82rem', outline: 'none', marginBottom: 6 }} />
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {filteredWaContacts.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: '.82rem', color: 'var(--muted)' }}>Nenhum contato encontrado</div>
                ) : filteredWaContacts.map((c, i) => (
                  <div key={i} onClick={() => selectContact(c)}
                    style={{ padding: '8px 12px', cursor: 'pointer',
                      borderBottom: i < filteredWaContacts.length - 1 ? '1px solid var(--border)' : 'none',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: phone === (c.phone || '').replace(/\D/g, '') ? 'var(--primary)11' : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card2)'}
                    onMouseLeave={e => e.currentTarget.style.background = phone === (c.phone || '').replace(/\D/g, '') ? 'var(--primary)11' : 'transparent'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.75rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                        {(c.name || c.phone || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.84rem' }}>{c.name || fmtPhone(c.phone)}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{fmtPhone(c.phone)}</div>
                      </div>
                    </div>
                    {c.open_conv_id && (
                      <span style={{ fontSize: '.65rem', background: '#22c55e22', color: '#22c55e',
                        border: '1px solid #22c55e44', borderRadius: 99, padding: '2px 7px', flexShrink: 0 }}>
                        Em conversa
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={create} disabled={!phone || saving}>{saving ? 'Criando...' : 'Iniciar conversa'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────
export default function WhatsAppCRM() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [departments, setDepartments] = useState([])
  const [allTags, setAllTags] = useState([])
  const [search, setSearch] = useState('')
  const [settingsModal, setSettingsModal] = useState(false)
  const [newConvModal, setNewConvModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [instances, setInstances] = useState([])
  const [loadError, setLoadError] = useState(null)
  const convListeners = useRef({})
  // Use ref for activeConv inside WS handler to avoid stale closures
  const activeConvRef = useRef(null)

  const debouncedSearch = useDebounce(search, 400)
  const hasConnectedInstance = instances.some(i => i.status === 'connected')

  const loadConversations = useCallback(async () => {
    const p = new URLSearchParams()
    if (filterStatus) p.set('status', filterStatus)
    if (filterDept) p.set('department_id', filterDept)
    if (filterTag) p.set('tag_id', filterTag)
    if (debouncedSearch) p.set('search', debouncedSearch)
    setLoadError(null)
    try {
      const r = await api.get(`/whatsapp/conversations?${p}`)
      setConversations(r.data)
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Erro ao carregar conversas. Verifique se o backend e a Evolution API estão rodando.')
      setConversations([])
      toast.error('Erro ao carregar WhatsApp')
    } finally { setLoading(false) }
  }, [filterStatus, filterDept, filterTag, debouncedSearch, toast])

  useEffect(() => {
    api.get('/whatsapp/instances').then(r => setInstances(r.data || [])).catch(() => setInstances([]))
  }, [settingsModal])

  useEffect(() => {
    loadConversations()
    // Deduplicate departments by id in case of DB duplicates
    api.get('/whatsapp/departments').then(r => {
      const seen = new Set()
      setDepartments((r.data || []).filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true }))
    }).catch(() => {})
    api.get('/whatsapp/tags').then(r => setAllTags(r.data)).catch(() => {})
  }, [loadConversations])

  // ── Sync contacts ──
  const syncContacts = async () => {
    setSyncing(true)
    try {
      const instances = (await api.get('/whatsapp/instances')).data.filter(i => i.status === 'connected')
      if (!instances.length) { toast.warning('Nenhuma instância conectada'); return }
      const r = await api.post(`/whatsapp/contacts/sync`, { instanceId: instances[0].id })
      toast.success(`Contatos sincronizados: ${r.data?.updated || 0} atualizados`)
      loadConversations()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao sincronizar') }
    finally { setSyncing(false) }
  }

  // ── Handler WebSocket ──
  // IMPORTANT: use ref for activeConv to avoid recreating the WS on every conversation open
  const handleWS = useCallback(msg => {
    const activeId = activeConvRef.current?.id

    if (msg.type === 'new_message' && msg.conversation) {
      // If active conversation was closed and is now reopened, sync its state
      if (activeConvRef.current?.id === msg.conversation.id &&
          activeConvRef.current.status === 'closed' &&
          msg.conversation.status !== 'closed') {
        const merged = { ...activeConvRef.current, ...msg.conversation }
        activeConvRef.current = merged
        setActiveConv(merged)
      }
      setConversations(prev => {
        const exists = prev.find(c => c.id === msg.conversation.id)
        if (exists) {
          const updated = prev.map(c => c.id === msg.conversation.id
            ? { ...c,
                // Merge all fields from server (including status if conversation was reopened)
                ...msg.conversation,
                unread_count: activeId === c.id ? 0 : (c.unread_count || 0) + 1
              }
            : c)
          const target = updated.find(c => c.id === msg.conversation.id)
          const rest = updated.filter(c => c.id !== msg.conversation.id)
          return [target, ...rest]
        }
        return [{ ...msg.conversation, unread_count: 1 }, ...prev]
      })
    }

    if (msg.type === 'message_edit' && msg.message) {
      const m = msg.message
      if (convListeners.current[m.conversation_id]) {
        convListeners.current[m.conversation_id]({ type:'edit', id: m.id, body: m.body })
      }
    }

    if (msg.type === 'message' && msg.message) {
      const cid = msg.message.conversation_id
      // Deliver to open conversation panel via ref (not stale closure)
      if (convListeners.current[cid]) convListeners.current[cid](msg.message)
      // Update conversation list — move to top
      setConversations(prev => {
        const m = msg.message
        const body = m.body || (['image','video','document','audio','sticker'].includes(m.type) ? '[mídia]' : '')
        const updated = prev.map(c => c.id === cid
          ? { ...c,
              last_message: body || '[mídia]',
              last_message_at: m.created_at,
              last_message_id: m.id,
              last_message_type: m.type,
              unread_count: activeId === cid ? 0 : (c.unread_count || 0) + 1
            }
          : c)
        const target = updated.find(c => c.id === cid)
        if (!target) return updated
        const rest = updated.filter(c => c.id !== cid)
        return [target, ...rest]
      })
    }

    if (msg.type === 'conversation_update') {
      setConversations(prev => prev.map(c =>
        c.id === msg.conversationId ? { ...c, ...msg } : c
      ))
    }
  }, []) // no dependencies — uses refs only

  const wsToken = localStorage.getItem('vrx_token') || ''
  const { subscribeConv, unsubscribeConv } = useWS(wsToken, handleWS)

  const onNewMessage = useCallback((convId, cb) => {
    convListeners.current[convId] = cb
    return () => { delete convListeners.current[convId] }
  }, [])

  const openConv = conv => {
    if (activeConvRef.current) unsubscribeConv(activeConvRef.current.id)
    activeConvRef.current = conv
    setActiveConv(conv)
    subscribeConv(conv.id)
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
  }

  const onUpdate = (convId, changes) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, ...changes } : c))
    setActiveConv(prev => prev?.id === convId ? { ...prev, ...changes } : prev)
    if (activeConvRef.current?.id === convId) activeConvRef.current = { ...activeConvRef.current, ...changes }
  }

  const filtered = conversations.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (filterDept && String(c.department_id) !== String(filterDept)) return false
    return true
  })

  const queueCount = conversations.filter(c => c.status === 'queue').length
  const activeCount = conversations.filter(c => c.status === 'active').length
  const unreadTotal = conversations.reduce((s, c) => s + (c.unread_count || 0), 0)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontWeight: 800, fontSize: '1.05rem' }}>
              WhatsApp CRM
              {unreadTotal > 0 && (
                <span style={{ marginLeft: 8, background: '#10b981', color: '#fff', borderRadius: 99, fontSize: '.7rem', padding: '1px 7px', fontWeight: 700 }}>{unreadTotal}</span>
              )}
            </h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={syncContacts} disabled={syncing}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px 6px',
                  borderRadius: 6, fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'color .15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                title="Sincronizar contatos">
                {syncing
                  ? <Spinner size={14} />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                }
              </button>
              <button onClick={() => setNewConvModal(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px 6px',
                  borderRadius: 6, transition: 'color .15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                title="Nova conversa">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button onClick={() => setSettingsModal(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px 6px',
                  borderRadius: 6, transition: 'color .15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                title="Configurações">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[{ l: 'Fila', v: queueCount, c: '#f59e0b' }, { l: 'Ativos', v: activeCount, c: '#10b981' }].map(k => (
              <div key={k.l} style={{ flex: 1, padding: '6px 8px', background: 'var(--bg-card2)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: k.c }}>{k.v}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{k.l}</div>
              </div>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar contato..."
            style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: '.85rem', outline: 'none', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[{ v: '', l: 'Todos' }, { v: 'queue', l: 'Fila' }, { v: 'active', l: 'Ativos' }, { v: 'bot', l: 'Bot' }, { v: 'closed', l: 'Fechados' }].map(f => (
              <button key={f.v} onClick={() => setFilterStatus(f.v)}
                style={{ padding: '3px 8px', borderRadius: 99, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (filterStatus === f.v ? 'var(--primary)' : STATUS_COLOR[f.v] || 'var(--border)'),
                  background: filterStatus === f.v ? 'var(--primary)' : 'transparent',
                  color: filterStatus === f.v ? '#fff' : STATUS_COLOR[f.v] || 'var(--muted)' }}>
                {f.l}
              </button>
            ))}
          </div>
          {departments.length > 0 && (
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              style={{ marginTop: 6, width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', padding: '5px 8px', fontSize: '.8rem', outline: 'none' }}>
              <option value="">Todos departamentos</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {allTags.length > 0 && (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
              style={{ marginTop: 6, width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', padding: '5px 8px', fontSize: '.8rem', outline: 'none' }}>
              <option value="">Todas as tags</option>
              {allTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><Spinner /></div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <p style={{ color: 'var(--danger)', fontSize: '.85rem', marginBottom: 8 }}>{loadError}</p>
              <button onClick={() => loadConversations()} style={{ padding: '6px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '.82rem' }}>Tentar novamente</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.85rem', padding: 24 }}>
              <p>Nenhuma conversa</p>
              {!hasConnectedInstance && instances.length > 0 && (
                <p style={{ marginTop: 8, fontSize: '.78rem' }}>Conecte uma instância nas Configurações (ícone ⚙️)</p>
              )}
              {instances.length === 0 && (
                <p style={{ marginTop: 8, fontSize: '.78rem' }}>Crie e conecte uma instância nas Configurações</p>
              )}
            </div>
          ) : (
            filtered.map(c => (
              <ConvItem key={c.id} conv={c} active={activeConv?.id === c.id} onClick={() => openConv(c)} />
            ))
          )}
        </div>
      </div>

      {/* Área principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeConv ? (
          <ConversationPanel key={activeConv.id} conv={activeConv} onUpdate={onUpdate}
            allTags={allTags} onNewMessage={onNewMessage}
            onNewConv={newConv => {
              setConversations(prev => [newConv, ...prev])
              openConv(newConv)
            }} />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: .4 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>WhatsApp CRM</div>
            <div style={{ fontSize: '.88rem', opacity: .6 }}>Selecione uma conversa para começar</div>
          </div>
        )}
      </div>

      <NewConvModal open={newConvModal} onClose={() => setNewConvModal(false)}
        onCreated={conv => { setNewConvModal(false); setConversations(prev => [conv, ...prev]); openConv(conv) }} />

      <Modal open={settingsModal} onClose={() => setSettingsModal(false)} title="Configurações WhatsApp" width={580}>
        <WaSettings onClose={() => setSettingsModal(false)} />
      </Modal>
    </div>
  )
}
