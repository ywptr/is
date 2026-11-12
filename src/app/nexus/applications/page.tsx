import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { ApplicationsManager } from "./manager";
import { ApplicationClientAreas } from './client-areas';
export const dynamic="force-dynamic";
export default async function Page(){
 if(!await currentNexusOperatorId(await headers()))redirect("/");
 return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus</p><h1>Applications</h1><p className="muted">Manage applications and independent client purposes. Login identity, Nexus tenant authorization and service authorization have separate credentials and policies.</p>
 <ApplicationsManager/><ApplicationClientAreas consumerAdminEnabled={process.env.NEXUS_OAUTH_ADMIN_ENABLED==='true'}/></section>;
}
