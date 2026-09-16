import "server-only";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "mp_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const SESSION_MESSAGE = "mealpreprapka:session:v1";

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (works in Node and Edge runtimes). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * The session token is an HMAC derived from APP_PASSWORD. It cannot be forged
 * without the password and it does not reveal the password. Changing
 * APP_PASSWORD invalidates every existing session.
 */
export async function createSessionToken(): Promise<string> {
  return hmacHex(getEnv().APP_PASSWORD, SESSION_MESSAGE);
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return safeEqual(token, await createSessionToken());
}

export async function verifyPassword(input: string): Promise<boolean> {
  // Compare fixed-length digests so the comparison does not leak length.
  const [expected, given] = await Promise.all([
    hmacHex(SESSION_MESSAGE, getEnv().APP_PASSWORD),
    hmacHex(SESSION_MESSAGE, input),
  ]);
  return safeEqual(expected, given);
}
