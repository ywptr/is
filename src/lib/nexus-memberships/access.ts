import type {Pool} from "pg";
import type {Mode} from "./policy.ts";
/** Preflight guard only. The service rechecks authority under transaction locks. */
export async function hasMembershipAuthority(pool:Pool,mode:Mode,id:string,tenant:string):Promise<boolean> {
  const result=mode==="operator"
    ? await pool.query("SELECT 1 FROM nexus_operators WHERE user_id=$1",[id])
    : await pool.query(`SELECT 1 FROM nexus_tenant_memberships m JOIN nexus_tenants t ON t.id=m.tenant_id
      WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='active' AND m.role IN ('owner','admin') AND t.status='active'`,[tenant,id]);
  return result.rowCount===1;
}
