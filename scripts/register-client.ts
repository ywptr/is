/**
 * One-time deployment operator utility. Never expose this function as a public HTTP route.
 * Run only after applying Better Auth migrations.
 * CONFIDENTIAL web clients must hold credentials on their backend.
 * Treat the emitted client secret like any other production secret.
 */
import { auth } from "../src/lib/auth";
import { existsSync, writeFileSync } from "node:fs";

const clientName = process.env.IS_CLIENT_NAME?.trim();
const redirectUri = process.env.IS_CLIENT_REDIRECT_URI?.trim();
const secretFile = process.env.IS_CLIENT_SECRET_FILE?.trim();
if (!clientName || !redirectUri || !secretFile) {
  throw new Error("Set IS_CLIENT_NAME, IS_CLIENT_REDIRECT_URI, and IS_CLIENT_SECRET_FILE");
}
if (existsSync(secretFile)) throw new Error("IS_CLIENT_SECRET_FILE already exists. Refusing to overwrite.");
const url = new URL(redirectUri);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
  throw new Error("Callback URI must use HTTPS (except localhost for development)");
}
if (url.hash || url.username || url.password) throw new Error("Invalid callback URI");

const client = await auth.api.adminCreateOAuthClient({
  headers: new Headers(), // privileged server-only API; verify behavior against pinned version
  body: {
    client_name: clientName,
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "openid profile email",
    require_pkce: true,
    skip_consent: true, // First-party clients ONLY
    enable_end_session: true,
  },
});

if (!client.client_secret) {
  throw new Error("Registration returned no client secret; investigate and revoke this client before retrying.");
}
writeFileSync(
  secretFile,
  JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret }, null, 2) + "\n",
  { encoding: "utf8", mode: 0o600, flag: "wx" },
);
console.log(`Registered IS OAuth client ${client.client_id}. Secret written only to the protected output file.`);
