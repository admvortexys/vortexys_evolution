import { useEffect, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader, Card, Btn, Input, Select, Modal, Table, Badge, Spinner } from '../components/UI'

const MODULE_GROUPS = [
  {
    label: 'Principal',
    items: [
      { key: 'dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { key: 'pdv', label: 'PDV Caixa' },
      { key: 'products', label: 'Produtos' },
      { key: 'stock', label: 'Estoque' },
      { key: 'orders', label: 'Pedidos' },
      { key: 'returns', label: 'Devoluções' },
      { key: 'client_credits', label: 'Clientes com crédito' },
    ],
  },
  {
    label: 'Pessoas',
    items: [
      { key: 'clients', label: 'Clientes' },
      { key: 'suppliers', label: 'Fornecedores' },
      { key: 'sellers', label: 'Vendedores' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { key: 'crm', label: 'CRM' },
      { key: 'calendar', label: 'Agenda' },
    ],
  },
  {
    label: 'Serviços',
    items: [
      { key: 'service_orders', label: 'Assistência' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { key: 'financial', label: 'Contas a pagar' },
      { key: 'cash_flow_projection', label: 'Fluxo de caixa projetado' },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { key: 'whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'settings', label: 'Configurações' },
    ],
  },
]

const MODULES = Array.from(
  new Map(
    MODULE_GROUPS
      .flatMap(group => group.items || [])
      .map(item => [item.key, item])
  ).values()
)

const DEFAULT_PERMS = {
  dashboard: true,
  pdv: true,
  products: true,
  stock: true,
  orders: true,
  returns: true,
  client_credits: true,
  clients: true,
  suppliers: true,
  sellers: true,
  crm: true,
  calendar: true,
  service_orders: true,
  financial: true,
  cash_flow_projection: true,
  whatsapp: true,
  settings: false,
  can_authorize_discount: false,
  discount_limit_pct: 10,
}

export default function Settings() {
  const { user } = useAuth()
  const { refreshTheme } = useTheme()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [userModal, setUserModal] = useState(false)
  const [pwModal, setPwModal] = useState(false)
  const [resetModal, setResetModal] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [editId, setEditId] = useState(null)
  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'user',
    permissions: { ...DEFAULT_PERMS },
  })
  const [pwForm, setPwForm] = useState({ current: '', newPassword: '', confirm: '' })
  const [resetPw, setResetPw] = useState({ newPassword: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [themeForm, setThemeForm] = useState({
    company_name: '',
    primary_color: '',
    secondary_color: '',
    logo_url: '',
  })
  const [themeLoading, setThemeLoading] = useState(true)
  const { toast } = useToast()

  const loadUsers = () => {
    if (user?.role !== 'admin') return
    setLoading(true)
    api.get('/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    api.get('/settings/theme').then(r => {
      const d = r.data
      setThemeForm({
        company_name: d.company_name || '',
        primary_color: d.primary_color || '#a855f7',
        secondary_color: d.secondary_color || '#f97316',
        logo_url: d.logo_url || '',
      })
    }).catch(() => {}).finally(() => setThemeLoading(false))
  }, [])

  const saveTheme = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await api.put('/settings/theme', themeForm)
      refreshTheme(data)
      setMsg('Identidade visual atualizada!')
      setTimeout(() => setMsg(''), 4000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const openNewUser = () => {
    setUserForm({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'user',
      permissions: { ...DEFAULT_PERMS },
    })
    setEditId(null)
    setUserModal(true)
  }

  const openEditUser = (row) => {
    setUserForm({
      name: row.name,
      username: row.username || '',
      email: row.email || '',
      password: '',
      role: row.role,
      active: row.active,
      permissions: { ...DEFAULT_PERMS, ...(row.permissions || {}) },
    })
    setEditId(row.id)
    setUserModal(true)
  }

  const openResetPw = (e, row) => {
    e.stopPropagation()
    setResetTarget(row)
    setResetPw({ newPassword: '', confirm: '' })
    setResetModal(true)
  }

  const togglePerm = (key) => {
    if (userForm.role === 'admin') return
    setUserForm(p => ({
      ...p,
      permissions: { ...p.permissions, [key]: !p.permissions[key] },
    }))
  }

  const setRole = (role) => {
    if (role === 'admin') {
      const allPerms = Object.fromEntries(MODULES.map(m => [m.key, true]))
      setUserForm(p => ({
        ...p,
        role,
        permissions: {
          ...p.permissions,
          ...allPerms,
          can_authorize_discount: true,
          discount_limit_pct: 100,
        },
      }))
      return
    }

    setUserForm(p => ({
      ...p,
      role,
      permissions: { ...DEFAULT_PERMS, ...p.permissions },
    }))
  }

  const saveUser = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) await api.put(`/users/${editId}`, userForm)
      else await api.post('/users', userForm)
      setUserModal(false)
      loadUsers()
      setMsg(editId ? 'Usu\u00e1rio atualizado!' : 'Usu\u00e1rio criado! Ele dever\u00e1 trocar a senha no primeiro login.')
      setTimeout(() => setMsg(''), 4000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const changePw = async (e) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('As senhas n\u00e3o conferem')
    if (pwForm.newPassword.length < 8) return toast.error('M\u00ednimo 8 caracteres')
    setSaving(true)
    try {
      await api.post('/auth/change-password', {
        current: pwForm.current,
        newPassword: pwForm.newPassword,
      })
      setMsg('Senha alterada com sucesso!')
      setPwModal(false)
      setPwForm({ current: '', newPassword: '', confirm: '' })
      setTimeout(() => setMsg(''), 4000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const doResetPw = async (e) => {
    e.preventDefault()
    if (resetPw.newPassword !== resetPw.confirm) return toast.error('As senhas n\u00e3o conferem')
    if (resetPw.newPassword.length < 8) return toast.error('M\u00ednimo 8 caracteres')
    setSaving(true)
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { newPassword: resetPw.newPassword })
      setMsg(`Senha de ${resetTarget.name} redefinida! Ele dever\u00e1 troc\u00e1-la no pr\u00f3ximo login.`)
      setResetModal(false)
      setTimeout(() => setMsg(''), 5000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const userCols = [
    { key: 'name', label: 'Nome' },
    { key: 'username', label: 'Usu\u00e1rio' },
    { key: 'email', label: 'Email', render: v => v || '-' },
    {
      key: 'role',
      label: 'Perfil',
      render: v => <Badge color={v === 'admin' ? '#b44fff' : v === 'manager' ? '#6366f1' : '#6b7280'}>{v}</Badge>,
    },
    {
      key: 'active',
      label: 'Status',
      render: v => <Badge color={v ? '#10b981' : '#ef4444'}>{v ? 'Ativo' : 'Inativo'}</Badge>,
    },
    {
      key: 'permissions',
      label: 'Acessos',
      render: v => {
        if (!v) return '-'
        const count = MODULES.filter(m => v[m.key]).length
        return <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{`${count}/${MODULES.length} módulos`}</span>
      },
    },
    {
      key: 'id',
      label: 'A\u00e7\u00f5es',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); openEditUser(row) }}>Editar</Btn>
          <Btn size="sm" variant="warning" onClick={e => openResetPw(e, row)}>Senha</Btn>
          {row.id !== user?.id && (
            <Btn
              size="sm"
              variant={row.active ? 'danger' : 'success'}
              onClick={e => {
                e.stopPropagation()
                api.put(`/users/${row.id}`, { ...row, active: !row.active }).then(loadUsers)
              }}
            >
              {row.active ? 'Desativar' : 'Ativar'}
            </Btn>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ minWidth: 0 }}>
      <PageHeader
        title={'Configura\u00e7\u00f5es'}
        subtitle={'Usu\u00e1rios, permiss\u00f5es e prefer\u00eancias'}
        icon={SettingsIcon}
      />

      {msg && (
        <div style={{ background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 9, padding: '12px 16px', marginBottom: 16, color: '#10b981' }}>
          {msg}
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>{'Minha conta'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16, marginBottom: 16 }}>
          <div><div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>{'Nome'}</div><div style={{ fontWeight: 600 }}>{user?.name}</div></div>
          <div><div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>{'Usu\u00e1rio'}</div><div style={{ fontWeight: 600 }}>{user?.username || '-'}</div></div>
          <div><div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>{'Email'}</div><div>{user?.email || '-'}</div></div>
          <div><div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>{'Perfil'}</div><Badge color={user?.role === 'admin' ? '#b44fff' : '#6366f1'}>{user?.role}</Badge></div>
        </div>
        <Btn variant="secondary" onClick={() => setPwModal(true)}>{'Alterar minha senha'}</Btn>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 12 }}>{'Identidade visual (white-label)'}</h3>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: 16 }}>
          {'Personalize nome, cores e logo. As altera\u00e7\u00f5es s\u00e3o aplicadas em tempo real.'}
        </p>
        {themeLoading ? <Spinner /> : (
          <form onSubmit={saveTheme} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
            <Input label="Nome" value={themeForm.company_name} onChange={e => setThemeForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Ex: Vortexys" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{'Cor prim\u00e1ria'}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={themeForm.primary_color}
                    onChange={e => setThemeForm(p => ({ ...p, primary_color: e.target.value }))}
                    style={{ width: 44, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent' }}
                  />
                  <Input value={themeForm.primary_color} onChange={e => setThemeForm(p => ({ ...p, primary_color: e.target.value }))} placeholder="#a855f7" style={{ flex: 1 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{'Cor secund\u00e1ria'}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={themeForm.secondary_color}
                    onChange={e => setThemeForm(p => ({ ...p, secondary_color: e.target.value }))}
                    style={{ width: 44, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent' }}
                  />
                  <Input value={themeForm.secondary_color} onChange={e => setThemeForm(p => ({ ...p, secondary_color: e.target.value }))} placeholder="#f97316" style={{ flex: 1 }} />
                </div>
              </div>
            </div>
            <Input
              label={'Logo URL (deixe vazio para \u00edcone padr\u00e3o)'}
              value={themeForm.logo_url}
              onChange={e => setThemeForm(p => ({ ...p, logo_url: e.target.value }))}
              placeholder="https://..."
            />
            <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar identidade visual'}</Btn>
          </form>
        )}
      </Card>

      {user?.role === 'admin' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontWeight: 700 }}>{'Usu\u00e1rios e permiss\u00f5es'}</h3>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 4 }}>
                {'Novos usu\u00e1rios s\u00e3o obrigados a trocar a senha no primeiro login.'}
              </p>
            </div>
            <Btn size="sm" onClick={openNewUser}>{'+ Novo usu\u00e1rio'}</Btn>
          </div>
          {loading ? <Spinner /> : <Table columns={userCols} data={users} onRow={openEditUser} />}
        </Card>
      )}

      <Modal open={userModal} onClose={() => setUserModal(false)} title={editId ? 'Editar usu\u00e1rio' : 'Novo usu\u00e1rio'} width={540}>
        <form onSubmit={saveUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="Nome *" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} required />
            <Input
              label={'Usu\u00e1rio *'}
              value={userForm.username}
              onChange={e => setUserForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s+/g, '.') }))}
              placeholder="nome.usuario"
              required
            />
          </div>
          <Input label={'E-mail (opcional)'} type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="email@empresa.com" />
          {!editId && (
            <Input
              label={'Senha inicial * (m\u00edn. 8 caracteres)'}
              type="password"
              value={userForm.password}
              onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
              required
            />
          )}
          <Select label="Perfil" value={userForm.role} onChange={e => setRole(e.target.value)}>
            <option value="user">{'Usu\u00e1rio'}</option>
            <option value="manager">{'Gerente'}</option>
            <option value="admin">{'Admin (acesso total)'}</option>
          </Select>

          <div>
            <label style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 10 }}>
              {'Acesso por m\u00f3dulo '}
              {userForm.role === 'admin' && <span style={{ color: '#10b981' }}>{'- admin tem acesso total'}</span>}
            </label>
            <div style={{ display: 'grid', gap: 12 }}>
              {MODULE_GROUPS.map(group => (
                <div
                  key={group.label}
                  style={{
                    padding: '12px',
                    background: 'var(--bg-card2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: group.items?.length ? 10 : 6 }}>
                    {group.label}
                  </div>
                  {group.items?.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {group.items.map(m => (
                        <label
                          key={`${group.label}-${m.key}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            background: 'var(--bg-card)',
                            borderRadius: 8,
                            cursor: userForm.role === 'admin' ? 'not-allowed' : 'pointer',
                            border: `1px solid ${userForm.permissions[m.key] ? 'var(--primary)' : 'var(--border)'}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={userForm.permissions[m.key] || false}
                            onChange={() => togglePerm(m.key)}
                            disabled={userForm.role === 'admin'}
                          />
                          <span style={{ fontSize: '.88rem' }}>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {group.note ? (
                    <div style={{ fontSize: '.84rem', color: 'var(--muted)' }}>{group.note}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label={'Limite de desconto (%)'}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={userForm.permissions.discount_limit_pct ?? 10}
              onChange={e => setUserForm(p => ({ ...p, permissions: { ...p.permissions, discount_limit_pct: e.target.value } }))}
              disabled={userForm.role === 'admin'}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                background: 'var(--bg-card2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                marginTop: 22,
                cursor: userForm.role === 'admin' ? 'not-allowed' : 'pointer',
                opacity: userForm.role === 'admin' ? 0.7 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={!!userForm.permissions.can_authorize_discount}
                onChange={e => setUserForm(p => ({ ...p, permissions: { ...p.permissions, can_authorize_discount: e.target.checked } }))}
                disabled={userForm.role === 'admin'}
              />
              <span style={{ fontSize: '.88rem' }}>{'Pode autorizar desconto acima do limite'}</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setUserModal(false)}>{'Cancelar'}</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={pwModal} onClose={() => setPwModal(false)} title={'Alterar minha senha'}>
        <form onSubmit={changePw} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label={'Senha atual *'} type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} required />
          <Input label={'Nova senha *'} type="password" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} required />
          <Input label={'Confirmar nova senha *'} type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} required />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setPwModal(false)}>{'Cancelar'}</Btn>
            <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Alterar senha'}</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={resetModal} onClose={() => setResetModal(false)} title={`Redefinir senha - ${resetTarget?.name}`}>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: 16 }}>
          {'O usu\u00e1rio ser\u00e1 obrigado a trocar a senha no pr\u00f3ximo login.'}
        </p>
        <form onSubmit={doResetPw} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input
            label={'Nova senha * (m\u00edn. 8 caracteres)'}
            type="password"
            value={resetPw.newPassword}
            onChange={e => setResetPw(p => ({ ...p, newPassword: e.target.value }))}
            required
          />
          <Input
            label={'Confirmar nova senha *'}
            type="password"
            value={resetPw.confirm}
            onChange={e => setResetPw(p => ({ ...p, confirm: e.target.value }))}
            required
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setResetModal(false)}>{'Cancelar'}</Btn>
            <Btn type="submit" variant="warning" disabled={saving}>{saving ? 'Salvando...' : 'Redefinir senha'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  )
}
