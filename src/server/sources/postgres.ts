import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {database,transaction} from '../db';
import type {SourceConfig,SourceName} from '../config';
import {AdminError} from '../errors';
import {sourceFor,type Sources,type SourceKind,type Page,type Item} from './types';
const views:Record<SourceKind,string>={workplaces:'workplaces',registrations:'registrations',catalog:'catalog',requests:'requests'};
function item(raw:unknown):Item{const r=z.object({id:z.uuid(),createdAt:z.string()}).passthrough().parse(raw);return {...r,createdAt:new Date(r.createdAt).toISOString()};}
export class PostgresSources implements Sources {
 private pools:Partial<Record<SourceName,Pool>>;
 constructor(private config:Partial<Record<SourceName,SourceConfig>>,pools?:Partial<Record<SourceName,Pool>>){this.pools=pools??Object.fromEntries(Object.entries(config).map(([k,c])=>[k,database(c!.url,2)]));}
 private async read<T>(kind:SourceKind,work:(c:PoolClient)=>Promise<T>):Promise<T>{
  const name=sourceFor[kind],cfg=this.config[name],pool=this.pools[name];if(!cfg||!pool)throw new AdminError(503,'source_unavailable');
  try{return await transaction(pool,async c=>{await c.query('SET TRANSACTION READ ONLY');await c.query("SET LOCAL statement_timeout='3s'");
   const identity=(await c.query(`SELECT current_database() AS db,current_user AS role,r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication AS elevated,
    EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS memberships,
    EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','velani_admin_projection') AND n.nspname NOT LIKE 'pg_%' AND t.relkind IN('r','v','m','p','f') AND has_table_privilege(current_user,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS excessive
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
   const binding=(await c.query('SELECT system,environment,project_id,branch_id,version FROM velani_admin_projection.binding')).rows;
   if(identity.db!==cfg.database||identity.role!==cfg.role||identity.elevated||identity.memberships||identity.excessive||binding.length!==1||binding[0].system!==name||binding[0].environment!==cfg.environment||binding[0].project_id!==cfg.projectId||binding[0].branch_id!==cfg.branchId||binding[0].version!==1)throw Error('source_identity_mismatch');
   return work(c);
  });}catch{throw new AdminError(503,'source_unavailable');}
 }
 async list(kind:SourceKind,page:Page){
  if(!Number.isInteger(page.limit)||page.limit<1||page.limit>100||(page.excludeIds?.length??0)>1000)throw new AdminError(400,'invalid_page');
  return this.read(kind,async c=>{const q=page.query?.replace(/[\\%_]/g,'\\$&');const r=await c.query(`SELECT data FROM velani_admin_projection.${views[kind]} WHERE NOT(id=ANY($1::uuid[])) AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) AND ($4::text IS NULL OR search_text ILIKE '%'||$4||'%' OR search_email=$5) ORDER BY created_at DESC,id DESC LIMIT $6`,[page.excludeIds??[],page.after?.createdAt??null,page.after?.id??null,q??null,page.query?.toLowerCase()??null,page.limit+1]);return {items:r.rows.slice(0,page.limit).map(r=>item(r.data)),more:r.rows.length>page.limit};});
 }
 async batch(kind:SourceKind,ids:string[]){if(ids.length>100||ids.some(id=>!z.uuid().safeParse(id).success))throw new AdminError(400,'invalid_ids');if(!ids.length)return [];return this.read(kind,async c=>(await c.query(`SELECT data FROM velani_admin_projection.${views[kind]} WHERE id=ANY($1::uuid[])`,[ids])).rows.map(r=>item(r.data)));}
 async get(kind:SourceKind,id:string){if(!z.uuid().safeParse(id).success)throw new AdminError(400,'invalid_id');const view=kind==='requests'?'request_details':kind==='workplaces'?'workplace_details':views[kind];return this.read(kind,async c=>{const r=(await c.query(`SELECT data FROM velani_admin_projection.${view} WHERE id=$1`,[id])).rows[0];return r?item(r.data):null;});}
 async count(kind:SourceKind,excludeIds:string[]=[]){if(excludeIds.length>1000)throw new AdminError(503,'classification_coverage_unavailable');return this.read(kind,async c=>Number((await c.query(`SELECT count(*) AS n FROM velani_admin_projection.${views[kind]} WHERE NOT(id=ANY($1::uuid[]))`,[excludeIds])).rows[0].n));}
 async close(){await Promise.all(Object.values(this.pools).map(p=>p.end()));}
}
