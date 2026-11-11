# IS#0001-E — Sandcastle public-key reconciliation and provisioning readiness

**Subsequent approved migration acceptance — 2026-11-11:** Reviewed D/E changes were checkpointed at `c9157a9`; the exact approved guard then applied 0011 to local `is_dev` only. [All post-migration checks pass](IS-0001E-MIGRATION-0011-ACCEPTANCE.md): ten hashes, preserved old records/governance, 55 validated FKs, healthy canonical HTTPS and gates off. The preparation below is historical for Git/ledger/approval status; resource/client/grant registration and activation remain unapproved and unperformed.

2026-11-11. **Public handoff validated; persistent migration/provisioning/activation NOT performed. Stop at migration 0011 approval.** TLS remains healthy. No Sandcastle, IG or Axtor file was modified; no Sandcastle private file was read/imported/copied and no replacement key/assertion/credential was generated.

## Current Git, environment and inventory

Branch `feature/nexus-consumer-runtime`, HEAD `aaa74d774d3cd3109cf817c5d8dfe57d1d6531e4` (`IS#0001-C: checkpoint development acceptance preparation`). Starting work already contained D's uncommitted `package.json`, local-development guide, Sandcastle handoff and new D recovery report. Those changes are preserved. E adds this report, the exact migration-approval document and a public-only JWKS artifact, and updates the handoff to reflect those public inputs. No commit/staging/reset/clean/push/merge was performed in E. The guarded migration requires a reviewed clean checkpoint before execution.

`npm run dev` still pins native `0.0.0.0:5180` and `/home/user/certs/is/dev-key.pem` + `dev-cert.pem`. Fresh read-only process inspection found the single existing Next CLI 1536532 with those exact arguments. System-trusted canonical TLS passes, TLS 1.3, served leaf SHA-256 `504a04d44d38f96d36a5486785a2bd20eae545ae607c7912185622a459ff4c4d`, matching the existing dedicated file. No listener restart, certificate/trust/environment change occurred in E.

Fresh anonymous canonical HTTPS checks: homepage, sign-in, health/readiness, both discovery documents and native JWKS 200; anonymous privileged APIs 403; four consumer endpoints and consumer administration remain gate-off 404. No cookie or user credential was used. Earlier Google login is still owner-reported; E performed no external login or OAuth initiation.

Bounded read-only verification again identified the exact loopback `is_dev` database/role. The nine-entry ledger through 0010 exactly matches all source hashes; only 0011 is pending and its journal is absent. There are 45 public tables, zero unvalidated FKs, one existing user, two sessions, one IS administrator and one Nexus operator. OAuth clients/resources/client-resource links, Nexus applications/app-client links, Identity bindings/issuances/mappings/code barriers, tenants/memberships/entitlements and operation grants are all **zero**. There is no existing registration to reuse **at inspection**; repeat this inventory immediately before approved creation.

All four gates (`NEXUS_MEMBERSHIPS_ENABLED`, `NEXUS_CONSUMER_API_ENABLED`, `IDENTITY_NEXUS_CREDENTIALS_ENABLED`, `NEXUS_OAUTH_ADMIN_ENABLED`) remain unset/off. Resource/environment/trusted-consumer-origin configuration remains unset. The role remains a non-superuser database/table owner; existing owner privileges cover schema CREATE, user REFERENCES and journal DML. No new GRANT is necessary for this local owner and none was made. Owner/runtime separation remains a production security prerequisite.

## Public handoff and JOSE evidence

Only the requested public Markdown handoff was read:

`/home/user/src/sandcastle/backend/docs/M11_OAUTH_CLIENT_KEY_HANDOFF.md`

Its SHA-256 at inspection is `5c51d828cdf9ad2407bb34c4c441aa81025b33a5a1808bc071d24d727742d3c7`. The inline JSON was copied as a nonsecret review artifact, [sandcastle-development.public.jwks.json](oauth/sandcastle-development.public.jwks.json), not a provider record or runtime configuration. Artifact SHA-256: `cfee1c6a84f1422db56d57918afe9bba897d22605696ff8186f1c0e1a56137bf`.

| Validation | Actual result |
| --- | --- |
| Structure | Exactly one `keys` member, one public key; no remote JWKS URL |
| Type / curve / algorithm / use | `EC` / `P-256` / `ES256` / `sig` |
| kid | `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`; unique in supplied set and valid bounded IS identifier |
| x/y | Canonical base64url, 32 bytes each; JOSE 6.2.12 `importJWK(...,'ES256')` accepted the actual public point |
| Public-only | Only `crv,kty,x,y,kid,alg,use`; no `d`, symmetric material, private PEM, remote URL or other parameter |
| Round trip | JOSE `exportJWK` returned identical public coordinates and a public CryptoKey |
| RFC 7638 SHA-256 thumbprint | `nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`; exactly matches the handoff's `sandcastle-dev-` kid convention |
| IS checks | Existing `publicKeys` validator and provision parser accepted it with the exact proposed operation |
| Pinned provider interface | Better Auth/provider 1.7.10 `adminCreateOAuthClient.options.body.safeParse` accepted the complete planned client body with this inline JWKS; schema-only call, no endpoint execution |

The schema check and existing actual-provider synthetic protocol suite establish supported inline registration. No HTTPS JWKS endpoint is required or invented. No handoff key was registered even in a disposable provider. No private file was opened, copied into IS or imported. No Sandcastle helper command was run. Sandcastle's description of private-key ownership/permissions is **owner-provided custody evidence**, not independent IS inspection; possession of its corresponding private key still needs the approved live client assertion. Do not run the older key-generation procedure or manufacture a replacement now that the public handoff exists.

Non-mutating public-artifact revalidation, under Node 24:

```bash
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importJWK,exportJWK,calculateJwkThumbprint} from 'jose';
const jwks=JSON.parse(await readFile('docs/oauth/sandcastle-development.public.jwks.json','utf8'));
assert.deepEqual(Object.keys(jwks),['keys']);assert.equal(jwks.keys.length,1);
const key=jwks.keys[0];
assert.deepEqual(Object.keys(key).sort(),['kty','crv','x','y','kid','alg','use'].sort());
assert.equal(key.kty,'EC');assert.equal(key.crv,'P-256');assert.equal(key.alg,'ES256');assert.equal(key.use,'sig');
for(const coordinate of [key.x,key.y]){assert.match(coordinate,/^[A-Za-z0-9_-]{43}$/);assert.equal(Buffer.from(coordinate,'base64url').length,32);assert.equal(Buffer.from(coordinate,'base64url').toString('base64url'),coordinate);}
const imported=await importJWK(key,'ES256');assert.equal(imported.type,'public');
const roundTrip=await exportJWK(imported);assert.equal(roundTrip.x,key.x);assert.equal(roundTrip.y,key.y);
assert.equal(key.kid,'sandcastle-dev-'+await calculateJwkThumbprint(key,'sha256'));
console.log('Public JWKS accepted; no registration performed.');
NODE
```

## Exact discovered identifiers and final resource decision

Both live canonical discovery documents returned 200 at 09:24 UTC:

- `https://5480-deb13.lan.com:5180/api/auth/.well-known/openid-configuration`
- `https://5480-deb13.lan.com:5180/api/auth/.well-known/oauth-authorization-server`

They independently report:

| Identifier | Final exact value |
| --- | --- |
| IS issuer | `https://5480-deb13.lan.com:5180/api/auth` |
| Authorization endpoint | `https://5480-deb13.lan.com:5180/api/auth/oauth2/authorize` |
| **Discovered token endpoint / Sandcastle assertion audience** | **`https://5480-deb13.lan.com:5180/api/auth/oauth2/token`** |
| IS signing JWKS | `https://5480-deb13.lan.com:5180/api/auth/jwks` — separate from Sandcastle client assertion JWKS |
| **Final single Nexus resource / access-token audience** | **`https://5480-deb13.lan.com:5180/api/nexus/v1`** |
| Sandcastle callback | `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Sandcastle BFF Origin | `https://5480-deb13.lan.com:5182` |

The token endpoint matches the handoff expectation **after live confirmation**, not by assumption. The Nexus audience is an explicit IS contract/provider/consumer-policy decision: `consumerPolicy` requires the exact configured same-origin `/api/nexus/v1` resource; resource registration uses it as `identifier`, binding/issuance/API validation use it as exact `audience`, and the approved human profile requires one audience. Its equality to the API base is deliberate, not inferred from the Sandcastle note. It is neither issuer nor callback and has no trailing slash. The application/real OAuth client IDs remain unassigned until approved server creation; none is invented here.

Current gate-off discovery advertises only login scopes (`openid profile email offline_access`), although the native provider globally advertises machine/refresh grants and `private_key_jwt`. Those global capabilities are not grants to this new client. The four Nexus scopes appear only after separately approved Identity configuration; no fallback to a login or machine token is permitted.

## Fixed human client and assertion policy

| Field | Exact reviewed profile |
| --- | --- |
| Label / application / environment | `Sandcastle Development Nexus` / active `sandcastle` application UUID / `development` |
| Client class | Confidential web, native-generated client ID; no client secret generated for `private_key_jwt` |
| Grant / response / proof | `authorization_code` / `code`, PKCE S256, required DPoP and `dpop_jkt` |
| Client authentication | `private_key_jwt`, supplied inline public ES256 JWKS and exact kid above |
| Assertion | `iss=sub=assigned client_id`, exact discovered token endpoint `aud`, fresh random one-use `jti`, integer `iat`/`exp`, lifetime 1–60s |
| Server enforcement | Application explicitly sets `assertionMaxLifetime:60`; provider verifies registered key/signature, identity, expiry/audience and database-backed atomic assertion replay prevention |
| Scope ceiling | `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| Resource token | Native EdDSA `at+jwt`, ≤300s, sole Nexus audience, positive issuance-registry/code-generation binding, online validation |
| Operation | Exact `sandcastle:tenant.access`, canonical tenant/application eligibility only |
| Consent / subject | `skip_consent:false`, explicit native signed Allow/Deny/resume; proposed public access subject mapped to stable local IS user from verified native issuance |
| Initial state | Disabled provider client and denied credential generation after successful read-back/binding/audit |
| Excluded grants | No `client_credentials`, refresh/offline access, delegation, token exchange, wildcard or broad service operation |

Provider token authentication also supports its normalized issuer audience; Sandcastle's preparation deliberately uses the narrower exact discovered token endpoint. Credential-rotation assertions must target the separate exact `https://5480-deb13.lan.com:5180/api/auth/oauth2/client/rotate-keys` endpoint, never reuse a token-endpoint assertion there. No weaker secret/basic/Bearer/ID-token fallback is added to the resource profile. Required DPoP sender keys are separate BFF-owned keys; the public assertion JWKS does not prove DPoP readiness or authorize a resource request.

The handoff says existing Sandcastle production OIDC login still uses HTTP Basic and `openid profile email`; its new assertion module is offline preparation and not yet connected to Authorization Code redemption. This does not invalidate the supplied public key, but it is a remaining separately approved consumer-integration requirement. No Sandcastle code/configuration was inspected beyond the requested public handoff or changed in E.

## Migration 0011 approval readiness

**Ready for review, not applied.** Exact SQL SHA-256:

`7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264`

E reran the exact-runner fresh/populated/restored disposable PostgreSQL rehearsal: **4 tests PASS**. It verifies ordinary-owner migration privileges, complete old-row digests/trigger preservation, existing OAuth client/session preservation, ordered hashes/no-op rerun, journal ownership/default-grant denial, duplicate/audit/FK checks and retained last-operator/tenant-admin protections. The existing administration/Identity/Consumer protocol suite also reran: **44 tests PASS**, with synthetic clients/keys only, preserving real development records and this public handoff key.

The actual pre-0011 recovery archive remains:

`/home/user/backups/is_dev/pre-0011-2026-11-11T07-56-57.543Z.dump`

SHA-256 `43d6b1086cab1dfd387dba323da8c290dd85c4910fb96342cbdf2bc27c46fdd8`; protected adjacent manifest; 0600 files in 0700 directory. C already restored it into a private empty ordinary-role recovery database with all 45 table digests equal and zero unvalidated FKs. E reverified the archive hash and **all 45 current live table digests plus all nine ledger entries still match**, at 09:24 UTC. No new export/restore or live write was needed. Recheck immediately before migration; stop for a reviewed fresh backup if data/ledger changed.

The exact guarded command is in [migration 0011 approval](IS-0001E-MIGRATION-0011-APPROVAL.md). It retains C's literal local-target, clean reviewed checkpoint, backup/restore/hash, all-source-hash, ledger, table-digest and gate-off guards. The currently dirty D/E tree is a deliberate execution blocker until reviewed/checkpointed; do not weaken the guard or apply against unreviewed files. Setting acknowledgement variables alone is not authorization. No direct provider-table insert, Better Auth schema migration or bootstrap tool is part of that command. No migration source changed.

## Exact post-migration provisioning sequence — NOT EXECUTED

1. **Read-only post-0011 acceptance:** verify ten exact ledger rows, new journal owner/FK/checks, old data/trigger preservation, no unexpected grants and gates still off. Repeat resource/client/application/binding inventory. If a registration now exists, inspect exact owner/profile/linkage and reuse only if explicitly reviewed; mismatches/partial journals stop creation.
2. **Separately approve administration/Identity configuration:** preserve canonical `BETTER_AUTH_URL`; configure the exact Nexus resource, `development`, BFF Origin, and Identity/admin gates using C's reviewed profile. Keep consumer/membership gates false. Retain the restored explicit TLS startup. A gate/config change is not covered by migration approval.
3. **Resource action:** existing authenticated operator UI submits `{action:'resource',environment:'development',requestId:<one retained UUID>,reason:<reviewed reason>}`. Service uses supported Better Auth resource APIs to create exactly the Nexus identifier, EdDSA, TTL 300, required DPoP and four allowed scopes; verifies read-back. Requires explicit resource-action capability in addition to current Nexus operator/session.
4. **Application action:** if still absent, existing operator registry `POST /api/nexus/registry/applications` with `{"key":"sandcastle","name":"Sandcastle","description":"Sandcastle Development human consumer profile reviewed in IS#0001-E"}`. Retain its actual returned UUID. Matching pre-existing applications are reused after review; no fabricated UUID, membership or entitlement is created.
5. **Client/binding/operation action:** submit the exact `provision` body below through `/api/nexus/registry/applications/oauth/consumer`, using only the actual returned application UUID and the supplied public JSON. The server fixes callback, grants/auth/PKCE/DPoP/subject/consent/resource/scopes, creates through native APIs, disables/read-backs the provider client, then transactionally records Nexus/Identity environment binding, exact operation and journal/audit. Return the actual native client ID to the future Sandcastle acceptance handoff; no ID or secret is available yet.
6. **Audit/read-back and stop:** verify kid/coordinates, callback, auth method, scope/resource/grant ceilings, disabled state, issuer/app/environment binding and only `sandcastle:tenant.access`; retain receipt UUID and returned IDs. No secret, assertion, token, proof, private key or pasted cookie belongs in output/logs. Native resource/client and local transactions are separate: a partial failure stays denied and requires orphan/journal review. Do not retry with a new request UUID to bypass a failed operation.
7. **Separate later approvals:** client enablement/new credential issuance; governed tenant fixtures/entitlements; membership/consumer gate activation; real browser consent/DPoP/registry/revocation/four-route acceptance. Provisioning creates no tenant access. Do not combine these with migration approval.

Public review payload construction (browser on the canonical IS origin, existing authorized session; **prepare only**, no POST is executed):

```js
const publicJwks={keys:[{
  crv:'P-256',kty:'EC',
  x:'hu0PRAqk53_oHUUDFqxZRZDB69SEka5nYdQN4y825ag',
  y:'_7jTQ8AyOc3see8tqCdU-Vm2Lw-j3vvpUEpS68UmAMQ',
  kid:'sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I',
  alg:'ES256',use:'sig'
}]};
function prepareClientRequest(actualApplicationId,retainedRequestId){
 return {action:'provision',environment:'development',requestId:retainedRequestId,
  reason:'Approved Sandcastle Development human client, IS#0001-E',
  applicationId:actualApplicationId,jwks:publicJwks,operations:['sandcastle:tenant.access']};
}
// No fetch/registration here. Actual application UUID and retained request UUID
// are mandatory approved execution inputs; none is invented in this report.
```

The exact provider-owned fields imposed by the service are `client_name:'Sandcastle Development Nexus'`, `application_type:'web'`, `redirect_uris:['https://5480-deb13.lan.com:5182/api/auth/callback']`, `token_endpoint_auth_method:'private_key_jwt'`, supplied `jwks`, `grant_types:['authorization_code']`, `response_types:['code']`, exactly the four-scope string, `resources:['https://5480-deb13.lan.com:5180/api/nexus/v1']`, `require_pkce:true`, `dpop_bound_access_tokens:true`, `subject_type:'public'`, `skip_consent:false`; metadata records Development environment and request UUID. Do not invoke native APIs outside the scoped orchestrator, use the legacy OIDC secret/consent-bypass registration script, or manually insert provider rows.

## Required authority and lifecycle

Every mutation requires exact IS Origin/JSON, bounded input, server-verified live session and explicit current Nexus operator, transactionally rechecked for local security writes. IS administrator and tenant administrator do not inherit Nexus operator rights. Resource creation additionally requires explicit resource-action context; ordinary client provisioning may only read/link the exact resource. There is no independently persisted resource-admin human role invented here. Better Auth enforces registering-owner privileges; cross-owner recovery is not silently allowed. Its credentials/keys/redirects remain authoritative; Nexus holds associations/entitlements and Identity holds issuance/mapping/security epochs.

For separately approved incidents, use the same audited privileged endpoint with retained request UUID, development environment and reason:

- `disable` + actual `clientId`: deny/increment generation before native disable. Old codes/JWTs remain invalid after subsequent enable.
- `revoke_token` + actual registry `tokenId` (JTI): permanent/idempotent individual revocation. Native OAuth revocation success alone is not the supported positive-registry JWT procedure.
- `invalidate` + reviewed `kind` (`session`, `user`, `sender_key`, `signing_key`) and stable `key`: deny affected resource credential generations. This is not browser-session deletion or global suspension.
- `keys` + actual `clientId`, approved public JWKS and a ≤60s one-use assertion from the current registered key addressed to the exact rotation endpoint: supported native rotation, denied generation first, remains disabled afterward. No private key upload. Disabled provider client/lost-key recovery needs separate approved replacement, never basic/secret fallback.

## Consent, mapping and remaining blockers

Explicit signed native consent must request the four scopes and single resource and be tested for Allow, Deny and correct resume/code invalidation with a real approved development identity. A public native access subject is mapped by verified same-issuer issuance evidence to the stable local IS user; no guessed mapping is preseeded. Pairwise runtime remains fail-closed without its separately reviewed composition. Sandcastle's existing login issuer is production according to the handoff; email equality never links it to local Development IS. Cross-issuer stable-subject linking requires separate proof/approval. A human ID token never authenticates Nexus APIs.

Remaining blockers: reviewed D/E checkpoint and explicit 0011 approval; exact public-key/client/resource/operation review and custody/possession confirmation; administration/Identity gate/configuration and persistent registration approval; actual native client/application IDs; separate DPoP sender-key and Sandcastle transport integration readiness; governed tenant fixtures/entitlements and activation approvals; protected live consent/issuance/DPoP/lifecycle/four-route acceptance; cross-issuer mapping if existing production login is retained; production least-privilege/deployment/integration review. The supplied public key clears the missing-public-JWKS input, **not** these approvals or live acceptance.

Next authorized boundary is the reviewed checkpoint plus the exact guarded **0011-only** command in the linked approval document. No persistent operation was performed; no key replacement/generation is required. Do not push, merge, deploy or modify another application's repository.
