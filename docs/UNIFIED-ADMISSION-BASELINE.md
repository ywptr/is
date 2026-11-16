# Unified admission baseline — 2026-11-16

Design/dependency audit only. No runtime, schema, credential or consumer change is authorized by this milestone.

## Repository and Development

Initial working tree clean. Branch `feature/nexus-consumer-runtime`, HEAD `986c7c7d938575994de7cab11ef4f75039993674` (2026-11-14). Read-only `git ls-remote` confirms the remote branch has the same SHA. Other local/remote branches exist; no claim that their migrations have been reconciled. No fetch, checkout, commit, push or merge performed.

Development is the local native Next HTTPS deployment, not evidence about a Vercel production deployment. Current allowlisted, non-secret `.env.development.local` projection:

| Setting | Value |
| --- | --- |
| Public origin | `https://5480-deb13.lan.com:5180` |
| Issuer | public origin + `/api/auth` |
| Nexus resource | public origin + `/api/nexus/v1` |
| Environment | `development` |
| Trusted BFF Origin | `https://5480-deb13.lan.com:5182` |
| Direct HTTPS transport alias | `https://0.0.0.0:5180` |
| Membership, Identity credentials, OAuth admin, Consumer API gates | all literal `true` |

Trusted-certificate HTTPS `/api/ready` returns 200 `{"status":"ready"}` during this audit. This establishes current readiness, not the running process SHA, authenticated policy correctness or the persistent database ledger. No secrets or connection strings inspected in output; no database query or migration/bootstrap script run. Deployed process SHA, current client read-back and current ledger are not independently re-attested here. Historical records report migrations through 0012; do not use the older 0008 planning note as a new migration allocation.

## Acceptance evidence reconciled

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| [IS G activation](IS-0001G-DEVELOPMENT-ACTIVATION-RESULT.md), November 13 | Development activation, registration/fixture read-back, owner and Test 1 positive issuance | Successful protected policy acceptance; original transport guard masked deeper checks |
| [IS G.1](IS-0001G1-CANONICAL-ORIGIN-FIX.md), November 14 | Canonical transport fix; native negative probes; 84 standard, 58 protocol/administration, 26 membership checks and isolated build reported passing | Live Sandcastle Test 1/Test 2 or revocation |
| Sandcastle `backend/docs/M11_RESUMED_ACCEPTANCE_2026-11-15.md` (read-only sibling inspection) | Startup corrected; latest user-supplied 200 discovery shows A+B for retained owner; runtime subject corroborates owner | Test 1: report explicitly identifies wrong test identity. Test 2 and live revocation remain pending |
| Sandcastle `backend/docs/M11_TENANT_ACCEPTANCE_CHECKLIST.md` and `M11_DEVELOPMENT_LIVE_ACCEPTANCE.md` | Expected subject gates and policy/restoration matrix | A completed signed-off matrix |
| `/tmp/sc-m11-acceptance-response.json` | Anonymous authentication-required response | Authenticated acceptance |

Latest available evidence therefore does **not** establish a Test 1 pass, Test 2 pass or live revocation pass. Owner discovery is a narrower positive result, not a substitute. No new interactive test or fixture mutation was attempted. Sibling evidence paths are workspace-local, not committed IS artifacts; a release needs durable sanitized receipts in the owning repository.

## Remaining IS#0001 / M11 release blockers

1. Correct-identity Test 1 A+B; Test 2 A-only and direct B denial, with verified stable subjects and fresh consent.
2. Authenticated four-route binding, tenant selection, zero/one/multiple tenant behavior, cross-user/app/tenant denial and local resource ownership evidence.
3. Live membership/entitlement revocation and restoration, suspended/inactive cases, client/token lifecycle, DPoP nonce/replay, credential-class rejection and dependency/audit failure. Use approved audited administration; preserve retained owners.
4. Consumer enforcement of five-second decision deadline at actual execution and queue boundaries, no positive cache, no stale fallback. Existing Stories remain user-owned; canonical resource migration/cutover has not been proven.
5. Immutable deployable release checkpoint, actual process/environment/ledger/runtime grants, rollback rehearsal and independent consumer sign-off before release. Production target, TLS, credentials and deployment require separate approval.

These are acceptance/dependency gaps, not findings that the canonical-origin correction failed. The new architecture must not be used to bypass existing acceptance.

## Consumer inventory and limits

Four live handlers exist under `src/app/api/nexus/v1`: discovery, membership, access decision and entitlement. Sandcastle `backend/app/auth/nexus.py` calls all four, validates its copied `nexus_contract.json`, pins four scopes and keeps a selected tenant in a subject/session-bound ephemeral grant. Restarts require fresh consent. Separate Basic OIDC login and private-key/DPoP resource clients must remain compatible.

Read-only searches of available IG backend/app, Axtor src and Nexus src locations found no additional four-route callers; this is bounded source evidence, not an organization-wide usage census. IG remains a planned consumer/service receiver. Axtor runtime authorization is future work. Unknown deployments, scripts or external clients must be inventoried through registry review and redacted usage evidence before any deprecation. No consumer repository modified.

Fresh local validation for this documentation change is recorded in the [migration plan](UNIFIED-ADMISSION-MIGRATION.md). Historical checks above retain their original dates and scope.
