import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { TenantsManager } from "./manager";
import { TenantDomains } from "./domain-manager";
export const dynamic="force-dynamic";
export default async function Page(){
 if(!await currentNexusOperatorId(await headers()))redirect("/");
 return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus</p><h1>Tenants</h1><p className="muted">Manage tenant lifecycle, canonical IDs and hostname mappings.</p>
 <TenantsManager/><TenantDomains/></section>;
}
