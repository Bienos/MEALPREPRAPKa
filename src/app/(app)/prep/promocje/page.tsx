import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Search, Smartphone } from "lucide-react";

import { DealsRefresh } from "@/components/prep/deals-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { todayIso } from "@/lib/date";
import { listProductLinks, listShopPromos } from "@/lib/db/prices";
import { getSettings } from "@/lib/db/settings";
import { listShoppingItems } from "@/lib/db/shopping";
import type { Unit } from "@/lib/meals/ingredients";
import {
  APP_LABEL,
  countByShop,
  dayLabel,
  discountPercent,
  highlights,
  money,
  selectDeals,
  unitPriceLabel,
  type DealQuery,
  type DealWhen,
} from "@/lib/prices/deals";
import { relevantPromos } from "@/lib/prices/match";
import { priceSource, safeUrl } from "@/lib/prices/source";
import { SHOPS, SHOP_LABELS, type Shop } from "@/lib/prices/types";
import { cn } from "@/lib/utils";
import { refreshFeedsAction, refreshPromosAction, refreshSweepAction } from "../zakupy/actions";

export const dynamic = "force-dynamic";
// The refresh on this screen reads Lidl, the leaflets and the feeds, each in a call of its own.
export const maxDuration = 60;

/** Closest to me first: Lidl, Biedronka, Auchan, Żabka, then the rest. */
const SHOP_ORDER: Shop[] = [
  "lidl",
  "biedronka",
  "auchan",
  "zabka",
  ...SHOPS.filter((shop) => !["lidl", "biedronka", "auchan", "zabka"].includes(shop)),
];
const PAGE = 30;

type Params = { sklep?: string; q?: string; lista?: string; kiedy?: string; n?: string };

/** The address the page would have with some of its choices changed. */
function href(params: Params, change: Partial<Params>): string {
  const next = { ...params, ...change, n: undefined };
  const query = new URLSearchParams(
    Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return `/prep/promocje${query ? `?${query}` : ""}`;
}

export default async function DealsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  const shop = SHOPS.find((option) => option === params.sklep) ?? null;
  const when: DealWhen = params.kiedy === "wkrotce" ? "soon" : "now";
  const mineOnly = params.lista === "1";
  const search = (params.q ?? "").slice(0, 60);
  const limit = Math.min(Math.max(Number(params.n) || PAGE, PAGE), 300);

  const [promos, shopping, links] = await Promise.all([listShopPromos(), listShoppingItems(), listProductLinks()]);
  const items = shopping
    .filter((item) => !item.checked && !item.owned)
    .map((item) => ({ name: item.name, unit: item.unit as Unit | null }));
  const mine = new Set(relevantPromos(items, promos, links).map((promo) => `${promo.shop}|${promo.productKey}`));

  const lastFetch = promos.reduce<string | null>(
    (latest, promo) => (latest === null || promo.fetchedAt > latest ? promo.fetchedAt : latest),
    null,
  );
  const best = highlights(promos, today);

  const query: DealQuery = { today, shop, search, mineOnly, when };
  const deals = selectDeals(promos, query, mine);
  const counts = countByShop(promos, query, mine);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const soonCount = selectDeals(promos, { ...query, shop: null, when: "soon" }, mine).length;
  const shown = deals.slice(0, limit);

  const chip = (active: boolean) =>
    cn(
      "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold",
      active ? "border-primary bg-primary/10 text-primary" : "bg-card",
    );

  return (
    <>
      <Link
        href="/prep/zakupy"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Zakupy
      </Link>
      <PageHeader title="Promocje tygodnia" subtitle="Gazetki i oferty z aplikacji sklepów, w jednym miejscu" />
      <p className="text-sm text-muted-foreground">
        Oferty z gazetek (Blix, lidl.pl) i sklepów internetowych bez potwierdzonej zgody na użycie danych są tu
        orientacyjne.{" "}
        <Link href="/prep/zrodla" className="font-semibold text-primary">
          Źródła danych
        </Link>
      </p>

      <DealsRefresh
        fetchedAt={lastFetch}
        fetchedLabel={lastFetch ? fetchedLabel(lastFetch, settings.timezone) : null}
        onRefresh={refreshPromosAction}
        onRefreshSweep={refreshSweepAction}
        onRefreshFeeds={refreshFeedsAction}
      />

      {best.length > 0 && !search && !shop && !mineOnly && when === "now" ? (
        <section className="flex flex-col gap-3" aria-label="Warto kupić teraz">
          <h2 className="text-xl font-extrabold tracking-tight">Warto kupić teraz</h2>
          <div className="grid gap-3">
            {best.map((group) => (
              <div key={group.label} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
                <Link
                  href={`/prep/promocje?q=${encodeURIComponent(group.item)}`}
                  className="flex items-center justify-between font-bold"
                >
                  {group.label}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
                <ul className="flex flex-col divide-y">
                  {group.deals.map(({ promo, assumed }) => {
                    const unit = unitPriceLabel(promo);
                    const percent = discountPercent(promo);
                    return (
                      <li key={`${promo.shop}|${promo.productKey}`} className="flex items-center gap-3 py-2">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm leading-snug font-semibold">{promo.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {priceSource(promo).label}
                            {promo.validTo ? ` · do ${dayLabel(promo.validTo)}` : ""}
                            {promo.appOnly ? ` · ${APP_LABEL[promo.shop] ?? "w aplikacji"}` : ""}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <span className="font-extrabold tabular-nums">{unit ?? money(promo.promoPrice)}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {assumed ? "ok. " : ""}
                            {money(promo.promoPrice)}
                            {percent ? ` · −${percent}%` : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex gap-2" role="tablist" aria-label="Kiedy">
        <Link
          role="tab"
          aria-selected={when === "now"}
          href={href(params, { kiedy: undefined })}
          className={chip(when === "now")}
        >
          Ten tydzień
        </Link>
        <Link
          role="tab"
          aria-selected={when === "soon"}
          href={href(params, { kiedy: "wkrotce" })}
          className={chip(when === "soon")}
        >
          Następny tydzień
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{soonCount}</span>
        </Link>
        <Link href={href(params, { lista: mineOnly ? undefined : "1" })} className={cn(chip(mineOnly), "ml-auto")}>
          Z mojej listy
        </Link>
      </div>

      <form action="/prep/promocje" className="flex gap-2">
        {shop ? <input type="hidden" name="sklep" value={shop} /> : null}
        {when === "soon" ? <input type="hidden" name="kiedy" value="wkrotce" /> : null}
        {mineOnly ? <input type="hidden" name="lista" value="1" /> : null}
        <label className="relative flex-1">
          <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={search}
            placeholder="Szukaj: kurczak, skyr, ryż…"
            className="h-12 w-full rounded-xl border bg-card pr-4 pl-11 text-base"
          />
        </label>
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">
          Szukaj
        </button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Sklep">
        <Link href={href(params, { sklep: undefined })} className={chip(shop === null)}>
          Wszystkie
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{total}</span>
        </Link>
        {SHOP_ORDER.filter((option) => counts[option] > 0 || option === shop).map((option) => (
          <Link key={option} href={href(params, { sklep: option })} className={chip(shop === option)}>
            {SHOP_LABELS[option]}
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">{counts[option]}</span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-muted-foreground">
          {promos.length === 0
            ? "Brak pobranych promocji. Wejdź w Zakupy i kliknij „Sprawdź promocje”."
            : mineOnly
              ? "Żadna promocja nie pasuje teraz do Twojej listy. Zdejmij „Z mojej listy”, żeby zobaczyć wszystkie."
              : "Nic nie znalazłem. Spróbuj innego słowa albo sklepu."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((promo) => {
            const percent = discountPercent(promo);
            const unit = unitPriceLabel(promo);
            const onList = mine.has(`${promo.shop}|${promo.productKey}`);
            return (
              <li key={`${promo.shop}|${promo.productKey}`}>
                <a
                  href={safeUrl(promo.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted",
                    onList && "border-accent/40 bg-accent/10",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                        {SHOP_LABELS[promo.shop]}
                      </span>
                      {onList ? (
                        <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                          Na Twojej liście
                        </span>
                      ) : null}
                      {promo.appOnly ? (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                          <Smartphone className="size-3.5" />
                          {APP_LABEL[promo.shop] ?? "W aplikacji"}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-semibold leading-snug">{promo.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {promo.multibuy ? `${promo.multibuy} · ` : ""}
                      {promo.validFrom > today ? `od ${dayLabel(promo.validFrom)}` : null}
                      {promo.validFrom > today && promo.validTo ? " " : null}
                      {promo.validTo ? `do ${dayLabel(promo.validTo)}` : null}
                      {unit ? ` · ${unit}` : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {priceSource(promo).label}
                      {priceSource(promo).day ? ` · sprawdzone ${priceSource(promo).day}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 text-right">
                    {percent ? (
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-extrabold text-white">
                        −{percent}%
                      </span>
                    ) : null}
                    <span className="text-xl font-extrabold tabular-nums">{money(promo.promoPrice)}</span>
                    {promo.regularPrice ? (
                      <span className="text-sm text-muted-foreground tabular-nums line-through">
                        {money(promo.regularPrice)}
                      </span>
                    ) : null}
                    <ExternalLink className="mt-1 size-3.5 text-muted-foreground" aria-hidden />
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {deals.length > shown.length ? (
        <Link
          href={`${href(params, {})}${href(params, {}).includes("?") ? "&" : "?"}n=${limit + PAGE}`}
          className="flex h-12 items-center justify-center rounded-xl border bg-card font-bold"
        >
          Pokaż więcej ({deals.length - shown.length})
        </Link>
      ) : null}
    </>
  );
}

/** "20.10, 15:12" in the app's timezone. */
function fetchedLabel(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}, ${part("hour")}:${part("minute")}`;
}
