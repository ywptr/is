# Sandcastle → IG service authorization — next milestone requirements

2026-11-12. Architecture proposal only. No service registration, credential issuance, delegation endpoint, grant, audience or operation is implemented or activated here. This addendum narrows the existing [Nexus service/delegation draft](NEXUS-CONSUMER-API-CONTRACT.md), especially sections 3–8; it does not release that draft. Sandcastle's OIDC client and human Nexus Consumer API client are separate registrations and grant neither service access nor impersonation rights.

## First receiving boundary

The execution topology is **Sandcastle → IG directly**. IS Identity issues trusted OAuth credentials; IG is the OAuth resource server for its own exact audience. Nexus remains authoritative for canonical tenant governance and the future service/delegation policy, while IG enforces local job/artifact permissions and performs its own dispatch/provider work. IS must not become an HTTP execution proxy, job dispatcher or central media-generation gateway. Credential issuance and authorization decisions are control-plane interactions, not a route for media request bodies or job execution through IS.

Sandcastle requests a media-generation operation from IG for one canonical Nexus tenant UUID. IG remains the authority over its jobs, media, projects, resource ownership, role checks, allowed providers, budgets, idempotency and side effects. IS authenticates credentials and resolves subjects; Nexus evaluates current application, tenant, entitlement and operation policy. An IS operator is not an IG resource administrator.

| Context | Requirement |
| --- | --- |
| Calling identity | Registered Sandcastle **Service Client**, exact environment and verified workload principal. A name/body `caller` field or network Origin is not proof. |
| Receiving identity | Registered IG application and its IG-approved exact HTTPS API audience. Determine the actual Development audience with IG; do not substitute the Nexus audience, issuer, callback or a guessed IG URL. |
| Tenant | One canonical Nexus UUID, preserved unchanged across services, validated against the caller grant and IG resource-to-tenant association. A body/header UUID is only a requested context. |
| Human actor | Stable Identity-verified `(issuer, subject)` and explicit delegation if acting on behalf of a human. Preserve actor/caller distinction; do not infer user from client ID or email. |
| Agent actor | Separately registered agent/workload identity with an explicit grant or human delegation; record its authority and originating human when applicable. Never treat arbitrary agent labels as identities. |
| Target operation | Candidate `ig:jobs.submit` only for planning. IG must approve exact semantics, accepted inputs/resource ceiling, financial/provider permissions and authorization boundary before any registration/grant. It must not imply arbitrary job mutation, cross-tenant access, administration or delegation. |
| Entitlements | Active receiving IG entitlement for the tenant, plus explicit Sandcastle→IG service permission for that tenant/environment/operation and credential class. Human Sandcastle entitlement alone is insufficient. Existing per-application entitlement rows are not a substitute for the future service-edge grant. |

## Two authorization classes

**Independent workload:** client credentials represent the calling service itself. Use a distinct service registration, registered public keys, `private_key_jwt` assertions ≤60 seconds with exact token-endpoint audience and atomic JTI replay prevention, and a DPoP-bound access token with only the IG audience and approved operation. Service grants must explicitly authorize the tenant and task. No user membership, ID token, `onBehalfOf` body field or client-credentials subject can create human authority. Client credentials must not be added to either existing Sandcastle human client.

**Human-delegated operation:** require a fresh human authorization basis and an explicit approved delegation binding human, calling service, receiving IG audience, canonical tenant, operation, resources and expiry. Follow the draft's reviewed token-exchange/root-delegation approach only after proving provider support and approving the issuance architecture. The four implemented human Nexus endpoints do not implement exchange/delegation or authorize a service call to IG. Do not forward a human Nexus access token to IG: its audience is Nexus. Never use an OIDC ID token as an IG API credential. No email-only cross-issuer identity link.

The future issuer must carry an unambiguous credential class in authoritative issuance/grant state. IG must reject human/service/agent class substitution, wrong environment/audience, actor spoofing, broader operations and attempts to widen resource ceilings. Merely changing the new client-purpose label is not credential authorization.

## Lifetime, execution and revocation

Use the draft ceilings as proposed review inputs: workload token ≤60 seconds, human root delegation ≤120 seconds and never beyond its subject token, child execution token ≤60 seconds and never beyond its parent/root. The initial Sandcastle→IG design should minimize the number of exchanges; general multi-hop IG→Axtor delegation is deferred. Do not register Axtor audiences, grants or implicit delegation rights now.

Require live principal/client/key/token/delegation generations and tenant/application/entitlement/service-edge policy checks. No positive authorization cache. A decision may be consumed only within five seconds of snapshot acquisition and within all token/grant expiries; calls after committed revocation deny. Revoking a root, token, client, sender key, actor, service-edge permission or relevant entitlement invalidates downstream authority; re-enable must never resurrect invalidated grants. Outages/audit failures fail closed.

Long-running media jobs are not perpetual authorization leases. IG must recheck at queue dispatch, resource reads, provider submission and each consequential side-effect boundary. Define cancellation, paid provider work already committed, retry/idempotency and compensation limits explicitly. An application login session is not an execution lease. No promise of undoing already committed media/provider effects.

## Receiver enforcement and audit

IG verifies exact trusted issuer/JWKS, one receiving audience, access-token type/class, signature, lifetime, scopes/operation ceiling, current issuance/revocation registry, DPoP key/proof method+URL+token hash, nonce and replay state. Use maintained protocol primitives; no shared-secret/ID-token/Bearer fallback. Subject or grant context supplied by the caller is not authoritative. Then check canonical tenant and local resource ownership/roles before dispatch and again at execution boundaries.

Durable audit must correlate server request/decision IDs, job/idempotency reference, caller application/client/environment, receiver audience/application, verified actor class/subject and originating human if applicable, tenant UUID, operation and resource ceiling, root/parent/family identifiers when used, effective policy revisions, evaluated/expiry times, allow/deny reason, issuance/revocation events and IG side-effect outcome. Audit failure prevents an allow or newly authorized side effect. Never log raw tokens, proofs, assertions, credentials or private keys; restrict audit visibility independently.

## Entry and acceptance gates

Before implementation: IG approves operation semantics and receiving audience; owners approve workload versus delegated-user use cases, explicit service-edge grants, commercial entitlement handling, provider exchange compatibility, key custody/rotation, revocation propagation, job boundaries and rollback. Any schema and credential provisioning requires separate approval and disposable rehearsal.

Acceptance must cover valid workload and delegated paths independently, absent human proof, class confusion, cross-tenant/resource and cross-application denial, wrong audience/environment, missing entitlement/edge grant, expired/root-revoked credentials, replay/nonce failures, stale decision/queue dispatch, key/client disable and re-enable, audit/dependency outage and no secret leakage. No code in IG, Sandcastle or Axtor is changed by this plan.
