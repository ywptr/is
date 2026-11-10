import { randomUUID } from "node:crypto";
import { CredentialError } from "../identity/access-credentials.ts";
import { LifecycleError } from "../identity/credential-registry.ts";
import { nonceChallenge } from "../identity/dpop-nonce.ts";
import { ConsumerError, uuid } from "./service.ts";
import type { ConsumerOperation, ConsumerInput, createConsumerService } from "./service.ts";
export interface HandlerDependencies {
  now?:()=>number;
  enabled:()=>boolean; ready:()=>boolean; publicOrigin:string;
  service:ReturnType<typeof createConsumerService>;
  trustedMutationOrigin:(request:Request)=>Promise<boolean>;
}
export function createConsumerHandler(deps:HandlerDependencies,op:ConsumerOperation){
  return async(request:Request,params:Record<string,string>={})=>{
    const requestId=randomUUID();
    const respond=(body:unknown,status=200,extra:HeadersInit={})=>Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Request-ID":requestId,...extra}});
    const error=(status:number,code:string,extra:HeadersInit={})=>respond({error:code,requestId},status,extra);
    if(!deps.enabled())return error(404,"resource_not_available");
    if(!deps.ready())return error(503,"dependency_unavailable");
    try {
      const url=new URL(request.url);
      if(url.origin!==deps.publicOrigin||url.protocol!=="https:")throw new ConsumerError(401,"invalid_dpop_proof");
      if(request.method!==(op==="decision"?"POST":"GET"))return error(405,"invalid_request",{Allow:op==="decision"?"POST":"GET"});
      if([...request.headers.keys()].some(k=>/^(x-actor|x-user|x-tenant|x-application)(-|$)/.test(k)))throw new ConsumerError(400,"invalid_request");
      if(request.headers.has("cookie"))throw new ConsumerError(401,"invalid_token");
      const input:ConsumerInput={};
      if(op==="tenants"){
        if([...url.searchParams.keys()].some(k=>!["limit","cursor"].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))throw new ConsumerError(400,"invalid_request");
        const l=url.searchParams.get("limit")??"50";
        if(!/^[1-9][0-9]{0,2}$/.test(l)||Number(l)>100)throw new ConsumerError(400,"invalid_request");
        input.limit=Number(l);const c=url.searchParams.get("cursor");if(c!==null){if(!/^[A-Za-z0-9_-]{43}$/.test(c))throw new ConsumerError(400,"invalid_request");input.cursor=c;}
      }else if(url.search)throw new ConsumerError(400,"invalid_request");
      if(op==="decision"){
        if(!await deps.trustedMutationOrigin(request))throw new ConsumerError(403,"invalid_request");
        if(request.headers.get("content-type")?.split(";")[0]!=="application/json")throw new ConsumerError(400,"invalid_request");
        const parsed=await readBody(request);
        if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new ConsumerError(400,"invalid_request");
        const value=parsed as Record<string,unknown>;
        if(Object.keys(value).some(k=>!["tenantId","applicationId","operation"].includes(k))||!uuid(value.tenantId)||!uuid(value.applicationId)||typeof value.operation!=="string"||!/^[a-z][a-z0-9_.:-]{1,119}$/.test(value.operation))throw new ConsumerError(400,"invalid_request");
        Object.assign(input,value);
      }else if(op!=="tenants"){
        if(!uuid(params.tenantId)|| (op==="entitlements"&&!uuid(params.applicationId)))throw new ConsumerError(400,"invalid_request");
        input.tenantId=params.tenantId;input.applicationId=params.applicationId;
      }
      const value=await deps.service.execute(request,op,input,requestId);
      if("unavailable" in value)return error(404,"resource_not_available");
      if("validUntil" in value && Date.parse(value.validUntil!)<=(deps.now?.()??Date.now()))return error(503,"dependency_unavailable");
      return respond(value);
    }catch(e){
      const challenge=nonceChallenge(e);if(challenge){const body=await challenge.json();return respond({...body,requestId},401,Object.fromEntries(challenge.headers));}
      if(e instanceof ConsumerError)return error(e.status,e.code,e.status===429?{"Retry-After":"60"}:{});
      if(e instanceof LifecycleError && e.code==="invalid_token")return error(401,"invalid_token",{"WWW-Authenticate":'DPoP error="invalid_token", algs="ES256"'});
      if(e instanceof CredentialError){const status=e.code==="identity_unavailable"?503:e.code==="insufficient_scope"?403:401;
        return error(status,status===503?"dependency_unavailable":e.code,status===401?{"WWW-Authenticate":`DPoP error="${e.code}", algs="ES256"`}:{});}
      return error(503,"dependency_unavailable");
    }
  };
}

async function readBody(request:Request):Promise<unknown>{
  const reader=request.body?.getReader();if(!reader)throw new ConsumerError(400,"invalid_request");
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      (async()=>{
        let bytes=0;const chunks:Uint8Array[]=[];
        while(true){const part=await reader.read();if(part.done)break;
          bytes+=part.value.length;if(bytes>16384)throw new ConsumerError(413,"payload_too_large");chunks.push(part.value);}
        try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));}
        catch{throw new ConsumerError(400,"invalid_request");}
      })(),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ConsumerError(400,"invalid_request")),2000);}),
    ]);
  }finally{if(timer)clearTimeout(timer);void reader.cancel().catch(()=>undefined);}
}
