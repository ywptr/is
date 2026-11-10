# Stage 2C.1 — credential lifecycle and provider integration

Stage 2C.2 implementation follow-up: [Identity credential lifecycle](STAGE-2C2-IDENTITY-LIFECYCLE.md) adds disabled registry, provider-hook, subject and nonce factories plus candidate 0008 and disposable protocol tests. This supersedes the earlier absence of supporting infrastructure only; production administration/security hooks and activation acceptance remain blocked. Original findings below are retained as dated evidence.

2026-11-10. Recommendation for review, not approval to implement or release. Pinned Better Auth/core/OAuth provider 1.7.10; installed JOSE 6.2.12. This work extends isolated protocol tests and documentation only. Existing uncommitted Stage 2B/2C work is preserved. No runtime adapter, consumer route, dependency, persistent database, OAuth registration, issuer, callback or environment configuration changed.

## Recommendation

Use **single-audience, DPoP-bound JWT access tokens plus an Identity-owned positive issuance/revocation registry** for the first direct-human Nexus v1 increment. Keep the existing OIDC login provider and clients unchanged. Require a separate resource-only authorization-code + PKCE S256 grant, <=300-second tokens, no offline access, uncached lifecycle/policy reads, durable audit, shared proof replay and resource-server nonce enforcement. This remains blocked for production until the integration and concurrency gates below pass.

Opaque tokens **can** meet DPoP and exact resource audience requirements in 1.7.10. The exact compatibility limitation is token-format selection: with the current JWT plugin, an explicit resource produces a JWT; supported `disableJwtPlugin: true` forces opaque tokens provider-wide and also changes OIDC ID-token signing to HS256 using decryptable client secrets. There is no per-resource access-token-format selector in the inspected public resource schema. Flipping this option on the existing provider would change working login behavior and secret-storage requirements. Omitting the resource is not an acceptable workaround. A separate opaque issuer/provider would introduce a new identity and provisioning boundary and needs a separate architecture decision; it is not recommended for v1.

JWT registry work costs more engineering than native opaque-token revocation, but preserves current login compatibility and the adapter already reviewed. Both profiles still need shared replay/nonce state, authoritative human provenance, nonresurrecting eligibility, subject mappings and one consistent Identity/Nexus policy snapshot. Neither permits offline authorization or eliminates online database cost.

## Reproducible evidence and its limits

[Protocol fixture](../tests/protocol/identity-compatibility.test.mjs) initializes an empty temporary PostgreSQL 17 cluster on a private Unix socket, uses pinned provider schema setup **only there**, and destroys the cluster. It never reads `DATABASE_URL` or imports application auth/database configuration. Synthetic administrative clients use supported provider APIs. Direct session/client mutations are fault fixtures, not production administration instructions. Password auth/public registration remain disabled. HTTPS-shaped Requests are passed to the provider in process; actual TLS, browser Google login, Vercel and consumer applications were not tested.

```bash
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin \
  node --experimental-strip-types --test tests/protocol/identity-compatibility.test.mjs
```

| Requested capability | Observed result | Owner / qualification |
| --- | --- | --- |
| Explicit resource, restricted scopes | Resource-only human opaque grant has scalar exact Nexus `aud`, requested allowed scope, <=300s lifetime, no ID token; unregistered resource and unsupported scope denied | Native, in isolated `disableJwtPlugin` mode |
| DPoP issuance | `token_type=DPoP`, introspection `cnf.jkt` equals authorization/token sender key | Native issuance; protected-resource enforcement is adapter composition |
| Proof validation | Wrong key, method, URL and token hash rejected | Native `enforceDpopBinding`/`verifyDpopProof`; caller must require DPoP and reject unbound/Bearer credentials |
| Online active state | Issuer/resource/client/session/scope/key binding returned; pairwise presentation verified | Native introspection; `active:true` alone is insufficient for Nexus |
| Individual revoke | Revoking one opaque token makes it inactive; sibling stays active | Native `/oauth2/revoke`; JWT returns `unsupported_token_type` and stays active |
| Session termination | Supported `/sign-out` makes opaque token inactive | Native logout hook in successful path, not an atomicity/fault proof |
| Session deletion bypass | Raw adapter deletion clears opaque `sessionId` through FK SET NULL; introspection remains active without `sid` | Native limitation; immutable session lineage and live eligibility required |
| Client disable | Observer introspection denies disabled issuer client; re-enable makes previously active opaque token active again | Native temporary disable, not permanent revocation; Identity epoch/registry must prevent resurrection |
| Cross-instance replay | Same proof raced against shared PostgreSQL through independent provider contexts: one success; two independent Node processes also yield exactly one accepted and one rejected | Native shared reservation helper, explicitly injected; no claim about deployed Vercel topology |
| Reusing token legitimately | Fresh proof with same active opaque token succeeds | Intended OAuth behavior; an access token is not single-use |
| Introspection unavailable | Real provider with an absent database socket rejects introspection (`ENOENT`) before active state; test-only strict intake also rejects transport error, HTTP 503, inactive/malformed response, multi-audience and missing binding | Actual DB outage plus adapter contract model; no opaque production adapter or timeout/HTTP error transport implemented |
| Pairwise | Opaque introspection `sub` differs from user PK and matches pairwise ID token; persisted issuance user/session references identify actual user | Native presentation plus exact mapping needed in Identity |
| Single-purpose flow | Separate grant omitting `openid` gives exact one-resource audience for JWT and opaque profiles; combined flow adds UserInfo audience | Native; adapter must reject combined audience, not choose one element |
| Nonce | Native verifier accepts missing/arbitrary nonce; returns no nonce. JOSE `jwtVerify` against its returned public key verifies same proof's signed nonce and rejects payload tampering | Native gap; maintained JOSE composition feasibility demonstrated, nonce service not implemented |

Final protocol run: **31 tests passed, zero failures/skips** (includes nested tests and parent). Earlier failed probes revealed the raw-delete behavior and corrected the observer fixture: a disabled issuing client cannot authenticate its own introspection request, so lifecycle probes use a separate authorized observer. Tests intentionally assert provider limitations; passing does not mean those limitations meet the approved profile.

Thirty sequential active opaque introspections measured **p50 13.01ms, p95 19.50ms** in the final local run. This measures in-process provider dispatch plus local PostgreSQL queries only, not a production percentile, throughput estimate or SLO. Resource metadata warmup, fixture load and machine scheduling affect results. No JWT-versus-opaque latency advantage is claimed without a matched benchmark.

Pinned source audit anchors (installed artifacts, not assumptions from newer online releases):

- `@better-auth/oauth-provider/dist/oauth-DXiqbRzK.d.mts`: public `disableJwtPlugin`, resource policy, claims/response extensions and provider API declarations.
- `@better-auth/oauth-provider/dist/introspect-BVm_zFQC.mjs`: `createUserTokens`, `createOpaqueAccessToken`, `validateOpaqueAccessToken`, `resolveIntrospectionSub` and HTTP introspection.
- `@better-auth/oauth-provider/dist/authorize-dkOG8GqZ.mjs`: opaque schema session FK SET NULL, logout planning/revocation and provider defaults/secret storage compatibility checks.
- `@better-auth/core/src/oauth2/dpop.ts`: native verifier, returned verified JWK, omitted nonce and shared reservation interface. Existing adapter remains unchanged.

## Engineering comparison

| Dimension | Opaque + online introspection | JWT + positive registry (recommended) |
| --- | --- | --- |
| Security | Hides claims from token holder; unguessable reference, issuer online trust; enforce exact `aud` and `cnf` from authenticated introspection | Signed claims verifiable locally; registry rejects unknown/pending/revoked issuance; visible claims must stay minimal |
| Provider compatibility | Native resource/DPoP/revoke works in global opaque mode; changes ID signing and secret storage; no observed resource-level selector | Preserves JWT/OIDC configuration; native individual JWT revoke absent; Identity integration required |
| Persistence | Provider hashed opaque row per token, plus subject/provenance, nonce/replay, audit and permanent invalidation state | Identity row per issued JWT plus subject/provenance, nonce/replay, audit and policy epochs; provider JWKS retained |
| Revocation latency | Next uncached introspection observes revoke; native disable can reverse; raw deletion can lose lineage | Next fresh policy snapshot observes committed registry revoke; no positive cache; same <=5s already-in-flight budget |
| DB/network cost | Every operation does authenticated introspection with several provider reads, plus Nexus transaction and replay/nonce writes; external HTTP adds round trip | Local JWT/proof verification plus registry/client/user/session/Nexus reads in one transaction and replay/nonce writes; trusted JWKS cache <=300s |
| DPoP | `cnf.jkt` via introspection, `ath` over literal opaque token; library proof checks work | `cnf.jkt` in signed JWT, same proof/replay/nonce requirements |
| Deployment | Shared provider database; confidential introspection observer/key rotation; changing global mode incompatible with existing login; separate issuer increases complexity | Same issuer/deployment; positive registry gate and issuance middleware/hook must be crash safe; no remote self-HTTP needed for same-DB policy reads |
| Failure | Timeout, auth failure, malformed/introspection outage => unavailable, never cached allow; inactive => invalid credential | Registry/lifecycle/replay/nonce/audit failure => unavailable; unknown/revoked => invalid credential; offline JWT signature cannot grant access |
| Maintenance | Less custom individual revoke logic, but provider lifecycle gaps and format/secret compatibility still need maintained integration | More owned lifecycle code/schema, explicit invariants and failure tests; preserve upstream crypto and login; future maintained native registry can replace behind Identity interface |

Both retain mandatory active user/client/session, app/environment binding, scope/class and Nexus policy checks. Resource disable alone is not sufficient: inspected resource schema documents denial of new issuance while existing tokens may continue; Nexus checks live resource eligibility. Avoid provider resource caches for authorization. Neither human ID tokens, cookies, email/domain equivalence nor service tokens authenticate human consumer routes.

## Provider integration and individual-token revocation contract

Identity owns these interfaces; Nexus never writes Better Auth tables. No integration below is implemented by this report.

1. Preserve `src/lib/auth.ts` login defaults, JWT plugin, existing issuer/clients/callbacks. Provision a separately approved resource grant/client binding with supported APIs and read-back, not startup seed configuration. Confidential BFF client auth uses reviewed `private_key_jwt`, <=60-second assertions and shared replay; no public registration.
2. Use a supported [Better Auth server after-hook/middleware](https://better-auth.com/docs/concepts/hooks#after-hooks) (`createAuthMiddleware`, final result via `ctx.context.returned`) at successful **authorization-code token issuance** to obtain trusted issuance context and the final minted JWT. Validate the exact final JWT with pinned verifier/JWKS, compare client/session/user/resource with trusted grant context, and persist immutable registry row, mapping evidence and audit before returning a usable token. Do not mint a JWT or reimplement built-in grants. Claims/response extension callbacks run before final JWT identity exists and are not alone a reliable final-`jti` persistence point.
3. Evaluate a minimal same-deployment token-response middleware/after-hook integration against the pinned provider. It must cover every issuance path usable for Nexus, not just the ordinary browser path. The registry is a **positive allowlist**: a minted JWT without a committed active row always denies, including after crash/failed hook/audit or alternate provider invocation. Use pending-to-active state if a cross-boundary phase is unavoidable. No token delivery until active/audit commit; persistence-before-delivery failures may leave an unusable-to-caller orphan to expire, not an unregistered usable credential. The maintained hook documentation describes this public integration surface; the pinned endpoint behavior and transaction guarantees still require Stage 2D entry tests, not an assumption of atomic provider issuance support. Never schedule registry activation as background work.
4. Registry identity is unique `(issuer,jti)` with immutable digest of final token, user ID, access subject/namespace, client, original session reference, resource, environment, `human_authorization_code` class, `cnf.jkt`, scope ceiling, `iat/exp`, binding/security epochs, issuance/audit IDs and lifecycle state. Unknown, mismatched, pending, expired or duplicate issuance denies. No raw tokens/proofs/client secrets persisted in the registry. Full-token digest prevents a distinct signed token reusing the same `jti` from borrowing registration.
5. Proposed internal `revokeAccessCredential(issuanceRef, authorizedActor, reason, requestId)` is an idempotent monotonic transition to revoked, atomic with audit. Authorize exact owner/client/resource or explicitly privileged security operator within the transaction; user identity alone never authorizes arbitrary token revocation. Unknown/unowned references return the same external outcome without exposing existence. Audit failure rolls back and returns unavailable. Already-revoked requests do not reactivate or alter original evidence. Distinct tokens/siblings remain active unless separately revoked by policy.
6. The provider's JWT `/oauth2/revoke` is not this contract. Do not advertise it as working JWT revocation. A later reviewed Identity-owned revocation endpoint may expose the internal operation; none is added here. Reference IDs are not credentials. Session/client/global security invalidation advances durable epochs and/or registry state atomically with governance, so reactivation never revives prior tokens. Preserve original session ID in registry even after provider FK cleanup; missing/expired session denies.
7. `readCurrentEligibility(tx, ref)` reads positive registry plus authoritative current user/client/session/resource/binding state in the **same bounded policy transaction** as Nexus authorization and durable allow audit. Do not combine remote introspection at time A with unrelated Nexus snapshot B and claim consistency. Cryptography and proof reservation can precede this transaction. Capture snapshot time before reads; evaluate <=2s and expire decision by min(snapshot+5s, token expiry), rechecking expiry after I/O. Post-commit revocations deny later snapshots; an earlier result may survive only its approved in-flight budget.

Define user security status explicitly; permit-list removal remains login admission and must not be mislabeled user/token suspension. If existing provider mutations cannot share required lifecycle/audit transaction semantics, keep consumer credentials disabled until an approved management integration closes that gap. JWT signature validation or unqualified provider `active:true` cannot substitute.

## DPoP nonce decision and implementation plan

Keep mandatory **Nexus resource-server nonce enforcement**. [RFC 9449 sections 8–9](https://www.rfc-editor.org/rfc/rfc9449.html#section-9) distinguishes authorization-server and resource-server nonces. A resource challenge uses HTTP 401, `WWW-Authenticate: DPoP error="use_dpop_nonce"` and one `DPoP-Nonce` header; token-endpoint nonce challenges use HTTP 400 and OAuth JSON error. These are separate from OIDC login nonce.

Pinned `VerifyDpopProofOptions` has no expected nonce, and `VerifiedDpopProof` omits the signed nonce. No provider-native nonce switch was found. However, its **public verifier returns the validated public JWK**. The isolated composition uses that key and maintained [JOSE `jwtVerify`](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md) with ES256/type restrictions on the identical bounded proof, then reads `payload.nonce` from the cryptographically verified result. Tampering rejects. This uses library cryptography, not custom signature verification or untrusted decoded claims. It performs signature verification twice; acceptable initial simplicity, measure before optimizing. Declare/pin JOSE as a direct dependency in a separately approved implementation rather than relying on today's transitive installation.

This supports a maintainable **resource-server** integration without provider patching. It does not add a provider token-endpoint nonce implementation. If review requires authorization-server nonces as well, that remains an explicit blocker requiring a supported provider middleware integration and separate tests; do not silently interpret resource-server success as token-endpoint support. Resource nonce plus `ath` and short proof age addresses the Nexus pre-generation threat; client and token-endpoint compromise remain residual risks. No nonce-free profile or multi-audience relaxation is recommended.

Proposed resource-server state/protocol:

- Generate 32 random bytes using Node CSPRNG; base64url encode. Store only digest plus issuer/resource/environment/sender-thumbprint, issued/expiry times and generation/status in Identity-owned shared PostgreSQL. Scope by exact resource authority; no process-memory store or Vercel instance affinity. Nonces are not authorization grants. Never log proofs/nonces/tokens.
- Proposed nonce lifetime 60s, proactive rotation after 30s, previous/current overlap bounded by each nonce's original absolute expiry; no sliding extension. A nonce may accompany multiple fresh proofs to support parallel BFF requests. Atomic shared proof replay reservations still enforce uniqueness. Persist issuance before returning challenge, use database time for validity, bound input lengths and clean expired records with bounded jobs/retention. Enforce per-key/client/origin rate limits and storage quotas against challenge amplification. Challenge issuance failure => 503, no random unpersisted challenge.
- Validate native proof signature, key, method, canonical URL, `ath`, age and shared replay; independently verify same proof via JOSE and check nonce type, exact digest/scope, generation and validity. Then lifecycle/policy transaction rechecks nonce validity and eligibility before allow. Failed nonce validation consumes that proof; client retries with fresh `jti` and proof. Reusing nonce with different valid proofs is allowed; reusing proof is not.
- Missing/unknown/expired/wrong-scope nonce on an otherwise valid credential/proof yields the resource nonce challenge, `Cache-Control: no-store`, bounded generic error and request ID. Invalid signature/key/hash/replay yields normal DPoP error, not a successful nonce check. No nonce-dependent tenant lookup. Insufficient scopes remain 403; dependency failures remain 503. Success may carry one persisted replacement `DPoP-Nonce` header. BFF remembers nonce per resource and key, bounds retry count and preserves mutation idempotency.
- Construct canonical external HTTPS method/URL from trusted deployment routing, never arbitrary Host/forwarded headers. Proof `htu` excludes query/fragment per library normalization; resource-policy URL stays exact. Preserve TLS verification and canonical issuer; no HTTP exceptions. Ensure proxy preserves challenge headers. BFF-only profile adds no browser CORS; any future browser use needs separate review of exposed headers, origins and credentials.

Required negative tests before acceptance: missing/non-string/oversized/forged nonce; wrong key/resource/issuer/environment; expiry and rotation boundaries; old nonce after overlap; concurrent issuance/rotation across processes; replay with valid nonce; valid new proof sharing nonce; absent/stale/future proof; tampered payload/signature; duplicate headers; database outage/timeout and cleanup races; response lost/retry; proxy-host spoof/HTTP downgrade; correct 401 versus 400 challenge/header semantics; no mutation/audit allow before successful retry. Only signed nonce extraction/tamper rejection is currently tested; shared nonce lifecycle/challenge tests remain outstanding.

## Durable subject mapping

Do not treat any `sub` as a user PK without provenance. Existing fixture establishes public JWT access `sub = user.id`, while pairwise OIDC ID token and HTTP introspection `sub` use the issuing client's pairwise presentation. Opaque persisted issuance stores actual user/session references; pairwise introspection agrees with that client's ID token. These are distinct namespaces, not inconsistent users.

Propose Identity-owned append-audited mappings keyed uniquely by `(issuer, subject_namespace, subject_context, subject)` with restrictive FK to existing IS user ID. Context includes issuing client and provider sector identifier/configuration version where pairwise semantics apply. Store source/evidence reference, creation actor/time, mapping version, active/superseded status and reason; reject duplicates/ambiguity even if rows name the same user. Registry points to immutable mapping version. Never email-match, reverse pairwise hashes, infer from UUID spelling or reinterpret introspection `sub` as the access JWT namespace.

Acquire mappings only inside verified issuance or explicit proof-of-ownership linking: trusted grant/session identifies the IS user; verified signed token and authoritative provider pairwise presentation establish the subject/context. Verify issuer/client/type/key/nonce and pairwise configuration. Persist evidence and audit before registry activation; absence denies. HTTP introspection alone lacks all class/provenance metadata and is not an arbitrary-user resolver. If provider APIs cannot expose pairwise mapping within trusted issuance context, block that client pending reviewed evidence acquisition rather than guess the hash.

Pairwise secret/sector changes require versioned supersession, explicit consumer migration and invalidation, never reassignment to a different user. Do not provision/rotate them here. Consumer legacy account links preserve all local user/tenant IDs and FKs, with separate explicit proof and audit. Mapping rollback retains rows/evidence and disables affected grants; never drops historical mappings or merges by email.

## Separate Nexus resource flow

Existing OIDC login remains as-is, including issuer, client IDs, callbacks and signature policy. After consumer login, start an independent authorization transaction for exactly one approved Nexus resource and only approved Nexus scopes, with fresh state, PKCE S256 and `dpop_jkt`; omit `openid/profile/email/offline_access`. Use a separately reviewed dedicated consumer client/binding if required by resource policy, without modifying existing login registrations. Redeem code for that same resource with client authentication and same sender key; expect access token only. Persist trusted issuance/mapping evidence and require explicit consent or separately approved audited first-party consent policy.

Fixtures use synthetic `skip_consent` to isolate protocol behavior; they do not prove browser consent, Google acceptance or unchanged live login behavior. Both token formats were tested with resource-only flow; combined `openid` adds Nexus plus UserInfo audiences and remains rejected. No unintended multi-audience token is accepted.

## Migration and compatibility plan

No migration is supplied or applied. Candidate 0008 remains conditional on exact target ledger/checksum and other-branch reconciliation. Historical 0001–0004/0006/0007 and missing 0005 remain unchanged; Better Auth migrations stay separate.

Review additive Identity issuance/revocation, subject mapping/evidence, security epoch/tombstone, nonce and redacted audit tables/indexes with expiry cleanup and retention policy. Preserve original session linkage without cascading history deletion; restrictive user/client references or retained identity snapshots require compatibility review with legitimate provider cleanup. Decide FK ownership and runtime grants before SQL. Store token digests/references only. Reuse provider verification reservations for replay with verified schema/privileges; no memory fallback. Keep provider tables authoritative through supported lifecycle APIs, never add a Nexus writer there.

Nexus still needs consumer bindings/operation ceilings, monotonic membership/tenant/app/entitlement epochs with delete/recreate tombstones and bounded decision audit. Preserve last-admin/last-operator invariants and canonical tenant UUIDs. Old code must continue working with additive tables; consumer gate defaults off and unknown registry issuance denies. Rollback disables consumers and preserves mappings, revocations, audit and epochs. No automatic down migration, token-state purge, legacy permissive fallback or production restore.

## Revised Stage 2D prerequisites

Stage 2D should first implement and validate **Identity dependencies in isolation**, not consumer routes:

1. Review/approve JWT+positive-registry choice, direct-human scope, exact lifecycle/nonresurrection semantics, subject namespaces and resource-server nonce composition. Explicitly decide whether authorization-server nonces are required. Approval here does not authorize provisioning/deployment.
2. Prove supported final-token issuance hook/middleware with real pinned provider: final `jti`/token digest and trusted grant capture; no ID/service/refresh/alternate path misclassification; unknown/pending denies; hook/audit/DB crash points cannot release a usable unregistered token. Resolve unsupported hook behavior before runtime wiring.
3. Implement shared nonce state/challenges with vetted JOSE and shared replay; test full negative matrix, actual HTTPS/proxy URL handling and independent processes. No crypto implementation or provider upgrade.
4. Implement persistent exact subject mappings and registry-backed uncached eligibility; close session deletion/hook failure, client re-enable, resource disable and user-policy gaps. Real PostgreSQL barriers prove token revoke vs decision, same-snapshot policy/audit, expiry, permanent epoch invalidation and failure atomicity.
5. Review additive schema/privileges, backup/restore/rehearsal, compatibility with prior code and actual target ledger before separately authorized migration. Validate sustained load, pool saturation, p95/p99/worst-case 2s budget, cleanup/backlog and outage behavior in representative isolated infrastructure.
6. Only after Identity passes should a separate review authorize four human consumer routes and their actual handler tests. Preserve Stage 1 authorization/CSRF, cross-tenant/audit/final-admin/migration regression suites. Service/delegation/exchange remains deferred. Browser OIDC, consent, TLS and independently authorized consumer cutover remain release gates.

Outstanding risk: supported resource nonce composition is feasible but not deployed; final-token hook atomicity and provider management transactions remain unproven; native opaque logout has a cleanup bypass and post-delete hook failure window; native client disable is reversible; no production capacity/TLS/consumer evidence. The current adapter must remain uninstantiated until dependencies are complete. No approved authorization rule has been relaxed.

## Validation record

Protocol: 31 passing tests, including two-process shared replay and explicit limitation assertions. Node v24.22.0/npm 11.19.1. Baseline and regression results follow. Validation uses a fresh `/tmp/is-stage2c1-validation-*` copy without private environment files; build receives only synthetic settings and unreachable loopback database. Live workspace `.next` and development listener are preserved.


| Check | Final result |
| --- | --- |
| Route generation (`npx --no-install next typegen`) | PASS in isolated copy |
| `npm run typecheck` | PASS in isolated copy |
| `npm test` | PASS, 8 file-level sandbox results; equivalent outside-sandbox Node runner exposes all 63 passing assertions/subtests |
| Protocol compatibility | PASS, 31 tests including nested tests and parent; real provider, shared PostgreSQL, two Node processes and real unavailable-DB probe |
| `npm run test:memberships:pg` | PASS, 26 tests; existing authorization/CSRF, cross-tenant, audit, concurrent last-admin and migration compatibility coverage retained |
| `npm run build` | PASS outside sandbox in isolated source copy; expected schema-connectivity warnings from synthetic unreachable build database |
| `git diff --check` | PASS |

Sandbox PostgreSQL runs failed and passed outside-sandbox reruns. The sandbox build compiled, then reproduced `Could not parse output from TypeScript's --showConfig`; its outside-sandbox rerun passed. An initial isolated-copy setup command lacked dependencies; after copying installed dependencies, route generation/typecheck/tests passed without installing/upgrading packages. No workspace-generated files or private environment files were changed. No live/cross-application acceptance is claimed.
