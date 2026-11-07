/**
 * Build the PostgreSQL connection URL for IS.
 *
 * Production defaults to sslmode=verify-full.
 * Local development may explicitly set:
 *
 *   IS_DATABASE_SSLMODE=disable
 *
 * Insecure database connections are never permitted when NODE_ENV=production.
 */
export function verifiedDatabaseUrl(connectionString) {
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured");
  }

  const url = new URL(connectionString);

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Invalid PostgreSQL connection URL");
  }

  const sslmode = process.env.IS_DATABASE_SSLMODE?.trim() || "verify-full";

  if (!["verify-full", "disable"].includes(sslmode)) {
    throw new Error(
      "IS_DATABASE_SSLMODE must be either 'verify-full' or 'disable'",
    );
  }

  if (process.env.NODE_ENV === "production" && sslmode === "disable") {
    throw new Error(
      "IS_DATABASE_SSLMODE=disable is not allowed in production",
    );
  }

  url.searchParams.set("sslmode", sslmode);
  url.searchParams.delete("uselibpqcompat");

  return url.toString();
}