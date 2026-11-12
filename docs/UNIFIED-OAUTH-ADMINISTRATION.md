# Unified application client administration — IS#0001-F.2

2026-11-12. Implemented and validated in the IS repository. **No persistent migration, OAuth provisioning, OIDC credential change, application status change or feature-gate change was executed by this implementation.** Stop before the next controlled write. This report supersedes the earlier proposal to quarantine/replace Sandcastle's OIDC registration: it is supported and must be preserved.

## Management URL and client purposes

Open `https://5480-deb13.lan.com:5180/nexus/applications` as a Nexus operator. Dedicated anchors are `#oidc-clients`, **`#nexus-consumer-clients`**, and `#service-clients`. The existing Nexus navigation already points to Applications.

| Purpose | Model and UI | Authority |
| --- | --- | --- |
| OIDC Clients | `purpose='oidc'`; existing registration, actual native authentication/status/redirects, environment and redirect editing | Human login, federation/SSO, application-owned sessions; no inferred Nexus privileges |
| Nexus Consumer API Clients | `purpose='nexus_consumer'`; dedicated fixed-profile disabled provisioning, actual client/binding/epoch/key-ID/scope/operation read-back, journal and orphan reconciliation | Four reviewed human Nexus APIs, live Identity eligibility and DPoP; no automatic tenant entitlement or local resource authority |
| Service Clients | Planned UI explanation and architecture addendum only; deliberately not an accepted DB purpose yet | Future application-to-application credentials, receiving audience and explicit tenant/operation grants; no operational registration/token/authorization endpoints added |

One application/environment can hold one OIDC client and one Nexus Consumer API client. Provider client IDs remain globally unique. Classification never copies scopes, keys, entitlements, secret material or operation policy between them. Service clients require a later reviewed model/migration; no inert service controls are rendered.

The OIDC form now says **Register OIDC login client**, and only lists OIDC registrations. Its existing authoritative redirect editor is preserved and denies attempts to edit a consumer profile through that path. The Consumer form says **Provision disabled Nexus Consumer API client**, has no action selector that could confuse it with OIDC registration, and fixes the reviewed callback/resource/scopes/operation. Existing lifecycle/resource actions remain in a collapsed, explicitly separate approval-required consumer maintenance area using the same server APIs; no action is executed on load or status refresh.

## Smallest schema change — candidate only

[0012_oauth_client_purposes.sql](../db/migrations/0012_oauth_client_purposes.sql) adds non-null `purpose`, default `oidc`, with an allowlist of the two implemented purposes. It replaces only the old `(application_id,environment)` uniqueness constraint with `(application_id,environment,purpose)`. The association primary key, globally unique provider client ID, restrictive references, timestamps, creators and audit history are retained. No provider/user/session/tenant row or secret changes.

For an already explicitly linked `identity_credential_bindings` record, matching client/application/environment association is classified `nexus_consumer` without adding a grant. Ambiguous existing linkage aborts the migration. Names, scopes, email and client-secret/private-key authentication alone never determine classification. Current Sandcastle has no Identity binding, so its preserved association becomes OIDC.

Read-only inspection confirms ten exact ledger/source hashes through 0011, with the historical 0005 gap, and exactly one new pending candidate 0012. Candidate SHA-256: `fdcef5d3d4235e221da8f36e4175ef4633e6294080b488ce4e5909aac03b6169`. No other locally visible branch history reserves 0012; remote branches were not fetched. Recheck branch history/source/checksum/target immediately before any separately approved application.

Consumer provisioning checks schema readiness **before journal reservation or provider writes** and returns `client_purpose_migration_required` if absent. Consumer issuance/current-state checks require an explicit consumer-purpose association. OIDC registration/read/edit retain pre-0012 compatibility; the read model infers an old explicit consumer binding only for display, never to authorize issuance. Existing OIDC behavior is not automatically converted to DPoP or private_key_jwt.

Before applying: separately approve exact local target and candidate; verify ledger/prefix/checksums, backup/restore and rehearsal evidence and intended isolated Development process. Do not run migration/bootstrap tools as audit probes. Applying this candidate is a short transactional DDL operation with an association-table lock; choose a bounded maintenance window. No new migration has been applied to `is_dev` by this task.

Application rollback preserves the expanded schema, association rows, provider clients and audits; no automatic down migration. Freeze new registration writes if reverting to older code, whose one-purpose assumptions cannot manage coexistence safely. Do not remove consumer rows or reimpose old uniqueness over populated coexistence data. A rollback never enables clients or revives revoked tokens.

## Preserved current Development state

Read-only evidence `/tmp/is-purpose-live-preservation.json` confirms native public configuration and association match the previous reconciliation:

- OIDC client `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb`, enabled native client, `client_secret_basic`, Authorization Code + PKCE, OIDC scopes, existing callback and existing secret left untouched; no secret selected or printed.
- Application `09eb0b91-50a2-4606-82f9-47d383ab4ade`, key `sandcastle`, **currently disabled**. Its application status is independent from native OIDC client status and is preserved.
- Existing Development association and registry history retained. The intentionally created `hello_test` application is also unchanged.
- Nexus resource `https://5480-deb13.lan.com:5180/api/nexus/v1` already has correct EdDSA/300s/four-scope/required-DPoP policy; its completed resource request is `041ab20c-7c1a-408d-9096-7408f7e637ed`.
- No Nexus consumer client, Identity binding, operation grant, code/consent/access-token/refresh-token/issuance record exists. Consumer and membership gates remain off; previously approved local Identity/admin prerequisites remain unchanged.
- Public JWKS still matches the public Sandcastle handoff and SHA-256 `cfee1c6a84f1422db56d57918afe9bba897d22605696ff8186f1c0e1a56137bf`. No private handoff file, private key, cookie or database session credential was accessed.

A live Google/Sandcastle login was not initiated here. Preservation is supported by authoritative record read-back and synthetic native OIDC issuance compatibility, not a claim of new cross-application/browser login acceptance.

## Next controlled provisioning action — not executed

Three explicit approvals/prerequisites remain: apply candidate 0012 to verified local `is_dev`; restore Sandcastle application eligibility if approved (existing provisioning requires an active application); and provision the distinct disabled consumer registration. They can be reviewed together as a bounded Development-only window, but are not inferred from repository implementation permission. No OIDC disable/rotation/deletion or client activation is part of that window. The application-status change needs explicit approval because it affects consumer eligibility.

After approved schema application and application eligibility, use the existing signed-in operator browser:

1. Open **`https://5480-deb13.lan.com:5180/nexus/applications#nexus-consumer-clients`**. Confirm the OIDC ID above still appears only under OIDC Clients. Consumer schema/resource readiness must pass; inspect the journal and confirm no existing effective consumer registration or unresolved request/orphan. A successful protected page load establishes operator UI access; the server rechecks current operator/session and scoped native resource-link authority during provisioning.
2. In **Provision a disabled Nexus Consumer API client**, set **Application** to `Sandcastle (sandcastle)` / UUID `09eb0b91-50a2-4606-82f9-47d383ab4ade`. Environment is fixed **Development**. Approved resource is fixed `https://5480-deb13.lan.com:5180/api/nexus/v1` and exact HTTPS callback is fixed `https://5480-deb13.lan.com:5182/api/auth/callback`.
3. **Public ES256 JWKS:** paste the contents of [the reviewed public artifact](oauth/sandcastle-development.public.jwks.json), which matches `/home/user/src/sandcastle/backend/docs/M11_OAUTH_CLIENT_KEY_HANDOFF.md`; kid `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`. Do not copy a private file, use the OIDC secret or generate a replacement key.
4. Approved scopes are displayed and fixed to `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read`. Restricted application operation is fixed **`sandcastle:tenant.access`**. Reason: **`IS#0001-F.2 Sandcastle Development disabled provisioning`**.
5. After explicit provisioning approval, click **Provision disabled Nexus Consumer API client** once. The UI retains the request UUID, displays the generated consumer ID and disabled receipt, then refreshes status. Do not use **Register OIDC login client** for this operation. Do not select any enable/keys/disable action in maintenance.
6. Read back native client, exact public JWKS, single resource link, purpose-specific Development association, Identity binding, disabled client epoch, sole operation and completed journal/audit. Verify OIDC public configuration/association and audit references again. Stop with the new client disabled and all consumer gates unchanged. A live valid-key token-denial probe must be executed by Sandcastle's existing key custodian without revealing the private key; synthetic protocol tests are not live possession proof.

Issuer: `https://5480-deb13.lan.com:5180/api/auth`. Token endpoint/assertion audience: `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. Consumer profile: Authorization Code + PKCE S256, private_key_jwt, ES256 assertions ≤60s with replay-checked JTI, DPoP, explicit consent, no secret/client-credentials/refresh/offline/service/delegation/wildcard privileges, native first committed state disabled. A separate BFF DPoP sender key is distinct from the registered assertion key; no implicit key reuse is prescribed.

## Audit, failure and duplicate behavior

The new operator-only GET endpoint reads inventory/journal in a read-only snapshot, returns no-store/nosniff responses, and never reveals secrets, assertions, raw token material or raw native key documents. It exposes public key IDs and only needed configuration. Bounded lists show up to 200 applications/clients/operations and 50 journal actions (incomplete first); use scoped operational review beyond those display bounds. The existing mutations retain exact Origin/JSON/body checks, current verified operator/session checks, native resource privileges, per-issuer serialization, idempotent request identity and atomic provider transaction.

OIDC and consumer provisioning use separate purpose slots. PostgreSQL uniqueness prevents duplicate effective consumer registrations; duplicate completed request IDs return the same recorded result, changed payloads conflict, and started/failed requests stop for reconciliation. Consumer scope/operation fields cannot broaden the server's fixed Sandcastle profile; even another `sandcastle:*` operation is rejected.

The browser keeps only its request UUID in sessionStorage, never cookies, assertions or credentials. An uncertain response locks further submission across reload and demands authoritative reconciliation; no automatic retry. A stale retained request can block the form until operator review—there is intentionally no blind “clear and retry” control. Malformed JSON detected locally creates no request. Failed native transactions leave no visible client; failures after native commit retain a disabled provider orphan and audit/journal evidence. Inventory reports orphan client/request IDs and missing associations. A native final-state read alone does not retroactively prove first-visible state; independent-connection transaction tests provide the implementation proof.

Consumer operation grants and journal completion remain in the existing same audited transaction; no duplicate business logic or direct provider SQL credential writer is introduced. Existing OIDC registry audits remain valid. General operation-policy editing and service grants are not added by this UI.

## Validation and UI evidence

Node v24.22.0 / npm 11.19.1. All tests use synthetic identities, keys and isolated PostgreSQL Unix-socket clusters; none default to `DATABASE_URL` or write existing databases.

| Check | Result |
| --- | --- |
| Standard `npm test` | 9 test-file runs pass, including credential, Origin/CSRF, operator-read, operation allowlist and membership policies |
| Identity/admin/consumer PostgreSQL suite | **57 pass**; populated migration preservation/backfill, ambiguous-binding rollback, per-purpose uniqueness, OIDC issuance coexistence, OIDC-purpose binding denial, ordinary/tenant-admin denial, atomic first-visible disabled state, public keys, journal/idempotency/orphan and existing consumer/revocation coverage |
| Existing provider/Google/OIDC compatibility suite | **31 pass** |
| Existing real PostgreSQL membership/concurrency/security suite | **26 pass** |
| Route generation, typecheck, webpack production build | Pass in an isolated source copy using synthetic build environment and unreachable database; running Development `.next`/TLS process untouched |
| Browser UI acceptance | Actual production React components, intercepted synthetic API fixtures: purpose separation, native OIDC display, no service controls, schema/application blocks, exact consumer action, disabled receipt, duplicate-submit block, uncertain response retained after reload, orphan reconciliation block; zero page errors |
| Persistent inspection | Read-only ledger/record/public-key preservation, no schema/provisioning writes, anonymous new GET denied, consumer gate still off |

Browser fixtures do not establish live authenticated mutation, Google sign-in or cross-application M11 acceptance. UI screenshots are explicitly synthetic acceptance evidence: [before migration](evidence/is-f2-ui/purposes-before-migration.png), [disabled consumer receipt](evidence/is-f2-ui/consumer-disabled-receipt.png). Logs remain private local `/tmp/is-purpose-{unit,admin,compat,memberships,typegen,typecheck,build,browser}.log`.

The first expanded database attempt hit temporary-disk capacity while initdb was creating a disposable cluster; no new tests/persistent DB writes ran in that failed attempt. Removing only this task's generated isolated Next build output freed capacity; the final 57-test rerun passed. Initial sandbox browser launch required already available runtime libraries, and the isolated build required unrestricted subprocess execution; successful reruns above are the acceptance results.

## Files and milestone boundaries

New: candidate `db/migrations/0012_oauth_client_purposes.sql`; `src/lib/identity/client-purposes.ts`, `administration-read.ts`; purpose-area and consumer-maintenance components; `tests/protocol/client-purposes.mjs`; this report, [service architecture addendum](SANDCASTLE-IG-SERVICE-AUTHORIZATION-ADDENDUM.md) and two UI evidence screenshots.

Updated: Applications page/consumer/OIDC components; existing OAuth list/provision/redirect and consumer-admin routes; administration HTTP/service, credential registry and eligibility joins; unit/admin/lifecycle/consumer fixtures; F.2 record and Sandcastle handoff. Pre-existing F/F.1 atomic bridge, issuance fixes/tests and uncommitted documents remain preserved and are distinguishable in Git status; no Git staging/commit/push/merge/deploy occurred. No package, historic migration or production resource changed.

Exact current implementation paths (the worktree also retains the earlier F/F.1 files listed above):

```text
db/migrations/0012_oauth_client_purposes.sql
src/app/nexus/applications/page.tsx
src/app/nexus/applications/client-areas.tsx
src/app/nexus/applications/oauth-provision.tsx
src/app/nexus/applications/consumer-administration.tsx
src/app/nexus/applications/consumer-maintenance.tsx
src/app/api/nexus/registry/applications/oauth/route.ts
src/app/api/nexus/registry/applications/oauth/redirects/route.ts
src/app/api/nexus/registry/applications/oauth/consumer/route.ts
src/lib/identity/client-purposes.ts
src/lib/identity/administration-read.ts
src/lib/identity/administration-http.ts
src/lib/identity/administration.ts
src/lib/identity/consumer-integration.ts
src/lib/identity/credential-registry.ts
tests/identity-administration-routes.test.mjs
tests/protocol/client-purposes.mjs
tests/protocol/identity-administration.mjs
tests/protocol/identity-lifecycle.test.mjs
tests/protocol/nexus-consumer-runtime.mjs
docs/UNIFIED-OAUTH-ADMINISTRATION.md
docs/SANDCASTLE-IG-SERVICE-AUTHORIZATION-ADDENDUM.md
docs/IS-0001F2-SANDCASTLE-DEVELOPMENT-INTEGRATION.md
docs/SANDCASTLE-M11-NEXUS-HANDOFF.md
docs/evidence/is-f2-ui/purposes-before-migration.png
docs/evidence/is-f2-ui/consumer-disabled-receipt.png
```

Sandcastle M11 still requires approved schema/application/provisioning, independent disabled read-back, separately approved activation/fixtures/gates, BFF private-key-JWT/PKCE/DPoP integration in the Sandcastle conversation, live canonical tenant selection, entitlement/membership revocation denial and five-second protected-operation acceptance. Preserve OIDC login and Story/Canon/Scene permissions. Service architecture is planning only; see the next-milestone addendum. Stop here before persistent writes.
