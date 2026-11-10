# Stage 2B — Identity protocol compatibility and Nexus API readiness

2026-11-09. Findings and implementation proposal for review, not authorization to implement consumer routes, change clients, apply persistent migrations or release a security-profile fallback. Read with the [draft contract](NEXUS-CONSUMER-API-CONTRACT.md), [OpenAPI](openapi/nexus-consumer-v1.openapi.json), [security matrix](NEXUS-CONSUMER-SECURITY.md) and [implementation plan](NEXUS-CONSUMER-IMPLEMENTATION-PLAN.md).

## Recommendation and release blockers

The smallest safe next implementation increment is an **Identity access-credential adapter with isolated conformance tests**, followed by the four human-only Nexus resource APIs once its release gates pass. No service credentials, domain resolution, root grants, actor-evidence forwarding or multi-hop exchange belong in the first API release.

The pinned provider implements substantial OAuth/DPoP support, but the complete draft profile is **not currently releasable**:

1. DPoP proof verification has no server-issued nonce challenge/validation interface. Proofs without a nonce and proofs with an arbitrary nonce both pass. Cross-instance replay reservation is available, but it does not satisfy the draft's server-nonce requirement by itself.
2. Individual self-contained JWT access tokens cannot be revoked through the provider revocation endpoint. It returns `unsupported_token_type`; the token remains active. Online session/client checks provide narrower invalidation, not arbitrary `jti` revocation or a complete global user-suspension policy.
3. A combined `openid` + Nexus-resource authorization issues a JWT with **Nexus and UserInfo audiences**. This violates the draft's exactly-one-audience rule. Resource-only authorization produces a single-audience human token but no ID token. The proposed login/resource authorization sequence must be explicitly reviewed.
4. Public/pairwise subject representations differ across token types and introspection. No generic, exported inverse pairwise-to-user resolver was found. Grant class is not a reliable inference from `sub` spelling, equality with `client_id`, or user-table existence. A verified Identity resolution/issuance interface is required.
5. The existing native environment has a non-loopback HTTP base URL, while live OIDC discovery reports HTTPS. This is a development interoperability gate; do not silently change the existing issuer, client IDs or callbacks.

No Bearer, cookie, ID-token, API-key, multiple-audience, email-linking or offline-signature-only fallback was introduced. RFC 8693 is separately blocked for the future delegation increment and does not need to block a compliant direct human API after the other gates are resolved.

## A. Repository and local-state reconciliation

Inspection began with a clean worktree on `chore/local-dev-infra`, HEAD `7f4b46c` (`Last preparations for dev environment`). Local `feature/nexus-tenant-memberships` and its recorded remote-tracking ref both point to `c4b96d3` and are ancestors of HEAD:

- `5e3338a`: Stage 1 memberships/admin/invitations.
- `c4b96d3`: Stage 2 contract/OpenAPI documentation on that same branch.
- `a31e6f2`, `7f4b46c`: subsequent development-environment preparation.

There is no separate Stage 2 contract branch in the available local refs. HEAD adds no consumer runtime or migration over `c4b96d3`; differences are development configuration/documentation and generated types. `git log --all -- db/migrations` shows no competing 0008 in available refs. Source sequence remains 0001–0004, 0006, 0007; no 0005. Local `master` is `e6ae723`, one commit ahead of recorded `is/master` (`556ba88`); those are older ancestry, not missing Stage 1 work. No fetch, merge, rebase, branch switch, commit or push occurred. Remote-tracking refs are a local snapshot, not proof of current server-side branch state. Reconcile the remote and migration reservation again before any approved 0008 work.

Read-only verification against explicitly guarded `127.0.0.1:5432/is_dev`, role `is_dev`, observed database/role/owner `is_dev`. All six ledger names and SHA-256 values match source; 42 public foreign keys are validated. No persistent schema, ledger, identity, registration or grants were changed.

| Observed local readiness | Result |
| --- | --- |
| Users / unexpired sessions | 1 / 1; aggregate counts only, no session credential reused |
| Admission emails / IS admins / Nexus operators | 1 / 1 / 1 |
| Tenants / memberships / governed tenants | 0 / 0 / 0 |
| File-loaded membership gate | `NEXUS_MEMBERSHIPS_ENABLED` unset, therefore off |
| Proposed consumer gate | `NEXUS_CONSUMER_API_ENABLED` unset; no implementation exists |
| Google development credentials | Both fields populated; ownership/validity/Console settings not verified |
| Native listener | Existing process on `0.0.0.0:5180`, preserved |
| Native file base URL | `http://5480-deb13.lan.com:5180`, preserved |
| Live discovery issuer | `https://5480-deb13.lan.com:5180/api/auth`, preserved |

The active listener/origin differ from the older loopback/localhost guide. The installed provider's `validateIssuerUrl` coerces non-loopback HTTP issuer URLs to HTTPS; issuance code separately defaults to `ctx.context.baseURL`. This source difference raises a token/discovery consistency risk; no tokens were issued through existing clients to test it. Live process environment overrides could not be inspected. Do not claim the file-loaded settings prove every live process variable. Resolve and test the approved development HTTPS endpoint/issuer configuration without changing the stable issuer as part of this spike.

Anonymous live probes: health, readiness, sign-in, discovery, JWKS and session endpoints returned 200; anonymous session was null. `/nexus/tenants` redirected home (307), privileged registry API denied (403), gated membership endpoint returned 404. A database session record is not proof of Google protocol or browser acceptance. The user elected to leave browser sign-in, rejected admission, session persistence and logout pending. No live tenant-management acceptance is possible with no tenants and the gate off. Existing Stage 1 disposable tests remain the regression evidence, not live-role acceptance.

## B. Verified capability matrix

Pinned and installed: `better-auth`, `@better-auth/core`, `@better-auth/oauth-provider` **1.7.10**. No dependency or lockfile changes. Sources are the installed package exports, declarations and implementation, checked against fixture behavior. The [official provider overview](https://better-auth.com/docs/plugins/oauth-provider), [token documentation](https://better-auth.com/docs/plugins/oauth-provider/tokens) and [resource-server documentation](https://better-auth.com/docs/plugins/oauth-provider/resource-server) are supplementary references; current/beta web pages are not evidence that a capability exists in 1.7.10. In particular newer beta documentation describes exchange absent from these installed exports.

Classification: **1** supported and tested; **2** supported but requiring configuration/integration in IS; **3** requires a maintained extension/dependency or reviewed module integration; **4** unsupported as a built-in capability in the pinned version. A passing primitive test does not establish that the complete Nexus profile is configured or approved.

| Capability | Class | Evidence and precise limit | IS readiness |
| --- | --- | --- | --- |
| Authorization Code + PKCE S256 | 1 | Real provider authorization/token requests; successful code redemption; wrong verifier, plain challenge, wrong callback and code reuse rejected | Existing provisioning requires PKCE. Consumer resource/scopes not configured |
| Access token vs ID token | 1 | Access JWT `typ=at+jwt`, `client_id`, `jti`, `sid`, `cnf.jkt`; ID token has client audience. ID token rejected by strict resource verifier | Never accept ID tokens as API credentials |
| RFC 8707 resources/client linkage | 1 | Configured resources issued; unknown resource and unlinked client denied | 2: configure exact environment-specific resource, scopes and per-client links through reviewed provisioning |
| Exactly one resource audience | 1 with limitation | Resource-only human grant has one audience; combined OIDC grant adds UserInfo. Generic JWT `audience` validation accepts audience membership, not exact cardinality | Separate authorization sequence and explicit cardinality check need approval/integration |
| JWT validation | 1 | Vetted verifier checks signature, issuer, audience, expiry, type and required claims when explicitly configured; forged payload and ID token rejected | 2: pin algorithms/issuer/JWKS/type/required claims; enforce one audience; validate online state. Defaults alone are insufficient |
| Public and pairwise OIDC subject issuance | 1 | Public access JWT subject is stable user ID. Pairwise ID token differs; introspection transforms its presented subject to pairwise | Do not use raw introspection `sub` as a user PK |
| General subject-to-IS-user resolution | 3 | No public inverse pairwise resolver found. Internal subject resolver is one-way; validated access-JWT subject remains stable in fixture | Identity must expose verified namespace/class-aware resolution, with explicit mappings if pairwise login links are needed |
| DPoP issuance and key binding | 1 | Token endpoint requires proof, emits `DPoP` and `cnf.jkt`; wrong/missing proof rejected | 2: resource/client requirements, short proof window and algorithm allowlist must be provisioned |
| Resource DPoP verification | 1 | Vetted verifier rejects wrong key, method, URL, access-token hash and Bearer presentation of a DPoP token | 2: mandatory proof on Nexus transport; no plain-Bearer path. Helper also supports unbound Bearer tokens, so integration must reject them explicitly |
| DPoP shared replay protection | 1 | Provider-backed `createDpopReplayStore`; two auth contexts compete on real PostgreSQL reservations, exactly one proof accepted; token-endpoint replay race also rejects one | Uses deterministic verification PK uniqueness. Memory adapter cannot prove this. Multi-host/serverless routing/load acceptance remains pending |
| DPoP server nonce challenges/validation | 4 | No expected-nonce option or challenge state in pinned DPoP API; absent/arbitrary nonce accepted in fixture | 3 for required full profile: maintained provider implementation/dependency decision; no custom token crypto or silent waiver |
| Confidential client secret POST / Basic | 1 | POST issuance, successful Basic issuance and wrong-secret rejection | Existing secret clients stay unchanged; not sufficient approval for the draft's asymmetric authentication policy |
| Client Credentials | 1 | Service JWT has client subject, no ID token; distinct from human grant | 2: provider supports it; no Nexus workload rights or caller grants configured. Deferred from first release |
| `private_key_jwt` | 1 | Registered inline public key, valid 60s assertion; wrong key, endpoint audience and excessive lifetime rejected. Concurrent reuse: one success | 2: `assertionMaxLifetime=60`, environment-separated client keys and PK-backed replay; remote JWKS retrieval/rotation not tested |
| RFC 8693 exchange | 4 built-in / 3 extension | No export/advertisement; token endpoint returns `unsupported_grant_type`. `extendOAuthProvider` and `issueTokens` are extension primitives, not exchange policy | Deferred. Requires maintained reviewed exchange support and all Nexus lineage/ceiling tests; no implementation supplied |
| Opaque access-token revocation | 1 | Issued opaque token introspects active, revoke succeeds, then inactive | Opaque tokens are not a fallback for the approved JWT profile |
| Individual JWT access-token revocation | 4 built-in / 3 integration | Revocation returns `unsupported_token_type`; online introspection remains active | Identity-owned issuance/revocation state or maintained provider solution required before claiming this contract property |
| Session deletion / client disable | 1 | Live introspection denies human token after session deletion and service token after client disable; offline signature still passes | 2: per-call uncached online state must be composed with strict token/proof verification; no claim that app/permit-list disable revokes tokens |

The real resource endpoint helper `verifyAccessTokenRequest` is available. These tests exercise its underlying vetted JWT and DPoP verifiers and actual provider HTTP handlers; they do not claim an end-to-end Next.js resource-server integration exists. Strict transport composition, failure mapping, nonce handling and atomic policy snapshot behavior remain implementation tests.

### Reproducible fixture and evidence limits

[Test source](../tests/protocol/identity-compatibility.test.mjs) uses the pinned provider, its test-only session helper and a fresh PostgreSQL cluster. It never imports application `auth.ts` or `database.ts`, never reads `DATABASE_URL`, and never uses real credentials. Password authentication remains disabled even in the fixture. Synthetic clients use the supported administrative creation API; direct session deletion/client-disable updates are isolated state-change fixtures only and are not a supported production administration recipe.

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.22.0
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:compat
```

The harness initializes a new temporary cluster using a Unix socket only, migrates **that empty disposable provider schema** with the pinned planner, then destroys it. Port 55440 is inside the private socket directory, not a TCP listener. No IS historical migration or persistent database is run by this fixture. Synthetic signing and JWT validation use `jose` and Better Auth helpers; no cryptographic algorithm, DPoP validator or token-exchange implementation was added.

Tests use HTTPS `.example.test` Request objects sent directly to the provider handler, not a real TLS network/browser. Proof races use different auth contexts against PostgreSQL; they are not evidence for deployed multi-process or Vercel behavior. Revocation and nonce tests pass by asserting the **limitation**, not by claiming the missing capability works.

## C. Proposed smallest human API release

Preserve the contract's security and visibility rules. Proposed first release implements only:

| Route | Credential/scope and result |
| --- | --- |
| `GET /api/nexus/v1/me/tenants` | Human DPoP access token, `nexus:tenants:read`; active initialized tenants with active self-membership and enabled entitlement to calling app only |
| `GET /api/nexus/v1/tenants/{tenantId}/membership` | Human, `nexus:membership:self`; own visible active membership only, never a directory |
| `POST /api/nexus/v1/access-decisions` | Human, `nexus:access:evaluate`; actor from verified credential, `applicationId` equals caller binding, registered operation ceiling; generic denied result for every inaccessible context |
| `GET /api/nexus/v1/tenants/{tenantId}/applications/{applicationId}/entitlements` | Human-only first increment, `nexus:entitlements:read`; current app only; visible result `{enabled:true,effective:true}`, otherwise uniform 404 |

No domain-resolution endpoint, service mode, delegation creation/revoke or token exchange in this release. Publish an explicitly scoped implementation profile; do not claim all draft OpenAPI paths are available.

Common acceptance requirements:

- Preserve exact discovery issuer and existing clients. One exact environment-specific Nexus resource audience, `typ=at+jwt`, <=300s human token, <=5s clock tolerance, required claims and DPoP key/proof; no `offline_access`. Neither IS cookies nor ID tokens authenticate these APIs.
- Derive human principal and active application/environment binding from Identity-approved issuance metadata and current provider/Nexus policy, not caller body/header IDs, email, token-subject spelling or an arbitrary subject lookup.
- Credential/proof/class/scope checks precede target lookup. No implicit Nexus operator/IS admin privileges. Caller binding restricts all four routes to its own registered application.
- Effective access requires current global Identity eligibility, active client/binding/app, initialized active tenant, active self-membership, enabled entitlement, endpoint scope and allowed operation. Keep local resource permissions independent.
- One bounded consistent snapshot for current Identity policy and Nexus data, <=2s evaluation and durable decision audit before allow. `validUntil <= min(snapshot+5s, token expiry)`; zero positive authorization cache. Later snapshots deny committed revocation. Consumer deadline/resource checks remain required.
- Uniform 404 for hidden membership/entitlement lookups and 200 `allowed:false, code:access_denied` for inaccessible decisions. 401 for invalid credentials, 403 for wrong endpoint scope/class before lookup, 503 on dependencies/audit failure. Rate limits, no-store/nosniff/request IDs, strict bounded schemas, no credential logs.
- Pagination reauthorizes each page; opaque cursor binds human/client/app/filter/query epoch and expires <=5 minutes, using vetted protection or server-side storage. No counts or hidden-tenant metadata.
- No browser CORS or cookie authentication fallback. BFF session and CSRF checks remain the consumer's responsibility. API transport must explicitly handle the repository's mutation-origin policy without inventing a browser-session requirement for authenticated BFF requests; review strict configured-origin rules for OAuth clients separately from cookie CSRF.

### Required module interfaces (proposal, not code)

| Owner/interface | Input → output / trust boundary |
| --- | --- |
| Identity `verifyAccessRequest` | HTTP method/canonical public URL, credential, proof, exact resource/scopes → cryptographically verified issuance reference, sender key, client, grant class, subject/session, expiry. Explicitly reject multi-audience and unbound tokens |
| Identity `resolveHumanSubject` | Verified issuance reference + issuer/client/subject namespace → stable IS user ID and externally safe subject reference. No email or caller-provided user ID; pairwise mapping explicit |
| Identity `readCurrentEligibility(tx, issuanceRef)` | Snapshot-aware, uncached client/user/session/token-revocation state and issuance class; no credentials returned. Missing/unknown state denies; infrastructure failure unavailable |
| Nexus `resolveConsumerBinding(tx, clientId, environment)` | Exact active provider client → application/resource/operation/scope grant binding; explicit policy, no automatic registration grant |
| Nexus `listEffectiveTenants`, `getSelfMembership`, `getEffectiveEntitlement` | Verified human/caller plus bounded cursor or canonical UUID → minimal authorized data in one snapshot |
| Nexus `evaluateHumanAccess` | Verified human/caller, tenant/app/operation/resource reference → durable audited bounded decision. Does not authorize/read consumer business records |
| Identity provisioning | Reviewed supported provider APIs for resource/client links/keys, persisted read-back and audit; never Nexus-owned direct Better Auth writes |

Verification and mutable eligibility must not be assembled from separately stale caches. The module interface must define transaction/snapshot ownership and authorization linearization, including replay reservations and revocation barriers. Cryptographic verification may precede the transaction; live eligibility and Nexus policy must be rechecked together before audit/allow.

Proposed implementation locations remain `src/lib/identity/access-tokens.ts`, `src/lib/nexus-consumer/{types,validation,repository,access-service}.ts` and thin Next.js route adapters under `/api/nexus/v1`. Existing management routes stay on their existing session/role/origin path. These files/routes were **not created** by this spike.

## D. Proposed schema and development provisioning

No new schema is required for the spike. Existing 0007 tables provide memberships/governance; they do not satisfy the complete consumer revision/audit/issuance contract.

After scope and migration review, the first direct-human increment likely needs additive state for:

- Nexus consumer policy: explicit provider-client/application/environment/resource bindings and operation/scope ceilings. Reuse existing linkage as identity, not an automatic authorization grant. Review uniqueness for existing `(application, environment)` mappings before deciding whether new isolated consumer clients need a separate binding table; do not replace working login clients.
- Monotonic tenant/app/entitlement/membership and binding epochs with delete/recreate tombstones. Preserve every historical ID and row; all relevant writers must update revisions/audit atomically, including authorized maintenance paths. Keep 0007 immutable and its final-admin protection intact.
- Durable redacted consumer decision/security audit, bounded cursor storage if selected, and token issuance/revocation references as needed for Identity's approved solution. Store no raw tokens, assertions or proofs. Scope token `jti` references by issuer and retention/expiry; do not treat them as credentials.
- Identity's shared proof/assertion replay uses the provider `verification` primary key, already part of Better Auth schema; verify actual provider schema/privileges in rehearsal. A nonce mechanism and per-token revocation state require a separate maintained-solution/ownership review. Provider-backed live state alone cannot invent those missing semantics.

Reserve 0008 only after remote branch/ledger reconciliation and approved schema design. No SQL migration is supplied. Root-family lineage, workload tenant grants, service/agent identities and domain-approval storage remain separate later increments. No Billing schema.

Dev-only prerequisites, separately approved before provisioning:

1. Verify an exact HTTPS browser/issuer/token/resource topology for the current hostname, preserving existing issuer and callbacks. The current HTTP-vs-HTTPS discrepancy must be resolved rather than accepted by weakening issuer checks.
2. Provision dedicated synthetic consumer client(s) and exact HTTPS callbacks/resources/scopes/keys through supported Identity APIs, with persisted read-back. Keep existing Google and OIDC login clients unchanged. Do not enable public registration or automatic resource access.
3. Choose maintained nonce and individual-token revocation support; test the actual selected component and shared store, not hand-coded cryptography. Set key assertion lifetime <=60s, proof/algorithm limits, human token TTL <=300s and no offline access.
4. Create explicitly approved synthetic admitted users and governed tenants with canonical UUIDs, memberships and per-app entitlements through reviewed administration. Enable management/consumer gates only after their readiness checks. No such persistent fixture or flag change occurred here.
5. Keep secrets in ignored environment files; never export existing DB URLs into tests. Negative tests use disposable clusters and synthetic keys. Browser Google tests remain manual and pending at the user's request.

## E. Security, concurrency and integration plan

Extend the existing AUTH/TEN/REV/DB cases in the [threat matrix](NEXUS-CONSUMER-SECURITY.md). Required gates for the direct-human release:

- Real issuer → BFF → actual Next.js routes using resource-only human credentials, configured `private_key_jwt` policy, exact single audience/type, caller binding and maintained nonce component. Reject ID tokens, cookies, Bearer tokens, missing proof, unknown grant class and any service credential on human routes.
- DPoP wrong key/method/public URL/hash, absent/arbitrary/stale nonce, stale/future proof, replay across independent server processes; concurrent assertion/proof reservations yield at most one success. DB/replay/audit outage denies. Test proxy URL canonicalization, trusted forwarded headers and clock limits.
- Wrong issuer/algorithm/expiry/claim/type/audience/cardinality and subject namespace; public/pairwise resolver tests; deliberate client-subject/user-ID collision cannot authenticate a machine as a human. JWKS rotation/unknown-kid handling stays on trusted endpoints.
- Same-tenant, cross-tenant, unknown/uninitialized/suspended tenant, inactive/missing membership, disabled app/client/grant/entitlement and wrong operation/app. Test uniform responses, bounded scans/pagination/cursor replay and redacted logs. Existing management APIs must continue denying consumer tokens.
- PostgreSQL barriers on membership/client/session/token/entitlement/tenant/app changes before and during evaluation. Snapshots after committed change deny; earlier allows expire within 5s from snapshot acquisition, including delayed responses. No retry silently extends the deadline. Audit failure cannot return allow.
- Delete/recreate and bulk/maintenance changes cannot resurrect epochs. Additive migration preserves existing identity/session/client/tenant records; previous application remains compatible. Rerun all Stage 1 final-admin/concurrency/CSRF/audit tests, including READ COMMITTED and REPEATABLE READ conflicts.
- A stub consumer executor proves deadline checking, resource-to-canonical-tenant mapping and independent local permissions. It is not evidence of real IG/Sandcastle/Axtor acceptance. Service/delegation test families remain deferred and disabled.

| Consumer | Handoff contract; no consumer repository changes |
| --- | --- |
| IG | Preserve legacy user/tenant/resource IDs and FKs. Explicit verified `(issuer,sub)` links with namespace proof, never email matching. Use exact canonical UUID for selected tenant; BFF retains tokens; keep local resource roles and session/CSRF enforcement. No arbitrary user membership lookup |
| Sandcastle | Separate environment/client binding and own-app-only decisions. Preserve application sessions and resource ownership. OIDC ID token is for login; resource API uses the approved human DPoP access token. Do not forward it to IG/Axtor or create a tenant per application |
| Axtor | If acting as a direct human BFF, same four-route contract with its own app binding. Workload/agent and on-behalf-of requests are unavailable in this release; an instance ID, header actor or client-credentials token grants no human rights. Keep local action/resource policy |

All clients fail closed on Nexus outage, deny, stale response or conflicting tenant/resource context. No positive cache, no legacy-policy union/fallback after central revocation, no local-role inference from Nexus owner/admin/member. Integration contracts preserve the existing [compatibility/mapping rules](NEXUS-CONSUMER-COMPATIBILITY.md).

## F. Contract revisions requiring review

The existing OpenAPI remains `1.0.0-draft.1`, unchanged. Proposed revisions are explicit:

1. Add a staged implementation profile for the four human endpoints; mark service modes, domain resolution, delegations and exchange unavailable until later approval. The entitlement GET's service alternative is deferred, not silently accepted without workload grants.
2. Revise the direct-login sequence: keep an ID token for OIDC login and separately obtain a resource-only human access token (no `openid`/`offline_access` on the Nexus grant). Review extra authorization/consent/client UX and subject linkage. Do not relax one-audience validation as a shortcut.
3. Choose maintained server-nonce support and a live per-token revocation/issuance mechanism, then document the exact Identity interface and state model. Keep the present security requirements unless an explicit separately versioned profile change is approved.
4. Specify public versus pairwise subject mapping and verified grant-class provenance. Pin the current public issuer/resource identities independently of implementation location. No lookup-by-email or subject-equality shortcut.
5. Confirm <=2s evaluation / <=5s consumption and zero allow cache, durable audit, per-client operations and monotonic revision migration design. These remain requirements from the draft, not capabilities claimed by this spike.

A nonce-free DPoP profile could reduce pre-generated-proof resistance while retaining key binding and shared replay checks; a token-expiry-only policy would permit stolen JWTs until expiry. Accepting multiple audiences would widen token usability. These are explicit security trade-offs for review **only**, not recommended or implemented fallbacks. Ordinary Bearer removes sender binding altogether and is not proposed.

## G. Release and rollback

After findings approval: implement Identity adapter/security dependencies in isolation first; prove its full profile before consumer handlers. Then review additive epochs/bindings/audit migration and ship the four human endpoints default-off, with no consumer enforcement changes. Require actual target-ledger/backup/rehearsal/privilege review before any persistent migration and explicit authorization before deployment/provisioning.

Release only after actual-route/proxy/concurrency tests, synthetic governed tenants and independent consumer contracts pass. Enable narrowly by environment/caller/tenant; keep existing issuer/clients and Stage 1 functionality. Production Vercel, Neon and Google were not inspected or modified by this task.

Rollback disables the consumer gate or returns deny-safe unavailable for affected cohorts, restores compatible code/config and preserves all additive state, revisions, audit, mappings and revocations. Do not drop tables, rewrite 0007, clear the ledger or restore a backup over newer records. Once consumers enforce central decisions, freeze affected operations during incompatible rollback; never silently restore a permissive legacy authorization path.

## Validation record

Results are recorded below when checks complete. Native server was left running throughout; compilation/type generation use a separate `/tmp/is-stage2b-validation-*` source/dependency copy without private environment files or the live `.next` directory. Production-mode build uses synthetic credentials and an unreachable loopback database, not `is_dev` or Neon.

| Check | Actual result |
| --- | --- |
| Node / npm | v24.22.0 / 11.19.1 |
| New disposable Identity protocol suite | PASS: 17 capability subtests + parent, 18 tests total; includes limitation assertions and real PostgreSQL replay races |
| Existing disposable Stage 1 PostgreSQL suite | PASS: 26 tests, including concurrency/authorization/audit/migration compatibility |
| Route generation / typecheck | PASS in isolated source copy |
| Standard `npm test` | PASS: all seven existing test files in isolated source copy |
| `npm run build` | PASS with default Turbopack in isolated copy; expected Better Auth connection warnings against synthetic unreachable build fixture |
| Persistent local DB | Read-only identity/ledger/checksum/aggregate/constraint checks passed; no persistent migration or client change |
| Live native readiness / anonymous protection | PASS as described above; listener/issuer/process unchanged |
| Google / browser / actual consumer acceptance | Pending; user requested isolated tests and deferred browser acceptance |

Changes from the initially clean checkout: this report, dated links in contract/implementation-plan/README, the protocol test file and its explicit `test:identity:compat` npm script. No application runtime, provider dependency, environment, OpenAPI, SQL migration or consumer repository changed. No production operation, deployment, merge or push occurred.
