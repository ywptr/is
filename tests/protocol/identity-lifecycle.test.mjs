// Real pinned provider and disposable PostgreSQL only; never reads DATABASE_URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtemp, mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { jwt, testUtils } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { getMigrations } from 'better-auth/db/migration';
import { createDpopReplayStore, deriveDpopAth, deriveDpopJkt, generateCodeChallenge } from 'better-auth/oauth2';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { createCredentialRegistry, digest } from '../../src/lib/identity/credential-registry.ts';
import { createProviderIssuanceIntegration } from '../../src/lib/identity/provider-issuance.ts';
import { createDpopNonceService, DpopNonceRequired, nonceChallenge } from '../../src/lib/identity/dpop-nonce.ts';
import { createIdentityCredentialAdapter } from '../../src/lib/identity/access-credentials.ts';

const origin='https://lifecycle.example.test',issuer=origin+'/api/auth';
const audience='https://nexus.example.test/api/nexus/v1',callback='https://bff.example.test/callback';
const policy={issuer,audience,environment:'development'},scope='nexus:tenants:read';
const run=promisify(execFile), actor=()=>({actorId:'security-operator',requestId:randomUUID(),reason:'Synthetic lifecycle test'});
const errorCode=code=>error=>error.code===code;
const app='20000000-0000-0000-0000-000000000011';

test('Identity lifecycle: pinned provider, additive migration and shared PostgreSQL', {timeout:120000}, async t=>{
  const bin=process.env.IS_MEMBERSHIP_PG_BIN;
  assert.ok(bin,'Explicit PostgreSQL binaries required; existing databases never used');
  const dir=await mkdtemp(join(tmpdir(),'is-identity-lifecycle-')),socket=join(dir,'socket'),data=join(dir,'data');
  await mkdir(socket);
  const config={host:socket,port:55441,user:'is_lifecycle_test',database:'postgres',max:8,connectionTimeoutMillis:1000};
  const pool=new pg.Pool(config);
  // Expected idle-connection errors during the explicit stop/restart outage test.
  pool.on('error',()=>{});
  let started=false;
  t.after(async()=>{await pool.end();if(started)await run(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});});
  await run(join(bin,'initdb'),['-D',data,'-U',config.user,'--auth=trust','--no-locale']);
  await run(join(bin,'pg_ctl'),['-D',data,'-l',join(dir,'postgres.log'),'-o',`-F -h '' -k ${socket} -p 55441`,'-w','start']);started=true;
  const authorize=async(tx,a)=>a.actorId==='security-operator'; // Explicit isolated authority only.
  const registry=createCredentialRegistry(pool,{enabled:true,policy,authorize});
  let auth, observerCredentials, integration;
  const post=async(path,body,headers={},instance=auth)=>{
    const response=await instance.handler(new Request(issuer+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body)}));
    const text=await response.text();return {status:response.status,body:text?JSON.parse(text):{}};
  };
  const makeAuth=(withIntegration=true)=>betterAuth({baseURL:origin,secret:'synthetic-lifecycle-secret-000000000000000000',database:pool,
    emailAndPassword:{enabled:false},disabledPaths:['/token'],logger:{disabled:true},rateLimit:{enabled:false},
    ...(withIntegration?{hooks:{after:integration.after}}:{}),
    plugins:[jwt({disableSettingJwtHeader:true}),testUtils(),oauthProvider({loginPage:'/sign-in',consentPage:'/consent',
      allowDynamicClientRegistration:false,allowUnauthenticatedClientRegistration:false,clientPrivileges:async()=>true,
      scopes:['openid','profile','email',scope],accessTokenExpiresIn:300,
      pairwiseSecret:'synthetic-pairwise-secret-000000000000000000',
      enforcePerClientResources:true,resources:[],dpop:{signingAlgorithms:['ES256'],proofMaxAgeSeconds:60},
      ...(withIntegration?{extensions:[integration.extension]}:{}),
    })]});
  const schemaAuth=makeAuth(false);await (await getMigrations(schemaAuth.options)).runMigrations();
  const baseCtx=await schemaAuth.$context;
  const user=await baseCtx.test.saveUser(baseCtx.test.createUser({email:'human@example.test',emailVerified:true}));
  const login=await baseCtx.test.login({userId:user.id});
  const legacyClient=await schemaAuth.api.adminCreateOAuthClient({headers:login.headers,body:{
    client_name:'Existing OIDC login fixture',redirect_uris:[callback],grant_types:['authorization_code'],response_types:['code'],
    token_endpoint_auth_method:'client_secret_post',require_pkce:true,skip_consent:true,scope:'openid profile email'}});
  const preserved=async()=>({users:(await pool.query('SELECT id FROM "user" ORDER BY id')).rows,
    sessions:(await pool.query('SELECT id FROM "session" ORDER BY id')).rows,
    clients:(await pool.query('SELECT "clientId" FROM "oauthClient" ORDER BY "clientId"')).rows});
  const migrationNames=(await readdir('db/migrations')).filter(f=>/^\d{4}_/.test(f)).sort();
  for(const file of migrationNames.filter(f=>Number(f.slice(0,4))<8))await pool.query(await readFile(join('db/migrations',file),'utf8'));
  await pool.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'lifecycle','Lifecycle fixture')",[app]);
  const before=await preserved();
  const migration=await readFile('db/migrations/0008_identity_credentials.sql','utf8');
  await t.test('populated additive migration preserves existing provider rows; fresh schema accepts history',async()=>{
    const application=await pool.connect();try {await application.query('BEGIN');await application.query(migration);await application.query('COMMIT');}finally{application.release();}
    assert.deepEqual(await preserved(),before);
    for(const file of migrationNames.filter(f=>Number(f.slice(0,4))>8))await pool.query(await readFile(join('db/migrations',file),'utf8'));
    const tx=await pool.connect();try{
      await tx.query('BEGIN; CREATE SCHEMA fresh; SET LOCAL search_path TO fresh');
      await tx.query('CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean)');
      for(const file of migrationNames)await tx.query(await readFile(join('db/migrations',file),'utf8'));
      assert.equal((await tx.query('SELECT count(*)::int n FROM identity_access_issuances')).rows[0].n,0);
      await tx.query('ROLLBACK');
    }finally{tx.release();}
  });
  // Explicit synthetic resource provisioning only on this disposable cluster.
  const provisioner=betterAuth({...schemaAuth.options,plugins:[jwt({disableSettingJwtHeader:true}),testUtils(),oauthProvider({
    loginPage:'/sign-in',consentPage:'/consent',clientPrivileges:async()=>true,
    scopes:['openid',scope],resources:[{identifier:audience,allowedScopes:[scope,'openid'],dpopBoundAccessTokensRequired:true}],
    pairwiseSecret:'synthetic-pairwise-secret-000000000000000000'})]});
  await provisioner.$context;
  // Resource seeds run at context initialization; read-back is mandatory.
  assert.equal((await pool.query('SELECT identifier FROM "oauthResource" WHERE identifier=$1',[audience])).rowCount,1);
  const createClient=async(name,subjectType='public')=>schemaAuth.api.adminCreateOAuthClient({headers:login.headers,body:{
    client_name:name,redirect_uris:[callback],grant_types:['authorization_code'],response_types:['code'],
    token_endpoint_auth_method:'client_secret_post',require_pkce:true,skip_consent:true,
    scope:`openid profile email ${scope}`,resources:[audience],dpop_bound_access_tokens:true,subject_type:subjectType}});
  const client=await createClient('Human resource client'),pairClient=await createClient('Pairwise resource client','pairwise');
  const observer=await schemaAuth.api.adminCreateOAuthClient({headers:login.headers,body:{client_name:'Lifecycle observer',
    grant_types:['client_credentials'],token_endpoint_auth_method:'client_secret_post',scope,client_credentials_scopes:[scope],resources:[audience]}});
  observerCredentials={client_id:observer.client_id,client_secret:observer.client_secret};
  for(const c of [client,pairClient]) {
    // Explicit, evidence-backed app/environment link; no existing registration changed.
    // Existing linkage permits one login client/environment, so use a separate app for pairwise fixture.
    const boundApp=c===client?app:randomUUID();
    if(c!==client)await pool.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'pairwise','Pairwise fixture')",[boundApp]);
    await pool.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by)
      VALUES($1,'development',$2,'[]',$3)`,[boundApp,c.client_id,user.id]);
    await registry.configureBinding({clientId:c.client_id,applicationId:boundApp,scopes:[scope]},actor());
  }
  integration=createProviderIssuanceIntegration(registry,{enabled:true,jwksFetch:()=>auth.api.getJwks(),
    introspectPairwise:async token=>(await post('/oauth2/introspect',{...observerCredentials,token}, {},schemaAuth)).body});
  auth=makeAuth();const ctx=await auth.$context;
  const sender=await generateKeyPair('ES256'),jwk=await exportJWK(sender.publicKey),jkt=await deriveDpopJkt(jwk);
  const proof=async(token,url=audience+'/me/tenants',method='GET',extra={},key=sender,publicKey=jwk)=>
    new SignJWT({htm:method,htu:url,...(token?{ath:await deriveDpopAth(token)}:{}),...extra})
      .setProtectedHeader({typ:'dpop+jwt',alg:'ES256',jwk:publicKey}).setJti(randomUUID()).setIssuedAt(extra.iat??Math.floor(Date.now()/1000)).sign(key.privateKey);
  async function issue(c=client,{instance=auth,scopeValue=scope,sessionHeaders=login.headers}={}) {
    const verifier='a'.repeat(64);
    const query=new URLSearchParams({client_id:c.client_id,redirect_uri:callback,response_type:'code',scope:scopeValue,
      resource:audience,state:randomUUID(),nonce:randomUUID(),code_challenge:await generateCodeChallenge(verifier),code_challenge_method:'S256',dpop_jkt:jkt});
    const res=await instance.handler(new Request(issuer+'/oauth2/authorize?'+query,{headers:sessionHeaders}));
    const text=await res.text();const location=new URL(res.headers.get('location')??JSON.parse(text).url);
    return post('/oauth2/token',{client_id:c.client_id,client_secret:c.client_secret,grant_type:'authorization_code',
      code:location.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier,resource:audience},
      {DPoP:await proof(undefined,issuer+'/oauth2/token','POST')},instance);
  }
  const nonce=createDpopNonceService(registry);
  const adapter=createIdentityCredentialAdapter(policy,{jwksFetch:()=>auth.api.getJwks(),
    replayStore:createDpopReplayStore(ctx.internalAdapter),nonce,readCurrentState:registry.readCurrentState});
  const request=async(token,nonceValue,overrides={})=>{
    const {url=audience+'/me/tenants',method='GET',...claims}=overrides;
    return new Request(url,{method,headers:{authorization:`DPoP ${token}`,DPoP:await proof(token,url,method,{nonce:nonceValue,...claims})}});
  };
  const validate=async(token,nonceValue,overrides)=>adapter.validateAccessCredential(await request(token,nonceValue,overrides),{scopes:[scope]});
  const ref=token=>{const c=decodeJwt(token);return {issuer,audience,environment:policy.environment,tokenId:c.jti,clientId:c.client_id,sessionId:c.sid,subject:c.sub};};
  let token;
  await t.test('native grant capture and final-token hook register before response; valid adapter context',async()=>{
    const result=await issue();assert.equal(result.status,200,JSON.stringify(result.body));token=result.body.access_token;
    const row=(await pool.query('SELECT * FROM identity_access_issuances WHERE token_id=$1',[decodeJwt(token).jti])).rows[0];
    assert.ok(row);assert.equal(row.token_digest,digest(token));assert.equal(row.session_id,decodeJwt(token).sid);
    assert.equal(row.grant_class,'human_authorization_code');assert.equal(row.audience,audience);
    const active=await validate(token,await nonce.issue(jkt));assert.equal(active.userId,user.id);
    assert.equal(active.applicationId,app);
    assert.equal(JSON.stringify(row).includes(token),false);
  });
  await t.test('resource profile rejects combined OIDC and machine grants; digest mismatch denies',async()=>{
    assert.equal(await registry.readCurrentState(ref(token),'0'.repeat(64)),null);
    const mixed=await issue(client,{scopeValue:`openid ${scope}`});
    assert.notEqual(mixed.status,200);assert.equal(mixed.body.access_token,undefined);
    const machine=await schemaAuth.api.adminCreateOAuthClient({headers:login.headers,body:{client_name:'Not a human',
      grant_types:['client_credentials'],token_endpoint_auth_method:'client_secret_post',scope,client_credentials_scopes:[scope],
      resources:[audience],dpop_bound_access_tokens:true}});
    const result=await post('/oauth2/token',{client_id:machine.client_id,client_secret:machine.client_secret,
      grant_type:'client_credentials',resource:audience,scope},{DPoP:await proof(undefined,issuer+'/oauth2/token','POST')});
    assert.notEqual(result.status,200);assert.equal(result.body.access_token,undefined);
  });
  await t.test('missing nonce returns correct persisted 401 resource challenge and consumes proof',async()=>{
    const req=await request(token,undefined);let error;
    try{await adapter.validateAccessCredential(req,{scopes:[scope]});assert.fail('must challenge');}catch(e){error=e;}
    assert.ok(error instanceof DpopNonceRequired);
    const response=nonceChallenge(error);assert.equal(response.status,401);
    assert.equal(response.headers.get('www-authenticate'),'DPoP error="use_dpop_nonce", algs="ES256"');
    assert.equal(response.headers.get('cache-control'),'no-store');
    const next=response.headers.get('dpop-nonce');assert.ok(next);
    assert.equal((await validate(token,next)).userId,user.id);
    await assert.rejects(adapter.validateAccessCredential(req,{scopes:[scope]}),errorCode('invalid_dpop_proof'));
  });
  await t.test('bypassed hook issues signed JWT which positive registry rejects',async()=>{
    const result=await issue(client,{instance:schemaAuth});assert.equal(result.status,200);
    const unregistered=result.body.access_token;
    assert.equal(await registry.readCurrentState(ref(unregistered),digest(unregistered)),null);
    await assert.rejects(validate(unregistered,await nonce.issue(jkt)),errorCode('invalid_token'));
  });
  await t.test('audit failure rolls back issuance/mapping; no token response escapes',async()=>{
    const count=async()=>(await pool.query('SELECT count(*)::int n FROM identity_access_issuances')).rows[0].n;
    const old=await count();
    await pool.query(`CREATE FUNCTION fail_identity_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER fail_identity_audit BEFORE INSERT ON identity_credential_events FOR EACH ROW EXECUTE FUNCTION fail_identity_audit()`);
    try{const result=await issue(pairClient);assert.equal(result.status,503);assert.equal(result.body.access_token,undefined);assert.equal(await count(),old);
      assert.equal((await pool.query('SELECT id FROM identity_subject_mappings WHERE client_id=$1',[pairClient.client_id])).rowCount,0);
      await assert.rejects(registry.revokeToken(decodeJwt(token).jti,actor()),errorCode('identity_unavailable'));
      assert.ok(await registry.readCurrentState(ref(token),digest(token)));}
    finally{await pool.query('DROP TRIGGER fail_identity_audit ON identity_credential_events; DROP FUNCTION fail_identity_audit()');}
  });
  await t.test('individual revocation is idempotent, audited, monotonic; sibling remains active',async()=>{
    const sibling=(await issue()).body.access_token;
    const a=actor();await registry.revokeToken(decodeJwt(token).jti,a);await registry.revokeToken(decodeJwt(token).jti,a);
    assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
    await assert.rejects(validate(token,await nonce.issue(jkt)),errorCode('invalid_token'));
    assert.ok(await registry.readCurrentState(ref(sibling),digest(sibling)));
    await assert.rejects(pool.query('UPDATE identity_access_issuances SET revoked_at=NULL WHERE token_id=$1',[decodeJwt(token).jti]));
    token=sibling;
  });
  await t.test('pairwise mapping comes from trusted same-token introspection, never email',async()=>{
    const result=await issue(pairClient);assert.equal(result.status,200,JSON.stringify(result.body));
    const pairToken=result.body.access_token;
    const introspected=(await post('/oauth2/introspect',{...observerCredentials,token:pairToken},{},schemaAuth)).body;
    assert.notEqual(introspected.sub,user.id);assert.equal(decodeJwt(pairToken).sub,user.id);
    assert.equal(await registry.resolveSubject(pairClient.client_id,introspected.sub,'pairwise'),user.id);
    assert.equal(await registry.resolveSubject(pairClient.client_id,user.email,'pairwise'),null);
    assert.equal(await registry.resolveSubject(client.client_id,introspected.sub,'pairwise'),null);
    assert.equal(await registry.resolveSubject(pairClient.client_id,introspected.sub,'provider_access_subject'),null);
    const mapping=(await pool.query("SELECT id FROM identity_subject_mappings WHERE client_id=$1 AND namespace='provider_access_subject'",[pairClient.client_id])).rows[0];
    await registry.revokeMapping(mapping.id,actor());
    assert.equal(await registry.readCurrentState(ref(pairToken),digest(pairToken)),null);
    await assert.rejects(pool.query('DELETE FROM "user" WHERE id=$1',[user.id])); // restrictive history FK
    await assert.rejects(pool.query(`INSERT INTO identity_subject_mappings(issuer,client_id,namespace,subject,user_id,evidence_id)
      VALUES($1,$2,'pairwise',$3,$4,$5)`,[issuer,pairClient.client_id,introspected.sub,user.id,randomUUID()]));
    await assert.rejects(pool.query('UPDATE identity_subject_mappings SET verified_at=NULL WHERE id=$1',[mapping.id]));
    await assert.rejects(pool.query(`INSERT INTO identity_subject_mappings(issuer,client_id,namespace,subject,user_id,evidence_id,verified_at)
      VALUES($1,$2,'pairwise','unverified-subject',$3,$4,NULL)`,[issuer,pairClient.client_id,user.id,randomUUID()]));
    await pool.query("DELETE FROM identity_subject_mappings WHERE client_id=$1 AND namespace='pairwise'",[pairClient.client_id]);
    assert.equal(await registry.resolveSubject(pairClient.client_id,introspected.sub,'pairwise'),null);
  });
  await t.test('old OIDC-only login still produces original ID token profile without registry enrollment',async()=>{
    // No Nexus resource: preserve existing OIDC semantics and signatures.
    const verifier='a'.repeat(64),oidcNonce=randomUUID();
    const query=new URLSearchParams({client_id:legacyClient.client_id,redirect_uri:callback,response_type:'code',scope:'openid profile email',
      nonce:oidcNonce,state:randomUUID(),code_challenge:await generateCodeChallenge(verifier),code_challenge_method:'S256',dpop_jkt:jkt});
    const res=await auth.handler(new Request(issuer+'/oauth2/authorize?'+query,{headers:login.headers}));
    const text=await res.text(),location=new URL(res.headers.get('location')??JSON.parse(text).url);
    const result=await post('/oauth2/token',{client_id:legacyClient.client_id,client_secret:legacyClient.client_secret,grant_type:'authorization_code',
      code:location.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier},{DPoP:await proof(undefined,issuer+'/oauth2/token','POST')});
    assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(result.body.id_token);
    assert.equal(decodeProtectedHeader(result.body.id_token).alg,'EdDSA');
    assert.equal(decodeJwt(result.body.id_token).nonce,oidcNonce);assert.equal(decodeJwt(result.body.id_token).aud,legacyClient.client_id);
  });
  await t.test('concurrent revoke/validate is serialized; subsequent snapshots deny',async()=>{
    const tx=await pool.connect();await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    assert.ok(await registry.readCurrentStateInTransaction(tx,ref(token),digest(token)));
    const revoker=registry.revokeToken(decodeJwt(token).jti,actor());
    // Observe the actual issuer-row lock wait rather than rely on a sleep race.
    let waiting=false;
    for(let i=0;i<100&&!waiting;i++)waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'UPDATE identity_credential_authorities%') yes")).rows[0].yes;
    assert.equal(waiting,true);await tx.query('COMMIT');tx.release();await revoker;
    assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
    token=(await issue()).body.access_token;
  });
  await t.test('client invalidation then native disable/re-enable never resurrects old JWT',async()=>{
    await registry.invalidate('client',client.client_id,actor());
    await auth.api.adminUpdateOAuthClient({headers:login.headers,body:{client_id:client.client_id,update:{disabled:true}}});
    assert.equal((await ctx.adapter.findOne({model:'oauthClient',where:[{field:'clientId',value:client.client_id}]})).disabled,true);
    assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
    await auth.api.adminUpdateOAuthClient({headers:login.headers,body:{client_id:client.client_id,update:{disabled:false}}});
    assert.equal((await ctx.adapter.findOne({model:'oauthClient',where:[{field:'clientId',value:client.client_id}]})).disabled,false);
    await registry.invalidate('client',client.client_id,actor(),true);
    assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
    const fresh=await issue();assert.equal(fresh.status,200,JSON.stringify(fresh.body));token=fresh.body.access_token;
    assert.ok(await registry.readCurrentState(ref(token),digest(token)));
  });
  await t.test('wrong binding/admin and unavailable user suspension hook fail closed',async()=>{
    await assert.rejects(registry.revokeToken(decodeJwt(token).jti,{...actor(),actorId:'ordinary-user'}),errorCode('forbidden'));
    await assert.rejects(registry.suspendUser(),errorCode('unsupported_lifecycle'));
    await assert.rejects(registry.readCurrentState({...ref(token),environment:'production'},digest(token)),errorCode('invalid_token'));
    const disabled=createCredentialRegistry(pool,{enabled:false,policy,authorize});
    await assert.rejects(disabled.readCurrentState(ref(token),digest(token)),errorCode('identity_unavailable'));
  });
  await t.test('session deletion preserves original lineage and denies; session-scoped invalidation is permanent',async()=>{
    const otherLogin=await ctx.test.login({userId:user.id});
    const issued=await issue(client,{sessionHeaders:otherLogin.headers});assert.equal(issued.status,200);
    const access=issued.body.access_token,r=ref(access);
    await ctx.adapter.delete({model:'session',where:[{field:'id',value:r.sessionId}]});
    assert.equal(await registry.readCurrentState(r,digest(access)),null);
    assert.equal((await pool.query('SELECT session_id FROM identity_access_issuances WHERE token_id=$1',[r.tokenId])).rows[0].session_id,r.sessionId);
    await registry.invalidate('session',ref(token).sessionId,actor());
    assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
    await registry.invalidate('session',ref(token).sessionId,actor(),true);
    assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
    token=(await issue()).body.access_token;
  });
  await t.test('sender/signing key compromise invalidates generation; re-enable allows only fresh issuance',async()=>{
    for(const [kind,key] of [['sender_key',jkt],['signing_key',decodeProtectedHeader(token).kid],['user',user.id]]) {
      const a=actor();await registry.invalidate(kind,key,a);await registry.invalidate(kind,key,a);
      assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
      await registry.invalidate(kind,key,actor(),true);
      assert.equal(await registry.readCurrentState(ref(token),digest(token)),null);
      const result=await issue();assert.equal(result.status,200);token=result.body.access_token;
    }
  });
  // Nonce tests use a new key to keep per-key challenge quotas explicit.
  await pool.query('DELETE FROM identity_dpop_nonces');
  await t.test('nonce expiry/rotation, malformed/stale/tampered proofs and binding negatives',async()=>{
    const n1=await nonce.issue(jkt),n2=await nonce.issue(jkt);
    assert.ok(await validate(token,n1));assert.ok(await validate(token,n2));
    await pool.query("UPDATE identity_dpop_nonces SET issued_at=statement_timestamp()-interval '61 seconds',expires_at=statement_timestamp()-interval '1 second' WHERE digest=$1",[digest(n1)]);
    for(const n of [n1,'arbitrary',42])await assert.rejects(validate(token,n),e=>e instanceof DpopNonceRequired);
    for(const extra of [{htm:'POST'},{htu:audience+'/wrong'},{ath:'wrong'},{iat:1},{iat:Math.floor(Date.now()/1000)+100}])
      await assert.rejects(validate(token,n2,extra),errorCode('invalid_dpop_proof'));
    const other=await generateKeyPair('ES256');
    const bad=await proof(token,audience+'/me/tenants','GET',{nonce:n2},other,await exportJWK(other.publicKey));
    await assert.rejects(adapter.validateAccessCredential(new Request(audience+'/me/tenants',{headers:{authorization:`DPoP ${token}`,DPoP:bad}}),{scopes:[scope]}),errorCode('invalid_dpop_proof'));
    const signed=await proof(token,audience+'/me/tenants','GET',{nonce:n2});const parts=signed.split('.');
    parts[1]=Buffer.from(JSON.stringify({...decodeJwt(signed),nonce:n1})).toString('base64url');
    await assert.rejects(adapter.validateAccessCredential(new Request(audience+'/me/tenants',{headers:{authorization:`DPoP ${token}`,DPoP:parts.join('.')}}),{scopes:[scope]}),errorCode('invalid_dpop_proof'));
  });
  await t.test('nonce scope, quotas and concurrent issuance stay shared and fail closed',async()=>{
    const other=await generateKeyPair('ES256'),otherJkt=await deriveDpopJkt(await exportJWK(other.publicKey));
    const foreign=await nonce.issue(otherJkt);
    await assert.rejects(validate(token,foreign),e=>e instanceof DpopNonceRequired);
    const workerRegistry=createCredentialRegistry(pool,{enabled:true,policy,authorize});
    const race=await Promise.allSettled([nonce.issue(otherJkt),createDpopNonceService(workerRegistry).issue(otherJkt)]);
    assert.ok(race.some(r=>r.status==='fulfilled'));
    for(const result of race) {
      if(result.status==='fulfilled')assert.equal((await pool.query('SELECT digest FROM identity_dpop_nonces WHERE digest=$1',[digest(result.value)])).rowCount,1);
      else assert.equal(result.reason.code,'identity_unavailable'); // RR serialization conflict never permits stale quota writes.
    }
    const scoped=createDpopNonceService(createCredentialRegistry(pool,{enabled:true,policy:{...policy,environment:'staging'},authorize}));
    await assert.rejects(validate(token,await scoped.issue(jkt)),e=>e instanceof DpopNonceRequired);
    // Hard per-key cap prevents unlimited outstanding challenges; other keys cannot bypass total cap.
    const count=async()=>(await pool.query('SELECT count(*)::int n FROM identity_dpop_nonces WHERE sender_key=$1 AND expires_at>clock_timestamp()',[otherJkt])).rows[0].n;
    while(await count()<8)await nonce.issue(otherJkt);
    await assert.rejects(nonce.issue(otherJkt),errorCode('identity_unavailable'));
    await pool.query('DELETE FROM identity_dpop_nonces WHERE sender_key=$1',[jkt]);
  });
  await t.test('shared nonce and identical proof race across independent Node processes',async()=>{
    const n=await nonce.issue(jkt),req=await request(token,n),keys=await auth.api.getJwks();
    const source=`
      import pg from 'pg';import {betterAuth} from 'better-auth';
      import {createDpopReplayStore} from 'better-auth/oauth2';
      import {createCredentialRegistry} from './src/lib/identity/credential-registry.ts';
      import {createDpopNonceService} from './src/lib/identity/dpop-nonce.ts';
      import {createIdentityCredentialAdapter} from './src/lib/identity/access-credentials.ts';
      const d=JSON.parse(process.env.IS_SYNTHETIC_LIFECYCLE_INPUT),pool=new pg.Pool(d.config);
      try {const registry=createCredentialRegistry(pool,{enabled:true,policy:d.policy,authorize:async()=>false});
        const context=await betterAuth({baseURL:d.origin,database:pool,secret:'synthetic-child-secret-000000000000000000',logger:{disabled:true}}).$context;
        const adapter=createIdentityCredentialAdapter(d.policy,{jwksFetch:async()=>d.keys,replayStore:createDpopReplayStore(context.internalAdapter),
          nonce:createDpopNonceService(registry),readCurrentState:registry.readCurrentState});
        try {await adapter.validateAccessCredential(new Request(d.url,{headers:d.headers}),{scopes:[d.scope]});process.stdout.write('accepted');}
        catch(e){if(e.code!=='invalid_dpop_proof')throw e;process.stdout.write('rejected');}
      }finally{await pool.end();}`;
    const env={...process.env,IS_SYNTHETIC_LIFECYCLE_INPUT:JSON.stringify({config,policy,origin,scope,keys,url:req.url,headers:Object.fromEntries(req.headers)})};
    const results=await Promise.all([0,1].map(()=>run(process.execPath,['--experimental-strip-types','--input-type=module','-e',source],{env})));
    assert.deepEqual(results.map(r=>r.stdout).sort(),['accepted','rejected']);
  });
  await t.test('database outage fails closed; recovered store validates fresh proof',async()=>{
    const unavailable=new pg.Pool({...config,host:join(dir,'missing')});
    try {
      const dead=createCredentialRegistry(unavailable,{enabled:true,policy,authorize});
      await assert.rejects(dead.readCurrentState(ref(token),digest(token)),errorCode('identity_unavailable'));
      await assert.rejects(createDpopNonceService(dead).issue(jkt),errorCode('identity_unavailable'));
    }finally{await unavailable.end();}
    const currentNonce=await nonce.issue(jkt),seen=await request(token,currentNonce);
    await adapter.validateAccessCredential(seen,{scopes:[scope]});
    await run(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop']);started=false;
    try {
      await assert.rejects(validate(token,currentNonce),errorCode('identity_unavailable'));
      await assert.rejects(nonce.issue(jkt),errorCode('identity_unavailable'));
    } finally {
      await run(join(bin,'pg_ctl'),['-D',data,'-l',join(dir,'postgres.log'),'-o',`-F -h '' -k ${socket} -p 55441`,'-w','start']);started=true;
    }
    assert.ok(await validate(token,currentNonce));
    await assert.rejects(adapter.validateAccessCredential(seen,{scopes:[scope]}),errorCode('invalid_dpop_proof'));
  });
  await t.test('retention keeps revoked IDs for at least 30 days; cleanup never erases epochs/mappings/audit',async()=>{
    await registry.revokeToken(decodeJwt(token).jti,actor());
    const old=(await pool.query('SELECT count(*)::int n FROM identity_access_issuances')).rows[0].n;
    await pool.query(`INSERT INTO identity_access_issuances
      SELECT issuer,'expired-retention-fixture',audience,environment,client_id,mapping_id,token_digest,session_id,
        grant_class,grant_id,sender_key,signing_key,scopes,generations,
        statement_timestamp()-interval '31 days 300 seconds',statement_timestamp()-interval '31 days',
        NULL,statement_timestamp()-interval '1 day',$2
      FROM identity_access_issuances WHERE token_id=$1`,[decodeJwt(token).jti,randomUUID()]);
    assert.equal(await registry.readCurrentState({...ref(token),tokenId:'expired-retention-fixture'},digest(token)),null);
    await registry.cleanup(actor());
    assert.equal((await pool.query('SELECT count(*)::int n FROM identity_access_issuances')).rows[0].n,old);
    assert.equal((await pool.query("SELECT token_id FROM identity_access_issuances WHERE token_id='expired-retention-fixture'")).rowCount,0);
    assert.ok((await pool.query('SELECT count(*)::int n FROM identity_credential_epochs')).rows[0].n>0);
    await assert.rejects(pool.query('UPDATE identity_credential_epochs SET generation=1 WHERE generation>1'));
    await assert.rejects(pool.query('DELETE FROM identity_credential_epochs'));
    await assert.rejects(pool.query('TRUNCATE identity_credential_epochs'));
  });
  if(process.env.IS_CONSUMER_RUNTIME_TESTS==='1')await (await import('./nexus-consumer-runtime.mjs')).runConsumerRuntimeTests(t,{pool,user,login,sender,jwk,jkt,proof,policy,actor,authorize});

});
