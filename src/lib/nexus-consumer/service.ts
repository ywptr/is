import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ConsumerIdentity } from "../identity/consumer-integration.ts";
import type { VerifiedHumanCredential } from "../identity/access-credentials.ts";
export class ConsumerError extends Error {
  readonly status:number; readonly code:string;
  constructor(status:number,code:string){super(code);this.status=status;this.code=code;}
}
export const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export type ConsumerOperation="tenants"|"membership"|"entitlements"|"decision";
export const scopeFor={tenants:"nexus:tenants:read",membership:"nexus:membership:self",entitlements:"nexus:entitlements:read",decision:"nexus:access:evaluate"};
export interface ConsumerInput {tenantId?:string;applicationId?:string;operation?:string;limit?:number;cursor?:string}
const eligible=`FROM nexus_tenants t
  JOIN nexus_tenant_membership_governance g ON g.tenant_id=t.id AND g.active_admin_count>0
  JOIN nexus_tenant_memberships m ON m.tenant_id=t.id AND m.user_id=$1 AND m.status='active'
  JOIN nexus_applications a ON a.id=$2 AND a.status='active'
  JOIN nexus_entitlements e ON e.tenant_id=t.id AND e.application_id=a.id AND e.enabled
  JOIN nexus_consumer_epochs mt ON mt.kind='membership' AND mt.subject_key=t.id::text||':'||m.user_id
  JOIN nexus_consumer_epochs tt ON tt.kind='tenant' AND tt.subject_key=t.id::text
  JOIN nexus_consumer_epochs aa ON aa.kind='application' AND aa.subject_key=a.id::text
  JOIN nexus_consumer_epochs ee ON ee.kind='entitlement' AND ee.subject_key=t.id::text||':'||a.id::text
  WHERE t.status='active'`;
const columns=`t.id,t.tenant_key,t.name,m.role,mt.version::text AS membership_version,tt.version::text AS tenant_version,
  aa.version::text AS application_version,ee.version::text AS entitlement_version`;
const membership=(row:Record<string,string>)=>{
  if(!Number.isSafeInteger(Number(row.membership_version)))throw new ConsumerError(503,"dependency_unavailable");
  return {role:row.role,status:"active",version:Number(row.membership_version)};
};
export function createConsumerService(identity:ConsumerIdentity){
  return {async execute(request:Request,op:ConsumerOperation,input:ConsumerInput,requestId:string){
    const value=await identity.run(request,[scopeFor[op]],async(tx,human,at,deadline)=>{
      const revision=(await tx.query("SELECT version::text FROM nexus_consumer_revision WHERE id=true")).rows[0]?.version;
      if(!revision) throw new ConsumerError(503,"dependency_unavailable");
      const epoch=(await tx.query("SELECT version::text FROM nexus_consumer_epochs WHERE kind='consumerGrant' AND subject_key='global'")).rows[0]?.version;
      if(!epoch) throw new ConsumerError(503,"dependency_unavailable");
      // Authenticated, persistent per-caller budget shared by every instance.
      const budget=hash(JSON.stringify([human.issuer,human.clientId,human.userId]));
      const attempts=await tx.query(`INSERT INTO nexus_consumer_rate_limits(budget_key,window_start,attempts) VALUES($1,clock_timestamp(),1)
        ON CONFLICT(budget_key) DO UPDATE SET attempts=CASE WHEN nexus_consumer_rate_limits.window_start < clock_timestamp()-interval '1 minute' THEN 1 ELSE nexus_consumer_rate_limits.attempts+1 END,
        window_start=CASE WHEN nexus_consumer_rate_limits.window_start < clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE nexus_consumer_rate_limits.window_start END RETURNING attempts`,[budget]);
      if(attempts.rows[0].attempts>120) return {failure:{status:429,code:"rate_limited"}};
      const actor={kind:"human",issuer:human.issuer,subject:human.subject};
      const audit=async(outcome:string,operation:string,context:unknown,id=randomUUID())=>{
        await tx.query(`INSERT INTO nexus_consumer_audit(decision_id,request_id,user_id,client_id,application_id,outcome,operation,context_digest,evaluated_at,valid_until)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,requestId,human.userId,human.clientId,human.applicationId,outcome,operation,hash(JSON.stringify(context)),at,deadline]);
        return id;
      };
      if(op==="tenants"){
        const limit=input.limit??50;let after:string|null=null;
        if(input.cursor){
          const c=(await tx.query(`SELECT after_id FROM nexus_consumer_cursors WHERE digest=$1 AND issuer=$2 AND client_id=$3 AND user_id=$4
            AND application_id=$5 AND token_id=$6 AND query_revision=$7 AND page_limit=$8 AND expires_at>clock_timestamp()`,
            [hash(input.cursor),human.issuer,human.clientId,human.userId,human.applicationId,human.tokenId,revision,limit])).rows[0];
          if(!c)return {failure:{status:400,code:"invalid_request"}};after=c.after_id;
        }
        const rows=(await tx.query(`SELECT ${columns} ${eligible} AND ($3::uuid IS NULL OR t.id>$3) ORDER BY t.id LIMIT $4`,[human.userId,human.applicationId,after,limit+1])).rows;
        let nextCursor:string|null=null;
        if(rows.length>limit){rows.pop();nextCursor=randomBytes(32).toString("base64url");
          await tx.query(`INSERT INTO nexus_consumer_cursors(digest,issuer,client_id,user_id,application_id,token_id,query_revision,after_id,page_limit,expires_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[hash(nextCursor),human.issuer,human.clientId,human.userId,human.applicationId,human.tokenId,revision,rows[rows.length-1].id,limit,new Date(Math.min(at.getTime()+300000,human.expiresAt*1000))]);
        }
        await audit("read",op,{count:rows.length});
        return {applicationId:human.applicationId,tenants:rows.map(r=>({tenant:{id:r.id,key:r.tenant_key,name:r.name,status:"active",version:r.tenant_version},membership:membership(r)})),nextCursor,evaluatedAt:at.toISOString()};
      }
      const sameApp=!input.applicationId || input.applicationId===human.applicationId;
      const row=sameApp?(await tx.query(`SELECT ${columns} ${eligible} AND t.id=$3`,[human.userId,human.applicationId,input.tenantId])).rows[0]:null;
      if(op==="decision"){
        const grant=(await tx.query(`SELECT 1 FROM nexus_consumer_operations WHERE issuer=$1 AND client_id=$2 AND audience=$3 AND environment=$4 AND operation=$5 AND enabled`,
          [human.issuer,human.clientId,human.audience,human.environment,input.operation])).rowCount===1;
        const id=await audit(row&&grant?"allow":"deny",input.operation!,[input.tenantId,input.applicationId]);
        if(!row||!grant)return {allowed:false,code:"access_denied",decisionId:id};
        if(!Number.isSafeInteger(Number(row.membership_version)))throw new ConsumerError(503,"dependency_unavailable");
        return {allowed:true,code:"access_allowed",decisionId:id,caller:{clientId:human.clientId,applicationId:human.applicationId,environment:human.environment},actor,
          tenantId:row.id,target:{applicationId:human.applicationId,operation:input.operation},membershipVersion:Number(row.membership_version),
          versions:{tenant:row.tenant_version,application:row.application_version,entitlement:row.entitlement_version,consumerGrant:epoch},evaluatedAt:at.toISOString(),validUntil:deadline.toISOString()};
      }
      await audit(row?"read":"deny",op,[input.tenantId,input.applicationId]);
      if(!row)return {unavailable:true}; // Transport maps generic hidden/not-found identically after audit commit.
      if(op==="membership")return {tenantId:row.id,actor,membership:membership(row),evaluatedAt:at.toISOString()};
      return {tenantId:row.id,applicationId:human.applicationId,enabled:true,effective:true,version:row.entitlement_version,evaluatedAt:at.toISOString()};
    });
    if("failure" in value && value.failure)throw new ConsumerError(value.failure.status,value.failure.code);
    return value;
  }};
}
