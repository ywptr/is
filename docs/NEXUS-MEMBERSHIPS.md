# Nexus tenant membership management — Stage 1

Local implementation for review, 2026-11-05. No existing database migration, production write, push, merge or deployment has been performed. Execution of migration SQL was authorized only for disposable local PostgreSQL tests with synthetic data. Consumer service APIs remain outside this stage.

## Behavior and boundaries

Set the server-only `NEXUS_MEMBERSHIPS_ENABLED=true` only after an authorized migration and acceptance review. Default is off: new management routes/pages return 404 and new navigation links remain hidden. Existing login, IS sessions, OAuth provisioning, registry, tenants and entitlements retain their behavior. No login hook creates memberships; Billing/subscription status is never consulted.

Membership keys are existing Nexus tenant UUIDs and Better Auth `user.id` values. Roles are `owner`, `admin`, `member`; status is `active` or `inactive`. Deactivation is the supported removal mechanism; no HTTP DELETE or hard-delete UI exists. Each change requires a reason and an expected version; conflicts require reload. Owner/admin count as administrators; inactive memberships and pending invitations do not.

| Authority | Management powers |
| --- | --- |
| Nexus operator | Platform-level management for all tenants, including suspended tenants; explicit first-owner bootstrap and recovery |
| Active tenant owner | Own active tenant only; add/invite identities and change roles/status, including other owners/admins |
| Active tenant admin | Own active tenant only; add/invite/manage members; cannot grant elevated roles or modify owner/admin peers or themselves |
| IS administrator only, member, inactive or anonymous identity | No tenant administration rights |

Multiple owners are supported. A tenant may retain an admin with no owner; this role is governance, not legal/billing ownership. At least one active owner/admin must remain once governance is initialized, even for a suspended tenant. Operators can explicitly assign a replacement active administrator before deactivating an inaccessible one. No operator automatically becomes a tenant member or gains business-data access. Consuming applications retain application-specific resource permissions, existing sessions and safe membership enforcement until a separately reviewed consumer cutover.

First owner: Nexus → Tenants → Manage memberships, enter the exact existing verified, globally admitted IS user ID and a reason. A transaction creates governance plus that first owner. Existing tenants are not auto-enrolled. All later additions/activations must refer to an existing verified, admitted identity. Tenant-admin navigation shows only tenants with active owner/admin membership and active tenant status.

## Browser management contracts

These are cookie-session management APIs; they are not consumer-facing membership/access-decision APIs. Human ID tokens are not accepted as service credentials. All writes require exact canonical Origin, an authenticated IS session, JSON no larger than 8 KiB, strict known fields and server-side authority checks. Every response is no-store and includes a server-generated request ID. Unauthenticated requests use 401; insufficient role/origin uses 403. Missing tenant membership/targets use 404, stale version/duplicate/last-admin conflicts use 409, expired invitation uses 410 and redemption throttling uses 429. Unexpected errors are sanitized.

Base paths:

- Operator: `/api/nexus/registry/tenants/{tenantId}` (explicit Nexus operator required).
- Tenant admin: `/api/nexus/tenants/{tenantId}` (own active owner/admin membership required; no implicit operator fallback).

| Endpoint suffix | Method | Input/result |
| --- | --- | --- |
| `/memberships` | GET | `limit` 1–100 (default 50), opaque user-ID `cursor`; members, initialization/admin count, actor role and next cursor |
| `/memberships` | POST | `{userId, role, reason}` adds an active member |
| `/memberships/{userId}` | PATCH | `{role, status, expectedVersion, reason}`; returns updated member/version |
| `/memberships/bootstrap` | POST | Operator only: `{userId, reason}` creates the first active owner |
| `/invitations` | GET | Same pagination bounds, UUID cursor; safe invitation metadata only |
| `/invitations` | POST | `{email, role, reason, userId?}`; returns invitation plus raw token once |
| `/invitations/{invitationId}/revoke` | POST | `{reason}` revokes a pending invitation |

Invitation redemption: `POST /api/nexus/invitations/accept` with `{token}` and authenticated recipient session. The tenant and granted role come only from the stored invitation. No enrollment occurs on GET. The UI at `/invitations/accept#token=…` removes the fragment from history after reading it, sends it in a POST body, and uses no-referrer metadata. It includes no third-party scripts. If signed out, sign in and reopen the private link. Tokens are shown once to the inviter; manually deliver through an approved private channel. No email provider integration is included.

Tokens have 256 bits of random entropy; only SHA-256 digests are stored. Expiry is seven days, verified by the database clock including immediately before acceptance. Recipient must have a verified matching current email, satisfy the global permit list, and match a pinned stable user ID when supplied. This is explicit invitation authorization, not migration identity linking by email. Tenant must be active and inviter must still possess the appropriate grant authority. Existing active memberships or role conflicts require explicit management rather than silent overwrite. Replaying or racing accept/revoke cannot enroll twice. A persistent per-user budget limits redemption to 20 attempts/minute, including failed attempts; the table stores only the latest window per identity.

## Migration review: 0007

Before coding, disk inspection confirmed 0001–0004 and 0006, with no 0005. New `db/migrations/0007_nexus_tenant_memberships.sql` only creates Nexus-owned tables/indexes/functions/triggers:

- Membership governance/counter and canonical memberships, with restrictive FKs.
- Invitations with digest uniqueness and one pending invitation per tenant/email.
- Append-only membership audit with actor, target, request ID, reason and before/after values.
- Per-identity redemption rate budget.

No historical migration, Better Auth table, tenant ID, session, OAuth client or entitlement is altered/backfilled. Adding restrictive user FKs intentionally preserves referenced identities and audit history. Existing user deletion may now require a separately reviewed retention procedure for enrolled users. The migration is transactional through the existing checksum runner; deferred triggers are validated at commit. No SECURITY DEFINER functions or new privileged database roles are installed. New SQL is additive, but it still requires schema/target/grant review and deployment authorization.

The governance counter starts at zero only inside bootstrap. An AFTER membership trigger atomically adjusts it for INSERT/UPDATE/DELETE (including role/status changes), locking the tenant's governance row. A deferred constraint checks that the counter equals actual active owner/admin rows and is >=1. Empty bootstrap, key moves, direct counter edits, multi-row removal and truncation are rejected. Governance deletion is rejected. Audit rows reject UPDATE/DELETE/TRUNCATE. Ordinary SQL rollback restores counters and memberships together.

Service operations lock the tenant, recheck mutable authority, then mutate and audit in one transaction. Operator grants are held with KEY SHARE to conflict with concurrent revocation; tenant role changes serialize on the tenant row, and SHARE locks retain the actor’s role through commit even if a direct SQL writer does not take the tenant lock. Serialization/deadlock failures return `concurrent_change_retry` (409); there is no blind automatic retry of token creation or other non-idempotent operations. The caller must reload/retry deliberately.

## Local tests and concurrency evidence

Use Node v24.22.0/npm 11.19.1 through NVM, as documented in AGENTS.md. Unit/route tests use injected session/authorization boundaries, and PostgreSQL tests use the same production guard and service. They do not claim live Google/Better Auth browser acceptance.

```bash
npm run typecheck
npm test
# Requires local PostgreSQL binaries; starts/stops its own Unix-socket-only cluster.
IS_MEMBERSHIP_PG_BIN=/path/to/postgresql/bin npm run test:memberships:pg
npm run build
```

The PostgreSQL harness never reads `DATABASE_URL`, never accepts an existing database connection, and deletes only its own temporary cluster. It needs `initdb`, `pg_ctl`, `postgres` and installed/extracted PostgreSQL data files/libraries. On this host PostgreSQL 17.11 binaries were downloaded/extracted under `/tmp/is-membership-pg`, with their library directory in `LD_LIBRARY_PATH`; no system package was installed. Sandbox subprocess/socket restrictions required approved validation outside the sandbox.

Final Node 24 validation: route generation PASS; `npm run typecheck` PASS; `npm test` PASS (27 unit/route/regression tests); `npm run test:memberships:pg` PASS (25 PostgreSQL scenarios plus parent test, 26 reported); `npm run build` PASS. `git diff --check` PASS and historical migration files match `e6ae723`. Final tests/build ran outside the sandbox to capture subprocess output correctly. No dependency versions were changed.

Observed concurrent results against real independent connections:

| Scenario | First transaction | Competing transaction | Final active administrators |
| --- | --- | --- | --- |
| READ COMMITTED deactivation | Commit | 23514 invariant violation | 1 |
| REPEATABLE READ deactivation | Commit | 40001 serialization failure | 1 |
| READ COMMITTED DELETE | Commit | 23514 invariant violation | 1 |
| REPEATABLE READ DELETE | Commit | 40001 serialization failure | 1 |
| Simultaneous service deactivations | One success | One `last_admin_protected` | 1 |

Tests also cover bootstrap races, direct/multi-row SQL, stale writes, tenant/operator authority revocation while blocked, CSRF/session/role denial, cross-tenant targets, audit-insertion failure rollback, invitation replay/expiry/revoke/pinning/verified recipient/changed email/inviter authority, throttling, suspended tenants, restricted-role DDL denial and preservation of synthetic original records. Fresh synthetic schema plus historical sequence and populated pre-0007 upgrade are tested. The existing migration runner's ledger/checksum failure paths and production-like restore have not been rehearsed in this change.

## Remaining security and operational review

- The existing database's applied ledger, deployed commit, Neon branch, data and grants remain uninspected. Reconcile them before any authorized migration; never fill the 0005 gap or edit checksums. Resolve other-branch migration collisions before reserving 0007 for release.
- Schema owners/superusers can bypass triggers. Runtime credentials must not have schema CREATE, table ownership, ALTER/TRUNCATE or trigger-disabling authority. The migration does not assume or rewrite existing environment grants; use a separately reviewed owner/runtime-role arrangement and test the exact grants. Invoker triggers need SELECT/UPDATE on governance, guarded against direct edits. Direct privileged SQL membership changes are not service-audited; operational changes must use the service or a separately audited procedure.
- Browser/manual acceptance of the new UI and real Better Auth session/Google login flow is still a release gate. Builds and injected route tests do not replace it. Review manual invitation delivery, recovery and audit retention/access policies. There is no audit-history UI yet; records are retained for authorized operational inspection.
- Global permit removal does not revoke existing IS/consumer sessions, global block list is absent, and membership mutation does not revoke consumer sessions. Existing admission policy columns do not implement public enrollment. These preexisting limits remain explicit; Stage 1 introduces no consumer access cutover.
- Tenant reads/management serialize on the tenant row; monitor contention for large tenants. Lists are paginated, but invitations and audit/rate records still need retention/operational monitoring. Redemption uses per-identity throttling; infrastructure-level unauthenticated request controls remain an operations concern.

## Deployment and rollback procedure (not executed)

1. Obtain explicit authorization for target-environment work. Verify code SHA, Neon project/branch/database, direct verified-TLS connection and complete `is_schema_migrations` names/checksums. Confirm no existing/missing 0005 or conflicting 0007, runtime DB privileges, backup/restore procedure and lock budget. Do not print secrets.
2. Rehearse on an explicitly authorized isolated branch with synthetic/sanitized data. Capture existing record IDs/counts, apply through `db:app:migrate`, verify governance triggers and counter consistency, and rehearse the previous application against the expanded schema. Better Auth migration is not required by 0007.
3. With separate deployment authorization, keep `NEXUS_MEMBERSHIPS_ENABLED` off, apply schema to the verified target, then deploy reviewed code. Enable only after schema/security checks. Bootstrap a selected tenant and verify replacement-admin/deactivation, denied cross-tenant operations, transactional audit and invitation lifecycle with real test identities.
4. Roll back a failed SQL transaction; the runner's earlier revisions remain committed. For application failure after migration, disable the gate and restore the previous code. Keep all additive tables, membership/invitation/audit records and ledger entries. No automatic down migration, table drops, tenant-ID rewrite or whole-database restore over subsequent writes.
5. If invariant/counter defects appear, freeze membership writes by disabling the gate and use a reviewed forward repair migration after data reconciliation. Protect leaked invitations through an audited revoke/recovery procedure. Consumer cutover and its session/cache rollback remain a separate Stage 2 review.
