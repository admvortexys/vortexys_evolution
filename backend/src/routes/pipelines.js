// pipelines.js
const e=require('express'),db=require('../database/db'),auth=require('../middleware/auth');
const r=e.Router();r.use(auth);
r.get('/',async(req,res)=>{try{res.json((await db.query('SELECT * FROM pipelines ORDER BY position')).rows);}catch(e){res.status(500).json({error:e.message});}});
r.post('/',async(req,res)=>{const{name,color,position}=req.body;try{const x=await db.query('INSERT INTO pipelines (name,color,position) VALUES ($1,$2,$3) RETURNING *',[name,color||'#7c3aed',position||0]);res.status(201).json(x.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
r.put('/:id',async(req,res)=>{const{name,color,position}=req.body;try{const x=await db.query('UPDATE pipelines SET name=$1,color=$2,position=$3 WHERE id=$4 RETURNING *',[name,color,position,req.params.id]);res.json(x.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
r.delete('/:id',async(req,res)=>{try{await db.query('DELETE FROM pipelines WHERE id=$1',[req.params.id]);res.json({success:true});}catch(e){res.status(500).json({error:e.message});}});
module.exports=r;
