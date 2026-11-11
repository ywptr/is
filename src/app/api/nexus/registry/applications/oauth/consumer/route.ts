import { auth,consumerIdentityIntegration } from '@/lib/auth';
import { pool } from '@/lib/database';
import { createCredentialAdministration,parseAdminInput,AdministrationError } from '@/lib/identity/administration';
export const runtime='nodejs';
export async function POST(request:Request){
 const response=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(process.env.NEXUS_OAUTH_ADMIN_ENABLED!=='true')return response({error:'not_found'},404);
 const integration=consumerIdentityIntegration;
 if(!integration||integration.registry.policy.environment!=='development')return response({error:'not_ready'},503);
 if(request.headers.get('origin')!==new URL(integration.registry.policy.audience).origin)return response({error:'invalid_origin'},403);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return response({error:'invalid_content_type'},415);
 try{
 const session=await auth.api.getSession({headers:request.headers});if(!session)return response({error:'forbidden'},403);
 // Bound stream before JSON parsing; cancel on overrun and timeout.
 const reader=request.body?.getReader();if(!reader)return response({error:'invalid_body'},400);
 let text='';const decoder=new TextDecoder();const deadline=Date.now()+2000;
 try{while(true){const remaining=deadline-Date.now();if(remaining<=0)throw new AdministrationError(408,'body_timeout');let timer:ReturnType<typeof setTimeout>|undefined;
 const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AdministrationError(408,'body_timeout')),remaining);})]).finally(()=>clearTimeout(timer));if(part.done)break;text+=decoder.decode(part.value,{stream:true});if(new TextEncoder().encode(text).length>16384)throw new AdministrationError(413,'body_too_large');}}finally{await reader.cancel().catch(()=>{});}
 const input=await parseAdminInput(JSON.parse(text));
 const admin=createCredentialAdministration(pool,integration.registry.policy,{
 createResource:body=>auth.api.adminCreateOAuthResource({headers:request.headers,body:body as NonNullable<Parameters<typeof auth.api.adminCreateOAuthResource>[0]>['body']}),
 getResource:async()=>{const all=await auth.api.adminListOAuthResources({headers:request.headers});return all.find(r=>r.identifier===integration.registry.policy.audience) as unknown as Record<string,unknown>??null;},
 createClient:body=>auth.api.adminCreateOAuthClient({headers:request.headers,body:body as NonNullable<Parameters<typeof auth.api.adminCreateOAuthClient>[0]>['body']}),
 updateClient:(clientId,update)=>auth.api.adminUpdateOAuthClient({headers:request.headers,body:{client_id:clientId,update}}),
 getClient:async clientId=>await auth.api.getOAuthClient({headers:request.headers,query:{client_id:clientId}}) as unknown as Record<string,unknown>,
 });
 return response(await admin.execute(input,{userId:session.user.id,sessionId:session.session.id}));
 }catch(error){if(error instanceof AdministrationError)return response({error:error.code},error.status);return response({error:'administration_unavailable'},503);}
}
