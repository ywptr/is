# Nexus operator access (internal IS module)

Nexus operator rights are independent of IS administrators and regular user sessions.

## Initial setup
1. Confirm `DATABASE_URL` targets the intended IS Neon branch.
2. Run `npm run db:app:migrate` (migration `0002_nexus_operators.sql`).
3. Set `NEXUS_BOOTSTRAP_OPERATOR_USER_ID` to an existing admitted Better Auth user ID.
4. Run `npm run nexus:bootstrap-operator` **once**. The command refuses to run when operators exist.
5. Deploy and open `/admin/nexus/operators` as the bootstrapped user.

If Node's connection-family selection fails from Debian:

```sh
NODE_OPTIONS='--no-network-family-autoselection --dns-result-order=ipv4first' npm run db:app:migrate
NODE_OPTIONS='--no-network-family-autoselection --dns-result-order=ipv4first' npm run nexus:bootstrap-operator
```

`nexus_operators` uses Better Auth `user.id`. Grant requires the user to already exist in IS and currently be present in `is_admission_emails`. A non-operator (including an IS administrator without Nexus rights) receives 403 on API requests. Mutation endpoints require same-origin requests and a valid session. Audit records are written transactionally.

**Last operator:** A PostgreSQL trigger prevents removal of the final row; an advisory transaction lock serializes concurrent deletes. The UI also disables the removal button for the final operator. This rule does not stop a database superuser from deliberately dropping the table or disabling the trigger; those credentials must be protected.

Removing an operator immediately blocks further operator API requests, but does not terminate their IS session. Operators should first grant and verify a replacement before revoking themselves.

## Follow-ups
- More ergonomic user lookup by name/email in the UI (avoid exposing full user directory to operators unless needed).
- Operator-grant approval and emergency recovery policies.
- Tenant lifecycle and entitlement APIs, implemented inside Nexus module without giving operators access to tenant application data.
