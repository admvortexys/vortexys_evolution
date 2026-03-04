const router = require('express').Router();
const db     = require('../database/db');
const auth = require('../middleware/auth');
router.use(auth);

// ── Categorias de produtos ──
router.get('/', async (req, res) => {
  const { type } = req.query;
  let q = 'SELECT * FROM categories WHERE 1=1';
  const p = [];
  if (type) { p.push(type); q += ` AND type=$${p.length}`; }
  q += ' ORDER BY name';
  try { res.json((await db.query(q, p)).rows); } catch(e) { res.status(500).json({error:e.message}); }
});

router.post('/', async (req, res) => {
  const { name, type, color } = req.body;
  try {
    const r = await db.query(
      'INSERT INTO categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name, type||'product', color||'#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.put('/:id', async (req, res) => {
  const { name, color } = req.body;
  try {
    const r = await db.query(
      'UPDATE categories SET name=$1,color=$2 WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:'Categoria em uso, não pode excluir'}); }
});

// ── Categorias financeiras ──
router.get('/financial', async (req, res) => {
  const { type } = req.query;
  let q = 'SELECT * FROM financial_categories WHERE 1=1';
  const p = [];
  if (type) { p.push(type); q += ` AND type=$${p.length}`; }
  q += ' ORDER BY name';
  try { res.json((await db.query(q, p)).rows); } catch(e) { res.status(500).json({error:e.message}); }
});

router.post('/financial', async (req, res) => {
  const { name, type, color } = req.body;
  try {
    const r = await db.query(
      'INSERT INTO financial_categories (name,type,color) VALUES ($1,$2,$3) RETURNING *',
      [name, type||'income', color||'#7c3aed']
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.put('/financial/:id', async (req, res) => {
  const { name, color } = req.body;
  try {
    const r = await db.query(
      'UPDATE financial_categories SET name=$1,color=$2 WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.delete('/financial/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM financial_categories WHERE id=$1', [req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:'Categoria em uso, não pode excluir'}); }
});

// ── Depósitos ──
router.get('/warehouses', async (req, res) => {
  try { res.json((await db.query('SELECT * FROM warehouses WHERE active=true ORDER BY name')).rows); }
  catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
