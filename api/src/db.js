const {Pool}=require('pg');
const fs=require('node:fs');
const path=require('node:path');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10});
pool.on('error',e=>console.error('Database connection error:',e.code));
const query=(...args)=>pool.query(...args);
async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
const migrate=()=>query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
module.exports={pool,query,tx,migrate};
