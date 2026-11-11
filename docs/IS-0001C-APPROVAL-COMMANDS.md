# IS#0001-C — Commands and payloads pending separate approval

These are preparation, **not authorization**. See [current evidence and blockers](IS-0001C-DEVELOPMENT-ACCEPTANCE.md). No command below has been used to change the listener, schema, gates, keys or registrations. The already completed private backup/recovery check is recorded separately. Re-identify targets and review the exact checkpoint before approval; acknowledgement variables do not themselves constitute approval.

## 1. Restore canonical development TLS — approval required

Current port-5180 certificate omits `5480-deb13.lan.com`. Do not replace the issuer, accept an insecure connection, regenerate the suite CA or reuse another application's key. The documented dedicated IS leaf still covers the exact hostname. First re-identify the current listener/owner:

```bash
ss -ltnp 'sport = :5180'
openssl verify -CAfile /home/user/.local/share/mkcert/rootCA.pem \
  -verify_hostname 5480-deb13.lan.com /home/user/certs/is/dev-cert.pem
```

Only after separate approval, the verified owner should gracefully stop the existing listener using its current supervisor/foreground session, then start **one** instance with the existing files:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
export NODE_EXTRA_CA_CERTS=/home/user/.local/share/mkcert/rootCA.pem
npm run dev -- --hostname 0.0.0.0 --port 5180 --experimental-https \
  --experimental-https-key /home/user/certs/is/dev-key.pem \
  --experimental-https-cert /home/user/certs/is/dev-cert.pem
```

No blind kill of the historical PID is prepared: it may change before approval. Recheck certificate-verified canonical health, readiness, discovery/JWKS and anonymous denial after the approved restart. Stop if another listener owns the port. Restoring TLS does not authorize gates or provisioning.

## 2. Private backup refresh — completed once; each rerun needs approval

The current archive and real isolated recovery proof are in the acceptance report. To refresh after writes or a changed review window, separately approve the guarded, versioned helper:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
export IS0001C_APPROVED_COMMIT='<reviewed full IS#0001-C checkpoint SHA>'
IS0001C_BACKUP_AUTHORIZED='is_dev:pre-0011' node scripts/is0001c-backup-restore.mjs
```

It requires the exact clean checkpoint, unchanged reviewed SQL, gates off, literal loopback `is_dev`/role and a private existing backup directory. It exports one consistent snapshot to a mode-0600 archive/manifest, restores only into a new private Unix-socket-only empty recovery database under an ordinary role, compares all table digests, then removes that disposable cluster. It never migrates live or restored data. A failed/partial archive must remain private and be reviewed, not treated as verified recovery. Ownership/ACL restoration and writes after the snapshot remain explicit real-recovery decisions.

## 3. Apply only 0011 to local is_dev — separate approval required

The exact approved SQL SHA-256 is `7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264`. This guarded command requires the verified backup, unchanged reviewed source/checkpoint and exact nine-entry ledger. It also refuses changed table digests since the backup: refresh/review the private backup if that fails. No Better Auth schema migration, bootstrap, grants, registration or activation accompanies it.

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

This local loopback TLS exception does not apply to Neon. For a different project/branch/database, stop and prepare a separately verified direct TLS target. After approved application, verify ten source/ledger checksums, new journal owner/grants/FK/checks, unchanged old table digests and governance triggers using read-only queries. Stop on a partial ledger/error. Do not drop data or immediately retry. Keep all gates off. No automatic restore/rollback is authorized.

## 4. Sandcastle-owned ES256 keys — prepare only; no keys generated

After separate owner authorization, run the following **on the Sandcastle-controlled host**, with its approved private directory outside any repository and protected persistent storage. Do not run it on IS on Sandcastle's behalf. It creates one dedicated development assertion key, unique `kid` and inline public JWKS; a separate BFF-owned DPoP sender key must also be approved/managed. Do not reuse IS signing keys, production keys or the client assertion key as the DPoP sender key.

```bash
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
export SANDCASTLE_DEV_KEY_DIR='<owner-approved absolute private directory that does not yet exist>'
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
const directory=process.env.SANDCASTLE_DEV_KEY_DIR;
assert(directory&&isAbsolute(directory)&&!directory.includes('<'));
process.umask(0o077);
await mkdir(directory,{mode:0o700,recursive:false}); // Refuses existing directory/key overwrite.
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const kid='sandcastle-development-'+randomUUID();
const jwks={keys:[{...publicKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig'}]};
const json=JSON.stringify(jwks,null,2)+'\n';
await writeFile(join(directory,'client-assertion.private.pem'),privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
await writeFile(join(directory,'client-assertion.public.jwks.json'),json,{mode:0o600,flag:'wx'});
await writeFile(join(directory,'development-key-manifest.json'),JSON.stringify({environment:'development',purpose:'Sandcastle confidential human OAuth client assertions',kid,algorithm:'ES256',publicJwksSha256:createHash('sha256').update(json).digest('hex')},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Development key stored privately. Share only client-assertion.public.jwks.json and its public manifest.');
NODE
```

The owner must review the chosen directory's parent ownership/symlinks, backup/encryption/secret-manager policy and process access before execution. Treat partial output after a failure as a key-custody incident to inspect, not permission to overwrite. IS receives **only** the public JWKS and custody/public-fingerprint confirmation. Inline public JWKS is supported securely by Better Auth 1.7.10 and IS validation; no HTTPS JWKS endpoint or fabricated URL is required. The JWKS must contain only public P-256 ES256 signing fields and 1–2 unique `kid`s. No `d`, symmetric key, remote URL or private PEM belongs in the administration form, Git or logs.

## 5. Administration/Identity configuration and provisioning — separate approval required

After canonical TLS and 0011 acceptance, review these configuration changes without applying them now:

```dotenv
BETTER_AUTH_URL=https://5480-deb13.lan.com:5180
NEXUS_CONSUMER_RESOURCE=https://5480-deb13.lan.com:5180/api/nexus/v1
NEXUS_CONSUMER_ENVIRONMENT=development
NEXUS_CONSUMER_TRUSTED_ORIGINS=https://5480-deb13.lan.com:5182
IDENTITY_NEXUS_CREDENTIALS_ENABLED=true
NEXUS_OAUTH_ADMIN_ENABLED=true
NEXUS_MEMBERSHIPS_ENABLED=false
NEXUS_CONSUMER_API_ENABLED=false
```

Changing either Identity/admin gate needs explicit approval and a controlled single-server restart retaining the dedicated certificate. Four human scopes become advertised by the approved Identity profile. No resource/client auto-seed is present. Keep human production OIDC login unchanged.

Provisioning still requires owner public JWKS and review of this exact configuration. In the existing authenticated Nexus operator UI at the canonical IS origin, re-read registry/provider inventory immediately before each approved mutation. Reuse exact matching application/client/resource records if present; stop on drift or partial/failed journal state. Do not bypass the service guard or direct-write provider tables. Register with the intended credential-owning operator; native ownership remains enforced.

Exact existing registry application body if still absent:

```json
{"key":"sandcastle","name":"Sandcastle","description":"Sandcastle application; Development human consumer binding reviewed in IS#0001-C"}
```

Use `POST /api/nexus/registry/applications`, with normal server session and exact IS Origin, then retain its actual returned UUID. Application registration grants no tenant access.

Exact administrative action bodies for **separately approved** execution:

```js
// These are browser-context helpers, not a shell actor/cookie bootstrap.
async function administer(body) {
  const r=await fetch('/api/nexus/registry/applications/oauth/consumer',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  const result=await r.json();
  if(!r.ok)throw new Error(result.error??'Administration failed; review journal before retry');
  return result;
}
// Preserve the same request objects/UUIDs on retries; do not resubmit changed payloads.
const resourceRequest={action:'resource',environment:'development',
  requestId:crypto.randomUUID(),reason:'Approved Nexus Development resource registration'};
// await administer(resourceRequest); // Explicit resource creation privilege/context.

// Set applicationId only to the reviewed UUID returned/read from the registry.
// Set publicJwks only to the approved Sandcastle-owned public JWKS.
// const clientRequest={action:'provision',environment:'development',
//   requestId:crypto.randomUUID(),reason:'Approved Sandcastle Development human client',
//   applicationId,jwks:publicJwks,operations:['sandcastle:tenant.access']};
// const staged=await administer(clientRequest);
// Verify staged.disabled === true and read back provider/client/application/environment policy.
```

The resource action creates exactly the Nexus audience, EdDSA signing, 300s access TTL, required DPoP and four established scopes. The provision action creates the exact HTTPS callback, `private_key_jwt` with inline keys, authorization-code/code + PKCE S256, DPoP, public subject, consent required, exactly one resource and the four scopes. It creates the resource link, Nexus/Identity environment associations and the single proposed operation under audit, then remains disabled. It cannot grant `client_credentials`, refresh/offline, wildcard scopes or delegation. No tenant, membership or entitlement is implicitly created. This operation is canonical eligibility only; Story/Canon/Scene resource authorization remains Sandcastle-owned.

Nexus operator authority is required for all actions. Resource creation additionally needs the explicit resource-action context checked by `resourcePrivileges`; client provisioning can only read/link the exact resource. This is an action-scoped privilege, not a newly invented global role. Resource update/delete/unlink and cross-owner transfer are unsupported. Better Auth is the only mutable credential authority.

Only after read-back and a separately approved acceptance window may the owner enable the client for **fresh** human authorization:

```js
// const enableRequest={action:'enable',environment:'development',
//   requestId:crypto.randomUUID(),reason:'Approved live human acceptance',clientId:staged.clientId};
// await administer(enableRequest);
```

For incidents, use `disable` with actual bound `clientId`, `revoke_token` with actual issuance JTI, or `invalidate` with reviewed session/user/sender-key/signing-key target. Each action needs its own stable request UUID/reason and current operator. Rotation uses `keys`, public JWKS and a one-use ≤60s assertion signed by a currently registered key for `https://5480-deb13.lan.com:5180/api/auth/oauth2/client/rotate-keys`; it denies generations before provider rotation and leaves the client disabled. Loss of all current private keys/disabled-provider-key recovery needs separately reviewed replacement, not a weaker fallback.

## 6. Live acceptance and activation — remain pending

Keep consumer/membership gates off until schema, TLS, resource/client keys/policy/binding, operation and governance fixtures are verified. Separately approve fixture tenants/memberships/entitlements, gate activation, live credential issuance and each disruptive revocation/outage test. Use the actual owner's browser, not stored database cookies. Record redacted consent/issuance/nonce/code/token/client/session outcomes, then all four API routes across zero/one/multiple/inactive/suspended/disabled/cross-tenant contexts. Every allow must have a matching actor/caller/tenant/application/operation and `validUntil` within snapshot+5s/token/nonce expiry. Repeat authorization at actual execution and queue side effects. Do not stop the shared DB or revoke the sole operator session without an explicit target/window.

Sandcastle integration and cross-issuer stable identity-link proof remain separate work; email equality is never proof. Production review still requires exact Neon/Vercel target/ledger/grants, backup/recovery, production-owned credentials, trusted HTTPS, full live matrix and independently approved Sandcastle integration. No push, merge, deployment or consumer-repository write is authorized by these commands.
