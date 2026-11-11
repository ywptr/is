# IS#0001-E — Approved local migration 0011 acceptance

2026-11-11. **PASS: migration 0011 applied only to local `127.0.0.1:5432/is_dev`; post-migration acceptance complete.** No OAuth resource/application/client/public-key/operation registration, grant change, feature activation, production operation, deployment, push or merge occurred.

## Reviewed checkpoint and execution authorization

The owner accepted E preparation and explicitly authorized: first a clean local checkpoint of reviewed D/E files, then 0011 on the verified local target only, conditional on the exact execution-time guard. The seven reviewed files were scanned for configured secrets/private PEM/provider credential patterns and checked against the immutable migration baselines. No findings or unrelated files were included. Sandcastle's public-only JWKS is intentionally nonsecret; no private key, environment file, certificate/key file or backup was staged.

Clean checkpoint:

`c9157a917bb03147c8ed17d76b97dfc29eeb16bd` — `IS#0001-E: checkpoint reviewed HTTPS recovery and provisioning readiness`.

The command from [the approved E migration document](IS-0001E-MIGRATION-0011-APPROVAL.md) was extracted verbatim; **only** its reviewed-checkpoint placeholder was substituted with that full SHA. No guard, SQL, runner, target, privilege or backup condition was weakened/changed. Executed block SHA-256: `e81a484999d9ec83abd100fd38768895e8b4b7358e5e16869dd970b25e1c841f`. Exit status **0**. Do not rerun this pre-0011 template: its absent-journal/nine-entry-ledger guards now intentionally reject.

## Execution-time preflight

Every approved guard passed before the runner was invoked:

- Node 24; exact `feature/nexus-consumer-runtime` checkpoint and clean working tree.
- Literal database/role `is_dev` at `127.0.0.1:5432`, not a standby; read-only preflight transaction.
- Nine existing ordered ledger checksums match source; 0011 is the **only** pending revision and its journal is absent.
- Reviewed 0011 SHA-256: `7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264`.
- All source SQL hashes match the reviewed backup manifest, including the intentional 0005 gap.
- Existing private backup/manifest are ordinary owner-controlled files with no group/other permissions, marked restore-verified for 45 tables and zero unvalidated FKs.
- Archive SHA-256 is unchanged: `43d6b1086cab1dfd387dba323da8c290dd85c4910fb96342cbdf2bc27c46fdd8`.
- All 45 pre-existing table row counts/digests match the backup, including the original ledger snapshot.
- All four administration/credential/membership/consumer gates remain off.

Recoverable archive remains `/home/user/backups/is_dev/pre-0011-2026-11-11T07-56-57.543Z.dump`, with its protected adjacent `.manifest.json`. C's actual isolated ordinary-role restore proof remains valid; this task reverified its bytes/manifest/data baseline rather than exporting or restoring over existing data. A separate read-only catalog snapshot recorded old table ownership/ACLs, constraints, functions and governance triggers immediately before application.

## Applied change

The exact runner reported the nine historical revisions already applied, then only:

```text
Migrated: 0011_identity_credential_administration.sql
IS application migrations complete
```

0011 adds only `identity_credential_administration` and its ledger entry. Better Auth migrations, existing SQL files, runtime code/configuration, database grants/roles and live credentials were not altered. Identity 0008–0010 infrastructure remains intact; no resource/client/binding or tenant access was seeded.

## Read-only database acceptance

Post-migration acceptance at 09:56 UTC used the same explicit local target in a bounded REPEATABLE READ / READ ONLY transaction.

| Check | Result |
| --- | --- |
| Ledger | **10 entries**, every filename/SHA-256 exactly equals immutable source; no pending revision |
| Public tables | **46**, exactly the previous 45 plus the new journal |
| Existing records | All 45 pre-existing table baselines preserved; for the ledger, the original nine full rows/digest match after excluding only the expected new 0011 row |
| New journal | Empty; owner `is_dev`; 10 NOT NULL columns, UUID primary key, restrictive user FK and 6 CHECK constraints (8 constraints total) |
| New FK | References authoritative `user`, ON DELETE RESTRICT, validated |
| All public foreign keys | **55 validated**, zero unvalidated |
| Existing ownership/ACLs | Unchanged; new journal has default owner privileges only, no explicit grants added |
| Governance | Existing trigger definitions/enabled states and function digests exactly unchanged, including last-operator and last-active-tenant-admin guards; zero governance-count violations |
| Private environment | Bytes unchanged |
| Backup | Original archive hash still matches |

The role is the existing non-superuser database/table owner. No new privilege grant was required or made. Journal actor FK/checks are not substitutes for server operator authorization; gates remain off. Application operator checks and concurrency/security enforcement were verified in disposable tests, not by inserting live journal rows or attempting destructive live governance changes.

Existing aggregate state remains one user, two sessions, one IS administrator, one Nexus operator. OAuth clients/resources/client-resource links, Nexus applications/app-client links, Identity credential bindings and consumer operation grants remain **zero**. Existing identities/provider links/admission/audit records and all other old table contents are preserved by the full-row digest comparison. No session cookie or token was extracted or reused.

## Live HTTPS and disabled-feature acceptance

Certificate-verified canonical requests to `https://5480-deb13.lan.com:5180` passed after migration. The unchanged listener remains PID 1536545; no restart occurred. Its existing IS leaf matches SHA-256 `504a04d44d38f96d36a5486785a2bd20eae545ae607c7912185622a459ff4c4d`, hostname verified with system trust, TLS 1.3.

| Request | Actual response |
| --- | --- |
| Home / sign-in / health / readiness | 200 / 200 / 200 / 200 |
| OIDC + OAuth authorization-server discovery | 200; canonical HTTPS issuer and protocol endpoints unchanged |
| Native JWKS | 200, existing public signing key; no new key registered |
| Anonymous session | 200 null |
| Anonymous admissions / operator / application / tenant APIs | 403 |
| Protected operator/application pages | 307 home |
| All four Nexus Consumer API routes | 404 `resource_not_available`, no-store |
| Consumer credential-administration endpoint | 404 `not_found`, no-store |

Both live discovery documents retain issuer `https://5480-deb13.lan.com:5180/api/auth`, token endpoint `https://5480-deb13.lan.com:5180/api/auth/oauth2/token` and native JWKS under that origin. The future Nexus audience remains the separately reviewed `https://5480-deb13.lan.com:5180/api/nexus/v1`; no resource is registered yet.

Private development configuration and the verified listener's startup overrides confirm all four gates are unset/off: `NEXUS_OAUTH_ADMIN_ENABLED`, `IDENTITY_NEXUS_CREDENTIALS_ENABLED`, `NEXUS_CONSUMER_API_ENABLED`, `NEXUS_MEMBERSHIPS_ENABLED`. No OAuth login/initiation/consent/issuance was performed. HTTPS/gate-off probes are not protected live consumer acceptance or fresh Google browser login evidence.

## Automated regression acceptance

Node v24.22.0/npm 11.19.1. All PostgreSQL regressions initialize/clean up their own synthetic clusters; none uses persistent `is_dev` as a test fixture.

| Check | Result |
| --- | --- |
| Exact-runner fresh/populated/restore migration rehearsal | **4 PASS** |
| Identity/administration/Consumer API protocol regressions | **44 PASS** |
| Existing membership PostgreSQL regressions | **26 PASS** |
| Existing pinned-provider compatibility regressions | **31 PASS** |
| Existing unit/route regressions | **67 PASS** |
| Route generation / typecheck | PASS |
| Production build | PASS, isolated source/.next copy, webpack, synthetic settings and unreachable fixture database |

Total automated tests: **172 passed, zero failures**. These include duplicate/concurrent administration, initial/final audit failure, PKCE/consent, assertion lifetime/audience/signature/replay, mapping, code/token generation revocation, DPoP/nonce, cross-tenant denial, migration/data compatibility and concurrent last-active-tenant-admin protection. No new test bypass or weaker authentication fallback was added. Build-only database warnings concern the unreachable synthetic target; the live HTTPS readiness check succeeds. The live `.next` directory and listener were preserved. A final read-only recheck after all regressions again confirmed the ten-entry ledger, all 45 old table baselines, empty journal, preserved governance and grants, 55 validated FKs and gates off.

Temporary local evidence: `/tmp/is0011-approved-execution.log`, `/tmp/is0011-pre-catalog.json`, `/tmp/is0011-post-acceptance.json`, `/tmp/is0011-post-catalog.json`, `/tmp/is0011-live.json` and `/tmp/is0011-regression-*.log`. These contain redacted/aggregate evidence or synthetic tests, not exported live rows/credentials; the actual backup remains protected outside Git.

## Stop boundary and remaining blockers

Local migration/schema acceptance: **PASS**. OAuth provisioning, activation and Sandcastle M11 cutover: **NOT performed or cleared**. No migration 0011 approval remains outstanding; do not repeat it.

Next work requires separate authorization for administration/Identity configuration, exact resource/application/client/public-JWKS/environment/operation registration, disabled-client read-back and later enablement, approved tenant governance/membership/entitlement fixtures, feature activation and protected live acceptance. Sandcastle still needs its approved private-key possession/DPoP and transport integration, real native-generated client/application IDs, explicit consent and stable subject mapping; production-login/development-resource cross-issuer linkage must never use email equality. No other application repository or production configuration may be changed under this approval.

Retain the journal, monotonic generations, mappings and audit data during application rollback. Do not drop tables, reset epochs or restore over active `is_dev` automatically. Future data writes/provisioning need their own current backup/recovery review. Runtime database-owner separation and production deployment/integration acceptance remain unresolved outside this local milestone.
