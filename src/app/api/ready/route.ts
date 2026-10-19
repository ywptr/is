import { NextResponse } from "next/server";
import { pool } from "@/lib/database";

export const runtime = "nodejs";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
