import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {betterAuth} from 'better-auth';
import {signJWT} from 'better-auth/plugins/jwt';
import {jwt,testUtils} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {generateKeyPair,exportJWK,decodeJwt} from 'jose';
import {generateCodeChallenge,signPrivateKeyJwtClientAssertion} from 'better-auth/oauth2';
import {createConsumerIdentityIntegration} from '../../src/lib/identity/consumer-integration.ts';
import {createConsumerService} from '../../src/lib/nexus-consumer/service.ts';
import {createConsumerHandler} from '../../src/lib/nexus-consumer/http.ts';
import {createMembershipHandler} from '../../src/lib/nexus-memberships/http.ts';
import {createMembershipService} from '../../src/lib/nexus-memberships/service.ts';
import {createDpopNonceService} from '../../src/lib/identity/dpop-nonce.ts';
export async function runConsumerRuntimeTests(t,f){
 const {pool,user,login,jkt,proof,policy,actor,authorize}=f;
 const {issuer,audience}=policy,origin=new URL(issuer).origin,callback='https://bff.example.test/callback';
 const publicOrigin=new URL(audience).origin,operation='sandcastle:tenant.use';
 const scopes=['nexus:tenants:read','nexus:membership:self','nexus:entitlements:read','nexus:access:evaluate'];
 let auth;const integration=createConsumerIdentityIntegration(pool,{enabled:true,policy,authorize,
   jwksFetch:()=>auth.api.getJwks(),reservations:async()=>(await auth.$context).internalAdapter});
 auth=betterAuth({baseURL:origin,secret:'synthetic-lifecycle-secret-000000000000000000',database:pool,emailAndPassword:{enabled:false},
  disabledPaths:['/token'],logger:{disabled:true},rateLimit:{enabled:false},hooks:{before:integration.before,after:integration.after},
  plugins:[jwt({disableSettingJwtHeader:true}),testUtils(),oauthProvider({loginPage:'/sign-in',consentPage:'/consent',
   clientPrivileges:async()=>true,allowDynamicClientRegistration:false,allowUnauthenticatedClientRegistration:false,
   scopes:['openid','profile','email',...scopes],enforcePerClientResources:true,storeTokens:'hashed',accessTokenExpiresIn:300,
   extensions:[integration.extension],dpop:{signingAlgorithms:['ES256'],proofMaxAgeSeconds:60}})]});
 const ctx=await auth.$context;
 await ctx.adapter.update({model:'oauthResource',where:[{field:'identifier',value:audience}],update:{allowedScopes:scopes}});
 const signing=await generateKeyPair('ES256',{extractable:true}),pub={...await exportJWK(signing.publicKey),kid:randomUUID(),alg:'ES256',use:'sig'},priv=await exportJWK(signing.privateKey);
 const client=await auth.api.adminCreateOAuthClient({headers:login.headers,body:{client_name:'Sandcastle fixture',redirect_uris:[callback],
  grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'private_key_jwt',jwks:{keys:[pub]},
  require_pkce:true,skip_consent:true,scope:scopes.join(' '),resources:[audience],dpop_bound_access_tokens:true}});
 const app=randomUUID();await pool.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'sandcastle','Sandcastle')",[app]);
 await pool.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by,purpose)
 VALUES($1,'development',$2,'[]',$3,'nexus_consumer')`,[app,client.client_id,user.id]);
 await integration.registry.configureBinding({clientId:client.client_id,applicationId:app,scopes},actor());
 await pool.query(`INSERT INTO nexus_consumer_operations(issuer,client_id,audience,environment,operation,enabled) VALUES($1,$2,$3,'development',$4,true)`,[issuer,client.client_id,audience,operation]);
 const authorizeCode=async(sessionHeaders=login.headers)=>{
  const q=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:scopes.join(' '),resource:audience,
    state:randomUUID(),code_challenge:await generateCodeChallenge('a'.repeat(64)),code_challenge_method:'S256',dpop_jkt:jkt});
  const res=await auth.handler(new Request(issuer+'/oauth2/authorize?'+q,{headers:sessionHeaders}));
  const text=await res.text();assert.ok(res.status<400, text);
  const location=res.headers.get('location')??JSON.parse(text).url;assert.ok(location);
  return new URL(location).searchParams.get('code');
 };
 const redeem=async code=>{
  const assertion=await signPrivateKeyJwtClientAssertion({clientId:client.client_id,tokenEndpoint:issuer+'/oauth2/token',privateKeyJwk:priv,kid:pub.kid,algorithm:'ES256',expiresIn:60});
  const res=await auth.handler(new Request(issuer+'/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',DPoP:await proof(undefined,issuer+'/oauth2/token','POST')},
   body:new URLSearchParams({client_id:client.client_id,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:assertion,
   grant_type:'authorization_code',code,code_verifier:'a'.repeat(64),redirect_uri:callback,resource:audience})}));
  return {status:res.status,body:await res.json()};
 };
 let token;
 await t.test('Stage 2D: private-key resource issuance crosses generation-bound code barrier',async()=>{
  const result=await redeem(await authorizeCode());assert.equal(result.status,200,JSON.stringify(result.body));token=result.body.access_token;assert.ok(token);
  assert.equal((await pool.query('SELECT 1 FROM identity_consumer_codes WHERE client_id=$1',[client.client_id])).rowCount,1);
 });
 const nonce=createDpopNonceService(integration.registry);let nonceValue=await nonce.issue(jkt);
 const deps={enabled:()=>true,ready:()=>true,publicOrigin,transportOrigin:"https://0.0.0.0:5180",service:createConsumerService(integration.boundary),trustedMutationOrigin:async r=>r.headers.get('origin')==='https://bff.example.test'};
 const handlers=Object.fromEntries(['tenants','membership','entitlements','decision'].map(op=>[op,createConsumerHandler(deps,op)]));
 const dispatch=async(req)=>{
   const path=new URL(req.url).pathname;let match;
   if(path===new URL(audience).pathname+'/me/tenants')return handlers.tenants(req);
   if(path.endsWith('/access-decisions'))return handlers.decision(req);
   if((match=path.match(/\/tenants\/([^/]+)\/membership$/)))return handlers.membership(req,{tenantId:match[1]});
   if((match=path.match(/\/tenants\/([^/]+)\/applications\/([^/]+)\/entitlements$/)))return handlers.entitlements(req,{tenantId:match[1],applicationId:match[2]});
   return new Response(null,{status:404});
 };
 // Actual TCP HTTP transport -> production handler factory -> real provider adapter -> PostgreSQL.
 // Model native Next bind URL; production resolver must validate Host and restore external DPoP URL.
 const server=createServer(async(req,res)=>{try{
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request("https://0.0.0.0:5180"+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
  const response=await dispatch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,{method='GET',body,access=token,extra={},signed}={})=>{
  const url=audience+path;const headers={host:new URL(publicOrigin).host,authorization:`DPoP ${access}`,DPoP:signed??await proof(access,url,method,{nonce:nonceValue}),...extra};
  if(method==='POST'){headers['content-type']='application/json';headers.origin??='https://bff.example.test';}
  // Native HTTP client preserves the explicit external Host; fetch may replace it.
  const res=await new Promise((resolve,reject)=>{
    const req=httpRequest(base+new URL(url).pathname+new URL(url).search,{method,headers},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  return {status:res.status,body:await res.json(),headers:res.headers};
 };
 const decision=(tenant,more={})=>call('/access-decisions',{method:'POST',body:{tenantId:tenant,applicationId:app,operation,...more}});
 const makeTenant=async(key,{governed=true,member=true,entitled=true,status='active'}={})=>{
  const id=randomUUID();await pool.query('INSERT INTO nexus_tenants(id,tenant_key,name,status) VALUES($1,$2,$2,$3)',[id,key,status]);
  if(governed){const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('INSERT INTO nexus_tenant_membership_governance(tenant_id) VALUES($1)',[id]);
   await tx.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by) VALUES($1,$2,'owner','active',$2,$2)`,[id,user.id]);await tx.query('COMMIT');}finally{tx.release();}}
  // member=false means visibility denied through tenant-specific different owner fixture below.
  if(!member)await pool.query("UPDATE nexus_tenants SET status='suspended' WHERE id=$1",[id]);
  if(entitled)await pool.query('INSERT INTO nexus_entitlements(tenant_id,application_id,enabled,updated_by) VALUES($1,$2,true,$3)',[id,app,user.id]);return id;
 };
 await t.test('Stage 2D: a registered JWT without the consumer code binding fails closed',async()=>{
  const id=decodeJwt(token).jti;
  const row=(await pool.query('SELECT * FROM identity_consumer_codes WHERE token_id=$1',[id])).rows[0];
  await pool.query('UPDATE identity_consumer_codes SET token_id=NULL,token_digest=NULL,registered_until=NULL WHERE code_digest=$1',[row.code_digest]);
  try{assert.equal((await call('/me/tenants')).status,401);}
  finally{await pool.query('UPDATE identity_consumer_codes SET token_id=$2,token_digest=$3,registered_until=$4 WHERE code_digest=$1',[row.code_digest,id,row.token_digest,row.registered_until]);}
 });
 await t.test('Stage 2D HTTP: zero, one, multiple eligible tenants and bound pagination',async()=>{
  let r=await call('/me/tenants');assert.equal(r.status,200);assert.equal(r.body.tenants.length,0);
  const first=await makeTenant('alpha');r=await call('/me/tenants');assert.equal(r.body.tenants.length,1);assert.equal(r.body.tenants[0].tenant.id,first);assert.equal(r.body.tenants[0].tenant.key,'alpha');
  await makeTenant('bravo');r=await call('/me/tenants?limit=1');assert.equal(r.body.tenants.length,1);assert.ok(r.body.nextCursor);
  const next=await call('/me/tenants?limit=1&cursor='+r.body.nextCursor);assert.equal(next.status,200);assert.equal(next.body.tenants.length,1);assert.notEqual(next.body.tenants[0].tenant.id,r.body.tenants[0].tenant.id);
  assert.equal((await call('/me/tenants?limit=2&cursor='+r.body.nextCursor)).status,400);
  assert.equal((await call('/me/tenants?userId=arbitrary')).status,400);
 });
 let tenant=await makeTenant('runtime');
 await t.test('Stage 2D HTTP: membership, own-app entitlement and bounded decisions',async()=>{
  assert.equal((await call(`/tenants/${tenant}/membership`)).body.membership.role,'owner');
  assert.equal((await call(`/tenants/${tenant}/applications/${app}/entitlements`)).body.effective,true);
  assert.equal((await call(`/tenants/${tenant}/applications/${randomUUID()}/entitlements`)).status,404);
  const r=await decision(tenant);assert.equal(r.status,200);assert.equal(r.body.allowed,true);
  assert.equal(r.body.actor.subject,user.id);assert.equal(r.body.target.operation,operation);assert.ok(Date.parse(r.body.validUntil)-Date.parse(r.body.evaluatedAt)<=5000);
  assert.equal((await decision(tenant,{operation:'not:approved'})).body.allowed,false);
  assert.equal((await decision(tenant,{applicationId:randomUUID()})).body.allowed,false);
  assert.equal((await decision(tenant,{actor:{userId:'forged'}})).status,400);
  assert.equal((await call('/me/tenants',{extra:{'x-user-id':'forged'}})).status,400);
  assert.equal((await call('/access-decisions',{method:'POST',body:{tenantId:tenant,applicationId:app,operation},extra:{origin:'https://evil.example.test'}})).status,403);
 });
 await t.test('Stage 2D HTTP: another registered human cannot discover or access this user tenant',async()=>{
  const outsider=await ctx.test.saveUser(ctx.test.createUser({email:'outsider-runtime@example.test',emailVerified:true}));
  const session=await ctx.test.login({userId:outsider.id});
  const result=await redeem(await authorizeCode(session.headers));assert.equal(result.status,200);
  const access=result.body.access_token;
  const list=await call('/me/tenants',{access});assert.equal(list.status,200);assert.deepEqual(list.body.tenants,[]);
  assert.equal((await call(`/tenants/${tenant}/membership`,{access})).status,404);
  const denied=await call('/access-decisions',{method:'POST',access,body:{tenantId:tenant,applicationId:app,operation}});
  assert.equal(denied.body.allowed,false);
 });
 await t.test('Stage 2D HTTP: suspended, uninitialized, hidden and disabled contexts deny uniformly',async()=>{
  for(const id of [randomUUID(),await makeTenant('empty',{governed:false}),await makeTenant('suspended',{status:'suspended'}),await makeTenant('noent',{entitled:false})]){
   assert.equal((await decision(id)).body.allowed,false);assert.equal((await call(`/tenants/${id}/membership`)).status,404);
  }
  await pool.query("UPDATE nexus_applications SET status='disabled' WHERE id=$1",[app]);assert.equal((await decision(tenant)).status,401);
  await pool.query("UPDATE nexus_applications SET status='active' WHERE id=$1",[app]);
 });
 await t.test('Stage 2D HTTP: nonce challenge, identical-proof replay, bad hash and token substitution',async()=>{
  const badProof=await proof(token,audience+'/me/tenants','GET',{nonce:'wrong'});
  const challenged=await call('/me/tenants',{signed:badProof});assert.equal(challenged.status,401);assert.ok(challenged.headers.get('dpop-nonce'));nonceValue=challenged.headers.get('dpop-nonce');
  const signed=await proof(token,audience+'/me/tenants','GET',{nonce:nonceValue});
  const race=await Promise.all([call('/me/tenants',{signed}),call('/me/tenants',{signed})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,401]);
  const wrong=await proof(token,audience+'/me/tenants','GET',{nonce:nonceValue,ath:'wrong'});assert.equal((await call('/me/tenants',{signed:wrong})).status,401);
  assert.equal((await call('/me/tenants',{access:'opaque-or-id-token'})).status,401);
  assert.equal((await call('/me/tenants',{extra:{cookie:'is_session=forged'}})).status,401);
 });
 await t.test('Stage 2D HTTP: signed wrong-audience, ID, expired, forged actor and unregistered JWTs reject',async()=>{
  for(const [override,typ] of [[{aud:'https://wrong.example.test'},'at+jwt'],[{aud:client.client_id},'JWT'],[{exp:Math.floor(Date.now()/1000)-1},'at+jwt'],[{sub:'another-user'},'at+jwt'],[{jti:randomUUID()},'at+jwt']]){
    const access=await signJWT({context:ctx},{payload:{...decodeJwt(token),...override},header:{typ}});
    assert.equal((await call('/me/tenants',{access})).status,401);
  }
 });
 await t.test('Stage 2D: stale authorization code and old JWT never revive after generation invalidation',async()=>{
  const code=await authorizeCode();await integration.registry.invalidate('client',client.client_id,actor());await integration.registry.invalidate('client',client.client_id,actor(),true);
  assert.equal((await redeem(code)).status,503);assert.equal((await call('/me/tenants')).status,401);
  const fresh=await redeem(await authorizeCode());assert.equal(fresh.status,200);token=fresh.body.access_token;
  await assert.rejects(auth.api.adminUpdateOAuthClient({headers:login.headers,body:{client_id:client.client_id,update:{disabled:true}}}));
 });
 await t.test('Stage 2D HTTP: committed entitlement changes invalidate cursor and new decisions; audit failure denies',async()=>{
  const page=await call('/me/tenants?limit=1');
  await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[tenant,app]);
  assert.equal((await decision(tenant)).body.allowed,false);assert.equal((await call(`/tenants/${tenant}/membership`)).status,404);
  assert.equal((await call('/me/tenants?limit=1&cursor='+page.body.nextCursor)).status,400);
  await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[tenant,app]);
  const previous=(await pool.query("SELECT version FROM nexus_consumer_epochs WHERE kind='entitlement' AND subject_key=$1",[tenant+':'+app])).rows[0].version;
  await pool.query('DELETE FROM nexus_entitlements WHERE tenant_id=$1 AND application_id=$2',[tenant,app]);
  await pool.query('INSERT INTO nexus_entitlements(tenant_id,application_id,enabled,updated_by) VALUES($1,$2,true,$3)',[tenant,app,user.id]);
  const current=(await pool.query("SELECT version FROM nexus_consumer_epochs WHERE kind='entitlement' AND subject_key=$1",[tenant+':'+app])).rows[0].version;
  assert.ok(BigInt(current)>BigInt(previous));
  await assert.rejects(pool.query('DELETE FROM nexus_consumer_epochs'));
  await assert.rejects(pool.query('UPDATE nexus_consumer_revision SET version=1'));
  await pool.query(`CREATE FUNCTION fail_consumer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
  CREATE TRIGGER fail_consumer_audit BEFORE INSERT ON nexus_consumer_audit FOR EACH ROW EXECUTE FUNCTION fail_consumer_audit()`);
  try{assert.equal((await decision(tenant)).status,503);}finally{await pool.query('DROP TRIGGER fail_consumer_audit ON nexus_consumer_audit;DROP FUNCTION fail_consumer_audit()');}
 });
 await t.test('Stage 2D HTTP: concurrent revocation snapshots and response expiration',async()=>{
  const other=await ctx.test.saveUser(ctx.test.createUser({email:'second-owner@example.test',emailVerified:true}));
  await pool.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by) VALUES($1,$2,'admin','active',$3,$3)`,[tenant,other.id,user.id]);
  for(const kind of ['entitlement','membership']){
    let signal,release;const captured=new Promise(r=>signal=r),resume=new Promise(r=>release=r);
    const boundary={run:(req,scopes,work)=>integration.boundary.run(req,scopes,async(...args)=>{signal();await resume;return work(...args);})};
    const handler=createConsumerHandler({...deps,service:createConsumerService(boundary)},'decision');
    const request=async()=>new Request(audience+'/access-decisions',{method:'POST',headers:{host:new URL(publicOrigin).host,'content-type':'application/json',origin:'https://bff.example.test',authorization:`DPoP ${token}`,DPoP:await proof(token,audience+'/access-decisions','POST',{nonce:nonceValue})},body:JSON.stringify({tenantId:tenant,applicationId:app,operation})});
    const pending=handler(await request());await captured;
    if(kind==='entitlement')await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[tenant,app]);
    else await pool.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[tenant,user.id]);
    release();const earlier=await pending;assert.equal(earlier.status,200);assert.equal((await earlier.json()).allowed,true);
    assert.equal((await decision(tenant)).body.allowed,false);
    if(kind==='entitlement')await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[tenant,app]);
    else await pool.query("UPDATE nexus_tenant_memberships SET status='active' WHERE tenant_id=$1 AND user_id=$2",[tenant,user.id]);
    const expired=createConsumerHandler({...deps,now:()=>Date.now()+6000},'decision');
    assert.equal((await expired(await request())).status,503);
  }
 });
 await t.test('Stage 2D HTTP: PostgreSQL/Identity boundary outage cannot return allow',async()=>{
  const broken={run:async()=>{throw new Error('synthetic Identity unavailable');}};
  const handler=createConsumerHandler({...deps,service:createConsumerService(broken)},'tenants');
  assert.equal((await handler(new Request(audience+'/me/tenants',{headers:{host:new URL(publicOrigin).host}}))).status,503);
  const tx=await pool.connect();try{await tx.query('ALTER TABLE nexus_consumer_revision RENAME TO nexus_consumer_revision_unavailable');
    assert.equal((await decision(tenant)).status,503);
  }finally{await tx.query('ALTER TABLE nexus_consumer_revision_unavailable RENAME TO nexus_consumer_revision');tx.release();}
 });
 await t.test('Stage 2D: consumer credentials cannot authenticate privileged membership handlers',async()=>{
  const management=createMembershipHandler({enabled:()=>true,trustedOrigin:()=>true,
    sessionUser:async headers=>(await auth.api.getSession({headers}))?.user.id??null,
    authorized:async()=>{assert.fail('consumer must not enter privileged role lookup');},service:createMembershipService(pool)},'operator','list');
  const req=new Request(audience+'/management',{headers:{authorization:`DPoP ${token}`,DPoP:await proof(token,audience+'/management','GET',{nonce:nonceValue})}});
  assert.equal((await management(req,{tenantId:tenant})).status,401);
 });
 await t.test('Stage 2D HTTP: revoked credentials and default gate deny',async()=>{
  await integration.registry.revokeToken(decodeJwt(token).jti,actor());assert.equal((await call('/me/tenants')).status,401);
  const off=createConsumerHandler({...deps,enabled:()=>false},'tenants');assert.equal((await off(new Request(audience+'/me/tenants'))).status,404);
  const notReady=createConsumerHandler({...deps,ready:()=>false},'tenants');assert.equal((await notReady(new Request(audience+'/me/tenants'))).status,503);
 });
}
