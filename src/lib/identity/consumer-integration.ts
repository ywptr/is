/** Stage 2D composition; the 2C.2 factories and migration 0008 retain their ownership. */
import type { Pool, PoolClient } from "pg";
import { createAuthMiddleware, APIError, getSessionFromCtx } from "better-auth/api";
import { createDpopReplayStore } from "better-auth/oauth2";
import { createCredentialRegistry, digest, LifecycleError } from "./credential-registry.ts";
import type { Issuance, GrantEvidence, RegistryOptions } from "./credential-registry.ts";
import { createIdentityCredentialAdapter, CredentialError } from "./access-credentials.ts";
import type { CredentialPolicy, IdentityDependencies, NonceReceipt, VerifiedHumanCredential } from "./access-credentials.ts";
import { createDpopNonceService } from "./dpop-nonce.ts";
import { createProviderIssuanceIntegration } from "./provider-issuance.ts";
import { inCredentialAdministration } from "./administration.ts";
export type SnapshotWork<T> = (tx:PoolClient,human:VerifiedHumanCredential,at:Date,deadline:Date)=>Promise<T>;
export interface ConsumerIdentity { run<T>(request:Request,scopes:string[],work:SnapshotWork<T>):Promise<T> }

export function createConsumerIdentityIntegration(pool:Pool, options:RegistryOptions & {
  jwksFetch:IdentityDependencies["jwksFetch"];
  reservations:()=>Promise<Parameters<typeof createDpopReplayStore>[0]>;
  introspectPairwise?:(token:string,clientId:string)=>Promise<Record<string,unknown>>;
}) {
  const p=options.policy;
  const validateIssuance=async(tx:PoolClient,i:Issuance,g:GrantEvidence)=>{
    const client=(await tx.query('SELECT "tokenEndpointAuthMethod" FROM "oauthClient" WHERE "clientId"=$1',[g.clientId])).rows[0];
    if(client?.tokenEndpointAuthMethod!=="private_key_jwt") throw new LifecycleError("invalid_token");
    if (!g.authorizationCodeDigest) throw new LifecycleError("invalid_token");
    const code=(await tx.query(`SELECT * FROM identity_consumer_codes WHERE code_digest=$1 AND issuer=$2 AND client_id=$3
      AND session_id=$4 AND user_id=$5 AND expires_at>clock_timestamp()`,[g.authorizationCodeDigest,p.issuer,g.clientId,g.sessionId,g.userId])).rows[0];
    if (!code) throw new LifecycleError("invalid_token");
    for(const [kind,key] of [["client",g.clientId],["session",g.sessionId],["user",g.userId]]) {
      const epoch=(await tx.query("SELECT generation,enabled FROM identity_credential_epochs WHERE issuer=$1 AND kind=$2 AND subject_key=$3",[p.issuer,kind,key])).rows[0];
      if (epoch?.enabled===false || String(epoch?.generation??1)!==code.generations[kind]) throw new LifecycleError("invalid_token");
    }
    const bound=await tx.query(`UPDATE identity_consumer_codes SET token_id=$2,token_digest=$3,registered_until=to_timestamp($4)+interval '30 days'
      WHERE code_digest=$1 AND (token_id IS NULL OR (token_id=$2 AND token_digest=$3)) RETURNING code_digest`,
      [g.authorizationCodeDigest,i.reference.tokenId,i.tokenDigest,i.expiresAt]);
    if(bound.rowCount!==1)throw new LifecycleError("invalid_token");
    await options.validateIssuance?.(tx,i,g);
  };
  const registry=createCredentialRegistry(pool,{...options,validateIssuance});
  const issuance=createProviderIssuanceIntegration(registry,{enabled:options.enabled,jwksFetch:options.jwksFetch,introspectPairwise:options.introspectPairwise});
  const authorizing=new WeakMap<object,Record<string,string>>();
  const pendingKey=(q:Record<string,unknown>,sid:string)=>digest(JSON.stringify(["consent",q.client_id,q.state,q.code_challenge,q.redirect_uri,sid]));
  const before=createAuthMiddleware(async ctx=>{
    if(!options.enabled) return;
    if(ctx.path==="/oauth2/authorize" && (ctx.query?.resource===p.audience || (Array.isArray(ctx.query?.resource)&&ctx.query.resource.includes(p.audience)))) {
      const client=ctx.query.client_id;
      const session=await getSessionFromCtx(ctx);
      if(session){
        const generations=await registry.transaction(async tx=>{
          await tx.query("SELECT issuer FROM identity_credential_authorities WHERE issuer=$1 FOR SHARE",[p.issuer]);
          const result:Record<string,string>={};
          for(const [kind,key] of [["client",client],["session",session.session.id],["user",session.user.id]]){
            const e=(await tx.query("SELECT generation,enabled FROM identity_credential_epochs WHERE issuer=$1 AND kind=$2 AND subject_key=$3",[p.issuer,kind,key])).rows[0];
            if(e?.enabled===false)throw new APIError("FORBIDDEN",{error:"access_denied"});
            result[kind]=String(e?.generation??1);
          }
          return result;
        });
        authorizing.set(ctx.context,generations);
      }
    }
    // Dedicated consumers are immutable through native administration. Governance
    // must first invalidate generations through reviewed internal Identity services.
    if(!inCredentialAdministration() && /(?:update-client|delete-client|rotate-secret|rotate-keys|resources)/.test(ctx.path??"")) {
      const client=typeof ctx.body?.client_id==="string"?ctx.body.client_id:ctx.params?.client_id;
      const target=client ? await pool.query("SELECT 1 FROM identity_credential_bindings WHERE issuer=$1 AND client_id=$2",[p.issuer,client]) : null;
      if(!client || target?.rowCount || (ctx.path??"").includes("resources")) throw new APIError("FORBIDDEN",{error:"access_denied"});
    }
  });
  const after=createAuthMiddleware(async ctx=>{
    if(!options.enabled) return;
    // Capture only provider-created authorization codes, via its own response and
    // verification row. Raw codes are never persisted by Identity sidecars.
    if(ctx.path==="/oauth2/authorize" || ctx.path==="/oauth2/consent") {
      const body=ctx.context.returned as {url?:string}|undefined;
      const location=ctx.context.responseHeaders?.get("location")??body?.url;
      if(location) {
        const code=new URL(location,p.issuer).searchParams.get("code");
        if(code) {
          // Default provider hashing is SHA-256/base64url; ask its supported API
          // instead of reproducing token storage configuration.
          const provider=await import("@better-auth/oauth-provider");
          const api=provider.getOAuthProviderApi(ctx,{loginPage:"/sign-in",consentPage:"/consent",storeTokens:"hashed"},"authorization_code");
          const stored=await api.hashToken(code,"authorization_code");
          const verification=await ctx.context.internalAdapter.findVerificationValue(stored);
          if(verification) {
            const v=JSON.parse(verification.value);
            const resources=Array.isArray(v.resource)?v.resource:[v.resource];
            if(resources.includes(p.audience)) {
              await registry.transaction(async tx=>{
                await tx.query("UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1",[p.issuer]);
                const gens:Record<string,string>={};
                for(const [kind,key] of [["client",v.query.client_id],["session",v.sessionId],["user",v.userId]]) {
                  const e=(await tx.query("SELECT generation,enabled FROM identity_credential_epochs WHERE issuer=$1 AND kind=$2 AND subject_key=$3",[p.issuer,kind,key])).rows[0];
                  if(e?.enabled===false) throw new LifecycleError("invalid_token");
                  gens[kind]=String(e?.generation??1);
                }
                const key=pendingKey(v.query,v.sessionId);
                const pending=(await tx.query("SELECT generations FROM identity_consumer_codes WHERE code_digest=$1 AND issuer=$2 AND client_id=$3 AND session_id=$4 AND user_id=$5 AND expires_at>clock_timestamp()",[key,p.issuer,v.query.client_id,v.sessionId,v.userId])).rows[0];
                // Consent may dispatch authorize internally, invoking this hook twice.
                // A previously captured identical provider code is idempotent evidence;
                // its generations must still match, so revocation cannot be bypassed.
                const captured=(await tx.query("SELECT generations FROM identity_consumer_codes WHERE code_digest=$1 AND issuer=$2 AND client_id=$3 AND session_id=$4 AND user_id=$5 AND expires_at>clock_timestamp()",[digest(code),p.issuer,v.query.client_id,v.sessionId,v.userId])).rows[0];
                const isConsentResume=ctx.path==='/oauth2/consent'||typeof ctx.body?.accept==='boolean';
                const original=pending?.generations??captured?.generations??(isConsentResume?undefined:authorizing.get(ctx.context));
                if(!original || Object.keys(gens).some(k=>gens[k]!==original[k])) throw new LifecycleError("invalid_token");
                if(captured)return;
                await tx.query("DELETE FROM identity_consumer_codes WHERE code_digest=$1 AND issuer=$2 AND token_id IS NULL",[key,p.issuer]);
                authorizing.delete(ctx.context);
                await tx.query(`INSERT INTO identity_consumer_codes(code_digest,issuer,client_id,session_id,user_id,generations,expires_at)
                  VALUES($1,$2,$3,$4,$5,$6,$7)`,[digest(code),p.issuer,v.query.client_id,v.sessionId,v.userId,JSON.stringify(gens),verification.expiresAt]);
              });
            }
          }
        } else if(ctx.path==="/oauth2/authorize" && authorizing.has(ctx.context) && new URL(location,p.issuer).pathname==="/consent") {
          const session=await getSessionFromCtx(ctx);
          if(!session)throw new LifecycleError("invalid_token");
          const q=ctx.query as Record<string,unknown>;
          await registry.transaction(async tx=>{
            await tx.query("UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1",[p.issuer]);
            await tx.query(`INSERT INTO identity_consumer_codes(code_digest,issuer,client_id,session_id,user_id,generations,expires_at)
              VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '10 minutes') ON CONFLICT(code_digest) DO NOTHING`,
              [pendingKey(q,session.session.id),p.issuer,q.client_id,session.session.id,session.user.id,JSON.stringify(authorizing.get(ctx.context))]);
          });
          authorizing.delete(ctx.context);
        }
      }
    }
    await issuance.after(ctx);
  });
  async function profileState(tx:PoolClient,r:Parameters<typeof registry.readCurrentState>[0],d:string,n?:NonceReceipt){
    const state=await registry.readCurrentStateInTransaction(tx,r,d,n);
    if(!state)return null;
    const code=await tx.query(`SELECT 1 FROM identity_consumer_codes g JOIN "oauthClient" c ON c."clientId"=g.client_id
      WHERE g.issuer=$1 AND g.token_id=$2 AND g.token_digest=$3 AND g.client_id=$4 AND g.session_id=$5
        AND c."tokenEndpointAuthMethod"='private_key_jwt'`,[p.issuer,r.tokenId,d,r.clientId,r.sessionId]);
    return code.rowCount===1?state:null;
  }
  const boundary:ConsumerIdentity={async run(request,scopes,work){
    let receipt:NonceReceipt|undefined,tokenDigest="";
    const adapter=createIdentityCredentialAdapter(p,{jwksFetch:options.jwksFetch,
      replayStore:createDpopReplayStore(await options.reservations()),nonce:createDpopNonceService(registry),
      readCurrentState:async(r,d,n)=>{tokenDigest=d;receipt=n;return registry.transaction(tx=>profileState(tx,r,d,n));}});
    const human=await adapter.validateAccessCredential(request,{scopes});
    let snapshotAt=0,expiry=0;
    const value=await registry.transaction(async tx=>{
      const at=(await tx.query("SELECT clock_timestamp() AS at")).rows[0].at as Date;
      snapshotAt=at.getTime();
      const state=await profileState(tx,human,tokenDigest,receipt);
      if(!state || state.subjectMappings[0]?.userId!==human.userId || state.applicationId!==human.applicationId) throw new LifecycleError("invalid_token");
      const deadline=new Date(Math.min(at.getTime()+5000,human.expiresAt*1000,receipt?.expiresAt??Infinity));
      expiry=deadline.getTime();
      const result=await work(tx,human,at,deadline);
      if(Date.now()>=deadline.getTime() || Date.now()-at.getTime()>=2000) throw new CredentialError("identity_unavailable");
      return result;
    });
    if(Date.now()-snapshotAt>=2000||Date.now()>=expiry)throw new CredentialError("identity_unavailable");
    return value;
  }};
  return {registry,before,after,extension:issuance.extension,boundary};
}
