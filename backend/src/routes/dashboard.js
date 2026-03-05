'use strict';
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
router.use(auth);
router.use(requirePermission('dashboard'));

router.get('/', async (req, res, next) => {
  try {
    const [orders, products, leads, finance, recentOrders, lowStock, topSellers, ordersByStatus, revenueByMonth] = await Promise.all([
      // ── Pedidos do mês ──
      db.query(`SELECT COUNT(*) as total,
                       COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','draft') THEN total END),0) as revenue,
                       COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
                       COUNT(CASE WHEN status='confirmed' THEN 1 END) as confirmed,
                       COUNT(CASE WHEN status='processing' THEN 1 END) as processing,
                       COUNT(CASE WHEN status='shipped' THEN 1 END) as shipped
                FROM orders
                WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW())
                  AND EXTRACT(YEAR  FROM created_at)=EXTRACT(YEAR  FROM NOW())`),

      // ── Produtos ──
      db.query(`SELECT COUNT(*) as total,
                       COUNT(CASE WHEN stock_quantity<=min_stock AND active=true THEN 1 END) as low_stock
                FROM products WHERE active=true`),

      // ── Leads do mês ──
      db.query(`SELECT COUNT(*) as total,
                       COUNT(CASE WHEN status='open' THEN 1 END) as open,
                       COUNT(CASE WHEN status='won'  THEN 1 END) as won,
                       COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as won_value
                FROM leads
                WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW())
                  AND EXTRACT(YEAR  FROM created_at)=EXTRACT(YEAR  FROM NOW())`),

      // ── Financeiro do mês (corrigido: income_paid / expense_paid) ──
      db.query(`SELECT COALESCE(SUM(CASE WHEN type='income'  AND paid=true  THEN amount END),0) as income_paid,
                       COALESCE(SUM(CASE WHEN type='expense' AND paid=true  THEN amount END),0) as expense_paid,
                       COALESCE(SUM(CASE WHEN type='income'  AND paid=false THEN amount END),0) as income_pending,
                       COALESCE(SUM(CASE WHEN type='expense' AND paid=false THEN amount END),0) as expense_pending
                FROM transactions
                WHERE EXTRACT(MONTH FROM due_date)=EXTRACT(MONTH FROM NOW())
                  AND EXTRACT(YEAR  FROM due_date)=EXTRACT(YEAR  FROM NOW())`),

      // ── Últimos 8 pedidos ──
      db.query(`SELECT o.id, o.number, o.status, o.total, o.created_at, c.name as client_name
                FROM orders o LEFT JOIN clients c ON c.id=o.client_id
                ORDER BY o.created_at DESC LIMIT 8`),

      // ── Estoque baixo (até 8) ──
      db.query(`SELECT id, sku, name, stock_quantity, min_stock, unit FROM products
                WHERE stock_quantity<=min_stock AND active=true
                ORDER BY (stock_quantity - min_stock) ASC LIMIT 8`),

      // ── Top 5 vendedores do mês ──
      db.query(`SELECT s.id, s.name,
                       COUNT(o.id) as total_orders,
                       COALESCE(SUM(o.total),0) as total_sold
                FROM sellers s
                LEFT JOIN orders o ON o.seller_id=s.id
                  AND o.status NOT IN ('cancelled','draft')
                  AND EXTRACT(MONTH FROM o.created_at)=EXTRACT(MONTH FROM NOW())
                  AND EXTRACT(YEAR  FROM o.created_at)=EXTRACT(YEAR  FROM NOW())
                WHERE s.active=true
                GROUP BY s.id, s.name
                ORDER BY total_sold DESC
                LIMIT 5`),

      // ── Pedidos por status (do mês) ──
      db.query(`SELECT status, COUNT(*) as count,
                       COALESCE(SUM(total),0) as amount
                FROM orders
                WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW())
                  AND EXTRACT(YEAR  FROM created_at)=EXTRACT(YEAR  FROM NOW())
                GROUP BY status ORDER BY count DESC`),

      // ── Receita últimos 6 meses ──
      db.query(`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
                       COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','draft') THEN total END),0) as revenue,
                       COUNT(*) as orders_count
                FROM orders
                WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month ASC`),
    ]);

    res.json({
      orders:         orders.rows[0],
      products:       products.rows[0],
      leads:          leads.rows[0],
      finance:        finance.rows[0],
      recentOrders:   recentOrders.rows,
      lowStock:       lowStock.rows,
      topSellers:     topSellers.rows,
      ordersByStatus: ordersByStatus.rows,
      revenueByMonth: revenueByMonth.rows,
    });
  } catch(e) { next(e); }
});

module.exports = router;
