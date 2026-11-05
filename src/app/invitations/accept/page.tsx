import Link from "next/link";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {auth} from "@/lib/auth";
import {membershipsEnabled} from "@/lib/nexus-memberships/runtime";
import {AcceptInvitation} from "./form";
export const dynamic="force-dynamic";
export const metadata={referrer:"no-referrer" as const};
export default async function Page() {
  if(!membershipsEnabled())notFound();
  const session=await auth.api.getSession({headers:await headers()});
  return <section className="panel"><h1>Accept tenant invitation</h1><p>Sign in with the invited, verified email. A tenant invitation does not grant global IS admission.</p>
    {!session&&<p><Link href="/sign-in">Sign in</Link>, then reopen the private invitation link.</p>}
    {session&&<AcceptInvitation/>}
  </section>;
}
