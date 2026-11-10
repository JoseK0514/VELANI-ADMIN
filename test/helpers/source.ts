import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {testDatabase} from './db';
import type {SourceName,SourceConfig} from '../../src/server/config';
export async function sourceFixture(name:SourceName){
 const db=await testDatabase(false),role='velani_admin_'+name+'_reader_'+randomBytes(5).toString('hex');
 const fixture={control:`CREATE SCHEMA nevora_onboarding;
 CREATE TABLE nevora_onboarding.workspace_registry(id uuid,canonical_origin text,environment text,incarnation bigint,revision bigint,lifecycle text,created_at timestamptz,app_secret_ref text);
 CREATE TABLE nevora_onboarding.registrations(id uuid,environment text,locale text,state text,version bigint,verified_at timestamptz,expires_at timestamptz,created_at timestamptz,email_ciphertext text);
 CREATE TABLE nevora_onboarding.provisioning_operations(workspace_id uuid,state text,updated_at timestamptz,payload_ciphertext text);`,catalog:`CREATE SCHEMA commerce;
 CREATE TABLE commerce.accounts(id uuid,email text,profile jsonb,created_at timestamptz,password_hash text);
 CREATE TABLE commerce.businesses(id uuid,trial_started_at timestamptz,trial_ends_at timestamptz,paid_through timestamptz,past_due_since timestamptz,subscription_status text,plan_key text,sync_at timestamptz,employee_count int);
 CREATE TABLE commerce.external_installations(business_id uuid,environment text,incarnation bigint,instance_secret text);`,velani:`CREATE TABLE public.client_hub_requests(id uuid,reference text,fields jsonb,created_at timestamptz,expires_at timestamptz,key_hash text);
 CREATE TABLE public.client_hub_outbox(request_id uuid,kind text,status text,attempts int,provider_id text,payload jsonb);`}[name];
 await db.pool.query(fixture);
 await db.pool.query(await readFile('db/source-views/'+name+'.sql','utf8'));
 await db.pool.query("INSERT INTO velani_admin_projection.binding(system,environment,project_id,branch_id,version) VALUES($1,'test','owned-project','owned-branch',1)",[name]);
 await db.pool.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
 await db.pool.query('GRANT USAGE ON SCHEMA velani_admin_projection TO '+role);
 await db.pool.query('GRANT SELECT ON ALL TABLES IN SCHEMA velani_admin_projection TO '+role);
 const url=new URL(db.url);url.username=role;const pool=new Pool({connectionString:url.href});
 const config:SourceConfig={url:url.href,projectId:'owned-project',branchId:'owned-branch',database:url.pathname.slice(1),role,environment:'test'};
 return {db,pool,config,close:async()=>{await pool.end();await db.close();const root=new Pool({connectionString:process.env.ADMIN_TEST_DATABASE_URL});await root.query('DROP ROLE '+role);await root.end();}};
}
