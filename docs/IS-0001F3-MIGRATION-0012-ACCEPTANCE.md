# IS#0001-F.3 — migration 0012 execution and acceptance

2026-11-12. **Approved migration 0012 committed successfully to isolated local `127.0.0.1:5432/is_dev`.** No OAuth provisioning, application/client activation, feature-gate/configuration change, production operation, Git staging/push/merge or deployment occurred. The exact reviewed command ran once; no repair, retry or restore was needed.

## Approved execution

Branch `feature/nexus-consumer-runtime`, HEAD `55f2268da6a352af3b31ddeb382fcb51e8248d32`. The pre-existing F.3 tooling, regression and documentation changes were preserved. Immediate read-only preflight reconfirmed target/role, original ten-entry ledger/checksums, sole pending 0012 and unchanged OIDC client/association. The execution wrapper reconfirmed the private backup's owner/mode, digest, successful restore/rehearsal, source checksums, environment/gates and six-hour freshness before opening its mutation transaction.

Exact approved command, now completed — **do not rerun**:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH

node scripts/apply-0012-approved.mjs \
  --apply-reviewed-0012 \
  --backup-manifest /home/user/backups/is_dev/pre-0012-2026-11-12T08-46-24.462Z.dump.manifest.json
```

Commit receipt: `2026-11-12T09:35:29.901Z`. Target database/role `is_dev`, host `127.0.0.1`, port `5432`, primary. Reviewed SQL SHA-256:

```text
fdcef5d3d4235e221da8f36e4175ef4633e6294080b488ce4e5909aac03b6169
```

Transaction used the existing migration advisory-lock key, serializable isolation, bounded lock/statement timeouts and configuration-table locks. Only reviewed 0012 SQL and its ledger insertion executed. The complete original data projections and expected constraints were checked before commit, followed by fresh read-only post-commit verification. Exit code 0; `committed:true`. Historical migrations were not edited/reapplied; the 0005 gap remains intact.

## Schema and preservation results

| Check | Evidence |
| --- | --- |
| Migration ledger | **11 entries** equal the complete ordered source list/checksums; 0012 appears exactly once, no pending revision |
| Purpose column | Non-null text, default `'oidc'`, validated allowlist `oidc` / `nexus_consumer` |
| Association uniqueness | Validated `UNIQUE (application_id, environment, purpose)` replaces the old two-column constraint |
| Provider client identity | Existing `UNIQUE (oauth_client_id)`, association primary key and FKs preserved |
| Original data | **All 46 original table projections match the verified pre-0012 backup**, excluding only the intended added purpose field and new ledger row |
| Foreign keys | **55**, all validated |
| Governance | Existing trigger/function definitions unchanged; zero membership-governance counter violations |
| Identity/tenant records | Same original records and digests; 1 user, 2 sessions, 0 tenant/membership rows and 1 operator; no fixture created |
| Audit history | Native/provider, application/registry and administration records preserved; no OAuth/client operation journal action added |

Supported Sandcastle OIDC client **`kDCIzSZuiYusmlOPHBDcDVDMflpKiisb`** remains unchanged, including its credential-bearing native row (verified by full-row digest without selecting/printing secret material). Native client remains enabled, `client_secret_basic`, Authorization Code + PKCE, existing `openid profile email` scopes and exact callback. No secret/private key was retrieved, rotated or changed.

Existing association remains application **`09eb0b91-50a2-4606-82f9-47d383ab4ade`**, environment **`development`**, same provider client ID, association UUID, callback, creator and timestamps; only `purpose='oidc'` is added. Sandcastle application remains **disabled**. The intentionally created `hello_test` application and all old audit references remain preserved.

## Gates, UI readiness and HTTPS

Approved gates are unchanged:

```text
NEXUS_OAUTH_ADMIN_ENABLED=true
IDENTITY_NEXUS_CREDENTIALS_ENABLED=true
NEXUS_CONSUMER_API_ENABLED=off
NEXUS_MEMBERSHIPS_ENABLED=off
```

The actual administration read model, executed with a read-only local connection, now reports `schemaReady:true`, `resourceReady:true`, zero consumer registrations and zero orphans. The configured Nexus resource remains correct and the only administration journal entry is the previously completed resource action. Separate OIDC/consumer Development associations can now be represented without overwriting the OIDC slot. This is authoritative read-model evidence, not a claim of a newly authenticated browser provisioning request.

System-trusted canonical HTTPS GET-only verification, no cookies/credentials or verification bypass:

| Endpoint | Result |
| --- | --- |
| `/api/health` | 200, healthy liveness |
| `/api/ready` | 200, ready |
| Both OIDC/OAuth discovery documents | 200, exact canonical issuer, token endpoint and JWKS URI |
| `/api/auth/jwks` | 200, one existing public EdDSA key; no private parameter |
| `/api/nexus/v1/me/tenants` | 404, consumer gate remains off |
| Anonymous consumer administration GET | 403, operator authorization remains required |

Discovery issuer remains `https://5480-deb13.lan.com:5180/api/auth`, token endpoint `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. Native HTTPS listener/certificate/startup settings were not changed. No live Google login, real consumer token issuance or cross-application tenant acceptance is claimed.

## Fresh post-migration regression evidence

Node 24 initialized for all npm commands. All suites below exited 0 and use synthetic fixtures/disposable Unix-socket-only PostgreSQL clusters, never persistent `is_dev` as their test database:

| Suite | Passed |
| --- | ---: |
| Identity lifecycle / administration / Nexus consumer protocol | **58** |
| Provider/Google/OIDC compatibility | **31** |
| Nexus membership/security/real-PG concurrency | **26** |
| Standard unit/route/policy tests | **69** |

The 58-test suite includes populated migration/backfill, ambiguous binding rollback, preserved OIDC issuance alongside a consumer registration, per-purpose duplicate denial, no OIDC privilege inheritance, disabled-application rejection, atomic first externally visible client state disabled, public-key validation, replay/lifecycle/revocation, audit/idempotency and partial-failure reconciliation. These are isolated protocol/DB proofs, not live Sandcastle key-possession or login evidence. Existing route generation, typecheck and isolated webpack production build had passed during F.3 preparation; no app/runtime source changed during this execution turn, so those checks were not redundantly rerun.

Private local evidence:

```text
/tmp/is0012-approved-preflight.json
/tmp/is0012-post-migration.json
/tmp/is0012-postcheck.json
/tmp/is0012-https-postcheck.json
/tmp/is0012-post-admin.log
/tmp/is0012-post-compat.log
/tmp/is0012-post-memberships.log
/tmp/is0012-post-unit.log
```

Backup remains private and recoverable at the approved archive/manifest paths; archive SHA-256 `21c07d2ee659e0139b7885ab37492ce98ba3f3296d1c4af145c1fa027d41b2a3`. Backup restore/rehearsal matched all 46 tables, and postcheck reverified the archive hash. It was not restored over persistent data.

## Remaining provisioning boundary

Page: **`https://5480-deb13.lan.com:5180/nexus/applications#nexus-consumer-clients`**. The schema blocker is cleared. The independent application-state blocker remains: both existing service and UI require active Sandcastle application status, and it is still disabled. Current behavior rejects even disabled-client staging under a disabled application. Do not enable the application simply to satisfy provisioning; a separately reviewed staging-policy decision/code change is needed if the intended workflow is staging while the application remains disabled.

No new Consumer client ID exists. Before a real browser submission, obtain separate OAuth provisioning approval and resolve that policy prerequisite. Preserve the OIDC ID, application UUID, registered Nexus audience, existing public ES256 JWKS, four human scopes and sole `sandcastle:tenant.access` operation. Use the exact fields/sequence in [the F.3 preparation record](IS-0001F3-MIGRATION-0012-APPROVAL.md) and [unified administration report](UNIFIED-OAUTH-ADMINISTRATION.md), submit once, read back native/association/binding/epoch/key/grant/journal state and stop with the new client disabled. Client activation, consumer/membership gates, tenant fixtures and live Sandcastle canonical tenant/revocation acceptance remain separately authorized work.

Service authorization remains architecture only: IS Identity issues credentials; Sandcastle calls IG directly; IG is its own audience-bound resource server and enforces job/artifact permissions; Nexus governs canonical tenants; human-on-behalf-of work needs verified delegation. IS is not a media execution proxy/dispatcher/gateway. No service authorization or consumer repository code was implemented here.
