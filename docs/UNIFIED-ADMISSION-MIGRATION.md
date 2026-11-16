# Unified admission compatibility, delivery and rollback

2026-11-16. Design only. [ADR](UNIFIED-ADMISSION-ADR.md), [baseline and release blockers](UNIFIED-ADMISSION-BASELINE.md), [admission protocol](IS-ADMISSION-CONTRACT.md). Existing endpoints and live OpenAPI remain unchanged.

## Current-to-target compatibility matrix

| Current capability | Observed caller | Target boundary | Transition / required work |
| --- | --- | --- | --- |
| `GET /api/nexus/v1/me/tenants` | Sandcastle Nexus BFF | Nexus internal effective-context list, consumed by IS UI | Retain public v1; new apps obtain IS-mediated selection; migrate Sandcastle discovery UI only after admission release |
| `GET /api/nexus/v1/tenants/{tenantId}/membership` | Sandcastle context checks | Internal self-membership policy input | Retain public v1; app must not turn membership role into local resource role |
| `GET /api/nexus/v1/tenants/{tenantId}/applications/{applicationId}/entitlements` | Sandcastle context checks | Internal eligibility input | Retain public v1; do not expose independent cross-app/billing catalogue |
| `POST /api/nexus/v1/access-decisions` | Sandcastle protected operations | **Remain external** for current continued eligibility | Preserve v1 schema/DPoP/scope/Origin/deadline; admission-aware credential linkage requires negotiated profile and reviewed provider support |
| Tenant/domain resolution draft | No implemented fifth consumer route found | Internal IS/Nexus governed-domain capability | Do not publish independent consumer lookup; domains remain hints, verified ownership is separate |
| OIDC login + local app session | Sandcastle, existing IG login integration per handoffs | Retain Identity authentication and app-owned sessions | No implicit tenant access; preserve client IDs, callback, local IDs, data and identity links |
| Tenant/application selection | Sandcastle session-bound ephemeral grant | IS selection + app session-bound admission context | Explicit confirmation, local context version and correct-user binding; no app-global active tenant |
| Nexus management routes | Operators/tenant admins | Retain protected management surfaces | Never credential-adapt privileged routes into public consumer APIs |
| IG/Axtor service/delegation drafts | No live service integration established | Separate service milestone | Sandcastle→IG direct; audience/delegation/resource enforcement independently reviewed |

Known four-route usage is Sandcastle Development. Source searches do not prove absence of other clients. Before deprecation obtain environment/client registry inventory and sanitized per-route usage by client, confirm owners including IG, noninteractive scripts and external deployments. No sunset date or endpoint removal is authorized here.

## Required consumer changes (separate repositories, separate approval)

Sandcastle: preserve current separate OIDC and DPoP human grants and copied OpenAPI until acceptance complete. Add state/nonce/PKCE admission transaction and secure BFF redemption, explicit IS tenant selection, signed context validation, verified subject/client/environment/key matching, session context version and renewed admission. Retain live access decisions, deadline/queue checks and local Story/Canon/Scene permissions. Ephemeral Development storage is not a production durable session/replay solution. Do not retroactively assign old Stories by email, selected tenant or domain; reconcile resource ownership explicitly with proof and rollback evidence.

IG: preserve local user/tenant UUIDs, records and FKs; verify existing stable provider/IS subject links or require explicit account proof. Add admission-aware login/session binding and target-app validation only after its owner approves the contract. Keep IG local roles/App Admin and resource/tenant checks authoritative. Inventory legacy auth/session paths; no valid OIDC-only path may become tenant-authorized implicitly. Implement App Admin guard and departure participant in IG separately. Direct Sandcastle→IG workload/delegation is not part of this change.

Axtor: no admission or service code now. Future runtime AI action authorization remains its independent responsibility and acceptance boundary.

## Versioning and rollout

1. Finish IS#0001/M11 identity-correct live acceptance first; capture durable sanitized receipts and exact code/config/spec hashes. No new fixture writes authorized by this design task.
2. Review ADR, proposed OpenAPI and security/departure contracts; pin authentication/subject profile and provider capability. Proposed `/api/is/v1/admission/*` is additive, version `0.1.0-proposed.1`, never advertised as deployed. Keep old Consumer OpenAPI bytes unchanged; its older draft descriptions are historical, reconciled by baseline and Stage 2D runtime report.
3. Implement an internal eligibility facade with no public transport change, then gate the new admission flow default off. No startup provisioning. Internal Nexus interface returns effective contexts to verified IS mediation, derives subject/caller from trusted inputs and reuses the existing consistent decision engine. Management APIs remain independent.
4. Separately review any additive persistence/Identity credential profile: one-use code ledger, admission generations, audit, shared replay and session binding. Reconcile actual database ledger/checksums across branches before reserving a migration (historical reports reach 0012; no next number assigned here). Direct verified-TLS target, isolated rehearsal, previous-code compatibility and backup/restore required. No SQL or migrations in this task.
5. Implement IS browser selection, redeem protocol and admission-aware credential linkage with pinned maintained provider primitives. A legacy resource token may run only in explicitly identified legacy cohort. New admission-aware cohort must reject missing/unknown profile and must not downgrade after revocation or failure. Do not alter strict existing decision body. Breaking fields/auth semantics require a new negotiated version/profile and independent compatibility review.
6. Consumer owners implement and test app-session/context binding and App Admin/departure interfaces. Enroll a separately approved Development cohort; shadow results cannot grant access or bypass current decision/local checks. Preserve independent clients/scopes. Any future scope reduction uses reviewed issuance and opt-in versioning; never silently invalidate Sandcastle's four pinned scopes.
7. Sign off zero/one/multiple tenants, concurrent changes and end-to-end enforcement. Expand only after immutable deployable checkpoint, environment-specific registration/read-back, operations recovery and consumer rollback are approved.
8. Mark discovery/membership/entitlement *legacy external* only after every registered consumer owner acknowledges replacement. Keep dual transport until measured usage is zero through a published transition window, consumer acceptance and separately approved retirement. No removal/rename/disable in this milestone.

## Security regression requirements

| Area | Required proof before release |
| --- | --- |
| Existing foundation | Keep all acceptance checks: canonical HTTPS/host/proxy rejection, strict Origin/CSRF, no cookies/Bearer/ID-token fallback, issuance/class/subject/client binding, nonce/replay, no public registration/password login |
| Selection | Zero/one/multiple, explicit confirmation, suspended/inactive/uninitialized tenant, changed membership/entitlement/app/global eligibility between list/select/redeem, invalid UUID, cross-subject/client/app/environment/tenant, stale UI/tab version |
| Code/context | Atomic parallel code redemption, expiry/PKCE/state/nonce/callback errors, wrong issuer/aud/type/key, forged claims, key rotation/revocation, no email linking, no cross-session reuse, crash after consumption, generation invalidation and re-enable non-resurrection |
| Continued decisions | Real provider + isolated PostgreSQL + native HTTP; new snapshot after revocation denies, bounded <=5s racing decision, delayed delivery/queue dispatch rejects, admission-aware versus legacy profile confusion rejected, audit/dependency/replay-store outage fails closed |
| Governance | Independent PG connections concurrently demote/deactivate/remove Global Admin, tenant admin and app admin; activation racing removal; globally ineligible admin cannot satisfy invariant; audit rollback and restrictive deletion; preserve final Nexus operator |
| Departure | Concurrent resource/admin changes, stale reservation, unavailable participant, commit/abort race, timeout/duplicate delivery, coordinator crash, partial commit deny-only and reconciliation; no resource orphan/cascade deletion; emergency suspension retains recovery assignments |
| Compatibility | Existing four-route contract hash and response/error shapes, all four scopes, separate login/resource clients, legacy sessions and local IDs/FKs preserved, app context switching and job ownership, previous code on additive schema, approved cohort rollback |

Helper tests and source scans do not prove protocol or security acceptance. Consumer end-to-end execution must be demonstrated by its owner; isolated stubs do not establish live cross-app acceptance. Test synthetic disposable databases only, never default DATABASE_URL or existing deployments.

## Safe rollback

Before opt-in, disable only the new admission gate and restore the compatible prior app build; preserve four routes, old clients, existing sessions, records, new audits/ledger/tombstones. No destructive down migration or historical SQL editing.

After opt-in, freeze new admissions and stop/recheck affected jobs. Existing new-profile sessions cannot fall back to OIDC-only or stale local tenant policy. Restore a compatible admission implementation, or require fresh admission under an explicitly approved legacy cohort whose live revocation checks still hold. Invalidate affected admission/code generations via supported audited interfaces; retain local login where safe. Do not broaden scopes, revive tokens, rewrite canonical IDs or undo valid security revocations. Unsupported cohort stays denied. Resource transfers/departure partial commits require status reconciliation, not blind rollback. Service integration remains separate. Production rollback/deployment/credential changes need explicit authorization.

## Prioritized independently reviewable increments

| Priority / task | Dependencies | Deliverable / acceptance |
| --- | --- | --- |
| P0 Close baseline live acceptance | Correct test users and separately authorized fixture operations | Test 1, Test 2, four-route policy/revocation/deadline receipts, restoration and consumer sign-off |
| P0 Approve admission protocol/profile | ADR/OpenAPI review, pinned-provider capability spike | Exact code redemption auth, subject mapping, issuance/admission revocation linkage, threat review; design approval only |
| P1 Internal eligibility facade — recommended first implementation | Baseline established; explicit implementation approval | Nexus module method for IS verified subject/client, reusing effective policy; no endpoint/UI/schema/config change; existing regressions plus isolated authorization/snapshot parity |
| P1 Global Admin governance | Separate invariant design approval | Identity-owned DB concurrency protection and audited eligibility/departure hooks, isolated SQL evidence |
| P1 App Admin participant contract | Consumer owner inventory | App-owned guard, activation acknowledgement and preflight/fencing conformance; independently implement in each app |
| P1 Admission state/credential composition | Approved protocol + ledger/provider rehearsal | Additive state, atomic redemption/audit, online revocation linkage; migrations only with later explicit approval |
| P2 IS selection and callback UI/transport | Admission state + credentials | Zero/one/multiple flows and strict CSRF/redirect/session binding; native browser/protocol tests |
| P2 Sandcastle admission adapter | Released gated IS contract + M11 pass | Preserve existing enforcement; context-bound app session, queues/deadlines and rollback verified by Sandcastle owner |
| P2 IG adapter and verified identity/resource reconciliation | IG owner approval + local mapping audit | No PK/FK rewrite, app roles and resource ownership proof, same security suite |
| P2 Departure coordinator | Global/tenant/app guards and participant fencing | Durable prepare/commit/status reconciliation, deny-only partial completion and recovery tests |
| P3 External API retirement review | Complete usage inventory + all consumers migrated | Published opt-in transition/deprecation window; separate removal authorization |
| Separate Service milestone | IG audience/operations, workload vs delegated approval | Sandcastle→IG direct identity/delegation; no dependency on admission rollout for implementation in this task |

Implementation is **not** authorized by this document. Stop after design/dependency audit; first increment recommended above does not mint credentials or alter the live integration.

## Fresh validation

Host Node v24.22.0 / npm 11.19.1 validation:

| Check | Result |
| --- | --- |
| Next route generation | PASS in isolated source copy |
| Typecheck | PASS in isolated source copy |
| Standard regression suite | PASS, 84/84 on host; sandbox reported file-only results and is not the detailed receipt |
| Production build (`npm run build -- --webpack`) | PASS on host in isolated source copy, synthetic credentials and unreachable synthetic DB; no Development env files copied |
| Proposed OpenAPI 3.1 / external references | PASS, 5 path items, pinned Swagger Parser 12.1.0 installed under `/tmp`; references unchanged live decision specification |
| Diff whitespace / scope | PASS; Markdown and one new JSON proposal only; existing Consumer OpenAPI unchanged |

Receipts: `/tmp/is-admission-typegen.log`, `/tmp/is-admission-typecheck.log`, `/tmp/is-admission-tests-host.log`, `/tmp/is-admission-build-host.log`. Temporary source `/tmp/is-admission-validation-c7z0mvd5` preserves the live `.next` and `next-env.d.ts`. Sandbox build failed to capture TypeScript `--showConfig`; successful host build supersedes it. Initial registry download failed sandbox DNS; host retry succeeded. Repository dependencies/lockfile unchanged.

No new runtime behavior exists to security-test here. Historical synthetic PostgreSQL acceptance remains dated baseline evidence; PostgreSQL/protocol suites and authenticated live acceptance were not rerun. No migration/bootstrap, persistent database change, credential change, runtime/config change, consumer edit, production action, deploy, merge, push or commit occurred.
