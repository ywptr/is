import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { pool } from "@/lib/database";
import { isEmailPermitted } from "@/lib/admission";

const required = ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}

/** IS authenticates PEOPLE; it does not establish tenant membership or permissions. */
export const auth = betterAuth({
  appName: "IS",
  baseURL: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,
  database: pool,
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      requireEmailVerification: true,
    },
  },
  user: {
    validateUserInfo: async ({ user, source }) => {
      if (source.oauth?.providerId !== "google") {
        return { error: "unsupported_provider", errorDescription: "Only Google login is enabled." };
      }
      if (!(await isEmailPermitted(user.email))) {
        return { error: "account_not_invited", errorDescription: "This account has not been enabled for IS." };
      }
    },
  },
  account: {
    accountLinking: { disableImplicitLinking: true },
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  disabledPaths: ["/token"],
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      // Client provisioning is performed ONLY through a server-side admin command.
      clientPrivileges: async () => false,
    }),
  ],
});
