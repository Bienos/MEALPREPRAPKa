import "server-only";
import { createSign } from "node:crypto";

import { getGoogleEnv } from "@/lib/env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

let cached: { token: string; expiresAt: number } | undefined;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * Access token for the Sheets API using the service account.
 *
 * Signs a JWT with the private key and exchanges it for a token: the standard
 * server-to-server flow, written by hand to avoid pulling in googleapis.
 * The token is reused until shortly before it expires.
 */
export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const env = getGoogleEnv();
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: now + data.expires_in };
  return cached.token;
}
