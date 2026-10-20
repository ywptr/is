"use client";
import { useCallback, useEffect, useState } from "react";

type Operator = {user_id:string; name:string|null; email:string; granted_at:string};
export function OperatorsManager() {
  const [operators,setOperators] = useState<Operator[]>([]);
  const [userId,setUserId] = useState("");
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState("");
  const load = useCallback(async()=>{
    const response = await fetch("/api/nexus/operators", {credentials:"same-origin",cache:"no-store"});
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || "Unable to load operators");
    setOperators(result.operators); setReady(true);
  },[]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
  async function mutate(method:"POST"|"DELETE", target:string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/nexus/operators",{
        method,credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body: JSON.stringify({userId:target})
      });
      const result = await response.json();
      if(!response.ok) throw new Error(result.error || "Request failed");
      await load(); if(method==="POST") setUserId("");
    } catch(e) {setError(e instanceof Error?e.message:"Request failed");}
    finally {setBusy(false);}
  }
  return <div className="stack">
    <form className="admin-form" onSubmit={e=>{e.preventDefault();void mutate("POST",userId.trim());}}>
      <label htmlFor="nexus-operator-id">Existing IS user ID</label>
      <input id="nexus-operator-id" required value={userId} maxLength={255}
        onChange={e=>setUserId(e.target.value)} placeholder="IS user ID" />
      <button className="button" type="submit" disabled={busy}>Grant Nexus operator access</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {!ready ? <p className="muted">Loading operators…</p> : <ul className="admin-list">
      {operators.map(operator=><li key={operator.user_id}>
        <div>
          <strong>{operator.name || operator.email}</strong><br/>
          <span className="muted small">{operator.email}</span><br/>
          <code>{operator.user_id}</code>
        </div>
        <button className="button secondary" type="button" disabled={busy || operators.length<=1}
          title={operators.length<=1?"Cannot remove the final Nexus operator":"Remove Nexus operator"}
          onClick={()=>{if(window.confirm(`Revoke Nexus operator access for ${operator.email}?`)) void mutate("DELETE",operator.user_id);}}>
          Remove
        </button>
      </li>)}
    </ul>}
  </div>;
}
