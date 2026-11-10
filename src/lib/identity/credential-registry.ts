import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CredentialPolicy, CredentialReference, HumanState, NonceReceipt } from "./access-credentials.ts";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export class LifecycleError extends Error {
  readonly code: "invalid_token" | "identity_unavailable" | "forbidden" | "unsupported_lifecycle";
  constructor(code: LifecycleError["code"]) { super(code); this.code=code; }
}
export interface LifecycleActor { actorId: string; requestId: string; reason: string }
export interface GrantEvidence {
  userId: string; clientId: string; sessionId: string; scopes: readonly string[];
  grantId?: string; pairwiseSubject?: string; authorizationCodeDigest?: string;
}
export interface Issuance {
  reference: CredentialReference; tokenDigest: string; senderKey: string; signingKey: string;
  scopes: readonly string[]; issuedAt: number; expiresAt: number;
}
export type EpochKind = "client" | "session" | "user" | "sender_key" | "signing_key";
export interface RegistryOptions {
  enabled: boolean;
  policy: CredentialPolicy;
  // Internal administration authority, rechecked inside the write transaction.
  // No HTTP/body principal is accepted by this module; no permissive default.
  validateIssuance?: (tx: PoolClient, issuance: Issuance, grant: GrantEvidence) => Promise<void>;
  authorize: (tx: PoolClient, actor: LifecycleActor, action: string, target: string) => Promise<boolean>;
}
const present = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 2048;
const epochKeys = (i: Issuance, userId: string): [EpochKind, string][] => [
  ["client", i.reference.clientId], ["session", i.reference.sessionId], ["user", userId],
  ["sender_key", i.senderKey], ["signing_key", i.signingKey],
];

export function createCredentialRegistry(pool: Pool, options: RegistryOptions) {
  const { policy } = options;
  for (const value of [policy.issuer, policy.audience]) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.href !== value || url.username || url.password || url.search || url.hash) throw new Error("Invalid Identity policy");
  }
  if (!["development", "staging", "production"].includes(policy.environment)) throw new Error("Invalid Identity environment");
  function enabled() { if (!options.enabled) throw new LifecycleError("identity_unavailable"); }
  function samePolicy(r: CredentialReference) {
    if (r.issuer !== policy.issuer || r.audience !== policy.audience || r.environment !== policy.environment) throw new LifecycleError("invalid_token");
  }
  async function transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    enabled();
    let tx: PoolClient;
    try { tx = await pool.connect(); } catch { throw new LifecycleError("identity_unavailable"); }
    const start = Date.now();
    try {
      await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await tx.query("SET LOCAL statement_timeout='1500ms'; SET LOCAL lock_timeout='1000ms'; SET LOCAL idle_in_transaction_session_timeout='2000ms'");
      const result = await fn(tx);
      if (Date.now() - start >= 2000) throw new LifecycleError("identity_unavailable");
      await tx.query("COMMIT");
      return result;
    } catch (error) {
      await tx.query("ROLLBACK").catch(() => undefined);
      if (error instanceof LifecycleError) throw error;
      throw new LifecycleError("identity_unavailable");
    } finally { tx.release(); }
  }
  async function lock(tx: PoolClient, write = false) {
    const result = write
      ? await tx.query("UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1 RETURNING issuer", [policy.issuer])
      : await tx.query("SELECT issuer FROM identity_credential_authorities WHERE issuer=$1 FOR SHARE", [policy.issuer]);
    if (result.rowCount !== 1) throw new LifecycleError("identity_unavailable");
  }
  async function event(tx: PoolClient, actor: LifecycleActor, action: string, target: string) {
    if (!present(actor.actorId) || !actor.reason?.trim() || actor.reason.length > 512 || !/^[0-9a-f-]{36}$/i.test(actor.requestId)) throw new LifecycleError("forbidden");
    const hash = digest(JSON.stringify([action, target, actor.actorId, actor.reason]));
    const old = await tx.query("SELECT target_digest FROM identity_credential_events WHERE issuer=$1 AND request_id=$2", [policy.issuer, actor.requestId]);
    if (old.rowCount) {
      if (old.rows[0].target_digest !== hash) throw new LifecycleError("forbidden");
      return false;
    }
    await tx.query(`INSERT INTO identity_credential_events(issuer,request_id,actor_id,action,target_digest,reason)
      VALUES($1,$2,$3,$4,$5,$6)`, [policy.issuer, actor.requestId, actor.actorId, action, hash, actor.reason]);
    return true;
  }
  async function authorize(tx: PoolClient, actor: LifecycleActor, action: string, target: string) {
    if (!await options.authorize(tx, actor, action, target)) throw new LifecycleError("forbidden");
  }
  async function mapping(tx: PoolClient, grant: GrantEvidence, subject: string, namespace: string, evidence: string) {
    await tx.query(`INSERT INTO identity_subject_mappings(issuer,client_id,namespace,subject,user_id,evidence_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(issuer,client_id,namespace,subject) DO NOTHING`,
      [policy.issuer, grant.clientId, namespace, subject, grant.userId, evidence]);
    const found = await tx.query(`SELECT id,user_id,revoked_at FROM identity_subject_mappings
      WHERE issuer=$1 AND client_id=$2 AND namespace=$3 AND subject=$4`, [policy.issuer, grant.clientId, namespace, subject]);
    if (found.rowCount !== 1 || found.rows[0].user_id !== grant.userId || found.rows[0].revoked_at) throw new LifecycleError("invalid_token");
    return found.rows[0].id as string;
  }
  // Only the provider integration may supply grant evidence, after native validation.
  // This internal method is not an arbitrary JWT enrollment or user lookup API.
  async function registerIssuance(i: Issuance, grant: GrantEvidence) {
    samePolicy(i.reference);
    const r = i.reference;
    if (r.subject !== grant.userId || r.clientId !== grant.clientId || r.sessionId !== grant.sessionId ||
      ![r.subject,r.clientId,r.sessionId,r.tokenId,i.senderKey,i.signingKey].every(present) ||
      !/^[0-9a-f]{64}$/.test(i.tokenDigest) || !Number.isSafeInteger(i.issuedAt) || !Number.isSafeInteger(i.expiresAt) ||
      i.expiresAt <= i.issuedAt || i.expiresAt - i.issuedAt > 300 || i.expiresAt <= Date.now()/1000 ||
      i.scopes.length === 0 || i.scopes.some(s => !grant.scopes.includes(s) || ["openid","profile","email","offline_access"].includes(s))) throw new LifecycleError("invalid_token");
    return transaction(async tx => {
      await lock(tx, true);
      const live = await tx.query(`SELECT b.scopes FROM identity_credential_bindings b
        JOIN "oauthClient" c ON c."clientId"=b.client_id AND NOT c.disabled
        JOIN "oauthResource" z ON z.identifier=b.audience AND NOT z.disabled
        JOIN "oauthClientResource" cr ON cr."clientId"=b.client_id AND cr."resourceId"=b.audience
        JOIN nexus_application_oauth_clients link ON link.oauth_client_id=b.client_id AND link.application_id=b.application_id AND link.environment=b.environment
        JOIN "session" s ON s.id=$5 AND s."userId"=$6 AND s."expiresAt">clock_timestamp()
        JOIN "user" u ON u.id=s."userId"
        JOIN nexus_applications a ON a.id=b.application_id AND a.status='active'
        WHERE b.issuer=$1 AND b.client_id=$2 AND b.audience=$3 AND b.environment=$4 AND b.enabled`,
        [r.issuer,r.clientId,r.audience,r.environment,r.sessionId,grant.userId]);
      if (live.rowCount !== 1 || i.scopes.some(s => !live.rows[0].scopes.includes(s))) throw new LifecycleError("invalid_token");
      await options.validateIssuance?.(tx,i,grant);
      const evidence = randomUUID();
      const mappingId = await mapping(tx, grant, r.subject, "provider_access_subject", evidence);
      if (grant.pairwiseSubject) await mapping(tx, grant, grant.pairwiseSubject, "pairwise", evidence);
      const generations: Record<string, string> = {};
      for (const [kind,key] of epochKeys(i,grant.userId)) {
        await tx.query(`INSERT INTO identity_credential_epochs(issuer,kind,subject_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [r.issuer,kind,key]);
        const row = (await tx.query("SELECT generation,enabled FROM identity_credential_epochs WHERE issuer=$1 AND kind=$2 AND subject_key=$3", [r.issuer,kind,key])).rows[0];
        if (!row?.enabled) throw new LifecycleError("invalid_token");
        generations[kind] = row.generation;
      }
      const inserted = await tx.query(`INSERT INTO identity_access_issuances
        (issuer,token_id,audience,environment,client_id,mapping_id,token_digest,session_id,grant_class,grant_id,sender_key,signing_key,scopes,generations,issued_at,expires_at,retain_until,evidence_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'human_authorization_code',$9,$10,$11,$12,$13,to_timestamp($14),to_timestamp($15),to_timestamp($15)+interval '30 days',$16)
        ON CONFLICT(issuer,token_id) DO NOTHING RETURNING token_id`,
        [r.issuer,r.tokenId,r.audience,r.environment,r.clientId,mappingId,i.tokenDigest,r.sessionId,grant.grantId??null,i.senderKey,i.signingKey,i.scopes,JSON.stringify(generations),i.issuedAt,i.expiresAt,evidence]);
      if (!inserted.rowCount) {
        const previous = (await tx.query("SELECT token_digest,revoked_at FROM identity_access_issuances WHERE issuer=$1 AND token_id=$2", [r.issuer,r.tokenId])).rows[0];
        if (previous?.token_digest !== i.tokenDigest || previous.revoked_at) throw new LifecycleError("invalid_token");
        return;
      }
      await event(tx,{ actorId: "identity-provider",requestId:evidence,reason:"verified authorization code issuance" },"issue",r.tokenId);
    });
  }
  // Caller owns the bounded transaction/snapshot when combining with future Nexus policy.
  async function readCurrentStateInTransaction(tx: PoolClient, reference: CredentialReference, tokenDigest: string, nonce?: NonceReceipt): Promise<HumanState | null> {
    enabled(); samePolicy(reference); await lock(tx);
    if (nonce) {
      const valid=await tx.query(`SELECT digest FROM identity_dpop_nonces WHERE digest=$1 AND issuer=$2 AND audience=$3
        AND environment=$4 AND sender_key=$5 AND expires_at>clock_timestamp()`,
        [nonce.nonceDigest,policy.issuer,policy.audience,policy.environment,nonce.senderKey]);
      if (valid.rowCount!==1) return null;
    }
    const result = await tx.query(`SELECT i.*,m.user_id,m.subject,m.namespace,b.application_id FROM identity_access_issuances i
      JOIN identity_subject_mappings m ON m.id=i.mapping_id AND m.revoked_at IS NULL
      JOIN identity_credential_bindings b ON b.issuer=i.issuer AND b.client_id=i.client_id AND b.audience=i.audience AND b.environment=i.environment
      JOIN "oauthClient" c ON c."clientId"=i.client_id AND NOT c.disabled
      JOIN "oauthResource" z ON z.identifier=i.audience AND NOT z.disabled
      JOIN "oauthClientResource" cr ON cr."clientId"=i.client_id AND cr."resourceId"=i.audience
      JOIN nexus_application_oauth_clients link ON link.oauth_client_id=i.client_id AND link.application_id=b.application_id AND link.environment=i.environment
      JOIN "session" s ON s.id=i.session_id AND s."userId"=m.user_id AND s."expiresAt">clock_timestamp()
      JOIN "user" u ON u.id=m.user_id
      JOIN nexus_applications a ON a.id=b.application_id AND a.status='active'
      WHERE i.issuer=$1 AND i.token_id=$2 AND i.audience=$3 AND i.environment=$4 AND i.client_id=$5
        AND i.session_id=$6 AND m.subject=$7 AND i.token_digest=$8 AND i.revoked_at IS NULL AND b.enabled
        AND i.expires_at>clock_timestamp() AND i.issued_at<=clock_timestamp() AND i.scopes <@ b.scopes
        AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(i.generations) g
          LEFT JOIN identity_credential_epochs e ON e.issuer=i.issuer AND e.kind=g.key AND e.subject_key=CASE g.key
            WHEN 'client' THEN i.client_id WHEN 'session' THEN i.session_id WHEN 'user' THEN m.user_id
            WHEN 'sender_key' THEN i.sender_key WHEN 'signing_key' THEN i.signing_key END
          WHERE e.generation IS NULL OR NOT e.enabled OR e.generation::text<>g.value)`,
      [reference.issuer,reference.tokenId,reference.audience,reference.environment,reference.clientId,reference.sessionId,reference.subject,tokenDigest]);
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    return { active:true, revoked:false,clientActive:true,userActive:true,sessionActive:true,
      grantClass:"human_authorization_code",reference,applicationId:row.application_id,
      subjectMappings:[{issuer:reference.issuer,subject:row.subject,clientId:reference.clientId,namespace:row.namespace,userId:row.user_id}] };
  }
  return {
    policy, transaction, registerIssuance, readCurrentStateInTransaction,
    readCurrentState: (r: CredentialReference, tokenDigest: string, nonce?: NonceReceipt) => transaction(tx => readCurrentStateInTransaction(tx,r,tokenDigest,nonce)),
    async configureBinding(input: {clientId:string;applicationId:string;scopes:string[]}, actor: LifecycleActor) {
      return transaction(async tx => {
        await authorize(tx,actor,"configure_binding",input.clientId);
        await tx.query("INSERT INTO identity_credential_authorities(issuer) VALUES($1) ON CONFLICT DO NOTHING",[policy.issuer]);
        await lock(tx,true);
        if (!await event(tx,actor,"configure_binding",JSON.stringify(input))) return;
        const client = await tx.query(`SELECT c."clientId" FROM "oauthClient" c JOIN nexus_application_oauth_clients l ON l.oauth_client_id=c."clientId"
          WHERE c."clientId"=$1 AND NOT c.disabled AND l.application_id=$2 AND l.environment=$3`,[input.clientId,input.applicationId,policy.environment]);
        if (client.rowCount!==1 || !input.scopes.length || input.scopes.some(s=>!/^nexus:[a-z:]+$/.test(s))) throw new LifecycleError("invalid_token");
        await tx.query(`INSERT INTO identity_credential_bindings(issuer,client_id,audience,environment,application_id,scopes,enabled)
          VALUES($1,$2,$3,$4,$5,$6,true)`,[policy.issuer,input.clientId,policy.audience,policy.environment,input.applicationId,input.scopes]);
      });
    },
    async revokeToken(tokenId: string, actor: LifecycleActor) {
      return transaction(async tx => {
        await lock(tx,true); await authorize(tx,actor,"revoke_token",tokenId);
        if (!await event(tx,actor,"revoke_token",tokenId)) return;
        await tx.query("UPDATE identity_access_issuances SET revoked_at=clock_timestamp() WHERE issuer=$1 AND token_id=$2 AND revoked_at IS NULL",[policy.issuer,tokenId]);
      });
    },
    async invalidate(kind: EpochKind, key: string, actor: LifecycleActor, allowNewCredentials = false) {
      return transaction(async tx => {
        if (!["client","session","user","sender_key","signing_key"].includes(kind) || !present(key)) throw new LifecycleError("forbidden");
        await lock(tx,true); await authorize(tx,actor,"invalidate",`${kind}:${key}`);
        if (!await event(tx,actor,"invalidate",JSON.stringify([kind,key,allowNewCredentials]))) return;
        await tx.query(`INSERT INTO identity_credential_epochs(issuer,kind,subject_key,generation,enabled) VALUES($1,$2,$3,2,$4)
          ON CONFLICT(issuer,kind,subject_key) DO UPDATE SET generation=identity_credential_epochs.generation+1,enabled=EXCLUDED.enabled`,[policy.issuer,kind,key,allowNewCredentials]);
      });
    },
    async suspendUser(): Promise<never> { throw new LifecycleError("unsupported_lifecycle"); },
    async revokeMapping(id: string, actor: LifecycleActor) {
      return transaction(async tx=>{ await lock(tx,true);await authorize(tx,actor,"revoke_mapping",id);
        if (!await event(tx,actor,"revoke_mapping",id)) return;
        await tx.query("UPDATE identity_subject_mappings SET revoked_at=clock_timestamp() WHERE issuer=$1 AND id=$2 AND revoked_at IS NULL",[policy.issuer,id]);
      });
    },
    async resolveSubject(clientId:string,subject:string,namespace:"provider_access_subject"|"pairwise") {
      return transaction(async tx=>{
        await lock(tx);
        const rows=await tx.query(`SELECT m.user_id FROM identity_subject_mappings m JOIN "user" u ON u.id=m.user_id
          WHERE m.issuer=$1 AND m.client_id=$2 AND m.subject=$3 AND m.namespace=$4 AND m.revoked_at IS NULL`,[policy.issuer,clientId,subject,namespace]);
        return rows.rowCount===1 ? rows.rows[0].user_id as string : null;
      });
    },
    async cleanup(actor: LifecycleActor, limit=500) {
      if (!Number.isSafeInteger(limit)||limit<1||limit>1000) throw new LifecycleError("forbidden");
      return transaction(async tx=>{
        await lock(tx,true);await authorize(tx,actor,"cleanup",policy.issuer);
        if (!await event(tx,actor,"cleanup",String(limit))) return;
        await tx.query(`DELETE FROM identity_access_issuances WHERE (issuer,token_id) IN
          (SELECT issuer,token_id FROM identity_access_issuances WHERE issuer=$1 AND retain_until<clock_timestamp()
           ORDER BY retain_until LIMIT $2)`,[policy.issuer,limit]);
        await tx.query(`DELETE FROM identity_dpop_nonces WHERE digest IN (SELECT digest FROM identity_dpop_nonces
          WHERE issuer=$1 AND expires_at<clock_timestamp() ORDER BY expires_at LIMIT $2)`,[policy.issuer,limit]);
        // Epoch tombstones, mappings and audit are deliberately never cleaned here.
      });
    },
  };
}
export type CredentialRegistry = ReturnType<typeof createCredentialRegistry>;
