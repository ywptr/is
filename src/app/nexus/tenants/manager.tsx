"use client";
import { useCallback,useEffect,useState } from "react";
type Tenant={id:string;tenant_key:string;name:string;status:"active"|"suspended";admission_policy:"invitation_only"|"public_registration"|"closed";enabled_apps:number};
export function TenantsManager(){
  const [list,setList]=useState<Tenant[]>([]),[key,setKey]=useState(""),[name,setName]=useState("");
  const [policy,setPolicy]=useState<Tenant["admission_policy"]>("invitation_only");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[loaded,setLoaded]=useState(false);
  const load=useCallback(async()=>{const r=await fetch("/api/nexus/registry/tenants",{cache:"no-store"});const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Cannot load tenants");setList(d.tenants);setLoaded(true);},[]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
  async function change(method:"POST"|"PATCH",body:object){setBusy(true);setError("");try{
    const r=await fetch("/api/nexus/registry/tenants",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");await load();
    if(method==="POST"){setKey("");setName("");setPolicy("invitation_only");}
  }catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
  return <div className="stack">
    <form className="admin-form" onSubmit={e=>{e.preventDefault();void change("POST",{key,name,policy});}}>
      <label htmlFor="tenant-key">Tenant key (stable)</label>
      <input id="tenant-key" required pattern="[a-z][a-z0-9_-]{1,62}" placeholder="example-company" value={key} onChange={e=>setKey(e.target.value)}/>
      <label htmlFor="tenant-name">Tenant name</label>
      <input id="tenant-name" required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/>
      <label htmlFor="tenant-policy">Admission policy (future onboarding behavior)</label>
      <select id="tenant-policy" value={policy} onChange={e=>setPolicy(e.target.value as Tenant["admission_policy"])}>
        <option value="invitation_only">Invitation only</option><option value="public_registration">Public registration</option><option value="closed">Closed</option>
      </select>
      <button type="submit" className="button" disabled={busy}>Create tenant</button>
    </form>
    {error&&<p role="alert" className="error">{error}</p>}
    {!loaded?<p className="muted">Loading tenants…</p>:<ul className="admin-list">{list.map(t=><li key={t.id}>
      <div><strong>{t.name}</strong> <span className="muted small">({t.tenant_key})</span><br/>
        <span className="muted small">{t.status} · {t.enabled_apps} enabled app(s)</span><br/>
        <label className="muted small" htmlFor={`policy-${t.id}`}>Admission policy</label>{" "}
        <select id={`policy-${t.id}`} disabled={busy} value={t.admission_policy}
          onChange={e=>void change("PATCH",{id:t.id,policy:e.target.value})}>
          <option value="invitation_only">Invitation only</option><option value="public_registration">Public registration</option><option value="closed">Closed</option>
        </select>
      </div><button className="button secondary" type="button" disabled={busy}
        onClick={()=>void change("PATCH",{id:t.id,status:t.status==="active"?"suspended":"active"})}>
        {t.status==="active"?"Suspend":"Reactivate"}</button>
    </li>)}</ul>}
  </div>;
}
