import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { ApplicationsManager } from "./manager";
export const dynamic="force-dynamic";
export default async function Page(){
  if(!await currentNexusOperatorId(await headers()))redirect("/");
  return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus</p><h1>Applications</h1>
    <p className="muted">Trusted application catalog. OAuth client credential provisioning is a separate, upcoming integration.</p>
    <ApplicationsManager /></section>;
}
