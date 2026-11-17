/** Read-only provider key bridge. Native getJwks lazily mints on an empty store;
 * admission must never provision credentials as a validation side effect. */
import { createLocalJWKSet } from "jose";
import type { CredentialRegistry } from "../credential-registry.ts";
import { fail } from "./validation.ts";
export function createAdmissionJwksReader(registry: Pick<CredentialRegistry, "transaction">) {
  return async (...args: Parameters<ReturnType<typeof createLocalJWKSet>>) => {
    const keys = await registry.transaction(async tx => {
      const rows = (await tx.query(`SELECT id,"publicKey" FROM jwks WHERE COALESCE(alg,'EdDSA')='EdDSA'
        AND ("expiresAt" IS NULL OR "expiresAt">clock_timestamp())`)).rows;
      if (!rows.length) return fail(503, "signing_key_unavailable");
      return rows.map(row => {
        const key = JSON.parse(row.publicKey);
        if (key.d || key.k) return fail(503, "signing_key_unavailable");
        return { ...key, alg: "EdDSA", kid: row.id };
      });
    });
    return createLocalJWKSet({ keys })(...args);
  };
}
