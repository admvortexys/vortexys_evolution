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
    const [orders, products, leads, finance, recentOrders, lowStock, topSellers, ordersByStatus, revenueByMonth, crmByMonthRes, osRevenue, osRevenueByMonth] = await Promise.all([
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
      recentOrders: recentOrders.rows, lowStock: lowStock.rows, topSellers: topSellers.rows,
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
    let detail = null;
    if (sellerId) {
      const [topProducts, byStatus, byDay] = await Promise.all([
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
      ]);
      detail = { topProducts: topProducts.rows, byStatus: byStatus.rows, byDay: byDay.rows };
    }
    res.json({ ranking: ranking.rows, detail });
  } catch(e) { next(e); }
});

// ── BI Produtos ──
router.get('/bi/products', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [topSold, topRevenue, categories, lowStock] = await Promise.all([
      db.query(
        `SELECT p.id,p.name,p.sku,p.brand,p.sale_price,p.cost_price,SUM(oi.quantity)::numeric as qty_sold,
          SUM(oi.total) as revenue,COUNT(DISTINCT o.id)::int as orders
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
    ]);
    res.json({ topSold: topSold.rows, topRevenue: topRevenue.rows, categories: categories.rows, lowStock: lowStock.rows });
  } catch(e) { next(e); }
});

// ── BI Clientes ──
router.get('/bi/clients', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [topClients, newClients, byType] = await Promise.all([
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
    ]);
    res.json({ topClients: topClients.rows, newClients: newClients.rows[0]?.count || 0, byType: byType.rows });
  } catch(e) { next(e); }
});

// ── BI CRM ──
router.get('/bi/crm', async (req, res, next) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const mf = (col) => buildDateWhere(req, col);
  try {
    const [overview, byPipeline, bySource, recentWon, avgTime] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int as total,
          COUNT(CASE WHEN status='open' THEN 1 END)::int as open,
          COUNT(CASE WHEN status='won' THEN 1 END)::int as won,
          COUNT(CASE WHEN status='lost' THEN 1 END)::int as lost,
          COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as won_value,
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
    ]);
    res.json({
      overview: overview.rows[0],
      byPipeline: byPipeline.rows,
      bySource: bySource.rows,
      recentWon: recentWon.rows,
      avgDaysOpen: parseFloat(avgTime.rows[0]?.avg_days_open || 0).toFixed(1),
    });
  } catch(e) { next(e); }
});

module.exports = router;
