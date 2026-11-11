# IS#0001 — HTTPS readiness and next acceptance gate

**Local schema acceptance, 2026-11-10:** Separately approved migrations 0008–0010 now applied to verified loopback `is_dev`; nine exact ledger checksums, all 14 new tables, old-table row digests and 54 validated FKs pass. [Execution and acceptance evidence](IS-0001-LOCAL-MIGRATION-ACCEPTANCE.md). Earlier pending-migration statements below are historical. Consumer gates remain off; OAuth provisioning and live security acceptance still block activation.

**Implementation follow-up, 2026-11-10:** The owner subsequently authorized this local HTTPS setup. It is now running on the existing native port 5180 with an IS-specific leaf and corrected development base URL. Both discovery documents, TLS, Google initiation, WSS and reload checks pass. See [the development guide's activation evidence](LOCAL-DEVELOPMENT.md#verified-https-activation--2026-11-10). The review and unexecuted plan below remain historical evidence. Windows trust/full Google login and consumer acceptance remain pending; no migrations, client provisioning or consumer gate activation were authorized or performed.

2026-11-10. Review and preparation only. Stage 2D is committed per the owner's confirmation; the earlier checkpoint blocker in the acceptance report is superseded. No checkpoint task was repeated. No listener, environment file, certificate, trust store, OAuth registration, database, consumer gate or consumer repository was changed.

## Recommendation

Run the existing native Next.js application with TLS directly on **port 5180**, at **`https://5480-deb13.lan.com:5180`**. Retain its `0.0.0.0` bind so both Debian's loopback hostname resolution and Windows LAN access work. Use the existing suite mkcert CA and a separate IS leaf certificate outside Git. Stop/restart the existing listener deliberately; do not start another application instance.

The installed Next 16.4.2 CLI supports explicit certificate/key arguments. This is its development HTTPS facility, not a production serving recommendation. It avoids an additional proxy, port, forwarded-origin boundary and application server. The suite's established TLS pattern is direct TLS in Vite; Apache has only its default port-80 static vhost, with no active 443 listener or suite TLS proxy found. Existing Next `allowedDevOrigins` already includes the exact hostname and `192.168.0.99`; no change or wildcard is needed. See [Next HTTPS CLI](https://nextjs.org/docs/app/api-reference/cli/next) and [allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins).

## Observations

| Service | Observed listener | Action |
| --- | --- | --- |
| IS native Next | `0.0.0.0:5180`, currently HTTP | Change this listener to HTTPS after approval |
| IG Vite | `192.168.0.99:5181` and loopback publishing | Preserve |
| Sandcastle Vite | `192.168.0.99:5182`, HTTPS | Preserve |
| Future Axtor frontend | 5183 reserved, no listener observed | Do not allocate |
| IG API | 8011, LAN and loopback publishing | Preserve |
| Sandcastle API | `0.0.0.0:8012` | Vite proxies `/api` to loopback; preserve |
| Axtor API | `127.0.0.1:8013` | Preserve |
| PostgreSQL | loopback 5432 and container bridge | No listener change |
| Apache | port 80; no 443 listener | No new proxy required |

No IS backend is needed on 8010. Do not start the separate historical Nexus scaffold; Identity and Nexus are modules in the existing IS process. Preserve LAN/firewall restrictions appropriate to a development server.

Effective Next development-file configuration has `BETTER_AUTH_URL=http://5480-deb13.lan.com:5180`. All three consumer/membership/Identity flags are unset/off; resource, environment and consumer trusted-origin settings are unset. File inspection does not prove every process environment override.

A fresh read-only HTTP discovery request returned 200 with **HTTPS issuer but HTTP authorization/token/JWKS URLs**. This mixed document is not acceptable for local OAuth acceptance:

- issuer: `https://5480-deb13.lan.com:5180/api/auth`
- authorization: `http://5480-deb13.lan.com:5180/api/auth/oauth2/authorize`
- token: `http://5480-deb13.lan.com:5180/api/auth/oauth2/token`
- JWKS: `http://5480-deb13.lan.com:5180/api/auth/jwks`

Correct both transport and base URL, restart, then verify every advertised URL. Do not treat the HTTPS issuer field alone as working HTTPS.

## Certificates and client trust

mkcert 1.4.4 is installed. Existing CA: `/home/user/.local/share/mkcert/rootCA.pem`; its public certificate is installed in Debian's system trust. Root validity is November 2026–November 2036. Its X.509 SHA-256 fingerprint is:

```text
D9:8B:61:DE:C3:FE:22:61:FD:5A:4C:C4:DF:6F:86:3E:C4:B0:F4:E4:53:06:9A:D1:D8:E6:C0:19:ED:58:D6:D6
```

Existing `/home/user/certs/{ig,sandcastle}/dev-cert.pem` certificates cover `5480-deb13.lan.com`, `localhost`, `192.168.0.99` and `127.0.0.1`. Both verify against the CA and hostname. Sandcastle's certificate expires February 2029; its private key has mode 0600. Certificates are not port-specific, but the recommendation is an IS-owned leaf rather than coupling IS to another application's private key. **No IS-specific leaf currently exists.**

A live Sandcastle probe using explicit LAN resolution and the CA returned **HTTP 200, TLS verification result 0**. Verification used no insecure option. This proves Linux-to-Sandcastle HTTPS, not Windows browser trust or OAuth completion.

Debian resolves the hostname to **127.0.1.1** through `/etc/hosts`; its LAN address is **192.168.0.99**. Sandcastle binds only the LAN address, so a Debian request without explicit resolution can fail despite its live listener. IS's existing all-interface bind avoids this problem on 5180. For Linux Sandcastle probes, use `--resolve`; do not substitute an IP in registered callbacks or DPoP URLs.

Windows DNS, root-store and browser trust were **not verifiable from this host**. The prior suite Chromium test is not current Windows trust evidence. Manually verify the Windows machine resolves the hostname to `192.168.0.99`, can reach 5180/5182, and trusts this exact CA. If needed, add the exact hosts entry on Windows and import only the public CA into the intended user's Trusted Root store after approval. Compare the certificate fingerprint above through the certificate viewer; a hash of the PEM file bytes is different. Never copy `rootCA-key.pem`. See [mkcert trust guidance](https://github.com/FiloSottile/mkcert).

Node clients should start with `NODE_EXTRA_CA_CERTS` pointing to the public root. Sandcastle's Httpx clients currently use default certificate verification; a future approved local-issuer configuration must prove trust, for example using the Debian combined bundle via `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`. Do not use `verify=False`, `NODE_TLS_REJECT_UNAUTHORIZED=0` or browser certificate bypasses. Containers require independent hostname resolution and CA trust verification.

## Authentication, cookies and callback configuration

| Setting | Required development value |
| --- | --- |
| IS origin / Better Auth base URL | `https://5480-deb13.lan.com:5180` |
| IS issuer | `https://5480-deb13.lan.com:5180/api/auth` |
| Discovery | `https://5480-deb13.lan.com:5180/api/auth/.well-known/openid-configuration` |
| JWKS | `https://5480-deb13.lan.com:5180/api/auth/jwks` |
| Nexus resource / single audience | `https://5480-deb13.lan.com:5180/api/nexus/v1` |
| Google Development authorized redirect | `https://5480-deb13.lan.com:5180/api/auth/callback/google` |
| Google authorized JS origin, if used | `https://5480-deb13.lan.com:5180` |
| Sandcastle browser origin | `https://5480-deb13.lan.com:5182` |
| Dedicated Sandcastle Development redirect | `https://5480-deb13.lan.com:5182/api/auth/callback` |
| Future consumer POST trusted Origin | `https://5480-deb13.lan.com:5182` |

The Google web-server flow requires exact registered redirect matching. Console ownership, current redirect registration, authorized development test users and consent-screen/domain restrictions require manual review; no Console record was read or changed. Reuse approved development credentials only if their owner confirms the exact HTTPS callback is authorized; otherwise request separate approval for the development registration. No production credential replacement or LAN-HTTP exception. See [Google web-server OAuth requirements](https://developers.google.com/identity/protocols/oauth2/web-server).

Pinned Better Auth 1.7.10 derives Secure-prefixed, Secure, HttpOnly, SameSite=Lax, host-only cookies from an explicit HTTPS base URL with the current defaults. Switching scheme can require a fresh login because cookie names change; do not copy session cookies. Verify actual Set-Cookie attributes privately in the browser. IS client auth uses relative same-origin URLs. Exact-origin admin/registry mutation checks derive from `BETTER_AUTH_URL`; hostname/port must match. Keep CSRF/origin checks enabled. `allowedDevOrigins` does not authorize OAuth callbacks, consumer mutations or cross-origin API requests.

Direct TLS preserves the external HTTPS request URL used by DPoP without a reverse-proxy rewrite. Do not add broad forwarded-header trust. The pinned provider takes explicit base URL precedence; its forwarded host/proto logic is conditional on trusted-proxy configuration. Acceptance must still reject forged Host/forwarded-origin requests and proofs signed for another scheme, port or path.

Sandcastle Vite already uses its certificate and proxies `/api` to `http://127.0.0.1:8012` with `changeOrigin:true` and `xfwd:true`. Its configured callback/web URL are the exact HTTPS values above and Secure cookies are enabled. Its application cookies are distinct `sandcastle_session` and `sandcastle_auth_flow`, HttpOnly and SameSite=Lax. Cookies are **not isolated by port**; retain distinct names and host-only scope, and do not enable shared parent-domain cookies or assume port separation is a cookie boundary.

**Sandcastle currently authenticates against `https://sandcastle-auth.vercel.app/api/auth`.** Its configured credentials belong to that existing flow; they were not displayed or modified. Preserve this flow. A local resource issuer has a distinct `(issuer, sub)` namespace: existing production login identity is not automatic proof of a local IS user. Before an end-to-end handoff, owners must approve the development login/resource-grant arrangement and verified identity mapping. No email linking, production client reuse or silent issuer retargeting is acceptable. Sandcastle consumer integration remains work for its owner/repository, outside this task.

## Migration and lifecycle acceptance gate

The earlier [acceptance report](IS-0001-NEXUS-CONSUMER-ACCEPTANCE.md) records successful disposable fresh/populated migration, ordinary-owner permissions, concurrent reader/writer, preservation, idempotency and synthetic restore rehearsals. Its read-only persistent audit found six matching historical ledger rows through 0007, with **0008 → 0009 → 0010** pending. This review did not repeat the migration rehearsal or access persistent data. Those database observations must be refreshed immediately before execution; they are not proof of today's unchanged ledger.

The owner's committed-implementation confirmation resolves the earlier checkpoint prerequisite. **Persistent migration remains unapproved.** Require a current guarded target/ledger/checksum check, approved private backup and actual isolated restore acceptance, migration window and privilege decision. Use the guarded commands already prepared in the acceptance report, not an unguarded `npm run db:app:migrate` or Better Auth bootstrap. No migration SQL or historical checksum changed in this task. A per-file migration failure may leave an earlier file committed; stop and inspect the ledger rather than dropping data or blindly retrying. HTTPS preparation and database approval are separate gates.

Security blockers that remain before initial human runtime activation:

1. Approved internal provisioning and maintenance/recovery authorization. Native changes to bound OAuth clients are blocked; a safe lifecycle operator path must cover disable/re-enable, key compromise and code/token/session invalidation. Synthetic internal-interface tests are not an operational workflow.
2. Real browser explicit-consent/resume acceptance for the authorization-code generation barrier; current protocol fixtures bypass consent. Exercise outstanding pre-invalidation codes and old credentials after client re-enablement.
3. Explicitly review current user-eligibility scope and incident handling. Existing user/session and security generations are enforced; global suspension/permanent blocking is unavailable, and admission-list removal alone is not current-session revocation. Do not claim an unavailable hook works.
4. Initial public-subject profile approval or maintained authenticated pairwise observer integration. Foundation pairwise fixtures pass; runtime pairwise assembly is not configured and fails closed.
5. Real HTTPS/browser/proxy/DPoP acceptance, current security and PostgreSQL outage/recovery, all four handlers, revocation races and five-second decision deadlines. Native authorization-server nonces remain unavailable; resource-server nonces are implemented. Keep this explicit profile distinction under review.
6. Dedicated resource/client/environment/application/operation linkage, owner-supplied public JWKS and BFF key custody, explicit consent and synthetic development tenant fixtures. No approved provisioning command currently exists; `scripts/register-client.ts` creates a different login profile and must not be used as a shortcut.

All gates remain off. Applied additive tables alone must not activate the API. The resource grant requires `private_key_jwt`, PKCE S256, DPoP and only `nexus:tenants:read nexus:membership:self nexus:entitlements:read nexus:access:evaluate`; no login scopes or Bearer/cookie/ID-token fallback. Positive registry and verified subject binding are mandatory. No new positive decisions after committed membership/entitlement revocation; no positive cache across requests; <=5-second decisions and queue-side revalidation remain the handoff contract.

## Exact next commands and manual steps

These are prepared commands, **not executed changes**. First obtain approval for the local leaf creation, base-URL edit and controlled restart. No migration, registration or gate activation is included in that approval.

```bash
# Create a separate IS leaf under the existing CA, after approval only.
umask 077
install -d -m 700 /home/user/certs/is
# Stop if either target file already exists; do not overwrite an unknown key.
test ! -e /home/user/certs/is/dev-key.pem && test ! -e /home/user/certs/is/dev-cert.pem && \
mkcert -cert-file /home/user/certs/is/dev-cert.pem \
  -key-file /home/user/certs/is/dev-key.pem \
  5480-deb13.lan.com localhost 192.168.0.99 127.0.0.1
chmod 600 /home/user/certs/is/dev-key.pem
openssl verify -CAfile /home/user/.local/share/mkcert/rootCA.pem \
  -verify_hostname 5480-deb13.lan.com /home/user/certs/is/dev-cert.pem
```

Edit only the approved local `BETTER_AUTH_URL` to HTTPS; leave every gate unset/false and retain existing secrets. Stop the current Next process through its owning terminal/service. Start its replacement, not an additional server:

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
node --version
export NODE_EXTRA_CA_CERTS=/home/user/.local/share/mkcert/rootCA.pem
npm run dev -- --hostname 0.0.0.0 --port 5180 \
  --experimental-https \
  --experimental-https-key /home/user/certs/is/dev-key.pem \
  --experimental-https-cert /home/user/certs/is/dev-cert.pem
```

After the approved restart, read-only Linux transport checks:

```bash
curl --fail --show-error --silent \
  --cacert /home/user/.local/share/mkcert/rootCA.pem \
  https://5480-deb13.lan.com:5180/api/auth/.well-known/openid-configuration
curl --fail --show-error --silent \
  --cacert /home/user/.local/share/mkcert/rootCA.pem \
  https://5480-deb13.lan.com:5180/api/auth/jwks
curl --fail --show-error --silent --output /dev/null \
  --resolve 5480-deb13.lan.com:5182:192.168.0.99 \
  --cacert /home/user/.local/share/mkcert/rootCA.pem \
  https://5480-deb13.lan.com:5182/
```

Windows read-only checks:

```powershell
Resolve-DnsName 5480-deb13.lan.com
[System.Net.Dns]::GetHostAddresses('5480-deb13.lan.com')
Test-NetConnection 5480-deb13.lan.com -Port 5180
Test-NetConnection 5480-deb13.lan.com -Port 5182
```

The browser must show trusted HTTPS without bypass, both origins must resolve correctly, discovery must contain only the approved HTTPS URLs, and JWKS must load with certificate validation. Then separately authorize any needed Google Development callback change; verify login state/PKCE/provider callback and fresh Secure cookies with the owner. Confirm an anonymous operator/admin request remains denied and the four consumer endpoints remain disabled. Do not log callback codes, sessions or tokens.

After separate backup/migration authorization and guarded execution, keep flags off while read-only schema/ledger/data-preservation checks run. Resolve provisioning/lifecycle blockers before requesting a bounded activation test window. Only then use real dedicated development credentials for the zero/one/multiple-membership, cross-context, revocation, DPoP, outage and deadline matrix in the acceptance report. No consumer cutover follows automatically.

## Review result

HTTPS topology and commands are prepared. Existing CA and suite HTTPS are verified on Linux; Windows trust and IS HTTPS are pending. Migration rehearsal evidence is available but persistent migration is not authorized or freshly re-audited. Consumer runtime is implemented and previously tested, disabled, not live-accepted and **not ready for Sandcastle M11 cutover or production**. This task changes documentation only; no new automated runtime/build result is claimed.
