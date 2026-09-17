import { NextResponse } from "next/server";

import { hasDatabaseEnv, hasSheetsEnv } from "@/lib/env";

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
  // Booleans only. Never the values themselves. The checks live in env.ts so
  // that a variable set to an empty string counts as unset here exactly as it
  // does everywhere else.
  const configured = {
    database: hasDatabaseEnv(),
    sheet: hasSheetsEnv(),
  };

  return NextResponse.json(
    { status: "ok", configured },
    { headers: { "cache-control": "no-store" } },
  );
}
