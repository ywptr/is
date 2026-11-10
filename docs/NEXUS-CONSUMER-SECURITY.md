# Nexus consumer API threat model and negative-test matrix

Draft for [v1 contract review](NEXUS-CONSUMER-API-CONTRACT.md). Test cases below are **planned Stage 2 tests**, not executed evidence. Existing Stage 1 regression validation is recorded separately in the implementation plan. No Stage 2 route or token exchange is implemented yet.

## Assets, trust boundaries and attacker model

Assets: canonical tenant mappings, verified identity links, shared role/status, app entitlements, service tenant grants, delegation family lineage, OAuth/DPoP keys and tokens, last-active-admin governance, audit integrity and consumer resource isolation. Boundaries: browser→consumer BFF; consumer→IS resource API; Identity issuance/validation→Nexus policy; Nexus service→repositories; operator-management→consumer routes; IS→IG→Axtor resource execution; Billing→service/event interfaces. One deployment does not erase these boundaries.

Attackers may be unauthenticated, an active member of a different tenant, an inactive/former admin, an ordinary IS administrator without Nexus rights, a registered but ungranted client, a malicious/compromised consumer, a replaying network client, or a confused downstream service. Trusted operations may make configuration mistakes or concurrent policy changes. Database owners, compromised issuer/signing keys and fully compromised authorized service keys are privileged threats requiring operational recovery; the contract cannot claim to prevent every action by those principals.

| Threat | Control / safe outcome | Residual risk / release gate |
| --- | --- | --- |
| ID-token or wrong-audience substitution | Typed, single-audience DPoP access tokens; issuer/type/client/grant check; no admin adapter | Provider must prove token-type separation; cryptographic validation alone is insufficient |
| Forged caller/actor/tenant headers | Derive caller/actor from verified credentials and live family; strict body schemas; authorize canonical tenant | Compromised legitimately delegated app can act within its authorized ceiling until revoked |
| Confused deputy / arbitrary impersonation | Exact receiver/edge graph, actor/tenant invariance, root source-token binding, own-app-only decision reads | Local resource authorization remains mandatory; broad operation definitions are a policy risk |
| Cross-tenant discovery or IDOR | Effective app-scoped discovery; self membership; uniform denial/404; opaque bound cursors | Timing/size side channels need measurement and rate limits, not merely generic messages |
| Stolen/replayed tokens/proofs | DPoP with global replay/nonce store; short TTL; private-key client assertions and replay store | Lost/compromised sender keys need immediate issuer/client/family revocation; keys never in browser JS |
| Forwarding parent token to wrong hop | Single audience; new exchange per receiving resource; leaf proof validation | Receiver must distinguish actor evidence from request credentials; no library shortcut that skips audience checks |
| Revocation race or stale allow | One bounded snapshot, live grant/client state, epoch checks, zero allow cache, <=5s consumption | Already committed side effects cannot be undone by Nexus; queue dispatch rechecks and compensation required |
| Recreated membership/entitlement resurrects grant | Monotonic tombstoned epochs; grant version binding; family invalidation on relevant change | Migration/maintenance paths must bump epochs too; timestamps alone cannot do this |
| Domain hijack / Host spoof / SSRF | Association-specific explicit approval, canonical host grammar, effective visibility, no request-triggered fetch | Ownership verification and approval administration need a separate authorized workflow |
| Last-admin regression | Leave 0007 immutable; rerun concurrent admin invariant tests alongside new version triggers | DB owners can disable triggers; runtime roles must lack DDL/ownership |
| Audit forgery/leak/DoS | Durable redacted security audit, request IDs, strict retention/access; aggregate unauthenticated failures | Audit availability becomes an allow-path dependency; bound latency/storage and test failure modes |
| Fail-open rollback or dependency outage | Gate 503, no stale/fallback grants; freeze cutover cohorts during incompatible rollback | Consumer app teams must approve fail-closed outage behavior and 5s budget |
| Cross-environment key/client confusion | Exact issuer/resource/client binding plus environment-specific grants | Deploy/secret review must prevent preview clients or DB URLs reaching production |

## Negative-test matrix

| ID | Input / interleaving | Required assertion | Test layer |
| --- | --- | --- | --- |
| AUTH-01 | Missing token; IS cookie only; ID token; ordinary Bearer; tampered JWT | 401, no tenant lookup or token/PII log; standard challenge | HTTP + Identity integration |
| AUTH-02 | Wrong issuer/audience/type/algorithm, missing `cnf`/client/jti/expiry; multiple audiences | Reject, including otherwise valid signatures | Verifier vectors + HTTP |
| AUTH-03 | Expired/not-yet-valid token, future `iat`, excessive clock skew | Reject; no skew extension of root/child expiry | Fixed-clock unit + integration |
| AUTH-04 | DPoP wrong key/method/URL/token hash, stale nonce/proof, reused `jti` on another instance | Reject or nonce challenge; one replay accepted at most, no alternate Bearer path | Real issuer/client + shared-store concurrency |
| AUTH-05 | Replayed private_key_jwt, assertion for another endpoint/client, unregistered key | Token endpoint `invalid_client`; no issuance | Provider integration |
| AUTH-06 | Valid client but no Nexus scope/resource grant; disabled client/app; wrong environment | 403 before target lookup or generic decision denial as applicable | HTTP + PostgreSQL |
| AUTH-07 | Valid consumer token calls admission/operator/registry/membership-management writes | Existing session/role/origin checks still deny; no inherited operator privileges | Regression HTTP |
| TEN-01 | Unknown vs other-tenant UUID/domain, suspended tenant, absent governance | Same 200-deny or 404 lookup shape; no names/versions/count leak | HTTP + query assertions |
| TEN-02 | Inactive/absent self membership, pending invitation only, role demoted | Human decision denied, discovery omits; role does not grant local resource access | PostgreSQL + HTTP |
| TEN-03 | App disabled, entitlement missing/disabled, caller requests another application | Deny; hidden entitlement GET unavailable; no billing dependency | PostgreSQL + HTTP |
| TEN-04 | Host/X-Forwarded-Host/X-Tenant-ID differs from authorized context | No authority from headers; request cannot retarget actor/tenant | HTTP |
| TEN-05 | Legacy/unapproved/expired/revoked/domain transfer, IP/URL/wildcard/mixed-IDNA input | No unauthorized resolution or network lookup; canonical approval binding required | Parser + PostgreSQL + no-network assertion |
| TEN-06 | Cursor replayed for other actor/client/epoch/filter or forged/expired/oversize cursor | Reject without disclosing hidden tenants; reauthorize every page | HTTP + cursor-library tests |
| TEN-07 | User token attempts arbitrary `userId`, service principal without grant supplies human actor | Strict-schema reject; no user-directory/membership oracle | HTTP |
| SVC-01 | No actor evidence on workload request without explicit tenant/operation grant | Deny; cannot infer a human actor or downgrade failed human proof | PostgreSQL + HTTP |
| SVC-02 | Service submits human evidence issued to a different receiver/tenant/family | Deny; Nexus verification interface cannot be generic cross-audience token laundering | Identity/Nexus integration |
| SVC-03 | Agent instance header, email or arbitrary provider assertion impersonates human/registered agent | Reject; only verified Identity principal and live grant accepted | HTTP |
| DEL-01 | Root request supplies actor/caller, source token/client/key mismatch, inactive member/app edge | Reject or uniform denial; no grant/issuance/audit success | HTTP + PostgreSQL |
| DEL-02 | Exchange ID token or third-party token; actor_token supplied; arbitrary audience; multiple resources | Standard OAuth error; no child token or spoofed act | Real provider exchange |
| DEL-03 | Parent for IG reused by Sandcastle/another service, wrong root/source jti or parent absent | Reject; receiver auth and persisted edge/family required | PostgreSQL + exchange integration |
| DEL-04 | Child changes tenant/subject, adds operation/resource/edge, broadens scope, loops or third hop | Reject; keep original human and canonical tenant; narrow ceiling only | Policy/property tests + integration |
| DEL-05 | Grant ID known but no valid source token; token renewed to extend family; old epoch reactivated | Reject; grant ID not a credential; absolute lifetime/nonresurrection | Fixed-clock PostgreSQL tests |
| DEL-06 | Root revoke races exchange on independent connections | Exchange after committed revoke cannot produce usable descendant; all child checks deny | PostgreSQL barriers + provider HTTP |
| DEL-07 | Revoke unknown vs hidden family; participant attempts another workflow | Same 404; no revocation/metadata leakage | HTTP + PostgreSQL |
| REV-01 | Membership deactivate, entitlement disable, tenant suspend or app/client disable before snapshot | All subsequent snapshots deny, no allow-cache fallback | Independent-connection PostgreSQL + HTTP |
| REV-02 | Those changes race decision; deliberately delay response/execution beyond 5s | Earlier allow expires by snapshot+5s; consumer rejects delayed response; queue rechecks | Clock/barrier + stub consumer executor |
| REV-03 | Delete/recreate membership, entitlement, grant or client binding | Epoch does not reset; prior family remains unusable | PostgreSQL migration + property tests |
| REV-04 | Provider/token/session/root revocation with cryptographically unexpired JWT | Live validation denies immediately for later snapshots | Provider + Nexus HTTP |
| REV-05 | Database/Identity/replay-store/audit outage or timeout | 503/standard proof error, no cached allow or log leakage | Fault injection |
| DB-01 | Add new revision triggers to 0007 schema, concurrent final-admin demotion/deactivate/delete | Same last-admin invariant, no deadlock cycle or counter drift | Stage 1 suite + PostgreSQL stress |
| DB-02 | Existing sessions/clients/tenants/domains/entitlements before additive migration | IDs/records/history preserved, approvals not inferred; prior code compatible | Disposable fixtures + schema diff |
| DB-03 | Transaction audit failure during grant/approval/revoke/exchange or decision | No successful allow/usable issuance; rollback/outbox consistency | PostgreSQL fault injection + provider failures |
| DB-04 | Lost update or bulk/admin/direct maintenance changes skip version advance | Trigger/epoch invariant rejects or advances correctly; no silent old-version allow | Real SQL + multiple isolation levels |
| OPS-01 | Gate off, migration present but flag unset, old deployed code, provider spike incomplete | No consumer release; 404 gated routes/503 dependency readiness; existing login intact | Environment matrix + HTTP |
| OPS-02 | Cutover rollback/outage after recorded revocation | No legacy-policy bypass, no dropped tables/ledger or restored stale grant | Isolated release rehearsal |
| DATA-01 | Same local resource ID belongs to another canonical tenant | Stub consumer denies before read/write; Nexus decision cannot substitute resource proof | Future consumer handoff contract test |

## Evidence required before acceptance

Test layers are deliberately separate: pure policy tests cannot prove revocation concurrency, mock auth cannot prove issuer/DPoP correctness, and a passing build cannot prove consumer execution deadlines. Use disposable local PostgreSQL fixtures and a real test Identity provider/client configuration after runtime implementation is approved. Do not use production credentials or `DATABASE_URL` as test defaults. Add HTTP tests against the actual handlers as well as dependency-injected policy tests. Run the immutable Stage 1 last-admin suite on every schema/authorization change. Consumer stub tests belong in IS for contract conformance; actual IG/Sandcastle/Axtor changes require separate authorization and acceptance.


## Stage 2D local evidence reconciliation — 2026-11-10

The [Stage 2D report](STAGE-2D-NEXUS-CONSUMER-RUNTIME.md) records the default-disabled four-human-route implementation and [Sandcastle handoff](SANDCASTLE-M11-NEXUS-HANDOFF.md). This does not mark all planned cases above implemented. Workload/delegation/domain tests remain deferred.

`npm run test:consumer:pg` runs the pinned-provider disposable PostgreSQL fixture and real TCP HTTP transport through production handler factories. It proves self discovery/pagination, hidden tenant contexts, own-app-only entitlements/decisions, second registered human isolation, actor/header rejection, credential type/audience/signature/positive-registry denial, resource nonce/replay, code-generation and pre-profile token rejection, audit rollback, independent-connection membership/entitlement revocation snapshots and expired-response denial. Existing Identity tests prove pairwise mapping, shared cross-process proof replay and database stop/restart recovery; existing Stage 1 tests preserve authorization/CSRF, last-admin concurrency and migration compatibility. No live TLS/Google/browser/consumer acceptance is inferred.

Remaining release work includes actual Next/HTTPS/proxy/browser consent resume, approved target migrations and database privileges, audited client/operation provisioning, incident invalidation/recovery governance, current-security policy review, cleanup/perimeter limits/load testing and independent Sandcastle operation-deadline/resource permission acceptance. A global suspension feature is not introduced. Bound consumer native administration is denied rather than silently bypassing generation invalidation. All consumers must fail closed; current flags remain unchanged.
