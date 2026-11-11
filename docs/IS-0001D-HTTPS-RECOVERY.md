# IS#0001-D — Canonical HTTPS recovery

2026-11-11. **Canonical development HTTPS recovered and verified.** Only IS native Next development on port 5180 was restarted. No migration, registration, grant, feature-gate, production configuration, deployment, push or merge change occurred.

## Root cause and minimal repair

The old process tree contained one IS Next CLI (PID 1390492) and its listener child (1390754), launched by `npm run dev -- --hostname 0.0.0.0 --port 5180`. Its resolved command was:

```text
next dev --experimental-https --hostname 0.0.0.0 --port 5180
```

It omitted both certificate paths. The pinned Next 16.4.2 CLI uses the supplied key/certificate only when both options are present; otherwise it calls automatic certificate generation. The live fingerprint recorded in C for that same listener exactly matched the ignored `certificates/localhost.pem`, with SANs localhost, 127.0.0.1, ::1 and 0.0.0.0; fingerprint `67:EB:27:61:5A:E8:BA:31:01:BA:A9:58:81:02:D7:5B:4C:00:DE:C3:F7:12:13:A9:2F:F3:ED:CE:D1:2A:4D:B2`. The previously documented explicit command was correct, but the default package script did not retain its certificate arguments across a bare-script restart. No conflicting second IS listener or invalid existing IS key pair caused the mismatch.

`package.json` now makes the normal `npm run dev` resolve to:

```text
next dev --hostname 0.0.0.0 --port 5180 --experimental-https --experimental-https-key /home/user/certs/is/dev-key.pem --experimental-https-cert /home/user/certs/is/dev-cert.pem
```

The verified old CLI was terminated gracefully, its listener exited, and one replacement was started using that normal script under Node 24. Final read-only inspection found only CLI 1536532 and its single listener child 1536545 on 5180, with both correct certificate arguments; no conflicting IS instance remains. The old ignored automatic certificate was left intact and unused. No certificate or CA was generated, replaced or installed. The production build/start scripts and all application runtime source are unchanged.

## Existing certificate, private key and trust

| Property | Verified result |
| --- | --- |
| Certificate | `/home/user/certs/is/dev-cert.pem` |
| Private key | `/home/user/certs/is/dev-key.pem`, mode 0600, matching certificate public key; directory 0700 |
| SANs | DNS `5480-deb13.lan.com`, DNS `localhost`, IP `192.168.0.99`, IP `127.0.0.1` |
| Validity | 2026-11-10 12:03:38 UTC through **2029-02-10 12:03:38 UTC** |
| Issuer | Existing mkcert development CA, `mkcert user@5480-deb13 (User)` |
| Leaf SHA-256 | `50:4A:04:D4:4D:38:F9:6D:36:A5:48:67:85:A2:BD:20:EA:E5:45:AE:60:7C:79:12:18:56:22:A4:59:FF:4C:4D` |
| CA | `/home/user/.local/share/mkcert/rootCA.pem` |
| CA SHA-256 | `D9:8B:61:DE:C3:FE:22:61:FD:5A:4C:C4:DF:6F:86:3E:C4:B0:F4:E4:53:06:9A:D1:D8:E6:C0:19:ED:58:D6:D6` |

Node crypto compared certificate/key public SPKI bytes without printing private-key contents. OpenSSL verified the chain and exact hostname against the existing public CA. Python system-trust TLS sockets verified both canonical DNS transport and LAN transport at 192.168.0.99 with SNI/hostname `5480-deb13.lan.com`: TLS 1.3, served leaf fingerprint exactly equal to the file certificate. Trusted curl and Chromium also succeeded without certificate bypasses.

Linux browser trust is verified here. Windows still requires hostname resolution to 192.168.0.99 and trust in the same public mkcert root; no Windows trust-store inspection or change was performed. Never distribute the CA private key or use an insecure browser/curl/Node TLS flag.

## Normal startup

```bash
cd /home/user/src/is
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
export NODE_EXTRA_CA_CERTS=/home/user/.local/share/mkcert/rootCA.pem
npm run dev
```

`.nvmrc` stays 24; the verified host is Node v24.22.0/npm 11.19.1. Next loads the existing ignored `.env.development.local`. Do not start another instance if 5180 is occupied. Do not remove the key/certificate flags or use bare `next dev --experimental-https` for this hostname: that reintroduces automatic localhost certificate selection. Missing configured files require explicit repair, not fallback. The optional systemd example in the local guide now uses the same package script; no service was installed/enabled/modified.

## Live and regression validation

| Check | Result |
| --- | --- |
| Actual listener certificate / canonical chain+hostname / LAN TLS | PASS; exact existing IS leaf, TLS 1.3, system trust |
| Homepage / sign-in / health / readiness | 200 / 200 / 200 / 200 at canonical HTTPS origin |
| OIDC and OAuth authorization-server discovery | 200; issuer `https://5480-deb13.lan.com:5180/api/auth`, authorization/token/JWKS and other protocol URLs retain the same HTTPS origin |
| JWKS | 200; one public EdDSA/OKP key |
| Anonymous session / administration | Session null; existing privileged APIs 403 and protected pages redirect |
| Consumer routes | All four remain no-store gated 404 `resource_not_available`; credential-administration route remains gated 404 |
| Native Fast Refresh | Trusted Chromium WSS; client text edit/revert displayed without navigation or loss of a window marker |
| Server-side reload | Server-component text edit/revert displayed automatically without restarting Next |
| Temporary edits | Both TSX files restored byte-for-byte in test cleanup; no final application source diff |
| Source/config regression | Node 24 standard unit/route suite 67 PASS; route generation, typecheck and isolated webpack production build PASS |
| Database preservation | Read-only comparison matched all 45 table counts/digests and nine ledger entries to the verified pre-0011 backup; journal remains absent, gates off |

The build used a separate source/.next copy, synthetic settings and an unreachable fixture database; it did not disturb the live listener or use development/production credentials. Expected build-only database-connectivity warnings are not live readiness failures. Membership/OAuth protocol code and SQL were unchanged, so those broader PG suites were not rerun for this startup-only correction. Temporary probe logs remain private/local under `/tmp`.

Certificate, private-key, CA and private environment-file bytes were compared before/after recovery and remain unchanged. No migration/bootstrap script was used as an audit check. No OAuth initiation was performed during browser reload tests, so no Google state/session/credential was created by those probes.

## Google acceptance and remaining prerequisites

Effective `BETTER_AUTH_URL` remains canonical HTTPS and the existing Google credential fields are configured and unchanged. Required Development callback remains exactly:

`https://5480-deb13.lan.com:5180/api/auth/callback/google`

This recovery verifies local HTTPS/discovery and preserves that configuration. Google Console registration is not independently inspected; the earlier successful manual login remains **owner-reported**. No new external Google sign-in, callback completion, authenticated session, logout or admission/administrator/session-revocation acceptance is claimed. A fresh owner browser login can now be tested at the recovered trusted origin without bypassing validation.

TLS is no longer an IS development blocker. Migration 0011 still needs explicit approval and a fresh checkpoint/ledger/backup preflight; it was not applied. Sandcastle provisioning still needs owner-controlled Development public ES256 JWKS, review/approval of the exact resource/client/environment binding and proposed `sandcastle:tenant.access` eligibility operation, separately approved registration/tenant fixtures/gate activation and protected live acceptance. Human resource credentials remain separate from future service credentials; no key, grant or client was created. Production and Sandcastle repository changes remain unapproved.

## Files changed

- `package.json`: pin the existing IS certificate/key and native host/port in development startup only.
- `docs/LOCAL-DEVELOPMENT.md`: document `npm run dev` as the complete canonical startup and align the optional service example.
- `docs/SANDCASTLE-M11-NEXUS-HANDOFF.md`: mark the canonical TLS blocker resolved while retaining all provisioning/activation gates.
- This recovery report.
