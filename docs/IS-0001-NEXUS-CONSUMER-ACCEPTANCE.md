# IS#0001 — Nexus Consumer Runtime acceptance preparation

2026-11-10. **Acceptance verdict: BLOCKED for local activation and Sandcastle M11 cutover.** Migration rehearsal and automated security checks pass. Persistent migration, OAuth provisioning, feature activation, real credential acceptance and production readiness have **not** been approved or performed. No application feature or runtime implementation changed in this task.

## A. Git checkpoint and source integrity

Observed branch: `feature/nexus-consumer-runtime`. HEAD is still **`f8941c3feefc36d937e399e2789a6dd3a74aa898`**, the Stage 2C.2 Identity checkpoint. The Stage 2D implementation is present as the same uncommitted tracked/untracked files listed in [its completion report](STAGE-2D-NEXUS-CONSUMER-RUNTIME.md). No Stage 2D checkpoint commit exists in the inspected local refs, and the working tree was **not clean on entry**. This contradicts the task's prerequisite; no commit was manufactured, amended or rewritten. Remote freshness was not established and no fetch/push/merge/deployment occurred.

Preserve/review/checkpoint the Stage 2D implementation before any persistent migration approval. This task adds this report, a dated handoff update and one test-only fixture correction. The 301-second token vector now explicitly pins `iat` to the same timestamp as `exp`; previously crossing a second boundary could create a valid 300-second token and cause a false failure. Runtime signature/lifetime checks are unchanged. The original application/migration/package and Stage 2D test contents were otherwise preserved.

Source order is 0001–0004, 0006, 0007, **0008 → 0009 → 0010**. No duplicate prefixes or 0005 were introduced. 0008 is byte-for-byte identical to checkpoint `f8941c3`.

| Pending file | Reviewed SHA-256 |
| --- | --- |
| `0008_identity_credentials.sql` | `5b84f270c7ab9d6a3658abd40f268600899bb969a671efcfdf42270afb8ea773` |
| `0009_nexus_consumer_runtime.sql` | `ad62e6f2500a17e0061b788604f9b201810277d2d55ddafa09eefc364dc131c8` |
| `0010_identity_consumer_code_barrier.sql` | `f4295cf7903ae2d5cb6bb67dd6884ed5e23cd0461c7df46d094f6e31fb2a94e2` |

## B. Verified local database — read-only inspection

The audit guarded the effective development connection **before connecting**, refusing any target other than literal loopback `127.0.0.1:5432`, database `is_dev`, role `is_dev`. It loaded Next's development environment precedence, set server-side `default_transaction_read_only=on`, verified actual server/database/role, used `BEGIN READ ONLY`, and rolled back. No migration/bootstrap/schema-check CLI or application-auth initialization was used for inspection. No secret, connection string, cookie, token or user record was printed or copied.

| Observation | Result |
| --- | --- |
| Actual server | PostgreSQL 17.11, Debian; address `127.0.0.1`, port `5432` |
| Database / session role / database owner | `is_dev` / `is_dev` / `is_dev` |
| Historical ledger | Six rows: 0001–0004, 0006, 0007; every checksum matches current source |
| Pending | Exactly 0008, 0009, 0010; no partial new schema present |
| Public tables / ownership | 31 tables, all owned by `is_dev` |
| Foreign keys | 42, all validated |
| Last-admin consistency violations | Zero; no governed tenants currently exist |
| Role flags | Not superuser, CREATEDB, CREATEROLE, replication or BYPASSRLS |
| Migration authority | Owns existing tables and has schema CREATE; no superuser escalation needed for reviewed additive SQL |
| Runtime separation | Current application role is also table owner; **not** proof of least-privilege runtime isolation |
| Concurrency at inspection | One connection (the audit), no idle-in-transaction session and no waiting database locks; a point-in-time observation only |

Aggregate data: one user, one session, one admission entry, one IS administrator and one Nexus operator. Zero OAuth clients/resources/client-resource links/opaque tokens, zero applications, tenants, entitlements, application-client links, memberships or governed tenants. No session credential or identity/email was extracted or reused. Counts are not browser authentication or active-principal evidence.

Catalog review covers the pinned provider's user/session/client/resource/client-resource/verification columns and primary/unique constraints used by registry checks and shared replay. Better Auth schema migration was not run. Actual provider compatibility remains covered by the disposable pinned-provider tests; this audit does not claim to be a complete automatic provider migration-plan comparison.

### Disposable migration and restore rehearsal

A new temporary PostgreSQL 17 cluster used only a private Unix socket and synthetic data. The bootstrap role created an ordinary migration owner with no superuser/CREATEDB/CREATEROLE/BYPASSRLS flags; all provider/module schemas and migrations ran as that ordinary owner. A distinct restricted runtime role was also tested. **Neither the rehearsal nor the test suites use `is_dev` or an inherited `DATABASE_URL`.**

Evidence:

1. Pinned Better Auth schema plus historical 0001–0007 and exact ledger; 30 existing non-ledger tables, 11 populated with synthetic identities/session/OIDC client/tenant/governance/membership/app/entitlement/audit state.
2. Private custom-format pre-migration `pg_dump`; no real development data was exported.
3. Existing reader remains usable; an existing writer causes migration DDL to wait. Lock wait is observed in PostgreSQL, writer is rolled back, and the migration completes within bounded lock/statement timeouts.
4. **The actual repository migration runner** applies only 0008/0009/0010, preserving hashes/counts of every existing table. Ledger becomes nine exact rows. A second invocation is a no-op.
5. All 14 new tables are owned by the ordinary migration owner. The restricted runtime role retains old reads but receives no implicit access to new Identity tables; a real grants plan is required if a separate runtime role is selected.
6. Existing Stage 1 membership service reads the expanded schema successfully; the full last-admin regression suite passes separately.
7. Restore the synthetic backup into a second disposable database: old row hashes match. Remigrate with the exact runner: old row hashes still match and all nine ledger entries match source.
8. A fresh third database accepts the entire provider/module sequence through 0010 with no implicit credential grants.

Temporary databases/cluster/archive were destroyed after rehearsal. A redacted result record is in `/tmp/is0001-rehearsal-result.json`. This is **synthetic backup/restore proof**, not a backup or restore acceptance of actual `is_dev` data.

### Persistent migration readiness

Technically rehearsed; **not cleared to execute**. Outstanding prerequisites are a real Stage 2D checkpoint/clean reviewed tree, explicit authorization for a private real backup and migration window, validated actual-backup restore procedure, current target/ledger/checksum recheck, and a recorded migration/runtime privilege decision. All consumer/Identity/membership gates must remain off during migration. Stop if an unknown ledger entry, changed checksum, pre-existing partial schema or unexpected target is found.

The existing runner commits each file independently. If 0008 succeeds and 0009 fails, stop: inspect the new ledger and obtain reviewed recovery instructions. Do not rerun blindly, edit the ledger/history, drop new tables or restore an old backup over newer records. Application rollback retains additive state and disables new acceptance.

## C. Identity/security acceptance

| Property | Fresh automated evidence | Live development status |
| --- | --- | --- |
| Positive registry / signed unknown token / digest binding | PASS; registered issuer/JTI/digest and exact consumer-code provenance required; missing or mismatched state denies | Tables absent; no live resource credential issued |
| DPoP signature/key/method/URL/hash/nonce | PASS; maintained Better Auth/JOSE verification and persisted 401 nonce challenge; no Bearer/cookie/ID fallback | Port 5180 has no valid TLS; protected live flow not attempted |
| Shared replay / identical proofs | PASS; independent Node processes race shared PostgreSQL, one success; restart preserves replay state | No multi-instance live deployment acceptance |
| Public/pairwise mappings | PASS in foundation fixture; no email linking; duplicate/unverified/revoked/deleted/mismatched mappings deny | Application assembly has no pairwise introspection callback; initial dedicated public-subject profile must be explicitly selected |
| Outstanding authorization codes | PASS; generation capture and code-to-token binding; pre-invalidation or pre-profile code/token cannot become usable | Actual browser consent/resume still pending; fixtures use synthetic consent bypass |
| Client disable/re-enable | PASS for registry-mediated generations; old JWT remains invalid after explicit permit-new transition | Native bound-client mutation is blocked; no approved live maintenance/recovery authorizer/workflow yet |
| Individual token / session / sender/signing-key invalidation | PASS, idempotent/audit-atomic; missing session denies and immutable lineage remains | No live credentials or existing session were revoked by this task |
| User eligibility | Existing-user/session and user security generation checks pass; user-scoped credential invalidation is tested | Global suspension/permanent block feature remains unsupported; permit-list removal is login-only, not revocation |
| Consistent Nexus decisions | PASS; same bounded Identity/Nexus snapshot, audit failure/outage denies, new snapshots after committed membership/entitlement revoke deny | No live tenant/application/entitlement fixtures exist |
| Decision deadline | PASS; <=5 seconds, bounded by token/nonce; transport rejects expired response; queue execution requires revalidation | No actual Sandcastle queue/executor acceptance |

Do not call registry-mediated synthetic tests live lifecycle acceptance. Resource-server nonces are implemented; native authorization-server nonce support is still absent. No unsupported security requirement was waived. Governance/current-security scope and incident response must be reviewed before activation; no new global suspension feature or permissive authorizer is introduced here.

## D. Exact development configuration and provisioning plan

User-confirmed Sandcastle callback: **`https://5480-deb13.lan.com:5182/api/auth/callback`**. Derived exact BFF origin: **`https://5480-deb13.lan.com:5182`**. This confirms URLs, not authorization to register a client, create keys or change Google settings.

| Field | Required value / status |
| --- | --- |
| IS development issuer | `https://5480-deb13.lan.com:5180/api/auth` — currently advertised, but HTTPS acceptance fails |
| Nexus resource / exact audience | `https://5480-deb13.lan.com:5180/api/nexus/v1` — required future value, not registered |
| Authorization endpoint after HTTPS correction | `https://5480-deb13.lan.com:5180/api/auth/oauth2/authorize` |
| Token endpoint after HTTPS correction | `https://5480-deb13.lan.com:5180/api/auth/oauth2/token` |
| JWKS endpoint after HTTPS correction | `https://5480-deb13.lan.com:5180/api/auth/jwks` |
| Dedicated resource-client label | Proposed `Sandcastle Development Nexus`; client ID not assigned |
| Callback | Exact user-confirmed URI above, no wildcard/path normalization |
| Environment | `development` |
| Client authentication | `private_key_jwt`, registered owner-supplied public JWKS, <=60-second assertions; no IS-generated client-secret fallback |
| Grant / response types | Authorization code only / code; PKCE S256 and DPoP key binding required |
| Subject type | Initial public-subject profile; pairwise requires separately reviewed authenticated introspection integration |
| Resource lifetime | <=300 seconds; DPoP required by resource/client |
| Resource scopes | `nexus:tenants:read nexus:membership:self nexus:entitlements:read nexus:access:evaluate` |
| Excluded scopes | `openid profile email offline_access` on the Nexus grant; preserve separate existing login flow |
| Consent | Explicit approval/denial and signed pending-query resume must be tested; proposed `skip_consent:false`, never copy test bypass into live setup |
| Binding | Exact new provider client → Nexus Sandcastle development application → Identity resource/environment/scope binding; IDs unassigned |
| Operations | Owner-approved M11 operation list required; `sandcastle:tenant.use` remains illustrative, not a provisioned authorization grant |
| Trusted mutation Origin | Exactly `https://5480-deb13.lan.com:5182` |

Read back provider resource policy, client public keys/auth method, callback, resource/scopes and Nexus/Identity linkage after separately authorized provisioning. Keep private keys in the BFF's protected storage; no keys, client assertions, session cookies or credentials in Git/chat/logs. Existing Google login and any production clients are out of scope. The local provider currently has zero OAuth clients; this resource registration cannot silently replace or stand in for a development OIDC login registration.

Provisioning is not ready to run: owner public JWKS/key ownership, client/application IDs, approved operations, explicit consent policy and an authorized internal provisioning/maintenance workflow remain unresolved. `scripts/register-client.ts` is **not** the required provisioning command: it creates a secret-based OIDC login client and consent bypass, rather than this dedicated private-key resource profile. Do not use it as a shortcut. The gated provider also blocks resource/client administration paths; resolve a supported, explicitly authorized server-only provisioning context before enabling it, never direct-write provider tables or temporarily weaken guards.

### Current gates and topology

Next's actual development file precedence loads `.env.development.local`. Effective file-loaded values:

- `BETTER_AUTH_URL=http://5480-deb13.lan.com:5180`.
- `NEXUS_CONSUMER_API_ENABLED`, `NEXUS_MEMBERSHIPS_ENABLED`, `IDENTITY_NEXUS_CREDENTIALS_ENABLED` are all unset/off.
- `NEXUS_CONSUMER_RESOURCE`, `NEXUS_CONSUMER_ENVIRONMENT` and trusted consumer origin list are unset.
- Local DB TLS mode is explicitly `disable` for the guarded loopback target only. Do not extend that exception to Neon or HTTPS.
- Better Auth secret and both Google credential fields are configured; values, ownership and external Console registration were not inspected or changed.

File-loaded values do not prove every live process environment override. Live probes below independently establish gate-off and topology behavior.

Required future gate configuration, **do not apply now**:

```dotenv
NEXUS_CONSUMER_API_ENABLED=false
NEXUS_MEMBERSHIPS_ENABLED=false
IDENTITY_NEXUS_CREDENTIALS_ENABLED=false
# After separate approved HTTPS/provisioning/acceptance steps, each gate is enabled deliberately.
# Required profile values when approved:
BETTER_AUTH_URL=https://5480-deb13.lan.com:5180
NEXUS_CONSUMER_RESOURCE=https://5480-deb13.lan.com:5180/api/nexus/v1
NEXUS_CONSUMER_ENVIRONMENT=development
NEXUS_CONSUMER_TRUSTED_ORIGINS=https://5480-deb13.lan.com:5182
```

Preserving the advertised issuer/port requires real trusted TLS on **5180**. Options for review are native Next HTTPS or a TLS proxy on 5180 with a dedicated internal HTTP backend port. This requires a controlled listener/configuration change and certificate trust review; neither was performed. Do not rewrite the issuer, disable certificate verification, spoof forwarded headers or accept LAN HTTP to pass tests. Verify the dedicated Google development callback at the approved HTTPS origin before changing its configuration; no Google Console modification is authorized by the callback clarification.

## E. Live port-5180 probes

No authenticated credential was taken from the database or sent. All tests are anonymous/gate-off; protected tests with real development credentials remain deferred until migration, provisioning and HTTPS are authorized and completed.

| Probe | Observed |
| --- | --- |
| Health / readiness / sign-in | 200 / 200 / 200 |
| OIDC discovery | 200; HTTPS issuer above, but authorization/token/JWKS URLs are **HTTP** on that host/port |
| Native JWKS | 200, one public EdDSA/OKP key; no private key read |
| Anonymous session | 200, null; no Set-Cookie observed |
| Admissions / operators / registry applications / registry tenants | All 403 |
| Protected operator and tenant pages | 307 redirects |
| All four consumer routes | 404 `resource_not_available`, no-store |
| Verified TLS to 127.0.0.1:5180 and 5480-deb13.lan.com:5180 | Both fail `ERR_SSL_WRONG_VERSION_NUMBER` |
| Certificate-verified TLS handshake to user-confirmed Sandcastle host:5182 | `ECONNREFUSED` from this host at inspection; no HTTP request or credentials sent |

No fresh Google login, authenticated cookie attributes, public HTTPS/proxy behavior, actual resource token, live 401 nonce challenge, cross-tenant decision, membership/entitlement mutation, live outage injection or real Sandcastle execution was tested. Do not stop the live database or revoke its user/session just to reproduce disposable failure tests.

## F. Fresh automated validation

Node v24.22.0, npm 11.19.1. Tests/production build ran in a private-env-free `/tmp/is0001-validation-*` source/dependency copy; the live `.next` directory/listener was preserved.

| Check | Result |
| --- | --- |
| Non-superuser fresh/populated/backup-restore migration rehearsal | PASS, exact runner, all old row hashes preserved, no-op rerun, nine final ledger rows |
| Consumer/Identity protocol suite | PASS, 34 tests including 14 consumer cases and foundation coverage |
| Provider compatibility | PASS, 31 tests |
| Membership PostgreSQL regression | PASS, 26 tests, including both isolation-level last-admin races, CSRF/authorization, audit and migration compatibility |
| Standard unit tests | PASS after timestamp-fixture correction: 63 tests outside sandbox; corrected sandbox run also passes eight file-level results |
| Route generation / typecheck | PASS |
| Production build | PASS outside sandbox with synthetic settings and unreachable loopback database; expected provider connectivity warnings only |
| Source integrity | 0008 matches checkpoint; application/migration/package files and existing Stage 2D acceptance cases unchanged; only one standard-test vector corrected |
| `git diff --check` | PASS |

Initial sandbox PostgreSQL/network runs failed and passed outside-sandbox reruns. The sandbox build compiled but hit the previously recorded TypeScript subprocess-output issue; its outside-sandbox rerun passed. The initial standard suite genuinely exposed the timing-sensitive vector (61 pass plus failed vector/parent), which was corrected rather than reported as a sandbox-only issue or hidden by a passing retry. No provider upgrade, runtime feature or migration edit was made.

## Approval and next actions

Already within current scope: inspect/review this evidence, review the uncommitted Stage 2D checkpoint manifest, choose the approved HTTPS/provisioning plan and supply the missing public-key/operation/governance inputs. **No persistent mutation is authorized by this report.**

Required separately approved actions, in order:

1. Create/identify and verify the Stage 2D checkpoint; review the test-only correction and this acceptance record; establish a clean tree and exact approved commit. Do not amend `f8941c3`.
2. Authorize a private actual `is_dev` backup/restore rehearsal and a bounded migration window for the three exact hashes above; execute the guarded commands in the command appendix below. Recheck ledger/schema/grants and data preservation afterward. Keep gates off.
3. Authorize trusted development TLS/listener configuration, canonical URL consistency, and any separately necessary Google development callback update. Preserve production credentials/registrations.
4. Authorize dedicated Sandcastle development public-key client/resource/bindings/operation grants plus synthetic governed tenant fixtures through reviewed module/provider APIs with audit/read-back; approve the internal authority/incident recovery workflow. No direct provider table writes.
5. Separately authorize deliberate development gates and real browser/consent/DPoP/proxy/lifecycle/security acceptance on 5180, including zero/one/multiple memberships, revocation/entitlement changes, denied cross-user/tenant and fail-closed dependencies. Do not test destructive outages against an active shared development database without an approved window.
6. Record live evidence in the Sandcastle handoff; seek independent Sandcastle M11 integration/cutover approval. No Sandcastle repository edit, production Neon/Vercel operation, merge or deployment is implied.

## Persistent is_dev commands — for review only

**NOT EXECUTED.** Run only after explicit authorization. Do not use `db:migrate`, `db:check`, registration/bootstrap scripts or a migration as an inspection shortcut. The commands below target only the verified local database, leave gates off, and never print a connection string. The acknowledgement variables are guards, not substitutes for approval.

First establish the reviewed clean checkpoint and approved durable private backup directory. A real backup contains sensitive records and must not be committed, uploaded or printed. This command reads `is_dev` and writes a private archive; approval for that export is still required.

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
# Set these to the reviewed values; do not invent a Stage 2D commit ID.
export IS0001_APPROVED_COMMIT='<reviewed full commit SHA>'
export IS0001_BACKUP_DIR='<absolute private durable backup directory outside this repository>'
NODE_ENV=development IS_DATABASE_SSLMODE=disable node --env-file=.env.development.local --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,chmod,writeFile,readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
assert.equal(Number(process.versions.node.split('.')[0]),24);
const approved=process.env.IS0001_APPROVED_COMMIT;
assert.match(approved??'',/^[0-9a-f]{40}$/);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),approved);
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'feature/nexus-consumer-runtime');
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
const u=new URL(process.env.DATABASE_URL);
assert.ok(['postgres:','postgresql:'].includes(u.protocol));
assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port||'5432','5432');
assert.equal(u.pathname,'/is_dev');assert.equal(decodeURIComponent(u.username),'is_dev');
for(const key of u.searchParams.keys())assert.ok(['sslmode','uselibpqcompat'].includes(key));
for(const key of ['NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED','IDENTITY_NEXUS_CREDENTIALS_ENABLED'])assert.notEqual(process.env[key],'true');
const directory=process.env.IS0001_BACKUP_DIR;
assert.ok(directory&&isAbsolute(directory)&&!resolve(directory).startsWith(resolve(process.cwd())+'/'));
assert.notEqual(resolve(directory),resolve(process.cwd()));
const existing=await lstat(directory).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(existing){assert.ok(existing.isDirectory()&&!existing.isSymbolicLink());assert.equal(existing.uid,process.getuid());assert.equal(existing.mode&0o077,0);}
else await mkdir(directory,{recursive:false,mode:0o700});
const actual=await realpath(directory),repo=await realpath(process.cwd());
assert.ok(actual!==repo&&!actual.startsWith(repo+'/'));
process.umask(0o077);
const file=join(directory,'is_dev-pre-0008-0010-'+Date.now()+'.dump');
const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'is_dev',PGUSER:'is_dev',PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'disable',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000'};
execFileSync('/usr/lib/postgresql/17/bin/pg_dump',['--format=custom','--no-owner','--no-privileges','--file',file],{env,stdio:['ignore','ignore','inherit']});
await chmod(file,0o600);
execFileSync('/usr/lib/postgresql/17/bin/pg_restore',['--list',file],{stdio:'ignore'});
await writeFile(file+'.manifest.json',JSON.stringify({database:'is_dev',address:'127.0.0.1:5432',commit:approved,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),createdAt:new Date().toISOString(),actualRestoreRehearsal:'REQUIRED BEFORE MIGRATION'},null,2)+'\n',{mode:0o600});
console.log('Private backup created; record its protected path and complete separately approved isolated restore acceptance.');
NODE
```

`pg_restore --list` checks archive readability only. A separately approved isolated restore of the real archive is required; the synthetic rehearsal above is not that acceptance. Never restore over existing `is_dev` as a routine test or rollback.

After private backup/restore acceptance, explicit migration authorization and fresh read-only audit, use the exact guarded runner below. Keep the approved commit variable set. A different source hash, changed/partial ledger or dirty tree aborts before migration.

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
# Set only after explicit approval of this exact local batch:
export IS0001_APPLY_AUTHORIZED='is_dev:0008-0010'
NODE_ENV=development IS_DATABASE_SSLMODE=disable node --env-file=.env.development.local --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {verifiedDatabaseUrl} from './src/lib/verified-database-url.mjs';
assert.equal(Number(process.versions.node.split('.')[0]),24);
assert.equal(process.env.IS0001_APPLY_AUTHORIZED,'is_dev:0008-0010');
assert.match(process.env.IS0001_APPROVED_COMMIT??'',/^[0-9a-f]{40}$/);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),process.env.IS0001_APPROVED_COMMIT);
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'feature/nexus-consumer-runtime');
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'');
for(const key of ['NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED','IDENTITY_NEXUS_CREDENTIALS_ENABLED'])assert.notEqual(process.env[key],'true');
const u=new URL(process.env.DATABASE_URL);
assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port||'5432','5432');
assert.equal(u.pathname,'/is_dev');assert.equal(decodeURIComponent(u.username),'is_dev');
for(const key of u.searchParams.keys())assert.ok(['sslmode','uselibpqcompat'].includes(key));
const expected={
 '0008_identity_credentials.sql':'5b84f270c7ab9d6a3658abd40f268600899bb969a671efcfdf42270afb8ea773',
 '0009_nexus_consumer_runtime.sql':'ad62e6f2500a17e0061b788604f9b201810277d2d55ddafa09eefc364dc131c8',
 '0010_identity_consumer_code_barrier.sql':'f4295cf7903ae2d5cb6bb67dd6884ed5e23cd0461c7df46d094f6e31fb2a94e2'
};
const names=(await readdir('db/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
assert.equal(names.length,9);
const source=new Map();for(const name of names)source.set(name,createHash('sha256').update(await readFile('db/migrations/'+name)).digest('hex'));
for(const [name,sha] of Object.entries(expected))assert.equal(source.get(name),sha);
const checkpoint=execFileSync('git',['show','f8941c3:db/migrations/0008_identity_credentials.sql']);
assert.equal(createHash('sha256').update(checkpoint).digest('hex'),expected['0008_identity_credentials.sql']);
const db=new pg.Client({connectionString:verifiedDatabaseUrl(process.env.DATABASE_URL),options:'-c default_transaction_read_only=on -c statement_timeout=5000',connectionTimeoutMillis:3000});
try{
 await db.connect();await db.query('BEGIN READ ONLY');
 const identity=(await db.query(`SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port,pg_is_in_recovery() AS standby`)).rows[0];
 assert.deepEqual(identity,{db:'is_dev',role:'is_dev',host:'127.0.0.1',port:5432,standby:false});
 const ledger=(await db.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows;
 assert.deepEqual(ledger.map(r=>r.name),names.slice(0,6));
 for(const row of ledger)assert.equal(row.sha256,source.get(row.name));
 for(const table of ['identity_credential_authorities','nexus_consumer_operations','identity_consumer_codes'])assert.equal((await db.query('SELECT to_regclass($1) AS present',['public.'+table])).rows[0].present,null);
 await db.query('ROLLBACK');
}finally{await db.end();}
const result=spawnSync(process.execPath,['scripts/migrate-app.mjs'],{stdio:'inherit',env:{...process.env,PGOPTIONS:'-c lock_timeout=5s -c statement_timeout=30s -c idle_in_transaction_session_timeout=15s'}});
if(result.error)throw result.error;process.exitCode=result.status??1;
NODE
```

Then stop and re-inspect read-only: nine source/ledger hashes, expected new tables/owners/privileges/triggers, validated FKs, old user/session/client/tenant/membership/entitlement data preservation and gated anonymous behavior. Do not enable flags or provision clients as a hidden continuation of this migration command. On a timeout/failure, retain committed state and review the exact partial ledger before any further action.


## Changes made by IS#0001

- Added this acceptance/preflight/rehearsal/approval report and unexecuted guarded command appendix.
- Updated `docs/SANDCASTLE-M11-NEXUS-HANDOFF.md` with user-confirmed port-5182 callback, current live gate/TLS/ledger evidence and the unresolved Git prerequisite.
- Corrected only `tests/identity-access-credentials.test.mjs` vector 6 to pin both timestamps for the >300s rejection case.

The incoming Stage 2D runtime, migration, package and existing protocol/PG acceptance files were hash-checked and preserved. No application feature, `.env` file, server listener, provider/client/credential, database schema/grant/row, consumer repository, deployment or Git checkpoint was changed. The audit selected metadata/aggregate counts only, with enforced read-only transactions; real data was not dumped. Temporary rehearsal/probe scripts and logs stay under `/tmp`, not in the commit manifest.
