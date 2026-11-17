# Manual IS production database migration

IS-DB-RUNBOOK#0001, 2026-11-17. This is an operator procedure, not migration or deployment authorization. The documentation task executed no production connection, environment download, backup, migration, credential change or deployment. Commands below are for a later approved operation on the native Debian host, not the Codex sandbox.

## Confirmed baseline and execution prerequisites

The operator has confirmed the following baseline. Reverify it at execution time; it supersedes the earlier access-blocked inventory as operator-supplied evidence, not as a production inspection performed by this documentation task.

| Item | Confirmed value |
| --- | --- |
| Debian 13 host | `5480-deb13` |
| Node / npm | `v24.22.0` / `11.19.1` |
| Vercel account | `yogi.wiputra@gmail.com` |
| Vercel team | `sandcastle2` |
| Vercel team ID | `team_SUnAmlBNxPYqRJJsA7EtHcSG` — reverify against project |
| Vercel project | `is` |
| Vercel project ID | `prj_c7PznTxVOklfr8dI6FBHZSQXHhl2` |
| Production database / connection role | `neondb` / `neondb_owner` |
| Production PostgreSQL | `18.7` |
| Production IS ledger | Six entries through `0007`, subject to matching hashes |
| Development / approved source sequence | Eleven entries through `0012` |
| Intended production delta | `0008`, `0009`, `0010`, `0011`, `0012`, in that order |

There is intentionally no `0005`. Better Auth migrations are separate. The unnumbered `db/proposals/is-admission-2.sql` is not part of this delta. Do not number/apply it, bootstrap users/tenants/clients, or activate Consumer/Admission functionality during schema synchronization.

Before using production credentials, obtain an approved change record naming the immutable release SHA, current production application deployment/SHA, Neon organization/project/branch ID and name, database, direct endpoint, migration role, exact ordered SQL filenames/hashes, backup/recovery evidence, rehearsal results, maintenance window, lock/time limits and incident owner. Verify least privilege: the reported `neondb_owner` is an ownership role, not proof of a narrowly scoped migration role. Use only the explicitly approved role; do not broaden grants or rotate credentials as part of this procedure.

Use a private, isolated, already prepared release directory on the host. Its application source, runner, helper, lockfile and installed dependencies must all match the reviewed release. The earlier pre-admission candidate is `354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b`; it is a reference, not automatic release approval. Do not copy dirty working-tree code or assume current local `master` is that candidate: local master has included admission commits. Preserve the dedicated admission branch and recovery archive.

Install/validate dependencies and perform source review **before** downloading credentials. Do not run npm installation, package lifecycle hooks, builds, dev servers, client registration or arbitrary scripts with production secrets present. This directory must never be deployed, uploaded or archived for sharing while it contains private operational material.

## Temporary Bash session and Node networking workaround

Start a separate shell; do not run these exports in a long-lived development shell:

```bash
bash --noprofile --norc
```

Inside that temporary shell:

```bash
set -euo pipefail
set +x
set +o history
umask 077
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
node --version
npm --version
hostname
# Expected: v24.22.0, 11.19.1, 5480-deb13.

# Avoid inherited local/proxy/TLS/target overrides; never print their old values.
unset DATABASE_URL DATABASE_URL_UNPOOLED POSTGRES_URL_NON_POOLING
unset IS_DATABASE_SSLMODE PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
unset NODE_EXTRA_CA_CERTS
export NODE_ENV=production
export IS_DATABASE_SSLMODE=verify-full
export NODE_TLS_REJECT_UNAUTHORIZED=1
export NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
node -e "const net=require('node:net'); console.log(net.getDefaultAutoSelectFamily())"
# Expected: false. Stop if it is true.
```

The observed failure pattern was Node IPv4 `ETIMEDOUT`, IPv6 `ENETUNREACH`, and successful Python TCP connectivity while ordinary Node PostgreSQL connections failed. Disabling Node network-family autoselection was the working workaround. This changes connection selection; it does not prove the underlying network cause, or prove PostgreSQL authentication, TLS or schema compatibility. The DNS order flag alone was not the confirmed fix. Explicit connection options can override Node defaults, so inspect reviewed code if behavior differs. The flag was also verified locally on Node v24.22.0 for this runbook. See [Node command-line reference](https://nodejs.org/api/cli.html#--no-network-family-autoselection).

Keep the public Neon DNS hostname and certificate verification. Do not use `sslmode=disable`, `rejectUnauthorized:false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, custom insecure TLS agents, or hardcoded Neon IPs. Do not change host firewall, routing or global Node defaults to make this runbook work.

A non-login shell still inherits its parent's environment; it is not a sandbox. The explicit unsets/exports above prevent common stale target/TLS overrides. Review any additional approved host configuration without dumping `env`, `set` or `export -p`.

## Verify release directory, Vercel account and linkage

Select the actual approved isolated directory and SHA. The following values are examples using the earlier candidate; replace them if the approved change record names another reviewed release. The directory must already exist with reviewed dependencies and correct existing IS linkage.

```bash
IS_RELEASE_DIR=/home/user/releases/is-db-0012-354bdd8
IS_RELEASE_SHA=354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b
cd -- "$IS_RELEASE_DIR"
test "$(git rev-parse HEAD)" = "$IS_RELEASE_SHA"
git diff --exit-code
git diff --cached --exit-code
git status --short
# Review every untracked file; no Development env, keys or dumps may be copied in.

vercel --version
vercel whoami
vercel api /v2/user --method GET | node -e '
let s=""; process.stdin.on("data",x=>s+=x).on("end",()=>{
 const u=JSON.parse(s).user;
 if(u?.email!=="yogi.wiputra@gmail.com")process.exit(1);
 console.log("Confirmed Vercel account:",u.email);
});'

test -f .vercel/project.json
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const p=JSON.parse(await readFile('.vercel/project.json','utf8'));
assert.equal(p.projectId,'prj_c7PznTxVOklfr8dI6FBHZSQXHhl2');
assert.equal(p.orgId,'team_SUnAmlBNxPYqRJJsA7EtHcSG');
console.log('Existing IS project/team linkage verified');
JS
vercel project inspect prj_c7PznTxVOklfr8dI6FBHZSQXHhl2 --scope sandcastle2
```

Stop on wrong account, missing/wrong linkage, 401/403/404, different team/project or unexpected source changes. Do not run `vercel link`, create a project, accept an automatic relink, or fall back to a default scope. An operator must resolve linkage/access through a separately reviewed workflow. Scope `sandcastle2` alone does not prove that the working directory is IS; Sandcastle API/Web and IG are different projects. Record the actual production deployment ID/SHA and Git production branch from Vercel; do not infer them from GitHub master or the latest Preview.

## Pull production environment into a private file

Before this step, prepare/review the private scripts, target expectations and approved source/catalog manifests described in the next section, without credentials present. Run their database checks only after this download.

The installed Vercel CLI help must support these options (verified with CLI 64.5.0). Use a new file: pull/merge behavior varies by CLI version, and stale local-only entries or secret placeholders must not survive unnoticed. [Vercel env documentation](https://vercel.com/docs/cli/env) describes environment export and notes that unreadable Secret values can become placeholders.

```bash
test ! -e .env.production.local
test ! -L .env.production.local
git check-ignore --no-index .env.production.local
# Must be ignored; otherwise stop before downloading.
vercel env pull .env.production.local \
  --environment=production \
  --scope sandcastle2
chmod 600 .env.production.local
stat -c '%a %U %n' .env.production.local
# Expected owner: this operator; mode 600; regular file, not a symlink.
```

If supported by the installed CLI, `--project prj_c7PznTxVOklfr8dI6FBHZSQXHhl2` may additionally pin the project, but it does not replace linkage verification. Do not use `--yes` to conceal a wrong-target/overwrite prompt. Do not use debug/verbose output, `cat`, `grep DATABASE_URL`, shell tracing, terminal recording, screenshots or shared logs on this file. Git ignore alone does not exclude a file from every deployment or backup tool: this entire private release directory must be excluded from deployment/upload and shared-backup jobs, including `.vercel/` and private operation files. Do not invoke `vercel deploy`, `vercel build`, `vercel pull` or a build on this credential-bearing directory.

A pull may omit or placeholder sensitive variables. Verify presence without displaying the value, and fail closed on missing data:

```bash
node --env-file=.env.production.local -e '
if(!process.env.DATABASE_URL || !/^postgres(?:ql)?:/.test(process.env.DATABASE_URL)){
 console.error("DATABASE_URL missing or not a PostgreSQL URL"); process.exit(1);
}
console.log("DATABASE_URL is present; value not displayed");'
```

This is only a presence check, not proof of a valid credential. If missing/placeholder, stop and use the account owner's approved secure retrieval mechanism; never paste credentials into chat, issue comments, command-line arguments or Git. Do not invent a local replacement or edit Vercel credentials.

Use `node --env-file=...` for scripts. It parses env-file syntax without sourcing it as Bash. Do not recommend `source .env.production.local` or `eval`; independent shell-syntax/provenance review would be required. Node also interprets Node-related env settings, so keep the explicit safe `NODE_OPTIONS`, TLS and production exports above. Environment variables already exported in the shell take precedence over env-file entries, which is why stale `DATABASE_URL` is unset. See [Node env-file semantics](https://nodejs.org/api/cli.html#--env-filefile).

No shell-level DATABASE_URL is needed. If a tool absolutely needs it, use a reviewed Node parent that spawns that one child with `{shell:false, env:{...process.env,DATABASE_URL:validatedUrl}}`; keep it in process memory, never use command substitution/eval/`export DATABASE_URL=...` with a literal secret, and never print child environments or raw error objects. An example is the private migration launcher below.

## Prepare private read-only verification scripts

These are documentation examples to create and review locally during an authorized operation; they are not new repository runtime files. The directory must be private and excluded from Git and all deployment/shared backup artifacts.

```bash
mkdir -m 700 .private-db-ops
printf '*\n' > .private-db-ops/.gitignore
```

Create `.private-db-ops/target.json` with non-secret values from the approved Neon/Vercel records. Fill every placeholder independently; do not infer branch identity from the database name or DNS alone. Use the **direct** endpoint supplied by Neon for the verified branch, not a guessed removal of `-pooler`:

```json
{
  "neonProjectId": "REPLACE_FROM_NEON",
  "branchId": "REPLACE_FROM_NEON",
  "branchName": "REPLACE_FROM_NEON",
  "directHost": "REPLACE_WITH_VERIFIED_DIRECT_NEON_HOST",
  "database": "neondb",
  "role": "neondb_owner",
  "postgresVersionPrefix": "18.7",
  "productionDeploymentSha": "REPLACE_WITH_DEPLOYED_SHA"
}
```

Validate the deployed application's pinned Better Auth version/schema against this database separately. The JSON is an approved expectation, not evidence that those cloud records were inspected.

Create `.private-db-ops/connection.mjs`:

```js
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifiedDatabaseUrl} from '../src/lib/verified-database-url.mjs';
export const target=JSON.parse(await readFile(new URL('./target.json',import.meta.url),'utf8'));
export function directConnection(){
  for(const key of ['neonProjectId','branchId','branchName','directHost','productionDeploymentSha']){
    assert.equal(typeof target[key],'string');
    assert(target[key].length>0 && !target[key].includes('REPLACE'));
  }
  assert.equal(process.env.NODE_ENV,'production');
  assert.equal(process.env.IS_DATABASE_SSLMODE,'verify-full');
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'1');
  // Select only a configured, independently verified direct URI. Never guess its host.
  const candidates=[process.env.DATABASE_URL_UNPOOLED,process.env.POSTGRES_URL_NON_POOLING,process.env.DATABASE_URL].filter(Boolean);
  for(const raw of candidates){
    let u;try{u=new URL(raw);}catch{continue;}
    if(u.hostname!==target.directHost)continue;
    assert(['postgres:','postgresql:'].includes(u.protocol));
    assert(!u.hostname.includes('-pooler.') && u.hostname.endsWith('.neon.tech'));
    assert.equal(u.port||'5432','5432');assert(!u.hash);
    // Disallow startup/service/host overrides and custom certificate inputs.
    assert([...u.searchParams.keys()].every(k=>['sslmode','channel_binding','connect_timeout'].includes(k)));
    assert.equal(decodeURIComponent(u.pathname.slice(1)),target.database);
    assert.equal(decodeURIComponent(u.username),target.role);
    assert(u.password.length>0);
    const value=verifiedDatabaseUrl(u.href);
    assert.equal(new URL(value).searchParams.get('sslmode'),'verify-full');
    return value;
  }
  throw new Error('No approved direct database URI available');
}
```

If Vercel has only the pooled runtime URL, stop here. Obtain the exact direct URI for the same verified project/branch/database/approved role through the approved secure channel into a separate mode-0600 env file, with the configured runtime URI preserved. Never change Vercel's runtime URL or derive a target from hostname similarity. The helper may select `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` when present and approved; no direct URI is assumed to exist. Migration, dump and session advisory-lock operations require the direct connection. See [Neon pooling guidance](https://neon.com/docs/connect/connection-pooling).

Create `.private-db-ops/preflight.mjs`:

```js
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {directConnection,target} from './connection.mjs';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const sha=b=>createHash('sha256').update(b).digest('hex');
let db,stage='configuration';process.umask(0o077);
try{
  const source=[];
  for(const name of (await readdir('db/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort()){
    source.push({name,sha256:sha(await readFile('db/migrations/'+name))});
  }
  assert.deepEqual(source.map(m=>Number(m.name.slice(0,4))),[1,2,3,4,6,7,8,9,10,11,12]);
  // This independent approved manifest must come from reviewed source/change record.
  assert.deepEqual(source,JSON.parse(await readFile('.private-db-ops/source-approved.json','utf8')));
  db=new pg.Client({connectionString:directConnection(),connectionTimeoutMillis:45000});
  stage='connect';await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage='identity';
  const identity=(await db.query(`SELECT current_database() database,current_user role,
    current_setting('server_version') version,pg_is_in_recovery() standby,
    current_setting('transaction_read_only') read_only`)).rows[0];
  assert.equal(identity.database,target.database);assert.equal(identity.role,target.role);
  assert(identity.version===target.postgresVersionPrefix || identity.version.startsWith(target.postgresVersionPrefix+' '));
  assert.equal(identity.standby,false);assert.equal(identity.read_only,'on');
  const tls=(await db.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];
  assert.equal(tls?.ssl,true);
  stage='full-ledger';
  assert.equal((await db.query("SELECT to_regclass('public.is_schema_migrations') IS NOT NULL present")).rows[0].present,true);
  const ledger=(await db.query('SELECT name,sha256 FROM public.is_schema_migrations ORDER BY name')).rows;
  const prefix=phase==='before'?source.filter(m=>Number(m.name.slice(0,4))<=7):source;
  assert.deepEqual(ledger,prefix); // Reject unknown, non-prefix, mismatched or missing history.
  const pending=source.filter(m=>!ledger.some(a=>a.name===m.name));
  assert.deepEqual(pending.map(m=>Number(m.name.slice(0,4))),phase==='before'?[8,9,10,11,12]:[]);
  stage='catalog';
  const tables=(await db.query("SELECT tablename,tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const columns=(await db.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const constraints=(await db.query("SELECT c.relname table_name,k.conname name,k.contype type,k.convalidated validated,md5(pg_get_constraintdef(k.oid)) definition_digest FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE k.connamespace='public'::regnamespace ORDER BY c.relname,k.conname")).rows;
  assert(constraints.every(c=>c.validated));
  const triggers=(await db.query("SELECT c.relname table_name,t.tgname name,t.tgenabled enabled,md5(pg_get_triggerdef(t.oid)) definition_digest FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
  const role=(await db.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows;
  const grants=(await db.query("SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY grantee,table_name,privilege_type")).rows;
  const names=new Set(tables.map(t=>t.tablename)),counts={};
  for(const name of ['user','account','session','oauthClient','jwks','nexus_applications','nexus_application_oauth_clients','nexus_tenants','nexus_tenant_memberships','nexus_entitlements']){
    assert(names.has(name));
    counts[name]=(await db.query('SELECT count(*)::text count FROM "'+name+'"')).rows[0].count;
  }
  const bad=(await db.query(`SELECT count(*)::int n FROM nexus_tenant_membership_governance g
    WHERE g.active_admin_count<1 OR g.active_admin_count<>(SELECT count(*) FROM nexus_tenant_memberships m
    WHERE m.tenant_id=g.tenant_id AND m.status='active' AND m.role IN ('owner','admin'))`)).rows[0].n;
  assert.equal(bad,0);
  const catalog={tables,columns,constraints,triggers};
  // Expected catalog was independently reviewed against baseline/rehearsal. Never create it by blindly accepting this same production output.
  assert.deepEqual(catalog,JSON.parse(await readFile('.private-db-ops/catalog-approved-'+phase+'.json','utf8')));
  const receipt={at:new Date().toISOString(),phase,target,identity,tls,source,ledger,pending,catalog,role,grants,counts,invalidTenantAdminCounters:bad};
  await db.query('ROLLBACK');
  const path='.private-db-ops/receipt-'+phase+'-'+Date.now()+'.json';
  await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({phase,identity,ledgerEntries:ledger.length,pending,receipt:path}));
}catch(error){
  // No assertion diff, URL, raw SQL row, credential or driver error object printed.
  console.error(JSON.stringify({error:'preflight_stopped',stage,code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'CHECK_FAILED'}));
  process.exitCode=1;
}finally{if(db)await db.end().catch(()=>{});}
```

The strict baseline makes this runbook specific to the confirmed 0007→0012 operation. If the ledger has changed, stop and reconcile; do not weaken assertions to proceed. A missing ledger is not permission to create one. This script performs only bounded read-only SQL; it never runs a migration or schema planner. Catalog approval files must include expected provider/source-owned tables, columns, constraints and triggers from independently reviewed PostgreSQL 18.7 baseline/rehearsal evidence, with expected production owner names reconciled. Indexes and the additional objects listed below require separate review records. The compact example records columns, constraint/trigger digests and owners; additionally inspect indexes, function definitions/search paths, defaults, sequences, extensions and runtime-role privileges where not represented. Unexpected differences require explanation and approval, not copying observed output into the expected file. Catalog comparison cannot prove application behavior.

Prepare `source-approved.json` from the approved immutable source **before secret loading**; verify its hashes against the change record. It is an ordered array of `{name,sha256}` entries. Record the full list with `sha256sum db/migrations/*.sql`. The following produces the ordered JSON from the already reviewed release; a second review against the immutable SHA/change record is still required, and a local generated manifest alone is not source approval:

```bash
# Prepare before downloading credentials; private directory already created.
node --input-type=module - <<'JS'
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const entries=[];
for(const name of (await readdir('db/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort()){
  entries.push({name,sha256:createHash('sha256').update(await readFile('db/migrations/'+name)).digest('hex')});
}
await writeFile('.private-db-ops/source-approved.json',JSON.stringify(entries,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Source manifest prepared; independent approval required');
JS
```

Target pending hashes for this baseline:

| Migration | SHA-256 |
| --- | --- |
| `0008_identity_credentials.sql` | `5b84f270c7ab9d6a3658abd40f268600899bb969a671efcfdf42270afb8ea773` |
| `0009_nexus_consumer_runtime.sql` | `ad62e6f2500a17e0061b788604f9b201810277d2d55ddafa09eefc364dc131c8` |
| `0010_identity_consumer_code_barrier.sql` | `f4295cf7903ae2d5cb6bb67dd6884ed5e23cd0461c7df46d094f6e31fb2a94e2` |
| `0011_identity_credential_administration.sql` | `7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264` |
| `0012_oauth_client_purposes.sql` | `fdcef5d3d4235e221da8f36e4175ef4633e6294080b488ce4e5909aac03b6169` |

Syntax-check the private examples without executing them, then run read-only preflight using the same Node env-file mechanism as migration:

```bash
node --check .private-db-ops/connection.mjs
node --check .private-db-ops/preflight.mjs
node --env-file=.env.production.local .private-db-ops/preflight.mjs before
```

Read-only account/role metadata, hashes and counts can be retained after privacy review; keep catalog/grant receipts private until reviewed. Never print row-level session, identity/provider, OAuth secret, refresh/access token or private JWKS fields. A successful TCP connection, TLS handshake or matching ledger alone is insufficient.

## Backup, isolated rehearsal and application compatibility

**STOP before writes unless all items below have evidence and operator sign-off.** This section describes separately authorized cloud operations; this documentation task does not create branches or backups.

1. In the authenticated Neon Console/API, verify the exact project, production branch ID/name, endpoint→branch mapping, database and role against `target.json` and Vercel's configured connection. Record PostgreSQL 18.7, current deployment and source SHA. A default branch name or an endpoint supplied in chat is insufficient.
2. Record current recovery-history retention, earliest recoverable timestamp, backup/recovery branch ID, creation time and source timestamp/LSN where available, access controls, expiration/retention, authorized restore operator and recovery access. Confirm these before the window; retention and permissions are project-specific.
3. With backup authorization, retain a protected pre-change recovery branch/snapshot from the exact production point. Create a **separate rehearsal branch** from the same point. Do not mutate the recovery anchor while testing. Neon child branches are independent copy-on-write clones; they contain production data and require equivalent privacy controls. A schema-only branch does not prove record preservation. See [Neon branch management and restore](https://neon.com/docs/manage/branches).
4. Prove recoverability by restoring or opening an additional isolated recovery target and verifying expected schema/ledger and private record fingerprints. Do not test restore by resetting production. A branch appearing in a list does not prove permission or ability to recover it.
5. Rehearse **only** the five pending files, with the same reviewed runner, TLS, role capabilities and bounds. Use an independently verified rehearsal env file and target/catalog JSON for that branch; never reuse production credentials/endpoint accidentally. This runbook's production identity assertions must not be bypassed—prepare a separately reviewed rehearsal copy naming that isolated branch. A branch-specific hostname check is mandatory.
6. Compare coherent pre/post snapshots of identities/stable subjects, sessions, provider links, OAuth client IDs/secret/redirect/key fields, canonical tenant/app IDs, memberships, governance counters, entitlements and audit records without exposing their contents. Preserve every preexisting record; validate linkage purpose classification changes separately. Use private row digests or a consistent snapshot/backup, not counts alone. Traffic can legitimately change session/audit counts, so isolate/quiesce affected writes or explain differences. Bulk digest scans need reviewed runtime/lock limits.
7. Confirm all eleven ledger entries and exact source hashes after rehearsal, valid FKs/checks/indexes/functions/triggers, repeat runner no-op, final-admin and final-operator protections, audit atomicity, runtime permissions and no unintended data rewrite. Run concurrency/security mutations only in isolated fixtures/branches. Run the existing Node 24 standard, Identity/OAuth/DPoP, Consumer and membership PostgreSQL suites there; do not point synthetic suites at production.
8. Test the **currently deployed application SHA** against the migrated rehearsal database, including native Better Auth schema compatibility, preserved session continuity and existing Google/OIDC Code+PKCE clients. Only use an approved test registration/browser origin; do not send real credentials to an untrusted build. Preserve issuer, signing keys, client IDs, exact HTTPS redirects and existing provider credentials. Do not auto-run Better Auth `db:migrate`/bootstrap or weaken password/registration policy.

Migration-specific review:

- `0008`: new Identity sidecars, restrictive references and immutable/retention guards; no provider schema changes.
- `0009`: new Consumer state/audit and epoch backfill; triggers on existing Nexus writes require runtime INSERT/UPDATE privileges on sidecar tables even with Consumer HTTP disabled. Global revision updates can contend; measure performance and locks.
- `0010`: new Identity code barrier; no existing provider rows changed.
- `0011`: new administration journal constrained to `development`. Do not seed it with production operations or broaden that CHECK constraint.
- `0012`: adds `purpose`, classifies established consumer bindings and replaces app/environment uniqueness with app/environment/purpose uniqueness. It is not purely additive: it scans/updates linkage, rejects ambiguous mappings and requires an ACCESS EXCLUSIVE table lock plus uniqueness work. Review actual constraint name, lock duration, data volume, old-code assumptions and duplicate handling. Existing OAuth credentials/sessions remain authoritative in Better Auth.

A backup/restore process involving `pg_dump` needs a compatible PostgreSQL 18 client for this PostgreSQL 18.7 server; the development host's PostgreSQL 17 binaries are not a suitable production dump client. Use direct verified-TLS connections, protected credentials in child environments and encrypted/private backup storage. Do not pass full URLs/passwords on the process command line or put backups in this repository. No dump contents belong in receipts, Git, chat or shared logs.

## Production approval and execution — mutating, do not run during documentation

The change record must explicitly approve production schema writes **after** target, complete ledger, catalog, backups, rehearsal and old-application compatibility are confirmed. Approval must name `0008–0012` with the exact hashes above. Deployment approval is separate. Re-run the read-only preflight immediately before migration and ensure no competing migration or incompatible application write is active.

The existing runner `scripts/migrate-app.mjs` uses advisory lock `83792421`, checks applied names/hashes/order, applies each pending SQL file in its own transaction and records its SHA-256 in `is_schema_migrations`. It stops on unexpected history or execution errors. It does not migrate Better Auth tables, establish backups, check every application compatibility condition or activate features. Critically, it validates history while iterating: an earlier pending file may commit before a later ledger inconsistency is discovered. The independent **complete** preflight above is mandatory. The five-file sequence is **not one atomic transaction**.

Set the rehearsed bounds explicitly in this shell, so an env-file entry cannot introduce stale session options. The values below are examples requiring approval, not measured production limits:

```bash
export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s -c idle_in_transaction_session_timeout=30s'
```

If the downloaded DATABASE_URL itself is the approved direct URI, the direct equivalent of `npm run db:app:migrate` is:

```bash
# MUTATION — only after exact production write approval and successful preflight.
node --env-file=.env.production.local scripts/migrate-app.mjs
```

The direct form can emit raw driver errors; keep such output private and do not forward it to shared logs. Prefer the filtered launcher below for the routine receipt.

`npm run db:app:migrate` alone does not automatically load `.env.production.local`. Do not run it from a shell with an inherited/default URL. When the approved direct URI is selected from a separate configured unpooled variable, use a reviewed Node launcher so only that child inherits DATABASE_URL. Do not silently let the runner use the pooled runtime URL.

Create `.private-db-ops/migrate-approved.mjs` only in the approved private release directory and review it before use:

```js
import {spawn} from 'node:child_process';
import {directConnection} from './connection.mjs';
let url;try{url=directConnection();}catch{
  console.error('Approved direct target verification failed');process.exit(1);
}
// These example bounds must be accepted by measured rehearsal/change approval.
const child=spawn(process.execPath,['scripts/migrate-app.mjs'],{
  shell:false,stdio:['ignore','pipe','pipe'],
  env:{...process.env,DATABASE_URL:url,PGOPTIONS:'-c lock_timeout=5s -c statement_timeout=120s -c idle_in_transaction_session_timeout=30s'}
});
// Allowlist known runner success lines; suppress raw driver/SQL/credential errors.
let buffer='';child.stdout.on('data',chunk=>{
  buffer+=chunk.toString();let end;
  while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
    if(/^(Applied|Migrated): \d{4}_[a-z0-9_]+\.sql$/.test(line)||line==='IS application migrations complete')console.log(line);
  }
});
child.stderr.on('data',()=>{});
child.on('error',()=>{console.error('Migration child could not start; stop and investigate privately');process.exitCode=1;});
child.on('close',code=>{
  if(code!==0)console.error('Migration stopped; inspect ledger read-only and escalate. No automatic retry.');
  process.exitCode=code===0?0:1;
});
```

The launcher does not grant approval; it pins the verified direct target in the child without shell evaluation and avoids routine raw driver logging. For an unusual failure, an authorized DBA must investigate privately; do not publish driver errors or disable guards to obtain output. Verify the runner's reviewed client configuration honors these timeout settings during rehearsal; URL `connect_timeout` and explicit client timeouts may affect connection timing independently. Use a separately reviewed bound if 120 seconds is insufficient; never remove limits to force progress.

```bash
node --check .private-db-ops/migrate-approved.mjs
# MUTATION — only after approval. Record UTC start/end and exit status.
node --env-file=.env.production.local .private-db-ops/migrate-approved.mjs
```

Run **one** approved migration form, not both. If the process fails, stop. Do not rerun blindly: re-read the entire ledger and catalog to determine which files committed. Failed-file SQL and its ledger insertion roll back together; earlier successful files remain committed. Do not truncate/delete/rewrite ledger or audit rows, change historical SQL or create a filler 0005.

## Post-migration checks and failure recovery

```bash
# READ ONLY: must report 11 exact entries through 0012 and no pending migration.
node --env-file=.env.production.local .private-db-ops/preflight.mjs after
```

The post-check requires the independently approved post-rehearsal catalog, not a catalog generated by accepting current production output. Before closing the operation:

- Compare full source/ledger names and SHA-256, with eleven entries and no gaps other than 0005, no extra history and no pending files. Verify expected new tables/indexes/functions/triggers and validated FKs/CHECKs/uniqueness. Verify linkage purposes and retained IDs, not just the existence of the purpose column.
- Compare the preserved records/fingerprints from the backup/rehearsal plan. Account for legitimate concurrent traffic; counts alone cannot establish preservation or detect credential mutation.
- Recheck runtime and migration permissions, trigger side-table permissions and governance counters. Exercise normal Nexus membership/entitlement/operator/admin authorization through approved smoke tests. Do not attempt destructive final-admin or concurrent-removal tests on production.
- Confirm existing IS session continuity, Google login and existing production OIDC clients with exact redirects, Code+PKCE, correct issuer/signatures, and existing client credentials/keys. Authentication/schema failures require escalation; do not bootstrap a replacement identity or client.
- Keep preexisting feature settings as approved. Consumer, Identity credential administration and Admission functionality are not activated by migration. Missing admission schema remains a separate reviewed prerequisite. Do not deploy, promote, push master or alter Vercel settings as a side effect.
- Monitor auth/OAuth failures, SQL permission errors, audit failures, latency, connection/lock pressure and 5xx rates against the pre-change baseline. Assign an incident owner, decision deadline and recovery contact before migration.

If a check fails, freeze dependent writes/rollout and contact the change owner/DBA. Re-inventory committed history and preserve private evidence. Prefer a reviewed forward repair and a separately approved rollback to compatible previous application code, retaining additive tables, audit and revocation tombstones. Do not perform destructive down migrations. The previous application must already have been rehearsed against the expanded schema, particularly 0012 uniqueness changes.

A whole-branch restore can discard valid writes made after the recovery point. It requires a separate explicit incident decision, RPO/RTO assessment, confirmed recovery target and selective data reconciliation plan. Never reset production merely to prove rollback; restore rehearsal happens on isolated branches. Do not automatically undo valid security revocations, erase audit, drop membership data or overwrite canonical IDs.

## Troubleshooting and cleanup

| Symptom | Required response |
| --- | --- |
| Node ETIMEDOUT / ENETUNREACH | Recheck Node 24 and `getDefaultAutoSelectFamily() === false` inside the temporary shell; compare approved host DNS/routing diagnostics. Python TCP success is only transport evidence. Keep DNS/TLS intact; no IP pinning. |
| Certificate/hostname error | Stop; verify direct hostname, trust store and `sslmode=verify-full`. Never bypass TLS validation. |
| Missing DATABASE_URL or placeholder | Stop; verify exact Vercel account/project/environment and authorized secret retrieval. Do not reuse Development values. |
| Vercel 401/403/404 or wrong linkage | Stop; obtain correct account/team access through approved login/authorization. Do not create/relink a project or use default scope. |
| Checksum/ledger/catalog mismatch | Stop before writes; reconcile actual branch history and drift with DBA/reviewer. Never edit applied SQL or guess a ledger repair. |
| Lock timeout/deadlock/permission error | Stop; identify blockers/grants privately. Reconcile partial commits and rehearse any correction. Do not kill unrelated production sessions, expand privileges or retry unbounded. |
| pg_dump version mismatch | Use approved PostgreSQL 18 tooling or the verified Neon recovery path. Do not use PG17 to back up PG18.7. |

After post-checks, handle files by exact path. `.env.production.local` contains more than a database URL, and may include short-lived tokens. Use the approved secrets-retention policy: keep only in an encrypted/access-controlled operational store if explicitly needed, otherwise remove the exact downloaded file from this isolated directory. Review private receipts for credentials/personal data before retaining a sanitized copy outside the release directory.

```bash
# Verify cwd and exact file identity first. No wildcard or broad Git cleanup.
pwd
stat -c '%a %U %n' .env.production.local
# After retention decision, remove only this reviewed downloaded file:
rm -- .env.production.local
# Separately inventory/remove any additional private credential files by exact name.
unset DATABASE_URL DATABASE_URL_UNPOOLED POSTGRES_URL_NON_POOLING PGPASSWORD PGOPTIONS
unset NODE_OPTIONS NODE_ENV IS_DATABASE_SSLMODE NODE_TLS_REJECT_UNAUTHORIZED
exit
```

Exiting terminates this shell's environment; it does not erase downloaded files, parent-shell variables, child process environments, Vercel CLI login state, backups, filesystem snapshots or terminal recordings. Ensure no child remains running. `rm` unlinks a file but is not guaranteed secure erasure on SSD, copy-on-write storage or backups; use encrypted storage and the host's approved disposal policy. Do not claim `shred` guarantees erasure. Never commit private env files, TLS keys or database backups. Do not use `git clean`, broad `rm` patterns or `git reset --hard` for cleanup. Preserve reviewed non-secret timestamps, source SHA/hashes, target/backup branch IDs, approvals, sanitized runner status and verification outcomes.

## Release checklist and documentation checkpoint

- [ ] Correct native host, Node 24.22.0, autoselection false; TLS verification intact.
- [ ] Reviewed immutable isolated release; admission work/recovery preserved separately; no dirty runtime/helper edits included.
- [ ] Account/team/project/linkage and current production deployment verified.
- [ ] Exact Neon project/branch/direct endpoint/database/role confirmed from authoritative records.
- [ ] Fresh env file ignored, mode 600, no stale exported URL; no shared artifacts or secret output.
- [ ] Six applied entries through 0007 match; exact five-file delta/source hashes independently preflighted; no unexpected schema drift.
- [ ] Recovery anchor, retention, access and isolated restore proven; separate rehearsal complete.
- [ ] Old application/provider/session/OAuth/Nexus compatibility and data preservation proven.
- [ ] Explicit schema-write approval; reviewed timeout/lock plan and incident owner.
- [ ] One approved migration execution; eleven matching ledger entries and post-checks passed.
- [ ] Feature settings unchanged; no automatic deployment or consumer/admission activation.
- [ ] Credentials handled by policy; sanitized receipts retained; temporary shell exited.

This documentation change consists only of this runbook and a link in `docs/LOCAL-DEVELOPMENT.md`. Existing uncommitted runner/helper and DB-SYNC files are separate work and must remain unstaged. Current inspected branch is local master; verified existing feature branch is `feature/nexus-consumer-runtime`. The operator can switch without force; if Git reports conflicting changes, stop and preserve them—do not reset/clean/stash blindly.

```bash
cd /home/user/src/is
git status --short
git diff --cached --exit-code
git switch feature/nexus-consumer-runtime
test "$(git branch --show-current)" = feature/nexus-consumer-runtime
git add -- docs/OPERATIONS-PRODUCTION-DB-MIGRATION.md docs/LOCAL-DEVELOPMENT.md
git diff --cached --check
git diff --cached
git commit -m "docs(IS-DB-RUNBOOK#0001): document production migration procedure"
# Human only, after branch/deployment-trigger review:
git push is feature/nexus-consumer-runtime
```

No file is obsolete; no `git rm` is needed. Do not stage all files, push master, merge or deploy automatically. This runbook does not certify that a production migration has happened or grant permission to execute its mutating commands.
