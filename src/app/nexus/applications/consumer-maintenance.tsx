"use client";
import {useRef,useState} from 'react';
import type {FormEvent} from 'react';

/** Existing administration capabilities; purpose-specific provisioning lives in its own form. */
export function ConsumerMaintenance({clientIds,resourceExists,onRecorded}:{clientIds:string[];resourceExists:boolean;onRecorded:()=>Promise<void>}){
 const [action,setAction]=useState('disable'),[clientId,setClientId]=useState(''),[jwks,setJwks]=useState(''),[assertion,setAssertion]=useState('');
 const [tokenId,setTokenId]=useState(''),[kind,setKind]=useState('session'),[key,setKey]=useState(''),[reason,setReason]=useState('');
 const [approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [receipt,setReceipt]=useState('');const lock=useRef(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!approved||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const requestId=crypto.randomUUID();setReceipt(requestId);
   const body:Record<string,unknown>={action,environment:'development',requestId,reason};
   if(['disable','enable','keys'].includes(action))body.clientId=clientId;
   if(action==='keys'){body.jwks=JSON.parse(jwks);body.assertion=assertion;}
   if(action==='revoke_token')body.tokenId=tokenId;
   if(action==='invalidate'){body.kind=kind;body.key=key;}
   const r=await fetch('/api/nexus/registry/applications/oauth/consumer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await r.json();if(!r.ok)throw new Error(result.error??'Administration failed');
   setNotice(`Recorded ${action}. Request ${requestId}. Read back the resulting policy before any further write.`);await onRecorded();
  }catch(e){setError(`${e instanceof Error?e.message:'Unknown response'}. Stop and reconcile the request; no automatic retry.`);}
  finally{setAssertion('');setBusy(false);}
 }
 return <details><summary>Consumer lifecycle and Nexus resource administration — separate approval required</summary>
  <p>These existing actions do not edit OIDC clients. They are separate from disabled-client provisioning and require their own reviewed approval. Status refresh never executes them.</p>
  <form onSubmit={submit} className="admin-form">
   <label htmlFor="consumer-maintenance-action">Consumer administration action</label>
   <select id="consumer-maintenance-action" value={action} disabled={busy||!!receipt} onChange={e=>setAction(e.target.value)}>
    <option value="disable">Disable consumer client</option><option value="enable">Enable consumer client for fresh credentials</option><option value="keys">Replace consumer public keys and disable</option><option value="revoke_token">Revoke an issued resource token</option><option value="invalidate">Invalidate credential generation</option><option value="resource" disabled={resourceExists}>Register the fixed approved Nexus resource</option>
   </select>
   {['disable','enable','keys'].includes(action)&&<><label htmlFor="maintenance-client">Nexus Consumer API client</label><select id="maintenance-client" value={clientId} required onChange={e=>setClientId(e.target.value)}><option value="">Select consumer client</option>{clientIds.map(id=><option key={id}>{id}</option>)}</select></>}
   {action==='keys'&&<><label htmlFor="maintenance-jwks">Replacement public ES256 JWKS</label><textarea id="maintenance-jwks" required value={jwks} onChange={e=>setJwks(e.target.value)}/><label htmlFor="maintenance-assertion">One-use current-key assertion, audience /api/auth/oauth2/client/rotate-keys, lifetime ≤60 seconds</label><textarea id="maintenance-assertion" autoComplete="off" required value={assertion} onChange={e=>setAssertion(e.target.value)}/></>}
   {action==='revoke_token'&&<><label htmlFor="maintenance-token">Issued token identifier (not the raw token)</label><input id="maintenance-token" required value={tokenId} onChange={e=>setTokenId(e.target.value)}/></>}
   {action==='invalidate'&&<><label htmlFor="maintenance-kind">Credential generation</label><select id="maintenance-kind" value={kind} onChange={e=>setKind(e.target.value)}>{['session','user','sender_key','signing_key'].map(k=><option key={k}>{k}</option>)}</select><label htmlFor="maintenance-key">Verified identifier</label><input id="maintenance-key" required value={key} onChange={e=>setKey(e.target.value)}/><p>User generation invalidation blocks resource credentials; it does not suspend a global account.</p></>}
   {action==='resource'&&<p>Registers only the configured Development Nexus audience with the four reviewed scopes, EdDSA, 300-second maximum and required DPoP. Existing resources are never overwritten.</p>}
   <label htmlFor="maintenance-reason">Approved reason</label><input id="maintenance-reason" required maxLength={512} value={reason} onChange={e=>setReason(e.target.value)}/>
   <label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I have separate approval for this exact action and target.</label>
   <button className="button secondary" disabled={!approved||busy||!!receipt} type="submit">Record approved consumer administration action</button>
  </form>{receipt&&<p>Request <code>{receipt}</code>. Do not resubmit; reconcile the journal first.</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
