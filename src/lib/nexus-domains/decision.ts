/** Nexus-owned policy evaluation and transactional decision audit. Caller is trusted Identity mediation. */
import {randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {VerifiedHumanCredential} from '../identity/access-credentials.ts';
import {readEffectiveContext,isOperationAllowed,readPolicyState} from '../nexus-eligibility/policy.ts';
import {evidence,domainFail} from './policy.ts';
import type {DomainBinding} from './policy.ts';
export async function evaluateDomainDecision(tx:PoolClient,human:VerifiedHumanCredential,binding:DomainBinding,
 selectedVersions:Record<string,string>|null,context:{admissionId:string;operation:string;requestId:string;at:Date;deadline:Date}){
 const {admissionId,operation,requestId,at,deadline}=context;
 const row=await readEffectiveContext(tx,human,binding.tenantId),state=await readPolicyState(tx);
 if(!state.revision||!state.consumerGrant)return domainFail(503,'dependency_unavailable');
 const grant=await isOperationAllowed(tx,human,operation);
 const epochs=row?{tenant:row.tenant_version,membership:row.membership_version,application:row.application_version,entitlement:row.entitlement_version}:null;
 const allowed=!!row&&grant&&!!selectedVersions&&Object.entries(epochs!).every(([key,value])=>selectedVersions[key]===value);
 const decisionId=randomUUID();
 await tx.query(`INSERT INTO nexus_consumer_audit(decision_id,request_id,user_id,client_id,application_id,outcome,operation,context_digest,evaluated_at,valid_until)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[decisionId,requestId,human.userId,human.clientId,human.applicationId,allowed?'allow':'deny',operation,
   createHash('sha256').update(JSON.stringify({admissionId,domain:evidence(binding)})).digest('hex'),at,deadline]);
 if(Date.now()>=deadline.getTime())return domainFail(503,'dependency_unavailable');
 if(!allowed)return {allowed:false as const,code:'access_denied',decisionId};
 return {allowed:true as const,code:'access_allowed',profile:'is-domain-admission-1',decisionId,admissionId,
  caller:{clientId:human.clientId,applicationId:human.applicationId,environment:human.environment},actor:{kind:'human',issuer:human.issuer,subject:human.subject},
  tenantId:binding.tenantId,domainBinding:evidence(binding),target:{applicationId:human.applicationId,operation},
  membershipVersion:row!.membership_version,versions:{...epochs,consumerGrant:state.consumerGrant},evaluatedAt:at.toISOString(),validUntil:deadline.toISOString()};
}
