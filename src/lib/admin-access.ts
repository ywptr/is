import { auth } from "@/lib/auth";
import { isISAdministrator } from "@/lib/admission";

export async function currentAdminUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) return null;
  return (await isISAdministrator(session.user.id)) ? session.user.id : null;
}

export function hasTrustedOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const configured = process.env.BETTER_AUTH_URL;
  if (!origin || !configured) return false;
  try { return origin === new URL(configured).origin; } catch { return false; }
}
