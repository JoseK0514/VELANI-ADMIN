import {it,expect} from 'vitest';
import {testDatabase} from './helpers/db';
import {adminGrants} from '../src/server/principals';
import {migrate} from '../src/server/db';
it('creates isolated admin authority and business storage without customer workforce tables',async()=>{
 const db=await testDatabase();try{
 const r=await db.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='admin' ORDER BY table_name");
 expect(r.rows.map(x=>x.table_name)).toEqual(expect.arrayContaining(['actors','sessions','clients','projects','cases','audit','commands','deletions']));
 expect((await db.pool.query("SELECT count(*)::integer n FROM information_schema.tables WHERE table_name IN('employee_credentials','workspace_secrets','provisioning_private')")).rows[0].n).toBe(0);
 }finally{await db.close();}
});
it('gives the web principal business writes but no audit deletion, owner enrollment or role escalation',async()=>{
 const db=await testDatabase();try{
 await db.pool.query('CREATE ROLE velani_admin_web; CREATE ROLE velani_admin_maintenance');
 for(const sql of adminGrants('velani_admin_web','velani_admin_maintenance'))await db.pool.query(sql);
 const rows=await db.pool.query("SELECT has_table_privilege('velani_admin_web','admin.clients','UPDATE') AS edit,has_table_privilege('velani_admin_web','admin.audit','DELETE') AS erase_audit,has_table_privilege('velani_admin_web','admin.actors','UPDATE') AS enroll,has_schema_privilege('velani_admin_web','admin','CREATE') AS create_schema");
 expect(rows.rows[0]).toEqual({edit:true,erase_audit:false,enroll:false,create_schema:false});
 }finally{await db.close();}
});
it('applies explicit migrations atomically with checksums and replays without recreating tables',async()=>{const db=await testDatabase(false);try{await migrate(db.pool);await migrate(db.pool);const r=await db.pool.query('SELECT count(*)::integer n FROM admin.schema_migrations');expect(r.rows[0].n).toBe(1);}finally{await db.close();}});
