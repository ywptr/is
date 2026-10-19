import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/database";
import { currentAdminUserId, hasTrustedOrigin } from "@/lib/admin-access";
import { normalizeEmail } from "@/lib/admission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: object, status = 200) => NextResponse.json(data, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function GET(request: NextRequest) {
  try {
    const admin = await currentAdminUserId(request.headers);
    if (!admin) return response({ error: "forbidden" }, 403);
    const rows = await pool.query(`SELECT email, created_at, note
      FROM is_admission_emails ORDER BY email ASC`);
    return response({ entries: rows.rows });
  } catch (err) {
    console.error("IS admission GET failure", err);
    return response({ error: "internal_error" }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasTrustedOrigin(request.headers)) return response({ error: "invalid_origin" }, 403);
    const admin = await currentAdminUserId(request.headers);
    if (!admin) return response({ error: "forbidden" }, 403);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return response({ error: "invalid_body" }, 400);
    const data = body as Record<string, unknown>;
    const email = normalizeEmail(data.email);
    if (!email) return response({ error: "invalid_email" }, 400);
    const note = typeof data.note === "string" ? data.note.trim() : "";
    if (note.length > 500) return response({ error: "note_too_long" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const added = await client.query(`INSERT INTO is_admission_emails (email, created_by, note)
        VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING email`, [email, admin, note || null]);
      if (added.rowCount !== 1) {
        await client.query("ROLLBACK");
        return response({ error: "already_exists" }, 409);
      }
      await client.query(`INSERT INTO is_admission_audit (action,email,actor_user_id)
        VALUES ('add',$1,$2)`, [email, admin]);
      await client.query("COMMIT");
      return response({ email }, 201);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("IS admission POST failure", err);
    return response({ error: "internal_error" }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!hasTrustedOrigin(request.headers)) return response({ error: "invalid_origin" }, 403);
    const admin = await currentAdminUserId(request.headers);
    if (!admin) return response({ error: "forbidden" }, 403);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return response({ error: "invalid_body" }, 400);
    const email = normalizeEmail((body as Record<string, unknown>).email);
    if (!email) return response({ error: "invalid_email" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Prevent lockout: administrator accounts must be deprovisioned separately.
      const protectedAccount = await client.query(`SELECT 1 FROM is_administrators a
        JOIN "user" u ON u.id = a.user_id WHERE lower(u.email) = $1 LIMIT 1`, [email]);
      if ((protectedAccount.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return response({ error: "administrator_email_protected" }, 409);
      }
      const removed = await client.query("DELETE FROM is_admission_emails WHERE email = $1 RETURNING email", [email]);
      if (removed.rowCount !== 1) {
        await client.query("ROLLBACK");
        return response({ error: "not_found" }, 404);
      }
      await client.query(`INSERT INTO is_admission_audit (action,email,actor_user_id)
        VALUES ('remove',$1,$2)`, [email, admin]);
      await client.query("COMMIT");
      return response({ removed: email });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("IS admission DELETE failure", err);
    return response({ error: "internal_error" }, 500);
  }
}
