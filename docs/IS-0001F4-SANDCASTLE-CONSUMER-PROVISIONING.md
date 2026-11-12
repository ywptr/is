# IS#0001-F.4 — Sandcastle Development application activation and consumer provisioning

**G fixture update:** subsequent explicit authorization completed Development tenant governance/memberships and enabled only the local membership gate. [Current fixture state and separately approved next activation action](IS-0001G-FIXTURE-PREPARATION.md). The Consumer client remains disabled and Consumer APIs remain off. F.4 snapshots below describe the earlier pre-fixture state.

2026-11-12. Status: **application activation and the single disabled consumer provisioning completed; authoritative read-only reconciliation passed**. The consumer client remains disabled; G activation/fixtures/gates are not approved by this report. The user explicitly authorized activation of the local Development Sandcastle application and one distinct disabled Nexus Consumer API client registration, subject to these checks. No client activation, consumer/membership gate change, tenant fixture/grant, additional migration, consumer repository edit, production operation or Git write is authorized.

## Safety preflight

Read-only target `127.0.0.1:5432/is_dev`, branch `feature/nexus-consumer-runtime`, HEAD `55f2268da6a352af3b31ddeb382fcb51e8248d32`; prior uncommitted F.3 work preserved. Eleven ledger entries exactly match source checksums, including applied 0012; no pending migration. Purpose/resource readiness pass and there are no consumer registrations, bindings, operation grants, orphans, incomplete journals, token/consent/issuance records, tenants, memberships or entitlements.

Existing supported OIDC client `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb` has the same full native row digest as the verified pre-0012 backup. Its existing association UUID `18b9299b-54fb-45d2-91c4-a76ef594a79d`, application `09eb0b91-50a2-4606-82f9-47d383ab4ade`, environment `development`, purpose `oidc`, callback and creation time are preserved. No secret, private key or session credential was extracted.

The existing application PATCH requires an authenticated Nexus operator and exact trusted Origin. It changes only application status/timestamp and the same-transaction registry audit. The application revision trigger advances its epoch and coarse policy revision. It does not change native clients, scopes, grants, resources, memberships, entitlements or environment variables. Existing Identity eligibility still requires a current positive consumer-purpose association/binding/resource/scope match, enabled native client, verified human/session and non-denied lifecycle generations. The consumer API feature gate remains independently checked before requests. With no existing consumer credentials/grants, making this application active cannot enable a nonexistent client or create an issuance authority.

Gate states remain the previously approved `NEXUS_OAUTH_ADMIN_ENABLED=true`, `IDENTITY_NEXUS_CREDENTIALS_ENABLED=true`, consumer API and membership gates off. The public ES256 artifact matches the public Sandcastle handoff and SHA-256 `cfee1c6a84f1422db56d57918afe9bba897d22605696ff8186f1c0e1a56137bf`; existing key material only, no private file access or replacement generation.

## Browser actions and checkpoints

Use the existing signed-in operator browser at `https://5480-deb13.lan.com:5180/nexus/applications`. In the top application registry, click **Enable** only beside **Sandcastle (sandcastle)**, not an OIDC/consumer control. Wait for authoritative status/audit and table-change reconciliation before provisioning.

Then use **`https://5480-deb13.lan.com:5180/nexus/applications#nexus-consumer-clients`**, the dedicated **Provision a disabled Nexus Consumer API client** form, with Sandcastle UUID above, fixed Development environment, fixed resource `https://5480-deb13.lan.com:5180/api/nexus/v1`, fixed callback `https://5480-deb13.lan.com:5182/api/auth/callback`, existing public ES256 JWKS, four fixed scopes, sole fixed `sandcastle:tenant.access` operation and reason `IS#0001-F.4 Sandcastle Development disabled provisioning`. Retain the request ID and submit exactly once; stop/reconcile on any error. Do not use OIDC registration or enable/keys/disable maintenance actions.

Issuer `https://5480-deb13.lan.com:5180/api/auth`; token endpoint/assertion audience `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. Required profile is Authorization Code + PKCE S256, private_key_jwt, ES256 assertions at most 60 seconds, DPoP, public subject, explicit consent, exact four human Nexus scopes, one resource and native first committed state disabled. No secret/client-credentials/refresh/offline/service/delegation/wildcard grants.

The existing service's per-issuer serialization, durable request reservation, current verified operator/session checks, explicit native resource-link privilege and pinned provider transaction protect creation. Native client/resource link commit only after disabled read-back. Local association/binding/sole operation/disabled epoch and journal completion then commit together. If final local work fails, preserve the disabled native orphan and stop; never automatically retry or enable.

## Evidence and current boundary

Private read-only snapshots `/tmp/is-f4-preflight.json`, `/tmp/is-f4-activated.json` and `/tmp/is-f4-provisioned.json` record the actual native/link/audit/journal state and redacted table digests. Activation reconciliation must permit only application, registry audit and trigger-owned policy epoch/revision differences. Provisioning reconciliation must preserve OIDC and all unrelated tables, verify one new consumer slot and client, exact public key/profile/resource link, disabled client epoch and completed journal. Runtime database queries remain read-only; all authorized writes use the user's authenticated UI.

No live token issuance or canonical tenant context is claimed by registration. After disabled provisioning, separate approval and fixtures/gates are still required for client enablement, private-key/PKCE consent and DPoP issuance, nonce/replay/revocation/five-second acceptance, and Sandcastle's own tenant/resource checks. No automatic activation is part of this milestone.

## Verified application activation

The user reported the signed-in registry action completed. Authoritative read-only reconciliation confirms `status:active`, updated `2026-11-12T10:13:19.465Z`, and registry audit **ID 5**, entity this Sandcastle application, action `update`, detail `{"status":"active"}`. Full-table digest differences from F.4 preflight are exactly `nexus_applications`, `nexus_registry_audit`, `nexus_consumer_epochs` and `nexus_consumer_revision`. No OIDC row/association, grant, membership, entitlement, resource, identity/session, gate or other table changed. No consumer request or client existed at this checkpoint.

A local comparison script initially compared a PostgreSQL Date object with the persisted JSON string for the association creation timestamp; normalization fixed that tooling mismatch. The corrected read-only comparison passed before the consumer submission instructions were issued. This was not a database/provisioning failure or repair.

Fresh focused synthetic PostgreSQL Identity/administration/consumer regression suite: **58 passed**, exit 0 (`/tmp/is-f4-admin-regression.log`), including disabled-first-commit, OIDC coexistence, exact scope/operation, request/journal/audit/partial-failure and lifecycle controls. No runtime or schema source was changed in F.4. Prior broader F.3 compatibility/membership/standard suite results remain prior evidence, not new F.4 runs.

## Verified disabled consumer registration — reconciliation completed

The user reported a single successful browser submission. The reconciliation checkout is `feature/nexus-consumer-runtime`, user-controlled HEAD `f471358a1e62140342988798feaad31221c58696`; no Git write was performed by this reconciliation. Read-only authoritative reconciliation at **2026-11-12T10:41:05.873Z** independently confirms the reported values:

| Item | Read-back |
| --- | --- |
| New client | **`sutjmkCweZMEZmcSlDeUomcrjfNRourQ`**, name Sandcastle Development Nexus |
| Native state | **disabled true**, no client secret, private_key_jwt, web, public subject |
| Grant/response/PKCE | Authorization Code only / code / required S256 profile |
| DPoP/consent | DPoP required, explicit consent (`skipConsent:false`) |
| Exact callback | `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Resource link | Exactly one: `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| Scope ceiling | Exactly `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| Public assertion key | Exact approved inline public ES256/P-256 JWKS, kid `sandcastle-dev-nRE35Mf-lAcXtiRxymFGmbxAiPyzdCVCZ0RkAB2jI5I`; no remote JWKS URI |
| Purpose association | `2e562305-b1a1-4971-9720-5d8dc11a75d1`, application `09eb0b91-50a2-4606-82f9-47d383ab4ade`, Development, purpose `nexus_consumer` |
| Identity binding | Exact issuer/client/audience/application/environment and four-scope ceiling; configured enabled |
| Operation | Only `sandcastle:tenant.access`, configured enabled |
| Client lifecycle | Generation **2**, **enabled false**; no usable token activation |
| Provisioning journal | **`c5124bef-233b-46d6-8ec6-d8333e89ed8c`**, action provision, **complete**, matching client/application/key/scope/operation/disabled result |

The native public metadata names this exact journal request and environment. Native registering owner, association creator, journal actor and application activation actor match and remain a current Nexus operator. The original audit evidence is preserved. The actual stored reason is `IS#0001-F.2 Sandcastle Development disabled provisioning` (the UI's existing default), not the suggested F.4 wording; this is a nonempty recorded reason, not a profile/grant discrepancy, and was not rewritten.

There are **exactly two native clients**: the existing OIDC client and this one consumer. There are exactly two corresponding purpose-specific Development associations for Sandcastle, one native consumer/resource link, one Identity binding and one operation row. No duplicate consumer, orphan, failed/started journal or partially active client exists. The other journal entry is the earlier completed resource registration. No additional consumer registry-audit event is invented: provisioning evidence is the durable Identity administration journal, transactionally completed with its association/binding/operation/epoch; application activation is registry audit ID 5.

The existing OIDC native row (including credential-bearing columns, verified only through a digest) and association are unchanged. All table differences from the activation checkpoint are confined to the expected native client/resource-link, consumer association/binding/operation/lifecycle/journal and trigger-owned revision tables. Resource policy, OIDC, application, identities/sessions, tenant/membership/entitlement records, unrelated applications and registry audit history were not changed by provisioning. No tenants, memberships or entitlements were created. Native access/refresh tokens, consents, consumer codes and Identity issuances remain zero.

Binding/operation enabled flags configure the future profile; **they do not override native disabled state, the denied client epoch or the independent consumer gate**. The native transaction and independent-connection synthetic acceptance establish the implementation's disabled-first-commit guarantee; this reconciliation establishes the actual committed state and correct workflow metadata. No live valid-key token attempt, token issuance or cross-application acceptance occurred in this read-only turn.

Trusted HTTPS health, readiness, both discovery documents and native public JWKS return 200. Consumer discovery remains gated 404; anonymous administrative read returns 403. Gates remain admin/Identity true and consumer API/membership off; no environment setting or native/client/application state was changed during reconciliation. Private evidence: `/tmp/is-f4-provisioned.json`, `/tmp/is-f4-https-reconciled.json`. No secret/private key/raw token/cookie was retrieved or printed, and no registration was retried.

## IS#0001-G preparation and approval boundary

[The G activation and live acceptance plan](IS-0001G-DEVELOPMENT-ACTIVATION-ACCEPTANCE-PLAN.md) specifies exact fixture/entitlement/membership payloads, the client enable action, Development-only gate order, live OAuth/DPoP/four-route/lifecycle/deadline evidence and the proposed controlled close. It requires a second approved ordinary identity while retaining a distinct active fixture owner, so membership revocation never bypasses last-admin protection. There is currently one admitted verified identity only. No fixture, gate, activation, issuance, revocation or consumer repository change is authorized or executed by this preparation. The correct disabled registration is complete; Sandcastle M11 live authorization acceptance remains pending G approval and its own BFF integration.
