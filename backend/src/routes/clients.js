const router = require('express').Router();
const db     = require('../database/db');
const auth = require('../middleware/auth');
router.use(auth);

// autocomplete search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const r = await db.query(
      `SELECT id,name,document,phone,email,type FROM clients
       WHERE active=true AND (name ILIKE $1 OR document ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)
       ORDER BY name LIMIT 15`,
      [`%${q}%`]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/', async (req, res) => {
  const { type, search } = req.query;
  let q = 'SELECT * FROM clients WHERE active=true';
  const p = [];
  if (type)   { p.push(type); q += ` AND type=$${p.length}`; }
  if (search) { p.push(`%${search}%`); q += ` AND (name ILIKE $${p.length} OR document ILIKE $${p.length} OR phone ILIKE $${p.length})`; }
  q += ' ORDER BY name';
  try { res.json((await db.query(q, p)).rows); } catch(e) { res.status(500).json({error:e.message}); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM clients WHERE id=$1',[req.params.id]);
    if (!r.rows.length) return res.status(404).json({error:'Não encontrado'});
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.post('/', async (req, res) => {
  const {type,name,document,email,phone,address,city,state,notes} = req.body;
  try {
    const r = await db.query(
      'INSERT INTO clients (type,name,document,email,phone,address,city,state,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [type||'client',name,document,email,phone,address,city,state,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.put('/:id', async (req, res) => {
  const {type,name,document,email,phone,address,city,state,notes,active} = req.body;
  try {
    const r = await db.query(
      'UPDATE clients SET type=$1,name=$2,document=$3,email=$4,phone=$5,address=$6,city=$7,state=$8,notes=$9,active=$10,updated_at=NOW() WHERE id=$11 RETURNING *',
      [type,name,document,email,phone,address,city,state,notes,active,req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({error:e.message}); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE clients SET active=false WHERE id=$1',[req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

module.exports = router;
