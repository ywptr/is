# Nexus v1 sequences — proposed

These flows describe the [draft contract](NEXUS-CONSUMER-API-CONTRACT.md), not implemented/deployed integrations. Each arrow is HTTPS. `T0` is a human **access** token; an OIDC ID token is used only to establish consumer login. DPoP/private-key authentication and protocol processing use vetted libraries. Every resource operation also needs local application authorization.

## Direct interactive access through a consumer BFF

```mermaid
sequenceDiagram
  actor Person
  participant BFF as Consumer BFF
  participant Identity as IS Identity (OAuth/OIDC)
  participant Nexus as Nexus v1 service
  participant DB as Module repositories
  participant App as Consumer resource service
  Person->>BFF: Login / select tenant
  BFF->>Identity: Authorization Code + PKCE S256, state, nonce, Nexus resource/scopes
  Identity->>Person: Authenticate and approve permitted scopes
  Identity-->>BFF: Code to exact registered callback
  BFF->>Identity: Backend code exchange, client auth, DPoP proof
  Identity-->>BFF: ID token for login + DPoP-bound Nexus access token T0
  BFF->>BFF: Validate OIDC response; establish local secure session
  BFF->>Nexus: GET /me/tenants, Authorization DPoP T0 + proof
  Nexus->>Identity: Verify access token/type/audience/proof/client/subject/current state
  Nexus->>DB: Filter active initialized tenants, active self membership, caller entitlement
  Nexus-->>BFF: Authorized tenant choices only (advisory snapshot)
  Person->>BFF: Request operation in selected canonical tenant UUID
  BFF->>BFF: Validate local session, CSRF and local requested resource/tenant mapping
  BFF->>Nexus: POST /access-decisions with tenant/application/operation; T0 + fresh proof
  Nexus->>Identity: Verify current caller/actor/token eligibility
  Nexus->>DB: One bounded snapshot: tenant, governance, membership, app, entitlement, versions
  alt Unavailable or unauthorized context
    Nexus-->>BFF: 200 allowed:false (no hidden context)
    BFF-->>Person: Deny without cross-tenant details
  else Effective access and durable audit
    Nexus-->>BFF: allowed:true, decision ID, versions, validUntil <= snapshot+5s
    BFF->>App: Own session, canonical tenant, resource; enforce local permissions
    App->>App: Ensure decision context/deadline match; commit locally authorized operation
    App-->>Person: Application result
  end
```

The decision proves tenant/app eligibility only. A resource not belonging to that UUID, an expired result, wrong operation, missing local permission or token/grant revocation at recheck denies. The consumer owns its own session, resources and consistency checks; Nexus does not become an application data plane. UI/metadata caches cannot authorize an operation.

## Sandcastle → IG → Axtor human delegation

```mermaid
sequenceDiagram
  actor Person
  participant SC as Sandcastle BFF
  participant AS as IS Identity / discovered token endpoint
  participant NX as Nexus policy / grant service
  participant IG as IG API
  participant AX as Axtor API
  Person->>SC: Locally authorized workflow in tenant U
  Note over SC,AX: U is one unchanged canonical Nexus UUID; local workspace/project IDs remain separate
  SC->>NX: POST /delegations with T0 + proof, tenant U, exact SC→IG→AX edges
  NX->>AS: Verify originating human token/client/key/subject
  NX->>NX: Check live membership, all app entitlements, approved operation graph; audit root
  NX-->>SC: Root G, expiry <= min(T0 expiry, now+120s)
  SC->>AS: RFC8693 exchange T0 + G, IG resource/scopes; SC private_key_jwt + DPoP
  AS->>NX: Authorize exact root edge; check active state/versions; serialize with revoke
  AS-->>SC: T1 (aud IG, human sub, act SC, tenant U, cnf SC key, <=60s)
  SC->>IG: T1 + SC DPoP proof; tenant U and local request
  IG->>IG: Validate audience/proof, local resource→U and requested operation
  IG->>AS: Client credentials for Nexus resource; IG private_key_jwt + DPoP
  AS-->>IG: IG service token M1 (aud Nexus, no human identity)
  IG->>NX: /service/access-decisions with M1/proof and T1 actor evidence
  NX->>NX: Validate intended receiver IG, live G/T1 lineage, U, actor, membership/entitlement
  NX-->>IG: Current decision; deny or valid for <=5s
  IG->>IG: Enforce IG resource roles and local authorization before onward action
  IG->>AS: RFC8693 exchange T1 + G for Axtor resource; IG auth/proof
  AS->>NX: Verify receiver IG may take exact next edge, no scope/tenant/actor escalation
  AS-->>IG: T2 (aud Axtor, same human/U, act IG with SC history, cnf IG key)
  IG->>AX: T2 + IG DPoP proof, tenant U, scoped action
  AX->>AX: Validate token/proof and local action/resource→U
  AX->>AS: Axtor client credentials for Nexus resource
  AS-->>AX: Axtor service token M2
  AX->>NX: /service/access-decisions with M2/proof and T2 evidence
  NX-->>AX: Fresh decision bound to Axtor action, U and G
  AX->>AX: Enforce local action policy; recheck deadline at execution/side-effect boundary
  AX-->>IG: Tenant-scoped result
  IG-->>SC: Locally authorized result
  SC-->>Person: Workflow result
```

Each receiving API validates the actual incoming sender proof. Parent DPoP-bound tokens are evidence for a separately authenticated, explicitly authorized receiver to exchange; they are not rebound or accepted as generic credentials at the wrong audience. The new child is bound to the exchanging sender's key. The issuer persists parent/root/recipient linkage; knowing a grant UUID or arbitrary actor header cannot request a child. Any participant can refuse independently based on local permissions.

## Concurrent authorization change

```mermaid
sequenceDiagram
  participant Op as Authorized management service
  participant DB as Nexus policy repository
  participant NX as Access/exchange service
  participant App as Consumer executor
  Op->>DB: Membership inactive / entitlement off / root revoke, audit + epoch in transaction
  DB-->>Op: Commit at time R
  App->>NX: Decision or exchange starting after R
  NX->>DB: Fresh snapshot and current family/epochs
  DB-->>NX: Ineligible/revoked
  NX-->>App: Uniform denial; no stale-cache fallback
  Note over NX,App: A positive decision whose snapshot preceded R expires no later than snapshot+5s
  App->>App: Reject stale/late response; queued work checks again at execution
```

Root exchange/revoke serialize so an exchange cannot commit a usable descendant after a completed root revoke. Cross-database consumer operations cannot be atomically rolled back by Nexus; the five-second in-flight bound and consumer compensation/idempotency policy are explicit review decisions.
