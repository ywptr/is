# IS#0001-A — Development OAuth provisioning and Identity readiness

2026-11-10. **Inventory/preparation complete; persistent provisioning and consumer activation NOT performed. Readiness: BLOCKED.** No application code, migration, provider/client/credential state, admission, roles or gates changed. Existing uncommitted work is preserved. Local target is literal `127.0.0.1:5432/is_dev`, role `is_dev`, Node 24. The current nine-entry ledger, reviewed hashes, all 14 new tables and disabled gates passed read-only verification.

## Current inventory

| Object | Actual local state |
| --- | --- |
| Better Auth / OAuth provider | Pinned 1.7.10; Google only, passwords disabled, public client registration disabled |
| OAuth clients / resources / client-resource links | **0 / 0 / 0**; no existing Development client to reuse or rotate |
| Nexus applications / app-client bindings | **0 / 0**; Sandcastle is not registered in local Nexus |
| Authorities / credential bindings / issued JWT registry | **0 / 0 / 0** |
| Subject mappings / code barriers / credential epochs / nonces / operation grants | All empty |
| Identity/admission/bootstrap | One verified user, one unexpired session, one admission row, one IS administrator, one Nexus operator; existing admin/operator overlap count one |
| Effective base URL | `https://5480-deb13.lan.com:5180` |
| Gates | Consumer API, memberships and Identity credentials all unset/off |
| Resource/environment/consumer Origin configuration | All unset |
| Google credential fields | Both configured; values withheld, external credential ownership not independently inspected |

The role is also the database owner; least-privilege runtime separation remains unproven. No production client inventory is inferred from this empty local database. Counts and an unexpired session are not evidence of a current authenticated browser or authorization to reuse its cookie.

Trusted HTTPS health/readiness, OIDC discovery, OAuth authorization-server discovery and JWKS return 200. Issuer is `https://5480-deb13.lan.com:5180/api/auth`; authorization, token, introspection, revocation, userinfo, end-session and JWKS consistently use that HTTPS origin. Live discovery currently advertises only `openid profile email offline_access`, and supports `private_key_jwt`; it does **not** yet advertise the four Nexus scopes. Broad provider DPoP algorithm metadata is not the narrower consumer ES256 policy. Actual consumer integration is absent while its gate is off.

## Google browser acceptance

Required authorized JavaScript origin: `https://5480-deb13.lan.com:5180`.
Required redirect: `https://5480-deb13.lan.com:5180/api/auth/callback/google`.

The owner answered “yes” to the origin/callback confirmation request. Record this as **owner confirmation**, not direct Console inspection or successful login. No identity label was supplied in that answer. Existing Linux trusted-browser initiation evidence confirms the actual button creates a Google authorization navigation with this exact redirect and Secure/HttpOnly/SameSite=Lax flow cookie. External navigation was intercepted before Google login; it does not establish callback, state validation, admission, authenticated roles or logout. No credential values or raw state were collected.

Manual evidence requested from the owner:

1. Use the existing approved admitted Development identity, not a newly granted administrator. Confirm Windows resolves the hostname to the correct host and the browser trusts the existing suite CA without bypass.
2. Visit `/sign-in`, click Google, complete login and confirm return to IS, signed-in identity and session survival after reload. Do not send callback URLs with codes, cookies or tokens.
3. Confirm expected existing IS administrator UI and `/admin/nexus/operators`/Nexus operator access. Mere page visibility is insufficient: use normal authorized UI reads; do not mutate records to prove rights.
4. Log out through the UI; verify signed-in state clears and privileged pages/API requests deny or redirect. Do not use another person's stored session.
5. Only if separately approved, test a non-admitted Google identity and confirm denial; otherwise report NOT TESTED. No admission/role grant or bypass is authorized.

Collect only identity label and PASS/FAIL for trusted HTTPS, callback, session/reload, admission, admin/operator rights and logout, with approximate test time. Manual results remain **pending**. Google redirect matching is exact; see [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## Exact proposed resource and client profile

| Field | Proposed development-only value |
| --- | --- |
| Resource / single JWT audience | `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| Tenant discovery | `nexus:tenants:read` |
| Own membership | `nexus:membership:self` |
| Current application access decision | `nexus:access:evaluate` |
| Own application entitlement | `nexus:entitlements:read` |
| Resource JWT signing | EdDSA, native `at+jwt`, <=300-second lifetime |
| Resource proof | DPoP required, ES256 proofs, resource nonce plus shared replay |
| Client label | `Sandcastle Development Nexus` |
| Application | New local `sandcastle` / `Sandcastle` application; canonical UUID assigned on approved creation |
| Environment | `development` |
| Callback | Exactly `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Grant / response | `authorization_code` / `code`; PKCE S256 and `dpop_jkt` |
| Confidential client authentication | `private_key_jwt`; owner-supplied public ES256 JWKS, unique kid; assertions <=60 seconds |
| Subject | Initial **public** profile, pending explicit approval; pairwise runtime not assembled |
| Consent | `skip_consent:false`; actual Allow, Deny and signed pending-query resume required |
| Issuer / JWKS | `https://5480-deb13.lan.com:5180/api/auth` / `/api/auth/jwks` on same origin |
| POST trusted Origin, when approved | `https://5480-deb13.lan.com:5182` |

No login scopes (`openid/profile/email`), refresh/offline grants, client credentials, wildcard callbacks, alternate audience or Bearer/ID-token fallback. Do not add the Nexus audience to existing OIDC tokens. The client assertion signing key and DPoP sender key are separate BFF-held keys; only public assertion JWKS belong in registration. No key was generated or rotated here. Resource nonce enforcement is resource-server behavior, not authorization-server nonce support; [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html) specifies these separately.

Sandcastle's existing login uses the production issuer; its issuer/client/session must remain compatible. A local resource subject must be linked to the consumer's login identity by verified stable evidence, never email. No cross-issuer equivalence follows from the same Google email. The existing Nexus link table permits one client per application/environment; the separate resource client fits the currently empty Development slot, but a second local login-client link would conflict. Do not overwrite the slot: separately review client-purpose modeling if a local OIDC login client is also needed. No new migration is proposed or authorized here.

## Security readiness and bounded corrective work

| Capability | Evidence and actual runtime status | Required action |
| --- | --- | --- |
| Positive issuance registry | Native claim extension captures trusted human grant; verified final JWT plus code provenance, mappings and audit commit before response; unknown JWT denies. Tested in disposable integration. Runtime off/unconfigured | Provision only after maintained runtime composition and lifecycle authority are reviewed; prove real consent issuance and persistence-failure response |
| Individual JWT revocation | Internal `registry.revokeToken`, audit and one-way state available | Application `authorize:async()=>false` denies every maintenance call; implement authorized service entry, no arbitrary actor header |
| Code invalidation | 0010 binds code digest to client/session/user generations; token requires barrier. Tested with synthetic consent bypass | Before-hook generation capture/after-hook code capture are path-specific to `/oauth2/authorize`; real `/oauth2/consent` resume must prove equivalent binding. Extend maintained hooks if needed, never accept an unregistered code |
| Client disable/re-enable | Epoch invalidation persists; old JWT/code generation cannot revive. Native bound-client mutation denied by hook | Implement deny-first orchestrator and explicit permit-new transition; provider disable/rotation alone is insufficient |
| Session termination | Missing/expired originating provider session causes current validation to deny; explicit session epoch invalidation exists | Test actual logout and targeted-session deletion; operator session invalidation needs authorized maintenance path |
| Identity eligibility/subjects | Existing user/session and security epochs required; native grant creates immutable verified mapping, no email lookup | No global suspension/permanent-block hook; admission removal is login-only. Review explicit user epoch invalidation for incidents; do not claim global blocking |
| Pairwise | Foundation proves provider access sub/public user vs client pairwise introspection distinction | Application does not supply `introspectPairwise`; pairwise issuance fails closed. Initial public subject is an explicit profile choice, not an email workaround |
| DPoP | Native proof verification + maintained JOSE nonce inspection; shared database nonce/replay, concurrency and outage denial tested | Real TLS/browser challenges and independent runtime instances remain acceptance gates; native AS nonce unavailable |
| Outages | Issuance/audit/registry and bounded Identity/Nexus snapshot failures deny; no stale positive fallback | Real local resource issuance/outage acceptance pending provisioning |
| Maintenance/provisioning authorization | Registry requires transactionally authorized LifecycleActor; app supplies deny-all. Native bound-client/resource paths are blocked | Add narrow session-backed operator authorization with issuer/environment/action/target checks, role recheck in write transaction and redacted audit |
| Assertion lifetime | Pinned provider default `assertionMaxLifetime ?? 300`; compatibility fixture explicitly sets 60, app does not | Set the approved 60-second limit through supported provider option; test rejection above 60 in actual app-equivalent composition |
| Resource administration | Pinned supported `adminCreateOAuthResource` and related APIs require session; absent `resourcePrivileges` defaults to any authenticated session in server API | Supply explicit operator/resource/action privilege check; do not rely solely on default or `SERVER_ONLY` metadata as policy |

Corrective implementation proposal, **not implemented**:

- Extend the existing authenticated Nexus/Identity administration service narrowly for the dedicated resource profile. Preserve current Google/OIDC login handlers, disable public registration, and retain existing client hooks. Recheck the existing operator/session inside the mutation transaction; an IS administrator alone is not Nexus authority. Lifecycle capabilities must derive from the verified server session and scoped policy, not a body/CLI actor ID or `authorize:()=>true`.
- Add explicit provider `resourcePrivileges` and `assertionMaxLifetime:60`; configure Nexus scopes/resource enforcement only in the approved Identity profile. Preserve unrelated OIDC responses and resource separation. Do not temporarily disable the integration to bypass its resource-administration guard; provide an authenticated narrow allowed path through that guard.
- Implement read-before-create/read-back and failure handling around supported provider API calls. Provider client/resource writes and Nexus/Identity transactions are not one atomic transaction. Keep bindings denied until all read-back/owner-key/config checks pass. On partial failure, leave acceptance denied, identify an orphan and stop; do not leak credentials or grant/re-enable automatically.
- Implement individual revocation and deny-first generation invalidation before provider mutation, including outstanding codes; failed provider mutation leaves deny committed. Re-enable only explicitly for new generations after read-back. Cover user/session/sender/signing-key incident actions without inventing global suspension.
- Add actual signed consent/resume tests to application-equivalent composition (both consent outcomes, invalidation while pending, correct assertion TTL and resource privileges). If the provider issues a code outside the captured path, extend supported before/after hooks to capture verified provenance or stop that profile; no bypass.

No new tables or migration are currently required for this bounded proposal. It requires a separate implementation review; this task authorizes inspection/planning, not runtime feature changes. Existing synthetic fixture authorization and consent bypass must never be copied into provisioning.

## Proposed persistent changes and affected records

At inventory time **no existing OAuth/application record would be modified** because none exists locally. Recheck immediately before execution and abort/review an existing mismatched record; never create a duplicate. Existing users, sessions, admission, roles, signing keys and production registrations must remain intact.

1. New Nexus application row plus registry audit: creates a persistent application, not tenant access.
2. New provider resource and read-back, initially disabled: creates persistent resource policy, not a usable credential.
3. New dedicated provider client with owner public JWKS, exact callback/scopes/resource and explicit consent; no client secret generated or copied by an IS script. Link it to the resource through provider-supported creation/link API and read back.
4. New Nexus application/client Development link and redacted audit: persistent caller binding, no secret columns. New Identity authority/binding and audited initialization through authorized `configureBinding`: **persistent resource credential grant**, separate approval required. Keep source client/resource denied until approved activation staging; do not direct-insert provider tables.
5. Only an owner-approved operation list may create `nexus_consumer_operations` grants. `sandcastle:tenant.use` is illustrative, not approved policy. No tenant, membership or entitlement is silently created; those need their own exact approved fixtures/grants.
6. Do not preseed subject mappings from guessed sub/email. Real native verified issuance creates mappings/registry/code state only in the later approved credential test. That test creates persistent credentials/consent/session state and requires a bounded acceptance window.

## Exact supported call plan — NOT executed

There is **no safe existing one-shot provisioning command** for this profile. `scripts/register-client.ts` and `/api/nexus/registry/applications/oauth` create `client_secret_basic`, login scopes and `skip_consent:true`; neither implements the resource profile. Do not run them as a shortcut. No fictional npm script or successful registration is claimed. The following are exact supported API payloads for the corrective orchestrator, not a runnable approved session/bootstrap script. `operatorHeaders` must come from the existing verified IS operator session, never a pasted cookie or fabricated principal. A future CLI/handler invocation cannot be finalized until that implementation, approved operation list, operator session and public JWKS are available.

```ts
const audience = 'https://5480-deb13.lan.com:5180/api/nexus/v1';
const scopes = ['nexus:tenants:read', 'nexus:membership:self',
  'nexus:access:evaluate', 'nexus:entitlements:read'];
// Local scoped authorizer and provider guard integration must exist first.
await auth.api.adminCreateOAuthResource({headers: operatorHeaders, body: {
  identifier: audience, name: 'Nexus Development', accessTokenTtl: 300,
  signingAlgorithm: 'EdDSA', allowedScopes: scopes,
  dpopBoundAccessTokensRequired: true, disabled: true
}});
await auth.api.adminCreateOAuthClient({headers: operatorHeaders, body: {
  client_name: 'Sandcastle Development Nexus', application_type: 'web',
  redirect_uris: ['https://5480-deb13.lan.com:5182/api/auth/callback'],
  token_endpoint_auth_method: 'private_key_jwt', jwks: approvedPublicJwks,
  grant_types: ['authorization_code'], response_types: ['code'],
  scope: scopes.join(' '), resources: [audience], require_pkce: true,
  dpop_bound_access_tokens: true, subject_type: 'public', skip_consent: false
}});
// Read back exact provider policies/client keys; the disabled resource may require
// a separately reviewed staging sequence before linking. Do not enable it here.
// Then authorized Nexus linkage + Identity configureBinding with exact returned IDs;
// operation grants remain absent pending owner-approved operation list.
```

Provider registration/linking behavior with an initially disabled resource must be exercised in a disposable fixture before approving this sequence; rejection is a stop, not permission to temporarily activate the resource. The server-only APIs and camelCase resource fields/snake_case client fields above match installed 1.7.10 declarations. Current Identity integration resource guard would deny these calls when active; the approved corrective path must address this explicitly. No direct SQL provider-table fixes.

Read-only refresh commands (no credentials printed, no persistent grants):

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
curl --fail --show-error --silent \
  --cacert /home/user/.local/share/mkcert/rootCA.pem \
  https://5480-deb13.lan.com:5180/api/auth/.well-known/openid-configuration
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:compat
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:consumer:pg
```

## Tests and exit gate

Fresh disposable protocol runs: **31 pinned-provider compatibility tests PASS; 34 Identity lifecycle/consumer tests PASS**. They cover actual provider issuance, wrong/ID/unregistered/revoked token rejection, private-key assertion replay, resource nonce/replay races, mapping, generations/code barrier, independent processes, outage denial and privileged-route isolation. Their bypassed consent and synthetic authorized actors are explicitly not real development provisioning/browser acceptance. HTTPS discovery and read-only inventory PASS. No runtime code change required a new build in this documentation-only task; prior build/typecheck evidence is in the local migration report.

Not provisioned, not live-issued, not enabled, not production-ready. Required next review: bounded corrective implementation, verified manual Google evidence, owner-approved public JWKS/operation/subject/identity-link profile, then exact concrete provisioning command and explicit mutation approval. Keep the Nexus Consumer API gate disabled throughout; any Identity/profile gate change also needs separate approval. Do not modify Sandcastle to hide these blockers.


## IS#0001-B follow-up — 2026-11-11

The owner now reports successful manual Google login after correcting the exact Development callback to `https://5480-deb13.lan.com:5180/api/auth/callback/google`. This supersedes pending-login wording above only; logout, denied admission, administrator authorization and live revocation remain unverified. Local administrative/lifecycle corrections and disposable consent evidence are recorded in [IS#0001-B](IS-0001B-OAUTH-ADMINISTRATION.md). Persistent provisioning and gate activation remain unperformed and require separate approval.
