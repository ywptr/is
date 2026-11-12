import type { Pool } from 'pg';
import type { CredentialPolicy } from './access-credentials.ts';
import { purposeSchemaReady, purposeReadExpression } from './client-purposes.ts';
import { nexusScopes } from './administration.ts';

/** Operator-only transport calls this read model; never returns secrets or assertions. */
export async function readConsumerAdministration(pool:Pool,policy:CredentialPolicy){
  const tx=await pool.connect();
  try{
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const schemaReady=await purposeSchemaReady(tx);
    const applications=(await tx.query('SELECT id,app_key,name,status FROM nexus_applications ORDER BY name LIMIT 200')).rows;
    const resources=(await tx.query('SELECT identifier,name,disabled,"allowedScopes","accessTokenTtl","signingAlgorithm","dpopBoundAccessTokensRequired" FROM "oauthResource" WHERE identifier=$1',[policy.audience])).rows;
    const resource=resources[0];
    const resourceReady=!!resource && resource.disabled===false && resource.accessTokenTtl===300 && resource.signingAlgorithm==='EdDSA' && resource.dpopBoundAccessTokensRequired===true && JSON.stringify([...resource.allowedScopes].sort())===JSON.stringify([...nexusScopes].sort());
    const clients=(await tx.query(`SELECT o.application_id,o.environment,o.oauth_client_id,
      c.disabled,c."tokenEndpointAuthMethod" AS authentication_method,c."redirectUris" AS redirect_uris,
      c.scopes,c."requirePKCE" AS pkce,c."dpopBoundAccessTokens" AS dpop,c."skipConsent" AS skip_consent,c.jwks,
      (SELECT e.enabled FROM identity_credential_epochs e WHERE e.issuer=$1 AND e.kind='client' AND e.subject_key=o.oauth_client_id) AS epoch_enabled,
      (c."clientId" IS NOT NULL) AS provider_present,
      EXISTS(SELECT 1 FROM identity_credential_bindings b WHERE b.client_id=o.oauth_client_id
        AND b.issuer=$1 AND b.audience=$2 AND b.environment=o.environment AND b.application_id=o.application_id) AS binding_present
      FROM nexus_application_oauth_clients o LEFT JOIN "oauthClient" c ON c."clientId"=o.oauth_client_id
      WHERE ${purposeReadExpression}='nexus_consumer' ORDER BY o.created_at DESC LIMIT 200`,[policy.issuer,policy.audience])).rows;
    const journal=(await tx.query(`SELECT request_id,action,state,reason,created_at,
      result->>'applicationId' AS application_id,result->>'clientId' AS client_id
      FROM identity_credential_administration WHERE issuer=$1 AND environment=$2
      ORDER BY (state='complete'),created_at DESC LIMIT 50`,[policy.issuer,policy.environment])).rows;
    // Include provider-phase orphans identified by native public request metadata.
    const candidates=(await tx.query('SELECT "clientId",disabled,metadata FROM "oauthClient" WHERE metadata IS NOT NULL LIMIT 200')).rows;
    const orphans=candidates.flatMap(c=>{
      let metadata;try{metadata=typeof c.metadata==='string'?JSON.parse(c.metadata):c.metadata;}catch{return [];}
      if(typeof metadata?.administration_request_id!=='string'||metadata.environment!==policy.environment||clients.some(l=>l.oauth_client_id===c.clientId))return [];
      return [{client_id:c.clientId,disabled:c.disabled,request_id:metadata.administration_request_id}];
    });
    const operations=(await tx.query('SELECT client_id,operation,enabled FROM nexus_consumer_operations WHERE issuer=$1 AND audience=$2 AND environment=$3 ORDER BY client_id,operation LIMIT 200',[policy.issuer,policy.audience,policy.environment])).rows;
    await tx.query('ROLLBACK');
    const safeClients=clients.map(({jwks,...client})=>{
      let keys;try{keys=typeof jwks==='string'?JSON.parse(jwks):jwks;}catch{keys=null;}
      return {...client,public_key_ids:Array.isArray(keys?.keys)?keys.keys.map((k:Record<string,unknown>)=>k?.kid).filter((kid:unknown)=>typeof kid==='string'):[]};
    });
    return {schemaReady,resourceReady,applications,resource:resource??null,clients:safeClients,journal,orphans,operations,
      profile:{environment:policy.environment,audience:policy.audience,callback:'https://5480-deb13.lan.com:5182/api/auth/callback',scopes:nexusScopes,operations:['sandcastle:tenant.access']},
      limits:{applications:200,clients:200,journal:50,orphans:200,operations:200}};
  }finally{await tx.query('ROLLBACK').catch(()=>{});tx.release();}
}
