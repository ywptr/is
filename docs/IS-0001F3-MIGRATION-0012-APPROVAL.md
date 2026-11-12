# IS#0001-F.3 — guarded 0012 migration approval

2026-11-12. **Update: explicit approval was granted and the exact command completed at 09:35:29 UTC.** See [execution and post-migration acceptance](IS-0001F3-MIGRATION-0012-ACCEPTANCE.md). The preparation details below are the reviewed pre-execution snapshot. Do not rerun the migration. No OAuth provisioning, application/client activation, gate change, production operation or Git write occurred.

## Exact target and current repository

Branch `feature/nexus-consumer-runtime`, HEAD `55f2268da6a352af3b31ddeb382fcb51e8248d32` (`UI for Nexus Consumer API`). Worktree was clean at F.3 start; earlier F/F.1/F.2 work is now included in that user-controlled checkpoint. This task adds only the local migration guard/backup tooling, disabled-application regression, architecture clarification and this approval record. No historical SQL migration was edited.

Read-only preflight verifies direct local PostgreSQL `127.0.0.1:5432/is_dev`, role `is_dev`, primary, ordinary non-superuser/non-createdb/non-createrole/non-bypassrls role. No Neon/production connection is used. This isolated local target uses the existing explicit loopback connection policy; it is not a claim of production TLS verification.

All **ten** applied names/checksums through 0011 match the immutable source prefix; the 0005 gap remains. Exactly one pending migration exists:

```text
0012_oauth_client_purposes.sql
SHA-256 fdcef5d3d4235e221da8f36e4175ef4633e6294080b488ce4e5909aac03b6169
```

The candidate adds the purpose column/default/check, classifies only already-established exact Identity bindings, and replaces the old application/environment unique constraint with application/environment/purpose uniqueness. Provider client IDs and association IDs remain unique; FKs, original columns and audits are preserved. There is no row deletion, provider credential mutation, identity rewrite or destructive data migration. The old uniqueness constraint is deliberately replaced, not retained in parallel, to permit coexistence. Conflicting prior binding evidence aborts instead of silently classifying it.

Read-only current evidence confirms supported OIDC client `kDCIzSZuiYusmlOPHBDcDVDMflpKiisb`, Sandcastle application `09eb0b91-50a2-4606-82f9-47d383ab4ade`, existing Development association, approved callback and OIDC public configuration unchanged. Native client stays enabled, `client_secret_basic`, Authorization Code + PKCE with `openid profile email`; no secret was selected or printed. Application stays **disabled**. No consumer binding/operation/resource-link/issuance exists. Existing Nexus resource and completed resource journal are preserved.

Approved gate states remain:

| Setting | State |
| --- | --- |
| `NEXUS_OAUTH_ADMIN_ENABLED` | true |
| `IDENTITY_NEXUS_CREDENTIALS_ENABLED` | true |
| `NEXUS_MEMBERSHIPS_ENABLED` | off |
| `NEXUS_CONSUMER_API_ENABLED` | off |

No setting or private environment bytes were changed. The execution guard checks the same gates and private environment digest against the backup manifest without printing environment values or connection strings.

## Backup and recovery evidence

Fresh source backup used an exported repeatable-read PostgreSQL snapshot and a read-only pg_dump connection. Private parent directory is mode 0700; archive/manifest are mode 0600, owned by the current user with symlink checks.

```text
Archive:
/home/user/backups/is_dev/pre-0012-2026-11-12T08-46-24.462Z.dump
Manifest:
/home/user/backups/is_dev/pre-0012-2026-11-12T08-46-24.462Z.dump.manifest.json
Archive SHA-256:
21c07d2ee659e0139b7885ab37492ce98ba3f3296d1c4af145c1fa027d41b2a3
Archive bytes: 138204
Restore/rehearsal verified: 2026-11-12T08:46:26.022Z
```

The archive was restored in a private directory into a fresh **Unix-socket-only** PostgreSQL cluster under ordinary `is_dev`, with `--no-owner --no-privileges`. All **46 complete table digests** matched the source snapshot before migration. Original owner/ACL metadata remains in the archive; this restore does not replay production roles or grants. The temporary cluster was stopped and removed; the archive/manifest remain recoverable on the host.

Migration 0012 was applied **only to the restored disposable database**, including its ledger insertion in the same transaction. The exact shared verification helper confirms eleven ledger entries; all 46 original table projections match (only the new purpose field and new ledger row are excluded); existing OIDC association purpose is `oidc`; all 55 FKs remain validated. Old application SQL projections still read the same preserved association. Synthetic consumer association insertion in that same application/Development slot succeeds, while duplicate consumer and duplicate OIDC purpose insertions fail with 23505. Synthetic rows are rolled back. No live OAuth client or grant was provisioned.

Data-preserving application rollback: retain the expanded schema and records; freeze registration writes if older one-purpose application code is restored. No automatic down migration, row deletion or audit erasure. Restore the backup only into a separately approved empty recovery database. Do not overwrite active `is_dev` or lose newer authentication/application records. If actual data restoration is needed, obtain a separate selective reconciliation plan and approval.

## Exact reviewed execution — now completed; do not rerun

From the repository root, execute exactly:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
node scripts/apply-0012-approved.mjs \
  --apply-reviewed-0012 \
  --backup-manifest /home/user/backups/is_dev/pre-0012-2026-11-12T08-46-24.462Z.dump.manifest.json
```

This uses no unverified default test database and invokes neither the broad migration runner nor bootstrap/OAuth tools. It loads the verified local Development configuration privately. The wrapper is prepared and syntax-checked; it has **not** been executed against persistent `is_dev`.

Guards: Node 24; exact loopback database/role/environment; exact eleven-file source list and reviewed 0012 SHA; ten-entry ledger prefix; absence of purpose; exact OIDC and association inventory; unchanged disabled application; zero consumer bindings/operations/resource links; private owner/mode/symlink checks; archive SHA and successful restore/rehearsal receipts; unchanged approved gates/private environment digest. The verified backup must be less than six hours old; refresh it if approval is later.

It takes the migration runner's same advisory-lock key, uses a serializable transaction, a two-second lock timeout and fifteen-second statement timeout, and briefly locks provider clients and associations against concurrent configuration writes. It compares backup-sensitive configuration/journal/audit digests again. Only reviewed SQL 0012 and its unique ledger row execute. All original table projections, purpose uniqueness and 55 validated FKs must pass before commit. Any pre-commit failure rolls back and stops; there is no retry or repair fallback. Post-commit read-only checks verify the complete ledger and preserved OIDC/application/resource/audit state; a post-commit error reports that commit happened and requires inspection, not an automatic down migration.

Prepared tooling SHA-256 values:

```text
scripts/is0012-local.mjs
7b193e30d82aee4f44323283cb3356f60405ae403a0e5dceea62b940eff0b3b6
scripts/backup-0012.mjs
7a488b0b3bc01ac809f7f9f1611d087e8e34da23d034b37928990a3b960c8c67
scripts/apply-0012-approved.mjs
5d8c2e1135349fa68d21b076876640db4f2bbccb5038791e200385f6536a6eae
```

## Validation and post-approval plan

Fresh F.3 Node 24 checks pass: **58** real disposable Identity/administration/consumer tests, including populated/backfill/ambiguous rollback/purpose uniqueness/OIDC issuance/atomic disabled-first-commit/security regression and a new disabled-application rejection test; standard suite **9 test-file runs**; route generation; typecheck; isolated webpack production build with synthetic configuration/unreachable database. Live Next HTTPS artifacts are untouched. The prior F.2 provider compatibility 31 and membership concurrency 26 passing tests remain additional prior evidence, not new F.3 runs.

Private receipts/logs: `/tmp/is0012-backup-rehearsal.json`, `/tmp/is0012-backup-rehearsal.log`, `/tmp/is0012-final-readonly.json`, `/tmp/is0012-regression-{admin,unit}.log`, `/tmp/is0012-{typegen,typecheck,build}.log`. The backup script uses no read-write connection to `is_dev`; all rehearsal writes are on its private socket cluster. Normal PostgreSQL restore, migration, previous-projection and uniqueness checks passed there.

After explicit approval only: run the exact command; inspect `/tmp/is0012-post-migration.json`; verify one 0012 ledger row/all hashes, purpose column/default/check/unique rules and unchanged OIDC provider record/association/audit/application/resource/gates. Refresh the operator Consumer UI read model; schema readiness should become true and a separate Development consumer slot should be representable. Re-run relevant regression/HTTPS/read-only checks. No OAuth provisioning is part of migration approval. **No persistent post-migration success is claimed yet.**

## Sandcastle controlled submission — prepared, still blocked

URL: **`https://5480-deb13.lan.com:5180/nexus/applications#nexus-consumer-clients`** in the user's existing signed-in operator browser.

Use only **Provision a disabled Nexus Consumer API client**:

| Field | Exact value |
| --- | --- |
| Application | Sandcastle (`sandcastle`), UUID `09eb0b91-50a2-4606-82f9-47d383ab4ade` |
| Environment | Development (`development`) |
| Approved Nexus resource | `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| Exact HTTPS callback | `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Public ES256 JWKS | Existing `docs/oauth/sandcastle-development.public.jwks.json`, matching the supplied public handoff; no private key or replacement material |
| Approved scopes | `nexus:tenants:read nexus:membership:self nexus:access:evaluate nexus:entitlements:read` |
| Restricted operation | `sandcastle:tenant.access` |
| Reason | `IS#0001-F.2 Sandcastle Development disabled provisioning` |

Issuer `https://5480-deb13.lan.com:5180/api/auth`; token/assertion endpoint `https://5480-deb13.lan.com:5180/api/auth/oauth2/token`. Preserve Authorization Code + PKCE S256, private_key_jwt/ES256 assertions ≤60s, DPoP, explicit consent, sole audience/operation and atomic disabled-first-commit. No client-credentials, service/delegation, wildcard, refresh or offline grant. The resource's four scopes are policy, not grants to the existing OIDC client.

Once separately approved **and** prerequisites are satisfied, inspect current resource, journal/orphans and absent consumer slot; fill the values; click **Provision disabled Nexus Consumer API client** once; retain its request UUID and returned new ID; stop on errors; perform authoritative client/JWKS/resource/purpose/binding/operation/disabled-epoch/journal read-back plus OIDC preservation. Do not use the OIDC registration form or enable anything.

**Disabled-application finding:** database purpose uniqueness permits a separate slot even while the application is disabled, but the existing administration service explicitly requires `app_key='sandcastle' AND status='active'`; the UI independently enforces the same status. The fresh synthetic test proves `invalid_application`, no native client or association creation, unchanged disabled status and a failed request journal if the guard is reached after reservation. Therefore **the current reviewed workflow cannot stage a consumer client under the disabled application**, even though the client would itself be disabled.

Do not activate the application to bypass this guard, and do not attempt a browser submission now. A separately reviewed policy/code decision would be needed to permit disabled-client staging on a disabled application while retaining active-application checks for all issuance/access. That adjustment is not implemented by F.3 and no application enablement is requested here. Migration approval alone cannot clear this independent blocker. Live key-possession/token-denial proof and eventual consumer activation/gates/tenant fixtures remain separate approvals and acceptance work.

## Direct Sandcastle → IG clarification

The [service architecture addendum](SANDCASTLE-IG-SERVICE-AUTHORIZATION-ADDENDUM.md) now explicitly specifies: IS Identity issues trusted OAuth credentials; Sandcastle calls IG **directly**; IG validates IG-audience access credentials as its OAuth resource server and enforces its own job/artifact permissions; Nexus governs canonical tenants and future service/delegation policy; on-behalf-of work requires explicit verified delegation. IS is **not** an HTTP execution proxy, dispatcher or central media-generation gateway. No service authorization or consumer repository change is implemented.

## Approval and execution status

The user explicitly approved the exact **migration 0012** command/SHA against isolated `is_dev` and the reviewed backup receipt. Execution and postchecks passed. This approval excludes OAuth provisioning, application/client enablement and feature-gate changes; none occurred. The rest of this document preserves the preparation snapshot; use the acceptance report for current schema/ledger/readiness status.
