# Sandcastle M11 — Nexus human tenant runtime handoff

**IS#0001-F.3 migration accepted — 2026-11-12:** approved 0012 committed to local `is_dev`: eleven exact ledger entries, 46 preserved original data projections, 55 validated FKs and unchanged governance/OIDC records. Purpose-specific slots and consumer schema readiness are available. Fresh 58 Identity/admin/consumer, 31 compatibility, 26 membership and 69 standard tests pass. Consumer/membership gates remain off; Sandcastle application remains disabled and existing service/UI still block provisioning under a disabled application. No Consumer client was provisioned or activated. [Execution, checks and remaining policy/provisioning boundary](IS-0001F3-MIGRATION-0012-ACCEPTANCE.md). Prior F.2 snapshots below are historical for migration state.

**IS#0001-F.2 unified administration — 2026-11-12:** OIDC Clients remain fully supported. Preserve Sandcastle OIDC client `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb` and its existing Development association. A distinct Nexus Consumer API client will coexist using explicit purpose classification; no privileges are inherited. Candidate migration 0012 and new consumer provisioning require separate approval. The consumer form stays read-only until schema approval/application and Sandcastle application eligibility are resolved. Service Clients remain planned only. See [implementation, validation and exact controlled provisioning steps](UNIFIED-OAUTH-ADMINISTRATION.md) and [Sandcastle→IG architecture requirements](SANDCASTLE-IG-SERVICE-AUTHORIZATION-ADDENDUM.md). This supersedes the earlier quarantine/replacement proposal; do not disable or replace the OIDC client.

**IS#0001-F.1 local atomicity proof — 2026-11-11:** Native registration now joins a real provider transaction; a pinned compatibility bridge disables and verifies the new client on that same transaction adapter before commit. Independent PostgreSQL connections, hook-free native OAuth rejection and failure/audit/idempotency probes pass. Nexus eligibility is also checked at native authorization and pre-signing token issuance. [Implementation, boundaries and validation evidence](IS-0001F1-ATOMIC-PROVISIONING.md). This resolves F's implementation blocker locally; persistent provisioning, configuration/gates and live acceptance remain separately unapproved. No real Sandcastle client/resource/key/grant was created.

**Historical IS#0001-F provisioning stop — 2026-11-11:** Fresh preflight confirms ten matching ledger entries, no existing OAuth/application/binding records, validated public ES256 JWKS and healthy canonical discovery. **The current provision action must not be executed under F's stricter condition:** pinned Better Auth 1.7.10 has no disabled-at-create input; current IS creates then disables in separate calls. That does not guarantee a disabled first visible client. No provisioning/configuration/gate change occurred. [Controlled plan and proposed atomic native-transaction alternative](IS-0001F-CONTROLLED-PROVISIONING-PLAN.md) require implementation/rehearsal review before persistent approval. Earlier final-disabled tests and E's accepted profile do not establish this stronger guarantee.

**Current IS#0001-E local migration acceptance — 2026-11-11:** The owner-approved 0011-only command succeeded at clean checkpoint `c9157a9`. The local database now has ten exact ledger entries, 46 public tables and 55 validated FKs; all old records and governance are preserved. Canonical HTTPS and all 172 automated regression tests pass. All four gates remain off and no OAuth resource/client/application/public-key/operation registration occurred. [Execution and acceptance evidence](IS-0001E-MIGRATION-0011-ACCEPTANCE.md). M11 protected live acceptance and provisioning remain pending. Earlier C/E preparation snapshots below are historical for ledger/approval state.

**IS#0001-C, 2026-11-11: implemented and automatically validated; no protected live acceptance or cutover clearance.** The actual local database has the exact nine-entry ledger through 0010; candidate 0011 is pending separate approval. A new private pre-0011 backup passed real isolated restore/digest verification for all 45 tables. OAuth resources/clients, Nexus applications/bindings and tenant fixtures are still absent. All four gates remain off. See [current acceptance evidence](IS-0001C-DEVELOPMENT-ACCEPTANCE.md) and [exact approval commands/key procedure](IS-0001C-APPROVAL-COMMANDS.md).

**IS#0001-D HTTPS recovery, 2026-11-11:** Canonical TLS is restored using the existing dedicated IS certificate/key. Bare startup had omitted their paths and automatically selected a localhost certificate; `npm run dev` now pins the canonical pair and `0.0.0.0:5180`. System-trusted hostname/LAN TLS, browser WSS/Fast Refresh, server reload, discovery and gate-off responses pass. No certificate/CA regeneration, schema/credential/grant/gate change or consumer activation occurred. [Recovery evidence and startup command](IS-0001D-HTTPS-RECOVERY.md). Full fresh Google and protected consumer acceptance remain pending.

**IS#0001-E public-key reconciliation, 2026-11-11:** Sandcastle's requested public handoff now supplies one ES256/P-256 signing JWKS, kid `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`. JOSE, the IS public-key/provision parsers and pinned Better Auth inline-registration body schema accept it; no private Sandcastle file was read or copied and no record/key was created. Both live discovery documents confirm token endpoint `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. Final single Nexus audience is explicitly `https://5480-deb13.lan.com:5180/api/nexus/v1`, distinct from issuer/callback. Exact initial operation remains `sandcastle:tenant.access`, canonical eligibility only. [Public JWKS](oauth/sandcastle-development.public.jwks.json), [reviewed profile/sequence](IS-0001E-SANDCASTLE-PROVISIONING-READINESS.md) and [guarded 0011 approval command](IS-0001E-MIGRATION-0011-APPROVAL.md). Migration 0011 subsequently passed local acceptance; registration and activation remain pending.

Profile `1.0.0-stage2d.1` remains pre-release. Distinguish the implemented contract below from live accepted behavior: authenticated issuance, DPoP, revocation, memberships/entitlements and five-second execution acceptance are still pending after separately approved dependencies and activation. Production remains unapproved.

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

The identifiers below are illustrative, not registered UUIDs/client IDs. The operation is the owner-proposed initial eligibility policy, not a persisted grant. Issuer/resource must match the Development profile below; actual returned IDs remain pending; the supplied public JWKS is validated but unregistered.

```http
POST /api/nexus/v1/access-decisions
Authorization: DPoP <human-resource-access-token>
DPoP: <fresh-proof-with-resource-nonce>
Origin: https://5480-deb13.lan.com:5182
Content-Type: application/json

{"tenantId":"10000000-0000-4000-8000-000000000001","applicationId":"20000000-0000-4000-8000-000000000001","operation":"sandcastle:tenant.access"}
```

```json
{
  "allowed": true,
  "code": "access_allowed",
  "decisionId": "30000000-0000-4000-8000-000000000001",
  "caller": {"clientId":"registered-sandcastle-client","applicationId":"20000000-0000-4000-8000-000000000001","environment":"development"},
  "actor": {"kind":"human","issuer":"https://5480-deb13.lan.com:5180/api/auth","subject":"verified-access-subject"},
  "tenantId": "10000000-0000-4000-8000-000000000001",
  "target": {"applicationId":"20000000-0000-4000-8000-000000000001","operation":"sandcastle:tenant.access"},
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

Approved E execution and read-only acceptance confirm all ten exact ledger entries through 0011 (Identity administration journal). No migration is pending; do not rerun the old batch or the pre-0011 guard. The verified pre-0011 private backup/restore and preservation checks are recorded in the acceptance report. IS#0001-D recovered canonical TLS. Actual resource/client registration/read-back, browser consent/resume, private-key/DPoP/nonce and lifecycle acceptance, controlled activation and independent Sandcastle execution/deadline tests remain pending. Native HTTP or localhost-only diagnostics do not substitute for the canonical resource origin.

The pre-release OpenAPI profile is versioned, not a production compatibility promise. Tenant UUIDs and user identities remain unchanged; no consumer PK/FK rewriting. Four human routes are implemented; other draft OpenAPI routes remain deferred. Breaking changes require explicit profile/version review before consumer adoption. No active-selection setting or resource role is centralized in IS.

Local evidence: real pinned provider, PostgreSQL and HTTP-handler transport exercise discovery, membership, entitlement, operation policy, private-key issuance, code-generation invalidation, wrong credentials, nonce/replay, audit failure, concurrent revocation and expiry. Stage 1 and Identity suites remain separate regression evidence. Production deployment, persistent migration, TLS/browser and real Sandcastle cutover are **not** established by those tests.


## Exact Development integration plan — pending provisioning

| Field | Value |
| --- | --- |
| IS origin / issuer | `https://5480-deb13.lan.com:5180` / `https://5480-deb13.lan.com:5180/api/auth` |
| Resource / sole access audience | `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| Callback / BFF Origin | `https://5480-deb13.lan.com:5182/api/auth/callback` / `https://5480-deb13.lan.com:5182` |
| Human grant / client authentication | Authorization Code + PKCE S256; `private_key_jwt`, registered inline ES256 public JWKS; assertions ≤60s |
| Required resource scopes | `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| Resource tokens | Native EdDSA `at+jwt`, ≤300s, required DPoP; separate assertion and DPoP sender keys |
| Consent / subject | Explicit native consent; proposed public access subject mapped by verified issuance to stable local IS user |
| Application / environment | `sandcastle`, returned canonical UUID; unique `development` binding; client initially disabled |
| Proposed initial operation | `sandcastle:tenant.access` — canonical eligibility, never local resource roles |
| Current IDs / public JWKS | IDs unassigned; supplied public JWKS validated in E, registration unapproved; do not reuse production registrations |
| Discovered token endpoint / assertion aud | `https://5480-deb13.lan.com:5180/api/auth/oauth2/token` |
| Public assertion kid | `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I` |

Supported schemas are in [OpenAPI](openapi/nexus-consumer-v1.openapi.json); only the four human routes listed above are implemented. Other draft routes/grants are deferred. Better Auth owns credentials, keys and exact redirects; Nexus owns application/environment association and tenant eligibility. The privileged operator endpoint `/api/nexus/registry/applications/oauth/consumer` is for server-backed administration only and never a Sandcastle runtime authorization API. Resource creation requires an additional explicit resource-action context; IS administrator/tenant administrator alone is insufficient. No public dynamic registration exists.

Current Sandcastle production OIDC login remains separate. A twelve-hour application session never extends a five-second Nexus authorization decision. Obtain fresh scoped resource authorization as needed; do not convert its ID token into an API credential or automatically equate production/development users by email. Cross-issuer linkage needs separately approved stable-subject proof. Pairwise resource issuance remains fail-closed until its reviewed runtime composition exists; public mapping is the proposed initial profile.

For supported resource JWT incidents, operator token revocation or client/session/user/key generation invalidation is checked online. Client re-enable permits fresh authorization only; old tokens and codes do not revive, including pending consent. Native originating IS session deletion/expiry/logout also denies new Nexus checks. Operator session-epoch invalidation is not browser-session deletion; user invalidation is not global suspension. Native OAuth revocation success alone is not the positive issuance-registry revocation procedure. Sandcastle must revalidate tenant selection on every protected operation and consequential queue/side-effect boundary, reject mismatched/late responses, preserve canonical resource-to-tenant ownership checks and enforce its own local roles.

After approved 0011/provisioning/activation, the live matrix must cover zero/one/multiple memberships, inactive/suspended contexts, entitlements, invalid selections, cross-user/tenant and app mismatch, expired/revoked credentials, dependency/audit failures, maintenance denial and the maximum five-second decision budget. No positive cache or stale/outage allow is permitted. No fixture memberships/entitlements or live outage/revocation tests are pre-authorized by this handoff.

## Accepted evidence and release prerequisites

Fresh C evidence: 4 disposable migration/backup/privilege tests, 44 Identity/administration/consumer protocol tests, 26 membership PG tests, 31 provider compatibility tests, 67 unit/route tests, route generation, typecheck and isolated production build pass. A real read-only `is_dev` backup restored into an isolated ordinary-role database with all 45 table digests matching. No protected live tenant decision, live issuance/revocation or Sandcastle executor/queue behavior was tested. Gates remain off. IS#0001-D subsequently restored canonical TLS; protected live acceptance remains pending. This supersedes earlier pending-0008–0010 and dirty-Stage-2D checkpoint notes, not the requirement for actual live acceptance.

Production prerequisites remain: reviewed deployable checkpoint, exact Neon/Vercel target/ledger/runtime grants and rollback/recovery, independent credential ownership, production HTTPS/discovery/Google/OIDC callbacks, approved public keys/scopes/resource/application/environment/operation/tenant entitlements, same-issuer stable mappings or separately proven cross-issuer links, full browser/protocol/lifecycle/four-route acceptance and independently approved Sandcastle integration/cutover. No production change, consumer repository edit, deployment, push or merge is authorized. **Sandcastle M11 is not cutover-ready.**
