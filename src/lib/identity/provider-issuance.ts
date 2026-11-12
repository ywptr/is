import type { OAuthProviderExtension, OAuthClaimExtensionInput } from "@better-auth/oauth-provider";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { verifyJwsAccessToken, getDpopJktFromPayload } from "better-auth/oauth2";
import { decodeProtectedHeader } from "jose";
import { digest } from "./credential-registry.ts";
import type { CredentialRegistry, GrantEvidence } from "./credential-registry.ts";
import type { IdentityDependencies } from "./access-credentials.ts";

type Options = {
  enabled: boolean;
  jwksFetch: IdentityDependencies["jwksFetch"];
  validateGrant?: (input: OAuthClaimExtensionInput) => Promise<void>;
  // Authenticated authoritative provider introspection of this exact issued token.
  // Needed only for pairwise presentations; no client-supplied user/subject hints.
  introspectPairwise?: (token: string, clientId: string) => Promise<Record<string, unknown>>;
};
/** Install only in explicitly isolated/provider configuration after review.
 * Exported factory has no app imports, seeding or default production instance. */
export function createProviderIssuanceIntegration(registry: CredentialRegistry, options: Options) {
  const evidence = new WeakMap<object, { grant: GrantEvidence; pairwise: boolean }>();
  const p = registry.policy;
  const capture = async (input: OAuthClaimExtensionInput) => {
    if (!options.enabled || !input.resources?.includes(p.audience)) return {};
    if (input.grantType!=="authorization_code" || !input.user?.id || !input.sessionId ||
      input.resources.length!==1 || input.scopes.some(s=>["openid","profile","email","offline_access"].includes(s))) {
      throw new APIError("BAD_REQUEST",{error:"invalid_scope",error_description:"Unsupported Identity resource grant"});
    }
    await options.validateGrant?.(input);
    evidence.set(input.ctx.context,{grant:{userId:input.user.id,clientId:input.client.clientId,
      sessionId:input.sessionId,scopes:[...input.scopes],grantId:input.referenceId,
      authorizationCodeDigest: typeof input.ctx.body?.code === "string" ? digest(input.ctx.body.code) : undefined},pairwise:input.client.subjectType==="pairwise"});
    return {};
  };
  const extension: OAuthProviderExtension = { claims: { accessToken: capture } };
  const after = createAuthMiddleware(async ctx=>{
    if (!options.enabled || ctx.path!=="/oauth2/token") return;
    const body = ctx.context.returned;
    if (!body || typeof body!=="object" || !("access_token" in body) || typeof body.access_token!=="string") return;
    // Response alone never proves a human grant. A targeted token with no native
    // grant capture fails closed (including unexpected provider hook dispatch).
    const token = body.access_token;
    let claims;
    try {
      claims = await verifyJwsAccessToken(token,{jwksFetch:options.jwksFetch,verifyOptions:{
        issuer:p.issuer,audience:p.audience,typ:"at+jwt",algorithms:["EdDSA"],clockTolerance:0,
        requiredClaims:["iss","sub","aud","iat","exp","jti","client_id","sid","scope","cnf"],
      }});
    } catch {
      // Unrelated login grants keep their original response. A captured resource
      // issuance may never escape with an unverifiable final credential.
      if (!evidence.has(ctx.context)) return;
      throw new APIError("SERVICE_UNAVAILABLE",{error:"temporarily_unavailable"});
    }
    const captured = evidence.get(ctx.context);
    evidence.delete(ctx.context);
    if (!captured) throw new APIError("SERVICE_UNAVAILABLE",{error:"temporarily_unavailable"});
    try {
      const jkt = getDpopJktFromPayload(claims), header = decodeProtectedHeader(token);
      if (claims.aud!==p.audience || typeof claims.sub!=="string" || typeof claims.jti!=="string" ||
        typeof claims.sid!=="string" || typeof claims.client_id!=="string" || typeof claims.scope!=="string" ||
        !jkt || !header.kid || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
        claims.act!==undefined || claims["urn:nexus:authorization:v1"]!==undefined) throw new Error("invalid issuance");
      if (captured.pairwise) {
        if (!options.introspectPairwise) throw new Error("pairwise mapping unavailable");
        const introspected = await options.introspectPairwise(token,captured.grant.clientId);
        if (introspected.active!==true || introspected.iss!==p.issuer || introspected.aud!==p.audience ||
          introspected.client_id!==claims.client_id || introspected.sid!==claims.sid ||
          typeof introspected.sub!=="string" || introspected.sub.length===0 ||
          getDpopJktFromPayload(introspected)!==jkt) throw new Error("invalid pairwise mapping");
        captured.grant.pairwiseSubject = introspected.sub;
      }
      await registry.registerIssuance({reference:{issuer:p.issuer,audience:p.audience,environment:p.environment,
        subject:claims.sub,tokenId:claims.jti,sessionId:claims.sid,clientId:claims.client_id},
        tokenDigest:digest(token),senderKey:jkt,signingKey:header.kid,scopes:claims.scope.split(" "),
        issuedAt:claims.iat!,expiresAt:claims.exp!},captured.grant);
    } catch { throw new APIError("SERVICE_UNAVAILABLE",{error:"temporarily_unavailable"}); }
  });
  return { extension, after };
}
