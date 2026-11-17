import { IdentityOperationError } from "../identity/operation-error.ts";
/** Internal Nexus facade. No HTTP, OAuth issuance, local resource roles or writes
 * to membership/entitlement authority. Each method reauthorizes in one snapshot.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { EligibilityIdentityError } from "../identity/eligibility-context.ts";
import type { EligibilityIdentity, EligibilityIdentityPrincipal, VerifiedEligibilityContext } from "../identity/eligibility-context.ts";
import { readPolicyState, listEffectiveTenants, readEffectiveContext, isOperationAllowed } from "./policy.ts";
import type { EligibleRow } from "./policy.ts";

declare const cursorBrand: unique symbol;
export interface EligibilityCursor { readonly [cursorBrand]: true }
export class EligibilityError extends Error {
  readonly code: "invalid_request" | "invalid_context" | "dependency_unavailable";
  constructor(code: "invalid_request" | "invalid_context" | "dependency_unavailable") { super(code); this.code = code; }
}
export interface EligibilityMetadata {
  evaluatedAt: string; validUntil: string; policyRevision: string; identityRevision: string; consumerGrantVersion: string;
}
export interface EffectiveTenantContext {
  tenant: { id: string; key: string; name: string; status: "active" };
  membership: { role: EligibleRow["role"]; status: "active"; version: string };
  entitlement: { enabled: true; effective: true; version: string };
  versions: { tenant: string; membership: string; application: string; entitlement: string };
}
export interface EligibilitySnapshot {
  tx: PoolClient; principal: EligibilityIdentityPrincipal; at: Date; deadline: Date; metadata: EligibilityMetadata;
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
function version(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) throw new Error("Policy revision unavailable");
  return value;
}
function effective(row: EligibleRow): EffectiveTenantContext {
  if (!uuid(row.id) || !["owner", "admin", "member"].includes(row.role)) throw new Error("Policy state unavailable");
  return {
    tenant: { id: row.id, key: row.tenant_key, name: row.name, status: "active" },
    membership: { role: row.role, status: "active", version: version(row.membership_version) },
    entitlement: { enabled: true, effective: true, version: version(row.entitlement_version) },
    versions: { tenant: version(row.tenant_version), membership: version(row.membership_version),
      application: version(row.application_version), entitlement: version(row.entitlement_version) },
  };
}
export function createEligibilityService(identity: EligibilityIdentity) {
  // Opaque in-process pagination only: cannot be serialized, forged or moved to
  // another context/service. Every page rechecks Identity and current revision.
  const cursors = new WeakMap<EligibilityCursor, { context: VerifiedEligibilityContext; after: string; revision: string; limit: number; expiresAt: number }>();
  async function snapshot<T>(context: VerifiedEligibilityContext, work: (snapshot: EligibilitySnapshot) => Promise<T>): Promise<T> {
    try {
      return await identity.run(context, async (tx, principal, at, deadline) => {
        const state = await readPolicyState(tx);
        const metadata = { evaluatedAt: at.toISOString(), validUntil: deadline.toISOString(),
          policyRevision: version(state.revision), consumerGrantVersion: version(state.consumerGrant),
          identityRevision: version(principal.identityRevision) };
        return work({ tx, principal, at, deadline, metadata });
      });
    } catch (error) {
      if (error instanceof IdentityOperationError) throw error;
      if (error instanceof EligibilityIdentityError && error.code === "invalid_context") throw new EligibilityError("invalid_context");
      throw new EligibilityError("dependency_unavailable");
    }
  }
  async function audit(s: EligibilitySnapshot, outcome: "allow" | "deny" | "read", operation: string, context: unknown) {
    const id = randomUUID();
    await s.tx.query(`INSERT INTO nexus_consumer_audit(decision_id,request_id,user_id,client_id,application_id,outcome,operation,context_digest,evaluated_at,valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, randomUUID(), s.principal.userId, s.principal.clientId, s.principal.applicationId, outcome,
        `is.eligibility:${operation}`, createHash("sha256").update(JSON.stringify(context)).digest("hex"), s.at, s.deadline]);
    return id;
  }
  const binding = (p: EligibilityIdentityPrincipal) => ({ applicationId: p.applicationId, clientId: p.clientId, environment: p.environment });
  async function contextRead(context: VerifiedEligibilityContext, tenantId: string, operation: string) {
    if (!uuid(tenantId)) throw new EligibilityError("invalid_request");
    return snapshot(context, async s => {
      const row = await readEffectiveContext(s.tx, s.principal, tenantId);
      await audit(s, row ? "read" : "deny", operation, { tenantId });
      // Uniform hidden/absent/inactive/unentitled result, without policy metadata.
      return row ? { available: true as const, ...binding(s.principal), context: effective(row), metadata: s.metadata }
        : { available: false as const };
    });
  }
  return {
    /** Trusted Identity composition: policy reads and issuance persistence share
     * one snapshot/commit. No HTTP caller or arbitrary identity may supply work. */
    async within<T>(context: VerifiedEligibilityContext, work: (s: EligibilitySnapshot & {
      list: (after: string | null, limit: number) => Promise<EffectiveTenantContext[]>;
      effective: (tenantId: string) => Promise<EffectiveTenantContext | null>;
    }) => Promise<T>): Promise<T> {
      return snapshot(context, s => work({ ...s,
        list: async (after, limit) => {
          if ((after !== null && !uuid(after)) || !Number.isInteger(limit) || limit < 1 || limit > 101) throw new Error("Invalid policy query");
          const rows = await listEffectiveTenants(s.tx, s.principal, after, limit);
          await audit(s, "read", "tenants", { count: rows.length });
          return rows.map(effective);
        },
        effective: async tenantId => {
          if (!uuid(tenantId)) throw new Error("Invalid policy query");
          const row = await readEffectiveContext(s.tx, s.principal, tenantId);
          await audit(s, row ? "read" : "deny", "admission", { tenantId });
          return row ? effective(row) : null;
        },
      }));
    },
    async listEligibleTenants(context: VerifiedEligibilityContext, options: { limit?: number; cursor?: EligibilityCursor } = {}) {
      if (!options || Object.keys(options).some(k => !["limit", "cursor"].includes(k))) throw new EligibilityError("invalid_request");
      const limit = options.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new EligibilityError("invalid_request");
      return snapshot(context, async s => {
        const cursor = options.cursor ? cursors.get(options.cursor) : null;
        if (options.cursor && (!cursor || cursor.context !== context || cursor.limit !== limit ||
          cursor.revision !== s.metadata.policyRevision || cursor.expiresAt <= Date.now())) throw new Error("Cursor unavailable");
        const rows = await listEffectiveTenants(s.tx, s.principal, cursor?.after ?? null, limit + 1);
        let nextCursor: EligibilityCursor | null = null;
        if (rows.length > limit) {
          rows.pop();
          nextCursor = Object.freeze({}) as EligibilityCursor;
          cursors.set(nextCursor, { context, after: rows[rows.length - 1].id, revision: s.metadata.policyRevision,
            limit, expiresAt: s.at.getTime() + 300000 });
        }
        await audit(s, "read", "tenants", { count: rows.length });
        return { ...binding(s.principal), tenants: rows.map(effective), nextCursor, metadata: s.metadata };
      });
    },
    // Both views require complete effective eligibility; neither exposes a hidden
    // tenant's raw role, lifecycle or disabled entitlement configuration.
    getEffectiveSelfMembership: (context: VerifiedEligibilityContext, tenantId: string) => contextRead(context, tenantId, "membership"),
    evaluateTenantApplication: (context: VerifiedEligibilityContext, tenantId: string) => contextRead(context, tenantId, "entitlements"),
    async evaluateAccess(context: VerifiedEligibilityContext, input: { tenantId: string; operation: string }) {
      if (!input || Object.keys(input).some(k => !["tenantId", "operation"].includes(k)) || !uuid(input.tenantId) ||
        typeof input.operation !== "string" || !/^[a-z][a-z0-9_.:-]{1,119}$/.test(input.operation)) throw new EligibilityError("invalid_request");
      return snapshot(context, async s => {
        const row = await readEffectiveContext(s.tx, s.principal, input.tenantId);
        const grant = await isOperationAllowed(s.tx, s.principal, input.operation);
        const decisionId = await audit(s, row && grant ? "allow" : "deny", input.operation, input);
        if (!row || !grant) return { allowed: false as const, code: "access_denied" as const, decisionId };
        return { allowed: true as const, code: "access_allowed" as const, decisionId, ...binding(s.principal),
          context: effective(row), operation: input.operation, metadata: s.metadata };
      });
    },
  };
}
