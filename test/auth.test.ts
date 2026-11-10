import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/db';
import {fixtureConfig} from './helpers/config';
import {oidcFixture} from './helpers/oidc';
import {authenticator} from './helpers/authenticator';
import {GoogleOidc} from '../src/server/auth/oidc';
import {AuthService} from '../src/server/auth/service';
async function setup(claims:Record<string,unknown>={}){const db=await testDatabase(),config=fixtureConfig(db.url),issuer=await oidcFixture(claims),id=randomUUID();await db.pool.query("INSERT INTO admin.actors(id,email,google_subject,enabled,enrollment_until) VALUES($1,$2,$3,true,clock_timestamp()+interval '10 minutes')",[id,config.ownerEmail,'owned-google-subject']);const auth=new AuthService(db.pool,config,new GoogleOidc(config,async()=>issuer.configuration));return {db,config,issuer,id,auth,close:async()=>{await issuer.close();await db.close();}};}
async function pending(s:Awaited<ReturnType<typeof setup>>){const start=await s.auth.start();return s.auth.callback(await s.issuer.callback(start.url),start.flowToken);}
it('requires verified Google identity and two actually verified passkeys before issuing a business session',async()=>{const s=await setup();try{
 const operation=pending(s);await expect(operation).resolves.toMatchObject({state:'enrollment_required'});const p=await operation;const key=authenticator(),backup=authenticator();
 for(const k of [key,backup]){const o=await s.auth.registrationOptions(p.pendingToken);await s.auth.register(p.pendingToken,o.challengeId,k.register(o.options.challenge,s.config.origin));}
 const o=await s.auth.authenticationOptions(p.pendingToken),session=await s.auth.verify(p.pendingToken,o.challengeId,key.assert(o.options.challenge,s.config.origin));
 const actor=await s.auth.authenticate(session.token);expect(actor.id).toBe(s.id);expect(actor.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
 await expect(s.auth.verify(p.pendingToken,o.challengeId,key.assert(o.options.challenge,s.config.origin))).rejects.toMatchObject({status:401});
 await s.auth.logout(actor);await expect(s.auth.authenticate(session.token)).rejects.toMatchObject({status:401});
 }finally{await s.close();}});
it.each([{claims:{email:'other@example.invalid'},status:403},{claims:{email_verified:false},status:403},{claims:{sub:'foreign-subject'},status:403},{claims:{aud:'wrong-client'},status:401},{claims:{nonce:'wrong-nonce'},status:401},{claims:{exp:1},status:401}])('denies an invalid or unauthorized signed identity %j',async ({claims,status})=>{const s=await setup(claims);try{await expect(pending(s)).rejects.toMatchObject({status});expect((await s.db.pool.query('SELECT count(*)::integer n FROM admin.pending_logins')).rows[0].n).toBe(0);}finally{await s.close();}});
it('rejects registration without user verification and rejects a consumed challenge',async()=>{const s=await setup();try{const p=await pending(s),k=authenticator(),o=await s.auth.registrationOptions(p.pendingToken);await expect(s.auth.register(p.pendingToken,o.challengeId,k.register(o.options.challenge,s.config.origin,false))).rejects.toMatchObject({status:400});await expect(s.auth.register(p.pendingToken,o.challengeId,k.register(o.options.challenge,s.config.origin))).rejects.toMatchObject({status:401});}finally{await s.close();}});
it('expires pending identity and rejects mismatched flow cookies before token exchange',async()=>{const s=await setup();try{const start=await s.auth.start();await expect(s.auth.callback(await s.issuer.callback(start.url),'foreign-flow')).rejects.toMatchObject({status:401});const p=await pending(s);await s.db.pool.query("UPDATE admin.pending_logins SET expires_at=clock_timestamp()-interval '1 second'");await expect(s.auth.registrationOptions(p.pendingToken)).rejects.toMatchObject({status:401});}finally{await s.close();}});
