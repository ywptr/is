import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: object, status=200) => NextResponse.json(data, {
  status, headers: { "Cache-Control": "no-store" }
});

export async function GET(request: NextRequest) {
  try {
    if (!await currentNexusOperatorId(request.headers)) return reply({ error: "forbidden" },403);
    const result = await pool.query(`SELECT o.user_id, u.name, u.email, o.granted_at
      FROM nexus_operators o JOIN "user" u ON u.id=o.user_id
      ORDER BY o.granted_at, o.user_id`);
    return reply({ operators: result.rows });
  } catch (error) {
    console.error("Nexus operator list failed", error);
    return reply({ error:"internal_error" },500);
  }
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request.headers)) return reply({ error:"invalid_origin" },403);
  try {
    const actor = await currentNexusOperatorId(request.headers);
    if (!actor) return reply({ error:"forbidden" },403);
    const body: unknown = await request.json().catch(()=>null);
    if (!body || typeof body!=="object") return reply({error:"invalid_body"},400);
    const id = (body as Record<string,unknown>).userId;
    if (typeof id !== "string" || id.length<1 || id.length>255) return reply({error:"invalid_user_id"},400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // No sign-up, no email-only invitation: grant an existing permitted IS identity.
      const eligible = await client.query(`SELECT 1 FROM "user" u
        JOIN is_admission_emails a ON a.email=lower(u.email)
        WHERE u.id=$1`,[id]);
      if (eligible.rowCount !== 1) {
        await client.query("ROLLBACK");
        return reply({error:"identity_not_found_or_not_permitted"},404);
      }
      const result = await client.query(`INSERT INTO nexus_operators(user_id,granted_by)
        VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id`,[id,actor]);
      if (result.rowCount!==1) {
        await client.query("ROLLBACK");
        return reply({error:"already_operator"},409);
      }
      await client.query(`INSERT INTO nexus_operator_audit(action,target_user_id,actor_user_id)
        VALUES('grant',$1,$2)`,[id,actor]);
      await client.query("COMMIT");
      return reply({userId:id},201);
    } catch(error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  } catch(error) {
    console.error("Nexus operator grant failed",error);
    return reply({error:"internal_error"},500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasTrustedOrigin(request.headers)) return reply({error:"invalid_origin"},403);
  try {
    const actor = await currentNexusOperatorId(request.headers);
    if (!actor) return reply({error:"forbidden"},403);
    const body:unknown = await request.json().catch(()=>null);
    if (!body || typeof body!=="object") return reply({error:"invalid_body"},400);
    const id = (body as Record<string,unknown>).userId;
    if (typeof id!=="string" || id.length<1 || id.length>255) return reply({error:"invalid_user_id"},400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // The DB trigger serializes deletes and rejects removal of the final operator.
      const result = await client.query("DELETE FROM nexus_operators WHERE user_id=$1 RETURNING user_id",[id]);
      if (result.rowCount!==1) { await client.query("ROLLBACK"); return reply({error:"not_found"},404); }
      await client.query(`INSERT INTO nexus_operator_audit(action,target_user_id,actor_user_id)
        VALUES('revoke',$1,$2)`,[id,actor]);
      await client.query("COMMIT");
      return reply({removed:id});
    } catch(error) {
      await client.query("ROLLBACK");
      if (typeof error === "object" && error !== null && "code" in error && error.code==="23514") {
        return reply({error:"last_operator_protected"},409);
      }
      throw error;
    } finally { client.release(); }
  } catch(error) {
    console.error("Nexus operator revoke failed",error);
    return reply({error:"internal_error"},500);
  }
}
