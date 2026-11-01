const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const {app}=require('../src/app');
const db=require('../src/db');
let server,base;
after(async()=>{if(server) await new Promise(r=>server.close(r));await db.pool.end()});
test('password, roles, refresh rotation/reuse, revocation, Google failure and database protection',async()=>{
 await db.migrate();
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.status===204?{}:await r.json()};};
 const email=`qa-${Date.now()}@example.test`,password='correct horse test battery';
 let id;
 try{
  assert.equal((await call('/me')).status,401);
  assert.equal((await call('/auth/register',{email,password:'short',name:'QA'})).status,400);
  const register=await call('/auth/register',{email,password,name:'QA',role:'admin'});assert.equal(register.status,201);id=register.data.user.id;
  assert.equal(register.data.user.role,'user');assert(!JSON.stringify(register.data).includes('password_hash'));
  const row=(await db.query('SELECT * FROM gate_users WHERE id=$1',[id])).rows[0];assert(row.password_hash.startsWith('$argon2id$'));assert.notEqual(row.password_hash,password);
  assert.equal((await call('/auth/login',{email,password:'wrong test password'})).status,401);
  assert.equal((await call('/auth/login',{email:"x'OR1=1--@example.test",password})).status,401);
  const login=(await call('/auth/login',{email,password})).data;
  assert.equal((await call('/me',null,login.accessToken)).data.id,id);
  assert.equal((await call('/admin/users',null,login.accessToken)).status,403);
  const forged=jwt.sign({sid:jwt.decode(login.accessToken).sid,role:'admin'},'a completely different signing secret',{algorithm:'HS256',issuer:'bip-gate',audience:'bip-gate-api',subject:id,expiresIn:'15m'});
  assert.equal((await call('/me',null,forged)).status,401);
  const expired=jwt.sign({sid:jwt.decode(login.accessToken).sid},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'bip-gate',audience:'bip-gate-api',subject:id,expiresIn:-1});
  assert.equal((await call('/me',null,expired)).status,401);
  const refreshed=await call('/auth/refresh',{refreshToken:login.refreshToken});assert.equal(refreshed.status,200);assert.notEqual(refreshed.data.refreshToken,login.refreshToken);
  assert.equal((await call('/auth/refresh',{refreshToken:login.refreshToken})).status,401);
  assert.equal((await call('/me',null,refreshed.data.accessToken)).status,401);
  assert.equal((await call('/auth/refresh',{refreshToken:refreshed.data.refreshToken})).status,401);
  const login2=(await call('/auth/login',{email,password})).data;
  await db.query("UPDATE gate_users SET role='admin' WHERE id=$1",[id]);
  assert.equal((await call('/admin/users',null,login2.accessToken)).status,200);
  await db.query("UPDATE gate_users SET role='user' WHERE id=$1",[id]);
  assert.equal((await call('/admin/users',null,login2.accessToken)).status,403);
  assert.equal((await call('/auth/logout',{refreshToken:login2.refreshToken})).status,204);
  assert.equal((await call('/me',null,login2.accessToken)).status,401);
  assert.equal((await call('/auth/google',{idToken:'not-a-google-token'})).status,503);
  assert.equal((await db.query('SELECT token_hash FROM gate_refresh_tokens WHERE session_id=$1',[jwt.decode(login.accessToken).sid])).rows.some(r=>r.token_hash===login.refreshToken),false);
  // Two concurrent uses of one refresh credential cannot both succeed.
  const login3=(await call('/auth/login',{email,password})).data;
  const race=await Promise.all([call('/auth/refresh',{refreshToken:login3.refreshToken}),call('/auth/refresh',{refreshToken:login3.refreshToken})]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,401]);
  assert.equal((await call('/me',null,race.find(r=>r.status===200).data.accessToken)).status,401);
 }finally{if(id) await db.query('DELETE FROM gate_users WHERE id=$1',[id]);}
});
