"use client";
import { useCallback,useEffect,useState } from "react";
type Application={id:string;name:string;status:string};type Tenant={id:string;name:string;status:string};
type Entitlement={tenant_id:string;application_id:string;tenant_name:string;application_name:string;enabled:boolean;tenant_status:string;application_status:string};
export function EntitlementsManager(){
  const [apps,setApps]=useState<Application[]>([]),[tenants,setTenants]=useState<Tenant[]>([]),[list,setList]=useState<Entitlement[]>([]);
  const [appId,setAppId]=useState(""),[tenantId,setTenantId]=useState(""),[enabled,setEnabled]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[ready,setReady]=useState(false);
  const load=useCallback(async()=>{
    const [ar,tr,er]=await Promise.all([fetch("/api/nexus/registry/applications",{cache:"no-store"}),fetch("/api/nexus/registry/tenants",{cache:"no-store"}),fetch("/api/nexus/registry/entitlements",{cache:"no-store"})]);
    const [a,t,e]=await Promise.all([ar.json(),tr.json(),er.json()]);
    if(!ar.ok||!tr.ok||!er.ok)throw new Error(a.error||t.error||e.error||"Could not load entitlements");
    setApps(a.applications);setTenants(t.tenants);setList(e.entitlements);setReady(true);
  },[]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
  async function apply(tenant:string,app:string,value:boolean){setBusy(true);setError("");try{
    const res=await fetch("/api/nexus/registry/entitlements",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId:tenant,applicationId:app,enabled:value})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||"Request failed");await load();
  }catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
  return <div className="stack">
    <form className="admin-form" onSubmit={e=>{e.preventDefault();void apply(tenantId,appId,enabled);}}>
      <label htmlFor="ent-tenant">Tenant</label><select required id="ent-tenant" value={tenantId} onChange={e=>setTenantId(e.target.value)}>
        <option value="">Choose tenant</option>{tenants.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
      </select>
      <label htmlFor="ent-application">Application</label><select required id="ent-application" value={appId} onChange={e=>setAppId(e.target.value)}>
        <option value="">Choose application</option>{apps.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}
      </select>
      <label htmlFor="ent-enabled">Entitlement</label><select id="ent-enabled" value={enabled?"yes":"no"} onChange={e=>setEnabled(e.target.value==="yes")}>
        <option value="yes">Enabled</option><option value="no">Disabled</option>
      </select>
      <button className="button" type="submit" disabled={busy||!appId||!tenantId}>Save entitlement</button>
    </form>
    {error&&<p className="error" role="alert">{error}</p>}
    {!ready?<p className="muted">Loading entitlements…</p>:<ul className="admin-list">{list.map(e=><li key={`${e.tenant_id}:${e.application_id}`}>
      <div><strong>{e.tenant_name}</strong> → {e.application_name}<br/>
        <span className="muted small">{e.enabled?"Enabled":"Disabled"}{e.tenant_status!=="active"||e.application_status!=="active"?" · Parent inactive":""}</span>
      </div><button className="button secondary" type="button" disabled={busy}
        onClick={()=>void apply(e.tenant_id,e.application_id,!e.enabled)}>{e.enabled?"Disable":"Enable"}</button>
    </li>)}</ul>}
  </div>;
}
