# IS#0001-G — Development activation and live OAuth/DPoP acceptance plan

**Fixture-preparation update (latest authorization):** the user has approved fixture preparation and the local membership gate after explicitly identifying two ordinary Google users: Test 1 `ITxWjHwzTslC5BlkdjmaAGpl5pKRcgNP` (both tenants), Test 2 `ua6p2rmNq2X8QGBqBbTwfF629pgKJ4r9` (Tenant A only), with `KHchS8YFpyes9w19jZMffcclD4ToX92h` explicitly retained as owner of both. Existing user-created tenants A `9dd71ccf-d9fa-46d5-b3da-82fa907a544d` / `test01` and B `bb46a112-7200-4a52-9272-54cc328dcfce` / `test02` and both enabled Sandcastle entitlements are reused, not recreated. The earlier proposed names/one-member staging sequence below are superseded by this two-user matrix. Membership gate is now enabled locally under that authorization; both owner bootstraps and all three member additions are complete and authoritatively reconciled. Consumer client activation, Consumer API enablement, token issuance and live revocation tests remain unapproved. See [current fixture preparation status](IS-0001G-FIXTURE-PREPARATION.md).

2026-11-12. **Prepared only; no G activation, gate, fixture, entitlement, credential-issuance or revocation write is authorized/executed by this document.** F.4's distinct human consumer registration is reconciled and remains disabled. The actions below require separate, explicit approval. Production, service authorization, new migrations, assertion-key rotation, consumer repository edits and Git/deployment actions remain excluded.

## Fixed registration and starting state

| Item | Authoritative value |
| --- | --- |
| Target | Direct local `127.0.0.1:5432/is_dev`, eleven exact ledger/source checksums through 0012 |
| IS origin / issuer | `https://5480-deb13.lan.com:5180` / `https://5480-deb13.lan.com:5180/api/auth` |
| Authorization / token | `/api/auth/oauth2/authorize` / `https://5480-deb13.lan.com:5180/api/auth/oauth2/token` |
| Consumer client | **`sutjmkCweZMEZmcSlDeUomcrjfNRourQ`**, native `disabled:true`, no secret |
| Provisioning request | `c5124bef-233b-46d6-8ec6-d8333e89ed8c`, complete; matching native metadata and operator ownership |
| Application | `09eb0b91-50a2-4606-82f9-47d383ab4ade`, `sandcastle`, active |
| Association | `2e562305-b1a1-4971-9720-5d8dc11a75d1`, `development`, purpose `nexus_consumer` |
| Resource / sole audience | `https://5480-deb13.lan.com:5180/api/nexus/v1`, EdDSA access JWT, maximum 300 seconds, DPoP required |
| Callback / BFF Origin | `https://5480-deb13.lan.com:5182/api/auth/callback` / `https://5480-deb13.lan.com:5182` |
| Assertion public kid | `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`, EC P-256 / ES256 |
| Native human profile | Authorization Code / code, PKCE S256, private_key_jwt assertions ≤60s, DPoP, public subject, explicit consent |
| Exact scope ceiling | `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| Operation ceiling | Only `sandcastle:tenant.access` |
| Staged policy | Binding and operation rows configured enabled; native client disabled and client epoch generation 2 disabled prevent issuance/use |
| Preserved OIDC client | `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb`; native record and OIDC association unchanged |

The resource is policy-enabled, not HTTP-activated. Local `NEXUS_OAUTH_ADMIN_ENABLED` and `IDENTITY_NEXUS_CREDENTIALS_ENABLED` remain true from prior approval; `NEXUS_MEMBERSHIPS_ENABLED` and `NEXUS_CONSUMER_API_ENABLED` remain off. There are no tenants, memberships or entitlements and no retained access/refresh tokens, consent rows, consumer codes or Identity access issuances. No duplicate consumer or orphan exists.

## Approved identities and existing fixtures

The latest user authorization explicitly identifies two ordinary Development Google users and a retained owner distinct from both. All three exist, have verified emails and Google links, and satisfy the current exact global admission allowlist. No fabricated user/session, email-domain tenant assignment or identity linking is involved.

| Symbol | Stable IS user ID | Fixture role |
| --- | --- | --- |
| `U_owner` | `KHchS8YFpyes9w19jZMffcclD4ToX92h` | Existing IS administrator/Nexus operator, explicitly approved active owner of both tenants |
| `U_1` | `ITxWjHwzTslC5BlkdjmaAGpl5pKRcgNP` | Ordinary member of A and B; no operator or IS-admin authority |
| `U_2` | `ua6p2rmNq2X8QGBqBbTwfF629pgKJ4r9` | Ordinary member of A only; no operator or IS-admin authority |

The same retained owner for both was explicitly confirmed by the user. Tenant ownership is a separate assignment, not an automatic consequence of operator status. Keep this owner active while revoking/restoring either ordinary member. Never remove/deactivate the last administrator or revoke the sole operator's session as a test.

Reuse the two tenants and Sandcastle entitlements already created by the user; do not create the earlier proposed duplicate catalog keys:

| Symbol | Actual canonical UUID | Key/name | Preserved state |
| --- | --- | --- | --- |
| `T_primary` / A | `9dd71ccf-d9fa-46d5-b3da-82fa907a544d` | test01 / Sandcastle Test 01 | active, closed |
| `T_secondary` / B | `bb46a112-7200-4a52-9272-54cc328dcfce` | test02 / Sandcastle Test 02 | active, invitation_only |

Both Sandcastle entitlements are enabled (registry audit 8/9); creation audits are 6/7. Both supported owner bootstraps are verified with active administrator count 1 (membership audits 1/2). Current fixture-member completion is tracked in [fixture preparation](IS-0001G-FIXTURE-PREPARATION.md); the intended matrix is `U_1` member/active in both, `U_2` member/active in A only. No IG/Axtor/service/resource-role grant is involved.

This yields initial discovery coverage of two tenants for `U_1`, one for `U_2`, and real B denial for `U_2` even with B's application entitlement enabled. Zero discovery will be a later explicitly approved temporary `U_2` A-membership deactivation and audited restoration. Do not create a new identity, delete owner rows or change global roles to force that case.

## Fixture authority and separately approved future actions

All mutation APIs below are existing session-backed management interfaces on canonical IS origin 5180, exact Origin and JSON, with actual current operator authority; use the signed-in browser, never copied cookies or database session credentials. Retain generated request IDs/UUIDs and receipts. Stop on conflict, drift, partial state or unexpected audit result; no automatic retries/repairs.

1. **Membership gate only — now authorized and enabled for fixture preparation:** set `NEXUS_MEMBERSHIPS_ENABLED=true` in isolated local `.env.development.local`. Keep consumer API off and consumer client disabled. Preserve other approved settings/TLS startup and private environment values. Allow only the necessary Development reload/restart, if required. This gate is required by the supported membership UI/bootstrap routes; no direct database bootstrap workaround.
2. **Tenant catalog fixtures — existing, do not recreate:** A and B above were user-created and audited (6/7). Preserve their server-generated UUIDs, names, active status and policies; no duplicate POST is needed.
3. **Bootstrap first owners — completed through the supported UI:** `U_owner` was assigned to A and B with reason `IS#0001-G retained Development fixture owner`. Membership audits 1/2 and governance counts 1 each were read back. No role override, direct SQL or repeat bootstrap.
4. **Entitlements — already enabled, do not rewrite:** exactly A/Sandcastle and B/Sandcastle are enabled with registry audits 8/9. No unrelated application entitlement is changed. B may be temporarily disabled/restored only during a later separately approved live test.
5. **Enable only the registered consumer client:** existing consumer administration endpoint `POST /api/nexus/registry/applications/oauth/consumer`, `{"action":"enable","environment":"development","requestId":"<retained new UUID>","reason":"IS#0001-G approved Development consumer activation","clientId":"sutjmkCweZMEZmcSlDeUomcrjfNRourQ"}`. UI Applications → Nexus Consumer API Clients → collapsed Consumer lifecycle administration; select Enable consumer client, this exact ID, approved reason and the action-approval checkbox. Never choose the OIDC client. Read back complete journal, native `disabled:false`, enabled client epoch with monotonically advanced generation, unchanged key/profile/binding/scope/operation and preserved OIDC row. A failed enable can leave a native enabled record but a denied epoch; stop/reconcile rather than retry.
6. **Authorize live test-human OAuth consent/code/token issuance** from Sandcastle's BFF under the exact profile and existing key custody, including bounded failed-code/assertion/proof tests. These create native consent/verification/replay records and positive Identity issuance/subject/code evidence on success. Client enablement alone must not be taken as implicit approval for arbitrary users, flows or credential classes. Verify token issuance first while consumer HTTP routes remain off.
7. **Consumer API gate last:** set `NEXUS_CONSUMER_API_ENABLED=true` only in this same local Development environment. Keep exact resource/environment/trusted Origin and all production gates unchanged. Verify authentication/proof and scope denial before any positive tenant decision. This is a local environment gate, not a new per-client global privilege; the exact existing registration/binding/epochs/fixture policy still authorize each call.
8. **Initial ordinary memberships — authorized fixture preparation only:** use existing member-add UI/API to add `U_1` as member/active to A and B, and `U_2` as member/active to A only; reason `IS#0001-G approved Development test membership`. This is three explicit adds, not invitations, account creation or administrator grants. Read back five total rows including the two retained owners. Later approved deactivation/reactivation uses `PATCH /api/nexus/registry/tenants/{T}/memberships/{userId}` with exact `role:member`, approved `status`, a fresh `expectedVersion` and recorded reason. No owner/admin demotion, deletion, stale-version override or later revocation is authorized by initial setup permission.
9. **Authorize fixture-only negative/recovery mutations:** secondary (B) Sandcastle entitlement off/on; fixture tenant suspend/reactivate; ordinary test member inactive/active; consumer client disable/re-enable; one selected positive-registry token revoke; test-human IS sign-out and fresh sign-in. Each gets a retained management request/receipt and reason where supported. These are separate persistent test mutations and need explicit inclusion in the approval, not incidental permission to edit arbitrary policy. Keep the owner/operator identity/session and OIDC registration untouched. Do not rotate keys, invalidate the only user/operator, stop shared PostgreSQL, revoke native signing keys or alter audit tables/privileges to force an outage.
10. **Approve an explicit final disposition for the bounded live window.** Proposed default: disable this consumer client through the audited action; switch consumer API off, disable only the two fixture entitlements, deactivate only `U_test` memberships, suspend the two fixtures, then switch membership administration off. Preserve the owner/admin rows, fixtures, journals and audits. Keep Identity/admin prerequisites and existing OIDC/application configuration intact. Any decision to leave consumer client/gates/fixtures enabled for ongoing Sandcastle Development work needs explicit approval instead; it must not happen silently.

Review the exact approved `U_1`/`U_2`, existing fixture UUIDs and initial state before dependent actions; no symbolic placeholder is an execution identifier. Current F.3/F.4 guard helpers intentionally require gates off and cannot be reused unchanged as G-phase checks after approved gate transitions; prepare phase-specific exact-target/read-only assertions before that execution, without loosening production isolation.

## Gate and credential sequence

| Stage | Membership gate | Consumer API gate | Consumer client | Intended evidence |
| --- | --- | --- | --- | --- |
| Current / disabled baseline | off | off | disabled + denied epoch | Authoritative profile, no duplicates; key custodian can prove disabled authorization/token rejection without IS reading its private key |
| Fixture governance | on | off | disabled | Two preserved canonical tenants, distinct retained owner, explicit entitlements and the approved two-user matrix |
| Approved OAuth protocol window | on | off | explicitly enabled + eligible epoch | Real private_key_jwt/PKCE/consent/DPoP issuance and positive registry; API remains 404 |
| Online authorization window | on | on | enabled | Zero/one/multiple discovery, all four routes, negative/lifecycle/decision-deadline acceptance |
| Default bounded-window close | off after management finishes | off first | disabled | Audited quarantine of test credentials, fixture-only access removed, preserved data/audit history |

Previously approved `NEXUS_OAUTH_ADMIN_ENABLED=true`, `IDENTITY_NEXUS_CREDENTIALS_ENABLED=true`, `NEXUS_CONSUMER_ENVIRONMENT=development`, sole resource audience and trusted Origin `https://5480-deb13.lan.com:5182` remain fixed throughout. No new resource, scope ceiling, application operation, service grant, OAuth client or key registration is needed.

## Live OAuth / client authentication acceptance

Sandcastle's implementation must run in its own development conversation/repository authorization. IS does not edit it or access/import/copy the assertion private key. The BFF must be ready to handle the registered client; public key preparation alone is insufficient. Preserve existing OIDC login and local user/Story/Canon/Scene IDs/permissions. Resource-only authorization is a separate grant; link identities only with verified stable issuer/subject evidence, never email alone. No second assertion key pair or client secret.

- Before enabling the client, Sandcastle's existing key custodian signs a ≤60s private_key_jwt assertion and proves disabled-client token rejection; test valid authorization parameters deny without returning a usable code. Missing/invalid assertions alone do not prove valid-key disabled enforcement. Do not print raw assertions/proofs or keys.
- Once separately enabled, authorize with exact callback/resource, the four human scopes, fresh state, PKCE S256 and a separate BFF-controlled DPoP sender key/thumbprint. Resource grant requests no `openid/profile/email/offline_access`; it returns no login ID token or refresh token. The existing OIDC client continues to own login/SSO.
- Test native signed consent Deny and Allow/resume. Validate callback state before using a code; bind to the initiating BFF user/session and exact callback. Wrong redirect, verifier, response/grant type, expired/used code, missing human session or forged consent resume must deny. Do not fabricate consent bodies or auto-accept as a bypass.
- Token endpoint is exactly `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. The assertion uses registered ES256 kid, `iss=sub=consumer client ID`, exact endpoint audience, fresh JTI and ≤60s expiry. Valid signed assertions pass only in an eligible flow; >60s, expired, wrong-audience, wrong-sub/client/key and duplicate assertion JTI deny. Test with malformed/untrusted values without changing registered key custody.
- Token-endpoint DPoP proves sender possession for POST/exact token URL and the authorization-bound key, without resource-token `ath`. Check resulting native EdDSA `at+jwt`, exact issuer/single Nexus audience, expiry ≤300s, human class, registered client, session/subject mapping, exact granted scopes and `cnf.jkt`. Verify authoritative positive issuance/code binding and lifecycle generations before treating the token as usable; signature or a returned response alone is insufficient.
- Test wrong credential classes/grants fail: no client-credentials, refresh, token-exchange/delegation, OIDC ID-token or secret/Bearer fallback. A narrower approved-scope grant may be used to prove per-route insufficient-scope denial without widening or editing client scope ceilings.

Tokens/keys/assertions stay in the BFF/private test context, not browser storage, copied cookies, command arguments, chat or repository artifacts. Evidence records IDs/digests/key thumbprints and sanitized outcomes. A DPoP sender key is separate from the existing assertion key; any test sender-key creation stays in BFF custody and is not assertion-key replacement.

## Four Nexus APIs and DPoP proof matrix

Every resource request uses `Authorization: DPoP <resource-access-token>`, fresh ES256 proof with exact external HTTPS URL/method, literal access-token `ath`, current nonce, fresh JTI and time. No IS/browser cookies are forwarded. POST also requires exact approved Sandcastle Origin and JSON. Do not use privileged operator APIs as a runtime fallback.

Missing/invalid nonce on an otherwise valid request must produce 401 with DPoP nonce challenge. Store it per resource/key, sign a new proof/JTI and retry with a small fixed bound; do not replay the challenged proof. Authorization-server nonce challenges are not added to this resource-server-only reviewed profile. After a successful proof, replaying it denies. Wrong sender/ath/URL/method, malformed/stale proof, unsupported algorithm, ordinary Bearer, absent credentials or cookie fallback deny without sensitive data. Invalid/missing Origin on the decision POST denies. Scope failures are distinct from invalid credential/proof failures.

| API | Valid fixture result | Negative checks |
| --- | --- | --- |
| `GET /api/nexus/v1/me/tenants?limit=1` | `U_1`: A+B; `U_2`: A only; zero after later approved temporary `U_2` A-membership deactivation; exhaustive pagination | Forged identity headers rejected; stale/changed-policy cursors rejected/restarted; no membership or entitlement leakage |
| `GET /api/nexus/v1/tenants/{T_primary}/membership` | Own active member role/status/version, verified actor | B for `U_2`, plus inactive/unknown/cross-user context hidden (404), no directory access |
| `GET /api/nexus/v1/tenants/{T_primary}/applications/09eb0b91-50a2-4606-82f9-47d383ab4ade/entitlements` | Effective enabled entitlement for calling app | Disabled/missing entitlement, foreign app or inaccessible tenant hidden (404); no financial data |
| `POST /api/nexus/v1/access-decisions` | `{"tenantId":"<T_primary>","applicationId":"09eb0b91-50a2-4606-82f9-47d383ab4ade","operation":"sandcastle:tenant.access"}` yields audited allow with matching canonical context/deadline | Valid credentials but wrong tenant/app/operation or inactive policy yield uniform `allowed:false`; actor/resource/unknown request fields rejected |

A one-item page with a next cursor does not prove a single tenant. Zero means no selection; exactly one fully enumerated tenant may auto-select; multiple requires a selector. Sandcastle stores canonical selection in tamper-resistant server state, revalidates every protected operation and checks local resource-to-tenant ownership plus Story/Canon/Scene roles. Tenant IDs received from the browser are requested context, never proof.

## Revocation, expiry and five-second validity

Use only the new consumer client and fixtures. Capture accepted token/decision IDs privately, plus independently read committed policy changes and receipts. Always regenerate valid DPoP proofs/nonces during negative tests so a proof failure cannot mask a tenant-policy denial.

1. Deactivate `U_2` on primary while a different active owner remains. A new post-commit decision denies; membership/entitlement/discovery hide inaccessible context. Reactivate only with a fresh membership version and approved reason; obtain a fresh online decision, never reuse a prior allow.
2. Disable secondary B's Sandcastle entitlement (verify `U_1` loses B) and separately suspend an approved fixture; each must deny new protected operations even if the BFF login session remains alive. Restore each explicitly with audit. Membership/entitlement changes need not revoke the identity token itself; the live tenant decision is the enforcement boundary.
3. Revoke one selected access token using the existing audited `revoke_token` administration action with its authoritative token identifier, not a raw token. Expect 401 from resource validation and permanent denial of that issuance. Native OAuth revocation success alone is not proof of positive-registry JWT revocation; verify the authoritative registry change. A fresh authorization grant is needed for a new credential.
4. Disable then re-enable this consumer client through audited management: old access tokens, pending consent and outstanding codes must not revive. Re-enable is fresh-authorization eligibility, not generation reset. Confirm monotonic epoch changes and exact native disabled/read-back state at each boundary; stop on partial action.
5. Sign out only the dedicated test-human IS session through the supported Identity UI and confirm its deletion/invalidity denies its resource credentials. Never delete/revoke the sole operator's session or suspend its user as a probe. Fresh approved sign-in creates a new session; signing out only Sandcastle's local session is not evidence of IS session revocation. Do not claim allowlist removal or session-epoch invalidation is global account suspension.
6. For an allow, verify caller/application/environment, verified actor, canonical tenant, approved operation, decision ID and `evaluatedAt/validUntil`. Require `validUntil <= evaluatedAt+5s`, bounded by credential/nonce expiry; no positive authorization cache. New snapshots after committed policy revocation deny immediately. An already in-flight snapshot may be usable only to its original deadline (≤5s), not an instantaneous cancellation promise.
7. Hold an actual response beyond its deadline in the consumer's test harness and show Sandcastle rejects it at execution/queue/side-effect boundaries. Do not fake a Nexus decision or change server clocks. Revalidate at dispatch and each consequential side effect; a session or enqueue-time allow is not a lease. Preserve local resource authorization and do not perform paid/media production operations to test the boundary.

Audit durability/atomic failure, database outages, signing-key compromise, global user invalidation and concurrency injections continue to run in disposable infrastructure. Do not damage the shared Development schema, permissions, journal or database to simulate them. Consumer dependency failures must fail closed; no cached/stale or operator-route fallback.

## Evidence, exit criteria and controlled close

Record actual fixture UUIDs, explicitly approved stable identities, native/client/epoch configuration, retained administration/membership/entitlement receipts, token issuance/revocation identifiers/digests, proof challenge/replay outcomes, all four response schemas and decision timing, policy versions and Sandcastle protected-operation denials after revocation. Include expected/actual/status/time/request IDs without raw credentials. Keep provider/journal/Nexus decision audits and all original OIDC/user/tenant IDs intact.

IS#0001-G is not accepted merely because a token can be obtained. It requires live, authorized canonical tenant context consumed by Sandcastle, local resource checks, denied access after membership and entitlement revocation, proof/lifecycle rejection and deadline enforcement. An IS-only script cannot establish Sandcastle's real executor/queue behavior. No live acceptance is claimed by this preparation.

The user supplied existing verified/admitted test identities through normal onboarding. Preserve their identity/admission/audit records; no identity deletion or allowlist mutation is part of fixture setup. Allowlist removal is not token/session revocation.

For the later live credential window, verify the completed fixture matrix and the existing approved identity/session contexts; separately approve consumer activation, Consumer API enablement and live credential issuance; approve the enumerated fixture/lifecycle negative mutations and restoration; choose the bounded-window close versus explicitly ongoing Development state. Once approved, complete all permitted steps and stop on unexpected state. This document is not that approval, and no activation occurs now.
