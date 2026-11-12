# IS#0001-F.2 — Sandcastle Development integration

2026-11-12. Current direction: **preserve the existing supported OIDC client and add a separate Nexus Consumer API registration after approval**. See [unified administration implementation and controlled provisioning plan](UNIFIED-OAUTH-ADMINISTRATION.md). Historical reconciliation below explains why coexistence was needed; the subsequent instruction supersedes its quarantine proposal. Read-only reconciliation is complete below. Approved local Development prerequisites were configured earlier; this reconciliation made no runtime/configuration/database change, provisioning retry, activation, migration, restart, production operation or Git write. Sandcastle M11 remains incomplete.

## Historical submitted-client reconciliation — superseded recovery direction

Read-only repeatable-read snapshot at 06:25 UTC on verified `127.0.0.1:5432/is_dev`, ordinary `is_dev` role, confirms supplied client **`kDCIzSZuiYusmlOPHBDcDVDMflpKiisb`**. There is exactly one native OAuth client and one application/environment link in the database. No duplicate client or failed/started consumer-provision journal exists. **There is an enabled native registration that does not meet the approved profile.**

| Property | Authoritative current value |
| --- | --- |
| Native name / creation time | `Sandcastle (development)` / `2026-11-12T06:15:49Z` |
| Native disabled flag | **`false`**; current native client is enabled |
| Client authentication | `client_secret_basic`; a secret exists, was not retrieved or printed |
| Grant / response / PKCE | `authorization_code` / `code` / required |
| Sole callback | `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Actual scopes | `openid profile email`; none of the four Nexus scopes |
| Public JWKS / remote JWKS | Both absent; approved ES256 public JWKS is not registered |
| DPoP / explicit consent | DPoP false; `skipConsent:true` |
| Subject / application type | No explicit subject type; web |
| Client-credentials scopes | Empty; no client-credentials grant configured |
| Application/environment association | `09eb0b91-50a2-4606-82f9-47d383ab4ade` / `development` / this client ID |
| Application status | `disabled`; this is distinct from native client status |
| Native client/resource link | Absent |
| Identity credential binding / client epoch | Absent / absent |
| Operation grants | None, including no `sandcastle:tenant.access` |

The resource registration remains correct: sole audience `https://5480-deb13.lan.com:5180/api/nexus/v1`, EdDSA, maximum 300 seconds, required DPoP, exact four reviewed Nexus scopes. Resource policy being enabled does not activate the HTTP APIs. Consumer/membership gates remain off; trusted HTTPS readiness is 200 and GET `/api/nexus/v1/me/tenants` remains 404. Ten exact source/ledger checksums through 0011, ownership, governance and all 55 validated foreign keys still match.

Audit evidence:

- Resource administration request `041ab20c-7c1a-408d-9096-7408f7e637ed` is the **only** administration journal row, action `resource`, state `complete`. No consumer `provision` request was reserved, failed or completed.
- Registry audit records Sandcastle `application/create`, then `application/update` with `event:oauth_provision`, this exact client ID and environment `development`, then `application/update` with `status:disabled`.
- Provider owner equals association creator, equals the completed resource action's actor, and remains a current Nexus operator. No session credential was extracted; these are boolean ownership comparisons, not proof of a specific browser click.
- The name, authentication/scopes/consent defaults, association and `oauth_provision` audit match `POST /api/nexus/registry/applications/oauth` and its **OAuth client provisioning** UI. This is a source-and-record inference identifying the OIDC registration path; HTTP request logs were not used to reconstruct the click. It is not evidence that `createDisabledOAuthClient` committed an enabled client: there is no atomic consumer provisioning journal/metadata for this ID.
- Native access tokens, refresh tokens, consent rows, Identity access issuances and consumer code records are all zero. This snapshot proves no currently retained issuance records, not a historical guarantee or a live valid-key token-denial test.

No disabled-first-commit guarantee can be claimed for this ID. Disabling the Nexus application does not disable native OIDC issuance. The absent binding/resource link plus disabled consumer gate deny Nexus use, but must not be described as native client disablement or as proof that general OIDC authorization is impossible. No live OAuth initiation/token request was made during read-only reconciliation.

Evidence: private redacted local `/tmp/is-f2-client-reconciliation.json`; generated using `/tmp/is-f2-final-reconciliation.mjs`. Queries never selected the secret value or session tokens. No private key was accessed. The user's intentionally created `hello_test` application remains untouched.

### Current reconciliation direction — preserve OIDC and add coexistence

The subsequent unified-administration instruction explicitly requires preserving this OIDC client: do not disable, delete or rotate it. The earlier quarantine/replacement proposal is withdrawn. Historical read-back remains evidence of an OIDC registration, not evidence of an atomic consumer provisioning failure.

The reviewed current plan is [unified administration and controlled provisioning](UNIFIED-OAUTH-ADMINISTRATION.md): add an explicit client purpose and separate per-purpose association slot through candidate 0012, retain this OIDC client/association/audits, then provision a separate disabled Nexus Consumer API client only after the required schema/application/provisioning approvals. Do not retry before migration/readiness checks or edit provider tables manually. Consumer and membership gates remain off. IS#0001-G still needs a correct disabled consumer profile, authoritative receipts, separately approved activation/fixtures and live tenant/revocation/five-second acceptance.

## Approval 1 execution evidence

Gate review: `auth.ts` installs the Identity issuance/code/eligibility hooks, four scope definitions, per-client resource enforcement and hashed native token storage. `nexus-consumer/runtime.ts` independently checks `NEXUS_CONSUMER_API_ENABLED`; `http.ts` returns 404 before authentication/work when disabled. Membership readiness separately requires `NEXUS_MEMBERSHIPS_ENABLED`. The eligibility joins reject unbound/disabled clients, denied epochs, inactive applications and mismatched environment/resource/scope; issuance requires verified human authorization-code evidence. Although the gate sets native `allowClientKeyRotation`, the integration's before hook denies direct rotation outside credential administration (no client ID is accepted by that native rotation request); bound consumer mutation also requires the reviewed administration context. Resource native privileges still require explicit scoped authority and a current operator. No broader administrative authority or unauthorized issuance was found by this source review.

The user confirmed the protected Applications registry loads in their existing signed-in browser. Only the five approved nonsecret prerequisite settings were updated in `.env.development.local`; all other settings were retained and consumer/membership gates remain off. Next.js reloaded the environment without a manual restart. Discovery now advertises the four Nexus scopes; anonymous administration returns 403; all four consumer routes still return 404; readiness returns 200. Password/public registration/Google provider/session configuration was not edited.

Fresh Node 24 synthetic PostgreSQL administration suite: **53 passed** (`/tmp/is-f2-admin-prerequisite.log`). The initial sandboxed runner failed before reporting subtests; the approved unrestricted rerun passed. Includes independent observer/first committed disabled state, native disabled authorization/token rejection with synthetic valid keys, eligibility, revocation and consumer transport regressions. This is not proof of a live Sandcastle valid-key assertion, browser consent or cutover.

During the operator page check, a new application `hello_test`, name `11`, UUID `bc58edb0-4cd8-47f1-8ed1-c0d6bcbc2f87` appeared with a registry create audit. Provisioning was briefly paused; the user explicitly confirmed creating it intentionally. Its record and audit are preserved and it is not a Sandcastle binding or provisioning failure.

The user submitted the `resource` action from **Development consumer credentials** and reported success. Read-only authoritative verification at 06:01 UTC confirms one resource: identifier `https://5480-deb13.lan.com:5180/api/nexus/v1`, name `Nexus Development`, disabled `false`, token TTL 300, EdDSA, exact four human scopes, required DPoP. Administration request `041ab20c-7c1a-408d-9096-7408f7e637ed` is `complete`, reason `IS#0001-F.2 approved Development   Nexus resource registration`. Its generic result contains `disabled:true` despite the resource policy being enabled; this field describes the administration response's default client state and must not be interpreted as authoritative resource disabled status. Native resource read-back is authoritative. No client exists yet; no resource action retry is needed.

The user then registered `sandcastle` / `Sandcastle` through the application registry UI. Read-back confirms active canonical application UUID **`09eb0b91-50a2-4606-82f9-47d383ab4ade`**, created 06:02:14 UTC, with its matching `application/create` registry audit. The user has been given the exact `provision` form fields: this application UUID, the already reviewed inline public JWKS, sole operation `sandcastle:tenant.access`, reason `IS#0001-F.2 Sandcastle Development disabled provisioning`. Use only **Development consumer credentials**, not the separate OIDC provisioning form. Submit once, preserve the browser result, and stop on error. Client result/read-back remains pending.

Read-back evidence: `/tmp/is-f2-resource-readback.json`; HTTPS gate evidence: `/tmp/is-f2-config-https.json`. All ten ledger checksums and governance/ownership constraints still match. Additional historical digest differences now reflect the explicitly confirmed application registration/audit/policy revision and approved resource/authority changes; the initial 43/45 match statement describes the pre-provisioning snapshot only.

## Focused preflight

Branch `feature/nexus-consumer-runtime`, HEAD `a59f8d3`. Existing F/F.1 uncommitted runtime, tests and documentation were preserved. F.1 atomic disabled-client creation remains the reviewed implementation; its recorded 177 passing tests are prior evidence, not a new F.2 run.

Read-only repeatable-read inspection verified local `127.0.0.1:5432/is_dev`, role `is_dev`, primary, transaction read-only. All **ten** source/ledger entries through 0011 match exact checksums (historical 0005 gap preserved); no pending migration. There are 46 tables and 55 validated foreign keys. Governance triggers/functions, ownership/grants and old ledger rows match the baseline; no membership-governance violations. The pre-0011 backup hash and its recorded restore verification match; private Development environment bytes are unchanged.

Resource/client/resource-link/application/application-client/binding/operation inventories and administration journal are empty. There is one user, one Nexus operator and one IS administrator; two unexpired verified operator sessions exist. **Stored session existence does not establish an authorized HTTP request.** No session token was retrieved or reused. Actual operator/native registering-owner authorization must pass through the existing session-backed interface before any provisioning write.

Resource administration is action-scoped server authority, not an additional stored role. `auth.ts` requires both `inResourceAdministration(user.id, action, resourceId)` and current Nexus operator membership; the administration service supplies the reviewed action context after session/transaction checks. IS-admin status alone is insufficient. This is source evidence; live authenticated resource administration is still pending.

The IS Next.js listener is on port 5180; Sandcastle listens on 5182. Trusted canonical HTTPS health/readiness, sign-in, discovery and native JWKS return 200. Both discovery documents confirm issuer `https://5480-deb13.lan.com:5180/api/auth` and token endpoint `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. Anonymous privileged catalog requests return 403. All four consumer routes and consumer administration return gated 404. All four feature gates remain off. These anonymous probes establish no authenticated browser/consent or cross-application acceptance.

The existing public artifact `docs/oauth/sandcastle-development.public.jwks.json` matches the supplied public Sandcastle handoff coordinates/kid. SHA-256: `cfee1c6a84f1422db56d57918afe9bba897d22605696ff8186f1c0e1a56137bf`. One public EC/P-256 ES256 signature key; JOSE import and RFC 7638 kid verification pass. No private key was accessed and no replacement pair generated.

## Bounded account/session comparison

Comparison uses the verified pre-0011 archive and current rows normalized through PostgreSQL native column types in a read-only snapshot. Backup COPY contents are processed in memory; outputs contain only field names, counts and boolean comparisons. No tokens, provider subjects, addresses, session identifiers or connection strings are published.

Of 45 historical table digests, 43 match. The differences are:

| Table | Evidence |
| --- | --- |
| `account` | One row before/after; same row, user link, provider/account identity and creation time. Only `accessToken`, `idToken`, `accessTokenExpiresAt`, `updatedAt` changed; update time advanced. |
| `session` | Two rows before/after. One row is unchanged; one historical row is absent and one newer row exists. The newer row belongs to the same existing user and was created after the backup. |

Normal provider sign-in/token replacement and session creation/removal plausibly explain these differences. Snapshots do not attribute actions or prove who initiated authentication; digest comparison cannot reconstruct deleted-session history. No reproducible unauthorized write, test contamination, damaged record or security regression was found in this bounded inspection. This uncertainty does not justify a separate investigation milestone under F.2; proceed to the explicit approval boundary.

Private local evidence: `/tmp/is-f1-live-database.json` (fresh F.2 rerun), `/tmp/is-f2-preflight.json`, `/tmp/is0011-live.json` (fresh HTTPS probes). Temporary filenames retain earlier milestone names; timestamps distinguish the fresh runs. Scripts are read-only and are not migration/bootstrap checks.

## Approval 1 — disabled Development provisioning

Approve the following concrete local configuration and persistent effects as one bounded provisioning window. Refresh inventory/ledger and verify actual authenticated operator/native owner immediately before execution. Retain resource/provision request UUIDs and exact payloads before calls; stop on drift, conflicts or started/failed journal entries.

| Setting | Approved candidate value |
| --- | --- |
| `NEXUS_OAUTH_ADMIN_ENABLED` | `true` for the Development administration window |
| `IDENTITY_NEXUS_CREDENTIALS_ENABLED` | `true`, installing issuance eligibility/lifecycle enforcement |
| `NEXUS_CONSUMER_RESOURCE` | `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| `NEXUS_CONSUMER_ENVIRONMENT` | `development` |
| `NEXUS_CONSUMER_TRUSTED_ORIGINS` | Exactly `https://5480-deb13.lan.com:5182` |
| `NEXUS_CONSUMER_API_ENABLED` / `NEXUS_MEMBERSHIPS_ENABLED` | Remain off until separate activation approval |

Apply only the listed nonsecret Development settings and, if needed, restart the existing IS Development process preserving native HTTPS startup/certificates and all existing secret values. No OAuth client activation is included.

Execute the existing reviewed interfaces in this order:

1. Authenticated consumer administration `resource` action: register exactly the audience above with four human scopes, native EdDSA access tokens, maximum 300 seconds and required DPoP. The native resource is enabled as policy configuration; consumer APIs remain gated off. Journal/authority revision writes are expected.
2. Nexus application registration: key `sandcastle`, name `Sandcastle`, description `Sandcastle Development human consumer`; use the actual returned canonical UUID.
3. Consumer administration `provision` action with environment `development`, retained request UUID, reason `IS#0001-F.2 Sandcastle Development disabled provisioning`, actual application UUID, the existing reviewed public JWKS and exactly `operations:['sandcastle:tenant.access']`.
4. The service atomically creates the native client/resource link with first committed state disabled, inline public JWKS, no secret, and then transactionally records the unique application/Development association, four-scope binding, single operation, disabled client epoch and journal/audit completion. Binding/operation policy rows may be enabled; native client and epoch remain disabled.
5. Read back native policy, linkage, operation, epochs, journal and audit. Verify disabled authorization/token rejection and no issued credentials. Confirm all four consumer routes remain unavailable. Stop before activation.

Exact client policy: confidential web, label `Sandcastle Development Nexus`; sole callback `https://5480-deb13.lan.com:5182/api/auth/callback`; `authorization_code`/`code` only; PKCE S256; `private_key_jwt`, assertions at most 60 seconds, exact discovered token endpoint audience; public subject; explicit consent. Exactly four Nexus human scopes:

```text
nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read
```

No refresh, offline, service, delegation or token-exchange grant. No tenant membership/entitlement is created by this approval. Real signed token-authentication rejection will require Sandcastle to submit its own assertion from its existing key custody; IS will not read the private key. Do not present invalid/missing-assertion rejection as proof of valid-key disabled-client enforcement.

If the provider phase fails, retain journal evidence and verify transaction rollback. If local linkage/audit fails after provider commit, retain the disabled orphan and stop for reviewed reconciliation. Never delete audit data, automatically enable/recreate, repair provider tables or restore the whole database over newer data. Existing F/F.1 documents specify idempotency and rollback details.

## Separate activation and completion boundary

After disabled read-back/rejection succeeds, prepare Approval 2 with actual returned resource/application/client IDs, effective policy receipts, authenticated fixture identity and canonical tenant. It must explicitly authorize client enablement, minimum membership/consumer gates and necessary fixture/entitlement/revocation mutations. Approval 1 does not authorize those actions.

Then verify real private-key-JWT/PKCE consent and code protections, DPoP nonce/replay, four consumer routes, membership/entitlement/client binding denials, token revocation and five-second decision validity. Coordinate the existing Sandcastle development conversation for BFF integration and public evidence exchange; do not edit its repository here. Preserve its production login, canonical UUIDs and Story/Canon/Scene authorization.

After live integration, run consolidated protocol, isolated PostgreSQL concurrency/security, regression, route generation, typecheck, build, browser and cross-application acceptance. No new runtime was written in F.2; these full suites have not yet been rerun and prior F.1 results do not establish live acceptance. Record final evidence and exact checkpoint files only after completion. Git add/commit/push/merge/deploy remain human-controlled.
