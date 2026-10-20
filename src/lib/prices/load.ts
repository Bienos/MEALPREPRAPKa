import "server-only";

import { APP_TIMEZONE, todayIso } from "@/lib/date";
import { listProductLinks, listShelfPrices, listShopPrices, listShopPromos } from "@/lib/db/prices";
import { listShoppingItems } from "@/lib/db/shopping";
import type { Unit } from "@/lib/meals/ingredients";
import { isPromoActive } from "./basket";
import { LIDL_EVERYDAY } from "./lidl-everyday";
import { relevantPromos } from "./match";
import type { ProductLink, ShopPrice, ShopPromo } from "./types";

export type PricingData = {
  /** Promotions valid today, and shelf prices read in the last month. */
  promos: ShopPromo[];
  prices: ShopPrice[];
  links: ProductLink[];
  /** When promotions were last fetched, ready to show ("19.10, 07:02"). */
  fetchedLabel: string | null;
};

/** What the "Gdzie taniej?" card needs, for any page that shows it. */
export async function loadPricing(): Promise<PricingData> {
  const [promos, shelf, prices, links, shopping] = await Promise.all([
    listShopPromos(),
    listShelfPrices(),
    listShopPrices(),
    listProductLinks(),
    listShoppingItems(),
  ]);
  const items = shopping
    .filter((item) => !item.checked && !item.owned)
    .map((item) => ({ name: item.name, unit: item.unit as Unit | null }));
  const today = todayIso();
  const lastFetch = promos.reduce<string | null>(
    (latest, promo) => (latest === null || promo.fetchedAt > latest ? promo.fetchedAt : latest),
    null,
  );
  return {
    // Leaflet deals and shelf prices go through the same matching; a shelf price is marked `shelf`.
    promos: relevantPromos(
      items,
      [...promos, ...shelf, ...LIDL_EVERYDAY].filter((promo) => isPromoActive(promo, today)),
      links,
    ),
    prices,
    links,
    fetchedLabel: lastFetch ? fetchedLabel(lastFetch) : null,
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
