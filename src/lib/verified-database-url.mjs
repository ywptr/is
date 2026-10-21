
/**
 * Enforce verified TLS for IS PostgreSQL connections.
 * Does not modify the original environment variable.
 */
export function verifiedDatabaseUrl(connectionString) {
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured");
  }

  const url = new URL(connectionString);

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Invalid PostgreSQL connection URL");
  }

  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.delete("uselibpqcompat");

  return url.toString();
}
