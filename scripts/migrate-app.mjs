/** Explicit, linear migration runner for IS-owned tables; does not touch Better Auth migrations. */
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const folder = join(dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(83792421)");
  await client.query(`CREATE TABLE IF NOT EXISTS is_schema_migrations (
    name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const migrations = (await readdir(folder)).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const appliedResult = await client.query("SELECT name, sha256 FROM is_schema_migrations");
  const applied = new Map(appliedResult.rows.map(row => [row.name, row.sha256]));
  for (const name of applied.keys()) {
    if (!migrations.includes(name)) throw new Error(`Applied migration is missing from source: ${name}`);
  }
  // Refuse to apply a new revision if an earlier revision is not the applied prefix.
  let seenPending = false;
  for (const name of migrations) {
    const sql = await readFile(join(folder, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(name)) {
      if (seenPending) throw new Error(`Out-of-order applied migration: ${name}`);
      if (applied.get(name) !== checksum) throw new Error(`Migration changed after application: ${name}`);
      console.log(`Applied: ${name}`);
      continue;
    }
    seenPending = true;
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO is_schema_migrations (name, sha256) VALUES ($1, $2)", [name, checksum]);
      await client.query("COMMIT");
      console.log(`Migrated: ${name}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("IS application migrations complete");
} finally {
  try { await client.query("SELECT pg_advisory_unlock(83792421)"); } finally { await client.end(); }
}
