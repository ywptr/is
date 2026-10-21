"use client";
import { useCallback,useEffect,useState } from "react";
type Application={id:string;app_key:string;name:string;description:string|null;status:"active"|"disabled";enabled_tenants:number};
export function ApplicationsManager(){
  const [list,setList]=useState<Application[]>([]),[key,setKey]=useState(""),[name,setName]=useState(""),[description,setDescription]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[loaded,setLoaded]=useState(false);
  const load=useCallback(async()=>{
    const r=await fetch("/api/nexus/registry/applications",{cache:"no-store"});const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Cannot load applications");setList(d.applications);setLoaded(true);
  },[]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
  async function change(method:"POST"|"PATCH",body:object){setBusy(true);setError("");try{
    const r=await fetch("/api/nexus/registry/applications",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");await load();
    if(method==="POST"){setKey("");setName("");setDescription("");}
  }catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
  return <div className="stack">
    <form className="admin-form" onSubmit={e=>{e.preventDefault();void change("POST",{key,name,description});}}>
      <label htmlFor="app-key">Application key (stable)</label>
      <input id="app-key" required pattern="[a-z][a-z0-9_-]{1,62}" placeholder="sandcastle" value={key} onChange={e=>setKey(e.target.value)}/>
      <label htmlFor="app-name">Display name</label>
      <input id="app-name" required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/>
      <label htmlFor="app-description">Description (optional)</label>
      <input id="app-description" maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/>
      <button type="submit" className="button" disabled={busy}>Register application</button>
    </form>
    {error&&<p role="alert" className="error">{error}</p>}
    {!loaded?<p className="muted">Loading applications…</p>:<ul className="admin-list">{list.map(a=><li key={a.id}>
      <div><strong>{a.name}</strong> <span className="muted small">({a.app_key})</span><br/>
        <span className="muted small">{a.status} · {a.enabled_tenants} enabled tenant(s)</span>
        {a.description&&<p className="muted small">{a.description}</p>}
      </div><button className="button secondary" type="button" disabled={busy}
        onClick={()=>void change("PATCH",{id:a.id,status:a.status==="active"?"disabled":"active"})}>
        {a.status==="active"?"Disable":"Enable"}</button>
    </li>)}</ul>}
  </div>;
}
