import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { ApplicationsManager } from "./manager";
import { OAuthProvision } from "./oauth-provision";
import { ConsumerAdministration } from "./consumer-administration";
export const dynamic="force-dynamic";
export default async function Page(){
 if(!await currentNexusOperatorId(await headers()))redirect("/");
 return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus</p><h1>Applications</h1><p className="muted">Manage application registry and provision confidential OAuth clients through Better Auth.</p>
 <ApplicationsManager/><OAuthProvision/>{process.env.NEXUS_OAUTH_ADMIN_ENABLED==="true"?<ConsumerAdministration/>:<p>Consumer credential administration is disabled pending review.</p>}</section>;
}
