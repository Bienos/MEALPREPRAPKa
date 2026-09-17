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
    const response = await fetch(
      `https://docs.google.com/spreadsheets/d/${id}/htmlview`,
      { cache: "no-store" },
    );
    const html = await response.text();
    const gids = [...new Set([...html.matchAll(/gid[=":\s]{1,4}(\d{2,})/g)].map((m) => m[1]))];
    const menu = html.indexOf("sheet-menu");
    probe = {
      configuredGid,
      status: response.status,
      bytes: html.length,
      gids,
      menu: menu >= 0 ? html.slice(menu, menu + 900) : html.slice(0, 500),
    };
  }

  return NextResponse.json(
    { status: "ok", configured, ...(probe ? { probe } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
