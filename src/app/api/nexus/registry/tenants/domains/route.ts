import type { NextRequest } from "next/server";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";
import { reply } from "@/lib/nexus-response";
import { isUuid, parseBody, transact, dbError } from "@/lib/nexus-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function hostname(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 253) return null;
  const h = input.trim().toLowerCase();
  if (!h || h.endsWith(".") || h.includes(":") || h.includes("/") || h.includes("@")) return null;
  if (!h.split(".").every(x => x.length > 0 && x.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))) return null;
  return h;
}
export async function GET(req: NextRequest) {
  try {
    if (!await currentNexusOperatorId(req.headers)) return reply({error:"forbidden"},403);
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!isUuid(tenantId)) return reply({error:"invalid_tenant_id"},400);
    const r = await pool.query("SELECT hostname, tenant_id, is_primary FROM nexus_tenant_domains WHERE tenant_id=$1 ORDER BY is_primary DESC, hostname",[tenantId]);
    return reply({domains:r.rows});
  } catch(e) { console.error("Nexus domain list",e); return reply({error:"internal_error"},500); }
}
export async function POST(req:NextRequest) {
  if (!hasTrustedOrigin(req.headers)) return reply({error:"invalid_origin"},403);
  try {
    const actor=await currentNexusOperatorId(req.headers); if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));
    const host=hostname(b?.hostname);
    if(!b||!isUuid(b.tenantId)||!host||typeof b.primary!=="boolean") return reply({error:"invalid_body"},400);
    const row=await transact(async c=>{
      // Serialize primary-domain changes for the tenant.
      const t=await c.query("SELECT id FROM nexus_tenants WHERE id=$1 FOR UPDATE",[b.tenantId]);
      if(!t.rowCount) return null;
      if(b.primary)await c.query("UPDATE nexus_tenant_domains SET is_primary=false WHERE tenant_id=$1",[b.tenantId]);
      const r=await c.query("INSERT INTO nexus_tenant_domains(hostname,tenant_id,is_primary) VALUES($1,$2,$3) RETURNING *",[host,b.tenantId,b.primary]);
      await c.query("INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'tenant',$2,'update',$3::jsonb)",[actor,b.tenantId,JSON.stringify({domain_added:host,primary:b.primary})]);
      return r.rows[0];
    });
    return row?reply({domain:row},201):reply({error:"tenant_not_found"},404);
  } catch(e){if(dbError(e))return reply({error:dbError(e)},409);console.error("Nexus domain add",e);return reply({error:"internal_error"},500);}
}
export async function DELETE(req:NextRequest) {
  if(!hasTrustedOrigin(req.headers))return reply({error:"invalid_origin"},403);
  try {
    const actor=await currentNexusOperatorId(req.headers);if(!actor)return reply({error:"forbidden"},403);
    const b=parseBody(await req.json().catch(()=>null));const host=hostname(b?.hostname);
    if(!b||!isUuid(b.tenantId)||!host)return reply({error:"invalid_body"},400);
    const row=await transact(async c=>{
      const t=await c.query("SELECT id FROM nexus_tenants WHERE id=$1 FOR UPDATE",[b.tenantId]);if(!t.rowCount)return null;
      const r=await c.query("DELETE FROM nexus_tenant_domains WHERE tenant_id=$1 AND hostname=$2 RETURNING hostname",[b.tenantId,host]);
      if(r.rowCount)await c.query("INSERT INTO nexus_registry_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,'tenant',$2,'update',$3::jsonb)",[actor,b.tenantId,JSON.stringify({domain_removed:host})]);
      return r.rowCount===1;
    });
    if(row===null)return reply({error:"tenant_not_found"},404);
    return row?reply({removed:host}):reply({error:"domain_not_found"},404);
  }catch(e){console.error("Nexus domain remove",e);return reply({error:"internal_error"},500);}
}
