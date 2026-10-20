import "server-only";
import { z } from "zod";

import { getSupabase } from "@/lib/supabase/server";
import { PROVIDER_IDS, type ProviderId } from "@/lib/grocery/providers";
import { RETAILER_IDS, type RetailerId } from "@/lib/grocery/retailers";
import type { PriceKind, PriceType } from "@/lib/grocery/types";
import { isoDateSchema, maybeRow, ok, rows } from "./helpers";

/* Providers and sync runs ------------------------------------------------------ */

export type ProviderState = {
  id: ProviderId;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

const providerStateSchema = z.object({
  id: z.enum(PROVIDER_IDS),
  enabled: z.boolean(),
  last_success_at: z.string().nullable(),
  last_failure_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

export async function listProviderStates(): Promise<ProviderState[]> {
  const result = await getSupabase()
    .from("grocery_providers")
    .select("id, enabled, last_success_at, last_failure_at, last_error");
  return rows(providerStateSchema, result).map((row) => ({
    id: row.id,
    enabled: row.enabled,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
  }));
}

/** The registry in code, copied into the table so it reads on its own. */
export async function saveProviderPolicies(
  policies: {
    id: ProviderId;
    name: string;
    kind: string;
    authorization_personal: string;
    authorization_commercial: string;
    license: string | null;
    enabled: boolean;
  }[],
): Promise<void> {
  ok(await getSupabase().from("grocery_providers").upsert(policies, { onConflict: "id" }));
}

export type SyncRunPatch = {
  status: "ok" | "partial" | "failed" | "skipped";
  fetched?: number;
  imported?: number;
  rejected?: number;
  duplicates?: number;
  issues?: Record<string, number>;
  error?: string | null;
};

export async function startSyncRun(providerId: ProviderId): Promise<number> {
  const result = await getSupabase()
    .from("grocery_sync_runs")
    .insert({ provider_id: providerId, status: "running" })
    .select("id")
    .single();
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
  return z.object({ id: z.number() }).parse(result.data).id;
}

/** Closes a run and records the outcome on the provider, so a failure shows on the sources screen. */
export async function finishSyncRun(id: number, providerId: ProviderId, patch: SyncRunPatch): Promise<void> {
  const now = new Date().toISOString();
  const db = getSupabase();
  ok(
    await db
      .from("grocery_sync_runs")
      .update({
        status: patch.status,
        finished_at: now,
        fetched: patch.fetched ?? 0,
        imported: patch.imported ?? 0,
        rejected: patch.rejected ?? 0,
        duplicates: patch.duplicates ?? 0,
        issues: patch.issues ?? {},
        error: patch.error ?? null,
      })
      .eq("id", id),
  );
  if (patch.status === "skipped") return;
  ok(
    await db
      .from("grocery_providers")
      .update(
        patch.status === "failed"
          ? { last_failure_at: now, last_error: patch.error ?? "nieznany błąd" }
          : { last_success_at: now, ...(patch.status === "ok" ? { last_error: null } : {}) },
      )
      .eq("id", providerId),
  );
}

const syncRunSchema = z.object({
  id: z.number(),
  provider_id: z.enum(PROVIDER_IDS),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.enum(["running", "ok", "partial", "failed", "skipped"]),
  fetched: z.number(),
  imported: z.number(),
  rejected: z.number(),
  duplicates: z.number(),
  issues: z.record(z.string(), z.number()),
  error: z.string().nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;

export async function listSyncRuns(limit = 40): Promise<SyncRun[]> {
  const result = await getSupabase()
    .from("grocery_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return rows(syncRunSchema, result);
}

/** When this provider last finished a sync that kept data. */
export async function lastSuccessfulSync(providerId: ProviderId): Promise<string | null> {
  const result = await getSupabase()
    .from("grocery_sync_runs")
    .select("started_at")
    .eq("provider_id", providerId)
    .in("status", ["ok", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return maybeRow(z.object({ started_at: z.string() }), result)?.started_at ?? null;
}

const countsSchema = z.object({
  provider_id: z.enum(PROVIDER_IDS),
  prices: z.number(),
  newest: z.string().nullable(),
  oldest: z.string().nullable(),
});
export type PriceCounts = z.infer<typeof countsSchema>;

export async function listPriceCounts(): Promise<PriceCounts[]> {
  return rows(countsSchema, await getSupabase().from("grocery_price_counts").select("*"));
}

/* Stores, products, evidence, prices ------------------------------------------- */

/** Values per `in` filter: about 2 KB of URL, well inside every proxy's limit. */
const IN_CHUNK = 120;

export type StoreRow = {
  retailer_id: RetailerId | null;
  provider_id: ProviderId;
  provider_record_id: string;
  name: string;
  city: string | null;
  postcode: string | null;
  country_code: "PL";
  lat: number | null;
  lon: number | null;
  channel: "store" | "online";
};

/** Stores by the provider's record id -> our id. */
export async function upsertStores(stores: StoreRow[]): Promise<Map<string, string>> {
  if (stores.length === 0) return new Map();
  const result = await getSupabase()
    .from("grocery_stores")
    .upsert(stores, { onConflict: "provider_id,provider_record_id" })
    .select("id, provider_record_id");
  return new Map(
    rows(z.object({ id: z.string(), provider_record_id: z.string() }), result).map((row) => [row.provider_record_id, row.id]),
  );
}

export type ProductRow = {
  gtin: string;
  name: string;
  normalized_name: string;
  brand: string | null;
  category: string | null;
  pack_quantity: number | null;
  pack_unit: "g" | "ml" | "szt" | null;
  variant: Record<string, unknown>;
  nutrition: Record<string, number | null> | null;
  ingredients_text: string | null;
  source_provider_id: ProviderId;
  source_record_id: string;
  source_url: string | null;
  fetched_at: string;
};

/**
 * Products by GTIN -> our id. A product I confirmed by hand is never
 * overwritten by a source; with `keepExisting` no stored product is touched
 * (an Open Prices sync carries less than a direct Open Food Facts lookup).
 */
export async function upsertProducts(
  products: ProductRow[],
  options: { keepExisting?: boolean } = {},
): Promise<Map<string, string>> {
  if (products.length === 0) return new Map();
  const db = getSupabase();
  const gtins = [...new Set(products.map((product) => product.gtin))];
  // In chunks: a filter with a thousand barcodes would not fit in one request URL.
  const existing: { id: string; gtin: string; verification: string }[] = [];
  for (let index = 0; index < gtins.length; index += IN_CHUNK) {
    existing.push(
      ...rows(
        z.object({ id: z.string(), gtin: z.string(), verification: z.string() }),
        await db.from("grocery_products").select("id, gtin, verification").in("gtin", gtins.slice(index, index + IN_CHUNK)),
      ),
    );
  }
  const confirmed = new Set(
    existing.filter((row) => options.keepExisting || row.verification === "user_confirmed").map((row) => row.gtin),
  );
  const fresh = [...new Map(products.filter((product) => !confirmed.has(product.gtin)).map((product) => [product.gtin, product])).values()];
  const ids = new Map(existing.map((row) => [row.gtin, row.id]));
  for (let index = 0; index < fresh.length; index += 500) {
    const result = await db
      .from("grocery_products")
      .upsert(fresh.slice(index, index + 500), { onConflict: "gtin" })
      .select("id, gtin");
    for (const row of rows(z.object({ id: z.string(), gtin: z.string() }), result)) ids.set(row.gtin, row.id);
  }
  return ids;
}

const productSchema = z.object({
  id: z.string(),
  gtin: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  pack_quantity: z.coerce.number().nullable(),
  pack_unit: z.enum(["g", "ml", "szt"]).nullable(),
  nutrition: z.record(z.string(), z.number().nullable()).nullable(),
  ingredients_text: z.string().nullable(),
  source_provider_id: z.string().nullable(),
  source_url: z.string().nullable(),
  fetched_at: z.string(),
});
export type StoredProduct = z.infer<typeof productSchema>;

export async function findProductByGtin(gtin: string): Promise<StoredProduct | null> {
  const result = await getSupabase().from("grocery_products").select("*").eq("gtin", gtin).maybeSingle();
  return maybeRow(productSchema, result);
}

export type EvidenceRow = {
  provider_id: ProviderId;
  provider_record_id: string;
  evidence_type: "api_record" | "feed_record" | "web_page" | "leaflet" | "receipt" | "price_tag" | "manual_entry";
  source_url: string | null;
  captured_at: string;
  original: Record<string, unknown>;
  content_hash: string | null;
  license: string | null;
  verification: "verified" | "unverified" | "user_confirmed";
  private: boolean;
};

/** Evidence by the provider's record id -> our id. */
export async function upsertEvidence(evidence: EvidenceRow[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let index = 0; index < evidence.length; index += 500) {
    const result = await getSupabase()
      .from("grocery_evidence")
      .upsert(evidence.slice(index, index + 500), { onConflict: "provider_id,provider_record_id" })
      .select("id, provider_record_id");
    for (const row of rows(z.object({ id: z.string(), provider_record_id: z.string() }), result)) {
      ids.set(row.provider_record_id, row.id);
    }
  }
  return ids;
}

export type PriceRow = {
  provider_id: ProviderId;
  provider_record_id: string;
  retailer_id: RetailerId | null;
  product_id: string | null;
  store_id: string | null;
  receipt_line_id?: string | null;
  product_name: string;
  gtin: string | null;
  amount_grosz: number;
  currency: "PLN";
  price_per: "pack" | "kg" | "l" | "piece";
  pack_quantity: number | null;
  pack_unit: "g" | "ml" | "szt" | null;
  price_type: PriceType;
  regular_amount_grosz: number | null;
  kind: PriceKind;
  observed_at: string;
  valid_from: string | null;
  valid_to: string | null;
  loyalty_program: string | null;
  app_only: boolean;
  min_quantity: number;
  multibuy: string | null;
  deposit_grosz: number;
  conditions_text: string;
  evidence_id: string | null;
  verification: "verified" | "unverified" | "user_confirmed";
  region: string | null;
};

/** New observations; one already stored (same provider record) is left as it is. Returns how many were new. */
export async function insertPrices(prices: PriceRow[]): Promise<number> {
  let inserted = 0;
  for (let index = 0; index < prices.length; index += 500) {
    const result = await getSupabase()
      .from("grocery_prices")
      .upsert(prices.slice(index, index + 500), { onConflict: "provider_id,provider_record_id", ignoreDuplicates: true })
      .select("id");
    inserted += rows(z.object({ id: z.number() }), result).length;
  }
  return inserted;
}

/** Earlier prices of these products, by "retailer|gtin", for spotting sudden jumps. */
export async function listPreviousPrices(gtins: string[]): Promise<Map<string, number[]>> {
  const history = new Map<string, number[]>();
  if (gtins.length === 0) return history;
  const unique = [...new Set(gtins)];
  for (let index = 0; index < unique.length; index += IN_CHUNK) {
    const result = await getSupabase()
      .from("grocery_prices")
      .select("retailer_id, gtin, amount_grosz")
      .in("gtin", unique.slice(index, index + IN_CHUNK))
      .limit(5000);
    for (const row of rows(z.object({ retailer_id: z.string().nullable(), gtin: z.string(), amount_grosz: z.number() }), result)) {
      const key = `${row.retailer_id}|${row.gtin}`;
      history.set(key, [...(history.get(key) ?? []), row.amount_grosz]);
    }
  }
  return history;
}

const ledgerSchema = z.object({
  id: z.number(),
  provider_id: z.enum(PROVIDER_IDS),
  provider_record_id: z.string(),
  retailer_id: z.enum(RETAILER_IDS).nullable(),
  product_name: z.string(),
  gtin: z.string().nullable(),
  amount_grosz: z.number(),
  currency: z.string(),
  price_per: z.enum(["pack", "kg", "l", "piece"]),
  pack_quantity: z.coerce.number().nullable(),
  pack_unit: z.enum(["g", "ml", "szt"]).nullable(),
  price_type: z.enum(["regular", "promotion", "loyalty", "multibuy", "clearance"]),
  regular_amount_grosz: z.number().nullable(),
  kind: z.enum(["current_offer", "published_promotion", "historical", "community", "receipt", "manual"]),
  observed_at: z.string(),
  valid_from: isoDateSchema.nullable(),
  valid_to: isoDateSchema.nullable(),
  loyalty_program: z.string().nullable(),
  app_only: z.boolean(),
  min_quantity: z.number(),
  multibuy: z.string().nullable(),
  deposit_grosz: z.number(),
  conditions_text: z.string(),
  region: z.string().nullable(),
  store: z.object({ name: z.string(), city: z.string().nullable() }).nullable(),
  evidence: z.object({ source_url: z.string().nullable(), evidence_type: z.string(), private: z.boolean() }).nullable(),
});
export type LedgerPrice = z.infer<typeof ledgerSchema>;

/**
 * Recent shop observations (community and my receipts) for one town: the
 * history shown next to an item and offered as labelled reference prices.
 */
export async function listRecentLedgerPrices(city: string, since: string): Promise<LedgerPrice[]> {
  const result = await getSupabase()
    .from("grocery_prices")
    .select(
      "id, provider_id, provider_record_id, retailer_id, product_name, gtin, amount_grosz, currency, price_per, pack_quantity, pack_unit, price_type, regular_amount_grosz, kind, observed_at, valid_from, valid_to, loyalty_program, app_only, min_quantity, multibuy, deposit_grosz, conditions_text, region, store:grocery_stores(name, city), evidence:grocery_evidence(source_url, evidence_type, private)",
    )
    .in("kind", ["community", "receipt"])
    // An exact, case-blind town match: LIKE wildcards in the name are escaped.
    .ilike("region", city.trim().replace(/[\\%_]/g, (char) => `\\${char}`))
    .gte("observed_at", since)
    .order("observed_at", { ascending: false })
    .limit(3000);
  return rows(ledgerSchema, result);
}
