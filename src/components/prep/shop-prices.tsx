"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Plus, RefreshCw, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import type { RefreshPromosResult } from "@/app/(app)/prep/zakupy/actions";
import { formatAmount, type Unit } from "@/lib/meals/ingredients";
import { buildBasket, type BasketLine, type NeededItem, type PriceOption } from "@/lib/prices/basket";
import { matchPromos, priceKey, type PromoMatch } from "@/lib/prices/match";
import {
  PROMO_SHOPS,
  SHOP_IN,
  SHOP_LABELS,
  SHOPS,
  type ProductLink,
  type Shop,
  type ShopPrice,
  type ShopPromo,
} from "@/lib/prices/types";
import { cn } from "@/lib/utils";

export type ShopPricing = {
  /** Promotions valid today. */
  promos: ShopPromo[];
  prices: ShopPrice[];
  links: ProductLink[];
  /** When Lidl's promotions were last fetched, ready to show ("19.10, 07:02"). */
  fetchedLabel: string | null;
  onRefresh: () => Promise<RefreshPromosResult>;
  onSavePrice: (price: ShopPrice) => Promise<void>;
  onRemovePrice: (itemName: string, shop: Shop) => Promise<void>;
  onAnswer: (itemName: string, shop: Shop, productKey: string, matches: boolean) => Promise<void>;
};

/**
 * "Gdzie taniej?" above the shopping list: what the items still to buy cost at
 * each shop this week. Recalculated on every tap, since ticking an item off
 * the list changes what is left to buy.
 */
export function ShopPrices({ items, pricing }: { items: NeededItem[]; pricing: ShopPricing }) {
  const [prices, setPrices] = useState(pricing.prices);
  const [links, setLinks] = useState(pricing.links);
  const [openShop, setOpenShop] = useState<Shop | null>(null);
  const [editing, setEditing] = useState<{ shop: Shop; item: NeededItem } | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [refreshNote, setRefreshNote] = useState<{ error: boolean; text: string } | null>(null);

  if (items.length === 0) return null;

  const matches = new Map<string, PromoMatch>();
  for (const shop of SHOPS) {
    const shopPromos = pricing.promos.filter((promo) => promo.shop === shop);
    const shopLinks = links.filter((link) => link.shop === shop);
    for (const item of items) matches.set(`${shop}|${item.id}`, matchPromos(item, shopPromos, shopLinks));
  }
  const matchFor = (shop: Shop, item: NeededItem) => matches.get(`${shop}|${item.id}`)!;
  const priceFor = (shop: Shop, item: NeededItem) =>
    prices.find((price) => price.shop === shop && price.itemName === priceKey(item.name)) ?? null;

  const summary = buildBasket(items, SHOPS, (item, shop) => {
    const options: PriceOption[] = matchFor(shop, item).confirmed.map((promo) => ({ kind: "promo", promo }));
    const mine = priceFor(shop, item);
    if (mine) options.push({ kind: "mine", price: mine });
    return options;
  });
  const { compared, split } = summary;
  const onPromo = items.filter((_, index) => summary.shops.some((basket) => basket.lines[index].cost?.onPromo)).length;
  const questions = SHOPS.flatMap((shop) => items.filter((item) => matchFor(shop, item).suggestion));
  const firstAskingShop = SHOPS.find((shop) => items.some((item) => matchFor(shop, item).suggestion)) ?? null;

  function refresh() {
    setRefreshNote(null);
    startRefresh(async () => {
      const result = await pricing.onRefresh();
      if (!result.ok) setRefreshNote({ error: true, text: result.message });
      else if (result.count === 0) setRefreshNote({ error: false, text: "Lidl nie pokazuje teraz promocji na stronie" });
    });
  }

  function answer(shop: Shop, item: NeededItem, promo: ShopPromo, isMatch: boolean) {
    const itemName = priceKey(item.name);
    setLinks((current) => [
      ...current.filter((link) => !(link.shop === shop && link.itemName === itemName && link.productKey === promo.productKey)),
      { itemName, shop, productKey: promo.productKey, matches: isMatch },
    ]);
    void pricing.onAnswer(item.name, shop, promo.productKey, isMatch);
  }

  function savePrice(price: ShopPrice) {
    setPrices((current) => [
      ...current.filter((existing) => !(existing.shop === price.shop && existing.itemName === price.itemName)),
      price,
    ]);
    setEditing(null);
    void pricing.onSavePrice(price);
  }

  function removePrice(shop: Shop, item: NeededItem) {
    const itemName = priceKey(item.name);
    setPrices((current) => current.filter((price) => !(price.shop === shop && price.itemName === itemName)));
    setEditing(null);
    void pricing.onRemovePrice(itemName, shop);
  }

  const detail = openShop ? summary.shops.find((basket) => basket.shop === openShop)! : null;

  return (
    <Card className="gap-3 p-4">
      <p className="text-lg font-extrabold">Gdzie taniej?</p>

      <ul className="flex flex-col gap-2">
        {summary.shops.map((basket) => {
          const value = compared.count > 0 ? compared.totals[basket.shop] : basket.priced > 0 ? basket.total : null;
          const cheaper = compared.cheapest === basket.shop;
          return (
            <li key={basket.shop}>
              <button
                type="button"
                onClick={() => setOpenShop(basket.shop)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors hover:bg-muted",
                  cheaper ? "border-accent/40 bg-accent/10" : "bg-card",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{SHOP_LABELS[basket.shop]}</span>
                  {compared.count === 0 ? (
                    <span className="block text-xs font-semibold text-muted-foreground">
                      {basket.priced} z {summary.itemCount} z ceną
                    </span>
                  ) : null}
                </span>
                {cheaper ? (
                  <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">taniej</span>
                ) : null}
                <span className="text-lg font-extrabold tabular-nums">{value === null ? "—" : formatTotal(value)}</span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">
          {compared.count > 0
            ? `Wycenione w obu: ${compared.count} z ${summary.itemCount}`
            : "Dodaj ceny w obu sklepach, żeby porównać"}
          {onPromo > 0 ? ` · ${onPromo} w promocji` : ""}
        </p>
        {split ? (
          <p className="font-semibold">
            Oba sklepy: {formatTotal(split.total)} <span className="text-accent">(−{formatTotal(split.savings)})</span>
          </p>
        ) : null}
        {firstAskingShop ? (
          <button
            type="button"
            onClick={() => setOpenShop(firstAskingShop)}
            className="w-fit text-left font-semibold text-primary"
          >
            Pasuje? {questions.length} {plural(questions.length, "promocja", "promocje", "promocji")} do sprawdzenia
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t pt-3">
        <p className={cn("min-w-0 flex-1 text-xs", refreshNote?.error ? "text-destructive" : "text-muted-foreground")}>
          {refreshNote?.text ??
            (pricing.fetchedLabel ? `Promocje Lidla z ${pricing.fetchedLabel}` : "Promocje Lidla jeszcze nie sprawdzone")}
        </p>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh}>
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          {refreshing ? "Sprawdzam…" : "Sprawdź promocje"}
        </Button>
      </div>

      <Sheet
        // One sheet per shop, so another shop opens scrolled to the top; editing a price keeps the place.
        key={openShop ?? "closed"}
        open={openShop !== null && editing === null}
        onClose={() => setOpenShop(null)}
        title={detail ? SHOP_LABELS[detail.shop] : ""}
      >
        {detail ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Razem {formatPrice(detail.total)} za {detail.priced} z {summary.itemCount}
              {detail.onPromo > 0 ? ` · ${detail.onPromo} w promocji` : ""}
            </p>
            {!PROMO_SHOPS.includes(detail.shop) ? (
              <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                {SHOP_LABELS[detail.shop]} pokazuje promocje tylko jako obrazki gazetki, więc tu liczą się Twoje ceny.
              </p>
            ) : null}
            <ul className="rounded-xl border bg-card">
              {detail.lines.map((line) => (
                <LineRow
                  key={line.item.id}
                  line={line}
                  suggestion={matchFor(detail.shop, line.item).suggestion}
                  onAnswer={(promo, isMatch) => answer(detail.shop, line.item, promo, isMatch)}
                  onEdit={() => setEditing({ shop: detail.shop, item: line.item })}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Cena ${SHOP_IN[editing.shop]}` : ""}
      >
        {editing ? (
          <PriceForm
            key={`${editing.shop}|${editing.item.id}`}
            item={editing.item}
            shop={editing.shop}
            existing={priceFor(editing.shop, editing.item)}
            onSave={savePrice}
            onRemove={() => removePrice(editing.shop, editing.item)}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

/* Shop detail ---------------------------------------------------------------- */

function LineRow({
  line,
  suggestion,
  onAnswer,
  onEdit,
}: {
  line: BasketLine;
  suggestion: ShopPromo | null;
  onAnswer: (promo: ShopPromo, isMatch: boolean) => void;
  onEdit: () => void;
}) {
  const { item, cost } = line;
  const amount = formatAmount(item.quantity, item.unit);

  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold first-letter:uppercase">
            {item.name} {amount ? <span className="text-sm font-normal text-muted-foreground">{amount}</span> : null}
          </p>
          <CostDetail line={line} />
        </div>
        {cost ? (
          <button type="button" onClick={onEdit} className="flex shrink-0 flex-col items-end">
            <span className="font-extrabold tabular-nums">{formatPrice(cost.amount)}</span>
            <span className="text-xs font-semibold text-primary">
              {cost.option.kind === "mine" ? "Zmień" : "Twoja cena"}
            </span>
          </button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onEdit}>
            <Plus className="size-4" />
            Dodaj cenę
          </Button>
        )}
      </div>
      {suggestion ? <Suggestion promo={suggestion} onAnswer={(isMatch) => onAnswer(suggestion, isMatch)} /> : null}
    </li>
  );
}

function CostDetail({ line }: { line: BasketLine }) {
  const { cost, item } = line;
  if (!cost) {
    return (
      <p className="text-sm text-muted-foreground">
        {line.missing === "unit" ? "Cena w innej jednostce niż na liście" : "bez ceny"}
      </p>
    );
  }

  if (cost.option.kind === "mine") {
    const price = cost.option.price;
    return (
      <p className="text-sm text-muted-foreground">
        {packsLabel(cost.packs, price.packQuantity, price.packUnit)} po {formatPrice(price.price)}
        {price.productLabel ? ` · ${price.productLabel}` : ""}
      </p>
    );
  }

  const promo = cost.option.promo;
  const discount =
    promo.regularPrice && promo.regularPrice > promo.promoPrice
      ? `−${Math.round((1 - promo.promoPrice / promo.regularPrice) * 100)}%`
      : "promocja";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        {promo.name} ·{" "}
        {promo.loose
          ? `${formatAmount(item.quantity, item.unit) ?? "1 opak."} na wagę`
          : packsLabel(cost.packs, promo.packQuantity, promo.packUnit)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {cost.onPromo ? (
          <Badge tone="promo">{promo.multibuy ?? discount}</Badge>
        ) : (
          <Badge tone="muted">promocja od {promo.multibuyMin} opak.</Badge>
        )}
        {promo.appOnly ? (
          <Badge tone="app">
            <Smartphone className="size-3" />
            aplikacja
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function Suggestion({ promo, onAnswer }: { promo: ShopPromo; onAnswer: (isMatch: boolean) => void }) {
  const pack = formatAmount(promo.packQuantity, promo.packUnit);
  const price = formatPrice(promo.promoPrice);
  const facts = [
    ...(promo.loose ? [`${price} za ${pack ?? "opak."}`, "na wagę"] : [pack, price]),
    promo.multibuy,
    promo.appOnly ? "aplikacja" : null,
  ];
  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Pasuje?</p>
        <p className="text-sm font-semibold">{promo.name}</p>
        <p className="text-xs text-muted-foreground">{facts.filter(Boolean).join(" · ")}</p>
      </div>
      <button
        type="button"
        onClick={() => onAnswer(true)}
        className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"
      >
        Tak
      </button>
      <button
        type="button"
        onClick={() => onAnswer(false)}
        className="h-10 shrink-0 rounded-full border bg-card px-4 text-sm font-bold"
      >
        Nie
      </button>
    </div>
  );
}

function Badge({ tone, children }: { tone: "promo" | "app" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
        tone === "promo" && "bg-primary/15 text-primary",
        tone === "app" && "bg-accent/15 text-accent",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/* Price form ----------------------------------------------------------------- */

const UNITS: Unit[] = ["g", "ml", "szt"];
const QUICK_PACKS: Record<Unit, number[]> = { g: [250, 500, 1000], ml: [500, 1000], szt: [1, 10, 30] };

function PriceForm({
  item,
  shop,
  existing,
  onSave,
  onRemove,
}: {
  item: NeededItem;
  shop: Shop;
  existing: ShopPrice | null;
  onSave: (price: ShopPrice) => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState(existing ? decimalText(existing.price) : "");
  const [quantity, setQuantity] = useState(existing ? decimalText(existing.packQuantity) : "");
  const [unit, setUnit] = useState<Unit>(existing?.packUnit ?? item.unit ?? "szt");
  const [label, setLabel] = useState(existing?.productLabel ?? "");

  const parsedPrice = parseDecimal(price);
  const parsedQuantity = parseDecimal(quantity);
  const valid = parsedPrice !== null && parsedPrice > 0 && parsedQuantity !== null && parsedQuantity > 0;
  const amount = formatAmount(item.quantity, item.unit);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsedPrice === null || parsedQuantity === null || !valid) return;
        onSave({
          itemName: priceKey(item.name),
          shop,
          productLabel: label.trim(),
          packQuantity: parsedQuantity,
          packUnit: unit,
          price: parsedPrice,
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Na liście: <span className="inline-block font-semibold text-foreground first-letter:uppercase">{item.name}</span>
        {amount ? ` · ${amount}` : ""}. Cena zostaje, aż ją zmienisz.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Cena za opakowanie (zł)</span>
        <Input inputMode="decimal" placeholder="np. 12,99" value={price} onChange={(event) => setPrice(event.target.value)} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Opakowanie</span>
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            aria-label="Ilość w opakowaniu"
            placeholder="np. 500"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-28"
          />
          <div className="flex flex-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="Jednostka">
            {UNITS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={unit === option}
                onClick={() => setUnit(option)}
                className={cn(
                  "h-10 flex-1 rounded-full text-sm font-bold",
                  unit === option ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_PACKS[unit].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setQuantity(String(size))}
              className="h-9 rounded-full border bg-card px-3 text-sm font-semibold"
            >
              {formatAmount(size, unit)}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Produkt (opcjonalnie)</span>
        <Input placeholder="np. Filet z piersi, Kraina Mięs" value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>

      <Button type="submit" disabled={!valid}>
        Zapisz cenę
      </Button>
      {existing ? (
        <Button type="button" variant="ghost" onClick={onRemove}>
          Usuń cenę
        </Button>
      ) : null}
    </form>
  );
}

/* Formatting ----------------------------------------------------------------- */

/** "164 zł" from 100 up, "38,40 zł" below. */
function formatTotal(value: number): string {
  return value >= 100 ? `${Math.round(value)} zł` : formatPrice(value);
}

function formatPrice(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} zł`;
}

/** "2 × 500 g" */
function packsLabel(packs: number, packQuantity: number | null, packUnit: Unit | null): string {
  const pack = formatAmount(packQuantity, packUnit);
  return pack ? `${packs} × ${pack}` : `${packs} opak.`;
}

function decimalText(value: number): string {
  return String(value).replace(".", ",");
}

function parseDecimal(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
}

/** Polish plural: 1 promocja, 2–4 promocje, 5+ promocji (12–14 too). */
function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}
