# IS-DOMAIN#0001 — Trusted domain-bound tenant admission

2026-11-17. Local implementation, default off; no persistent migration, activation, production change or consumer cutover. [Versioned Sandcastle contract](SANDCASTLE-IS-DOMAIN-1.md), [implemented OpenAPI](openapi/is-domain-v1.openapi.json).

## Baseline and authority

Initial tree clean at `master` / `90e66de` (documentation/database connection helper checkpoint). IS-ADMISSION-2 is committed at `5d2d1c0013ae419961afe5e77c970a74385406f1`, referenced locally by `wip/is-admission-2` and reachable through GitHub commit inspection; its final reviewed 25-file manifest/recovery package remains preserved. The dedicated domain branch could not be created because Git index/ref writes are read-only in this environment. No Git stage/commit/push/merge occurred.

Reviewed the admission contract, implementation, ADR, migration plan, Identity/Nexus architecture and existing registry, plus Sandcastle's SC_TENANCY_0001_DOMAIN_BOUND_AUDIT.md. The handoff records its exact audit hash; no Sandcastle/IG/Axtor files were modified.

A fresh native read-only receipt at `2026-11-17T14:45:40.743Z` confirms Development `127.0.0.1:5432`, database/role `is_dev`, PostgreSQL 17.11, primary, all 11 application migration names/hashes through 0012 matching, no pending/mismatched/unexpected entries. Known local/cached remote refs contain no revision above 0012. Candidate new migration is 0013; reconcile live branch/ledger history again before approved application. Production was not inspected or inferred from Development. The earlier operator-reported production 0007 baseline does not establish a subsequent migration.

## Implemented architecture and interfaces

Nexus extends the existing canonical `nexus_tenant_domains` authority; no parallel hostname→tenant registry, tenant creation or membership enrollment. The existing globally unique hostname defines a single DNS routing namespace, including across application/environment/port configurations. Strict ASCII DNS labels (canonical lowercase A-labels for IDNs), no wildcard/IP/trailing-dot/localhost alias; exact canonical HTTPS origin includes an explicitly registered non-default port. The provider's exact redirect list remains authoritative for callbacks and credentials.

| Interface | Behavior |
| --- | --- |
| Existing operator domain registry | Preserved add/list/remove routes and primary-domain behavior; writes now recheck operator under lock and set transactional domain audit actor. Deletion retains a generation tombstone. |
| `GET /api/nexus/registry/tenants/domains/bindings?hostname=...` | Exact operator-only inspection, including deletion tombstone revision; proof digests omitted |
| `POST` same route | `prepare`, `verify-dns`, `activate-platform`, `suspend`, `client-mode`; exact Origin, verified session, bounded body, strict fields and DB operator recheck |
| `nexus-domains/service.ts` | Read-committed operator transactions, per-host advisory serialization, expected revision, ownership verification, explicit client opt-in and audit |
| `resolveDomain(tx, origin, app, environment)` | Trusted same-snapshot effective registry reconciliation, retained epoch and active proof required; binding row share-lock |
| Existing `/api/is/v1/admission/*` | Domain clients derive fixed target from exact registered callback origin; same native session/resource grant, PKCE, assertion, CSRF and DPoP protections; no other tenant listing/selection |
| `verifyAdmissionContext(...,{domain})` | Explicit `is-domain-admission+jwt` type/profile and exact hostname/origin/revision expectation; base profile remains separate and strict |
| `POST /api/nexus/v1/domain-access-decisions` | New strict receipt + original DPoP human credential + expected domain origin + operation contract; current Identity/domain/Nexus state and audit in one bounded snapshot |
| Internal Identity `readStored(tx,binding)` | Same-transaction revalidation of immutable persisted session/client/app/generation/global-eligibility lineage; never accepts HTTP actor IDs |

Existing general admission keeps `is-admission+jwt`, receipt claims and choice behavior. Domain clients explicitly opt in through Nexus linkage `admission_mode=domain`; the default is choice. General transactions also store original linkage ID/mode revision, preventing an in-flight choice transaction from bypassing later opt-in. Missing domain feature/schema never silently downgrades an opted-in client. Legacy decision API denies only the new opt-in cohort with `domain_admission_required`; all choice-client paths and four Consumer schemas/scopes/DPoP/Origin behavior remain unchanged. No client registration or provider redirect/key was changed.

## Ownership, activation and revision security

`prepare` creates/updates a canonical existing tenant/app registration to unverified, issues one random 256-bit TXT challenge (hash only in DB), and binds it to the transactionally checked revision with a 15-minute expiry. Custom-domain verification resolves `_is-nexus-challenge.<hostname>` outside the write transaction, accepts one exact matching TXT value, then rechecks operator, revision, challenge and expiry under the domain lock before activating and consuming the challenge. Duplicate matching records, unknown/expired proof or DNS outage never grant authority. A fresh prepare is required for remapping/reactivation. No HTTP fetch/SSRF verification or custom JWT/DPoP primitives are introduced.

`activate-platform` is a separate authorized assignment process: only Nexus operators and explicit subdomains of configured platform-controlled `NEXUS_PLATFORM_DOMAIN_ROOTS` qualify. There are no default roots. Registry verification is an explicit approval state, not continuous DNS ownership monitoring; ownership/delegation transfer requires operator suspension and fresh verification before reuse. Deployment operators must verify/document control and delegation policy for those roots before configuration; an arbitrary DNS name or an operator-supplied request body cannot add a trusted root. This is an authorized platform-subdomain route, not a claim to verify arbitrary root ownership automatically.

Suspension clears proof. Mapping changes clear verification; remapping an existing primary domain clears only its own primary flag to avoid conflicting with the destination tenant's primary domain. Primary-display changes alone do not change binding authority. Relevant domain mutations, deletion/recreation and reactivation monotonically advance a retained per-host generation. The database guards epoch tampering/deletion/truncation and appends immutable audit snapshots; actor/request/reason are recorded for service writes, legacy operational SQL is labeled as such when actor context is absent. Raw challenge values are not audited.

Transactions persist domain evidence in the existing immutable admission `binding` JSON, not a second mutable tenant preference. Confirmation accepts only the fixed tenant. Redemption rechecks live registration/mode/revision, domain proof and exact target under a share lock; it pins receipt type/domain evidence and atomically consumes code, persists receipt and audits. Receipt expiry <=300s and no later than transaction, session or associated grant. An earlier issuance holding the domain lock may finish before a waiting remap; after remap commits, fresh checks reject that receipt. A remap committed first denies issuance/serialization rather than signing a different tenant.

Online domain decisions require the exact original resource issuance, not any credential for a member of the same tenant. They validate digest/generation, signature/nonce/domain/type, original issuer/subject/session/client/app/environment/key, live global eligibility, registry proof/status/revision, Nexus tenant/member/app/entitlement epochs and operation. Binding remap/removal/suspension, old revisions, cross-domain replay and restored policy epochs cannot revive old evidence. Auth/audit/DB/policy outage fails closed. Decision validity remains <=5 seconds and is capped by receipt/transaction/resource/session deadlines. There is no positive cache; local resource/role authorization and final execution deadlines remain the consumer's responsibility.

Owner-only internal admission revocation remains audited and conservatively invalidates the associated resource token and potentially sibling admissions. No new public revoke/global-admin API, suspension system, Billing or service identity was implemented.

## Schema and migration compatibility

Candidate: `db/migrations/0013_nexus_domain_bindings.sql`, SHA-256 `c89c0d77462f568225e482b1c9540a41a5e0ce6efeb1b89e93a4d72044bd7aa7`. Historical 0001–0004/0006–0012 and the unnumbered admission proposal remain immutable/unchanged.

- Add proof/status/app/environment/origin/revision/challenge fields and restrictive references to `nexus_tenant_domains`. Legacy rows remain mapped to their original tenant, unverified, with no app/environment assigned.
- Add `nexus_domain_epochs` as retained generation tombstones, not an alternate registry. Existing hosts seed revision 1. Trigger-only monotonic writes; hostname/global uniqueness stays on the original registry.
- Add append-only `nexus_domain_binding_audit` with actor/request/reason and before/after snapshots, restrictive references and audit index. Reject edits, deletion and truncation.
- Add `admission_mode=choice` and monotonic mode revision to existing OAuth linkage. No provider table, secret, session, client ID, exact redirect or canonical tenant/user ID rewrite. Linkage ID plus mode revision fence mode replacement/toggling.
- Domain/epoch/audit/mode triggers are invoker rights, no SECURITY DEFINER. Runtime roles need explicit sidecar, audit sequence and row-lock privileges; inspection/rehearsal must validate actual grants. Table owners/superusers capable of disabling triggers remain a trusted operations boundary.

Migration requires catalog/table locks for ALTER/FKs/triggers, index creation, and a small domain epoch backfill whose actual size must be measured. Before application inspect all existing normalized hostname/primary uniqueness, provider link purposes, applied hashes and grants; do not resolve conflicts by deleting associations or rewriting tenant IDs. No persistent application is authorized here. Admission state still requires separately approved `db/proposals/is-admission-2.sql` activation/ledger integration; this domain migration does not silently install it, and no additional admission schema alteration is needed for the immutable JSON extension.

The historical migration rehearsal now explicitly selects its through-0012 prefix; all original assertions remain. The new domain protocol suite separately backs up a populated synthetic fixture, restores it into another disposable database, runs the exact application migration runner through 0013, verifies old projected rows and a no-op rerun, and exercises ordinary non-superuser invoker grants, epoch/audit protection, remapping and issuance races. This does not substitute for a separately approved restored copy of actual Development/production data.

## Validation evidence

Fresh native Debian validation under Node v24.22.0/npm 11.19.1 with explicit PostgreSQL 17 binaries and synthetic disposable clusters passed. The operator executed the prepared native runners and reported zero final exit statuses; the receipts were independently inspected from the workspace. The full second run passed all suites; a final targeted run covered route generation/types/protocol/build after moving Nexus policy/audit persistence into its owning module and adding explicit domain-decision audit-outage recovery assertions. Unchanged suites were not needlessly repeated.

| Check | Result |
| --- | --- |
| Route generation | PASS, final snapshot |
| Typecheck | PASS, final snapshot |
| Standard tests | PASS, 98/98 |
| Membership PostgreSQL/concurrency | PASS, 26/26 |
| Pinned OAuth/DPoP | PASS, 31/31 |
| Identity/Consumer/admission/domain protocol | PASS, 96/96 (12 new domain scenarios) |
| Historical 0011–0012 runner/restore | PASS, 5/5 |
| Domain 0013 populated restore/runner, ordinary invoker grants and concurrency | PASS, included in protocol |
| Isolated production webpack build | PASS, final snapshot |
| New OpenAPI 3.1 and external references | PASS, 6 path items |
| Final scope/secret/hash review | PASS; historical SQL, auth configuration, original specs and consumer repositories preserved |

Durable private receipts: `.local-recovery/is-domain-0001/validation-2/receipts/` contains the full passing run (`status.tsv`, versions, unit, memberships, compatibility, protocol, historical migration rehearsal and build logs). `validation-3/receipts/` contains the final typegen/typecheck/protocol/build receipts; `validation-3/source-sha256.json` binds the final runtime/test/schema source. Documentation is finalized separately. Earlier `validation-1` receipts retain the actual initial failures rather than being reported as passing.

The first protocol run had two failures because the new decision fixture used the Identity origin while its resource credential deliberately targeted a separate Nexus origin. Composition now uses the resource origin, and maintained credential error classes retain their sanitized status. Stronger tests independently prove a fresh allow before each revocation and observe a real independent PostgreSQL writer lock wait, rather than asserting concurrency from timing alone. The final source also keeps Nexus decision evaluation/audit in `nexus-domains/decision.ts`; Identity owns receipt/credential checks and transaction mediation.

Coverage includes: populated synthetic backup/restore with exact runner and preserved old projected records; default-denied legacy domains; operator and ordinary-role guards; correct/incorrect DNS challenge and configured platform namespace; duplicate-host conflict and simultaneous same-revision remaps; multi-tenant person restricted to one target; wrong tenant hint/selection/app/environment, unregistered/unverified/suspended domain; explicit domain/legacy profile separation; cross-domain replay; client-mode downgrade denial; A→B→A non-revival; remap before redemption and redemption-before-remap lock ordering; membership/entitlement/tenant/client/token invalidation, expired receipts and Identity/Nexus outage; mapping/epoch and decision-audit rollback; remove/recreate tombstones; original OIDC, four legacy APIs and unchanged provider clients/keys. Host/forwarded-header, Origin/CSRF, strict field and default-off negatives remain covered by standard and preserved protocol suites.

Native validation used source-only snapshots, no Development env files or inherited database target. Build settings used unreachable synthetic DB and disabled feature gates; expected provider schema-connectivity warnings are not live-DB verification. No native browser, real DNS publication, Google login, live Sandcastle domain, provider provisioning or production acceptance is claimed. The restored data is synthetic, not a copy of production.

## Activation, rollout and recovery

The fresh Development receipt had Identity/membership/Consumer gates true, admission gate/allowlist unset and admission schema absent. Final allowlisted file/process inspection also found the two new domain gates and platform-root list unset. This task changed no environment. New gates `NEXUS_DOMAIN_BINDINGS_ENABLED` (management) and `IS_DOMAIN_ADMISSION_ENABLED` (issuance/decisions) default off; root list defaults empty. Domain decision HTTP additionally requires existing admission and Consumer gates; live Identity/membership dependencies must be ready. Literal true is required. Runtime flags of an already running server are not inferred from files.

Before Development activation: approve exact target/ledger and candidate migration; create current backup and verify restore on a different copy; inspect uniqueness/grants/trigger compatibility and old code; separately approve persistent admission state; provision no client automatically; register exact callback/current-domain Origin only through supported provider APIs with read-back and separate permission; establish DNS ownership or trusted platform root evidence; prepare/verify mapping; explicitly opt in client mode and client allowlist/gates for the approved cohort. Keep general clients and unrelated processes disabled/unmodified. Verify one fixed tenant, two-domain isolation and live proxy/session behavior with the consumer owner before cutover.

Production repeats actual target/deployed-SHA/ledger/checksum, direct verified-TLS, backup/PITR/access and isolated restored-data rehearsal review. It does not inherit readiness from is_dev. Apply only with separate explicit approval naming ordered migrations, hashes, grants and bounds; deployment/config/registration/activation approvals are independent. Never copy Development users, tenants, root config, OAuth registrations or secrets. This task does not apply any migration.

Rollback disables/freezes the new cohort and restores compatible application code while retaining registry associations, new fields, audit, generation tombstones and admission state. Opted-in clients remain deny-only if the domain gate is disabled; they cannot fall back to legacy tenant switching. Do not reset domain/mode epochs, clear revocation, erase history, remove FKs or drop membership data. An authorized mode change to choice invalidates old transactions via revision, and any consumer rollback requires fresh explicitly approved legacy state—never reinterpret existing domain receipts. Schema/invariant defects require a reviewed forward repair; whole-database restore requires incident authorization, RPO assessment and reconciliation of newer writes. No automatic down migration or master push.

## Human Git checkpoint

24 reviewed changed files:

| Status | File |
| --- | --- |
| New | `db/migrations/0013_nexus_domain_bindings.sql` |
| Modified | `docs/ARCHITECTURE.md` |
| Modified | `docs/IS-ADMISSION-2.md` |
| New | `docs/IS-DOMAIN-0001.md` |
| New | `docs/SANDCASTLE-IS-DOMAIN-1.md` |
| New | `docs/openapi/is-domain-v1.openapi.json` |
| New | `src/app/api/nexus/registry/tenants/domains/bindings/route.ts` |
| Modified | `src/app/api/nexus/registry/tenants/domains/route.ts` |
| New | `src/app/api/nexus/v1/domain-access-decisions/route.ts` |
| Modified | `src/lib/identity/admission/http.ts` |
| Modified | `src/lib/identity/admission/runtime.ts` |
| Modified | `src/lib/identity/admission/service.ts` |
| Modified | `src/lib/identity/admission/verification.ts` |
| Modified | `src/lib/identity/eligibility-context.ts` |
| Modified | `src/lib/nexus-consumer/service.ts` |
| New | `src/lib/nexus-domains/decision-http.ts` |
| New | `src/lib/nexus-domains/decision.ts` |
| New | `src/lib/nexus-domains/management-http.ts` |
| New | `src/lib/nexus-domains/policy.ts` |
| New | `src/lib/nexus-domains/service.ts` |
| Modified | `tests/integration/identity-administration-migration.test.mjs` |
| New | `tests/nexus-domain-policy.test.mjs` |
| New | `tests/protocol/domain-admission.mjs` |
| Modified | `tests/protocol/identity-admission.mjs` |

No obsolete files; no `git rm` is needed. The code is ready for the human checkpoint, not enabled in an existing database. No commit SHA is invented before the operator commits.

This environment could not create a branch (`.git/index.lock` read-only). The operator should create the dedicated branch from the verified task baseline, carrying these working-tree changes without force/reset. Review staged content and deployment triggers before pushing. Existing admission commits/recovery remain preserved in the parent history and dedicated WIP ref.

```bash
cd /home/user/src/is
set -euo pipefail
git status --short
git diff --check
git diff --cached --exit-code
test "$(git rev-parse HEAD)" = 90e66de7c50e0160190f47b0eb5709edcde09ffd
git switch -c feature/is-domain-0001 90e66de7c50e0160190f47b0eb5709edcde09ffd
git add -- \
  db/migrations/0013_nexus_domain_bindings.sql \
  docs/ARCHITECTURE.md \
  docs/IS-ADMISSION-2.md \
  docs/IS-DOMAIN-0001.md \
  docs/SANDCASTLE-IS-DOMAIN-1.md \
  docs/openapi/is-domain-v1.openapi.json \
  src/app/api/nexus/registry/tenants/domains/bindings/route.ts \
  src/app/api/nexus/registry/tenants/domains/route.ts \
  src/app/api/nexus/v1/domain-access-decisions/route.ts \
  src/lib/identity/admission/http.ts \
  src/lib/identity/admission/runtime.ts \
  src/lib/identity/admission/service.ts \
  src/lib/identity/admission/verification.ts \
  src/lib/identity/eligibility-context.ts \
  src/lib/nexus-consumer/service.ts \
  src/lib/nexus-domains/decision-http.ts \
  src/lib/nexus-domains/decision.ts \
  src/lib/nexus-domains/management-http.ts \
  src/lib/nexus-domains/policy.ts \
  src/lib/nexus-domains/service.ts \
  tests/integration/identity-administration-migration.test.mjs \
  tests/nexus-domain-policy.test.mjs \
  tests/protocol/domain-admission.mjs \
  tests/protocol/identity-admission.mjs
git diff --cached --check
git diff --cached
git commit -m "feat(IS-DOMAIN#0001): implement domain-bound tenant admission"
# Human only, after branch/deployment-trigger review:
git push is feature/is-domain-0001
```

Do not stage private validation snapshots, recovery archives, env files, TLS keys, generated artifacts or database dumps. Do not push master, merge, deploy, apply persistent migrations, activate gates or alter consumers automatically. Real DNS/ingress/browser/consumer acceptance and restored actual-target rehearsal remain activation gates, independent of the passing synthetic evidence.
