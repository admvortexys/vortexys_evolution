'use strict';
const router = require('express').Router();
const db = require('../database/db');
const evo = require('../services/evolutionApi');
const ws = require('../services/wsServer');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(auth);
router.use(requirePermission('crm')); // Assistência usa permissão CRM

const STATUSES = [
  { slug:'received', label:'Recebido', color:'#6b7280' },
  { slug:'analysis', label:'Em análise', color:'#3b82f6' },
  { slug:'awaiting_approval', label:'Aguardando aprovação', color:'#f59e0b' },
  { slug:'awaiting_part', label:'Aguardando peça', color:'#f97316' },
  { slug:'repair', label:'Em reparo', color:'#8b5cf6' },
  { slug:'testing', label:'Testes', color:'#06b6d4' },
  { slug:'ready', label:'Pronto para retirada', color:'#10b981' },
  { slug:'delivered', label:'Entregue', color:'#22c55e' },
  { slug:'cancelled', label:'Cancelado', color:'#ef4444' },
];

const WA_TEMPLATES = {
  received: 'Olá {nome}! Recebemos seu aparelho na assistência. Em breve entraremos em contato com o orçamento.\n\nAcompanhe: {link}',
  quote_ready: 'Olá {nome}! O orçamento da sua OS #{numero} está pronto. Aguardamos sua aprovação.\n\nAcompanhe: {link}',
  awaiting_approval: 'Olá {nome}! Estamos aguardando sua aprovação do orçamento da OS #{numero}.\n\nAcompanhe: {link}',
  part_arrived: 'Olá {nome}! A peça da sua OS #{numero} chegou. Em breve concluiremos o reparo.\n\nAcompanhe: {link}',
  ready: 'Olá {nome}! Seu aparelho da OS #{numero} está pronto para retirada. Horário: 9h às 18h.\n\nAcompanhe: {link}',
  delivered: 'Olá {nome}! Obrigado por retirar seu aparelho. Garantia de {dias} dias.',
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

// ── Status ──
router.get('/statuses', (req, res) => res.json(STATUSES));

// ── Serviços ──
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
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
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
    if (!r.rows.length) return res.status(404).json({ error: 'Serviço não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/services/:id', async (req, res, next) => {
  try {
    await db.query('UPDATE service_services SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Templates WhatsApp (configuráveis via settings) ──
const WA_TEMPLATE_LABELS = { received: 'Recebemos seu aparelho', quote_ready: 'Orçamento pronto', awaiting_approval: 'Aguardando aprovação', part_arrived: 'Peça chegou', ready: 'Pronto para retirada', delivered: 'Entregue' };
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

function getPortalLink(number) {
  if (!PORTAL_BASE) return '';
  const num = String(number || '').replace(/^OS-?/i, '').trim();
  return `${PORTAL_BASE.replace(/\/$/, '')}/os/${num}`;
}

function interpolateMessage(text, os) {
  if (!text) return '';
  const link = getPortalLink(os?.number);
  return String(text)
    .replace(/{nome}/g, os?.client_name || os?.walk_in_name || 'Cliente')
    .replace(/{numero}/g, os?.number || '')
    .replace(/{dias}/g, String(os?.warranty_days ?? 90))
    .replace(/{link}/g, link);
}

const STATUS_TO_TEMPLATE = {
  awaiting_approval: 'quote_ready',
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

// ── Checklist templates (padrão configurável) ──
router.get('/checklist-templates', async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM service_checklist_templates ORDER BY phase, sort_order, id');
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/checklist-templates', async (req, res, next) => {
  const { phase, item_key, label, sort_order } = req.body;
  if (!phase || !label) return res.status(400).json({ error: 'phase e label obrigatórios' });
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

// ── Listar OS ──
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

// ── KPIs ──
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

// ── Criar OS ──
router.post('/', async (req, res, next) => {
  const { client_id, walk_in_name, walk_in_phone, walk_in_doc } = req.body;
  if (!client_id && !walk_in_name) return res.status(400).json({ error: 'Cliente ou nome é obrigatório' });
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('LOCK TABLE service_orders IN SHARE ROW EXCLUSIVE MODE');
    const cnt = await conn.query('SELECT COUNT(*) FROM service_orders');
    const num = `OS-${String(parseInt(cnt.rows[0].count) + 1).padStart(5, '0')}`;
    const r = await conn.query(
      `INSERT INTO service_orders (number,client_id,walk_in_name,walk_in_phone,walk_in_doc,status,user_id)
       VALUES ($1,$2,$3,$4,$5,'received',$6) RETURNING *`,
      [num, client_id || null, walk_in_name || null, walk_in_phone || null, walk_in_doc || null, req.user.id]
    );
    await conn.query(
      'INSERT INTO service_order_logs (service_order_id,action,user_id) VALUES ($1,$2,$3)',
      [r.rows[0].id, 'created', req.user.id]
    );
    await conn.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (e) { await conn.query('ROLLBACK'); next(e); }
});

// ── Detalhe OS ──
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
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
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

// ── Atualizar OS ──
router.put('/:id', async (req, res, next) => {
  const { defect_reported, accessories, device_state, password_informed, photos, initial_quote,
    warranty_days, warranty_part_days, notes, estimated_at, priority, technician_id } = req.body;
  try {
    const old = (await db.query('SELECT * FROM service_orders WHERE id=$1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'OS não encontrada' });
    const r = await db.query(
      `UPDATE service_orders SET defect_reported=$1,accessories=$2,device_state=$3,password_informed=$4,
        photos=$5,initial_quote=$6,warranty_days=$7,warranty_part_days=$8,notes=$9,
        estimated_at=$10,priority=$11,technician_id=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [defect_reported||null, accessories||null, device_state||null, password_informed,
       photos ? JSON.stringify(photos) : old.photos, initial_quote, warranty_days, warranty_part_days,
       notes||null, estimated_at||null, priority||'normal', technician_id||null, req.params.id]
    );
    if (technician_id !== undefined && technician_id !== old.technician_id)
      await logChange(req.params.id, 'technician_changed', 'technician_id', old.technician_id, technician_id, req.user.id);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ── Adicionar dispositivo ──
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

// ── Atualizar dispositivo ──
router.put('/:id/devices/:devId', async (req, res, next) => {
  const { brand, model, color, storage, imei, serial } = req.body;
  try {
    const r = await db.query(
      `UPDATE service_order_devices SET brand=$1,model=$2,color=$3,storage=$4,imei=$5,serial=$6
       WHERE id=$7 AND service_order_id=$8 RETURNING *`,
      [brand||null, model||null, color||null, storage||null, imei||null, serial||null, req.params.devId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Dispositivo não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ── Mudar status ──
router.patch('/:id/status', async (req, res, next) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status obrigatório' });
  try {
    const old = (await db.query('SELECT * FROM service_orders WHERE id=$1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'OS não encontrada' });
    const updates = { status };
    if (status === 'ready') updates.completed_at = new Date().toISOString();
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();
    const r = await db.query(
      `UPDATE service_orders SET status=$1,completed_at=$2,delivered_at=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status, updates.completed_at || null, updates.delivered_at || null, req.params.id]
    );
    await logChange(req.params.id, 'status_changed', 'status', old.status, status, req.user.id);

    // Disparo automático de WhatsApp ao mudar status
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
      } catch (waErr) { console.warn('[OS] Envio automático WA falhou:', waErr.message); }
    }

    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ── Itens do orçamento ──
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
    if (!r.rows.length) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    await db.query('DELETE FROM service_order_items WHERE id=$1 AND service_order_id=$2', [req.params.itemId, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Baixar peça do estoque ──
router.post('/:id/items/:itemId/deduct', async (req, res, next) => {
  try {
    const item = (await db.query('SELECT * FROM service_order_items WHERE id=$1 AND service_order_id=$2', [req.params.itemId, req.params.id])).rows[0];
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (!item.product_id) return res.status(400).json({ error: 'Item não é peça (sem product_id)' });
    if (item.stock_deducted) return res.status(400).json({ error: 'Peça já baixada' });
    const prod = (await db.query('SELECT * FROM products WHERE id=$1', [item.product_id])).rows[0];
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });
    const qty = parseFloat(item.quantity) || 1;
    if (prod.stock_quantity < qty) return res.status(400).json({ error: `Estoque insuficiente. Disponível: ${prod.stock_quantity}` });
    await db.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id=$2', [qty, item.product_id]);
    await db.query('INSERT INTO stock_movements (product_id,type,quantity,previous_qty,new_qty,reason,reference_id,reference_type,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [item.product_id, 'out', -qty, prod.stock_quantity, prod.stock_quantity - qty, `OS ${req.params.id}`, req.params.id, 'service_order', req.user.id]);
    await db.query('UPDATE service_order_items SET stock_deducted=true WHERE id=$1', [req.params.itemId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Checklist ──
const CHECKLIST_ENTRY = [
  { key:'liga', label:'Liga' },
  { key:'tela_trincada', label:'Tela trincada' },
  { key:'camera_ok', label:'Câmera ok' },
  { key:'biometria_ok', label:'Biometria ok' },
  { key:'oxidação', label:'Sinais de oxidação' },
];
const CHECKLIST_EXIT = [
  { key:'carregamento', label:'Carregamento ok' },
  { key:'sinal', label:'Sinal/chip ok' },
  { key:'wifi', label:'Wi-Fi/BT ok' },
  { key:'camera', label:'Câmera ok' },
  { key:'audio', label:'Áudio ok' },
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
  if (!phase || !item_key) return res.status(400).json({ error: 'phase e item_key obrigatórios' });
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
    if (!r.rows.length) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id/checklist/:ckId', async (req, res, next) => {
  try {
    await db.query('DELETE FROM service_order_checklists WHERE id=$1 AND service_order_id=$2', [req.params.ckId, req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Aprovação ──
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

// ── WhatsApp ──
router.post('/:id/wa-send', async (req, res, next) => {
  const { template, message, phone } = req.body;
  try {
    const os = (await db.query(
      `SELECT so.*, c.name as client_name, c.phone as client_phone FROM service_orders so
       LEFT JOIN clients c ON c.id=so.client_id WHERE so.id=$1`,
      [req.params.id]
    )).rows[0];
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    const ph = phone || os.client_phone || os.walk_in_phone;
    if (!ph) return res.status(400).json({ error: 'Telefone não informado' });
    let text = message;
    if (!text && template) {
      const tplMap = await getWaTemplateMap();
      const tpl = tplMap[template] || tplMap.ready || WA_TEMPLATES.ready;
      text = interpolateMessage(String(tpl), os);
    } else if (text) {
      text = interpolateMessage(text, os);
    }
    if (!text) return res.status(400).json({ error: 'Mensagem ou template obrigatório' });
    const inst = (await db.query("SELECT * FROM wa_instances WHERE status='connected' AND active=true ORDER BY id LIMIT 1")).rows[0];
    if (!inst) return res.status(400).json({ error: 'Nenhuma instância WhatsApp conectada' });
    const phoneNorm = normalizePhone(ph);
    const evoResp = await evo.sendText(inst.name, phoneNorm, text);
    await db.query(
      `INSERT INTO service_order_messages (service_order_id,template,message,phone,status,sent_at,user_id)
       VALUES ($1,$2,$3,$4,'sent',NOW(),$5)`,
      [req.params.id, template||null, text, ph, req.user.id]
    );

    // Sincronizar com wa_messages/wa_conversations para aparecer no módulo WhatsApp
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

// ── Usuários (técnicos) ──
router.get('/meta/technicians', async (req, res, next) => {
  try {
    const r = await db.query('SELECT id, name FROM users WHERE active=true ORDER BY name');
    res.json(r.rows);
  } catch (e) { next(e); }
});

module.exports = router;
