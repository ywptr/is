import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";

export const dynamic = "force-dynamic";

export default async function NexusHomePage() {
  if (!await currentNexusOperatorId(await headers())) redirect("/");

  return (
    <section className="panel admin-panel">
      <p className="eyebrow">IS · Nexus module</p>
      <h1>Nexus</h1>
      <p className="muted">Manage the shared tenant control plane. Access is restricted to authorized Nexus operators.</p>
      <div className="identity-box">
        <h2>Operator administration</h2>
        <p className="muted">View, add, or revoke Nexus operators. The last authorized operator cannot be removed.</p>
        <Link className="button" href="/admin/nexus/operators">Manage operators</Link>
      </div>
      <div className="identity-box">
        <h2>Coming next</h2>
        <p className="muted">Application registration, tenant lifecycle, tenant admission policies, and entitlements.</p>
      </div>
      <p><Link className="button secondary" href="/">Back to IS home</Link></p>
    </section>
  );
}
