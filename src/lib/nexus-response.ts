import { NextResponse } from "next/server";
export function reply(body: object, status = 200) {
  return NextResponse.json(body, {status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
