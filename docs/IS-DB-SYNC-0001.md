# IS-DB-SYNC#0001 — Migration synchronization

2026-11-17. Status: Development ledger current through 0012; production access blocked. No persistent database mutation, backup creation, schema migration, bootstrap, feature activation, Git stage/commit/push/merge or deployment has been performed by this task. IS-DOMAIN#0001 is not ready until the outstanding target and schema checks close.

## Source and recoverability

At entry the working tree was clean. Current branch is local `master`, at `5d2d1c0013ae419961afe5e77c970a74385406f1`, also referenced by `wip/is-admission-2`. Its two reviewed commits already exist: `883925d` rehearsal repair and `5d2d1c0` admission issuance. All 25 files match the previous final manifest. Do not recreate those commits or push this local master as the earlier production candidate.

The earlier completed release candidate remains `feature/nexus-consumer-runtime` at `354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b`. All 11 application migrations at this checkout are verified byte-for-byte against that candidate. Admission's unnumbered SQL remains under `db/proposals/`, outside the migration runner. Missing 0005 is intentional.

Live GitHub inspection reports remote master at `556ba880cfa3a6a0cef445cd88d8b986e7418792` and no remote `wip/is-admission-2` ref (422). Local admission work is recoverable in committed Git and its ignored `.local-recovery/is-admission-2-20261117/` archive. Archive package checksums passed. Off-host Git checkpoint is pending the human-controlled dedicated-branch push and deployment-trigger review; do not push master. No branch/ref changes were made here.

## Authoritative targets and access

Production's user-confirmed Vercel identity: team `sandcastle2`, resolved team ID `team_SUnAmlBNxPYqRJJsA7EtHcSG`, project `is`, project ID `prj_c7PznTxVOklfr8dI6FBHZSQXHhl2`. Read-only get_project using the exact project/team returns 403. The prescribed authorize_team_access call returns 404 Team not found, so no consent link could be generated. Read-only CLI fallback in this sandbox also failed; a native operator can try the explicitly scoped metadata helper below. It does not fetch decrypted environment values.

The previously supplied database hint is `ep-patient-haze-b8165t4i-pooler.c-14.us-east-1.aws.neon.tech`, database `neondb`. Neon search for its endpoint returned no results in the connected account. This hint has not been bound to the project's configured production connection. Neon project/branch/name, connection role, PostgreSQL version, production deployment SHA, flags, grants and ledger are UNKNOWN. No production SQL connection was attempted and no default Neon project/branch selected. A pooled host is not an approved migration target.

Development was verified by the native operator at 2026-11-17T10:54:10.145Z and its private receipt was independently read: database/login/current role `is_dev`, server `127.0.0.1:5432`, PostgreSQL 17.11 (Debian 17.11-0+deb13u1), primary, transaction_read_only=on. It was selected explicitly from `.env.development.local` only; the helper rejects inherited DATABASE_URL and other targets/parameter overrides. The prior sandbox EPERM was an environment restriction, resolved for this read-only check by native execution.

## Migration classification

The actual Development ledger contains all 11 names below with matching SHA-256, in the expected sequence: pending=0, mismatches=0, unexpected=0, out-of-order=false. No Development migration was applied or needed. Production status is still unknown for every file. Schema drift requires catalog/data checks as well as a matching ledger.

| Migration | Committed SHA-256 | Development | Production |
| --- | --- | --- | --- |
| `0001_admission_management.sql` | `f6eefde9f5f08136a2ffb7752e5b11ecd5c03fafc9a06dbedac9ee206fd56453` | Applied, matching | Not accessible |
| `0002_nexus_operators.sql` | `00c8d42b88cd1641efcf48ef8d3bf7f5f0e0ce6f3a175c1c13645373376f1305` | Applied, matching | Not accessible |
| `0003_nexus_registry.sql` | `192dac38a0fd4c3704acaab4b8a818b9824f8065578e9511c0c66d8227324afb` | Applied, matching | Not accessible |
| `0004_oauth_and_tenant_domains.sql` | `3d468eedea006f828def74610840c72556f5918f3591eb62f0185187cb06d80b` | Applied, matching | Not accessible |
| `0006_dev_http_redirects.sql` | `9bd877b4bbf3d651a5c1034541242614badb864fca6aeecaaeab1d1d1e3bd42a` | Applied, matching | Not accessible |
| `0007_nexus_tenant_memberships.sql` | `e7640b790bca10f0e729952841e8f233b6aaa427b1d42f054925dc216465fcac` | Applied, matching | Not accessible |
| `0008_identity_credentials.sql` | `5b84f270c7ab9d6a3658abd40f268600899bb969a671efcfdf42270afb8ea773` | Applied, matching | Not accessible |
| `0009_nexus_consumer_runtime.sql` | `ad62e6f2500a17e0061b788604f9b201810277d2d55ddafa09eefc364dc131c8` | Applied, matching | Not accessible |
| `0010_identity_consumer_code_barrier.sql` | `f4295cf7903ae2d5cb6bb67dd6884ed5e23cd0461c7df46d094f6e31fb2a94e2` | Applied, matching | Not accessible |
| `0011_identity_credential_administration.sql` | `7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264` | Applied, matching | Not accessible |
| `0012_oauth_client_purposes.sql` | `fdcef5d3d4235e221da8f36e4175ef4633e6294080b488ce4e5909aac03b6169` | Applied, matching | Not accessible |

`db/proposals/is-admission-2.sql` is proposed, unnumbered, outside the approved application migration sequence. It must not be seeded, numbered or applied automatically. No historical migration or ledger checksum was edited.

## Inventory helpers

`scripts/db-sync-inventory.mjs --local` is read-only and Node-24-only. Before connecting it verifies the exact 0001–0012 sequence against the release candidate. It uses explicit loopback connection options and default_transaction_read_only, bounded REPEATABLE READ READ ONLY, statement/lock/idle timeouts and an explicit rollback. It reads identity of server/database/current role, complete migration ledger, public column/constraint/trigger metadata, current-role grants, table counts and aggregate last-admin counter consistency. It never selects identity/provider/session/OAuth secrets or uses migration/bootstrap scripts.

The native Development receipt reports 46 public tables, all required source-owned tables/triggers present and enabled, purpose column present, zero unvalidated constraints and zero tenant-governance counter violations. The current role has no superuser/createdb/createrole/bypassrls flags. Aggregate inventory includes 3 identities, 5 sessions, 2 OAuth clients, 2 tenants, 5 memberships and 2 entitlements; no individual records or credentials were printed. Admission tables are absent. Existing Development Identity/membership/Consumer flags are true; admission gate/allowlist are unset. No flag changed. Full schema equivalence and authenticated live behavior remain unproven.

The helper classifies all files against the complete ledger before any prospective mutation; reports unknown ledger entries, non-prefix order and checksum mismatches; checks missing source-owned tables/triggers, invalid constraints and purpose-column presence. These minimum checks are not a proof of complete schema equivalence, production grants or live OAuth compatibility. Its private JSON receipt is written mode 0600 under `.local-recovery/is-db-sync-0001/`, excluded by its own ignore file. Output contains metadata and counts only, no credentials or row-level identities.

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
node scripts/db-sync-inventory.mjs --local
```

`scripts/db-sync-vercel-inventory.mjs` uses installed Vercel CLI 64.5.0 with explicit team and project. Only GET project metadata and GET env metadata with decrypt=false are issued. It verifies project/team IDs, filters output, records production deployment/branch metadata when supplied by Vercel, and omits environment values. It cannot establish the configured connection, flag values, Neon branch or backup state; those remain separate authorized read-only inspection requirements.

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
node scripts/db-sync-vercel-inventory.mjs
```

## Backup, rehearsal and preservation evidence

Development backup artifacts exist privately under `/home/user/backups/is_dev/`; backup contents were not printed. The 2026-11-11 pre-0011 manifest records restoreVerified=true. The 2026-11-12 pre-0012 manifest records restoreVerified=true and rehearsalVerified=true. Manifests are mode 0600. These are historical records, not fresh recovery proof or authorization to modify today's database. Production backup/PITR retention/access and restore evidence are unknown.

The admission milestone's native Node 24 receipts were preserved and re-read: route generation/typecheck/build pass; standard suite 94/94, membership/PostgreSQL concurrency 26/26, OAuth/DPoP 31/31, Identity/admin/Consumer/internal/admission protocol 84/84, migration runner/backup/restore 5/5. The tested runtime, migration and rehearsal-test source matches the reviewed admission commits; the local helper additionally completed a native real-target read-only inventory; the Vercel helper has syntax checks and a blocked sandbox attempt so far. These synthetic suites prove their isolated fixtures, not preservation of current persistent records or compatibility with unknown production deployment code.

No actual-target before/after data-preservation claim is made: no database write occurred. Before a pending migration, use a coherent private snapshot/backup and verify restore on an isolated copy, compare stable identity/session/client/tenant/membership/entitlement IDs and private row digests, validate constraints/invariants and verify provider credential/redirect/session fields remain unchanged without printing them. Rehearse old deployed application against the expanded schema. Do not run concurrency mutations against production.

## Guarded synchronization procedure

1. Complete the dedicated admission remote checkpoint. Preserve earlier candidate and keep proposed admission schema separate. Verify deployment triggers before any push.
2. Establish exact targets from configuration plus Neon API mapping; use authorized read-only role first. Inspect runtime and migration role grants separately; do not assume owner privileges are least privilege. Confirm server/database/user, ledger and full catalogs. Missing ledger is not evidence of empty schema.
3. Compare ALL source names/checksums to the full target ledger before any write. Stop on mismatches, unknown entries, non-prefix order, missing applied files or catalog/data drift. Never insert guessed ledger rows or add 0005. No runnable production write set can be approved while this step is incomplete.
4. For each target with pending files, obtain a current recoverable backup/branch, verify recovery access, authorize and identify a separate rehearsal target, restore/rehearse the exact ordered pending set and all existing record/role invariants. Record hashes, locks/timing and old-app compatibility. No backups or branches are created by these read-only helpers.
5. Development pending files are authorized in scope only after target/backup/rehearsal checks succeed. If already matching with no drift, apply nothing. Production always requires a separate explicit approval naming exact project, branch, direct endpoint, database, role, pending filenames/hashes, backup/restore evidence and compatible deployment SHA.
6. Only then use the established `npm run db:app:migrate` from pinned reviewed source with explicitly injected approved target credentials. For Neon use a direct API-verified endpoint and verify-full TLS. Do not use an unverified inherited default URL or existing Development helper pinned to old fixture state. Do not invoke Better Auth migration/bootstrap scripts as audit checks.
7. The runner advisory-locks 83792421 and commits each migration plus its ledger entry separately. Preflight the entire ledger independently first: the runner may commit earlier pending files before discovering later ledger inconsistencies. Bound lock/statement timeout per rehearsed values. Stop after any unexpected failure; re-inventory which files committed before deciding a retry/forward repair.
8. Verify ledger/schema/grants, original records and current deployed app against expanded schema, then run isolated regressions. Do not activate Consumer or admission gates or seed Development registrations. No deployment is part of database synchronization.

Rollback retains applied additive schema, audit, tombstones and ledger; restore compatible previous application only through separately authorized release operations. A failed migration transaction rolls back that file, not earlier committed files. Preserve evidence, freeze dependent writes and use reviewed forward repair for drift/defects. Do not drop tables, erase audit/ledger, reset generations or restore a whole backup over new unrelated writes automatically. Any selective recovery or restore needs explicit approval and reconciliation.

0012 replaces an existing uniqueness constraint and classifies OAuth link purposes, so it is not purely additive. Review ambiguity checks, existing constraint name, ACCESS EXCLUSIVE lock duration, uniqueness index rebuild, old app assumptions and runtime grants. 0009 installs invoker triggers on existing Nexus writes: verify runtime INSERT/UPDATE permissions on epoch/revision tables even when Consumer HTTP is disabled. 0007 protects final tenant admins with serialized counter and deferred consistency; verify last-operator and audit protections separately. Better Auth schema remains a separate compatibility audit, not an application migration side effect.

## Current readiness and stop conditions

Development inventory: verified, all approved application migrations through 0012 already applied and matching, zero pending. Synchronization required no write. Minimum structural/invariant checks passed; full schema-equivalence/live behavior remains separate. Production inventory/synchronization: blocked by access, exact pending set unknown. No migration applied by this task. Production write set has NOT been presented as ready for approval, because target ledger, backups and application compatibility cannot yet be confirmed. IS-DOMAIN#0001 is NOT ready.

Stop before any mutation on unknown target, missing remote checkpoint, ledger/checksum/catalog drift, inaccessible backup/recovery, failed rehearsal/compatibility, unverified least-privilege/TLS connection, unavailable production deployment information or missing explicit production approval. Do not infer readiness from Development migration reports.

## New-file checkpoint

Reviewed task manifest (new files only):

- `scripts/db-sync-inventory.mjs`
- `scripts/db-sync-vercel-inventory.mjs`
- `docs/IS-DB-SYNC-0001.md`

No obsolete file and no git rm. Keep all private receipts/recovery archives/dumps/env files unstaged. Admission commits already exist; do not recreate them. After clearing push triggers, human-controlled off-host preservation:

```bash
git rev-parse wip/is-admission-2
# Must equal 5d2d1c0013ae419961afe5e77c970a74385406f1
git push -u is wip/is-admission-2
```

To keep this independent tooling/report off the admission source line, prepare a separate branch from the earlier candidate, only after the admission checkpoint is recoverable and reviewed. New files are untracked and carry across this switch; stop if unrelated tracked changes appear. No existing branch is reset.

```bash
cd /home/user/src/is
set -euo pipefail
git diff --exit-code
git diff --cached --exit-code
git switch -c chore/is-db-sync-0001 354bdd8060967bd5c717b2b3a6fbf4ffe3bb3c5b
git add -- scripts/db-sync-inventory.mjs scripts/db-sync-vercel-inventory.mjs docs/IS-DB-SYNC-0001.md
git diff --cached --check
git diff --cached
git commit -m "chore(IS-DB-SYNC#0001): reconcile IS database migrations"
# After branch-trigger review, human only:
git push -u is chore/is-db-sync-0001
```

No master push, merge, deployment or admission activation is authorized by these commands. Do not describe this blocked report commit as a completed production synchronization.
