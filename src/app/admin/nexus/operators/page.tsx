import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { OperatorsManager } from "./manager";

export const dynamic = "force-dynamic";
export default async function NexusOperatorsPage() {
  if (!await currentNexusOperatorId(await headers())) redirect("/");
  return (
    <section className="panel admin-panel">
      <p className="eyebrow">IS · Nexus module</p>
      <h1>Nexus operators</h1>
      <p className="muted">Only assigned operators can administer Nexus. At least one operator must remain authorized.</p>
      <OperatorsManager />
      <p className="footer">Removing Nexus access does not delete the IS identity or its sessions.</p>
    </section>
  );
}
