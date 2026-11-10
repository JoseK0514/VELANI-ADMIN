import {Pool,type PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
export const migrations=['0001_admin.sql','0002_identity_review.sql'] as const;
export function database(url:string,max=3){const pool=new Pool({connectionString:url,max,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:3000,query_timeout:4000});pool.on('error',()=>{});return pool;}
export async function transaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
/** Explicit operator action only. Build/start and request handlers never call this. */
export async function migrate(pool:Pool){
 const c=await pool.connect();try{await c.query("SELECT pg_advisory_lock(hashtext('velani-admin-migrations'))");
 for(const file of migrations){const sql=await readFile(new URL('../../db/migrations/'+file,import.meta.url),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
 const exists=(await c.query("SELECT to_regclass('admin.schema_migrations') AS t")).rows[0].t;
 if(exists){const old=(await c.query('SELECT checksum FROM admin.schema_migrations WHERE version=$1',[file])).rows[0];if(old){if(old.checksum!==checksum)throw Error('migration_checksum_mismatch');continue;}}
 await c.query('BEGIN');try{await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));await c.query('INSERT INTO admin.schema_migrations(version,checksum) VALUES($1,$2)',[file,checksum]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}
 }
 }finally{await c.query("SELECT pg_advisory_unlock(hashtext('velani-admin-migrations'))").catch(()=>{});c.release();}
}
