# IS-ADMISSION-2 — IS-mediated admission issuance

> IS-DOMAIN#0001 adds a separately gated [fixed-domain profile](IS-DOMAIN-0001.md) and [Sandcastle contract](SANDCASTLE-IS-DOMAIN-1.md). The general admission profile below remains supported.

2026-11-16. Local additive implementation; **default off, not activated, not a consumer cutover**. Implements the [reviewed admission contract](IS-ADMISSION-CONTRACT.md) on the [internal Nexus facade](IS-ADMISSION-1-INTERNAL-ELIGIBILITY.md). [Exact implemented OpenAPI](openapi/is-admission-v1.openapi.json). The earlier proposed OpenAPI remains unchanged as design history.

## Baseline and authorization

Initial tree clean on `feature/nexus-consumer-runtime`, HEAD `354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b` (`IS-ADMISSION-1`). Read-only remote lookup confirms the same feature branch SHA. Existing Identity/Nexus composition was reviewed; no admission route existed at that checkpoint. Earlier design prohibitions on implementation are superseded only by this task's bounded runtime authorization.

All four Nexus Consumer routes, their schemas, scopes, DPoP/nonce/credential lifecycle, canonical authority, Origin checks, budgets and response behavior are preserved. No existing OAuth registration/credential, environment file, persistent database, historical migration, consumer repository, production system or application session configuration was changed. No stage, commit, push, merge or deployment was executed. New routes are present in source but return no-store 404 unless explicitly enabled; no activation is authorized here.

## Implemented API

Base `/api/is/v1/admission`. Identity owns the admission service, codes, receipt state, signing/validation and revocation. Nexus owns effective tenant/member/app/entitlement reads. New `nexus.within` composes those existing reads and Identity persistence in the same bounded repeatable-read transaction. No Identity membership/entitlement authority is introduced.

| Method / path | Authentication and behavior |
| --- | --- |
| `GET /authorize` | Existing native IS session required. Strict registered allowlisted `client_id`, exact HTTPS `redirect_uri`, state, nonce, S256 challenge; optional tenant hint grants nothing. Creates a bounded transaction, sets an HttpOnly Secure SameSite=Lax `__Host-is_admission_csrf` cookie and returns 302 to same-origin transaction UI |
| `GET /transactions/{id}` | Original verified session/user/client lineage only. JSON returns effective canonical choices, transaction version, application UUID, expiry and durable cursor. `Accept: text/html` renders an explicit picker with no default tenant, no third-party assets and nonce CSP. Zero choices offers no admission; one or multiple choices require explicit selection/confirmation |
| `POST /transactions/{id}/selection` | Original session, exact IS Origin, matching CSRF cookie/header, strict `{tenantId, expectedVersion}`. Rechecks live eligibility; stores selected tenant and policy epochs and creates a one-use code lasting <=60s. Returns 303 to exact callback with code/state; exact `Accept: application/json` returns `{redirect}` for top-level browser navigation |
| `POST /redemptions` | Form-encoded client assertion, code, verifier and exact redirect. ES256 `private_key_jwt` with exact redemption endpoint audience and <=60s lifetime; native maintained DPoP proof, required server nonce, shared replay reservations, no `ath`. No cookies, Origin or Authorization fallback. Atomically consumes code, rechecks live lineage/eligibility and persists audited signed receipt before responding |

No other public admission endpoints were added. `service.validate(token, expectations)` and `service.revoke(headers, admissionId)` are internal Identity interfaces, not external introspection/admin APIs. Revocation is restricted to the original verified owner/session/client lineage; global administration is not introduced.

All responses are no-store; sensitive responses use no-referrer, nosniff and request IDs. Browser mutation bodies are bounded to 16 KiB; redemption to 32 KiB; duplicate/unknown fields, forged identity headers, malformed bodies, wrong Origin, cookie/proof substitution and conflicting authority fail closed. The shared canonical resolver validates the exact configured public host/HTTPS authority and any direct-listener alias; forwarded headers never choose authority. No public CORS or plain-HTTP exception.

Current structured errors include `authentication_required` (401), `invalid_request` (400), `invalid_origin`/`invalid_csrf` (403), `resource_not_available` (404), `transaction_conflict` (409), `access_denied` (403), `human_authorization_required` (403), `invalid_client`/`invalid_dpop_proof`/`invalid_admission` (401), `invalid_grant` (400), `rate_limited` (429) and `dependency_unavailable` (503). DPoP nonce challenges include `DPoP-Nonce` and require a fresh proof/assertion on retry. Hidden/foreign browser transactions are unavailable; no raw database/provider errors are returned.

## Trust and issuance profile

The service never accepts browser actor/user/application IDs. A real Better Auth session establishes the user; current trusted registration establishes application/environment. A temporary selection belongs to that transaction, not to a global active-tenant preference. The consumer owns its selected active tenant and local resource permissions.

The initial supported profile deliberately reuses an **existing active human Nexus resource issuance** from the original native IS session, same registered client, application and environment. Identity verifies its positive issuance registry, code barrier, current session/client/user/key generations and authoritative subject mapping in the policy snapshot. Its namespace must be `provider_access_subject`; pairwise and remote-JWKS clients are unsupported and fail closed. The redeemer must prove the same DPoP sender key as the associated human issuance. No email matching, user-ID-as-sub assumption, machine grant, ID-token-as-API-token or new OAuth scope is introduced.

This prerequisite is not another token endpoint grant or a registration upgrade. The BFF obtains/renews its existing human resource authorization through the existing supported flow first. Unsupported/no-current-human-grant flows cannot silently downgrade to OIDC-only access.

Receipt protected header: existing provider signing key ID, `alg=EdDSA`, `typ=is-admission+jwt`. Claims are exactly the reviewed profile: `iss`, authoritative opaque `sub`, single `aud` equal to the registered client ID, `iat`, `exp`, `jti`, `nonce`, `tenant_id`, `application_id`, `client_id`, `environment`, `admission_id`, `auth_time`, `cnf.jkt`, `generation`. `jti=admission_id` is a fresh UUID and initial generation is decimal string `1`. No emails, membership roles or local resource roles are issued. `auth_time` comes from the verified native session's creation time. Current signer omits optional `nbf`; verification checks it if present.

The existing provider `signJWT` implementation signs with an exact pinned existing key ID; no replacement key is minted if absent/expired. Admission's read-only public-key bridge avoids the native `getJwks` helper's lazy key-creation behavior on an empty store. Existing keys/clients are unchanged in the real-provider regression fixture.

Receipt expiry is <=300s and never exceeds the associated human authorization or originating session expiry. Transaction expiry is <=5 minutes, bounded by that same authorization/session; selection code is <=60s and no later than transaction expiry. Metadata never turns that receipt into a cached eligibility lease.

## Atomicity, revocation and continued access

Original user/session/client/application/generations, callback, nonce, S256 challenge and associated issuance are durable immutable transaction lineage. Only code digests are stored. Selection pins Nexus tenant/membership/application/entitlement epochs in server-owned state, without adding JWT claims. Redemption checks the same epochs and live eligibility again. Membership/entitlement changes committed before the snapshot deny; a toggle off/on or delete/recreate does not revive an old selected code or receipt because epochs advance. Unknown, inactive, suspended, uninitialized and unentitled contexts do not receive admission.

Redemption locks the transaction; one successful concurrent redemption can persist one receipt. Code consumption, receipt digest/state and Identity audit are one commit, alongside Nexus policy audit. Failure of signing, validation, audit, database or timeout returns no receipt and rolls back consumption. Fresh assertions/proofs are required even when retrying a failed transaction. A crash after commit but before delivery requires a fresh flow; successful codes are never replayed for recovery.

The existing Identity transaction owner supplies two-second evaluation and statement/lock/idle limits. Earlier snapshots racing a policy change may complete within their original <=5s policy budget; new online validation/continued decisions deny after the revocation commits. The receipt is not permission to bypass that fresh check. No system can undo already committed application/provider effects.

Internal `validate` verifies pinned signature/type/issuer/audience, independently expected subject/client/app/environment/nonce/tenant/key, exact stored digest/generation, current session/issuance, live Nexus policy and selected epoch binding. Revoked/expired or restored-after-policy-change receipts remain unusable to this internal validator. Tombstones cannot be cleared/deleted by the normal record mutation path.

Internal explicit `revoke` atomically marks the receipt revoked, advances its generation, audits the action and revokes its associated existing resource issuance. The existing unchanged Consumer APIs then reject that credential through their existing positive registry checks. **This conservative transition can invalidate other admissions sharing that resource issuance.** Re-consent/fresh authorization is required; no old token or code is resurrected.

`POST /api/nexus/v1/access-decisions` remains the externally supported fresh continued-eligibility operation, with its unchanged strict body and DPoP credential. A receipt is never accepted there, and no `admissionId` field was added. Applications must bind the same verified person/client/app/tenant and require both current eligibility and their own resource authorization before side effects/queued execution.

**Remaining security boundary:** legacy resource credentials do not carry the future admission-aware profile. They do not independently detect historical admission epoch changes after a membership/entitlement has been restored. Offline signature verification alone cannot observe receipt revocation or policy history. Internal `validate` is not a new public endpoint; a consumer verification/status composition that supplies the stronger online admission guarantee still requires review and implementation before cutover. Do not advertise receipt profile `is-admission-1` as evidence that the legacy access token has gained that future profile, or silently accept a missing profile. Explicit revocation-to-associated-token is implemented; the stronger general admission-aware continued-access contract is not claimed.

## Consumer verification and usage example

BFF flow, after its existing OIDC and separate Nexus human authorization:

1. Persist random state, nonce, PKCE verifier and expected verified identity in the BFF's own session-scoped pending admission transaction. Start the IS authorize navigation with the exact registered client/callback and S256 challenge. Never send user/application claims.
2. IS requires an already authenticated session. Anonymous requests return 401; complete existing IS login, then restart the admission request. Existing OIDC login UI/default redirects are unchanged; automatic pending-admission login resume is not implemented.
3. After explicit selection, validate returned state against that exact pending transaction. Distinguish admission codes from existing OIDC and Nexus consent codes. Never send this code to the native OAuth token endpoint.
4. Backend POST to the exact admission redemption endpoint with registered `private_key_jwt`, verifier, redirect, fresh token-endpoint-style DPoP proof and server nonce. Keep the existing resource sender key, assertion key and native token/consent flows intact. Do not send BFF cookies or an Origin/Authorization header.
5. Validate the receipt using independently trusted configuration and the already verified login/resource subject. Store receipt/reference and chosen tenant server-side in the app session. Never infer expected values from the unverified receipt or email. No browser token storage.
6. Enforce expiry, required online admission validity composition, fresh Nexus eligibility and local resource-to-tenant/role checks. No positive cache or outage fallback. Tenant switches start a new explicit context; existing forms/jobs retain their original actor/tenant and must reauthorize.

TypeScript verification reference (equivalent checks required in other languages):

```ts
const expected = {
  issuer: configuredIssuer, clientId: registeredClientId,
  applicationId: registeredApplicationId, environment: configuredEnvironment,
  subject: verifiedResourceSubject, nonce: pendingAdmission.nonce,
  tenantId: pendingAdmission.expectedTenantId, // optional on the first IS selection
  keyThumbprint: resourceSenderJkt,
};
const claims = await verifyAdmissionContext(receipt, pinnedIssuerJwks, expected);
// Signature/binding check only. No execution until the reviewed online admission
// validity composition, fresh access-decision deadline and local permissions pass.
```

On the first IS selection, the BFF need not know a tenant UUID in advance: omit the optional expected tenant, verify all signature/identity/application/nonce/key bindings and UUID shape, then take `claims.tenant_id` from the **verified** receipt as IS's confirmed selection. If renewing or targeting an already known context, require the independently stored expected tenant to match. Do not copy an unverified claim into the expected context. Store the selected canonical UUID in the application session only after verification; fresh online eligibility and local resource permissions are still required. The emitted JWT alone never creates local resource authority.

## Sandcastle compatibility

No Sandcastle, IG or Axtor code changed. Sandcastle keeps its existing Basic OIDC login registration, separate private-key/DPoP resource registration, four scopes, four Consumer calls and local session/tenant logic while M11 acceptance continues. The previously recorded identity-correct Test 1/Test 2/live revocation evidence gaps remain open; synthetic IS tests do not close them.

A later separately approved Sandcastle increment must add its own admission pending-state namespace/callback classification, native session-to-resource identity binding, explicit selection UX, exact new assertion audience, same sender-key reuse and receipt verification/status enforcement. It must preserve local Story/Canon/Scene ownership and deadlines. Existing Stories must not be assigned a tenant from a newly selected UUID, email or domain. Do not modify the working callback/client registration to experiment with this milestone. IG remains a separate consumer migration; service-to-service identity/delegation and Axtor runtime action authorization are outside this implementation.

## Schema, feature gates and local acceptance

Schema is an **unnumbered additive proposal**, [db/proposals/is-admission-2.sql](../db/proposals/is-admission-2.sql), outside the migration runner. It was applied only inside the disposable protocol fixture. It adds Identity-owned transaction, receipt/tombstone, cursor, audit and budget tables, restrictive references and immutable-lineage/retention guards. No Better Auth table schema or historical migration changed. Current disk history ends at 0012; no next migration number is reserved without actual target/branch/ledger/checksum reconciliation.

Gates (no environment was changed by this task):

- `IS_ADMISSION_ENABLED`: must be exactly `true`; unset/false returns 404 before service work.
- `IS_ADMISSION_CLIENT_IDS`: exact comma-separated opt-in client IDs; empty allowlist admits nobody. This is an independent rollout restriction, not registration or authorization proof.
- Existing `IDENTITY_NEXUS_CREDENTIALS_ENABLED=true` and `NEXUS_MEMBERSHIPS_ENABLED=true` plus configured trusted issuer/resource/environment remain required. Missing schema/dependencies fail closed. Consumer HTTP gate remains independent.

After **separate approval**, local acceptance should use a verified isolated target with synthetic users/tenants and an explicitly approved test registration/key owner. Reconcile the actual ledger, assign/review the migration, rehearse fresh/populated schema and previous-code compatibility, inspect runtime grants and restore/recovery, then enable only the dedicated local test process/cohort. Never default to an inherited `DATABASE_URL`, apply this proposal to existing Development as an audit, or change the existing Sandcastle clients automatically.

Acceptance must exercise native canonical HTTPS/browser navigation, existing IS login/restart behavior, one/multiple confirmation and zero-access UI, CSRF/Origin, two browser identities, app/tenant/subject/key binding, real registered assertions, nonce/replay, PKCE, simultaneous code redemption, audit outage, issuance/revocation/expiry and final execution deadlines. Confirm default-off 404 on other processes/cohorts. Browser logs, redirects, reverse proxies and BFF callbacks must redact codes/assertions/tokens; source request budgets/rate limits and operational capacity need release review. A synthetic HTTP-handler test is not native browser/cross-app acceptance.

Budgets are durable: 60 starts/minute per verified person/client, 60 browser reads/mutations/minute per person/client/transaction, 60 redemptions/minute per authenticated client/sender, and 120 authenticated redemption attempts/minute per client including nonce retries. Registered-client assertions are verified and reserved before any nonce challenge is issued; unauthenticated requests cannot allocate nonce state. Pending transaction caps are 32/person, 1000/client and 10000 globally. A shared authority write ensures repeatable-read quota checks cannot race past the cap; stale concurrent snapshots fail closed. Cursor pages are max 100, durable across service instances, transaction/revision/expiry-bound and reauthorized. Edge/source abuse controls and retained-state maintenance require operational review before public activation; no cleanup deletes audit/tombstones automatically.

## Rollback and remaining blockers

Rollback leaves admission gated off and restores a compatible application build while preserving the additive schema, receipt tombstones, audits, cursors and historical ledger. Never drop these tables, reset generations, clear revocation or rewrite old SQL. Explicitly revoked associated credentials remain revoked after backout. Unknown/new-profile consumer sessions stay denied or require fresh separately reviewed authorization; never fall back to OIDC-only tenant access. Production rollback/deployment/config changes need separate approval.

Before activation/cutover: exact database/ledger/grants/backup rehearsal and migration approval; supported consumer online admission-validity/profile composition; identity-correct M11 acceptance; reviewed BFF integration and independent expected tenant/identity binding; native browser/HTTPS/transport and redaction evidence; operational key/replay/rate/capacity/retention and recovery sign-off. Pairwise issuance, enterprise login resume, external admission introspection, refresh grants, generic service identity, global governance and Billing are not implemented. No new endpoint/claim/authentication fallback beyond the reviewed profile was invented.

## Recovery and resumed validation — 2026-11-17

All 23 original files matched `/tmp/is-consolidation-uuvl7l0x/wip-manifest.json` before edits. No archive restoration was needed. A copy of the archive, tracked patch, original manifest, migration hashes and recovery instructions is retained outside `/tmp` in `.local-recovery/is-admission-2-20261117/`. Its own ignore file excludes the entire private recovery directory from Git. This is persistent workspace storage, not an off-device backup; preserve it independently of workspace deletion.

The branch remains `feature/nexus-consumer-runtime` at `354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b`. Creating the dedicated WIP branch failed because `.git/index.lock` is on a read-only filesystem. No staging, commit or push occurred. The operator commands below create `wip/is-admission-2` before either commit, keeping admission changes off the production consolidation branch.

Review retained the existing implementation. Added a real-protocol regression for global permit removal, unverified user, expired originating session, disabled client and disabled application after selection: denial leaves the code unconsumed and no receipt persisted; restoring application state cannot revive the stale selected code. Added the implemented 413 body-limit responses to the OpenAPI. The independent [migration harness repair](IS-ADMISSION-2-REHEARSAL.md) preserves every original through-0011 check and adds exact-runner 0012 fresh/populated/restored compatibility and no-op checks. Historical migrations and their hashes remain unchanged.

## Current Development configuration

Read-only allowlisted inspection found `IS_ADMISSION_ENABLED` and `IS_ADMISSION_CLIENT_IDS` absent from the execution process and local environment files. Existing `.env.development.local` sets `IDENTITY_NEXUS_CREDENTIALS_ENABLED`, `NEXUS_MEMBERSHIPS_ENABLED` and `NEXUS_CONSUMER_API_ENABLED` to `true`. No configuration was edited and no persistent Development schema or client was changed. These file observations do not establish the environment of an already-running server. With the observed admission gate unset, newly started admission routes remain disabled. No live Development or cross-application activation is claimed.

## Local validation

Fresh 2026-11-17 native Debian run: Node v24.22.0 / npm 11.19.1, explicit PostgreSQL 17 binaries and synthetic disposable databases only. The human operator executed the prepared native runner and reported all zero exit codes; the receipts below were independently read from the workspace. No production credentials or Development env files were copied to the isolated source snapshot. The build used synthetic Google/Identity values, an unreachable synthetic database and disabled admission/Identity/Consumer/membership gates.

| Check | Result |
| --- | --- |
| Route generation | PASS |
| Typecheck | PASS |
| Standard tests | PASS, 94/94; npm and detailed assertion run |
| Membership PostgreSQL/concurrency | PASS, 26/26 |
| Pinned OAuth/DPoP provider compatibility | PASS, 31/31 |
| Identity/admin/Consumer/internal eligibility/admission protocol | PASS, 84/84, including 17 admission scenarios |
| Exact runner/backup/restore/0011–0012 rehearsal | PASS, 5/5 |
| Isolated production build (`npm run build -- --webpack`) | PASS |
| Proposed and implemented OpenAPI 3.1 / external references | PASS, 5 path items each, Swagger Parser 12.1.0 |
| Final whitespace, unchanged historical SQL/Consumer contract/auth composition, credential-marker and file-scope review | PASS |

Receipts are under `.local-recovery/is-admission-2-20261117/validation/receipts/`: `status.tsv`, `versions.log`, `typegen.log`, `typecheck.log`, `unit.log`, `unit-detailed.log`, `memberships.log`, `compatibility.log`, `protocol.log`, `migration-rehearsal.log`, `build.log`. The reviewed source manifest is `validation/source-sha256.json`; the source snapshot and runner are adjacent. Documentation/OpenAPI final corrections were checked separately after this source snapshot; runtime, SQL and test hashes match the tested snapshot. Prior dated receipts are retained in `prior-receipts/`; they do not substitute for this fresh run.

The original rehearsal failure (assuming 0011 was final) was an actual harness defect and is repaired. Earlier PostgreSQL socket denial and TypeScript child-output errors were sandbox restrictions; the native run resolved those verification gaps. Webpack emitted a workspace-root warning for nested lockfiles and expected Better Auth schema-connectivity warnings because the synthetic build DB is unreachable, then completed with exit 0. This proves compilation, not a working persistent database connection. The default Turbopack build is not claimed; the supported explicit webpack build passed. Live `.next`, `next-env.d.ts`, secrets and Development data were preserved.

Protocol coverage includes zero/one/multiple choices; immutable actor/client/app/session/key/callback/nonce/PKCE binding; CSRF/Origin; policy exclusions; nonce/assertion/proof/code replay; receipt signature/claims/expiry; simultaneous redemption; policy races and restoration non-revival; signing/audit/database rollback; explicit receipt/resource-token revocation; durable pagination/quotas; default-off behavior; unchanged OAuth clients/provider keys; existing OIDC login and all four Consumer APIs on the expanded schema. No existing acceptance assertion was removed. Synthetic evidence does not close Sandcastle/IG live acceptance or approve persistent migration, activation, deployment or consumer cutover.

## Human Git checkpoint

25 reviewed files total: the 23 admission files listed below plus the rehearsal test and its report, committed separately. No obsolete file exists and no `git rm` is needed. Review staged content for secrets and scope before each human commit. Recovery archives, receipts, generated output, local TLS material, environment files and database dumps must remain unstaged.

Run the branch preparation once from the existing baseline, with an empty index:

```bash
cd /home/user/src/is
set -euo pipefail
test "$(git branch --show-current)" = feature/nexus-consumer-runtime
test "$(git rev-parse HEAD)" = 354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b
git diff --cached --exit-code
git switch -c wip/is-admission-2 354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b
```

First commit, independent rehearsal repair:

```bash
git add -- tests/integration/identity-administration-migration.test.mjs docs/IS-ADMISSION-2-REHEARSAL.md
git diff --cached --check
git diff --cached
git commit -m "test(migrations): rehearse immutable history through 0012"
```

Second commit, exact admission manifest:

```bash
git add -- \
  docs/IS-ADMISSION-CONTRACT.md \
  docs/UNIFIED-ADMISSION-ADR.md \
  src/lib/identity/credential-registry.ts \
  src/lib/identity/eligibility-context.ts \
  src/lib/nexus-eligibility/service.ts \
  tests/protocol/identity-lifecycle.test.mjs \
  tests/protocol/nexus-consumer-runtime.mjs \
  db/proposals/is-admission-2.sql \
  docs/IS-ADMISSION-2.md \
  docs/openapi/is-admission-v1.openapi.json \
  src/app/api/is/v1/admission/authorize/route.ts \
  src/app/api/is/v1/admission/redemptions/route.ts \
  'src/app/api/is/v1/admission/transactions/[id]/route.ts' \
  'src/app/api/is/v1/admission/transactions/[id]/selection/route.ts' \
  src/lib/identity/admission/http.ts \
  src/lib/identity/admission/provider.ts \
  src/lib/identity/admission/runtime.ts \
  src/lib/identity/admission/service.ts \
  src/lib/identity/admission/validation.ts \
  src/lib/identity/admission/verification.ts \
  src/lib/identity/operation-error.ts \
  tests/identity-admission.test.mjs \
  tests/protocol/identity-admission.mjs
git diff --cached --check
git diff --cached
git commit -m "feat(IS-ADMISSION-2): implement mediated tenant admission"
git status --short
```

After reviewing the resulting commits and confirming the dedicated development branch's push/deployment triggers, the human operator may push it to remote `is`:

```bash
git push -u is wip/is-admission-2
```

This does not merge admission into `feature/nexus-consumer-runtime` or `master`. Do not push `master`, deploy or activate gates as part of this checkpoint. Deployment triggers for this new branch were not independently verified here; a WIP prefix alone does not suppress Preview deployment.
