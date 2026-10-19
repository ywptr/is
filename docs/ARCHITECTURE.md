# IS architectural contract — locked for MVP

## Responsibilities

- IS: global person identity, external provider account links, authentication, hosted login, OIDC, sessions.
- Nexus: canonical tenant IDs, tenant lifecycle, subscription and application entitlements.
- IG, Sandcastle, other applications: user-to-tenant membership, application roles, resource permissions, application sessions.
- Axtor: agentic runtime action authorization.

IS MUST NOT maintain an authoritative tenant membership table. Authentication does not grant access to an application, a tenant, or its resources.

## Human login

1. A client creates a transaction-specific `state`, `nonce`, and S256 PKCE verifier/challenge.
2. Client redirects browser to the discovered IS authorization endpoint with `scope=openid profile email` and its preregistered `redirect_uri`.
3. IS offers Google login at `/sign-in` and records a session on the IS origin.
4. After successful consent or first-party skip-consent, IS sends an authorization code to the client's registered callback.
5. Client validates `state`, exchanges code over the backend channel, validates ID token against discovery/JWKS (`iss`, `aud`, `exp`, `nonce`, `sub`, signature), and creates its own application session.
6. Client independently resolves an IS subject to its local user and verifies tenant membership before permitting access.

IS session cookie stays on the IS origin. Apps SHOULD use server-side sessions with httpOnly Secure cookies. Do not share IS cookies between app subdomains.

## IG V3 -> V4 MVP

- Preserve existing `users.user_id`, `tenants.tenant_id`, `tenant_domains`, and all foreign keys.
- IG adds `identity_links(legacy_user_id, is_subject)` with uniqueness constraints.
- For Google-linked V3 users, use the **verified Google subject**, not the email, for migration linking.
- Password-only users need a separate proof-of-ownership / credential transition; Google-only IS does not silently support them.
- Preserve V3 sessions and legacy sign-in behind an explicit migration feature flag until rollback tests pass.
- Do not modify live V3 in the IS scaffold phase.

## Sandcastle

- A new IS user may authenticate but is not automatically a Sandcastle tenant member.
- Sandcastle owns its memberships and tenant selection.
- Sandcastle-to-IG calls require an independent service authorization contract; a human ID token is NOT a general-purpose IG API access token.

## Provider onboarding

- Only Google is enabled in IS MVP; future Microsoft/enterprise providers link securely to the same stable IS `sub`.
- Only explicitly allowlisted verified Google emails are admitted for MVP.
- No public OAuth client registration or user-created OAuth clients.
- Operator creates first-party clients through privileged, server-side registration. Never expose `adminCreateOAuthClient` as a public route.
- For MVP clients, require Authorization Code + PKCE S256 and exact redirect URI matching.
