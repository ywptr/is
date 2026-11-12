import type { Pool, PoolClient } from 'pg';

export type ClientPurpose = 'oidc' | 'nexus_consumer';
/** No writes, seeding or migration. Consumer administration fails closed before reservation. */
export async function purposeSchemaReady(db: Pool | PoolClient): Promise<boolean> {
  const result = await db.query(`SELECT EXISTS (
    SELECT 1 FROM pg_attribute a WHERE a.attrelid='nexus_application_oauth_clients'::regclass
      AND a.attname='purpose' AND NOT a.attisdropped AND a.attnotnull
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='nexus_application_oauth_clients'::regclass
      AND conname='nexus_oauth_application_environment_purpose_key' AND contype='u' AND convalidated
  ) AS ready`);
  return result.rows[0]?.ready === true;
}

/** Pre-0012 read compatibility only. An absent classification never enables issuance. */
export const purposeReadExpression = `COALESCE(to_jsonb(o)->>'purpose',
  CASE WHEN EXISTS (SELECT 1 FROM identity_credential_bindings b
    WHERE b.client_id=o.oauth_client_id AND b.application_id=o.application_id
      AND b.environment=o.environment) THEN 'nexus_consumer' ELSE 'oidc' END)`;
