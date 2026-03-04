import { useEffect, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader, Card, Btn, Input, Select, Modal, Table, Badge, Spinner } from '../components/UI'

const MODULES = [
  { key:'dashboard', label:'📊 Dashboard'    },
  { key:'products',  label:'📦 Produtos'     },
  { key:'stock',     label:'🔄 Estoque'      },
  { key:'orders',    label:'🛒 Pedidos'      },
  { key:'clients',   label:'👥 Clientes'     },
  { key:'crm',       label:'🎯 CRM'          },
  { key:'financial', label:'💰 Financeiro'   },
  { key:'settings',  label:'⚙️ Configurações' },
]

const DEFAULT_PERMS = { dashboard:true,products:true,stock:true,orders:true,clients:true,crm:true,financial:true,settings:false }

export default function Settings() {
  const { user } = useAuth()
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [userModal, setUserModal]   = useState(false)
  const [pwModal, setPwModal]       = useState(false)
  const [resetModal, setResetModal] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [editId, setEditId]         = useState(null)
  const [userForm, setUserForm]     = useState({ name:'', email:'', password:'', role:'user', permissions:{...DEFAULT_PERMS} })
  const [pwForm, setPwForm]         = useState({ current:'', newPassword:'', confirm:'' })
  const [resetPw, setResetPw]       = useState({ newPassword:'', confirm:'' })
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState('')

  const loadUsers = () => {
    if (user?.role !== 'admin') return
    setLoading(true)
    api.get('/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { loadUsers() }, [])

  const openNewUser = () => {
    setUserForm({ name:'', email:'', password:'', role:'user', permissions:{...DEFAULT_PERMS} })
    setEditId(null); setUserModal(true)
  }

  const openEditUser = row => {
    setUserForm({ name:row.name, email:row.email, password:'', role:row.role, active:row.active,
      permissions: row.permissions || {...DEFAULT_PERMS} })
    setEditId(row.id); setUserModal(true)
  }

  const openResetPw = (e, row) => {
    e.stopPropagation()
    setResetTarget(row)
    setResetPw({ newPassword:'', confirm:'' })
    setResetModal(true)
  }

  const togglePerm = key => {
    if (userForm.role === 'admin') return
    setUserForm(p => ({...p, permissions:{...p.permissions,[key]:!p.permissions[key]}}))
  }

  const setRole = role => {
    if (role === 'admin') {
      const allPerms = Object.fromEntries(MODULES.map(m=>[m.key,true]))
      setUserForm(p => ({...p, role, permissions:allPerms}))
    } else {
      setUserForm(p => ({...p, role}))
    }
  }

  const saveUser = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/users/${editId}`, userForm)
      else        await api.post('/users', userForm)
      setUserModal(false); loadUsers()
      setMsg(editId ? '✅ Usuário atualizado!' : '✅ Usuário criado! Ele deverá trocar a senha no primeiro login.')
      setTimeout(() => setMsg(''), 4000)
    } catch(err) { alert(err.response?.data?.error || 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const changePw = async e => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirm) return alert('As senhas não conferem')
    if (pwForm.newPassword.length < 8) return alert('Mínimo 8 caracteres')
    setSaving(true)
    try {
      await api.post('/auth/change-password', { current:pwForm.current, newPassword:pwForm.newPassword })
      setMsg('✅ Senha alterada com sucesso!')
      setPwModal(false)
      setPwForm({ current:'', newPassword:'', confirm:'' })
      setTimeout(() => setMsg(''), 4000)
    } catch(err) { alert(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const doResetPw = async e => {
    e.preventDefault()
    if (resetPw.newPassword !== resetPw.confirm) return alert('As senhas não conferem')
    if (resetPw.newPassword.length < 8) return alert('Mínimo 8 caracteres')
    setSaving(true)
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { newPassword: resetPw.newPassword })
      setMsg(`✅ Senha de ${resetTarget.name} redefinida! Ele deverá trocá-la no próximo login.`)
      setResetModal(false)
      setTimeout(() => setMsg(''), 5000)
    } catch(err) { alert(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const userCols = [
    { key:'name',  label:'Nome'  },
    { key:'email', label:'Email' },
    { key:'role',  label:'Perfil', render: v => <Badge color={v==='admin'?'#b44fff':v==='manager'?'#6366f1':'#6b7280'}>{v}</Badge> },
    { key:'active', label:'Status', render: v => <Badge color={v?'#10b981':'#ef4444'}>{v?'Ativo':'Inativo'}</Badge> },
    { key:'permissions', label:'Acessos', render: v => {
      if (!v) return '—'
      const count = Object.values(v).filter(Boolean).length
      return <span style={{ fontSize:'.78rem', color:'var(--muted)' }}>{count}/{MODULES.length} módulos</span>
    }},
    { key:'id', label:'Ações', render:(_,row) => (
      <div style={{ display:'flex', gap:6 }}>
        <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();openEditUser(row)}}>✏️ Editar</Btn>
        <Btn size="sm" variant="warning" onClick={e=>openResetPw(e,row)}>🔑 Senha</Btn>
        {row.id !== user?.id && (
          <Btn size="sm" variant={row.active?'danger':'success'}
            onClick={e=>{e.stopPropagation();api.put(`/users/${row.id}`,{...row,active:!row.active}).then(loadUsers)}}>
            {row.active?'Desativar':'Ativar'}
          </Btn>
        )}
      </div>
    )}
  ]

  return (
    <div>
      <PageHeader title="⚙️ Configurações" subtitle="Usuários, permissões e preferências"/>

      {msg && (
        <div style={{ background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.3)', borderRadius:9, padding:'12px 16px', marginBottom:16, color:'#10b981' }}>
          {msg}
        </div>
      )}

      {/* Minha conta */}
      <Card style={{ marginBottom:16 }}>
        <h3 style={{ fontWeight:700, marginBottom:16 }}>👤 Minha conta</h3>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:16 }}>
          <div><div style={{ fontSize:'.75rem', color:'var(--muted)', marginBottom:4 }}>Nome</div><div style={{ fontWeight:600 }}>{user?.name}</div></div>
          <div><div style={{ fontSize:'.75rem', color:'var(--muted)', marginBottom:4 }}>Email</div><div>{user?.email}</div></div>
          <div><div style={{ fontSize:'.75rem', color:'var(--muted)', marginBottom:4 }}>Perfil</div><Badge color={user?.role==='admin'?'#b44fff':'#6366f1'}>{user?.role}</Badge></div>
        </div>
        <Btn variant="secondary" onClick={()=>setPwModal(true)}>🔒 Alterar minha senha</Btn>
      </Card>

      {/* White-label */}
      <Card style={{ marginBottom:16 }}>
        <h3 style={{ fontWeight:700, marginBottom:12 }}>🎨 Identidade visual (white-label)</h3>
        <p style={{ color:'var(--muted)', fontSize:'.88rem', marginBottom:12 }}>
          Configurado via variáveis de ambiente no arquivo <code style={{ background:'var(--bg-card2)', padding:'2px 6px', borderRadius:4, color:'var(--primary)' }}>.env</code> ao subir o container.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
          {[
            { key:'VITE_COMPANY_NAME',    label:'Nome',     val:import.meta.env.VITE_COMPANY_NAME||'Vortexys' },
            { key:'VITE_PRIMARY_COLOR',   label:'Cor 1',    val:import.meta.env.VITE_PRIMARY_COLOR||'#b44fff' },
            { key:'VITE_SECONDARY_COLOR', label:'Cor 2',    val:import.meta.env.VITE_SECONDARY_COLOR||'#ff6b2b' },
            { key:'VITE_LOGO_URL',        label:'Logo URL', val:import.meta.env.VITE_LOGO_URL||'(padrão)' },
          ].map(item=>(
            <div key={item.key} style={{ background:'var(--bg-card2)', borderRadius:8, padding:'12px' }}>
              <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:4 }}>{item.label}</div>
              <div style={{ fontWeight:600, fontSize:'.9rem', display:'flex', alignItems:'center', gap:6 }}>
                {item.key.includes('COLOR') && <span style={{ width:14,height:14,borderRadius:3,background:item.val,display:'inline-block',border:'1px solid var(--border)' }}/>}
                {item.val}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Usuários + permissões */}
      {user?.role === 'admin' && (
        <Card>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <h3 style={{ fontWeight:700 }}>👥 Usuários e permissões</h3>
              <p style={{ fontSize:'.8rem', color:'var(--muted)', marginTop:4 }}>
                Novos usuários são obrigados a trocar a senha no primeiro login.
              </p>
            </div>
            <Btn size="sm" onClick={openNewUser}>+ Novo usuário</Btn>
          </div>
          {loading ? <Spinner/> : <Table columns={userCols} data={users} onRow={openEditUser}/>}
        </Card>
      )}

      {/* Modal criar/editar usuário */}
      <Modal open={userModal} onClose={()=>setUserModal(false)} title={editId?'Editar usuário':'Novo usuário'} width={540}>
        <form onSubmit={saveUser} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Nome *" value={userForm.name} onChange={e=>setUserForm(p=>({...p,name:e.target.value}))} required/>
            <Input label="E-mail *" type="email" value={userForm.email} onChange={e=>setUserForm(p=>({...p,email:e.target.value}))} required/>
          </div>
          {!editId && (
            <Input label="Senha inicial * (mín. 8 caracteres)" type="password"
              value={userForm.password} onChange={e=>setUserForm(p=>({...p,password:e.target.value}))} required/>
          )}
          <Select label="Perfil" value={userForm.role} onChange={e=>setRole(e.target.value)}>
            <option value="user">Usuário</option>
            <option value="manager">Gerente</option>
            <option value="admin">Admin (acesso total)</option>
          </Select>

          <div>
            <label style={{ fontSize:'.78rem', fontWeight:600, color:'var(--muted)', display:'block', marginBottom:10 }}>
              Acesso por módulo {userForm.role==='admin' && <span style={{ color:'#10b981' }}>— admin tem acesso total</span>}
            </label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {MODULES.map(m => (
                <label key={m.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                  background:'var(--bg-card2)', borderRadius:8, cursor:userForm.role==='admin'?'not-allowed':'pointer',
                  border:`1px solid ${userForm.permissions[m.key]?'var(--primary)':'var(--border)'}` }}>
                  <input type="checkbox" checked={userForm.permissions[m.key]||false}
                    onChange={()=>togglePerm(m.key)} disabled={userForm.role==='admin'}/>
                  <span style={{ fontSize:'.88rem' }}>{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setUserModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal alterar MINHA senha */}
      <Modal open={pwModal} onClose={()=>setPwModal(false)} title="🔒 Alterar minha senha">
        <form onSubmit={changePw} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Input label="Senha atual *"          type="password" value={pwForm.current}     onChange={e=>setPwForm(p=>({...p,current:e.target.value}))}     required/>
          <Input label="Nova senha *"           type="password" value={pwForm.newPassword} onChange={e=>setPwForm(p=>({...p,newPassword:e.target.value}))} required/>
          <Input label="Confirmar nova senha *" type="password" value={pwForm.confirm}     onChange={e=>setPwForm(p=>({...p,confirm:e.target.value}))}     required/>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setPwModal(false)}>Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving?'Salvando...':'Alterar senha'}</Btn>
          </div>
        </form>
      </Modal>

      {/* Modal reset de senha pelo admin */}
      <Modal open={resetModal} onClose={()=>setResetModal(false)} title={`🔑 Redefinir senha — ${resetTarget?.name}`}>
        <p style={{ color:'var(--muted)', fontSize:'.88rem', marginBottom:16 }}>
          O usuário será obrigado a trocar a senha no próximo login.
        </p>
        <form onSubmit={doResetPw} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Input label="Nova senha * (mín. 8 caracteres)" type="password"
            value={resetPw.newPassword} onChange={e=>setResetPw(p=>({...p,newPassword:e.target.value}))} required/>
          <Input label="Confirmar nova senha *" type="password"
            value={resetPw.confirm} onChange={e=>setResetPw(p=>({...p,confirm:e.target.value}))} required/>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Btn variant="ghost" onClick={()=>setResetModal(false)}>Cancelar</Btn>
            <Btn type="submit" variant="warning" disabled={saving}>{saving?'Salvando...':'Redefinir senha'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
