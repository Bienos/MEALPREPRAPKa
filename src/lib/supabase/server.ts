import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Server-only Supabase client using the secret key.
 *
 * This app has one user and its own password gate, so all database access
 * happens in Server Components, Server Functions and Route Handlers.
 * There is deliberately no browser client: the secret key must never reach
 * the client bundle. Never import this from a "use client" component.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const env = getEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
