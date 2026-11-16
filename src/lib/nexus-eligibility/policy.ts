/** Nexus-owned policy reads shared by internal IS mediation and Consumer v1.
 * Caller supplies the transaction and Identity-verified user/registered app binding.
 * These functions never authenticate caller-provided IDs or create memberships.
 */
import type { PoolClient } from "pg";
export interface EligibilityPrincipal { readonly userId: string; readonly applicationId: string }
export interface EligibleRow {
  id: string; tenant_key: string; name: string; role: "owner" | "admin" | "member";
  membership_version: string; tenant_version: string; application_version: string; entitlement_version: string;
}
const eligible=`FROM nexus_tenants t
  JOIN nexus_tenant_membership_governance g ON g.tenant_id=t.id AND g.active_admin_count>0
  JOIN nexus_tenant_memberships m ON m.tenant_id=t.id AND m.user_id=$1 AND m.status='active'
  JOIN nexus_applications a ON a.id=$2 AND a.status='active'
  JOIN nexus_entitlements e ON e.tenant_id=t.id AND e.application_id=a.id AND e.enabled
  JOIN nexus_consumer_epochs mt ON mt.kind='membership' AND mt.subject_key=t.id::text||':'||m.user_id
  JOIN nexus_consumer_epochs tt ON tt.kind='tenant' AND tt.subject_key=t.id::text
  JOIN nexus_consumer_epochs aa ON aa.kind='application' AND aa.subject_key=a.id::text
  JOIN nexus_consumer_epochs ee ON ee.kind='entitlement' AND ee.subject_key=t.id::text||':'||a.id::text
  WHERE t.status='active'`;
const columns=`t.id,t.tenant_key,t.name,m.role,mt.version::text AS membership_version,tt.version::text AS tenant_version,
  aa.version::text AS application_version,ee.version::text AS entitlement_version`;

export async function readPolicyState(tx: PoolClient) {
  const revision = (await tx.query("SELECT version::text FROM nexus_consumer_revision WHERE id=true")).rows[0]?.version as string | undefined;
  const consumerGrant = (await tx.query("SELECT version::text FROM nexus_consumer_epochs WHERE kind='consumerGrant' AND subject_key='global'")).rows[0]?.version as string | undefined;
  return { revision, consumerGrant };
}
export async function listEffectiveTenants(tx: PoolClient, principal: EligibilityPrincipal, after: string | null, limit: number): Promise<EligibleRow[]> {
  return (await tx.query(`SELECT ${columns} ${eligible} AND ($3::uuid IS NULL OR t.id>$3) ORDER BY t.id LIMIT $4`,
    [principal.userId, principal.applicationId, after, limit])).rows;
}
export async function readEffectiveContext(tx: PoolClient, principal: EligibilityPrincipal, tenantId: string): Promise<EligibleRow | null> {
  return (await tx.query(`SELECT ${columns} ${eligible} AND t.id=$3`,
    [principal.userId, principal.applicationId, tenantId])).rows[0] ?? null;
}
export async function isOperationAllowed(tx: PoolClient, principal: { issuer: string; clientId: string; audience: string; environment: string }, operation: string): Promise<boolean> {
  return (await tx.query(`SELECT 1 FROM nexus_consumer_operations WHERE issuer=$1 AND client_id=$2 AND audience=$3 AND environment=$4 AND operation=$5 AND enabled`,
    [principal.issuer, principal.clientId, principal.audience, principal.environment, operation])).rowCount === 1;
}
