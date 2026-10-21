"use client";
import { useCallback,useEffect,useState } from "react";
type Tenant={id:string;tenant_key:string;name:string};
type Domain={hostname:string;tenant_id:string;is_primary:boolean};
export function TenantDomains(){
 const [tenants,setTenants]=useState<Tenant[]>([]),[tenantId,setTenantId]=useState(""),[domains,setDomains]=useState<Domain[]>([]);
 const [host,setHost]=useState(""),[primary,setPrimary]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const loadTenants=useCallback(async()=>{const r=await fetch("/api/nexus/registry/tenants",{cache:"no-store"});if(!r.ok)throw new Error("Unable to list tenants");setTenants((await r.json()).tenants);},[]);
 const loadDomains=useCallback(async()=>{if(!tenantId){setDomains([]);return;}const r=await fetch(`/api/nexus/registry/tenants/domains?tenantId=${encodeURIComponent(tenantId)}`,{cache:"no-store"});if(!r.ok)throw new Error("Unable to load domains");setDomains((await r.json()).domains);},[tenantId]);
 useEffect(()=>{void loadTenants().catch(e=>setError(String(e)));},[loadTenants]);
 useEffect(()=>{void loadDomains().catch(e=>setError(String(e)));},[loadDomains]);
 async function mutate(method:"POST"|"DELETE",hostname:string){setBusy(true);setError("");try{const r=await fetch("/api/nexus/registry/tenants/domains",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId,hostname,primary})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");setHost("");await loadDomains();}catch(e){setError(e instanceof Error?e.message:"Failed");}finally{setBusy(false);}}
 return <section className="identity-box"><h2>Tenant domains</h2><p className="muted small">Tenant ID uses the IG-compatible 36-character UUID format. Domain mappings are for administration; hostname ownership is not yet verified.</p>
 <label htmlFor="domain-tenant">Tenant</label><select id="domain-tenant" value={tenantId} onChange={e=>setTenantId(e.target.value)}><option value="">Select tenant</option>{tenants.map(t=><option key={t.id} value={t.id}>{t.name} ({t.tenant_key})</option>)}</select>
 {tenantId&&<><p className="muted small">Tenant ID: <code>{tenantId}</code></p><form className="admin-form" onSubmit={e=>{e.preventDefault();void mutate("POST",host);}}>
  <label htmlFor="domain-hostname">Hostname (without protocol)</label><input id="domain-hostname" required value={host} onChange={e=>setHost(e.target.value)} placeholder="example.yourdomain.com"/>
  <label><input type="checkbox" checked={primary} onChange={e=>setPrimary(e.target.checked)}/> Set as primary</label>
  <button type="submit" className="button" disabled={busy}>Add domain</button></form>
  {error&&<p className="error" role="alert">{error}</p>}
  <table className="nexus-domain-table"><thead><tr><th>Hostname</th><th>Primary</th><th>Action</th></tr></thead><tbody>{domains.map(d=><tr key={d.hostname}><td>{d.hostname}</td><td>{d.is_primary?"Yes":"No"}</td><td><button type="button" className="button secondary" disabled={busy} onClick={()=>{if(window.confirm(`Remove domain ${d.hostname}?`))void mutate("DELETE",d.hostname);}}>Remove</button></td></tr>)}</tbody></table>
 </>}
 </section>;
}
