/** Authorized local read-only backup + socket-only restore/rehearsal. Never migrates is_dev. */
import assert from 'node:assert/strict';import pg from 'pg';
import {readFile,writeFile,lstat,realpath,mkdtemp,mkdir,chmod,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {localConfig,connectLocal,digests,verifyBefore,verifyAfter,root,revision,sha,gates} from './is0012-local.mjs';
const run=promisify(execFile),bin='/usr/lib/postgresql/17/bin',base='/home/user/backups/is_dev';
let original,bootstrap,recovery,dir,started=false,stage='configuration';
process.umask(0o077);
try{
 const config=await localConfig(),st=await lstat(base);assert(st.isDirectory()&&!st.isSymbolicLink());assert.equal(st.uid,process.getuid());assert.equal(st.mode&0o077,0);assert.equal(await realpath(base),base);
 const archive=base+'/pre-0012-'+new Date().toISOString().replaceAll(':','-')+'.dump',manifestPath=archive+'.manifest.json';
 const manifest={createdAt:new Date().toISOString(),archive,source:config.source,environmentHash:config.environmentHash,gates:gates(),restoreVerified:false,rehearsalVerified:false};
 original=connectLocal(config);await original.connect();await original.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'");
 stage='read-only preflight';manifest.target=await verifyBefore(original,config.source);manifest.ledger=(await original.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows;manifest.tables=await digests(original);assert.equal(Object.keys(manifest.tables).length,46);
 const snapshot=(await original.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
 stage='private dump';await run(bin+'/pg_dump',['--format=custom','--snapshot',snapshot,'--file',archive],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'is_dev',PGUSER:'is_dev',PGPASSWORD:config.password,PGSSLMODE:'disable',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000'},maxBuffer:1024*1024});
 await chmod(archive,0o600);manifest.sha256=sha(await readFile(archive));manifest.bytes=(await lstat(archive)).size;assert(manifest.bytes>0);await run(bin+'/pg_restore',['--list',archive]);
 await original.query('ROLLBACK');await original.end();original=undefined;
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 stage='isolated restore';dir=await mkdtemp('/tmp/is0012-restore-');await chmod(dir,0o700);await mkdir(dir+'/socket',{mode:0o700});
 const clean={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',PGHOST:dir+'/socket',PGPORT:'55459',PGUSER:'restore_bootstrap',PGDATABASE:'postgres',PGSSLMODE:'disable'};
 await run(bin+'/initdb',['-D',dir+'/data','-U','restore_bootstrap','--auth=trust','--no-locale'],{env:clean,maxBuffer:1024*1024});
 await run(bin+'/pg_ctl',['-D',dir+'/data','-l',dir+'/postgres.log','-o',`-F -h '' -k ${dir}/socket -p 55459`,'-w','start'],{env:clean});started=true;
 bootstrap=new pg.Client({host:dir+'/socket',port:55459,user:'restore_bootstrap',database:'postgres'});await bootstrap.connect();
 await bootstrap.query('CREATE ROLE is_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');await bootstrap.query('CREATE DATABASE recovered_is_dev OWNER is_dev');
 await run(bin+'/pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname','recovered_is_dev',archive],{env:{...clean,PGUSER:'is_dev'},maxBuffer:1024*1024});
 recovery=new pg.Client({host:dir+'/socket',port:55459,user:'is_dev',database:'recovered_is_dev'});await recovery.connect();await recovery.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'");
 assert.deepEqual(await digests(recovery),manifest.tables);await recovery.query('ROLLBACK');manifest.restoreVerified=true;
 stage='restored-data migration rehearsal';await recovery.query("BEGIN; SET LOCAL TIME ZONE 'UTC'; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'");
 const sql=await readFile(root+'/db/migrations/'+revision,'utf8');assert.equal(sha(sql),config.source.at(-1).sha256);
 await recovery.query(sql);await recovery.query('INSERT INTO is_schema_migrations(name,sha256) VALUES($1,$2)',[revision,sha(sql)]);
 manifest.rehearsal=await verifyAfter(recovery,config.source,manifest.tables);await recovery.query('COMMIT');
 // Previous application projections continue to read the preserved association.
 const old=(await recovery.query('SELECT application_id,environment,oauth_client_id,redirect_uris FROM nexus_application_oauth_clients')).rows;
 assert.equal(old.length,1);assert.equal(old[0].oauth_client_id,'kDCIzSZuiYusmlOPHBDcDVDMflpKiisb');
 await recovery.query('BEGIN');const actor=(await recovery.query('SELECT created_by FROM nexus_application_oauth_clients')).rows[0].created_by;
 await recovery.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by,purpose) VALUES($1,'development','is0012-synthetic-consumer','[]',$2,'nexus_consumer')`,[old[0].application_id,actor]);
 await recovery.query('SAVEPOINT duplicate');
 await assert.rejects(recovery.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by,purpose) VALUES($1,'development','is0012-synthetic-duplicate','[]',$2,'nexus_consumer')`,[old[0].application_id,actor]),e=>e.code==='23505');await recovery.query('ROLLBACK TO SAVEPOINT duplicate');
 await recovery.query('SAVEPOINT oidc_duplicate');
 await assert.rejects(recovery.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by) VALUES($1,'development','is0012-synthetic-oidc','[]',$2)`,[old[0].application_id,actor]),e=>e.code==='23505');await recovery.query('ROLLBACK TO SAVEPOINT oidc_duplicate');await recovery.query('ROLLBACK');
 manifest.rehearsalVerified=true;manifest.previousApplicationProjectionVerified=true;manifest.purposeCoexistenceAndDuplicateDenialVerified=true;manifest.restoreAt=new Date().toISOString();manifest.restoreRole='ordinary is_dev; no-owner/no-privileges restore in private socket-only cluster';
 assert.equal(sha(await readFile(archive)),manifest.sha256);assert.equal((await lstat(archive)).mode&0o077,0);
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 const receipt={at:manifest.restoreAt,archive,manifest:manifestPath,sha256:manifest.sha256,bytes:manifest.bytes,mode:'0600',restoreVerified:true,rehearsalVerified:true,matchedTables:46,previousApplicationProjectionVerified:true,purposeCoexistenceAndDuplicateDenialVerified:true,migration:config.source.at(-1),liveWrites:false};
 await writeFile('/tmp/is0012-backup-rehearsal.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt,null,2));
}catch(e){console.error('0012 backup/rehearsal stopped',{stage,code:e.code??e.name});process.exitCode=1;}
finally{if(original)await original.end().catch(()=>{});if(recovery)await recovery.end().catch(()=>{});if(bootstrap)await bootstrap.end().catch(()=>{});if(started)await run(bin+'/pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);if(dir)await rm(dir,{recursive:true,force:true});}
