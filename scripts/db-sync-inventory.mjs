/** IS-DB-SYNC#0001: local-only read-only inventory. Never runs migrations or bootstrap. */
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline='354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let db,stage='source';process.umask(0o077);
try{
 assert.equal(process.versions.node.split('.')[0],'24');
 assert.deepEqual(process.argv.slice(2),['--local']);
 const source=[];const requiredTables=new Set(),requiredTriggers=new Set();
 for(const name of (await readdir(root+'db/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort()){
  const bytes=await readFile(root+'db/migrations/'+name);
  assert(bytes.equals(execFileSync('git',['show',baseline+':db/migrations/'+name],{cwd:root,stdio:['ignore','pipe','ignore']})),'Migration differs from reviewed release candidate');
  source.push({name,sha256:hash(bytes)});
  const sql=bytes.toString();
  for(const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g))requiredTables.add(match[1]);
  for(const match of sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+)/g))requiredTriggers.add(match[1]);
 }
 assert.deepEqual(source.map(r=>Number(r.name.slice(0,4))),[1,2,3,4,6,7,8,9,10,11,12]);
 stage='local configuration';
 // Read only this explicitly selected Development file. Never use inherited DATABASE_URL.
 const env=parseEnv(await readFile(root+'.env.development.local','utf8'));
 const url=new URL(env.DATABASE_URL);
 assert(['postgres:','postgresql:'].includes(url.protocol));
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port||'5432','5432');
 assert.equal(url.pathname,'/is_dev');assert.equal(decodeURIComponent(url.username),'is_dev');
 assert(!url.hash);assert([...url.searchParams.keys()].every(k=>k==='sslmode'));
 const config={host:'127.0.0.1',port:5432,database:'is_dev',user:'is_dev',password:decodeURIComponent(url.password),ssl:false,connectionTimeoutMillis:4000,
  options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=20000'};
 db=new pg.Client(config);stage='read-only connection';await db.connect();
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const target=(await db.query("SELECT current_database() database,current_user role,session_user login_role,host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version') version,current_setting('transaction_read_only') read_only,pg_is_in_recovery() standby")).rows[0];
 assert.equal(target.database,'is_dev');assert.equal(target.role,'is_dev');assert.equal(target.host,'127.0.0.1');assert.equal(target.port,5432);assert.equal(target.read_only,'on');assert.equal(target.standby,false);
 stage='inventory';
 const tables=(await db.query("SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const tableNames=new Set(tables.map(t=>t.tablename));
 const ledger=tableNames.has('is_schema_migrations')?(await db.query('SELECT name,sha256,applied_at FROM is_schema_migrations ORDER BY name')).rows:[];
 const classifications=source.map(m=>{const a=ledger.find(r=>r.name===m.name);return {...m,state:!a?'pending':a.sha256===m.sha256?'matching':'checksum_mismatch'};});
 const unexpected=ledger.filter(r=>!source.some(m=>m.name===r.name));
 let pending=false,outOfOrder=false;for(const m of classifications){if(m.state==='pending')pending=true;else if(pending)outOfOrder=true;}
 const counts={};for(const table of tables){const quoted='"'+table.tablename.replaceAll('"','""')+'"';counts[table.tablename]=(await db.query('SELECT count(*)::text count FROM '+quoted)).rows[0].count;}
 const columns=(await db.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const constraints=(await db.query("SELECT c.relname table_name,k.conname name,k.contype type,k.convalidated validated,md5(pg_get_constraintdef(k.oid)) definition_digest FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE k.connamespace='public'::regnamespace ORDER BY c.relname,k.conname")).rows;
 const triggers=(await db.query("SELECT c.relname table_name,t.tgname name,t.tgenabled enabled,md5(pg_get_triggerdef(t.oid)) definition_digest FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
 const roles=(await db.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows;
 const grants=(await db.query("SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee=current_user ORDER BY table_name,privilege_type")).rows;
 const invariant=tableNames.has('nexus_tenant_membership_governance')&&tableNames.has('nexus_tenant_memberships')?(await db.query("SELECT count(*)::text invalid FROM nexus_tenant_membership_governance g WHERE g.active_admin_count<1 OR g.active_admin_count<>(SELECT count(*) FROM nexus_tenant_memberships m WHERE m.tenant_id=g.tenant_id AND m.status='active' AND m.role IN ('owner','admin'))")).rows[0]:null;
 const missingTables=[...requiredTables].filter(n=>!tableNames.has(n));
 const missingTriggers=[...requiredTriggers].filter(n=>!triggers.some(t=>t.name===n&&t.enabled==='O'));
 const purpose=columns.some(c=>c.table_name==='nexus_application_oauth_clients'&&c.column_name==='purpose');
 const flags=Object.fromEntries(['IS_ADMISSION_ENABLED','IS_ADMISSION_CLIENT_IDS','IDENTITY_NEXUS_CREDENTIALS_ENABLED','NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED'].map(k=>[k,env[k]===undefined?'unset':k.endsWith('CLIENT_IDS')?'configured (redacted)':env[k]==='true'?'true':env[k]==='false'?'false':'other']));
 const report={at:new Date().toISOString(),mode:'read-only local inventory',baseline,target,source,classifications,ledger,unexpected,outOfOrder,ledgerMissing:!tableNames.has('is_schema_migrations'),counts,roles,grants,columns,constraints,triggers,invariant,missingTables,missingTriggers,purpose,flags,
  proposedAdmissionTables:tables.filter(t=>t.tablename==='identity_admissions'||t.tablename.startsWith('identity_admission_')).map(t=>t.tablename),
  scope:'Catalog inventory and minimum structural checks only; complete schema equivalence and live OAuth compatibility require isolated rehearsal. No backup or migration performed.'};
 await db.query('ROLLBACK');
 const folder=root+'.local-recovery/is-db-sync-0001';await mkdir(folder,{recursive:true,mode:0o700});
 await writeFile(folder+'/.gitignore','*\n',{mode:0o600});
 await writeFile(folder+'/development-inventory.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({target,matching:classifications.filter(m=>m.state==='matching').length,pending:classifications.filter(m=>m.state==='pending').map(m=>m.name),mismatches:classifications.filter(m=>m.state==='checksum_mismatch').map(m=>m.name),unexpected:unexpected.map(m=>m.name),outOfOrder,missingTables,missingTriggers,invariant,purpose,receipt:'.local-recovery/is-db-sync-0001/development-inventory.json'},null,2));
}catch(error){console.error(JSON.stringify({error:'inventory_stopped',stage,code:typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'CHECK_FAILED'}));process.exitCode=1;}
finally{if(db)await db.end().catch(()=>{});}
