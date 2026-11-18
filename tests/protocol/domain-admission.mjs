// Real provider + disposable PostgreSQL only; no persistent DATABASE_URL or consumer repo.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {signJWT} from 'better-auth/plugins/jwt';
import {decodeJwt,decodeProtectedHeader} from 'jose';
import {generateCodeChallenge,signPrivateKeyJwtClientAssertion} from 'better-auth/oauth2';
import {createEligibilityIdentity} from '../../src/lib/identity/eligibility-context.ts';
import {createEligibilityService} from '../../src/lib/nexus-eligibility/service.ts';
import {createAdmissionService} from '../../src/lib/identity/admission/service.ts';
import {createAdmissionHandler} from '../../src/lib/identity/admission/http.ts';
import {createAdmissionJwksReader} from '../../src/lib/identity/admission/provider.ts';
import {verifyAdmissionContext} from '../../src/lib/identity/admission/verification.ts';
import {createDomainManagement} from '../../src/lib/nexus-domains/service.ts';
import {resolveDomain} from '../../src/lib/nexus-domains/policy.ts';
import {createDomainDecisionHandler} from '../../src/lib/nexus-domains/decision-http.ts';
const run=promisify(execFile),opaque=()=>randomBytes(32).toString('base64url');
const migration='0013_nexus_domain_bindings.sql';
export async function runDomainAdmissionTests(t,f){
 const {pool,auth,integration,client,app,operation,policy,jkt,proof}=f,ctx=await auth.$context;
 const origin=new URL(policy.issuer).origin,callback='https://bff.example.test/callback',domain='https://bff.example.test',hostname='bff.example.test';
 const endpoint=origin+'/api/is/v1/admission/redemptions',decisionEndpoint=new URL(policy.audience).origin+'/api/nexus/v1/domain-access-decisions';
 const actor={userId:f.user.id,requestId:randomUUID()};
 const person=await ctx.test.saveUser(ctx.test.createUser({email:'domain-human@example.test',emailVerified:true}));
 const login=await ctx.test.login({userId:person.id});
 await pool.query('INSERT INTO is_admission_emails(email) VALUES($1)',[person.email]);
 await pool.query('INSERT INTO nexus_operators(user_id) VALUES($1) ON CONFLICT DO NOTHING',[f.user.id]);
 const issued=await f.redeem(await f.authorizeCode(login.headers));assert.equal(issued.status,200);let access=issued.body.access_token;
 const subject=decodeJwt(access).sub;
 async function tenant(key){
  const id=randomUUID(),tx=await pool.connect();try{
   await tx.query('BEGIN');await tx.query('INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,$2,$2)',[id,'domain-'+key]);
   await tx.query('INSERT INTO nexus_tenant_membership_governance(tenant_id) VALUES($1)',[id]);
   await tx.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by) VALUES($1,$2,'owner','active',$2,$2),($1,$3,'member','active',$2,$2)`,[id,f.user.id,person.id]);
   await tx.query('INSERT INTO nexus_entitlements(tenant_id,application_id,enabled,updated_by) VALUES($1,$2,true,$3)',[id,app,f.user.id]);await tx.query('COMMIT');return id;
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 }
 const first=await tenant('first'),second=await tenant('second');
 await pool.query('INSERT INTO nexus_tenant_domains(hostname,tenant_id) VALUES($1,$2)',[hostname,first]);
 const clientsBefore=(await pool.query('SELECT * FROM "oauthClient" ORDER BY "clientId"')).rows;
 const keysBefore=(await pool.query('SELECT id,"publicKey" FROM jwks ORDER BY id')).rows;
 const names=(await readdir('db/migrations')).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort();
 // Existing protocol fixture applied historical SQL directly. Add its exact synthetic ledger for runner rehearsal.
 await pool.query('CREATE TABLE IF NOT EXISTS is_schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of names.filter(n=>n<migration))await pool.query('INSERT INTO is_schema_migrations(name,sha256) VALUES($1,$2) ON CONFLICT DO NOTHING',[name,createHash('sha256').update(await readFile('db/migrations/'+name)).digest('hex')]);
 const beforeTables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 const added={nexus_tenant_domains:['application_id','environment','admission_origin','binding_status','domain_revision','verification_method','verified_at','challenge_digest','challenge_expires_at'],nexus_application_oauth_clients:['admission_mode','admission_mode_revision']};
 const snapshot=async(db,projected=false)=>{
  const result={};for(const table of beforeTables){if(table==='is_schema_migrations')continue;
   result[table]=(await db.query(`SELECT count(*)::int n,md5(COALESCE(string_agg(v,E'\n' ORDER BY v COLLATE "C"),'')) digest FROM (SELECT (to_jsonb(t)-$1::text[])::text v FROM "${table}" t) q`,[projected?(added[table]??[]):[]])).rows[0];
  }return result;
 };
 const before=await snapshot(pool);
 await t.test('Domain migration: populated backup, restored exact runner, preservation, no-op and legacy default deny',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'is-domain-rehearsal-')),dbName='domain_restore_'+randomUUID().replaceAll('-','');let restored;
  assert.ok(pool.options.host.startsWith('/tmp/'),'Only existing disposable fixture sockets are permitted');
  const bin=process.env.IS_MEMBERSHIP_PG_BIN,base=['-h',pool.options.host,'-p',String(pool.options.port),'-U',pool.options.user];
  try{
   const backup=join(dir,'synthetic.dump');await run(bin+'/pg_dump',[...base,'-d',pool.options.database,'--format=custom','--file',backup]);
   await pool.query(`CREATE DATABASE ${dbName}`);
   await run(bin+'/pg_restore',[...base,'-d',dbName,'--exit-on-error','--no-owner','--no-privileges',backup]);
   restored=new pg.Pool({...pool.options,database:dbName,max:2});assert.deepEqual(await snapshot(restored),before);
   const u=new URL(`postgresql://${pool.options.user}@localhost:${pool.options.port}/${dbName}`);u.searchParams.set('host',pool.options.host);
   const env={...process.env,DATABASE_URL:u.href,NODE_ENV:'development',IS_DATABASE_SSLMODE:'disable',PGOPTIONS:'-c lock_timeout=2s -c statement_timeout=15000'};
   const result=await run(process.execPath,['scripts/migrate-app.mjs'],{env});assert.ok(result.stdout.includes('Migrated: '+migration));
   assert.deepEqual(await snapshot(restored,true),before);
   assert.equal((await restored.query('SELECT binding_status FROM nexus_tenant_domains WHERE hostname=$1',[hostname])).rows[0].binding_status,'unverified');
   assert.equal((await restored.query('SELECT count(*)::int n FROM is_schema_migrations')).rows[0].n,12);
   assert.ok(!(await run(process.execPath,['scripts/migrate-app.mjs'],{env})).stdout.includes('Migrated:'));
  }finally{if(restored)await restored.end();await pool.query(`DROP DATABASE IF EXISTS ${dbName}`);await rm(dir,{recursive:true,force:true});}
  await pool.query(await readFile('db/migrations/'+migration,'utf8'));
  await pool.query('INSERT INTO is_schema_migrations(name,sha256) VALUES($1,$2)',[migration,createHash('sha256').update(await readFile('db/migrations/'+migration)).digest('hex')]);
  assert.deepEqual(await snapshot(pool,true),before);
  await assert.rejects(integration.registry.transaction(tx=>resolveDomain(tx,domain,app,'development')));
 });
 let dns=[],on=true;
 const manager=createDomainManagement(pool,{enabled:()=>true,platformRoots:['example.test'],resolveTxt:async()=>dns});
 const inspect=async()=>manager.inspect(actor,hostname);
 const prepare=async(tenantId=first,extra={})=>manager.mutate(actor,{action:'prepare',reason:'Synthetic verified domain fixture',hostname,tenantId,applicationId:app,environment:'development',origin:domain,expectedRevision:(await inspect())?.revision??'0',...extra});
 const activate=async()=>manager.mutate(actor,{action:'activate-platform',reason:'Approved synthetic platform assignment',hostname,expectedRevision:(await inspect()).revision});
 const suspend=async()=>manager.mutate(actor,{action:'suspend',reason:'Synthetic suspension',hostname,expectedRevision:(await inspect()).revision});
 const mode=async(value)=>manager.mutate(actor,{action:'client-mode',reason:'Synthetic opt-in',clientId:client.client_id,mode:value});
 const identity=createEligibilityIdentity({policy,transaction:integration.registry.transaction,enabled:()=>true,
  authenticate:async headers=>{const s=await auth.api.getSession({headers,query:{disableCookieCache:true}});return s?{userId:s.user.id,sessionId:s.session.id}:null;}});
 const nexus=createEligibilityService(identity);
 const opts={registry:integration.registry,identity,nexus,consumer:integration.boundary,enabled:()=>true,domainEnabled:()=>on,clientAllowed:id=>id===client.client_id,
  reservations:async()=>(await auth.$context).internalAdapter,jwks:createAdmissionJwksReader(integration.registry),
  sign:(claims,keyId)=>signJWT({context:ctx},{payload:claims,header:{typ:claims.domain_binding?'is-domain-admission+jwt':'is-admission+jwt'},signingKeyId:keyId,signingAlgorithm:'EdDSA'})};
 const service=createAdmissionService(opts),http={service,enabled:()=>true,publicOrigin:origin,authenticated:async headers=>!!await auth.api.getSession({headers,query:{disableCookieCache:true}})};
 const handlers=Object.fromEntries(['authorize','choices','selection','redemptions'].map(op=>[op,createAdmissionHandler(http,op)]));
 const browser=async(op,path,{method='GET',body,headers={},session=login.headers}={},id)=>{
  const h=new Headers(session);h.set('host',new URL(origin).host);if(method==='POST'){h.set('origin',origin);h.set('content-type','application/json');}
  for(const[k,v]of Object.entries(headers))h.set(k,v);
  return handlers[op](new Request(origin+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),id);
 };
 const attempt=async(session=login.headers,redirect=callback)=>{
  const flow={verifier:'d'.repeat(64),nonce:opaque(),state:opaque()};
  const q=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,state:flow.state,nonce:flow.nonce,code_challenge:await generateCodeChallenge(flow.verifier),code_challenge_method:'S256',tenant_hint:second});
  const r=await browser('authorize','/api/is/v1/admission/authorize?'+q,{session});
  if(r.status===302){flow.id=r.headers.get('location').split('/').at(-1);flow.csrf=r.headers.get('set-cookie').match(/=([^;]+)/)[1];}return {r,flow};
 };
 const start=async()=>{const {r,flow}=await attempt();assert.equal(r.status,302,await r.clone().text());return flow;};
 const choose=async(flow,tenantId=first)=>browser('selection','/api/is/v1/admission/transactions/'+flow.id+'/selection',{method:'POST',headers:{cookie:login.headers.get('cookie')+'; __Host-is_admission_csrf='+flow.csrf,'x-csrf-token':flow.csrf,accept:'application/json'},body:{tenantId,expectedVersion:'1'}},flow.id);
 const code=async(flow,tenantId=first)=>{const r=await choose(flow,tenantId);assert.equal(r.status,200,await r.clone().text());return new URL((await r.json()).redirect).searchParams.get('code');};
 let nonce,decisionNonce;
 const exchange=async(flow,value,instance=handlers.redemptions)=>{
  const assertion=await signPrivateKeyJwtClientAssertion({clientId:client.client_id,tokenEndpoint:endpoint,privateKeyJwk:f.priv,kid:f.pub.kid,algorithm:'ES256',expiresIn:60});
  const r=await instance(new Request(endpoint,{method:'POST',headers:{host:new URL(origin).host,'content-type':'application/x-www-form-urlencoded',dpop:await proof(undefined,endpoint,'POST',nonce?{nonce}:{})},
   body:new URLSearchParams({client_id:client.client_id,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',client_assertion:assertion,code:value,code_verifier:flow.verifier,redirect_uri:callback})}));
  const body=await r.json();if(body.error==='use_dpop_nonce'){nonce=r.headers.get('dpop-nonce');return exchange(flow,value,instance);}return {status:r.status,body};
 };
 const makeDecision=service=>createDomainDecisionHandler({enabled:()=>on,publicOrigin:new URL(policy.audience).origin,trustedOrigin:o=>o===domain||o==='https://other.example.test',service});
 const decide=async(receipt,overrides={},instance=makeDecision(service))=>{
  const body={admissionContext:receipt,domainOrigin:domain,operation,...overrides};
  const r=await instance(new Request(decisionEndpoint,{method:'POST',headers:{host:new URL(decisionEndpoint).host,origin:body.domainOrigin,'content-type':'application/json',authorization:'DPoP '+access,DPoP:await proof(access,decisionEndpoint,'POST',decisionNonce?{nonce:decisionNonce}:{})},body:JSON.stringify(body)}));
  const result=await r.json();if(result.error==='use_dpop_nonce'){decisionNonce=r.headers.get('dpop-nonce');return decide(receipt,overrides,instance);}return {status:r.status,body:result};
 };
 const acquire=async(tenantId=first)=>{const flow=await start(),value=await code(flow,tenantId),r=await exchange(flow,value);assert.equal(r.status,200,JSON.stringify(r.body));return {flow,receipt:r.body.admission_context};};
 const expected=async flow=>({issuer:policy.issuer,clientId:client.client_id,applicationId:app,environment:'development',subject,nonce:flow.nonce,tenantId:first,keyThumbprint:jkt,
  domain:{hostname,origin:domain,revision:(await inspect()).revision}});
 await t.test('Domain governance: operators only, exact ownership challenge, platform namespaces and immutable audit',async()=>{
  await assert.rejects(manager.inspect({userId:person.id,requestId:randomUUID()},hostname),e=>e.error==='forbidden');
  const p=await prepare();await assert.rejects(manager.mutate(actor,{action:'verify-dns',reason:'Test',hostname,expectedRevision:p.revision}),e=>e.error==='domain_not_verified');
  dns=[[p.dns.value]];const verified=await manager.mutate(actor,{action:'verify-dns',reason:'Verified TXT fixture',hostname,expectedRevision:p.revision});
  assert.equal(verified.binding_status,'active');assert.equal(verified.verification_method,'dns_txt');
  await assert.rejects(manager.mutate(actor,{action:'verify-dns',reason:'No replay',hostname,expectedRevision:verified.revision}));
  const other=createDomainManagement(pool,{enabled:()=>true,platformRoots:[]});await assert.rejects(other.mutate(actor,{action:'activate-platform',reason:'No root authority',hostname,expectedRevision:verified.revision}),e=>e.error==='domain_not_verified');
  await assert.rejects(pool.query('UPDATE nexus_domain_epochs SET revision=1 WHERE hostname=$1',[hostname]));
  await assert.rejects(pool.query('DELETE FROM nexus_domain_binding_audit WHERE hostname=$1',[hostname]));
  await assert.rejects(pool.query('TRUNCATE nexus_domain_epochs CASCADE'));
  assert.ok((await pool.query('SELECT count(*)::int n FROM nexus_domain_binding_audit WHERE hostname=$1',[hostname])).rows[0].n>=2);
  await assert.rejects(pool.query('INSERT INTO nexus_tenant_domains(hostname,tenant_id) VALUES($1,$2)',[hostname,first]),e=>e.code==='23505');
  await assert.rejects(integration.registry.transaction(tx=>resolveDomain(tx,domain,randomUUID(),'development')));
  await assert.rejects(integration.registry.transaction(tx=>resolveDomain(tx,domain,app,'production')));
  await assert.rejects(integration.registry.transaction(tx=>resolveDomain(tx,'https://unknown.example.test',app,'development')));
  await mode('domain');
 });
 await t.test('Domain governance: concurrent same-revision remaps serialize with one winner',async()=>{
  const revision=(await inspect()).revision;
  const body={action:'prepare',reason:'Concurrent synthetic remap',hostname,tenantId:first,applicationId:app,environment:'development',origin:domain,expectedRevision:revision};
  const results=await Promise.allSettled([manager.mutate(actor,body),manager.mutate({...actor,requestId:randomUUID()},body)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.error==='binding_conflict').length,1);
  await activate();
 });
 await t.test('Domain runtime privileges: ordinary invoker can govern with explicit grants but cannot erase audit/epochs',async()=>{
  await pool.query('CREATE ROLE domain_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA public TO domain_runtime');
  await pool.query('GRANT SELECT,UPDATE ON nexus_operators TO domain_runtime');
  await pool.query('GRANT SELECT ON "user",nexus_tenants,nexus_applications TO domain_runtime');
  await pool.query('GRANT ALL ON nexus_tenant_domains,nexus_domain_epochs,nexus_domain_binding_audit,nexus_application_oauth_clients TO domain_runtime');
  await pool.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO domain_runtime');
  const ordinary=new pg.Pool({...pool.options,user:'domain_runtime',max:2});
  try{
   const owned=(await ordinary.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(owned.rolsuper,false);assert.equal(owned.rolbypassrls,false);
   const local=createDomainManagement(ordinary,{enabled:()=>true,platformRoots:['example.test']});
   const current=await local.inspect(actor,hostname);
   await local.mutate(actor,{action:'suspend',reason:'Ordinary runtime operation',hostname,expectedRevision:current.revision});
   await assert.rejects(ordinary.query('DELETE FROM nexus_domain_epochs WHERE hostname=$1',[hostname]),e=>e.code==='23514');
   await assert.rejects(ordinary.query('UPDATE nexus_domain_epochs SET revision=revision+1 WHERE hostname=$1',[hostname]),e=>e.code==='23514');
   await assert.rejects(ordinary.query('TRUNCATE nexus_domain_binding_audit'),e=>e.code==='23514');
  }finally{await ordinary.end();}
  await prepare();await activate();
 });
 let initial;
 await t.test('Domain admission: multi-tenant human gets one fixed target, hint and selection cannot override it',async()=>{
  const flow=await start(),r=await browser('choices','/api/is/v1/admission/transactions/'+flow.id,{},flow.id),choices=await r.json();
  assert.equal(r.status,200);assert.equal(choices.mode,'domain');assert.deepEqual(choices.tenants.map(x=>x.tenantId),[first]);
  assert.equal((await choose(flow,second)).status,403);
  const result=await exchange(flow,await code(flow));assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.profile,'is-domain-admission-1');
  initial={flow,receipt:result.body.admission_context};
  assert.equal(decodeProtectedHeader(initial.receipt).typ,'is-domain-admission+jwt');
  assert.deepEqual(decodeJwt(initial.receipt).domain_binding,choices.domainBinding);
  assert.equal((await verifyAdmissionContext(initial.receipt,opts.jwks,await expected(flow))).tenant_id,first);
  const legacy={...await expected(flow)};delete legacy.domain;await assert.rejects(verifyAdmissionContext(initial.receipt,opts.jwks,legacy));
  const d=await decide(initial.receipt);assert.equal(d.status,200,JSON.stringify(d.body));assert.equal(d.body.allowed,true);assert.equal(d.body.tenantId,first);
  const fallback=await f.call('/access-decisions',{method:'POST',access,body:{tenantId:second,applicationId:app,operation}});assert.equal(fallback.status,403);assert.equal(fallback.body.error,'domain_admission_required');
  assert.ok(Date.parse(d.body.validUntil)-Date.parse(d.body.evaluatedAt)<=5000);
 });
 await t.test('Domain admission: no member/default fallback, unknown domain, wrong application/environment, suspended and unverified deny',async()=>{
  const outsider=await ctx.test.saveUser(ctx.test.createUser({email:'domain-outsider@example.test',emailVerified:true})),session=await ctx.test.login({userId:outsider.id});
  await pool.query('INSERT INTO is_admission_emails(email) VALUES($1)',[outsider.email]);
  assert.ok((await attempt(session.headers)).r.status>=400);
  assert.ok((await attempt(login.headers,'https://unknown.example.test/callback')).r.status>=400);
  for(const [column,value]of [['environment','production'],['application_id',randomUUID()]]){
   const tx=await pool.connect();try{await tx.query('BEGIN');
    if(column==='application_id')await tx.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'domain-other-app','Other app')",[value]);
    await tx.query(`UPDATE nexus_tenant_domains SET ${column}=$2 WHERE hostname=$1`,[hostname,value]);
    // The policy reader denies incorrect client context in the same test transaction.
    await assert.rejects(resolveDomain(tx,domain,app,'development'));await tx.query('ROLLBACK');
   }finally{tx.release();}
  }
  await suspend();assert.ok((await attempt()).r.status>=400);
  await prepare();assert.ok((await attempt()).r.status>=400);await activate();
  assert.ok((await decide(initial.receipt)).status>=400);
 });
 await t.test('Domain authority: cross-domain replay, mode downgrade and reactivation cannot revive old evidence',async()=>{
  const a=await acquire();
  const cross=await decide(a.receipt,{domainOrigin:'https://other.example.test'});assert.equal(cross.status,403);
  on=false;assert.ok((await attempt()).r.status>=400);on=true;
  await mode('choice');assert.ok((await decide(a.receipt)).status>=400);await mode('domain');
  assert.ok((await decide(a.receipt)).status>=400);
 });
 await t.test('Domain remapping: selected code and issued receipt never revive after A→B→A',async()=>{
  const old=await acquire(),flow=await start(),value=await code(flow);
  await prepare(second);await activate();assert.ok((await exchange(flow,value)).status>=400);assert.ok((await decide(old.receipt)).status>=400);
  const current=await acquire(second);assert.equal(decodeJwt(current.receipt).tenant_id,second);
  await prepare(first);await activate();assert.ok((await decide(old.receipt)).status>=400);assert.ok((await exchange(flow,value)).status>=400);
 });
 await t.test('Domain concurrency: independent remap commits before redemption snapshot; code consumption rolls back',async()=>{
  const flow=await start(),value=await code(flow);
  let signal,resume;const arrived=new Promise(r=>signal=r),release=new Promise(r=>resume=r);
  const paused={...nexus,within:async(cap,work)=>{signal();await release;return nexus.within(cap,work);}};
  const local=createAdmissionHandler({...http,service:createAdmissionService({...opts,nexus:paused})},'redemptions');
  const pending=exchange(flow,value,local);await arrived;await prepare(second);await activate();resume();
  assert.ok((await pending).status>=400);
  assert.equal((await pool.query('SELECT consumed_at FROM identity_admission_transactions WHERE id=$1',[flow.id])).rows[0].consumed_at,null);
  await prepare(first);await activate();
 });
 await t.test('Domain concurrency: redemption locks binding; waiting remap invalidates subsequent online decision',async()=>{
  const flow=await start(),value=await code(flow);let signal,resume;
  const arrived=new Promise(r=>signal=r),release=new Promise(r=>resume=r);
  const delayed=createAdmissionService({...opts,sign:async(...args)=>{signal();await release;return opts.sign(...args);}});
  const local=createAdmissionHandler({...http,service:delayed},'redemptions');
  const pending=exchange(flow,value,local);await arrived;
  let committed=false;const mapping=prepare(second).then(r=>{committed=true;return r;});
  let observedWait=false;
  for(let i=0;i<50;i++){
    const wait=await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO nexus_tenant_domains%'");
    if(wait.rowCount){observedWait=true;break;}await new Promise(r=>setTimeout(r,5));
  }
  const premature=committed;resume();
  const response=await pending;assert.equal(response.status,200,JSON.stringify(response.body));await mapping;
  assert.equal(premature,false);assert.equal(observedWait,true,'independent writer must actually wait on the binding lock');await activate();
  assert.ok((await decide(response.body.admission_context)).status>=400);await prepare(first);await activate();
 });
 await t.test('Domain decisions: membership/entitlement/tenant/client revocation, expiry and outages fail closed',async()=>{
  for(const [sql,restore,params]of [
   ["UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2","UPDATE nexus_tenant_memberships SET status='active' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]],
   ['UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2','UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[first,app]],
   ["UPDATE nexus_tenants SET status='suspended' WHERE id=$1","UPDATE nexus_tenants SET status='active' WHERE id=$1",[first]],
   ['UPDATE "oauthClient" SET disabled=true WHERE "clientId"=$1','UPDATE "oauthClient" SET disabled=false WHERE "clientId"=$1',[client.client_id]],
  ]){
   const fresh=await acquire();
   assert.equal((await decide(fresh.receipt)).body.allowed,true);
   await pool.query(sql,params);try{const r=await decide(fresh.receipt);assert.ok(r.status>=400||r.body.allowed===false);}finally{await pool.query(restore,params);}
   if(!sql.includes('oauthClient'))assert.ok((await decide(fresh.receipt)).body.allowed!==true);
  }
  const active=await acquire();
  const auditBefore=(await pool.query('SELECT count(*)::int n FROM nexus_consumer_audit')).rows[0].n;
  await pool.query(`CREATE FUNCTION fail_domain_decision_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
    CREATE TRIGGER fail_domain_decision_audit BEFORE INSERT ON nexus_consumer_audit FOR EACH ROW EXECUTE FUNCTION fail_domain_decision_audit()`);
  try{assert.equal((await decide(active.receipt)).status,503);}finally{await pool.query('DROP TRIGGER fail_domain_decision_audit ON nexus_consumer_audit;DROP FUNCTION fail_domain_decision_audit()');}
  assert.equal((await pool.query('SELECT count(*)::int n FROM nexus_consumer_audit')).rows[0].n,auditBefore);
  assert.equal((await decide(active.receipt)).body.allowed,true);
  const now=Math.floor(Date.now()/1000),claims=decodeJwt(active.receipt),expired=await opts.sign({...claims,iat:now-301,exp:now-1,auth_time:Math.min(claims.auth_time,now-400)},decodeProtectedHeader(active.receipt).kid);
  await assert.rejects(verifyAdmissionContext(expired,opts.jwks,await expected(active.flow)));
  await pool.query('ALTER TABLE nexus_domain_epochs RENAME TO domain_epochs_outage');
  try{assert.ok((await attempt()).r.status>=400);}finally{await pool.query('ALTER TABLE domain_epochs_outage RENAME TO nexus_domain_epochs');}
  const bad=createAdmissionService({...opts,consumer:{run:async()=>{throw Error('synthetic unavailable');}}});assert.equal((await decide(active.receipt,{},makeDecision(bad))).status,503);
  await integration.registry.revokeToken(decodeJwt(access).jti,f.actor());assert.ok((await decide(active.receipt)).status>=400);
  const renewed=await f.redeem(await f.authorizeCode(login.headers));assert.equal(renewed.status,200);access=renewed.body.access_token;
  assert.ok((await decide(active.receipt)).status>=400);
 });
 await t.test('Domain rollback: audit failure rolls back mapping and epoch; removal/recreation preserves tombstone',async()=>{
  const row=await inspect();
  await pool.query(`CREATE FUNCTION fail_domain_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
    CREATE TRIGGER fail_domain_audit BEFORE INSERT ON nexus_domain_binding_audit FOR EACH ROW EXECUTE FUNCTION fail_domain_audit()`);
  try{await assert.rejects(prepare(second));}finally{await pool.query('DROP TRIGGER fail_domain_audit ON nexus_domain_binding_audit;DROP FUNCTION fail_domain_audit()');}
  assert.equal((await inspect()).revision,row.revision);
  const active=await acquire();await pool.query('DELETE FROM nexus_tenant_domains WHERE hostname=$1',[hostname]);
  assert.ok((await decide(active.receipt)).status>=400);const tombstone=await inspect();assert.equal(tombstone.hostname,null);assert.ok(BigInt(tombstone.revision)>BigInt(row.revision));
  const recreated=await prepare(first);assert.ok(BigInt(recreated.revision)>BigInt(tombstone.revision));await activate();assert.ok((await decide(active.receipt)).status>=400);
  await mode('choice');
  assert.deepEqual((await pool.query('SELECT * FROM "oauthClient" ORDER BY "clientId"')).rows,clientsBefore);
  assert.deepEqual((await pool.query('SELECT id,"publicKey" FROM jwks ORDER BY id')).rows,keysBefore);
 });
}
