/**
 * Thermal receipt printing helpers.
 *
 * Strategy order:
 * 1. Epson ePOS direct network printing.
 * 2. Browser print dialog fallback.
 */

const STORAGE_KEY = 'vrx_pdv_printer_ip'

function formatPaymentLabel(payment) {
  const labels = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    debito: 'Debito',
    credito: 'Credito',
    credito_loja: 'Credito loja',
    crediario: 'Crediario',
    voucher: 'Voucher',
    sinal: 'Sinal',
  }
  const label = labels[payment?.method] || payment?.method || ''
  const installments = parseInt(payment?.installments, 10)
  return installments > 1 ? `${label} (${installments}x)` : label
}

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

export function buildReceiptHtml(opts) {
  const {
    company = 'Loja',
    number = '',
    date = '',
    client = 'Consumidor final',
    items = [],
    subtotal = 0,
    discount = 0,
    total = 0,
    payments = [],
  } = opts
  const fmt = value => typeof value === 'number'
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : String(value ?? '')

  const lines = items.map(item => {
    const qty = parseFloat(item.quantity) || 1
    const unitPrice = parseFloat(item.unit_price) || 0
    const parsedTotal = parseFloat(item.total)
          const itemTotal = Number.isFinite(parsedTotal) ? parsedTotal : qty * unitPrice
    return `<tr><td>${(item.product_name || '').substring(0, 24)}</td><td>${qty}</td><td>${fmt(unitPrice)}</td><td>${fmt(itemTotal)}</td></tr>`
  }).join('')

  const payLines = payments
    .map(payment => `<tr><td>${formatPaymentLabel(payment)}</td><td colspan="3" style="text-align:right">${fmt(parseFloat(payment.amount) || 0)}</td></tr>`)
    .join('')

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
  <div class="center" style="font-size:10px; margin-top:8px;">Obrigado pela preferencia!</div>
  <div class="center" style="font-size:10px;">---</div>
</div>
<div class="no-print" id="print-trigger"></div>
</body></html>
`
}

function printViaBrowser(opts) {
  return new Promise((resolve, reject) => {
    const html = buildReceiptHtml(opts)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      return reject(new Error('Nao foi possivel criar area de impressao'))
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
      } catch (error) {
        document.body.removeChild(iframe)
        reject(error)
      }
    }, 150)
  })
}

async function printViaEpos(opts, printerIp) {
  const epson = typeof window !== 'undefined' && window.epson
  const Device = epson?.ePOSDevice
  if (!Device) {
    throw new Error('ePOS SDK nao carregado. Use a impressora do sistema ou carregue o SDK da Epson.')
  }
  const device = new Device()
  return new Promise((resolve, reject) => {
    device.connect(printerIp, 8008, (result, code, msg) => {
      if (result !== 'OK') {
        return reject(new Error(`Falha ao conectar: ${msg || code}`))
      }
      device.createDevice('local_printer', device.DEVICE_TYPE_PRINTER, { crypto: false, buffer: false }, (res, createCode, createMsg) => {
        if (res !== 'OK') {
          return reject(new Error(`Falha ao criar dispositivo: ${createMsg || createCode}`))
        }
        const printer = device.getDevice('local_printer')
        const { company, number, date, client, items, subtotal, discount, total, payments } = opts
        const fmt = value => typeof value === 'number'
          ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : String(value ?? '')

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

        items.forEach(item => {
          const qty = parseFloat(item.quantity) || 1
          const unitPrice = parseFloat(item.unit_price) || 0
          const parsedTotal = parseFloat(item.total)
          const itemTotal = Number.isFinite(parsedTotal) ? parsedTotal : qty * unitPrice
          printer.addText(`${(item.product_name || '').substring(0, 28)} ${qty} ${fmt(unitPrice)} ${fmt(itemTotal)}\n`)
        })

        printer.addFeedLine(1)
        printer.addText(`Subtotal: ${fmt(subtotal)}\n`)
        if (discount > 0) printer.addText(`Desconto: -${fmt(discount)}\n`)
        printer.addTextSize(2, 2)
        printer.addText(`TOTAL: ${fmt(total)}\n`)
        printer.addTextSize(1, 1)
        payments.forEach(payment => {
          printer.addText(`${formatPaymentLabel(payment)}: ${fmt(parseFloat(payment.amount) || 0)}\n`)
        })
        printer.addFeedLine(2)
        printer.addTextAlign(printer.ALIGN_CENTER)
        printer.addText('Obrigado pela preferencia!\n')
        printer.addCut(printer.CUT_FEED)

        printer.send((sendResult, sendCode, sendMsg) => {
          device.disconnect()
          if (sendResult === 'OK') resolve()
          else reject(new Error(`Falha na impressao: ${sendMsg || sendCode}`))
        })
      })
    })
  })
}

export async function printReceipt(opts) {
  const { ip, useEpos } = getPrinterConfig()
  if (useEpos && ip && typeof window !== 'undefined' && window.epson?.ePOSDevice) {
    try {
      await printViaEpos(opts, ip)
      return { method: 'epos', ok: true }
    } catch (error) {
      console.warn('ePOS falhou, fallback para browser:', error.message)
    }
  }
  await printViaBrowser(opts)
  return { method: 'browser', ok: true }
}
