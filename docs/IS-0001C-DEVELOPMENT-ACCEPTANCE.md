# IS#0001-C — Development provisioning and live acceptance preparation

2026-11-11. **Migration-ready for separate approval; persistent provisioning and Sandcastle M11 cutover NOT CLEARED.** No migration, OAuth registration, grant change, development key generation, gate activation, listener restart, deployment, push or merge occurred. A specifically approved private backup and isolated restore copied development data locally; the source database was read-only throughout.

## Review and checkpoint

The starting tree was clean on `feature/nexus-consumer-runtime`, HEAD `293d685e1afa1331745b0b6317d5c2d6261167db` (`IS#0001-B task completed`). All 13 files in that commit were reviewed. Its changes concern administrative/lifecycle enforcement, its tests and acceptance documentation; the only package change adds a test script. It contains no HTTPS configuration or dependency-version changes. Candidate 0011 was already present in `0058bbc`; B did not add/edit it.

All 0001–0008 SQL files match `f8941c3`; 0009–0010 match `fc349b2`; 0011 matches `0058bbc`. The intentional 0005 gap remains. Current tracked-source scanning found no configured Better Auth secret, Google credential values or database URL, private PEM blocks or checked provider credential patterns. Only `.env.example` is tracked; no PEM/key/archive is tracked. `.env.development.local` and `certificates/` are ignored. This is a bounded current-tree scan, not a claim to have audited every historical or unknown secret format.

C changes only this review/runbook, the Sandcastle handoff, a guarded private backup/recovery helper, a dedicated disposable migration test and one additional protocol test for the owner's proposed operation. No application runtime source, configuration, historical SQL or other repository changed. Local checkpoint convention: `IS#0001-C: checkpoint development acceptance preparation`; the final SHA is reported by `git log -1` and in the completion response, rather than embedded in its own commit.

## Actual local database preflight

Bounded REPEATABLE READ / READ ONLY inspection verified `127.0.0.1:5432`, database and role `is_dev`, not a standby. The nine ordered ledger entries through 0010 exactly match source SHA-256 hashes. **Only 0011 is pending**, and `identity_credential_administration` is absent. No audit/bootstrap/migration script was run against `is_dev` as a check.

| Item | Actual state |
| --- | --- |
| Source / ledger migrations | 10 / 9, exact applied prefix |
| Public tables / invalid FKs | 45 / 0 |
| Existing identities / sessions | 1 / 2; counts do not authorize cookie reuse or prove browser login |
| IS administrators / Nexus operators | 1 / 1; separate permissions |
| OAuth clients / resources / client-resource links | 0 / 0 / 0 |
| Nexus applications / application-client links | 0 / 0 |
| Tenants / memberships / entitlements / operation grants | 0 / 0 / 0 / 0 |
| Identity authorities/bindings/issuances/mappings/code barriers | All empty |
| Membership / Consumer API / Identity credentials / OAuth administration gates | All unset/off |
| Resource / environment / trusted consumer Origin configuration | All unset |

The `is_dev` role is not superuser, CREATEDB, CREATEROLE or BYPASSRLS, but **is the database owner and owns all current public tables**. The public schema is owned by `pg_database_owner`; there are no custom default ACLs. Creating 0011 as this owner needs schema CREATE and REFERENCES on `user(id)`, both already available; the journal will be owner-accessible without a new GRANT. No grant changes were made. Disposable tests verify ordinary unrelated database roles have no default journal SELECT/INSERT access. Production/runtime owner separation and narrower operational grants remain an explicit security prerequisite; application authorization cannot protect audit history from a database owner.

## Migration 0011 review and rehearsal

File: `db/migrations/0011_identity_credential_administration.sql`.

SHA-256: `7fe4002bcac8a8754574946ef55f0ecfb79cb67e1e954d424c4e78f3c9f5b264`.

The migration adds one Identity-owned journal with UUID request PK, restrictive existing-user FK, HTTPS issuer prefix, development-only environment, enumerated actions/states, SHA-256-shaped payload digest and bounded nonempty reason. It changes no provider table/credential, user, membership, operator, entitlement, trigger or existing data. The application needs the 0008 generation/binding registry, 0009 operation policy and 0010 authorization-code barrier in addition to this journal. The journal itself references the provider user table; application authorization checks current operator/session separately, inside write transactions. A journal actor FK is not proof of operator authority. The journal intentionally supports state/result updates; it is not an append-only database-owner-proof log.

Fresh, populated and restored **disposable** databases passed the exact repository migration runner under an ordinary owner role. The populated baseline had an existing provider user/session, confidential OIDC client, IS administrator, Nexus operator and governed tenant administrator. Full pre-existing row counts/digests (excluding the intentional ledger addition), provider ownership/credentials and governance trigger definitions were preserved. All ten ordered hashes matched; rerun was a no-op. Restrictive actor FK, duplicate UUID, invalid audit fields and unprivileged database access tests passed. Existing last-operator DELETE and last-active-tenant-admin deactivation guards still rejected removal. The existing membership suite additionally proves concurrent tenant last-admin protection at its supported isolation levels. No new global IS-administrator removal feature or database last-global-admin invariant is claimed: the current admission API protects administrator admission removal, and 0011 does not change it.

The existing administration protocol tests prove duplicate protection, concurrency conflicts, generation-bound code/token revocation, consent-resume revocation and fail-closed initial/final audit failures. These are isolated evidence, **not live provisioning acceptance**. Rollback remains application/gate rollback with journal/security history retained; no automatic table drops, generation resets or restoration over live `is_dev`.

## Verified current backup and recovery evidence

With separate execution approval, a custom-format archive was taken from an exported REPEATABLE READ snapshot shared with full-table digest queries. No live database write was performed.

- Archive: `/home/user/backups/is_dev/pre-0011-2026-11-11T07-56-57.543Z.dump`.
- Adjacent protected manifest: same path plus `.manifest.json`.
- Size: **133651 bytes**; SHA-256: `43d6b1086cab1dfd387dba323da8c290dd85c4910fb96342cbdf2bc27c46fdd8`.
- Archive/manifest mode 0600; private parent mode 0700; outside Git.
- A new private Unix-socket-only recovery cluster restored into an empty database as ordinary `is_dev`, with `--exit-on-error --no-owner --no-privileges`. **All 45 table counts/digests matched the snapshot**, including the nine-entry ledger and existing identity/session/account state; zero unvalidated FKs. Archive hash remained unchanged. The recovery cluster was stopped and removed; the protected archive/manifest remain.

Final read-only comparison at 08:14 UTC again matched all 45 live table digests and the nine ledger entries to this backup, reverified the archive hash, confirmed the journal is still absent and all gates remain off.

The earlier pre-0008–0010 archive also still matches its recorded checksum, but it is historical and is not the pre-0011 recovery baseline. The repeatable procedure is preserved in `scripts/is0001c-backup-restore.mjs`, with additional explicit approval/exact-checkpoint/clean-tree guards. The executed temporary procedure used the same snapshot/dump/restore/digest sequence before those rerun guards were added. The helper never runs migrations, loads only local development configuration, checks the literal target/prefix/hash and never prints real rows or credentials. Recovery ownership/ACL replay is deliberately omitted; restore permissions and writes after the snapshot must be reviewed before any real recovery. Never automatically restore over active `is_dev`.

## Live Identity and network evidence

The current environment file still has `BETTER_AUTH_URL=https://5480-deb13.lan.com:5180`. No configuration/trust store/certificate was changed. Linux resolves the canonical hostname to `127.0.1.1`. At inspection, Next listens on `0.0.0.0:5180`, PID 1390754; re-identify before any separately approved restart.

**Canonical HTTPS currently fails**: trusted curl exits 60 with `no alternative certificate subject name matches target hostname '5480-deb13.lan.com'`. The local automatically generated certificate covers `localhost`, 127.0.0.1, ::1 and 0.0.0.0, omitting the canonical hostname. Its public fingerprint is `67:EB:27:61:5A:E8:BA:31:01:BA:A9:58:81:02:D7:5B:4C:00:DE:C3:F7:12:13:A9:2F:F3:ED:CE:D1:2A:4D:B2`. The previously documented dedicated leaf `/home/user/certs/is/dev-cert.pem` still covers the canonical hostname/LAN IP and expires 2029-02-10. Restoring the documented explicit-key/certificate start command requires approval; no restart or insecure request was performed.

Certificate-verified **localhost diagnostics only**, against the existing process and without cookies/credentials:

| Check | Actual result |
| --- | --- |
| Home / sign-in / health / readiness | 200; health OK, DB readiness ready |
| OIDC / authorization-server discovery | 200; issuer and all advertised protocol endpoints retain canonical HTTPS origin |
| Published scopes | `openid profile email offline_access`; four Nexus scopes not advertised while Identity integration is off |
| JWKS | 200; one public EdDSA/OKP key |
| Anonymous session | 200 null, no Set-Cookie |
| Anonymous admissions/operator/application/tenant registry APIs | 403 |
| Privileged operator/application pages | 307 to `/` |
| Consumer administration POST `{}` | 404 `not_found`, no-store/nosniff |
| All four consumer routes, including decision POST `{}` | 404 `resource_not_available`, no-store/nosniff |
| Sandcastle HTTPS HEAD at documented LAN binding | 200 with system trust using `--resolve 5480-deb13.lan.com:5182:192.168.0.99`; loopback lookup alone fails because Sandcastle binds the LAN address |

Localhost diagnostics do not clear canonical TLS, browser OAuth or resource URL/DPoP acceptance. No TLS verification bypass, host/issuer rewrite, saved cookie or user token was used. Provider-wide discovery advertising machine/refresh grants does not grant those to the planned human client.

The owner previously reported successful Google login after correcting `https://5480-deb13.lan.com:5180/api/auth/callback/google`. Retain this as owner-reported evidence predating this current TLS finding. No fresh Google login, authenticated session establishment, administrator authorization, logout, denied admission or actual session revocation was independently verified in C.

## Exact proposed provisioning profile and authority

| Item | Reviewed configuration / authority |
| --- | --- |
| Resource | `https://5480-deb13.lan.com:5180/api/nexus/v1`; explicit operator `resource` action in server-scoped resource-administration context |
| Resource policy | EdDSA `at+jwt`, TTL 300s, DPoP required, exactly the four scopes below |
| Application | Existing registry operator API/UI; `sandcastle` / `Sandcastle`, canonical returned UUID; re-read/reuse exact matching record if one appears before approval |
| Environment | `development` only, unique application/environment slot |
| Human client | `Sandcastle Development Nexus`, web/confidential, `authorization_code` / `code`, PKCE S256, `private_key_jwt`, inline public ES256/P-256 JWKS, public subject, explicit consent |
| Callback | Exactly `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Resource link / scopes | Exact Nexus audience and `nexus:tenants:read`, `nexus:membership:self`, `nexus:access:evaluate`, `nexus:entitlements:read` |
| Operation | Owner-proposed **`sandcastle:tenant.access`**, canonical tenant/application eligibility only; no Story/Canon/Scene resource permission |
| Binding | Provider resource link + Nexus application/environment link + Identity issuer/resource/scope binding; created by service with audit, initially denied generation and disabled provider client |
| Consent / issuance | `skip_consent:false`, signed native Allow/Deny/resume; separate DPoP sender key and nonce/replay validation; no ID-token fallback |
| Mutation Origin | Exact `https://5480-deb13.lan.com:5182`, when separately configured/activated |

The proposed operation passes the actual administrative parser and installed PostgreSQL policy constraint in an added disposable protocol case. It fits both implemented lowercase colon/dot operation grammars and the exact-match grant lookup. **No format conflict exists.** This proposal does not authorize persistent insertion; use no other operation, wildcard, workload, service or delegation grant. Existing illustrative `sandcastle:tenant.use` test vectors are retained as synthetic regression fixtures, not proposed M11 grants.

Nexus operator authorization is required for registry registration and every credential action. Resource creation additionally requires the dedicated resource privilege callback/context; ordinary client provisioning may read/link the exact resource but cannot create/update/delete one. There is no separate persisted resource-admin human role or implicit IS-admin inheritance. Better Auth remains authoritative for client credentials/redirects/keys and enforces registering-owner privileges. Nexus stores application/environment/operation association and tenant eligibility; Identity owns issuance/mappings/generations. Other operators cannot silently override native client ownership.

No public JWKS is supplied/approved. Inline JWKS is supported by pinned Better Auth 1.7.10 and strict public-only validation, so no remote JWKS URL is needed or invented. The [approval runbook](IS-0001C-APPROVAL-COMMANDS.md) specifies a Sandcastle-owned, separately approved ES256 key-generation/custody procedure. No key was generated for Development and no Sandcastle file was touched. Keep current production OIDC login separate; a future machine client is a separate approval/profile. No `client_credentials`, refresh/offline, broad service or delegation grant is requested.

## Protected live acceptance: pending, not simulated as passed

**Identity:** actual browser login/session, signed consent/rejection/resume, single audience/scopes/client binding, positive registry rows, DPoP challenge/nonce/replay, stale codes after revocation, individual token revocation, disable/re-enable, maintenance authorization and stable subject resolution all remain NOT TESTED live. Only anonymous/gate-off diagnostics above ran. A public subject must map through verified same-issuer native issuance to the stable local IS user; development/production email matches are not identity links.

**Consumer:** all four protected-route flows with zero/one/multiple memberships, inactive memberships, suspended tenants, enabled/disabled entitlements, invalid selection, cross-tenant/application mismatch, expired/revoked credentials, dependency outage and five-second deadline remain NOT TESTED live. Current 404s prove default-disabled transport only. There are no live tenant/membership/entitlement fixtures. Fixture/grant changes and disruptive dependency/revocation tests need an approved bounded window, identities and targets; do not revoke the sole operator's session or stop shared databases to manufacture evidence.

After approved dependencies, enable administration/Identity configuration separately from consumer/membership gates; stage exact resource/client/binding read-back and initially disabled client. Only after read-back, approved tenant fixtures and explicit activation approval should a real admitted identity authorize the resource grant and exercise the four-route matrix. Never extract browser cookies from the database. Record actual response fields/deadlines and redacted audit outcomes, not raw tokens/assertions/proofs. Membership is never implied by authentication, a domain or a new OAuth registration.

## Fresh validation

Node v24.22.0/npm 11.19.1. Dedicated migration rehearsal: **4 tests PASS**. Identity/administration/Consumer API protocol suite: **44 tests PASS**, preserving B's 43 cases plus proposed-operation compatibility. Existing membership PostgreSQL: **26 PASS**; provider compatibility: **31 PASS**; standard unit/route suite: **67 PASS**. Fresh route generation/typecheck and isolated webpack production build PASS with synthetic build settings and unreachable fixture DB; live `.next` and listener preserved. Expected build-only provider DB-connectivity warnings are not live readiness failures. No migration/bootstrap script was used as an audit check against an existing database.

## Verdict and approval boundaries

**Sandcastle M11: NOT READY for cutover.** Local code/schema preparation and backup/recovery evidence pass. Remaining blockers are canonical certificate/listener recovery; persistent 0011 approval; missing owner public JWKS and key custody; exact resource/client/operation review; administration/Identity configuration/provisioning approvals; separately approved tenant fixtures and consumer/membership activation; live browser/DPoP/lifecycle/four-route acceptance; cross-issuer identity-link proof if production login is retained; and production runtime ownership/grants/deployment/consumer integration acceptance.

Next concrete commands, payloads and authorities are in [the approval runbook](IS-0001C-APPROVAL-COMMANDS.md). Stop before each mutation: listener recovery; migration 0011; Sandcastle key creation; admin/Identity configuration; resource/application/client/grant registration; client enablement/actual issuance; and consumer/membership activation/fixture changes. No push, merge, deployment or other application repository change is implied.
