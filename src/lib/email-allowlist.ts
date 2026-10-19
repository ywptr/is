/**
 * MVP closed onboarding. No domains, wildcards, or substring matching.
 * The allowlist is an identity admission policy, NOT authorization in IG/Nexus/Sandcastle.
 */
export function allowedEmails(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isAllowedEmail(
  email: string | undefined | null,
  configured: string | undefined,
): boolean {
  if (!email) return false;
  const approved = allowedEmails(configured);
  return approved.size > 0 && approved.has(email.trim().toLowerCase());
}
