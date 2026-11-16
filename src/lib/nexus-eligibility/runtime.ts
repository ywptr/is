/** Server composition only. No public admission endpoint or automatic login hook. */
import { auth, consumerIdentityIntegration } from "../auth";
import { createEligibilityIdentity } from "../identity/eligibility-context.ts";
import { createEligibilityService, EligibilityError } from "./service.ts";

export function createISEligibilityRuntime() {
  const integration = consumerIdentityIntegration;
  if (!integration) throw new EligibilityError("dependency_unavailable");
  const identity = createEligibilityIdentity({
    policy: integration.registry.policy,
    transaction: integration.registry.transaction,
    enabled: () => process.env.NEXUS_MEMBERSHIPS_ENABLED === "true" && process.env.IDENTITY_NEXUS_CREDENTIALS_ENABLED === "true",
    authenticate: async headers => {
      const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
      return session ? { userId: session.user.id, sessionId: session.session.id } : null;
    },
  });
  return { verifyContext: identity.verify, eligibility: createEligibilityService(identity) };
}
