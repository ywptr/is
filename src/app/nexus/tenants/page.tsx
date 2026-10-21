import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { TenantsManager } from "./manager";
export const dynamic="force-dynamic";
export default async function Page(){
  if(!await currentNexusOperatorId(await headers()))redirect("/");
  return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus</p><h1>Tenants</h1>
    <p className="muted">Canonical tenant registry. Admission policies are stored now; self-service joining is not enabled yet.</p>
    <TenantsManager /></section>;
}
