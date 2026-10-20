"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { listSyncRuns } from "@/lib/db/grocery";
import { displayGtin } from "@/lib/grocery/gtin";
import { lookupProduct, syncOpenPrices, type SyncResult } from "@/lib/grocery/sync";

/** A manual sync is not repeated within this many minutes: the daily cron does the regular work. */
const MANUAL_SYNC_GAP_MINUTES = 5;

export type SyncActionResult = { ok: boolean; message: string };

/** [ Pobierz z Open Prices ] the Polish prices added since the last sync. */
export async function syncOpenPricesAction(): Promise<SyncActionResult> {
  const last = (await listSyncRuns(10)).find((run) => run.provider_id === "open-prices" && run.status !== "failed");
  if (last && Date.now() - Date.parse(last.started_at) < MANUAL_SYNC_GAP_MINUTES * 60_000) {
    return { ok: true, message: "Open Prices było sprawdzane przed chwilą. Spróbuj za kilka minut." };
  }
  const result: SyncResult = await syncOpenPrices();
  refresh();
  return { ok: result.status !== "failed", message: result.message };
}

export type BarcodeResult =
  | {
      ok: true;
      gtin: string;
      name: string;
      brand: string | null;
      pack: string | null;
      nutrition: { kcal: number | null; proteinG: number | null; fatG: number | null; carbsG: number | null } | null;
      url: string | null;
      from: "cache" | "open-food-facts";
    }
  | { ok: false; message: string };

/** "Sprawdź kod EAN": what Open Food Facts says the barcode is (metadata, never a price). */
export async function lookupBarcodeAction(code: string): Promise<BarcodeResult> {
  const parsed = z.string().trim().min(8).max(20).safeParse(code);
  if (!parsed.success) return { ok: false, message: "Wpisz kod EAN (8 lub 13 cyfr)." };
  const result = await lookupProduct(parsed.data);
  if (result.status !== "found") return { ok: false, message: result.message };
  const product = result.product;
  const nutrition = product.nutrition
    ? {
        kcal: product.nutrition.kcal ?? null,
        proteinG: product.nutrition.proteinG ?? null,
        fatG: product.nutrition.fatG ?? null,
        carbsG: product.nutrition.carbsG ?? null,
      }
    : null;
  return {
    ok: true,
    gtin: displayGtin(product.gtin ?? ""),
    name: product.name,
    brand: product.brand,
    pack: product.pack_quantity && product.pack_unit ? `${product.pack_quantity} ${product.pack_unit}` : null,
    nutrition,
    url: product.source_url,
    from: result.from,
  };
}
