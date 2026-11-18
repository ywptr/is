/** Nexus domain authority. Candidates are never authorization until reconciled here. */
import { isIP } from 'node:net';
import type {PoolClient} from 'pg';
import {IdentityOperationError} from '../identity/operation-error.ts';
export const domainFail=(status=400,code='invalid_request'):never=>{throw new IdentityOperationError(status,code);};
export function normalizeHostname(value:unknown):string{
  if(typeof value!=='string'||value.length>253)return domainFail();
  const h=value.toLowerCase();
  // Strict ASCII DNS policy. Unicode must be provisioned as its canonical A-label.
  if(h!==h.trim()||!h.includes('.')||isIP(h)||h.endsWith('.')||
    !h.split('.').every(x=>x.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)))return domainFail();
  return h;
}
export function domainOrigin(value:unknown):{origin:string;hostname:string}{
  if(typeof value!=='string')return domainFail();
  let u:URL;try{u=new URL(value);}catch{return domainFail();}
  const hostname=normalizeHostname(u.hostname);
  if(u.protocol!=='https:'||u.origin!==value||u.username||u.password||u.hash||u.search||u.pathname!=='/'||u.hostname!==hostname)return domainFail();
  return {origin:u.origin,hostname};
}
export interface DomainEvidence {hostname:string;origin:string;revision:string}
export interface DomainBinding extends DomainEvidence {tenantId:string;applicationId:string;environment:string}
export function validEvidence(value:unknown):value is DomainEvidence{
  try{
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const v=value as Record<string,unknown>,d=domainOrigin(v.origin);
    return Object.keys(v).sort().join(',')==='hostname,origin,revision'&&v.hostname===d.hostname&&typeof v.revision==='string'&&/^[1-9][0-9]*$/.test(v.revision);
  }catch{return false;}
}
export function evidence(b:DomainBinding):DomainEvidence{return {hostname:b.hostname,origin:b.origin,revision:b.revision};}
export async function resolveDomain(tx:PoolClient,origin:string,applicationId:string,environment:string):Promise<DomainBinding>{
  const d=domainOrigin(origin);
  const r=await tx.query(`SELECT d.hostname,d.admission_origin AS origin,d.domain_revision::text AS revision,
    d.tenant_id AS "tenantId",d.application_id AS "applicationId",d.environment
    FROM nexus_tenant_domains d JOIN nexus_domain_epochs e ON e.hostname=d.hostname AND e.revision=d.domain_revision
    WHERE d.hostname=$1 AND d.admission_origin=$2 AND d.application_id=$3 AND d.environment=$4
      AND d.binding_status='active' AND d.verified_at IS NOT NULL AND d.verification_method IN ('dns_txt','platform')
    FOR SHARE OF d`,[d.hostname,d.origin,applicationId,environment]);
  if(r.rowCount!==1)return domainFail(403,'domain_not_available');
  return r.rows[0];
}
