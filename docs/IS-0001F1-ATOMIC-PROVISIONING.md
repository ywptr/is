# IS#0001-F.1 — Atomic disabled-client provisioning

2026-11-11. Local implementation and disposable PostgreSQL evidence only. **No persistent provisioning or activation is authorized by this report.** Real Sandcastle public keys were not registered or used as test credentials. No persistent migration, dependency change, production change, push, merge or deployment occurred.

## Transaction feasibility and chosen bridge

Installed Better Auth, core, OAuth provider and Kysely adapter are pinned to **1.7.10**. Their installed implementation, rather than newer online documentation, establishes:

- `persistOAuthClientRegistration` in `@better-auth/oauth-provider/dist/authorize-dkOG8GqZ.mjs` validates the managed registration, generates the client ID, checks resource-link privileges, and uses core `runWithTransaction` plus `getCurrentAdapter` to insert `oauthClient` and `oauthClientResource`. `private_key_jwt` creates no client secret. Native create does not accept `disabled`; registration explicitly supplies `disabled:undefined`, and the adapter applies the provider's false default.
- `updateClientEndpoint` calls `ctx.context.adapter.update` directly. Calling native create and native update inside an unrelated application transaction does **not** make them atomic. Even core ambient transaction composition alone does not redirect that native update to the transaction adapter.
- The Kysely adapter detects the application's supplied PostgreSQL Pool and uses `PostgresDialect({pool:db})`; it does not create a second independently configured pool. Nevertheless, base-adapter operations can check out different physical connections. Its real `db.transaction().execute` supplies an adapter bound to one transaction connection; nested core `runWithTransaction` joins the ambient transaction.
- There is no supported managed-create disabled flag or typed OAuth-client database hook in this configuration that fixes the default. A global schema default, trigger, dependency patch or provider-wide mutation was not introduced.
- Native registration has no configured client-created webhook, email or credential-publishing callback here. The internal API return is awaited inside the transaction, never sent as an HTTP response. The bridge rejects unexpected pending after-transaction hooks before commit. Existing login hooks, Google admission and native OIDC clients are not rewritten.

The bounded compatibility bridge is `src/lib/identity/atomic-client-provisioning.ts`. It uses the exported core transaction mechanism for native creation, then **directly uses the supplied transaction adapter** to disable and read back the just-created record. This is explicit access to Better Auth-owned persistence; Better Auth remains authoritative, and no alternative credential table or hand-written provider INSERT is introduced. Native update remains appropriate for the existing later maintenance workflow, but is deliberately excluded from atomic creation.

Runtime guards require the provisioning-only Identity authority context, Better Auth context version 1.7.10, OAuth provider plugin version 1.7.10, Kysely's PostgreSQL capabilities and a real transaction callback. Existing ambient contexts are rejected rather than accidentally joining a caller-owned transaction. Inside the callback, active transaction state and a distinct transaction adapter are required **before** creation. Core's nontransactional/ALS fallback cannot silently execute the write. Compatibility tests pin all four installed lockfile versions. Custom adapters, package upgrades and new hooks require renewed review; do not remove these guards to make an upgrade pass.

## Exact operations and commit boundaries

1. The existing server-only `POST /api/nexus/registry/applications/oauth/consumer` checks its disabled-by-default gate, configured integration, exact origin, authenticated session and strict body. Identity's service checks a verified, unexpired operator session against `nexus_operators` inside transactions.
2. A per-issuer advisory lock and durable administration journal reservation enforce request-ID/actor/payload identity and serialize provisioning. Existing application/environment bindings and incomplete prior attempts block a second effective registration. The active `sandcastle` application and exact resource policy must already exist.
3. The bridge opens the **provider adapter's real PostgreSQL transaction**. Native `adminCreateOAuthClient` performs its normal authorization, schema validation, key handling and resource-link checks and joins this transaction. Native client privileges alone are insufficient: the separate `resourcePrivileges` callback must allow linking this exact audience in the provisioning context. Resource creation remains a separate, explicitly authorized resource-administration action. An IS administrator or ordinary identity is not implicitly a Nexus operator/resource administrator.
4. On that same transaction adapter: update only the newly generated `oauthClient.clientId` to `disabled:true` and update its timestamp; read that canonical row and its `oauthClientResource` links. No direct SQL credential write is used. Read-back verifies no secret, no remote JWKS URI, no client-credentials scopes, web application type, inline public JWKS, exact callback, four scopes, one audience, code-only grants/response, PKCE, DPoP, public subject and explicit consent. Any failure aborts the native transaction, including both client and resource links.
5. Commit the provider transaction only after verification. **The enabled default can exist inside the uncommitted transaction, but no other connection can observe it. The first committed client state is disabled.**
6. Read back the committed native record. In the separate existing Identity/Nexus transaction, recheck operator authority and commit application/environment association, explicit scope/operation grants, the **disabled** client epoch and completed journal result together. Provisioning does not activate issuance, create membership or grant tenant access.

The provider transaction and final Nexus/journal transaction are intentionally separate; this is not a distributed all-or-nothing transaction. If final read-back, authority recheck, binding insertion or audit completion fails, the provider client remains disabled and local grants roll back. Existing cleanup also attempts disablement, but security does not depend on that attempt succeeding: the client was already committed disabled.

## Audit, retry and reconciliation

The journal reservation must commit before any provider creation. Failure to persist it prevents all native writes. Successful retries with the same request ID, actor and digest return the saved result; changed payloads are rejected. Overlapping identical requests return one result and possibly `administration_busy`; retrying after completion returns the same client ID, not another registration.

A pre-commit failure leaves no native client/link and records failure where the journal remains available. A post-provider-commit failure leaves a quarantined disabled native client, no committed application binding/grants, and a failed journal containing its ID when known. A process death or lost commit acknowledgement can leave a `started` reservation or an unknown ID; native public metadata retains `administration_request_id` and environment, allowing an authorized operator to correlate the journal with the canonical provider record without secret access. Failed/started requests are not automatically retried into a second client, even when the journal cannot be updated during an outage.

Recovery requires an authenticated operator to reconcile that request ID against native client metadata, verify disabled status and exact profile, inspect binding/audit state, and approve a bounded repair. Do not delete journal evidence or directly edit provider tables. No automatic orphan enablement, deletion or repair endpoint is added here.

## Default-deny issuance eligibility

A client feature gate alone is insufficient. The existing binding, explicit binding scopes, active application/environment link and client revocation epoch provide an independent eligibility decision without a new migration. A missing binding denies; a staged client has a false client epoch even though its proposed binding/grants are recorded. Explicit enablement remains a separate audited action.

`consumer-integration.ts` now checks positive eligibility:

- At the real `/oauth2/authorize` hook before a logged-in user can authorize a Nexus-resource request.
- During native authorization/consent code capture before releasing successful Nexus code evidence.
- In the provider's native access-token claims extension, using the provider-authenticated client, session, user and granted scopes. In 1.7.10, `resolveAccessTokenClaims` runs before `createJwtAccessToken`/`signJWT` in `introspect-BVm_zFQC.mjs`.
- Again inside issuance-registry persistence before a response can release a credential.

The joins require current verified user/unexpired session, enabled native client/resource and resource link, exact issuer/audience/environment, active application, matching application/client/environment link, enabled binding and allowed scopes. Denied client/session/user epochs reject. Existing code-generation barriers and final issuance rechecks still prevent security revocation from being bypassed by old codes. Legacy explicitly configured bindings may omit a client epoch until issuance; missing bindings never gain eligibility. No tenant membership, entitlement or local Story/Canon/Scene permission is inferred from OAuth eligibility.

The eligibility hooks are installed with the configured Identity integration, independently of the consumer HTTP feature gate. In this unchanged development environment that integration remains off; there are no persistent resource/client records. It must be configured and separately approved before real provisioning/issuance. The native disabled flag protects a staged client even without these hooks, as the hook-free provider tests demonstrate.

## Independent-connection and regression evidence

Node **24.22.0**, PostgreSQL **17**, synthetic keys/users/apps only. The existing lifecycle harness creates a new socket-only disposable cluster; no test reads `DATABASE_URL`. An observer holds a separate PostgreSQL connection while native creation is in progress. Concurrent OAuth requests use a second Better Auth instance **without Nexus hooks** and explicitly exit the provisioner's async adapter context, so they cannot accidentally inherit its transaction.

| Probe | Evidence |
| --- | --- |
| Before provider commit | Independent observer sees zero client rows and zero resource links, including while three concurrent native authorization/token probes run |
| First visible state | After commit observer sees exactly the expected resource link and `disabled:true` |
| Native disabled enforcement | Hook-free provider returns `client_disabled` on authorization and rejects a validly signed client assertion at token authentication with `client is disabled`; no access token is returned |
| Failure before disablement | Exception after native create rolls back both canonical client and resource link; no application binding survives |
| Read-back outage | Transaction adapter's canonical-client read fails after disablement; both native records roll back |
| Initial audit unavailable | Provisioning journal INSERT failure prevents the native create callback entirely |
| Final audit unavailable | Completion UPDATE failure rolls back local linkage/grants, leaves native client disabled, and records its ID for reconciliation; retry is blocked |
| Concurrent identical requests | One effective binding/client; busy loser may retry to the identical durable result |
| Conflicting request | Changed reason/key payload under the same request ID is rejected |
| Existing clients | All pre-existing disposable OAuth client rows remain byte-for-byte unchanged |
| OAuth eligibility | Disabling the binding after obtaining a valid code rejects authorization and token exchange; no new issuance is registered. An unbound native client is denied at authorization |
| Compatibility fallback | Unprivileged call, unsupported runtime versions, nontransactional adapter and non-PostgreSQL capabilities reject before native create |

Validation commands (Node 24 PATH initialized):

```bash
npm test
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:compat
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:memberships:pg
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin npm run test:identity:administration
```

Results: **67 + 31 + 26 + 53 = 177 passing tests**, including the existing membership/Consumer API suites. Isolated `next typegen`, `npm run typecheck`, and `npm run build -- --webpack` pass. Build uses synthetic environment values and an intentionally unreachable database, generating expected schema-connectivity diagnostics; it is build evidence, not database/live acceptance. Build artifacts are outside the running development `.next` directory. No source migration, package version or HTTPS start command changed.

Live bounded read-only checks confirm trusted canonical HTTPS, homepage/sign-in/health/readiness/discovery/JWKS 200, exact issuer/token endpoint, four consumer routes and credential administration still 404 with gates off. Local `is_dev` has ten exact ledger/source checksums, 46 tables, 55 validated FKs, unchanged governance/ownership/grants, empty administration journal and zero OAuth resource/client/application/binding/operation registrations. Private development environment bytes match the earlier baseline and the recoverable backup hash still matches. A historical pre-0011 whole-table digest comparison now differs for `account` and `session` (row counts remain 1 and 2); the other 43 historical table digests match. These read-only checks establish no cause for those two differences and do not claim the whole database is byte-for-byte unchanged.

## Files and remaining prerequisites

Runtime changes: `src/lib/identity/atomic-client-provisioning.ts`, `administration.ts`, `consumer-integration.ts`, `provider-issuance.ts`, and the existing consumer administration route. Test changes: `tests/protocol/atomic-client-provisioning.mjs` and `identity-administration.mjs`. Documentation: this report and updated status links in the F provisioning plan and Sandcastle handoff. Pre-existing uncommitted F documentation is retained.

The F disabled-first-visibility implementation blocker is resolved locally for the pinned stack. Migration 0011 is already applied and was not rerun. Persistent resource/application/client/public-JWKS/operation provisioning still requires **separate explicit approval**, the authenticated operator/resource-link administration context, reviewed exact profile/public JWKS and a fresh duplicate/authority preflight. Configuration of Identity/admin capability and any gate change also require their own approval. Keep consumer gates disabled. Sandcastle still needs its actual BFF private-key-JWT/PKCE/DPoP transport and browser consent/resume integration, followed by protected live Identity and tenant/entitlement acceptance. Its repository was not modified. No new manual Google login was performed or claimed.
