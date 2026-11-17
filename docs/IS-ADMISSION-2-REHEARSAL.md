# Migration rehearsal harness through 0012

2026-11-17. Independently reviewable test correction, separate from admission issuance. No historical SQL or application runtime changed.

`tests/integration/identity-administration-migration.test.mjs` previously asserted that 0011 was the final file on disk. The committed sequence now ends at 0012, so that assertion prevented any database rehearsal. The harness now checks the exact committed sequence, including the intentional missing 0005, and retains a through-0011 source fixture for every original upgrade, restore, ownership, constraint and final-admin/operator assertion.

A separate final case copies reviewed 0012 into the runner fixture and upgrades fresh, populated and restored disposable databases. It checks all ledger checksums, repeated-run no-op behavior, unchanged provider/identity/session records, preserved application linkage IDs with default `oidc` purpose, unchanged triggers, and retained native session validity. The existing protocol suite separately tests consumer-purpose classification and native provider behavior.

Both 0011 and 0012 hashes are pinned. No persistent database, environment file, migration history or bootstrap data is changed. Tests require explicit PostgreSQL 17 binaries and generate their own synthetic databases, roles and backup. They never use the application's DATABASE_URL.

Fresh 2026-11-17 native Debian verification passes all 5 checks under Node v24.22.0/npm 11.19.1 with PostgreSQL 17. The operator executed the prepared runner; `migration-rehearsal.log` and zero exit status are retained in `.local-recovery/is-admission-2-20261117/validation/receipts/`. The prior stale-final-file assertion was an actual test failure; sandbox socket denial was a separate environment restriction. The native run validates the repair, without touching persistent databases.

Run under Node 24:

```bash
export PATH=/home/user/.nvm/versions/node/v24.22.0/bin:$PATH
IS_MEMBERSHIP_PG_BIN=/usr/lib/postgresql/17/bin node --experimental-strip-types --test tests/integration/identity-administration-migration.test.mjs
```

Human checkpoint after successful execution:

```bash
git add -- tests/integration/identity-administration-migration.test.mjs docs/IS-ADMISSION-2-REHEARSAL.md
git diff --cached --check
git diff --cached
git commit -m "test(migrations): rehearse immutable history through 0012"
```

Do not stage admission issuance in this independent commit. No git rm is needed. This repair requires its own completed validation before reuse on the production consolidation track.
