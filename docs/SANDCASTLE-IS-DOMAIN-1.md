# Sandcastle handoff — `is-domain-admission-1`

IS-DOMAIN#0001, 2026-11-17. Versioned **source implementation**, default off. This is not a deployed endpoint, activated database schema, consumer cutover or permission to remove Sandcastle's selector. [Implemented OpenAPI](openapi/is-domain-v1.openapi.json), [architecture/validation/rollout](IS-DOMAIN-0001.md).

The audited dependency is `/home/user/src/sandcastle/backend/docs/SC_TENANCY_0001_DOMAIN_BOUND_AUDIT.md` (SHA-256 `37bcc4f6d5b06f7d00857fc509da428b5eaadaa3860a6b9294cc4ac921a5578e`). No Sandcastle file or registration was modified. Its requirements for immutable app sessions, trusted ingress, legacy Story ownership and queue/resource authorization remain consumer work.

## Domain resolution and initiation

There is no anonymous hostname→tenant directory and no second domain registry. Nexus extends `nexus_tenant_domains`, whose global hostname primary key defines one DNS routing namespace across applications/environments/ports. Each effective registration has one app, environment, canonical tenant UUID, exact HTTPS origin, proof status and retained monotonic revision.

The initial supported trust profile derives the instance origin from the **exact registered admission `redirect_uri`**. IS first validates that callback against Better Auth's authoritative client redirect list and the existing app/environment linkage. It then resolves that origin in the verified Nexus registry. It does not interpret IS Host, `Forwarded`, `X-Forwarded-*`, browser tenant hints, email or a caller-supplied tenant as authority.

Before opt-in, each tenant instance needs its exact callback under its own canonical public origin in the approved confidential resource client registration; a neutral/shared callback cannot stand in for unrelated frontend domains. Current Sandcastle frontend→shared backend rewrites do not prove a public tenant hostname. Sandcastle must independently validate its trusted ingress, close bypass paths and bind state/callback to its configured current instance origin. Do not forward an arbitrary public Host as proof or create a local hostname→UUID map. A shared neutral instance must keep choice mode or a separately reviewed flow; it cannot silently select a tenant.

The explicit linkage setting `admission_mode=domain` is operator controlled. Existing clients default to `choice`. One client may have multiple exact callbacks only if each origin independently has an approved binding for that same app/environment; state is scoped to the originating BFF instance. Unknown, unverified, suspended, missing or wrong-app/environment mappings deny. Opted-in clients do not fall back when the domain gate/schema is unavailable.

Sandcastle keeps its existing OIDC login and separate human Nexus DPoP resource grant. IS admission still requires an already authenticated native IS session and an existing live resource issuance from the same session, registered client, authoritative person, app/environment and sender key. If native IS login is needed, complete it and restart the bound BFF transaction; automatic login-resume is not added.

Representative navigation (all values except syntax are placeholders):

```http
GET /api/is/v1/admission/authorize?client_id=registered-client&redirect_uri=https%3A%2F%2Ftenant-a.example.com%2Fauth%2Fis-admission%2Fcallback&state=<32+-character-random-state>&nonce=<32+-character-random-nonce>&code_challenge=<S256-challenge>&code_challenge_method=S256 HTTP/1.1
Host: is.example.com
Cookie: <native IS session>
```

IS responds with a transaction URL and secure CSRF cookie. The same authenticated browser's transaction read returns only the fixed eligible tenant:

```json
{
  "transactionId": "10000000-0000-4000-8000-000000000001",
  "version": "1",
  "applicationId": "20000000-0000-4000-8000-000000000001",
  "expiresAt": "2026-11-17T15:00:00.000Z",
  "tenants": [{"tenantId": "30000000-0000-4000-8000-000000000001", "displayName": "Tenant A"}],
  "cursor": null,
  "mode": "domain",
  "domainBinding": {"hostname": "tenant-a.example.com", "origin": "https://tenant-a.example.com", "revision": "7"}
}
```

There is no alternate-tenant pagination for domain mode. IS offers an explicit fixed-target confirmation; `POST .../selection` retains session, exact IS Origin, CSRF and expected transaction version. A different eligible tenant UUID is denied. Domain state is rechecked at start, choices, confirmation and redemption; the displayed context is not cached authority.

## Redemption and receipt

The BFF verifies its own state and redeems the one-use code at the existing endpoint. It must use the exact admission endpoint assertion audience, an ES256 `private_key_jwt` assertion lasting at most 60 seconds, original PKCE verifier, exact callback and fresh ES256 DPoP proof with nonce and **no `ath`**. The sender key must match its associated resource issuance. Existing native token-endpoint assertions cannot be reused with the new audience. Cookie/Origin/Authorization fallback is forbidden at redemption.

```http
POST /api/is/v1/admission/redemptions HTTP/1.1
Host: is.example.com
Content-Type: application/x-www-form-urlencoded
DPoP: <fresh nonce-bound endpoint proof>

client_id=registered-client&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer&client_assertion=<fresh-assertion>&code=<one-use-code>&code_verifier=<original-verifier>&redirect_uri=https%3A%2F%2Ftenant-a.example.com%2Fauth%2Fis-admission%2Fcallback
```

```json
{"admission_context": "<signed-JWT>", "expires_in": 240, "profile": "is-domain-admission-1"}
```

Receipt header is `typ=is-domain-admission+jwt`, `alg=EdDSA` and an existing pinned provider key ID. It retains all IS-ADMISSION-2 claims and adds exactly:

```json
{"domain_binding": {"hostname": "tenant-a.example.com", "origin": "https://tenant-a.example.com", "revision": "7"}}
```

The existing `tenant_id`, `application_id`, `client_id`, environment, issuer/subject, nonce, `cnf.jkt`, admission ID/generation and auth/expiry claims remain required. Code life is at most 60 seconds. Domain receipt life is at most 300 seconds and no later than originating transaction, session or associated human authorization expiry. No new signing key, client secret, scope or machine identity is issued.

Use maintained JOSE and independently pinned issuer/JWKS/algorithm. The IS verification reference supports `verifyAdmissionContext(token, jwks, {...baseExpected, domain: expectedBinding})`; explicitly supplying domain expectation selects this profile. A general receipt cannot be accepted as a domain receipt or vice versa. The BFF must derive expected hostname/origin from its trusted instance configuration and compare the confirmed revision/tenant/app with the original server-held pending flow. Never populate expected identity or origin from an unverified JWT. For a new acquisition, revision/tenant can come from the verified IS transaction/receipt only after independent client/app/origin/person/key checks and online decision validation. Offline signature verification alone never authorizes a resource.

Keep an immutable server-side context containing trusted instance origin, canonical tenant, binding revision, admission reference/receipt, verified subject/client/app/environment, nonce and sender key plus application-session lineage. Use host-only secure cookies as opaque handles, not tenant authority. A visit to another origin or a remap requires a new session context/admission; never mutate the tenant of an existing form, resource or job.

## Continued eligibility: separate strict decision contract

For this profile use `POST /api/nexus/v1/domain-access-decisions`. It accepts the **original associated human Nexus resource token** in DPoP Authorization and a fresh proof with `ath`, required nonce, exact method/URL and maintained shared replay storage. It also requires an allowlisted BFF Origin equal to the independently expected domain origin, the domain receipt, and an operation. No cookie, ID-token, receipt-as-bearer or machine fallback. There is no positive authorization cache.

```http
POST /api/nexus/v1/domain-access-decisions HTTP/1.1
Host: is.example.com
Origin: https://tenant-a.example.com
Authorization: DPoP <associated-human-resource-token>
DPoP: <fresh ath-bound resource proof>
Content-Type: application/json

{"admissionContext":"<domain-receipt>","domainOrigin":"https://tenant-a.example.com","operation":"sandcastle:tenant.use"}
```

No tenant/app/actor ID is accepted in this body. Those come from Identity, immutable receipt lineage and Nexus. The service rechecks, in one bounded snapshot: original positive resource issuance, exact token/person/session/client/app/environment/key; live global admission; receipt digest/expiry/generation; current domain origin/tenant/revision/proof/status; current tenant/membership/app/entitlement and their selected epochs; allowed operation; and durable audit.

```json
{
  "allowed": true,
  "code": "access_allowed",
  "profile": "is-domain-admission-1",
  "decisionId": "40000000-0000-4000-8000-000000000001",
  "admissionId": "50000000-0000-4000-8000-000000000001",
  "caller": {"clientId":"registered-client","applicationId":"20000000-0000-4000-8000-000000000001","environment":"production"},
  "actor": {"kind":"human","issuer":"https://is.example.com/api/auth","subject":"opaque-verified-subject"},
  "tenantId": "30000000-0000-4000-8000-000000000001",
  "domainBinding": {"hostname":"tenant-a.example.com","origin":"https://tenant-a.example.com","revision":"7"},
  "target": {"applicationId":"20000000-0000-4000-8000-000000000001","operation":"sandcastle:tenant.use"},
  "membershipVersion": "4",
  "versions": {"tenant":"1","membership":"4","application":"1","entitlement":"2","consumerGrant":"1"},
  "evaluatedAt": "2026-11-17T14:55:00.000Z",
  "validUntil": "2026-11-17T14:55:05.000Z"
}
```

Versions in this new profile are decimal strings, including membershipVersion. Correlate role checks with this exact version; do not coerce unsafe integers. The existing four Consumer response schemas retain their original numeric/string representations. On protected work, require the exact expected profile, actor/caller, admission ID, origin/revision, tenant/app/operation and deadline, then enforce local resource ownership, tenant association, roles, queues and execution budgets. Reauthorize at consequential side effects/queue dispatch. An earlier snapshot has only its original maximum five-second deadline; no distributed transaction with consumer effects is claimed.

Existing four endpoints remain available for legacy `choice` clients without schema/authentication changes. **Explicitly opted-in `domain` clients receive 403 `domain_admission_required` from legacy `POST /access-decisions`**. This prevents a missing-receipt downgrade; it does not silently convert their resource tokens to domain authority. Read-only membership/entitlement views remain available, but neither is permission to execute tenant work. Sandcastle must adopt the new decision adapter only after separate cutover approval and must not catch an error and retry legacy authorization.

## Remapping, revocation, errors and recovery

Nexus rows are share-locked during binding-sensitive issuance/decisions. A committed remap before locking causes denial/serialization failure; a remap waiting behind an earlier issuance can commit afterward, and fresh decisions then deny that old receipt. No remap can change the tenant of an already persisted admission. Deletion retains a hostname generation tombstone; recreation, suspension/reactivation and A→B→A never restore old evidence. Client admission-mode revision and original linkage ID also fence mode toggles/replacement. Tenant/membership/entitlement restoration cannot revive selected old policy epochs.

Internal owner revocation remains the IS-ADMISSION-2 audited operation and conservatively revokes its associated resource issuance, potentially invalidating sibling admissions. There is no new public admin/revoke endpoint or refresh grant. Client, token, key/session or global admission invalidation fails closed. Persisting a receipt does not promise a separate token's future validity.

| Outcome | Consumer action |
| --- | --- |
| 401 `use_dpop_nonce` | Use returned nonce with a new proof (and new assertion at redemption); never replay proof/JTI |
| 401 invalid token/receipt/proof | Deny work, clear selected admission, obtain fresh reviewed human authorization/admission |
| 403 domain unavailable/access denied or 200 `allowed:false` | Deny; no tenant fallback, discovery auto-selection or remap of existing app state |
| 403 `domain_admission_required` at legacy decision | Contract/profile mismatch; use the separately approved domain adapter, never weaken checks |
| 404 default-off/hidden/unavailable | Feature/cohort/transaction unavailable; no fallback authorization |
| 409 stale binding/selection | Restart acquisition with new state/nonce/PKCE after rechecking current instance; do not reuse code |
| 429 | Bounded retry with fresh credentials/proofs and Retry-After where returned; protected work remains denied |
| 503 dependency/audit/policy/serialization outage | Fail closed and retry a new check/flow as appropriate; no stale allow |

All responses are no-store. Redact codes, assertions, receipts, resource tokens, cookies and DPoP proofs in both applications/proxies. Operational retention and edge abuse controls require deployment review. No consumer resource migration or reassignment is authorized here. Legacy Story ownership cannot become domain isolation merely by replacing a selector; preserve the audit's separate historical-resource policy decision.

## Executable contract evidence and consumer acceptance gate

IS tests: `tests/protocol/domain-admission.mjs` runs inside the existing real pinned OAuth/DPoP + disposable PostgreSQL fixture when `IS_DOMAIN_TESTS=1`, including preserved-record migration/backup restore, authenticated domain acquisition, fixed choice, signature/profile validation, cross-domain/tenant denial, revocation, remapping races and audit rollback. `tests/nexus-domain-policy.test.mjs` covers transport and normalization guards. They do not establish live Sandcastle/browser/proxy acceptance.

Before selector removal in Sandcastle: approve/apply persistent schemas and runtime grants; register/verify exact domains and callbacks; explicitly opt in client mode and gates; prove ingress/current-instance authority and original OIDC/resource/admission identity binding; implement immutable durable app context and the new decision adapter; test two real domain instances, multi-member users, cross-domain replay, remapping/revocation/outage, queues/deadlines and legacy resources; obtain consumer owner sign-off. No Sandcastle change was made by this milestone.
