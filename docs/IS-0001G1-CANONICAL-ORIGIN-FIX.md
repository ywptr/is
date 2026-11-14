# IS#0001-G.1 — canonical Consumer API request URL

2026-11-14. Targeted Development runtime correction implemented and locally verified. **Protected Sandcastle retry and M11 acceptance remain pending fresh user consent.** No migrations, database writes, OAuth/client/key changes, fixture changes, production changes or Git commits/pushes occurred. The pre-existing uncommitted activation-report edit was preserved.

## Exact root cause

`createConsumerHandler` rejected `new URL(request.url).origin !== publicOrigin` with `401 invalid_dpop_proof` before request parsing, Identity or DPoP validation. A temporary, credential-free native HTTPS diagnostic confirmed:

```json
{"origin":"https://0.0.0.0:5180","host":"5480-deb13.lan.com:5180","forwardedHost":"5480-deb13.lan.com:5180","forwardedProto":"https"}
```

The pinned Next.js `next-server.js:attachRequestMeta` constructs `initURL` from `fetchHostname` and port. The existing native HTTPS startup binds `0.0.0.0:5180`. `base-server.js` supplies missing X-Forwarded fields and retains caller-supplied values. Request.url therefore was a bind URL, despite valid public authority. This was unrelated to a missing browser Origin. The temporary instrumentation was removed; no tokens, proofs, assertions or cookies were logged.

The Identity adapter independently requires the public HTTPS origin and passes Request.url/method to the pinned DPoP verifier. Merely removing the HTTP guard would leave that rejection or cause incorrect htu verification.

## Correction and trust model

`canonicalConsumerRequest` validates the incoming URL and authority before creating the Request passed to Identity. The public origin remains derived from the configured Nexus audience. An optional exact `NEXUS_CONSUMER_DIRECT_HTTPS_ORIGIN` allows the known native bind origin; Development's ignored `.env.development.local` now explicitly sets `https://0.0.0.0:5180`. The existing Next development process automatically reloaded the environment and source; no controlled restart was necessary. Native HTTPS command, certificates, gates and other environment values were preserved.

This alias configuration is for a direct Next HTTPS listener with **no plain HTTP or proxy ingress**. It is not a trusted-proxy mode. Do not enable it behind a TLS-terminating proxy: a separately verified proxy trust boundary would be required. Missing alias configuration retains canonical-origin-only behavior; malformed configuration fails closed with 503.

- Request URL must be HTTPS and use exactly the public origin or configured transport origin; credentials/fragments are rejected.
- Host must exactly equal public hostname and port. Missing, alternate, list or malformed authority fails closed.
- X-Forwarded-Host, Proto and Port, when present, must exactly match public host, `https` and public port. Conflicting/list/spoofed values fail closed. Matching values never select authority or prove TLS; the direct TLS listener is the deployment boundary. Arbitrary RFC Forwarded metadata is rejected. X-Forwarded-For is not used for authority.
- Only the validated public origin supplies the reconstructed URL. Path and query are preserved, including explicit default-port clearing; method, headers and body are retained. No internal URL is sent to the DPoP verifier.
- Browser Origin is separate. GET without Origin is accepted through the transport boundary. A supplied Origin must match the existing exact HTTPS BFF allowlist. POST retains its existing mandatory approved Origin/JSON/body restrictions. No cookie/Bearer fallback exists.
- Administrative and membership route Origin/session/CSRF code is unchanged. Tenant/app authorization and Identity crypto/nonce/replay/issuance policy are unchanged.

## Before and after native HTTPS behavior

| Probe | Before | After |
| --- | --- | --- |
| GET tenants without Origin/credentials | 401 invalid_dpop_proof at origin guard | 401 invalid_token from Identity, DPoP challenge |
| GET tenants with malformed limit | 401 invalid_dpop_proof | 400 invalid_request |
| Wrong Host or conflicting forwarded authority/protocol/port | masked by bind-origin failure | 401 invalid_dpop_proof |
| GET with approved browser Origin | masked | reaches Identity; anonymous remains 401 invalid_token |
| GET with foreign Origin | masked | 403 invalid_request |
| Decision POST missing/foreign Origin | masked | 403 invalid_request |
| Decision POST approved Origin and valid JSON, anonymous | masked | 401 invalid_token |
| Cookie, invalid credential | masked | 401 invalid_token |
| Forged actor header | masked | 400 invalid_request |
| Plain HTTP on 5180 | not part of prior receipt | connection ends with no HTTP response; no downgrade entry |

All 16 native HTTPS probes used trusted certificate/hostname verification and returned no-store responses with request IDs. The diagnostic HTTP client's SNI remains the canonical hostname even for a deliberately wrong HTTP Host; TLS verification was never disabled.

## Regression and DPoP evidence

Host Node v24.22.0 / npm 11.19.1:

| Check | Result |
| --- | --- |
| Standard regressions | 84/84 pass |
| Identity lifecycle / administration / Consumer API, disposable PostgreSQL | 58/58 pass |
| Pinned-provider compatibility, disposable PostgreSQL | 31/31 pass |
| Membership concurrency / authorization / CSRF / audit / migration compatibility, disposable PostgreSQL | 26/26 pass |
| Native Development HTTPS negative/authority matrix | 16/16 pass |
| Next route generation and TypeScript | pass |
| Isolated production webpack build | pass |
| git diff --check | pass |

The TCP protocol harness now models the native bind URL and carries the external Host using the native HTTP client. The real adapter, provider, shared nonce/replay stores and synthetic PostgreSQL policy state receive the reconstructed external URL. Positive discovery/decisions, nonce challenge/retry, identical-proof replay race, wrong hash/token, cross-user/app/tenant denial, revocation, audit atomicity and outage tests pass. Existing adapter tests verify htu/htm/key/hash/nonce/replay, and the new bind-origin test proves external signed htu succeeds while an internal bind htu, different external htu, wrong method/hash/nonce and reused proof fail. Those are synthetic protocol tests, not live Sandcastle token acceptance.

Initial failures were resolved: the new test caught retention of a bind port when switching to a default-443 authority; URL.port is now explicitly set. Node fetch did not preserve the synthetic external Host, so the protocol client now uses native HTTP. The first isolated build lacked synthetic Google variables; rerun with all required synthetic settings passed. Compatibility's initial run lacked the explicit PostgreSQL binary setting; the configured rerun passed. Sandbox child-test output was incomplete; final host-run 84-test results establish the full count.

Build used `/tmp/is-g1-build` with no Development environment files, synthetic credentials and an unreachable synthetic database; live `.next` was not replaced. Route generation's next-env.d.ts change was restored to its original Development type imports and typecheck rerun successfully.

Host receipts: `/tmp/is-g1-transport.json`, `/tmp/is-g1-live2.jsonl`, `/tmp/is-g1-unit-final.log`, `/tmp/is-g1-protocol3.log`, `/tmp/is-g1-compat2.log`, `/tmp/is-g1-memberships.log`, `/tmp/is-g1-build2.log`. Workspace receipts: `/tmp/is-g1-typegen.log`, `/tmp/is-g1-typecheck-final.log`.

## Files changed

- `src/lib/nexus-consumer/public-request.ts`: explicit canonical authority resolver.
- `src/lib/nexus-consumer/http.ts`: resolve before parsing/Identity; independent optional browser Origin validation.
- `src/lib/nexus-consumer/runtime.ts`: explicit direct HTTPS alias configuration.
- `.env.example`: deployment-boundary documentation; ignored `.env.development.local`: exact Development alias only.
- `tests/nexus-consumer-origin.test.mjs`: authority, downgrade, Origin, cookie, mandatory POST Origin and credential-boundary regressions.
- `tests/identity-access-credentials.test.mjs`: signed external DPoP transport regressions.
- `tests/protocol/nexus-consumer-runtime.mjs`: bind-origin transport through real provider/database suite.
- This report. The existing activation-report modification belongs to the preceding work and was not overwritten.

## Coordinated read-only acceptance boundary

The existing Sandcastle M11 Codex thread was contacted and sent readiness plus the passing native/protocol results. It reports prior grants expired and fresh user consent is necessary. At this report's checkpoint its preparation task is waiting on host-command approval; no fresh protected result has been received. The user was asked to complete existing Development Test 1/Test 2 login and Nexus consent. No credentials were requested or transferred.

**Pending:** Test 1 discovers Tenant A and B; Test 2 discovers A and receives B denial; real live nonce/proof retry, four-route policy and deadline acceptance. Subsequent membership/entitlement/revocation mutation acceptance remains under the authorized IS administration workflow and was not executed in this read-only fix. No claim of M11 completion or cutover readiness is made. Stop here until user consent/Sandcastle read-only receipts are available.
