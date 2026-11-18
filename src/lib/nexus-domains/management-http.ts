import {randomUUID} from 'node:crypto';
import {canonicalConsumerRequest} from '../nexus-consumer/public-request.ts';
import {readAdmissionBody} from '../identity/admission/http.ts';
import {IdentityOperationError} from '../identity/operation-error.ts';
import {domainFail} from './policy.ts';
import type {createDomainManagement} from './service.ts';
export function createDomainManagementHandler(options:{enabled:()=>boolean;publicOrigin:string;transportOrigin?:string;
 authenticate:(headers:Headers)=>Promise<string|null>;service:ReturnType<typeof createDomainManagement>}){
 return async(request:Request)=>{
  const requestId=randomUUID();const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Request-ID':requestId,'X-Content-Type-Options':'nosniff'}});
  if(!options.enabled())return respond({error:'resource_not_available',requestId},404);
  try{
   request=canonicalConsumerRequest(request,options.publicOrigin,options.transportOrigin);
   if(!['GET','POST'].includes(request.method))return domainFail(405);
   if((request.headers.has('origin')&&request.headers.get('origin')!==options.publicOrigin)||(request.method==='POST'&&request.headers.get('origin')!==options.publicOrigin))return domainFail(403,'invalid_origin');
   if([...request.headers.keys()].some(k=>/^(x-actor|x-user|x-tenant|x-application)(-|$)/.test(k)))return domainFail();
   const userId=await options.authenticate(request.headers);if(!userId)return domainFail(401,'authentication_required');
   const actor={userId,requestId},url=new URL(request.url);
   if(request.method==='GET'){
    if([...url.searchParams.keys()].some(k=>k!=='hostname')||url.searchParams.getAll('hostname').length!==1)return domainFail();
    return respond({binding:await options.service.inspect(actor,url.searchParams.get('hostname'))});
   }
   if(url.search||request.headers.get('content-type')?.split(';')[0]!=='application/json')return domainFail();
   return respond(await options.service.mutate(actor,await readAdmissionBody(request,16384,true)));
  }catch(e){return respond({error:e instanceof IdentityOperationError?e.error:'dependency_unavailable',requestId},e instanceof IdentityOperationError?e.status:503);}
 };
}
