import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";
import { reply } from "@/lib/nexus-response";
import { isUuid, parseBody } from "@/lib/nexus-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const environments = ["development","staging","production"];
function redirectUri(s:unknown):s is string {
  if(typeof s!=="string" || s.length>2048)return false;
  try {
    const u=new URL(s);
    if(u.hash || u.username || u.password)return false;
    if(u.protocol==="https:")return true;
    return u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname);
  } catch{return false;}
}
export async function GET(req:NextRequest){
  try{
    if(!await currentNexusOperatorId(req.headers))return reply({error:"forbidden"},403);
    const r=await pool.query(`SELECT o.application_id,o.environment,o.oauth_client_id,o.redirect_uris,o.created_at
      FROM nexus_application_oauth_clients o ORDER BY o.created_at DESC`);
    return reply({clients:r.rows});
  }catch(e){console.error("Nexus OAuth list",e);return reply({error:"internal_error"},500);}
}
export async function POST(req:NextRequest){
  if(!hasTrustedOrigin(req.headers))return reply({error:"invalid_origin"},403);
  try{
    const actor=await currentNexusOperatorId(req.headers);if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    if(!b||!isUuid(b.applicationId)||!environments.includes(String(b.environment))||
      !Array.isArray(b.redirectUris)||b.redirectUris.length<1||b.redirectUris.length>10||
      !b.redirectUris.every(redirectUri)||new Set(b.redirectUris).size!==b.redirectUris.length)return reply({error:"invalid_body"},400);
    const app=await pool.query("SELECT id,name,status FROM nexus_applications WHERE id=$1",[b.applicationId]);
    if(app.rowCount!==1||app.rows[0].status!=="active")return reply({error:"application_not_active"},409);
    const exists=await pool.query("SELECT 1 FROM nexus_application_oauth_clients WHERE application_id=$1 AND environment=$2",[b.applicationId,b.environment]);
    if(exists.rowCount)return reply({error:"already_provisioned"},409);
    // The OAuth provider remains authoritative for client credentials. Never persist the secret here.
    const client=await auth.api.adminCreateOAuthClient({
      headers:req.headers,
      body:{client_name:`${app.rows[0].name} (${b.environment})`,redirect_uris:b.redirectUris,
        token_endpoint_auth_method:"client_secret_basic",grant_types:["authorization_code"],
        response_types:["code"],scope:"openid profile email",require_pkce:true,
        skip_consent:true,enable_end_session:true}
    });
    if(!client.client_id||!client.client_secret)throw new Error("No credentials returned by Better Auth");
    try{
      const db=await pool.connect();
      try{
        await db.query("BEGIN");
        await db.query("INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by) VALUES($1,$2,$3,$4::jsonb,$5)",[b.applicationId,b.environment,client.client_id,JSON.stringify(b.redirectUris),actor]);
        await db.query("INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'application',$2,'update',$3::jsonb)",[actor,b.applicationId,JSON.stringify({event:"oauth_provision",environment:b.environment,client_id:client.client_id})]);
        await db.query("COMMIT");
      }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
    }catch(e){
      // Attempt to disable an orphaned client; never reveal its credentials after a failed linkage.
      try{await auth.api.adminUpdateOAuthClient({headers:req.headers,body:{client_id:client.client_id,update:{disabled:true}}});}
      catch(disableError){console.error("CRITICAL: orphan OAuth client requires manual revocation",client.client_id,disableError);}
      throw e;
    }
    return reply({client_id:client.client_id,client_secret:client.client_secret,environment:b.environment,application_id:b.applicationId},201);
  }catch(e){console.error("Nexus OAuth provision failure",e);return reply({error:"provision_failed_check_server_logs"},500);}
}
