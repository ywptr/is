// Release rehearsal only: every database/role/backup below is synthetic and disposable.
// Never loads .env files or reads the application's DATABASE_URL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,copyFile,symlink,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {jwt,testUtils} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import {getMigrations} from 'better-auth/db/migration';
const run=promisify(execFile),root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const migration='0011_identity_credential_administration.sql';
const reviewed='7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('0011: exact runner, fresh/populated non-superuser ownership and backup/restore', {timeout:120000},async t=>{
 assert.equal(Number(process.versions.node.split('.')[0]),24);
 const bin=process.env.IS_MEMBERSHIP_PG_BIN;assert(bin,'Explicit PostgreSQL binary directory required');
 assert.equal(hash(await readFile(join(root,'db/migrations',migration))),reviewed);
 const directory=await mkdtemp(join(tmpdir(),'is0001c-migration-')),socket=join(directory,'socket'),data=join(directory,'data'),workspace=join(directory,'source');
 await mkdir(socket);await mkdir(join(workspace,'scripts'),{recursive:true});await mkdir(join(workspace,'src/lib'),{recursive:true});await mkdir(join(workspace,'db/migrations'),{recursive:true});
 await copyFile(join(root,'scripts/migrate-app.mjs'),join(workspace,'scripts/migrate-app.mjs'));
 await copyFile(join(root,'src/lib/verified-database-url.mjs'),join(workspace,'src/lib/verified-database-url.mjs'));
 await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
 const names=(await readdir(join(root,'db/migrations'))).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();assert.equal(names.at(-1),migration);
 for(const name of names.slice(0,-1))await copyFile(join(root,'db/migrations',name),join(workspace,'db/migrations',name));
 let started=false;const pools=[];
 const config={host:socket,port:55448,user:'fixture_bootstrap',database:'postgres'};
 const bootstrap=new pg.Client(config);
 t.after(async()=>{await Promise.all(pools.map(p=>p.end()));await bootstrap.end().catch(()=>{});if(started)await run(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);await rm(directory,{recursive:true,force:true});});
 await run(join(bin,'initdb'),['-D',data,'-U',config.user,'--auth=trust','--no-locale']);
 await run(join(bin,'pg_ctl'),['-D',data,'-l',join(directory,'postgres.log'),'-o',`-F -h '' -k ${socket} -p 55448`,'-w','start']);started=true;await bootstrap.connect();
 await bootstrap.query('CREATE ROLE is_fixture_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 await bootstrap.query('CREATE ROLE is_fixture_untrusted LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 for(const name of ['populated','fresh','restored'])await bootstrap.query(`CREATE DATABASE ${name} OWNER is_fixture_owner`);
 const connect=database=>{const pool=new pg.Pool({...config,user:'is_fixture_owner',database,max:4});pools.push(pool);return pool;};
 const populated=connect('populated'),fresh=connect('fresh'),restored=connect('restored');
 const makeAuth=database=>betterAuth({baseURL:'https://migration-fixture.example.test',secret:'synthetic-migration-fixture-secret-0000000000000000',database,emailAndPassword:{enabled:false},logger:{disabled:true},rateLimit:{enabled:false},plugins:[jwt({disableSettingJwtHeader:true}),testUtils(),oauthProvider({loginPage:'/sign-in',consentPage:'/consent',clientPrivileges:async()=>true,allowDynamicClientRegistration:false,allowUnauthenticatedClientRegistration:false})]});
 const auth=makeAuth(populated);await (await getMigrations(auth.options)).runMigrations();
 const freshAuth=makeAuth(fresh);await (await getMigrations(freshAuth.options)).runMigrations();
 const migrate=async database=>{
  const url=new URL(`postgresql://is_fixture_owner@localhost:55448/${database}`);url.searchParams.set('host',socket);
  const result=await run(process.execPath,[join(workspace,'scripts/migrate-app.mjs')],{cwd:workspace,env:{...process.env,DATABASE_URL:url.href,NODE_ENV:'development',IS_DATABASE_SSLMODE:'disable',PGOPTIONS:'-c lock_timeout=2s -c statement_timeout=10000'}});
  return result.stdout;
 };
 await migrate('populated');
 const context=await auth.$context,user=await context.test.saveUser(context.test.createUser({email:'retained@example.test',emailVerified:true}));
 const login=await context.test.login({userId:user.id});
 const client=await auth.api.adminCreateOAuthClient({headers:login.headers,body:{client_name:'Existing human OIDC fixture',redirect_uris:['https://consumer-fixture.example.test/callback'],grant_types:['authorization_code'],response_types:['code'],scope:'openid profile email',require_pkce:true,skip_consent:false,token_endpoint_auth_method:'client_secret_basic'}});
 await populated.query('INSERT INTO is_administrators(user_id) VALUES($1)',[user.id]);await populated.query('INSERT INTO nexus_operators(user_id) VALUES($1)',[user.id]);
 const tenant=randomUUID();await populated.query("INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,'retained','Retained')",[tenant]);
 await populated.query('BEGIN');
 await populated.query('INSERT INTO nexus_tenant_membership_governance(tenant_id,active_admin_count) VALUES($1,0)',[tenant]);
 await populated.query("INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by) VALUES($1,$2,'admin','active',$2,$2)",[tenant,user.id]);await populated.query('COMMIT');
 const snapshot=async pool=>{
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  const result={};for(const name of tables){const quoted='"'+name.replaceAll('"','""')+'"';const r=(await pool.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(v, E'\\n' ORDER BY v),'')) AS digest FROM (SELECT to_jsonb(t)::text v FROM ${quoted} t) q`)).rows[0];result[name]=r;}return result;
 };
 const before=await snapshot(populated);
 const catalog=async pool=>(await pool.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
 const triggersBefore=await catalog(populated);
 await t.test('synthetic snapshot backup restores all pre-0011 rows before migration',async()=>{
  const backup=join(directory,'synthetic-pre-0011.dump');
  await run(join(bin,'pg_dump'),['-h',socket,'-p','55448','-U','is_fixture_owner','-d','populated','--format=custom','--file',backup]);
  const digest=hash(await readFile(backup));assert((await stat(backup)).size>0);
  await run(join(bin,'pg_restore'),['-h',socket,'-p','55448','-U','is_fixture_owner','-d','restored','--exit-on-error','--no-owner','--no-privileges',backup]);
  assert.deepEqual(await snapshot(restored),before);assert.equal(hash(await readFile(backup)),digest);
 });
 await copyFile(join(root,'db/migrations',migration),join(workspace,'db/migrations',migration));
 await t.test('fresh and restored/populated runner apply only ordered reviewed SQL, preserve rows and no-op rerun',async()=>{
  const output=await migrate('populated');assert(output.includes('Migrated: '+migration));
  await migrate('fresh');await migrate('restored');
  for(const pool of [populated,restored]){
   const after=await snapshot(pool);for(const [table,value] of Object.entries(before))if(table!=='is_schema_migrations')assert.deepEqual(after[table],value,table);
   assert.equal(after.identity_credential_administration.rows,0);assert.deepEqual(await catalog(pool),triggersBefore);
  }
  const after=await snapshot(populated);assert(!(await migrate('populated')).includes('Migrated:'));assert.deepEqual(await snapshot(populated),after);
  const ledger=(await populated.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows;assert.deepEqual(ledger.map(r=>r.name),names);assert.equal(ledger.at(-1).sha256,reviewed);
  assert.equal((await fresh.query('SELECT count(*)::int n FROM "oauthClient"')).rows[0].n,0);
  assert.equal((await populated.query('SELECT "clientId" FROM "oauthClient" WHERE "clientId"=$1',[client.client_id])).rowCount,1);
  assert.equal((await auth.api.getSession({headers:login.headers})).user.id,user.id);
 });
 await t.test('journal ownership, default grants, restrictive FK, duplicate and audit checks; original last-admin/operator guards',async()=>{
  const record=(await populated.query("SELECT pg_get_userbyid(relowner) owner FROM pg_class WHERE oid='identity_credential_administration'::regclass")).rows[0];assert.equal(record.owner,'is_fixture_owner');
  const other=new pg.Client({...config,user:'is_fixture_untrusted',database:'populated'});await other.connect();
  try{await assert.rejects(other.query('SELECT * FROM identity_credential_administration'),e=>e.code==='42501');await assert.rejects(other.query("INSERT INTO identity_credential_administration DEFAULT VALUES"),e=>e.code==='42501');}finally{await other.end();}
  const request=randomUUID(),parameters=[request,user.id,'https://migration-fixture.example.test/api/auth','a'.repeat(64)];
  const insert="INSERT INTO identity_credential_administration(request_id,actor_id,issuer,environment,action,payload_digest,reason) VALUES($1,$2,$3,'development','resource',$4,'reviewed synthetic fixture')";
  await populated.query(insert,parameters);await assert.rejects(populated.query(insert,parameters),e=>e.code==='23505');
  await assert.rejects(populated.query(insert,[randomUUID(),'absent',parameters[2],parameters[3]]),e=>e.code==='23503');
  for(const [column,value] of [['environment','production'],['action','unreviewed'],['state','unknown'],['payload_digest','not-a-digest'],['issuer','http://unsafe'],['reason','']])await assert.rejects(populated.query(`UPDATE identity_credential_administration SET ${column}=$1 WHERE request_id=$2`,[value,request]),e=>e.code==='23514');
  await assert.rejects(populated.query('DELETE FROM "user" WHERE id=$1',[user.id]),e=>e.code==='23503');
  await assert.rejects(populated.query('DELETE FROM nexus_operators WHERE user_id=$1',[user.id]),e=>e.code==='23514');
  await assert.rejects(populated.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[tenant,user.id]),e=>e.code==='23514');
  assert.equal((await populated.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' AND NOT convalidated")).rows[0].n,0);
 });
});
