import "server-only";

import { addDays, APP_TIMEZONE, todayIso } from "@/lib/date";
import { listDeliveryQuotes } from "@/lib/db/delivery";
import { listRecentLedgerPrices, type LedgerPrice } from "@/lib/db/grocery";
import { HISTORY_DAYS } from "@/lib/grocery/eligibility";
import { OPEN_PRICES_ORIGIN } from "@/lib/grocery/providers/open-prices";
import { retailerById } from "@/lib/grocery/retailers";
import type { ShoppingPreferences } from "@/lib/grocery/types";
import { listProductLinks, listShelfPrices, listShopPrices, listShopPromos } from "@/lib/db/prices";
import { getSettings } from "@/lib/db/settings";
import { listShoppingItems } from "@/lib/db/shopping";
import type { Unit } from "@/lib/meals/ingredients";
import { isPromoActive } from "./basket";
import { LIDL_EVERYDAY } from "./lidl-everyday";
import { relevantPromos } from "./match";
import type { DeliveryQuote } from "./delivery";
import type { ProductLink, ShopPrice, ShopPromo } from "./types";

export type PricingData = {
  /** Promotions valid today, and shelf prices read in the last month. */
  promos: ShopPromo[];
  prices: ShopPrice[];
  links: ProductLink[];
  /** When promotions were last fetched, ready to show ("19.10, 07:02"). */
  fetchedLabel: string | null;
  /** Delivery fees as I know them, and the town the comparison is for. */
  quotes: DeliveryQuote[];
  city: string;
  /** How I shop: what the eligibility engine needs to know about me. */
  preferences: ShoppingPreferences;
};

export type { ShoppingPreferences };

/** What the "Gdzie taniej?" card needs, for any page that shows it. */
export async function loadPricing(): Promise<PricingData> {
  const settings = await getSettings();
  const today = todayIso();
  const [promos, shelf, prices, links, shopping, quotes, ledger] = await Promise.all([
    listShopPromos(),
    listShelfPrices(),
    listShopPrices(),
    listProductLinks(),
    listShoppingItems(),
    listDeliveryQuotes(),
    listLedgerSafely(settings.shopping_city, addDays(today, -HISTORY_DAYS)),
  ]);
  const items = shopping
    .filter((item) => !item.checked && !item.owned)
    .map((item) => ({ name: item.name, unit: item.unit as Unit | null }));
  const lastFetch = promos.reduce<string | null>(
    (latest, promo) => (latest === null || promo.fetchedAt > latest ? promo.fetchedAt : latest),
    null,
  );
  const history = ledger.flatMap((row) => ledgerToPromo(row) ?? []);
  return {
    // Leaflet deals, shelf prices and dated history go through the same matching; each is marked for what it is.
    promos: relevantPromos(
      items,
      [...promos, ...shelf, ...LIDL_EVERYDAY, ...history].filter((promo) => isPromoActive(promo, today)),
      links,
    ),
    prices,
    links,
    fetchedLabel: lastFetch ? fetchedLabel(lastFetch) : null,
    quotes,
    city: settings.shopping_city,
    preferences: {
      channel: settings.shopping_channel,
      loyalty: settings.loyalty_programs,
      excludedBrands: settings.excluded_brands,
      preferredRetailers: settings.preferred_retailers,
    },
  };
}

/** Community and receipt history for the town. Before the grocery migration is applied there is none, not an error page. */
async function listLedgerSafely(city: string, since: string): Promise<LedgerPrice[]> {
  try {
    return await listRecentLedgerPrices(city, since);
  } catch (error) {
    console.error("[grocery] history prices unavailable:", error);
    return [];
  }
}

/**
 * A stored observation as a price the card can match: a dated history
 * price ("historical"), valid for the age the eligibility engine allows.
 * Shops of chains the card does not show, and one-off clearance prices,
 * are left out.
 */
export function ledgerToPromo(row: LedgerPrice): ShopPromo | null {
  const shop = row.retailer_id ? retailerById(row.retailer_id)?.shop : null;
  if (!shop || row.price_type === "clearance") return null;
  const observed = row.observed_at.slice(0, 10);
  const byWeight = row.price_per === "kg" || row.price_per === "l";
  const receipt = row.kind === "receipt";
  const where = row.store?.name ? `${row.store.name}, ` : "";
  return {
    shop,
    productKey: row.provider_record_id,
    name: row.product_name,
    packQuantity: byWeight ? 1000 : row.pack_quantity,
    packUnit: byWeight ? (row.price_per === "l" ? "ml" : "g") : row.pack_unit,
    loose: byWeight,
    promoPrice: row.amount_grosz / 100,
    regularPrice: row.regular_amount_grosz !== null ? row.regular_amount_grosz / 100 : null,
    validFrom: observed,
    validTo: addDays(observed, HISTORY_DAYS),
    conditions: `${receipt ? "Twój paragon" : "Paragon lub etykieta (Open Prices)"}: ${where}${observed.slice(8, 10)}.${observed.slice(5, 7)}`,
    appOnly: row.app_only,
    multibuy: row.multibuy,
    multibuyMin: row.min_quantity,
    sourceUrl: row.evidence?.source_url ?? (receipt ? "/prep/paragony" : OPEN_PRICES_ORIGIN),
    fetchedAt: row.observed_at,
    historical: receipt ? "receipt" : "community",
    city: row.region,
  };
}

/** "19.10, 07:02" in the app's timezone. */
function fetchedLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}, ${part("hour")}:${part("minute")}`;
}
