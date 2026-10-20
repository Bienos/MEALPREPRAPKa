import Link from "next/link";
import { ChevronLeft, ExternalLink, Search } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { todayIso } from "@/lib/date";
import { listProductLinks, listShelfPrices, listShopPromos } from "@/lib/db/prices";
import { getSettings } from "@/lib/db/settings";
import { money, quickCompare, unitPriceLabel } from "@/lib/prices/deals";
import { LIDL_EVERYDAY } from "@/lib/prices/lidl-everyday";
import { priceSource } from "@/lib/prices/source";
import { SHOP_LABELS } from "@/lib/prices/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * "Porównaj ceny": type (or dictate) what you want to buy, get the cheapest
 * offer for each at every shop, from the prices already in the database.
 * A GET form, so the address keeps the list and the back button works.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const text = (q ?? "").slice(0, 300);
  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  const items = text
    ? await (async () => {
        const [promos, shelf, links] = await Promise.all([listShopPromos(), listShelfPrices(), listProductLinks()]);
        return quickCompare(text, [...promos, ...shelf, ...LIDL_EVERYDAY], links, today);
      })()
    : [];

  return (
    <>
      <Link
        href="/prep/zakupy"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Zakupy
      </Link>
      <PageHeader title="Porównaj ceny" subtitle="Wpisz albo podyktuj, co chcesz kupić, po przecinku" />

      <form action="/prep/porownaj" className="flex flex-col gap-2">
        <label className="relative">
          <Search className="absolute top-4 left-4 size-5 text-muted-foreground" />
          <textarea
            name="q"
            defaultValue={text}
            rows={2}
            placeholder="np. małe jaja, chleb, mięso drobiowe"
            className="w-full rounded-xl border bg-card py-3 pr-4 pl-11 text-base"
          />
        </label>
        <button type="submit" className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">
          Porównaj
        </button>
      </form>

      {items.map((item) => (
        <section key={item.name} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-extrabold first-letter:uppercase">{item.name}</h2>
          {item.offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Żaden sklep nie ma tego w cenach z bazy. Spróbuj innej nazwy (np. „filet z kurczaka” zamiast „mięso”).
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {item.offers.map((offer, index) => {
                const unit = unitPriceLabel(offer.promo);
                const source = priceSource(offer.promo);
                return (
                  <li key={offer.shop} className={cn("flex items-start gap-3 py-2", index === 0 && "font-semibold")}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="font-bold">{SHOP_LABELS[offer.shop]}</span>
                        {index === 0 ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                            najtaniej
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm leading-snug font-normal">{offer.promo.name}</span>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
                      >
                        {source.label}
                        {source.day ? ` · ${source.day}` : ""}
                        {offer.promo.shelf
                          ? ""
                          : offer.promo.validTo
                            ? ` · do ${offer.promo.validTo.slice(8, 10)}.${offer.promo.validTo.slice(5, 7)}`
                            : ""}
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="font-extrabold tabular-nums">{money(offer.promo.promoPrice)}</span>
                      {unit ? (
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">
                          {offer.assumed ? "ok. " : ""}
                          {unit}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {item.offers.length > 0 && item.missing.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Brak w: {item.missing.map((shop) => SHOP_LABELS[shop]).join(", ")}
            </p>
          ) : null}
        </section>
      ))}

      {items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Najtańsza oferta w każdym sklepie: promocje ważne dziś i ceny z półek sklepów online. „ok.” znaczy, że oferta
          nie podaje wagi i przyjąłem zwykłą. Żeby mieć świeże ceny, odśwież je w Promocjach.
        </p>
      ) : null}
    </>
  );
}
