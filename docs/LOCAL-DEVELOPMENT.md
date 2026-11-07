# Native local development

Native processes on Debian 13 host `5480-deb13` are the preferred workflow. IS is one Next.js application containing Identity and Nexus. Production remains Vercel with Neon; no production configuration is changed here. Docker files remain optional legacy infrastructure.

## Runtime and ports

```bash
cd /home/user/src/is
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.22.0
node --version
npm --version
```

Expected: Node v24.22.0, npm 11.19.1. If NVM is unavailable, prepend `/home/user/.nvm/versions/node/v24.22.0/bin` to PATH. Preserve `.nvmrc` (24). Install dependencies with `npm ci` when needed.

| Component | Local address |
| --- | --- |
| IS UI and API | `127.0.0.1:5180` |
| Browser-visible Better Auth origin | `http://localhost:5180` |
| PostgreSQL | `127.0.0.1:5432` |
| Database / role | `is_dev` / `is_dev` |
| Port 8010 | Unused |

Check `ss -ltnp '( sport = :5180 )'` before starting. If another process owns the port, identify it; do not kill it automatically. Docker and native IS cannot both publish port 5180.

## Private environment

Use ignored `.env.development.local` (mode 600), which Next automatically loads for development. It is deliberately separate from production builds and `.env.docker.local`. Do not put native database credentials in `.env.production*`, tracked files or Vercel. Do not print environment files, connection URLs, cookies or tokens.

Required values:

```dotenv
BETTER_AUTH_URL=http://localhost:5180
BETTER_AUTH_SECRET=<private local high-entropy secret>
DATABASE_URL=postgres://is_dev:<URL-encoded-local-password>@127.0.0.1:5432/is_dev
IS_DATABASE_SSLMODE=disable
GOOGLE_CLIENT_ID=<dedicated development web client ID>
GOOGLE_CLIENT_SECRET=<corresponding development secret>
```

These are placeholders, not a usable environment file. Existing private credentials were preserved when preparing native configuration; only the Docker database hostname was replaced with `127.0.0.1`. No secrets were rotated. `NEXUS_MEMBERSHIPS_ENABLED` remains unset/off.

`disable` is only for this verified host-local development target. Production defaults to `verify-full`; the connection helper rejects disabled TLS in production. Keep production Neon certificate and hostname verification intact. Shell variables override environment files: check for stale exported settings without printing their values. CLI tools do not automatically load `.env.development.local`; explicitly load it as shown below. Avoid conflicting `.env`, `.env.local`, or `.env.development` values.

## Start, stop and restart

```bash
npm run dev -- --hostname 127.0.0.1 --port 5180
```

Expected: Next.js 16 ready on port 5180, loading `.env.development.local`. Ctrl+C stops a foreground process. Restart with the same command; restart after changing environment values. Do not run `next start` for Fast Refresh. Do not start a separate backend.

From Windows, forward the port through SSH (replace the login):

```powershell
ssh -N -L 5180:127.0.0.1:5180 <debian-login>@5480-deb13
```

Open `http://localhost:5180/sign-in`. Consistently use `localhost` in the browser for Google callbacks and cookies. No LAN binding or wildcard trusted origin is required.

## Database verification and migrations

Never invoke migrations as inspection commands. Never use an unverified default URL, production Neon, reset, `db push`, or destructive synchronization. No pending migration was found during the inspection below, so neither migration command was executed.

Before future initialization or migration, verify server provenance and ownership, schema, grants, ledger/source checksums, Better Auth plan, isolated rehearsal, backup and tested restore procedure. Stop on unknown data, unexpected schema/history, checksum drift or missing privileges. Do not create 0005, edit historical migrations or delete ledger rows.

For a password-prompting, read-only host inspection:

```bash
PGOPTIONS='-c default_transaction_read_only=on' \
psql -X -W -h 127.0.0.1 -p 5432 -U is_dev -d is_dev -v ON_ERROR_STOP=1
```

In psql:

```sql
SELECT current_database(), current_user, session_user,
       inet_server_addr(), inet_server_port(), current_schema(),
       pg_get_userbyid(datdba) AS database_owner
FROM pg_database WHERE datname=current_database();
SELECT schemaname, tablename, tableowner FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2;
SELECT to_regclass('public.is_schema_migrations');
-- Run only if the ledger exists:
SELECT name, sha256, applied_at FROM public.is_schema_migrations ORDER BY name;
SELECT conrelid::regclass, conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'
ORDER BY 1,2;
\q
```

Compare with immutable source:

```bash
sha256sum db/migrations/*.sql
```

Expected source sequence: 0001, 0002, 0003, 0004, 0006, 0007. A missing ledger on a populated IS schema needs reconciliation, not blind initialization. Better Auth schema is separate from the IS ledger.

The pinned `auth@1.7.10` CLI was inspected in the local npm cache. `migrate --yes` auto-confirms and executes its plan; it is not a dry run. Its planner reports table/column/index additions, unsafe changes and schema problems. `check schema` uses the explicit schema validator and does not invoke the migration runner. Load the native environment explicitly:

```bash
NODE_ENV=development \
NODE_OPTIONS="--env-file=$PWD/.env.development.local" npm run db:check
```

For plan review, use the pinned library's `getMigrations(auth.options, {throwOnUnsafe:false})`, inspect `toBeCreated`, `toBeAdded`, `toBeAddedIndexes`, `unsafeChanges`, and `schemaProblems`; never call `runMigrations` during inspection. A passing schema check alone does not prove indexes or the IS ledger are current.

Only after all gates pass and changes are approved, use the repository tools in this order (skip either tool if its verified plan has no pending changes):

```bash
NODE_ENV=development \
NODE_OPTIONS="--env-file=$PWD/.env.development.local" npm run db:migrate
NODE_ENV=development \
NODE_OPTIONS="--env-file=$PWD/.env.development.local" npm run db:app:migrate
```

Recheck the exact target immediately before each command. The IS runner locks, verifies the applied prefix/checksums, and commits each migration independently. Better Auth does not share that ledger or transaction. On failure stop and inspect; do not rerun blindly. Keep additive schema and audit data during application rollback. Report exact required grants if a future migration fails on permissions; do not silently grant superuser, CREATEDB or broader runtime privileges.

## Google OAuth and admission

Use a dedicated **Development** Google OAuth web client. Existing credential fields are populated, but their provenance and Google Console configuration are not verified. Configure manually:

| Google setting | Exact value |
| --- | --- |
| Authorized JavaScript origin | `http://localhost:5180` |
| Authorized redirect URI | `http://localhost:5180/api/auth/callback/google` |

Do not modify production clients. This callback is separate from consuming applications' OIDC callbacks. Password authentication and public client registration remain disabled.

The inspected database contains zero users, admitted emails, IS administrators and Nexus operators. Global admission fails closed. `IS_ALLOWED_EMAILS` is a bootstrap input, not a runtime fallback. The existing administrator bootstrap requires an existing identity, so a fresh database needs a separately reviewed initial-admission procedure before an ordinary Google login can create that identity. Do not manufacture users, insert unreviewed admission records, or bypass validation. See [admission management](ADMISSION-MANAGEMENT.md) and [operator setup](NEXUS-OPERATORS.md). IS admins, Nexus operators and tenant admins remain separate authorities.

After development-client ownership and initial admission are resolved, manually test permitted-user sign-in, rejected-user admission, session persistence across reload, logout, ordinary-user Nexus denial and explicit operator access. Inspect cookie attributes without sharing values. No interactive OAuth acceptance is claimed here.

## Validation and reload

Probe `/`, `/sign-in`, `/api/health`, `/api/ready`, `/api/auth/.well-known/openid-configuration`, and its `jwks_uri`. Expected issuer: `http://localhost:5180/api/auth`. Health proves liveness; readiness proves database connectivity, not full schema validity. Anonymous `/nexus`, `/nexus/tenants`, `/admin/nexus/operators` redirect home; privileged APIs return 403.

Next dev watches source files. Server-rendered edits should appear on the next request; client component edits should Fast Refresh in an open browser without restarting. Wait for asynchronous recompilation before checking reverted output. Temporary server and client edits must be restored. Browser state retention and HMR WebSocket behavior require a browser test.

Under Node 24:

```bash
npx next typegen
npm run typecheck
npm test
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:memberships:pg
```

The PostgreSQL suite creates and removes its own temporary synthetic cluster; it never reads `DATABASE_URL` or uses `is_dev`.

Stop the dev process before building: both commands use `.next`. Production builds do not load `.env.development.local` and must not disable TLS. For local compile-only verification use synthetic build-only credentials and an unreachable database, never production settings:

```bash
BETTER_AUTH_URL=http://localhost:5180 \
BETTER_AUTH_SECRET=synthetic-build-only-secret-00000000000000000000 \
GOOGLE_CLIENT_ID=synthetic-build-client \
GOOGLE_CLIENT_SECRET=synthetic-build-secret \
DATABASE_URL=postgres://synthetic:synthetic@127.0.0.1:1/is_build \
IS_DATABASE_SSLMODE=verify-full npm run build
```

Expected schema-validation connection warnings against the unreachable fixture do not verify a live database. Restart native development afterward. Do not source or export the development environment into a production-mode build.

## Optional systemd user service

Do not enable automatically. If desired, save this as `~/.config/systemd/user/is-dev.service` after reviewing it. Use the same Unix account and repository. Next loads the private development file; do not put secrets in the unit.

```ini
[Unit]
Description=IS native development
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/user/src/is
Environment=PATH=/home/user/.nvm/versions/node/v24.22.0/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/user/.nvm/versions/node/v24.22.0/bin/npm run dev -- --hostname 127.0.0.1 --port 5180
Restart=on-failure
RestartSec=3
UMask=0077

[Install]
WantedBy=default.target
```

NVM is a shell function; the unit uses its installed Node 24 binaries explicitly. After stopping any foreground server, manual opt-in commands are `systemctl --user daemon-reload` and `systemctl --user enable --now is-dev`. Use `status`, `restart`, `stop`, or `disable --now is-dev` as needed; inspect `journalctl --user -u is-dev` locally without sharing sensitive logs. User services normally follow login lifetime; lingering is a separate host administration decision and was not enabled.

## Optional legacy Docker

`Dockerfile.dev`, `compose.dev.yml`, and `.env.docker.local` are retained. They use `platform-dev`, `host.docker.internal` mapped to `172.30.0.1`, and host loopback port 5180 mapped to container port 3000. Keep that environment separate from native loopback PostgreSQL settings. Docker commands are performed by the user on the host; do not change socket permissions, groups or daemon configuration. Never delete volumes to troubleshoot. Stop native IS before opting into Docker and stop the Docker IS service before returning to native development.

## Observed native validation — 2026-11-07

Checkout: `chore/local-dev-infra`, `c4b96d3a637fbd540b127afa2a36646a51d20a83`. Existing uncommitted infrastructure changes were preserved.

- Observed local PostgreSQL at `127.0.0.1:5432`, database/role/owner `is_dev`; role has no superuser, CREATEDB, CREATEROLE or BYPASSRLS privileges.
- All six source migration names/checksums match the ledger; zero pending IS migrations. Better Auth plan has no table/column/index additions, unsafe changes or schema problems; explicit schema check passed. All 42 public foreign keys are validated. No migration or grants executed.
- Homepage, sign-in, health, readiness, discovery and JWKS returned 200. Discovery origins match localhost:5180. Anonymous session is null; Nexus pages redirect home and privileged APIs deny with 403. `/nexus/operators` is not a route; operator UI is `/admin/nexus/operators`.
- Route generation, typecheck, seven standard test files and all 26 disposable PostgreSQL tests passed. The production build also passed using synthetic build-only settings; expected Better Auth connection warnings concerned only its unreachable fixture.
- Temporary server edits appeared without restart; temporary client edits reached HTML and compiled JavaScript. All probe edits were restored after asynchronous recompilation. Browser Fast Refresh/state retention remain untested.
- Google credential fields are populated, but dedicated-client ownership, callback registration and interactive login/session/logout/operator acceptance remain unverified. Empty admission/identity/operator tables block permitted-user acceptance until reviewed setup.
