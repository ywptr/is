# IS#0001-F — Controlled Sandcastle Development provisioning plan

**F.1 follow-up:** The atomic creation blocker below is now locally implemented and tested; see [the F.1 report](IS-0001F1-ATOMIC-PROVISIONING.md). Native create joins the provider transaction, while disable/read-back explicitly use its transaction adapter because native update does not. The following F snapshot and proposed alternative are historical. Real provisioning and all gate/configuration changes remain pending separate approval.

2026-11-11. **STOP: no persistent provisioning performed.** The new Phase C requirement is not satisfied by the current create-then-disable orchestration. Pinned Better Auth 1.7.10 cannot accept disabled-at-create through its administrative client API. A safe transaction-composition alternative is proposed below, not implemented, tested or authorized for execution. No resource/application/client/key/grant, feature/configuration change, migration, restart, production operation, push or merge occurred.

## Final read-only preflight

Starting branch `feature/nexus-consumer-runtime`, HEAD `a59f8d3` (`IS#0001-E: record approved local migration 0011 acceptance`), clean working tree. F adds this plan and an explicit handoff stop notice only; no runtime/provider/migration source changes or Git checkpoint are made in F.

Fresh bounded READ ONLY inspection at 11:05 UTC verified local database/role `is_dev` on `127.0.0.1:5432`, not a standby. All **ten** ordered migration ledger/source checksums match; no pending revision. The journal introduced by 0011 is present and empty. There are 46 public tables, **55 validated FKs**, preserved old-table/ledger-row digests, unchanged ownership/grants and unchanged governance functions/triggers. Backup hash and private environment bytes remain unchanged from E acceptance. Migration 0011 is complete and must not be rerun.

| Object or prerequisite | Current evidence |
| --- | --- |
| OAuth clients / resources / client-resource links | 0 / 0 / 0 |
| Nexus applications / app-client environment slots | 0 / 0 |
| Identity credential bindings / operation grants | 0 / 0 |
| Provisioning journal | 0 rows; no started/failed/completed request to resume |
| Existing users / sessions | 1 / 2; unchanged, never extracted/reused |
| Nexus operator eligibility | 1 existing operator, verified user; 2 unexpired operator sessions in DB |
| Separate IS administrator | Existing operator also has IS-admin membership; that does not confer Nexus authority |
| Actual authenticated operator request | **Not established in F**; database session counts are not browser authorization |
| Resource administrator | Action-scoped server privilege, not a separate stored role; a verified current Nexus operator must explicitly invoke the resource action |
| All four gates | Unset/off: OAuth administration, Identity Nexus credentials, Nexus memberships, Consumer API |
| Consumer resource / environment / trusted-Origin configuration | Unset |
| Database role | Existing non-superuser database/table owner; no role or grant change |

The native HTTPS listener remains healthy at `https://5480-deb13.lan.com:5180`. Trusted canonical health/readiness, both discovery documents and native JWKS return 200. Anonymous privileged APIs deny; all four Consumer API routes and credential-administration POST remain gated 404. `npm run dev` retains the dedicated IS certificate paths and native port; neither startup nor environment was changed.

Both live discovery documents independently confirm token endpoint `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. No OAuth initiation, authentication, consent or token request was sent. Google browser acceptance remains the earlier owner-reported result, not a fresh F test.

## Public key and fixed human profile

Only the requested public handoff `/home/user/src/sandcastle/backend/docs/M11_OAUTH_CLIENT_KEY_HANDOFF.md` was read. Its inline public JWKS still equals [the reviewed public artifact](oauth/sandcastle-development.public.jwks.json), SHA-256 `cfee1c6a84f1422db56d57918afe9bba897d22605696ff8186f1c0e1a56137bf`.

Fresh JOSE 6.2.12 import/export, public-coordinate checks, thumbprint calculation, IS public-key validation and pinned provider body-schema parsing pass. One EC/P-256 `ES256`, `use:sig` key, kid `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`; kid matches its RFC 7638 thumbprint. Only public fields exist; no private parameter, secret, remote URL or replacement key. Sandcastle's private custody description is owner-provided evidence, not an IS private-file inspection. No Sandcastle helper/module or private file was opened/imported/copied.

| Field | Exact planned value |
| --- | --- |
| Issuer | `https://5480-deb13.lan.com:5180/api/auth` |
| Token endpoint / client-assertion aud | `https://5480-deb13.lan.com:5180/api/auth/oauth2/token` — confirmed live |
| Sole Nexus resource / access-token aud | `https://5480-deb13.lan.com:5180/api/nexus/v1` — explicit implemented policy, not issuer or callback |
| Callback / BFF Origin | `https://5480-deb13.lan.com:5182/api/auth/callback` / `https://5480-deb13.lan.com:5182` |
| Application / environment | `sandcastle` / `Sandcastle`, canonical server-generated UUID; `development` binding |
| Label / type | `Sandcastle Development Nexus`, confidential web |
| Grant / response / PKCE | `authorization_code` / `code` / S256 required |
| Authentication | `private_key_jwt`, reviewed inline public ES256 JWKS; no generated client secret |
| Assertion policy | At most 60s (`assertionMaxLifetime:60`), registered key/signature, client issuer/subject, endpoint audience, expiry and atomic JTI replay validation |
| Human scopes | `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| Resource policy | Native EdDSA `at+jwt`, 300s maximum, exact single audience and required DPoP |
| Operation | Only `sandcastle:tenant.access`; canonical tenant/application eligibility, no Story/Canon/Scene/other local resource permission |
| Consent / subject | `skip_consent:false`, explicit native signed consent/resume; public access subject mapped through verified native issuance to stable local IS user |
| Required first visible client state | **Disabled**, including failure/crash/concurrency windows |

DPoP uses a separate BFF-controlled sender key and proof/nonce/replay enforcement, not the public client-assertion key as an implicit substitute. No client-credentials, refresh/offline, service/delegation/token-exchange grant or wildcard scope/audience is requested. Current Sandcastle production OIDC login stays separate; its existing HTTP Basic login transport is not the planned resource-token authentication method.

## Verified disabled-at-create blocker

Installed provider evidence:

1. `adminCreateOAuthClient` request schema has **no `disabled` field**. A schema-only test with `disabled:true` confirms it is stripped, not carried to persistence. The `disabled` field appearing in a response/update schema is not a supported create input.
2. `persistOAuthClientRegistration` in installed `authorize-dkOG8GqZ.mjs` explicitly supplies `disabled: void 0` when building the canonical new record, even after spreading registration metadata.
3. The provider's `oauthClient.disabled` schema default is **false**. The actual local SQL column is nullable with no SQL default; the enabled default comes from the provider/adapter, not a useful server-side disabled-at-create setting.
4. The current IS service calls native `createClient`, then native `updateClient({disabled:true})` separately. The native create operation has already returned/committed before disable is called; its transaction covers its own client/resource-link writes, not both service calls.

Earlier B/E evidence proves final disabled read-back and Nexus positive-registry denial before binding. It does **not** prove that no enabled native client is ever committed. Under F's explicit stronger condition, that existing path is **not approved for execution**. Neither the public-key handoff nor a successful final-state test clears this blocker. Do not invoke the existing `provision` action or enable its prerequisites as a workaround.

## Proposed safe alternative — needs review, implementation and disposable proof

Preferred bounded change: compose the **native administrative create, disable and exact read-back in one real provider-adapter PostgreSQL transaction**, committing only after disabled status and policy are verified. Existing native APIs remain the only credential writers; no manual INSERT/UPDATE, schema trigger/default patch, dependency edit or parallel client registry is proposed.

The installed `@better-auth/core/context` exports `runWithTransaction`, and the pinned PostgreSQL/Kysely adapter supports real transactions. The helper documents nested transaction joining. That is a candidate composition mechanism, **not proof that all `auth.api` calls join one physical transaction**. In particular, native endpoint paths and adapter use must be verified, and helper/nontransactional fallbacks must fail closed before writes. Merely placing `BEGIN` on the existing Nexus pool connection does not encompass separate native provider connections. No executable new helper/API is claimed to exist.

Required invariants before any persistent approval:

1. Preserve real server-session/Nexus-operator/resource-action authorization, native registering-owner checks, strict Origin/JSON/body checks and transactional mutable-authority rechecks.
2. Reserve the existing durable request journal before provider mutation; hold the existing per-issuer provisioning serialization/idempotency protection.
3. Start a real provider transaction; run supported native create, supported native disabled update and native policy/read-back checks within that same physical transaction. Resource-link read-back must also use that transaction; the current separate Nexus pool connection cannot see uncommitted provider links.
4. Independent sessions/authorization attempts must see no client before commit and only `disabled:true` afterward. A crash/failure before commit must leave no client/resource-link row. Never fall back to a nontransactional create.
5. Only after provider commit, perform the Nexus/Identity binding/operation/audit transaction while retaining denied credential generations. A failure there leaves a disabled provider orphan for reviewed reconciliation, never an enabled client.
6. Any read-back, permission, audit or adapter-capability failure is a stop. No automatic enable, retry with a new request UUID, credential replacement or ownership override.

Disposable acceptance must cover independent-connection visibility and concurrent authorization, native create/disable/read-back rollback injection, missing transaction support/context, operator/session revocation races, duplicate requests and app/environment uniqueness, final local binding/audit failure and preserved Google/OIDC compatibility. Existing final-state-only tests do not cover this new guarantee. If maintained native transaction composition cannot be made reliable, stop and review a supported provider capability/version with true disabled-at-create; no upgrade or patch is authorized in F.

## Exact eventual actions and expected effects — approval pending

The following order is the reviewed plan **only after** the blocker is resolved and each required approval/authentication context is available. No call below was executed. All mutation endpoints are on canonical IS origin 5180 using an existing verified operator session; the BFF consumer Origin 5182 is not privileged administration authority.

| Order / action | Target and authority | Expected database effects |
| --- | --- | --- |
| 0. Approve/test atomic native creation, then separately approve admin/Identity configuration | No production/consumer change; retain dedicated IS TLS and leave membership/Consumer API gates false | Approved development resource/environment/Origin configuration and admin/Identity gate changes only; none changed now |
| 1. Re-read inventory and journal | Same verified local DB and actual operator; exact matching records may be reused after read-back, drift stops | No writes; confirm no new records or incomplete request since preflight |
| 2. Resource action | `POST /api/nexus/registry/applications/oauth/consumer`, `{action:'resource',environment:'development',requestId:<retained UUID>,reason:<approved reason>}`; current Nexus operator plus explicit resource-action context | Native resource identified by the exact audience, four scopes, EdDSA/300s/DPoP; existing service also initializes/advances Identity authority revision and completes its journal. Native resource policy is enabled by default; this is not a Consumer API gate activation |
| 3. Application action if absent | `POST /api/nexus/registry/applications`, `{"key":"sandcastle","name":"Sandcastle","description":"Sandcastle Development human consumer"}`; Nexus operator | Canonical generated application UUID, active registry entry and registry audit; no tenant entitlement/membership |
| 4. Corrected atomic client action — **currently blocked** | Same consumer-administration endpoint, provision body below; current Nexus operator and native registering owner; exact resource-link capability | Native-generated opaque client ID, public inline JWKS and exact fixed profile; first externally visible state disabled, clientSecret absent; resource link committed atomically with that disabled state |
| 5. Nexus/Identity association and operation | Existing service transaction, current operator rechecked; actual returned app/client IDs only | Unique development app-client link, Identity binding with four-scope ceiling, client epoch denied, exactly one `sandcastle:tenant.access` operation and completed durable journal/audit |
| 6. Redacted read-back and stop | Current authorized operator/native owner, exact issuer/client/resource/environment policy | No issuance/enablement; record actual generated IDs, request receipts, public key thumbprint, policy equality and disabled state |

The provision input remains:

```text
{
 action: 'provision', environment: 'development',
 requestId: retainedApprovedRequestUUID,
 reason: approvedReason,
 applicationId: actualReturnedApplicationUUID,
 jwks: contentsOfReviewedPublicJWKSArtifact,
 operations: ['sandcastle:tenant.access']
}
```

Those execution identifiers must be real returned/retained values. No application/client ID or request reservation is fabricated here. The current service fixes the callback, human grants/scopes/resource, PKCE, private-key authentication, public subject, DPoP and explicit consent; a caller cannot supply broader profiles. The corrected atomic implementation must preserve all those restrictions.

Existing sidecar semantics must be made explicit in the eventual approval: binding `enabled:true` and the single operation `enabled:true` configure future policy, while the provider client remains disabled and its client epoch is `enabled:false`. They do not themselves activate APIs or create a usable token. All effective checks, entitlement/membership state and gates still apply. No tenant, membership, entitlement, consent, code, access token, subject mapping, service grant or new identity/session should be created by registration.

Nexus operator, IS administrator and tenant administrator are distinct permissions. Resource creation additionally needs the explicit server-side resource-action privilege; ordinary client provisioning can only read/link the exact resource. There is no separately persisted resource-admin role. A verified current operator may request that action, but no active authenticated resource-administration request was established in F. Never manufacture an actor ID or extract a session token from the database. Better Auth registering-owner restrictions remain in force; another operator cannot silently take over a client.

## Duplicate, partial-failure and rollback strategy

- Resource identifiers, application keys and app/environment slots are unique. Re-read exact profile/ownership/linkage before reusing a matching record; return a conflict and stop on drift or an incomplete operation.
- Retain request UUID, actor, reason and exact payload digest. Completed identical requests return their recorded result. Changed actor/payload conflicts. Concurrent administration gets the existing retryable serialization conflict; no duplicate client creation.
- A failed atomic native phase rolls back its client/link writes. Retain the journal's failure/investigation evidence. Previously completed resource/application steps may remain and require reviewed reuse; they are not implicit tenant access.
- If native disabled-client commit succeeds but local binding/audit fails, retain the disabled orphan/denied state, locate it through request metadata and native owner-authorized read-back, and stop. Reconciliation is a separate reviewed administrative operation, not deletion of audit history or blind re-provisioning. The current service intentionally blocks started/failed request retries and does not provide a general orphan-repair action; do not claim automatic recovery.
- Application rollback keeps security/association/audit history. If later permitted actions must be reversed, use the audited `disable`/registry-token `revoke_token`/generation `invalidate` workflows with reviewed actual identifiers and reason; client re-enable is a separate approval for fresh authorization only. Do not drop 0011, reset generations, restore over active data or manually patch provider credentials.
- Public keys alone are stored at IS. Private assertion key and separate DPoP key stay under Sandcastle custody. Logs/receipts contain public fingerprints, actual IDs and redacted audit status, never secrets/assertions/tokens/proofs or pasted cookies. No production credential is part of the plan.

## Live acceptance prerequisites and next boundary

Before provisioning: approve a bounded local transaction-composition change and its real disposable PostgreSQL proof, establish the intended native credential-owning operator's actual authenticated session, approve development admin/Identity configuration and the exact resource/application/client/binding/operation effects above, then refresh target/inventory/backup/recovery review. The existing pre-0011 backup still validates current old data, but future registration writes and recovery expectations need their own reviewed window.

After separately approved disabled provisioning: verify every native policy/key/link plus journal/registry audit, ten ledger hashes and healthy canonical HTTPS; prove no unexpected grants and four Consumer API routes still 404. Do not enable the client implicitly.

Later live acceptance separately needs: approved client enablement/credential issuance, native signed consent Allow/Deny/resume and PKCE S256; BFF private-key possession and 60s/JTI enforcement; distinct DPoP sender key, nonce/challenge/replay tests; positive registry/code barrier/subject mapping; individual revocation/disable/re-enable; approved governed tenant fixtures and memberships/entitlements; controlled Consumer API/membership activation and the four-route/5s decision matrix. No shared-DB outage or sole-operator session revocation is authorized to manufacture evidence. Sandcastle's production-login/development-resource identity link requires separately proven stable issuer/subject evidence, never matching email. Its resource transport integration is not implemented by the public-key preparation alone and no consumer repository change is authorized here.

**Verdict:** inputs, local schema, HTTPS, public JWKS and fixed profile are prepared. Persistent provisioning is blocked by the disabled-at-first-commit guarantee, absent current authenticated admin context and unapproved configuration/record changes. The next approval should cover the bounded atomic-creation implementation/rehearsal, not execution of the existing create-then-disable route. F changed documentation only; earlier 172-test migration acceptance remains historical evidence, not a new visibility guarantee. No endpoint, key, gate or registration was exercised to bypass this stop.
