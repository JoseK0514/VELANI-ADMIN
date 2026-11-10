import {mkdtempSync,existsSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
if(Object.keys(process.env).some(k=>/DATABASE_URL$/.test(k)))throw Error('Unset database URL environment variables before owned tests.');
const bin=process.env.ADMIN_TEST_PG_BIN??'/Users/josek0514/Documents/Codex/2026-10-26/hi-right-now-i-am-trying/work/integration-evidence/pg-runtime/package/native/bin';
if(!existsSync(join(bin,'initdb')))throw Error('ADMIN_TEST_PG_BIN must name an existing PostgreSQL bin directory.');
const port=await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();s.close(()=>resolve(a.port));});});
const owned=mkdtempSync(join(tmpdir(),'velani-admin-owned-')),data=join(owned,'data');
mkdirSync('.omo/evidence',{recursive:true});writeFileSync(join(owned,'owner'),randomBytes(32).toString('hex'),{mode:0o600});
const run=(name,args)=>{const p=spawnSync(join(bin,name),args,{encoding:'utf8',timeout:45000});if(p.status!==0)throw Error(name+' failed: '+p.stderr);};
let started=false,exit=1;
try{run('initdb',['-D',data,'-U','velani_admin_test','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']);run('pg_ctl',['-D',data,'-l',join(owned,'pg.log'),'-w','start','-o',`-h 127.0.0.1 -p ${port} -k ${owned}`]);started=true;console.log('Owned loopback PostgreSQL; no external database credentials.');
 const env={...process.env,ADMIN_TEST_DATABASE_URL:`postgresql://velani_admin_test@127.0.0.1:${port}/postgres`};
 const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...process.argv.slice(2)],{env,stdio:'inherit'});exit=result.status??1;
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(owned,{recursive:true,force:true});}
process.exitCode=exit;
