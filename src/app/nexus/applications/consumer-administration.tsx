"use client";
import {useState} from 'react';
export function ConsumerAdministration(){
 const [action,setAction]=useState('resource'),[applicationId,setApplicationId]=useState(''),[clientId,setClientId]=useState(''),[jwks,setJwks]=useState(''),[operations,setOperations]=useState(''),[reason,setReason]=useState(''),[tokenId,setTokenId]=useState(''),[kind,setKind]=useState('session'),[key,setKey]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setNotice('');try{
 const body:Record<string,unknown>={action,environment:'development',requestId:crypto.randomUUID(),reason};
 if(action==='provision'){body.applicationId=applicationId;body.operations=operations.split('\n').map(s=>s.trim()).filter(Boolean);}
 if(['disable','enable','keys'].includes(action))body.clientId=clientId;
 if(['keys','provision'].includes(action))body.jwks=JSON.parse(jwks);
 if(action==='revoke_token')body.tokenId=tokenId;
 if(action==='invalidate'){body.kind=kind;body.key=key;}
 const r=await fetch('/api/nexus/registry/applications/oauth/consumer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.error??'Request failed');setNotice('Recorded. '+(result.clientId??'')+' Clients remain disabled until explicitly enabled.');
 }catch(e){setNotice(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 return <form onSubmit={submit} className="stack"><h2>Development consumer credentials</h2><p>Separate resource credentials for human access. No tenant access is granted by registration. Submit public keys only.</p>
 <label>Action <select value={action} onChange={e=>setAction(e.target.value)}>{['resource','provision','disable','enable','keys','revoke_token','invalidate'].map(v=><option key={v}>{v}</option>)}</select></label>
 {action==='provision'&&<><label>Application UUID <input required value={applicationId} onChange={e=>setApplicationId(e.target.value)}/></label><label>Approved Sandcastle operations, one per line <textarea value={operations} onChange={e=>setOperations(e.target.value)}/></label></>}
 {['disable','enable','keys'].includes(action)&&<label>Client ID <input required value={clientId} onChange={e=>setClientId(e.target.value)}/></label>}
 {['keys','provision'].includes(action)&&<label>Public ES256 JWKS <textarea required value={jwks} onChange={e=>setJwks(e.target.value)}/></label>}
 {action==='revoke_token'&&<label>Token identifier <input required value={tokenId} onChange={e=>setTokenId(e.target.value)}/></label>}
 {action==='invalidate'&&<><label>Credential scope <select value={kind} onChange={e=>setKind(e.target.value)}>{['session','user','sender_key','signing_key'].map(v=><option key={v}>{v}</option>)}</select></label><label>Verified identifier <input required value={key} onChange={e=>setKey(e.target.value)}/></label><p>User invalidation blocks resource credentials; it does not suspend the global account.</p></>}
 <label>Reason <input required maxLength={512} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy} type="submit">{busy?'Recording…':'Record change'}</button><p role="status">{notice}</p></form>;
}
