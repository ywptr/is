"use client";
import { useCallback,useEffect,useState } from "react";
type Application={id:string;name:string;app_key:string};
type RecordEntry={application_id:string;environment:string;oauth_client_id:string;redirect_uris:string[]};
export function OAuthProvision(){
 const [apps,setApps]=useState<Application[]>([]),[records,setRecords]=useState<RecordEntry[]>([]);
 const [applicationId,setApplicationId]=useState(""),[environment,setEnvironment]=useState("development"),[uri,setUri]=useState("");
 const [issued,setIssued]=useState<{client_id:string;client_secret:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  const [ar,cr]=await Promise.all([fetch("/api/nexus/registry/applications",{cache:"no-store"}),fetch("/api/nexus/registry/applications/oauth",{cache:"no-store"})]);
  if(!ar.ok||!cr.ok)throw new Error("Unable to load OAuth application records");
  setApps((await ar.json()).applications);setRecords((await cr.json()).clients);
 },[]);
 useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
 async function provision(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setIssued(null);
  try{const r=await fetch("/api/nexus/registry/applications/oauth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({applicationId,environment,redirectUris:uri.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Provisioning failed");setIssued({client_id:d.client_id,client_secret:d.client_secret});await load();
  }catch(x){setError(x instanceof Error?x.message:"Failed");}finally{setBusy(false);}
 }
 return <section className="identity-box"><h2>OAuth client provisioning</h2><p className="muted small">Confidential clients only · Authorization Code + PKCE · Secret displayed once. Store it in the consuming application's secret manager.</p>
  <form className="admin-form" onSubmit={e=>void provision(e)}>
   <label htmlFor="oauth-app">Application</label><select id="oauth-app" required value={applicationId} onChange={e=>setApplicationId(e.target.value)}><option value="">Select application</option>{apps.map(a=><option key={a.id} value={a.id}>{a.name} ({a.app_key})</option>)}</select>
   <label htmlFor="oauth-env">Environment</label><select id="oauth-env" value={environment} onChange={e=>setEnvironment(e.target.value)}>{["development","staging","production"].map(x=><option key={x}>{x}</option>)}</select>
   <label htmlFor="oauth-uri">Exact redirect URIs (one per line)</label><textarea id="oauth-uri" value={uri} required rows={3} onChange={e=>setUri(e.target.value)} placeholder="https://client.example.com/auth/callback"/>
   <button className="button" type="submit" disabled={busy}>Provision OAuth client</button>
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
  {issued&&<div className="identity-box"><strong>Copy credentials now — secret cannot be retrieved later</strong><p>Client ID: <code>{issued.client_id}</code></p><p>Client secret: <code>{issued.client_secret}</code></p><button type="button" className="button secondary" onClick={()=>setIssued(null)}>I've stored the secret</button></div>}
  <h3>Registered OAuth clients</h3><ul className="admin-list">{records.map(r=><li key={r.oauth_client_id}><div><strong>{apps.find(a=>a.id===r.application_id)?.name||r.application_id}</strong> — {r.environment}<p><code>{r.oauth_client_id}</code></p><span className="muted small">{r.redirect_uris.join(", ")}</span></div></li>)}</ul>
 </section>;
}
