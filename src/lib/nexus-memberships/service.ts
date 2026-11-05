import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { canManage, MembershipError } from "./policy.ts";
import type { Member, Mode, Role, Status } from "./policy.ts";

type Context={actorId:string; mode:Mode; tenantId:string; requestId:string};
type Change={role:Role; status:Status; expectedVersion:number; reason:string};
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
export function createMembershipService(pool:Pool) {
  async function transaction<T>(fn:(db:PoolClient)=>Promise<T>):Promise<T> {
    const db=await pool.connect();
    try {await db.query("BEGIN"); const value=await fn(db); await db.query("COMMIT"); return value;}
    catch(e) {
      await db.query("ROLLBACK");
      if(e instanceof MembershipError) throw e;
      const err=e as {code?:string;constraint?:string};
      if(err.code==="23514"&&err.constraint==="nexus_last_active_admin") throw new MembershipError("last_admin_protected");
      if(err.code==="23505") throw new MembershipError("already_exists");
      if(err.code==="40001"||err.code==="40P01") throw new MembershipError("concurrent_change_retry");
      throw e;
    } finally {db.release();}
  }
  async function authority(db:PoolClient,ctx:Context):Promise<Member|null> {
    if(ctx.mode==="operator") {
      // KEY SHARE conflicts with operator DELETE, keeping the grant valid through commit.
      const r=await db.query("SELECT user_id FROM nexus_operators WHERE user_id=$1 FOR KEY SHARE",[ctx.actorId]);
      if(!r.rowCount) throw new MembershipError("forbidden",403);
      return null;
    }
    const r=await db.query<Member>("SELECT user_id,role,status,version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2 FOR SHARE",[ctx.tenantId,ctx.actorId]);
    const member=r.rows[0];
    if(!member || member.status!=="active" || member.role==="member") throw new MembershipError("forbidden",403);
    return member;
  }
  async function lock(db:PoolClient,ctx:Context) {
    // Authorize before revealing tenant existence, then serialize tenant management.
    if(ctx.mode==="operator") await authority(db,ctx);
    else {
      const permitted=await db.query("SELECT 1 FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND status='active' AND role IN ('owner','admin')",[ctx.tenantId,ctx.actorId]);
      if(!permitted.rowCount) throw new MembershipError("forbidden",403);
    }
    const tenant=await db.query("SELECT id,status FROM nexus_tenants WHERE id=$1 FOR UPDATE",[ctx.tenantId]);
    if(!tenant.rowCount) throw new MembershipError("tenant_not_found",404);
    const actor=await authority(db,ctx);
    if(ctx.mode==="tenant"&&tenant.rows[0].status!=="active") throw new MembershipError("tenant_suspended",403);
    return actor;
  }
  async function initialized(db:PoolClient,tenantId:string) {
    const r=await db.query("SELECT 1 FROM nexus_tenant_membership_governance WHERE tenant_id=$1",[tenantId]);
    if(!r.rowCount) throw new MembershipError("administrator_not_assigned");
  }
  async function eligible(db:PoolClient,id:string) {
    const r=await db.query(`SELECT u.id,u.email FROM "user" u JOIN is_admission_emails a ON a.email=lower(trim(u.email))
      WHERE u.id=$1 AND u."emailVerified"=true FOR SHARE OF u,a`,[id]);
    if(!r.rowCount) throw new MembershipError("identity_not_eligible",404);
    return r.rows[0] as {id:string;email:string};
  }
  async function member(db:PoolClient,tenantId:string,id:string) {
    return (await db.query<Member>("SELECT user_id,role,status,version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2",[tenantId,id])).rows[0]??null;
  }
  async function audit(db:PoolClient,ctx:Context,action:string,target:string|null,invitation:string|null,before:unknown,after:unknown,reason:string) {
    await db.query(`INSERT INTO nexus_tenant_membership_audit(tenant_id,actor_user_id,target_user_id,invitation_id,action,before_value,after_value,reason,request_id)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,[ctx.tenantId,ctx.actorId,target,invitation,action,JSON.stringify(before),JSON.stringify(after),reason,ctx.requestId]);
  }
  async function insertMember(db:PoolClient,ctx:Context,id:string,role:Role) {
    return (await db.query<Member>(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by)
      VALUES($1,$2,$3,'active',$4,$4) RETURNING user_id,role,status,version`,[ctx.tenantId,id,role,ctx.actorId])).rows[0];
  }
  function policy(mode:Mode,actor:Member|null,previous:Member|null,nextRole:Role) {
    if(!canManage(mode,actor,previous,nextRole)) throw new MembershipError("forbidden",403);
  }
  return {
    async list(ctx:Context,limit:number,cursor:string|null) {
      return transaction(async db=>{
        const actor=await lock(db,ctx);
        const g=await db.query("SELECT active_admin_count FROM nexus_tenant_membership_governance WHERE tenant_id=$1",[ctx.tenantId]);
        const r=await db.query(`SELECT m.user_id,m.role,m.status,m.version,u.name,u.email FROM nexus_tenant_memberships m
          JOIN "user" u ON u.id=m.user_id WHERE m.tenant_id=$1 AND ($2::text IS NULL OR m.user_id>$2)
          ORDER BY m.user_id LIMIT $3`,[ctx.tenantId,cursor,limit+1]);
        const rows=r.rows.slice(0,limit);
        return {members:rows,initialized:!!g.rowCount,activeAdminCount:g.rows[0]?.active_admin_count??0,actorRole:actor?.role??"operator",nextCursor:r.rows.length>limit?rows.at(-1)?.user_id:null};
      });
    },
    async bootstrap(ctx:Context,id:string,reason:string) {
      return transaction(async db=>{
        if(ctx.mode!=="operator") throw new MembershipError("forbidden",403);
        await lock(db,ctx); await eligible(db,id);
        await db.query("INSERT INTO nexus_tenant_membership_governance(tenant_id) VALUES($1)",[ctx.tenantId]);
        const after=await insertMember(db,ctx,id,"owner");
        await audit(db,ctx,"bootstrap",id,null,null,after,reason); return {member:after};
      });
    },
    async add(ctx:Context,id:string,role:Role,reason:string) {
      return transaction(async db=>{
        const actor=await lock(db,ctx); await initialized(db,ctx.tenantId); policy(ctx.mode,actor,null,role); await eligible(db,id);
        const after=await insertMember(db,ctx,id,role);
        await audit(db,ctx,"add",id,null,null,after,reason); return {member:after};
      });
    },
    async change(ctx:Context,id:string,change:Change) {
      return transaction(async db=>{
        const actor=await lock(db,ctx), before=await member(db,ctx.tenantId,id);
        if(!before) throw new MembershipError("membership_not_found",404);
        policy(ctx.mode,actor,before,change.role);
        if(before.version!==change.expectedVersion) throw new MembershipError("stale_version");
        if(before.status!=="active"&&change.status==="active") await eligible(db,id);
        const after=(await db.query<Member>(`UPDATE nexus_tenant_memberships SET role=$3,status=$4,version=version+1,updated_by=$5,updated_at=now()
          WHERE tenant_id=$1 AND user_id=$2 RETURNING user_id,role,status,version`,[ctx.tenantId,id,change.role,change.status,ctx.actorId])).rows[0];
        await audit(db,ctx,"change",id,null,before,after,change.reason); return {member:after};
      });
    },
    async invitations(ctx:Context,limit:number,cursor:string|null) {
      return transaction(async db=>{
        await lock(db,ctx);
        const r=await db.query(`SELECT id,email,user_id,role,state,expires_at,created_at FROM nexus_tenant_invitations
          WHERE tenant_id=$1 AND ($2::text IS NULL OR id::text>$2) ORDER BY id LIMIT $3`,[ctx.tenantId,cursor,limit+1]);
        const rows=r.rows.slice(0,limit); return {invitations:rows,nextCursor:r.rows.length>limit?rows.at(-1)?.id:null};
      });
    },
    async invite(ctx:Context,email:string,id:string|null,role:Role,reason:string) {
      return transaction(async db=>{
        const actor=await lock(db,ctx); await initialized(db,ctx.tenantId); policy(ctx.mode,actor,null,role);
        const t=await db.query("SELECT status FROM nexus_tenants WHERE id=$1",[ctx.tenantId]);
        if(t.rows[0].status!=="active") throw new MembershipError("tenant_suspended",403);
        if(id) {const u=await eligible(db,id); if(u.email.trim().toLowerCase()!==email) throw new MembershipError("identity_not_eligible",404);}
        const expired=await db.query(`UPDATE nexus_tenant_invitations SET state='expired',resolved_at=now()
          WHERE tenant_id=$1 AND email=$2 AND state='pending' AND expires_at<=now() RETURNING id`,[ctx.tenantId,email]);
        for(const row of expired.rows) await audit(db,ctx,"expire_invitation",null,row.id,{state:"pending"},{state:"expired"},reason);
        const token=randomBytes(32).toString("base64url");
        const row=(await db.query(`INSERT INTO nexus_tenant_invitations(tenant_id,email,user_id,role,token_digest,expires_at,created_by,created_as)
          VALUES($1,$2,$3,$4,$5,now()+interval '7 days',$6,$7) RETURNING id,email,role,state,expires_at`,[ctx.tenantId,email,id,role,digest(token),ctx.actorId,ctx.mode])).rows[0];
        await audit(db,ctx,"invite",id,row.id,null,{email,role,state:"pending"},reason);
        return {invitation:row,token};
      });
    },
    async revoke(ctx:Context,id:string,reason:string) {
      return transaction(async db=>{
        const actor=await lock(db,ctx);
        const invitation=(await db.query("SELECT role,state FROM nexus_tenant_invitations WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[ctx.tenantId,id])).rows[0];
        if(!invitation) throw new MembershipError("invitation_not_found",404);
        policy(ctx.mode,actor,{role:invitation.role} as Member,invitation.role);
        if(invitation.state!=="pending") throw new MembershipError("invitation_resolved");
        await db.query("UPDATE nexus_tenant_invitations SET state='revoked',resolved_at=now() WHERE tenant_id=$1 AND id=$2",[ctx.tenantId,id]);
        await audit(db,ctx,"revoke_invitation",null,id,{state:"pending"},{state:"revoked"},reason); return {revoked:true};
      });
    },
    async accept(actorId:string,token:string,requestId:string) {
      // This budget commits independently so invalid/replayed attempts consume it too.
      const budget=await pool.query(`INSERT INTO nexus_invitation_redemption_limits(user_id,window_start,attempts) VALUES($1,now(),1)
        ON CONFLICT(user_id) DO UPDATE SET
        attempts=CASE WHEN nexus_invitation_redemption_limits.window_start<now()-interval '1 minute' THEN 1 ELSE nexus_invitation_redemption_limits.attempts+1 END,
        window_start=CASE WHEN nexus_invitation_redemption_limits.window_start<now()-interval '1 minute' THEN now() ELSE nexus_invitation_redemption_limits.window_start END
        RETURNING attempts`,[actorId]);
      if(budget.rows[0].attempts>20) throw new MembershipError("too_many_attempts",429);
      return transaction(async db=>{
        // Discover tenant from digest, never a caller-supplied tenant/role. No secret in result/logs.
        const hint=(await db.query("SELECT tenant_id FROM nexus_tenant_invitations WHERE token_digest=$1",[digest(token)])).rows[0];
        if(!hint) throw new MembershipError("invitation_unavailable",404);
        const tenant=(await db.query("SELECT status FROM nexus_tenants WHERE id=$1 FOR UPDATE",[hint.tenant_id])).rows[0];
        const inv=(await db.query("SELECT *,expires_at<=clock_timestamp() AS expired FROM nexus_tenant_invitations WHERE token_digest=$1 FOR UPDATE",[digest(token)])).rows[0];
        if(!inv||inv.state!=="pending") throw new MembershipError("invitation_unavailable",404);
        if(inv.expired) throw new MembershipError("invitation_expired",410);
        if(tenant.status!=="active") throw new MembershipError("tenant_suspended",403);
        const u=await eligible(db,actorId);
        if(u.email.trim().toLowerCase()!==inv.email || (inv.user_id&&inv.user_id!==actorId)) throw new MembershipError("invitation_unavailable",404);
        const grantCtx:Context={actorId:inv.created_by,mode:inv.created_as,tenantId:inv.tenant_id,requestId};
        const grantActor=await authority(db,grantCtx);
        const before=await member(db,inv.tenant_id,actorId);
        policy(inv.created_as,grantActor,before,inv.role);
        if(before&&(before.status==="active"||before.role!==inv.role)) throw new MembershipError("membership_conflict");
        const ctx:Context={actorId,mode:"tenant",tenantId:inv.tenant_id,requestId};
        const after=before?(await db.query<Member>(`UPDATE nexus_tenant_memberships SET status='active',version=version+1,updated_by=$3,updated_at=now()
          WHERE tenant_id=$1 AND user_id=$2 RETURNING user_id,role,status,version`,[inv.tenant_id,actorId,actorId])).rows[0]:await insertMember(db,ctx,actorId,inv.role);
        const accepted=await db.query("UPDATE nexus_tenant_invitations SET state='accepted',resolved_at=now(),accepted_by=$2 WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id",[inv.id,actorId]);
        if(!accepted.rowCount) throw new MembershipError("invitation_expired",410);
        await audit(db,ctx,"accept_invitation",actorId,inv.id,before,after,"Verified recipient accepted invitation");
        return {tenantId:inv.tenant_id,member:after};
      });
    }
  };
}
export type MembershipService=ReturnType<typeof createMembershipService>;
