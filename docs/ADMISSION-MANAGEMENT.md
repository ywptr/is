# IS v0.2 — Database-backed admission management

This adds IS-owned tables alongside Better Auth-managed tables. The original `IS_ALLOWED_EMAILS` remains ONLY as a one-time import source; it is **not** consulted during sign-in after v0.2 deployment.

## Deployment (do this in order)

1. Confirm this is the **IS** Neon database branch. Keep the previously working IS deployment online.
2. Run Better Auth migrations (if needed): `npm run db:migrate`.
3. Apply IS app migrations: `npm run db:app:migrate`.
4. From your IS home page, copy the already-signed-in **IS user ID**.
5. Export environment variables from a secure shell / secret store: `DATABASE_URL`, the existing comma-separated `IS_ALLOWED_EMAILS`, and `IS_BOOTSTRAP_ADMIN_USER_ID` (your exact IS user ID). Run `npm run admission:bootstrap`.
6. Inspect seeded records in Neon SQL Editor: `SELECT email FROM is_admission_emails ORDER BY email;` and `SELECT user_id FROM is_administrators;`.
7. Deploy v0.2 code with the same IS production credentials. Verify `/admin/admissions` and add/remove a *test* email.
8. Confirm Google sign-in works for an admitted account and rejects an unlisted account. Only after verification, remove `IS_ALLOWED_EMAILS` from deployment configuration.

For the Debian/Neon Node.js connection quirk we observed:

```
NODE_OPTIONS="--no-network-family-autoselection --dns-result-order=ipv4first" npm run db:app:migrate
NODE_OPTIONS="--no-network-family-autoselection --dns-result-order=ipv4first" npm run admission:bootstrap
```

Do not paste secret URLs into terminal history, screenshots, or Git. Environment variables must be available to the process running the scripts; `.env.local` is not automatically loaded by these CLI commands.

## Authorization & behavior

- `/admin/admissions` and `/api/admin/admissions` require a Better Auth session **and** an `is_administrators` record matching its global IS user ID.
- GET lists permitted emails. POST adds, DELETE removes; writes require the canonical same-origin `Origin` header and use parametrized SQL + transactional audit insertion.
- Removal of an administrator's email is blocked (409) to prevent accidental bootstrap lockout. Administrator removal requires a separate protected operator procedure, not exposed through this UI.
- Removing an email prevents its **next Google sign-in**; existing IS sessions, OIDC tokens, and consumers' sessions aren't revoked. Session/token revocation is future work.
- Database connection errors fail closed for sign-in; never silently fall back to environment admission. If the IS-specific migrations or bootstrap haven't run, the new code **cannot** sign users in.
- The migration runner verifies ordered revisions and SHA-256 checksums. It does not modify Better Auth-managed tables.
- Do not use this list to authorize Nexus operators or application membership. Those are separate policies.

## Smoke checks

1. Guest GET `/api/admin/admissions` returns 403.
2. Admin GET returns ordered permitted emails; non-admin signed-in user returns 403.
3. Cross-origin POST or DELETE returns 403.
4. Duplicate add returns 409; remove missing email returns 404.
5. A write generates a row in `is_admission_audit`.
6. Admin email removal returns 409; no entry is deleted.
7. A user removed from list is denied on subsequent Google sign-in.
