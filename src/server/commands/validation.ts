import {z} from 'zod';
import {AdminError} from '../errors';
const text=(max:number)=>z.string().trim().min(1).max(max).refine(s=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s));
const reason=z.enum(['confirmed_contact','contact_correction','client_link_verified','client_requested_change','engagement_confirmed','engagement_reconfirmed','relationship_closed','reopened_work']);
const provenance=z.enum(['asserted','source_enrollment','operator_verified']);
const contact={name:text(120),email:z.email().max(254).transform(s=>s.toLowerCase()),phone:z.string().trim().max(32).nullable().optional(),language:z.enum(['en','es']),provenance,sourceId:z.uuid().optional(),reasonCode:reason.optional()};
const stage=z.enum(['planned','in_progress','waiting_client','completed','canceled']);
export const payloads={
 'client.create':z.object({displayName:text(160),relationshipState:z.literal('prospect')}).strict(),
 'client.update':z.object({displayName:text(160).optional(),relationshipState:z.enum(['prospect','active','inactive']).optional(),reasonCode:reason.optional(),confirmServiceRelationship:z.boolean().optional()}).strict(),
 'contact.create':z.object(contact).strict(),
 'contact.update':z.object(contact).partial().extend({active:z.boolean().optional(),reasonCode:reason}).strict(),
 'project.create':z.object({clientId:z.uuid(),name:text(200),stage,targetDate:z.iso.date().nullable().optional()}).strict(),
 'project.update':z.object({name:text(200).optional(),stage:stage.optional(),targetDate:z.iso.date().nullable().optional(),reasonCode:reason.optional()}).strict(),
 'case.create':z.object({sourceRequestId:z.uuid()}).strict(),
 'case.update':z.object({state:z.enum(['new','reviewing','waiting_client','resolved','closed']),followUpAt:z.iso.datetime().nullable().optional(),clientId:z.uuid().nullable().optional(),projectId:z.uuid().nullable().optional(),reasonCode:reason.optional()}).strict(),
 'source-link.create':z.object({sourceSystem:z.literal('nevora'),sourceId:z.uuid(),expectedSourceRevision:z.string().regex(/^[1-9][0-9]{0,18}$/),expectedIncarnation:z.string().regex(/^[1-9][0-9]{0,18}$/),reasonCode:z.literal('client_link_verified')}).strict(),
 'note.create':z.object({targetType:z.enum(['client','project','case']),targetId:z.uuid(),text:text(2000)}).strict()
};
export type CommandKind=keyof typeof payloads;
export const envelope=z.object({schemaVersion:z.literal(1),operationId:z.uuid(),expectedVersion:z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(s=>BigInt(s)<=9223372036854775807n),payload:z.unknown()}).strict();
export function parseCommand(kind:CommandKind,raw:unknown){const e=envelope.safeParse(raw);if(!e.success)throw invalid(e.error);const p=payloads[kind].safeParse(e.data.payload);if(!p.success)throw invalid(p.error);if(!Object.keys(p.data).length)throw new AdminError(422,'empty_command');return {...e.data,payload:p.data};}
function invalid(e:z.ZodError){const fields:Record<string,string[]>={};for(const i of e.issues)fields[i.path.join('.')||'body']=[i.code];return new AdminError(422,'invalid_fields',fields);}
