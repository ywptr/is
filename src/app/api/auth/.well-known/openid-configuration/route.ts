import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const GET = oauthProviderOpenIdConfigMetadata(auth);
