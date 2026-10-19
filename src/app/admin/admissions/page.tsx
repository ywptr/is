import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentAdminUserId } from "@/lib/admin-access";
import { AdmissionsManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function AdmissionsPage() {
  const adminId = await currentAdminUserId(await headers());
  if (!adminId) redirect("/");
  return (
    <section className="panel admin-panel">
      <p className="eyebrow">IS · Administration</p>
      <h1>Admission management</h1>
      <p className="muted">Permit or remove Google email addresses without redeploying IS.</p>
      <AdmissionsManager />
      <p className="footer">Removal prevents future Google sign-ins; it does not terminate existing sessions.</p>
    </section>
  );
}
