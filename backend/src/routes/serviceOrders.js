'use strict';
/**
 * Ordens de serviÃ§o (assistÃªncia tÃ©cnica): CRUD, status, itens, orÃ§amentos.
 * Portal pÃºblico (token) para cliente acompanhar. Templates WA configurÃ¡veis.
 * Log de alteraÃ§Ãµes em service_order_logs.
 */
const crypto = require('crypto');
const router = require('express').Router();
const db = require('../database/db');

function genPortalToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += chars[buf[i] % chars.length];
  return s;
}
const evo = require('../services/evolutionApi');
const ws = require('../services/wsServer');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(auth);
router.use(requirePermission('crm')); // AssistÃªncia usa permissÃ£o CRM

const STATUSES = [
  { slug:'received', label:'Recebido', color:'#6b7280' },
  { slug:'analysis', label:'Em anÃ¡lise', color:'#3b82f6' },
  { slug:'awaiting_approval', label:'Aguardando aprovaÃ§Ã£o', color:'#f59e0b' },
  { slug:'awaiting_part', label:'Aguardando peÃ§a', color:'#f97316' },
  { slug:'repair', label:'Em reparo', color:'#8b5cf6' },
  { slug:'testing', label:'Testes', color:'#06b6d4' },
  { slug:'ready', label:'Pronto para retirada', color:'#10b981' },
  { slug:'delivered', label:'Entregue', color:'#22c55e' },
  { slug:'cancelled', label:'Cancelado', color:'#ef4444' },
];

const WA_TEMPLATES = {
  received: 'OlÃ¡ {nome}! Recebemos seu aparelho na assistÃªncia. Em breve entraremos em contato com o orÃ§amento.\n\nAcompanhe: {link}',
  analysis: 'OlÃ¡ {nome}! Seu aparelho da OS #{numero} estÃ¡ em anÃ¡lise. Em breve teremos o diagnÃ³stico.\n\nAcompanhe: {link}',
  quote_ready: 'OlÃ¡ {nome}! O orÃ§amento da sua OS #{numero} estÃ¡ pronto. Aguardamos sua aprovaÃ§Ã£o.\n\n{itens}\nTotal: {valor}\n\nAcompanhe: {link}',
  awaiting_approval: 'OlÃ¡ {nome}! Estamos aguardando sua aprovaÃ§Ã£o do orÃ§amento da OS #{numero}.\n\nAcompanhe: {link}',
  awaiting_part: 'OlÃ¡ {nome}! Estamos aguardando a peÃ§a para reparo da OS #{numero}. Assim que chegar, retomaremos o serviÃ§o.\n\nAcompanhe: {link}',
  part_arrived: 'OlÃ¡ {nome}! A peÃ§a da sua OS #{numero} chegou. Em breve concluiremos o reparo.\n\nAcompanhe: {link}',
  repair: 'OlÃ¡ {nome}! O reparo da sua OS #{numero} estÃ¡ em andamento. Em breve finalizaremos.\n\nAcompanhe: {link}',
  testing: 'OlÃ¡ {nome}! Seu aparelho da OS #{numero} estÃ¡ em fase de testes. Em breve estarÃ¡ pronto para retirada.\n\nAcompanhe: {link}',
  ready: 'OlÃ¡ {nome}! Seu aparelho da OS #{numero} estÃ¡ pronto para retirada. HorÃ¡rio: 9h Ã s 18h.\n\nAcompanhe: {link}',
  delivered: 'OlÃ¡ {nome}! Obrigado por retirar seu aparelho. Garantia de {dias} dias.',
};

function logChange(osId, action, field, oldVal, newVal, userId) {
  return db.query(
    'INSERT INTO service_order_logs (service_order_id,action,field,old_value,new_value,user_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [osId, action, field, oldVal, newVal, userId]
  );
}

function normalizePhone(phone) {
  const p = (phone || '').replace(/\D/g, '');
  return p.startsWith('55') ? p : '55' + p;
}

// â”€â”€ Status â”€â”€
router.get('/statuses', (req, res) => res.json(STATUSES));

// â”€â”€ ServiÃ§os â”€â”€
router.get('/services', async (req, res, next) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    const q = all ? 'SELECT * FROM service_services ORDER BY name' : 'SELECT * FROM service_services WHERE active=true ORDER BY name';
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/services', async (req, res, next) => {
  const { name, description, avg_time_mins, default_price } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatÃ³rio' });
  try {
    const r = await db.query(
      `INSERT INTO service_services (name, description, avg_time_mins, default_price)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), description?.trim() || null, parseInt(avg_time_mins) || 60, parseFloat(default_price) || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/services/:id', async (req, res, next) => {
  const { name, description, avg_time_mins, default_price, active } = req.body;
  try {
    const r = await db.query(
      `UPDATE service_services SET
        name=COALESCE($1,name), description=COALESCE($2,description),
        avg_time_mins=COALESCE($3,avg_time_mins), default_price=COALESCE($4,default_price),
        active=COALESCE($5,active)
       WHERE id=$6 RETURNING *`,
      [name?.trim(), description?.trim(), parseInt(avg_time_mins), parseFloat(default_price), active, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'ServiÃ§o nÃ£o encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/services/:id', async (req, res, next) => {
  try {
    await db.query('UPDATE service_services SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// â”€â”€ Templates WhatsApp (configurÃ¡veis via settings) â”€â”€
const WA_TEMPLATE_LABELS = { received: 'Recebemos seu aparelho', quote_ready: 'OrÃ§amento pronto', awaiting_approval: 'Aguardando aprovaÃ§Ã£o', part_arrived: 'PeÃ§a chegou', ready: 'Pronto para retirada', delivered: 'Entregue' };
const WA_TEMPLATES_DEFAULT = Object.entries(WA_TEMPLATES).map(([k, v]) => ({ k, l: WA_TEMPLATE_LABELS[k] || k, msg: v }));

async function getWaTemplates() {
  const r = await db.query("SELECT value FROM settings WHERE key='service_order_wa_templates'");
  if (r.rows[0]?.value) {
    try {
      const custom = JSON.parse(r.rows[0].value);
      if (Array.isArray(custom) && custom.length > 0) return custom;
    } catch {}
  }
  return WA_TEMPLATES_DEFAULT;
}

async function getWaTemplateMap() {
  const list = await getWaTemplates();
  const map = {};
  for (const t of list) map[t.k] = t.msg || t.message;
  return Object.keys(map).length ? map : WA_TEMPLATES;
}

const PORTAL_BASE = process.env.APP_URL || process.env.ALLOWED_ORIGIN || '';

function getPortalLink(os) {
  if (!PORTAL_BASE) return '';
  const token = os?.portal_token;
  if (!token) return '';
  return `${PORTAL_BASE.replace(/\/$/, '')}/os/${token}`;
}

function fmtBrl(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildValorAndItens(items) {
  if (!items || !items.length) return { valor: 'â€”', itens: 'Sem itens no orÃ§amento' };
  let total = 0;
  const lines = [];
  for (const it of items) {
    const qty = parseFloat(it.quantity) || 1;
    const price = parseFloat(it.unit_price) || 0;
    const disc = parseFloat(it.discount) || 0;
    const itemTotal = qty * price - disc;
    total += itemTotal;
    const desc = it.service_name || it.product_name || it.description || 'Item';
    lines.push(`â€¢ ${desc} - ${fmtBrl(itemTotal)}`);
  }
  return { valor: fmtBrl(total), itens: lines.join('\n') };
}

function interpolateMessage(text, os, items) {
  if (!text) return '';
  const link = getPortalLink(os);
  const { valor, itens } = buildValorAndItens(items || os?.items);
  return String(text)
    .replace(/{nome}/g, os?.client_name || os?.walk_in_name || 'Cliente')
    .replace(/{numero}/g, os?.number || '')
    .replace(/{dias}/g, String(os?.warranty_days ?? 90))
    .replace(/{link}/g, link)
    .replace(/{valor}/g, valor)
    .replace(/{itens}/g, itens);
}

function buildWarrantyTermFileName(os) {
  const base = String(os?.number || 'os')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `termo-garantia-${base || 'os'}.pdf`;
}

function pdfEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');
}

function wrapPdfText(text, maxChars) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildPdfBuffer(pageStreams) {
  const pageObjects = [];
  const contentObjects = [];
  const firstPageObj = 5;
  pageStreams.forEach((stream, index) => {
    const pageObj = firstPageObj + index * 2;
    const contentObj = pageObj + 1;
    pageObjects.push(`${pageObj} 0 R`);
    contentObjects.push({ pageObj, contentObj, stream });
  });

  const objects = [];
  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii');
  objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageObjects.join(' ')}] /Count ${pageObjects.length} >>`, 'ascii');
  objects[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'ascii');
  objects[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'ascii');

  for (const item of contentObjects) {
    objects[item.pageObj] = Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${item.contentObj} 0 R >>`, 'ascii');
    const streamBuffer = Buffer.from(item.stream, 'latin1');
    objects[item.contentObj] = Buffer.concat([
      Buffer.from(`<< /Length ${streamBuffer.length} >>\nstream\n`, 'ascii'),
      streamBuffer,
      Buffer.from('\nendstream', 'ascii'),
    ]);
  }

  const chunks = [];
  const offsets = [0];
  let offset = 0;
  const push = (buffer) => { chunks.push(buffer); offset += buffer.length; };
  push(Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary'));

  for (let i = 1; i < objects.length; i++) {
    offsets[i] = offset;
    push(Buffer.from(`${i} 0 obj\n`, 'ascii'));
    push(objects[i]);
    push(Buffer.from('\nendobj\n', 'ascii'));
  }

  const startXref = offset;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  push(Buffer.from(xref, 'ascii'));

  return Buffer.concat(chunks);
}

function buildWarrantyTermPdfBuffer(os, companyName) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 52;
  const pages = [[]];
  let page = pages[0];
  let y = 790;

  const newPage = () => {
    page = [];
    pages.push(page);
    y = 790;
  };
  const ensureSpace = (height = 16) => {
    if (y - height < 52) newPage();
  };
  const pushText = (text, opts = {}) => {
    const size = opts.size || 11;
    const font = opts.bold ? 'F2' : 'F1';
    const indent = opts.indent || 0;
    const lineHeight = opts.lineHeight || Math.round(size * 1.45);
    if (text == null || text === '') {
      ensureSpace(lineHeight);
      y -= lineHeight;
      return;
    }
    const maxChars = opts.maxChars || Math.max(24, Math.floor((pageWidth - margin * 2 - indent) / Math.max(size * 0.52, 1)));
    const lines = wrapPdfText(text, maxChars);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.push({ text: line, x: margin + indent, y, font, size });
      y -= lineHeight;
    }
    if (opts.afterGap) y -= opts.afterGap;
  };

  const formatDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '-';
  const formatDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-';
  const clientName = os?.client_name || os?.walk_in_name || 'Cliente';
  const clientPhone = os?.client_phone || os?.walk_in_phone || '-';
  const clientDocument = os?.client_document || os?.walk_in_doc || '-';
  const devices = Array.isArray(os?.devices) && os.devices.length ? os.devices : [{}];
  const items = Array.isArray(os?.items) ? os.items : [];
  const warrantyDays = parseInt(os?.warranty_days, 10) > 0 ? parseInt(os.warranty_days, 10) : 90;
  const partWarrantyDays = parseInt(os?.warranty_part_days, 10) > 0 ? parseInt(os.warranty_part_days, 10) : warrantyDays;
  const total = items.length
    ? items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0) - (parseFloat(item.discount) || 0)), 0)
    : (parseFloat(os?.initial_quote) || 0);

  pushText(companyName || 'Assist\u00eancia T\u00e9cnica', { bold: true, size: 16 });
  pushText('Termo de Garantia', { bold: true, size: 18, afterGap: 2 });
  pushText(`OS ${os?.number || '-'} | Emitido em ${formatDateTime(new Date())}`, { size: 10, afterGap: 8 });

  pushText('Identifica\u00e7\u00e3o do cliente', { bold: true, size: 13, afterGap: 2 });
  pushText(`Cliente: ${clientName}`);
  pushText(`Telefone: ${clientPhone}`);
  pushText(`CPF/CNPJ: ${clientDocument}`);
  pushText(`Entrada: ${formatDate(os?.received_at)} | Entrega: ${formatDate(os?.delivered_at || new Date())}`);
  pushText(`Garantia: ${warrantyDays} dias para o servi\u00e7o e ${partWarrantyDays} dias para as pe\u00e7as.`, { afterGap: 8 });

  pushText('Dados do aparelho', { bold: true, size: 13, afterGap: 2 });
  devices.forEach((device, index) => {
    pushText(`Aparelho${devices.length > 1 ? ` ${index + 1}` : ''}: ${[device?.brand, device?.model, device?.color, device?.storage].filter(Boolean).join(' / ') || 'N\u00e3o informado'}`);
    pushText(`IMEI/S\u00e9rie: ${device?.imei || device?.serial || 'N\u00e3o informado'}`);
  });
  pushText(`Defeito relatado: ${os?.defect_reported || 'N\u00e3o informado'}`);
  pushText(`Acess\u00f3rios deixados: ${os?.accessories || 'N\u00e3o informado'}`);
  pushText(`Estado do aparelho: ${os?.device_state || 'N\u00e3o informado'}`, { afterGap: 8 });

  pushText('Servi\u00e7os e pe\u00e7as', { bold: true, size: 13, afterGap: 2 });
  if (items.length) {
    items.forEach((item, index) => {
      const qty = parseFloat(item.quantity) || 1;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const discount = parseFloat(item.discount) || 0;
      const totalItem = qty * unitPrice - discount;
      const description = item.service_name || item.product_name || item.description || 'Item';
      pushText(`${index + 1}. ${description} | Qtd.: ${qty} | Total: ${fmtBrl(totalItem)}`, { indent: 8 });
    });
  } else {
    pushText('Nenhum item vinculado ao or\u00e7amento desta OS.', { indent: 8 });
  }
  pushText(`Valor total: ${fmtBrl(total)}`, { bold: true, afterGap: 8 });

  pushText('Condi\u00e7\u00f5es da garantia', { bold: true, size: 13, afterGap: 2 });
  [
    'A garantia cobre apenas o servi\u00e7o executado e as pe\u00e7as descritas nesta ordem de servi\u00e7o.',
    'O prazo de garantia \u00e9 contado a partir da data de entrega do aparelho ao cliente.',
    'N\u00e3o est\u00e3o cobertos danos causados por queda, l\u00edquido, oxida\u00e7\u00e3o, mau uso ou interven\u00e7\u00e3o de terceiros.',
    'Senhas, c\u00f3pias de seguran\u00e7a e dados armazenados no aparelho s\u00e3o de responsabilidade do cliente.',
    'Este termo deve ser apresentado em qualquer atendimento de garantia relacionado a esta OS.',
  ].forEach((line, index) => pushText(`${index + 1}. ${line}`, { indent: 8, maxChars: 88 }));
  pushText('', { lineHeight: 12 });
  pushText('Declaro que recebi o aparelho e estou ciente das condi\u00e7\u00f5es de garantia descritas neste termo.', { maxChars: 92, afterGap: 18 });

  ensureSpace(50);
  page.push({ text: '__________________________________', x: 52, y, font: 'F1', size: 11 });
  page.push({ text: '__________________________________', x: 320, y, font: 'F1', size: 11 });
  page.push({ text: companyName || 'Assist\u00eancia T\u00e9cnica', x: 52, y: y - 16, font: 'F1', size: 10 });
  page.push({ text: clientName, x: 320, y: y - 16, font: 'F1', size: 10 });

  const pageStreams = pages.map(itemsOnPage => itemsOnPage.map(item => (
    `BT /${item.font} ${item.size} Tf 1 0 0 1 ${item.x} ${item.y} Tm (${pdfEscape(item.text)}) Tj ET`
  )).join('\n'));

  return buildPdfBuffer(pageStreams);
}

async function getWarrantyTermCompanyName() {
  const r = await db.query("SELECT value FROM settings WHERE key='company_name' LIMIT 1");
  return r.rows[0]?.value || process.env.VITE_COMPANY_NAME || 'Assist\u00eancia T\u00e9cnica';
}

async function loadWarrantyTermData(serviceOrderId) {
  const os = (await db.query(
    `SELECT so.*, c.name as client_name, c.phone as client_phone, c.document as client_document
     FROM service_orders so
     LEFT JOIN clients c ON c.id=so.client_id
     WHERE so.id=$1`,
    [serviceOrderId]
  )).rows[0];
  if (!os) return null;

  const [itemsRes, devicesRes] = await Promise.all([
    db.query(
      `SELECT soi.*, ss.name as service_name, p.name as product_name
       FROM service_order_items soi
       LEFT JOIN service_services ss ON ss.id=soi.service_id
       LEFT JOIN products p ON p.id=soi.product_id
       WHERE soi.service_order_id=$1 ORDER BY soi.id`,
      [serviceOrderId]
    ),
    db.query('SELECT * FROM service_order_devices WHERE service_order_id=$1 ORDER BY id', [serviceOrderId]),
  ]);
  os.items = itemsRes.rows;
  os.devices = devicesRes.rows;
  return os;
}
async function ensureWaConversation(instanceId, phoneNorm, contactName) {
  let conv = (await db.query(
    'SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 ORDER BY id DESC LIMIT 1',
    [instanceId, phoneNorm]
  )).rows[0];
  if (conv) return conv;

  const dept = (await db.query('SELECT id FROM wa_departments WHERE active=true ORDER BY id LIMIT 1')).rows[0];
  conv = (await db.query(
    "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'queue',false) RETURNING *",
    [instanceId, phoneNorm, contactName || null, dept?.id || null]
  )).rows[0];
  return conv;
}

async function getWaConversationFull(convId) {
  return (await db.query(
    `SELECT c.*,d.name as dept_name,d.color as dept_color,u.name as agent_name,i.name as instance_name,
            lm.last_message_id,lm.last_message_type
     FROM wa_conversations c
     LEFT JOIN wa_departments d ON d.id=c.department_id
     LEFT JOIN users u ON u.id=c.assigned_to
     LEFT JOIN wa_instances i ON i.id=c.instance_id
     LEFT JOIN LATERAL (SELECT id as last_message_id, type as last_message_type FROM wa_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
     WHERE c.id=$1`,
    [convId]
  )).rows[0];
}

function stripWaMessageMedia(message) {
  if (!message) return message;
  const { media_base64, ...clean } = message;
  return { ...clean, has_media: !!media_base64 };
}
const STATUS_TO_TEMPLATE = {
  received: 'received',
  analysis: 'analysis',
  awaiting_approval: 'quote_ready',
  awaiting_part: 'awaiting_part',
  repair: 'repair',
  testing: 'testing',
  ready: 'ready',
  delivered: 'delivered',
};

router.get('/wa-templates', async (req, res, next) => {
  try {
    res.json(await getWaTemplates());
  } catch (e) { next(e); }
});

router.put('/wa-templates', async (req, res, next) => {
  const { templates } = req.body || {};
  if (!Array.isArray(templates)) return res.status(400).json({ error: 'templates deve ser um array' });
  try {
    await db.query(
      `INSERT INTO settings (key, value) VALUES ('service_order_wa_templates', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(templates)]
    );
    res.json(await getWaTemplates());
  } catch (e) { next(e); }
});

// â”€â”€ Checklist templates (padrÃ£o configurÃ¡vel) â”€â”€
router.get('/checklist-templates', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM service_checklist_templates ORDER BY phase, sort_order, id');
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/checklist-templates', async (req, res, next) => {
  const { phase, item_key, label, sort_order } = req.body;
  if (!phase || !label) return res.status(400).json({ error: 'phase e label obrigatÃ³rios' });
  const key = item_key || ('item_' + Date.now());
  try {
    const r = await db.query(
      'INSERT INTO service_checklist_templates (phase, item_key, label, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [phase, key, label, parseInt(sort_order) || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/checklist-templates/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM service_checklist_templates WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// â”€â”€ Listar OS â”€â”€
router.get('/', async (req, res, next) => {
  const { status, technician_id, client_id, search, from, to } = req.query;
  let q = `SELECT so.*, c.name as client_name, c.phone as client_phone,
    u.name as technician_name, sod.brand, sod.model, sod.color as device_color, sod.imei
    FROM service_orders so
    LEFT JOIN clients c ON c.id=so.client_id
    LEFT JOIN users u ON u.id=so.technician_id
    LEFT JOIN service_order_devices sod ON sod.service_order_id=so.id
    WHERE 1=1`;
  const p = [];
  if (status) { p.push(status); q += ` AND so.status=$${p.length}`; }
  if (technician_id) { p.push(technician_id); q += ` AND so.technician_id=$${p.length}`; }
  if (client_id) { p.push(client_id); q += ` AND so.client_id=$${p.length}`; }
  if (from) { p.push(from); q += ` AND so.received_at::date >= $${p.length}`; }
  if (to) { p.push(to); q += ` AND so.received_at::date <= $${p.length}`; }
  if (search) {
    p.push(`%${search}%`);
    q += ` AND (so.number ILIKE $${p.length} OR c.name ILIKE $${p.length} OR so.walk_in_name ILIKE $${p.length} OR sod.imei ILIKE $${p.length} OR sod.model ILIKE $${p.length})`;
  }
  q += ' ORDER BY so.received_at DESC, so.id DESC';
  try {
    const r = await db.query(q, p);
    const seen = new Set();
    const rows = r.rows.filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// â”€â”€ KPIs â”€â”€
router.get('/kpis', async (req, res, next) => {
  try {
    const r = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled')) as open,
        COUNT(*) FILTER (WHERE status='ready') as ready,
        COUNT(*) FILTER (WHERE status='awaiting_approval') as awaiting_approval,
        COUNT(*) FILTER (WHERE status='awaiting_part') as awaiting_part,
        COUNT(*) FILTER (WHERE received_at::date = CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE status='delivered' AND delivered_at::date = CURRENT_DATE) as delivered_today
      FROM service_orders
    `);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// â”€â”€ Criar OS â”€â”€
router.post('/', async (req, res, next) => {
  const { client_id, walk_in_name, walk_in_phone, walk_in_doc } = req.body;
  if (!client_id && !walk_in_name) return res.status(400).json({ error: 'Cliente ou nome Ã© obrigatÃ³rio' });
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('LOCK TABLE service_orders IN SHARE ROW EXCLUSIVE MODE');
    const cnt = await conn.query('SELECT COUNT(*) FROM service_orders');
    const num = `OS-${String(parseInt(cnt.rows[0].count) + 1).padStart(5, '0')}`;
    let token;
    for (let retries = 0; retries < 5; retries++) {
      token = genPortalToken();
      const exists = await conn.query('SELECT 1 FROM service_orders WHERE portal_token=$1', [token]);
      if (!exists.rows.length) break;
    }
    const r = await conn.query(
      `INSERT INTO service_orders (number,portal_token,client_id,walk_in_name,walk_in_phone,walk_in_doc,status,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,'received',$7) RETURNING *`,
      [num, token || genPortalToken(), client_id || null, walk_in_name || null, walk_in_phone || null, walk_in_doc || null, req.user.id]
    );
    await conn.query(
      'INSERT INTO service_order_logs (service_order_id,action,user_id) VALUES ($1,$2,$3)',
      [r.rows[0].id, 'created', req.user.id]
    );
    await conn.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (e) { await conn.query('ROLLBACK'); next(e); }
});

// â”€â”€ Detalhe OS â”€â”€
router.get('/:id', async (req, res, next) => {
  try {
    const os = (await db.query(
      `SELECT so.*, c.name as client_name, c.phone as client_phone, c.document as client_document,
        u.name as technician_name
       FROM service_orders so
       LEFT JOIN clients c ON c.id=so.client_id
       LEFT JOIN users u ON u.id=so.technician_id
       WHERE so.id=$1`,
      [req.params.id]
    )).rows[0];
    if (!os) return res.status(404).json({ error: 'OS nÃ£o encontrada' });
    if (!os.portal_token) {
      let tok = genPortalToken();
      for (let r = 0; r < 5; r++) {
        const exists = await db.query('SELECT 1 FROM service_orders WHERE portal_token=$1', [tok]);
        if (!exists.rows.length) break;
        tok = genPortalToken();
      }
      await db.query('UPDATE service_orders SET portal_token=$1 WHERE id=$2', [tok, os.id]);
      os.portal_token = tok;
    }
    const [devices, items, checklists, approvals, logs, messages] = await Promise.all([
      db.query('SELECT * FROM service_order_devices WHERE service_order_id=$1', [req.params.id]),
      db.query(`SELECT soi.*, ss.name as service_name, p.name as product_name, p.sku
        FROM service_order_items soi
        LEFT JOIN service_services ss ON ss.id=soi.service_id
        LEFT JOIN products p ON p.id=soi.product_id
        WHERE soi.service_order_id=$1 ORDER BY soi.id`, [req.params.id]),
      db.query('SELECT * FROM service_order_checklists WHERE service_order_id=$1 ORDER BY phase, id', [req.params.id]),
      db.query('SELECT * FROM service_order_approvals WHERE service_order_id=$1 ORDER BY id DESC LIMIT 1', [req.params.id]),
      db.query(`SELECT sol.*, u.name as user_name FROM service_order_logs sol
        LEFT JOIN users u ON u.id=sol.user_id WHERE sol.service_order_id=$1 ORDER BY sol.created_at DESC`, [req.params.id]),
      db.query('SELECT * FROM service_order_messages WHERE service_order_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);
    os.devices = devices.rows;
    os.items = items.rows;
    os.checklists = checklists.rows;
    os.approval = approvals.rows[0] || null;
    os.logs = logs.rows;
    os.messages = messages.rows;
    res.json(os);
  } catch (e) { next(e); }
});

// â”€â”€ Atualizar OS â”€â”€
router.put('/:id', async (req, res, next) => {
  const { defect_reported, accessories, device_state, password_informed, device_password, photos, initial_quote,
    warranty_days, warranty_part_days, notes, estimated_at, priority, technician_id } = req.body;
  try {
    const old = (await db.query('SELECT * FROM service_orders WHERE id=$1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'OS nÃ£o encontrada' });
    const r = await db.query(
      `UPDATE service_orders SET defect_reported=$1,accessories=$2,device_state=$3,password_informed=$4,
        device_password=$5,photos=$6,initial_quote=$7,warranty_days=$8,warranty_part_days=$9,notes=$10,
        estimated_at=$11,priority=$12,technician_id=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [defect_reported||null, accessories||null, device_state||null, password_informed,
       device_password||null, photos ? JSON.stringify(photos) : old.photos, initial_quote, warranty_days, warranty_part_days,
       notes||null, estimated_at||null, priority||'normal', technician_id||null, req.params.id]
    );
    if (technician_id !== undefined && technician_id !== old.technician_id)
      await logChange(req.params.id, 'technician_changed', 'technician_id', old.technician_id, technician_id, req.user.id);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// â”€â”€ Adicionar dispositivo â”€â”€
router.post('/:id/devices', async (req, res, next) => {
  const { brand, model, color, storage, imei, serial } = req.body;
  try {
    const r = await db.query(
      `INSERT INTO service_order_devices (service_order_id,brand,model,color,storage,imei,serial)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, brand||null, model||null, color||null, storage||null, imei||null, serial||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// â”€â”€ Atualizar dispositivo â”€â”€
router.put('/:id/devices/:devId', async (req, res, next) => {
  const { brand, model, color, storage, imei, serial } = req.body;
  try {
    const r = await db.query(
      `UPDATE service_order_devices SET brand=$1,model=$2,color=$3,storage=$4,imei=$5,serial=$6
       WHERE id=$7 AND service_order_id=$8 RETURNING *`,
      [brand||null, model||null, color||null, storage||null, imei||null, serial||null, req.params.devId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Dispositivo nÃ£o encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// â”€â”€ Mudar status â”€â”€
router.patch('/:id/status', async (req, res, next) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status obrigatÃ³rio' });
  try {
    const old = (await db.query('SELECT * FROM service_orders WHERE id=$1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'OS nÃ£o encontrada' });
    const updates = { status };
    if (status === 'ready') updates.completed_at = new Date().toISOString();
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();
    const r = await db.query(
      `UPDATE service_orders SET status=$1,completed_at=$2,delivered_at=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status, updates.completed_at || null, updates.delivered_at || null, req.params.id]
    );
    await logChange(req.params.id, 'status_changed', 'status', old.status, status, req.user.id);

    // Disparo automÃ¡tico de WhatsApp ao mudar status
    const templateKey = STATUS_TO_TEMPLATE[status];
    if (templateKey) {
      try {
        const os = (await db.query(
          `SELECT so.*, c.name as client_name, c.phone as client_phone FROM service_orders so
           LEFT JOIN clients c ON c.id=so.client_id WHERE so.id=$1`,
          [req.params.id]
        )).rows[0];
        const ph = os?.client_phone || os?.walk_in_phone;
        if (ph) {
          const itemsRes = await db.query(
            `SELECT soi.*, ss.name as service_name, p.name as product_name
             FROM service_order_items soi
             LEFT JOIN service_services ss ON ss.id=soi.service_id
             LEFT JOIN products p ON p.id=soi.product_id
             WHERE soi.service_order_id=$1 ORDER BY soi.id`,
            [req.params.id]
          );
          os.items = itemsRes.rows;
          const tplMap = await getWaTemplateMap();
          const tpl = tplMap[templateKey] || WA_TEMPLATES[templateKey];
          if (tpl) {
            const text = interpolateMessage(String(tpl), os);
            const inst = (await db.query("SELECT * FROM wa_instances WHERE status='connected' AND active=true ORDER BY id LIMIT 1")).rows[0];
            if (inst) {
              const phoneNorm = normalizePhone(ph);
              const evoResp = await evo.sendText(inst.name, phoneNorm, text);
              await db.query(
                `INSERT INTO service_order_messages (service_order_id,template,message,phone,status,sent_at,user_id)
                 VALUES ($1,$2,$3,$4,'sent',NOW(),$5)`,
                [req.params.id, templateKey, text, ph, req.user.id]
              );
              const waMessageId = evoResp?.data?.key?.id || null;
              let conv = (await db.query(
                'SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 ORDER BY id DESC LIMIT 1',
                [inst.id, phoneNorm]
              )).rows[0];
              if (!conv) {
                const dept = (await db.query('SELECT id FROM wa_departments WHERE active=true ORDER BY id LIMIT 1')).rows[0];
                conv = (await db.query(
                  "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'queue',false) RETURNING *",
                  [inst.id, phoneNorm, os.client_name || os.walk_in_name || null, dept?.id || null]
                )).rows[0];
              }
              await db.query(
                "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,status,sent_by,is_bot) VALUES ($1,$2,'out','text',$3,'sent',$4,false)",
                [conv.id, waMessageId, text, req.user.id]
              );
              await db.query(
                'UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
                [text.substring(0, 100), conv.id]
              );
              const fullConv = (await db.query(
                `SELECT c.*,d.name as dept_name,d.color as dept_color,u.name as agent_name,i.name as instance_name,
                        (SELECT id FROM wa_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) as last_message_id
                 FROM wa_conversations c
                 LEFT JOIN wa_departments d ON d.id=c.department_id
                 LEFT JOIN users u ON u.id=c.assigned_to
                 LEFT JOIN wa_instances i ON i.id=c.instance_id WHERE c.id=$1`,
                [conv.id]
              )).rows[0];
              ws.emitInbox({ type: 'new_message', conversation: fullConv });
            }
          }
        }
      } catch (waErr) { console.warn('[OS] Envio automÃ¡tico WA falhou:', waErr.message); }
    }

    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// â”€â”€ Itens do orÃ§amento â”€â”€
router.post('/:id/items', async (req, res, next) => {
  const { type, service_id, product_id, description, quantity, unit_cost, unit_price, discount } = req.body;
  if (!type || !['service', 'part'].includes(type)) return res.status(400).json({ error: 'type deve ser service ou part' });
  try {
    const r = await db.query(
      `INSERT INTO service_order_items (service_order_id,type,service_id,product_id,description,quantity,unit_cost,unit_price,discount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, type, service_id||null, product_id||null, description||null,
       parseFloat(quantity)||1, parseFloat(unit_cost)||0, parseFloat(unit_price)||0, parseFloat(discount)||0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id/items/:itemId', async (req, res, next) => {
  const { description, quantity, unit_cost, unit_price, discount } = req.body;
  try {
    const r = await db.query(
      `UPDATE service_order_items SET description=$1,quantity=$2,unit_cost=$3,unit_price=$4,discount=$5
       WHERE id=$6 AND service_order_id=$7 RETURNING *`,
      [description||null, parseFloat(quantity)||1, parseFloat(unit_cost)||0, parseFloat(unit_price)||0, parseFloat(discount)||0,
       req.params.itemId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Item nÃ£o encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    await db.query('DELETE FROM service_order_items WHERE id=$1 AND service_order_id=$2', [req.params.itemId, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// â”€â”€ Baixar peÃ§a do estoque â”€â”€
router.post('/:id/items/:itemId/deduct', async (req, res, next) => {
  try {
    const item = (await db.query('SELECT * FROM service_order_items WHERE id=$1 AND service_order_id=$2', [req.params.itemId, req.params.id])).rows[0];
    if (!item) return res.status(404).json({ error: 'Item nÃ£o encontrado' });
    if (!item.product_id) return res.status(400).json({ error: 'Item nÃ£o Ã© peÃ§a (sem product_id)' });
    if (item.stock_deducted) return res.status(400).json({ error: 'PeÃ§a jÃ¡ baixada' });
    const prod = (await db.query('SELECT * FROM products WHERE id=$1', [item.product_id])).rows[0];
    if (!prod) return res.status(404).json({ error: 'Produto nÃ£o encontrado' });
    const qty = parseFloat(item.quantity) || 1;
    if (prod.stock_quantity < qty) return res.status(400).json({ error: `Estoque insuficiente. DisponÃ­vel: ${prod.stock_quantity}` });
    await db.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id=$2', [qty, item.product_id]);
    await db.query('INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [item.product_id, 'out', -qty, prod.stock_quantity, prod.stock_quantity - qty, `OS ${req.params.id}`, req.params.id, 'service_order', req.user.id]);
    await db.query('UPDATE service_order_items SET stock_deducted=true WHERE id=$1', [req.params.itemId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// â”€â”€ Checklist â”€â”€
const CHECKLIST_ENTRY = [
  { key:'liga', label:'Liga' },
  { key:'tela_trincada', label:'Tela trincada' },
  { key:'camera_ok', label:'CÃ¢mera ok' },
  { key:'biometria_ok', label:'Biometria ok' },
  { key:'oxidaÃ§Ã£o', label:'Sinais de oxidaÃ§Ã£o' },
];
const CHECKLIST_EXIT = [
  { key:'carregamento', label:'Carregamento ok' },
  { key:'sinal', label:'Sinal/chip ok' },
  { key:'wifi', label:'Wi-Fi/BT ok' },
  { key:'camera', label:'CÃ¢mera ok' },
  { key:'audio', label:'Ãudio ok' },
  { key:'sensores', label:'Sensores ok' },
  { key:'bateria', label:'Bateria ok' },
];

router.get('/:id/checklist-template', (req, res) => res.json({ entry: CHECKLIST_ENTRY, exit: CHECKLIST_EXIT }));

router.post('/:id/apply-checklist-templates', async (req, res, next) => {
  try {
    const templates = (await db.query('SELECT * FROM service_checklist_templates ORDER BY phase, sort_order, id')).rows;
    const existing = (await db.query('SELECT item_key, phase FROM service_order_checklists WHERE service_order_id=$1', [req.params.id])).rows;
    const existingSet = new Set(existing.map(e => `${e.phase}:${e.item_key}`));
    const added = [];
    for (const t of templates) {
      const k = `${t.phase}:${t.item_key}`;
      if (existingSet.has(k)) continue;
      const r = await db.query(
        `INSERT INTO service_order_checklists (service_order_id,phase,item_key,label) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, t.phase, t.item_key, t.label]
      );
      added.push(r.rows[0]);
      existingSet.add(k);
    }
    res.json({ added, count: added.length });
  } catch (e) { next(e); }
});

router.post('/:id/checklist', async (req, res, next) => {
  const { phase, item_key, label, value } = req.body;
  if (!phase || !item_key) return res.status(400).json({ error: 'phase e item_key obrigatÃ³rios' });
  try {
    const hasValue = value != null && String(value).trim() !== '';
    const checkedAt = hasValue ? new Date() : null;
    const r = await db.query(
      `INSERT INTO service_order_checklists (service_order_id,phase,item_key,label,value,checked_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, phase, item_key, label || null, value || null, checkedAt]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id/checklist/:ckId', async (req, res, next) => {
  const { value } = req.body;
  try {
    const hasValue = value != null && value !== false && value !== 'false' && String(value).trim() !== '';
    const checkedAt = hasValue ? new Date() : null;
    const r = await db.query(
      `UPDATE service_order_checklists SET value=$1, checked_at=$2
       WHERE id=$3 AND service_order_id=$4 RETURNING *`,
      [value || null, checkedAt, req.params.ckId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Item nÃ£o encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id/checklist/:ckId', async (req, res, next) => {
  try {
    await db.query('DELETE FROM service_order_checklists WHERE id=$1 AND service_order_id=$2', [req.params.ckId, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// â”€â”€ AprovaÃ§Ã£o â”€â”€
router.post('/:id/approve', async (req, res, next) => {
  const { approved, notes } = req.body;
  try {
    const r = await db.query(
      `INSERT INTO service_order_approvals (service_order_id,approved,notes,user_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, !!approved, notes||null, req.user.id]
    );
    await db.query('UPDATE service_orders SET status=$1,updated_at=NOW() WHERE id=$2', [approved ? 'repair' : 'cancelled', req.params.id]);
    await logChange(req.params.id, 'approval', approved ? 'approved' : 'rejected', null, notes, req.user.id);
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// â”€â”€ WhatsApp â”€â”€
router.post('/:id/wa-send', async (req, res, next) => {
  const { template, message, phone } = req.body;
  try {
    const os = (await db.query(
      `SELECT so.*, c.name as client_name, c.phone as client_phone FROM service_orders so
       LEFT JOIN clients c ON c.id=so.client_id WHERE so.id=$1`,
      [req.params.id]
    )).rows[0];
    if (!os) return res.status(404).json({ error: 'OS nÃ£o encontrada' });
    const itemsRes = await db.query(
      `SELECT soi.*, ss.name as service_name, p.name as product_name
       FROM service_order_items soi
       LEFT JOIN service_services ss ON ss.id=soi.service_id
       LEFT JOIN products p ON p.id=soi.product_id
       WHERE soi.service_order_id=$1 ORDER BY soi.id`,
      [req.params.id]
    );
    os.items = itemsRes.rows;
    const ph = phone || os.client_phone || os.walk_in_phone;
    if (!ph) return res.status(400).json({ error: 'Telefone nÃ£o informado' });
    let text = message;
    if (!text && template) {
      const tplMap = await getWaTemplateMap();
      const tpl = tplMap[template] || tplMap.ready || WA_TEMPLATES.ready;
      text = interpolateMessage(String(tpl), os);
    } else if (text) {
      text = interpolateMessage(text, os);
    }
    if (!text) return res.status(400).json({ error: 'Mensagem ou template obrigatÃ³rio' });
    const inst = (await db.query("SELECT * FROM wa_instances WHERE status='connected' AND active=true ORDER BY id LIMIT 1")).rows[0];
    if (!inst) return res.status(400).json({ error: 'Nenhuma instÃ¢ncia WhatsApp conectada' });
    const phoneNorm = normalizePhone(ph);
    const evoResp = await evo.sendText(inst.name, phoneNorm, text);
    await db.query(
      `INSERT INTO service_order_messages (service_order_id,template,message,phone,status,sent_at,user_id)
       VALUES ($1,$2,$3,$4,'sent',NOW(),$5)`,
      [req.params.id, template||null, text, ph, req.user.id]
    );

    // Sincronizar com wa_messages/wa_conversations para aparecer no mÃ³dulo WhatsApp
    const waMessageId = evoResp?.data?.key?.id || null;
    let conv = (await db.query(
      'SELECT * FROM wa_conversations WHERE instance_id=$1 AND contact_phone=$2 ORDER BY id DESC LIMIT 1',
      [inst.id, phoneNorm]
    )).rows[0];
    if (!conv) {
      const dept = (await db.query('SELECT id FROM wa_departments WHERE active=true ORDER BY id LIMIT 1')).rows[0];
      const contactName = os.client_name || os.walk_in_name || null;
      conv = (await db.query(
        "INSERT INTO wa_conversations (instance_id,contact_phone,contact_name,department_id,status,bot_active) VALUES ($1,$2,$3,$4,'queue',false) RETURNING *",
        [inst.id, phoneNorm, contactName, dept?.id || null]
      )).rows[0];
    }
    const msgInsert = await db.query(
      "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,status,sent_by,is_bot) VALUES ($1,$2,'out','text',$3,'sent',$4,false) RETURNING *",
      [conv.id, waMessageId, text, req.user.id]
    );
    await db.query(
      'UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
      [text.substring(0, 100), conv.id]
    );
    const fullConv = (await db.query(
      `SELECT c.*,d.name as dept_name,d.color as dept_color,u.name as agent_name,i.name as instance_name,
              lm.last_message_id,lm.last_message_type
       FROM wa_conversations c
       LEFT JOIN wa_departments d ON d.id=c.department_id
       LEFT JOIN users u ON u.id=c.assigned_to
       LEFT JOIN wa_instances i ON i.id=c.instance_id
       LEFT JOIN LATERAL (SELECT id as last_message_id, type as last_message_type FROM wa_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
       WHERE c.id=$1`,
      [conv.id]
    )).rows[0];
    const savedMsg = msgInsert.rows[0];
    const { media_base64, ...msgClean } = savedMsg;
    ws.emitInbox({ type: 'new_message', conversation: fullConv, message: { ...msgClean, has_media: !!media_base64 } });
    ws.emitConversation(conv.id, { type: 'message', message: { ...msgClean, has_media: !!media_base64 } });

    res.json({ success: true, data: evoResp });
  } catch (e) { next(e); }
});

// â”€â”€ Termo de garantia â”€â”€
router.get('/:id/warranty-term.pdf', async (req, res, next) => {
  try {
    const os = await loadWarrantyTermData(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS nÃ£o encontrada' });

    const companyName = await getWarrantyTermCompanyName();
    const fileName = buildWarrantyTermFileName(os);
    const pdfBuffer = buildWarrantyTermPdfBuffer(os, companyName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (e) { next(e); }
});

router.post('/:id/wa-send-warranty-term', async (req, res, next) => {
  try {
    const os = await loadWarrantyTermData(req.params.id);
    if (!os) return res.status(404).json({ error: 'OS nÃ£o encontrada' });

    const ph = os.client_phone || os.walk_in_phone;
    if (!ph) return res.status(400).json({ error: 'Telefone nÃ£o informado' });

    const inst = (await db.query("SELECT * FROM wa_instances WHERE status='connected' AND active=true ORDER BY id LIMIT 1")).rows[0];
    if (!inst) return res.status(400).json({ error: 'Nenhuma instÃ¢ncia WhatsApp conectada' });

    const companyName = await getWarrantyTermCompanyName();
    const fileName = buildWarrantyTermFileName(os);
    const pdfBuffer = buildWarrantyTermPdfBuffer(os, companyName);
    const rawBase64 = pdfBuffer.toString('base64');
    const mediaBase64 = `data:application/pdf;base64,${rawBase64}`;
    const phoneNorm = normalizePhone(ph);
    const caption = `PDF do termo de garantia da ${os.number || 'OS'}`;

    const evoResp = await evo.sendMedia(inst.name, phoneNorm, {
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: rawBase64,
      caption,
      fileName,
    });
    if (evoResp?.status >= 400) {
      const evoErr = evoResp?.data?.message || evoResp?.data?.error || JSON.stringify(evoResp?.data) || `Erro Evolution API (${evoResp.status})`;
      return res.status(502).json({ error: `Falha ao enviar PDF: ${evoErr}` });
    }

    const logRes = await db.query(
      `INSERT INTO service_order_messages (service_order_id,template,message,phone,status,sent_at,user_id)
       VALUES ($1,$2,$3,$4,'sent',NOW(),$5) RETURNING *`,
      [req.params.id, 'warranty_term', `PDF do termo de garantia enviado: ${fileName}`, ph, req.user.id]
    );

    const conv = await ensureWaConversation(inst.id, phoneNorm, os.client_name || os.walk_in_name || null);
    const waMessageId = evoResp?.data?.key?.id || null;
    const msgInsert = await db.query(
      "INSERT INTO wa_messages (conversation_id,wa_message_id,direction,type,body,media_base64,media_mimetype,media_filename,sent_by,is_bot,status) VALUES ($1,$2,'out','document',$3,$4,$5,$6,$7,false,'sent') RETURNING *",
      [conv.id, waMessageId, caption, mediaBase64, 'application/pdf', fileName, req.user.id]
    );
    await db.query(
      'UPDATE wa_conversations SET last_message=$1,last_message_at=NOW(),updated_at=NOW() WHERE id=$2',
      [caption, conv.id]
    );

    const fullConv = await getWaConversationFull(conv.id);
    const cleanMessage = stripWaMessageMedia(msgInsert.rows[0]);
    ws.emitInbox({ type: 'new_message', conversation: fullConv, message: cleanMessage });
    ws.emitConversation(conv.id, { type: 'message', message: cleanMessage });

    res.json({ success: true, fileName, log: logRes.rows[0] });
  } catch (e) { next(e); }
});
router.get('/meta/technicians', async (req, res, next) => {
  try {
    const r = await db.query('SELECT id, name FROM users WHERE active=true ORDER BY name');
    res.json(r.rows);
  } catch (e) { next(e); }
});

module.exports = router;
