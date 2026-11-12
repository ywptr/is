"use client";
import { useCallback, useEffect, useState } from "react";

type Application = { id: string; name: string; app_key: string };
type ClientRecord = { application_id: string; environment: string; oauth_client_id: string; redirect_uris: string[] | null; purpose:string; authentication_method:string|null;disabled:boolean|null;provider_present:boolean };

export function OAuthProvision() {
  const [apps, setApps] = useState<Application[]>([]);
  const [records, setRecords] = useState<ClientRecord[]>([]);
  const [applicationId, setApplicationId] = useState("");
  const [environment, setEnvironment] = useState("development");
  const [uri, setUri] = useState("");
  const [issued, setIssued] = useState<{client_id:string;client_secret:string}|null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [originalUris, setOriginalUris] = useState<string[]>([]);
  const [editedUris, setEditedUris] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [ar, cr] = await Promise.all([
      fetch("/api/nexus/registry/applications", { cache: "no-store" }),
      fetch("/api/nexus/registry/applications/oauth", { cache: "no-store" }),
    ]);
    if (!ar.ok || !cr.ok) throw new Error("Unable to load OAuth application records");
    setApps((await ar.json()).applications);
    setRecords((await cr.json()).clients.filter((c:ClientRecord)=>c.purpose==='oidc'));
  }, []);
  useEffect(() => { void load().catch(e => setError(String(e))); }, [load]);

  async function provision(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice(""); setIssued(null);
    try {
      const r = await fetch("/api/nexus/registry/applications/oauth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, environment, redirectUris: parseUris(uri) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Provisioning failed");
      setIssued({ client_id: d.client_id, client_secret: d.client_secret });
      await load();
    } catch (x) { setError(x instanceof Error ? x.message : "Failed"); }
    finally { setBusy(false); }
  }

  function startEdit(record: ClientRecord) {
    setEditing(record.oauth_client_id);
    setOriginalUris([...(record.redirect_uris??[])]);
    setEditedUris((record.redirect_uris??[]).join("\n"));
    setError(""); setNotice("");
  }

  async function saveRedirects(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const nextUris = parseUris(editedUris);
    if (!nextUris.length || nextUris.length > 10 || new Set(nextUris).size !== nextUris.length) {
      setError("Specify 1–10 unique redirect URIs."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/nexus/registry/applications/oauth/redirects", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: editing, expectedRedirectUris: originalUris, redirectUris: nextUris }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to update OAuth redirects");
      await load();
      setNotice("Redirect URIs updated in Better Auth and Nexus. Existing client credentials are unchanged.");
      setEditing(null); setOriginalUris([]); setEditedUris("");
    } catch (x) { setError(x instanceof Error ? x.message : "Failed"); }
    finally { setBusy(false); }
  }

  return <section id="oidc-clients" className="identity-box">
    <h2>OIDC Clients</h2>
    <p className="muted small">Human login, SSO and application-owned sessions. These clients remain fully supported and do not grant Nexus Consumer API access. Authorization Code + PKCE · Secret displayed once.</p>
    <form className="admin-form" onSubmit={e => void provision(e)}>
      <label htmlFor="oauth-app">Application</label>
      <select id="oauth-app" required value={applicationId} onChange={e => setApplicationId(e.target.value)}>
        <option value="">Select application</option>
        {apps.map(a => <option key={a.id} value={a.id}>{a.name} ({a.app_key})</option>)}
      </select>
      <label htmlFor="oauth-env">Environment</label>
      <select id="oauth-env" value={environment} onChange={e => setEnvironment(e.target.value)}>
        {["development","staging","production"].map(x => <option key={x}>{x}</option>)}
      </select>
      <label htmlFor="oauth-uri">Exact redirect URIs (one per line)</label>
      <textarea id="oauth-uri" value={uri} required rows={3} onChange={e => setUri(e.target.value)} placeholder="https://client.example.com/auth/callback" />
      <button className="button" type="submit" disabled={busy}>Register OIDC login client</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status" className="muted small">{notice}</p>}
    {issued && <div className="identity-box">
      <strong>Copy credentials now — secret cannot be retrieved later</strong>
      <p>Client ID: <code>{issued.client_id}</code></p>
      <p>Client secret: <code>{issued.client_secret}</code></p>
      <button type="button" className="button secondary" onClick={() => setIssued(null)}>I've stored the secret</button>
    </div>}
    <h3>Registered OIDC Clients</h3>
    <ul className="admin-list">{records.map(record => <li key={record.oauth_client_id}>
      <div style={{width:"100%"}}>
        <strong>{apps.find(a => a.id === record.application_id)?.name || record.application_id}</strong> — {record.environment}
        <p><code>{record.oauth_client_id}</code></p>
        <p>Authentication: {record.authentication_method??'unknown'} · Native client: {record.provider_present?(record.disabled===null?'status unknown':record.disabled?'disabled':'enabled'):'missing'}</p>
        {editing === record.oauth_client_id ? <form className="admin-form" onSubmit={e => void saveRedirects(e)}>
          <label htmlFor="oauth-edit-uris">Registered redirect URIs (one per line)</label>
          <textarea id="oauth-edit-uris" rows={4} required value={editedUris} onChange={e => setEditedUris(e.target.value)} disabled={busy} />
          <p className="muted small">HTTPS is required for LAN addresses. Use the exact callback URL, including its scheme and port. Editing does not rotate client credentials.</p>
          <div className="button-row">
            <button type="submit" className="button" disabled={busy}>Save redirect URIs</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form> : <>
          <p className="muted small" style={{overflowWrap:"anywhere"}}>{(record.redirect_uris??[]).join(", ")}</p>
          <button type="button" className="button secondary" disabled={busy || editing !== null || !record.provider_present} onClick={() => startEdit(record)}>Edit OIDC redirect URIs</button>
        </>}
      </div>
    </li>)}</ul>
  </section>;
}

function parseUris(value: string): string[] {
  return value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}
