# IS admission contract — review proposal

2026-11-16, `0.1.0-proposed.1`. Companion to the [ADR](UNIFIED-ADMISSION-ADR.md). Paths and fields below do not exist yet. [Proposed OpenAPI](openapi/is-admission-proposed.openapi.json) is separate from the unchanged live Consumer API specification; no registration or runtime behavior changes in this task.

## Browser and BFF protocol

1. App BFF creates random state, nonce and PKCE S256 verifier; persists a short-lived transaction bound to its current app session and expected verified `(issuer, subject)` when already logged in. It starts navigation to proposed `GET /api/is/v1/admission/authorize` with registered `client_id`, exact `redirect_uri`, state, nonce, challenge and `code_challenge_method=S256`. An optional tenant UUID is only a requested choice. No arbitrary user, role, audience or return URL accepted. Invalid/unregistered callback requests never redirect.
2. IS authenticates via its own secure session, runs current global eligibility, resolves client→application/environment, and creates a server-side admission transaction. GET does not grant admission. IS uses Nexus internal `listEligibleContexts(verifiedSubject, registeredClient)` with pagination; it never accepts an arbitrary browser subject. Choices are current active initialized tenants with active self-membership, active app and effective entitlement. Approved domain hints may reorder display only.
3. Zero contexts: deny-only UI, no code. One: explicit confirmation. Multiple: explicit tenant selection followed by an entitled registered app choice. This flow is for one requesting app; a launcher may initiate a separate registered flow for another app. No cross-app code reuse. Proposed same-origin `GET /api/is/v1/admission/transactions/{id}` displays only the authenticated person's transaction; `POST .../{id}/selection` requires secure IS session, exact canonical Origin, CSRF protection, UUID tenant and expected transaction version. Server derives user/application from transaction and rechecks live eligibility under a consistent snapshot. Foreign, expired and hidden transaction IDs yield uniform unavailable errors.
4. Successful selection durably records audit plus one-use opaque code digest, transaction/subject/session/client/environment/tenant/callback/nonce/PKCE binding and revocation generations. Code lifetime <=60s and no later than originating session expiry. Redirect only to exact approved HTTPS callback with code and original state, no tenant/user claims in URL. Apply no-store, no-referrer and log redaction on both origins. Error redirects use validated callback/state only; no hidden tenant reason.
5. BFF validates state and exchanges the code via proposed `POST /api/is/v1/admission/redemptions` over HTTPS, authenticated using registered private_key_jwt (exact redemption endpoint audience, <=60s, atomic JTI replay prevention) plus PKCE verifier and exact redirect. A fresh DPoP proof binds receipt sender key; token-endpoint-style proof excludes `ath`. The service client is the existing human client's trusted registration, not client-credentials impersonation. Enabling a new authentication audience requires separately reviewed provider support/configuration; do not assume the current token-endpoint assertion audience works here.
6. IS consumes code atomically with admission persistence/audit, verifies live originating human session/eligibility and all bindings, then returns signed `admission_context`. Replay, callback/client/key/PKCE mismatch and concurrent redemption fail closed. A crash after consumption requires a fresh flow; no unsafe code replay recovery. BFF validates signature and claims, nonce, subject and transaction match, and stores admission reference/context server-side with its app session and selected canonical tenant. No browser token storage. Revalidate user through authoritative subject mapping; preserve the consumer's local IDs and explicit account links.

The proposal is additive to OIDC and does not change its token endpoint. It does not repurpose ID tokens or expand current scopes. Initial transition retains the separate existing human Nexus resource grant. BFF must verify login, admission and resource-grant subjects map to the same stable human, same application and environment. If the provider cannot establish that proof, deny and require fresh authorization; never compare email alone. A future combined OAuth response extension can replace the extra transaction only after pinned-provider compatibility review. No refresh grant or new credential issuance mechanism is implicitly authorized.

## Verifiable context profile

Use the exact configured/discovered Identity issuer (including `/api/auth` where configured), maintained JOSE verification and Identity-owned signing key lifecycle, with separate explicit type `is-admission+jwt`, pinned issuer/JWKS/algorithm and exact single audience equal to registered target client ID. Required claims: `iss`, opaque `sub`, `aud`, `iat`, `exp`, unique `jti`, `nonce`, `tenant_id` (canonical UUID), `application_id` (UUID), `client_id`, `environment`, `admission_id`, `auth_time`, `cnf.jkt` (redeemer key) and opaque revocation generation. `sub` uses the reviewed client subject policy; do not equate public/pairwise subjects with database user IDs. No emails or local resource roles required. Subject mapping is performed by Identity; no new local user IDs.

Receipt expiry <= min(issue+300s, originating IS session expiry, associated human authorization expiry). Validate `iat`, `exp`, optional `nbf`, key/type/audience, client/application/environment, nonce and sender binding; clock skew <=5s cannot extend absolute expiry. Admission ID is not a bearer credential. Signature verifies origin/integrity only; receipt is neither a Nexus token nor permission to execute business work. Renew through a fresh reviewed admission flow. Opaque revocation state must survive delete/recreate and re-enable.

## Continued eligibility

Keep current `POST /api/nexus/v1/access-decisions` strict request `{tenantId, applicationId, operation}`, current DPoP Nexus-audience human credential and approved BFF Origin. **Do not add an admissionId to v1's strict request or accept admission JWTs at that endpoint.** App binds its stored receipt to the same verified subject/client/tenant/application as the Nexus credential and response. Current v1 response fields and error semantics remain normative; [live OpenAPI](openapi/nexus-consumer-v1.openapi.json) is preserved.

For admission-aware revocation, a separately negotiated future `is-admission-1` access-credential profile records admission linkage in Identity's authoritative issuance state (or a separately versioned decision contract after review). It must not infer linkage from caller fields. Validators check that linkage online; rejected/missing profile cannot downgrade to legacy. Until this exists, per-admission revocation cannot be promised for legacy resource credentials: revoke the associated existing credential/session through supported lifecycle and clear app admission state. This is a release dependency, not an implemented capability. Explicitly label legacy versus admission-aware cohorts; never advertise the stronger guarantee on legacy tokens.

Each decision derives actor from Identity and caller from trusted client→app/environment binding, checks live global eligibility, active tenant/governance/member/app/entitlement, scope/operation, credential and (new profile) admission state. No service-class fallback. Existing bounded consistent snapshot, durable audit, no-store, max five-second validity and zero positive cache remain. Applications compare response context, enforce deadline at actual side effect, check local resource→tenant ownership and roles, and repeat at queue dispatch/consequential work. New snapshots after committed revocation deny; earlier snapshots have only their original deadline. No distributed transaction with app side effects is claimed.

Unavailable Identity/Nexus/admission/audit/replay store, unknown profile, incomplete issuance or expired context deny protected work. Existing 401/403/404/429/503 and uniform false decision semantics remain. No stale local-policy fallback or silent conversion of denial to workload mode. App login may remain valid while selected admission is cleared and reauthorization is required.

## Transport and privacy

All new request schemas reject unknown fields and bounded sizes (16 KiB selection, 32 KiB redemption). Browser mutations require exact Origin, CSRF and authenticated IS session; redemptions use client/proof authentication with no cookie fallback or public CORS. Exact HTTPS redirects and public registration disabled. Persist state/replay across instances; rate-limit by client, subject, transaction and source without enumerating hidden tenants. Uniform inaccessible transaction/tenant errors, sanitized request IDs, no raw code/assertion/proof/token/session identifiers in logs. Audit records metadata/digests only and commits before allow. Internal APIs enforce module authorization and tenant scoping even in a single process.

## Admission and tenant selection

```mermaid
sequenceDiagram
  actor Person
  participant App as App BFF
  participant IS as IS admission / Identity
  participant Nexus as Nexus internal policy
  Person->>App: Open application
  App->>IS: Admission request (registered client, state, nonce, PKCE)
  IS->>Person: Authenticate human
  IS->>Nexus: List eligible contexts for verified human and app
  Nexus-->>IS: Effective choices only
  alt No eligible tenant
    IS-->>Person: No access; no admission code
  else One eligible tenant
    IS->>Person: Explicit confirmation
  else Multiple eligible tenants
    IS->>Person: Explicit tenant selection
  end
  Person->>IS: Confirm selection (session + Origin + CSRF + version)
  IS->>Nexus: Recheck selected tenant and app
  IS-->>App: One-use code + state to exact callback
  App->>IS: Redeem (client assertion + PKCE + DPoP)
  IS->>Nexus: Recheck eligibility and revocation
  IS-->>App: Signed, subject/client/tenant/app-bound context
  App->>App: Verify nonce, identity binding; bind own app session
```

The confirmation/redemption arrows apply only to eligible branches. A change between listing, selection and redemption denies rather than using the displayed snapshot.

```mermaid
sequenceDiagram
  actor Person
  participant App as App BFF / executor
  participant IS as IS admission
  participant NX as Nexus access-decisions
  Person->>App: Switch active tenant
  App->>IS: New bound transaction and explicit selection
  IS-->>App: New one-use code and verified context
  App->>App: Atomically replace selected context, increment local version
  Note over App: Old forms/queued contexts cannot inherit new tenant authority
  Person->>App: Protected operation
  App->>NX: DPoP human token; selected tenant/app/operation
  NX-->>App: Deny, unavailable, or context-bound allow <=5s
  App->>App: Check session version, subject, tenant, local resource roles and deadline
  App-->>Person: Execute authorized work or deny
```

Concurrent tabs use explicit context/version; a switch cannot silently retarget a resource or queued job. Jobs carry original tenant/actor and must reauthorize, never substitute the newly selected tenant.
