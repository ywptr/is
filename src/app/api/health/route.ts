import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "is", kind: "liveness" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
