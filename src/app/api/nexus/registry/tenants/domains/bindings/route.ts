import {randomUUID} from "node:crypto";
import {pool} from '@/lib/database';
import {auth} from '@/lib/auth';
import {createDomainManagement} from '@/lib/nexus-domains/service';
import {createDomainManagementHandler} from '@/lib/nexus-domains/management-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const enabled=()=>process.env.NEXUS_DOMAIN_BINDINGS_ENABLED==='true';
function unavailable(status:number){const requestId=randomUUID();return Response.json({error:status===404?'resource_not_available':'dependency_unavailable',requestId},{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Request-ID':requestId,'X-Content-Type-Options':'nosniff'}});}
async function handle(request:Request){
 // Gate precedes configuration or session work.
 if(!enabled())return unavailable(404);
 try{
  const service=createDomainManagement(pool,{enabled,platformRoots:(process.env.NEXUS_PLATFORM_DOMAIN_ROOTS??'').split(',').filter(Boolean)});
  return createDomainManagementHandler({enabled,service,publicOrigin:new URL(process.env.BETTER_AUTH_URL!).origin,
   transportOrigin:process.env.NEXUS_CONSUMER_DIRECT_HTTPS_ORIGIN,
   authenticate:async headers=>{const s=await auth.api.getSession({headers,query:{disableCookieCache:true}});return s?.user.id??null;}})(request);
 }catch{return unavailable(503);}
}
export const GET=handle;
export const POST=handle;
