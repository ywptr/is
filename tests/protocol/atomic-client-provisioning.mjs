import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {betterAuth} from 'better-auth';
import {getCurrentDBAdapterAsyncLocalStorage} from '@better-auth/core/context';
import {jwt} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {generateCodeChallenge,signPrivateKeyJwtClientAssertion} from 'better-auth/oauth2';
import {createCredentialAdministration,nexusScopes} from '../../src/lib/identity/administration.ts';
import {createDisabledOAuthClient} from '../../src/lib/identity/atomic-client-provisioning.ts';

export async function runAtomicProvisioningTests(t,f){
 const {pool,auth,policy,principal,login,provider,pub,priv,jkt,proof}=f;
 const ctx=await auth.$context,issuer=policy.issuer,origin=new URL(issuer).origin;
 // This second instance has NO Nexus hooks: disabled denial must be native.
 const bare=betterAuth({baseURL:origin,secret:'synthetic-lifecycle-secret-000000000000000000',database:pool,
  logger:{disabled:true},rateLimit:{enabled:false},emailAndPassword:{enabled:false},plugins:[jwt({disableSettingJwtHeader:true}),oauthProvider({
   loginPage:'/sign-in',consentPage:'/consent',clientPrivileges:async()=>true,allowDynamicClientRegistration:false,
   allowUnauthenticatedClientRegistration:false,scopes:nexusScopes,enforcePerClientResources:true,storeTokens:'hashed',assertionMaxLifetime:60})]});
 const snapshot=(await pool.query('SELECT * FROM "oauthClient" ORDER BY "clientId"')).rows;
 const nativeCreate=body=>auth.api.adminCreateOAuthClient({headers:login.headers,body});
 const request=async()=>{
  const applicationId=randomUUID();await pool.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'sandcastle','Atomic synthetic fixture')",[applicationId]);
  return {action:'provision',applicationId,requestId:randomUUID(),reason:'disposable atomic test',environment:'development',jwks:{keys:[pub]},operations:['sandcastle:tenant.access']};
 };
 const archive=r=>pool.query("UPDATE nexus_applications SET app_key=$2 WHERE id=$1",[r.applicationId,'atomic-'+r.applicationId]);
 const lookup=async(connection,id)=>({clients:(await connection.query('SELECT disabled FROM "oauthClient" WHERE "clientId"=$1',[id])).rows,
  links:(await connection.query('SELECT "resourceId" FROM "oauthClientResource" WHERE "clientId"=$1',[id])).rows});
 const storage=await getCurrentDBAdapterAsyncLocalStorage();
 const probe=(native,id)=>storage.exit(async()=>{
  const q=new URLSearchParams({client_id:id,redirect_uri:'https://5480-deb13.lan.com:5182/api/auth/callback',response_type:'code',scope:nexusScopes.join(' '),resource:policy.audience,
   state:randomUUID(),code_challenge:await generateCodeChallenge('a'.repeat(64)),code_challenge_method:'S256',dpop_jkt:jkt});
  const authorize=await native.handler(new Request(issuer+'/oauth2/authorize?'+q,{headers:login.headers}));
  const assertion=await signPrivateKeyJwtClientAssertion({clientId:id,tokenEndpoint:issuer+'/oauth2/token',privateKeyJwk:priv,kid:pub.kid,algorithm:'ES256',expiresIn:60});
  const token=await native.handler(new Request(issuer+'/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',DPoP:await proof(undefined,issuer+'/oauth2/token','POST')},
   body:new URLSearchParams({client_id:id,grant_type:'authorization_code',code:'not-a-provider-code',code_verifier:'a'.repeat(64),redirect_uri:q.get('redirect_uri'),resource:policy.audience,
    client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:assertion})}));
  const a=await authorize.text(),b=await token.json();
  const location=authorize.headers.get('location')??(a?JSON.parse(a).url:undefined);
  assert(authorize.status>=400 || (location&&new URL(location,origin).searchParams.has('error')),a);
  assert(!location || !new URL(location,origin).searchParams.has('code'));assert(token.status>=400,JSON.stringify(b));assert.equal(b.access_token,undefined);
  return {authorize:a+(location?decodeURIComponent(location):''),token:b};
 });
 await t.test('atomic bridge pins all provider/core/adapter versions and rejects unprivileged/nontransactional adapters',async()=>{
  const lock=JSON.parse(await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'));
  for(const name of ['better-auth','@better-auth/core','@better-auth/oauth-provider','@better-auth/kysely-adapter'])assert.equal(lock.packages['node_modules/'+name].version,'1.7.10');
  let called=false;await assert.rejects(createDisabledOAuthClient(ctx,async()=>{called=true;return {client_id:'no'};},()=>{}),e=>e.code==='forbidden');assert.equal(called,false);
  const noTransaction={...ctx.adapter,options:{...ctx.adapter.options,adapterConfig:{...ctx.adapter.options.adapterConfig,transaction:false}}};
  const notPostgres={...ctx.adapter,options:{...ctx.adapter.options,adapterConfig:{...ctx.adapter.options.adapterConfig,supportsUUIDs:false}}};
  for(const incompatible of [{...ctx,adapter:noTransaction},{...ctx,adapter:notPostgres},{...ctx,version:'1.7.11'},
    {...ctx,options:{...ctx.options,plugins:ctx.options.plugins.map(plugin=>plugin.id==='oauth-provider'?{...plugin,version:'1.7.11'}:plugin)}}]){
   const r=await request();try{
    const admin=createCredentialAdministration(pool,policy,{...provider,createDisabledClient:(body,verify)=>createDisabledOAuthClient(incompatible,()=>{called=true;return nativeCreate(body);},verify)});
    await assert.rejects(admin.execute(r,principal),e=>e.code==='atomic_provisioning_unavailable');assert.equal(called,false);
   }finally{await archive(r);}
  }
 });
 await t.test('independent connections see no creation before commit; first visible state disabled; concurrent native OAuth requests deny',async()=>{
  const r=await request(),observer=await pool.connect();let id;
  try{
   const providerWithObserver={...provider,createDisabledClient:(body,verify)=>createDisabledOAuthClient(ctx,async()=>{
    const created=await nativeCreate(body);id=created.client_id;
    assert.deepEqual(await lookup(observer,id),{clients:[],links:[]});
    await Promise.all([probe(bare,id),probe(bare,id),probe(bare,id)]);
    assert.deepEqual(await lookup(observer,id),{clients:[],links:[]});return created;
   },record=>{assert.equal(record.disabled,true);verify(record);})};
   const admin=createCredentialAdministration(pool,policy,providerWithObserver),out=await admin.execute(r,principal);
   assert.equal(out.clientId,id);assert.deepEqual((await lookup(observer,id)).clients,[{disabled:true}]);
   assert.deepEqual((await lookup(observer,id)).links,[{resourceId:policy.audience}]);
   const denied=await probe(bare,id);assert.match(denied.authorize,/client_disabled/);assert.match(JSON.stringify(denied.token),/client is disabled/);
   assert.deepEqual(await admin.execute(r,principal),out);
   await assert.rejects(admin.execute({...r,reason:'conflicting retry'},principal),e=>e.code==='idempotency_conflict');
   assert.equal((await pool.query('SELECT count(*)::int n FROM "oauthClient" WHERE metadata::jsonb->>\'administration_request_id\'=$1',[r.requestId])).rows[0].n,1);
  }finally{observer.release();await archive(r);}
 });
 for(const stage of ['before disablement','during read-back'])await t.test('atomic failure '+stage+' rolls back both native records and resource links',async()=>{
  const r=await request(),observer=await pool.connect();let id;
  try{
   const adapter=stage==='during read-back'?{...ctx.adapter,transaction:cb=>ctx.adapter.transaction(trx=>cb({...trx,findOne:args=>args.model==='oauthClient'?Promise.reject(new Error('synthetic read-back outage')):trx.findOne(args)}))}:ctx.adapter;
   const failing={...provider,createDisabledClient:(body,verify)=>createDisabledOAuthClient({...ctx,adapter},async()=>{
    const created=await nativeCreate(body);id=created.client_id;assert.deepEqual(await lookup(observer,id),{clients:[],links:[]});
    if(stage==='before disablement')throw new Error('synthetic crash before disable');return created;
   },verify)};
   await assert.rejects(createCredentialAdministration(pool,policy,failing).execute(r,principal));assert(id);
   assert.deepEqual(await lookup(observer,id),{clients:[],links:[]});
   const audit=(await pool.query('SELECT state FROM identity_credential_administration WHERE request_id=$1',[r.requestId])).rows[0];assert.equal(audit.state,'failed');
   assert.equal((await pool.query('SELECT 1 FROM nexus_application_oauth_clients WHERE application_id=$1',[r.applicationId])).rowCount,0);
  }finally{observer.release();await archive(r);}
 });
 await t.test('concurrent identical provisioning has one effective registration and retryable durable result',async()=>{
  const r=await request();try{
   const admin=createCredentialAdministration(pool,policy,provider),results=await Promise.allSettled([admin.execute(r,principal),admin.execute(r,principal)]);
   assert(results.some(x=>x.status==='fulfilled'));for(const x of results)if(x.status==='rejected')assert.equal(x.reason.code,'administration_busy');
   const out=await admin.execute(r,principal);assert.equal(out.disabled,true);
   assert.equal((await pool.query('SELECT 1 FROM nexus_application_oauth_clients WHERE application_id=$1',[r.applicationId])).rowCount,1);
   await assert.rejects(admin.execute({...r,jwks:{keys:[{...pub,kid:'conflict'}]}},principal),e=>e.code==='idempotency_conflict');
  }finally{await archive(r);}
 });
 await t.test('missing initial provisioning audit prevents native client creation entirely',async()=>{
  const r=await request();let called=false;
  const before=(await pool.query('SELECT count(*)::int n FROM "oauthClient"')).rows[0].n;
  try{
   await pool.query(`CREATE FUNCTION fail_atomic_initial_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
    CREATE TRIGGER fail_atomic_initial_audit BEFORE INSERT ON identity_credential_administration FOR EACH ROW EXECUTE FUNCTION fail_atomic_initial_audit()`);
   await assert.rejects(createCredentialAdministration(pool,policy,{...provider,createDisabledClient:async()=>{called=true;throw new Error('unreachable');}}).execute(r,principal));
   assert.equal(called,false);assert.equal((await pool.query('SELECT count(*)::int n FROM "oauthClient"')).rows[0].n,before);
   assert.equal((await pool.query('SELECT 1 FROM identity_credential_administration WHERE request_id=$1',[r.requestId])).rowCount,0);
  }finally{await pool.query('DROP TRIGGER IF EXISTS fail_atomic_initial_audit ON identity_credential_administration;DROP FUNCTION IF EXISTS fail_atomic_initial_audit()');await archive(r);}
 });
 await t.test('failed final audit leaves only a disabled quarantined native client with durable reconciliation metadata',async()=>{
  const r=await request();try{
   await pool.query(`CREATE FUNCTION fail_atomic_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='complete' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_atomic_audit BEFORE UPDATE ON identity_credential_administration FOR EACH ROW EXECUTE FUNCTION fail_atomic_audit()`);
   await assert.rejects(createCredentialAdministration(pool,policy,provider).execute(r,principal));
   const journal=(await pool.query('SELECT state,result FROM identity_credential_administration WHERE request_id=$1',[r.requestId])).rows[0];
   assert.equal(journal.state,'failed');assert(journal.result.clientId);assert.deepEqual((await lookup(pool,journal.result.clientId)).clients,[{disabled:true}]);
   assert.equal((await pool.query('SELECT 1 FROM nexus_application_oauth_clients WHERE application_id=$1',[r.applicationId])).rowCount,0);
   await probe(bare,journal.result.clientId);
   await assert.rejects(createCredentialAdministration(pool,policy,provider).execute(r,principal),e=>e.code==='incomplete_operation_review_required');
  }finally{await pool.query('DROP TRIGGER IF EXISTS fail_atomic_audit ON identity_credential_administration;DROP FUNCTION IF EXISTS fail_atomic_audit()');await archive(r);}
 });
 await t.test('atomic compatibility bridge leaves all pre-existing OAuth clients byte-for-byte unchanged',async()=>{
  const current=(await pool.query('SELECT * FROM "oauthClient" WHERE "clientId"=ANY($1::text[]) ORDER BY "clientId"',[snapshot.map(r=>r.clientId)])).rows;assert.deepEqual(current,snapshot);
 });
}
