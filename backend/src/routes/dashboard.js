const router=require('express').Router(),db=require('../database/db'),auth=require('../middleware/auth');
router.use(auth);

router.get('/',async(req,res)=>{
  try{
    const [orders,products,leads,finance,recentOrders,lowStock]=await Promise.all([
      db.query(`SELECT COUNT(*) as total,COALESCE(SUM(CASE WHEN status!='cancelled' THEN total END),0) as revenue,COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered FROM orders WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM created_at)=EXTRACT(YEAR FROM NOW())`),
      db.query(`SELECT COUNT(*) as total,COUNT(CASE WHEN stock_quantity<=min_stock AND active=true THEN 1 END) as low_stock FROM products WHERE active=true`),
      db.query(`SELECT COUNT(*) as total,COUNT(CASE WHEN status='open' THEN 1 END) as open,COUNT(CASE WHEN status='won' THEN 1 END) as won,COALESCE(SUM(CASE WHEN status='won' THEN estimated_value END),0) as won_value FROM leads WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM created_at)=EXTRACT(YEAR FROM NOW())`),
      db.query(`SELECT COALESCE(SUM(CASE WHEN type='income' AND paid=true THEN amount END),0) as income,COALESCE(SUM(CASE WHEN type='expense' AND paid=true THEN amount END),0) as expense,COALESCE(SUM(CASE WHEN type='income' AND paid=false THEN amount END),0) as income_pending,COALESCE(SUM(CASE WHEN type='expense' AND paid=false THEN amount END),0) as expense_pending FROM transactions WHERE EXTRACT(MONTH FROM due_date)=EXTRACT(MONTH FROM NOW()) AND EXTRACT(YEAR FROM due_date)=EXTRACT(YEAR FROM NOW())`),
      db.query(`SELECT o.*,c.name as client_name FROM orders o LEFT JOIN clients c ON c.id=o.client_id ORDER BY o.created_at DESC LIMIT 5`),
      db.query(`SELECT * FROM products WHERE stock_quantity<=min_stock AND active=true ORDER BY stock_quantity ASC LIMIT 5`)
    ]);
    res.json({
      orders: orders.rows[0],
      products: products.rows[0],
      leads: leads.rows[0],
      finance: finance.rows[0],
      recentOrders: recentOrders.rows,
      lowStock: lowStock.rows
    });
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports=router;
