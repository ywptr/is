# IS-ADMISSION-1 — Internal Nexus eligibility facade

2026-11-16. Implemented under the explicit internal-runtime authorization following the [admission ADR](UNIFIED-ADMISSION-ADR.md). This increment is independent of Sandcastle cutover: its prior Test 1/Test 2/live revocation acceptance gaps remain open. No new browser flow, public admission endpoint, credential, service identity, global governance or Billing behavior is implemented.

## Baseline and scope

Initial tree clean; branch `feature/nexus-consumer-runtime`, HEAD `938f27dc94a96d5b791933d7d6aef33aa0415e12`. Read-only remote lookup confirms that same branch SHA. Existing four Consumer handlers, authentication integration, scopes, request/response formats, Origin/CSRF, canonical request/DPoP validation, rate budgets, cursor persistence and audit semantics remain in place. Consumer OpenAPI, historical migrations, configuration, local IDs and consumer repositories are unchanged. No live authenticated acceptance, migration/bootstrap audit, provisioning or persistent database action was performed.

## Interfaces and ownership

| Module / file | Interface and responsibility |
| --- | --- |
| Identity `src/lib/identity/eligibility-context.ts` | `createEligibilityIdentity`: `verify(headers, registeredClientId)` authenticates through the trusted Better Auth session callback and returns opaque `VerifiedEligibilityContext`; `run(context, work)` rechecks session/user/registered client state in the policy snapshot |
| Nexus `src/lib/nexus-eligibility/policy.ts` | Shared transaction-scoped `listEffectiveTenants`, `readEffectiveContext`, `isOperationAllowed`, `readPolicyState`; the existing effective-eligibility SQL was moved here unchanged |
| Nexus `src/lib/nexus-eligibility/service.ts` | `createEligibilityService`: `listEligibleTenants(context, {limit?, cursor?})`, `getEffectiveSelfMembership(context, tenantId)`, `evaluateTenantApplication(context, tenantId)`, `evaluateAccess(context, {tenantId, operation})`; uniform denial, metadata and transactional audit |
| Server composition `src/lib/nexus-eligibility/runtime.ts` | `createISEligibilityRuntime()` binds the real `auth.api.getSession` verifier (cookie cache disabled), existing Identity transaction owner and Nexus facade. Exposes `verifyContext` and `eligibility`; no automatic invocation during login/startup |
| Consumer `src/lib/nexus-consumer/service.ts` | Uses the same extracted policy reads; retains its existing transport-independent scopes, Identity/DPoP boundary, numeric membership compatibility, output projections, audit, budgets and persistent cursor behavior |

Example for trusted server code (not a route or browser API):

```ts
const nexus = createISEligibilityRuntime();
const context = await nexus.verifyContext(requestHeaders, registeredClientId);
const choices = await nexus.eligibility.listEligibleTenants(context);
const decision = await nexus.eligibility.evaluateAccess(context, {
  tenantId: requestedCanonicalTenantId,
  operation: registeredOperation,
});
```

Keep the runtime instance with its contexts/cursors in the same server process. `registeredClientId` is a lookup key from trusted IS mediation; it is not an application assertion. Identity resolves the exact enabled issuer/client/resource/environment binding and Nexus linkage. No facade method accepts a user ID or application ID. A requested tenant and operation grant nothing by themselves. Future browser routes must authenticate, validate their own transaction/client/state and enforce strict Origin/CSRF; this factory does not authorize adding such routes.

Identity checks live verified-user/session ownership and expiry, the existing global admission permit list, client auth method, resource registration, application/environment/purpose linkage and client/session/user generation state. Epoch absence uses Identity's existing initial-generation-1 convention; missing registration/authority/session denies. It does not infer identity from email or client ID. Email is used only for the existing global permit check after stable session identity is verified. Nexus remains sole membership, tenant lifecycle and entitlement authority.

A verified context is a frozen process-local capability recorded in a private WeakMap, bound to the original user/session/client/application/generations and capped at five minutes or session expiry. Copies, fabricated objects and contexts issued by another Identity instance are rejected. Every read revalidates current state; contexts are not cached eligibility. Generation invalidation followed by re-enable cannot revive an old context; a new verification is required. Actual session expiry/deletion also denies.

## Effective results, revisions and consistency

All four facade operations require an active initialized canonical tenant, active self-membership, active registered app and enabled entitlement. Membership and entitlement views return the complete effective context, not hidden raw configuration. An inaccessible tenant returns only `{available:false}`. Access evaluation additionally checks the existing registered operation grant and returns uniform `{allowed:false, code:'access_denied', decisionId}` on policy denial. It never reveals why a tenant is hidden or returns revision details on denial. Discovery returns only effective choices, ordered by canonical UUID, with zero/one/multiple outcomes and no automatic selection or membership creation.

Successful results carry registered `applicationId`, `clientId`, `environment`, effective tenant/membership/entitlement information and metadata:

- `evaluatedAt`, `validUntil`: at most five seconds from snapshot acquisition, also capped by original context and current session expiry.
- `policyRevision`: existing coarse Nexus revision; invalidates internal pagination after any covered policy change.
- `identityRevision`: existing Identity authority revision from the same snapshot.
- `consumerGrantVersion`: existing global operation-grant epoch.
- Per-context `versions`: tenant, membership, application and entitlement tombstone-backed epochs. Internal revisions are decimal strings, avoiding JS integer overflow; existing external numeric membership representation remains unchanged.

Metadata is advisory snapshot evidence, not a signed admission credential, resource permission or authorization cache. The existing Identity transaction helper supplies REPEATABLE READ, statement/lock/idle timeouts, bounded two-second evaluation, rollback and sanitized failures. Identity, policy revisions, membership, lifecycle, entitlement and operation reads plus audit use the same transaction/client. The internal boundary checks deadline/evaluation time before commit and after transaction return. Audit failure or missing/unavailable policy/schema returns no allow. Internal audit entries reuse `nexus_consumer_audit` with `is.eligibility:` operation prefixes and context digests; no raw cookies, tokens or private keys are logged.

An earlier in-flight snapshot may allow only within its original deadline. A fresh snapshot after a committed membership/entitlement revocation denies. No positive cache or stale/outage allow is introduced. Future issuance must recheck at the actual issuance boundary, and applications still own local resource checks and execution deadlines.

Pagination uses opaque in-process cursor objects, default 50/max 100, bound to exact verified context, limit, revision and expiry. Every page reauthorizes. Cross-context, forged, expired or revision-stale cursors fail closed with `dependency_unavailable`; restart discovery with a fresh context as appropriate. This is deliberately not the future serialized browser cursor protocol or the Consumer API's persisted token-bound cursor.

Facade errors are `invalid_request` for invalid argument shapes/UUIDs/operations, `invalid_context` for absent/revoked/foreign identity capabilities or registration, and `dependency_unavailable` for database/audit/policy/timeout/readiness failures. Identity's verification API uses `invalid_context` or `identity_unavailable`. No raw backend error is exposed. Internal readiness requires literal membership and Identity credential gates; it does not require `NEXUS_CONSUMER_API_ENABLED`. Changing the external HTTP gate therefore does not define internal eligibility authority.

## Schema and preserved safeguards

No new schema or migration is required. The implementation requires the existing Better Auth session/user/client/resource tables, Identity credential authorities/bindings/epochs, Nexus application linkage (including migration 0012 purpose), membership governance, entitlements, consumer revisions/epochs/operations and audit. Missing schema/state fails closed; no automatic schema creation, provisioning, bootstrap or login membership creation occurs.

Existing migration 0007 last-tenant-admin protection and last-Nexus-operator protection are unchanged. Neither the facade nor Identity writes memberships, entitlements, governance counters or revision tables. The only new read-path persistence is audited metadata in the existing Nexus audit table. Data authority and existing write services remain intact.

## Differences from the proposed admission contract and readiness

This is a callable internal eligibility foundation, not admission issuance. The initial supported application binding is the currently provisioned `nexus_consumer` registration profile, including its exact environment/resource and `private_key_jwt` client method. Arbitrary OIDC-only clients and an application catalogue/launcher are not newly supported. No client is automatically upgraded.

The internal actor is the verified native IS user/session, not an OAuth subject guessed from user ID. It does not translate public/pairwise subjects or mint a `sub` claim. Outbound subject mapping and same-person login/resource/admission linkage remain Identity issuance work. No DPoP token is needed inside the process, while existing external APIs still require their unchanged DPoP access credentials. Internal methods have trusted module authority; OAuth scopes continue to apply at the external boundary.

Still required before admission issuance: approved code/redemption/provider composition, durable one-use code/admission state, nonce/PKCE/client/callback binding, admission-aware credential revocation linkage, signing/subject profile, UI/tenant selection, strict browser Origin/CSRF, distributed replay/serialized cursor transport, and independent consumer acceptance. These factories do not issue admission, revoke independent resource tokens or grant local resource permissions. The [migration plan](UNIFIED-ADMISSION-MIGRATION.md) continues to govern those separate increments.

## Local validation

Node v24.22.0 / npm 11.19.1; explicit PostgreSQL 17 binaries, disposable synthetic clusters only. No existing `DATABASE_URL` is used by the suites.

| Check | Result |
| --- | --- |
| Next route generation | PASS, isolated source copy |
| Typecheck | PASS, isolated source copy |
| Standard regressions | PASS, 84/84 |
| Stage 1 PostgreSQL/concurrency regressions | PASS, 26/26 |
| Pinned OAuth/DPoP provider compatibility | PASS, 31/31 |
| Identity lifecycle + administration + Consumer HTTP + internal eligibility | PASS, 67/67, including nine new internal scenarios |
| Isolated production webpack build | PASS on host |
| Diff whitespace and unchanged external contract/migration checks | PASS |

New internal scenarios cover zero/one/multiple discovery; active/inactive membership; suspended/uninitialized/hidden tenants; enabled/disabled entitlements/apps; trusted registration/environment/purpose and spoofed identity/application denial; cross-user/tenant isolation; process-local pagination and policy invalidation; real Consumer HTTP parity for all four APIs; independent-connection membership/entitlement revocation with consistent snapshot/epoch assertions; unavailable schema/database/audit and audit rollback; session expiry, unverified user, late-result denial; global permit and generation invalidation/re-enable.

The initial protocol run exposed unsupported TypeScript parameter-property syntax under Node's strip-only loader; the error classes now use explicit fields. A typecheck also caught two structural type annotations; those were corrected without runtime changes. Final 67-check run includes these fixes. Sandbox protocol execution did not provide useful child-test output; host execution is authoritative. Sandbox build failed to parse its TypeScript subprocess output, as in previous baseline checks; the isolated host rerun passed. No test was removed or existing assertion weakened.

Receipts: `/tmp/is-eligibility-unit-host.log`, `/tmp/is-eligibility-memberships-host.log`, `/tmp/is-eligibility-compat-host.log`, `/tmp/is-eligibility-protocol-host.log`, `/tmp/is-eligibility-typegen.log`, `/tmp/is-eligibility-typecheck.log`, `/tmp/is-eligibility-build-host.log`. Build source is `/tmp/is-internal-eligibility-build-xu1bqk4d`, with synthetic credentials/unreachable synthetic DB and no copied Development environment files. Live `.next` and `next-env.d.ts` were preserved.

These are local synthetic security/regression results. They do not establish new live Sandcastle Test 1/Test 2/revocation acceptance or production readiness. No production, consumer code, persistent database, credential, staging, commit, push or merge action occurred.

## Exact reviewed-file checkpoint

Milestone identifier: `IS-ADMISSION-1`. Nine changed files:

| Status | File |
| --- | --- |
| New | `src/lib/identity/eligibility-context.ts` |
| New | `src/lib/nexus-eligibility/policy.ts` |
| New | `src/lib/nexus-eligibility/service.ts` |
| New | `src/lib/nexus-eligibility/runtime.ts` |
| Modified | `src/lib/nexus-consumer/service.ts` |
| New | `tests/protocol/nexus-internal-eligibility.mjs` |
| Modified | `tests/protocol/nexus-consumer-runtime.mjs` |
| New | `docs/IS-ADMISSION-1-INTERNAL-ELIGIBILITY.md` |
| Modified | `docs/UNIFIED-ADMISSION-ADR.md` |

No obsolete files identified; no `git rm` is needed. Commands below are for the human operator after review; they were not executed. Recheck the branch/remote state before staging or pushing if it has changed since this audit.

```bash
git branch --show-current
git status --short
git diff --check
git add -- src/lib/identity/eligibility-context.ts src/lib/nexus-eligibility/policy.ts src/lib/nexus-eligibility/service.ts src/lib/nexus-eligibility/runtime.ts src/lib/nexus-consumer/service.ts tests/protocol/nexus-internal-eligibility.mjs tests/protocol/nexus-consumer-runtime.mjs docs/IS-ADMISSION-1-INTERNAL-ELIGIBILITY.md docs/UNIFIED-ADMISSION-ADR.md
git diff --cached --stat
git diff --cached
git commit -m "IS-ADMISSION-1: add internal Nexus eligibility facade"
git push is feature/nexus-consumer-runtime
```
