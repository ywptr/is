import Link from "next/link";
import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {auth} from "@/lib/auth";
import {pool} from "@/lib/database";
import {membershipsEnabled} from "@/lib/nexus-memberships/runtime";
export const dynamic="force-dynamic";
export default async function Page() {
  if(!membershipsEnabled())notFound();
  const session=await auth.api.getSession({headers:await headers()});if(!session)redirect("/sign-in");
  const r=await pool.query(`SELECT t.id,t.name FROM nexus_tenants t JOIN nexus_tenant_memberships m ON m.tenant_id=t.id
    WHERE m.user_id=$1 AND m.status='active' AND m.role IN ('owner','admin') AND t.status='active' ORDER BY t.name`,[session.user.id]);
  return <section className="panel"><h1>Tenant administration</h1><ul>{r.rows.map(t=><li key={t.id}><Link href={`/tenants/${t.id}/members`}>{t.name}</Link></li>)}</ul>{!r.rowCount&&<p>No tenants available to administer.</p>}</section>;
}
