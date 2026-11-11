import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {betterAuth} from 'better-auth';
import {jwt,testUtils} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {generateKeyPair,exportJWK,decodeJwt} from 'jose';
import {generateCodeChallenge,signPrivateKeyJwtClientAssertion} from 'better-auth/oauth2';
import {createCredentialAdministration,parseAdminInput,inResourceAdministration,nexusScopes,authorizeCredentialAdministration} from '../../src/lib/identity/administration.ts';
import {createConsumerIdentityIntegration} from '../../src/lib/identity/consumer-integration.ts';
export async function runAdministrationTests(t,f){
 const {pool,user,policy,jkt,proof}=f;const origin=new URL(policy.issuer).origin,issuer=policy.issuer,callback='https://5480-deb13.lan.com:5182/api/auth/callback';
 await pool.query('INSERT INTO nexus_operators(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
 let principal,login;
 let auth;const integration=createConsumerIdentityIntegration(pool,{enabled:true,policy,authorize:authorizeCredentialAdministration,jwksFetch:()=>auth.api.getJwks(),reservations:async()=>(await auth.$context).internalAdapter});
 const privileges=async({user:u})=>u?.id===user.id;
 auth=betterAuth({baseURL:origin,secret:'synthetic-lifecycle-secret-000000000000000000',database:pool,emailAndPassword:{enabled:false},logger:{disabled:true},rateLimit:{enabled:false},hooks:{before:integration.before,after:integration.after},plugins:[jwt({disableSettingJwtHeader:true}),testUtils(),oauthProvider({loginPage:'/sign-in',consentPage:'/consent',clientPrivileges:privileges,resourcePrivileges:async c=>!!c.user?.id&&inResourceAdministration(c.user.id,c.action,c.resourceId)&&await privileges(c),assertionMaxLifetime:60,allowClientKeyRotation:true,scopes:['openid','profile','email',...nexusScopes],enforcePerClientResources:true,storeTokens:'hashed',extensions:[integration.extension],dpop:{signingAlgorithms:['ES256'],proofMaxAgeSeconds:60}})]});
 login=await (await auth.$context).test.login({userId:user.id});
 principal={userId:user.id,sessionId:(await auth.api.getSession({headers:login.headers})).session.id};
 const provider={rotateKeys:(assertion,jwks)=>auth.api.rotateClientKeys({headers:login.headers,body:{client_assertion:assertion,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',jwks}}),createResource:body=>auth.api.adminCreateOAuthResource({headers:login.headers,body}),getResource:async()=>((await auth.api.adminListOAuthResources({headers:login.headers})).find(r=>r.identifier===policy.audience)??null),createClient:body=>auth.api.adminCreateOAuthClient({headers:login.headers,body}),updateClient:(id,update)=>auth.api.adminUpdateOAuthClient({headers:login.headers,body:{client_id:id,update}}),getClient:id=>auth.api.getOAuthClient({headers:login.headers,query:{client_id:id}})};
 const admin=createCredentialAdministration(pool,policy,provider),input=(action,extra={})=>({action,requestId:randomUUID(),reason:'isolated administration acceptance',environment:'development',...extra});
 const keys=await generateKeyPair('ES256',{extractable:true}),pub={...await exportJWK(keys.publicKey),kid:randomUUID(),alg:'ES256',use:'sig'},priv=await exportJWK(keys.privateKey);
 await t.test('administration rejects ordinary sessions, resource bypass, malformed/private keys and wrong environment',async()=>{
  await assert.rejects(admin.execute(input('resource'),{...principal,sessionId:'absent'}));
  const ordinary=await (await auth.$context).test.saveUser((await auth.$context).test.createUser({email:'ordinary-admin-fixture@example.test',emailVerified:true}));
  const ordinaryLogin=await (await auth.$context).test.login({userId:ordinary.id});
  const ordinarySession=await auth.api.getSession({headers:ordinaryLogin.headers});
  await assert.rejects(admin.execute(input('resource'),{userId:ordinary.id,sessionId:ordinarySession.session.id}),e=>e.code==='forbidden');
  await assert.rejects(auth.api.adminCreateOAuthResource({headers:login.headers,body:{identifier:policy.audience+'/forbidden'}}));
  await assert.rejects(parseAdminInput(input('provision',{applicationId:randomUUID(),jwks:{keys:[priv]},operations:[]})));
  await assert.rejects(parseAdminInput({...input('resource'),environment:'production'}));
  await assert.rejects(parseAdminInput({...input('resource'),actor:user.id}));
 });
 await t.test('initial journal failure prevents all provider mutations',async()=>{
  let called=false;
  const guarded=createCredentialAdministration(pool,policy,{...provider,getResource:async()=>{called=true;return null;}});
  await pool.query(`CREATE FUNCTION fail_initial_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
  CREATE TRIGGER fail_initial_admin_audit BEFORE INSERT ON identity_credential_administration FOR EACH ROW EXECUTE FUNCTION fail_initial_admin_audit()`);
  try{await assert.rejects(guarded.execute(input('resource'),principal));assert.equal(called,false);}
  finally{await pool.query('DROP TRIGGER fail_initial_admin_audit ON identity_credential_administration;DROP FUNCTION fail_initial_admin_audit()');}
 });
 await t.test('explicit resource action creates exact provider policy and rejects duplicates',async()=>{
  const resourcePolicy={...policy,audience:policy.audience+'/administration-fixture'};
  const resourceProvider={...provider,getResource:async()=>((await auth.api.adminListOAuthResources({headers:login.headers})).find(r=>r.identifier===resourcePolicy.audience)??null)};
  const resourceAdmin=createCredentialAdministration(pool,resourcePolicy,resourceProvider);
  const request=input('resource');await resourceAdmin.execute(request,principal);
  assert.equal((await resourceAdmin.execute(request,principal)).action,'resource');
  await assert.rejects(resourceAdmin.execute(input('resource'),principal),e=>e.code==='resource_already_exists');
  const record=await (await auth.$context).adapter.findOne({model:'oauthResource',where:[{field:'identifier',value:resourcePolicy.audience}]});
  assert.deepEqual([...record.allowedScopes].sort(),[...nexusScopes].sort());assert.equal(record.accessTokenTtl,300);assert.equal(record.signingAlgorithm,'EdDSA');assert.equal(record.dpopBoundAccessTokensRequired,true);
 });
 // Resource already exists from lifecycle fixture; update through supported API in authorized context is exercised by provision read-back.
 const ctx=await auth.$context;
 await ctx.adapter.update({model:'oauthResource',where:[{field:'identifier',value:policy.audience}],update:{allowedScopes:nexusScopes,accessTokenTtl:300,signingAlgorithm:'EdDSA',dpopBoundAccessTokensRequired:true}});
 const app=randomUUID();await pool.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'sandcastle','Sandcastle') ON CONFLICT(app_key) DO UPDATE SET name=EXCLUDED.name",[app]);
 const appId=(await pool.query("SELECT id FROM nexus_applications WHERE app_key='sandcastle'")).rows[0].id;
 // Earlier consumer tests may use the same app; this suite runs before them.
 const provision=input('provision',{applicationId:appId,jwks:{keys:[pub]},operations:['sandcastle:tenant.use']});let client;
 await t.test('provisioning stages disabled with exact scopes, public keys, app binding and durable idempotency',async()=>{
  const out=await admin.execute(await parseAdminInput(provision),principal);client=out.clientId;assert(client);
  assert.deepEqual(await admin.execute(provision,principal),out);
  const row=(await pool.query('SELECT disabled,"tokenEndpointAuthMethod","skipConsent","clientSecret" FROM "oauthClient" WHERE "clientId"=$1',[client])).rows[0];assert.equal(row.disabled,true);assert.equal(row.tokenEndpointAuthMethod,'private_key_jwt');assert.equal(row.skipConsent,false);assert.equal(row.clientSecret,null);
  await assert.rejects(admin.execute(input('provision',{applicationId:appId,jwks:{keys:[pub]},operations:[]}),principal));
  assert.equal((await pool.query('SELECT count(*)::int n FROM nexus_application_oauth_clients WHERE application_id=$1',[appId])).rows[0].n,1);
 });
 await admin.execute(input('enable',{clientId:client}),principal);
 const query=async()=>new URLSearchParams({client_id:client,redirect_uri:callback,response_type:'code',scope:nexusScopes.join(' '),resource:policy.audience,state:randomUUID(),code_challenge:await generateCodeChallenge('a'.repeat(64)),code_challenge_method:'S256',dpop_jkt:jkt});
 const start=async(forceConsent=false)=>{const q=await query();if(forceConsent)q.set('prompt','consent');const res=await auth.handler(new Request(issuer+'/oauth2/authorize?'+q,{headers:login.headers}));const text=await res.text();const b=text?JSON.parse(text):{};assert(res.status<400);return new URL(b.url??res.headers.get('location'),origin);};
 const consent=async(url,accept)=>{const res=await auth.handler(new Request(issuer+'/oauth2/consent',{method:'POST',headers:{...Object.fromEntries(login.headers),'content-type':'application/json',origin},body:JSON.stringify({accept,oauth_query:url.search.slice(1)})}));return {status:res.status,body:await res.json()};};
 const redeem=async(code,expiresIn=60,key=priv,kid=pub.kid)=>{const assertion=await signPrivateKeyJwtClientAssertion({clientId:client,tokenEndpoint:issuer+'/oauth2/token',privateKeyJwk:key,kid,algorithm:'ES256',expiresIn});const res=await auth.handler(new Request(issuer+'/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',DPoP:await proof(undefined,issuer+'/oauth2/token','POST')},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:callback,code,code_verifier:'a'.repeat(64),resource:policy.audience,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:assertion})}));return {status:res.status,body:await res.json()};};
 let token;
 await t.test('explicit signed Nexus consent rejects and completes with single audience and verified mapping',async()=>{
  const denied=await consent(await start(),false);assert.equal(denied.status,200);assert(new URL(denied.body.url).searchParams.get('error'));
  const url=await start();assert.equal(url.pathname,'/consent');assert.equal((await pool.query('SELECT count(*)::int n FROM identity_consumer_codes WHERE client_id=$1',[client])).rows[0].n,2,'pending consent barriers');const done=await consent(url,true);assert.equal(done.status,200,JSON.stringify(done.body));const code=new URL(done.body.url).searchParams.get('code');assert(code);
  const result=await redeem(code);assert.equal(result.status,200,JSON.stringify(result.body));token=result.body.access_token;const c=decodeJwt(token);assert.equal(c.aud,policy.audience);assert.equal(c.sub,user.id);assert.equal(result.body.id_token,undefined);assert.equal((await pool.query('SELECT user_id FROM identity_subject_mappings WHERE issuer=$1 AND client_id=$2 AND subject=$3',[issuer,client,c.sub])).rows[0].user_id,user.id);
 });
 await t.test('disable/re-enable never revives JWTs or outstanding authorization codes; invalid assertions deny',async()=>{
  // Existing consent means a fresh authorize returns a code directly.
  const code=new URL((await start()).href).searchParams.get('code');assert(code);
  assert.notEqual((await redeem(code,61)).status,200);
  const other=await generateKeyPair('ES256',{extractable:true});assert.notEqual((await redeem(code,60,await exportJWK(other.privateKey))).status,200);
  await admin.execute(input('disable',{clientId:client}),principal);await admin.execute(input('enable',{clientId:client}),principal);
  assert.notEqual((await redeem(code)).status,200);
  const c=decodeJwt(token);assert.equal(await integration.registry.readCurrentState({issuer,audience:policy.audience,environment:policy.environment,subject:c.sub,tokenId:c.jti,sessionId:c.sid,clientId:client},(await import('../../src/lib/identity/credential-registry.ts')).digest(token)),null);
 });
 await t.test('revocation while consent is pending cannot resume into a usable credential',async()=>{
  const pending=await start(true);assert.equal(pending.pathname,'/consent');
  await admin.execute(input('disable',{clientId:client}),principal);
  await admin.execute(input('enable',{clientId:client}),principal);
  const res=await auth.handler(new Request(issuer+'/oauth2/consent',{method:'POST',headers:{...Object.fromEntries(login.headers),'content-type':'application/json',origin},body:JSON.stringify({accept:true,oauth_query:pending.search.slice(1)})}));
  const text=await res.text();const result=text?JSON.parse(text):{};
  const code=result.url?new URL(result.url,origin).searchParams.get('code'):null;
  if(code)assert.notEqual((await redeem(code)).status,200);else assert(res.status>=400||result.url);
 });
 await t.test('concurrent administration serializes and final audit failure leaves deny committed',async()=>{
  const request=input('disable',{clientId:client});
  const raced=await Promise.allSettled([admin.execute(request,principal),admin.execute(request,principal)]);
  assert(raced.some(r=>r.status==='fulfilled'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM identity_credential_administration WHERE request_id=$1',[request.requestId])).rows[0].n,1);
  await admin.execute(request,principal);
  await pool.query(`CREATE FUNCTION fail_administration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='complete' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER fail_administration_audit BEFORE UPDATE ON identity_credential_administration FOR EACH ROW EXECUTE FUNCTION fail_administration_audit()`);
  try{
   await assert.rejects(admin.execute(input('enable',{clientId:client}),principal));
   assert.equal((await pool.query("SELECT enabled FROM identity_credential_epochs WHERE issuer=$1 AND kind='client' AND subject_key=$2",[issuer,client])).rows[0].enabled,false);
  }finally{await pool.query('DROP TRIGGER fail_administration_audit ON identity_credential_administration;DROP FUNCTION fail_administration_audit()');}
  await admin.execute(input('enable',{clientId:client}),principal);
 });
 await t.test('key rotation denies old credentials and requires explicit enable; token and session invalidation are audited',async()=>{
  const rotated=await generateKeyPair('ES256',{extractable:true}),k={...await exportJWK(rotated.publicKey),kid:randomUUID(),alg:'ES256',use:'sig'};
  await admin.execute(input('keys',{clientId:client,jwks:{keys:[k]},assertion:await signPrivateKeyJwtClientAssertion({clientId:client,tokenEndpoint:issuer+'/oauth2/client/rotate-keys',privateKeyJwk:priv,kid:pub.kid,algorithm:'ES256',expiresIn:60})}),principal);assert.equal((await provider.getClient(client)).disabled,true);
  await admin.execute(input('enable',{clientId:client}),principal);
  const code=(await start()).searchParams.get('code');assert(code);
  assert.notEqual((await redeem(code)).status,200);
  const fresh=await redeem(code,60,await exportJWK(rotated.privateKey),k.kid);assert.equal(fresh.status,200);
  await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1',[user.id]);
  const freshClaims=decodeJwt(fresh.body.access_token);
  assert.equal(await integration.registry.readCurrentState({issuer,audience:policy.audience,environment:policy.environment,subject:freshClaims.sub,tokenId:freshClaims.jti,sessionId:principal.sessionId,clientId:client},(await import('../../src/lib/identity/credential-registry.ts')).digest(fresh.body.access_token)),null);
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[user.id]);
  await admin.execute(input('revoke_token',{tokenId:decodeJwt(token).jti}),principal);
  await admin.execute(input('invalidate',{kind:'session',key:principal.sessionId}),principal);
  assert((await pool.query("SELECT count(*)::int n FROM identity_credential_administration WHERE state='complete'")).rows[0].n>=6);
 });
 await pool.query("UPDATE nexus_applications SET app_key='administration-fixture' WHERE id=$1",[appId]);
}
