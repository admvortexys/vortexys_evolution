'use strict';
/**
 * Dashboard / BI: KPIs, pedidos, leads, financeiro, gráficos.
 * Filtros: month/year OU start_date+end_date OU date (único dia).
 * Rotas: / (geral), /bi/sellers, /bi/products, /bi/clients, /bi/crm.
 */
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('dashboard'));

function monthFilter(col, m, y) {
  return `EXTRACT(MONTH FROM ${col})=${m} AND EXTRACT(YEAR FROM ${col})=${y}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function buildDateWhere(req, col) {
  const start = req.query.start_date || req.query.date;
  const end = req.query.end_date || req.query.date || start;
  if (start && end && DATE_RE.test(start) && DATE_RE.test(end)) {
    return `${col}::date >= '${start}' AND ${col}::date <= '${end}'`;
  }
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  return monthFilter(col, m, y);
}

// ── Principal ──
router.get('/', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [orders, products, leads, finance, recentOrders, detailedOrders, detailedOrderItems, lowStock, topSellers, ordersByStatus, revenueByMonth, crmByMonthRes, osRevenue, osRevenueByMonth] = await Promise.all([
      db.query(`SELECT COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','draft') THEN total END),0) as revenue,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status='confirmed' THEN 1 END) as confirmed
        FROM orders WHERE ${mf('created_at')}`),
      db.query(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN stock_quantity<=min_stock AND active=true THEN 1 END) as low_stock
        FROM products WHERE active=true`),
      db.query(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN status='open' THEN 1 END) as open,
        COUNT(CASE WHEN status='won' THEN 1 END) as won,
        COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as won_value
        FROM leads WHERE ${mf('created_at')}`),
      db.query(`SELECT
        (COALESCE(SUM(CASE WHEN type='income' AND paid=true THEN COALESCE(paid_amount,amount) END),0)
         + COALESCE((SELECT SUM(o.total) FROM orders o
             LEFT JOIN transactions t ON t.order_id=o.id AND t.type='income'
             WHERE o.status NOT IN ('draft','cancelled','returned') AND t.id IS NULL AND ${mf('o.created_at')}),0)) as income_paid,
        COALESCE(SUM(CASE WHEN type='expense' AND paid=true THEN COALESCE(paid_amount,amount) END),0) as expense_paid,
        COALESCE(SUM(CASE WHEN type='income' AND paid=false THEN amount END),0) as income_pending,
        COALESCE(SUM(CASE WHEN type='expense' AND paid=false THEN amount END),0) as expense_pending
        FROM transactions WHERE ${mf('due_date')}`),
      db.query(`SELECT o.id,o.number,o.status,o.total,o.created_at,c.name as client_name
        FROM orders o LEFT JOIN clients c ON c.id=o.client_id
        WHERE ${mf('o.created_at')} ORDER BY o.created_at DESC LIMIT 8`),
      db.query(`SELECT o.id,o.number,o.status,o.subtotal,o.discount,o.total,o.created_at,o.updated_at,
        c.name as client_name,c.type as client_type,c.document as client_document,c.phone as client_phone,
        s.name as seller_name
        FROM orders o
        LEFT JOIN clients c ON c.id=o.client_id
        LEFT JOIN sellers s ON s.id=o.seller_id
        WHERE ${mf('o.created_at')}
        ORDER BY o.created_at DESC, o.id DESC`),
      db.query(`SELECT o.id as order_id,o.number as order_number,o.status as order_status,o.created_at,
        c.name as client_name,s.name as seller_name,
        p.id as product_id,p.name as product_name,p.sku,p.brand,
        oi.quantity,oi.unit_price,oi.discount,oi.total
        FROM order_items oi
        JOIN orders o ON o.id=oi.order_id
        JOIN products p ON p.id=oi.product_id
        LEFT JOIN clients c ON c.id=o.client_id
        LEFT JOIN sellers s ON s.id=o.seller_id
        WHERE ${mf('o.created_at')}
        ORDER BY o.created_at DESC,o.number DESC,p.name ASC`),
      db.query(`SELECT id,sku,name,stock_quantity,min_stock,unit FROM products
        WHERE stock_quantity<=min_stock AND active=true ORDER BY (stock_quantity-min_stock) ASC LIMIT 8`),
      db.query(`SELECT s.id,s.name,COUNT(o.id) as total_orders,COALESCE(SUM(o.total),0) as total_sold
        FROM sellers s LEFT JOIN orders o ON o.seller_id=s.id AND o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
        WHERE s.active=true GROUP BY s.id,s.name ORDER BY total_sold DESC LIMIT 5`),
      db.query(`SELECT o.status,os.label,os.color,COUNT(*) as count,COALESCE(SUM(o.total),0) as amount
        FROM orders o LEFT JOIN order_statuses os ON os.slug=o.status
        WHERE ${mf('o.created_at')} GROUP BY o.status,os.label,os.color ORDER BY count DESC`),
      db.query(`SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') as month,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','draft') THEN total END),0) as revenue,
        COUNT(*) as orders_count
        FROM orders WHERE created_at >= DATE_TRUNC('month',MAKE_DATE($1,$2,1)) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month',created_at) ORDER BY month ASC`, [y, m]),
      db.query(`SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') as month,
        COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as crm_won
        FROM leads WHERE created_at >= DATE_TRUNC('month',MAKE_DATE($1,$2,1)) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month',created_at) ORDER BY month ASC`, [y, m]),
      db.query(
        `SELECT COALESCE(SUM(
          (SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
           FROM service_order_items soi WHERE soi.service_order_id=so.id)
        ),0) as os_revenue
         FROM service_orders so
         WHERE so.status='delivered' AND (${mf('COALESCE(so.delivered_at, so.completed_at, so.updated_at)')})`,
        []
      ),
      db.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(so.delivered_at, so.completed_at, so.updated_at)),'YYYY-MM') as month,
          COALESCE(SUM(
            (SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
             FROM service_order_items soi WHERE soi.service_order_id=so.id)
          ),0) as os_revenue
         FROM service_orders so
         WHERE so.status='delivered'
           AND COALESCE(so.delivered_at, so.completed_at, so.updated_at) >= DATE_TRUNC('month',MAKE_DATE($1,$2,1)) - INTERVAL '5 months'
         GROUP BY DATE_TRUNC('month', COALESCE(so.delivered_at, so.completed_at, so.updated_at)) ORDER BY month ASC`,
        [y, m]
      ),
    ]);
    const osRev = parseFloat(osRevenue.rows[0]?.os_revenue || 0) || 0;
    const osRevByMonth = new Map((osRevenueByMonth.rows || []).map(r => [r.month, parseFloat(r.os_revenue) || 0]));
    const revMap = new Map((revenueByMonth.rows || []).map(r => [r.month, r]));
    const crmMap = new Map((crmByMonthRes?.rows || []).map(r => [r.month, parseFloat(r.crm_won) || 0]));
    const allMonths = [...new Set([...(revMap.keys()), ...(crmMap.keys()), ...(osRevByMonth.keys())])].sort();
    const revenueByMonthMerged = allMonths.map(month => {
      const o = revMap.get(month);
      const crm = crmMap.get(month) || 0;
      const osM = osRevByMonth.get(month) || 0;
      const ordRev = parseFloat(o?.revenue || 0) || 0;
      return { month, revenue: ordRev + crm + osM, orders_count: o?.orders_count || 0 };
    });
    const finRow = finance.rows[0] || {};
    finRow.os_revenue = osRev;
    res.json({
      orders: orders.rows[0], products: products.rows[0], leads: leads.rows[0], finance: finRow,
      recentOrders: recentOrders.rows, detailedOrders: detailedOrders.rows, detailedOrderItems: detailedOrderItems.rows, lowStock: lowStock.rows, topSellers: topSellers.rows,
      ordersByStatus: ordersByStatus.rows, revenueByMonth: revenueByMonthMerged,
    });
  } catch(e) { next(e); }
});

// ── BI Vendedores ──
router.get('/bi/sellers', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const sellerId = req.query.seller_id;
  const mf = (col) => buildDateWhere(req, col);
  try {
    const ranking = await db.query(
      `SELECT s.id,s.name,s.commission,COUNT(o.id)::int as orders,
        COALESCE(SUM(o.total),0) as revenue,
        COALESCE(AVG(o.total),0) as ticket,
        COALESCE(SUM(o.total)*s.commission/100,0) as commission_value
       FROM sellers s LEFT JOIN orders o ON o.seller_id=s.id AND o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
       WHERE s.active=true GROUP BY s.id,s.name,s.commission ORDER BY revenue DESC`
    );
    const [detailedOrders, detailedOrderItems] = await Promise.all([
      db.query(
      `SELECT o.id,o.number,o.status,o.subtotal,o.discount,o.total,o.created_at,o.updated_at,
        c.id as client_id,c.name as client_name,c.phone as client_phone,c.document as client_document,
        s.id as seller_id,s.name as seller_name,s.commission
       FROM orders o
       LEFT JOIN clients c ON c.id=o.client_id
       LEFT JOIN sellers s ON s.id=o.seller_id
       WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
       ORDER BY s.name ASC NULLS LAST,o.created_at DESC`),
      db.query(
      `SELECT s.id as seller_id,s.name as seller_name,
        o.id as order_id,o.number as order_number,o.status as order_status,o.created_at,
        c.name as client_name,
        p.id as product_id,p.name as product_name,p.sku,p.brand,
        oi.quantity,oi.unit_price,oi.discount,oi.total
       FROM order_items oi
       JOIN orders o ON o.id=oi.order_id
       JOIN products p ON p.id=oi.product_id
       LEFT JOIN clients c ON c.id=o.client_id
       LEFT JOIN sellers s ON s.id=o.seller_id
       WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
       ORDER BY s.name ASC NULLS LAST,o.created_at DESC,p.name ASC`)
    ]);
    let detail = null;
    if (sellerId) {
      const [topProducts, byStatus, byDay, ordersList, orderItems] = await Promise.all([
        db.query(
          `SELECT p.id,p.name,p.sku,SUM(oi.quantity)::numeric as qty,SUM(oi.total) as revenue
           FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id
           WHERE o.seller_id=$1 AND o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
           GROUP BY p.id,p.name,p.sku ORDER BY revenue DESC LIMIT 10`, [sellerId]),
        db.query(
          `SELECT o.status,os.label,os.color,COUNT(*)::int as count,COALESCE(SUM(o.total),0) as amount
           FROM orders o LEFT JOIN order_statuses os ON os.slug=o.status
           WHERE o.seller_id=$1 AND ${mf('o.created_at')} GROUP BY o.status,os.label,os.color ORDER BY count DESC`, [sellerId]),
        db.query(
          `SELECT created_at::date as day,COUNT(*)::int as count,COALESCE(SUM(total),0) as revenue
           FROM orders WHERE seller_id=$1 AND status NOT IN ('cancelled','draft') AND ${mf('created_at')}
           GROUP BY created_at::date ORDER BY day`, [sellerId]),
        db.query(
          `SELECT o.id,o.number,o.status,o.subtotal,o.discount,o.total,o.created_at,o.updated_at,
            c.name as client_name,c.phone as client_phone,c.document as client_document
           FROM orders o
           LEFT JOIN clients c ON c.id=o.client_id
           WHERE o.seller_id=$1 AND o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
           ORDER BY o.created_at DESC`, [sellerId]),
        db.query(
          `SELECT o.id as order_id,o.number as order_number,o.status as order_status,o.created_at,
            c.name as client_name,
            p.id as product_id,p.name as product_name,p.sku,p.brand,
            oi.quantity,oi.unit_price,oi.discount,oi.total
           FROM order_items oi
           JOIN orders o ON o.id=oi.order_id
           JOIN products p ON p.id=oi.product_id
           LEFT JOIN clients c ON c.id=o.client_id
           WHERE o.seller_id=$1 AND o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
           ORDER BY o.created_at DESC,p.name ASC`, [sellerId]),
      ]);
      detail = { topProducts: topProducts.rows, byStatus: byStatus.rows, byDay: byDay.rows, orders: ordersList.rows, orderItems: orderItems.rows };
    }
    res.json({ ranking: ranking.rows, detail, detailedOrders: detailedOrders.rows, detailedOrderItems: detailedOrderItems.rows });
  } catch(e) { next(e); }
});

// ── BI Produtos ──
router.get('/bi/products', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [topSold, topRevenue, categories, lowStock, curvaAbc, giroProduto, estoqueParado, porAlmoxarifado, riscoFalta, detailedSales] = await Promise.all([
      db.query(
        `SELECT p.id,p.name,p.sku,p.brand,p.sale_price,p.cost_price,SUM(oi.quantity)::numeric as qty_sold,
          SUM(oi.total) as revenue,SUM(oi.quantity * COALESCE(p.cost_price,0)) as cost_total,
          COUNT(DISTINCT o.id)::int as orders
         FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY p.id,p.name,p.sku,p.brand,p.sale_price,p.cost_price ORDER BY qty_sold DESC LIMIT 15`),
      db.query(
        `SELECT p.id,p.name,p.sku,SUM(oi.total) as revenue,SUM(oi.quantity)::numeric as qty_sold
         FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY p.id,p.name,p.sku ORDER BY revenue DESC LIMIT 15`),
      db.query(
        `SELECT c.id,c.name as category,COUNT(DISTINCT p.id)::int as products,SUM(oi.quantity)::numeric as qty,SUM(oi.total) as revenue
         FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id
         LEFT JOIN categories c ON c.id=p.category_id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY c.id,c.name ORDER BY revenue DESC LIMIT 10`),
      db.query(
        `SELECT id,name,sku,stock_quantity,min_stock FROM products
         WHERE stock_quantity<=min_stock AND active=true ORDER BY (stock_quantity-min_stock) LIMIT 10`),
      db.query(
        `WITH vendidos AS (
           SELECT p.id, p.name, p.sku, SUM(oi.total)::numeric as revenue
           FROM order_items oi
           JOIN orders o ON o.id=oi.order_id AND o.status NOT IN ('cancelled','draft') AND (${mf('o.created_at')})
           JOIN products p ON p.id=oi.product_id
           GROUP BY p.id, p.name, p.sku
           HAVING SUM(oi.total) > 0
         ),
         tot AS (SELECT COALESCE(SUM(revenue),0)::numeric as t FROM vendidos),
         com_pct AS (
           SELECT id, name, sku, revenue,
             (revenue / NULLIF((SELECT t FROM tot),0) * 100)::numeric(10,2) as pct
           FROM vendidos
         )
         SELECT id, name, sku, revenue, pct,
           (SUM(pct) OVER (ORDER BY revenue DESC, id ASC))::numeric(10,2) as pct_acum
         FROM com_pct
         ORDER BY revenue DESC, id ASC`),
      db.query(
        `SELECT p.id,p.name,p.sku,p.stock_quantity,COALESCE(SUM(oi.quantity),0)::numeric as qty_vendida,
           CASE WHEN COALESCE(p.stock_quantity,0)>0 THEN COALESCE(SUM(oi.quantity),0)/p.stock_quantity ELSE 0 END as giro
           FROM products p
           LEFT JOIN order_items oi ON oi.product_id=p.id
           LEFT JOIN orders o ON o.id=oi.order_id AND o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
           WHERE p.active=true AND p.stock_quantity>0
           GROUP BY p.id,p.name,p.sku,p.stock_quantity ORDER BY giro DESC LIMIT 20`),
      db.query(
        `SELECT p.id,p.name,p.sku,p.stock_quantity,p.cost_price,p.sale_price,
           (p.stock_quantity * COALESCE(p.cost_price,0)) as valor_parado
           FROM products p WHERE p.active=true AND p.stock_quantity>0
           ORDER BY valor_parado DESC LIMIT 15`),
      db.query(
        `SELECT w.id,w.name,COUNT(p.id)::int as produtos,COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price,0)),0) as valor
           FROM warehouses w LEFT JOIN products p ON p.warehouse_id=w.id AND p.active=true
           WHERE w.active=true GROUP BY w.id,w.name ORDER BY valor DESC`),
      db.query(
        `SELECT p.id,p.name,p.sku,p.stock_quantity,p.min_stock,(p.min_stock - COALESCE(p.stock_quantity,0))::numeric as sugerido
           FROM products p WHERE p.active=true AND p.min_stock>0 AND COALESCE(p.stock_quantity,0) < p.min_stock
           ORDER BY sugerido DESC LIMIT 20`),
      db.query(
        `SELECT p.id as product_id,p.name,p.sku,p.brand,p.sale_price,p.cost_price,
          o.id as order_id,o.number as order_number,o.status as order_status,o.created_at,
          s.name as seller_name,c.name as client_name,
          oi.quantity,oi.unit_price,oi.discount,oi.total
         FROM order_items oi
         JOIN orders o ON o.id=oi.order_id
         JOIN products p ON p.id=oi.product_id
         LEFT JOIN sellers s ON s.id=o.seller_id
         LEFT JOIN clients c ON c.id=o.client_id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         ORDER BY o.created_at DESC,p.name ASC`),
    ]);
    res.json({
      topSold: topSold.rows, topRevenue: topRevenue.rows, categories: categories.rows, lowStock: lowStock.rows,
      curvaAbc: curvaAbc.rows, giroProduto: giroProduto.rows, estoqueParado: estoqueParado.rows,
      porAlmoxarifado: porAlmoxarifado.rows, compraSugerida: riscoFalta.rows,
      detailedSales: detailedSales.rows,
    });
  } catch(e) { next(e); }
});

// ── BI Clientes ──
router.get('/bi/clients', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [topClients, newClients, byType, recompra, frequencia, inativos, aniversariantes, detailedOrders, detailedOrderItems] = await Promise.all([
      db.query(
        `SELECT c.id,c.name,c.phone,c.document,c.type,COUNT(o.id)::int as orders,COALESCE(SUM(o.total),0) as revenue,
          COALESCE(AVG(o.total),0) as ticket
         FROM clients c JOIN orders o ON o.client_id=c.id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY c.id,c.name,c.phone,c.document,c.type ORDER BY revenue DESC LIMIT 15`),
      db.query(`SELECT COUNT(*)::int as count FROM clients WHERE ${mf('created_at')}`),
      db.query(
        `SELECT c.type,COUNT(DISTINCT c.id)::int as clients,COUNT(o.id)::int as orders,COALESCE(SUM(o.total),0) as revenue
         FROM clients c JOIN orders o ON o.client_id=c.id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY c.type ORDER BY revenue DESC`),
      db.query(
        `SELECT COUNT(*)::int as count FROM (SELECT c.id FROM clients c JOIN orders o ON o.client_id=c.id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY c.id HAVING COUNT(o.id) >= 2) x`),
      db.query(
        `SELECT COALESCE(AVG(ord_count),0)::numeric(10,2) as avg_freq FROM (SELECT c.id,COUNT(o.id)::int as ord_count
         FROM clients c JOIN orders o ON o.client_id=c.id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         GROUP BY c.id) x`),
      db.query(
        `SELECT COUNT(DISTINCT c.id)::int as count FROM clients c
         WHERE c.id NOT IN (SELECT o.client_id FROM orders o WHERE o.client_id IS NOT NULL AND o.status NOT IN ('cancelled','draft')
           AND o.created_at >= NOW() - INTERVAL '90 days')
         AND c.id IN (SELECT o2.client_id FROM orders o2 WHERE o2.client_id IS NOT NULL AND o2.status NOT IN ('cancelled','draft'))`),
      db.query(
        `SELECT c.id,c.name,c.phone,c.birthday FROM clients c
         WHERE c.birthday IS NOT NULL AND EXTRACT(MONTH FROM c.birthday)=$1
         ORDER BY EXTRACT(DAY FROM c.birthday) LIMIT 30`, [m]),
      db.query(
        `SELECT c.id as client_id,c.name,c.type,c.phone,c.document,
          o.id as order_id,o.number as order_number,o.status,o.subtotal,o.discount,o.total,o.created_at,
          s.name as seller_name
         FROM clients c
         JOIN orders o ON o.client_id=c.id
         LEFT JOIN sellers s ON s.id=o.seller_id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         ORDER BY c.name ASC,o.created_at DESC`),
      db.query(
        `SELECT c.id as client_id,c.name as client_name,c.type as client_type,c.phone,c.document,
          o.id as order_id,o.number as order_number,o.status as order_status,o.created_at,
          s.name as seller_name,
          p.id as product_id,p.name as product_name,p.sku,p.brand,
          oi.quantity,oi.unit_price,oi.discount,oi.total
         FROM clients c
         JOIN orders o ON o.client_id=c.id
         JOIN order_items oi ON oi.order_id=o.id
         JOIN products p ON p.id=oi.product_id
         LEFT JOIN sellers s ON s.id=o.seller_id
         WHERE o.status NOT IN ('cancelled','draft') AND ${mf('o.created_at')}
         ORDER BY c.name ASC,o.created_at DESC,p.name ASC`),
    ]);
    res.json({
      topClients: topClients.rows, newClients: newClients.rows[0]?.count || 0, byType: byType.rows,
      recompra: recompra.rows[0]?.count || 0,
      frequencia: parseFloat(frequencia.rows[0]?.avg_freq || 0),
      inativos: inativos.rows[0]?.count || 0,
      aniversariantes: aniversariantes.rows || [],
      detailedOrders: detailedOrders.rows, detailedOrderItems: detailedOrderItems.rows,
    });
  } catch(e) { next(e); }
});

// ── BI CRM ──
router.get('/bi/crm', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [overview, byPipeline, bySource, recentWon, avgTime, lostReasons, proposalsStats, detailedLeads] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int as total,
          COUNT(CASE WHEN status='open' THEN 1 END)::int as open,
          COUNT(CASE WHEN status='won' THEN 1 END)::int as won,
          COUNT(CASE WHEN status='lost' THEN 1 END)::int as lost,
          COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as won_value,
          COALESCE(SUM(CASE WHEN status='lost' THEN estimated_value END),0) as lost_value,
          COALESCE(SUM(CASE WHEN status='open' THEN estimated_value END),0) as pipeline_value,
          COALESCE(AVG(CASE WHEN status='won' THEN estimated_value END),0) as avg_deal
         FROM leads WHERE ${mf('created_at')}`),
      db.query(
        `SELECT p.id,p.name as pipeline,COUNT(l.id)::int as leads,
          COUNT(CASE WHEN l.status='won' THEN 1 END)::int as won,
          COUNT(CASE WHEN l.status='lost' THEN 1 END)::int as lost,
          COALESCE(SUM(CASE WHEN l.status='won' THEN l.estimated_value END),0) as won_value
         FROM pipelines p LEFT JOIN leads l ON l.pipeline_id=p.id AND ${mf('l.created_at')}
         GROUP BY p.id,p.name ORDER BY won_value DESC`),
      db.query(
        `SELECT COALESCE(source,'Direto') as source,COUNT(*)::int as leads,
          COUNT(CASE WHEN status='won' THEN 1 END)::int as won,
          COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as won_value
         FROM leads WHERE ${mf('created_at')} GROUP BY source ORDER BY leads DESC LIMIT 10`),
      db.query(
        `SELECT l.id,l.name,l.estimated_value,l.created_at,p.name as pipeline,
          EXTRACT(EPOCH FROM (NOW()-l.created_at))/86400 as days_in_pipeline
         FROM leads l LEFT JOIN pipelines p ON p.id=l.pipeline_id
         WHERE l.status='won' AND ${mf('l.created_at')} ORDER BY l.created_at DESC LIMIT 10`),
      db.query(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW()-created_at))/86400),0) as avg_days_open
         FROM leads WHERE status='open'`),
      db.query(
        `SELECT COALESCE(lost_reason,'Sem motivo') as motivo, COUNT(*)::int as count,
          COALESCE(SUM(estimated_value),0) as valor_perdido
         FROM leads WHERE status='lost' AND ${mf('created_at')} GROUP BY lost_reason ORDER BY count DESC LIMIT 10`),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('sent','approved','rejected'))::int as enviadas,
          COUNT(*) FILTER (WHERE status='approved')::int as aprovadas,
          COALESCE(SUM(total) FILTER (WHERE status='approved'),0) as valor_aprovado
         FROM proposals WHERE ${mf('created_at')}`),
      db.query(
        `SELECT l.id,l.name,l.company,l.email,l.phone,l.source,l.status,l.estimated_value,l.probability,
          l.expected_close,l.created_at,p.name as pipeline
         FROM leads l
         LEFT JOIN pipelines p ON p.id=l.pipeline_id
         WHERE ${mf('l.created_at')}
         ORDER BY l.created_at DESC,l.id DESC`),
    ]);
    const ov = overview.rows[0] || {};
    res.json({
      overview: overview.rows[0],
      byPipeline: byPipeline.rows,
      bySource: bySource.rows,
      recentWon: recentWon.rows,
      avgDaysOpen: parseFloat(avgTime.rows[0]?.avg_days_open || 0).toFixed(1),
      lostReasons: lostReasons.rows,
      proposalsStats: proposalsStats.rows[0] || {},
      valorGanhoPerdido: { ganho: parseFloat(ov.won_value || 0), perdido: parseFloat(ov.lost_value || 0) },
      detailedLeads: detailedLeads.rows,
    });
  } catch(e) { next(e); }
});

// ── BI Assistência (Service Orders) ──
router.get('/bi/service-orders', async (req, res, next) => {
  const mf = (col) => buildDateWhere(req, col);
  const serviceDateExpr = 'COALESCE(so.delivered_at, so.completed_at, so.received_at, so.created_at)';
  const serviceRevenueExpr = `(SELECT SUM((COALESCE(soi.quantity,1) * COALESCE(soi.unit_price,0)) - COALESCE(soi.discount,0))
    FROM service_order_items soi WHERE soi.service_order_id=so.id)`;
  try {
    const [byStatus, revenueByMonth, kpis, byTechnician, defects, partsConsumed, ordersList, itemsList] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*)::int as count,
          COALESCE(SUM(${serviceRevenueExpr}),0) as revenue
         FROM service_orders so
         WHERE ${mf(serviceDateExpr)}
         GROUP BY status ORDER BY count DESC`),
      db.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', COALESCE(so.delivered_at, so.completed_at, so.updated_at)),'YYYY-MM') as month,
          COUNT(*)::int as delivered,
          COALESCE(SUM(${serviceRevenueExpr}),0) as revenue
         FROM service_orders so
         WHERE so.status='delivered'
           AND COALESCE(so.delivered_at, so.completed_at, so.updated_at) >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
         GROUP BY DATE_TRUNC('month', COALESCE(so.delivered_at, so.completed_at, so.updated_at)) ORDER BY month ASC`),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE so.status NOT IN ('delivered','cancelled'))::int as open,
          COUNT(*) FILTER (WHERE so.status='delivered')::int as delivered,
          COALESCE(SUM(
            CASE WHEN so.status='delivered' THEN
              ${serviceRevenueExpr}
            END
          ),0) as total_revenue,
          COALESCE(AVG(CASE WHEN so.status='delivered' AND so.delivered_at IS NOT NULL AND so.received_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (so.delivered_at - so.received_at))/86400 END),0)::numeric(10,1) as prazo_medio_dias,
          COALESCE(AVG(CASE WHEN so.status='delivered' THEN ${serviceRevenueExpr} END),0)::numeric(12,2) as ticket_medio
         FROM service_orders so WHERE ${mf(serviceDateExpr)}`),
      db.query(
        `SELECT u.id,u.name as technician_name,COUNT(so.id)::int as count,
          COALESCE(SUM(${serviceRevenueExpr}),0) as revenue
         FROM users u
         LEFT JOIN service_orders so ON so.technician_id=u.id AND ${mf(serviceDateExpr)} AND so.status='delivered'
         WHERE u.id IN (SELECT DISTINCT technician_id FROM service_orders WHERE technician_id IS NOT NULL)
         GROUP BY u.id,u.name ORDER BY revenue DESC NULLS LAST LIMIT 15`),
      db.query(
        `SELECT so.defect_reported as defeito, COUNT(*)::int as count FROM service_orders so
         WHERE ${mf(serviceDateExpr)} AND so.defect_reported IS NOT NULL AND TRIM(so.defect_reported)!=''
         GROUP BY so.defect_reported ORDER BY count DESC LIMIT 15`),
      db.query(
        `SELECT COALESCE(p.name, soi.description,'Peça genérica') as peca, SUM(soi.quantity)::numeric as qty, SUM((soi.quantity*soi.unit_price)-COALESCE(soi.discount,0)) as valor
         FROM service_order_items soi
         JOIN service_orders so ON so.id=soi.service_order_id
         LEFT JOIN products p ON p.id=soi.product_id
         WHERE soi.type='part' AND ${mf(serviceDateExpr)}
         GROUP BY p.name, soi.description ORDER BY qty DESC LIMIT 15`),
      db.query(
        `SELECT so.id,so.number,so.status,so.priority,so.received_at,so.completed_at,so.delivered_at,
          so.defect_reported,so.initial_quote,c.name as client_name,u.name as technician_name,
          sod.brand,sod.model,sod.imei,
          COALESCE(${serviceRevenueExpr},0) as revenue
         FROM service_orders so
         LEFT JOIN clients c ON c.id=so.client_id
         LEFT JOIN users u ON u.id=so.technician_id
         LEFT JOIN service_order_devices sod ON sod.service_order_id=so.id
         WHERE ${mf(serviceDateExpr)}
         ORDER BY COALESCE(so.delivered_at, so.completed_at, so.received_at, so.created_at) DESC, so.id DESC`),
      db.query(
        `SELECT so.id as service_order_id,so.number as service_order_number,so.status as service_order_status,
          so.received_at,so.completed_at,so.delivered_at,c.name as client_name,
          soi.type,soi.description,soi.quantity,soi.unit_cost,soi.unit_price,soi.discount,
          p.name as product_name,p.sku,ss.name as service_name
         FROM service_order_items soi
         JOIN service_orders so ON so.id=soi.service_order_id
         LEFT JOIN clients c ON c.id=so.client_id
         LEFT JOIN products p ON p.id=soi.product_id
         LEFT JOIN service_services ss ON ss.id=soi.service_id
         WHERE ${mf(serviceDateExpr)}
         ORDER BY COALESCE(so.delivered_at, so.completed_at, so.received_at, so.created_at) DESC, so.number DESC, soi.id ASC`),
    ]);
    const kp = kpis.rows[0] || {};
    res.json({
      byStatus: byStatus.rows,
      revenueByMonth: revenueByMonth.rows,
      kpis: kp,
      byTechnician: byTechnician.rows,
      defects: defects.rows,
      partsConsumed: partsConsumed.rows,
      prazoMedioDias: parseFloat(kp.prazo_medio_dias || 0),
      ticketMedio: parseFloat(kp.ticket_medio || 0),
      ordersList: ordersList.rows,
      itemsList: itemsList.rows,
    });
  } catch(e) { next(e); }
});

// ── BI Devoluções ──
router.get('/bi/returns', async (req, res, next) => {
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [summary, byStatus, byType, returnsList, itemsList] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int as total,
          COALESCE(SUM(total_refund),0) as total_refund
         FROM returns WHERE ${mf('created_at')}`),
      db.query(
        `SELECT status, COUNT(*)::int as count,
          COALESCE(SUM(total_refund),0) as refund_amount
         FROM returns WHERE ${mf('created_at')} GROUP BY status ORDER BY count DESC`),
      db.query(
        `SELECT type, COUNT(*)::int as count,
          COALESCE(SUM(total_refund),0) as refund_amount
         FROM returns WHERE ${mf('created_at')} GROUP BY type ORDER BY count DESC`),
      db.query(
        `SELECT r.id,r.number,r.order_number,r.status,r.type,r.origin,r.subtotal,r.total_refund,
          r.refund_type,r.refund_method,r.created_at,r.updated_at,
          c.name as client_name,c.phone as client_phone,c.document as client_document
         FROM returns r
         LEFT JOIN clients c ON c.id=r.client_id
         WHERE ${mf('r.created_at')}
         ORDER BY r.created_at DESC,r.id DESC`),
      db.query(
        `SELECT r.id as return_id,r.number as return_number,r.order_number,r.status as return_status,r.type as return_type,
          r.created_at,c.name as client_name,
          ri.product_name,ri.sku,ri.imei,ri.serial_number,ri.quantity_original,ri.quantity_returned,
          ri.unit_price,ri.discount,ri.total_refund,ri.reason,ri.condition,ri.stock_destination
         FROM return_items ri
         JOIN returns r ON r.id=ri.return_id
         LEFT JOIN clients c ON c.id=r.client_id
         WHERE ${mf('r.created_at')}
         ORDER BY r.created_at DESC,r.number DESC,ri.id ASC`),
    ]);
    res.json({
      summary: summary.rows[0],
      byStatus: byStatus.rows,
      byType: byType.rows,
      returnsList: returnsList.rows,
      itemsList: itemsList.rows,
    });
  } catch(e) { next(e); }
});

module.exports = router;
