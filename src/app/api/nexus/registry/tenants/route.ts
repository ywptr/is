import type { NextRequest } from "next/server";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";
import { reply } from "@/lib/nexus-response";
import { dbError,isKey,isName,isPolicy,isStatus,isUuid,parseBody,transact } from "@/lib/nexus-registry";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
  try{if(!await currentNexusOperatorId(req.headers))return reply({error:"forbidden"},403);
    const rows=await pool.query(`SELECT t.id,t.tenant_key,t.name,t.status,t.admission_policy,t.created_at,
      (SELECT count(*)::int FROM nexus_entitlements e WHERE e.tenant_id=t.id AND e.enabled) AS enabled_apps
      FROM nexus_tenants t ORDER BY t.name`);return reply({tenants:rows.rows});
  }catch(e){console.error("Nexus list tenants",e);return reply({error:"internal_error"},500);}
}
export async function POST(req:NextRequest){
  if(!hasTrustedOrigin(req.headers))return reply({error:"invalid_origin"},403);
  try{const actor=await currentNexusOperatorId(req.headers);if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    if(!b||!isKey(b.key)||!isName(b.name)||!isPolicy(b.policy??"invitation_only"))return reply({error:"invalid_body"},400);
    const key=b.key,name=b.name.trim(),policy=b.policy??"invitation_only";
    const row=await transact(async c=>{
      const result=await c.query(`INSERT INTO nexus_tenants(tenant_key,name,admission_policy) VALUES($1,$2,$3) RETURNING *`,[key,name,policy]);
      await c.query(`INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'tenant',$2,'create',$3::jsonb)`,[actor,result.rows[0].id,JSON.stringify({key,policy})]);
      return result.rows[0];
    });return reply({tenant:row},201);
  }catch(e){const err=dbError(e);if(err)return reply({error:err},409);console.error("Nexus create tenant",e);return reply({error:"internal_error"},500);}
}
export async function PATCH(req:NextRequest){
  if(!hasTrustedOrigin(req.headers))return reply({error:"invalid_origin"},403);
  try{const actor=await currentNexusOperatorId(req.headers);if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    if(!b||!isUuid(b.id)||(!isStatus("tenants",b.status)&&!isPolicy(b.policy)))return reply({error:"invalid_body"},400);
    if(b.status!==undefined&&!isStatus("tenants",b.status))return reply({error:"invalid_status"},400);
    if(b.policy!==undefined&&!isPolicy(b.policy))return reply({error:"invalid_policy"},400);
    const row=await transact(async c=>{
      const result=await c.query(`UPDATE nexus_tenants SET status=COALESCE($2,status), admission_policy=COALESCE($3,admission_policy), updated_at=now()
        WHERE id=$1 AND (status IS DISTINCT FROM COALESCE($2,status) OR admission_policy IS DISTINCT FROM COALESCE($3,admission_policy)) RETURNING *`,[b.id,b.status??null,b.policy??null]);
      if(result.rowCount) await c.query(`INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'tenant',$2,'update',$3::jsonb)`,[actor,b.id,JSON.stringify({status:b.status,policy:b.policy})]);
      return result.rows[0]??null;
    });return reply({tenant:row,unchanged:!row});
  }catch(e){console.error("Nexus update tenant",e);return reply({error:"internal_error"},500);}
}
