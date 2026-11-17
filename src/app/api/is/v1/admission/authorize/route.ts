import { admissionHandler } from "@/lib/identity/admission/runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return admissionHandler("authorize")(request); }
