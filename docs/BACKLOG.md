# IS / Nexus / Billing — Consolidated Development Backlog

**Snapshot:** 2026-11-05. Prepared from this project's development decisions and read-only inspection of `ywptr/is` `master`. This is a planning artifact, **not** a claim that the live Vercel deployment or local working tree has been verified. Verify all status entries against the local checkout.

## Architecture contract

- IS is the **single deployable modular monolith** (Next.js + Better Auth + Neon). Identity, Nexus and future Billing are separately owned internal modules; preserve extractable service interfaces and module-owned tables.
- Identity owns global identities, external IdP integrations, OAuth/OIDC, sessions and global security governance.
- Nexus owns canonical tenant IDs, verified tenant memberships and admission policies, trusted application registry, domain mappings, effective application entitlements. Nexus operator privileges are explicit and separate from IS admin privileges. Last Nexus operator cannot be removed.
- Billing (future module) owns plans, subscriptions, invoices, payments and billing events; it does not directly mutate Nexus or Identity tables. Prefer a service/event interface.
- Client applications use IS OIDC and (once published) scoped Nexus consumer APIs, never database tables or privileged operator routes. Applications retain their own sessions and resource authorization.
- Trusted OAuth clients are admin-provisioned. Public client *registration* stays off. Use standard HTTPS exact redirect validation and Authorization Code + PKCE; do not reintroduce custom LAN HTTP exceptions.
- Preserve IG's existing 36-character UUID tenant IDs during migration. Hostname mapping does not prove ownership.

## Existing foundation — verified in GitHub code, NOT necessarily end-to-end tested

- Google sign-in, Better Auth OIDC provider, global database admission allowlist, IS administrators.
- Nexus operators and protected operator-management UI, with last-operator DB protection.
- Nexus application catalog, tenant catalog, tenant hostname mappings, entitlement administration.
- OAuth client provisioning and redirect editor, with Better Auth authoritative for redirect lists and credentials; Nexus stores linkage.
- Native Better Auth redirect validation in current `master` (after cleanup); historical `0006_dev_http_redirects.sql` remains applied/committed and must not be edited or deleted.
- Shared left navigation and migrations via `db:app:migrate`.

## P0 — highest priority

1. **Tenant memberships and tenant admin lifecycle (Nexus)**
   - Nexus-owned membership model referencing canonical `nexus_tenants.id` and stable IS user IDs.
   - Add/list/invite/activate/deactivate tenant members, owner/admin/member governance, per-tenant roles and status.
   - Prevent removal/demotion/deactivation of the last active tenant administrator, including concurrent operations; audited, server-enforced.
   - No automatic membership or tenant access from successful Google sign-in.
   - Design safe migration from IG V3: preserve existing IG local user/tenant IDs and records; link verified IS identity rather than matching email only.

2. **Consumer tenant-access/entitlement API (Nexus)**
   - Define authenticated, versioned service contract for consuming apps; `iss`, `sub`, audience, tenant ID, application ID/key, effective membership/status, entitlement.
   - Distinguish human ID token from service authorization; no broad use of OIDC ID tokens as API credentials.
   - No operator-only endpoints exposed to clients; fail closed; avoid tenant-ID spoofing and cross-tenant access.
   - Test active/suspended tenant, disabled app, disabled entitlement, unauthorized member and absent auth.

3. **Global identity governance (Identity)**
   - Global Admission Management: explicitly named global permit-list enforcement toggle (default on, fail closed), with audit and confirmation to turn off.
   - Global **permanent block list** taking precedence over all tenant/public admission (by verified email and stable subject/provider ID when available); audited unblocking.
   - Global user directory: search existing identities, distinguish authenticated identity from membership.
   - Protect last authorized IS administrator from self-lockout.

4. **OAuth client lifecycle correctness (Identity/Nexus)**
   - Better Auth `oauthClient` is authoritative; Nexus `nexus_application_oauth_clients` stores app/environment mapping, not independently mutable redirects.
   - Verify updates by read-back; prevent configuration drift, orphan clients, double provisioning, and concurrency races.
   - Manage disable/enable, secret rotation and planned revocation; ensure Nexus app disable policy and Better Auth client status are coordinated without asserting existing sessions revoked.
   - Use standard HTTPS redirect matching; deprecate/remove unused insecure-LAN capability from runtime/UI, leaving historical migrations intact.

## P1 — next

5. **Tenant admission governance (Nexus)**: invitation-only/public/closed policies enforced, tenant-scoped invitations and permitted addresses, activation/expiry/revoke, global block precedence, verified domain policy, safe invitation redemption.
6. **Tenant domain verification (Nexus)**: prove ownership before relying on custom domains; support multiple domains, one primary, conflicts, audit and migration safety.
7. **Session security operations (Identity)**: user suspension; list/revoke IS sessions; document consumer session and token propagation limits; security audit log UI.
8. **SSO provider foundation (Identity/Nexus)**: generic enterprise OIDC integration first, SAML later; tenant provider selection and verified federation; never auto-link by email. The v0.7 SSO scaffold was discussed/prepared but `0005_tenant_authentication_foundation.sql` and `/nexus/authentication` were not found on inspected `master`; confirm local state before assigning.
9. **Billing module skeleton (Billing)**: independent operator roles, tenant billing accounts, products/plans/prices, subscriptions and audit trail; payment provider adapters later; no provider credentials in browser or cross-module table writes.
10. **Developer experience/reliability**: publish current API/OpenAPI integration contract, DB query timing, health vs readiness, staging DB separation, migration rehearsals, automated acceptance tests.

## P2 / future

- Enterprise SAML, SCIM/user provisioning, tenant organization IdP discovery and verified account linking.
- Classic username/password authentication with email verification and MFA/OTP/TOTP; tenant enablement, rate limiting, secure recovery. **Backlog only; `emailAndPassword.enabled` stays false.**
- Cross-application/back-channel logout, coordinated session revocation.
- Billing invoices, payment gateways, webhook verification/idempotency, reconciliation, usage limits, grace periods, entitlements sync.
- Two-person approval for sensitive Nexus administrative actions.
- External developer self-service or public OAuth client type ONLY if future requirements justify it (public client is distinct from unauthenticated client registration).

## Documentation/technical debt to fix first

- Resolved in Stage 0/0b: `docs/ARCHITECTURE.md` is a dated modular-monolith decision assigning centralized memberships to Nexus while preserving module boundaries.
- Resolved documentation claim: README no longer asserts verified full cross-application OIDC acceptance. Reproducible integration evidence remains required.
- `package.json` still reports `0.2.0`; use consistent releases or clearly distinguish module milestones.
- Resolved scope reconciliation: `docs/MVP-ACCEPTANCE.md` distinguishes historical consumer checks from the planned Nexus membership milestone.
- Historical database migrations are immutable; use a new migration for schema cleanup. Do not drop historic `0006` from the migration folder while it remains recorded by checksum.
- Verify deployed Vercel commit and Neon branch separately; repository presence is not proof of production availability.

## Proposed delivery order for Codex

**Stage 0: Repository audit and contracts** (no schema writes, no deployment): audit current HEAD/branches, migrations, auth routes, API boundaries; update architecture and backlog docs; draft tenant membership schema and contract.

**Stage 1: Nexus tenant memberships**: migrations, module service, operator UI, APIs, authorization tests, last-active-admin invariant. No consuming app change.

**Stage 2: Authenticated consumer access API**: token/audience validation and authorization checks, negative tests and API docs.

**Stage 3: Global governance**: permit toggle, block list, user directory and audit.

**Stage 4: OAuth lifecycle, SSO provider skeleton, Billing skeleton** in small independently reviewable PRs.

## Release gates for each stage

- Local checks: `rm -rf .next && npx next typegen && npm run typecheck && npm test && npm run build` (environment permitting).
- Prefer feature branch and reviewed PR; do not commit secrets or auto-deploy production.
- Review migration SQL before running; direct Neon connection for migrations when available; use `sslmode=verify-full`.
- Never run destructive SQL or apply migrations against production automatically; confirm project/branch first.
- Manual security acceptance: logged-out/unauthorized users denied; cross-tenant access denied; last-admin and last-operator protections; audit captured; rollback described.

## Stage 0 local reconciliation — 2026-11-05

Completed source audit at `master` / `556ba88`; see [audit evidence and validation limits](STAGE-0-AUDIT.md) and [detailed membership/admin plan](NEXUS-MEMBERSHIPS-PLAN.md). Architecture and historical MVP scope reconciled; unsupported README OIDC acceptance claim corrected; root `AGENTS.md` added. Supplied handoff is `IS_CODEX_HANDOFF.md`, not `CODEX_HANDOFF.md`.

No memberships, tenant-admin lifecycle, invitation workflow, consumer API, SSO foundation, global admission toggle/block list or Billing module exists at this HEAD. No live database/deployment verification occurred. Disk history is 0001–0004 plus 0006; proposed next migration is 0007 after target-ledger reconciliation, never a backfilled 0005. Historical migrations remain unchanged.

Corrected Stage 0b validation: after NVM initialization, Node v24.22.0/npm 11.19.1 pass `npm run typecheck`, standard `npm test` (five files), and `npm run build`. Build required an approved run outside the sandbox because its TypeScript subprocess output was empty inside it. Earlier Node 20 results came from the execution shell, not a missing host runtime. Database/authorization/concurrency and live OIDC acceptance remain release gates. Stage 1 is planned only; no runtime/schema changes, production writes, deployment, merge or push were performed.


Stage 0b documentation and architecture reconciliation is complete: Node 24 setup is recorded in `AGENTS.md` and README; audit and plan reflect passing local validation; architecture distinguishes current functionality from accepted future ownership. Stage 1 remains unstarted. The host's existing `.nvmrc` is preserved. No application code or dependency versions changed.
