// Full admission protocol in the existing disposable real-provider fixture.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {decodeJwt,decodeProtectedHeader,jwtVerify} from 'jose';
import {signJWT} from 'better-auth/plugins/jwt';
import {generateCodeChallenge,signPrivateKeyJwtClientAssertion} from 'better-auth/oauth2';
import {createEligibilityIdentity} from '../../src/lib/identity/eligibility-context.ts';
import {createEligibilityService} from '../../src/lib/nexus-eligibility/service.ts';
import {createAdmissionService} from '../../src/lib/identity/admission/service.ts';
import {createAdmissionHandler} from '../../src/lib/identity/admission/http.ts';
import {createAdmissionJwksReader} from '../../src/lib/identity/admission/provider.ts';
import {verifyAdmissionContext} from '../../src/lib/identity/admission/verification.ts';
const opaque=()=>randomBytes(32).toString('base64url');
const error=code=>e=>e.error===code;
export async function runAdmissionTests(t,f) {
 const {pool,auth,integration,client,app,operation,policy,jkt,proof}=f;
 const origin=new URL(policy.issuer).origin,endpoint=origin+'/api/is/v1/admission/redemptions',callback='https://bff.example.test/callback';
 const ctx=await auth.$context;
 const clientsBefore=(await pool.query('SELECT * FROM "oauthClient" ORDER BY "clientId"')).rows;
 const keysBefore=(await pool.query('SELECT id,"publicKey" FROM jwks ORDER BY id')).rows;
 await pool.query(await readFile('db/proposals/is-admission-2.sql','utf8'));
 const person=await ctx.test.saveUser(ctx.test.createUser({email:'admission-human@example.test',emailVerified:true}));
 const login=await ctx.test.login({userId:person.id});
 await pool.query('INSERT INTO is_admission_emails(email) VALUES($1)',[person.email]);
 let enabled=true,access,resourceSubject,nonce;
 const identityOptions={policy,transaction:integration.registry.transaction,enabled:()=>true,
   authenticate:async headers=>{const s=await auth.api.getSession({headers,query:{disableCookieCache:true}});return s?{userId:s.user.id,sessionId:s.session.id}:null;}};
 const identity=createEligibilityIdentity(identityOptions),nexus=createEligibilityService(identity);
 const options={registry:integration.registry,identity,nexus,enabled:()=>enabled,clientAllowed:id=>id===client.client_id,
   reservations:async()=>(await auth.$context).internalAdapter,
   sign:async(claims,keyId)=>signJWT({context:ctx},{payload:claims,header:{typ:'is-admission+jwt'},signingKeyId:keyId,signingAlgorithm:'EdDSA'}),
   jwks:createAdmissionJwksReader(integration.registry)};
 const service=createAdmissionService(options);
 const httpOptions={enabled:()=>enabled,publicOrigin:origin,service,
   authenticated:async headers=>!!await auth.api.getSession({headers,query:{disableCookieCache:true}})};
 const handlers=Object.fromEntries(['authorize','choices','selection','redemptions'].map(name=>[name,createAdmissionHandler(httpOptions,name)]));
 async function browser(op,path,{method='GET',body,headers={},session=login.headers}={},id) {
   const h=new Headers(session);h.set('host',new URL(origin).host);
   if(method==='POST'){h.set('origin',origin);h.set('content-type','application/json');}
   for(const[k,v]of Object.entries(headers))h.set(k,v);
   return handlers[op](new Request(origin+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),id);
 }
 const grant=async()=>{
   const result=await f.redeem(await f.authorizeCode(login.headers));assert.equal(result.status,200,JSON.stringify(result.body));
   access=result.body.access_token;resourceSubject=decodeJwt(access).sub;
 };
 await grant();
 const start=async()=>{
   const verifier='b'.repeat(64),state=opaque(),nonce=opaque();
   const query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,state,nonce,
     code_challenge:await generateCodeChallenge(verifier),code_challenge_method:'S256'});
   const response=await browser('authorize','/api/is/v1/admission/authorize?'+query);
   assert.equal(response.status,302,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');
   const id=response.headers.get('location').split('/').at(-1),csrf=response.headers.get('set-cookie').match(/=([^;]+)/)[1];
   return {id,csrf,verifier,state,nonce};
 };
 const choices=async flow=>{
   const r=await browser('choices','/api/is/v1/admission/transactions/'+flow.id,{},flow.id);
   assert.equal(r.status,200,await r.clone().text());return r.json();
 };
 const confirm=async(flow,tenant,more={})=>{
   const response=await browser('selection','/api/is/v1/admission/transactions/'+flow.id+'/selection',{method:'POST',
     headers:{cookie:login.headers.get('cookie')+'; __Host-is_admission_csrf='+flow.csrf,'x-csrf-token':flow.csrf,accept:'application/json'},
     body:{tenantId:tenant,expectedVersion:'1',...more}},flow.id);
   return response;
 };
 const code=async(flow,tenant)=>{
   const response=await confirm(flow,tenant);assert.equal(response.status,200,await response.clone().text());
   const redirect=new URL((await response.json()).redirect);assert.equal(redirect.origin,new URL(callback).origin);
   assert.equal(redirect.searchParams.get('state'),flow.state);return redirect.searchParams.get('code');
 };
 const assertion=async(audience=endpoint,clientId=client.client_id)=>signPrivateKeyJwtClientAssertion({clientId,tokenEndpoint:audience,
   privateKeyJwk:f.priv,kid:f.pub.kid,algorithm:'ES256',expiresIn:60});
 const exchange=async(flow,value,{signedAssertion,signedProof,override={},requestHeaders={}}={})=>{
   const h={host:new URL(origin).host,'content-type':'application/x-www-form-urlencoded',
     dpop:signedProof??await proof(undefined,endpoint,'POST',nonce?{nonce}:{}),...requestHeaders};
   const body={client_id:client.client_id,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
     client_assertion:signedAssertion??await assertion(),code:value,code_verifier:flow.verifier,redirect_uri:callback,...override};
   const response=await handlers.redemptions(new Request(endpoint,{method:'POST',headers:h,body:new URLSearchParams(body)}));
   const result=await response.json();return {status:response.status,body:result,headers:response.headers};
 };
 const exchangeWithNonce=async(flow,value)=>{
   let result=await exchange(flow,value);
   if(result.status===401&&result.body.error==='use_dpop_nonce'){nonce=result.headers.get('dpop-nonce');assert.ok(nonce);result=await exchange(flow,value);}
   return result;
 };
 const expect=flow=>({issuer:policy.issuer,clientId:client.client_id,applicationId:app,environment:policy.environment,
   subject:resourceSubject,nonce:flow.nonce,tenantId:first,keyThumbprint:jkt});
 const tenant=async(key,{member=true,entitled=true,status='active',governed=true}={})=>{
   const id=randomUUID(),tx=await pool.connect();try{
    await tx.query('BEGIN');await tx.query('INSERT INTO nexus_tenants(id,tenant_key,name,status) VALUES($1,$2,$2,$3)',[id,'admission-'+key,status]);
    if(governed){await tx.query('INSERT INTO nexus_tenant_membership_governance(tenant_id) VALUES($1)',[id]);
      await tx.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by) VALUES($1,$2,'owner','active',$2,$2)`,[id,f.user.id]);
      if(member)await tx.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by) VALUES($1,$2,'member','active',$3,$3)`,[id,person.id,f.user.id]);}
    if(entitled)await tx.query('INSERT INTO nexus_entitlements(tenant_id,application_id,enabled,updated_by) VALUES($1,$2,true,$3)',[id,app,f.user.id]);
    await tx.query('COMMIT');return id;
   }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 };
 let first,second,receipt,receiptFlow;
 await t.test('Admission: zero/one/multiple tenant choices and explicit selection',async()=>{
   let flow=await start();assert.deepEqual((await choices(flow)).tenants,[]);
   assert.equal((await confirm(flow,randomUUID())).status,403);
   assert.equal((await pool.query('SELECT count(*)::int n FROM identity_admissions')).rows[0].n,0);
   first=await tenant('first');flow=await start();assert.deepEqual((await choices(flow)).tenants.map(x=>x.tenantId),[first]);
   assert.equal((await pool.query('SELECT code_digest FROM identity_admission_transactions WHERE id=$1',[flow.id])).rows[0].code_digest,null);
   second=await tenant('second');flow=await start();assert.equal((await choices(flow)).tenants.length,2);
   const html=await browser('choices','/api/is/v1/admission/transactions/'+flow.id,{headers:{accept:'text/html',cookie:login.headers.get('cookie')+'; __Host-is_admission_csrf='+flow.csrf}},flow.id);
   assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
   assert.ok((await html.text()).includes('Confirm tenant'));
 });
 await t.test('Admission: strict origin/CSRF, forged actor/application/tenant and redirect rejection',async()=>{
   const flow=await start();
   assert.equal((await confirm(flow,randomUUID())).status,403);
   assert.equal((await confirm(flow,first,{actor:'forged'})).status,400);
   const response=await browser('selection','/api/is/v1/admission/transactions/'+flow.id+'/selection',{method:'POST',body:{tenantId:first,expectedVersion:'1'}},flow.id);
   assert.equal(response.status,403);
   const foreign=await browser('selection','/api/is/v1/admission/transactions/'+flow.id+'/selection',{method:'POST',headers:{origin:'https://evil.example'},body:{tenantId:first,expectedVersion:'1'}},flow.id);
   assert.equal(foreign.status,403);
   const other=await ctx.test.login({userId:f.user.id});
   assert.equal((await browser('choices','/api/is/v1/admission/transactions/'+flow.id,{session:other.headers},flow.id)).status,404);
   assert.equal((await browser('choices','/api/is/v1/admission/transactions/'+flow.id,{session:new Headers()},flow.id)).status,401);
   const params={client_id:client.client_id,redirect_uri:'https://evil.example/callback',state:opaque(),nonce:opaque(),code_challenge:await generateCodeChallenge('a'.repeat(64)),code_challenge_method:'S256'};
   assert.equal((await browser('authorize','/api/is/v1/admission/authorize?'+new URLSearchParams(params))).status,400);
   params.application_id=randomUUID();assert.equal((await browser('authorize','/api/is/v1/admission/authorize?'+new URLSearchParams(params))).status,400);
 });
 await t.test('Admission: inactive, suspended, uninitialized and disabled entitlement denied',async()=>{
   const inactive=await tenant('inactive');await pool.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[inactive,person.id]);
   for(const id of [inactive,await tenant('suspended',{status:'suspended'}),await tenant('uninitialized',{governed:false}),await tenant('no-ent',{entitled:false}),await tenant('not-member',{member:false})]){
     const flow=await start();assert.equal((await confirm(flow,id)).status,403);
   }
   const flow=await start();await pool.query("UPDATE nexus_applications SET status='disabled' WHERE id=$1",[app]);
   try{assert.ok((await confirm(flow,first)).status>=400);}finally{await pool.query("UPDATE nexus_applications SET status='active' WHERE id=$1",[app]);}
 });
 await t.test('Admission: native client assertion, DPoP nonce, PKCE, one-use code and exact signed claims',async()=>{
   receiptFlow=await start();const value=await code(receiptFlow,first);
   const nonceCount=(await pool.query('SELECT count(*)::int n FROM identity_dpop_nonces WHERE audience=$1',[endpoint])).rows[0].n;
   const unauthenticated=await exchange(receiptFlow,value,{signedAssertion:'not-a-client-assertion'});
   assert.equal(unauthenticated.status,401);assert.equal(unauthenticated.body.error,'invalid_client');assert.equal(unauthenticated.headers.get('dpop-nonce'),null);
   assert.equal((await pool.query('SELECT count(*)::int n FROM identity_dpop_nonces WHERE audience=$1',[endpoint])).rows[0].n,nonceCount);
   const challenged=await exchange(receiptFlow,value);assert.equal(challenged.status,401);assert.equal(challenged.body.error,'use_dpop_nonce');nonce=challenged.headers.get('dpop-nonce');
   assert.equal((await exchange(receiptFlow,value,{override:{code_verifier:'z'.repeat(64)}})).status,400);
   assert.equal((await exchange(receiptFlow,value,{signedAssertion:await assertion(policy.issuer+'/oauth2/token')})).status,401);
   assert.equal((await exchange(receiptFlow,value,{requestHeaders:{cookie:'forged'}})).status,401);
   const result=await exchangeWithNonce(receiptFlow,value);assert.equal(result.status,200,JSON.stringify(result.body));receipt=result.body.admission_context;
   const claims=decodeJwt(receipt);assert.equal(decodeProtectedHeader(receipt).typ,'is-admission+jwt');assert.equal(claims.sub,resourceSubject);
   assert.equal(claims.tenant_id,first);assert.equal(claims.application_id,app);assert.equal(claims.aud,client.client_id);assert.equal(claims.cnf.jkt,jkt);
   assert.ok(claims.exp<=decodeJwt(access).exp);assert.ok(claims.exp-claims.iat<=300);
   assert.equal((await service.validate(receipt,expect(receiptFlow))).active,true);
   const initialExpectation={...expect(receiptFlow)};delete initialExpectation.tenantId;
   assert.equal((await verifyAdmissionContext(receipt,options.jwks,initialExpectation)).tenant_id,first);
   assert.ok((await exchange(receiptFlow,value)).status>=400);
   assert.equal((await pool.query('SELECT count(*)::int n FROM identity_admissions WHERE transaction_id=$1',[receiptFlow.id])).rows[0].n,1);
 });
 await t.test('Admission: wrong issuer/actor/audience/application/key and expired receipts rejected',async()=>{
   for(const overrides of [{issuer:'https://wrong.example/api/auth'},{subject:'wrong-human'},{clientId:'wrong-audience'},{applicationId:randomUUID()},{tenantId:second},{keyThumbprint:opaque()}]) {
     await assert.rejects(service.validate(receipt,{...expect(receiptFlow),...overrides}),error('invalid_admission'));
   }
   const now=Math.floor(Date.now()/1000),claims=decodeJwt(receipt);
   const expired=await options.sign({...claims,iat:now-400,exp:now-1,auth_time:Math.min(claims.auth_time,now-500)},decodeProtectedHeader(receipt).kid);
   await assert.rejects(verifyAdmissionContext(expired,options.jwks,expect(receiptFlow)));
   const forged=await options.sign({...claims,sub:'forged-human'},decodeProtectedHeader(receipt).kid);
   await assert.rejects(service.validate(forged,expect(receiptFlow)),error('invalid_admission'));
   await assert.rejects(service.validate(receipt+'x',expect(receiptFlow)),error('invalid_admission'));
 });
 await t.test('Admission: concurrent redemption and sender/assertion replay never issue twice',async()=>{
   const flow=await start(),value=await code(flow,first);
   const results=await Promise.all([exchange(flow,value),exchange(flow,value)]);
   assert.equal(results.filter(x=>x.status===200).length,1,JSON.stringify(results.map(x=>({status:x.status,error:x.body.error}))));
   assert.equal((await pool.query('SELECT count(*)::int n FROM identity_admissions WHERE transaction_id=$1',[flow.id])).rows[0].n,1);
   const a=await start(),b=await start(),ac=await code(a,first),bc=await code(b,first),signedAssertion=await assertion();
   assert.equal((await exchange(a,ac,{signedAssertion})).status,200);
   assert.equal((await exchange(b,bc,{signedAssertion})).status,401);
   const signedProof=await proof(undefined,endpoint,'POST',{nonce});
   const bad=await exchange(b,bc,{signedProof,override:{code_verifier:'z'.repeat(64)}});assert.equal(bad.status,400);
   assert.equal((await exchange(b,bc,{signedProof})).status,401);
 });
 await t.test('Admission: membership/entitlement changes between selection and redemption deny',async()=>{
   for(const kind of ['membership','entitlement']){
     const flow=await start(),value=await code(flow,first);
     if(kind==='membership')await pool.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]);
     else await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[first,app]);
     try{assert.equal((await exchange(flow,value)).status,403);await assert.rejects(service.validate(receipt,expect(receiptFlow)));}
     finally{
       if(kind==='membership')await pool.query("UPDATE nexus_tenant_memberships SET status='active' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]);
       else await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[first,app]);
     }
   }
 });
 await t.test('Admission: concurrent issuance stays snapshot-consistent and restored policy cannot revive old code/receipt',async()=>{
   for(const kind of ['membership','entitlement']){
     const flow=await start(),value=await code(flow,first);
     let signal,resume;const captured=new Promise(r=>signal=r),release=new Promise(r=>resume=r);
     const paused={...nexus,within:(cap,work)=>nexus.within(cap,async snapshot=>{signal();await release;return work(snapshot);})};
     const local=createAdmissionHandler({...httpOptions,service:createAdmissionService({...options,nexus:paused})},'redemptions');
     const request=new Request(endpoint,{method:'POST',headers:{host:new URL(origin).host,'content-type':'application/x-www-form-urlencoded',dpop:await proof(undefined,endpoint,'POST',{nonce})},
       body:new URLSearchParams({client_id:client.client_id,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:await assertion(),code:value,code_verifier:flow.verifier,redirect_uri:callback})});
     const pending=local(request);await captured;
     const writer=await pool.connect();try{
       if(kind==='membership')await writer.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]);
       else await writer.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[first,app]);
     }finally{writer.release();resume();}
     const response=await pending;assert.equal(response.status,200,await response.clone().text());const issued=(await response.json()).admission_context;
     await assert.rejects(service.validate(issued,expect(flow)));
     const decision=await f.call('/access-decisions',{method:'POST',access,body:{tenantId:first,applicationId:app,operation}});
     assert.equal(decision.status,200);assert.equal(decision.body.allowed,false);
     if(kind==='membership')await pool.query("UPDATE nexus_tenant_memberships SET status='active' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]);
     else await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[first,app]);
     await assert.rejects(service.validate(issued,expect(flow)),error('invalid_admission'));
     const stale=await start(),staleCode=await code(stale,first);
     await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[first,app]);
     await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[first,app]);
     assert.equal((await exchange(stale,staleCode)).status,403);
   }
 });
 await t.test('Admission: audit/signing/database failures roll back code consumption and receipt persistence',async()=>{
   const flow=await start(),value=await code(flow,first);
   await pool.query(`CREATE FUNCTION fail_admission_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
     CREATE TRIGGER fail_admission_audit BEFORE INSERT ON identity_admission_audit FOR EACH ROW WHEN (NEW.action='issue') EXECUTE FUNCTION fail_admission_audit()`);
   try{assert.equal((await exchange(flow,value)).status,503);}
   finally{await pool.query('DROP TRIGGER fail_admission_audit ON identity_admission_audit;DROP FUNCTION fail_admission_audit()');}
   assert.equal((await pool.query('SELECT consumed_at FROM identity_admission_transactions WHERE id=$1',[flow.id])).rows[0].consumed_at,null);
   assert.equal((await pool.query('SELECT count(*)::int n FROM identity_admissions WHERE transaction_id=$1',[flow.id])).rows[0].n,0);
   const failing=createAdmissionService({...options,sign:async()=>{throw Error('synthetic signing unavailable');}});
   const h=createAdmissionHandler({...httpOptions,service:failing},'redemptions');
   const request=new Request(endpoint,{method:'POST',headers:{host:new URL(origin).host,'content-type':'application/x-www-form-urlencoded',dpop:await proof(undefined,endpoint,'POST',{nonce})},body:new URLSearchParams({client_id:client.client_id,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:await assertion(),code:value,code_verifier:flow.verifier,redirect_uri:callback})});
   assert.equal((await h(request)).status,503);
   await pool.query('ALTER TABLE nexus_consumer_revision RENAME TO admission_policy_outage');
   try{await assert.rejects(service.choices(login.headers,flow.id));}finally{await pool.query('ALTER TABLE admission_policy_outage RENAME TO nexus_consumer_revision');}
   assert.equal((await exchange(flow,value)).status,200);
 });
 await t.test('Admission: live global admission, identity, session and client changes deny redemption',async()=>{
   const flow=await start(),value=await code(flow,first);
   const expiry=(await pool.query('SELECT "expiresAt" FROM "session" WHERE id=$1',[login.session.id])).rows[0].expiresAt;
   for(const [deny,restore,parameters] of [
     ['DELETE FROM is_admission_emails WHERE email=$1','INSERT INTO is_admission_emails(email) VALUES($1)',[person.email]],
     ['UPDATE "user" SET "emailVerified"=false WHERE id=$1','UPDATE "user" SET "emailVerified"=true WHERE id=$1',[person.id]],
     [`UPDATE "session" SET "expiresAt"=clock_timestamp()-interval '1 second' WHERE id=$1`,'UPDATE "session" SET "expiresAt"=$2 WHERE id=$1',[login.session.id,expiry]],
     ['UPDATE "oauthClient" SET disabled=true WHERE "clientId"=$1','UPDATE "oauthClient" SET disabled=false WHERE "clientId"=$1',[client.client_id]],
     [`UPDATE nexus_applications SET status='disabled' WHERE id=$1`,`UPDATE nexus_applications SET status='active' WHERE id=$1`,[app]],
   ]){
     // Separate committed SQL writes simulate policy changes after selection.
     await pool.query(deny,[parameters[0]]);
     try{
       const result=await exchange(flow,value);assert.ok(result.status>=400);
       assert.equal((await pool.query('SELECT consumed_at FROM identity_admission_transactions WHERE id=$1',[flow.id])).rows[0].consumed_at,null);
       assert.equal((await pool.query('SELECT count(*)::int n FROM identity_admissions WHERE transaction_id=$1',[flow.id])).rows[0].n,0);
     }finally{await pool.query(restore,parameters);}
   }
   // The restored app's policy epoch changed; the old selected code stays denied.
   const result=await exchange(flow,value);assert.equal(result.status,403);
 });
 await t.test('Admission: durable revocation also invalidates associated legacy resource token',async()=>{
   assert.equal((await f.call('/me/tenants',{access})).status,200);
   const id=decodeJwt(receipt).admission_id;
   assert.deepEqual(await service.revoke(login.headers,id),{revoked:true});
   await assert.rejects(service.validate(receipt,expect(receiptFlow)),error('invalid_admission'));
   assert.equal((await f.call('/me/tenants',{access})).status,401);
   await assert.rejects(pool.query('UPDATE identity_admissions SET revoked_at=NULL WHERE id=$1',[id]));
   await assert.rejects(pool.query('DELETE FROM identity_admissions WHERE id=$1',[id]));
   await assert.rejects(pool.query('TRUNCATE identity_admissions CASCADE'));
   await grant();const fresh=await start(),value=await code(fresh,first);assert.equal((await exchange(fresh,value)).status,200);
   await assert.rejects(service.validate(receipt,expect(receiptFlow)),error('invalid_admission'));
 });
 await t.test('Admission: expired code is rejected from real durable state',async()=>{
   const flow=await start();await code(flow,first);const expired=opaque(),expiredId=randomUUID();
   await pool.query(`INSERT INTO identity_admission_transactions(id,issuer,client_id,application_id,environment,binding,token_id,redirect_uri,state,nonce,challenge,csrf_digest,created_at,expires_at,version,tenant_id,code_digest,code_expires_at,policy_versions)
     SELECT $2,issuer,client_id,application_id,environment,binding,token_id,redirect_uri,state,nonce,challenge,csrf_digest,
       clock_timestamp()-interval '2 minutes',clock_timestamp()+interval '1 minute',version,tenant_id,$3,clock_timestamp()-interval '1 second',policy_versions
     FROM identity_admission_transactions WHERE id=$1`,[flow.id,expiredId,createHash('sha256').update(expired).digest('hex')]);
   const result=await exchange(flow,expired);assert.equal(result.status,400);assert.equal(result.body.error,'invalid_grant');
 });
 await t.test('Admission: persisted pagination works across service instances and rejects foreign or stale cursors',async()=>{
   for(let i=0;i<101;i++)await tenant('page-'+i);
   const flow=await start(),page=await choices(flow);assert.equal(page.tenants.length,100);assert.ok(page.cursor);
   const identity2=createEligibilityIdentity(identityOptions);
   const secondService=createAdmissionService({...options,identity:identity2,nexus:createEligibilityService(identity2)});
   const next=await secondService.choices(login.headers,flow.id,page.cursor);
   assert.ok(next.tenants.length>0);assert.equal(next.cursor,null);
   assert.equal(new Set([...page.tenants,...next.tenants].map(t=>t.tenantId)).size,page.tenants.length+next.tenants.length);
   const another=await start();await assert.rejects(secondService.choices(login.headers,another.id,page.cursor),error('invalid_request'));
   await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[second,app]);
   try{await assert.rejects(secondService.choices(login.headers,flow.id,page.cursor),error('invalid_request'));}
   finally{await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[second,app]);}
 });
 await t.test('Admission: active transaction quota and rate denial are bounded',async()=>{
   const query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,state:opaque(),nonce:opaque(),code_challenge:await generateCodeChallenge('b'.repeat(64)),code_challenge_method:'S256'});
   let denied=false;
   for(let i=0;i<40;i++){
     const response=await browser('authorize','/api/is/v1/admission/authorize?'+query);
     if(response.status===429){denied=true;break;}assert.equal(response.status,302,await response.clone().text());
   }
   assert.equal(denied,true);
   const active=(await pool.query(`SELECT count(*)::int n FROM identity_admission_transactions WHERE binding->>'userId'=$1 AND expires_at>clock_timestamp() AND consumed_at IS NULL`,[person.id])).rows[0].n;
   assert.ok(active<=32);
 });
 await t.test('Admission: all four Consumer APIs remain compatible on the expanded schema',async()=>{
   for(const path of ['/me/tenants?limit=100',`/tenants/${first}/membership`,`/tenants/${first}/applications/${app}/entitlements`]){
     const result=await f.call(path,{access});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
   }
   const result=await f.call('/access-decisions',{method:'POST',access,body:{tenantId:first,applicationId:app,operation}});
   assert.equal(result.status,200);assert.equal(result.body.allowed,true);
   assert.equal(result.body.actor.subject,resourceSubject);assert.ok(Date.parse(result.body.validUntil)-Date.parse(result.body.evaluatedAt)<=5000);
 });
 await t.test('Admission: existing OIDC client still completes Code+PKCE and signed ID-token login',async()=>{
   const legacy=f.legacyClient;assert.ok(legacy?.client_id);assert.ok(legacy.client_secret);
   const verifier='l'.repeat(64),state=opaque(),oidcNonce=opaque(),session=await ctx.test.login({userId:f.user.id});
   const params=new URLSearchParams({client_id:legacy.client_id,redirect_uri:callback,response_type:'code',scope:'openid profile email',state,nonce:oidcNonce,
     code_challenge:await generateCodeChallenge(verifier),code_challenge_method:'S256'});
   const authorization=await auth.handler(new Request(policy.issuer+'/oauth2/authorize?'+params,{headers:session.headers}));
   const location=authorization.headers.get('location')??(await authorization.json()).url;const redirect=new URL(location);
   assert.equal(redirect.searchParams.get('state'),state);assert.ok(redirect.searchParams.get('code'));
   const response=await auth.handler(new Request(policy.issuer+'/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({grant_type:'authorization_code',client_id:legacy.client_id,client_secret:legacy.client_secret,code:redirect.searchParams.get('code'),code_verifier:verifier,redirect_uri:callback})}));
   const body=await response.json();assert.equal(response.status,200);assert.ok(body.id_token);
   const verified=await jwtVerify(body.id_token,options.jwks,{issuer:policy.issuer,audience:legacy.client_id,algorithms:['EdDSA']});
   assert.equal(verified.payload.nonce,oidcNonce);assert.equal(typeof verified.payload.sub,'string');assert.equal(verified.payload.tenant_id,undefined);
 });
 await t.test('Admission: disabled gate and unchanged OAuth clients/signing keys',async()=>{
   enabled=false;try{assert.equal((await browser('authorize','/api/is/v1/admission/authorize')).status,404);}finally{enabled=true;}
   assert.deepEqual((await pool.query('SELECT * FROM "oauthClient" ORDER BY "clientId"')).rows,clientsBefore);
   assert.deepEqual((await pool.query('SELECT id,"publicKey" FROM jwks ORDER BY id')).rows,keysBefore);
 });
 if(process.env.IS_DOMAIN_TESTS==='1')await (await import('./domain-admission.mjs')).runDomainAdmissionTests(t,f);

}
