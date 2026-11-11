// Approved execution must be limited to a private backup of verified local is_dev
// and restore into this script's new Unix-socket-only cluster. No live migrations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir,lstat,realpath,mkdtemp,mkdir,chmod,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const require=createRequire('/home/user/src/is/package.json'),pg=require('pg'),run=promisify(execFile);
assert.equal(process.env.IS0001C_BACKUP_AUTHORIZED,'is_dev:pre-0011','Explicit private backup/restore approval required');
assert.match(process.env.IS0001C_APPROVED_COMMIT??'',/^[0-9a-f]{40}$/,'Exact reviewed checkpoint required');
const checkpoint=(await run('git',['rev-parse','HEAD'],{cwd:'/home/user/src/is'})).stdout.trim();
assert.equal(checkpoint,process.env.IS0001C_APPROVED_COMMIT);
assert.equal((await run('git',['status','--porcelain'],{cwd:'/home/user/src/is'})).stdout.trim(),'','Clean reviewed checkpoint required');
require('@next/env').loadEnvConfig('/home/user/src/is',true,{info(){},error(){}});
assert.equal(process.versions.node.split('.')[0],'24');
const base='/home/user/backups/is_dev',bin='/usr/lib/postgresql/17/bin',root='/home/user/src/is';
const st=await lstat(base);assert(st.isDirectory()&&!st.isSymbolicLink());assert.equal(st.uid,process.getuid());assert.equal(st.mode&0o077,0);assert.equal(await realpath(base),base);
for(const gate of ['NEXUS_OAUTH_ADMIN_ENABLED','IDENTITY_NEXUS_CREDENTIALS_ENABLED','NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED'])assert.notEqual(process.env[gate],'true');
const u=new URL(process.env.DATABASE_URL);assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port||'5432','5432');assert.equal(u.pathname,'/is_dev');assert.equal(decodeURIComponent(u.username),'is_dev');
const reviewed='7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=(await readdir(join(root,'db/migrations'))).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();assert.equal(names.at(-1),'0011_identity_credential_administration.sql');
const source=[];for(const name of names)source.push({name,sha256:sha(await readFile(join(root,'db/migrations',name)))});assert.equal(source.at(-1).sha256,reviewed);
const stamp=new Date().toISOString().replaceAll(':','-'),file=join(base,'pre-0011-'+stamp+'.dump'),manifestPath=file+'.manifest.json';
process.umask(0o077);
const manifest={createdAt:new Date().toISOString(),checkpoint,source,archive:file,restoreVerified:false};
const original=new pg.Client({host:'127.0.0.1',port:5432,database:'is_dev',user:'is_dev',password:decodeURIComponent(u.password),ssl:false,connectionTimeoutMillis:3000,options:'-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=1000'});
let directory,started=false,bootstrap,recovery;
const snapshot=async db=>{
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename),result={};
 for(const table of tables){const name='"'+table.replaceAll('"','""')+'"';result[table]=(await db.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(v,E'\\n' ORDER BY v COLLATE "C"),'')) digest FROM (SELECT to_jsonb(t)::text v FROM ${name} t) q`)).rows[0];}
 return result;
};
try{
 await original.connect();await original.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'");
 manifest.target=(await original.query("SELECT current_database() db,current_user role,host(inet_server_addr()) host,inet_server_port() port,pg_is_in_recovery() standby,current_setting('transaction_read_only') read_only")).rows[0];assert.deepEqual(manifest.target,{db:'is_dev',role:'is_dev',host:'127.0.0.1',port:5432,standby:false,read_only:'on'});
 manifest.ledger=(await original.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows;assert.deepEqual(manifest.ledger,source.slice(0,-1));
 assert.equal((await original.query("SELECT to_regclass('public.identity_credential_administration') present")).rows[0].present,null);
 const exported=(await original.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
 manifest.tables=await snapshot(original);
 const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'is_dev',PGUSER:'is_dev',PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'disable',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000'};
 await run(join(bin,'pg_dump'),['--format=custom','--snapshot',exported,'--file',file],{env});
 await chmod(file,0o600);manifest.sha256=sha(await readFile(file));manifest.bytes=(await lstat(file)).size;
 await original.query('ROLLBACK');await original.end();
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 directory=await mkdtemp(join(tmpdir(),'is0001c-private-restore-'));await chmod(directory,0o700);const socket=join(directory,'socket'),data=join(directory,'data');await mkdir(socket,{mode:0o700});
 await run(join(bin,'initdb'),['-D',data,'-U','restore_bootstrap','--auth=trust','--no-locale']);
 await run(join(bin,'pg_ctl'),['-D',data,'-l',join(directory,'postgres.log'),'-o',`-F -h '' -k ${socket} -p 55449`,'-w','start']);started=true;
 const config={host:socket,port:55449,user:'restore_bootstrap',database:'postgres'};bootstrap=new pg.Client(config);await bootstrap.connect();
 await bootstrap.query('CREATE ROLE is_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');await bootstrap.query('CREATE DATABASE recovered_is_dev OWNER is_dev');
 const recoveryEnv={...process.env,PGHOST:socket,PGPORT:'55449',PGDATABASE:'recovered_is_dev',PGUSER:'is_dev',PGPASSWORD:'',PGSSLMODE:'disable',PGOPTIONS:'-c statement_timeout=30000'};
 await run(join(bin,'pg_restore'),['--exit-on-error','--no-owner','--no-privileges','--dbname','recovered_is_dev',file],{env:recoveryEnv});
 recovery=new pg.Client({...config,user:'is_dev',database:'recovered_is_dev'});await recovery.connect();await recovery.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'");
 assert.deepEqual(await snapshot(recovery),manifest.tables);
 const invalid=(await recovery.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' AND NOT convalidated")).rows[0].n;assert.equal(invalid,0);
 assert.equal(sha(await readFile(file)),manifest.sha256);
 manifest.restoreVerified=true;manifest.restoreAt=new Date().toISOString();manifest.restoredTableCount=Object.keys(manifest.tables).length;manifest.unvalidatedForeignKeys=invalid;manifest.restoreRole='ordinary is_dev; ownership/ACL replay omitted';
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({archive:file,manifest:manifestPath,sha256:manifest.sha256,bytes:manifest.bytes,createdAt:manifest.createdAt,restoreVerified:true,matchedTables:manifest.restoredTableCount,unvalidatedForeignKeys:invalid,liveDatabaseWrites:false,migrationsApplied:false},null,2));
}catch(e){console.error('Private backup/recovery acceptance failed:',e.code??e.name,'; preserve any archive and inspect privately.');process.exitCode=1;}
finally{
 await original.end().catch(()=>{});if(recovery)await recovery.end().catch(()=>{});if(bootstrap)await bootstrap.end().catch(()=>{});
 if(started)await run(join(bin,'pg_ctl'),['-D',join(directory,'data'),'-m','immediate','-w','stop']);
 if(directory)await rm(directory,{recursive:true,force:true});
}
