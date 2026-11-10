import { randomBytes } from "node:crypto";
import { importJWK, jwtVerify } from "jose";
import { CredentialError } from "./access-credentials.ts";
import type { IdentityDependencies } from "./access-credentials.ts";
import { digest } from "./credential-registry.ts";
import type { CredentialRegistry } from "./credential-registry.ts";

export class DpopNonceRequired extends CredentialError {
  readonly nonce: string;
  constructor(nonce: string) { super("use_dpop_nonce"); this.nonce=nonce; }
}
export function nonceChallenge(error: unknown): Response | null {
  if (!(error instanceof DpopNonceRequired)) return null;
  return Response.json({ error: "use_dpop_nonce" }, { status: 401, headers: {
    "WWW-Authenticate": 'DPoP error="use_dpop_nonce", algs="ES256"',
    "DPoP-Nonce": error.nonce, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
/** Resource-server nonces only. No token endpoint behavior or HTTP endpoint added. */
export function createDpopNonceService(registry: CredentialRegistry) {
  const p = registry.policy;
  async function issue(senderKey: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(senderKey)) throw new CredentialError("invalid_dpop_proof");
    try {
      return await registry.transaction(async tx => {
        // Serialize quota enforcement/issuance across instances; no process-local cache.
        const authority=await tx.query("UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1 RETURNING issuer",[p.issuer]);
        if (authority.rowCount!==1) throw new CredentialError("identity_unavailable");
        const quota = await tx.query(`SELECT count(*)::int AS total,
          count(*) FILTER(WHERE sender_key=$2)::int AS per_key FROM identity_dpop_nonces
          WHERE issuer=$1 AND expires_at>clock_timestamp()`,[p.issuer,senderKey]);
        if (quota.rows[0].total>=10000 || quota.rows[0].per_key>=8) throw new CredentialError("identity_unavailable");
        const nonce = randomBytes(32).toString("base64url");
        await tx.query(`INSERT INTO identity_dpop_nonces(digest,issuer,audience,environment,sender_key,issued_at,expires_at)
          SELECT $1,$2,$3,$4,$5,t,t+interval '60 seconds' FROM (SELECT clock_timestamp() t) clock`,
          [digest(nonce),p.issuer,p.audience,p.environment,senderKey]);
        return nonce;
      });
    } catch (error) { if (error instanceof CredentialError) throw error; throw new CredentialError("identity_unavailable"); }
  }
  const validate: IdentityDependencies["nonce"]["validate"] = async ({ proof,keyThumbprint,resource,verifiedProof }) => {
    if (!verifiedProof || verifiedProof.jkt!==keyThumbprint || resource!==p.audience || proof.length>16384) throw new CredentialError("invalid_dpop_proof");
    let nonce: unknown;
    try {
      const key = await importJWK(verifiedProof.jwk,"ES256");
      const verified = await jwtVerify(proof,key,{algorithms:["ES256"],typ:"dpop+jwt"});
      // This input comes only from the adapter's successful full native proof check.
      if (verified.payload.jti!==verifiedProof.jti) throw new Error("proof mismatch");
      nonce = verified.payload.nonce;
    } catch { throw new CredentialError("invalid_dpop_proof"); }
    let expiresAt: number | undefined;
    if (typeof nonce==="string" && /^[A-Za-z0-9_-]{43}$/.test(nonce)) {
      try {
        expiresAt = await registry.transaction(async tx=> { const result=await tx.query(`SELECT expires_at FROM identity_dpop_nonces
          WHERE digest=$1 AND issuer=$2 AND audience=$3 AND environment=$4 AND sender_key=$5
            AND issued_at<=clock_timestamp() AND expires_at>clock_timestamp()`,
          [digest(nonce as string),p.issuer,p.audience,p.environment,keyThumbprint]);
          return result.rowCount===1 ? result.rows[0].expires_at.getTime() as number : undefined; });
      } catch { throw new CredentialError("identity_unavailable"); }
    }
    if (!expiresAt) throw new DpopNonceRequired(await issue(keyThumbprint));
    return {nonceDigest:digest(nonce as string),senderKey:keyThumbprint,expiresAt};
  };
  return { issue, validate };
}
