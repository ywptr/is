import { createDisabledOAuthClient } from '@/lib/identity/atomic-client-provisioning';
import { auth,consumerIdentityIntegration } from '@/lib/auth';
import { pool } from '@/lib/database';
import { createCredentialAdministration } from '@/lib/identity/administration';
import { createAdministrationHandler,createAdministrationReadHandler } from '@/lib/identity/administration-http';
import { currentNexusOperatorId } from '@/lib/nexus-operator-access';
import { readConsumerAdministration } from '@/lib/identity/administration-read';
export const runtime='nodejs';
export const GET=createAdministrationReadHandler({enabled:()=>process.env.NEXUS_OAUTH_ADMIN_ENABLED==='true',operator:currentNexusOperatorId,
 read:async()=>{if(!consumerIdentityIntegration||consumerIdentityIntegration.registry.policy.environment!=='development')throw new Error('not_ready');
  return readConsumerAdministration(pool,consumerIdentityIntegration.registry.policy);}});
export const POST=createAdministrationHandler({
 enabled:()=>process.env.NEXUS_OAUTH_ADMIN_ENABLED==='true',
 integration:()=>consumerIdentityIntegration,
 session:headers=>auth.api.getSession({headers}),
 execute:async(input,principal,headers)=>{
 const integration=consumerIdentityIntegration;
 if(!integration)throw new Error('not_ready');
 return createCredentialAdministration(pool,integration.registry.policy,{
 rotateKeys:(assertion,jwks)=>auth.api.rotateClientKeys({headers:headers,body:{client_assertion:assertion,client_assertion_type:'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',jwks:jwks as {keys:Record<string,unknown>[]}}}),
 createResource:body=>auth.api.adminCreateOAuthResource({headers:headers,body:body as NonNullable<Parameters<typeof auth.api.adminCreateOAuthResource>[0]>['body']}),
 getResource:async()=>{const all=await auth.api.adminListOAuthResources({headers:headers});return all.find(r=>r.identifier===integration.registry.policy.audience) as unknown as Record<string,unknown>??null;},
 createDisabledClient:async(body,verify)=>createDisabledOAuthClient(await auth.$context,()=>auth.api.adminCreateOAuthClient({headers,body:body as NonNullable<Parameters<typeof auth.api.adminCreateOAuthClient>[0]>['body']}),verify),
 updateClient:(clientId,update)=>auth.api.adminUpdateOAuthClient({headers:headers,body:{client_id:clientId,update}}),
 getClient:async clientId=>await auth.api.getOAuthClient({headers:headers,query:{client_id:clientId}}) as unknown as Record<string,unknown>,
 }).execute(input,principal);
 }
});
