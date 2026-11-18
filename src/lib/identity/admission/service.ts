import {resolveDomain,evidence,domainOrigin,validEvidence} from "../../nexus-domains/policy.ts";
import type {DomainEvidence} from "../../nexus-domains/policy.ts";
import type {ConsumerIdentity} from "../consumer-integration.ts";
import {evaluateDomainDecision} from "../../nexus-domains/decision.ts";
/** Identity admission state machine. Nexus remains the only tenant policy owner.
 * All receipt/code state and audit commit in the facade's verified snapshot. */
import { randomBytes, randomUUID } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { createDpopReplayStore, generateCodeChallenge, verifyDpopProof } from "better-auth/oauth2";
import type { DpopReplayReservations } from "better-auth/oauth2";
import { validatePublicClientJwks } from "@better-auth/oauth-provider/internal";
import type { PoolClient } from "pg";
import { digest,LifecycleError } from "../credential-registry.ts";
import {CredentialError} from "../access-credentials.ts";
import type { CredentialRegistry } from "../credential-registry.ts";
import type { EligibilityIdentity, StoredEligibilityBinding } from "../eligibility-context.ts";
import type { createEligibilityService, EligibilitySnapshot } from "../../nexus-eligibility/service.ts";
import { createDpopNonceService } from "../dpop-nonce.ts";
import { IdentityOperationError } from "../operation-error.ts";
import { authorization, redemption, selection, fail, text, uuid } from "./validation.ts";
import { verifyAdmissionContext } from "./verification.ts";
import type { AdmissionExpectation } from "./verification.ts";

type Facade = ReturnType<typeof createEligibilityService>;
type Transaction = { id: string; issuer: string; client_id: string; application_id: string; environment: string;
  binding: StoredEligibilityBinding & {domain?:DomainEvidence;clientLinkId?:string;clientModeRevision?:string}; token_id: string; redirect_uri: string; state: string; nonce: string; challenge: string;
  csrf_digest: string; version: string; expires_at: Date; tenant_id: string | null; code_digest: string | null;
  code_expires_at: Date | null; consumed_at: Date | null; policy_versions: Record<string,string> | null };
export interface AdmissionOptions {
  domainEnabled?:()=>boolean; consumer?:ConsumerIdentity;
  registry: CredentialRegistry; identity: EligibilityIdentity; nexus: Facade;
  enabled: () => boolean; clientAllowed: (clientId: string) => boolean;
  reservations: () => Promise<DpopReplayReservations>;
  sign: (claims: JWTPayload, signingKey: string) => Promise<string>;
  jwks: Parameters<typeof verifyAdmissionContext>[1];
}
const opaque = () => randomBytes(32).toString("base64url");
export function createAdmissionService(options: AdmissionOptions) {
  const { registry, identity, nexus } = options, p = registry.policy;
  const endpoint = new URL("/api/is/v1/admission/redemptions", p.issuer).href;
  const nonce = createDpopNonceService({ ...registry, policy: { ...p, audience: endpoint } });
  function ready(client?: string) {
    if (!options.enabled()) return fail(404, "resource_not_available");
    if (client !== undefined && !options.clientAllowed(client)) return fail(404, "resource_not_available");
  }
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    ready();
    try { const result = await work(); ready(); return result; }
    catch (error) {
      if (error instanceof IdentityOperationError) throw error;
      // Nonce errors are maintained CredentialErrors; preserve only that exact class below.
      if (error instanceof DpopNonceRequired || error instanceof CredentialError || error instanceof LifecycleError) throw error;
      return fail(503, "dependency_unavailable");
    }
  }
  async function client(tx: PoolClient, clientId: string) {
    ready(clientId);
    const row = (await tx.query(`SELECT c."redirectUris",c.jwks,c."jwksUri",c."subjectType",b.application_id,l.id AS link_id,
      COALESCE(to_jsonb(l)->>'admission_mode','choice') AS admission_mode,
      COALESCE(to_jsonb(l)->>'admission_mode_revision','1') AS mode_revision
      FROM identity_credential_bindings b JOIN "oauthClient" c ON c."clientId"=b.client_id
      JOIN nexus_application_oauth_clients l ON l.oauth_client_id=b.client_id AND l.application_id=b.application_id
        AND l.environment=b.environment AND l.purpose='nexus_consumer'
      JOIN nexus_applications a ON a.id=b.application_id AND a.status='active'
      JOIN "oauthResource" r ON r.identifier=b.audience AND NOT r.disabled
      JOIN "oauthClientResource" cr ON cr."clientId"=b.client_id AND cr."resourceId"=b.audience
      WHERE b.issuer=$1 AND b.client_id=$2 AND b.audience=$3 AND b.environment=$4 AND b.enabled
        AND NOT c.disabled AND c."tokenEndpointAuthMethod"='private_key_jwt'`, [p.issuer, clientId, p.audience, p.environment])).rows[0];
    if (!row || row.jwksUri || row.subjectType === "pairwise") return fail(401, "invalid_client");
    return row;
  }
  async function target(s:EligibilitySnapshot,t:Transaction){
    const c=await client(s.tx,t.client_id),d=t.binding.domain;
    if((t.binding.clientLinkId&&t.binding.clientLinkId!==c.link_id)||
      (t.binding.clientModeRevision??'1')!==c.mode_revision)return fail(403,'domain_not_available');
    if(c.admission_mode==='domain'){
      if(!options.domainEnabled?.()||!d||!validEvidence(d))return fail(403,'domain_not_available');
      const current=await resolveDomain(s.tx,d.origin,s.principal.applicationId,s.principal.environment);
      if(current.hostname!==d.hostname||current.revision!==d.revision||new URL(t.redirect_uri).origin!==d.origin||
        (t.tenant_id&&t.tenant_id!==current.tenantId))return fail(403,'domain_not_available');
      return current;
    }
    if(d)return fail(403,'domain_not_available');
    return null;
  }
  async function load(id: string, code = false): Promise<Transaction> {
    if (!code && !uuid(id)) return fail();
    return registry.transaction(async tx => {
      const row = (await tx.query(`SELECT *,version::text FROM identity_admission_transactions WHERE ${code ? "code_digest" : "id"}=$1 AND issuer=$2`, [code ? digest(id) : id, p.issuer])).rows[0];
      if (!row) return fail(code ? 400 : 404, code ? "invalid_grant" : "resource_not_available");
      return row;
    });
  }
  function owns(s: EligibilitySnapshot, t: Transaction) {
    const b = t.binding, human = s.principal;
    if (t.issuer !== human.issuer || t.environment !== human.environment || t.application_id !== human.applicationId ||
      t.client_id !== human.clientId || b.userId !== human.userId || b.sessionId !== human.sessionId ||
      b.generations.some((g, i) => g !== human.generations[i]) || t.expires_at.getTime() <= Date.now()) return fail(404, "resource_not_available");
  }
  async function association(s: EligibilitySnapshot, tokenId?: string) {
    const h = s.principal;
    const row = (await s.tx.query(`SELECT i.*,m.subject FROM identity_access_issuances i
      JOIN identity_subject_mappings m ON m.id=i.mapping_id AND m.revoked_at IS NULL AND m.namespace='provider_access_subject'
      WHERE i.issuer=$1 AND i.client_id=$2 AND i.session_id=$3 AND m.user_id=$4
        AND ($5::text IS NULL OR i.token_id=$5) AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp()
        AND 'nexus:access:evaluate'=ANY(i.scopes) ORDER BY i.issued_at DESC,i.token_id LIMIT 1`,
      [p.issuer, h.clientId, h.sessionId, h.userId, tokenId ?? null])).rows[0];
    if (!row) return fail(403, "human_authorization_required");
    const reference = { issuer: p.issuer, clientId: h.clientId, audience: p.audience, environment: p.environment,
      tokenId: row.token_id as string, sessionId: h.sessionId, subject: row.subject as string };
    const current = await registry.readCurrentStateInTransaction(s.tx, reference, row.token_digest);
    const code = await s.tx.query(`SELECT 1 FROM identity_consumer_codes WHERE issuer=$1 AND client_id=$2 AND token_id=$3 AND token_digest=$4 AND session_id=$5`,
      [p.issuer, h.clientId, row.token_id, row.token_digest, h.sessionId]);
    if (!current || current.applicationId !== h.applicationId || current.subjectMappings[0]?.userId !== h.userId || code.rowCount !== 1) return fail(403, "human_authorization_required");
    return row as { token_id: string; subject: string; sender_key: string; signing_key: string; expires_at: Date };
  }
  async function audit(s: EligibilitySnapshot, id: string, action: string, context: unknown) {
    await s.tx.query("INSERT INTO identity_admission_audit(id,transaction_id,action,context_digest,at) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, action, digest(JSON.stringify(context)), s.at]);
  }
  async function consumeBudget(tx: PoolClient, kind: string, ...parts: string[]) {
    const key = digest(JSON.stringify(["admission", kind, ...parts]));
    const row = (await tx.query(`INSERT INTO identity_admission_budgets(key,window_start,attempts) VALUES($1,clock_timestamp(),1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN identity_admission_budgets.window_start<clock_timestamp()-interval '1 minute' THEN 1 ELSE identity_admission_budgets.attempts+1 END,
      window_start=CASE WHEN identity_admission_budgets.window_start<clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE identity_admission_budgets.window_start END RETURNING attempts`, [key])).rows[0];
    // Return a committed sentinel for rate denial; do not roll back the counter.
    return row.attempts <= (kind === "redemption-client" ? 120 : 60);
  }
  async function browser<T>(headers: Headers, initial: Transaction, work: (s: Parameters<Parameters<Facade["within"]>[1]>[0], t: Transaction) => Promise<T>) {
    const context = await identity.verify(headers, initial.client_id);
    if (!await identity.run(context, (tx, principal) => consumeBudget(tx, "browser", principal.userId, principal.clientId, initial.id))) return fail(429, "rate_limited");
    return nexus.within(context, async s => {
      const t = (await s.tx.query('SELECT *,version::text FROM identity_admission_transactions WHERE id=$1 FOR UPDATE', [initial.id])).rows[0] as Transaction;
      if (!t) return fail(404, "resource_not_available");
      owns(s, t); await target(s,t); await association(s, t.token_id);
      return work(s, t);
    });
  }
  return {
    async start(headers: Headers, input: unknown) {
      return guarded(async () => {
        const a = authorization(input); ready(a.clientId);
        const context = await identity.verify(headers, a.clientId);
        const result = await nexus.within(context, async s => {
          const c = await client(s.tx, a.clientId);
          if (!Array.isArray(c.redirectUris) || !c.redirectUris.includes(a.redirect)) return fail();
          if (!await consumeBudget(s.tx, "start", s.principal.userId, s.principal.clientId)) return { limited: true as const };
          // A write conflict on this shared authority aborts a stale snapshot;
          // counts cannot race past the cap under REPEATABLE READ.
          await s.tx.query('UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1', [p.issuer]);
          const quota = (await s.tx.query(`SELECT count(*)::int AS total,
            count(*) FILTER(WHERE binding->>'userId'=$1)::int AS personal,
            count(*) FILTER(WHERE client_id=$2)::int AS per_client
            FROM identity_admission_transactions WHERE expires_at>clock_timestamp() AND consumed_at IS NULL`, [s.principal.userId, a.clientId])).rows[0];
          if (quota.total >= 10000 || quota.personal >= 32 || quota.per_client >= 1000) return { limited: true as const };
          const fixed=c.admission_mode==='domain'?(options.domainEnabled?.()?await resolveDomain(s.tx,new URL(a.redirect).origin,s.principal.applicationId,s.principal.environment):fail(403,'domain_not_available')):null;
          // A registered domain client has exactly one target. Never enumerate alternatives.
          if(fixed&&!await s.effective(fixed.tenantId))return fail(403,'access_denied');
          const human = await association(s), csrf = opaque(), id = randomUUID();
          const expiresAt = new Date(Math.min(s.at.getTime() + 300000, human.expires_at.getTime(), s.principal.sessionExpiresAt));
          if (expiresAt.getTime() <= Date.now()) return fail(403, "human_authorization_required");
          const binding: Transaction["binding"] = { userId: s.principal.userId, sessionId: s.principal.sessionId, clientId: a.clientId,
            applicationId: s.principal.applicationId, generations: [...s.principal.generations], expiresAt: expiresAt.getTime(),
            clientLinkId:c.link_id,clientModeRevision:c.mode_revision,...(fixed?{domain:evidence(fixed)}:{}) };
          await s.tx.query(`INSERT INTO identity_admission_transactions(id,issuer,client_id,application_id,environment,binding,token_id,redirect_uri,state,nonce,challenge,csrf_digest,created_at,expires_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [id, p.issuer, a.clientId, c.application_id, p.environment, JSON.stringify(binding), human.token_id, a.redirect, a.state, a.nonce, a.challenge, digest(csrf), s.at, expiresAt]);
          await audit(s, id, "start", { applicationId: c.application_id });
          return { limited: false as const, transactionId: id, csrf };
        });
        if (result.limited) return fail(429, "rate_limited");
        return result;
      });
    },
    async choices(headers: Headers, id: string, cursor?: string) {
      return guarded(async () => {
        const initial = await load(id);
        return browser(headers, initial, async (s, t) => {
          let after: string | null = null;
          if (cursor) {
            text(cursor, 43, 43);
            const page = (await s.tx.query(`SELECT after_id FROM identity_admission_cursors WHERE digest=$1 AND transaction_id=$2 AND policy_revision=$3 AND expires_at>clock_timestamp()`, [digest(cursor), id, s.metadata.policyRevision])).rows[0];
            if (!page) return fail(); after = page.after_id;
          }
          const fixed=await target(s,t);
          if(fixed&&cursor)return fail();
          const selected=fixed?await s.effective(fixed.tenantId):null;
          if(fixed&&!selected)return fail(403,'access_denied');
          const rows = fixed?[selected!]:await s.list(after, 101);
          let next: string | null = null;
          if (rows.length > 100) {
            rows.pop(); next = opaque();
            await s.tx.query('INSERT INTO identity_admission_cursors(digest,transaction_id,policy_revision,after_id,expires_at) VALUES($1,$2,$3,$4,$5)',
              [digest(next), id, s.metadata.policyRevision, rows[rows.length - 1].tenant.id, t.expires_at]);
          }
          await audit(s, id, "choices", { count: rows.length });
          return { transactionId: id, version: t.version, applicationId: s.principal.applicationId, expiresAt: t.expires_at.toISOString(),
            tenants: rows.map(row => ({ tenantId: row.tenant.id, displayName: row.tenant.name })), cursor: next,
            ...(fixed?{mode:"domain" as const,domainBinding:evidence(fixed)}:{}) };
        });
      });
    },
    async confirm(headers: Headers, id: string, csrf: string, input: unknown) {
      return guarded(async () => {
        const chosen = selection(input), initial = await load(id);
        return browser(headers, initial, async (s, t) => {
          if (digest(text(csrf, 43, 43)) !== t.csrf_digest) return fail(403, "invalid_csrf");
          if (t.code_digest || t.consumed_at || t.version !== chosen.expectedVersion) return fail(409, "transaction_conflict");
          const fixed=await target(s,t);
          if(fixed&&chosen.tenantId!==fixed.tenantId)return fail(403,'access_denied');
          const eligible = await s.effective(chosen.tenantId);
          if (!eligible) return fail(403, "access_denied");
          const code = opaque(), expiry = new Date(Math.min(s.at.getTime() + 60000, t.expires_at.getTime()));
          await s.tx.query(`UPDATE identity_admission_transactions SET tenant_id=$2,code_digest=$3,code_expires_at=$4,policy_versions=$5,version=version+1 WHERE id=$1`, [id, chosen.tenantId, digest(code), expiry, JSON.stringify(eligible.versions)]);
          await audit(s, id, "select", { tenantId: chosen.tenantId, versions: eligible.versions });
          const redirect = new URL(t.redirect_uri); redirect.searchParams.set("code", code); redirect.searchParams.set("state", t.state);
          return { redirect: redirect.href };
        });
      });
    },
    async redeem(request: Request, input: unknown) {
      return guarded(async () => {
        const r = redemption(input); ready(r.clientId);
        if (request.method !== "POST" || request.url !== endpoint || request.headers.has("cookie") || request.headers.has("authorization") || request.headers.has("origin")) return fail(401, "invalid_client");
        const registration = await registry.transaction(tx => client(tx, r.clientId));
        let jwks;
        try { jwks = validatePublicClientJwks(typeof registration.jwks === "string" ? JSON.parse(registration.jwks) : registration.jwks); }
        catch { return fail(401, "invalid_client"); }
        if (!jwks.valid) return fail(401, "invalid_client");
        const reservations = await options.reservations();
        let assertion;
        try {
          assertion = (await jwtVerify(r.assertion, createLocalJWKSet(jwks.jwks), { issuer: r.clientId, subject: r.clientId,
            audience: endpoint, algorithms: ["ES256"], clockTolerance: 0, requiredClaims: ["iss", "sub", "aud", "iat", "exp", "jti"] })).payload;
          const now = Math.floor(Date.now() / 1000);
          if (assertion.aud !== endpoint || !Number.isSafeInteger(assertion.iat) || !Number.isSafeInteger(assertion.exp) ||
            assertion.iat! > now || assertion.exp! <= now || assertion.exp! - assertion.iat! > 60 || assertion.exp! <= assertion.iat! || typeof assertion.jti !== "string" || assertion.jti.length < 1 || assertion.jti.length > 2048) return fail(401, "invalid_client");
        } catch { return fail(401, "invalid_client"); }
        if (!await reservations.reserveVerificationValue({ identifier: "is-admission-assertion:" + digest(JSON.stringify([p.issuer, r.clientId, assertion.jti])),
          value: "used", expiresAt: new Date(assertion.exp! * 1000 + 5000) })) return fail(401, "invalid_client");
        if (!await registry.transaction(tx => consumeBudget(tx, "redemption-client", r.clientId))) return fail(429, "rate_limited");
        let proof;
        try {
          proof = await verifyDpopProof({ proofJwt: request.headers.get("dpop") ?? "", method: "POST", url: endpoint,
            requireAth: false, signingAlgorithms: ["ES256"], proofMaxAgeSeconds: 60, replayStore: createDpopReplayStore(reservations) });
          if (proof.ath !== undefined) return fail(401, "invalid_dpop_proof");
        } catch { return fail(401, "invalid_dpop_proof"); }
        const nonceReceipt = await nonce.validate({ proof: request.headers.get("dpop")!, keyThumbprint: proof.jkt, resource: endpoint, verifiedProof: proof });
        if (!await registry.transaction(tx => consumeBudget(tx, "redemptions", r.clientId, proof.jkt))) return fail(429, "rate_limited");
        const initial = await load(r.code, true);
        if (initial.client_id !== r.clientId || initial.redirect_uri !== r.redirect) return fail(400, "invalid_grant");
        const context = identity.resumeStored(initial.binding);
        const result = await nexus.within(context, async s => {
          const t = (await s.tx.query('SELECT *,version::text FROM identity_admission_transactions WHERE id=$1 FOR UPDATE', [initial.id])).rows[0] as Transaction;
          owns(s, t); await target(s,t);
          if (t.consumed_at || t.code_digest !== digest(r.code) || !t.code_expires_at || t.code_expires_at.getTime() <= Date.now() ||
            await generateCodeChallenge(r.verifier) !== t.challenge) return fail(400, "invalid_grant");
          const human = await association(s, t.token_id);
          if (human.sender_key !== proof.jkt || !nonceReceipt || nonceReceipt.expiresAt <= Date.now()) return fail(401, "invalid_dpop_proof");
          const effective = t.tenant_id ? await s.effective(t.tenant_id) : null;
          if (!effective || !t.policy_versions || Object.entries(effective.versions).some(([key,value]) => t.policy_versions![key] !== value)) return fail(403, "access_denied");
          if (assertion.exp! * 1000 <= Date.now()) return fail(401, "invalid_client");
          const now = Math.floor(s.at.getTime() / 1000), exp = Math.floor(Math.min(s.at.getTime() + 300000, human.expires_at.getTime(), s.principal.sessionExpiresAt, t.binding.domain?t.expires_at.getTime():Infinity) / 1000);
          if (exp <= now) return fail(400, "invalid_grant");
          const id = randomUUID();
          const claims = { iss: p.issuer, sub: human.subject, aud: r.clientId, iat: now, exp, jti: id, nonce: t.nonce,
            tenant_id: t.tenant_id, application_id: s.principal.applicationId, client_id: r.clientId, environment: p.environment,
            admission_id: id, auth_time: s.principal.authenticatedAt, cnf: { jkt: proof.jkt }, generation: "1",
            ...(t.binding.domain?{domain_binding:t.binding.domain}:{}) };
          const token = await options.sign(claims, human.signing_key);
          // Verify provider output before activating a receipt or consuming code.
          await verifyAdmissionContext(token, options.jwks, { issuer: p.issuer, clientId: r.clientId, applicationId: s.principal.applicationId,
            environment: p.environment, subject: human.subject, nonce: t.nonce, tenantId: t.tenant_id!, keyThumbprint: proof.jkt,...(t.binding.domain?{domain:t.binding.domain}:{}) });
          await s.tx.query(`INSERT INTO identity_admissions(id,transaction_id,token_digest,signing_key,issued_at,expires_at) VALUES($1,$2,$3,$4,to_timestamp($5),to_timestamp($6))`,
            [id, t.id, digest(token), human.signing_key, now, exp]);
          await s.tx.query('UPDATE identity_admission_transactions SET consumed_at=clock_timestamp(),version=version+1 WHERE id=$1', [t.id]);
          await audit(s, t.id, "issue", { admissionId: id, tenantId: t.tenant_id, policyRevision: s.metadata.policyRevision });
          return { admission_context: token, expires_in: exp - now, profile: t.binding.domain?"is-domain-admission-1" as const:"is-admission-1" as const };
        });
        return result;
      });
    },
    async validate(token: string, expected: AdmissionExpectation) {
      return guarded(async () => {
        let claims;
        try { claims = await verifyAdmissionContext(token, options.jwks, expected); } catch { return fail(401, "invalid_admission"); }
        const stored = await registry.transaction(async tx => (await tx.query(`SELECT t.*,t.version::text,a.revoked_at,a.expires_at AS admission_expiry
          FROM identity_admissions a JOIN identity_admission_transactions t ON t.id=a.transaction_id
          WHERE a.id=$1 AND a.token_digest=$2 AND a.generation::text=$3`, [claims.admission_id, digest(token), claims.generation])).rows[0]);
        if (!stored || stored.revoked_at || stored.admission_expiry.getTime() <= Date.now()) return fail(401, "invalid_admission");
        const context = identity.resumeStored(stored.binding);
        return nexus.within(context, async s => {
          owns(s, stored); await target(s,stored); await association(s, stored.token_id);
          const current = (await s.tx.query('SELECT 1 FROM identity_admissions WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()', [claims.admission_id])).rowCount;
          const effective = stored.tenant_id ? await s.effective(stored.tenant_id) : null;
          if (current !== 1 || claims.tenant_id !== stored.tenant_id || !effective || !stored.policy_versions ||
            Object.entries(effective.versions).some(([key,value]) => stored.policy_versions[key] !== value)) return fail(401, "invalid_admission");
          await audit(s, stored.id, "validate", { admissionId: claims.admission_id });
          return { active: true as const, claims, metadata: s.metadata };
        });
      });
    },
    /** New versioned decision composition: original DPoP resource credential AND
     * receipt, bound to one domain, are rechecked inside the same policy snapshot. */
    async domainDecision(request:Request,input:{admissionContext:string;domainOrigin:string;operation:string},requestId:string){
      return guarded(async()=>{
        if(!options.domainEnabled?.()||!options.consumer)return fail(404,'resource_not_available');
        const requested=domainOrigin(input.domainOrigin);
        return options.consumer.run(request,['nexus:access:evaluate'],async(tx,human,at,deadline)=>{
          // Exact digest is the lookup key; no unverified receipt claim chooses authority.
          const row=(await tx.query(`SELECT t.*,t.version::text,a.id AS admission_id,a.revoked_at,a.generation::text AS admission_generation,a.expires_at AS admission_expiry
            FROM identity_admissions a JOIN identity_admission_transactions t ON t.id=a.transaction_id
            WHERE a.token_digest=$1`,[digest(input.admissionContext)])).rows[0];
          if(!row||row.revoked_at||row.admission_expiry.getTime()<=Date.now()||!row.binding.domain||
            row.token_id!==human.tokenId||row.client_id!==human.clientId||row.application_id!==human.applicationId||
            row.environment!==human.environment||row.issuer!==human.issuer||row.binding.userId!==human.userId||row.binding.sessionId!==human.sessionId)
            return fail(401,'invalid_admission');
          const principal=await identity.readStored(tx,row.binding);
          const s={tx,principal,at,deadline,metadata:{}} as EligibilitySnapshot;
          owns(s,row);const fixed=await target(s,row);
          if(!fixed||fixed.origin!==requested.origin)return fail(403,'domain_not_available');
          const humanGrant=await association(s,row.token_id);
          if(humanGrant.sender_key!==human.keyThumbprint||humanGrant.subject!==human.subject)return fail(401,'invalid_admission');
          const claims=await verifyAdmissionContext(input.admissionContext,options.jwks,{issuer:p.issuer,clientId:human.clientId,
            applicationId:human.applicationId,environment:human.environment,subject:human.subject,nonce:row.nonce,
            tenantId:fixed.tenantId,keyThumbprint:human.keyThumbprint,domain:evidence(fixed)});
          if(claims.admission_id!==row.admission_id||claims.generation!==row.admission_generation)return fail(401,'invalid_admission');
          const budget=await consumeBudget(tx,'domain-decisions',human.clientId,human.userId);
          if(!budget)return {failure:'rate_limited' as const};
          const validUntil=new Date(Math.min(deadline.getTime(),row.admission_expiry.getTime(),row.expires_at.getTime()));
          return evaluateDomainDecision(tx,human,fixed,row.policy_versions,{admissionId:row.admission_id,operation:input.operation,requestId,at,deadline:validUntil});
        }).then(value=>{if('failure' in value)return fail(429,'rate_limited');return value;});
      });
    },
    async revoke(headers: Headers, admissionId: string) {
      return guarded(async () => {
        if (!uuid(admissionId)) return fail();
        const transactionId = await registry.transaction(async tx => (await tx.query('SELECT transaction_id FROM identity_admissions WHERE id=$1', [admissionId])).rows[0]?.transaction_id);
        if (!transactionId) return fail(404, "resource_not_available");
        const initial = await load(transactionId);
        // Owner-only internal operation; deliberately not a new public admin API.
        const context = await identity.verify(headers, initial.client_id);
        return nexus.within(context, async s => {
          owns(s, initial);
          await s.tx.query('UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1', [p.issuer]);
          const row = await s.tx.query('UPDATE identity_admissions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),generation=CASE WHEN revoked_at IS NULL THEN generation+1 ELSE generation END WHERE id=$1 RETURNING id', [admissionId]);
          if (row.rowCount !== 1) return fail(404, "resource_not_available");
          // Reviewed legacy transition: revoke its associated resource issuance.
          await s.tx.query('UPDATE identity_access_issuances SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE issuer=$1 AND token_id=$2', [p.issuer, initial.token_id]);
          await audit(s, initial.id, "revoke", { admissionId });
          return { revoked: true as const };
        });
      });
    },
  };
}
import { DpopNonceRequired } from "../dpop-nonce.ts";
