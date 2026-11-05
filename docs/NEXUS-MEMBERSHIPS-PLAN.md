# Nexus tenant memberships and administrator management — implementation plan

2026-11-05, proposed after [Stage 0 audit](STAGE-0-AUDIT.md). Design only; no Stage 1 schema or runtime implementation is included. Scope is central membership administration inside IS; consumer authorization cutover is Stage 2.

## Delivery slices

Use branch `feature/nexus-tenant-memberships`. First review the model, authority matrix and migration/backout. Deliver bounded commits: (1) additive schema and isolated PostgreSQL tests; (2) Nexus service and authorization tests; (3) operator management API/UI; (4) tenant-admin API/UI and invitations, with acceptance evidence. If this exceeds one small PR, split at those boundaries and keep incomplete routes disabled. Do not mark Stage 1 complete until the invitation and tenant-admin lifecycle works. Mail-provider integration and public enrollment are separate; secure manual invitation link delivery is the initial default.

## Proposed policy defaults

| Actor | Permitted operations |
| --- | --- |
| Anonymous or ordinary authenticated identity | No membership listing or management; may redeem an invitation explicitly addressed to their verified identity |
| IS administrator without Nexus or tenant role | No membership-management authority |
| Nexus operator | List/manage any tenant control-plane memberships, bootstrap first owner, audited recovery; no automatic business-data access |
| Active tenant owner | List own tenant, invite/add existing verified users, manage member/admin roles and statuses, grant/transfer owner; cannot remove last active administrator |
| Active tenant admin | List own tenant, invite/add/manage members; cannot alter owner/admin peers, self-elevate or grant administrator roles |
| Active tenant member | No management; future self-service access listing is separately scoped |
| Inactive membership | No tenant management privileges |

Owner/admin both count toward the last-active-administrator invariant. Multiple owners are allowed; a sole owner can demote only if another active admin remains. Ownership here is a governance role, not billing/legal ownership. Member self-leave is deferred. Removal is soft deactivation; do not expose hard delete. Role and status changes can be combined only as one validated transition. New entries default to member; never use body actor IDs or caller-supplied role claims as authority. Global permit-list management is not delegated to tenant admins.

Tenant administrators can manage only active tenants. Suspended tenants allow operator recovery/administration, while application access remains denied. Suspension does not erase the last-admin requirement. Global admission remains unchanged; invitations never bypass it. Do not build a partial global block list in this slice; preserve a service boundary for future global eligibility checks.

## Additive data model (proposed 0007)

- `nexus_tenant_memberships`: composite primary key `(tenant_id uuid, user_id text)`, FKs to `nexus_tenants(id)` and Better Auth `"user"(id)` with DELETE RESTRICT; `role` CHECK owner/admin/member, `status` CHECK active/inactive; timestamps, created/updated actor IDs and integer `version` for stale-write detection. Index `(user_id, status, tenant_id)` and tenant management ordering. Retain rows on deactivation; reactivation is explicit and audited.
- `nexus_tenant_membership_governance`: one row per enrolled tenant, restrictive tenant FK; active administrator count with CHECK >=1 and version/timestamps. No automatic insertion for existing tenants. Existence means central governance is initialized. It is not a consumer enrollment grant or a new tenant lifecycle status.
- Database triggers maintain the governance count for membership INSERT/UPDATE/DELETE. Atomic counter updates serialize on one tenant's governance row; predicate/CHECK rejects any decrement below one. This avoids a stale count query after waiting on an advisory lock. Prohibit tenant/user key updates, govern all role/status transitions and hard deletes, reject missing governance rows at transaction end. Test count consistency against actual rows. Bootstrap creates governance plus first active owner in one transaction with deferred consistency checks; the temporary bootstrap state must never commit without its owner. Do not simply initialize a counter without verifying actual membership rows. Choose exact deferred-trigger ordering and supported transaction isolation in schema review and prove it with SQL tests before accepting this design.
- Service takes tenant/governance locks in a consistent order, then rechecks actor role under lock and updates memberships/audit. Actor revocation and target updates on the same tenant serialize. Operator changes need their own role-row protection/recheck in the transaction; avoid introducing lock-order cycles with existing operator management. Retry bounded serialization/deadlock failures; do not blindly retry non-idempotent invitation creation.
- Prevent application-role direct counter/governance manipulation, TRUNCATE and trigger disabling; inspect current DB grants before selecting function ownership/privileges. If a trigger needs SECURITY DEFINER, pin search_path, schema-qualify objects and restrict execute rights. PostgreSQL table owners/superusers remain a trusted operations boundary. Role design is a release gate, not a claim about current production grants.
- `nexus_tenant_membership_audit`: identity key, tenant, target user/invitation, actor (or explicit system actor), action, previous/new role/status/version, reason, request ID, timestamp. Restrictive references where appropriate; preserve historical target snapshots. Separate event taxonomy avoids altering registry audit CHECK constraints. Mutation and audit commit or roll back together; no raw tokens, secrets or full request bodies.
- `nexus_tenant_invitations`: UUID, tenant FK, normalized recipient email and optional pinned existing user ID, requested role, unique token digest, expiry, accepted/revoked timestamps, accepted user ID and actor metadata/version. A partial unique index allows one unresolved invitation per tenant/recipient; expiry alone is time-dependent, so explicitly expire/revoke the old row before replacing it. Include an explicit state CHECK for pending/accepted/revoked/expired. No pre-created Better Auth users.

Do not modify Better Auth tables or existing tenant/IG records. New empty tables preserve existing registry behavior. First-owner bootstrap is an explicit operator action selecting an existing verified stable IS user ID; do not assign the operator automatically. New tenant creation can remain uninitialized until bootstrap; governance APIs report this clearly and deny tenant-admin mutations. No consumer reads this flag in Stage 1.

## Invitation and identity proof

Use a random token with at least 256 bits of entropy, digest only at rest, short configurable expiry (default seven days), explicit revoke and atomic single redemption. Invitation creation records intended role and grant authority; redemption locks invitation and governance, checks expiry/status, current tenant state and inviter's continuing authority for that role, then creates/reactivates membership and audit in one transaction. Concurrent/replayed redemption cannot create duplicates or elevate an existing role silently. Reject conflicting existing membership changes and require a fresh administrative action.

An email invitation is explicit authorization to a verified recipient, not migration account linking. Require an authenticated IS session with verified current email matching the invitation; when pinned, stable user ID must also match. Validate the pinned identity against stored server-side data. Email changes, mismatched identity, revoked inviter, global admission denial and tenant suspension fail closed. Last-admin status never counts pending invitations. Existing users can be explicitly added by stable user ID after eligibility and role checks; no fuzzy-email auto-linking.

The operator/admin gets a link once over no-store response; manually transfer through an approved channel. Do not log it, put it in analytics, expose it in list responses, or mutate on GET. Prefer fragment token transport into a POST redemption and clear it from browser history; apply no-referrer and no third-party assets on redemption UI. Rate-limit redemption attempts and avoid email enumeration. New recipients must independently become globally admitted and sign in; a tenant invite does not create that admission.

## Service and HTTP contracts

New `src/lib/nexus-memberships/` owns types, input validation, eligibility, policy, repository transactions and audit. Public service methods: `listMembers(actor, tenantId, cursor)`, `bootstrapOwner`, `addMember`, `changeMember(expectedVersion, role, status, reason)`, `createInvitation`, `revokeInvitation`, `redeemInvitation`. Actor comes from verified session, never request body. All repository reads/writes are tenant-scoped; role checks use `(tenant_id, user_id)`. Do not load global memberships and filter in the browser.

Proposed operator transport: `/api/nexus/registry/tenants/[tenantId]/memberships` GET/POST, `/[userId]` PATCH, `/bootstrap` POST and sibling `/invitations` GET/POST plus `/invitations/[invitationId]` revoke POST. Tenant-admin transport: `/api/nexus/tenants/[tenantId]/memberships` and equivalent invitation routes with the restricted policy above. Shared service, distinct route authorization; no operator fallback that silently elevates tenant admins. Authenticated invitation acceptance uses `/api/nexus/invitations/accept` POST. These are browser management APIs, not Stage 2 consumer bearer APIs.

Require strict canonical Origin on every mutation, authenticated session, bounded JSON/field lengths, exact enum/UUID validation, unknown-field rejection and no-store responses. Paginate member/invitation lists (default 50, maximum 100); reveal only minimal tenant-scoped identity fields. No global user search for tenant admins. Operators may use an exact stable user ID initially. Standard errors: 400 invalid input, 401 absent session for new endpoints, 403 insufficient authority/origin, 404 inaccessible target, 409 stale version/duplicate/last_admin_protected, 410 expired invitation, 429 throttled, sanitized 500. Maintain existing endpoints' 403 behavior. Avoid exposing existence before authorization. Include request ID and updated version; no SQL errors to clients.

Future Stage 2 `resolveTenantAccess(subject, tenant, application)` must verify service credential issuer/audience/scope, trusted subject binding and all effective-access conditions. Stage 1 does not mint credentials, accept ID tokens as service bearer tokens, expose privileged lists to apps or change consumer sessions.

## File-by-file change plan

| File | Planned change |
| --- | --- |
| `db/migrations/0007_nexus_tenant_memberships.sql` | Add tables, constraints, indexes, functions/triggers and privileges after ledger reconciliation; no data backfill |
| `src/lib/nexus-memberships/{types,validation,policy,repository,service}.ts` | Typed policy/contract, stable identity lookup, scoped transactions, versioning, audit, invitations and bootstrap |
| `src/lib/nexus-membership-access.ts` | Resolve session identity and tenant role without importing operator authority into tenant admin policy |
| New API directories described above | Thin validated transport into service, origin checks, structured errors and throttling |
| `src/app/nexus/tenants/[tenantId]/members/page.tsx` and manager | Operator view: bootstrap, list/add, role/status updates, invites, conflict reload and last-admin explanation |
| `src/app/tenants/[tenantId]/members/page.tsx` and manager | Tenant-admin view with server authorization and own-tenant controls only |
| `src/app/invitations/accept/page.tsx` and form | Explicit login and verified-recipient redemption; no GET mutation |
| `src/app/nexus/tenants/manager.tsx`, `src/components/app-sidebar.tsx` | Link management pages according to actual authority; preserve existing navigation |
| `tests/nexus-membership-*.test.mjs`, isolated SQL harness | Unit, route, service, real DB concurrency/migration regression tests with explicitly separate test URL |
| `package.json` / test configuration | Add isolated integration command and any necessary harness dependencies; never default to production URL |
| `docs/NEXUS-MEMBERSHIPS.md`, architecture, acceptance, README/backlog | Document actual implemented behavior, transport/errors, operator recovery and rollback evidence |

## Test and acceptance gates

1. Unit policy matrix: anonymous/IS admin/operator/owner/admin/member/inactive; all role/status transitions, stale versions, body spoofing and UUID/field limits.
2. Route integration: session missing/expired, role denied, absent/foreign/null Origin, cross-tenant ID and target mismatch, metadata leakage, malformed JSON, throttling and cache headers. Verify server pages too, not merely hidden buttons.
3. Real isolated Postgres: last admin demotion, deactivate and DELETE rejected; replacement then removal works; inactive admins/pending invites do not count. Two independent connections concurrently remove different admins: at most one succeeds and final count matches rows. Cover multi-row updates/deletes, transaction rollback, REPEATABLE READ/serialization handling, bootstrap races, actor demotion during write, counter tampering privileges and disabled audit insertion. Audit failure must roll back mutation.
4. Invitation cases: expiry/revoke, changed email, unverified email, wrong stable user/tenant, changed inviter authority, suspended tenant, duplicate pending, simultaneous redeem and revoke, replay, no token in logs/list, no automatic global admission or role elevation.
5. Migration rehearsal: fresh Better Auth-compatible schema plus all historical files; existing 0001–0004/0006 fixture plus 0007; repeat runner no-op/checksum validation; missing applied file and inserted 0005 rejected; capture before/after row IDs/counts for existing tables. Rehearse previous application against expanded schema. No production connection.
6. Regression: existing Google admission, IS-admin/operator separation, final operator, catalogs/domains/entitlements, HTTPS callbacks and provider redirect read-back. Existing helper suites remain green; full browser OAuth acceptance requires test IdP/client environment.
7. UI manual acceptance: bootstrap, invite/add, paginate, deactivate/reactivate, role transfer, stale edits, denied cross-tenant navigation and keyboard/error accessibility. No page-render writes. Operator recovery works without bypassing last-admin count.
8. Run clean route generation, typecheck, standard `npm test` and build under Node 24 initialized through NVM. Stage 0b baseline typecheck, tests and build pass (build outside sandbox); repeat these checks after Stage 1 changes. Add integration test evidence and reviewer sign-off on invariant SQL before enabling features.

## Rollout, migration conflicts and backout

Before schema application, record exact Neon project/branch/database and deployed code SHA; compare ledger names/checksums with source, inspect schema/constraints and current grants, resolve missing 0005/other pending revisions and reserve 0007. Use an explicitly isolated staging branch with synthetic or authorized sanitized data; direct verified-TLS connection. Review lock duration and backup/restore rehearsal. Migration commands are mutating; do not run them as schema discovery. No production work without explicit authorization.

Apply additive migration in isolation, verify historical row counts/IDs and old application compatibility, then deploy only with authorization. Use a server-side membership-management feature gate default off until schema/tests pass; gate only new routes/UI and fail closed when disabled or schema unavailable. Bootstrap selected test tenants explicitly, verify admin replacement and invitation acceptance, then enable incrementally. Existing consumers keep their own authorization unchanged. IG import and Stage 2 access checks require separate reviewed cutover.

On migration transaction failure, roll back that pending transaction; prior migrations remain committed. On application failure after migration, disable the new gate and restore prior application version, leaving memberships/invitations/audits/ledger intact. Old application must ignore additive tables. Preserve evidence and revoke leaked invitations through audited recovery. Do not drop tables, delete ledger rows, rewrite historical SQL or restore the whole database over newer unrelated writes. Correct counter/trigger defects with a reviewed forward migration and freeze membership writes until consistency is proven. Restoring data requires an explicit, selective reconciliation plan and tested backup, not an automatic down migration. Later consumer cutover rollback must also address sessions/caches, separately from this Stage 1 backout.

## Decisions and review requirements

No decision blocks this documentation stage. Proposed defaults above keep scope bounded. Before implementing Stage 1, confirm owner/admin delegation, multiple-owner policy, manual invitation delivery/expiry, management gate and DB role/trigger strategy. Actual applied migration history, test DB credentials/target and invariant concurrency proof remain mandatory implementation/release evidence. The Node 24 baseline build now passes; this does not validate unimplemented Stage 1 behavior. Do not treat this plan as authorization to deploy, push, merge or mutate production.
