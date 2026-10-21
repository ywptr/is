import { pool } from "@/lib/database";
import type { PoolClient } from "pg";

export type RegistryKind = "applications" | "tenants" | "entitlements";
const keyPattern = /^[a-z][a-z0-9_-]{1,62}$/;
export const isKey = (s: unknown): s is string => typeof s === "string" && keyPattern.test(s);
export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(s);
export const isName = (s: unknown): s is string => typeof s === "string" && s.trim().length >= 2 && s.trim().length <= 120;
export function parseBody(x: unknown): Record<string,unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? x as Record<string,unknown> : null;
}
export function isStatus(kind: "applications"|"tenants", value: unknown): value is string {
  return typeof value === "string" && (kind === "applications" ? ["active","disabled"] : ["active","suspended"]).includes(value);
}
export const isPolicy = (v: unknown): v is string => typeof v === "string" && ["invitation_only","public_registration","closed"].includes(v);
export async function transact<T>(fn: (client: PoolClient)=>Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await fn(client); await client.query("COMMIT"); return value; }
  catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export function dbError(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  if (error.code === "23505") return "already_exists";
  if (error.code === "23503") return "referenced_record_missing";
  if (error.code === "23514" || error.code === "22P02") return "invalid_value";
  return null;
}
