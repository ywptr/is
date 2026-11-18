import {validEvidence} from "../../nexus-domains/policy.ts";
import type {DomainEvidence} from "../../nexus-domains/policy.ts";
/** Consumer-side receipt verification profile. It verifies integrity/binding only;
 * current eligibility still requires an online Nexus decision and local policy. */
import { jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { fail, uuid } from "./validation.ts";
export const claimNames = ["iss", "sub", "aud", "iat", "exp", "jti", "nonce", "tenant_id", "application_id", "client_id", "environment", "admission_id", "auth_time", "cnf", "generation"];
export interface AdmissionExpectation {
  issuer: string; clientId: string; applicationId: string; environment: string;
  subject: string; nonce: string; tenantId?: string; keyThumbprint: string; domain?: DomainEvidence;
}
export async function verifyAdmissionContext(token: string, jwks: JWTVerifyGetKey, expected: AdmissionExpectation) {
  if (!expected || typeof expected.issuer !== "string" || !expected.issuer.startsWith("https://") ||
    !expected.clientId || !expected.subject || !uuid(expected.applicationId) || (expected.tenantId !== undefined && !uuid(expected.tenantId)) ||
    !["development", "staging", "production"].includes(expected.environment) ||
    typeof expected.nonce !== "string" || expected.nonce.length < 32 || expected.nonce.length > 512 ||
    !/^[A-Za-z0-9_-]{43}$/.test(expected.keyThumbprint)) return fail(401, "invalid_admission");
  if(expected.domain!==undefined&&!validEvidence(expected.domain))return fail(401,"invalid_admission");
  const typ=expected.domain?'is-domain-admission+jwt':'is-admission+jwt';
  const names=expected.domain?[...claimNames,'domain_binding']:claimNames;
  const { payload, protectedHeader } = await jwtVerify(token, jwks, { issuer: expected.issuer, audience: expected.clientId,
    typ, algorithms: ["EdDSA"], clockTolerance: 0, requiredClaims: names });
  const now = Math.floor(Date.now() / 1000), cnf = payload.cnf as { jkt?: string } | undefined;
  if (Object.keys(payload).some(key => !names.includes(key) && key !== "nbf") || protectedHeader.typ !== typ || protectedHeader.alg !== "EdDSA" || !protectedHeader.kid ||
    payload.aud !== expected.clientId || payload.client_id !== expected.clientId || payload.application_id !== expected.applicationId ||
    payload.environment !== expected.environment || payload.sub !== expected.subject || payload.nonce !== expected.nonce ||
    (expected.tenantId !== undefined && payload.tenant_id !== expected.tenantId) || !uuid(payload.tenant_id) || !uuid(payload.application_id) || !uuid(payload.admission_id) ||
    payload.jti !== payload.admission_id || payload.generation !== "1" || cnf?.jkt !== expected.keyThumbprint ||
    Object.keys(cnf ?? {}).length !== 1 || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
    !Number.isSafeInteger(payload.auth_time) || (payload.auth_time as number) < 0 || payload.iat! < 0 || (payload.nbf !== undefined && !Number.isSafeInteger(payload.nbf)) || payload.iat! > now || payload.exp! <= now || payload.exp! <= payload.iat! ||
    payload.exp! - payload.iat! > 300 || (payload.auth_time as number) > payload.iat!) return fail(401, "invalid_admission");
  if(expected.domain){
    const d=payload.domain_binding;
    if(!validEvidence(d)||d.hostname!==expected.domain.hostname||d.origin!==expected.domain.origin||d.revision!==expected.domain.revision)return fail(401,"invalid_admission");
  }
  return payload;
}
