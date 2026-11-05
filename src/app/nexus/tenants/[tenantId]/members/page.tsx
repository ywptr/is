import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {auth} from "@/lib/auth";
import {membershipsEnabled,membershipAuthorized} from "@/lib/nexus-memberships/runtime";
import {uuid} from "@/lib/nexus-memberships/validation";
import {MembershipManager} from "@/components/nexus/membership-manager";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{tenantId:string}>}) {
  if(!membershipsEnabled())notFound();
  const {tenantId}=await params;if(!uuid(tenantId))notFound();
  const session=await auth.api.getSession({headers:await headers()});if(!session)redirect("/sign-in");
  if(!await membershipAuthorized("operator",session.user.id,tenantId))notFound();
  return <section className="panel admin-panel"><h1>Tenant memberships</h1><MembershipManager tenantId={tenantId} operator={true}/></section>;
}
