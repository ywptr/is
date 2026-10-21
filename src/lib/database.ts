import { Pool } from "pg";
import { verifiedDatabaseUrl } from "@/lib/verified-database-url.mjs";

function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be configured");
  return new Pool({
    connectionString: verifiedDatabaseUrl(connectionString),
    max: 3, // conservative pool size for Vercel serverless instances
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

const globalPool = globalThis as typeof globalThis & { __isPool?: Pool };
export const pool = globalPool.__isPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalPool.__isPool = pool;
