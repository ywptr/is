/** Better Auth 1.7.10 / PostgreSQL Kysely compatibility bridge.
 * Native registration validates and creates the credential and resource links.
 * Only disablement/read-back use the provider's transaction adapter directly:
 * adminUpdateOAuthClient uses the base adapter and MUST NOT be used here.
 * See docs/IS-0001F1-ATOMIC-PROVISIONING.md before upgrading the provider.
 */
import type { BetterAuthOptions } from '@better-auth/core';
import type { DBAdapter } from '@better-auth/core/db/adapter';
import { getCurrentDBAdapterAsyncLocalStorage, runWithTransaction } from '@better-auth/core/context';
import { AdministrationError, inClientProvisioning } from './administration.ts';

const unavailable = (): never => { throw new AdministrationError(503,'atomic_provisioning_unavailable'); };
export async function createDisabledOAuthClient<Options extends BetterAuthOptions>(
 context: {adapter:DBAdapter<Options>;version:string;options:Options},
 create: () => Promise<{client_id:string}>,
 verify: (record:Record<string,unknown>) => void,
):Promise<{client_id:string}> {
 const {adapter}=context;
 if(!inClientProvisioning())throw new AdministrationError(403,'forbidden');
 // Do not permit the core helper's nontransactional or nested fallback paths.
 if(context.version!=='1.7.10' || context.options.plugins?.find(plugin=>plugin.id==='oauth-provider')?.version!=='1.7.10')return unavailable();
 const storage=await getCurrentDBAdapterAsyncLocalStorage();
 const config=adapter.options?.adapterConfig;
 if(storage.getStore() || adapter.id!=='kysely' || config?.supportsUUIDs!==true || config.supportsJSON!==true || typeof config.transaction!=='function')return unavailable();
 return runWithTransaction(adapter,async()=>{
  const state=storage.getStore();
  if(!state?.isTransactionActive || state.adapter===adapter)return unavailable();
  const trx=state.adapter;
  const created=await create();
  if(storage.getStore()!==state || !created.client_id)return unavailable();
  const where=[{field:'clientId',value:created.client_id}];
  // Identity-owned bridge to Better Auth-owned persistence; no secret is generated.
  const disabled=await trx.update({model:'oauthClient',where,update:{disabled:true,updatedAt:new Date()}});
  if(!disabled)return unavailable();
  const row=await trx.findOne<Record<string,unknown>>({model:'oauthClient',where});
  const links=await trx.findMany<{resourceId:string}>({model:'oauthClientResource',where});
  if(!row || row.disabled!==true || row.clientSecret!=null || row.jwksUri!=null || !Array.isArray(row.clientCredentialsScopes) || row.clientCredentialsScopes.length || row.applicationType!=='web' || state.pendingHooks.length)return unavailable();
  verify({client_id:row.clientId,disabled:row.disabled,token_endpoint_auth_method:row.tokenEndpointAuthMethod,
   require_pkce:row.requirePKCE,dpop_bound_access_tokens:row.dpopBoundAccessTokens,skip_consent:row.skipConsent,
   subject_type:row.subjectType,redirect_uris:row.redirectUris,grant_types:row.grantTypes,response_types:row.responseTypes,
   scope:Array.isArray(row.scopes)?row.scopes.join(' '):undefined,jwks:typeof row.jwks==='string'?JSON.parse(row.jwks):row.jwks,resources:links.map(link=>link.resourceId).sort()});
  return {client_id:created.client_id};
 });
}
