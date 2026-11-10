import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import type {AuthenticationResponseJSON,RegistrationResponseJSON} from '@simplewebauthn/server';
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest();
export function authenticator(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32).toString('base64url');let count=0;
 const cose=Buffer.from(isoCBOR.encode(new Map<number,number|Uint8Array>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]) as Map<number,number|Uint8Array>));
 return {id,cose,register:(challenge:string,origin:string,uv=true):RegistrationResponseJSON=>{
 const rp=new URL(origin).hostname,cred=Buffer.from(id,'base64url'),len=Buffer.alloc(2);len.writeUInt16BE(cred.length);
 const authData=Buffer.concat([hash(rp),Buffer.from([uv?0x45:0x41]),Buffer.alloc(4),Buffer.alloc(16),len,cred,cose]);
 const att=isoCBOR.encode(new Map<string,string|Map<string,string>|Uint8Array>([['fmt','none'],['attStmt',new Map<string,string>()],['authData',authData]]) as Map<string,string|Map<string,string>|Uint8Array>);
 return {id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin})).toString('base64url'),attestationObject:Buffer.from(att).toString('base64url'),transports:['internal']}};
 },assert:(challenge:string,origin:string,uv=true):AuthenticationResponseJSON=>{
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false})),counter=Buffer.alloc(4);counter.writeUInt32BE(++count);
 const data=Buffer.concat([hash(new URL(origin).hostname),Buffer.from([uv?5:1]),counter]);
 return {id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:data.toString('base64url'),signature:sign('sha256',Buffer.concat([data,hash(client)]),privateKey).toString('base64url'),userHandle:undefined}};
 }};
}
