# Repository instructions

## Scope and authority

IS is one deployable Next.js modular monolith with Identity, Nexus and future Billing modules. Read `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/IS_CODEX_HANDOFF.md`, `docs/STAGE-0-AUDIT.md` and `docs/NEXUS-MEMBERSHIPS-PLAN.md` before related work. The requested `docs/CODEX_HANDOFF.md` does not exist; use `docs/IS_CODEX_HANDOFF.md`.

Stage 1 is authorized for local repository implementation and validation, including explicitly approved disposable local PostgreSQL tests with synthetic data. Do not apply migrations to existing databases. Preserve uncommitted files and all existing functionality and records. Do not deploy, push, merge, change production databases, provision production OAuth clients or rotate secrets without explicit authorization. Do not run migration/bootstrap scripts as audit checks. Never print environment secrets or connection strings. Do not reset or clean the working tree.

## Architecture and security

- Identity owns Better Auth users, provider links, sessions, OAuth/OIDC and global admission. Keep password authentication disabled and public client registration disabled. Use exact HTTPS redirects and Authorization Code + PKCE; do not restore custom LAN HTTP validation.
- Nexus owns canonical UUID tenant IDs, memberships, tenant administrators, operators, registry and entitlements. IS administrators, Nexus operators and tenant administrators are separate permissions. Authentication, domains and email matches grant no tenant access.
- Better Auth owns OAuth credentials and authoritative redirects. Nexus stores linkage; use supported provider APIs for changes and verify persistence.
- Billing owns future financial tables and integrates through module interfaces. Consumers use OIDC and published authenticated APIs, never IS database tables or privileged registry routes. Human ID tokens are not generic API credentials.
- Preserve IG user IDs, tenant IDs, records and foreign keys. Link identities with verified stable provider/IS subjects and explicit proof, never email alone. No consumer repository changes here.
- Every server route must authorize; mutations require strict origin/CSRF checks. Scope queries to authorized tenants, use parameterized SQL, transactionally audit changes, return structured errors and avoid sensitive logs.
- Put new Nexus writes in its service/repository module, not page components. Recheck mutable authorization in the write transaction. Protect the last active tenant administrator against concurrent role/status/removal changes in the database. Preserve last Nexus operator protection.

## Migrations and verification

Historical SQL migrations are immutable, including `0006_dev_http_redirects.sql`. Do not fill the `0005` gap. Proposed next revision is `0007`, conditional on reconciling the actual ledger and other branches. Better Auth migrations are separate. Use additive schema, restrictive foreign keys and data-preserving application rollback; never automatically drop membership or audit data.

Before any authorized migration, verify the exact environment/project/branch/database, ledger/checksums, isolated rehearsal, backup/restore procedure and rollback. Use a direct Neon connection with verified TLS. Never use an unverified default `DATABASE_URL` as a test database.

Use the host Node 24 environment for all npm scripts, tests, Next.js builds and migration tooling. The execution shell may otherwise select Node 20. Initialize it before Node commands:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24
node --version
npm --version
```

If NVM initialization is unavailable, prepend `/home/user/.nvm/versions/node/v24.22.0/bin` to PATH. Verified host versions are Node v24.22.0 and npm 11.19.1. Preserve the existing `.nvmrc` (24). Do not downgrade dependencies or change application code to accommodate Node 20.

 Run route generation, typecheck, tests and build. Report blocked checks accurately. Tests for membership work must include real isolated PostgreSQL concurrency, authorization/CSRF, cross-tenant denial, audit atomicity and migration compatibility; helper tests alone do not prove security. Keep existing acceptance checks. Do not claim live or cross-application verification without evidence.
