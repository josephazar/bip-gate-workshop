const express=require('express');
const helmet=require('helmet');
const cors=require('cors');
const {rateLimit}=require('express-rate-limit');
const argon2=require('argon2');
const jwt=require('jsonwebtoken');
const crypto=require('node:crypto');
const {OAuth2Client}=require('google-auth-library');
const db=require('./db');
const secret=process.env.JWT_SECRET;
if(!secret || secret.length<32) throw new Error('Set JWT_SECRET to at least 32 random characters.');
const issuer='bip-gate', audience='bip-gate-api';
const googleAudiences=(process.env.GOOGLE_CLIENT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
const google=new OAuth2Client();
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const error=(status,message)=>Object.assign(new Error(message),{status});
const userView=u=>({id:u.id,email:u.email,name:u.name,role:u.role});
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',Number(process.env.TRUST_PROXY||1));
app.use(helmet());
const origins=(process.env.CORS_ORIGINS||'http://localhost:8080,http://127.0.0.1:8080').split(',');
app.use(cors({origin(origin,cb){cb(null,!origin||origins.includes(origin));}}));
app.use(express.json({limit:'16kb'}));
app.use('/auth',rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
app.use('/auth',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const loginLimit=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false});
app.get('/healthz',asyncRoute(async(_req,res)=>{await db.query('SELECT 1');res.json({ok:true,app:'bip-gate',version:'1.0.0'});}));
app.get('/',(_req,res)=>res.json({app:'The Gate',health:'/healthz',docs:'See the workshop README',googleConfigured:googleAudiences.length>0}));
function credentials(body){
 const email=String(body.email||'').trim().toLowerCase();
 const password=body.password;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128) throw error(400,'Use a valid email and a password of 12 to 128 characters.');
 return {email,password};
}
function access(user,sid){return jwt.sign({sid,role:user.role},secret,{algorithm:'HS256',issuer,audience,subject:user.id,expiresIn:'15m'});}
async function newRefresh(c,sid,expires){
 const token=crypto.randomBytes(32).toString('base64url');
 await c.query('INSERT INTO gate_refresh_tokens(token_hash,session_id,expires_at) VALUES($1,$2,$3)',[sha(token),sid,expires]);
 return token;
}
async function issueSession(user){
 const sid=crypto.randomUUID(),expires=new Date(Date.now()+7*86400000);
 const refreshToken=await db.tx(async c=>{await c.query('INSERT INTO gate_sessions(id,user_id,expires_at) VALUES($1,$2,$3)',[sid,user.id,expires]);return newRefresh(c,sid,expires);});
 return {accessToken:access(user,sid),refreshToken,expiresIn:900,user:userView(user)};
}
const requireAuth=asyncRoute(async(req,res,next)=>{
 try{
  const match=(req.get('authorization')||'').match(/^Bearer (\S+)$/);
  if(!match) throw error(401,'Authentication required.');
  const claims=jwt.verify(match[1],secret,{algorithms:['HS256'],issuer,audience});
  if(!/^[a-f\d-]{36}$/.test(claims.sub||'')||!/^[a-f\d-]{36}$/.test(claims.sid||'')) throw error(401,'Invalid claims.');
  const u=(await db.query('SELECT u.* FROM gate_users u JOIN gate_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()',[claims.sub,claims.sid])).rows[0];
  if(!u) throw error(401,'Session expired or revoked.');
  req.user=u;req.sid=claims.sid;next();
 }catch(e){if(e.status||e instanceof jwt.JsonWebTokenError||e instanceof jwt.TokenExpiredError) return res.status(401).json({error:'Invalid or expired session.'});throw e;}
});
const requireRole=role=>(req,res,next)=>req.user.role===role?next():res.status(403).json({error:'Insufficient permission.'});
app.post('/auth/register',loginLimit,asyncRoute(async(req,res)=>{
 const {email,password}=credentials(req.body);
 const name=String(req.body.name||'').trim();
 if(name.length<1||name.length>100) throw error(400,'Name is required (up to 100 characters).');
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
 try{
  const u=(await db.query('INSERT INTO gate_users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[crypto.randomUUID(),email,name,hash])).rows[0];
  res.status(201).json(await issueSession(u));
 }catch(e){if(e.code==='23505') throw error(409,'An account already exists. Sign in or use another email.');throw e;}
}));
// The dummy hash makes nonexistent-user login perform the same password-hash work.
const dummyHash=argon2.hash(crypto.randomBytes(32).toString('hex'),{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
app.post('/auth/login',loginLimit,asyncRoute(async(req,res)=>{
 const {email,password}=credentials(req.body);
 const u=(await db.query('SELECT * FROM gate_users WHERE email=$1',[email])).rows[0];
 const valid=await argon2.verify(u?.password_hash||await dummyHash,password);
 if(!valid||!u?.password_hash) throw error(401,'Invalid email or password.');
 res.json(await issueSession(u));
}));
app.post('/auth/refresh',asyncRoute(async(req,res)=>{
 const token=req.body.refreshToken;
 if(typeof token!=='string'||token.length>200) throw error(401,'Invalid refresh token.');
 const out=await db.tx(async c=>{
  const r=(await c.query(`SELECT r.*,s.user_id,s.revoked_at,s.expires_at AS session_expires
   FROM gate_refresh_tokens r JOIN gate_sessions s ON s.id=r.session_id
   WHERE r.token_hash=$1 FOR UPDATE OF r,s`,[sha(token)])).rows[0];
  if(!r||r.revoked_at||new Date(r.expires_at)<=new Date()) return null;
  if(r.used_at){await c.query('UPDATE gate_sessions SET revoked_at=now() WHERE id=$1',[r.session_id]);return {reused:true};}
  await c.query('UPDATE gate_refresh_tokens SET used_at=now() WHERE token_hash=$1',[sha(token)]);
  const refreshToken=await newRefresh(c,r.session_id,r.session_expires);
  const u=(await c.query('SELECT * FROM gate_users WHERE id=$1',[r.user_id])).rows[0];
  return {accessToken:access(u,r.session_id),refreshToken,expiresIn:900,user:userView(u)};
 });
 if(!out||out.reused) throw error(401,out?.reused?'Refresh token reuse detected; sign in again.':'Session expired or revoked.');
 res.json(out);
}));
app.post('/auth/logout',asyncRoute(async(req,res)=>{
 const token=req.body.refreshToken;
 if(typeof token==='string'&&token.length<=200) await db.query('UPDATE gate_sessions SET revoked_at=now() WHERE id IN (SELECT session_id FROM gate_refresh_tokens WHERE token_hash=$1)',[sha(token)]);
 res.status(204).end();
}));
async function googleIdentity(idToken){
 if(!googleAudiences.length) throw error(503,'Google Sign-In is not configured. Password login remains available.');
 if(typeof idToken!=='string'||idToken.length>10000) throw error(400,'ID token required.');
 let p;
 try{p=(await google.verifyIdToken({idToken,audience:googleAudiences})).getPayload();}catch{throw error(401,'Invalid Google ID token.');}
 if(!p?.sub||!p.email||p.email_verified!==true) throw error(401,'A verified Google identity is required.');
 return p;
}
app.post('/auth/google',loginLimit,asyncRoute(async(req,res)=>{
 const p=await googleIdentity(req.body.idToken);
 let u=(await db.query('SELECT * FROM gate_users WHERE google_sub=$1',[p.sub])).rows[0];
 if(!u){
  try{u=(await db.query('INSERT INTO gate_users(id,email,name,google_sub) VALUES($1,$2,$3,$4) RETURNING *',[crypto.randomUUID(),p.email.toLowerCase(),String(p.name||p.email).slice(0,100),p.sub])).rows[0];}
  catch(e){if(e.code==='23505') throw error(409,'Sign in to your existing account, then explicitly link Google.');throw e;}
 }
 res.json(await issueSession(u));
}));
app.post('/auth/google/link',requireAuth,asyncRoute(async(req,res)=>{
 const p=await googleIdentity(req.body.idToken);
 if(req.user.google_sub&&req.user.google_sub!==p.sub) throw error(409,'A different Google identity is already linked.');
 try{await db.query('UPDATE gate_users SET google_sub=$1 WHERE id=$2',[p.sub,req.user.id]);}
 catch(e){if(e.code==='23505') throw error(409,'That Google identity is already linked.');throw e;}
 res.json({linked:true});
}));
app.get('/me',requireAuth,(req,res)=>{res.set('Cache-Control','no-store');res.json(userView(req.user));});
app.get('/admin/users',requireAuth,requireRole('admin'),asyncRoute(async(_req,res)=>{res.set('Cache-Control','no-store');res.json((await db.query('SELECT id,email,name,role,created_at FROM gate_users ORDER BY created_at LIMIT 200')).rows);}));
app.use((req,res)=>res.status(404).json({error:'Route not found.'}));
app.use((e,_req,res,_next)=>{if(!e.status) console.error('Request failed:',e.code||e.name);res.status(e.status||500).json({error:e.status?e.message:'Server error.'});});
module.exports={app,requireAuth,requireRole};
