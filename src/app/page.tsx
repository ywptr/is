import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOut } from "./sign-in/sign-out";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <section className="panel">
      <p className="eyebrow">Identity Service</p>
      <h1>One identity. Multiple applications.</h1>
      <p className="muted">IS provides a shared sign-in experience for IG, Sandcastle and Nexus. Access decisions remain with each application.</p>
      {session ? (
        <div className="identity-box">
          <p>Signed in as <strong>{session.user.name || session.user.email}</strong></p>
          <p className="muted small">IS user ID: <code>{session.user.id}</code></p>
          <SignOut />
        </div>
      ) : (
        <Link className="button" href="/sign-in">Sign in</Link>
      )}
      <p className="footer">IS MVP · External login: Google · Authorization: consuming applications</p>
    </section>
  );
}
