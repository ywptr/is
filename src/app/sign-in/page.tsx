import { SignIn } from "./sign-in";

export default function SignInPage() {
  return (
    <section className="panel">
      <p className="eyebrow">IS · Identity Service</p>
      <h1>Sign in</h1>
      <p className="muted">Use your approved Google account. You will return to the application that requested authentication.</p>
      <SignIn />
      <p className="footer">IS identifies you; IG, Sandcastle, and Nexus separately determine access.</p>
    </section>
  );
}
