# Stage 0 repository audit — 2026-11-05

## Scope and evidence

Stage 0 completed as a local source/configuration audit and documentation reconciliation. No database connection, migration, bootstrap, deployment, push, merge or consumer repository modification was performed. Database records were not read or changed. Actual deployed commit, Neon branch, applied schema, DB grants and end-to-end acceptance remain unverified. Runtime code and historical SQL are unchanged.

Requested `docs/CODEX_HANDOFF.md` is absent. Read `docs/IS_CODEX_HANDOFF.md` as the supplied equivalent, together with `docs/BACKLOG.md`; both were untracked inputs and have been preserved. The handoff's `IS_BACKLOG_2026-11-05.md` reference is stale; use `docs/BACKLOG.md`.

Checkout: `master`, HEAD `556ba88` (merge consolidating native OAuth validation), tracking locally recorded `is/master` at the same commit. Remote `is` points to `https://github.com/ywptr/is.git`. No fetch was performed, so remote freshness is unknown. Local/remote-tracking feature branches cover admissions, operators, registry, OAuth provisioning, LAN redirects and redirect cleanup. No visible SSO branch. No existing repository `AGENTS.md` was present. Initial working tree contained only the two untracked input documents. Proposed implementation branch: `feature/nexus-tenant-memberships`; PR: **Add Nexus tenant memberships and protected tenant administrator lifecycle**. No branch/commit was created during this audit.

## Implemented versus missing

| Area | Source evidence and present behavior | Gaps |
| --- | --- | --- |
| Identity | `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`: Google, seven-day IS sessions, implicit account linking disabled, password login disabled, Better Auth JWT/OAuth provider | No local OIDC integration evidence; provider verification and callback behavior need integration tests |
| Global admission/admin | `src/lib/admission.ts`, `src/lib/admin-access.ts`, `src/app/api/admin/admissions/route.ts`, migration 0001: database permit list, independent admin role, transaction audit; protects administrator emails from permit removal | No toggle, permanent block list, global directory, suspension/revocation UI or general last-admin DB invariant |
| Nexus operators | `src/lib/nexus-operator-access.ts`, operator route/page, migration 0002: independent role; final-row DELETE trigger; grant requires existing admitted identity | No DB concurrency test; direct UPDATE/TRUNCATE and powerful DB credentials are outside DELETE trigger coverage; losing login admission can make final stored operator unusable |
| Registry | Registry routes/pages and migrations 0003/0004: apps, tenants, policies, entitlements, domain mapping | No central memberships, tenant admins, invitation lifecycle, verified domains or effective consumer access decision |
| OAuth administration | OAuth provision/redirect routes, `oauth-provision.tsx`: operator session, HTTPS provisioning, PKCE required, provider API updates with read-back and Nexus snapshot | Multi-system writes are not atomic; provisioning precheck race/orphan risk; some failure paths can leave provider/snapshot drift; disable/rotation/session propagation absent |
| SSO/Billing | No 0005, `/nexus/authentication`, enterprise SSO service or Billing module in file inventory | Planned, not implemented |
| Deployment | `next.config.ts` enables React strict mode; package scripts target Next/Vercel setup | No tracked Vercel config or CI workflow found; live deployment/environment mapping unverified |

## Authorization boundaries

`/api/admin/admissions` requires a Better Auth session and `is_administrators`; `/api/nexus/operators` and all `/api/nexus/registry/*` routes require session plus `nexus_operators`. Reviewed mutations check exact configured origin with `hasTrustedOrigin`; SQL values are parameterized and domain/registry operations write audit events in transactions. Pages independently check roles. UI visibility is not the security boundary. Current APIs return 403 for absent or insufficient sessions. Registry endpoints return privileged catalog data; none is a consumer authorization API.

`auth.ts` also queries operator rights for provider client privileges. Both dynamic registration switches are false. Google is configured to require verified email and the login hook checks admission; this is configuration evidence, not proof against the installed provider's complete callback flow. Admission changes do not revoke existing sessions. Tenant policy fields do not authorize registration. Application disable is not OAuth disable. Hostnames are unverified.

New membership writes must recheck actor authority inside their transaction; current routes generally authorize before opening the write transaction, leaving a revocation race. Raw error-object logging in several routes can include SQL detail/PII; sanitize new logs and track existing cleanup separately. Membership search must not become a global directory exposed to tenant admins.

## Migration reconciliation

On disk: `0001_admission_management.sql`, `0002_nexus_operators.sql`, `0003_nexus_registry.sql`, `0004_oauth_and_tenant_domains.sql`, `0006_dev_http_redirects.sql`. No 0005. `scripts/migrate-app.mjs` takes a session advisory lock, checks SHA-256 and applied-prefix ordering, and applies each pending file plus ledger insertion transactionally. Better Auth schema is managed separately by `db:migrate`/`db:check`; running either is not a harmless local audit.

Use proposed `0007_nexus_tenant_memberships.sql`, after checking actual target ledger and outstanding branches. Inserting 0005 before an already applied 0006 violates the runner's prefix rule. Never rename, edit or delete historical 0006, even though its LAN runtime behavior was retired. Redirect editing still references its capability table. A DB with an applied missing 0005 or divergent checksum requires explicit reconciliation; do not manufacture history or edit ledger rows.

The runner does not reject duplicate numeric prefixes with distinct filenames and does not verify the target is staging. It requires a direct connection for its session lock. Runtime TLS normalization exists in `src/lib/verified-database-url.mjs`; bootstrap scripts instead use raw URLs, so the README claim of normalization across all maintenance scripts is too broad. `scripts/register-client.ts` still permits localhost HTTP and invokes a provider admin API with empty headers; its supported behavior/authority must be verified before future use. Neither bootstrap nor registration was run.

Tenant creation currently generates UUIDs and accepts no explicit legacy ID. UUID format compatibility does not prove a safe IG import; `isUuid` also imposes version/variant constraints that should be checked against real legacy IDs. Existing registry audit CHECK constraints exclude membership events; use a separate Nexus membership audit table instead of repurposing incompatible values.

## Risks and missing tests before Stage 1

1. Critical: concurrent demotion/deactivation/removal must never leave a governed tenant with zero active owner/admin members. Test real multi-connection transactions and stale snapshots; do not simply copy the operator advisory-lock/count trigger and claim proof.
2. High: email-only linking, automatic enrollment after Google login, tenant-ID spoofing, cross-tenant role lookup and operator/IS-admin inheritance would violate the contract. Add negative tests at service and route boundaries.
3. High: existing tenants have no central admins. Empty additive tables must not lock existing consumers out; require explicit operator bootstrap and a separate consumer cutover. Never auto-enroll operators or backfill from email/domain matches.
4. High: session-based authority can outlive login admission; membership changes must be checked on each protected management call. Global admission removal and tenant suspension are distinct from membership deletion. Define recovery for inaccessible final admins.
5. High: invitation replay, token leakage, email changes and concurrent redemption require hashed tokens, verified recipient binding, expiry/revoke/single-use checks and atomic audit. An invitation is not membership.
6. High: current tests cover helper policies only. `tests/email-allowlist.test.mjs` tests the old environment helper, not live database admission. No auth callback, authorization/CSRF route, cross-tenant, migration, audit atomicity, DB last-operator or last-admin, UI or consumer acceptance suite exists.
7. Operational: preserve PostgreSQL records and schema history; validate DB privileges (application roles should not bypass triggers/TRUNCATE), backups, direct TLS migration connection, target branch, restore procedure and rollout/backout before schema application.

## Local validation

Corrected validation on 2026-11-05: the host has Node `v24.22.0` and npm `11.19.1` under `/home/user/.nvm/versions/node/v24.22.0/bin`. The initial audit shell selected Node 20 because it did not initialize NVM; the development host itself was not missing the supported runtime. All subsequent Node commands initialized NVM and selected Node 24. Package version remains `0.2.0`, not a Nexus milestone indicator.

| Check | Actual Node 24 result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS: all five test files, zero failures, standard package script |
| `npm run build` inside sandbox | FAIL after compilation: `Could not parse output from TypeScript's --showConfig.` |
| `npm run build` outside sandbox, after approval | PASS: compilation, TypeScript, page-data collection, static generation and optimization complete |

The build failure is environment-dependent: direct TypeScript `--showConfig` produced valid JSON, while Next's `runTypeScriptCli` capture inside the sandbox returned exit code 0 with zero stdout/stderr bytes. The approved build outside the sandbox passed under the same Node 24/npm versions. This establishes a sandbox subprocess-output limitation; it does not require an application workaround. The precise mechanism behind the missing capture was not investigated further.

Earlier Node 20 test-command rejection and build failure remain historical observations, superseded as release blockers by the Node 24 results above. Route generation passed during the original audit; the successful build also generated route types/pages. The supplemental `tsx` run is no longer the only passing test evidence.

No dependency install/downgrade, application-code change, migration/bootstrap tooling, live API acceptance or deployment was performed. Build loaded `.env.local`; no secret values were printed or changed. A passing build does not verify live database state, Google callbacks, cross-application OIDC or the unimplemented membership security contract. Database/authorization/concurrency acceptance remains outstanding for Stage 1.

## Stage 0b documentation and architecture reconciliation

Completed after successful Node 24 validation. Updated root agent instructions with NVM initialization/fallback, corrected validation status here and in the backlog/implementation plan, documented host setup in the README, and clarified current versus planned ownership in the architecture contract. Existing `.nvmrc` (24), present at the start of this follow-up, was preserved unchanged.

Architecture reconciliation retains one deployable modular monolith, Identity-owned authentication/OAuth, Nexus-owned central memberships/admin lifecycle and future Billing-owned financial data. These ownership decisions do not assert that missing runtime features have been implemented. Consumers retain existing membership/resource enforcement until a separately authorized and tested cutover. Historical migrations and all application/database records remain untouched. Stage 1 is still planned and has not started.
