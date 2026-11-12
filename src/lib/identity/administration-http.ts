import {parseAdminInput,AdministrationError} from './administration.ts';
import type {AdminInput} from './administration.ts';
interface Dependencies {
 enabled():boolean;
 integration():{registry:{policy:{environment:string;audience:string}}}|undefined;
 session(headers:Headers):Promise<{user:{id:string};session:{id:string}}|null>;
 execute(input:AdminInput,principal:{userId:string;sessionId:string},headers:Headers):Promise<unknown>;
}
export function createAdministrationReadHandler(deps:{enabled():boolean;operator(headers:Headers):Promise<unknown>;read():Promise<unknown>}){
 return async(request:Request)=>{
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(!deps.enabled())return reply({error:'not_found'},404);
  try{if(!await deps.operator(request.headers))return reply({error:'forbidden'},403);
   return reply(await deps.read());
  }catch{return reply({error:'administration_unavailable'},503);}
 };
}
export function createAdministrationHandler(deps:Dependencies){return async function POST(request:Request){
 const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!deps.enabled())return response({error:'not_found'},404);
 const integration=deps.integration();
 if(!integration||integration.registry.policy.environment!=='development')return response({error:'not_ready'},503);
 if(request.headers.get('origin')!==new URL(integration.registry.policy.audience).origin)return response({error:'invalid_origin'},403);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return response({error:'invalid_content_type'},415);
 try{
 const session=await deps.session(request.headers);if(!session)return response({error:'forbidden'},403);
 // Bound stream before JSON parsing; cancel on overrun and timeout.
 const reader=request.body?.getReader();if(!reader)return response({error:'invalid_body'},400);
 let text='';const decoder=new TextDecoder();const deadline=Date.now()+2000;
 try{while(true){const remaining=deadline-Date.now();if(remaining<=0)throw new AdministrationError(408,'body_timeout');let timer:ReturnType<typeof setTimeout>|undefined;
 const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AdministrationError(408,'body_timeout')),remaining);})]).finally(()=>clearTimeout(timer));if(part.done)break;text+=decoder.decode(part.value,{stream:true});if(new TextEncoder().encode(text).length>16384)throw new AdministrationError(413,'body_too_large');}}finally{await reader.cancel().catch(()=>{});}
 const input=await parseAdminInput(JSON.parse(text));

 return response(await deps.execute(input,{userId:session.user.id,sessionId:session.session.id},request.headers));
 }catch(error){if(error instanceof SyntaxError)return response({error:'invalid_body'},400);if(error instanceof AdministrationError)return response({error:error.code},error.status);return response({error:'administration_unavailable'},503);}
}

}
