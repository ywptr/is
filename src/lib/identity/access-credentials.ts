import { createHash } from "node:crypto";
import { verifyJwsAccessToken, verifyDpopProof, getDpopJktFromPayload } from "better-auth/oauth2";
import type { DpopReplayStore } from "better-auth/oauth2";

type JwksFetch = Extract<NonNullable<Parameters<typeof verifyJwsAccessToken>[1]["jwksFetch"]>, (...args: never[]) => unknown>;
export type CredentialErrorCode = "invalid_token" | "invalid_dpop_proof" | "insufficient_scope" | "identity_unavailable" | "use_dpop_nonce";
export class CredentialError extends Error {
  readonly code: CredentialErrorCode;
  constructor(code: CredentialErrorCode) { super(code); this.code = code; }
}
export interface CredentialReference {
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  readonly tokenId: string;
  readonly sessionId: string;
  readonly audience: string;
  readonly environment: string;
}
export interface HumanSubjectMapping {
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  readonly namespace: "provider_access_subject" | "pairwise";
  readonly userId: string;
}
/** Identity-owned exact mapping resolver. Rows must come from authoritative issuance
 * or explicit verified links. It performs no user-table, UUID or email inference.
 */
export function resolveSubject(reference: CredentialReference, mappings: readonly HumanSubjectMapping[]): string | null {
  if (!Array.isArray(mappings) || mappings.length !== 1) return null;
  const mapping = mappings[0];
  if (!mapping || mapping.issuer !== reference.issuer || mapping.subject !== reference.subject ||
    mapping.clientId !== reference.clientId || !["provider_access_subject", "pairwise"].includes(mapping.namespace) || !nonempty(mapping.userId)) return null;
  return mapping.userId;
}
export interface HumanState {
  // All fields come from an authoritative, uncached Identity read, never request claims.
  readonly active: boolean;
  readonly revoked: boolean;
  readonly clientActive: boolean;
  readonly userActive: boolean;
  readonly sessionActive: boolean;
  readonly grantClass: "human_authorization_code";
  readonly reference: CredentialReference;
  readonly applicationId: string;
  readonly subjectMappings: readonly HumanSubjectMapping[];
}
export interface NonceReceipt { readonly nonceDigest: string; readonly senderKey: string; readonly expiresAt: number }
export interface IdentityDependencies {
  readonly jwksFetch: JwksFetch;
  // Must use createDpopReplayStore with shared database verification reservations.
  readonly replayStore: DpopReplayStore;
  // REQUIRED extension: pinned provider cannot validate server nonces. Implement with
  // maintained protocol support; must verify the signed proof's nonce against shared,
  // bounded server-issued state scoped to this resource and sender key, or throw.
  readonly nonce: { validate(input: { proof: string; keyThumbprint: string; resource: string; verifiedProof?: Awaited<ReturnType<typeof verifyDpopProof>> }): Promise<void | NonceReceipt> };
  // REQUIRED extension: current client/session/user eligibility AND individual JWT
  // revocation/issuance record, exact human grant class, binding and subject mapping.
  // Must fail for unknown issuance, ambiguous mappings and missing policy state.
  // Later Nexus decisions MUST re-read this inside their policy snapshot.
  readonly readCurrentState: (reference: CredentialReference, tokenDigest: string, nonce?: NonceReceipt) => Promise<HumanState | null>;
}
export interface CredentialPolicy {
  readonly issuer: string;
  readonly audience: string;
  readonly environment: string;
}
export interface CredentialRequirements { readonly scopes: readonly string[] }
const verified = Symbol("IdentityVerifiedCredential");
export interface VerifiedHumanCredential extends CredentialReference {
  readonly [verified]: true;
  readonly userId: string;
  readonly applicationId: string;
  readonly keyThumbprint: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
  readonly checkedAt: number;
}
function fail(code: CredentialErrorCode): never { throw new CredentialError(code); }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 2048; }
function https(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) throw new Error("Identity requires canonical HTTPS URLs");
  return url;
}
function sameReference(a: CredentialReference, b: CredentialReference) {
  if (!b) return false;
  return (Object.keys(a) as (keyof CredentialReference)[]).every(key => a[key] === b[key]);
}

/** No production instance is exported: reviewed persistent configuration and lifecycle
 * management integrations are required before activation.
 * Request.url must be the trusted public URL supplied by the transport. Forwarded
 * headers and caller-supplied URL/identity/environment overrides are never consulted.
 */
export function createIdentityCredentialAdapter(policy: CredentialPolicy, dependencies?: IdentityDependencies) {
  const issuer = https(policy.issuer).href;
  const audience = https(policy.audience).href;
  if (issuer !== policy.issuer || audience !== policy.audience || !nonempty(policy.environment)) throw new Error("Invalid Identity policy");
  const environment = policy.environment;
  return {
    async validateAccessCredential(request: Request, requirements: CredentialRequirements): Promise<VerifiedHumanCredential> {
      if (!dependencies?.jwksFetch || !dependencies.replayStore?.reserve || !dependencies.nonce?.validate || !dependencies.readCurrentState) fail("identity_unavailable");
      const url = new URL(request.url);
      if (url.protocol !== "https:" || url.origin !== new URL(audience).origin || url.username || url.password || url.hash) fail("invalid_dpop_proof");
      const authorization = request.headers.get("authorization");
      const match = authorization?.match(/^DPoP ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
      const proof = request.headers.get("dpop");
      if (!match || match[1].length > 16384) fail("invalid_token");
      if (!proof || proof.length > 16384) fail("invalid_dpop_proof");
      const token = match[1];
      // Resolve keys solely through the pinned trusted dependency; never token jku/iss.
      let jwks: Awaited<ReturnType<JwksFetch>>;
      try { jwks = await dependencies.jwksFetch(); } catch { fail("identity_unavailable"); }
      if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length === 0) fail("identity_unavailable");
      let payload;
      try {
        payload = await verifyJwsAccessToken(token, { jwksFetch: async () => jwks, verifyOptions: {
          issuer, audience, typ: "at+jwt", algorithms: ["EdDSA"], clockTolerance: 0,
          requiredClaims: ["iss", "sub", "aud", "exp", "iat", "jti", "client_id", "sid", "scope", "cnf"],
        } });
      } catch { fail("invalid_token"); }
      const now = Math.floor(Date.now() / 1000);
      const jkt = getDpopJktFromPayload(payload);
      if (payload.aud !== audience || !nonempty(payload.sub) || !nonempty(payload.client_id) || !nonempty(payload.jti) || !nonempty(payload.sid) || !jkt ||
        !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) || payload.iat! > now || payload.exp! <= now ||
        payload.exp! <= payload.iat! || payload.exp! - payload.iat! > 300 || typeof payload.scope !== "string" ||
        payload.act !== undefined || payload["urn:nexus:authorization:v1"] !== undefined) fail("invalid_token");
      const scopes = payload.scope.split(" ");
      if (scopes.some(scope => !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(scope)) || new Set(scopes).size !== scopes.length || scopes.includes("offline_access")) fail("invalid_token");
      let verifiedProof;
      try {
        verifiedProof = await verifyDpopProof({ proofJwt: proof, method: request.method, url: request.url, accessToken: token,
          expectedJkt: jkt, requireAth: true, proofMaxAgeSeconds: 60, signingAlgorithms: ["ES256"],
          replayStore: { reserve: async reservation => {
            try { return await dependencies.replayStore.reserve(reservation); } catch { fail("identity_unavailable"); }
          } },
        });
      } catch (error) { if (error instanceof CredentialError) throw error; fail("invalid_dpop_proof"); }
      // Native proof validation precedes maintained JOSE nonce extraction/validation.
      let nonceReceipt;
      try { nonceReceipt = await dependencies.nonce.validate({ proof, keyThumbprint: jkt, resource: audience, verifiedProof }); }
      catch (error) { if (error instanceof CredentialError) throw error; fail("identity_unavailable"); }
      const reference: CredentialReference = { issuer, subject: payload.sub, clientId: payload.client_id,
        tokenId: payload.jti, sessionId: payload.sid, audience, environment };
      let state;
      try { state = await dependencies.readCurrentState(Object.freeze(reference), createHash("sha256").update(token).digest("hex"), nonceReceipt || undefined); } catch { fail("identity_unavailable"); }
      if (!state || state.active !== true || state.revoked !== false || state.clientActive !== true || state.userActive !== true || state.sessionActive !== true ||
        state.grantClass !== "human_authorization_code" || !sameReference(reference, state.reference) ||
        !nonempty(state.applicationId)) fail("invalid_token");
      const userId = resolveSubject(reference, state.subjectMappings);
      if (!userId) fail("invalid_token");
      if (!requirements.scopes.every(scope => scopes.includes(scope))) fail("insufficient_scope");
      // Eligibility I/O may have consumed the remaining token lifetime.
      if (payload.exp! <= Math.floor(Date.now() / 1000)) fail("invalid_token");
      if (nonceReceipt && nonceReceipt.expiresAt <= Date.now()) fail("invalid_dpop_proof");
      return Object.freeze({ ...reference, [verified]: true as const, userId, applicationId: state.applicationId,
        keyThumbprint: jkt, scopes: Object.freeze(scopes), expiresAt: payload.exp!, checkedAt: Date.now() });
    },
  };
}
