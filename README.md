# IS — Identity Service (MVP scaffold)

IS is a small **identity broker** for IG V4, Sandcastle, and Nexus.

- Hosted `/sign-in` page and full-browser redirect (not a popup).
- Google-backed login, with a controlled allowlist.
- Better Auth OAuth 2.1 Provider, OpenID Connect, PKCE, JWKS, and OIDC discovery.
- Separate IS sessions and per-application sessions.
- No IS tenant-membership or entitlements database.

**Status:** repository-ready bootstrap; not yet deployed or tested against Neon/Google. The archive does not contain `node_modules` or a validated lockfile. Dependency installation, typecheck, endpoint integration tests, and client provisioning MUST be completed on a network-enabled development host before deployment.

## Architecture

```
IG V4  ──┐
Nexus  ──┼──> IS OIDC login ──> Google
Sandcastle┘            │
                       └── IS Neon (users, external accounts, sessions, oauth clients)

IG/Nexus/Sandcastle each authorize their OWN tenant membership and application sessions.
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local setup

Requires Node.js 22+, PostgreSQL (Neon recommended), and a Google OAuth web client.

```bash
cp .env.example .env.local
npm install
npm run typecheck
npm test
```

Set `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Set `DATABASE_URL` to an **isolated IS Neon database**.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and comma-separated `IS_ALLOWED_EMAILS`.

In Google Cloud Console, add the authorization callback:

```
http://localhost:3000/api/auth/callback/google
```

Run the database schema migration after checking the target database:

```bash
# Better Auth built-in PostgreSQL adapter (Kysely internally)
npm run db:migrate
npm run dev
```

This MVP uses Better Auth's native PostgreSQL adapter instead of layering Drizzle on an otherwise empty custom schema. Add Drizzle when IS owns non-authentication relational data; do not generate Better Auth and Drizzle migrations independently for the same tables.

## Smoke endpoints

- `GET /api/health` — liveness (does not check DB)
- `GET /api/ready` — readiness (executes `SELECT 1` in IS Neon)
- `GET /api/auth/.well-known/openid-configuration` — OIDC discovery
- `GET /api/auth/.well-known/oauth-authorization-server` — OAuth authorization server metadata
- `GET /api/auth/jwks` — public signing keys
- `/sign-in` — central hosted Google login UI
- `/consent` — untrusted-client consent page (first-party clients bypass by operator configuration)

Note: default issuer is under `/api/auth`. Consume the literal `issuer` value from OIDC discovery; do not assume it is the origin without a path.

## Configure first client

For IG V4, Nexus, and Sandcastle, register **separate** OAuth clients with exact callback URIs. Use a different client for staging versus production.

An operator-only CLI command is provided as an initial integration point:

```bash
IS_CLIENT_NAME='IG V4 development' \
IS_CLIENT_REDIRECT_URI='http://localhost:8000/auth/is/callback' \
IS_CLIENT_SECRET_FILE='/tmp/is-ig-v4-dev-client.json' \
npm run client:register
```

This command calls the privileged server-side `adminCreateOAuthClient` API. It has NOT yet been executed against a live database. Validate its session/privilege behavior against the pinned Better Auth version; do not expose a public registration route. Set `IS_CLIENT_SECRET_FILE` to a non-existing path outside the repository. The CLI writes the one-time secret there with file mode 0600; move it to your secret manager and securely delete the local file. Never log it to CI or source control. For V1 use confidential server-side clients with authorization code + PKCE.

## Vercel deployment

1. Create a private IS GitHub repository (suggestion: `ywptr/is`) and import this scaffold.
2. Create a separate Vercel project. Set the permanent canonical domain (e.g. `auth.your-domain.example`).
3. Provision an isolated Neon DB and store all secrets in Vercel environment variables.
4. Update `BETTER_AUTH_URL` and Google's authorized redirect URI to the canonical HTTPS host.
5. Apply schema migrations against intended Neon branch via a controlled release step **before** first production traffic.
6. Deploy, verify OIDC issuer/JWKS/PKCE sign-in, and test an IG V4 client.
7. Never point IS's `DATABASE_URL` at the existing IG production database.

Use a separate Vercel preview + Neon branch for initial exercise. Avoid dynamic issuer hosts: PKCE and OIDC callbacks depend on stable exact origins and redirect URIs.

## Operational/security notes

- Admission allowlist applies at Google sign-in. If an already-authenticated user must be disabled, revoke their IS sessions and remove consuming-app access; removing an email from the allowlist alone does NOT immediately revoke active sessions.
- Account linking is not implicit on matching email; use an authenticated explicit linking flow in a future phase.
- Do not embed tenant IDs, roles or membership claims in the IS ID token.
- `skip_consent` is appropriate ONLY for operator-managed trusted first-party clients.
- Pin matching Better Auth plugin/core versions and audit changes before upgrading.
- See [docs/MVP-ACCEPTANCE.md](docs/MVP-ACCEPTANCE.md) for release gates and IG/Sandcastle tests.

## Useful docs

- https://www.better-auth.com/docs/plugins/oauth-provider
- https://www.better-auth.com/docs/installation
- https://www.better-auth.com/docs/adapters/postgresql
- https://www.better-auth.com/docs/concepts/users-accounts
