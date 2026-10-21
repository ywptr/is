import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { EntitlementsManager } from "./manager";
export const dynamic="force-dynamic";
export default async function Page(){
  if(!await currentNexusOperatorId(await headers()))redirect("/");
  return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus</p><h1>Entitlements</h1>
    <p className="muted">Enable application access for tenants. These flags are not yet enforced by consuming applications.</p>
    <EntitlementsManager /></section>;
}
