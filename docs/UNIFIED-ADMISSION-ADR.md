# ADR — IS-mediated tenant and application admission

> Runtime reconciliation: the subsequently authorized [IS-ADMISSION-1 internal eligibility increment](IS-ADMISSION-1-INTERNAL-ELIGIBILITY.md) implements the internal facade only. Public admission and consumer cutover remain unimplemented.

2026-11-16. Proposed protocol and governance design for review; ownership contract follows the requested architecture. No implementation approval, deployment or deprecation is implied. Supersedes earlier consumer-directed discovery as the **target** architecture only. [Baseline](UNIFIED-ADMISSION-BASELINE.md), [contract](IS-ADMISSION-CONTRACT.md), [transition](UNIFIED-ADMISSION-MIGRATION.md), [proposed OpenAPI](openapi/is-admission-proposed.openapi.json).

## Ownership decision

| Authority | Owns | Boundary |
| --- | --- | --- |
| IS / Identity | Human identity, authentication, IS sessions, global eligibility, admission mediation, trusted OAuth issuance/validation | Successful login grants no tenant or application access |
| Nexus | Canonical tenant UUID, memberships, tenant lifecycle, domain governance, application registry and entitlements | Evaluates effective tenant/application eligibility; does not assign app resource roles |
| Consuming application | App sessions, local administrators, resource permissions, resource-to-tenant associations and business data | Valid admission cannot override local denial |
| Axtor | Runtime AI action authorization | Fresh action policy at execution; neither IS admission nor IG authorization substitutes for it |
| Billing (future) | Financial state | Requests entitlement changes through module interfaces |

IS remains one deployable modular monolith; IS admission calls Nexus through internal module interfaces, never its operator HTTP routes or direct cross-module writes. Identity/Better Auth owns credentials and redirect persistence. Keep Global Admin, Nexus operator, tenant admin and App Admin permissions independent. Domain/email hints never prove membership or identity linkage.

The continued-eligibility operation externally supported in the target is `POST /api/nexus/v1/access-decisions`. Discovery, self-membership and entitlement lookup become internal capabilities of IS admission. Existing v1 transports remain available throughout this task and until a separately approved migration. No active-tenant preference grants access; each application session carries its own explicit context.

## Admission decisions

Authenticate a human with the existing Google/OIDC protections. IS then obtains effective eligible tenants/apps from Nexus for the authenticated subject and registered client/environment. Zero eligible tenants shows a no-access state and support path; no app grant is issued. One tenant is presented for explicit confirmation. Multiple tenants require explicit selection; no first-row, email-domain or hostname default. Application selection is restricted to enabled applications entitled to the selected tenant and permitted for that client. Recheck all eligibility after selection and at code redemption; a list is advisory.

IS creates a short, one-use code for a single subject/session, canonical tenant, application/client/environment, callback, PKCE challenge and browser transaction. Redeeming it yields an admission context bound to the same verified identity and target application. IS session cookies never cross to applications. The app validates context and binds it to its existing or new local session without changing local user IDs. A mismatch forces a fresh explicit flow, never email-based account merging. Authentication, admission and local resource authorization remain separate steps.

Admission lifetime is proposed at at most 300 seconds and bounded by authentication/session/token expiry. It is an admission receipt, never a resource API bearer credential or five-minute eligibility lease. Each protected operation still requires a new DPoP-bound Nexus decision and local resource permission, consumed before the current maximum five-second deadline; recheck at consequential queued execution boundaries. No positive authorization cache. Any deny/unavailable response blocks the protected action and invalidates selected authority; the app may preserve its logged-in session and display recovery.

IS session termination, global ineligibility, membership removal/inactivation, tenant suspension, disabled app/entitlement, client/key/token or admission revocation deny future checks. Re-enable never revives invalidated admission/code generations. Existing in-flight decisions retain only their original <=5s budget; already committed external side effects cannot be undone. Consistent snapshots, durable audit and monotonic revocation state remain prerequisites. Suspended tenants issue no new admission and cannot be selected for execution; operator recovery is separate.

## Administration and departure dependencies

UI ownership is IS Global Admin, Nexus Tenant Admin and application-owned App Admin. Nexus operators retain control-plane recovery with audit and no implied tenant business access. Displaying links does not confer authority; each server action checks its own role and Origin/CSRF policy.

| Invariant | Required implementation safeguard | Current evidence |
| --- | --- | --- |
| At least one active Global Admin | Identity-owned governance lock/counter with database constraint covering role removal, suspension, user departure and global admission changes; replacement must be globally eligible and active | Existing `isISAdministrator` lookup is not proof of this invariant; new work required |
| At least one active tenant admin per active tenant | Nexus database counter/constraints plus transactional actor recheck, audit and lifecycle activation guard; count only effectively active eligible owners/admins | Membership last-admin protection exists; global user disable/tenant activation coordination still needs review |
| At least one active App Admin per active tenant–app pair | App-owned database guard and restrictive references; coordinate tenant/app activation and entitlement enablement with acknowledged admin bootstrap | No shared App Admin invariant established by this audit |
| At least one Nexus operator | Preserve existing independent database protection | Existing invariant; do not conflate with Global Admin |

An active tenant–app pair means active tenant, active app and enabled entitlement. Pending activation is deny-only until a real active local admin acknowledges bootstrap. Invitations do not count. App ownership may permit several admins; removal of the last one is blocked until a replacement is durably active.

No distributed preflight can guarantee an invariant by itself. Departure is a coordinated operation with durable ID, actor authorization, expected versions, expiry and idempotency. Identity/Nexus/application participants expose internal `prepareDeparture`, `commitDeparture`, `abortDeparture`, `getDepartureStatus` interfaces. Preflight reports only authorized dependency categories, blockers and required transfers: Global Admin/operator roles, tenant admin roles, App Admin roles, active sessions/grants, owned resources, jobs, integrations and retention/legal holds. App owners define transfer/archive/cancel semantics; IS never directly rewrites their records.

Prepare freezes conflicting grants/admin changes/resource creation within the affected scope using durable fences; each participant records exact revisions and a short-lived reservation. Unknown/unavailable participants block normal departure. Commit rechecks authority and revisions under local locks and applies local changes plus audit/outbox atomically. Coordinator tombstones departure and denies admission before final destructive actions; retryable delivery and reconciliation finish acknowledgements. Timeout never auto-releases a possibly committed operation; resolve status first. Aborting before commit releases fences; partial completion stays deny-only until reconciled. Transfers must not roll back into orphaned ownership.

The proposed internal preflight request is `{operationId, action, targetUserId?, tenantId?, applicationId?, expectedVersions, replacementAssignments, reason}` with exactly the identifiers required by its action. Actor is supplied by the authenticated module boundary, never by that body. Response is `{operationId, state, participant, observedVersions, blockers, requiredTransfers, fenceId?, expiresAt}`; blocker details are visible only within the actor's administration authority. Actions distinguish user departure, membership removal, admin demotion, entitlement withdrawal and tenant archival. Commit requires the same operation/fence IDs and expected versions, and returns a durable acknowledgement with audit reference; status is queried by operation ID. These are internal service contracts, not new public consumer routes. Idempotency keys cannot be reused with different targets or payloads. Reject stale versions/fences with conflict, unresolved dependency with blocked status and outages as unavailable; never equate an empty/error response with no dependencies.

Hard user/tenant deletion is deferred until every participant acknowledges dependencies resolved and retention allows it. Prefer soft deactivation and retained canonical IDs, restrictive FKs, audit snapshots and revision tombstones. Tenant deactivation blocks new work, inventories active app pairs, transfers/archives resources and handles running/paid jobs before final archival. Tenant removal cannot cascade-delete app data. Reactivation repeats administrator and entitlement preflight. Emergency security suspension may immediately deny admission even when departure dependencies remain; retain/freeze resources and administrator assignments for recovery. It must not physically delete the last admin; restoring eligibility or appointing a replacement is an audited recovery prerequisite. An emergency deny state is not successful normal departure.

## Cross-application service identity

Sandcastle calls IG directly. IS issues or validates trusted OAuth service identity and never proxies media/generation requests. IG validates its exact intended audience, credential class, sender proof, live grants and canonical tenant, then enforces its own resource permissions, budgets and side effects. Human-on-behalf-of requires explicit verifiable delegation binding actor, caller, receiver, tenant, operation/resource, expiry and revocation lineage. A machine identity or ID token cannot impersonate a person. Axtor independently authorizes runtime AI actions. The [service addendum](SANDCASTLE-IG-SERVICE-AUTHORIZATION-ADDENDUM.md) remains design-only; token exchange/provider support, IG audience/operations and service-edge grants require separate review. No service integration is implemented by admission work.

## Review decisions

Review the additive code/redemption protocol, 60s code and 300s receipt ceilings, explicit confirmation even for one tenant, subject mapping/public-versus-pairwise profile, credential acquisition composition and coordinated departure/fencing protocol before implementation. Provider capability must be proven with maintained libraries. Never build custom OAuth/JWT/DPoP primitives or silently broaden existing grants. Recommended first increment is the bounded internal eligibility facade described in the migration plan, after closing the baseline acceptance gaps.
