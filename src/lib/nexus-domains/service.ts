/** Operator-governed writes extending nexus_tenant_domains; never creates membership. */
import {randomBytes,createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {resolveTxt} from 'node:dns/promises';
import {domainFail,normalizeHostname,domainOrigin} from './policy.ts';
import {fields,uuid,text} from '../identity/admission/validation.ts';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
type Actor={userId:string;requestId:string};
export interface DomainManagementOptions {enabled:()=>boolean;platformRoots:readonly string[];resolveTxt?:(hostname:string)=>Promise<string[][]>}
export function createDomainManagement(pool:Pool,options:DomainManagementOptions){
 const roots=options.platformRoots.map(normalizeHostname);
 async function transaction<T>(actor:Actor,action:string,reason:string,work:(tx:PoolClient)=>Promise<T>){
  if(!options.enabled())return domainFail(404,'resource_not_available');
  const tx=await pool.connect();
  try{
   await tx.query('BEGIN');await tx.query("SET LOCAL statement_timeout='2000ms';SET LOCAL lock_timeout='1500ms';SET LOCAL idle_in_transaction_session_timeout='2000ms'");
   if((await tx.query('SELECT user_id FROM nexus_operators WHERE user_id=$1 FOR SHARE',[actor.userId])).rowCount!==1)return domainFail(403,'forbidden');
   for(const [key,value]of Object.entries({'is.domain_actor':actor.userId,'is.domain_request':actor.requestId,'is.domain_action':action,'is.domain_reason':reason}))await tx.query('SELECT set_config($1,$2,true)',[key,value]);
   const result=await work(tx);await tx.query('COMMIT');return result;
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 }
 const lock=(tx:PoolClient,h:string)=>tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,83792423))',[h]);
 const read=async(tx:PoolClient,h:string)=>(await tx.query(`SELECT d.*,e.revision::text AS revision FROM nexus_domain_epochs e
   LEFT JOIN nexus_tenant_domains d ON d.hostname=e.hostname WHERE e.hostname=$1`,[h])).rows[0];
 const publicRow=(row:Record<string,unknown>|undefined)=>{if(!row)return null;const {challenge_digest,...result}=row;void challenge_digest;return result;};
 return {
  inspect:(actor:Actor,hostname:unknown)=>transaction(actor,'inspect','Read domain binding',async tx=>publicRow(await read(tx,normalizeHostname(hostname)))),
  async mutate(actor:Actor,input:unknown){
   const v=fields(input,['action','reason'],['hostname','tenantId','applicationId','environment','origin','expectedRevision','clientId','mode']);
   const action=text(v.action,1,40),reason=typeof v.reason==='string'?v.reason.trim():'';
   if(!reason||reason.length>500)return domainFail();
   if(action==='client-mode'){
    fields(input,['action','reason','clientId','mode']);
    const clientId=text(v.clientId,1,256);if(!['choice','domain'].includes(v.mode as string))return domainFail();
    return transaction(actor,action,reason,async tx=>{
     const r=await tx.query("UPDATE nexus_application_oauth_clients SET admission_mode=$2 WHERE oauth_client_id=$1 AND purpose='nexus_consumer' RETURNING admission_mode,admission_mode_revision::text",[clientId,v.mode]);
     if(r.rowCount!==1)return domainFail(404,'resource_not_available');return r.rows[0];
    });
   }
   const h=normalizeHostname(v.hostname),revision=text(v.expectedRevision,1,30);
   if(!/^(0|[1-9][0-9]*)$/.test(revision))return domainFail();
   if(action==='prepare'){
    fields(input,['action','reason','hostname','tenantId','applicationId','environment','origin','expectedRevision']);
    if(!uuid(v.tenantId)||!uuid(v.applicationId)||!['development','staging','production'].includes(v.environment as string))return domainFail();
    const origin=domainOrigin(v.origin);if(origin.hostname!==h)return domainFail();
    const token='is-nexus='+randomBytes(32).toString('base64url');
    return transaction(actor,action,reason,async tx=>{
     await lock(tx,h);const old=await read(tx,h);
     if(String(old?.revision??0)!==revision)return domainFail(409,'binding_conflict');
     const r=await tx.query(`INSERT INTO nexus_tenant_domains(hostname,tenant_id,application_id,environment,admission_origin,challenge_digest,challenge_expires_at)
       VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '15 minutes')
       ON CONFLICT(hostname) DO UPDATE SET is_primary=CASE WHEN nexus_tenant_domains.tenant_id<>EXCLUDED.tenant_id THEN false ELSE nexus_tenant_domains.is_primary END,tenant_id=EXCLUDED.tenant_id,application_id=EXCLUDED.application_id,environment=EXCLUDED.environment,
       admission_origin=EXCLUDED.admission_origin,binding_status='unverified',verified_at=NULL,verification_method=NULL,
       challenge_digest=EXCLUDED.challenge_digest,challenge_expires_at=EXCLUDED.challenge_expires_at RETURNING domain_revision::text AS revision`,
       [h,v.tenantId,v.applicationId,v.environment,origin.origin,digest(token)]);
     return {hostname:h,revision:r.rows[0].revision,status:'unverified',dns:{name:'_is-nexus-challenge.'+h,value:token,expiresIn:900}};
    });
   }
   fields(input,['action','reason','hostname','expectedRevision']);
   if(!['verify-dns','activate-platform','suspend'].includes(action))return domainFail();
   let proof:string|undefined;
   if(action==='verify-dns'){
    // Resolve outside write transaction. The exact challenge/revision is rechecked under lock.
    const captured=await transaction(actor,'inspect',reason,async tx=>read(tx,h));
    if(!captured?.challenge_digest||captured.revision!==revision)return domainFail(409,'binding_conflict');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
     const records=await Promise.race([(options.resolveTxt??resolveTxt)('_is-nexus-challenge.'+h),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('dns timeout')),1500);})]);
     if(records.length>16||JSON.stringify(records).length>8192)return domainFail(403,'domain_not_verified');
     const matches=records.map(parts=>parts.join('')).filter(value=>digest(value)===captured.challenge_digest);
     if(matches.length!==1)return domainFail(403,'domain_not_verified');proof=captured.challenge_digest;
    }finally{if(timer)clearTimeout(timer);}
   }
   return transaction(actor,action,reason,async tx=>{
    await lock(tx,h);const row=await read(tx,h);
    if(!row?.hostname||row.revision!==revision)return domainFail(409,'binding_conflict');
    if(action==='suspend'){
     await tx.query("UPDATE nexus_tenant_domains SET binding_status='suspended' WHERE hostname=$1",[h]);
    }else{
     if(!row.application_id||!row.admission_origin||!row.environment)return domainFail(403,'domain_not_verified');
     if(action==='activate-platform'&&!roots.some(root=>h.endsWith('.'+root)))return domainFail(403,'domain_not_verified');
     if(action==='verify-dns'&&(row.challenge_digest!==proof||!row.challenge_expires_at||row.challenge_expires_at.getTime()<=Date.now()))return domainFail(403,'domain_not_verified');
     await tx.query("UPDATE nexus_tenant_domains SET binding_status='active',verification_method=$2,verified_at=clock_timestamp(),challenge_digest=NULL,challenge_expires_at=NULL WHERE hostname=$1",[h,action==='verify-dns'?'dns_txt':'platform']);
    }
    return publicRow(await read(tx,h));
   });
  }
 };
}
