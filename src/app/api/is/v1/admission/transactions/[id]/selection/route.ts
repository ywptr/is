import { admissionHandler } from "@/lib/identity/admission/runtime";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return admissionHandler("selection")(request, (await context.params).id);
}
