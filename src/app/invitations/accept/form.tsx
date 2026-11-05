"use client";
import {useEffect,useState} from "react";
export function AcceptInvitation() {
  const [token,setToken]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{const value=new URLSearchParams(window.location.hash.slice(1)).get("token");if(value){setToken(value);window.history.replaceState(null,"",window.location.pathname);}},[]);
  async function accept() {
    setBusy(true);setMessage("");try {
      const r=await fetch("/api/nexus/invitations/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||"Invitation could not be accepted");
      setToken("");setMessage("Invitation accepted. Membership is active; application permissions are managed separately.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to accept invitation");}finally{setBusy(false);}
  }
  return <form className="stack" onSubmit={e=>{e.preventDefault();void accept();}}>
    <label>Invitation token <input type="password" autoComplete="off" required minLength={43} maxLength={43} value={token} onChange={e=>setToken(e.target.value)}/></label>
    <button className="button" disabled={busy||!token}>Accept invitation</button>
    {message&&<p role="status">{message}</p>}
  </form>;
}
