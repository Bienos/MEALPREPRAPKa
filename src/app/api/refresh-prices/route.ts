import { NextResponse } from "next/server";

import { getCronSecret } from "@/lib/env";
import { syncOpenPrices } from "@/lib/grocery/sync";
import {
  refreshAuchanShelf,
  refreshBiedronkaCategoryShelf,
  refreshBlixSweep,
  refreshFriscoPrices,
  refreshShopPromos,
  refreshStokrotkaPrices,
} from "@/lib/prices/refresh";

/**
 * GET /api/refresh-prices — the daily price refresh, called by Vercel's cron
 * (vercel.json) with `Authorization: Bearer $CRON_SECRET`, so the prices are
 * already today's when the shopping screens open. Not a public route: the
 * wrong or a missing secret gets 401, no secret configured gets 503.
 *
 * The same sources as a tap on "Sprawdź promocje", side by side, each inside
 * its own budget; one failing never stops the others. Sources without
 * permission on record report "disabled" unless GROCERY_UNVERIFIED_SOURCES=on.
 * Open Prices (Poland, community history) is synced here once a day.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const sources = {
    promos: refreshShopPromos(),
    sweep: refreshBlixSweep(),
    stokrotka: refreshStokrotkaPrices(),
    frisco: refreshFriscoPrices(),
    auchan: refreshAuchanShelf(),
    biedronka: refreshBiedronkaCategoryShelf(),
    openPrices: syncOpenPrices(),
  };
  const settled = await Promise.allSettled(Object.values(sources));
  const report = Object.fromEntries(
    Object.keys(sources).map((name, index) => {
      const result = settled[index];
      return [name, result.status === "fulfilled" ? result.value : { error: String(result.reason) }];
    }),
  );
  console.info(`[prices] scheduled refresh in ${Date.now() - started} ms:`, JSON.stringify(report));
  return NextResponse.json(
    { ok: true, ms: Date.now() - started, report },
    { headers: { "cache-control": "no-store" } },
  );
}
