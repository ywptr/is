# IS#0001-E — Exact migration 0011 command pending approval

**NOT EXECUTED.** The next mutation is only `0011_identity_credential_administration.sql` on verified local `127.0.0.1:5432/is_dev`, role `is_dev`. No registration, grant or gate change accompanies it. Read [current readiness](IS-0001E-SANDCASTLE-PROVISIONING-READINESS.md) first.

The reviewed SQL SHA-256 is `7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264`. E's fresh populated/fresh/restored synthetic runner rehearsal passed all four tests. The real pre-0011 archive remains recoverable and matches all 45 current live table digests; its SHA-256 is `43d6b1086cab1dfd387dba323da8c290dd85c4910fb96342cbdf2bc27c46fdd8`.

**Checkpoint prerequisite:** HEAD is currently `aaa74d7`, with preserved uncommitted D TLS changes and new E preparation files. Review/checkpoint the intended D/E files before execution. Do not reset, clean or silently include unrelated work. Replace the placeholder below with that exact reviewed clean checkpoint SHA. The guard deliberately refuses a dirty tree; setting acknowledgement variables does not constitute authorization.

The command below is byte-for-byte the previously reviewed C guarded block. It checks the exact branch/checkpoint, protected backup/restore manifest and archive hash, all SQL hashes, target identity/read-only ledger, missing journal and every pre-existing table digest before invoking the existing migration runner. A changed dataset requires reviewed backup refresh; a changed ledger/hash or partial application requires stopping for review. No migration/bootstrap command is used as an inspection shortcut.

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
export IS0001C_APPROVED_COMMIT='<reviewed full IS#0001-C checkpoint SHA>'
export IS0001C_APPLY_AUTHORIZED='is_dev:0011:7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264'
NODE_ENV=development IS_DATABASE_SSLMODE=disable \
node --env-file=.env.development.local --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import pg from 'pg';
try {
 const hash='7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264';
 assert.equal(Number(process.versions.node.split('.')[0]),24);
 assert.equal(process.env.IS0001C_APPLY_AUTHORIZED,'is_dev:0011:'+hash);
 assert.match(process.env.IS0001C_APPROVED_COMMIT??'',/^[0-9a-f]{40}$/);
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),process.env.IS0001C_APPROVED_COMMIT);
 assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'feature/nexus-consumer-runtime');
 assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
 for(const key of ['NEXUS_OAUTH_ADMIN_ENABLED','IDENTITY_NEXUS_CREDENTIALS_ENABLED','NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED'])assert.notEqual(process.env[key],'true');
 const archive='/home/user/backups/is_dev/pre-0011-2026-11-11T07-56-57.543Z.dump';
 for(const path of [archive,archive+'.manifest.json']){const s=await lstat(path);assert(s.isFile()&&!s.isSymbolicLink());assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o077,0);}
 const backup=JSON.parse(await readFile(archive+'.manifest.json','utf8'));
 assert.equal(backup.restoreVerified,true);assert.equal(backup.restoredTableCount,45);assert.equal(backup.unvalidatedForeignKeys,0);
 const archiveHash=createHash('sha256').update(await readFile(archive)).digest('hex');
 assert.equal(archiveHash,'43d6b1086cab1dfd387dba323da8c290dd85c4910fb96342cbdf2bc27c46fdd8');assert.equal(archiveHash,backup.sha256);
 const files=(await readdir('db/migrations')).filter(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
 const source=[];for(const name of files)source.push({name,sha256:createHash('sha256').update(await readFile('db/migrations/'+name)).digest('hex')});
 assert.deepEqual(source,backup.source);assert.equal(source.at(-1).name,'0011_identity_credential_administration.sql');assert.equal(source.at(-1).sha256,hash);
 const u=new URL(process.env.DATABASE_URL);assert.ok(['postgres:','postgresql:'].includes(u.protocol));
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port||'5432','5432');assert.equal(u.pathname,'/is_dev');assert.equal(decodeURIComponent(u.username),'is_dev');
 for(const key of u.searchParams.keys())assert.ok(['sslmode','uselibpqcompat'].includes(key));
 const db=new pg.Client({host:'127.0.0.1',port:5432,database:'is_dev',user:'is_dev',password:decodeURIComponent(u.password),ssl:false,connectionTimeoutMillis:3000,options:'-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=1000'});
 try{
  await db.connect();await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'");
  const target=(await db.query("SELECT current_database() db,current_user role,host(inet_server_addr()) host,inet_server_port() port,pg_is_in_recovery() standby,current_setting('transaction_read_only') read_only")).rows[0];assert.deepEqual(target,backup.target);
  assert.deepEqual((await db.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows,source.slice(0,-1));
  assert.equal((await db.query("SELECT to_regclass('public.identity_credential_administration') present")).rows[0].present,null);
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  assert.deepEqual(tables,Object.keys(backup.tables));
  for(const table of tables){const quoted='"'+table.replaceAll('"','""')+'"';const row=(await db.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(v,E'\n' ORDER BY v COLLATE "C"),'')) digest FROM (SELECT to_jsonb(t)::text v FROM ${quoted} t) q`)).rows[0];assert.deepEqual(row,backup.tables[table]);}
  await db.query('ROLLBACK');
 }finally{await db.end();}
 const result=spawnSync(process.execPath,['scripts/migrate-app.mjs'],{stdio:'inherit',env:{...process.env,PGOPTIONS:'-c lock_timeout=5s -c statement_timeout=30s -c idle_in_transaction_session_timeout=15000'}});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}catch(error){console.error('Approval preflight/apply failed:',error.code??error.name);process.exitCode=1;}
NODE
```

After explicit approval and successful application, perform read-only acceptance: ten exact ledger entries, new journal owner/checks/restrictive FK, unchanged old table digests and last-admin/operator triggers, no unexpected grants, and all four gates still off. Do not automatically enable the administration/Identity profile, provision OAuth records or restore data. Retain audit/security history for application rollback. A different target, Neon endpoint or newer migration needs a different reviewed command; the loopback database TLS exception is not a Neon policy.
