/** Run once AFTER IS Better Auth sign-in and app migrations; operator only. */
import pg from "pg";
const userId = process.env.IS_BOOTSTRAP_ADMIN_USER_ID?.trim();
const raw = process.env.IS_ALLOWED_EMAILS || "";
const emails = [...new Set(raw.split(",").map(v => v.trim().toLowerCase()).filter(Boolean))];
if (!process.env.DATABASE_URL || !userId || emails.length === 0) {
  throw new Error("Set DATABASE_URL, IS_BOOTSTRAP_ADMIN_USER_ID, IS_ALLOWED_EMAILS");
}
const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (emails.some(email => email.length > 254 || !valid.test(email))) throw new Error("Invalid allowlist email");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
await client.connect();
try {
  await client.query("BEGIN");
  const user = await client.query('SELECT id, email FROM "user" WHERE id = $1', [userId]);
  if (user.rowCount !== 1) throw new Error("Bootstrap IS user ID does not exist");
  const operatorEmail = user.rows[0].email.trim().toLowerCase();
  if (!emails.includes(operatorEmail)) throw new Error("Bootstrap operator email must be in IS_ALLOWED_EMAILS");
  for (const email of emails) {
    await client.query(`INSERT INTO is_admission_emails (email, created_by, note)
      VALUES ($1, $2, 'Imported from IS_ALLOWED_EMAILS') ON CONFLICT (email) DO NOTHING`, [email, userId]);
  }
  await client.query(`INSERT INTO is_administrators (user_id, created_by)
    VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  await client.query("COMMIT");
  console.log(`Bootstrap completed. Imported ${emails.length} emails and authorized operator ${userId}.`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally { await client.end(); }
