import {createHmac,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
export const token=()=>randomBytes(32).toString('base64url');
export const digest=(key:Uint8Array,purpose:string,value:string)=>createHmac('sha256',key).update(purpose+'\0'+value).digest('base64url');
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function seal(key:Uint8Array,binding:string,value:unknown){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(binding));const data=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64url');}
export function unseal<T>(key:Uint8Array,binding:string,value:string):T{const b=Buffer.from(value,'base64url'),c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAAD(Buffer.from(binding));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString('utf8')) as T;}
