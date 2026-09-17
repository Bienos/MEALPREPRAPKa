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

export async function GET(request: Request) {
  // Booleans only. Never the values themselves. The checks live in env.ts so
  // that a variable set to an empty string counts as unset here exactly as it
  // does everywhere else.
  const configured = {
    database: hasDatabaseEnv(),
    sheet: hasSheetsEnv(),
  };

  // TEMPORARY DIAGNOSTIC — remove. Shows which tab each gid actually returns.
  let probe: unknown;
  if (new URL(request.url).searchParams.has("probe")) {
    const id = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "").trim();
    const configuredGid = (process.env.GOOGLE_SHEETS_TARGET_GID ?? "").trim();
    const targets: [string, string][] = [
      ["configured", configuredGid],
      ["700302857", "700302857"],
      ["first-tab", ""],
    ];
    probe = {
      configuredGid,
      results: await Promise.all(
        targets.map(async ([label, gid]) => {
          const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
          try {
            const response = await fetch(url, { cache: "no-store" });
            const text = await response.text();
            return {
              label,
              status: response.status,
              bytes: text.length,
              head: text.slice(0, 300),
            };
          } catch (error) {
            return { label, error: String(error) };
          }
        }),
      ),
    };
  }

  return NextResponse.json(
    { status: "ok", configured, ...(probe ? { probe } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
