import { pool } from "@/lib/database";

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  // Deliberately no wildcard, domain allow, or substring matching.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function isEmailPermitted(value: unknown): Promise<boolean> {
  const email = normalizeEmail(value);
  if (!email) return false;
  // Fail closed if PostgreSQL is unavailable. No in-memory allowlist fallback.
  const result = await pool.query("SELECT 1 FROM is_admission_emails WHERE email = $1", [email]);
  return (result.rowCount ?? 0) > 0;
}

export async function isISAdministrator(userId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM is_administrators WHERE user_id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
}
