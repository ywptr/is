# Codex handoff — IS / Nexus / Billing modular control plane

Paste the following as your first Codex task in `~/src/is` (or adapt into an `AGENTS.md` after inspecting any existing repository instructions).

## Mission

You are taking over development of `ywptr/is`, a Next.js / TypeScript / Better Auth / Neon identity and tenant-control plane. **Begin with a read-only audit and Stage 0 design; do not implement every backlog item in a single change.** Review `IS_BACKLOG_2026-11-05.md` and the current checkout as your ground truth. Produce a concise implementation plan and identify conflicts between backlog, code and database migration state.

## Non-negotiable architecture

- One deployable IS modular monolith with separate Identity, Nexus, future Billing boundaries. Better Auth retains ownership of OIDC/OAuth and identity tables.
- Nexus owns tenant registry, memberships, admin lifecycle and effective entitlements. Identity does not itself grant application or tenant access. IS admin and Nexus operator permissions are independent.
- Billing future module owns financial records, never directly changes identity or Nexus tables.
- Consuming apps use OIDC and published authenticated APIs, never operator routes or IS database tables. Never use human ID tokens as generic service API bearer credentials.
- `oauthClient` is canonical for OAuth redirects and secrets. `nexus_application_oauth_clients` is application/environment mapping; identify and remove drift, not by manually editing Better Auth tables.
- Secure defaults: exact HTTPS callbacks, Authorization Code + PKCE S256, no public dynamic client registration, no custom LAN HTTP workaround. Preserve historical migrations.
- Canonical tenant IDs are UUIDs compatible with IG `String(36)` IDs. Do not renumber/migrate IG data without a reviewed reconciliation plan.
- Never link identities solely by email, never assume authentication implies membership, never allow removing the last active Nexus operator or last active tenant admin.

## Stage 0 tasks (do these first)

1. Inspect working tree, HEAD, Git remotes, current branches; preserve uncommitted work. Do not force-push or reset.
2. Inspect `README.md`, `docs/ARCHITECTURE.md`, `docs/MVP-ACCEPTANCE.md`, migrations, Better Auth config, `nexus_*` routes, application registry, tests, scripts and deployment config.
3. Report implemented vs missing functionality with file references. In particular distinguish admin-only APIs from consumer APIs and verify whether tenant memberships, SSO foundation, global admission toggle, global block list and Billing exist at HEAD.
4. Check immutable migration history and identify a safe next migration number. Do not alter existing applied migration files. Do not connect to or mutate production DB.
5. Update architecture and backlog documentation to reflect modular monolith and current security boundaries. Correct any unsupported claims that full OIDC integration is tested.
6. Propose a **small Stage 1 PR**: Nexus tenant-membership data model, owner/admin/member behavior, last-admin concurrency protection, operator UI, service/API contracts, tests, staged migration, and backout plan. Flag decisions that genuinely block implementation but propose grounded defaults otherwise.
7. Run local static checks/tests if available. Report pass/fail/blocked truthfully, including tool limitations.

## Implementation constraints when authorized for Stage 1

- Keep database writes inside Nexus-owned service/repository code, not in Next.js page components; use parameterized SQL, transactions and audit entries.
- Use an additive SQL migration with no destructive alteration of historic IS or IG data.
- Ensure server-side authorization on every route, strict origin/CSRF checks for mutations, structured errors, no secrets in logs, and concurrency-safe last-admin protection in DB.
- Separate current user identity, tenant membership and tenant app entitlement; ensure negative tests for unauthorized and cross-tenant access.
- Do not alter Sandcastle, IG, or Axtor repositories here. Document any required consumer-side work as a handoff.
- Do not automatically deploy, merge, rotate secrets, create production OAuth clients, or run a production migration without explicit authorization.

## Expected output

A short current-state audit; file-by-file Stage 1 change plan; risk/rollback notes; a proposed branch/PR title; test strategy; and clear manual review gates. After review, implement in bounded commits and run `rm -rf .next && npx next typegen && npm run typecheck && npm test && npm run build` where feasible.
