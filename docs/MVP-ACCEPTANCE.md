# IS MVP: release gates

Reconciled 2026-11-05: historical consumer migration checks remain valid. Nexus now owns planned central memberships inside IS; application-specific resource roles remain with consumers. No checked item or runtime acceptance is implied. See [Stage 0 audit](STAGE-0-AUDIT.md) and [membership plan](NEXUS-MEMBERSHIPS-PLAN.md).

## Initial technical checks

- [ ] Dependencies install and TypeScript typecheck pass on a network-enabled development host.
- [ ] Better Auth + OAuth Provider database migration applied to isolated Neon IS database.
- [ ] `/api/health` returns 200; `/api/ready` checks Neon and returns 200/503 as appropriate.
- [ ] `GET /api/auth/.well-known/openid-configuration` exposes the correct issuer and endpoints.
- [ ] `GET /api/auth/jwks` contains the public signing keys; never expose private keys.
- [ ] Google OAuth callback URI matches the deployed canonical IS host.
- [ ] Allowlisted verified Google identity can sign in through IS.
- [ ] Non-allowlisted and unverified Google identities cannot obtain sessions.
- [ ] OAuth clients can only be registered by an operator; dynamic registration stays off.

## IG V4 MVP acceptance

- [ ] Existing verified Google-linked IG V3 user signs in to IG V4 via OIDC.
- [ ] Verified Google `sub` maps to exactly one original IG user ID.
- [ ] Original tenant and membership roles remain unchanged.
- [ ] Cross-tenant data requests are denied for nonmembers.
- [ ] Existing image generation, jobs and artifact access work in V4.
- [ ] IG V3 deployment continues serving users during V4 rehearsal.
- [ ] Rollback of V4 application and auth flag restores original login.

## Sandcastle phase

- [ ] IS works as second independent OIDC consumer.
- [ ] Existing IS session provides SSO when returning to browser without granting membership.
- [ ] Sandcastle-to-IG service calls enforce correct tenant/service authorization.

## Out of MVP

Enterprise SSO, password login, dynamic client registration, general-purpose identity admin portal and complete IG V3 password-only account migration remain outside the initial identity MVP. Nexus tenant registry/lifecycle administration exists; centralized memberships are the next planned Nexus milestone. Dynamic client registration remains disabled.


## Nexus Stage 1 release acceptance (pending environment authorization)

- [ ] Review migration 0007 against the exact target ledger and runtime database privileges.
- [ ] Rehearse target migration/backup/restore on an isolated environment and verify previous code compatibility.
- [ ] Verify real-session operator bootstrap and owner/admin/member delegation in the browser.
- [ ] Verify cross-tenant denial, final-admin conflict, invitation acceptance/replay and audit on the target environment.
- [ ] Keep consumer authorization unchanged; no consumer-facing service API is released.

Local automated evidence and data-preserving backout are recorded in [membership management](NEXUS-MEMBERSHIPS.md). These unchecked release gates do not imply missing local implementation.
