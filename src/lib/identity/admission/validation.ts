import { IdentityOperationError } from "../operation-error.ts";
export function fail(status = 400, error = "invalid_request"): never { throw new IdentityOperationError(status, error); }
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function fields(input: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => ![...required, ...optional].includes(key)) || required.some(key => !(key in value))) return fail();
  return value;
}
export const text = (value: unknown, min = 1, max = 2048): string => {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\x00-\x20\x7f]/.test(value)) return fail();
  return value;
};
export function callback(value: unknown): string {
  const raw = text(value);
  let url: URL; try { url = new URL(raw); } catch { return fail(); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.href !== raw || url.searchParams.has("code") || url.searchParams.has("state")) return fail();
  return raw;
}
export function authorization(value: unknown) {
  const p = fields(value, ["client_id", "redirect_uri", "state", "nonce", "code_challenge", "code_challenge_method"], ["tenant_hint"]);
  const challenge = text(p.code_challenge, 43, 43);
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || p.code_challenge_method !== "S256" || (p.tenant_hint !== undefined && !uuid(p.tenant_hint))) return fail();
  return { clientId: text(p.client_id, 1, 256), redirect: callback(p.redirect_uri), state: text(p.state, 32, 512), nonce: text(p.nonce, 32, 512), challenge };
}
export function selection(value: unknown) {
  const p = fields(value, ["tenantId", "expectedVersion"]);
  if (!uuid(p.tenantId) || typeof p.expectedVersion !== "string" || !/^[1-9][0-9]*$/.test(p.expectedVersion)) return fail();
  return { tenantId: p.tenantId, expectedVersion: p.expectedVersion };
}
export function redemption(value: unknown) {
  const p = fields(value, ["client_id", "client_assertion_type", "client_assertion", "code", "code_verifier", "redirect_uri"]);
  if (p.client_assertion_type !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" ||
    typeof p.code_verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier)) return fail();
  return { clientId: text(p.client_id, 1, 256), assertion: text(p.client_assertion, 1, 16384),
    code: text(p.code, 32, 512), verifier: p.code_verifier, redirect: callback(p.redirect_uri) };
}
