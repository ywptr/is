import { randomUUID } from "node:crypto";
import { MembershipError } from "./policy.ts";
import type { Mode, Role } from "./policy.ts";
import { input, page, userId, uuid } from "./validation.ts";
import type { Operation } from "./validation.ts";
import type { MembershipService } from "./service.ts";
type Deps={enabled:()=>boolean; trustedOrigin:(headers:Headers)=>boolean;
  sessionUser:(headers:Headers)=>Promise<string|null>; authorized:(mode:Mode,user:string,tenant:string)=>Promise<boolean>;
  service:MembershipService};
type Params={tenantId?:string;userId?:string;invitationId?:string};
async function body(req:Request) {
  if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json") throw new MembershipError("invalid_content_type",400);
  const reader=req.body?.getReader(); if(!reader) throw new MembershipError("invalid_body",400);
  const chunks:Uint8Array[]=[]; let size=0;
  try {while(true) {const {value,done}=await reader.read(); if(done) break; size+=value.byteLength;
    if(size>8192) {await reader.cancel(); throw new MembershipError("body_too_large",413);} chunks.push(value);}
    const data=new Uint8Array(size); let offset=0; for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    try {return JSON.parse(new TextDecoder().decode(data));} catch {throw new MembershipError("invalid_body",400);}
  } finally {reader.releaseLock();}
}
export function createMembershipHandler(deps:Deps,mode:Mode,op:Operation) {
  return async(req:Request,params:Params={})=>{
    const requestId=randomUUID();
    function reply(value:unknown,status=200) {return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Request-ID":requestId}});}
    try {
      if(!deps.enabled()) return reply({error:"not_found"},404);
      const read=op==="list"||op==="invitations";
      if(req.method!==(read?"GET":op==="change"?"PATCH":"POST")) return reply({error:"method_not_allowed"},405);
      if(!read&&!deps.trustedOrigin(req.headers)) return reply({error:"invalid_origin"},403);
      const actorId=await deps.sessionUser(req.headers);
      if(!actorId) return reply({error:"unauthenticated"},401);
      if(op==="accept") {const b=input(op,await body(req));return reply(await deps.service.accept(actorId,b.token as string,requestId));}
      if(!uuid(params.tenantId)) throw new MembershipError("invalid_tenant_id",400);
      if(!await deps.authorized(mode,actorId,params.tenantId)) throw new MembershipError("forbidden",403);
      const ctx={actorId,mode,tenantId:params.tenantId,requestId};
      if(read) {const p=page(new URL(req.url));return reply(op==="list"?await deps.service.list(ctx,p.limit,p.cursor):await deps.service.invitations(ctx,p.limit,p.cursor));}
      const b=input(op,await body(req));
      switch(op) {
        case "bootstrap":return reply(await deps.service.bootstrap(ctx,b.userId as string,b.reason as string),201);
        case "add":return reply(await deps.service.add(ctx,b.userId as string,b.role as Role,b.reason as string),201);
        case "change": {
          if(!userId(params.userId)) throw new MembershipError("invalid_user_id",400);
          return reply(await deps.service.change(ctx,params.userId,b as Parameters<MembershipService["change"]>[2]));
        }
        case "invite":return reply(await deps.service.invite(ctx,b.email as string,b.userId as string??null,b.role as Role,b.reason as string),201);
        case "revoke": {
          if(!uuid(params.invitationId)) throw new MembershipError("invalid_invitation_id",400);
          return reply(await deps.service.revoke(ctx,params.invitationId,b.reason as string));
        }
      }
    } catch(e) {
      if(e instanceof MembershipError) return reply({error:e.message,requestId},e.status);
      // Do not log SQL detail, identity data or invitation tokens.
      console.error("Nexus membership request failed",{requestId}); return reply({error:"internal_error",requestId},500);
    }
  };
}
