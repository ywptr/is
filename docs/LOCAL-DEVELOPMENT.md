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
| IS UI and API bind | `0.0.0.0:5180` (single native Next process) |
| Browser-visible Better Auth origin | `https://5480-deb13.lan.com:5180` |
| PostgreSQL | `127.0.0.1:5432` |
| Database / role | `is_dev` / `is_dev` |
| Port 8010 | Unused |

Check `ss -ltnp '( sport = :5180 )'` before starting. If another process owns the port, identify it; do not kill it automatically. Docker and native IS cannot both publish port 5180.

## Private environment

Use ignored `.env.development.local` (mode 600), which Next automatically loads for development. It is deliberately separate from production builds and `.env.docker.local`. Do not put native database credentials in `.env.production*`, tracked files or Vercel. Do not print environment files, connection URLs, cookies or tokens.

Required values:

```dotenv
BETTER_AUTH_URL=https://5480-deb13.lan.com:5180
BETTER_AUTH_SECRET=<private local high-entropy secret>
DATABASE_URL=postgres://is_dev:<URL-encoded-local-password>@127.0.0.1:5432/is_dev
IS_DATABASE_SSLMODE=disable
GOOGLE_CLIENT_ID=<dedicated development web client ID>
GOOGLE_CLIENT_SECRET=<corresponding development secret>
```

These are placeholders, not a usable environment file. Existing private credentials were preserved when preparing native configuration; only the Docker database hostname was replaced with `127.0.0.1`. No secrets were rotated. `NEXUS_MEMBERSHIPS_ENABLED`, `IDENTITY_NEXUS_CREDENTIALS_ENABLED` and `NEXUS_CONSUMER_API_ENABLED` remain unset/off. HTTPS does not authorize their activation.

`disable` is only for this verified host-local development target. Production defaults to `verify-full`; the connection helper rejects disabled TLS in production. Keep production Neon certificate and hostname verification intact. Shell variables override environment files: check for stale exported settings without printing their values. CLI tools do not automatically load `.env.development.local`; explicitly load it as shown below. Avoid conflicting `.env`, `.env.local`, or `.env.development` values.

## Start, stop and restart

Use the existing suite mkcert CA with an IS-specific leaf. Certificate: `/home/user/certs/is/dev-cert.pem`; private key: `/home/user/certs/is/dev-key.pem`. The key is mode 0600, the directory 0700, and both are outside Git. The current leaf covers `5480-deb13.lan.com`, `localhost`, `192.168.0.99` and `127.0.0.1`; it expires 2029-02-10. The CA is `/home/user/.local/share/mkcert/rootCA.pem`; do not modify system trust or other suite certificates to restart IS.

```bash
export NODE_EXTRA_CA_CERTS=/home/user/.local/share/mkcert/rootCA.pem
npm run dev
```

`npm run dev` pins the native bind/port and both existing IS certificate paths in `package.json`. Bare `next dev --experimental-https` generates a localhost certificate and must not be used for this canonical origin. Missing configured certificate/key files must be repaired explicitly; do not remove their flags to fall back to automatic generation. The production `build` and `start` scripts are unchanged.

Next loads `.env.development.local`. Ctrl+C gracefully stops a foreground process. Identify the owner of any existing listener before restarting it; never start a second Next instance on another port. Restart with the same command after environment or certificate changes. Do not use `next start` for Fast Refresh. No reverse proxy or separate backend is needed. The Next development HTTPS flag is experimental; it is supported by the pinned CLI and is not a production serving recommendation.

For renewal, inspect expiration first (`openssl x509 -in /home/user/certs/is/dev-cert.pem -noout -dates`). Under `umask 077`, use `mkcert -cert-file /home/user/certs/is/dev-cert.next.pem -key-file /home/user/certs/is/dev-key.next.pem 5480-deb13.lan.com localhost 192.168.0.99 127.0.0.1` under the same CA. Verify with `openssl verify -CAfile /home/user/.local/share/mkcert/rootCA.pem -verify_hostname 5480-deb13.lan.com /home/user/certs/is/dev-cert.next.pem`, protect the new key with `chmod 600`, then stop Next, replace both IS leaf files together and restart. Keep any temporary old key private and remove it through the owner's approved retention process. Do not regenerate/install a CA, overwrite another app's files or commit keys. A CA change requires separate trust review.

### Windows and other clients

Windows must resolve `5480-deb13.lan.com` to the Debian LAN address `192.168.0.99`, and its browser must trust the existing mkcert CA. Verify `Resolve-DnsName 5480-deb13.lan.com` and `Test-NetConnection 5480-deb13.lan.com -Port 5180`. If necessary, an administrator can add `192.168.0.99 5480-deb13.lan.com` to Windows hosts. Import only the public root certificate after verifying its X.509 SHA-256 fingerprint:

```text
D9:8B:61:DE:C3:FE:22:61:FD:5A:4C:C4:DF:6F:86:3E:C4:B0:F4:E4:53:06:9A:D1:D8:E6:C0:19:ED:58:D6:D6
```

Never copy `rootCA-key.pem`. Windows browser/root-store trust is a manual prerequisite, not established by Linux tests. Open the canonical HTTPS hostname, not an IP or localhost alias, for authentication. Debian currently resolves this hostname to 127.0.1.1; the all-interface IS listener supports that and LAN clients. Sandcastle binds only the LAN address; Linux probes of it may need `curl --resolve 5480-deb13.lan.com:5182:192.168.0.99` while retaining the canonical URL.

Node clients can use `NODE_EXTRA_CA_CERTS` at process startup; other runtimes/containers need their own verified trust and resolution. Do not use insecure curl/browser flags, disable Node certificate verification or use `verify=False`.

### Origin, cookies and troubleshooting

`next.config.ts` already allows `5480-deb13.lan.com` and `192.168.0.99` for dev assets/HMR. It is not an OAuth callback or CSRF allowlist. Better Auth takes its explicit HTTPS base URL; admin mutations require that exact Origin including port. Secure, HttpOnly, SameSite=Lax, host-only cookies and distinct app cookie names are retained. Cookies are not isolated by port. The HTTP-to-HTTPS transition may require a fresh login because secure cookie prefixes differ. Do not copy cookies or weaken CSRF/SameSite settings.

Direct TLS avoids a proxy URL rewrite. Do not add blanket forwarded-host/proto trust. If discovery advertises HTTP URLs, check development environment precedence and stale exported `BETTER_AUTH_URL`, then restart the owning process. If TLS fails, verify the certificate hostname, dates and trusted CA; do not bypass validation. For HMR failures, check the browser's trusted `wss://` connection, canonical hostname and Next logs. For EADDRINUSE, inspect port 5180 and stop its verified owner gracefully. Ports 5181/5182 belong to IG/Sandcastle and 5183 is reserved for Axtor; leave them unchanged.

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

Expected source sequence: 0001, 0002, 0003, 0004, 0006, 0007, 0008, 0009, 0010, 0011. The separately authorized 2026-11-10 batch applied 0008–0010; approved IS#0001-E execution applied 0011 on 2026-11-11. All ten exact ledger checksums and preserved old-table row digests pass; [0011 acceptance](IS-0001E-MIGRATION-0011-ACCEPTANCE.md). No revision is pending. HTTPS setup alone does not authorize future migrations. See the guarded acceptance procedure in [IS#0001](IS-0001-NEXUS-CONSUMER-ACCEPTANCE.md). A missing ledger on a populated IS schema needs reconciliation, not blind initialization. Better Auth schema is separate from the IS ledger.

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
| Authorized JavaScript origin | `https://5480-deb13.lan.com:5180` |
| Authorized redirect URI | `https://5480-deb13.lan.com:5180/api/auth/callback/google` |

Do not modify production clients. This callback is separate from consuming applications' OIDC callbacks. Password authentication and public client registration remain disabled.

The original November 7 database inspection below was empty; the later IS#0001 audit records an existing identity/session/admin/operator. Do not use historical aggregate counts as current authentication evidence. Global admission fails closed. `IS_ALLOWED_EMAILS` is a bootstrap input, not a runtime fallback. The existing administrator bootstrap requires an existing identity, so a fresh database needs a separately reviewed initial-admission procedure before an ordinary Google login can create that identity. Do not manufacture users, insert unreviewed admission records, or bypass validation. See [admission management](ADMISSION-MANAGEMENT.md) and [operator setup](NEXUS-OPERATORS.md). IS admins, Nexus operators and tenant admins remain separate authorities.

After development-client ownership and initial admission are resolved, manually test permitted-user sign-in, rejected-user admission, session persistence across reload, logout, ordinary-user Nexus denial and explicit operator access. Inspect cookie attributes without sharing values. No interactive OAuth acceptance is claimed here.

## Validation and reload

Probe `/`, `/sign-in`, `/api/health`, `/api/ready`, `/api/auth/.well-known/openid-configuration`, and its `jwks_uri`. Expected issuer: `https://5480-deb13.lan.com:5180/api/auth`. Health proves liveness; readiness proves database connectivity, not full schema validity. Anonymous `/nexus`, `/nexus/tenants`, `/admin/nexus/operators` redirect home; privileged APIs return 403.

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
BETTER_AUTH_URL=https://5480-deb13.lan.com:5180 \
BETTER_AUTH_SECRET=synthetic-build-only-secret-00000000000000000000 \
GOOGLE_CLIENT_ID=synthetic-build-client \
GOOGLE_CLIENT_SECRET=synthetic-build-secret \
DATABASE_URL=postgres://synthetic:synthetic@127.0.0.1:1/is_build \
IS_DATABASE_SSLMODE=verify-full npm run build
```

Expected schema-validation connection warnings against the unreachable fixture do not verify a live database. Restart native development afterward. Do not source or export the development environment into a production-mode build.

## Verified HTTPS activation — 2026-11-10

The authorized local HTTPS change is complete. A separate IS leaf was generated under the existing CA, only local `BETTER_AUTH_URL` changed, and the prior Next listener was gracefully stopped before its HTTPS replacement started on `0.0.0.0:5180`. No system CA/trust store, other suite certificate/process, OAuth registration, persistent migration or consumer gate changed. HTTPS was restored after the production build and remains running. `next.config.ts`, Identity policy code and application source are unchanged; temporary reload probes were restored byte-for-byte.

| Check | Result |
| --- | --- |
| Homepage, sign-in, health, ready | 200 over system-trusted HTTPS |
| OIDC and OAuth authorization-server discovery | 200; exact issuer `https://5480-deb13.lan.com:5180/api/auth`; all advertised protocol endpoints and JWKS use the same HTTPS origin |
| JWKS | 200, one public key; no private material exposed |
| LAN transport | TLS 1.3 to `192.168.0.99:5180`, hostname verified as `5480-deb13.lan.com` |
| Leaf chain / hostname | OpenSSL, Linux system trust and Linux Chromium pass; expires 2029-02-10 |
| Google initiation | Actual sign-in button reaches Google authorization navigation with the exact HTTPS callback; navigation intercepted before external login |
| Cookie | `__Secure-better-auth.state`, Secure, HttpOnly, SameSite=Lax, host-only; values never printed |
| Reload | Trusted browser WSS connection; visible client edit/revert with no navigation and retained window state; server component edit/revert without restarting Next |
| Origin / forwarded headers | Cookie-bearing foreign-Origin auth request and foreign-Origin privileged mutation return 403; forged forwarded host/proto cannot change discovery URLs |
| Anonymous privileges | Nexus operator/registry APIs 403; Nexus page redirects home; consumer gate remains 404 |
| Suite isolation | Only IS port 5180 restarted; existing 5181/5182 and 8011–8013 listeners preserved; no added application port |
| Node 24 checks | Route generation, typecheck, eight standard test-file entries, 26 membership PG, 31 Identity compatibility, 34 Identity/consumer lifecycle checks and production build PASS |

The production build used synthetic build-only credentials and an unreachable fixture database. Disposable PG suites used their own synthetic clusters. Initial sandbox runs could not complete; final PG/build results above are the successful host runs. An initial compatibility invocation omitted required `IS_MEMBERSHIP_PG_BIN`; the corrected invocation passed. No persistent migration/bootstrap tooling ran.

Pinned provider behavior: a cookie-less non-browser `sign-in/social` initiation can return success even with a foreign Origin; its common origin middleware checks cookie-bearing requests, and callback-URL validation remains separate. The cookie-bearing negative probe denies. This review did not change provider policy or claim universal rejection of every cookie-less request. Privileged Nexus writes retain their independent exact-Origin and authorization checks.

Windows DNS/browser trust, Google Development client ownership/registered redirect, and full interactive Google callback/session/logout acceptance remain unverified. No external login was attempted or Google Console change performed. If absent, the client owner must manually add the exact HTTPS callback above to the dedicated Development web client, preserving production registrations. Local 0008–0010 migration and backup/restore acceptance subsequently passed; consumer activation remains blocked by dedicated provisioning and lifecycle/browser acceptance in [IS#0001](IS-0001-NEXUS-CONSUMER-ACCEPTANCE.md). HTTPS readiness is not consumer runtime acceptance.

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
Environment=NODE_EXTRA_CA_CERTS=/home/user/.local/share/mkcert/rootCA.pem
ExecStart=/home/user/.nvm/versions/node/v24.22.0/bin/npm run dev
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
- Google credential fields are populated, but dedicated-client ownership, callback registration and interactive login/session/logout/operator acceptance remain unverified. Current admission and external Google configuration must be confirmed before interactive acceptance.
