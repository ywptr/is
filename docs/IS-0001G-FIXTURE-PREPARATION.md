# IS#0001-G — local Development fixture preparation

2026-11-12. Status: **fixture preparation completed and read-only reconciliation passed at 2026-11-12T14:11:23.203Z**. All required identities are explicitly approved and eligible; both owner bootstraps and all three ordinary-member additions completed through the authenticated operator UI. The authorized local membership gate is enabled. **No consumer OAuth client activation or Consumer API enablement is authorized or performed.** Preserve all prior uncommitted work and existing OIDC data.

## Approved identities and retained governance

The user explicitly supplied the two ordinary identity IDs and designated the existing administrator as owner of both tenants. Read-only checks at 14:00 UTC verify each ID exists, has a verified email, has a Google provider link and satisfies the exact database global admission allowlist. No invented email/account, account linking, user deletion or new administrator/operator role is used.

| Role | Stable IS identity | Global authority |
| --- | --- | --- |
| Retained owner, both tenants | `KHchS8YFpyes9w19jZMffcclD4ToX92h` | Existing Nexus operator and IS administrator; tenant ownership is a separately approved assignment |
| Test 1, both tenants | `ITxWjHwzTslC5BlkdjmaAGpl5pKRcgNP` | Ordinary user, no Nexus operator or IS administrator role |
| Test 2, Tenant A only | `ua6p2rmNq2X8QGBqBbTwfF629pgKJ4r9` | Ordinary user, no Nexus operator or IS administrator role |

The owner remains distinct from both tested members. The same person owning both tenants was explicitly confirmed by the user. No owner/admin deactivation, demotion, removal or operator-session revocation is part of setup.

## Existing user-created tenants and entitlements — reused

| Fixture | Canonical UUID | Catalog identity | Current policy |
| --- | --- | --- | --- |
| Tenant A | `9dd71ccf-d9fa-46d5-b3da-82fa907a544d` | `test01`, Sandcastle Test 01 | active, closed |
| Tenant B | `bb46a112-7200-4a52-9272-54cc328dcfce` | `test02`, Sandcastle Test 02 | active, invitation_only |

The user created these records while identities were being clarified. Creation audit IDs are **6** (Tenant A) and **7** (Tenant B). The approved Sandcastle application `09eb0b91-50a2-4606-82f9-47d383ab4ade` already has explicit **enabled** entitlements for both; entitlement audit IDs **8** and **9**, respectively. No duplicate tenant or entitlement write is necessary. Preserve the existing labels, UUIDs and policies; do not rename or derive tenancy from email/domain/hostname. Tenant A's closed onboarding policy does not prohibit explicit operator governance/member assignments in the current supported service; it does not auto-enroll anyone. No unrelated application entitlement exists or is changed.

Verified final membership matrix (all five rows active, membership version 1):

| Identity | Tenant A | Tenant B |
| --- | --- | --- |
| Approved retained owner | owner / active | owner / active |
| Test 1 | member / active | member / active |
| Test 2 | member / active | absent |
| Sandcastle entitlement | enabled | enabled |

This is five membership rows, two governance rows, one retained active administrator per tenant. A canonical UUID is propagated unchanged to future Sandcastle operations. No Story/Canon/Scene data or permissions are created by these assignments.

## Membership gate behavior and actual approved change

`NEXUS_MEMBERSHIPS_ENABLED` is checked for the literal value `true` by the shared membership route handler and the tenant-membership UI. When off, routes return 404 before authentication/work. When on, the gate itself grants no authority: operator routes still require a session and independent `nexus_operators` row; tenant management requires active owner/admin membership on that active tenant; writes recheck mutable authority under locks and audit transactionally. A plain member cannot manage memberships or become an operator. Global IS administrator, Nexus operator and tenant owner are distinct privileges.

Only `.env.development.local`'s `NEXUS_MEMBERSHIPS_ENABLED` setting was changed to true after identities and role checks passed. All other configuration bytes (projected excluding that one setting) are unchanged. Next reloaded the environment; no production setting, TLS startup, OAuth client or secret was changed. GET-only canonical HTTPS confirms anonymous operator-membership access now returns **401 unauthenticated**, while consumer discovery still returns **404 resource_not_available**. Thus the membership gate is loaded without exposing Consumer APIs.

Current gates:

```text
NEXUS_OAUTH_ADMIN_ENABLED=true
IDENTITY_NEXUS_CREDENTIALS_ENABLED=true
NEXUS_MEMBERSHIPS_ENABLED=true
NEXUS_CONSUMER_API_ENABLED=off
```

Consumer client `sutjmkCweZMEZmcSlDeUomcrjfNRourQ` remains native **disabled**, client generation **2** denied. Existing OIDC client `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb`, public assertion JWKS, application/resource/profile bindings and operation ceiling remain unchanged. Eleven exact ledger/source checksums through 0012; no migration runs.

## Authorized browser setup sequence

All writes use the existing approved operator UI/API, never copied cookies, direct membership SQL or fabricated actors. Use the browser signed in as the designated existing Nexus operator. Stop on error and reconcile actual rows/audit before any retry.

1. Open `https://5480-deb13.lan.com:5180/nexus/tenants/9dd71ccf-d9fa-46d5-b3da-82fa907a544d/members`, then the corresponding B URL with `bb46a112-7200-4a52-9272-54cc328dcfce`. In **Assign first owner**, set IS user ID to `KHchS8YFpyes9w19jZMffcclD4ToX92h`, reason `IS#0001-G retained Development fixture owner`; submit once per tenant. The bootstrap API creates governance plus owner and audit atomically. Do not supply a role override. Read back each active administrator count as 1 before proceeding.
2. Under **Add existing member**, add Test 1 `ITxWjHwzTslC5BlkdjmaAGpl5pKRcgNP` with role **member** to A and B. Add Test 2 `ua6p2rmNq2X8QGBqBbTwfF629pgKJ4r9` with role **member** to A only. Reason `IS#0001-G approved Development test membership`. Supported add creates active status; no owner/admin role elevation. These are three submissions, not invitations or generic user creation.
3. Independently read back the exact five-row matrix, governance counters, bootstrap/add audit events and unchanged independent operator/admin tables, native OIDC/consumer state, scopes, resource, journal and unrelated entitlements. Preserve actual membership versions for later tests. Do not alter the owner rows as a negative test.

The catalog/entitlement steps are already satisfied by the user's audited records. Do not perform them again. No consumer enable action, consent/token issuance or resource-server call using credentials is permitted during fixture preparation.

## Readiness and validation evidence

Current private read-only receipts: `/tmp/is-g-fixture-identity-preflight.json`, `/tmp/is-g-existing-fixture-audits.json`, `/tmp/is-g-fixture-eligible.json`, `/tmp/is-g-fixture-ready.json`. Phase-specific checks verify local target, exact approved identities and roles, existing fixture/entitlement state, governance triggers, eleven hashes and native disabled client/epoch. The original F.3/F.4 guards expect the membership gate off and are not reused unchanged after this authorized setting change.

Fresh Node 24 checks pass: **26** disposable PostgreSQL membership/security/concurrency tests and **9 standard test-file runs**. They cover server-side role/CSRF/cross-tenant checks, mutable authority, transactional audit, bootstrap and last-admin concurrency. No test writes existing `is_dev`. Enabled governance triggers `nexus_membership_governance_valid`, `nexus_membership_admin_counter` and last-operator protection `nexus_keep_last_operator` were verified in the actual local database. Authoritative post-submission read-back confirms the exact five-row matrix, audit events and protection counters. The disposable tests supplement that actual state evidence; helper tests alone would not establish fixture completion.

No application/runtime source changed in this preparation. The only authorized configuration write is the local membership gate. No Sandcastle private key, raw OAuth token or session cookie was accessed. Database credentials were used only in memory for the authorized local connection and never printed.

## Separately approved next activation action — do not execute now

After the completed fixture matrix is verified, the next proposed action remains the existing consumer administration endpoint, operator authenticated, exact IS Origin and JSON:

```json
{
  "action": "enable",
  "environment": "development",
  "requestId": "<new retained request UUID>",
  "reason": "IS#0001-G approved Development consumer activation",
  "clientId": "sutjmkCweZMEZmcSlDeUomcrjfNRourQ"
}
```

UI: `https://5480-deb13.lan.com:5180/nexus/applications#nexus-consumer-clients`, collapsed Consumer lifecycle administration → Enable consumer client → this exact consumer ID. The checkbox indicating separate approval must remain unchecked until that approval actually exists. Read back native state and advanced eligible client epoch/journal; no retry on partial state. The OIDC client is not a target.

Only after separately approved client activation and live OAuth issuance tests should the local Consumer API gate be considered; its enablement needs separate approval too. Keep current Identity/admin/membership settings and exact Development resource/Origin/TLS policy. No new client, key, scope ceiling, service grant or migration is needed.

## Future live acceptance using the new two-user matrix

The [G live acceptance plan](IS-0001G-DEVELOPMENT-ACTIVATION-ACCEPTANCE-PLAN.md) remains the protocol reference; the earlier proposed one-user staged-membership sequence is superseded by the matrix above. No live security mutation or token issuance is executed by fixture preparation.

- Test 1 initially discovers A and B (exhaustive pagination); Test 2 discovers A only and is denied B despite B's enabled entitlement. Both tokens resolve only their own verified subject. Arbitrary user/actor headers and cross-application/tenant context cannot substitute identity.
- A future separately approved deactivation of Test 2's A membership yields the zero-eligible-tenant case while the owner stays active; restore only through audited, version-checked member transition. Do not remove the last owner or create a fake identity to produce zero discovery.
- A future approved disablement of **B's Sandcastle entitlement** makes Test 1 lose B access; A remains available. Restore explicitly with audit. Test 2 never acquires B membership. No unrelated entitlement changes.
- Before/after those mutations, cover all four APIs, canonical selection and context, membership/entitlement denial, stable resource-to-tenant ownership and local Sandcastle Story/Canon/Scene checks. Fail closed on unavailability; no privileged operator-route fallback.
- Use real Authorization Code + PKCE S256 and explicit consent; registered ES256 private_key_jwt ≤60s with JTI replay protection; a separate BFF DPoP sender key, current nonce, exact method/URL and access-token hash. Only the single Nexus audience is valid; OIDC ID tokens, ordinary Bearer/cookie fallback, wrong client or unauthorized grants deny.
- Exercise proof/nonce replay, code/assertion expiry/reuse, token/client/session revocation and committed membership/entitlement revocation only under a later explicit live-test authorization. Client re-enable must not revive old codes/tokens. Never revoke the sole operator's session or move the assertion private key out of Sandcastle's backend.
- Enforce `validUntil <= evaluatedAt + 5 seconds` and token/nonce expiry, no positive cache, fresh decisions at protected execution and consequential queue boundaries. Demonstrate denial of a delayed real response in Sandcastle's own test harness, not a fabricated decision or IS execution proxy.

IS-side preparation is not proof of live Sandcastle authorization. No Sandcastle code is edited from IS. Final fixture status/UUIDs/matrix/audits must be reported before seeking the separately approved activation step.

## Owner bootstrap read-back

At 2026-11-12T14:07:51.243Z, each existing tenant has exactly the approved owner, active, membership version 1, and governance `active_admin_count:1`. Membership audit IDs **1** and **2** are `bootstrap` events with the correct owner as actor/target and reason `IS#0001-G retained Development fixture owner`. Request IDs: A `c0e34f64-ac13-4d08-91b9-ade038bb5a1a`, B `f2366565-d41b-4353-ae91-c31fdb8d0183`. No test member is yet claimed assigned at this checkpoint. Critical identity/admission/operator/OIDC/consumer/resource/journal/ledger hashes and both existing tenant/entitlement records remain unchanged from the eligible baseline; the only environment difference is the authorized membership gate.

## Completed member setup and preserved state

The user reported all three supported member additions succeeded. Independent read-only verification at **2026-11-12T14:11:23.203Z** confirms exactly five membership rows matching the approved matrix, two governance rows with `active_admin_count:1`, all membership versions 1 and no B membership for Test 2. Ordinary users remain non-administrators/non-operators in the independent global role tables. No owner was demoted, removed or deactivated.

| Membership audit ID | Action | Target | Tenant | Request ID |
| --- | --- | --- | --- | --- |
| 1 | bootstrap | Retained owner | A | `c0e34f64-ac13-4d08-91b9-ade038bb5a1a` |
| 2 | bootstrap | Retained owner | B | `f2366565-d41b-4353-ae91-c31fdb8d0183` |
| 3 | add member | Test 1 | A | `834ee068-e55a-441e-9daf-5f5c0929957e` |
| 4 | add member | Test 2 | A | `4fb77eb9-31d4-4627-8f77-f7f8d3d5b260` |
| 5 | add member | Test 1 | B | `c291aa8c-4150-48d5-9fa2-ae7112205e90` |

Each event has the approved owner/operator as actual actor, the matching target/role/status/version, recorded reason and server request ID. The three adds record reason `IS#0001-G approved Development test membership`. Both existing Sandcastle entitlements remain enabled with their original audit events; no duplicate catalog or entitlement mutation was sent.

From the verified eligible baseline to final state, **only** `nexus_tenant_memberships`, `nexus_tenant_membership_governance`, `nexus_tenant_membership_audit`, `nexus_consumer_epochs` and `nexus_consumer_revision` table digests changed. Every other table digest—including users/provider accounts, admission, global admin/operator roles, native OIDC/consumer records, keys, resources, app associations, consumer scope/operation bindings, administration journal, tenants, entitlements and migration ledger—is unchanged. The environment projection excluding the one authorized membership setting also matches exactly.

Canonical trusted HTTPS readiness is 200; Consumer API discovery remains gated 404. The native consumer client is still disabled with generation 2 denied. Source/ledger still has eleven matching entries, no new migration or production change. Existing operator/owner governance triggers remain enabled; no privilege elevation of either ordinary member occurred. Runtime role denials are supported by actual role data/current authority predicates plus the disposable route/security suite; no live Consumer OAuth token or Sandcastle protected-operation acceptance is claimed while credentials/API stay disabled.

Private final evidence: `/tmp/is-g-fixture-final.json`, `/tmp/is-g-fixture-final-consumer-gate.json`; current tests `/tmp/is-g-fixture-membership-tests.log` (26 pass) and `/tmp/is-g-fixture-unit-tests.log` (9 test-file runs pass). No runtime source, dependency, consumer repository or private-key custody changed. The work stops at the required boundary: **ready for separately approved consumer client activation**, with Consumer API exposure and live credential/security tests still separately controlled.
