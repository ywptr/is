import { admissionHandler } from "@/lib/identity/admission/runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return admissionHandler("choices")(request, (await context.params).id);
}
