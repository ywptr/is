"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {ConsumerMaintenance} from './consumer-maintenance';

type Inventory={schemaReady:boolean;resourceReady:boolean;resource:{identifier:string}|null;
 applications:{id:string;app_key:string;name:string;status:string}[];
 clients:{application_id:string;environment:string;oauth_client_id:string;disabled:boolean|null;binding_present:boolean;provider_present:boolean;authentication_method:string;pkce:boolean;dpop:boolean;skip_consent:boolean;epoch_enabled:boolean|null;scopes:string[];public_key_ids:string[]}[];
 journal:{request_id:string;action:string;state:string;reason:string;created_at:string;application_id:string|null;client_id:string|null}[];
 orphans:{client_id:string;disabled:boolean;request_id:string}[];
 operations:{client_id:string;operation:string;enabled:boolean}[];
 profile:{environment:string;audience:string;callback:string;scopes:string[];operations:string[]}};
const requestStorage='is.nexus-consumer.provision.v1';
export function ConsumerAdministration(){
 const [data,setData]=useState<Inventory|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [applicationId,setApplicationId]=useState(''),[jwks,setJwks]=useState(''),[reason,setReason]=useState('IS#0001-F.2 Sandcastle Development disabled provisioning');
 const [busy,setBusy]=useState(false),[retained,setRetained]=useState('');
 const inFlight=useRef(false);
 const load=useCallback(async()=>{
  const r=await fetch('/api/nexus/registry/applications/oauth/consumer',{cache:'no-store'});
  const d=await r.json();if(!r.ok)throw new Error(d.error??'Cannot read consumer administration');setData(d);
 },[]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Cannot load administration'));
  try{setRetained(sessionStorage.getItem(requestStorage)??'');}catch{setError('Browser request storage is unavailable. Provisioning is blocked.');setRetained('unavailable');}
 },[load]);
 const selected=data?.applications.find(a=>a.id===applicationId);
 const duplicate=data?.clients.some(c=>c.application_id===applicationId&&c.environment===data.profile.environment);
 const unresolved=data?.journal.some(j=>j.state!=='complete'&&(j.action==='resource'||j.application_id===applicationId))||!!data?.orphans.length;
 const blocked=!data?.schemaReady||!data.resourceReady||selected?.app_key!=='sandcastle'||selected.status!=='active'||duplicate||unresolved||!!retained;
 async function provision(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(blocked||inFlight.current||!data)return;
  setError('');setNotice('');inFlight.current=true;setBusy(true);
  try{
   const publicJwks=JSON.parse(jwks),requestId=crypto.randomUUID();
   // Retain only the operation ID, never credentials. Unknown responses require reconciliation.
   sessionStorage.setItem(requestStorage,requestId);setRetained(requestId);
   const response=await fetch('/api/nexus/registry/applications/oauth/consumer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'provision',environment:data.profile.environment,requestId,reason,applicationId,jwks:publicJwks,operations:data.profile.operations})});
   const result=await response.json();
   if(!response.ok)throw new Error(`${result.error??'Request failed'}. Request ${requestId}: reconcile the journal before another submission.`);
   if(result.disabled!==true||!result.clientId)throw new Error(`Unexpected result for ${requestId}. Stop and reconcile.`);
   setNotice(`Nexus Consumer API client ${result.clientId} recorded disabled. Request ${requestId}. Activation requires separate approval.`);
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Provisioning response unavailable. Reconcile before retrying.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section id="nexus-consumer-clients" className="identity-box">
  <h2>Nexus Consumer API Clients</h2>
  <p>Human tenant discovery, membership, entitlements and access decisions. Registration grants no tenant access and preserves separate OIDC login clients.</p>
  <button type="button" className="button secondary" disabled={busy} onClick={()=>{setError('');void load().catch(e=>setError(e instanceof Error?e.message:'Refresh failed'));}}>Refresh consumer status</button>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!data?<p>Loading consumer administration…</p>:<>
   {!data.schemaReady&&<p role="status">Read-only: candidate migration 0012 requires separate approval and application. Existing OIDC clients remain available.</p>}
   {!data.resourceReady&&<p role="status">The approved Nexus resource is missing or its policy differs. Stop for resource-administrator review; this form does not register or change resources.</p>}
   <form onSubmit={provision} className="admin-form">
    <h3>Provision a disabled Nexus Consumer API client</h3>
    <label htmlFor="consumer-app">Application</label>
    <select id="consumer-app" required value={applicationId} disabled={busy} onChange={e=>setApplicationId(e.target.value)}>
     <option value="">Select application</option>{data.applications.map(a=><option key={a.id} value={a.id} disabled={a.app_key!=='sandcastle'}>{a.name} ({a.app_key}) · {a.status}</option>)}
    </select><p>The reviewed profile currently supports Sandcastle Development only.</p>
    <label htmlFor="consumer-env">Environment</label><select id="consumer-env" value={data.profile.environment} disabled><option value="development">Development</option></select>
    <label htmlFor="consumer-resource">Approved Nexus resource</label><select id="consumer-resource" value={data.profile.audience} disabled><option>{data.profile.audience}</option></select>
    <label htmlFor="consumer-callback">Exact HTTPS callback</label><input id="consumer-callback" readOnly value={data.profile.callback}/>
    <p>Authorization Code + PKCE S256 · private_key_jwt · ES256 assertions ≤60 seconds · DPoP required · explicit consent · first committed client state disabled.</p>
    <h4>Approved human scopes</h4><ul>{data.profile.scopes.map(s=><li key={s}><code>{s}</code></li>)}</ul>
    <label htmlFor="consumer-operation">Restricted application operation</label><input id="consumer-operation" readOnly value={data.profile.operations.join(', ')}/>
    <label htmlFor="consumer-jwks">Public ES256 JWKS</label><textarea id="consumer-jwks" required rows={8} value={jwks} disabled={busy} onChange={e=>setJwks(e.target.value)}/>
    <p>Paste the existing approved public JWKS only. No private key, secret, replacement key or remote key URL.</p>
    <label htmlFor="consumer-reason">Reason</label><input id="consumer-reason" required maxLength={512} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/>
    {selected?.status==='disabled'&&<p role="status">Application is disabled. Separate approval is required before restoring application eligibility.</p>}
    {duplicate&&<p role="status">A consumer registration already occupies this application/environment. Read back and reconcile it; do not create another.</p>}
    {unresolved&&<p role="alert">Incomplete provisioning or an orphan client requires operator reconciliation. No automatic retry or repair.</p>}
    {retained&&<p role="status">Retained submission: <code>{retained}</code>. Check its journal and authoritative records before any further write.</p>}
    <button type="submit" className="button" disabled={busy||blocked}>{busy?'Provisioning disabled consumer client…':'Provision disabled Nexus Consumer API client'}</button>
   </form>
   <h3>Consumer registrations and operation grants</h3>
   {!data.clients.length?<p>No Nexus Consumer API client is registered.</p>:<ul>{data.clients.map(c=><li key={c.oauth_client_id}><code>{c.oauth_client_id}</code> · {c.environment} · {c.provider_present?(c.disabled===null?'status unknown':c.disabled?'disabled':'enabled'):'provider record missing'} · {c.authentication_method} · {c.binding_present?'binding recorded':'binding missing'}
    <p>PKCE: {c.pkce?'required':'absent'} · DPoP: {c.dpop?'required':'absent'} · consent: {c.skip_consent?'skipped':'explicit'} · client generation: {c.epoch_enabled===false?'disabled':c.epoch_enabled===true?'enabled':'missing'}</p>
    <p>Scopes: {(c.scopes??[]).join(' ')}<br/>Public key IDs: {(c.public_key_ids??[]).join(', ')||'none'}</p>
    <ul>{data.operations.filter(o=>o.client_id===c.oauth_client_id).map(o=><li key={o.operation}>{o.operation}: {o.enabled?'configured':'disabled'}</li>)}</ul></li>)}</ul>}
   <h3>Administration journal and reconciliation</h3><p>Up to 50 actions, incomplete actions first. Provisioning and operation grants are audited together. Started or failed actions require review; status refresh performs no writes.</p>
   {!data.journal.length?<p>No administration actions recorded.</p>:<ul>{data.journal.map(j=><li key={j.request_id}><code>{j.request_id}</code> · {j.action} · <strong>{j.state}</strong> · {j.created_at} · {j.reason}{j.client_id&&<> · client <code>{j.client_id}</code></>}</li>)}</ul>}
   {!!data.orphans.length&&<><h4>Unlinked provider clients requiring reconciliation</h4><ul>{data.orphans.map(o=><li key={o.client_id}><code>{o.client_id}</code> · {o.disabled?'disabled':'enabled: stop'} · request <code>{o.request_id}</code></li>)}</ul></>}
   <p>Activation, revocation and key maintenance remain separately approved administration operations; provisioning never enables a client.</p>
   <ConsumerMaintenance clientIds={data.clients.map(c=>c.oauth_client_id)} resourceExists={!!data.resource} onRecorded={load}/>
  </>}
 </section>;
}
