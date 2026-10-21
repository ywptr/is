import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
export const dynamic="force-dynamic";
export default async function NexusHomePage(){
  if(!await currentNexusOperatorId(await headers()))redirect("/");
  const cards=[{href:"/admin/nexus/operators",title:"Manage Operators",body:"Control access to the Nexus administration module."},
    {href:"/nexus/applications",title:"Applications",body:"Maintain the trusted application catalog."},
    {href:"/nexus/tenants",title:"Tenants",body:"Manage canonical tenants and admission policies."},
    {href:"/nexus/entitlements",title:"Entitlements",body:"Assign applications to tenants."}];
  return <section className="panel admin-panel"><p className="eyebrow">IS · Nexus module</p><h1>Nexus</h1>
    <p className="muted">Shared tenant and application control plane. Operator access is explicitly assigned.</p>
    <div className="nexus-dashboard">{cards.map(c=><Link className="nexus-dashboard-card" key={c.href} href={c.href}><strong>{c.title} →</strong><p className="muted small">{c.body}</p></Link>)}</div>
    <p className="footer">Application credentials and consumer-facing entitlement checks are separate upcoming integrations.</p>
  </section>;
}
