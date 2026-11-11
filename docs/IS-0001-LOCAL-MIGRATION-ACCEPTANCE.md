# IS#0001 — local migration and schema acceptance

2026-11-10. **Local migrations 0008–0010 APPLIED after separate approval of the corrected command. Post-migration database and HTTP checks PASS.** The earlier failed startup and pending sections below are historical; see final execution evidence at the end. Consumer gates remain off. No OAuth provisioning, Better Auth migration, production/Neon access or consumer repository change occurred.

## Verified source and target

Branch `feature/nexus-consumer-runtime`, HEAD `fc349b2611da5cba20353d21cbc1b76b4b9e80df`. Existing changes in AGENTS.md, acceptance/development/handoff documentation and untracked HTTPS-readiness documentation are preserved. No runtime, migration, runner or package changes were present. This report is an additional documentation change, not a checkpoint or source rewrite.

Read-only target check: PostgreSQL 17.11 on literal `127.0.0.1:5432`; database, session role and owner `is_dev`; not a standby. URL validation rejects non-loopback, other database/role or unexpected connection parameters before connecting. This is host-local PostgreSQL, not Neon or a production endpoint. All consumer/membership/Identity gates were checked unset/off.

The ledger contains exactly 0001–0004, 0006 and 0007, all matching source and rehearsal evidence. There is no 0005. Exactly 0008–0010 remain pending, with none of their 14 tables already present. All 42 existing foreign keys are validated; no governance-count violation, idle-in-transaction connection or waiting database lock was observed. These are point-in-time checks; repeat immediately before execution.

The migration/runtime role owns all 31 public tables and has public schema CREATE and database CONNECT. It has no superuser, CREATEDB, CREATEROLE, replication or BYPASSRLS privilege. No grant escalation is needed. **The runtime is also the table owner; least-privilege role separation is not established and was not silently changed.**

## Exact reviewed pending migrations

| Migration | SHA-256 |
| --- | --- |
| `0008_identity_credentials.sql` | `5b84f270c7ab9d6a3658abd40f268600899bb969a671efcfdf42270afb8ea773` |
| `0009_nexus_consumer_runtime.sql` | `ad62e6f2500a17e0061b788604f9b201810277d2d55ddafa09eefc364dc131c8` |
| `0010_identity_consumer_code_barrier.sql` | `f4295cf7903ae2d5cb6bb67dd6884ed5e23cd0461c7df46d094f6e31fb2a94e2` |

0008 adds credential/subject/epoch/nonce/audit persistence and immutable/monotonic guards; it does not alter Better Auth tables. 0009 adds operations, revisions, epochs, cursors, audit/rate state, seeds revision sidecars from existing Nexus state and installs policy/epoch guards. 0010 adds the code-digest/generation barrier sidecar. No existing rows are deleted or rewritten. The earlier disposable rehearsal established fresh/populated compatibility, writer-lock behavior, reader preservation and exact-runner idempotency. DDL still takes locks; use bounded lock/statement timeouts and stop on failure.

## Actual development backup and recovery proof

Private archive: `/home/user/backups/is_dev/pre-0008-0010-2026-11-10T13-24-42-459Z.dump`. Size 91559 bytes, mode 0600 in a 0700 directory outside Git. SHA-256: `3299f540d46064b7c6f1b3dac867f7ea5087574251eccc8022bae573f64b1b77`. The protected adjacent `.manifest.json` records target, source/ledger hashes and table row digests. The archive hash was reverified after restore. No credentials or real row contents were printed.

The custom-format dump used an exported REPEATABLE READ snapshot shared with the baseline digest queries. Actual backup contents were restored into a new private Unix-socket-only PostgreSQL cluster under an ordinary `is_dev` role, with `--exit-on-error --no-owner --no-privileges`. Every one of the 31 restored table counts and row digests matched that same snapshot, including ledger and existing identity/session state. All 42 restored foreign keys were validated. The temporary recovery cluster was stopped and removed; only the protected archive/manifest remain.

The original archive retains owner/ACL metadata; the restore acceptance uses an ordinary target owner rather than replaying grants. Recovery must target a separately approved empty local recovery database, never automatically overwrite live `is_dev`. An additive application rollback leaves migrated tables/history intact and disables new functionality. The runner commits each migration separately: if a later migration fails, inspect the partial ledger before planning recovery; do not edit history, drop data or blindly rerun. A future restore must account for any writes after the backup snapshot.

Existing snapshot counts: one user, one session; zero OAuth clients, tenants, memberships and entitlements. Digest comparison also covers the other existing tables. Counts are not proof of interactive Google login.

## Exact command proposed for approval

Revalidate target, source, ledger, backup and unchanged migration/runtime files immediately before execution. Only after explicit approval of this command:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
NODE_ENV=development \
IS_DATABASE_SSLMODE=disable \
PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s -c idle_in_transaction_session_timeout=15s' \
NODE_OPTIONS='--env-file=/home/user/src/is/.env.development.local' \
npm run db:app:migrate
```

The SSL exception applies only to the independently verified loopback target. No secret appears in the command; Node loads the ignored private development file. The repository runner locks and verifies the complete applied prefix before applying 0008, 0009 and 0010. Do not run Better Auth's separate migration. Do not enable gates or provision resources as a continuation.

## Pending post-migration acceptance

Not executed pending Phase B approval. Verify all nine exact ledger rows, 14 new tables/constraints/indexes/triggers, immutable/monotonic and Nexus revision protections, code barrier, old-table digest preservation, validated FKs and last-administrator governance. Compare against the protected snapshot; investigate any legitimate concurrent changes rather than claiming preservation without evidence. Check all four actual consumer routes remain disabled, HTTPS health/readiness/discovery/JWKS and anonymous admin isolation, and Google initiation without exposing callback state/tokens. Full interactive Google login remains subject to external Console configuration and browser trust; do not claim it from initiation.

Run Node 24 standard tests, pinned Identity compatibility/lifecycle and consumer protocol fixtures, isolated PostgreSQL membership regressions, route generation, typecheck and synthetic-credential production build. Stop the sole dev listener for the build and restore its explicit HTTPS start afterward, as documented in LOCAL-DEVELOPMENT.md. Persistent `is_dev` is never a regression-test fixture. Record exact results after execution.

OAuth resource/client/environment/application/operation provisioning, maintenance/recovery authorization, explicit browser consent/code invalidation, user-security scope and live DPoP/revocation acceptance still block consumer activation. This migration approval does not authorize them.

## Approved execution attempt — stopped before migration

After explicit owner approval, the final read-only preflight passed again: exact local target, six historical checksums, all nine source hashes and the preserved archive checksum matched. The exact approved command then exited **9** with:

```text
node: --env-file= is not allowed in NODE_OPTIONS
```

The earlier proposed command was incorrect: Node 24 does not permit `--env-file` inside `NODE_OPTIONS`. This failure occurred at Node startup, before npm or the repository runner ran; no migration SQL or database write was executed. Work stopped as instructed. Post-migration schema/runtime/regression acceptance was not performed because there was no successful migration. No schema repair, restore, provisioning or gate change was attempted; the verified backup is preserved.

Proposed replacement, **not executed; requires owner approval**. This passes `--env-file` directly to Node, starts the installed npm CLI and still invokes the existing `db:app:migrate` script:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
NODE_ENV=development \
IS_DATABASE_SSLMODE=disable \
PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s -c idle_in_transaction_session_timeout=15s' \
node --env-file=/home/user/src/is/.env.development.local \
  /home/user/.nvm/versions/node/v24.22.0/lib/node_modules/npm/bin/npm-cli.js \
  run db:app:migrate
```

Refresh the guarded preflight again before an approved retry. Do not reuse the invalid NODE_OPTIONS command above; it remains solely as the record of what was approved and attempted.

## Corrected command — approved and executed successfully

The owner explicitly approved the corrected direct-Node `--env-file` command. Immediately before execution, the guarded read-only local target/prefix/source preflight passed again and the preserved archive checksum matched. The exact corrected command above invoked `npm run db:app:migrate`; exit status **0**. Runner output confirmed historical 0001–0004/0006/0007 already applied, then:

```text
Migrated: 0008_identity_credentials.sql
Migrated: 0009_nexus_consumer_runtime.sql
Migrated: 0010_identity_consumer_code_barrier.sql
IS application migrations complete
```

No SQL/hash/runner edit, Better Auth migration, manual repair, data restore or grant change occurred. The original verified backup and protected manifest remain preserved.

### Database acceptance

A bounded REPEATABLE READ read-only transaction independently verified actual server `127.0.0.1:5432`, database/session role `is_dev`, all nine ordered ledger entries and every source/ledger SHA-256 against the reviewed backup/rehearsal hashes. Intentional 0005 remains absent.

- 45 public tables: 31 historical plus all 14 expected new tables, owned by `is_dev`.
- All **30 pre-existing non-ledger tables have exactly the backup snapshot's row counts and whole-row digests**. The ledger is the expected intentional change. Existing user and session remain; existing OAuth client, tenant, membership and entitlement tables remain empty, not recreated or populated. All other old records, including admission/admin/operator and verification state, match.
- All **54 foreign keys validated**; no last-administrator governance-count violation.
- Identity issuance/mapping immutability, monotonic generation and tombstone guards enabled. Issuance/subject/code constraints and restrictive FKs present. Authorization-code sidecar is empty and has reviewed digest, generation and unique issuer/token structures.
- Nexus tenant/application/entitlement/membership/operation revision triggers and sidecar write/truncate guards enabled. Initial revision is 1. No live app/client/resource/credential authorization was provisioned.
- Membership, consumer API and Identity credential gates remain unset/off. Runtime/migration owner separation remains a documented limitation; no silent privilege redesign.

Detailed catalog definitions and redacted aggregate evidence: `/tmp/is0001-post-migration.json`. Protected baseline/archive manifest remains outside Git. This is schema/data acceptance, not live credential issuance acceptance.

### Runtime and automated acceptance

System-trusted HTTPS homepage, sign-in, health, readiness, OIDC discovery, OAuth authorization-server discovery and JWKS returned 200 at the canonical port 5180. Issuer remains `https://5480-deb13.lan.com:5180/api/auth`; advertised endpoints use the same HTTPS origin. Nexus operator/registry APIs returned 403 anonymously; admin page redirected home. All four actual consumer route handlers returned 404 with gates off, including POST access-decisions. No OAuth client or Google configuration changed. Full interactive Google callback/session/logout is still not claimed; Windows trust and external Development callback registration require owner acceptance.

Node 24 route generation, typecheck and eight standard test-file entries PASS. Existing disposable PostgreSQL suites PASS: **26 membership/concurrency**, **31 pinned Identity compatibility**, **34 Identity lifecycle/consumer protocol** tests. The fixtures use isolated synthetic clusters, not `is_dev`. No runtime or migration source changed. Production build and final HTTPS restart evidence are recorded below when completed.

Consumer activation still requires dedicated OAuth/resource/application/environment/operation provisioning, supported maintenance/recovery authorization, explicit real-browser consent/code invalidation and DPoP/revocation acceptance, reviewed user-security scope and subject profile. Global suspension/pairwise runtime/native authorization-server nonce limitations remain as described in the prior acceptance report. No gate, OAuth registration, production configuration, consumer repository, push or deployment changed.

### Final build and restored development listener

Production build **PASS** under Node 24 using synthetic build-only credentials and an unreachable fixture database; it did not use `is_dev` or production credentials. The single HTTPS development server was then restored on `0.0.0.0:5180` with the existing explicit certificate/key. Final read-only ledger/schema/old-table digest checks passed again, health/readiness/discovery/JWKS returned 200 with system-trusted TLS, and the original archive checksum remained unchanged. No generated next-env or application/migration changes remain. Documentation whitespace check passes.

Local migration/schema acceptance: **PASS**. Consumer activation/Sandcastle M11 cutover: **NOT CLEARED**; gates remain off and provisioning/live security blockers remain. No production access or deployment occurred.
