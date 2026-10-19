import { ConsentForm } from "./consent-form";

type Params = { client_id?: string; scope?: string };

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <section className="panel">
      <p className="eyebrow">IS · Authorization</p>
      <h1>Authorize application</h1>
      <p className="muted">A registered client requests access to identity information. Consent is not tenant or application membership.</p>
      <div className="identity-box">
        <p>Client ID: <code>{params.client_id || "unknown"}</code></p>
        <p>Requested scopes: <code>{params.scope || "unspecified"}</code></p>
      </div>
      <ConsentForm />
    </section>
  );
}
