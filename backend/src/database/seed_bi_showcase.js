'use strict';

const fs = require('fs');
const path = require('path');

loadEnvFile(path.resolve(__dirname, '../../../.env'));
loadEnvFile(path.resolve(__dirname, '../../.env'));

const db = require('./db');

const SEED_TAG = '[BI6M-SEED]';

const SELLERS = [
  { name: 'Bruno Sales', email: 'bruno.sales@bi6m.demo', phone: '(11) 91000-1001', commission: 4.5, goal: 32000 },
  { name: 'Carla Nunes', email: 'carla.nunes@bi6m.demo', phone: '(11) 91000-1002', commission: 5.0, goal: 36000 },
  { name: 'Diego Freitas', email: 'diego.freitas@bi6m.demo', phone: '(11) 91000-1003', commission: 5.5, goal: 40000 },
  { name: 'Elisa Prado', email: 'elisa.prado@bi6m.demo', phone: '(11) 91000-1004', commission: 6.0, goal: 42000 },
  { name: 'Felipe Moura', email: 'felipe.moura@bi6m.demo', phone: '(11) 91000-1005', commission: 5.0, goal: 34000 },
  { name: 'Giovana Reis', email: 'giovana.reis@bi6m.demo', phone: '(11) 91000-1006', commission: 5.8, goal: 38000 },
];

const CLIENTS = [
  { type: 'client', name: 'Arthur Pires', email: 'arthur.pires@bi6m.demo', phone: '(11) 92000-2001', city: 'Sao Paulo', state: 'SP', document: '111.111.111-11' },
  { type: 'client', name: 'Bianca Torres', email: 'bianca.torres@bi6m.demo', phone: '(11) 92000-2002', city: 'Campinas', state: 'SP', document: '222.222.222-22' },
  { type: 'client', name: 'Caio Ventura', email: 'caio.ventura@bi6m.demo', phone: '(11) 92000-2003', city: 'Osasco', state: 'SP', document: '333.333.333-33' },
  { type: 'client', name: 'Daniela Porto', email: 'daniela.porto@bi6m.demo', phone: '(11) 92000-2004', city: 'Guarulhos', state: 'SP', document: '444.444.444-44' },
  { type: 'client', name: 'Eduardo Luz', email: 'eduardo.luz@bi6m.demo', phone: '(11) 92000-2005', city: 'Barueri', state: 'SP', document: '555.555.555-55' },
  { type: 'client', name: 'Fernanda Araujo', email: 'fernanda.araujo@bi6m.demo', phone: '(11) 92000-2006', city: 'Santo Andre', state: 'SP', document: '666.666.666-66' },
  { type: 'company', name: 'Orbit Tech Ltda', email: 'compras@orbit-tech.bi6m.demo', phone: '(11) 3300-2007', city: 'Sao Paulo', state: 'SP', document: '12.345.678/0001-10' },
  { type: 'company', name: 'Lumina Retail SA', email: 'suprimentos@lumina.bi6m.demo', phone: '(11) 3300-2008', city: 'Campinas', state: 'SP', document: '23.456.789/0001-20' },
  { type: 'company', name: 'Studio Link ME', email: 'financeiro@studiolink.bi6m.demo', phone: '(11) 3300-2009', city: 'Sao Jose', state: 'SP', document: '34.567.890/0001-30' },
  { type: 'company', name: 'Ponto Digital Comercio', email: 'pedidos@pontodigital.bi6m.demo', phone: '(11) 3300-2010', city: 'Sorocaba', state: 'SP', document: '45.678.901/0001-40' },
  { type: 'company', name: 'Nova Base Sistemas', email: 'compras@novabase.bi6m.demo', phone: '(11) 3300-2011', city: 'Sao Paulo', state: 'SP', document: '56.789.012/0001-50' },
  { type: 'client', name: 'Gabriel Serra', email: 'gabriel.serra@bi6m.demo', phone: '(11) 92000-2012', city: 'Maua', state: 'SP', document: '777.777.777-77' },
];

const PRODUCT_CATEGORIES = [
  'BI Smartphones',
  'BI Computadores',
  'BI Perifericos',
  'BI Audio',
  'BI Acessorios',
  'BI Energia',
];

const PRODUCTS = [
  { sku: 'BI6M-PH-01', name: 'Smartphone Orion X', category: 'BI Smartphones', cost: 1220, price: 1899, stock: 18, min: 4 },
  { sku: 'BI6M-PH-02', name: 'Smartphone Vega Max', category: 'BI Smartphones', cost: 1480, price: 2299, stock: 9, min: 3 },
  { sku: 'BI6M-NB-01', name: 'Notebook Atlas 14', category: 'BI Computadores', cost: 2480, price: 3799, stock: 7, min: 2 },
  { sku: 'BI6M-NB-02', name: 'Notebook Pulse 15', category: 'BI Computadores', cost: 1980, price: 3099, stock: 5, min: 2 },
  { sku: 'BI6M-MN-01', name: 'Monitor Horizon 27', category: 'BI Perifericos', cost: 990, price: 1699, stock: 6, min: 2 },
  { sku: 'BI6M-KB-01', name: 'Teclado Flux Mechanical', category: 'BI Perifericos', cost: 210, price: 449, stock: 11, min: 5 },
  { sku: 'BI6M-MS-01', name: 'Mouse Nova Wireless', category: 'BI Perifericos', cost: 110, price: 249, stock: 8, min: 6 },
  { sku: 'BI6M-AU-01', name: 'Headset Echo Pro', category: 'BI Audio', cost: 260, price: 599, stock: 4, min: 4 },
  { sku: 'BI6M-AU-02', name: 'Caixa Stage Mini', category: 'BI Audio', cost: 190, price: 429, stock: 6, min: 3 },
  { sku: 'BI6M-AC-01', name: 'Webcam Studio 4K', category: 'BI Acessorios', cost: 280, price: 699, stock: 10, min: 4 },
  { sku: 'BI6M-AC-02', name: 'Hub USB-C Dock', category: 'BI Acessorios', cost: 140, price: 329, stock: 5, min: 5 },
  { sku: 'BI6M-EN-01', name: 'Powerbank Nitro 20K', category: 'BI Energia', cost: 130, price: 299, stock: 3, min: 4 },
  { sku: 'BI6M-EN-02', name: 'Carregador GaN 65W', category: 'BI Energia', cost: 85, price: 199, stock: 12, min: 6 },
];

const FINANCIAL_CATEGORIES = [
  { name: 'BI Receitas de pedidos', type: 'income', color: '#22c55e' },
  { name: 'BI Receitas de servicos', type: 'income', color: '#3b82f6' },
  { name: 'BI Aluguel', type: 'expense', color: '#ef4444' },
  { name: 'BI Salarios', type: 'expense', color: '#f59e0b' },
  { name: 'BI Marketing', type: 'expense', color: '#06b6d4' },
  { name: 'BI Logistica', type: 'expense', color: '#84cc16' },
  { name: 'BI Operacao', type: 'expense', color: '#a855f7' },
];

const PIPELINES = [
  { name: 'BI Novo Lead', color: '#6366f1', position: 0 },
  { name: 'BI Qualificacao', color: '#8b5cf6', position: 1 },
  { name: 'BI Proposta', color: '#3b82f6', position: 2 },
  { name: 'BI Negociacao', color: '#f59e0b', position: 3 },
  { name: 'BI Fechamento', color: '#22c55e', position: 4 },
];

const SERVICE_CATALOG = [
  { name: 'BI Diagnostico premium', price: 180, avg_time_mins: 50 },
  { name: 'BI Troca de tela', price: 490, avg_time_mins: 120 },
  { name: 'BI Troca de bateria', price: 320, avg_time_mins: 90 },
  { name: 'BI Limpeza tecnica', price: 210, avg_time_mins: 60 },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toStamp(date, hour = 10) {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function monthBase(offsetFromCurrent) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offsetFromCurrent, 1, 10, 0, 0, 0);
}

function monthKey(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}`;
}

function monthDay(date, desiredDay) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth(), Math.min(desiredDay, lastDay), 10, 0, 0, 0);
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function rotate(list, idx) {
  return list[idx % list.length];
}

async function ensureSeedUser(client) {
  const existing = await client.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO users (name, username, email, password, role, active, permissions, force_password_change)
     VALUES ($1, $2, $3, $4, $5, true, $6::jsonb, false)
     RETURNING id`,
    [
      'BI Seed User',
      'bi-seed',
      'bi.seed@vortexys.local',
      'bi-seed-only',
      'admin',
      JSON.stringify({
        dashboard: true,
        products: true,
        stock: true,
        orders: true,
        clients: true,
        sellers: true,
        crm: true,
        whatsapp: true,
        financial: true,
        settings: true,
      }),
    ]
  );

  return inserted.rows[0].id;
}

async function getOrCreateCategory(client, name, type = 'product', color = '#7c3aed') {
  const existing = await client.query(
    `SELECT id FROM categories WHERE name = $1 AND type = $2 ORDER BY id ASC LIMIT 1`,
    [name, type]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO categories (name, type, color) VALUES ($1, $2, $3) RETURNING id`,
    [name, type, color]
  );
  return inserted.rows[0].id;
}

async function getOrCreateWarehouse(client, name) {
  const existing = await client.query(`SELECT id FROM warehouses WHERE name = $1 ORDER BY id ASC LIMIT 1`, [name]);
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO warehouses (name, location, active) VALUES ($1, $2, true) RETURNING id`,
    [name, 'Showcase BI']
  );
  return inserted.rows[0].id;
}

async function getOrCreateFinancialCategory(client, item) {
  const existing = await client.query(
    `SELECT id FROM financial_categories WHERE name = $1 AND type = $2 ORDER BY id ASC LIMIT 1`,
    [item.name, item.type]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO financial_categories (name, type, color, active) VALUES ($1, $2, $3, true) RETURNING id`,
    [item.name, item.type, item.color]
  );
  return inserted.rows[0].id;
}

async function getOrCreatePipeline(client, item) {
  const existing = await client.query(`SELECT id FROM pipelines WHERE name = $1 ORDER BY id ASC LIMIT 1`, [item.name]);
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO pipelines (name, color, position) VALUES ($1, $2, $3) RETURNING id`,
    [item.name, item.color, item.position]
  );
  return inserted.rows[0].id;
}

async function getOrCreateService(client, item) {
  const existing = await client.query(`SELECT id FROM service_services WHERE name = $1 ORDER BY id ASC LIMIT 1`, [item.name]);
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO service_services (name, description, avg_time_mins, default_price, active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [item.name, SEED_TAG, item.avg_time_mins, item.price]
  );
  return inserted.rows[0].id;
}

async function cleanupSeedData(client) {
  await client.query(`DELETE FROM transactions WHERE notes = $1`, [SEED_TAG]);

  await client.query(`
    DELETE FROM return_items
    WHERE return_id IN (SELECT id FROM returns WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`DELETE FROM returns WHERE notes = $1`, [SEED_TAG]);

  await client.query(`
    DELETE FROM service_order_messages
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`
    DELETE FROM service_order_logs
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`
    DELETE FROM service_order_approvals
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`
    DELETE FROM service_order_checklists
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`
    DELETE FROM service_order_items
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`
    DELETE FROM service_order_devices
    WHERE service_order_id IN (SELECT id FROM service_orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`DELETE FROM service_orders WHERE notes = $1`, [SEED_TAG]);

  await client.query(`DELETE FROM activities WHERE description = $1 OR title LIKE 'BI6M %'`, [SEED_TAG]);
  await client.query(`DELETE FROM leads WHERE notes = $1`, [SEED_TAG]);

  await client.query(`
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE notes = $1)
  `, [SEED_TAG]);
  await client.query(`DELETE FROM orders WHERE notes = $1`, [SEED_TAG]);

  await client.query(`DELETE FROM products WHERE sku LIKE 'BI6M-%'`);
  await client.query(`DELETE FROM sellers WHERE email LIKE '%@bi6m.demo'`);
  await client.query(`DELETE FROM clients WHERE email LIKE '%@bi6m.demo'`);
}

async function ensureSupportData(client) {
  const warehouseId = await getOrCreateWarehouse(client, 'BI Showcase Warehouse');

  const categoryIds = {};
  for (let idx = 0; idx < PRODUCT_CATEGORIES.length; idx += 1) {
    categoryIds[PRODUCT_CATEGORIES[idx]] = await getOrCreateCategory(
      client,
      PRODUCT_CATEGORIES[idx],
      'product',
      ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'][idx % 6]
    );
  }

  const financialCategoryIds = {};
  for (const item of FINANCIAL_CATEGORIES) {
    financialCategoryIds[item.name] = await getOrCreateFinancialCategory(client, item);
  }

  const pipelineIds = [];
  for (const item of PIPELINES) {
    pipelineIds.push(await getOrCreatePipeline(client, item));
  }

  const serviceIds = [];
  for (const item of SERVICE_CATALOG) {
    serviceIds.push(await getOrCreateService(client, item));
  }

  const accounts = await client.query(
    `SELECT id, type, name FROM financial_accounts WHERE active = true ORDER BY id ASC`
  );
  const accountByType = new Map(accounts.rows.map(row => [row.type, row.id]));

  const sellers = [];
  for (const item of SELLERS) {
    const inserted = await client.query(
      `INSERT INTO sellers (name, email, phone, commission, goal, active, notes)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, name, commission`,
      [item.name, item.email, item.phone, item.commission, item.goal, SEED_TAG]
    );
    sellers.push(inserted.rows[0]);
  }

  const clients = [];
  for (const item of CLIENTS) {
    const inserted = await client.query(
      `INSERT INTO clients (type, name, document, email, phone, city, state, active, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
       RETURNING id, name, type`,
      [item.type, item.name, item.document, item.email, item.phone, item.city, item.state, SEED_TAG]
    );
    clients.push(inserted.rows[0]);
  }

  const products = [];
  for (const item of PRODUCTS) {
    const inserted = await client.query(
      `INSERT INTO products
       (sku, name, description, category_id, unit, cost_price, sale_price, stock_quantity, min_stock, warehouse_id, active)
       VALUES ($1, $2, $3, $4, 'un', $5, $6, $7, $8, $9, true)
       RETURNING id, sku, name, sale_price, cost_price, stock_quantity, min_stock`,
      [
        item.sku,
        item.name,
        SEED_TAG,
        categoryIds[item.category],
        item.cost,
        item.price,
        item.stock,
        item.min,
        warehouseId,
      ]
    );
    products.push(inserted.rows[0]);
  }

  return {
    sellers,
    clients,
    products,
    pipelineIds,
    serviceIds,
    financialCategoryIds,
    accountByType,
  };
}

function buildOrderItems(products, monthOffset, orderIdx) {
  const picks = [
    rotate(products, monthOffset * 2 + orderIdx),
    rotate(products, monthOffset * 3 + orderIdx + 2),
    rotate(products, monthOffset * 5 + orderIdx + 4),
  ];

  return picks.slice(0, orderIdx % 2 === 0 ? 3 : 2).map((product, idx) => {
    let quantity = 1;
    const price = Number(product.sale_price);
    if (price < 400) quantity = 2 + ((orderIdx + idx) % 3);
    else if (price < 900) quantity = 1 + ((orderIdx + idx) % 2);
    return {
      product,
      quantity,
      unitPrice: price,
      total: money(quantity * price),
    };
  });
}

async function insertOrder(client, payload) {
  const orderRow = await client.query(
    `INSERT INTO orders
     (number, client_id, seller_id, status, subtotal, discount, total, notes, user_id, stock_deducted, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id, number, client_id, seller_id, total, status, created_at`,
    [
      payload.number,
      payload.clientId,
      payload.sellerId,
      payload.status,
      payload.subtotal,
      payload.discount,
      payload.total,
      SEED_TAG,
      payload.userId,
      payload.stockDeducted,
      payload.createdAt,
    ]
  );

  const order = orderRow.rows[0];
  const items = [];
  for (const item of payload.items) {
    const inserted = await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount, total)
       VALUES ($1, $2, $3, $4, 0, $5)
       RETURNING id, order_id, product_id, quantity, unit_price, total`,
      [order.id, item.product.id, item.quantity, item.unitPrice, item.total]
    );
    items.push(inserted.rows[0]);
  }

  return { order, items };
}

async function seedOrdersAndFinance(client, ctx, userId) {
  const deliveredRefs = [];
  let orderCount = 0;
  let transactionCount = 0;

  const methods = ['pix', 'credito', 'transferencia', 'debito'];
  const monthExpenseTemplates = [
    { title: 'BI Aluguel', amount: 4200, category: 'BI Aluguel' },
    { title: 'BI Salarios', amount: 16500, category: 'BI Salarios' },
    { title: 'BI Marketing', amount: 1900, category: 'BI Marketing' },
    { title: 'BI Logistica', amount: 980, category: 'BI Logistica' },
    { title: 'BI Operacao', amount: 1350, category: 'BI Operacao' },
  ];

  for (let offset = -5; offset <= 0; offset += 1) {
    const monthStart = monthBase(offset);
    const isCurrentMonth = offset === 0;
    const statuses = isCurrentMonth
      ? ['delivered', 'delivered', 'shipped', 'processing', 'confirmed', 'draft', 'cancelled']
      : ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'confirmed', 'cancelled'];

    for (let idx = 0; idx < statuses.length; idx += 1) {
      const status = statuses[idx];
      const orderDate = monthDay(monthStart, 3 + (idx * 4));
      if (isCurrentMonth && orderDate > new Date()) continue;

      const clientRef = rotate(ctx.clients, idx + Math.abs(offset) * 2);
      const seller = rotate(ctx.sellers, idx + Math.abs(offset));
      const items = buildOrderItems(ctx.products, Math.abs(offset), idx);
      const subtotal = money(items.reduce((sum, item) => sum + item.total, 0));
      const discount = status === 'delivered' && idx % 3 === 0 ? money(subtotal * 0.04) : 0;
      const total = money(subtotal - discount);
      const orderNumber = `BI6M-ORD-${monthKey(monthStart)}-${pad(idx + 1)}`;

      const inserted = await insertOrder(client, {
        number: orderNumber,
        clientId: clientRef.id,
        sellerId: seller.id,
        status,
        subtotal,
        discount,
        total,
        items,
        userId,
        stockDeducted: !['draft', 'cancelled'].includes(status),
        createdAt: toStamp(orderDate, 10 + (idx % 4)),
      });

      orderCount += 1;

      if (status === 'delivered') {
        deliveredRefs.push({
          orderId: inserted.order.id,
          number: inserted.order.number,
          clientId: inserted.order.client_id,
          sellerId: inserted.order.seller_id,
          total: inserted.order.total,
          createdAt: inserted.order.created_at,
          firstItem: inserted.items[0],
        });
      }

      if (!['draft', 'cancelled'].includes(status) && idx % 3 !== 1) {
        const dueDate = toYmd(addDays(orderDate, status === 'delivered' ? 3 : 9));
        const paid = offset < 0
          ? status === 'delivered' || status === 'shipped'
          : status === 'delivered' && idx < 2;
        const method = rotate(methods, idx + Math.abs(offset));
        const accountId = ctx.accountByType.get(method === 'pix' ? 'pix' : method === 'credito' || method === 'debito' ? 'card_machine' : 'bank');
        const feeAmount = method === 'credito' ? money(total * 0.025) : 0;

        await client.query(
          `INSERT INTO transactions
           (type, title, amount, original_amount, due_date, paid_date, paid, category_id, client_id, order_id, seller_id,
            notes, user_id, created_at, updated_at, account_id, payment_method, paid_amount, fee_amount)
           VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14, $15, $16, $17)`,
          [
            'income',
            `BI6M Receita ${inserted.order.number}`,
            total,
            dueDate,
            paid ? dueDate : null,
            paid,
            ctx.financialCategoryIds['BI Receitas de pedidos'],
            clientRef.id,
            inserted.order.id,
            seller.id,
            SEED_TAG,
            userId,
            toStamp(orderDate, 12),
            accountId || null,
            method,
            paid ? money(total - feeAmount) : null,
            feeAmount,
          ]
        );
        transactionCount += 1;
      }
    }

    const serviceIncomeDate = monthDay(monthStart, 20);
    if (!isCurrentMonth || serviceIncomeDate <= new Date()) {
      const serviceIncomeAmount = money(1800 + (Math.abs(offset) * 260));
      const servicePaid = offset < 0 || serviceIncomeDate < addDays(new Date(), -3);
      await client.query(
        `INSERT INTO transactions
         (type, title, amount, original_amount, due_date, paid_date, paid, category_id, client_id,
          notes, user_id, created_at, updated_at, account_id, payment_method, paid_amount)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14)`,
        [
          'income',
          `BI6M Contrato de suporte ${monthKey(monthStart)}`,
          serviceIncomeAmount,
          toYmd(serviceIncomeDate),
          servicePaid ? toYmd(serviceIncomeDate) : null,
          servicePaid,
          ctx.financialCategoryIds['BI Receitas de servicos'],
          rotate(ctx.clients, Math.abs(offset)).id,
          SEED_TAG,
          userId,
          toStamp(serviceIncomeDate, 15),
          ctx.accountByType.get('bank') || null,
          'transferencia',
          servicePaid ? serviceIncomeAmount : null,
        ]
      );
      transactionCount += 1;
    }

    for (let idx = 0; idx < monthExpenseTemplates.length; idx += 1) {
      const template = monthExpenseTemplates[idx];
      const dueDate = monthDay(monthStart, 5 + (idx * 5));
      if (isCurrentMonth && dueDate > addDays(new Date(), 5)) continue;

      const paid = offset < 0
        ? true
        : idx === 0 || (idx === 2 && dueDate < new Date());
      const amount = money(template.amount + (Math.abs(offset) * 140) + (idx * 85));

      await client.query(
        `INSERT INTO transactions
         (type, title, amount, original_amount, due_date, paid_date, paid, category_id,
          notes, user_id, created_at, updated_at, account_id, payment_method, paid_amount)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13)`,
        [
          'expense',
          `${template.title} ${monthKey(monthStart)}`,
          amount,
          toYmd(dueDate),
          paid ? toYmd(dueDate) : null,
          paid,
          ctx.financialCategoryIds[template.category],
          SEED_TAG,
          userId,
          toStamp(dueDate, 9),
          ctx.accountByType.get('bank') || null,
          'transferencia',
          paid ? amount : null,
        ]
      );
      transactionCount += 1;
    }
  }

  return { deliveredRefs, orderCount, transactionCount };
}

async function seedLeads(client, ctx, userId) {
  const sources = ['site', 'instagram', 'google', 'whatsapp', 'indicacao', 'linkedin'];
  let leadCount = 0;

  for (let offset = -5; offset <= 0; offset += 1) {
    const monthStart = monthBase(offset);
    const isCurrentMonth = offset === 0;
    const statuses = ['won', 'open', 'won', 'lost', 'open', 'open'];

    for (let idx = 0; idx < statuses.length; idx += 1) {
      const createdAt = monthDay(monthStart, 4 + (idx * 4));
      if (isCurrentMonth && createdAt > new Date()) continue;

      const status = statuses[idx];
      const pipelineId = status === 'won'
        ? rotate(ctx.pipelineIds, ctx.pipelineIds.length - 1)
        : status === 'lost'
          ? rotate(ctx.pipelineIds, ctx.pipelineIds.length - 2)
          : rotate(ctx.pipelineIds, idx);
      const estimatedValue = money(2200 + (idx * 950) + (Math.abs(offset) * 720));

      await client.query(
        `INSERT INTO leads
         (name, company, email, phone, source, pipeline_id, estimated_value, probability, expected_close,
          status, user_id, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
        [
          `BI6M Lead ${monthKey(monthStart)}-${pad(idx + 1)}`,
          idx % 2 === 0 ? `Empresa ${monthKey(monthStart)}-${idx + 1}` : null,
          `lead.${monthKey(monthStart)}.${idx + 1}@bi6m.demo`,
          `(11) 93000-${pad((Math.abs(offset) * 10) + idx + 1)}${pad(idx + 3)}`,
          rotate(sources, idx + Math.abs(offset)),
          pipelineId,
          estimatedValue,
          status === 'won' ? 100 : status === 'lost' ? 0 : 25 + (idx * 10),
          toYmd(addDays(createdAt, 14 + idx)),
          status,
          userId,
          SEED_TAG,
          toStamp(createdAt, 11),
        ]
      );

      leadCount += 1;
    }
  }

  return leadCount;
}

async function seedServiceOrders(client, ctx, userId) {
  const deviceModels = ['Galaxy S23', 'iPhone 14', 'Moto Edge 40', 'Dell Inspiron 15', 'Notebook Atlas 14'];
  let count = 0;

  for (let offset = -5; offset <= 0; offset += 1) {
    const monthStart = monthBase(offset);
    const isCurrentMonth = offset === 0;
    const statuses = isCurrentMonth
      ? ['delivered', 'repair', 'awaiting_part', 'ready']
      : ['delivered', 'delivered', 'analysis', 'ready'];

    for (let idx = 0; idx < statuses.length; idx += 1) {
      const status = statuses[idx];
      const receivedAt = monthDay(monthStart, 6 + (idx * 5));
      if (isCurrentMonth && receivedAt > new Date()) continue;

      const completedAt = status === 'delivered' || status === 'ready' ? addDays(receivedAt, 3 + idx) : null;
      const deliveredAt = status === 'delivered' ? addDays(completedAt, 1) : null;
      const clientRef = rotate(ctx.clients, idx + Math.abs(offset));
      const number = `BI6M-OS-${monthKey(monthStart)}-${pad(idx + 1)}`;

      const inserted = await client.query(
        `INSERT INTO service_orders
         (number, client_id, technician_id, status, priority, received_at, completed_at, delivered_at,
          defect_reported, accessories, device_state, password_informed, initial_quote, notes, user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, $14, $6, $6)
         RETURNING id`,
        [
          number,
          clientRef.id,
          userId,
          status,
          idx % 2 === 0 ? 'high' : 'normal',
          toStamp(receivedAt, 9),
          completedAt ? toStamp(completedAt, 16) : null,
          deliveredAt ? toStamp(deliveredAt, 17) : null,
          idx % 2 === 0 ? 'Tela quebrada e bateria drenando' : 'Lentidao e superaquecimento',
          'Carregador',
          'Uso moderado',
          money(280 + (idx * 90)),
          SEED_TAG,
          userId,
        ]
      );

      const serviceOrderId = inserted.rows[0].id;

      await client.query(
        `INSERT INTO service_order_devices
         (service_order_id, brand, model, color, storage, imei, serial)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          serviceOrderId,
          idx % 2 === 0 ? 'Samsung' : 'Apple',
          rotate(deviceModels, idx + Math.abs(offset)),
          idx % 2 === 0 ? 'Preto' : 'Azul',
          idx % 2 === 0 ? '128GB' : '256GB',
          `3579${monthKey(monthStart)}${pad(idx + 1)}`,
          `SN-${monthKey(monthStart)}-${pad(idx + 1)}`,
        ]
      );

      const serviceId = rotate(ctx.serviceIds, idx + Math.abs(offset));
      const partProduct = rotate(ctx.products, idx + Math.abs(offset) + 1);

      await client.query(
        `INSERT INTO service_order_items
         (service_order_id, type, service_id, description, quantity, unit_cost, unit_price, discount, stock_deducted, created_at)
         VALUES ($1, 'service', $2, $3, 1, $4, $5, 0, false, $6)`,
        [
          serviceOrderId,
          serviceId,
          `Servico ${idx + 1} ${monthKey(monthStart)}`,
          money(90 + (idx * 18)),
          money(220 + (idx * 70)),
          toStamp(receivedAt, 10),
        ]
      );

      await client.query(
        `INSERT INTO service_order_items
         (service_order_id, type, product_id, description, quantity, unit_cost, unit_price, discount, stock_deducted, created_at)
         VALUES ($1, 'part', $2, $3, $4, $5, $6, 0, false, $7)`,
        [
          serviceOrderId,
          partProduct.id,
          `Peca ${partProduct.name}`,
          idx % 2 === 0 ? 1 : 2,
          partProduct.cost_price,
          money(Number(partProduct.sale_price) * (idx % 2 === 0 ? 0.55 : 0.35)),
          toStamp(receivedAt, 10),
        ]
      );

      count += 1;
    }
  }

  return count;
}

async function seedReturns(client, ctx, userId, deliveredRefs) {
  let count = 0;
  const types = ['defeito', 'arrependimento', 'troca'];
  const statuses = ['requested', 'approved', 'completed'];

  for (let offset = -5; offset <= 0; offset += 1) {
    const monthStart = monthBase(offset);
    const isCurrentMonth = offset === 0;
    const monthOrders = deliveredRefs.filter(item => monthKey(new Date(item.createdAt)) === monthKey(monthStart));

    for (let idx = 0; idx < Math.min(2, monthOrders.length); idx += 1) {
      const ref = monthOrders[idx];
      const itemProduct = ctx.products.find(product => product.id === ref.firstItem.product_id);
      const returnClient = ctx.clients.find(item => item.id === ref.clientId);
      const createdAt = monthDay(monthStart, 11 + (idx * 8));
      if (isCurrentMonth && createdAt > new Date()) continue;

      const status = isCurrentMonth && idx === 0 ? 'requested' : rotate(statuses, idx + Math.abs(offset));
      const totalRefund = money(Number(ref.firstItem.total) * (idx === 0 ? 0.65 : 0.45));
      const number = `BI6M-RET-${monthKey(monthStart)}-${pad(idx + 1)}`;

      const inserted = await client.query(
        `INSERT INTO returns
         (number, order_id, order_number, client_id, client_name, status, type, origin, subtotal, total_refund,
          refund_type, refund_method, notes, created_by, approved_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'balcao', $8, $9, 'refund', $10, $11, $12, $13, $14, $14)
         RETURNING id`,
        [
          number,
          ref.orderId,
          ref.number,
          ref.clientId,
          returnClient?.name || 'Cliente BI',
          status,
          rotate(types, idx + Math.abs(offset)),
          ref.total,
          totalRefund,
          idx % 2 === 0 ? 'pix' : 'credito_loja',
          SEED_TAG,
          userId,
          status === 'requested' ? null : userId,
          toStamp(createdAt, 14),
        ]
      );

      await client.query(
        `INSERT INTO return_items
         (return_id, order_item_id, product_id, product_name, sku, quantity_original, quantity_returned,
          unit_price, discount, total_refund, reason, condition, stock_destination, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, 'open', 'available', $11)`,
        [
          inserted.rows[0].id,
          ref.firstItem.id,
          ref.firstItem.product_id,
          itemProduct?.name || 'Produto BI',
          itemProduct?.sku || 'BI6M-ITEM',
          ref.firstItem.quantity,
          Math.min(1, Number(ref.firstItem.quantity)),
          ref.firstItem.unit_price,
          totalRefund,
          idx % 2 === 0 ? 'Produto com falha intermitente' : 'Cliente optou por troca de modelo',
          SEED_TAG,
        ]
      );

      count += 1;
    }
  }

  return count;
}

async function main() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await cleanupSeedData(client);
    const userId = await ensureSeedUser(client);
    const ctx = await ensureSupportData(client);
    const orderSummary = await seedOrdersAndFinance(client, ctx, userId);
    const leadCount = await seedLeads(client, ctx, userId);
    const serviceCount = await seedServiceOrders(client, ctx, userId);
    const returnCount = await seedReturns(client, ctx, userId, orderSummary.deliveredRefs);

    await client.query('COMMIT');

    console.log('BI showcase seed concluido.');
    console.log(`Pedidos: ${orderSummary.orderCount}`);
    console.log(`Transacoes: ${orderSummary.transactionCount}`);
    console.log(`Leads: ${leadCount}`);
    console.log(`Ordens de servico: ${serviceCount}`);
    console.log(`Devolucoes: ${returnCount}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Falha ao gerar seed BI:', error.message);
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
