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

  // TEMPORARY DIAGNOSTIC — remove. Fetches our own public URLs from the server
  // with no cookies and no Vercel token, which is what a link crawler sees.
  let probe: unknown;
  if (new URL(request.url).searchParams.has("og")) {
    const targets = [
      "https://meal-prep.pl/",
      "https://www.meal-prep.pl/",
      "https://www.meal-prep.pl/login",
      "https://www.meal-prep.pl/opengraph-image?b9d9a2f8b53a8569",
    ];
    probe = await Promise.all(
      targets.map(async (url) => {
        try {
          const response = await fetch(url, {
            redirect: "manual",
            cache: "no-store",
            headers: { "user-agent": "facebookexternalhit/1.1" },
          });
          const type = response.headers.get("content-type");
          const body = type?.startsWith("text/html") ? await response.text() : "";
          return {
            url,
            status: response.status,
            type,
            location: response.headers.get("location"),
            ogImage: /property="og:image" content="([^"]+)"/.exec(body)?.[1] ?? null,
          };
        } catch (error) {
          return { url, error: String(error) };
        }
      }),
    );
  }

  return NextResponse.json(
    { status: "ok", configured, ...(probe ? { probe } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
