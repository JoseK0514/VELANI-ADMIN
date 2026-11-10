import {randomUUID} from 'node:crypto';
import {payloads} from './validation';
import {AdminError} from '../errors';
import {lockClient,lockProject,bump,root,type Context} from './context';
export async function projectCommand(ctx:Context,kind:'project.create'|'project.update',id:string|undefined,raw:unknown){
 const {c,expected}=ctx;if(kind==='project.create'){root(expected);const p=payloads[kind].parse(raw),client=await lockClient(ctx,p.clientId);if(client.relationship_state==='inactive')throw new AdminError(409,'client_inactive');const projectId=randomUUID();await c.query('INSERT INTO admin.projects(id,client_id,name,stage,target_date) VALUES($1,$2,$3,$4,$5)',[projectId,p.clientId,p.name,p.stage,p.targetDate??null]);return {entityType:'project',entityId:projectId,version:'1'};}
 if(!id)throw new AdminError(422,'missing_target');const p=payloads[kind].parse(raw),{row,client}=await lockProject(ctx,id),next=p.stage??row.stage;
 if(['completed','canceled'].includes(row.stage)&&!['completed','canceled'].includes(next)&&p.reasonCode!=='reopened_work')throw new AdminError(422,'reopen_reason_required');
 if(client.relationship_state==='inactive'&&!['completed','canceled'].includes(next))throw new AdminError(409,'client_inactive');
 await c.query('UPDATE admin.projects SET name=$2,stage=$3,target_date=$4 WHERE id=$1',[id,p.name??row.name,next,p.targetDate===undefined?row.target_date:p.targetDate]);return {entityType:'project',entityId:id,version:await bump(c,'projects',id)};
}
