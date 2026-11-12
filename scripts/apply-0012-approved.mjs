/** MUTATING. Run only after explicit approval of 0012 SHA and the exact local backup receipt. */
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {dirname} from 'node:path';
import {localConfig,connectLocal,verifyBefore,verifyAfter,digests,sha,root,revision,gates} from './is0012-local.mjs';
let db,committed=false,stage='approval arguments';
try{
 assert.equal(process.argv.length,5);assert.equal(process.argv[2],'--apply-reviewed-0012');assert.equal(process.argv[3],'--backup-manifest');
 const path=process.argv[4];assert.equal(dirname(path),'/home/user/backups/is_dev');assert(path.endsWith('.dump.manifest.json'));assert.equal(await realpath(path),path);
 const stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.uid,process.getuid());assert.equal(stat.mode&0o077,0);
 const backup=JSON.parse(await readFile(path,'utf8')),config=await localConfig();
 assert.equal(backup.restoreVerified,true);assert.equal(backup.rehearsalVerified,true);assert.equal(backup.previousApplicationProjectionVerified,true);assert.equal(backup.purposeCoexistenceAndDuplicateDenialVerified,true);
 assert(Date.now()-Date.parse(backup.restoreAt)>=0&&Date.now()-Date.parse(backup.restoreAt)<6*60*60*1000);
 assert.deepEqual(backup.source,config.source);assert.equal(backup.environmentHash,config.environmentHash);assert.deepEqual(backup.gates,gates());
 assert.equal(backup.archive+'.manifest.json',path);assert.equal(await realpath(backup.archive),backup.archive);
 const archiveStat=await lstat(backup.archive);assert(archiveStat.isFile()&&!archiveStat.isSymbolicLink());assert.equal(archiveStat.uid,process.getuid());assert.equal(archiveStat.mode&0o077,0);assert.equal(sha(await readFile(backup.archive)),backup.sha256);
 stage='exact-target and ledger guard';db=connectLocal(config);await db.connect();
 await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL TIME ZONE 'UTC'; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'");
 // Same lock key as the application migration runner; no runner/bootstrap is invoked.
 assert.equal((await db.query('SELECT pg_try_advisory_xact_lock(83792421) acquired')).rows[0].acquired,true);
 assert.deepEqual(await verifyBefore(db,config.source),backup.target);
 await db.query('LOCK TABLE nexus_application_oauth_clients,"oauthClient" IN SHARE ROW EXCLUSIVE MODE');
 const before=await digests(db);
 for(const table of ['oauthClient','oauthResource','oauthClientResource','nexus_applications','nexus_application_oauth_clients','identity_credential_bindings','identity_credential_administration','nexus_registry_audit','is_schema_migrations'])assert.deepEqual(before[table],backup.tables[table]);
 stage='0012 transaction';const sql=await readFile(root+'/db/migrations/'+revision,'utf8');assert.equal(sha(sql),config.source.at(-1).sha256);
 await db.query(sql);await db.query('INSERT INTO is_schema_migrations(name,sha256) VALUES($1,$2)',[revision,sha(sql)]);
 const verified=await verifyAfter(db,config.source,before);
 await db.query('COMMIT');committed=true;
 stage='post-commit read-only verification';await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'");
 // Authoritative post-commit checks; do not fail on concurrent normal auth/session activity.
 assert.deepEqual((await db.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows,config.source);
 assert.deepEqual((await db.query('SELECT purpose,oauth_client_id FROM nexus_application_oauth_clients')).rows,[{purpose:'oidc',oauth_client_id:'kDCIzSZuiYusmlOPHBDcDVDMflpKiisb'}]);
 const current=await digests(db,true);for(const table of ['oauthClient','nexus_application_oauth_clients','nexus_registry_audit','nexus_applications','oauthResource','identity_credential_administration'])assert.deepEqual(current[table],before[table]);
 await db.query('ROLLBACK');
 const receipt={at:new Date().toISOString(),target:backup.target,migration:config.source.at(-1),committed:true,...verified,gates:gates(),backupSha256:backup.sha256,oauthProvisioning:false,activation:false};
 await writeFile('/tmp/is0012-post-migration.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt,null,2));
}catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});console.error('0012 approved execution stopped',{stage,committed,code:e.code??e.name});process.exitCode=1;}finally{if(db)await db.end();}
