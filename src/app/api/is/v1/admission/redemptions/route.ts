import { admissionHandler } from "@/lib/identity/admission/runtime";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return admissionHandler("redemptions")(request); }
