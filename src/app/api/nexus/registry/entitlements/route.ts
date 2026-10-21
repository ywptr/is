import type { NextRequest } from "next/server";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";
import { reply } from "@/lib/nexus-response";
import { dbError,isUuid,parseBody,transact } from "@/lib/nexus-registry";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
  try{if(!await currentNexusOperatorId(req.headers))return reply({error:"forbidden"},403);
    const rows=await pool.query(`SELECT e.tenant_id,e.application_id,e.enabled,e.updated_at,
      t.name AS tenant_name,t.status AS tenant_status,a.name AS application_name,a.status AS application_status
      FROM nexus_entitlements e JOIN nexus_tenants t ON t.id=e.tenant_id
      JOIN nexus_applications a ON a.id=e.application_id ORDER BY t.name,a.name`);
    return reply({entitlements:rows.rows});
  }catch(e){console.error("Nexus entitlements GET",e);return reply({error:"internal_error"},500);}
}
export async function PUT(req:NextRequest){
  if(!hasTrustedOrigin(req.headers))return reply({error:"invalid_origin"},403);
  try{const actor=await currentNexusOperatorId(req.headers);if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    if(!b||!isUuid(b.tenantId)||!isUuid(b.applicationId)||typeof b.enabled!=="boolean")return reply({error:"invalid_body"},400);
    const record=await transact(async c=>{
      const result=await c.query(`INSERT INTO nexus_entitlements(tenant_id,application_id,enabled,updated_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,application_id) DO UPDATE
        SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING *`,[b.tenantId,b.applicationId,b.enabled,actor]);
      await c.query(`INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail)
        VALUES($1,'entitlement',$2,'set_entitlement',$3::jsonb)`,[actor,`${b.tenantId}:${b.applicationId}`,JSON.stringify({enabled:b.enabled})]);
      return result.rows[0];
    });return reply({entitlement:record});
  }catch(e){const err=dbError(e);if(err)return reply({error:err},409);console.error("Nexus entitlement PUT",e);return reply({error:"internal_error"},500);}
}
