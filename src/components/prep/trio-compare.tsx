import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

import type { ItemCost, NeededItem } from "@/lib/prices/basket";
import { SHOP_LABELS } from "@/lib/prices/types";
import { TRIO, type TrioShop, type TrioView } from "@/lib/prices/trio";
import { formatAmount } from "@/lib/meals/ingredients";
import { cn } from "@/lib/utils";

/** Rows shown before "Pokaż wszystkie". */
const FIRST_ROWS = 8;

/**
 * Biedronka, Lidl and Auchan side by side for the week's list: one total per
 * shop, who is cheaper on the items all three price, the mix, and every
 * item with its three prices. Tap a total to see that shop's list, tap a
 * price (or the plus) to type your own.
 */
export function TrioCompare({
  view,
  fetchedLabel,
  onOpenShop,
  onEdit,
}: {
  view: TrioView;
  fetchedLabel: string | null;
  onOpenShop: (shop: TrioShop) => void;
  onEdit: (shop: TrioShop, item: NeededItem) => void;
}) {
  const [all, setAll] = useState(false);
  const { common, mix } = view;
  // Items with a price somewhere first, those nobody prices at the end.
  const rows = [...view.rows].sort((a, b) => Number(!hasPrice(a.cells)) - Number(!hasPrice(b.cells)));
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-3" aria-label="Biedronka, Lidl, Auchan">
      <div>
        <p className="font-extrabold">Biedronka · Lidl · Auchan</p>
        <p className="text-xs text-muted-foreground">
          {view.itemCount} {view.itemCount === 1 ? "pozycja" : "pozycji"} do kupienia
          {fetchedLabel ? ` · ceny z ${fetchedLabel}` : ""}
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2">
        {view.totals.map((entry) => {
          const cheaper = common?.cheapest === entry.shop;
          return (
            <li key={entry.shop}>
              <button
                type="button"
                onClick={() => onOpenShop(entry.shop)}
                className={cn(
                  "flex min-h-24 w-full flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted",
                  cheaper ? "border-accent/40 bg-accent/10" : "bg-background",
                )}
              >
                <span className="text-sm font-bold">{SHOP_LABELS[entry.shop]}</span>
                <span className="text-lg font-extrabold tabular-nums">
                  {entry.priced > 0 ? formatTotal(entry.total) : "—"}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {entry.priced} z {view.itemCount}
                  {entry.missing > 0 ? ` · brak ${entry.missing}` : ""}
                </span>
                {cheaper ? <span className="text-xs font-bold text-accent">najtaniej</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 text-sm">
        {common ? (
          <p className="text-muted-foreground">
            Na {common.count} wspólnych {common.count === 1 ? "pozycji" : "pozycjach"}:{" "}
            {[...TRIO]
              .sort((a, b) => common.totals[a] - common.totals[b])
              .map((shop) => `${SHOP_LABELS[shop]} ${formatTotal(common.totals[shop])}`)
              .join(" · ")}
            {common.cheapest ? ` (różnica do ${formatTotal(common.spread)})` : " (bez różnicy)"}
          </p>
        ) : (
          <p className="text-muted-foreground">
            Żadna pozycja nie ma ceny we wszystkich trzech sklepach, więc nie ma uczciwego porównania sumy.
          </p>
        )}
        {mix ? (
          <p className="font-semibold">
            Każde tam, gdzie najtaniej: {formatTotal(mix.total)}
            {mix.savings !== null ? <span className="text-accent"> (−{formatTotal(mix.savings)})</span> : null}
            <span className="font-normal text-muted-foreground">
              {" "}
              ·{" "}
              {TRIO.filter((shop) => mix.perShop[shop] > 0)
                .map((shop) => `${SHOP_LABELS[shop]} ${mix.perShop[shop]}`)
                .join(", ")}
            </span>
          </p>
        ) : null}
        {view.unpriced.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Bez ceny w żadnym z trzech: {view.unpriced.length} (wpisz cenę z półki albo sprawdź promocje).
          </p>
        ) : null}
      </div>

      <ul className="rounded-xl border bg-background">
        {shown.map((row) => {
          const amount = formatAmount(row.item.quantity, row.item.unit);
          return (
            <li key={row.item.id} className="flex flex-col gap-1.5 border-b px-3 py-2.5 last:border-0">
              <p className="text-sm font-semibold first-letter:uppercase">
                {row.item.name}
                {amount ? <span className="font-normal text-muted-foreground"> {amount}</span> : null}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {TRIO.map((shop) => (
                  <PriceCell
                    key={shop}
                    shop={shop}
                    cost={row.cells[shop]}
                    best={row.cheapest === shop}
                    onTap={() => onEdit(shop, row.item)}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > FIRST_ROWS ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className="flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", all && "rotate-180")} />
          {all ? "Mniej pozycji" : `Wszystkie pozycje (${rows.length})`}
        </button>
      ) : null}
    </section>
  );
}

function PriceCell({
  shop,
  cost,
  best,
  onTap,
}: {
  shop: TrioShop;
  cost: ItemCost | null;
  best: boolean;
  onTap: () => void;
}) {
  if (!cost) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-label={`Dodaj cenę, ${SHOP_LABELS[shop]}`}
        className="flex min-h-12 items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-semibold text-muted-foreground hover:bg-muted"
      >
        <Plus className="size-3.5" />
        cena
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${SHOP_LABELS[shop]}: ${formatPrice(cost.amount)}, ${kindOf(cost)}`}
      className={cn(
        "flex min-h-12 flex-col items-start justify-center rounded-lg border px-2 py-1 text-left hover:bg-muted",
        best ? "border-accent/40 bg-accent/10" : "bg-card",
      )}
    >
      <span className={cn("text-sm tabular-nums", best ? "font-extrabold" : "font-bold")}>
        {formatPrice(cost.amount)}
      </span>
      <span className="text-[11px] leading-tight font-semibold text-muted-foreground">{kindOf(cost)}</span>
    </button>
  );
}

/** What the price is, in one or two words; an estimate always says so. */
function kindOf(cost: ItemCost): string {
  const option = cost.option;
  const kind =
    option.kind === "mine"
      ? "moja cena"
      : option.promo.historical
        ? "z paragonu"
        : option.promo.productKey.startsWith("lidl-everyday:")
          ? "stała cena"
          : option.promo.shelf
            ? "półka online"
            : cost.onPromo
              ? "promocja"
              : "gazetka";
  return cost.estimated ? `${kind}, szac.` : kind;
}

function hasPrice(cells: Record<TrioShop, ItemCost | null>): boolean {
  return TRIO.some((shop) => cells[shop]);
}

/** "164 zł" from 100 up, "38,40 zł" below. */
function formatTotal(value: number): string {
  return value >= 100 ? `${Math.round(value)} zł` : formatPrice(value);
}

function formatPrice(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} zł`;
}
