import {createServer} from 'node:http';
import {generateKeyPairSync,randomBytes,sign,createHash} from 'node:crypto';
import * as oidc from 'openid-client';
export async function oidcFixture(overrides:Record<string,unknown>={}){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'owned-key',alg:'RS256',use:'sig'};
 const codes=new Map<string,URLSearchParams>();let origin='';
 const server=createServer(async(req,res)=>{const url=new URL(req.url!,origin);
 if(url.pathname==='/authorize'){const code=randomBytes(16).toString('hex');codes.set(code,url.searchParams);const back=new URL(url.searchParams.get('redirect_uri')!);back.searchParams.set('code',code);back.searchParams.set('state',url.searchParams.get('state')!);res.writeHead(302,{location:back.href});res.end();return;}
 if(url.pathname==='/jwks'){res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[jwk]}));return;}
 if(url.pathname==='/token'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=new URLSearchParams(Buffer.concat(chunks).toString()),params=codes.get(body.get('code')??'');codes.delete(body.get('code')??'');
 if(!params||createHash('sha256').update(body.get('code_verifier')??'').digest('base64url')!==params.get('code_challenge')||body.get('client_secret')!=='fixture-client-secret'){res.writeHead(400);res.end();return;}
 const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'RS256',kid:'owned-key',typ:'JWT'})).toString('base64url'),claims=Buffer.from(JSON.stringify({iss:origin,sub:'owned-google-subject',aud:'fixture-client',iat:now,exp:now+300,nonce:params.get('nonce'),email:'owner@example.invalid',email_verified:true,...overrides})).toString('base64url'),signed=header+'.'+claims;
 res.setHeader('content-type','application/json');res.end(JSON.stringify({access_token:'owned-unused-access-token',token_type:'Bearer',expires_in:300,id_token:signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url')}));return;}
 res.writeHead(404);res.end();});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();if(!a||typeof a==='string')throw Error('Owned server port missing');origin='http://127.0.0.1:'+a.port;
 const configuration=new oidc.Configuration({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',jwks_uri:origin+'/jwks',response_types_supported:['code'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256']},'fixture-client',{client_secret:'fixture-client-secret'},oidc.ClientSecretPost('fixture-client-secret'));oidc.allowInsecureRequests(configuration);
 return {configuration,callback:async(url:string)=>{const r=await fetch(url,{redirect:'manual'});return new URL(r.headers.get('location')!);},close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
