import { consumerIdentityIntegration } from "@/lib/auth";
import { createConsumerService } from "./service.ts";
import { createConsumerHandler } from "./http.ts";
import type { ConsumerOperation } from "./service.ts";
export const consumerEnabled=()=>process.env.NEXUS_CONSUMER_API_ENABLED==="true";
export function consumerHandler(op:ConsumerOperation){
  return async(request:Request,params:Record<string,string>={})=>{
    const integration=consumerIdentityIntegration;
    const publicOrigin=integration?new URL(integration.registry.policy.audience).origin:"https://unconfigured.invalid";
    const service=integration?createConsumerService(integration.boundary):{execute:async()=>{throw new Error("Identity unavailable");}};
    return createConsumerHandler({enabled:consumerEnabled,
      ready:()=>process.env.NEXUS_MEMBERSHIPS_ENABLED==="true"&&!!integration,
      publicOrigin,service,transportOrigin:process.env.NEXUS_CONSUMER_DIRECT_HTTPS_ORIGIN,
      trustedMutationOrigin:async req=>{
        const origin=req.headers.get("origin");
        if(!origin||origin==="null")return false;
        const approved=(process.env.NEXUS_CONSUMER_TRUSTED_ORIGINS??"").split(",");
        try{return new URL(origin).protocol==="https:"&&new URL(origin).origin===origin&&approved.includes(origin);}catch{return false;}
      },
    },op)(request,params);
  };
}
