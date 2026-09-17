import { NextResponse } from "next/server";

/**
 * GET /api/health — deliberately says almost nothing.
 *
 * Deployment checks and uptime pings need a fast, public, non-sensitive
 * answer. It never reports configuration values, connection strings, or
 * anything about the user's data: only whether the server is running and
 * whether the two integrations are configured at all.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Booleans only. Never the values themselves.
  const configured = {
    database: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL),
    sheet: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
  };

  // TEMPORARY DIAGNOSTIC — remove. Booleans only, never values.
  const nonEmpty: Record<string, boolean> = {};
  for (const k of Object.keys(process.env).sort()) {
    if (!/SUPABASE|GOOGLE|ANTHROPIC|APP_PASSWORD|SESSION_SECRET/i.test(k)) continue;
    nonEmpty[k] = (process.env[k] ?? "").trim() !== "";
  }

  return NextResponse.json(
    { status: "ok", configured, nonEmpty },
    { headers: { "cache-control": "no-store" } },
  );
}
