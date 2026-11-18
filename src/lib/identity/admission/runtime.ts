import {createDomainDecisionHandler} from "../../nexus-domains/decision-http.ts";
/** Default-off composition. No startup migrations, registration or key minting. */
import { randomUUID } from "node:crypto";
import { createAdmissionJwksReader } from "./provider.ts";
import { signJWT } from "better-auth/plugins/jwt";
import { auth, consumerIdentityIntegration } from "../../auth";
import { createEligibilityIdentity } from "../eligibility-context.ts";
import { createEligibilityService } from "../../nexus-eligibility/service.ts";
import { createAdmissionService } from "./service.ts";
import { createAdmissionHandler } from "./http.ts";
import type { AdmissionOperation } from "./http.ts";
const enabled = () => process.env.IS_ADMISSION_ENABLED === "true";
function unavailable(status: number) {
  const requestId = randomUUID();
  return Response.json({ error: status === 404 ? "resource_not_available" : "dependency_unavailable", requestId }, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Request-ID": requestId, "X-Content-Type-Options": "nosniff" } });
}
function compose(){
    const integration = consumerIdentityIntegration;
    if (!integration) return null;
    const identity = createEligibilityIdentity({ policy: integration.registry.policy, transaction: integration.registry.transaction,
      enabled: () => enabled() && process.env.NEXUS_MEMBERSHIPS_ENABLED === "true" && process.env.IDENTITY_NEXUS_CREDENTIALS_ENABLED === "true",
      authenticate: async headers => {
        const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
        return session ? { userId: session.user.id, sessionId: session.session.id } : null;
      } });
    const service = createAdmissionService({domainEnabled:()=>process.env.IS_DOMAIN_ADMISSION_ENABLED==="true",consumer:integration.boundary, registry: integration.registry, identity, nexus: createEligibilityService(identity), enabled,
      clientAllowed: clientId => (process.env.IS_ADMISSION_CLIENT_IDS ?? "").split(",").includes(clientId),
      reservations: async () => (await auth.$context).internalAdapter,
      jwks: createAdmissionJwksReader(integration.registry),
      sign: async (claims, keyId) => signJWT({ context: await auth.$context } as unknown as Parameters<typeof signJWT>[0], { payload: claims, header: { typ: claims.domain_binding?"is-domain-admission+jwt":"is-admission+jwt" },
        signingKeyId: keyId, signingAlgorithm: "EdDSA" }),
    });
    return {service,publicOrigin:new URL(integration.registry.policy.issuer).origin,consumerOrigin:new URL(integration.registry.policy.audience).origin};
}
export function admissionHandler(operation:AdmissionOperation){
 return async(request:Request,id?:string)=>{
  if(!enabled())return unavailable(404);
  const composition=compose();if(!composition)return unavailable(503);
  return createAdmissionHandler({ service:composition.service, enabled, publicOrigin:composition.publicOrigin,
      transportOrigin: process.env.NEXUS_CONSUMER_DIRECT_HTTPS_ORIGIN,
      authenticated: async headers => !!await auth.api.getSession({ headers, query: { disableCookieCache: true } }),
    }, operation)(request, id);
  };
}

export function domainDecisionHandler(){
 return async(request:Request)=>{
  const on=()=>enabled()&&process.env.IS_DOMAIN_ADMISSION_ENABLED==='true'&&process.env.NEXUS_CONSUMER_API_ENABLED==='true';
  if(!on())return unavailable(404);
  const c=compose();if(!c)return unavailable(503);
  return createDomainDecisionHandler({enabled:on,publicOrigin:c.consumerOrigin,service:c.service,
   transportOrigin:process.env.NEXUS_CONSUMER_DIRECT_HTTPS_ORIGIN,
   trustedOrigin:origin=>(process.env.NEXUS_CONSUMER_TRUSTED_ORIGINS??'').split(',').includes(origin),
  })(request);
 };
}
