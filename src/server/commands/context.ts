import type {PoolClient} from 'pg';
import type {AdminConfig} from '../config';
import type {Sources} from '../sources/types';
import {AdminError} from '../errors';
export type Context={c:PoolClient;config:AdminConfig;sources:Sources;expected:string};
export type Saved={entityType:string;entityId:string;version:string};
export function version(row:{version:string},expected:string){if(row.version!==expected)throw new AdminError(409,'version_changed');}
export async function lockClient(ctx:Context,id:string,expected?:string){const row=(await ctx.c.query(`SELECT *,((engaged_at IS NULL AND prospect_expires_at<=statement_timestamp()) OR (engaged_at IS NOT NULL AND delete_after<=statement_timestamp())) AS expired FROM admin.clients WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!row||row.expired)throw new AdminError(404,'not_found');if(expected!==undefined)version(row,expected);return row;}
export async function bump(c:PoolClient,table:'clients'|'projects'|'cases',id:string){return (await c.query(`UPDATE admin.${table} SET version=version+1,updated_at=statement_timestamp() WHERE id=$1 RETURNING version::text`,[id])).rows[0].version as string;}
export const root=(expected:string)=>{if(expected!=='0')throw new AdminError(409,'version_changed');};
export async function lockProject(ctx:Context,id:string){const peek=(await ctx.c.query('SELECT client_id FROM admin.projects WHERE id=$1',[id])).rows[0];if(!peek)throw new AdminError(404,'not_found');const client=await lockClient(ctx,peek.client_id);const row=(await ctx.c.query('SELECT * FROM admin.projects WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new AdminError(404,'not_found');version(row,ctx.expected);return {row,client};}
export async function lockCase(ctx:Context,id:string){const row=(await ctx.c.query('SELECT * FROM admin.cases WHERE id=$1 AND source_expires_at>statement_timestamp() FOR UPDATE',[id])).rows[0];if(!row)throw new AdminError(404,'not_found');version(row,ctx.expected);return row;}
