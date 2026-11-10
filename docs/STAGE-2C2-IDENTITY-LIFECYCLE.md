# Stage 2C.2 — Identity credential lifecycle

2026-11-10. Bounded infrastructure implementation authorized by the Stage 2C.2 request, superseding the earlier documentation-only restriction for this slice only. **Disabled and unconnected to application auth. Not approved for activation.** No Nexus consumer routes, token exchange, Billing, consumer changes, production operations or persistent migration/provisioning occurred.

## Outcome and changed interfaces

| File | Change / interface |
| --- | --- |
| `src/lib/identity/credential-registry.ts` | `createCredentialRegistry(pool, options)`; transactional issuance, eligibility, bindings, subjects, revocation generations and bounded cleanup |
| `src/lib/identity/provider-issuance.ts` | `createProviderIssuanceIntegration(registry, options)` returns public OAuth claims extension and Better Auth after-hook; captures native grant evidence, verifies final JWT, commits registry/audit before successful response |
| `src/lib/identity/dpop-nonce.ts` | `createDpopNonceService(registry)`, `DpopNonceRequired`, `nonceChallenge(error)`; shared resource-server nonce issuance/verification and 401 challenge response construction |
| `src/lib/identity/access-credentials.ts` | Existing adapter now passes final-token SHA-256 digest into lifecycle reads and native verified proof into maintained JOSE nonce verification; carries nonce receipt into lifecycle transaction and rejects expiry after I/O |
| `db/migrations/0008_identity_credentials.sql` | Candidate additive Identity schema, constraints, indexes and irreversible-state guards |
| `tests/protocol/identity-lifecycle.test.mjs` | Real pinned-provider, disposable PostgreSQL, two-process replay, migration, failure and lifecycle tests |
| `package.json`, `package-lock.json` | Pin already-installed JOSE 6.2.12 as direct dependency; add `test:identity:lifecycle`. No provider upgrade or dependency installation |
| Related Stage 2 reports/contract/implementation plan | Links to this implementation and its activation restrictions |

Working branch remains `chore/local-dev-infra`, HEAD `7f4b46c`. Pre-existing edits and untracked Stage 2B/2C/2C.1 files were preserved. No branch switch, reset, commit, push or merge. `src/lib/auth.ts`, the auth route, Google/OIDC settings, callbacks, existing clients and environment files are unchanged. Factories require explicit `enabled:true`; no production instance, startup schema/resource seeding or environment-only activation switch exists.

## Registry and issuance safety

The registry primary key is `(issuer, token_id)`; intended audience/environment/client binding is immutable and references an explicit Identity binding. Each row records SHA-256 of the exact final JWT, stable verified mapping, original session ID, native human authorization-code grant class, optional provider reference, DPoP sender key, signing `kid`, scopes, all five security generations, issuance/expiry and revocation timestamps. Raw access tokens, proofs, client assertions, secrets and email addresses are not stored. `grant_id` is the provider's optional reference, not a claim that the complete authorization-code family ledger exists.

`configureBinding` requires a caller-supplied internal authorizer **inside the write transaction**, an existing active provider client and exact persisted Nexus application/environment/client linkage. Registration and eligibility also require active provider resource and client-resource link, active application, enabled binding, allowed scopes, existing user and matching unexpired session. Authentication or registry linkage alone grants no tenant access. No consumer policy is implemented here.

The provider integration uses `OAuthProviderExtension.claims.accessToken` to capture validated user/client/session/grant/scopes/resource in a per-request WeakMap, followed by `createAuthMiddleware` after `/oauth2/token` to read the final response. The actual pinned provider preserves the request context across these supported extension points; the real protocol test proves it. This is transient request evidence, not shared authorization/replay storage. Nothing is added to signed claims or response fields to transport the evidence.

Only the selected resource's human authorization-code, resource-only profile is captured. Combined OIDC scopes, multiple resources and machine/refresh grants are rejected on this path. Unrelated OIDC-only login responses pass through unchanged. The after-hook verifies the final `at+jwt` with pinned issuer/single audience/EdDSA/JWKS and required claims, compares against native captured identity, and commits mapping, issuance, generations and audit in one transaction before returning a usable token. Pairwise capture additionally requires authenticated authoritative introspection of this exact minted token with matching issuer/client/audience/session/key before persisting its pairwise presentation. There is no general arbitrary-JWT enrollment endpoint.

**Safety invariant:** signature validity never substitutes for positive registration. Bypassing hooks, minting through another provider instance or crashing before commit may produce a signed JWT, but the adapter denies it because the exact digest/issuance is absent. Unknown, conflicting, revoked, expired, wrong-binding or missing-generation records deny. Audit insertion failure rolls back issuance and any newly inserted mapping; the provider response is 503 without an access token. A crash after commit but before delivery may leave an orphan registered token to expire; it cannot create an accepted unregistered token. This is a resource acceptance guarantee, not a claim that provider code consumption and Identity persistence form one distributed transaction.

The internal `registerIssuance` method accepts trusted server grant evidence only. It must never be exposed to request bodies, arbitrary subject strings, email matches or an administrative "enroll signed token" shortcut. Its only integration caller here is the native provider extension/after-hook. No application instance imports it.

## Revocation, concurrency and retention

| Operation | Implemented behavior |
| --- | --- |
| `revokeToken(tokenId, actor)` | Idempotent, audit-atomic, irreversible timestamp; same request cannot be reused for another target; unknown target has same service outcome; sibling token unaffected |
| `invalidate('session', sessionId, actor)` | Advances durable session generation and disables new credentials by default; original session linkage survives native session deletion |
| `invalidate('client', clientId, actor)` | Commit before supported native disable; generation invalidates all prior tokens even if provider client is later re-enabled |
| `invalidate(kind, key, actor, true)` | Explicitly permits **new** issuance at a higher generation; never restores old tokens. Kinds are client/session/user/sender_key/signing_key |
| Sender/signing-key compromise or rotation | Invalidate affected sender thumbprint/signing `kid` or entire client before changing provider credentials; old generation remains unusable |
| User security action | User-scoped **credential invalidation** is available; `suspendUser()` explicitly returns `unsupported_lifecycle`. No global user suspension/block feature or admission reinterpretation is invented |
| Expiry / `cleanup(actor, limit)` | Expiry denies online; bounded deletion only after expiry plus >=30 days. Current revoked identifiers remain. Never deletes generations, mappings or audit |
| Subject withdrawal | `revokeMapping(id, actor)` is audit-atomic/irreversible; linked access tokens deny |

The internal administration authorizer is mandatory, without a permissive default, and must lock/recheck mutable authority in its transaction. Tests supply an explicitly synthetic security actor; this does not establish a deployed Identity security-operator role or authorize Nexus operators to perform Identity governance. No public administration endpoint is added.

Transactions use REPEATABLE READ, statement/lock/idle timeouts and a two-second service transaction budget. Per-issuer authority-row revision updates serialize lifecycle writes; eligibility takes a shared lock retained to transaction end. Concurrent invalidation cannot commit through that lock. Serialization/lock/DB errors fail unavailable rather than retry with a silently extended snapshot. `readCurrentStateInTransaction(tx, reference, digest, nonceReceipt?)` lets future Nexus policy share the same caller-owned bounded snapshot; it must not be replaced by separately cached reads. Future callers must enforce the same isolation/time budget and five-second consumption deadline. No positive eligibility cache exists.

Standalone adapter validation is still **not** a Nexus authorization lease. Future Nexus decisions must re-read current lifecycle and policy in that same transaction, audit before allow, and bind deadline to snapshot acquisition. No code here authorizes tenant/business data.

## Nonce/replay profile

The approved resource-server nonce requirement is implemented without custom cryptography. Better Auth verifies proof signature, public key, method, canonical HTTPS URL, token `ath`, age and shared atomic replay reservation. JOSE `importJWK`/`jwtVerify` then verifies the identical proof against the native verifier's validated public JWK and reads its signed nonce. The adapter supplies the trusted native verification result; unverified `decodeJwt` output is never used for nonce acceptance. Native access-token verification remains separate.

Nonces use 32 bytes from Node CSPRNG, base64url encoding and SHA-256-only storage. Rows bind issuer, resource, environment and sender thumbprint, with database issuance time and absolute <=60-second expiry. Issuing a replacement rotates the nonce; existing nonces retain their original expiry, allowing parallel requests with distinct proofs. There is no sliding renewal. The internal `issue` method can proactively rotate before expiry; no automatic client retry agent is added. Bound quotas are eight outstanding nonces per issuer/sender key and 10,000 per issuer; concurrent issuance uses the same authority-row revision/transaction serialization, never stale process-local counters. A quota/serialization/storage failure returns unavailable. Transport rate limits and production quota sizing are still release gates.

Missing, malformed, unknown, wrong-scope or expired nonce on a valid proof produces `DpopNonceRequired` with a newly persisted nonce. `nonceChallenge` constructs HTTP 401, `WWW-Authenticate: DPoP error="use_dpop_nonce", algs="ES256"`, one `DPoP-Nonce`, no-store and nosniff. It is a response helper, not a public endpoint. Invalid signature/key/hash/method/URL/age/replay retains normal DPoP rejection. Infrastructure failure cannot generate a fictitious persisted challenge or return allow. A challenged proof consumes its replay reservation; retries require a fresh proof/JTI. Fresh proofs may reuse a still-valid nonce.

A nonce receipt is rechecked in the registry transaction, and the adapter checks its expiration again after lifecycle I/O. Shared replay uses the pinned provider's database-backed verification reservations. Two independent Node processes validate the same nonce/proof against PostgreSQL: exactly one succeeds. The database stop/restart probe denies during outage, then accepts a fresh proof after recovery while rejecting the original replay; state survives process/database restarts.

Only **resource-server** nonce enforcement is implemented. Native provider token-endpoint nonce support is still absent. Authorization-server `use_dpop_nonce` would use HTTP 400 and a separate nonce namespace; this work does not claim it. If review requires AS nonces too, activation remains blocked. The canonical request URL must come from trusted HTTPS routing, not arbitrary forwarded headers. Actual reverse-proxy/TLS challenge propagation and request-body idempotency remain actual-route acceptance tests; no route or browser CORS policy is added here.

## Persistent subjects

The provider's access JWT uses the stable access subject, including for pairwise clients. HTTP introspection presents the issuing client's pairwise subject. The integration maps both through native verified grant/session/user evidence and exact authenticated same-token introspection, never by subject spelling or email.

Persistent keys are `(issuer, client, namespace, subject)` with unique constraints, restrictive FK to existing IS user ID, evidence UUID and verification timestamp. Public-access and pairwise namespaces are explicit. Rows are immutable except one-way revocation; unverified/null verification cannot be stored. Duplicate/ambiguous subjects are prohibited, revoked mappings deny, namespace/client mismatch and deleted aliases resolve null. A public access mapping used by an issuance cannot be deleted because of its restrictive FK. User IDs/provider identity records are not rewritten. Mapping evidence retains the originating issuance reference; all mapping acquisition in the integration commits with its issuance audit.

Pairwise secret/sector configuration changes need explicit client generation invalidation and reviewed mapping migration; no inverse hashing or email reconciliation exists. The pairwise introspection callback is an internal trusted dependency, tested using an isolated authorized provider observer. Production observer provisioning/authentication/availability and Identity administration authorization remain unconfigured. Missing or mismatched pairwise introspection stops issuance with 503.

## Candidate migration review

Locally available migration history is 0001–0004, 0006, 0007; no competing 0008 was found in current local branch history. Candidate `0008_identity_credentials.sql` creates seven Identity-owned tables: authorities, epochs, bindings, mappings, issuances, events and nonces. It adds supporting FK/lookup/retention indexes and update guards for immutable provenance, one-way revocation and monotonic generations. Epoch DELETE/TRUNCATE is rejected to protect tombstones. No Better Auth-owned table/column/trigger is altered; its client/session/resource/user tables are read only by this infrastructure. Original session IDs deliberately have no provider FK that could clear lineage.

The schema contains no initial bindings, grants, mappings or user backfill. Empty tables deny, so deployment alone cannot create access. Restrictive user/application references preserve identity/history; future user-deletion/retention workflows need explicit archival review. Table owners can disable/drop guards; runtime roles must not own tables or have DDL/TRUNCATE/epoch-delete privileges. A target privilege/grant review is required rather than assuming owner-run fixture tests prove production privilege isolation.

Fresh disposable schema plus all historical migrations passed. A populated disposable provider database containing an existing user, session and OIDC login client was snapshotted before 0008 and retained those exact IDs afterward; the old OIDC client still completes code+PKCE issuance after migration and with the new hook installed. Existing Stage 1 tests reapply the complete immutable history and retain concurrent last-active-administrator protection. Historical SQL/checksums were not changed.

**Not applied to persistent `is_dev` or production.** Remote branch freshness and actual target ledger were not reverified in this task; 0008 remains conditional before persistent application. Do not fill 0005. Better Auth migrations remain separate. No migration/bootstrap script was run as an audit check.

## Provider limitations and unresolved release risks

- Native individual JWT revocation remains unsupported; callers must use the Identity service. Native temporary client disable alone does not permanently revoke credentials. Registry-mediated invalidation tests do not prove arbitrary native API/direct SQL disable→enable is tracked. There is **no automatic production hook installed** for those administration paths, secret/key changes or pairwise configuration changes. Integrating or restricting every such path is mandatory before activation; direct mutations outside the orchestrator must remain a privileged operations boundary.
- Native authorization codes/consents are not a complete generation-bound grant ledger here. Outstanding pre-invalidation authorization codes may still be redeemed by the provider after re-enablement; that would create a new token, not resurrect an old registered JWT. Review explicit outstanding-code/grant invalidation and trusted grant-time provenance before claiming complete credential-compromise recovery. No refresh/offline grant is accepted by this resource profile.
- `suspendUser` has no implemented global-security hook. Permit-list removal remains login admission, not suspension. User credential invalidation is not a substitute for an authoritative user-block policy. Production user eligibility/governance integration must be reviewed before any such claim.
- Hook dispatch is proven for the pinned normal HTTP token handler and its supported extension/after-hook; raw issuance primitives deliberately bypass hooks. Positive registration still denies bypassed tokens. No distributed crash/response-delivery atomicity or real Vercel deployment claim is made.
- Same-snapshot Nexus policy/audit, actual-route origin/CSRF and status mapping, JWKS operational policy, authenticated pairwise observer, request/cleanup scheduling, rate limits, TLS/proxy behavior and load/pool saturation remain release gates. No route authorization rule was weakened to close these gaps.

These limitations keep production activation blocked; the supporting factories and disposable tests do not constitute release acceptance.

## Local activation procedure — future reviewed work

For **disposable tests now**, select Node 24 and run:

```bash
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:lifecycle
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:compat
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:memberships:pg
```

Each suite creates/destroys only its own temporary Unix-socket cluster with synthetic data; it never uses `DATABASE_URL`. The lifecycle suite's stop/restart affects only its own cluster. No persistent configuration is needed.

Persistent local activation is **not authorized or performed**. After separate schema/activation approval: verify exact development database/ledger and candidate checksums/branch conflicts; rehearse backup/restore/old-code compatibility; apply through the reviewed module migration workflow. Establish trusted HTTPS/issuer/resource topology preserving existing Google/OIDC clients/callbacks. Provision dedicated resource grant/client/observer through supported privileged provider APIs with read-back and audit, plus explicit application/environment linkage. Approve internal Identity authorization and all client/security lifecycle orchestration paths first.

Then explicitly compose registry, provider extension+after-hook, pairwise introspection, native shared replay, nonce service and credential adapter in an isolated provider/application configuration. No ordinary environment flag currently wires this automatically. Do not change existing login clients or enable consumer handlers. Require real TLS/browser Google/OIDC/consent and proxy tests before proceeding. Never disable TLS verification or accept multiple audiences to work around topology.

## Deployment and rollback — not executed

Before a separately authorized deployment: reconcile actual Neon project/branch/database, deployed code, complete ledger/checksums, backup/restore and privileges using a verified direct TLS connection; reconcile candidate 0008 across branches. Rehearse additive migration and previous application against it. Review all unresolved release gates above, then deploy unconfigured/disabled infrastructure first. Any OAuth provisioning, persistent migration, feature activation or consumer rollout needs separate authorization.

Rollback removes factory wiring/disables resource credential acceptance, preserves existing Google/OIDC settings and retains all additive mappings, issuance/revocation identifiers, generations and audit. Do not drop tables or edit ledger/history, clear generations, rewrite user/tenant IDs or re-enable an old credential generation. After consumer enforcement exists, freeze affected operations during an incompatible rollback; never fall back to permissive legacy authorization. Native provider-side changes must use supported APIs with read-back, with registry deny committed before external changes and explicit reviewed re-enable afterward. A failure between those steps stays disabled; no distributed atomicity is claimed.

## Validation and existing development server

Node v24.22.0 / npm 11.19.1. No provider version changed. Existing local server was not restarted or reconfigured. Initial readiness/sign-in/OIDC discovery/session probes succeeded; final outside-sandbox readiness/sign-in/discovery probes also succeeded. Final sandbox connection failures were resolved as sandbox network isolation by successful outside-sandbox probes, not a server repair. Discovery issuer stayed unchanged. A fresh Google browser login, admission rejection and real cross-application callback/session/logout were **not** exercised; synthetic OIDC protocol success is not Google browser acceptance.

| Check | Final result |
| --- | --- |
| New lifecycle protocol/database suite | PASS, 20 tests including parent; pre-migration OIDC client, failure/rollback, subjects, revocation, nonce, independent processes and stop/restart recovery |
| Existing provider compatibility | PASS, 31 tests |
| Existing standard suite | PASS, 63 individual assertions/subtests outside sandbox; `npm test` also passed with 8 file-level sandbox results |
| Existing membership PostgreSQL suite | PASS, 26 tests, including last-admin races, authorization/CSRF, cross-tenant denial, audit rollback and migration compatibility with 0008 |
| Route generation / typecheck | PASS in isolated `/tmp/is-stage2c2-validation-*` copy |
| Production build | PASS outside sandbox in isolated source copy with synthetic settings/unreachable loopback database; expected schema-connectivity warnings |
| `git diff --check` | PASS |

Sandbox PostgreSQL runs failed before the outside-sandbox passes. Sandbox build compiled but reproduced the known TypeScript `--showConfig` subprocess-output failure; outside-sandbox build passed. Isolated validation copied source/dependencies without private environment files and did not replace the live workspace `.next`. No production, persistent schema, live OAuth client or consumer configuration changed.
