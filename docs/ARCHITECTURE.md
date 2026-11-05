# Architecture decision — IS modular monolith

Accepted contract reconciled on 2026-11-05. This supersedes the earlier MVP prohibition on IS-hosted tenant memberships. Implementation status is recorded in [Stage 0 audit](STAGE-0-AUDIT.md); this contract does not claim those memberships already exist.

## Ownership

| Module | Owns |
| --- | --- |
| Identity | Global users and stable subjects, external provider links, global admission/security governance, sessions, OAuth/OIDC through Better Auth |
| Nexus | Canonical tenant IDs, tenant lifecycle, verified memberships and owner/admin/member governance, tenant admission policy, operators, trusted app registry, domain mappings and effective application entitlements |
| Billing (future) | Plans, subscriptions, invoices, payments and billing events in its own tables |
| Consumer applications | Application sessions, local records, resource/action permissions and application-specific roles |

One Next.js deployment and Neon database host the modules. Module-owned services and tables preserve future extractability. Billing must not directly mutate Nexus or Identity tables. Better Auth remains authoritative for identity/OAuth tables, client secrets and redirects; Nexus stores application/environment linkage.

Global IS admin, Nexus operator and tenant administrator are independent authorities. Operators manage the control plane without automatic access to tenant business data. Tenant administrators do not become operators or manage global admission. Global authentication alone grants no tenant membership or application access. Future global blocks take precedence over tenant admission.

## Human login and consumer access

Google is the only enabled provider; password login remains disabled. Login uses the database global permit list and verified provider identity. Public client registration is disabled. Trusted confidential clients use exact HTTPS callbacks, Authorization Code and PKCE S256. Consumers validate state, nonce, signature, issuer, audience, expiry and replay protections, then establish their own sessions. The IS session cookie stays on the IS origin.

Consumers link identities using `(issuer, sub)`, never email alone. A human ID token is not a general service API credential. Consumers use published authenticated Nexus APIs when available, never operator routes or IS tables. Those consumer APIs are absent at the audited HEAD; retain existing consumer authorization until an independently tested cutover.

Effective tenant application access must require authenticated identity, active membership, active tenant, active application and enabled entitlement, plus local application permissions. Domain mapping and user-supplied tenant context are hints, not proof. Admission policy columns currently do not implement public enrollment. Disabling an app or removing global admission does not currently revoke consumer sessions.

## Existing data and migration

Preserve canonical `nexus_tenants.id` UUIDs and IG's 36-character tenant IDs. Preserve IG users, tenant domains, memberships, data and foreign keys. Do not overwrite collisions; reconcile them explicitly. Existing tenant creation generates UUIDs; an import path preserving IDs requires separate review.

IG remains authoritative for its existing local records during migration. Introduce explicit, verified identity links without rewriting local user IDs. For Google-linked accounts, verify the upstream subject; password-only accounts require proof-of-ownership transition. Keep legacy login/session rollback controls until consumer rehearsal passes. Sandcastle and IG retain current safe access enforcement until the Nexus consumer contract is released. Do not modify those repositories in Stage 1.

## Delivery boundaries

Stages 0 and 0b cover audit, local validation and documentation/architecture reconciliation only. Stage 1 adds Nexus membership/admin management with transactional audit and database concurrency protection. Stage 2 adds an authenticated, versioned consumer API and propagation contract. Global security governance, enterprise OIDC/SAML, Billing and coordinated OAuth/session lifecycle remain separate milestones. Historical migrations are immutable; see [membership plan](NEXUS-MEMBERSHIPS-PLAN.md) for additive rollout and backout.


## Current versus target architecture (Stage 0b)

At audited HEAD `556ba88`, Identity login/global admission and Nexus operators, registry, domains, entitlements and OAuth linkage exist. Nexus memberships, tenant-admin management, invitation lifecycle and consumer access APIs are accepted target responsibilities, not current runtime behavior. Enterprise SSO, global admission toggle/block list and Billing are also absent. Tenant admission policy values remain configuration only.

The Node 24 baseline passes typecheck, standard tests and build; security acceptance of future membership invariants still requires isolated PostgreSQL and route tests. Documentation approval does not authorize Stage 1 implementation or production changes.


Stage 1 local implementation now adds gated Nexus membership/admin and invitation management; see [implementation and validation](NEXUS-MEMBERSHIPS.md). This supersedes the prior missing-runtime status for those features in the working branch only. No existing database, deployed environment or consumer integration has been changed. Billing, global security governance and consumer service APIs remain separate.


Stage 2 [consumer contract](NEXUS-CONSUMER-API-CONTRACT.md) is proposed for review only. It preserves Identity-owned issuance/subject validation, Nexus-owned tenant decisions, consumer-owned resource authorization and separate Billing state. Canonical tenant IDs stay unchanged across application hops. User-reported application of 0007 does not establish deployed code/flag readiness; the contract records local and remote-inspection evidence separately. No Stage 2 runtime or migration has been added.
