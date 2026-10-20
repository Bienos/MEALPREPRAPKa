import "server-only";
import { createHash } from "node:crypto";

import { addDays, todayIso } from "@/lib/date";
import { getOpenFoodFactsContact } from "@/lib/env";
import {
  findProductByGtin,
  finishSyncRun,
  insertPrices,
  lastSuccessfulSync,
  listPreviousPrices,
  saveProviderPolicies,
  startSyncRun,
  upsertEvidence,
  upsertProducts,
  upsertStores,
  type ProductRow,
  type StoredProduct,
} from "@/lib/db/grocery";
import { canonicalGtin, isRestrictedGtin } from "./gtin";
import { normalizeName, variantOf } from "./normalize";
import { isSourceEnabled } from "./policy";
import { PROVIDERS, type ProviderId } from "./providers";
import { fetchOffProduct, OFF_CACHE_DAYS, offUserAgent, type OffProduct } from "./providers/open-food-facts";
import { fetchOpenPrices, openPricesFact, type OpenPricesRecord } from "./providers/open-prices";
import { checkFact, countIssues, isRejected, responseIssues, type QualityIssue } from "./quality";

export type SyncResult = {
  providerId: ProviderId;
  status: "ok" | "partial" | "failed" | "skipped";
  fetched: number;
  imported: number;
  rejected: number;
  duplicates: number;
  issues: Record<string, number>;
  message: string;
};

/** The registry in code, copied into grocery_providers with whether each source runs now. */
export async function syncProviderPolicies(): Promise<void> {
  await saveProviderPolicies(
    PROVIDERS.map((provider) => ({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      authorization_personal: provider.authorization.personal,
      authorization_commercial: provider.authorization.commercial,
      license: provider.license,
      enabled: isSourceEnabled(provider.id),
    })),
  );
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Open Prices, Poland only: the PLN prices added since the last good sync
 * (two days of overlap; everything on the first run), checked, deduplicated
 * and stored with their shop, product and proof. A failure leaves what is
 * stored untouched and is recorded on the provider.
 */
export async function syncOpenPrices(options: { full?: boolean } = {}): Promise<SyncResult> {
  const providerId = "open-prices" as const;
  const base = { providerId, fetched: 0, imported: 0, rejected: 0, duplicates: 0, issues: {} };
  if (!isSourceEnabled(providerId)) return { ...base, status: "skipped", message: "Open Prices: wyłączone." };
  await syncProviderPolicies();
  const runId = await startSyncRun(providerId);
  const today = todayIso();
  try {
    const last = options.full ? null : await lastSuccessfulSync(providerId);
    const since = last ? addDays(last.slice(0, 10), -2) : null;
    const read = await fetchOpenPrices(since, today, {
      userAgent: offUserAgent(getOpenFoodFactsContact()),
      maxPages: since ? 10 : 30,
    });
    if (read.pagesRead === 0) throw new Error(read.error ?? "Open Prices nie odpowiedziało.");

    const parseRejected = Object.values(read.rejected).reduce((sum, count) => sum + (count ?? 0), 0);
    const fetched = read.records.length + parseRejected;
    const health = responseIssues({ fetched, unreadable: read.rejected.unreadable ?? 0 });
    if (isRejected(health)) throw new Error(health[0].message);

    const previous = await listPreviousPrices(read.records.flatMap((record) => (record.gtin ? [record.gtin] : [])));
    const seen = new Set<string>();
    const issueLists: QualityIssue[][] = [];
    const kept: OpenPricesRecord[] = [];
    for (const record of read.records) {
      const issues = checkFact(openPricesFact(record), {
        today,
        seen,
        previous: record.gtin ? previous.get(`${record.store.retailer}|${record.gtin}`) : undefined,
      });
      issueLists.push(issues);
      if (!isRejected(issues)) kept.push(record);
    }

    const stores = await upsertStores(
      [...new Map(kept.map((record) => [record.store.recordId, record.store])).values()].map((store) => ({
        retailer_id: store.retailer,
        provider_id: providerId,
        provider_record_id: store.recordId,
        name: store.name,
        city: store.city,
        postcode: store.postcode,
        country_code: "PL" as const,
        lat: store.lat,
        lon: store.lon,
        channel: "store" as const,
      })),
    );

    // A canonical product only for a global barcode: a chain's own short code means nothing elsewhere.
    const products = await upsertProducts(
      kept.flatMap((record): ProductRow[] =>
        record.gtin && !isRestrictedGtin(record.gtin)
          ? [
              {
                gtin: record.gtin,
                name: record.productName,
                normalized_name: normalizeName(record.productName),
                brand: record.brand,
                category: record.categories[0] ?? null,
                pack_quantity: record.pack?.amount ?? null,
                pack_unit: record.pack?.unit ?? null,
                variant: variantOf(record.productName),
                nutrition: null,
                ingredients_text: null,
                // Open Prices carries Open Food Facts' product data for the barcode.
                source_provider_id: "open-food-facts",
                source_record_id: record.gtin,
                source_url: null,
                fetched_at: new Date().toISOString(),
              },
            ]
          : [],
      ),
      { keepExisting: true },
    );

    const evidence = await upsertEvidence(
      kept.map((record) => {
        const original = {
          id: record.openPricesId,
          date: record.observedOn,
          price_grosz: record.amountGrosz,
          discount_type: record.discountType,
          proof_type: record.proofType,
          product: record.productName,
          store: record.store.name,
          city: record.store.city,
        };
        return {
          provider_id: providerId,
          provider_record_id: record.recordId,
          evidence_type: record.proofType === "PRICE_TAG" ? ("price_tag" as const) : record.proofType === "RECEIPT" ? ("receipt" as const) : ("api_record" as const),
          source_url: record.url,
          captured_at: new Date().toISOString(),
          original,
          content_hash: sha256(original),
          license: "ODbL 1.0 (Open Prices)",
          verification: "verified" as const,
          private: false,
        };
      }),
    );

    const imported = await insertPrices(
      kept.map((record) => {
        const fact = openPricesFact(record);
        return {
          provider_id: providerId,
          provider_record_id: record.recordId,
          retailer_id: record.store.retailer,
          product_id: record.gtin ? (products.get(record.gtin) ?? null) : null,
          store_id: stores.get(record.store.recordId) ?? null,
          product_name: record.productName,
          gtin: record.gtin,
          amount_grosz: record.amountGrosz,
          currency: "PLN" as const,
          price_per: record.per,
          pack_quantity: record.per === "pack" ? (record.pack?.amount ?? null) : null,
          pack_unit: record.per === "pack" ? (record.pack?.unit ?? null) : null,
          price_type: record.priceType,
          regular_amount_grosz: record.regularGrosz,
          kind: "community" as const,
          observed_at: fact.observedAt,
          valid_from: null,
          valid_to: null,
          loyalty_program: fact.conditions.loyaltyProgram,
          app_only: fact.conditions.appOnly,
          min_quantity: 1,
          multibuy: fact.conditions.multibuy,
          deposit_grosz: 0,
          conditions_text: fact.conditions.text,
          evidence_id: evidence.get(record.recordId) ?? null,
          verification: "verified" as const,
          region: record.store.city,
        };
      }),
    );

    const qualityRejected = read.records.length - kept.length;
    const issues = { ...(read.rejected as Record<string, number>), ...(countIssues(issueLists) as Record<string, number>) };
    const result: SyncResult = {
      providerId,
      status: read.error ? "partial" : "ok",
      fetched,
      imported,
      rejected: parseRejected + qualityRejected,
      duplicates: kept.length - imported,
      issues,
      message: `Open Prices: ${imported} nowych cen z Polski${read.error ? ` (przerwane: ${read.error})` : ""}.`,
    };
    await finishSyncRun(runId, providerId, { ...result, error: read.error });
    console.info(`[grocery] open-prices: ${JSON.stringify({ ...result, since })}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Open Prices: nieznany błąd.";
    await finishSyncRun(runId, providerId, { status: "failed", error: message });
    console.error("[grocery] open-prices sync failed:", error);
    return { ...base, status: "failed", message };
  }
}

function productRow(product: OffProduct): ProductRow {
  return {
    gtin: product.gtin,
    name: product.name,
    normalized_name: normalizeName(product.name),
    brand: product.brand,
    category: product.categories[0] ?? null,
    pack_quantity: product.pack?.amount ?? null,
    pack_unit: product.pack?.unit ?? null,
    variant: variantOf(product.name),
    nutrition: product.nutrition,
    ingredients_text: product.ingredientsText,
    source_provider_id: "open-food-facts",
    source_record_id: product.gtin,
    source_url: product.url,
    fetched_at: new Date().toISOString(),
  };
}

export type ProductLookup =
  | { status: "found"; product: StoredProduct; from: "cache" | "open-food-facts" }
  | { status: "not_found" | "restricted" | "invalid" | "disabled" | "failed"; message: string };

/**
 * What a barcode is: from the cache (30 days), else from Open Food Facts,
 * stored for next time. A chain's in-store code or a bad check digit is
 * answered without asking anyone.
 */
export async function lookupProduct(raw: string): Promise<ProductLookup> {
  const gtin = canonicalGtin(raw);
  if (!gtin) return { status: "invalid", message: "To nie jest poprawny kod EAN (cyfra kontrolna się nie zgadza)." };
  if (isRestrictedGtin(gtin)) {
    return { status: "restricted", message: "To kod wewnętrzny sklepu (towar ważony lub marka sieci): znaczy coś tylko w tej sieci." };
  }
  const cached = await findProductByGtin(gtin);
  const fresh = cached && Date.now() - Date.parse(cached.fetched_at) < OFF_CACHE_DAYS * 86_400_000;
  if (cached && (fresh || !isSourceEnabled("open-food-facts"))) return { status: "found", product: cached, from: "cache" };
  if (!isSourceEnabled("open-food-facts")) return { status: "disabled", message: "Open Food Facts jest wyłączone." };

  const runId = await startSyncRun("open-food-facts");
  try {
    const product = await fetchOffProduct(gtin, offUserAgent(getOpenFoodFactsContact()));
    if (!product) {
      await finishSyncRun(runId, "open-food-facts", { status: "ok", fetched: 1 });
      return cached
        ? { status: "found", product: cached, from: "cache" }
        : { status: "not_found", message: "Open Food Facts nie zna tego kodu." };
    }
    await upsertProducts([productRow(product)]);
    await finishSyncRun(runId, "open-food-facts", { status: "ok", fetched: 1, imported: 1 });
    const stored = await findProductByGtin(gtin);
    return stored ? { status: "found", product: stored, from: "open-food-facts" } : { status: "failed", message: "Nie udało się zapisać produktu." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Open Food Facts: nieznany błąd.";
    await finishSyncRun(runId, "open-food-facts", { status: "failed", error: message });
    return cached ? { status: "found", product: cached, from: "cache" } : { status: "failed", message };
  }
}
