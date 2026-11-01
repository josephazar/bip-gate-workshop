const db=require('./db');
const {app}=require('./app');
(async()=>{for(let i=0;;i++){try{await db.migrate();break;}catch(e){if(i===9) throw e;console.warn('Waiting for PostgreSQL…');await new Promise(r=>setTimeout(r,3000));}}
const server=app.listen(Number(process.env.PORT||3220),'0.0.0.0',()=>console.log('The Gate API is ready.'));
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(async()=>{await db.pool.end();process.exit(0);}));
})().catch(e=>{console.error(e.message);process.exit(1)});
