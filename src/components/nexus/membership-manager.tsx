"use client";
import {useCallback,useEffect,useState} from "react";
import type {Role,Status} from "@/lib/nexus-memberships/policy";
type Member={user_id:string;name:string;email:string;role:Role;status:Status;version:number};
type Invitation={id:string;email:string;role:Role;state:string;expires_at:string};
type Listing={members:Member[];initialized:boolean;activeAdminCount:number;actorRole:Role|"operator";nextCursor:string|null};
const roles:Role[]=["member","admin","owner"];
function MemberEditor({member,limited,busy,change}:{member:Member;limited:boolean;busy:boolean;change:(id:string,body:object)=>Promise<void>}) {
  const [role,setRole]=useState(member.role),[status,setStatus]=useState(member.status),[reason,setReason]=useState("");
  const disabled=busy||(limited&&member.role!=="member");
  return <li><form className="stack" onSubmit={e=>{e.preventDefault();void change(member.user_id,{role,status,expectedVersion:member.version,reason});}}>
    <strong>{member.name||member.email}</strong><span>{member.email} · <code>{member.user_id}</code></span>
    <label>Role <select aria-label={`Role for ${member.email}`} value={role} disabled={disabled} onChange={e=>setRole(e.target.value as Role)}>{roles.filter(r=>!limited||r==="member"||r===member.role).map(r=><option key={r}>{r}</option>)}</select></label>
    <label>Status <select aria-label={`Status for ${member.email}`} value={status} disabled={disabled} onChange={e=>setStatus(e.target.value as Status)}><option>active</option><option>inactive</option></select></label>
    <label>Reason <input required maxLength={500} disabled={disabled} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button className="button secondary" disabled={disabled}>Save membership</button>
  </form></li>;
}
export function MembershipManager({tenantId,operator}:{tenantId:string;operator:boolean}) {
  const base=`/api/nexus/${operator?"registry/":""}tenants/${tenantId}`;
  const [listing,setListing]=useState<Listing|null>(null),[invites,setInvites]=useState<Invitation[]>([]);
  const [nextInvite,setNextInvite]=useState<string|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[link,setLink]=useState("");
  const [userId,setUserId]=useState(""),[email,setEmail]=useState(""),[role,setRole]=useState<Role>("member"),[reason,setReason]=useState("");
  const request=useCallback(async(path:string,method="GET",body?:object)=>{
    const r=await fetch(base+path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Request failed");return data;
  },[base]);
  const load=useCallback(async()=>{
    const [members,invitations]=await Promise.all([request("/memberships"),request("/invitations")]);
    setListing(members);setInvites(invitations.invitations);setNextInvite(invitations.nextCursor);
  },[request]);
  useEffect(()=>{let active=true; void load().catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load memberships");});return()=>{active=false;};},[load]);
  async function mutate(path:string,method:string,body:object) {
    setBusy(true);setError("");setLink("");
    try {const result=await request(path,method,body);if(result.token)setLink(`${window.location.origin}/invitations/accept#token=${result.token}`);await load();}
    catch(e){setError(e instanceof Error?e.message:"Request failed");}
    finally{setBusy(false);}
  }
  async function more(kind:"memberships"|"invitations",cursor:string) {
    setBusy(true);setError("");try{const d=await request(`/${kind}?cursor=${encodeURIComponent(cursor)}`);
      if(kind==="memberships")setListing(old=>old?{...old,members:[...old.members,...d.members],nextCursor:d.nextCursor}:old);
      else {setInvites(old=>[...old,...d.invitations]);setNextInvite(d.nextCursor);}
    }catch(e){setError(e instanceof Error?e.message:"Unable to load page");}finally{setBusy(false);}
  }
  const limited=listing?.actorRole==="admin";
  return <div className="stack">
    <p className="muted">Tenant ID: <code>{tenantId}</code>. Membership governs tenant access; applications retain resource permissions.</p>
    {error&&<p role="alert" className="error">{error}. Reload to resolve stale edits.</p>}
    <button type="button" className="button secondary" disabled={busy} onClick={()=>{setError("");void load().catch(e=>setError(String(e)));}}>Reload</button>
    {!listing?<p role="status">Loading memberships…</p>:<>
      <p>{listing.activeAdminCount} active administrator(s). The last active owner or admin must remain active.</p>
      {!listing.initialized?<>{operator?<form className="admin-form" onSubmit={e=>{e.preventDefault();void mutate("/memberships/bootstrap","POST",{userId,reason});}}>
        <h2>Assign first owner</h2><p>Select an existing verified, globally admitted IS user. This does not grant access to tenant business data.</p>
        <label>IS user ID <input required maxLength={255} value={userId} onChange={e=>setUserId(e.target.value)}/></label>
        <label>Reason <input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button className="button" disabled={busy}>Assign first owner</button>
      </form>:<p>An operator must assign the first owner.</p>}</>:<>
        <form className="admin-form" onSubmit={e=>{e.preventDefault();void mutate("/memberships","POST",{userId,role,reason});}}>
          <h2>Add existing identity</h2>
          <label>IS user ID <input required maxLength={255} value={userId} onChange={e=>setUserId(e.target.value)}/></label>
          <label>Role <select value={role} onChange={e=>setRole(e.target.value as Role)}>{roles.filter(r=>!limited||r==="member").map(r=><option key={r}>{r}</option>)}</select></label>
          <label>Reason <input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          <button className="button" disabled={busy}>Add member</button>
        </form>
        <form className="admin-form" onSubmit={e=>{e.preventDefault();void mutate("/invitations","POST",{email,role,reason});}}>
          <h2>Invite verified recipient</h2><p>The recipient must independently be admitted to IS and sign in. Invitations expire in seven days.</p>
          <label>Email <input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label>Invitation role <select value={role} onChange={e=>setRole(e.target.value as Role)}>{roles.filter(r=>!limited||r==="member").map(r=><option key={r}>{r}</option>)}</select></label>
          <label>Reason <input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          <button className="button" disabled={busy}>Create invitation</button>
        </form>
      </>}
      {link&&<div role="status"><label>Copy this invitation link once and send through an approved private channel. <input readOnly value={link} onFocus={e=>e.target.select()}/></label><button type="button" onClick={()=>setLink("")}>Hide link</button></div>}
      <h2>Members</h2><ul className="admin-list">{listing.members.map(m=><MemberEditor key={`${m.user_id}:${m.version}`} member={m} limited={limited} busy={busy} change={(id,b)=>mutate(`/memberships/${encodeURIComponent(id)}`,"PATCH",b)}/>)}</ul>
      {listing.nextCursor&&<button className="button secondary" disabled={busy} onClick={()=>void more("memberships",listing.nextCursor!)}>More members</button>}
      <h2>Invitations</h2><ul className="admin-list">{invites.map(inv=><li key={inv.id}><span>{inv.email} · {inv.role} · {inv.state} · expires {inv.expires_at}</span>
        <button type="button" className="button secondary" disabled={busy||inv.state!=="pending"||(limited&&inv.role!=="member")||!reason.trim()} onClick={()=>void mutate(`/invitations/${inv.id}/revoke`,"POST",{reason})}>Revoke invitation</button></li>)}</ul>
      <p className="muted">Revocation uses the reason entered above.</p>
      {nextInvite&&<button className="button secondary" disabled={busy} onClick={()=>void more("invitations",nextInvite)}>More invitations</button>}
    </>}
  </div>;
}
