# IS#0001-B — Human consumer provisioning and credential administration

2026-11-11. Local implementation and disposable validation only. Persistent registrations, migration application and gate activation have **not** been performed. No Sandcastle repository, production service, OAuth credential, live session or admission record was changed.

The owner reports successful Google browser login after correcting the Development callback to exactly `https://5480-deb13.lan.com:5180/api/auth/callback/google`. This is owner evidence, not an independently observed browser test. Logout, denied admission, administrator authorization and live session revocation remain unverified. The owner reports migrations 0008–0010 applied to `is_dev`; this task did not apply them or independently reconcile that database ledger.

## Administrative surfaces and ownership

The incoming checkout already contained a draft administration service/UI, migration 0011 and an optional administration fixture. This task completed and hardened that implementation rather than creating a second client registry.

| Capability | Surface / authority |
| --- | --- |
| Nexus resource | Explicit `resource` action; Better Auth resource APIs own registration/policy. Resource privileges now check server administration context, actor, action and exact resource identifier. Ordinary client provisioning cannot create/update/delete resources. |
| Application/environment | Existing `/nexus/applications` and registry APIs own application UUIDs. The consumer workflow requires active `sandcastle`, explicitly binds `development`, and protects the unique application/environment slot. |
| Human confidential client | Consumer section of `/nexus/applications`; server-only provider creation, exact fixed profile, no secret generation. |
| Public assertion keys | 1–2 inline public ES256/P-256 signing keys with distinct bounded `kid`; private/symmetric/remote keys rejected. Better Auth owns canonical keys. |
| Nexus scopes/resource links | Fixed four-scope/single-resource profile; provider APIs write links. Read-back checks canonical provider policy and links. Provider GET omits resource links, so linkage verification uses a read-only query against its authoritative table, never a second mutable credential store. |
| Application/client association | Nexus service transaction writes existing linkage plus Identity credential binding; no memberships or tenant entitlements. |
| Disable/enable | Explicit actions; durable client generation deny commits before provider mutation. Enable permits only new generations after full read-back and final authorization/audit. |
| Key maintenance | Supported `rotateClientKeys`, requiring a ≤60s assertion signed by a currently registered key for the exact rotation endpoint. Admin update silently strips JWKS; it is not used for rotation. |
| Token/session incidents | Operator `revoke_token` and `invalidate` actions update Identity issuance/generations with audit and issuer-row serialization. |
| Approved operations | Explicit bounded Sandcastle operation list at provisioning, transactionally recorded; empty list grants no operations. Tenant grants remain separate. |

The route is `POST /api/nexus/registry/applications/oauth/consumer`. It requires `NEXUS_OAUTH_ADMIN_ENABLED=true`, a configured Identity integration, development environment, exact IS Origin, JSON, a verified server session and a current Nexus operator checked in each local write transaction. IS administrator or tenant administrator alone is insufficient. The route is a privileged session API, not a consumer API or public registration endpoint. Its HTTP boundary is separately exercised by route tests.

Resource and client management are distinct explicit actions within the same operator workflow; a new role system or separate provisioning application is unnecessary for this minimum profile. Resource privileges default to deny outside the scoped context. Read/list and exact resource linking are allowed inside provisioning; create is restricted to the explicit resource action; resource update/delete/unlink are unsupported here.

Provider credential ownership remains with the registering operator under Better Auth's supported ownership checks. Other Nexus operators cannot override that ownership through this workflow; failure commits/retains resource denial. Cross-owner transfer/recovery needs separate review, not direct credential-table edits.

## Lifecycle and failure behavior

- `assertionMaxLifetime:60` is explicit in the application provider configuration. Better Auth verifies registered keys, signature, issuer/subject equal to client, audience, expiry and database-backed atomic JTI replay prevention. Token authentication accepts the provider's supported token-endpoint or normalized-issuer audience; rotation requires the exact rotation endpoint. No secret/Bearer fallback is added.
- Provisioning creates through Better Auth, immediately disables, verifies the entire fixed client profile/public keys, then commits disabled generations, linkage, operation grants and audit. Better Auth does not support disabled-at-create. Before local binding, its JWTs cannot enter the positive issuance registry and cannot authorize Nexus calls. A partial provider write is an orphan requiring review, not successful provisioning.
- Request UUID + actor + payload digest provides durable idempotency. Same completed request returns the stored result; changed payload/actor conflicts. A per-issuer advisory lock returns a retryable conflict for concurrent administrators. Failed/started provisioning for the application blocks duplicate creation until reviewed. Provider metadata records the request ID to identify an orphan after a crash. Retry the same request ID; do not repeatedly create new requests after a partial failure.
- Disable, re-enable and key maintenance first advance the client generation into denied state under the issuer-row lock. Provider and application transactions are separate; provider/read-back/audit failure leaves denial committed. Enable requires a new generation and does not resurrect existing JWTs or codes.
- Rotation requires an enabled provider client and proof of a current key; the Identity epoch is denied before rotation. Successful rotation leaves the provider client disabled and requires explicit enable. A disabled client or loss of all current private keys cannot use this endpoint: keep it denied and seek reviewed replacement/recovery. No key overwrite or weaker authentication bypass exists.
- The authorization-code barrier captures generations before authorization, persists pending signed-consent provenance, and captures only provider-created codes. Relative consent redirects are resolved against the issuer. Nested consent authorization invokes after-hooks twice: identical captured code processing is idempotent, without extending its lifetime. Saved pending generations take precedence over nested generation capture. Revocation while consent is pending cannot mint a usable credential after re-enable.
- Individual registry token revocation is permanent/idempotent. Session/user/sender-key/signing-key epoch invalidation denies affected resource credentials. This UI deliberately exposes no generic epoch reset. These incident actions are scoped to the configured issuer.
- Native logout or deletion/expiry of the originating provider session denies subsequent Nexus credential checks. An operator's session-epoch invalidation denies resource credentials from that session; it does **not** delete its browser session. User-epoch invalidation is resource credential denial, not global suspension. Current verified-user status, live session, provider client/resource and local binding/application state are required. Admission permit removal remains login admission policy, not an immediate session-revocation feature.
- Native OAuth revocation success alone is not the supported positive-registry JWT revocation procedure. Use the operator `revoke_token`/epoch workflow for this profile. No refresh/offline grant is issued. Existing consumer sessions are consumer-owned; every protected Nexus operation still requires a current online decision. Already in-flight decisions retain the existing ≤5s budget.
- Audit journal reservation precedes provider mutation; final state/target/reason/key IDs/operation policy and generation transitions are durable before success. Raw assertions, private keys, tokens and secrets are not journaled or returned. Audit failure denies; no stale allow. Started/failed operations are investigation records, not a license to retry with altered payloads.

## Schema and rollout

No migration file was added or edited in this task. Existing candidate `0011_identity_credential_administration.sql` creates only the Identity-owned durable request/audit journal, with restrictive user FK; it does not alter provider tables. It is required before enabling this workflow and is **not applied** by this work. Its SHA-256 is:

`7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264`

Disposable tests apply all historical/candidate migrations to isolated fresh/populated PostgreSQL. Historical SQL remains immutable. Before persistent application: reconcile branches/actual ledger and hashes, review runtime privileges and migration ownership, rehearse in isolation, verify a private backup/restore and approve the exact target/window. Application rollback disables the administration/consumer gates; retain journal, mappings, generations and audit data. Never automatically drop security history or reset generations.

## Sandcastle Development human profile

| Setting | Exact plan |
| --- | --- |
| Issuer | `https://5480-deb13.lan.com:5180/api/auth` |
| Resource / sole access-token audience | `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| Grant / response | `authorization_code` / `code`, PKCE S256 |
| Client authentication | `private_key_jwt`, ES256, assertions ≤60 seconds; registered owner-approved public JWKS only |
| Callback | `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Scopes | `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| DPoP | Required; separate BFF-held ES256 sender key, `dpop_jkt`, proof/ATH/replay and resource nonce checks |
| Access token | Native EdDSA `at+jwt`, ≤300 seconds, one resource audience; no ID token used as Nexus authorization |
| Consent | `skip_consent:false`; native signed query, explicit Allow/Deny and resume |
| Subject | Public provider access subject, mapped from verified native issuance to stable local IS user; issuer/client/namespace scoped immutable mapping |
| Binding | New `sandcastle` application UUID + unique `development` client link + Identity resource/scopes binding; initially disabled |
| Operations | Owner-approved exact M11 operation names; `[]` until approved. Example operation names in tests are synthetic, not approved production policy. |
| Consumer POST Origin | `https://5480-deb13.lan.com:5182`, only when separately configured/activated |
| Revocation | Operator disable immediately denies generations; revoke individual issuance JTI or relevant session/user/key generation; repair/read back then explicit enable for fresh authorization only |

This is a dedicated human resource client, separate from Sandcastle's existing production OIDC login and any future machine/service client. It grants no `client_credentials`, refresh/offline access, delegation or broad service scopes. A development Nexus subject is not automatically equivalent to a production login subject, even if emails match. Cross-issuer links require separately approved stable-identity proof. No automatic email merge or cross-issuer bootstrap is provided.

## Validation evidence

Node v24.22.0/npm 11.19.1; actual pinned Better Auth/provider 1.7.10. No existing database used by protocol/PG suites; fixtures initialize their own clusters and synthetic sessions/users/keys. The operator session used for administration is fresh because earlier lifecycle tests intentionally delete sessions.

| Check | Result |
| --- | --- |
| Administration + Identity + all Consumer API protocol regressions | PASS: 43 tests, including explicit consent denial/completion; single audience and stable mapping; >60s assertions/wrong signature; stale codes/JWTs after re-enable; pending-consent revocation; rotated-key issuance; current verified-user denial; duplicate/concurrent administration and final-audit failure |
| Existing membership PG + provider compatibility | PASS: 57 tests, including real concurrency, CSRF/authorization/cross-tenant denial, audit/migration compatibility and provider assertion audience/replay tests |
| Standard unit/route suite | PASS: all nine test files, including new administration HTTP origin/session/gate/body/error tests |
| Route generation + typecheck | PASS in isolated source copy |
| Production build | PASS outside sandbox with webpack, isolated source copy and synthetic unreachable database; sandbox TypeScript subprocess output failed first |
| Google compatibility | Existing provider/OIDC tests and unchanged Google configuration; owner-reported browser login only, no new independent Google browser acceptance |

The new tests caught real defects in the incoming draft: unsupported strip-only parameter properties, an invalid reused test session, missing canonical resource-link read-back, unsupported admin JWKS updates, relative consent URLs, double after-hook capture and nested consent generation replacement. These were corrected without weakening the issuance barrier. A temporary dependency copy exhausted `/tmp`, causing one regression attempt to fail; the task-created copy was removed and both regression suites subsequently passed. No failed attempt is counted as acceptance.

## Commands and calls awaiting separate approval

The following are **prepared, not executed against persistent state**. No gate settings were changed. Do not run the historical 0008–0010 command appendix again based on this report.

After target/ledger/branch/hash, backup/restore, runtime-grants and isolated rehearsal approval, this guarded command applies only the reviewed pending journal migration. The environment file supplies connection credentials without printing them. The explicit local loopback exception is not suitable for Neon; a Neon target instead requires separately verified project/branch/direct endpoint and verified TLS.

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
# Set this only after separate approval of target, backup/restore and this exact hash:
export IS0001B_APPLY_AUTHORIZED='is_dev:0011:7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264'
node --env-file=.env.development.local --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
const name='0011_identity_credential_administration.sql';
const hash='7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264';
assert.equal(Number(process.versions.node.split('.')[0]),24);
assert.equal(process.env.IS0001B_APPLY_AUTHORIZED,'is_dev:0011:'+hash);
for(const key of ['NEXUS_OAUTH_ADMIN_ENABLED','IDENTITY_NEXUS_CREDENTIALS_ENABLED','NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED'])assert.notEqual(process.env[key],'true');
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port||'5432','5432');
assert.equal(url.pathname,'/is_dev');assert.equal(decodeURIComponent(url.username),'is_dev');
for(const key of url.searchParams.keys())assert.ok(['sslmode','uselibpqcompat'].includes(key));
const files=(await readdir('db/migrations')).filter(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
assert.equal(files.at(-1),name);
const hashes=new Map();for(const f of files)hashes.set(f,createHash('sha256').update(await readFile('db/migrations/'+f)).digest('hex'));
assert.equal(hashes.get(name),hash);
const db=new pg.Client({connectionString:url.href,ssl:false,options:'-c default_transaction_read_only=on -c statement_timeout=5000'});
try{
 await db.connect();
 const target=(await db.query('SELECT current_database() db,current_user role,host(inet_server_addr()) host,inet_server_port() port,pg_is_in_recovery() standby')).rows[0];
 assert.deepEqual(target,{db:'is_dev',role:'is_dev',host:'127.0.0.1',port:5432,standby:false});
 const ledger=(await db.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows;
 assert.deepEqual(ledger.map(r=>r.name),files.slice(0,-1));
 for(const r of ledger)assert.equal(r.sha256,hashes.get(r.name));
 assert.equal((await db.query("SELECT to_regclass('public.identity_credential_administration') AS present")).rows[0].present,null);
}finally{await db.end();}
const result=spawnSync(process.execPath,['scripts/migrate-app.mjs'],{stdio:'inherit',env:{...process.env,NODE_ENV:'development',IS_DATABASE_SSLMODE:'disable',PGOPTIONS:'-c lock_timeout=5s -c statement_timeout=30s'}});
if(result.error)throw result.error;process.exitCode=result.status??1;
NODE
```

Reconcile the post-application ledger/table/grants read-only, then stop. Migration approval does not activate administration or consumers. The guard is an acknowledgement, not evidence that backup/restore or approval occurred.

After separate approval for administration/Identity configuration and actual resource/client creation, use the existing operator UI. Equivalent exact browser-context calls below intentionally require an already authenticated operator page on the IS HTTPS origin. Do not export cookies to a shell or fabricate a principal. Supply the owner-approved public JWKS and existing application UUID from the UI; these inputs are unavailable today, so no completed registration command/ID is invented.

```js
async function administer(body) {
  const response = await fetch('/api/nexus/registry/applications/oauth/consumer', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if (!response.ok) throw new Error('Administration failed; inspect the redacted result and journal before retry');
  return response.json();
}
// Preserve each object/requestId for retries. Execute each step only when approved.
const resourceRequest = {action:'resource', environment:'development',
  requestId:crypto.randomUUID(), reason:'Approved Nexus Development resource registration'};
// await administer(resourceRequest);
// Existing application UI: create Sandcastle/sandcastle only if not already present.
// Then set applicationId to its actual UUID, publicJwks to owner-approved public keys.
// const clientRequest = {action:'provision',environment:'development',
//   requestId:crypto.randomUUID(),reason:'Approved Sandcastle Development human client',
//   applicationId, jwks:publicJwks, operations:[]};
// const staged = await administer(clientRequest); // staged.disabled === true
// After separate read-back/operation/gate acceptance approval:
// const enableRequest = {action:'enable',environment:'development',
//   requestId:crypto.randomUUID(),reason:'Approved fresh human authorization',clientId:staged.clientId};
// await administer(enableRequest);
```

No operation is approved merely by appearing in an example. Before initial provision, replace `operations:[]` only with an explicitly approved operation list; otherwise access evaluations for operations remain denied. Never grant tenant membership/entitlements as a side effect. All enabling and any real credential issuance need their own bounded acceptance approval.

Reproducible local-only validation:

```bash
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
npm test
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:administration
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:memberships:pg
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:compat
# Run next typegen, typecheck and production build in an isolated copy to preserve live .next.
```

## Remaining live acceptance

Obtain owner public JWKS/key custody, approved operations and application UUID; review/apply candidate 0011 only after exact target/ledger/backup approvals. Separately approve administration and Identity configuration, persistent resource/client creation, read-back and deliberate consumer/membership activation. Then verify real trusted-browser consent UI/redirect resume, Sandcastle callback/PKCE/state, DPoP TLS/nonce flow, actual single audience/mapping, cross-user/tenant denial and revocation under an approved window. Verify the originating IS logout and privileged-page denial, denied Google admission if separately approved, administrator/operator access and session revocation independently. Review least-privilege runtime roles and orphan recovery. Cross-issuer identity linkage and Sandcastle repository integration remain separate approvals. No deployment, push, merge or persistent provisioning follows this local validation.
