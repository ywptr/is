import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOut } from "./sign-in/sign-out";
import { isISAdministrator } from "@/lib/admission";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const [admin, nexusOperator] = session ? await Promise.all([
    isISAdministrator(session.user.id),
    currentNexusOperatorId(requestHeaders).then(Boolean),
  ]) : [false, false];

  return (
    <section className="panel">
      <p className="eyebrow">Identity Service</p>
      <h1>One identity. Multiple applications.</h1>
      <p className="muted">Centralized authentication and identity management. Access to administrative modules is granted separately.</p>
      {session ? (
        <div className="identity-box">
          <p>Signed in as <strong>{session.user.name || session.user.email}</strong></p>
          <p className="muted small">IS user ID: <code>{session.user.id}</code></p>
          {nexusOperator && <p><Link className="button" href="/nexus">Open Nexus</Link></p>}
          {admin && <p><Link className="button secondary" href="/admin/admissions">Manage permitted emails</Link></p>}
          <SignOut />
        </div>
      ) : (
        <Link className="button" href="/sign-in">Sign in</Link>
      )}
      <p className="footer">IS · Identity and tenant control plane</p>
    </section>
  );
}
