import { useEffect, useState, useRef, useCallback } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Btn, Modal, Input, Select, Badge, Spinner, fmt } from '../components/UI'

const STATUS_LABEL = { bot:'🤖 Bot', queue:'⏳ Fila', active:'✅ Ativo', closed:'🔒 Fechado' }
const STATUS_COLOR = { bot:'#8b5cf6', queue:'#f59e0b', active:'#10b981', closed:'#6b7280' }

// ─── WebSocket hook ────────────────────────────────────────────────────────
function useWS(userId, onMessage) {
  const ws = useRef(null)
  const reconnect = useRef(null)

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host  = window.location.host
    ws.current  = new WebSocket(`${proto}://${host}/ws?userId=${userId}`)
    ws.current.onmessage = e => { try { onMessage(JSON.parse(e.data)) } catch {} }
    ws.current.onclose = () => { reconnect.current = setTimeout(connect, 3000) }
    ws.current.onopen = () => {
      clearTimeout(reconnect.current)
      ws.current.send(JSON.stringify({ type:'subscribe', room:'inbox' }))
    }
  }, [userId, onMessage])

  const subscribeConv = id => ws.current?.readyState === 1 &&
    ws.current.send(JSON.stringify({ type:'subscribe', room:`conversation:${id}` }))
  const unsubscribeConv = id => ws.current?.readyState === 1 &&
    ws.current.send(JSON.stringify({ type:'unsubscribe', room:`conversation:${id}` }))

  useEffect(() => {
    connect()
    return () => { clearTimeout(reconnect.current); ws.current?.close() }
  }, [connect])

  return { subscribeConv, unsubscribeConv }
}

// ─── Avatar ──────────────────────────────────────────────────────────────
function Avatar({ name, size=38 }) {
  const initials = (name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
  const hue = [...(name||'')].reduce((h,c)=>h+c.charCodeAt(0),0) % 360
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`hsl(${hue},60%,50%)`, display:'flex', alignItems:'center',
      justifyContent:'center', color:'#fff', fontSize:size*.38+'px', fontWeight:700 }}>
      {initials}
    </div>
  )
}

// ─── Bubble de mensagem ────────────────────────────────────────────────────
function MessageBubble({ msg, onQuote }) {
  const isOut = msg.direction === 'out'
  const isBot = msg.is_bot

  const renderMedia = () => {
    const src = msg.media_base64 || msg.media_url
    if (!src && msg.type === 'text') return null
    if (!src) return <div style={{ fontSize:'.8rem', opacity:.6, fontStyle:'italic' }}>[{msg.type}]</div>

    if (msg.type === 'image')
      return <img src={src} alt="imagem" style={{ maxWidth:220, maxHeight:180, borderRadius:8, display:'block', marginBottom:4, cursor:'pointer' }} onClick={()=>window.open(src,'_blank')}/>
    if (msg.type === 'audio' || msg.type === 'ptt')
      return <audio controls src={src} style={{ width:220, marginBottom:4 }}/>
    if (msg.type === 'video')
      return <video controls src={src} style={{ maxWidth:220, maxHeight:180, borderRadius:8, display:'block', marginBottom:4 }}/>
    if (msg.type === 'document')
      return (
        <a href={src} download={msg.media_filename} target="_blank" rel="noreferrer"
          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 10px',
            background:'rgba(255,255,255,.1)', borderRadius:8, marginBottom:4,
            color:'inherit', textDecoration:'none', fontSize:'.8rem' }}>
          📄 {msg.media_filename || 'documento'}
        </a>
      )
    if (msg.type === 'sticker')
      return <img src={src} alt="sticker" style={{ width:100, height:100 }}/>
    return null
  }

  return (
    <div style={{ display:'flex', justifyContent:isOut?'flex-end':'flex-start', marginBottom:6, gap:6 }}>
      {!isOut && <div style={{ width:28, flexShrink:0 }}/>}
      <div style={{
        maxWidth:'72%', padding:'8px 12px',
        borderRadius:isOut?'14px 14px 4px 14px':'14px 14px 14px 4px',
        background: isOut ? (isBot?'rgba(139,92,246,.7)':'var(--grad)') : 'var(--bg-card2)',
        border: isOut ? 'none' : '1px solid var(--border)',
        position:'relative',
      }}>
        {isBot && isOut && <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.7)', marginBottom:2 }}>🤖 Bot</div>}
        {msg.quoted_id && (
          <div style={{ borderLeft:'3px solid rgba(255,255,255,.5)', paddingLeft:8, marginBottom:6, fontSize:'.75rem', opacity:.8 }}>
            Respondendo...
          </div>
        )}
        {renderMedia()}
        {msg.body && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'sticker' && (
          <div style={{ fontSize:'.88rem', lineHeight:1.4, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {msg.body}
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:4, marginTop:3 }}>
          <span style={{ fontSize:'.65rem', opacity:.6 }}>
            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}
          </span>
          {isOut && (
            <span style={{ fontSize:'.7rem', opacity:.7 }}>
              {msg.status==='read'?'✓✓':msg.status==='delivered'?'✓✓':'✓'}
            </span>
          )}
        </div>
        <button onClick={()=>onQuote(msg)}
          style={{ position:'absolute', top:4, right:isOut?'auto':4, left:isOut?4:'auto',
            background:'none', border:'none', color:'inherit', cursor:'pointer', opacity:0,
            fontSize:'.75rem', padding:'2px 4px', borderRadius:4 }}
          className="quote-btn">↩</button>
      </div>
    </div>
  )
}

// ─── Tags da conversa ──────────────────────────────────────────────────────
function ConvTags({ convId, allTags }) {
  const [tags, setTags] = useState([])

  useEffect(() => {
    api.get(`/whatsapp/conversations/${convId}/tags`).then(r => setTags(r.data)).catch(()=>{})
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
    <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
      {tags.map(t => (
        <span key={t.id} style={{ background:t.color+'22', border:`1px solid ${t.color}`, color:t.color,
          borderRadius:99, fontSize:'.68rem', fontWeight:700, padding:'2px 8px', cursor:'pointer',
          display:'flex', alignItems:'center', gap:3 }}
          onClick={() => remove(t.id)}>
          {t.name} ×
        </span>
      ))}
      {available.length > 0 && (
        <select onChange={e => { if(e.target.value) { add(parseInt(e.target.value)); e.target.value=''; }}}
          style={{ fontSize:'.7rem', background:'var(--bg-card2)', border:'1px solid var(--border)',
            color:'var(--muted)', borderRadius:99, padding:'2px 6px', cursor:'pointer', outline:'none' }}>
          <option value="">+ tag</option>
          {available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </div>
  )
}

// ─── Painel de conversa ────────────────────────────────────────────────────
function ConversationPanel({ conv, onUpdate, allTags, onNewMessage }) {
  const { user } = useAuth()
  const [messages, setMessages]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [quoted, setQuoted]       = useState(null)
  const [quickReplies, setQuickReplies] = useState([])
  const [sending, setSending]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [agents, setAgents]       = useState([])
  const bottomRef = useRef()
  const inputRef  = useRef()
  const fileRef   = useRef()

  const loadMessages = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/whatsapp/conversations/${conv.id}/messages?limit=100`)
      setMessages(r.data)
      api.patch(`/whatsapp/conversations/${conv.id}/read`).catch(()=>{})
    } finally { setLoading(false) }
  }

  useEffect(() => {
    loadMessages()
    api.get('/users').then(r => setAgents(r.data || [])).catch(()=>{})
  }, [conv.id])

  // Scroll automático
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  // Recebe nova mensagem via WebSocket
  useEffect(() => {
    if (!onNewMessage) return
    const unsub = onNewMessage(conv.id, msg => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id || (msg.wa_message_id && m.wa_message_id === msg.wa_message_id))) return prev
        return [...prev, msg]
      })
      bottomRef.current?.scrollIntoView({ behavior:'smooth' })
    })
    return unsub
  }, [conv.id, onNewMessage])

  // Atalhos
  useEffect(() => {
    if (!text.startsWith('/')) { setQuickReplies([]); return }
    api.get(`/whatsapp/quick-replies?q=${encodeURIComponent(text)}&department_id=${conv.department_id||''}`)
      .then(r => setQuickReplies(r.data)).catch(() => setQuickReplies([]))
  }, [text])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const r = await api.post(`/whatsapp/conversations/${conv.id}/messages`, {
        text: text.trim(), quotedId: quoted?.id || null
      })
      setMessages(prev => [...prev, r.data])
      setText(''); setQuoted(null)
      onUpdate(conv.id, { lastMessage: text.trim(), status:'active' })
    } catch(e) { alert(e.response?.data?.error||'Erro ao enviar') }
    finally { setSending(false) }
  }

  const sendFile = async e => {
    const file = e.target.files[0]
    if (!file) return
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
        mediatype, media: base64, mimetype: file.type, fileName: file.name, caption: ''
      })
      setMessages(prev => [...prev, r.data])
    } catch(e) { alert(e.response?.data?.error||'Erro ao enviar arquivo') }
    finally { setUploading(false); if(fileRef.current) fileRef.current.value = '' }
  }

  const createLead = async () => {
    try {
      const r = await api.post(`/whatsapp/conversations/${conv.id}/create-lead`)
      if (r.data.existing) alert('Lead já existe no CRM!')
      else alert('Lead criado no CRM com sucesso! 🎯')
    } catch(e) { alert(e.response?.data?.error||'Erro') }
  }

  const applyQuickReply = qr => { setText(qr.body); setQuickReplies([]); inputRef.current?.focus() }
  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    if (e.key === 'Escape') { setQuoted(null); setQuickReplies([]) }
  }

  const canSend = conv.status !== 'closed' && conv.status !== 'bot'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg-card)',
        display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0, gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <Avatar name={conv.contact_name || conv.contact_phone} size={38}/>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:'.95rem' }}>{conv.contact_name || conv.contact_phone}</div>
            <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>
              {conv.contact_name && <span>{conv.contact_phone} · </span>}
              <span style={{ color: STATUS_COLOR[conv.status], fontWeight:600 }}>{STATUS_LABEL[conv.status]}</span>
              {conv.dept_name && <> · <span style={{ color:conv.dept_color }}>{conv.dept_name}</span></>}
              {conv.agent_name && <> · <span style={{ color:'var(--primary)' }}>👤 {conv.agent_name}</span></>}
            </div>
            <ConvTags convId={conv.id} allTags={allTags}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:4, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
          <Btn size="sm" variant="ghost" onClick={createLead} title="Criar lead no CRM">🎯 CRM</Btn>
          {conv.status !== 'active' && conv.status !== 'closed' && (
            <Btn size="sm" variant="success" onClick={async ()=>{
              await api.patch(`/whatsapp/conversations/${conv.id}/assign`,{ userId: user.id })
              onUpdate(conv.id,{status:'active', agent_name: user.name})
            }}>⚡ Assumir</Btn>
          )}
          {agents.length > 1 && conv.status !== 'closed' && (
            <select onChange={async e => {
              if (!e.target.value) return
              await api.patch(`/whatsapp/conversations/${conv.id}/assign`, { userId: parseInt(e.target.value) })
              const ag = agents.find(a => a.id === parseInt(e.target.value))
              onUpdate(conv.id, { status:'active', agent_name: ag?.name })
              e.target.value = ''
            }} style={{ fontSize:'.75rem', background:'var(--bg-card2)', border:'1px solid var(--border)',
              color:'var(--text)', borderRadius:6, padding:'4px 6px', outline:'none', cursor:'pointer' }}>
              <option value="">👥 Atribuir...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {conv.status !== 'closed' && (
            <Btn size="sm" variant="ghost" onClick={async ()=>{
              await api.patch(`/whatsapp/conversations/${conv.id}/close`)
              onUpdate(conv.id,{status:'closed'})
            }}>🔒 Fechar</Btn>
          )}
          {conv.status === 'closed' && (
            <Btn size="sm" variant="ghost" onClick={async ()=>{
              await api.patch(`/whatsapp/conversations/${conv.id}/reopen`)
              onUpdate(conv.id,{status:'queue'})
            }}>🔓 Reabrir</Btn>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 12px', background:'var(--bg)' }}>
        <style>{`.quote-btn:hover { opacity: 1 !important; }`}</style>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><Spinner/></div>
        ) : messages.length === 0 ? (
          <p style={{ textAlign:'center', color:'var(--muted)', fontSize:'.88rem', paddingTop:40 }}>
            Nenhuma mensagem ainda
          </p>
        ) : (
          messages.map((m,i) => <MessageBubble key={m.id||m.wa_message_id||i} msg={m} onQuote={setQuoted}/>)
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Bot ativo */}
      {conv.status === 'bot' && (
        <div style={{ padding:'8px 16px', background:'rgba(139,92,246,.15)', borderTop:'1px solid rgba(139,92,246,.3)',
          fontSize:'.82rem', color:'#8b5cf6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>🤖 Bot está respondendo. Você pode acompanhar e assumir a qualquer momento.</span>
          <Btn size="sm" style={{ background:'#8b5cf6', color:'#fff' }} onClick={async ()=>{
            await api.patch(`/whatsapp/conversations/${conv.id}/assign`,{ userId: user.id })
            onUpdate(conv.id,{status:'active'})
          }}>Assumir agora</Btn>
        </div>
      )}

      {/* Citação */}
      {quoted && (
        <div style={{ padding:'8px 16px', background:'var(--bg-card2)', borderTop:'1px solid var(--border)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:'.8rem' }}>
            <span style={{ color:'var(--primary)', fontWeight:600 }}>Respondendo: </span>
            <span style={{ color:'var(--muted)' }}>{quoted.body?.substring(0,60) || '[mídia]'}...</span>
          </div>
          <button onClick={()=>setQuoted(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>×</button>
        </div>
      )}

      {/* Atalhos rápidos */}
      {quickReplies.length > 0 && (
        <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg-card)', maxHeight:180, overflowY:'auto' }}>
          {quickReplies.map(qr => (
            <div key={qr.id} onClick={()=>applyQuickReply(qr)}
              style={{ padding:'8px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)' }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-card2)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{ fontWeight:700, color:'var(--primary)', fontSize:'.82rem', marginRight:8 }}>{qr.shortcut}</span>
              <span style={{ fontSize:'.78rem', color:'var(--muted)' }}>{qr.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      {canSend ? (
        <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', background:'var(--bg-card)',
          display:'flex', gap:8, alignItems:'flex-end', flexShrink:0 }}>
          <button onClick={()=>fileRef.current.click()} disabled={uploading}
            style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1.3rem', padding:'6px', flexShrink:0 }}>
            {uploading ? '⏳' : '📎'}
          </button>
          <input ref={fileRef} type="file" style={{ display:'none' }} onChange={sendFile}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"/>
          <textarea ref={inputRef} value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={handleKeyDown} rows={1} placeholder="Digite uma mensagem... (/ para atalhos)"
            style={{ flex:1, background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:10,
              color:'var(--text)', padding:'9px 12px', fontSize:'.9rem', outline:'none', resize:'none',
              maxHeight:120, fontFamily:'inherit', lineHeight:1.4 }}
            onInput={e=>{ e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px' }}
          />
          <Btn onClick={send} disabled={!text.trim()||sending} style={{ flexShrink:0 }}>
            {sending ? '⏳' : '▶'}
          </Btn>
        </div>
      ) : (
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', background:'var(--bg-card)',
          textAlign:'center', fontSize:'.82rem', color:'var(--muted)' }}>
          {conv.status === 'bot' ? '🤖 Aguardando bot...' : '🔒 Conversa fechada'}
        </div>
      )}
    </div>
  )
}

// ─── Item de conversa na lista ─────────────────────────────────────────────
function ConvItem({ conv, active, onClick }) {
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
    : ''
  return (
    <div onClick={onClick}
      style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)',
        background: active ? 'rgba(180,79,255,.12)' : 'transparent',
        borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
        transition:'background .15s' }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='var(--bg-card2)' }}
      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        <Avatar name={conv.contact_name||conv.contact_phone} size={36}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, fontSize:'.88rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {conv.contact_name || conv.contact_phone}
            </span>
            <span style={{ fontSize:'.68rem', color:'var(--muted)', flexShrink:0, marginLeft:4 }}>{time}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:2 }}>
            <span style={{ fontSize:'.78rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
              {conv.last_message || 'Sem mensagens'}
            </span>
            {conv.unread_count > 0 && (
              <span style={{ background:'#10b981', color:'#fff', borderRadius:99, fontSize:'.65rem',
                padding:'1px 6px', fontWeight:700, flexShrink:0, marginLeft:4 }}>{conv.unread_count}</span>
            )}
          </div>
          <div style={{ display:'flex', gap:4, marginTop:3, alignItems:'center' }}>
            <span style={{ fontSize:'.65rem', color: STATUS_COLOR[conv.status], fontWeight:600 }}>
              {STATUS_LABEL[conv.status]}
            </span>
            {conv.dept_name && (
              <span style={{ fontSize:'.65rem', color:conv.dept_color, fontWeight:600 }}>· {conv.dept_name}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Settings WhatsApp ─────────────────────────────────────────────────────
function WaSettings({ onClose }) {
  const [tab, setTab] = useState('instances')
  const [instances, setInstances] = useState([])
  const [departments, setDepartments] = useState([])
  const [quickReplies, setQR] = useState([])
  const [tags, setTags] = useState([])
  const [qrCode, setQrCode] = useState(null)
  const [qrInstId, setQrInstId] = useState(null)
  const [newInst, setNewInst] = useState('')
  const [newDept, setNewDept] = useState({ name:'', color:'#6366f1' })
  const [newQR, setNewQR] = useState({ shortcut:'', title:'', body:'' })
  const [newTag, setNewTag] = useState({ name:'', color:'#6366f1' })
  const [saving, setSaving] = useState(false)
  const pollRef = useRef()

  useEffect(() => {
    api.get('/whatsapp/instances').then(r=>setInstances(r.data)).catch(()=>{})
    api.get('/whatsapp/departments').then(r=>setDepartments(r.data)).catch(()=>{})
    api.get('/whatsapp/quick-replies').then(r=>setQR(r.data)).catch(()=>{})
    api.get('/whatsapp/tags').then(r=>setTags(r.data)).catch(()=>{})
    return () => clearInterval(pollRef.current)
  }, [])

  const startPolling = id => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/whatsapp/instances/${id}/status`)
        const st = r.data.status
        setInstances(prev => prev.map(i => i.id===id ? {...i, status:st} : i))
        if (st === 'connected') { clearInterval(pollRef.current); setQrCode(null); setQrInstId(null) }
      } catch {}
    }, 3000)
  }

  const connectInst = async id => {
    try {
      const r = await api.post(`/whatsapp/instances/${id}/connect`)
      if (r.data.qrCode) { setQrCode(r.data.qrCode); setQrInstId(id) }
      setInstances(prev => prev.map(i => i.id===id ? {...i, status: r.data.status||i.status} : i))
      startPolling(id)
    } catch(e) { alert(e.response?.data?.error||'Erro ao conectar') }
  }

  const deleteInst = async id => {
    if (!confirm('Excluir esta instância?')) return
    try {
      await api.delete(`/whatsapp/instances/${id}`)
      setInstances(prev => prev.filter(i => i.id !== id))
      if (qrInstId === id) { setQrCode(null); setQrInstId(null) }
    } catch(e) { alert(e.response?.data?.error||'Erro ao excluir') }
  }

  const createInst = async () => {
    if (!newInst.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/whatsapp/instances', { name: newInst.toLowerCase().trim() })
      setInstances(prev=>[...prev,r.data]); setNewInst('')
    } catch(e) { alert(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const createDept = async () => {
    if (!newDept.name.trim()) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/departments', newDept)
      setDepartments(prev=>[...prev,r.data]); setNewDept({ name:'', color:'#6366f1' })
    } catch(e) { alert(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const createQR = async () => {
    if (!newQR.shortcut||!newQR.body) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/quick-replies', newQR)
      setQR(prev=>[...prev,r.data]); setNewQR({ shortcut:'', title:'', body:'' })
    } catch(e) { alert(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const createTag = async () => {
    if (!newTag.name.trim()) return; setSaving(true)
    try {
      const r = await api.post('/whatsapp/tags', newTag)
      setTags(prev=>[...prev,r.data]); setNewTag({ name:'', color:'#6366f1' })
    } catch(e) { alert(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  const delQR = async id => {
    if(!confirm('Excluir atalho?')) return
    await api.delete(`/whatsapp/quick-replies/${id}`)
    setQR(prev=>prev.filter(q=>q.id!==id))
  }

  const statusColor = { connected:'#10b981', disconnected:'#ef4444', qr_code:'#f59e0b', connecting:'#f59e0b' }
  const statusLabel = { connected:'✅ conectado', disconnected:'🔴 desconectado', qr_code:'📱 aguardando QR', connecting:'🟡 conectando' }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['instances','📱 Instâncias'],['departments','🏢 Departamentos'],['quickreplies','⚡ Atalhos'],['tags','🏷️ Tags']].map(([t,l])=>(
          <Btn key={t} size="sm" variant={tab===t?'primary':'ghost'} onClick={()=>setTab(t)}>{l}</Btn>
        ))}
      </div>

      {tab==='instances' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', gap:8 }}>
            <Input label="Nome da instância" value={newInst} onChange={e=>setNewInst(e.target.value)} style={{ flex:1 }} placeholder="ex: principal"/>
            <div style={{ alignSelf:'flex-end' }}><Btn size="sm" onClick={createInst} disabled={saving}>+ Criar</Btn></div>
          </div>
          {qrCode && (
            <div style={{ textAlign:'center', padding:16, background:'#fff', borderRadius:12 }}>
              <p style={{ color:'#000', fontSize:'.85rem', marginBottom:8 }}>Escaneie o QR Code no WhatsApp</p>
              <img src={qrCode} alt="QR Code" style={{ width:220, height:220 }}/>
            </div>
          )}
          {instances.map(i=>(
            <div key={i.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 14px', background:'var(--bg-card2)', borderRadius:8,
              border:`1px solid ${i.status==='connected'?'#10b981':'var(--border)'}` }}>
              <div>
                <span style={{ fontWeight:600 }}>{i.name}</span>
                {i.phone && <span style={{ fontSize:'.78rem', color:'var(--muted)', marginLeft:8 }}>{i.phone}</span>}
                <div style={{ fontSize:'.75rem', marginTop:2 }}>
                  <span style={{ color: statusColor[i.status]||'var(--muted)', fontWeight:600 }}>
                    {statusLabel[i.status] || i.status}
                  </span>
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {i.status !== 'connected' && <Btn size="sm" variant="success" onClick={()=>connectInst(i.id)}>📱 Conectar</Btn>}
                <Btn size="sm" variant="danger" onClick={()=>deleteInst(i.id)}>🗑️</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==='departments' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'flex-end' }}>
            <Input label="Nome" value={newDept.name} onChange={e=>setNewDept(p=>({...p,name:e.target.value}))}/>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Cor</label>
              <input type="color" value={newDept.color} onChange={e=>setNewDept(p=>({...p,color:e.target.value}))}
                style={{ width:42, height:36, padding:2, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer' }}/>
            </div>
            <Btn size="sm" onClick={createDept} disabled={saving}>+</Btn>
          </div>
          {departments.map(d=>(
            <div key={d.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
              background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
              <span style={{ width:12, height:12, borderRadius:3, background:d.color, flexShrink:0 }}/>
              <span style={{ fontWeight:600, flex:1 }}>{d.name}</span>
              <span style={{ fontSize:'.75rem', color:'var(--muted)' }}>{d.description||''}</span>
            </div>
          ))}
        </div>
      )}

      {tab==='quickreplies' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <Input label="Atalho (ex: /ola)" value={newQR.shortcut} onChange={e=>setNewQR(p=>({...p,shortcut:e.target.value}))} placeholder="/atalho"/>
            <Input label="Título" value={newQR.title} onChange={e=>setNewQR(p=>({...p,title:e.target.value}))}/>
          </div>
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Mensagem *</label>
            <textarea value={newQR.body} onChange={e=>setNewQR(p=>({...p,body:e.target.value}))} rows={3}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)', borderRadius:8,
                color:'var(--text)', padding:'8px 12px', fontSize:'.88rem', outline:'none', resize:'vertical' }}/>
          </div>
          <Btn size="sm" onClick={createQR} disabled={saving}>+ Adicionar atalho</Btn>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
            {quickReplies.map(qr=>(
              <div key={qr.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                padding:'8px 12px', background:'var(--bg-card2)', borderRadius:8, border:'1px solid var(--border)' }}>
                <div style={{ flex:1 }}>
                  <span style={{ fontWeight:700, color:'var(--primary)', fontSize:'.82rem' }}>{qr.shortcut}</span>
                  <span style={{ fontSize:'.78rem', color:'var(--muted)', marginLeft:8 }}>{qr.title}</span>
                  <div style={{ fontSize:'.8rem', color:'var(--text)', marginTop:3, opacity:.85 }}>
                    {qr.body.substring(0,80)}{qr.body.length>80?'...':''}
                  </div>
                </div>
                <Btn size="sm" variant="danger" onClick={()=>delQR(qr.id)} style={{ marginLeft:8 }}>🗑</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==='tags' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'flex-end' }}>
            <Input label="Nome da tag" value={newTag.name} onChange={e=>setNewTag(p=>({...p,name:e.target.value}))}/>
            <div>
              <label style={{ fontSize:'.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Cor</label>
              <input type="color" value={newTag.color} onChange={e=>setNewTag(p=>({...p,color:e.target.value}))}
                style={{ width:42, height:36, padding:2, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer' }}/>
            </div>
            <Btn size="sm" onClick={createTag} disabled={saving}>+</Btn>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {tags.map(t=>(
              <span key={t.id} style={{ background:t.color+'22', border:`1px solid ${t.color}`, color:t.color,
                borderRadius:99, fontSize:'.82rem', fontWeight:700, padding:'4px 12px' }}>{t.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal nova conversa ─────────────────────────────────────────────────
function NewConvModal({ open, onClose, onCreated }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [departments, setDepartments] = useState([])
  const [deptId, setDeptId] = useState('')
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (open) {
      api.get('/whatsapp/departments').then(r=>setDepartments(r.data)).catch(()=>{})
      setSearch(''); setResults([]); setPhone(''); setName('')
    }
  }, [open])

  useEffect(() => {
    clearTimeout(timer.current)
    if (search.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/whatsapp/contacts/search?q=${encodeURIComponent(search)}`)
        setResults(r.data)
      } catch {}
    }, 300)
  }, [search])

  const selectContact = c => {
    setPhone((c.phone||'').replace(/\D/g,''))
    setName(c.name||'')
    setSearch('')
    setResults([])
  }

  const create = async () => {
    if (!phone) return
    setSaving(true)
    try {
      const r = await api.post('/whatsapp/conversations/new', { phone, name, departmentId: deptId||null })
      onCreated(r.data)
    } catch(e) { alert(e.response?.data?.error||'Erro') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="✏️ Nova conversa" width={420}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ position:'relative' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 Buscar cliente, lead ou contato..."
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)',
              borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.88rem', outline:'none' }}/>
          {results.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg-card)',
              border:'1px solid var(--border)', borderRadius:8, zIndex:20, maxHeight:200, overflowY:'auto', marginTop:2 }}>
              {results.map((r,i) => (
                <div key={i} onClick={()=>selectContact(r)}
                  style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                    display:'flex', justifyContent:'space-between', alignItems:'center' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-card2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'.88rem' }}>{r.name}</div>
                    <div style={{ fontSize:'.75rem', color:'var(--muted)' }}>{r.phone}</div>
                  </div>
                  <span style={{ fontSize:'.68rem', color:'var(--muted)', background:'var(--bg-card2)',
                    padding:'2px 6px', borderRadius:99 }}>
                    {r.type === 'client' ? '👤 Cliente' : r.type === 'lead' ? '🎯 Lead' : '💬 Conv'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={{ fontSize:'.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Telefone (com DDD, sem espaços) *</label>
          <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}
            placeholder="5511999999999"
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)',
              borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.88rem', outline:'none' }}/>
        </div>
        <div>
          <label style={{ fontSize:'.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Nome do contato</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="Nome (opcional)"
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)',
              borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.88rem', outline:'none' }}/>
        </div>
        {departments.length > 0 && (
          <div>
            <label style={{ fontSize:'.75rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Departamento</label>
            <select value={deptId} onChange={e=>setDeptId(e.target.value)}
              style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)',
                borderRadius:8, color:'var(--text)', padding:'9px 12px', fontSize:'.88rem', outline:'none' }}>
              <option value="">Sem departamento</option>
              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={create} disabled={!phone||saving}>{saving?'Criando...':'Iniciar conversa'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────
export default function WhatsAppCRM() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv]       = useState(null)
  const [loading, setLoading]             = useState(true)
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterDept, setFilterDept]       = useState('')
  const [departments, setDepartments]     = useState([])
  const [allTags, setAllTags]             = useState([])
  const [search, setSearch]               = useState('')
  const [settingsModal, setSettingsModal] = useState(false)
  const [newConvModal, setNewConvModal]   = useState(false)
  // Mapa de callbacks para mensagens em tempo real por conv
  const convListeners = useRef({})

  const loadConversations = useCallback(async () => {
    const p = new URLSearchParams()
    if (filterStatus) p.set('status', filterStatus)
    if (filterDept)   p.set('department_id', filterDept)
    if (search)       p.set('search', search)
    try {
      const r = await api.get(`/whatsapp/conversations?${p}`)
      setConversations(r.data)
    } finally { setLoading(false) }
  }, [filterStatus, filterDept, search])

  useEffect(() => {
    loadConversations()
    api.get('/whatsapp/departments').then(r=>setDepartments(r.data)).catch(()=>{})
    api.get('/whatsapp/tags').then(r=>setAllTags(r.data)).catch(()=>{})
  }, [loadConversations])

  // Handler WebSocket
  const handleWS = useCallback(msg => {
    if (msg.type === 'new_message' && msg.conversation) {
      setConversations(prev => {
        const exists = prev.find(c => c.id === msg.conversation.id)
        if (exists) {
          return prev.map(c => c.id === msg.conversation.id
            ? { ...c, last_message: msg.conversation.last_message,
                last_message_at: msg.conversation.last_message_at,
                unread_count: activeConv?.id === c.id ? 0 : (c.unread_count||0)+1 }
            : c)
        }
        return [msg.conversation, ...prev]
      })
    }
    if (msg.type === 'message' && msg.message) {
      // Entrega a mensagem ao painel aberto
      const cid = msg.message.conversation_id
      if (convListeners.current[cid]) convListeners.current[cid](msg.message)
      setConversations(prev => prev.map(c => c.id === cid
        ? { ...c, last_message: msg.message.body||'[mídia]', last_message_at: msg.message.created_at,
            unread_count: activeConv?.id === cid ? 0 : (c.unread_count||0)+1 }
        : c))
    }
    if (msg.type === 'conversation_update') {
      setConversations(prev => prev.map(c =>
        c.id === msg.conversationId ? { ...c, ...msg } : c
      ))
    }
  }, [activeConv])

  const { subscribeConv, unsubscribeConv } = useWS(user?.id, handleWS)

  // Função para ConversationPanel se registrar para receber msgs
  const onNewMessage = useCallback((convId, cb) => {
    convListeners.current[convId] = cb
    return () => { delete convListeners.current[convId] }
  }, [])

  const openConv = conv => {
    if (activeConv) unsubscribeConv(activeConv.id)
    setActiveConv(conv)
    subscribeConv(conv.id)
    setConversations(prev => prev.map(c => c.id===conv.id ? {...c, unread_count:0} : c))
  }

  const onUpdate = (convId, changes) => {
    setConversations(prev => prev.map(c => c.id===convId ? {...c,...changes} : c))
    if (activeConv?.id === convId) setActiveConv(prev => ({...prev,...changes}))
  }

  const filtered = conversations.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (filterDept && String(c.department_id) !== String(filterDept)) return false
    if (search) {
      const s = search.toLowerCase()
      return (c.contact_name||'').toLowerCase().includes(s) || c.contact_phone.includes(s)
    }
    return true
  })

  const queueCount  = conversations.filter(c=>c.status==='queue').length
  const activeCount = conversations.filter(c=>c.status==='active').length
  const unreadTotal = conversations.reduce((s,c)=>s+(c.unread_count||0), 0)

  return (
    <div style={{ display:'flex', height:'calc(100vh - 60px)', overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:320, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--bg-card)' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <h2 style={{ fontWeight:800, fontSize:'1.05rem' }}>
              💬 WhatsApp
              {unreadTotal > 0 && (
                <span style={{ marginLeft:8, background:'#10b981', color:'#fff', borderRadius:99, fontSize:'.7rem', padding:'1px 7px', fontWeight:700 }}>{unreadTotal}</span>
              )}
            </h2>
            <Btn size="sm" variant="primary" onClick={()=>setNewConvModal(true)}>✏️</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setSettingsModal(true)}>⚙️</Btn>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            {[{l:'Fila',v:queueCount,c:'#f59e0b'},{l:'Ativos',v:activeCount,c:'#10b981'}].map(k=>(
              <div key={k.l} style={{ flex:1, padding:'6px 8px', background:'var(--bg-card2)', borderRadius:8, textAlign:'center' }}>
                <div style={{ fontSize:'1.1rem', fontWeight:800, color:k.c }}>{k.v}</div>
                <div style={{ fontSize:'.7rem', color:'var(--muted)' }}>{k.l}</div>
              </div>
            ))}
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 Buscar contato..."
            style={{ width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)',
              borderRadius:8, color:'var(--text)', padding:'7px 10px', fontSize:'.85rem', outline:'none', marginBottom:8 }}/>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {[{v:'',l:'Todos'},{v:'queue',l:'Fila'},{v:'active',l:'Ativos'},{v:'bot',l:'Bot'},{v:'closed',l:'Fechados'}].map(f=>(
              <button key={f.v} onClick={()=>setFilterStatus(f.v)}
                style={{ padding:'3px 8px', borderRadius:99, fontSize:'.72rem', fontWeight:600, cursor:'pointer',
                  border:'1px solid '+(filterStatus===f.v?'var(--primary)':STATUS_COLOR[f.v]||'var(--border)'),
                  background: filterStatus===f.v ? 'var(--primary)' : 'transparent',
                  color: filterStatus===f.v ? '#fff' : STATUS_COLOR[f.v]||'var(--muted)' }}>
                {f.l}
              </button>
            ))}
          </div>
          {departments.length > 0 && (
            <select value={filterDept} onChange={e=>setFilterDept(e.target.value)}
              style={{ marginTop:6, width:'100%', background:'var(--bg-card2)', border:'1px solid var(--border)',
                borderRadius:8, color:'var(--text)', padding:'5px 8px', fontSize:'.8rem', outline:'none' }}>
              <option value="">Todos departamentos</option>
              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><Spinner/></div>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign:'center', color:'var(--muted)', fontSize:'.85rem', padding:24 }}>Nenhuma conversa</p>
          ) : (
            filtered.map(c => (
              <ConvItem key={c.id} conv={c} active={activeConv?.id===c.id} onClick={()=>openConv(c)}/>
            ))
          )}
        </div>
      </div>

      {/* Área principal */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {activeConv ? (
          <ConversationPanel key={activeConv.id} conv={activeConv} onUpdate={onUpdate}
            allTags={allTags} onNewMessage={onNewMessage}/>
        ) : (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
            <div style={{ fontSize:'4rem', marginBottom:16 }}>💬</div>
            <div style={{ fontSize:'1.1rem', fontWeight:700, marginBottom:8 }}>Vortexys WhatsApp CRM</div>
            <div style={{ fontSize:'.88rem', opacity:.7 }}>Selecione uma conversa para começar</div>
          </div>
        )}
      </div>

      <NewConvModal open={newConvModal} onClose={()=>setNewConvModal(false)}
        onCreated={conv=>{ setNewConvModal(false); setConversations(prev=>[conv,...prev]); openConv(conv) }}/>

      <Modal open={settingsModal} onClose={()=>setSettingsModal(false)} title="⚙️ Configurações WhatsApp" width={580}>
        <WaSettings onClose={()=>setSettingsModal(false)}/>
      </Modal>
    </div>
  )
}
