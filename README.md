# IS — Identity Service and Nexus Control Plane

IS is the shared identity and tenant control plane for trusted applications. It is deployed as a **modular monolith**: the identity provider and the internal **Nexus** module run in one Next.js/Vercel application against an IS-owned Neon PostgreSQL database. Module boundaries remain explicit so Nexus can be extracted later if independent deployment becomes beneficial.

**Implementation reference IS host:** `https://sandcastle-auth.vercel.app`

**Current state (October 2026):** Google sign-in and IS sessions work; database-backed global email admission, Nexus operator administration, an application and tenant catalog, entitlement administration, tenant domain mappings, and operator-controlled OAuth client provisioning have been implemented and exercised incrementally. **A full cross-application OIDC callback/token/session integration has been tested.** See [Client application integration](#client-application-integration-required) for the contract and limitations.

## Ownership and trust boundaries

| Owner | Responsibilities |
| --- | --- |
| IS Identity | Global identity, Google-backed authentication, IS sessions, OIDC authorization and token issuance, global admission policy |
| Nexus module (inside IS) | Trusted application registry, tenant registry, tenant domains, operator privileges, tenant application entitlements; future memberships and tenant-specific admission |
| Consuming applications | Their own application sessions, authorization of resources/actions, safe tenant context handling, user-facing data and application-specific roles |

Authentication **does not** grant Nexus operator authority, tenant membership, application access, or resource privileges. An IS administrator is not automatically a Nexus operator. A Nexus operator does not automatically gain access to a tenant's application data.

The Nexus module has its own table and service ownership even though it shares the IS deployment and database. Consumers must integrate through published interfaces, not database queries.

## Stack and repository conventions

- Next.js / TypeScript, Better Auth `1.7.10` with OAuth Provider, Vercel, Neon PostgreSQL (`pg`).
- `npm run db:migrate` manages Better Auth tables; `npm run db:app:migrate` applies versioned, checksum-verified SQL from `db/migrations/` for IS/Nexus-owned tables.
- Deploy schema changes deliberately and verify the intended Neon project/branch before deploying code that depends on them.
- Administrative pages are within the IS deployment. Nexus operator access is checked server-side against `nexus_operators`.
- OAuth clients are created through the privileged Better Auth administrative API. Public/unauthenticated client registration is disabled.

## Client application integration (required)

This section is the handoff contract for Sandcastle, IG V4, and any subsequent trusted client. **Do not treat an OAuth client registration as proof that the consuming application is integrated.** Each client must implement and verify the steps below.

### 1. Provision a trusted application in IS/Nexus

An authorized Nexus operator must:

1. Register the application in **Nexus → Applications**, using a stable application key (for example `sandcastle` or `ig`).
2. Provision a **separate OAuth client for each environment** (development, staging, production), providing its exact callback URI(s).
3. Record the returned `client_id` and securely transfer the **one-time** `client_secret` to the application's server-side secret store. Do not log, email, commit, or expose the secret in a frontend bundle.
4. Register the relevant tenant in **Nexus → Tenants**, and configure its hostname mapping(s), status, and application entitlement as applicable.
5. Treat the Nexus application UUID and the OAuth client ID as **different identifiers**. OAuth registration authenticates the client; a Nexus entitlement determines whether a tenant is allowed to use the application.

Currently supported provisioning defaults are **confidential server-side clients**, **Authorization Code**, **PKCE required**, `client_secret_basic`, and scopes `openid profile email`. Trusted first-party clients may skip the OAuth consent page. IS does not offer self-service/public dynamic client registration. Browser-only/native public clients are not yet a supported provisioning target.

**Current first client registration:** Sandcastle development has the intended redirect URI `https://sandcastle-api.vercel.app/api/auth/callback` (the callback **must exist in Sandcastle**; registration does not create it). The IS domain `sandcastle-auth.vercel.app` is the issuer host, **not** Sandcastle's callback host.

### 2. Discover IS's OIDC endpoints

Use the discovery document rather than hard-coding endpoint paths:

`https://sandcastle-auth.vercel.app/api/auth/.well-known/openid-configuration`

Read the literal `issuer`, `authorization_endpoint`, `token_endpoint`, and `jwks_uri` values from the returned document. **Do not assume the issuer is the bare hostname**; it can contain the `/api/auth` path. Pin the expected issuer for the target IS environment and reject an unexpected issuer. Use HTTPS in deployed environments.

Other smoke endpoints:

- `GET /api/health`: process liveness; does **not** prove database readiness.
- `GET /api/ready`: checks IS PostgreSQL connectivity; does **not** prove every schema table or feature is configured.
- `GET /api/auth/jwks`: public signing keys (prefer `jwks_uri` from discovery).

### 3. Implement OIDC Authorization Code + PKCE

The **consuming application** must implement the complete flow:

1. Provide a login action that redirects the full browser to IS's discovery-advertised authorization endpoint, using its own registered `client_id`, callback URI, `response_type=code`, `scope=openid profile email`, and `code_challenge_method=S256`.
2. Generate cryptographically unpredictable, per-attempt `state`, `nonce`, and a PKCE `code_verifier`; retain them in a short-lived server-side login transaction or an equivalent secure, tamper-resistant mechanism. Bind the transaction to the initiating browser; never log these values.
3. On the exact registered HTTPS callback route, validate `state` and login-transaction freshness; reject absent, changed, expired, or replayed states, and handle OAuth error responses.
4. Exchange the **single-use** authorization code at the discovered token endpoint from the application backend, using its server-held secret (`client_secret_basic` as provisioned), the original `code_verifier`, and the exact same `redirect_uri`.
5. Validate the ID token with a suitable vetted OIDC library: signature/JWKS, `iss`, `aud` (client ID), expiration, nonce, and other applicable OIDC checks. Handle key rotation. Do not treat email, a request query parameter, or an unverified JWT payload as authenticated identity.
6. Use **`(issuer, sub)`** as the durable identity link to IS. Treat email as mutable contact data, not the authoritative key. Only rely on `email_verified` when present and true for features that need verified email.
7. Create an **application-owned session** with secure, HttpOnly cookies and appropriate SameSite/CSRF controls. Never expose the client secret, refresh token, or server session credentials to browser JavaScript.
8. On logout, clear the application's own session. Federated logout/back-channel logout and cross-application session termination require separate implementation and tests; do not assume signing out of IS terminates every consumer's session.

Where existing application users are being migrated (IG V4), preserve their historical local user records and data, and link them to verified IS subjects. **Do not silently link accounts based on matching email alone.** Google-linked account migrations should verify the upstream Google subject or use another explicit, secure account-linking procedure.

### 4. Tenant IDs, domains, and membership

- The **canonical Nexus tenant ID** is the existing `nexus_tenants.id` UUID (36-character text representation), compatible in format with IG's historical `tenants.tenant_id` (`String(36)`). When importing an existing IG tenant, **preserve its existing tenant ID** where valid and collision-free; plan and rehearse a mapping for conflicts before cutover.
- `tenant_key` (Nexus) / `slug` (IG) is a human-readable stable key, not the immutable ID.
- A tenant can have multiple hostname mappings, with a designated primary hostname. This follows IG's `tenant_domains(hostname, tenant_id, is_primary)` convention. **A recorded hostname is not yet evidence of domain ownership**; domain verification is future work.
- Domain hints and browser-provided `tenant_id` values must **not** independently authorize access. Resolve tenant context with a trusted server-side mapping and check the authenticated user's membership and the application's entitlement.
- Tenant-scoped admission policy (`invitation_only`, `public_registration`, `closed`) is currently **configuration data**, not a fully implemented public enrollment workflow. Do not enable self-registration based solely on that column.
- **Centralized Nexus tenant membership and a secure consumer-facing tenant/entitlement resolution API are planned, not yet released.** Until those APIs are available, a consuming application must preserve its existing safe membership/authorization enforcement and must not read the IS Neon database directly.
- IS's existing **global email permit list** is currently checked during Google login. Planned global allowlist enforcement toggles, global block lists, and tenant-specific admission will change the admission contract in a later release. Tenant policy must never override a global security block.

### 5. Application entitlements and authorization

An OAuth client being valid is **not** enough to enter a tenant. Effective access will require all relevant conditions: trusted authenticated user, active tenant, authorized membership, active application, and an enabled tenant–application entitlement, with additional application-specific roles and limits checked in the consuming app.

**Current implementation:** Operators can maintain `nexus_entitlements(tenant_id, application_id, enabled)` in the IS UI. The existing `/api/nexus/registry/entitlements` endpoint is an **operator-admin API**, not a client-application authorization service. Do not call it from Sandcastle or IG as if it were a tenant access decision. A versioned, authenticated consumer API with explicit audience/scopes, tenant access checking, and fail-closed behavior remains a planned milestone.

Applications must **not** assume that disabling a Nexus catalog application already revokes its Better Auth OAuth client or existing consumer sessions; coordinated disable, credential rotation, token/session invalidation, and lifecycle controls remain under development.

### 6. Required client-side configuration

The following names illustrate the data needed; each application's implementation may choose its own environment-variable names:

```dotenv
IS_OIDC_ISSUER=<exact issuer from IS discovery>
IS_OIDC_CLIENT_ID=<registered client ID for this environment>
IS_OIDC_CLIENT_SECRET=<server-side secret; never public>
IS_OIDC_REDIRECT_URI=https://sandcastle-api.vercel.app/api/auth/callback
```

Use separate credentials per environment and exact redirect URI matches. Keep PKCE verifiers/nonce/state per login request, **not** in shared deployment environment variables. Configure HTTPS, trusted proxy/cookie handling, and signing/encryption secrets for application sessions.

### 7. Client application acceptance checklist

- [ ] Client registration is active in the intended IS environment with the exact callback URI and correct scopes.
- [ ] OAuth flow uses `state`, `nonce`, and PKCE S256; altered/replayed state and reused authorization codes are rejected.
- [ ] Callback exchanges the code on the backend; ID token signature, issuer, audience, expiration, and nonce are validated.
- [ ] Existing local user identity mapping is safe; `(iss, sub)` is durable and email matching alone does not create links.
- [ ] Application maintains its own session and has a tested logout path.
- [ ] Unauthenticated users and users lacking application/tenant authorization cannot access protected resources.
- [ ] Tenant context cannot be forged through hostname, query string, or client-supplied tenant ID.
- [ ] Secrets do not appear in Git, response logs, browser JS, or client-side storage.
- [ ] Client handles IS errors, login cancellation, expiry, and outages without bypassing access controls.
- [ ] Cross-application logout, entitlement changes, and tenant membership propagation are explicitly labeled **not implemented** until their respective integration tests pass.

## Current IS operator administration

The server-rendered IS UI exposes functions according to current database-backed roles:

- `/admin/admissions`: IS administrators manage the current **global** email permit list.
- `/nexus`: Nexus operator landing page.
- `/admin/nexus/operators`: Nexus operators grant/revoke operator access for existing IS users; the database protects the final operator.
- `/nexus/applications`: operator-managed application catalog and OAuth provisioning.
- `/nexus/tenants`: tenant registry and tenant domain mapping.
- `/nexus/entitlements`: operator-managed application entitlements per tenant.

These administration endpoints require authenticated operator sessions and are **not** public client-service APIs. Operator authority does not imply authorization to view tenant business data.

## Setup and deployment

Requirements: Node.js 22+ (Node 24 tested in development), isolated IS Neon PostgreSQL, a Google OAuth web client, Vercel environment variables.

```bash
npm install
npm run typecheck
npm test
npm run build
```

Set `BETTER_AUTH_URL` to the canonical IS origin, `BETTER_AUTH_SECRET` to a high-entropy server-side secret, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the Google OAuth web client's credentials, and `DATABASE_URL` to the dedicated IS database. The Google callback for this provider is:

`https://sandcastle-auth.vercel.app/api/auth/callback/google`

**This Google callback is different from a consuming application's OIDC callback.** The Google OAuth client ID/secret belong to IS; the client ID/secret provisioned via Nexus belong to Sandcastle/IG.

Initialize the Better Auth schema, then the IS-owned SQL migrations, before deploying features that depend on the new tables:

```bash
npm run db:migrate
npm run db:app:migrate
```

Bootstrap the first IS administrator and the first Nexus operator using the controlled scripts and their documented environment variables. Do not expose bootstrap or migration operations as public HTTP endpoints.

For the Debian development host `5480-deb13`, Node's automatic IPv4/IPv6 connection racing caused Neon TCP timeouts. The verified local workaround is:

```bash
NODE_OPTIONS="--no-network-family-autoselection --dns-result-order=ipv4first" npm run db:app:migrate
```

For PostgreSQL TLS use **`sslmode=verify-full`**, preserving CA and hostname verification. If Neon/Vercel manages a URL containing `sslmode=require`, use the repository's verified URL normalization helper across both the runtime pool and standalone maintenance scripts. Never use `rejectUnauthorized: false` or suppress TLS errors. Do not print connection URLs or credentials to logs.

Verify schema versions in `is_schema_migrations`. Vercel previews should ideally use a separate Neon branch; apply the migrations to the **same** database branch that the preview deployment uses. Avoid automatically migrating production from unreviewed preview builds.

## Security and operational constraints

- Global admission is not tenant membership. Removing an email currently prevents subsequent Google logins, **not** existing IS or application sessions.
- Nexus operators are explicit and separate from IS administrators. The final authorized Nexus operator cannot be removed.
- Client secrets are confidential and displayed once; a client ID is not a secret.
- Registration of external applications is administrator-controlled. Public/unauthenticated OAuth dynamic registration stays disabled.
- Never expose a database-backed operator-management or tenant-registry route to a client application as an authorization shortcut.
- Versioned migrations and admin actions should be audited; verify privilege checks on every privileged endpoint and write operation.
- The identity service's OIDC issuer must remain stable during module reorganization and future Nexus extraction.

## Backlog — planned, not yet available as consumer contracts

**Identity/security:** Global Admission Management enforcement toggle; permanent global block list; global user directory; user suspension; session inspection/revocation; security audit UI; cross-application logout; safe identity linking and recovery.

**Nexus:** Tenant membership and tenant-admin lifecycle; tenant-specific invitation/permit policies and public registration; domain ownership verification; authenticated consumer-side membership/entitlement resolution APIs; OAuth client disable/revoke/secret rotation and coordinated application disable; robust concurrent client provisioning; finer-grained entitlements/limits; optional two-person approvals for sensitive operations.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — may still describe the earlier separate-service model; align with this README before relying on it for future design work.
- [MVP acceptance](docs/MVP-ACCEPTANCE.md) — historical initial acceptance checks, not a substitute for the client integration checklist above.
- [Better Auth OAuth Provider](https://www.better-auth.com/docs/plugins/oauth-provider)
- [Better Auth PostgreSQL adapter](https://www.better-auth.com/docs/adapters/postgresql)
