# IS#0001-F.4 — Sandcastle Development application activation and consumer provisioning

2026-11-12. Status: final safety preflight and authenticated application activation passed; single disabled consumer submission is pending. The user explicitly authorized activation of the local Development Sandcastle application and one distinct disabled Nexus Consumer API client registration, subject to these checks. No client activation, consumer/membership gate change, tenant fixture/grant, additional migration, consumer repository edit, production operation or Git write is authorized.

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

Private read-only snapshots `/tmp/is-f4-preflight.json`, then planned `/tmp/is-f4-activated.json` and `/tmp/is-f4-provisioned.json` record the actual native/link/audit/journal state and redacted table digests. Activation reconciliation must permit only application, registry audit and trigger-owned policy epoch/revision differences. Provisioning reconciliation must preserve OIDC and all unrelated tables, verify one new consumer slot and client, exact public key/profile/resource link, disabled client epoch and completed journal. Runtime database queries remain read-only; all authorized writes use the user's authenticated UI.

No live token issuance or canonical tenant context is claimed by registration. After disabled provisioning, separate approval and fixtures/gates are still required for client enablement, private-key/PKCE consent and DPoP issuance, nonce/replay/revocation/five-second acceptance, and Sandcastle's own tenant/resource checks. No automatic activation is part of this milestone.

## Verified application activation

The user reported the signed-in registry action completed. Authoritative read-only reconciliation confirms `status:active`, updated `2026-11-12T10:13:19.465Z`, and registry audit **ID 5**, entity this Sandcastle application, action `update`, detail `{"status":"active"}`. Full-table digest differences from F.4 preflight are exactly `nexus_applications`, `nexus_registry_audit`, `nexus_consumer_epochs` and `nexus_consumer_revision`. No OIDC row/association, grant, membership, entitlement, resource, identity/session, gate or other table changed. No consumer request or client existed at this checkpoint.

A local comparison script initially compared a PostgreSQL Date object with the persisted JSON string for the association creation timestamp; normalization fixed that tooling mismatch. The corrected read-only comparison passed before the consumer submission instructions were issued. This was not a database/provisioning failure or repair.

Fresh focused synthetic PostgreSQL Identity/administration/consumer regression suite: **58 passed**, exit 0 (`/tmp/is-f4-admin-regression.log`), including disabled-first-commit, OIDC coexistence, exact scope/operation, request/journal/audit/partial-failure and lifecycle controls. No runtime or schema source was changed in F.4. Prior broader F.3 compatibility/membership/standard suite results remain prior evidence, not new F.4 runs.
