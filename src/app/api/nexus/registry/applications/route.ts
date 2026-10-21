import type { NextRequest } from "next/server";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";
import { reply } from "@/lib/nexus-response";
import { dbError, isKey, isName, isStatus, isUuid, parseBody, transact } from "@/lib/nexus-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req:NextRequest) {
  try {
    if (!await currentNexusOperatorId(req.headers)) return reply({error:"forbidden"},403);
    const rows = await pool.query(`SELECT a.id,a.app_key,a.name,a.description,a.status,a.created_at,
      (SELECT count(*)::int FROM nexus_entitlements e WHERE e.application_id=a.id AND e.enabled) AS enabled_tenants
      FROM nexus_applications a ORDER BY a.name`);
    return reply({applications:rows.rows});
  } catch(e) { console.error("Nexus list applications",e); return reply({error:"internal_error"},500); }
}
export async function POST(req:NextRequest) {
  if (!hasTrustedOrigin(req.headers)) return reply({error:"invalid_origin"},403);
  try {
    const actor=await currentNexusOperatorId(req.headers);
    if(!actor) return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    if(!b || !isKey(b.key) || !isName(b.name) || (b.description !== undefined && (typeof b.description !== "string" || b.description.length>500))) return reply({error:"invalid_body"},400);
    const key=b.key, name=b.name.trim(), description=(b.description as string|undefined)?.trim()||null;
    const result=await transact(async c=>{
      const row=await c.query(`INSERT INTO nexus_applications(app_key,name,description) VALUES($1,$2,$3) RETURNING *`,[key,name,description]);
      await c.query(`INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'application',$2,'create',$3::jsonb)`,[actor,row.rows[0].id,JSON.stringify({key})]);
      return row.rows[0];
    });
    return reply({application:result},201);
  } catch(e) { const err=dbError(e); if(err)return reply({error:err},409); console.error("Nexus create application",e);return reply({error:"internal_error"},500); }
}
export async function PATCH(req:NextRequest) {
  if(!hasTrustedOrigin(req.headers)) return reply({error:"invalid_origin"},403);
  try {
    const actor=await currentNexusOperatorId(req.headers);if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    if(!b||!isUuid(b.id)||!isStatus("applications",b.status))return reply({error:"invalid_body"},400);
    const row=await transact(async c=>{
      const changed=await c.query(`UPDATE nexus_applications SET status=$2,updated_at=now() WHERE id=$1 AND status<>$2 RETURNING *`,[b.id,b.status]);
      if(changed.rowCount)await c.query(`INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'application',$2,'update',$3::jsonb)`,[actor,b.id,JSON.stringify({status:b.status})]);
      return changed.rows[0]??null;
    });
    return reply({application:row,unchanged:!row});
  }catch(e){console.error("Nexus update application",e);return reply({error:"internal_error"},500);}
}
