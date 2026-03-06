/**
 * PDV — Ponto de Venda para caixa.
 *
 * FLUXO OPERACIONAL:
 * 1. Contexto (cliente, vendedor) — compacto no topo
 * 2. Itens — área principal: busca/bipagem + lista de itens
 * 3. Resumo + pagamento — lateral fixa
 * 4. Ações: Salvar rascunho | Finalizar venda
 * 5. Impressão automática (ePOS se configurado, senão window.print)
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Printer, Trash2, ShoppingCart, Loader2, Save, Settings2 } from 'lucide-react'
import api from '../services/api'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { Btn, Input, Autocomplete, fmt } from '../components/UI'
import { printReceipt, getPrinterConfig, setPrinterConfig } from '../utils/receiptPrint'

const PAY_METHODS = [
  { v: 'pix', l: 'PIX' },
  { v: 'dinheiro', l: 'Dinheiro' },
  { v: 'debito', l: 'Débito' },
  { v: 'credito', l: 'Crédito' },
]

export default function PDV() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { company } = useTheme()
  const searchRef = useRef(null)

  const [items, setItems] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [clientLabel, setClientLabel] = useState('')
  const [clientId, setClientId] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [sellerLabel, setSellerLabel] = useState('')
  const [discount, setDiscount] = useState('0')
  const [saving, setSaving] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)
  const [showPrinterConfig, setShowPrinterConfig] = useState(false)
  const [printerIp, setPrinterIp] = useState(getPrinterConfig().ip || '')
  const [creditBalance, setCreditBalance] = useState(0)
  const [useCredit, setUseCredit] = useState(false)

  const fetchProducts = useCallback(q =>
    api.get(`/products/search?q=${encodeURIComponent(q)}`).then(r => r.data), [])
  const fetchClients = useCallback(q =>
    api.get(`/clients/search?q=${encodeURIComponent(q)}`).then(r => r.data), [])
  const fetchSellers = useCallback(q =>
    api.get(`/sellers/search?q=${encodeURIComponent(q)}`).then(r => r.data), [])

  const addProduct = (p) => {
    const qty = parseFloat(p.quantity) || 1
    const price = parseFloat(p.sale_price) || 0
    const existing = items.find(i => i.product_id === p.id && !i.unit_id)
    if (existing) {
      setItems(items.map(i =>
        i === existing ? { ...i, quantity: (parseFloat(i.quantity) || 1) + qty } : i
      ))
    } else {
      setItems([...items, {
        product_id: p.id,
        product_label: p.name,
        quantity: qty,
        unit_price: price,
        discount: 0,
        controls_imei: !!p.controls_imei,
        unit_id: null,
      }])
    }
    toast.success(`${p.name} adicionado`)
    searchRef.current?.focus?.()
  }

  const setItemQty = (idx, qty) => {
    const n = Math.max(1, parseInt(String(qty), 10) || 1)
    const next = [...items]
    next[idx] = { ...next[idx], quantity: n }
    setItems(next)
  }

  const setItemPrice = (idx, price) => {
    const next = [...items]
    next[idx] = { ...next[idx], unit_price: String(price) }
    setItems(next)
  }

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx))

  const subtotal = items.reduce((s, it) =>
    s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0), 0)
  const disc = parseFloat(discount) || 0
  const total = Math.max(0, subtotal - disc)
  const credAmount = useCredit && creditBalance > 0 ? Math.min(total, creditBalance) : 0
  const rest = Math.max(0, total - credAmount)

  const buildReceiptData = useCallback((order, paymentsOverride) => {
    const dateStr = order?.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')
    const client = clientLabel || (clientId ? 'Cliente' : 'Consumidor final')
    const orderItems = (order?.items || items).map(it => ({
      product_name: it.product_name || it.product_label,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total: (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0) - (parseFloat(it.discount) || 0),
    }))
    const payments = paymentsOverride || [{ method: paymentMethod, amount: total }]
    return {
      company: company || 'Loja',
      number: order?.number || '',
      date: dateStr,
      client,
      items: orderItems,
      subtotal,
      discount: disc,
      total,
      payments,
    }
  }, [company, clientLabel, clientId, items, paymentMethod, subtotal, disc, total])

  const doPrint = useCallback(async (order, paymentsOverride) => {
    try {
      const data = buildReceiptData(order, paymentsOverride)
      await printReceipt(data)
    } catch (e) {
      toast.error(e.message || 'Erro ao imprimir')
      throw e
    }
  }, [buildReceiptData, toast])

  const saveDraft = async () => {
    if (!items.length) return toast.error('Adicione pelo menos um item')
    const payload = {
      walk_in: !clientId,
      client_id: clientId || null,
      seller_id: sellerId || null,
      channel: 'balcao',
      operation_type: 'order',
      items: items.map(it => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price, discount: it.discount || 0, unit_id: it.unit_id || null })),
      discount: disc,
      shipping: 0,
      surcharge: 0,
      payment_methods: [],
      fiscal_type: '',
      fiscal_notes: '',
    }
    setSaving(true)
    try {
      const { data } = await api.post('/orders', payload)
      toast.success(`Rascunho salvo: ${data.number}`)
      setLastOrder(data)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const finalize = async () => {
    if (!items.length) return toast.error('Adicione pelo menos um item')
    if (useCredit && !clientId) return toast.error('Crédito da loja requer cliente cadastrado')
    if (useCredit && creditBalance < 0.01) return toast.error('Cliente sem saldo de crédito')
    const payMethods = []
    if (credAmount > 0) payMethods.push({ method: 'credito_loja', amount: String(credAmount.toFixed(2)), installments: 1, notes: '' })
    if (rest > 0) payMethods.push({ method: paymentMethod, amount: String(rest.toFixed(2)), installments: 1, notes: '' })
    if (payMethods.length === 0) payMethods.push({ method: paymentMethod, amount: String(total.toFixed(2)), installments: 1, notes: '' })
    const payload = {
      walk_in: !clientId,
      client_id: clientId || null,
      seller_id: sellerId || null,
      channel: 'balcao',
      operation_type: 'direct_sale',
      items: items.map(it => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price, discount: it.discount || 0, unit_id: it.unit_id || null })),
      discount: disc,
      shipping: 0,
      surcharge: 0,
      payment_methods: payMethods,
      fiscal_type: '',
      fiscal_notes: '',
    }
    setSaving(true)
    try {
      let order
      if (lastOrder?.id) {
        await api.put(`/orders/${lastOrder.id}`, payload)
        order = { id: lastOrder.id }
      } else {
        const { data } = await api.post('/orders', payload)
        order = data
      }
      await api.patch(`/orders/${order.id}/status`, { status: 'confirmed' })
      const full = await api.get(`/orders/${order.id}`).then(r => r.data)
      order = { ...order, number: full.number, items: full.items, created_at: full.created_at }
      try {
        await doPrint({ ...order, items: full.items, number: order.number }, payMethods)
      } catch {
        toast.error('Venda concluída, mas falha na impressão. Use "Segunda via" nos pedidos.')
      }
      setItems([])
      setClientLabel('')
      setClientId('')
      setUseCredit(false)
      setLastOrder(null)
      setDiscount('0')
      toast.success(`Venda finalizada: ${order.number}`)
      searchRef.current?.focus?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao finalizar')
    } finally {
      setSaving(false)
    }
  }

  const savePrinterConfig = () => {
    setPrinterConfig(printerIp.trim())
    setShowPrinterConfig(false)
    toast.success(printerIp.trim() ? 'Impressora configurada' : 'Impressora removida')
  }

  const loadClientCredits = useCallback(async () => {
    if (!clientId) { setCreditBalance(0); setUseCredit(false); return }
    try {
      const { data } = await api.get(`/credits/client/${clientId}`)
      const bal = parseFloat(data.summary?.total_available) || 0
      setCreditBalance(bal)
      if (bal <= 0) setUseCredit(false)
    } catch {
      setCreditBalance(0)
      setUseCredit(false)
    }
  }, [clientId])

  useEffect(() => { loadClientCredits() }, [loadClientCredits])

  // Pré-preenche ao vir de Clientes com Crédito
  const prefillHandled = useRef(false)
  const location = useLocation()
  useEffect(() => {
    const state = location.state
    if (!state?.prefillClient) { prefillHandled.current = false; return }
    if (prefillHandled.current) return
    prefillHandled.current = true
    setClientId(state.prefillClient.id)
    setClientLabel(state.prefillClient.name)
    if (state.prefillCredit && (parseFloat(state.creditBalance || 0) > 0)) {
      setCreditBalance(parseFloat(state.creditBalance))
      setUseCredit(true)
    }
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    searchRef.current?.focus?.()
  }, [])

  const { useEpos } = getPrinterConfig()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── TOPO: contexto da venda (compacto) ───────────────────────────────── */}
      <header style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={20} />
            PDV
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 160 }}>
              <Autocomplete
                value={{ label: clientLabel }}
                fetchFn={fetchClients}
                onSelect={c => { setClientId(c.id); setClientLabel(c.name) }}
                renderOption={c => <div><strong>{c.name}</strong><br /><span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{c.document || c.phone || ''}</span></div>}
                placeholder="Cliente"
                minQueryLength={1}
              />
            </div>
            <div style={{ width: 130 }}>
              <Autocomplete
                value={{ label: sellerLabel }}
                fetchFn={fetchSellers}
                onSelect={s => { setSellerId(s.id); setSellerLabel(s.name) }}
                renderOption={s => <div><strong>{s.name}</strong></div>}
                placeholder="Vendedor"
                minQueryLength={1}
              />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/orders')}>Pedidos</Btn>
          <button
            onClick={() => setShowPrinterConfig(!showPrinterConfig)}
            title="Configurar impressora"
            style={{ padding: 6, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {showPrinterConfig && (
        <div style={{ padding: '12px 20px', background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>IP da impressora (ePOS):</span>
          <input
            value={printerIp}
            onChange={e => setPrinterIp(e.target.value)}
            placeholder="Ex: 192.168.1.100"
            style={{ width: 140, padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '.85rem' }}
          />
          <Btn size="sm" onClick={savePrinterConfig}>Salvar</Btn>
          <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
            {useEpos ? 'Impressão direta ativa' : 'Vazio = usa impressora do sistema'}
          </span>
        </div>
      )}

      {/* ── CORPO: itens (protagonista) + resumo ────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Área principal: busca + lista de itens */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          overflow: 'hidden',
          minWidth: 0,
        }}>
          {/* Busca — sempre visível, foco principal */}
          <div style={{
            marginBottom: 12,
            padding: 12,
            background: 'var(--bg-card)',
            borderRadius: 10,
            border: '2px solid var(--border)',
          }}>
            <label style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Código de barras · SKU · Nome
            </label>
            <Autocomplete
              inputRef={searchRef}
              value={{ label: '' }}
              fetchFn={fetchProducts}
              minQueryLength={1}
              clearOnSelect
              placeholder="Bipe ou digite..."
              onSelect={addProduct}
              renderOption={p => (
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                    SKU: {p.sku} · Est: {fmt.num(p.stock_quantity)} · {fmt.brl(p.sale_price)}
                  </div>
                </div>
              )}
            />
          </div>

          {/* Lista de itens — protagonista */}
          <div style={{
            flex: 1,
            background: 'var(--bg-card)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            overflow: 'auto',
            minHeight: 200,
          }}>
            {items.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: '.95rem' }}>
                Carrinho vazio. Busque ou bipe produtos acima.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 700, color: 'var(--muted)', fontSize: '.72rem', textTransform: 'uppercase' }}>Produto</th>
                    <th style={{ width: 70, padding: '12px 8px', fontWeight: 700, color: 'var(--muted)', fontSize: '.72rem' }}>Qtd</th>
                    <th style={{ width: 100, padding: '12px 8px', fontWeight: 700, color: 'var(--muted)', fontSize: '.72rem' }}>Unit.</th>
                    <th style={{ width: 100, padding: '12px 14px', fontWeight: 700, color: 'var(--muted)', fontSize: '.72rem', textAlign: 'right' }}>Subtotal</th>
                    <th style={{ width: 44, padding: '12px 8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600 }}>{(it.product_label || '').substring(0, 45)}</div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={e => setItemQty(i, e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '.9rem' }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={it.unit_price}
                          onChange={e => setItemPrice(i, e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '.9rem' }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>
                        {fmt.brl((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0))}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          style={{
                            width: 36, height: 36, borderRadius: 8, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                            color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* Lateral: resumo + pagamento + ações */}
        <aside style={{
          width: 300,
          flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-card2)',
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
        }}>
          {/* Total — destaque máximo */}
          <div style={{
            marginBottom: 20,
            padding: 20,
            background: 'var(--bg-card)',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 4 }}>Subtotal</div>
            <div style={{ fontSize: '1rem', marginBottom: 8 }}>{fmt.brl(subtotal)}</div>
            {disc > 0 && (
              <>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Desconto</div>
                <div style={{ fontSize: '.9rem', color: 'var(--danger)' }}>-{fmt.brl(disc)}</div>
              </>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid var(--border)' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Total</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {fmt.brl(total)}
              </div>
            </div>
          </div>

          <Input
            label="Desconto (R$)"
            type="number"
            step="0.01"
            value={discount}
            onChange={e => setDiscount(e.target.value)}
            style={{ marginBottom: 16 }}
          />

          {clientId && creditBalance > 0 && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: 'rgba(16,185,129,.08)',
              borderRadius: 10,
              border: '1px solid rgba(16,185,129,.25)',
            }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Crédito disponível: {fmt.brl(creditBalance)}</div>
              <Btn
                size="sm"
                variant={useCredit ? 'primary' : 'ghost'}
                onClick={() => setUseCredit(!useCredit)}
                style={useCredit ? { background: '#10b981', borderColor: '#10b981' } : {}}
              >
                {useCredit ? '✓ Usando crédito' : 'Usar crédito da loja'}
              </Btn>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Pagamento{useCredit && credAmount > 0 ? ` (restante: ${fmt.brl(rest)})` : ''}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PAY_METHODS.map(m => (
                <Btn
                  key={m.v}
                  size="sm"
                  variant={paymentMethod === m.v ? 'primary' : 'ghost'}
                  onClick={() => setPaymentMethod(m.v)}
                >
                  {m.l}
                </Btn>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Ações */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Btn variant="outline" onClick={saveDraft} disabled={saving || !items.length} style={{ justifyContent: 'center' }}>
              <Save size={16} style={{ marginRight: 8 }} />Salvar rascunho
            </Btn>
            <Btn onClick={finalize} disabled={saving || !items.length} style={{ justifyContent: 'center', padding: 14 }}>
              {saving ? <><Loader2 size={18} style={{ marginRight: 8, animation: 'spin 0.7s linear infinite' }} />Finalizando...</> : <><Printer size={18} style={{ marginRight: 8 }} />Finalizar e imprimir</>}
            </Btn>
          </div>
        </aside>
      </div>
    </div>
  )
}
