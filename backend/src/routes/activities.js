const router=require('express').Router(),db=require('../database/db'),auth=require('../middleware/auth');
router.use(auth);
router.get('/',async(req,res)=>{const{lead_id,done}=req.query;let q=`SELECT a.*,u.name as user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE 1=1`;const p=[];if(lead_id){p.push(lead_id);q+=` AND a.lead_id=$${p.length}`;}if(done!==undefined){p.push(done==='true');q+=` AND a.done=$${p.length}`;}q+=' ORDER BY a.created_at DESC';try{res.json((await db.query(q,p)).rows);}catch(e){res.status(500).json({error:e.message});}});
router.post('/',async(req,res)=>{const{lead_id,type,title,description,due_date}=req.body;try{const r=await db.query('INSERT INTO activities (lead_id,type,title,description,due_date,user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[lead_id,type,title,description,due_date,req.user.id]);res.status(201).json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
router.patch('/:id/done',async(req,res)=>{try{const r=await db.query('UPDATE activities SET done=true WHERE id=$1 RETURNING *',[req.params.id]);res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});
router.delete('/:id',async(req,res)=>{try{await db.query('DELETE FROM activities WHERE id=$1',[req.params.id]);res.json({success:true});}catch(e){res.status(500).json({error:e.message});}});
module.exports=router;
