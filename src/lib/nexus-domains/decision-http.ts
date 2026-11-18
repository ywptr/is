/** Explicit new contract; existing Consumer v1 bodies and routes remain untouched. */
import {randomUUID} from 'node:crypto';
import {canonicalConsumerRequest} from '../nexus-consumer/public-request.ts';
import {ConsumerError} from '../nexus-consumer/service.ts';
import {CredentialError} from '../identity/access-credentials.ts';
import {LifecycleError} from '../identity/credential-registry.ts';
import {IdentityOperationError} from '../identity/operation-error.ts';
import {nonceChallenge} from '../identity/dpop-nonce.ts';
import {readAdmissionBody} from '../identity/admission/http.ts';
import {fields,text} from '../identity/admission/validation.ts';
import {domainOrigin,domainFail} from './policy.ts';
import type {createAdmissionService} from '../identity/admission/service.ts';
export function createDomainDecisionHandler(options:{enabled:()=>boolean;publicOrigin:string;transportOrigin?:string;
 trustedOrigin:(origin:string)=>boolean;service:ReturnType<typeof createAdmissionService>}){
 return async(request:Request)=>{
  const requestId=randomUUID();const respond=(body:unknown,status=200,extra:HeadersInit={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Request-ID':requestId,...Object.fromEntries(new Headers(extra))}});
  if(!options.enabled())return respond({error:'resource_not_available',requestId},404);
  try{
   request=canonicalConsumerRequest(request,options.publicOrigin,options.transportOrigin);
   if(request.method!=='POST')return domainFail(405);
   if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0]!=='application/json')return domainFail();
   if(request.headers.has('cookie'))return domainFail(401,'invalid_token');
   if([...request.headers.keys()].some(k=>/^(x-actor|x-user|x-tenant|x-application)(-|$)/.test(k)))return domainFail();
   const origin=request.headers.get('origin');
   if(!origin||!options.trustedOrigin(origin))return domainFail(403,'invalid_origin');
   const v=fields(await readAdmissionBody(request,32768,true),['admissionContext','domainOrigin','operation']);
   const domain=domainOrigin(v.domainOrigin);if(domain.origin!==origin)return domainFail(403,'invalid_origin');
   const admissionContext=text(v.admissionContext,1,16384),operation=text(v.operation,2,120);
   if(!/^[a-z][a-z0-9_.:-]{1,119}$/.test(operation))return domainFail();
   const result=await options.service.domainDecision(request,{admissionContext,domainOrigin:domain.origin,operation},requestId);
   if('validUntil' in result&&Date.parse(result.validUntil!)<=Date.now())return domainFail(503,'dependency_unavailable');
   return respond(result);
  }catch(e){
   const challenge=nonceChallenge(e);if(challenge)return respond({...await challenge.json(),requestId},401,challenge.headers);
   if(e instanceof IdentityOperationError)return respond({error:e.error,requestId},e.status,e.status===429?{'Retry-After':'60'}:{});
   if(e instanceof ConsumerError)return respond({error:e.code,requestId},e.status);
   if(e instanceof CredentialError){const status=e.code==='identity_unavailable'?503:e.code==='insufficient_scope'?403:401;return respond({error:status===503?'dependency_unavailable':e.code,requestId},status);}
   if(e instanceof LifecycleError&&e.code==='invalid_token')return respond({error:'invalid_token',requestId},401);
   return respond({error:'dependency_unavailable',requestId},503);
  }
 };
}
