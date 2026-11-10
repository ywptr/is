# Sandcastle M11 — Nexus human tenant runtime handoff

2026-11-10, implementation profile `1.0.0-stage2d.1`. **Implemented and locally tested; default disabled; not production ready or cleared for Sandcastle cutover.** No Sandcastle repository, persistent database or production OAuth configuration changed. See [Stage 2D report](STAGE-2D-NEXUS-CONSUMER-RUNTIME.md) and [OpenAPI](openapi/nexus-consumer-v1.openapi.json).

## Implemented surface

| Route | Human access scope | Result |
| --- | --- | --- |
| `GET /api/nexus/v1/me/tenants?limit=50&cursor=…` | `nexus:tenants:read` | Eligible self tenants for calling application, canonical UUID/key/name, membership role/status/version, tenant revision, evaluated time, opaque cursor |
| `GET /api/nexus/v1/tenants/{tenantId}/membership` | `nexus:membership:self` | Own effective membership only; hidden/inactive/absent contexts return uniform 404 |
| `POST /api/nexus/v1/access-decisions` | `nexus:access:evaluate` | Uniform 200 deny or audited allow bound to caller/actor/tenant/application/operation and deadline |
| `GET /api/nexus/v1/tenants/{tenantId}/applications/{applicationId}/entitlements` | `nexus:entitlements:read` | Own calling application's effective entitlement only; hidden/disabled/cross-app returns uniform 404 |

No service/agent mode, directory, operator fallback, domain resolver, delegation, token exchange or Story/Canon/Scene resource authorization is implemented. The human decision profile rejects `resource`, `actor`, `userId` and unknown fields; local application permissions remain Sandcastle's responsibility.

## Authentication and registration

Keep current Google/OIDC login, issuer, client IDs and callbacks unchanged. A validated consumer login ID token can establish the approximately 12-hour Sandcastle session; it cannot authenticate these APIs. Obtain a **separate** authorization-code + PKCE S256 resource grant for the exact configured HTTPS Nexus audience, requesting only approved Nexus scopes, no `openid/profile/email/offline_access`. Use fresh state and a DPoP key (`dpop_jkt`); confidential token redemption requires registered `private_key_jwt`, <=60-second assertions and shared assertion replay. Expect no ID token from the resource grant.

The isolated tests use dedicated public-subject clients. The underlying Identity mapping/adapter supports pairwise mappings, but application runtime pairwise introspection is not configured: such issuance fails closed until a separately approved authenticated observer callback is supplied. Never derive user IDs from email or invert pairwise subjects.

Before activation, authorized provisioning must establish all of:

- Exact HTTPS resource with DPoP required, human TTL <=300s and four approved resource scopes. No automatic startup resource seed exists.
- Dedicated environment/client key and exact callback, authorization-code grant only, public registration off. Existing login registrations remain intact.
- Explicit Nexus application/environment/client linkage, Identity binding with scope ceiling, and approved enabled operation rows. Registration alone grants no tenant entitlement or membership.
- Initialized governed tenant, verified active self membership, active application and enabled tenant/application entitlement.
- Reviewed BFF origin allowlist and current Identity lifecycle governance. Native update/delete/rotation paths for bound consumer clients are blocked by the gated integration; internal generation invalidation and separately reviewed maintenance/recovery are required.

Each API request uses `Authorization: DPoP <access-token>` plus a freshly signed `DPoP` proof for the exact external HTTPS method/URL, literal token `ath`, sender key, current server nonce and fresh JTI. No cookie or Bearer fallback; keep OAuth tokens/keys in BFF-controlled state. Query/fragment normalization is handled by the vetted proof verifier; arbitrary forwarded Host/Proto headers never select the resource policy.

An otherwise valid proof lacking a usable nonce receives 401, `WWW-Authenticate: DPoP error="use_dpop_nonce", algs="ES256"` and one `DPoP-Nonce`. Store nonce per resource/key, regenerate proof/JTI, then retry with a bounded retry count. A challenged proof cannot be replayed. Authorization-server nonce challenges are not added; this is the reviewed resource-server profile.

POST requires exact configured HTTPS BFF `Origin`, JSON, <=16 KiB body and bounded body-read time. Missing/null/foreign Origin denies. Browser CORS and browser-carried IS cookies are not supported. All responses are no-store/nosniff and include a server-generated request ID.

## Discovery and active tenant selection

1. Call `/me/tenants`; follow opaque cursors as needed. Each page reauthenticates and reevaluates live visibility. `limit` is 1–100 (default 50). Cursors bind issuer/client/user/application/token/page-size/policy revision, expire by five minutes or token expiry, and are not grants. A policy mutation invalidates old cursors; a 400 means restart discovery, not reuse prior authorization.
2. Zero eligible tenants means no active selection. One eligible tenant may be selected automatically. With multiple eligible tenants, present selection. A first page of one item with a non-null cursor is **not** proof of a single membership.
3. Store selection in tamper-resistant server-controlled Sandcastle session state, preserving canonical Nexus UUIDs. IS adds no global active-tenant preference. A browser tenant ID is a requested selection, never membership proof.
4. Before every protected tenant operation, call a fresh access decision for that UUID, verified application and approved operation. Check returned context and deadline, resource-to-canonical-tenant ownership and local Sandcastle roles. Revalidate selection; clear/reselect on revocation, suspension, generic denial or unavailable dependencies. Do not retain revoked selection as authorization because the application session remains alive.
5. At queue dispatch/execution and every consequential side-effect boundary, revalidate again. Enqueue-time decisions are not long-lived leases. No cross-application token forwarding or tenant-ID renumbering.

## Request/response examples

The identifiers/operation below are illustrative, not a provisioned Sandcastle grant. Real issuer, audience and approved operations must be recorded in the activation review.

```http
POST /api/nexus/v1/access-decisions
Authorization: DPoP <human-resource-access-token>
DPoP: <fresh-proof-with-resource-nonce>
Origin: https://5480-deb13.lan.com:5182
Content-Type: application/json

{"tenantId":"10000000-0000-4000-8000-000000000001","applicationId":"20000000-0000-4000-8000-000000000001","operation":"sandcastle:tenant.use"}
```

```json
{
  "allowed": true,
  "code": "access_allowed",
  "decisionId": "30000000-0000-4000-8000-000000000001",
  "caller": {"clientId":"registered-sandcastle-client","applicationId":"20000000-0000-4000-8000-000000000001","environment":"development"},
  "actor": {"kind":"human","issuer":"https://is.example/api/auth","subject":"verified-access-subject"},
  "tenantId": "10000000-0000-4000-8000-000000000001",
  "target": {"applicationId":"20000000-0000-4000-8000-000000000001","operation":"sandcastle:tenant.use"},
  "membershipVersion": 4,
  "versions": {"tenant":"2","application":"1","entitlement":"3","consumerGrant":"2"},
  "evaluatedAt": "2026-11-10T10:00:00.000Z",
  "validUntil": "2026-11-10T10:00:05.000Z"
}
```

All inaccessible tenant/membership/entitlement/operation cases on this decision route use:

```json
{"allowed":false,"code":"access_denied","decisionId":"30000000-0000-4000-8000-000000000002"}
```

Discovery items have shape:

```json
{"tenant":{"id":"10000000-0000-4000-8000-000000000001","key":"example-tenant","name":"Example tenant","status":"active","version":"2"},"membership":{"role":"member","status":"active","version":4}}
```

An effective entitlement response has only tenant/application IDs, `enabled:true`, `effective:true`, opaque decimal-string `version` and `evaluatedAt`. It contains no Billing or other applications' state. These snapshots and revisions are advisory evidence, not authorization credentials or local resource roles.

## Revocation and failures

No positive authorization cache is permitted in Nexus or Sandcastle. Identity token/client/session/security state and Nexus policy are read together in one bounded database snapshot, with audit durable before allow. Decision evaluation is bounded by two seconds; `validUntil` is no later than snapshot+5s, token expiry or resource nonce expiry. The transport refuses a positive result already expired before delivery. Sandcastle must reject late/mismatched responses and enforce the deadline at actual execution, including local queues.

New snapshots after committed membership/entitlement revocation deny. A snapshot already in flight may allow only within its original deadline; Nexus cannot undo committed Sandcastle side effects. The application session may remain valid for 12 hours, but tenant authorization does not. Never use stale allow, operator routes or an old local policy as an outage fallback.

401 means credential/proof failure (including registry revocation); 403 means missing scope or invalid mutation origin; 404 means hidden/not-effective lookup; decisions return uniform 200 false for inaccessible tenant policy. A globally disabled calling application can make Identity binding ineligible and produce 401 before target lookup. 400 rejects malformed fields/cursors. 413 rejects oversized bodies; 429 is a persistent caller budget with Retry-After. 503 means dependency, audit, timeout, serialization or readiness unavailable, never permission to use a cached allow.

## Activation and compatibility gates

`NEXUS_CONSUMER_API_ENABLED` defaults false (404). Enabling it alone is insufficient: `NEXUS_MEMBERSHIPS_ENABLED=true`, explicitly configured `IDENTITY_NEXUS_CREDENTIALS_ENABLED=true`, canonical HTTPS `BETTER_AUTH_URL`, exact `NEXUS_CONSUMER_RESOURCE`, approved `NEXUS_CONSUMER_ENVIRONMENT` and comma-separated exact `NEXUS_CONSUMER_TRUSTED_ORIGINS` are required. Missing schema/bindings/keys/grants fail closed. No configuration was enabled by this work.

Reconcile and separately approve migrations 0008 (Identity), 0009 (Nexus runtime) and 0010 (Identity code barrier) against the exact ledger/branches/backups before any persistent application. Real development HTTPS, canonical issuer consistency, Google browser login, consent/code resume, callbacks, private-key registration/read-back, proxy URL/challenge propagation, actual Node deployment and independent Sandcastle execution/deadline tests are pending. Native HTTP development is not an acceptance substitute.

The pre-release OpenAPI profile is versioned, not a production compatibility promise. Tenant UUIDs and user identities remain unchanged; no consumer PK/FK rewriting. Four human routes are implemented; other draft OpenAPI routes remain deferred. Breaking changes require explicit profile/version review before consumer adoption. No active-selection setting or resource role is centralized in IS.

Local evidence: real pinned provider, PostgreSQL and HTTP-handler transport exercise discovery, membership, entitlement, operation policy, private-key issuance, code-generation invalidation, wrong credentials, nonce/replay, audit failure, concurrent revocation and expiry. Stage 1 and Identity suites remain separate regression evidence. Production deployment, persistent migration, TLS/browser and real Sandcastle cutover are **not** established by those tests.


## IS#0001 acceptance update — 2026-11-10

**Implemented: yes. Automated/disposable acceptance: passed. Locally activated: no. Sandcastle cutover-ready: no. Production-ready: no.** Full evidence and unexecuted guarded migration commands are in [IS#0001 acceptance preparation](IS-0001-NEXUS-CONSUMER-ACCEPTANCE.md).

The user confirmed the exact Sandcastle Development callback **`https://5480-deb13.lan.com:5182/api/auth/callback`** and therefore BFF origin **`https://5480-deb13.lan.com:5182`**. This is configuration input, not provisioning authorization. A certificate-verified handshake to that Sandcastle host on 5182 returned `ECONNREFUSED` at inspection; the confirmed URL is not yet live service acceptance. The intended preserved IS issuer is `https://5480-deb13.lan.com:5180/api/auth` and the required audience is `https://5480-deb13.lan.com:5180/api/nexus/v1`. Client/application IDs and owner public JWKS remain unassigned/unprovided; approved M11 operation names and consent/incident workflow still require review. Do not reuse the legacy secret-based OIDC registration script for the dedicated private-key resource client.

Fresh live read-only verification found six exact historical ledger entries (0001–0004, 0006, 0007); 0008–0010 are pending, and 0008 matches the Identity checkpoint. There are no local OAuth clients/resources, applications, tenants, entitlements or memberships. All three gates are unset/off. All four real consumer routes return no-store gated 404s; readiness/sign-in/discovery/JWKS respond 200 and privileged anonymous APIs deny with 403. Anonymous session is null; authenticated cookie/browser acceptance remains untested.

TLS on 5180 fails with `ERR_SSL_WRONG_VERSION_NUMBER`. Discovery advertises an HTTPS issuer but HTTP authorization/token/JWKS endpoints; this is an activation blocker, not permission to weaken issuer/HTTPS validation. No server restart, proxy/CA configuration, Google client change, credential provisioning, persistent migration or feature activation occurred. Existing HTTP development remains untouched.

The exact migration runner passed synthetic populated/fresh/non-superuser and backup/restore rehearsal, preserving all old row hashes; that is not a real is_dev backup/restore acceptance. Security suites pass (34 consumer/Identity, 31 compatibility, 26 membership PostgreSQL), as do 63 standard tests after a test-only timestamp-fixture correction, typecheck, route generation and isolated production build. No protected live decision or real Sandcastle executor/queue was exercised.

Git prerequisite is also unresolved: the inspected branch still points to Identity checkpoint `f8941c3`; Stage 2D is uncommitted and the tree is not clean. Checkpoint/review it before any persistent approval. After separate backup/migration, HTTPS, dedicated OAuth/binding/operation provisioning, governance and activation approvals, run the actual browser/consent/DPoP/nonce/revocation/membership/entitlement/cross-tenant/dependency acceptance matrix. Preserve local resource roles, canonical UUIDs and the five-second decision budget throughout.
