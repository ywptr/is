import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider, DEFAULT_OAUTH_SCOPES } from "@better-auth/oauth-provider";
import { pool } from "@/lib/database";
import { isEmailPermitted } from "@/lib/admission";

import { createConsumerIdentityIntegration } from "./identity/consumer-integration.ts";
import type { IdentityDependencies } from "./identity/access-credentials.ts";
import type { DpopReplayReservations } from "better-auth/oauth2";
import { authorizeCredentialAdministration, inCredentialAdministration } from "./identity/administration.ts";
let readConsumerJwks:IdentityDependencies["jwksFetch"]=async()=>{throw new Error("Identity initializing");};
let readReservations:()=>Promise<DpopReplayReservations>=async()=>{throw new Error("Identity initializing");};
function consumerPolicy(){
  if(process.env.IDENTITY_NEXUS_CREDENTIALS_ENABLED!=="true")return null;
  try {
    const origin=new URL(process.env.BETTER_AUTH_URL!);
    const audience=process.env.NEXUS_CONSUMER_RESOURCE!;
    if(origin.protocol!=="https:"||origin.pathname!=="/"||origin.search||origin.hash||origin.username||origin.password||
      new URL(audience).origin!==origin.origin||new URL(audience).pathname!=="/api/nexus/v1"||new URL(audience).href!==audience||
      !["development","staging","production"].includes(process.env.NEXUS_CONSUMER_ENVIRONMENT??""))return null;
    return {issuer:origin.origin+"/api/auth",audience,environment:process.env.NEXUS_CONSUMER_ENVIRONMENT!};
  }catch{return null;}
}
const configuredConsumerPolicy=consumerPolicy();
export const consumerIdentityIntegration=configuredConsumerPolicy?createConsumerIdentityIntegration(pool,{
  enabled:true,policy:configuredConsumerPolicy,jwksFetch:()=>readConsumerJwks(),reservations:()=>readReservations(),
  // No public Identity administration surface is introduced by enabling reads.
  authorize:authorizeCredentialAdministration,
}):undefined;

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
  ...(consumerIdentityIntegration?{hooks:{before:consumerIdentityIntegration.before,after:consumerIdentityIntegration.after}}:{}),
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      ...(consumerIdentityIntegration?{extensions:[consumerIdentityIntegration.extension],
        scopes:[...DEFAULT_OAUTH_SCOPES,"nexus:tenants:read","nexus:membership:self","nexus:entitlements:read","nexus:access:evaluate"],
        enforcePerClientResources:true,storeTokens:"hashed" as const}:{}),
      assertionMaxLifetime: 60,
      resourcePrivileges: async ({ user }) => inCredentialAdministration() && !!user?.id &&
        (await pool.query("SELECT 1 FROM nexus_operators WHERE user_id=$1",[user.id])).rowCount===1,
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      // Client provisioning is performed ONLY through a server-side admin command.
      clientPrivileges: async ({ user }) => {
        if (!user?.id) return false;

        const result = await pool.query(
          `SELECT 1
          FROM nexus_operators
          WHERE user_id = $1`,
          [user.id]
        );

        return result.rowCount === 1;
      },
    }),
  ],
});

readConsumerJwks=()=>auth.api.getJwks();
readReservations=async()=>(await auth.$context).internalAdapter;
