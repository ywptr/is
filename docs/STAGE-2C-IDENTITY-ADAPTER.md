# Stage 2C — Identity credential adapter

Stage 2C.2 implementation follow-up: [Identity credential lifecycle](STAGE-2C2-IDENTITY-LIFECYCLE.md) adds disabled registry, provider-hook, subject and nonce factories plus candidate 0008 and disposable protocol tests. This supersedes the earlier absence of supporting infrastructure only; production administration/security hooks and activation acceptance remain blocked. Original findings below are retained as dated evidence.

2026-11-10. Bounded local implementation authorized by the Stage 2C request. This supersedes documentation-only authorization for this adapter slice only. No consumer routes, provider configuration changes, migrations, production changes or consumer repository changes are included.

Stage 2C.1 follow-up: [credential lifecycle assessment](STAGE-2C1-CREDENTIAL-LIFECYCLE.md) recommends JWT plus positive issuance/revocation state and proposes maintained JOSE composition for resource-server nonces. It establishes opaque resource/DPoP capability but identifies provider-wide OIDC compatibility and lifecycle gaps. This is a plan for review; the adapter and its mandatory dependency blockers remain unchanged.

**Blocked for release.** Better Auth 1.7.10 cannot supply the mandatory server-nonce policy or individual JWT revocation. Those affected integration paths are stopped. No production adapter instance is exported or connected to application auth. Dependency-injected conformance success is not production readiness.

## Implementation and trust boundary

[Adapter and interfaces](../src/lib/identity/access-credentials.ts): `createIdentityCredentialAdapter(policy, dependencies).validateAccessCredential(request, requirements)` returns an immutable, typed human credential context with a private symbol brand. Identity owns validation and exact subject resolution; no tenant authority, roles or membership are returned.

The policy pins issuer, single resource audience and environment at construction. Trusted JWKS acquisition is injected; token issuer, `jku`, forwarded headers, request bodies and identity hints never choose keys or policy. This profile pins EdDSA access signatures and ES256 DPoP signatures to the tested provider fixture. Adding algorithms requires separate interoperability review. Mandatory claims include issuer, subject, audience, expiry, issued-at, token ID, client ID, session ID, scopes and confirmation key. It enforces `at+jwt`, scalar exact audience, <=300-second lifetime, integer times, zero access-token clock tolerance, no `offline_access`, and rejects actor/delegation claims. ID tokens, opaque tokens, Bearer credentials and cookies cannot authenticate it.

Better Auth's vetted `verifyJwsAccessToken` and `verifyDpopProof` perform cryptographic validation. Proof verification uses actual `Request.method`, `Request.url`, `ath` and the token's confirmation thumbprint. The proof window is 60 seconds with the provider's maximum five-second future tolerance. A replay store is mandatory; no process-memory default is selected. Production integration must use `createDpopReplayStore` with database-backed verification reservations. PostgreSQL protocol tests prove cross-context atomic reservation; test-double reservations in the unit suite prove composition only.

Transport MUST construct the Request with the canonical externally requested HTTPS URL from trusted routing configuration. Do not reconstruct it from arbitrary forwarded headers. The adapter requires the audience origin, ignores query/fragment for DPoP only as the protocol library specifies, and refuses HTTP. Future handlers must implement their own bounded request handling, error/status mapping, no-store headers and rate limits. No HTTP error endpoint or nonce challenge endpoint is added here.

Errors are sanitized `CredentialError` codes: invalid token, invalid proof, insufficient scope, or Identity unavailable. JWKS/replay/lifecycle outages are unavailable. Nonce dependencies may return a typed protocol rejection; unexpected failures become unavailable. Missing dependencies never permit partial success. No credentials or dependency error objects are logged.

## Online validity and revocation blocker

`readCurrentState(reference)` is the mandatory uncached Identity lifecycle interface. Its reference includes issuer, subject, client, token `jti`, session, resource and environment. A successful result must establish all of:

- Known human authorization-code issuance, active provider client, session and user; no service-class inference from subject spelling.
- Current individual-token validity, including revocation; unknown issuance denies.
- Exact active application/environment/resource binding. Registration alone is insufficient.
- Exactly one authoritative subject mapping to the IS user. Ambiguous or unsupported mappings deny.

The adapter compares the returned reference against every input field. False, missing or revoked state denies. Positive contexts are not authorization leases: future Nexus policy must re-read Identity eligibility in its same bounded consistent policy transaction before audit/allow. This slice does not implement that Nexus transaction or a positive cache.

Pinned provider introspection demonstrates session deletion and client disable, but JWT revocation returns `unsupported_token_type` and introspection remains active. The existing `oauthAccessToken.revoked` column serves persisted opaque credentials; its existence is not proof that self-contained JWT `jti` values are registered/revocable. The current schema also has no complete user-suspension policy or authoritative human JWT issuance registry. Consequently no introspection-only lifecycle implementation is supplied.

Reviewable implementation options before rollout:

1. A maintained provider version/integration with explicit JWT lifecycle, human grant metadata, online current eligibility and tested individual revocation.
2. Separately reviewed Identity-owned issuance registry with `(issuer,jti)` identity, immutable client/session/user/resource/environment linkage, explicit grant class and subject namespace, expiry and revocation state. Persist and audit issuance before usability; unknown/pending issuance must deny. Revoke atomically and read uncached in the decision snapshot. Schema, provider hooks, privileges, audit and concurrency require separate review before any migration or application.

Neither option is implemented or approved by this document. No provider table is written by the adapter, and secret rotation/session removal is not represented as complete token revocation.

## Nonce blocker

`nonce.validate({proof,keyThumbprint,resource})` is mandatory and runs only after signature, request/hash/key binding and shared replay reservation. It must validate a nonce from that signed proof using shared server-issued state scoped to resource and sender key, with expiry and a reviewed challenge/renewal policy. Failed nonce checks consume the proof reservation; clients must create a fresh proof when retrying.

The pinned verifier neither accepts an expected nonce nor returns a validated nonce. No bespoke nonce protocol, custom JWT crypto, memory-only nonce service or waiver is introduced. A maintained verifier/provider integration supporting server nonces and an approved resource-server challenge policy is required. The adapter intentionally remains unavailable with the current provider integration. Unit nonce checks use an explicitly labelled test double to exercise missing/arbitrary/stale nonce denial and dependency failure; they do not prove a working nonce protocol. Real provider tests assert the missing feature remains missing.

## Subject resolution

`resolveSubject(reference, mappings)` implements exact Identity-owned mapping selection: exactly one row with matching issuer, access subject and client, an explicit supported namespace, and a nonempty IS user ID. Duplicate rows (even duplicates with the same ID), unknown namespaces and mismatches deny. Rows must originate from verified issuance or explicit identity-link evidence, never callers.

Provider fixtures establish that public and pairwise-client **access JWTs** use the stable provider access subject, while pairwise ID tokens and introspection can expose a different pairwise subject. Therefore introspection `sub` must not replace the validated JWT subject or be treated as a user primary key. The resolver supports explicit pairwise mapping rows; it does not invert pairwise hashes or discover links. No matching UUID, email lookup or token-string equality supplies identity proof. Persistent mapping acquisition remains part of the blocked lifecycle integration.

## Audience, provisioning and consent sequence

The isolated fixture now requests a 300-second access lifetime and tests the resource-only flow. Real combined `openid` + resource authorization yields Nexus plus UserInfo audiences and is rejected by the adapter; the resource-only flow yields one Nexus audience and no ID token. This does not change any existing client.

For a separately authorized environment rollout:

1. Preserve existing Google login and OIDC registrations. Approve an exact HTTPS Nexus resource, environment-separated caller/client binding, supported scopes and asymmetric client authentication keys. Provision through supported privileged provider APIs with persisted read-back and audit; no passive startup seeding.
2. Obtain OIDC login/consent through the existing client, validating state, nonce, issuer and exact client audience in the consumer. This login grants no Nexus access.
3. Perform a separate authorization-code + PKCE S256 transaction requesting only the approved Nexus scopes and exactly one resource, omitting `openid`, `profile`, `email` and `offline_access`. Use fresh state/verifier and a DPoP key binding; authenticate the confidential client with reviewed `private_key_jwt` support. Do not silently extend existing grants. Require explicit resource consent, or a separately approved and audited first-party consent policy.
4. Redeem with the same exact resource and DPoP key, and verify persisted client/resource grants. Expect no ID token from this transaction. Enforce the full online lifecycle and server-nonce policy before any Nexus API is released.

The compatibility fixture uses synthetic administrative consent bypass to isolate protocol issuance. It proves audience behavior, not browser consent or approval of a first-party policy. Existing production clients, scopes and resources remain untouched.

## Local HTTPS acceptance procedure

The existing native HTTP development listener/base URL is preserved. Stage 2B observed `http://5480-deb13.lan.com:5180` locally while provider discovery canonicalized its issuer to HTTPS. Do not use that HTTP origin for adapter acceptance, and do not edit production issuer semantics.

For separately provisioned local acceptance, use the same development host with a trusted HTTPS reverse proxy on a dedicated test port/origin, or Next's HTTPS development mode with an explicitly trusted local certificate. Preserve the active listener. Use a dedicated isolated provider database/client and configure its `baseURL` as the exact HTTPS origin, keeping the provider's `/api/auth` issuer path. Trust the development CA in browser and Node; never disable TLS verification or use `curl -k`. Review development Google callback and consumer redirects before provisioning any new local registration.

Read discovery through HTTPS and compare its literal issuer against access-token `iss`, token/JWKS endpoints and the configured adapter issuer. Verify chain/hostname trust. Exercise Google login, logout and existing OIDC login separately; then resource-only authorization, DPoP request binding, shared replay, nonce challenge/renewal, revocation and cross-environment rejection. Check proxy canonical Request URLs at the handler boundary. Any issuer difference blocks acceptance. Do not rewrite tokens, relax issuer checking, or add LAN HTTP exceptions.

Current automated fixtures use trusted HTTPS-shaped `Request` objects passed in process, without network TLS. No trusted certificate, reverse proxy, Google browser acceptance or live HTTPS token round trip was provisioned/tested in this change. Native HTTPS acceptance remains a rollout gate.

## Preparation and validation evidence

Branch `chore/local-dev-infra`, HEAD `7f4b46c`. Existing edits to README, contract, implementation plan and package.json, plus untracked Stage 2B report/fixtures, were preserved. No branch switch, reset, commit or remote operation occurred. No competing 0008 appears in locally available migration history; remote freshness is unverified. No migration is proposed by this slice.

Read-only, explicitly guarded local schema inspection verified `127.0.0.1:5432/is_dev`, role/owner `is_dev`. Six ledger entries exactly match source 0001–0004, 0006, 0007; all 42 public FKs are validated. Provider client, resource, verification, session and opaque access-token tables and Nexus client linkage exist. Only schema/catalog/ledger information was read, not credentials or user records. No migration/bootstrap command was used for inspection.

Node v24.22.0 / npm 11.19.1. Results are recorded after final checks below. Disposable PostgreSQL suites never read `DATABASE_URL`; only their fresh synthetic clusters receive schema setup and test mutations. Production build uses synthetic settings with an unreachable loopback database. No deployment/cross-application acceptance is claimed.

Release requires a reviewed nonce integration, individual JWT lifecycle/eligibility persistence, trusted subject mapping acquisition, shared replay operations, same-snapshot Nexus rechecks, scoped provisioning/consent review, native HTTPS/browser acceptance and separate deployment authorization. No consumer route should import an incomplete production adapter. Rollback removes unused adapter imports/code without deleting state; any future issuance/revocation records must be retained.

| Final check | Result |
| --- | --- |
| `npx next typegen` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS; outside-sandbox equivalent `node --test --experimental-strip-types tests/*.test.mjs` exposes all 63 passing tests (36 new adapter cases including subtests, 27 existing) |
| `npm run test:identity:compat` | PASS, 19 tests including parent; real pinned provider, resource-only token adapter probe and shared PostgreSQL replay races |
| `npm run test:memberships:pg` | PASS, 26 tests including parent; immutable migration compatibility, last-admin races at both isolation levels, cross-tenant denial and audit rollback |
| `npm run build` | PASS outside sandbox with synthetic build settings; expected unreachable-database schema warnings; no new Nexus endpoints |
| `git diff --check` | PASS |

The initial PostgreSQL sandbox runs failed; their outside-sandbox reruns passed. The sandbox build compiled but failed to capture TypeScript `--showConfig` output, reproducing the documented environment limitation; its outside-sandbox rerun passed. Generated `next-env.d.ts` routing imports were restored to their pre-task development paths after validation. No original uncommitted changes were removed.
