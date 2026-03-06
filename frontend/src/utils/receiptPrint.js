/**
 * Impressão de cupom para Epson TM-T20X e similares.
 *
 * ESTRATÉGIAS (em ordem de prioridade):
 * 1. ePOS SDK — impressão direta em impressora de rede (sem diálogo)
 * 2. window.print() — fallback quando ePOS não disponível (abre diálogo do sistema)
 *
 * CONFIGURAÇÃO:
 * - localStorage vrx_pdv_printer_ip = IP da impressora (ex: 192.168.1.100)
 * - Quando configurado, usa ePOS para imprimir automaticamente
 * - Quando não configurado, usa window.print() (usuário seleciona impressora)
 */

const STORAGE_KEY = 'vrx_pdv_printer_ip'

export function getPrinterConfig() {
  try {
    const ip = localStorage.getItem(STORAGE_KEY)
    return ip ? { ip, useEpos: true } : { ip: null, useEpos: false }
  } catch {
    return { ip: null, useEpos: false }
  }
}

export function setPrinterConfig(ip) {
  if (ip && ip.trim()) {
    localStorage.setItem(STORAGE_KEY, ip.trim())
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

/**
 * Formata o cupom em HTML para impressão térmica 80mm.
 */
export function buildReceiptHtml(opts) {
  const { company = 'Loja', number = '', date = '', client = 'Consumidor final', items = [], subtotal = 0, discount = 0, total = 0, payments = [] } = opts
  const fmt = v => typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v ?? '')
  const lines = items.map(i => {
    const qty = parseFloat(i.quantity) || 1
    const up = parseFloat(i.unit_price) || 0
    const tot = parseFloat(i.total) ?? qty * up
    return `<tr><td>${(i.product_name || '').substring(0, 24)}</td><td>${qty}</td><td>${fmt(up)}</td><td>${fmt(tot)}</td></tr>`
  }).join('')
  const payLabels = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', credito_loja: 'Crédito loja', crediario: 'Crediário', voucher: 'Voucher', sinal: 'Sinal' }
  const payLines = payments.map(p => `<tr><td>${payLabels[p.method] || p.method || ''}</td><td colspan="3" style="text-align:right">${fmt(parseFloat(p.amount) || 0)}</td></tr>`).join('')

  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Cupom</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.3; color:#000; }
  @media print {
    body { width: 80mm; max-width: 80mm; margin: 0; padding: 4mm; }
    .no-print { display: none !important; }
    @page { size: 80mm auto; margin: 0; }
  }
  .receipt { width: 80mm; max-width: 80mm; padding: 4mm; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td, th { padding: 1px 2px; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
</style>
</head><body>
<div class="receipt">
  <div class="center bold" style="font-size:14px; margin-bottom:4px;">${company}</div>
  <div class="center" style="font-size:10px;">${number}</div>
  <div class="center" style="font-size:10px;">${date}</div>
  <div class="divider"></div>
  <div>Cliente: ${client}</div>
  <div class="divider"></div>
  <table>
    <tr><th style="text-align:left">Item</th><th>Qtd</th><th>Unit</th><th>Total</th></tr>
    ${lines}
  </table>
  <div class="divider"></div>
  <table>
    <tr><td>Subtotal</td><td colspan="3" class="right">${fmt(subtotal)}</td></tr>
    ${discount > 0 ? `<tr><td>Desconto</td><td colspan="3" class="right">-${fmt(discount)}</td></tr>` : ''}
    <tr class="bold"><td>TOTAL</td><td colspan="3" class="right">${fmt(total)}</td></tr>
    ${payLines}
  </table>
  <div class="divider"></div>
  <div class="center" style="font-size:10px; margin-top:8px;">Obrigado pela preferência!</div>
  <div class="center" style="font-size:10px;">---</div>
</div>
<div class="no-print" id="print-trigger"></div>
</body></html>
`
}

/**
 * Impressão via window.print() (fallback).
 * Abre iframe oculto, injeta HTML e chama print().
 * O diálogo do sistema sempre aparece — browsers não permitem impressão silenciosa por segurança.
 */
function printViaBrowser(opts) {
  return new Promise((resolve, reject) => {
    const html = buildReceiptHtml(opts)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      return reject(new Error('Não foi possível criar área de impressão'))
    }
    doc.open()
    doc.write(html)
    doc.close()
    const win = iframe.contentWindow
    win.focus()
    setTimeout(() => {
      try {
        win.print()
        setTimeout(() => {
          document.body.removeChild(iframe)
          resolve()
        }, 800)
      } catch (e) {
        document.body.removeChild(iframe)
        reject(e)
      }
    }, 150)
  })
}

/**
 * Impressão via ePOS (Epson) — direto na impressora de rede, sem diálogo.
 * Requer: impressora com ePOS habilitado, IP configurado, script ePOS carregado.
 * Carregue: <script src="https://download.epson.biz/.../epos-2.x.x.js"></script>
 */
async function printViaEpos(opts, printerIp) {
  const epson = typeof window !== 'undefined' && window.epson
  const Dev = epson?.ePOSDevice
  if (!Dev) {
    throw new Error('ePOS SDK não carregado. Adicione o script da Epson ou use impressora do sistema.')
  }
  const dev = new Dev()
  return new Promise((resolve, reject) => {
    dev.connect(printerIp, 8008, (result, code, msg) => {
      if (result !== 'OK') {
        return reject(new Error(`Falha ao conectar: ${msg || code}`))
      }
      dev.createDevice('local_printer', dev.DEVICE_TYPE_PRINTER, { crypto: false, buffer: false }, (res, code, msg) => {
        if (res !== 'OK') {
          return reject(new Error(`Falha ao criar dispositivo: ${msg || code}`))
        }
        const printer = dev.getDevice('local_printer')
        const { company, number, date, client, items, subtotal, discount, total, payments } = opts
        const fmt = v => typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v ?? '')

        printer.addTextAlign(printer.ALIGN_CENTER)
        printer.addTextSize(2, 2)
        printer.addText(`${company}\n`)
        printer.addTextSize(1, 1)
        printer.addText(`${number}\n`)
        printer.addText(`${date}\n`)
        printer.addFeedLine(1)
        printer.addTextAlign(printer.ALIGN_LEFT)
        printer.addText(`Cliente: ${client}\n`)
        printer.addFeedLine(1)
        items.forEach(i => {
          const qty = parseFloat(i.quantity) || 1
          const up = parseFloat(i.unit_price) || 0
          const tot = parseFloat(i.total) ?? qty * up
          printer.addText(`${(i.product_name || '').substring(0, 28)} ${qty} ${fmt(up)} ${fmt(tot)}\n`)
        })
        printer.addFeedLine(1)
        printer.addText(`Subtotal: ${fmt(subtotal)}\n`)
        if (discount > 0) printer.addText(`Desconto: -${fmt(discount)}\n`)
        printer.addTextSize(2, 2)
        printer.addText(`TOTAL: ${fmt(total)}\n`)
        printer.addTextSize(1, 1)
        payments.forEach(p => {
          const labels = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito' }
          printer.addText(`${labels[p.method] || p.method}: ${fmt(parseFloat(p.amount) || 0)}\n`)
        })
        printer.addFeedLine(2)
        printer.addTextAlign(printer.ALIGN_CENTER)
        printer.addText('Obrigado pela preferência!\n')
        printer.addCut(printer.CUT_FEED)

        printer.send((res, code, msg) => {
          dev.disconnect()
          if (res === 'OK') resolve()
          else reject(new Error(`Falha na impressão: ${msg || code}`))
        })
      })
    })
  })
}

/**
 * Imprime o cupom.
 * Se vrx_pdv_printer_ip estiver configurado e ePOS disponível, imprime direto.
 * Caso contrário, usa window.print() (abre diálogo).
 */
export async function printReceipt(opts) {
  const { ip, useEpos } = getPrinterConfig()
  if (useEpos && ip && typeof window !== 'undefined' && window.epson?.ePOSDevice) {
    try {
      await printViaEpos(opts, ip)
      return { method: 'epos', ok: true }
    } catch (e) {
      console.warn('ePOS falhou, fallback para browser:', e.message)
    }
  }
  await printViaBrowser(opts)
  return { method: 'browser', ok: true }
}
