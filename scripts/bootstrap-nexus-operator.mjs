/** Privileged bootstrap: run only when nexus_operators is empty. Never run from an HTTP endpoint. */
import pg from "pg";
const userId = process.env.NEXUS_BOOTSTRAP_OPERATOR_USER_ID?.trim();
if (!process.env.DATABASE_URL || !userId) throw new Error("Set DATABASE_URL and NEXUS_BOOTSTRAP_OPERATOR_USER_ID");
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(83792422)");
  const existing=await client.query("SELECT count(*)::int AS n FROM nexus_operators");
  if(existing.rows[0].n!==0) throw new Error("Nexus already has operators: bootstrap disabled");
  const eligible=await client.query(`SELECT 1 FROM "user" u
    JOIN is_admission_emails a ON a.email=lower(u.email) WHERE u.id=$1`,[userId]);
  if(eligible.rowCount!==1) throw new Error("Bootstrap user must be an existing admitted IS identity");
  await client.query("INSERT INTO nexus_operators(user_id) VALUES($1)",[userId]);
  await client.query("INSERT INTO nexus_operator_audit(action,target_user_id) VALUES('bootstrap',$1)",[userId]);
  await client.query("COMMIT");
  console.log("Nexus initial operator bootstrapped successfully");
} catch(e) {await client.query("ROLLBACK"); throw e;}
finally {await client.end();}
