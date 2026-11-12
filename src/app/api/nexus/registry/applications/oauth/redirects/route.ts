import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/database";
import { currentNexusOperatorId } from "@/lib/nexus-operator-access";
import { hasTrustedOrigin } from "@/lib/admin-access";
import { reply } from "@/lib/nexus-response";
import { parseBody } from "@/lib/nexus-registry";
import { validateRedirectUris } from "@/lib/oauth-redirect-uris.mjs";
import { equalRedirectSets, decodeProviderRedirects } from "@/lib/oauth-redirect-reconcile.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reconcile OAuth provider registration and Nexus snapshot. The provider is
 * authoritative; a Nexus-only update is never evidence of success.
 * This is an operator-only endpoint, not dynamic client registration.
 */
export async function PATCH(req: NextRequest) {
  if (!hasTrustedOrigin(req.headers)) return reply({ error: "invalid_origin" }, 403);
  try {
    const actor = await currentNexusOperatorId(req.headers);
    if (!actor) return reply({ error: "forbidden" }, 403);
    const body = parseBody(await req.json().catch(() => null));
    if (!body || typeof body.clientId !== "string" || body.clientId.length < 1 ||
      body.clientId.length > 255 || !validateRedirectUris(body.redirectUris) ||
      !Array.isArray(body.expectedRedirectUris) || body.expectedRedirectUris.length > 10 ||
      !body.expectedRedirectUris.every(x => typeof x === "string" && x.length <= 2048)) {
      return reply({ error: "invalid_redirect_uris" }, 400);
    }
    const clientId = body.clientId;
    const nextUris = body.redirectUris as string[];
    const expectedUris = body.expectedRedirectUris as string[];
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const snapshot = await db.query(`SELECT application_id, environment, redirect_uris
        FROM nexus_application_oauth_clients WHERE oauth_client_id = $1 FOR UPDATE`, [clientId]);
      if (snapshot.rowCount !== 1) {
        await db.query("ROLLBACK");
        return reply({ error: "client_not_found" }, 404);
      }
      const record = snapshot.rows[0];
      const purpose=await db.query("SELECT COALESCE(to_jsonb(o)->>'purpose','oidc') AS purpose FROM nexus_application_oauth_clients o WHERE oauth_client_id=$1",[clientId]);
      const consumer=await db.query('SELECT 1 FROM identity_credential_bindings WHERE client_id=$1',[clientId]);
      if(purpose.rows[0].purpose!=='oidc'||consumer.rowCount){
        await db.query('ROLLBACK');return reply({error:'consumer_profile_requires_administration'},409);
      }
      const previousSnapshot = record.redirect_uris as string[];
      if (!equalRedirectSets(previousSnapshot, expectedUris)) {
        await db.query("ROLLBACK");
        return reply({ error: "redirects_changed_reload" }, 409);
      }
      // Read Better Auth's canonical value before deciding whether an edit is a no-op.
      const providerRow = await db.query(`SELECT "redirectUris" FROM "oauthClient"
        WHERE "clientId" = $1`, [clientId]);
      if (providerRow.rowCount !== 1) {
        await db.query("ROLLBACK");
        return reply({ error: "provider_client_not_found" }, 409);
      }
      const previousProvider = decodeProviderRedirects(providerRow.rows[0].redirectUris);
      if (!previousProvider) throw new Error("Unrecognized Better Auth redirect storage format");
      const providerNeedsUpdate = !equalRedirectSets(previousProvider, nextUris);
      const snapshotNeedsUpdate = !equalRedirectSets(previousSnapshot, nextUris);
      if (!providerNeedsUpdate && !snapshotNeedsUpdate) {
        await db.query("ROLLBACK");
        return reply({ client_id: clientId, redirect_uris: nextUris, unchanged: true });
      }
      if (providerNeedsUpdate) {
        await auth.api.adminUpdateOAuthClient({
          headers: req.headers,
          body: { client_id: clientId, update: { redirect_uris: nextUris } },
        });
        const verified = await db.query(`SELECT "redirectUris" FROM "oauthClient"
          WHERE "clientId" = $1`, [clientId]);
        const actual = verified.rowCount === 1 ? decodeProviderRedirects(verified.rows[0].redirectUris) : null;
        if (!actual || !equalRedirectSets(actual, nextUris)) {
          await db.query("ROLLBACK");
          console.error("Better Auth OAuth redirect update did not persist", { clientId });
          return reply({ error: "provider_redirect_update_not_persisted" }, 502);
        }
      }
      try {
        if (snapshotNeedsUpdate) {
          await db.query(`UPDATE nexus_application_oauth_clients SET redirect_uris=$2::jsonb
            WHERE oauth_client_id=$1`, [clientId, JSON.stringify(nextUris)]);
        }
        // Retire legacy insecure-LAN capability if this client has one; preserve
        // the historical records for investigation rather than deleting audit evidence.
        await db.query(`UPDATE nexus_oauth_dev_capabilities SET enabled=false,
          changed_at=now(), changed_by=$2 WHERE oauth_client_id=$1 AND enabled=true`, [clientId, actor]);
        await db.query(`INSERT INTO nexus_registry_audit
          (actor_user_id, entity_type, entity_id, action, detail)
          VALUES ($1, 'application', $2, 'update', $3::jsonb)`, [
          actor, record.application_id,
          JSON.stringify({ event: "oauth_redirect_reconciled", environment: record.environment,
            client_id: clientId, previous_provider_uris: previousProvider,
            previous_nexus_uris: previousSnapshot, new_uris: nextUris }),
        ]);
        await db.query("COMMIT");
        return reply({ client_id: clientId, redirect_uris: nextUris, reconciled: true });
      } catch (dbError) {
        await db.query("ROLLBACK");
        if (providerNeedsUpdate) {
          try {
            await auth.api.adminUpdateOAuthClient({
              headers: req.headers,
              body: { client_id: clientId, update: { redirect_uris: previousProvider } },
            });
          } catch (rollbackError) {
            console.error("CRITICAL: OAuth provider/Nexus reconciliation required", { clientId, rollbackError });
          }
        }
        throw dbError;
      }
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    console.error("OAuth redirect reconciliation failed", error);
    return reply({ error: "oauth_redirect_update_failed" }, 500);
  }
}
