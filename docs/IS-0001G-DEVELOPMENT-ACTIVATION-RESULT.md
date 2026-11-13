# IS#0001-G Development activation result — live acceptance blocked

2026-11-13. Latest read-only database reconciliation: **2026-11-13T07:06:27.419Z**. Development activation and API enablement completed. Combined live tenant acceptance is **incomplete**, blocked by the absent Sandcastle resource-grant/DPoP integration or acceptance harness. No security acceptance pass or M11 cutover readiness is claimed.

## Activation and audit

The user submitted the authenticated operator action exactly once. Request `86492420-0afa-4224-bb64-89d862c3b22d` is `enable`, journal state `complete`, reason `IS#0001-G Development activation and tenant acceptance`, actor the approved retained operator. Native Better Auth client `sutjmkCweZMEZmcSlDeUomcrjfNRourQ` has `disabled:false`; Nexus client generation **4** is enabled. The reviewed workflow advances generation twice: committed deny followed by enable. Activation was not repeated.

The consumer registration matches the reviewed baseline apart from enabled state/update timestamp: Sandcastle application `09eb0b91-50a2-4606-82f9-47d383ab4ade`, Development binding, exact callback `https://5480-deb13.lan.com:5182/api/auth/callback`, inline ES256 public JWKS, private_key_jwt, required PKCE and DPoP, explicit consent, authorization_code/code only, no client secret or client-credentials scope. JWKS SHA-256 is `cfee1c6a84f1422db56d57918afe9bba897d22605696ff8186f1c0e1a56137bf`.

The sole resource is `https://5480-deb13.lan.com:5180/api/nexus/v1`; scopes remain exactly `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read`. Only `sandcastle:tenant.access` is enabled. Binding, operation, resource/link and fixture digests match the pre-activation baseline. No duplicate record, incomplete administration request or unexpected grant/issuance record appeared. Existing OIDC client `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb` full-record digest remains unchanged.

Initial comparison diagnostics used local-time JSON serialization against a UTC baseline, producing false differences across timestamp-bearing records. The corrected UTC read-only snapshot supersedes `/tmp/is-g-activation-stop-readback.json`. Actual differing tables are activation journal/authority/epoch/native-client records and browser session state. No ledger, OIDC or fixture drift was established. All eleven migration names/checksums remain unchanged; no migration ran.

## Local gate and HTTPS readiness

Only `NEXUS_CONSUMER_API_ENABLED=true` was applied in `.env.development.local`; the projection excluding that setting is preserved. Final gates:

| Gate | Final value |
| --- | --- |
| IDENTITY_NEXUS_CREDENTIALS_ENABLED | true |
| NEXUS_MEMBERSHIPS_ENABLED | true |
| NEXUS_OAUTH_ADMIN_ENABLED | true |
| NEXUS_CONSUMER_API_ENABLED | true |

The existing IS CLI was gracefully stopped, then restarted with Node v24.22.0/npm 11.19.1 using the documented `npm run dev`, `NODE_EXTRA_CA_CERTS=/home/user/.local/share/mkcert/rootCA.pem`, certificate `/home/user/certs/is/dev-cert.pem` and key `/home/user/certs/is/dev-key.pem`. No private key contents were accessed. No other application process was restarted.

Trusted HTTPS GET checks pass for homepage, sign-in, health, PostgreSQL readiness, both discovery documents and public JWKS. Issuer is exactly `https://5480-deb13.lan.com:5180/api/auth`; token endpoint and JWKS URI retain the same HTTPS origin. Existing authenticated browser requests to `/nexus/applications` returned 200 in server logs. Anonymous consumer administration remains 403. Full interactive OIDC login/logout was not repeated; preserved registration and page availability alone do not prove that flow.

## Four Consumer API results

| API | Actual live evidence | Positive acceptance |
| --- | --- | --- |
| GET /api/nexus/v1/me/tenants | Anonymous 401 invalid_dpop_proof, no-store | Blocked |
| GET /api/nexus/v1/tenants/{tenantId}/membership | Anonymous 401 invalid_dpop_proof, no-store | Blocked |
| POST /api/nexus/v1/access-decisions | Anonymous with approved Origin/JSON: 401 invalid_dpop_proof, no-store | Blocked |
| GET /api/nexus/v1/tenants/{tenantId}/applications/{applicationId}/entitlements | Anonymous 401 invalid_dpop_proof, no-store | Blocked |

These are no longer feature-gated 404. GET probes with a synthetic invalid Bearer value and forged identity/tenant headers also receive 401. An unauthenticated foreign-Origin decision request receives 401 because credentials are checked first; this does not establish authenticated CSRF denial. No valid Bearer token, real ID token or valid DPoP-bound token was available for credential-class fallback testing. No weaker mode was introduced.

## Fixture and live policy matrix

Tenant A: `9dd71ccf-d9fa-46d5-b3da-82fa907a544d`. Tenant B: `bb46a112-7200-4a52-9272-54cc328dcfce`.

| Identity/policy | Tenant A final stored state | Tenant B final stored state | Live consumer outcome |
| --- | --- | --- | --- |
| Retained owner | owner/active | owner/active | Not tested |
| Test 1 | member/active | member/active | Two-tenant discovery pending |
| Test 2 | member/active | absent | A-only discovery/B denial pending |
| Sandcastle entitlement | enabled | enabled | Effective entitlement/decision pending |
| Tenant lifecycle | active | active | Suspension denial pending |

All five membership rows, two governance rows and two entitlements remain unchanged from the approved baseline; one active administrator remains for each tenant. Original membership audit IDs 1–5 and entitlement audits 8/9 remain intact. No fixture mutation was attempted, so restoration was unnecessary. Inactive-membership, entitlement off/on, suspended-tenant, cross-user/tenant, application mismatch and zero-tenant live tests remain pending. Stored state is not runtime isolation proof.

## OAuth, DPoP, revocation and five-second evidence

Real Authorization Code + S256 PKCE, explicit consent, sole audience validation, signed private_key_jwt verification/expiry/JTI replay, DPoP nonce/key binding/proof replay, positive issuance registry, expired/revoked/wrong-audience tokens, ID-token rejection and five-second decision/consumer execution enforcement are **not live-tested**. No new real token, code, consent, positive decision or revocation was created by this acceptance attempt. No fixture revocation or owner removal occurred.

Read-only inspection of Sandcastle's existing handoff and auth implementation found `app.auth.client_key_preparation` is an offline signing utility disconnected from HTTP/login. Its current OAuth callback uses Basic authentication and requests openid/profile/email; it has no Nexus resource-grant/DPoP acceptance path. The user reports no additional harness is known. The utility's private key was not read/copied/imported into IS; no other repository was modified. Sandcastle must supply the real BFF flow/test context, retain its assertion and DPoP keys, handle native user consent/callback state and emit sanitized evidence. Real user sign-in/consent and supported audited operator fixture/revocation actions will be needed during that coordinated run. No raw cookie/token handoff is required or appropriate.

## Sandcastle session requirements and M11 verdict

Store the selected canonical UUID in trusted server-side session state, bound to the verified user and client. Browser tenant selection is requested context, never authorization. Fully enumerate eligible tenants: zero blocks tenant operations, one may auto-select, multiple require explicit selection. Revalidate online at every protected operation and consequential queue/execution boundary independently of the application session lifetime. Reject mismatched or expired decisions; maximum positive decision validity is five seconds and positive authorization caching is zero. Fail closed when Nexus or credential validation is unavailable. Enforce local Story/Canon/Scene ownership/resource-to-tenant checks and permissions independently.

**M11 verdict: IS Development activation is ready for coordinated integration; end-to-end acceptance and cutover are not ready.** Client and all four gates remain enabled as reported; this is an incomplete acceptance state, not evidence all security checks passed. No tested mandatory security protection failed, so no audited emergency shutdown was triggered. No recovery write or destructive rollback was improvised.

## Local validation and evidence

Node 24 route generation, typecheck and 9 standard test-file runs pass. Disposable PostgreSQL suites pass **58 Identity/administration/consumer checks** and **26 membership/concurrency checks**. The compile-only isolated source copy passes `npm run build -- --webpack` using synthetic credentials and an unreachable synthetic database; no Development environment file was copied. Initial sandbox PostgreSQL/build subprocess attempts failed; the successful host runs supersede them. These isolated checks do not establish live Sandcastle behavior. Generated `next-env.d.ts` was restored to its original Development imports.

Evidence retained locally:

- `/tmp/is-g-activation-preflight-final.json`, `/tmp/is-g-activation-reconciled.json`, `/tmp/is-g-final-readback.json` — guarded read-only baseline, activation and final receipt.
- `/tmp/is-g-gate-change.json` — gate change and preserved configuration projection hash.
- `/tmp/is-g-live-probes.json` — trusted HTTPS live status/request-ID matrix.
- `/tmp/is-g-development-server.log` — native restart/request evidence.
- `/tmp/is-g-typegen.log`, `/tmp/is-g-typecheck.log`, `/tmp/is-g-unit-tests.log`.
- `/tmp/is-g-protocol-tests.log`, `/tmp/is-g-membership-tests.log`, `/tmp/is-g-build.log`.

No production Neon/Vercel/Google configuration change, new migration, other-repository edit, Git add/commit/push/merge or deployment occurred. This run stops at the missing Sandcastle live-flow dependency.
