# Stage 2D — Nexus human consumer tenant runtime

2026-11-10. Local runtime implementation authorized by the Stage 2D request. **Default disabled. Not ready for Sandcastle activation or production cutover.** [Sandcastle handoff](SANDCASTLE-M11-NEXUS-HANDOFF.md) records the integration profile and remaining acceptance gates.

## Git baseline and ownership

Started with a clean worktree already on `feature/nexus-consumer-runtime`, at Identity checkpoint **`f8941c3feefc36d937e399e2789a6dd3a74aa898`**. That commit remains HEAD, unamended. No other Codex session/agent, branch switch, commit, push, merge or deployment occurred. All changes listed below are Stage 2D changes on top of the checkpoint. Historical migrations 0001–0008 are unchanged. No persistent `is_dev`/Neon migration, client provisioning or environment edit occurred.

The architecture remains one deployable modular monolith: Identity validates people/credentials; Nexus evaluates canonical tenant eligibility; Sandcastle owns active selection, its session and Story/Canon/Scene resource permissions. Authentication, email/domain matching and Nexus/IS administrator status never grant consumer tenant access.

## Runtime implementation

Four Next.js Node route bindings call thin shared HTTP handlers under `/api/nexus/v1`:

- `GET /me/tenants`: scope `nexus:tenants:read`, paginated self discovery, canonical UUID/key/name, role and revisions.
- `GET /tenants/{tenantId}/membership`: scope `nexus:membership:self`, effective self membership only.
- `POST /access-decisions`: scope `nexus:access:evaluate`, strict tenant/application/operation request, uniform 200 denial or audited, context-bound allow.
- `GET /tenants/{tenantId}/applications/{applicationId}/entitlements`: scope `nexus:entitlements:read`, effective calling application only; cross-app/hidden contexts use uniform 404.

`src/lib/nexus-consumer/{service,http,runtime}.ts` implements the independently testable eligibility service, transport and default-off application assembly. SQL is parameterized. There is no alternate credential mechanism, arbitrary user query, operator-route fallback, application directory, global active tenant, service/token exchange, delegation or Billing dependency.

Eligibility requires canonical UUID, active tenant, initialized governance with active administrators, active self membership, active consuming application, enabled entitlement and (for decisions) explicit enabled client/resource/environment operation grant. Endpoint reads use the approved resource-scope ceilings. Unknown/hidden/inactive/uninitialized contexts do not expose diagnostics or revisions. A globally ineligible application/client can be rejected by Identity before Nexus lookup.

Discovery cursors are random, digest-only persisted references, bound to issuer/client/user/application/token/page size and policy revision. Expiry is <=five minutes and token expiry. Every page revalidates eligibility. Policy mutations invalidate cursors; no offset/count leaks. Consumers must inspect all pages before assuming one eligible membership. Membership/tenant revisions are advisory; they never substitute for live authorization.

The service records durable redacted audit before positive response. No tokens/proofs/raw bodies/secret values are logged or persisted by Nexus. A shared database caller budget limits authenticated requests to 120/minute; nonce quotas are still supplied by Identity. Bounded cleanup/retention scheduling and perimeter unauthenticated throttling remain operational release work.

Mutation transport requires JSON, <=16 KiB streaming body and two-second read budget, exact configured HTTPS BFF Origin and no cookie authentication. No browser CORS relaxation. All responses have no-store, nosniff and request ID; nonce responses use the maintained 401 challenge helper. Canonical external HTTPS request origin is pinned; arbitrary forwarded headers do not choose trust policy. Actual HTTPS proxy acceptance remains unproven.

## Identity integration and checkpoint interface changes

The new `src/lib/identity/consumer-integration.ts` composes the checkpoint's real adapter, registry, nonce service, supported OAuth claims extension and after-hook. It validates proofs/credentials, then **rechecks Identity inside the same REPEATABLE READ transaction as Nexus policy and audit**. The transaction captures evaluation time before policy reads, checks token/nonce expiry and enforces <=2s evaluation including a post-commit check. Transport rejects already-expired decision responses. No positive cache or eventual event is used for security.

Two small checkpoint interfaces changed, clearly visible in the Stage 2D diff:

1. `GrantEvidence.authorizationCodeDigest` is populated only from native successfully validated authorization-code input in `provider-issuance.ts`.
2. `RegistryOptions.validateIssuance(tx, issuance, grant)` runs **inside** `registerIssuance` after its authority lock and live binding checks. The consumer composition uses it to enforce grant provenance/generations and `private_key_jwt`; the existing 2C.2 tests retain their original profile when the callback is absent.

These changes are necessary because checking code generations before a separate issuance transaction would permit a disable/re-enable race. No weakening or acceptance bypass is added; migration 0008 is untouched.

`src/lib/auth.ts` adds opt-in assembly only. With the Identity gate absent, current Google/OIDC configuration is unchanged. With explicit valid HTTPS configuration, the provider receives the consumer extension and before/after hooks, approved scopes and per-client resource enforcement; resources are not auto-seeded. JWKS/replay dependencies use the same pinned provider. The default application instance grants **no internal lifecycle administration authority** (`authorize` denies); privileged provisioning/maintenance must use separately reviewed internal authorization, not a new public route.

### Remaining-blocker decisions

| Prior blocker | Initial human runtime treatment |
| --- | --- |
| Administration integration | Mandatory. Gated before-hook denies native update/delete/key or secret rotation for bound consumer clients; resource mutation paths are denied. Missing client identity on those mutation paths also denies. This prevents an untracked native disable→enable/rotation bypass. Emergency disable uses Identity generations through reviewed internal governance; no native mutation/recovery UI is exposed here. Direct privileged DB/config changes remain a trusted operations boundary requiring invalidation and explicit approval |
| Outstanding authorization codes | Mandatory and implemented for the gated resource profile. Before native authorization, capture client generation; after provider creates a code, use supported provider hashing/verification APIs to store only its digest, verified client/session/user, generations and expiry in 0010. Registration compares those generations and atomically binds the code to the exact token identifier/digest while holding its issuance lock. Every resource validation rechecks that binding and private-key client method, so pre-profile positive registry rows cannot become accepted credentials. Registered code provenance is retained through at least token expiry+30 days; cleanup must respect `registered_until`, not just the original code expiry. Unknown/pre-integration codes cannot register. A code outstanding across invalidation/re-enable returns no usable token; protocol test verifies 503 and old-token denial, followed by successful fresh authorization |
| Current user security | Mandatory existing checks are enforced: exact verified subject/user/session, individual revocation, user/session/client/sender/signing-key generations and live binding. No global suspension/block feature currently exists; `suspendUser` remains unsupported and admission removal remains login-only. A global block/login-suspension product requires separate authorization; this runtime does not claim to implement it |
| HTTPS/browser acceptance | Mandatory **before live activation/cutover**, not established by HTTP-shaped tests. Persistent TLS/OAuth/browser/proxy acceptance and separate activation approval remain blockers |

The initial application assembly is public-subject only unless an authenticated pairwise introspection dependency is explicitly supplied to the composition. Missing pairwise support fails issuance; there is no email/subject fallback. Existing foundation tests continue proving pairwise persistence/resolution separately. Client registration/provisioning is not performed by application startup.

The native integration is deliberately restrictive for dedicated consumer clients. A supported governance/provisioning/recovery workflow, pairwise observer if needed, code-consent resume through actual browser flows, key operational policy and load/timeout/cleanup review are release gates. This does not claim every administrative action is usable in production today.

## Consistency, selection and revocation

One bounded snapshot contains uncached Identity state, tenant/governance, self membership, app, entitlement, operation grant and revisions, plus audit. `validUntil <= min(evaluatedAt+5s, credential expiry, nonce expiry)`. Membership or entitlement changes committed before a new snapshot deny. Tests pause an older snapshot, commit revocation through another connection, and verify the older allow stays bounded while new decisions deny. Earlier in-flight work cannot be retroactively undone; Sandcastle owns deadlines, idempotency and compensation.

Sandcastle owns active selection: zero eligible tenants -> no selection; one -> optional auto-selection; multiple -> user choice. Store selection in tamper-resistant server-controlled consumer session state and revalidate before protected tenant operations and queue execution/side effects. A 12-hour application session is not 12-hour tenant authorization. No IS preference or tenant-ID rewrite was added.

## Migration review

Local history ends at candidate Identity 0008; new additive candidates are:

- **0009 Nexus:** explicit disabled-by-default operation grants; monotonic tenant/application/entitlement/membership and coarse consumer-grant revisions/tombstones; global policy revision for cursor invalidation; server-side cursors; redacted audit; persistent caller rate budgets. Triggers cover existing authorized writers and direct SQL row changes without replacing 0007's last-admin functions. Consumer membership revision is separate from Stage 1's optimistic write version. Trigger-owned epoch rows reject reset/delete/truncate; delete/recreate cannot reset revision. No automatic memberships, entitlements or operation grants.
- **0010 Identity:** generation-bound authorization-code sidecar only, referencing the existing authority. No provider-owned tables or 0008 checksums are modified. Default provider storage is explicitly hashed, and the integration uses the supported provider hashing API rather than reimplementing it.

Apply only after separate exact target/branch/ledger/checksum/grant/backup/restore review. Do not assume 0008 exists in `is_dev`, fill 0005, edit history or use an unverified default test URL. Fresh and populated disposable migration fixtures exercise the entire sequence. Both existing PostgreSQL fixtures were adjusted only to apply migrations in numeric order as new successors appear; all prior acceptance assertions remain.

Runtime roles must lack ownership/DDL/TRUNCATE/sidecar-reset privileges; SQL owners can disable triggers and remain trusted operators. New state and audits need explicit retention/cleanup schedules before sustained production traffic. Operation grants/provisioning must be separately authorized and auditable; no policy management endpoint is introduced here.

## Gates and live status

`NEXUS_CONSUMER_API_ENABLED` defaults false. Both `NEXUS_MEMBERSHIPS_ENABLED=true` and a valid opt-in Identity integration are prerequisites; enabling the API alone returns 503. Identity assembly requires `IDENTITY_NEXUS_CREDENTIALS_ENABLED=true`, canonical HTTPS `BETTER_AUTH_URL`, exact same-origin `/api/nexus/v1` `NEXUS_CONSUMER_RESOURCE`, and environment `development|staging|production`. POST additionally requires an exact configured HTTPS origin in `NEXUS_CONSUMER_TRUSTED_ORIGINS`. No flags or environment files were changed. Missing schema/binding/grant/keys/readiness fails closed.

Read-only native development readiness returned **200**, and the consumer probe returned **404** for `/api/nexus/v1/me/tenants`, confirming gate-off behavior. No protected live token flow, Google browser login, consumer callback or Sandcastle execution was tested. The current HTTP development topology is not suitable for enabled resource acceptance and was not silently changed.

## Validation

Node v24.22.0 / npm 11.19.1. Tests never read `DATABASE_URL`; their temporary PostgreSQL clusters and loopback HTTP server contain synthetic data only. The HTTP test server constructs the fixed trusted external HTTPS URL internally; this is real TCP handler/protocol/database integration, **not real TLS or a deployed Next.js browser round trip**. The four Next route modules are thin bindings to those tested production handler factories.

| Check | Result |
| --- | --- |
| `npm run test:consumer:pg` | PASS: 34 tests including foundation parent/cases and 14 Stage 2D cases; real provider/private-key issuance, HTTP transport, cross-user isolation, hidden contexts, pagination, signature/type/audience/registry denial, DPoP/replay, code generations, audit failure, independent-connection revocation snapshots, expiry and outages |
| `npm run test:identity:compat` | PASS: 31 pinned-provider tests |
| `npm run test:memberships:pg` | PASS: 26 tests, including READ COMMITTED/REPEATABLE READ last-admin races, authorization/CSRF, audit and migration compatibility |
| Route generation / typecheck / standard tests / build | PASS: Next route generation; TypeScript; `npm test` (8 file-level sandbox results), equivalent outside-sandbox runner (63 tests); production build outside sandbox |
| OpenAPI | PASS with existing pinned Swagger Parser 12.1.0; four human paths marked implemented/default-disabled; other paths deferred; narrowed request profile and tenant key recorded |

Sandbox PostgreSQL runs failed and were rerun outside sandbox. Baseline/build validation uses a fresh `/tmp/is-stage2d-validation-*` source copy without private environment files and synthetic settings with an unreachable loopback database. No live workspace `.next` replacement. A sandbox build compiled then reproduced the known TypeScript subprocess-output failure; its outside-sandbox rerun passed with expected synthetic unreachable-database warnings. No deployment or cross-application acceptance is inferred.

## Commit/release recommendation and rollback

Keep every change in this report as a separate Stage 2D commit on the feature branch; do not amend checkpoint `f8941c3`. The exact commit manifest is recorded below. After review of code, migrations, tests and the explicit release limitations, pushing the feature branch for review is reasonable; it is **not** a recommendation to deploy, migrate persistent databases or enable Sandcastle enforcement. No push was performed.

Before activation: reconcile actual target state and immutable migration history, rehearse additive migration/backup/old-code compatibility and runtime grants; provision dedicated HTTPS/private-key client/resource/binding/operation grants with audit/read-back under separate authorization; exercise browser login/consent/resume and HTTPS proxy/challenges, actual Node routes and Sandcastle execution deadlines; review incident invalidation/recovery and current-security semantics; then separately approve activation for narrow cohorts.

Rollback disables consumer/Identity gates or returns deny-safe unavailable, preserves existing Google/OIDC settings and all additive audit/cursors/generations/mappings/revocation/epoch state, and restores compatible application code. No down migration, ledger edit, token resurrection or permissive legacy fallback. Once consumers enforce central decisions, freeze affected operations during incompatible rollback rather than bypass committed revocations.


## Exact Stage 2D commit manifest

Commit these files together on `feature/nexus-consumer-runtime`, preserving checkpoint `f8941c3`:

```text
db/migrations/0009_nexus_consumer_runtime.sql
db/migrations/0010_identity_consumer_code_barrier.sql
docs/NEXUS-CONSUMER-API-CONTRACT.md
docs/NEXUS-CONSUMER-IMPLEMENTATION-PLAN.md
docs/NEXUS-CONSUMER-SECURITY.md
docs/SANDCASTLE-M11-NEXUS-HANDOFF.md
docs/STAGE-2D-NEXUS-CONSUMER-RUNTIME.md
docs/openapi/nexus-consumer-v1.openapi.json
package.json
src/app/api/nexus/v1/access-decisions/route.ts
src/app/api/nexus/v1/me/tenants/route.ts
src/app/api/nexus/v1/tenants/[tenantId]/applications/[applicationId]/entitlements/route.ts
src/app/api/nexus/v1/tenants/[tenantId]/membership/route.ts
src/lib/auth.ts
src/lib/identity/consumer-integration.ts
src/lib/identity/credential-registry.ts
src/lib/identity/provider-issuance.ts
src/lib/nexus-consumer/http.ts
src/lib/nexus-consumer/runtime.ts
src/lib/nexus-consumer/service.ts
tests/integration/nexus-memberships.test.mjs
tests/protocol/identity-lifecycle.test.mjs
tests/protocol/nexus-consumer-runtime.mjs
```

No commit or push was created. Do not stage private environment files, generated `.next`/TypeScript output or any consumer repository. `git diff --check` passed; the working tree contains only the listed Stage 2D changes.
