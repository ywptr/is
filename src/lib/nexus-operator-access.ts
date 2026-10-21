import { auth } from "@/lib/auth";
import { pool } from "@/lib/database";

/** This permission is independent from IS platform administrator access. */
export async function currentNexusOperatorId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) return null;
  const result = await pool.query(
    "SELECT 1 FROM nexus_operators WHERE user_id=$1", [session.user.id]
  );
  return result.rowCount === 1 ? session.user.id : null;
}
