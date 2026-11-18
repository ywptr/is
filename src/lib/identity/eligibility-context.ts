import { IdentityOperationError } from "./operation-error.ts";
/** Identity-owned, process-local capability for internal IS -> Nexus reads.
 * Only the configured session verifier can establish the person. Requested client
 * IDs are resolved through current trusted registration, never accepted as app IDs.
 */
import type { PoolClient } from "pg";
import { LifecycleError } from "./credential-registry.ts";
import type { CredentialPolicy } from "./access-credentials.ts";

declare const verifiedContext: unique symbol;
export interface VerifiedEligibilityContext { readonly [verifiedContext]: true }
export class EligibilityIdentityError extends Error {
  readonly code: "invalid_context" | "identity_unavailable";
  constructor(code: "invalid_context" | "identity_unavailable") { super(code); this.code = code; }
}
export interface EligibilityIdentityPrincipal {
  readonly userId: string;
  readonly clientId: string;
  readonly applicationId: string;
  readonly issuer: string;
  readonly audience: string;
  readonly environment: string;
  readonly identityRevision: string;
  readonly sessionId: string;
  readonly sessionExpiresAt: number;
  readonly authenticatedAt: number;
  readonly generations: readonly string[];
}
export interface EligibilityIdentity {
  verify(headers: Headers, registeredClientId: string): Promise<VerifiedEligibilityContext>;
  /** Identity-owned persisted lineage only; never accept this from HTTP input. */
  resumeStored(binding: StoredEligibilityBinding): VerifiedEligibilityContext;
  /** Trusted same-transaction revalidation; never an HTTP identity input. */
  readStored(tx: PoolClient, binding: StoredEligibilityBinding): Promise<EligibilityIdentityPrincipal>;
  run<T>(context: VerifiedEligibilityContext, work: (tx: PoolClient, principal: EligibilityIdentityPrincipal, at: Date, deadline: Date) => Promise<T>): Promise<T>;
}
export interface StoredEligibilityBinding {
  userId: string; sessionId: string; clientId: string; applicationId: string;
  expiresAt: number; generations: readonly string[];
}
export interface EligibilityIdentityOptions {
  policy: CredentialPolicy;
  enabled: () => boolean;
  // Trusted composition dependency, never a request-supplied callback or identity.
  authenticate: (headers: Headers) => Promise<{ userId: string; sessionId: string } | null>;
  // The existing Identity registry owns bounded REPEATABLE READ + commit/rollback.
  transaction: <T>(work: (tx: PoolClient) => Promise<T>) => Promise<T>;
}
const present = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 2048;
function invalid(): never { throw new LifecycleError("invalid_token"); }
export function createEligibilityIdentity(options: EligibilityIdentityOptions): EligibilityIdentity {
  const contexts = new WeakMap<VerifiedEligibilityContext, StoredEligibilityBinding>();
  const policy = Object.freeze({ ...options.policy });
  const unavailable = () => { if (!options.enabled()) throw new EligibilityIdentityError("identity_unavailable"); };
  async function read(tx: PoolClient, session: Pick<StoredEligibilityBinding, "sessionId" | "userId" | "clientId">) {
    const result = await tx.query(`SELECT b.application_id, s."expiresAt" AS expires_at, s."createdAt" AS authenticated_at, z.revision::text AS revision,
      ARRAY[COALESCE(ce.generation,1)::text,COALESCE(se.generation,1)::text,COALESCE(ue.generation,1)::text] AS generations
      FROM identity_credential_bindings b
      JOIN identity_credential_authorities z ON z.issuer=b.issuer
      JOIN "oauthClient" c ON c."clientId"=b.client_id AND NOT c.disabled AND c."tokenEndpointAuthMethod"='private_key_jwt'
      JOIN "oauthResource" r ON r.identifier=b.audience AND NOT r.disabled
      JOIN "oauthClientResource" cr ON cr."clientId"=b.client_id AND cr."resourceId"=b.audience
      JOIN nexus_application_oauth_clients l ON l.oauth_client_id=b.client_id AND l.application_id=b.application_id
        AND l.environment=b.environment AND l.purpose='nexus_consumer'
      JOIN nexus_applications a ON a.id=b.application_id AND a.status='active'
      JOIN "session" s ON s.id=$5 AND s."userId"=$6 AND s."expiresAt">clock_timestamp()
      JOIN "user" u ON u.id=s."userId" AND u."emailVerified"
      JOIN is_admission_emails permit ON permit.email=lower(trim(u.email))
      LEFT JOIN identity_credential_epochs ce ON ce.issuer=b.issuer AND ce.kind='client' AND ce.subject_key=b.client_id
      LEFT JOIN identity_credential_epochs se ON se.issuer=b.issuer AND se.kind='session' AND se.subject_key=s.id
      LEFT JOIN identity_credential_epochs ue ON ue.issuer=b.issuer AND ue.kind='user' AND ue.subject_key=u.id
      WHERE b.issuer=$1 AND b.client_id=$2 AND b.audience=$3 AND b.environment=$4 AND b.enabled
        AND COALESCE(ce.enabled,true) AND COALESCE(se.enabled,true) AND COALESCE(ue.enabled,true)`,
      [policy.issuer, session.clientId, policy.audience, policy.environment, session.sessionId, session.userId]);
    if (result.rowCount !== 1) invalid();
    return result.rows[0] as { application_id: string; expires_at: Date; authenticated_at: Date; revision: string; generations: string[] };
  }
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    unavailable();
    try { return await work(); }
    catch (error) {
      if (error instanceof EligibilityIdentityError || error instanceof IdentityOperationError) throw error;
      if (error instanceof LifecycleError && error.code === "invalid_token") throw new EligibilityIdentityError("invalid_context");
      throw new EligibilityIdentityError("identity_unavailable");
    }
  }
  return {
    async readStored(tx,binding) {
      return guarded(async()=>{
        if(!binding || binding.expiresAt<=Date.now() || !Array.isArray(binding.generations) || binding.generations.length!==3)invalid();
        const row=await read(tx,binding);
        if(row.application_id!==binding.applicationId || row.generations.some((g,i)=>g!==binding.generations[i]))invalid();
        return Object.freeze({userId:binding.userId,clientId:binding.clientId,applicationId:row.application_id,...policy,
          identityRevision:row.revision,sessionId:binding.sessionId,sessionExpiresAt:row.expires_at.getTime(),
          authenticatedAt:Math.floor(row.authenticated_at.getTime()/1000),generations:Object.freeze([...row.generations])});
      });
    },
    resumeStored(binding) {
      // The service loads this immutable lineage from its own durable transaction.
      // Revalidation remains mandatory in run(); this never authenticates a browser.
      if (!binding || !present(binding.userId) || !present(binding.sessionId) || !present(binding.clientId) ||
        !present(binding.applicationId) || !Number.isFinite(binding.expiresAt) || !Array.isArray(binding.generations) ||
        binding.generations.length !== 3 || binding.generations.some(g => !/^[1-9][0-9]*$/.test(g))) throw new EligibilityIdentityError("invalid_context");
      const context = Object.freeze({}) as VerifiedEligibilityContext;
      contexts.set(context, { ...binding, generations: Object.freeze([...binding.generations]) });
      return context;
    },
    async verify(headers, registeredClientId) {
      return guarded(async () => {
        if (!present(registeredClientId)) invalid();
        const authenticated = await options.authenticate(headers);
        if (!authenticated || !present(authenticated.userId) || !present(authenticated.sessionId)) invalid();
        const session = { ...authenticated, clientId: registeredClientId };
        const binding = await options.transaction(async tx => {
          const row = await read(tx, session);
          return { ...session, applicationId: row.application_id, generations: row.generations,
            expiresAt: Math.min(row.expires_at.getTime(), Date.now() + 300000) };
        });
        const context = Object.freeze({}) as VerifiedEligibilityContext;
        contexts.set(context, binding);
        return context;
      });
    },
    async run(context, work) {
      return guarded(async () => {
        const binding = contexts.get(context);
        if (!binding || binding.expiresAt <= Date.now()) invalid();
        let snapshotAt = 0, expiresAt = 0;
        const value = await options.transaction(async tx => {
          const at = (await tx.query("SELECT clock_timestamp() AS at")).rows[0].at as Date;
          snapshotAt = at.getTime();
          const row = await read(tx, binding);
          if (row.application_id !== binding.applicationId || row.generations.some((g, i) => g !== binding.generations[i])) invalid();
          const deadline = new Date(Math.min(at.getTime() + 5000, binding.expiresAt, row.expires_at.getTime()));
          expiresAt = deadline.getTime();
          const principal = Object.freeze({ userId: binding.userId, clientId: binding.clientId,
            applicationId: row.application_id, ...policy, identityRevision: row.revision,
            sessionId: binding.sessionId, sessionExpiresAt: row.expires_at.getTime(),
            authenticatedAt: Math.floor(row.authenticated_at.getTime() / 1000), generations: Object.freeze([...row.generations]) });
          const result = await work(tx, principal, at, deadline);
          if (Date.now() - snapshotAt >= 2000 || Date.now() >= expiresAt) throw new EligibilityIdentityError("identity_unavailable");
          return result;
        });
        unavailable();
        if (Date.now() - snapshotAt >= 2000 || Date.now() >= expiresAt) throw new EligibilityIdentityError("identity_unavailable");
        return value;
      });
    },
  };
}
