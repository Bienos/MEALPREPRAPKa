"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MapPin,
  PencilLine,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Truck,
} from "lucide-react";

import { BulkPrices, SHOP_ORDER } from "@/components/prep/bulk-prices";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import type { RefreshFeedsResult, RefreshPromosResult, RefreshSweepResult } from "@/app/(app)/prep/zakupy/actions";
import { formatAmount, type Unit } from "@/lib/meals/ingredients";
import { priceSource } from "@/lib/prices/source";
import type { BasketLine, NeededItem } from "@/lib/prices/basket";
import {
  bestOptions,
  handoffFor,
  handoffLabel,
  onlineOptions,
  type DeliveryQuote,
  type OnlineOption,
  type Provider,
} from "@/lib/prices/delivery";
import { matchPromos, priceKey, type PromoMatch } from "@/lib/prices/match";
import {
  SHOP_IN,
  SHOP_LABELS,
  SHOPS,
  type ProductLink,
  type Shop,
  type ShopPrice,
  type ShopPromo,
} from "@/lib/prices/types";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/date";
import { STATE_LABELS, type EligibilityState } from "@/lib/grocery/eligibility";
import { formatGrosz } from "@/lib/grocery/money";
import { TIER_LABELS } from "@/lib/grocery/matching";
import { retailerForShop } from "@/lib/grocery/retailers";
import {
  assessAll,
  CANNOT_DETERMINE,
  verifiedVerdict,
  type HeldOption,
  type PricingContext,
  type Verdict,
} from "@/lib/grocery/pricing";
import {
  LOYALTY_LABELS,
  LOYALTY_PROGRAMS,
  type LoyaltyProgram,
  type ShoppingPreferences,
} from "@/lib/grocery/types";

/** What a leaflet price is for, given with "tak" when the offer does not say. */
export type PackAnswer = { quantity: number; unit: Unit; loose: boolean };

export type ShopPricing = {
  /** Promotions valid today. */
  promos: ShopPromo[];
  prices: ShopPrice[];
  links: ProductLink[];
  /** When promotions were last fetched, ready to show ("19.10, 07:02"). */
  fetchedLabel: string | null;
  /** Delivery fees as I know them, and the town the comparison is for. */
  quotes: DeliveryQuote[];
  city: string;
  /** How I shop: channel, loyalty apps, excluded brands, preferred shops. */
  preferences: ShoppingPreferences;
  onSavePreferences: (preferences: ShoppingPreferences) => Promise<void>;
  onSaveQuote: (quote: DeliveryQuote) => Promise<void>;
  onSetCity: (city: string) => Promise<void>;
  onRefresh: () => Promise<RefreshPromosResult>;
  onRefreshSweep: () => Promise<RefreshSweepResult>;
  onRefreshFeeds: () => Promise<RefreshFeedsResult>;
  onSavePrice: (price: ShopPrice) => Promise<void>;
  onSavePrices: (prices: ShopPrice[]) => Promise<void>;
  onRemovePrice: (itemName: string, shop: Shop) => Promise<void>;
  onAnswer: (
    itemName: string,
    shop: Shop,
    productKey: string,
    matches: boolean,
    pack?: PackAnswer | null,
  ) => Promise<void>;
};

/** The shops I go to, shown before "Wszystkie sklepy". */
const VISIBLE_SHOPS = 4;

/**
 * "Gdzie taniej?": what the items still to buy cost at each shop this week.
 * Recalculated on every tap, since ticking an item off the list changes what
 * is left to buy. Only confirmed promos and my own prices count; leaflet
 * offers wait for a "pasuje?" answer.
 */
export function ShopPrices({ items, pricing }: { items: NeededItem[]; pricing: ShopPricing }) {
  const [prices, setPrices] = useState(pricing.prices);
  const [links, setLinks] = useState(pricing.links);
  const [openShop, setOpenShop] = useState<Shop | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<{
    shop: Shop;
    item: NeededItem;
  } | null>(null);
  const [allShops, setAllShops] = useState(false);
  const [tab, setTab] = useState<"shops" | "delivery">("shops");
  const [quotes, setQuotes] = useState(pricing.quotes);
  const [city, setCity] = useState(pricing.city);
  const [editingCity, setEditingCity] = useState(false);
  const [quoteFor, setQuoteFor] = useState<Provider | null>(null);
  const [preferences, setPreferences] = useState(pricing.preferences);
  const [editingPreferences, setEditingPreferences] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [refreshNote, setRefreshNote] = useState<{
    error: boolean;
    text: string;
  } | null>(null);

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

  // Every price assessed (eligibility, match tier): strict prices decide the verified verdict,
  // the rest counts in the labelled reference totals, anything not counted says why.
  const ctx: PricingContext = {
    today: todayIso(),
    city,
    channel: preferences.channel,
    loyalty: preferences.loyalty,
    excludedBrands: preferences.excludedBrands,
  };
  const { lines: assessed, strict, reference: summary } = assessAll(items, matchFor, priceFor, ctx);
  const verdict = verifiedVerdict(strict, quotes);
  const heldFor = (shop: Shop, item: NeededItem) => assessed.get(`${shop}|${item.id}`)?.held ?? [];
  const { compared, split } = summary;
  const online = onlineOptions(summary, quotes, city);
  const best = bestOptions(summary, online);
  const onPromo = items.filter((_, index) => summary.shops.some((basket) => basket.lines[index].cost?.onPromo)).length;

  // The estimates in use, one per item and shop: what "Pasuje?" asks about.
  const asks = summary.shops.flatMap((basket) =>
    basket.lines.flatMap((line) =>
      line.cost?.estimated && line.cost.option.kind === "promo"
        ? [{ item: line.item, shop: basket.shop, promo: line.cost.option.promo, packAssumed: line.cost.packAssumed }]
        : [],
    ),
  );
  const askGroups = items
    .map((item) => ({
      item,
      asks: asks.filter((ask) => ask.item.id === item.id),
    }))
    .filter((group) => group.asks.length > 0);

  // The shops I go to first, in their order; the rest by how much of my list they price.
  const preferred = SHOP_ORDER.filter((shop) => preferences.preferredRetailers.includes(shop as never));
  const favourites = preferred.length > 0 ? preferred : SHOP_ORDER.slice(0, VISIBLE_SHOPS);
  const rows = [...summary.shops].sort((a, b) => {
    const favA = favourites.indexOf(a.shop);
    const favB = favourites.indexOf(b.shop);
    if (favA !== favB) return (favA === -1 ? 99 : favA) - (favB === -1 ? 99 : favB);
    return b.priced - a.priced || a.total - b.total;
  });
  const shown = allShops ? rows : rows.slice(0, Math.max(VISIBLE_SHOPS, preferred.length));

  function refresh() {
    setRefreshNote(null);
    startRefresh(async () => {
      const result = await pricing.onRefresh();
      const notes: string[] = [];
      if (!result.ok) {
        setRefreshNote({ error: true, text: result.message });
        return;
      }
      notes.push(...result.warnings);
      if (result.count === 0) notes.push("Sklepy nie pokazują teraz promocji z Twojej listy");
      // Every offer of every leaflet, then Stokrotka's product feed: each a request of its own (up to a minute).
      const sweep = await pricing.onRefreshSweep();
      if (!sweep.ok) notes.push(sweep.message);
      else if (!sweep.complete) {
        notes.push(`Gazetki: przeczytano ${sweep.pagesRead} z ${sweep.pagesTotal} stron, kliknij jeszcze raz.`);
      }
      const feeds = await pricing.onRefreshFeeds();
      if (!feeds.ok) notes.push(feeds.message);
      else notes.push(...feeds.notes);
      setRefreshNote(notes.length > 0 ? { error: false, text: notes.join(" ") } : null);
    });
  }

  function answer(shop: Shop, item: NeededItem, promo: ShopPromo, isMatch: boolean, pack: PackAnswer | null) {
    const itemName = priceKey(item.name);
    setLinks((current) => [
      ...current.filter(
        (link) => !(link.shop === shop && link.itemName === itemName && link.productKey === promo.productKey),
      ),
      {
        itemName,
        shop,
        productKey: promo.productKey,
        matches: isMatch,
        packQuantity: pack?.quantity ?? null,
        packUnit: pack?.unit ?? null,
        packLoose: pack?.loose ?? false,
      },
    ]);
    void pricing.onAnswer(item.name, shop, promo.productKey, isMatch, pack);
  }

  function savePrice(price: ShopPrice) {
    setPrices((current) => [
      ...current.filter((existing) => !(existing.shop === price.shop && existing.itemName === price.itemName)),
      price,
    ]);
    setEditing(null);
    void pricing.onSavePrice(price);
  }

  function savePrices(list: ShopPrice[]) {
    if (list.length === 0) return;
    setPrices((current) => [
      ...current.filter(
        (existing) => !list.some((price) => price.shop === existing.shop && price.itemName === existing.itemName),
      ),
      ...list,
    ]);
    void pricing.onSavePrices(list);
  }

  function removePrice(shop: Shop, item: NeededItem) {
    const itemName = priceKey(item.name);
    setPrices((current) => current.filter((price) => !(price.shop === shop && price.itemName === itemName)));
    setEditing(null);
    void pricing.onRemovePrice(itemName, shop);
  }

  function saveQuote(quote: DeliveryQuote) {
    setQuotes((current) => [...current.filter((one) => one.provider !== quote.provider), quote]);
    setQuoteFor(null);
    void pricing.onSaveQuote(quote);
  }

  function savePreferences(next: ShoppingPreferences) {
    setPreferences(next);
    setEditingPreferences(false);
    void pricing.onSavePreferences(next);
  }

  function saveCity(value: string) {
    const next = value.trim();
    setEditingCity(false);
    if (next.length < 2 || next === city) return;
    setCity(next);
    void pricing.onSetCity(next);
  }

  const detail = openShop ? summary.shops.find((basket) => basket.shop === openShop)! : null;
  // Exact prices first, then estimates, then what has no price.
  const detailLines = detail ? [...detail.lines].sort((a, b) => lineOrder(a) - lineOrder(b)) : [];
  function lineOrder(line: BasketLine): number {
    return line.cost ? (line.cost.estimated ? 1 : 0) : 2;
  }

  return (
    <Card className="gap-3 p-4">
      <div>
        <p className="text-lg font-extrabold">Gdzie najtaniej?</p>
        <p className="text-sm text-muted-foreground">
          Dla tego, co zostało do kupienia. Każda cena ma źródło, datę i to, na ile jej ufać.
        </p>
      </div>

      <VerifiedVerdict verdict={verdict} />

      {best.shop || best.online || best.split ? (
        <p className="-mb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Orientacyjnie, ze wszystkich danych
        </p>
      ) : null}
      {best.shop || best.online || best.split ? (
        <ul className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
          {best.shop?.kind === "shop" ? (
            <li className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {!best.shop.complete ? "Najpełniej" : retailerForShop(best.shop.shop)?.stores === false ? "Online" : "W sklepie"}
              </span>
              <span className="min-w-0 flex-1 font-semibold">
                {SHOP_LABELS[best.shop.shop]}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {best.shop.complete ? "cała lista" : "niepełny koszyk"},{" "}
                  {summary.itemCount - best.shop.missing} z {summary.itemCount}
                  {best.shop.estimated > 0 ? `, ${best.shop.estimated} do potwierdzenia` : ""}
                  {best.shop.missing > 0 ? `, ${best.shop.missing} bez ceny` : ""}
                </span>
              </span>
              <span className="font-extrabold tabular-nums">{formatTotal(best.shop.total)}</span>
            </li>
          ) : null}
          {best.online?.kind === "online" ? (
            <li className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Z dostawą
              </span>
              <span className="min-w-0 flex-1 font-semibold">
                {best.online.option.provider.label}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · dostawa {formatTotal(best.online.option.fee ?? 0)}
                  {best.online.option.feeStatus === "estimate" ? " (szac.)" : ""}
                  {best.online.option.missing > 0 ? `, ${best.online.option.missing} bez ceny` : ""}
                </span>
              </span>
              <span className="font-extrabold tabular-nums">{formatTotal(best.online.option.total!)}</span>
            </li>
          ) : null}
          {best.split?.kind === "split" ? (
            <li className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Dwa sklepy
              </span>
              <span className="min-w-0 flex-1 font-semibold">
                Każde tam, gdzie taniej
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {best.split.count} porównanych, oszczędzasz {formatTotal(best.split.savings)}
                </span>
              </span>
              <span className="font-extrabold tabular-nums">{formatTotal(best.split.total)}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="flex gap-2" role="tablist" aria-label="Porównanie">
        {(
          [
            ["shops", "Sklepy"],
            ["delivery", "Dostawa"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-bold",
              tab === key ? "border-primary bg-primary/10 text-primary" : "bg-card",
            )}
          >
            {key === "delivery" ? <Truck className="size-4" /> : null}
            {label}
          </button>
        ))}
      </div>

      {tab === "delivery" ? (
        <DeliveryPanel
          options={online}
          city={city}
          editingCity={editingCity}
          onEditCity={() => setEditingCity(true)}
          onSaveCity={saveCity}
          onOpen={(shop) => setOpenShop(shop)}
          onQuote={(provider) => setQuoteFor(provider)}
          itemCount={summary.itemCount}
        />
      ) : null}

      <ul className={cn("flex flex-col gap-2", tab !== "shops" && "hidden")}>
        {shown.map((basket) => {
          // Only a fair claim when the comparison covers most of the list.
          const cheaper = compared.cheapest === basket.shop && compared.count >= summary.itemCount * 0.6;
          const facts = [
            basket.priced > 0 ? `${basket.priced} z ${summary.itemCount} z ceną` : "brak cen",
            ...stateFacts(basket.states),
          ].filter(Boolean);
          return (
            <li key={basket.shop}>
              <button
                type="button"
                onClick={() => setOpenShop(basket.shop)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-2 text-left transition-colors hover:bg-muted",
                  cheaper ? "border-accent/40 bg-accent/10" : "bg-card",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{SHOP_LABELS[basket.shop]}</span>
                  <span className="block text-xs font-semibold text-muted-foreground">{facts.join(" · ")}</span>
                </span>
                {cheaper ? (
                  <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                    taniej
                  </span>
                ) : null}
                {basket.priced > 0 ? (
                  <span className="text-lg font-extrabold tabular-nums">{formatTotal(basket.total)}</span>
                ) : null}
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {tab === "shops" && (rows.length > shown.length || allShops) ? (
        <button
          type="button"
          onClick={() => setAllShops((value) => !value)}
          className="flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", allShops && "rotate-180")} />
          {allShops ? "Mniej sklepów" : `Wszystkie sklepy (${rows.length})`}
        </button>
      ) : null}

      <div className={cn("flex flex-col gap-1 text-sm", tab !== "shops" && "hidden")}>
        <p className="text-muted-foreground">
          {compared.count > 0
            ? `Porównane ${compared.shops.length === 2 ? "w obu" : `w ${compared.shops.length} sklepach`}: ${compared.count} z ${summary.itemCount}`
            : pricing.fetchedLabel
              ? "Za mało cen, żeby porównać sklepy. Dodaj własne albo wpisz ceny z półki"
              : "Kliknij „Sprawdź promocje”, żeby zobaczyć ceny z gazetek"}
          {onPromo > 0 ? ` · ${onPromo} w promocji` : ""}
        </p>
        {compared.count > 0 ? (
          <p className="text-muted-foreground">
            Na tych {compared.count} pozycjach:{" "}
            {compared.shops
              .toSorted((a, b) => compared.totals[a]! - compared.totals[b]!)
              .map((shop) => `${SHOP_LABELS[shop]} ${formatTotal(compared.totals[shop]!)}`)
              .join(" · ")}
          </p>
        ) : null}
        {split ? (
          <p className="font-semibold">
            Każde tam, gdzie taniej: {formatTotal(split.total)}{" "}
            <span className="text-accent">(−{formatTotal(split.savings)})</span>
          </p>
        ) : null}
        {asks.length > 0 ? (
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="w-fit text-left font-semibold text-primary"
          >
            Pasuje? Potwierdź {asks.length} {plural(asks.length, "produkt", "produkty", "produktów")}
          </button>
        ) : null}
      </div>

      <Button variant="outline" onClick={() => setBulkOpen(true)}>
        <PencilLine className="size-4" />
        Wpisz ceny z półki
      </Button>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
        <button type="button" onClick={() => setEditingPreferences(true)} className="flex items-center gap-1 text-primary">
          <Settings2 className="size-4" />
          Jak robię zakupy
        </button>
        <Link href="/prep/zrodla" className="flex items-center gap-1 text-primary">
          <ShieldCheck className="size-4" />
          Źródła danych
        </Link>
        <Link href="/prep/paragony" className="text-primary">
          Paragony
        </Link>
      </div>

      {editingPreferences ? (
        <PreferencesSheet
          preferences={preferences}
          onSave={savePreferences}
          onClose={() => setEditingPreferences(false)}
        />
      ) : null}

      {quoteFor ? (
        <QuoteSheet
          provider={quoteFor}
          quote={quotes.find((one) => one.provider === quoteFor.id)}
          onSave={saveQuote}
          onClose={() => setQuoteFor(null)}
        />
      ) : null}
      <BulkPrices
        open={bulkOpen && editing === null}
        onClose={() => setBulkOpen(false)}
        items={items}
        prices={prices}
        onSave={savePrices}
      />

      <div className="flex items-center gap-3 border-t pt-3">
        <p className={cn("min-w-0 flex-1 text-xs", refreshNote?.error ? "text-destructive" : "text-muted-foreground")}>
          {refreshNote?.text ??
            (pricing.fetchedLabel ? `Promocje z ${pricing.fetchedLabel}` : "Promocje jeszcze nie sprawdzone")}
        </p>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh}>
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          {refreshing ? "Sprawdzam…" : "Sprawdź promocje i ceny"}
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
              {detail.priced > 0
                ? `Razem ${formatPrice(detail.total)} za ${detail.priced} z ${summary.itemCount}`
                : "Jeszcze nic z listy nie ma tu ceny"}
              {detail.estimated > 0 ? ` · ${detail.estimated} produktów do potwierdzenia („Pasuje?”)` : ""}
            </p>
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              Przy każdej cenie: skąd jest, z którego dnia i na ile jej ufać. „Zweryfikowana” to aktualna cena ze
              źródła, które pozwala jej używać; „źródło niezweryfikowane”, „historyczna” i „szacunek” liczą się tylko
              orientacyjnie. „Tak” potwierdza produkt, „Nie” szuka następnego. Bierzemy tyle opakowań, żeby
              wystarczyło.
            </p>
            <ul className="rounded-xl border bg-card">
              {detailLines.map((line) => (
                <LineRow
                  key={line.item.id}
                  line={line}
                  held={heldFor(detail.shop, line.item)}
                  fetched={pricing.fetchedLabel !== null}
                  onAnswer={(promo, isMatch, pack) => answer(detail.shop, line.item, promo, isMatch, pack)}
                  onEdit={() => setEditing({ shop: detail.shop, item: line.item })}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={reviewing && editing === null} onClose={() => setReviewing(false)} title="Pasuje?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Te ceny są już policzone jako szacunki. „Tak” robi z nich pewne i zostaje na kolejne tygodnie, „Nie” szuka
            następnej oferty.
          </p>
          {askGroups.map(({ item, asks: itemAsks }) => (
            <section key={item.id} className="flex flex-col gap-2">
              <p className="font-bold first-letter:uppercase">
                {item.name}{" "}
                {formatAmount(item.quantity, item.unit) ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    {formatAmount(item.quantity, item.unit)}
                  </span>
                ) : null}
              </p>
              {itemAsks.map(({ shop, promo, packAssumed }) => (
                <Suggestion
                  key={`${shop}|${promo.productKey}`}
                  promo={promo}
                  packAssumed={packAssumed}
                  item={item}
                  showShop
                  onAnswer={(isMatch, pack) => answer(shop, item, promo, isMatch, pack)}
                />
              ))}
            </section>
          ))}
          {askGroups.length === 0 ? <p className="text-sm font-semibold">Wszystko sprawdzone.</p> : null}
        </div>
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
  held,
  fetched,
  onAnswer,
  onEdit,
}: {
  line: BasketLine;
  /** Prices for this item that are not counted, with why (an app I lack, a substitution to approve). */
  held: HeldOption[];
  /** Promotions were fetched at least once, so a missing price means "not in the leaflet". */
  fetched: boolean;
  onAnswer: (promo: ShopPromo, isMatch: boolean, pack: PackAnswer | null) => void;
  onEdit: () => void;
}) {
  const { item, cost } = line;
  const amount = formatAmount(item.quantity, item.unit);
  const estimate = cost?.estimated && cost.option.kind === "promo" ? cost.option.promo : null;

  return (
    <li className="flex flex-col gap-2 border-b px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold first-letter:uppercase">
            {item.name} {amount ? <span className="text-sm font-normal text-muted-foreground">{amount}</span> : null}
          </p>
          <CostDetail line={line} fetched={fetched} />
        </div>
        {cost ? (
          <button type="button" onClick={onEdit} className="flex shrink-0 flex-col items-end">
            <span className="font-extrabold tabular-nums">{formatPrice(cost.amount)}</span>
            <span className="text-xs font-semibold text-primary">
              {cost.option.kind === "mine" ? "Zmień" : "Wpisz swoją"}
            </span>
          </button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onEdit}>
            <Plus className="size-4" />
            Dodaj cenę
          </Button>
        )}
      </div>
      {estimate ? (
        <Suggestion
          key={estimate.productKey}
          promo={estimate}
          packAssumed={cost?.packAssumed ?? false}
          item={item}
          onAnswer={(isMatch, pack) => onAnswer(estimate, isMatch, pack)}
        />
      ) : null}
      <HeldList held={held} item={item} onAnswer={onAnswer} />
    </li>
  );
}

/**
 * What is not counted for this item and why: an app-only price without the
 * app, another town, a substitution that differs from the item (which "Tak"
 * approves, so it is never swapped in silently).
 */
function HeldList({
  held,
  item,
  onAnswer,
}: {
  held: HeldOption[];
  item: NeededItem;
  onAnswer: (promo: ShopPromo, isMatch: boolean, pack: PackAnswer | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (held.length === 0) return null;
  const substitutions = held.filter((one) => one.substitution);
  const others = held.filter((one) => !one.substitution);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-fit text-left text-xs font-semibold text-muted-foreground">
        <ChevronDown className={cn("inline size-3.5 transition-transform", open && "rotate-180")} /> Niepoliczone:{" "}
        {held.length} {plural(held.length, "oferta", "oferty", "ofert")}
        {substitutions.length > 0 ? `, w tym ${substitutions.length} ${plural(substitutions.length, "zamiennik", "zamienniki", "zamienników")}` : ""}
      </button>
      {open ? (
        <>
          {others.slice(0, 4).map(({ promo, reasons }) => (
            <p key={promo.productKey} className="text-xs text-muted-foreground">
              {promo.name}, {formatPrice(promo.promoPrice)}: {reasons.join(" · ")}
            </p>
          ))}
          {substitutions.slice(0, 3).map(({ promo, reasons }) => (
            <div key={promo.productKey} className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground first-letter:uppercase">{reasons.join(" · ")}</p>
              <Suggestion promo={promo} packAssumed={false} item={item} onAnswer={(isMatch, pack) => onAnswer(promo, isMatch, pack)} />
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

function CostDetail({ line, fetched }: { line: BasketLine; fetched: boolean }) {
  const { cost, item } = line;
  if (!cost) {
    return (
      <p className="text-sm text-muted-foreground">
        {line.missing === "unit"
          ? "Cena w innej jednostce niż na liście"
          : fetched
            ? "brak w gazetce, wpisz cenę z półki"
            : "promocje jeszcze nie sprawdzone"}
      </p>
    );
  }

  if (cost.option.kind === "mine") {
    const price = cost.option.price;
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted-foreground">
          {packsLabel(cost.packs, price.packQuantity, price.packUnit)} po {formatPrice(price.price)}
          {price.productLabel ? ` · ${price.productLabel}` : ""}
        </p>
        <StateBadge state={cost.option.state} reasons={cost.option.reasons} />
      </div>
    );
  }

  const promo = cost.option.promo;
  const discount =
    promo.regularPrice && promo.regularPrice > promo.promoPrice
      ? `−${Math.round((1 - promo.promoPrice / promo.regularPrice) * 100)}%`
      : promo.shop === "lidl"
        ? "promocja"
        : "gazetka";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        {promo.name} ·{" "}
        {promo.loose
          ? `${formatAmount(item.quantity, item.unit) ?? "1 opak."} na wagę`
          : packsLabel(cost.packs, promo.packQuantity, promo.packUnit)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <StateBadge state={cost.option.state} reasons={null} />
        {cost.option.match && cost.option.match !== "listing" ? (
          <Badge tone="muted">
            {TIER_LABELS[cost.option.match]}
            {cost.option.matchNotes && cost.option.matchNotes.length > 0
              ? `, nie podano: ${cost.option.matchNotes.join(", ")}`
              : ""}
          </Badge>
        ) : null}
        {cost.packAssumed ? (
          <Badge tone="muted">zakładam {formatAmount(promo.packQuantity, promo.packUnit)}</Badge>
        ) : null}
        {promo.historical ? (
          <Badge tone="muted">{promo.historical === "receipt" ? "z paragonu" : "z paragonu w Open Prices"}</Badge>
        ) : promo.productKey.startsWith("lidl-everyday:") ? (
          <Badge tone="muted">stała cena w sklepie</Badge>
        ) : promo.shelf ? (
          <Badge tone="muted">cena z półki (sklep online)</Badge>
        ) : cost.onPromo ? (
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
      {cost.option.reasons && cost.option.reasons.length > 0 ? (
        <p className="text-xs text-muted-foreground">{cost.option.reasons.join(" · ")}</p>
      ) : null}
      <SourceLine promo={promo} />
    </div>
  );
}

const STATE_TONES: Partial<Record<EligibilityState, "verified" | "promo" | "muted" | "warn">> = {
  verified_current: "verified",
  published_promotion: "promo",
  unverified: "warn",
};

/** How far a price can be trusted, in one chip. */
function StateBadge({ state, reasons }: { state: EligibilityState | undefined; reasons: string[] | null | undefined }) {
  if (!state) return null;
  const tone = STATE_TONES[state] ?? "muted";
  return (
    <>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
          tone === "verified" && "bg-accent/15 text-accent",
          tone === "promo" && "bg-primary/15 text-primary",
          tone === "warn" && "bg-destructive/10 text-destructive",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        {state === "verified_current" ? <ShieldCheck className="size-3" /> : null}
        {STATE_LABELS[state]}
      </span>
      {reasons && reasons.length > 0 ? <span className="text-xs text-muted-foreground">{reasons.join(" · ")}</span> : null}
    </>
  );
}

/** "2 zweryf. · 5 niezweryf. · 1 hist.": what a shop's total rests on. */
function stateFacts(states: Partial<Record<EligibilityState, number>>): string[] {
  const count = (...keys: EligibilityState[]) => keys.reduce((sum, key) => sum + (states[key] ?? 0), 0);
  const verified = count("verified_current", "published_promotion");
  const unverified = count("unverified");
  const history = count("historical", "community");
  const estimated = count("estimated");
  return [
    verified > 0 ? `${verified} zweryf.` : null,
    unverified > 0 ? `${unverified} niezweryf.` : null,
    history > 0 ? `${history} hist.` : null,
    estimated > 0 ? `${estimated} szac.` : null,
  ].filter((one): one is string => one !== null);
}

/**
 * The only claim about "the cheapest complete basket": made from verified,
 * current prices and published offers, exactly matched, every item priced.
 * Anything less says so.
 */
function VerifiedVerdict({ verdict }: { verdict: Verdict }) {
  const ready = verdict.complete.filter((one) => one.totalGrosz !== null);
  const best = ready[0] ?? verdict.complete[0] ?? null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
      <p className="flex items-center gap-1 text-xs font-bold tracking-wide text-accent uppercase">
        <ShieldCheck className="size-3.5" />
        Pełny koszyk, ceny zweryfikowane
      </p>
      {best ? (
        verdict.complete.slice(0, 3).map((one, index) => (
          <p key={one.shop} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 font-semibold">
              {index === 0 ? "Najtaniej: " : ""}
              {SHOP_LABELS[one.shop]}
              {one.online ? " (online)" : ""}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {verdict.itemCount} z {verdict.itemCount}
                {one.online
                  ? one.deliveryGrosz === null
                    ? " · dostawa nieznana lub poniżej minimum"
                    : ` · w tym dostawa ${formatGrosz(one.deliveryGrosz)}`
                  : ""}
              </span>
            </span>
            <span className="font-extrabold tabular-nums">
              {one.totalGrosz === null ? `${formatGrosz(one.goodsGrosz)} + ?` : formatGrosz(one.totalGrosz)}
            </span>
          </p>
        ))
      ) : (
        <>
          <p className="font-semibold">{CANNOT_DETERMINE}</p>
          <p className="text-muted-foreground">
            {verdict.coverage.length > 0
              ? `Zweryfikowane ceny: ${verdict.coverage
                  .slice(0, 3)
                  .map(
                    (one, index) =>
                      `${SHOP_LABELS[one.shop]} ${one.priced} z ${verdict.itemCount}${
                        index === 0 && one.missing.length > 0 && one.missing.length <= 3
                          ? ` (brak: ${one.missing.join(", ")})`
                          : ""
                      }`,
                  )
                  .join(" · ")}.`
              : "Żadne źródło z potwierdzoną zgodą nie ma jeszcze cen z tej listy."}
          </p>
        </>
      )}
      {verdict.split ? (
        <p>
          Dwa sklepy, {SHOP_LABELS[verdict.split.shops[0]]} + {SHOP_LABELS[verdict.split.shops[1]]}:{" "}
          <span className="font-bold">{formatGrosz(verdict.split.totalGrosz)}</span>
          {verdict.split.savingsGrosz !== null ? ` (−${formatGrosz(verdict.split.savingsGrosz)})` : ", cała lista"}
        </p>
      ) : null}
    </div>
  );
}

/** "Źródło: Gazetka Biedronka, s. 48 · 20.10 · otwórz": where this price was read and when. */
function SourceLine({ promo }: { promo: ShopPromo }) {
  const source = priceSource(promo);
  return (
    <p className="text-xs text-muted-foreground">
      Źródło: {source.label}
      {source.day ? ` · ${source.day}` : ""}
      {" · "}
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 font-semibold text-primary"
      >
        otwórz
        <ExternalLink className="size-3" />
      </a>
    </p>
  );
}

/**
 * "Pasuje?" for the offer an estimate rests on. "Tak" makes it exact and keeps
 * the pack the estimate used (when the leaflet named none); "Inne opakowanie"
 * says what the price is really for.
 */
function Suggestion({
  promo,
  packAssumed,
  item,
  showShop = false,
  onAnswer,
}: {
  promo: ShopPromo;
  /** The offer named no pack: the one on `promo` was assumed. */
  packAssumed: boolean;
  item: NeededItem;
  showShop?: boolean;
  onAnswer: (isMatch: boolean, pack: PackAnswer | null) => void;
}) {
  const [askingPack, setAskingPack] = useState(false);
  const assumedPack: PackAnswer | null =
    packAssumed && promo.packQuantity !== null && promo.packUnit !== null
      ? { quantity: promo.packQuantity, unit: promo.packUnit, loose: promo.loose }
      : null;
  const pack = formatAmount(promo.packQuantity, promo.packUnit);
  const price = formatPrice(promo.promoPrice);
  const facts = [
    ...(promo.packQuantity === null
      ? [price, "waga niepodana"]
      : promo.loose
        ? [`${price} za ${pack}`, packAssumed ? "zakładam: na wagę" : "na wagę"]
        : [packAssumed ? `zakładam ${pack}` : pack, price]),
    promo.multibuy,
    promo.appOnly ? "aplikacja" : null,
  ];
  const source = priceSource(promo);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-primary uppercase">
            {showShop ? SHOP_LABELS[promo.shop] : "Pasuje?"}
          </p>
          <p className="text-sm font-semibold">{promo.name}</p>
          <p className="text-xs text-muted-foreground">{facts.filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-muted-foreground">
            {source.label}
            {source.day ? ` · ${source.day}` : ""}
            {" · "}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-primary"
            >
              otwórz
              <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAnswer(true, assumedPack)}
          className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"
        >
          Tak
        </button>
        <button
          type="button"
          onClick={() => onAnswer(false, null)}
          className="h-10 shrink-0 rounded-full border bg-card px-4 text-sm font-bold"
        >
          Nie
        </button>
      </div>
      {item.unit && !askingPack ? (
        <button
          type="button"
          onClick={() => setAskingPack(true)}
          className="w-fit text-left text-sm font-semibold text-primary"
        >
          Inne opakowanie
        </button>
      ) : null}
      {askingPack && item.unit ? (
        <PackChooser unit={item.unit} price={price} onPick={(answer) => onAnswer(true, answer)} />
      ) : null}
    </div>
  );
}

const PACK_CHOICES: Record<Unit, PackAnswer[]> = {
  g: [
    { quantity: 1000, unit: "g", loose: true },
    { quantity: 250, unit: "g", loose: false },
    { quantity: 500, unit: "g", loose: false },
    { quantity: 1000, unit: "g", loose: false },
  ],
  ml: [
    { quantity: 500, unit: "ml", loose: false },
    { quantity: 1000, unit: "ml", loose: false },
  ],
  szt: [
    { quantity: 1, unit: "szt", loose: false },
    { quantity: 6, unit: "szt", loose: false },
    { quantity: 10, unit: "szt", loose: false },
    { quantity: 30, unit: "szt", loose: false },
  ],
};

function packChoiceLabel(choice: PackAnswer): string {
  if (choice.loose) return `za ${formatAmount(choice.quantity, choice.unit)}, na wagę`;
  return choice.unit === "szt" ? `${choice.quantity} szt.` : `opak. ${formatAmount(choice.quantity, choice.unit)}`;
}

function PackChooser({ unit, price, onPick }: { unit: Unit; price: string; onPick: (pack: PackAnswer) => void }) {
  const [custom, setCustom] = useState("");
  const parsed = parseDecimal(custom);
  return (
    <div className="flex flex-col gap-2 border-t border-primary/20 pt-3">
      <p className="text-sm font-bold">Za co jest {price}?</p>
      <div className="flex flex-wrap gap-2">
        {PACK_CHOICES[unit].map((choice) => (
          <button
            key={`${choice.quantity}${choice.unit}${choice.loose}`}
            type="button"
            onClick={() => onPick(choice)}
            className="h-10 rounded-full border bg-card px-3 text-sm font-semibold"
          >
            {packChoiceLabel(choice)}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed !== null && parsed > 0) onPick({ quantity: parsed, unit, loose: false });
        }}
      >
        <Input
          inputMode="decimal"
          aria-label={`Inne opakowanie, ${unit}`}
          placeholder={`inne, ${unit}`}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="w-28"
        />
        <Button type="submit" variant="outline" size="sm" disabled={parsed === null || parsed <= 0}>
          OK
        </Button>
      </form>
    </div>
  );
}

/** "Dostawa": the online shops for my town, the basket at each, the delivery on top, and the links. */
function DeliveryPanel({
  options,
  city,
  editingCity,
  onEditCity,
  onSaveCity,
  onOpen,
  onQuote,
  itemCount,
}: {
  options: OnlineOption[];
  city: string;
  editingCity: boolean;
  onEditCity: () => void;
  onSaveCity: (city: string) => void;
  onOpen: (shop: Shop) => void;
  onQuote: (provider: Provider) => void;
  itemCount: number;
}) {
  const ordered = [...options].sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      Number(b.total !== null) - Number(a.total !== null) ||
      Number(b.goods !== null) - Number(a.goods !== null) ||
      (a.total ?? a.goods ?? 0) - (b.total ?? b.goods ?? 0),
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="size-4 text-muted-foreground" />
        {editingCity ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveCity(new FormData(event.currentTarget).get("city") as string);
            }}
          >
            <Input name="city" defaultValue={city} autoFocus className="h-10" aria-label="Miasto" />
            <Button type="submit" size="sm">
              Zapisz
            </Button>
          </form>
        ) : (
          <p className="flex-1">
            Dostawa do: <span className="font-semibold">{city}</span>{" "}
            <button type="button" onClick={onEditCity} className="font-semibold text-primary">
              zmień
            </button>
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {ordered.map((option) => {
          const { provider } = option;
          const feeLabel =
            option.feeStatus === "confirmed"
              ? `dostawa ${formatTotal(option.fee!)} · potwierdzona`
              : option.feeStatus === "estimate"
                ? `dostawa ${formatTotal(option.fee!)} · szacunek`
                : "koszt dostawy nieznany";
          const facts = !option.available
            ? [`nie dostarcza do: ${city}`]
            : provider.shop === null
              ? ["ceny dopiero po podaniu adresu w aplikacji"]
              : [
                  option.goods !== null ? `${itemCount - option.missing} z ${itemCount} z ceną` : "brak cen",
                  feeLabel,
                  option.belowMinimum ? `poniżej minimum ${formatTotal(option.minOrder!)}` : null,
                ].filter(Boolean);
          return (
            <li
              key={provider.id}
              className={cn("rounded-xl border bg-card px-4 py-3", !option.available && "opacity-60")}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!provider.shop || !option.basket}
                  onClick={() => provider.shop && onOpen(provider.shop)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block font-bold">{provider.label}</span>
                  <span className="block text-xs font-semibold text-muted-foreground">{facts.join(" · ")}</span>
                </button>
                {option.total !== null ? (
                  <span className="text-lg font-extrabold tabular-nums">{formatTotal(option.total)}</span>
                ) : option.goods !== null ? (
                  <span className="text-right text-sm font-bold tabular-nums">
                    {formatTotal(option.goods)}
                    <span className="block text-xs font-semibold text-muted-foreground">+ dostawa ?</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                <a
                  href={provider.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary"
                >
                  Otwórz {provider.label}
                  <ExternalLink className="size-3" />
                </a>
                {provider.shop ? (
                  <button type="button" onClick={() => onQuote(provider)} className="text-primary">
                    {option.feeStatus === "unknown" ? "Wpisz koszt dostawy" : "Popraw koszt dostawy"}
                  </button>
                ) : null}
                <span className="w-full font-normal text-muted-foreground">{handoffLabel(handoffFor(provider))}</span>
                {provider.published ? (
                  <a
                    href={provider.published.source}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground"
                    title={provider.published.note}
                  >
                    warunki dostawy ({provider.published.day.slice(8, 10)}.{provider.published.day.slice(5, 7)})
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Ceny sklepów online to ich ceny w internecie. Koszt dostawy ze strony sklepu jest szacunkiem; „potwierdzona”
        znaczy, że wpisałeś ją z koszyka. Aplikacja nie składa zamówień: daje linki do produktów i listę do
        skopiowania, koszyk wypełniasz w sklepie.
      </p>
    </div>
  );
}

/** "Wpisz koszt dostawy": what I saw at checkout (confirmed) or on the shop's page. */
function QuoteSheet({
  provider,
  quote,
  onSave,
  onClose,
}: {
  provider: Provider;
  quote: DeliveryQuote | undefined;
  onSave: (quote: DeliveryQuote) => void;
  onClose: () => void;
}) {
  const start = quote ?? {
    fee: provider.published?.fee ?? null,
    freeAbove: provider.published?.freeAbove ?? null,
    minOrder: provider.published?.minOrder ?? null,
    confirmed: false,
    note: "",
  };
  const field = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));
  const num = (value: FormDataEntryValue | null) => {
    const parsed = Number(
      String(value ?? "")
        .replace(",", ".")
        .trim(),
    );
    return String(value ?? "").trim() === "" || Number.isNaN(parsed) ? null : parsed;
  };
  return (
    <Sheet open onClose={onClose} title={`Dostawa: ${provider.label}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSave({
            provider: provider.id,
            fee: num(data.get("fee")),
            freeAbove: num(data.get("freeAbove")),
            minOrder: num(data.get("minOrder")),
            confirmed: data.get("confirmed") === "on",
            note: String(data.get("note") ?? "").trim(),
          });
        }}
      >
        {provider.published ? <p className="text-sm text-muted-foreground">{provider.published.note}</p> : null}
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Koszt dostawy (zł)
          <Input name="fee" inputMode="decimal" defaultValue={field(start.fee)} placeholder="np. 14" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Darmowa od (zł)
          <Input name="freeAbove" inputMode="decimal" defaultValue={field(start.freeAbove)} placeholder="np. 300" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Minimalne zamówienie (zł)
          <Input name="minOrder" inputMode="decimal" defaultValue={field(start.minOrder)} placeholder="np. 100" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="confirmed" defaultChecked={start.confirmed} className="size-5" />
          Widziałem tę kwotę w koszyku (potwierdzona)
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Notatka
          <Input name="note" defaultValue={start.note} placeholder="np. dostawa wieczorna" maxLength={200} />
        </label>
        <Button type="submit">Zapisz</Button>
      </form>
    </Sheet>
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
const QUICK_PACKS: Record<Unit, number[]> = {
  g: [250, 500, 1000],
  ml: [500, 1000],
  szt: [1, 10, 30],
};

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
        Na liście:{" "}
        <span className="inline-block font-semibold text-foreground first-letter:uppercase">{item.name}</span>
        {amount ? ` · ${amount}` : ""}. Cena zostaje, aż ją zmienisz.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Cena za opakowanie (zł)</span>
        <Input
          inputMode="decimal"
          placeholder="np. 12,99"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
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
        <Input
          placeholder="np. Filet z piersi, Kraina Mięs"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
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

/* How I shop ------------------------------------------------------------------- */

const CHANNELS: [ShoppingPreferences["channel"], string][] = [
  ["both", "Sklep i online"],
  ["store", "Tylko w sklepie"],
  ["online", "Tylko online"],
];

function PreferencesSheet({
  preferences,
  onSave,
  onClose,
}: {
  preferences: ShoppingPreferences;
  onSave: (preferences: ShoppingPreferences) => void;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState(preferences.channel);
  const [loyalty, setLoyalty] = useState<LoyaltyProgram[]>(preferences.loyalty);
  const [preferred, setPreferred] = useState<Shop[]>(
    SHOP_ORDER.filter((shop) => preferences.preferredRetailers.includes(shop as never)),
  );
  const [brands, setBrands] = useState(preferences.excludedBrands.join(", "));
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((one) => one !== value) : [...list, value]);
  const chip = (active: boolean) =>
    cn("h-10 rounded-full border px-3 text-sm font-semibold", active ? "border-primary bg-primary/10 text-primary" : "bg-card");

  return (
    <Sheet open onClose={onClose} title="Jak robię zakupy">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            channel,
            loyalty,
            preferredRetailers: preferred as ShoppingPreferences["preferredRetailers"],
            excludedBrands: brands
              .split(",")
              .map((brand) => brand.trim())
              .filter((brand) => brand.length >= 2),
          });
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Gdzie</legend>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={channel === value} onClick={() => setChannel(value)} className={chip(channel === value)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Aplikacje i karty, które mam</legend>
          <p className="text-xs text-muted-foreground">Ceny „tylko z aplikacją” liczą się tylko dla tych.</p>
          <div className="flex flex-wrap gap-2">
            {LOYALTY_PROGRAMS.map((program) => (
              <button
                key={program}
                type="button"
                aria-pressed={loyalty.includes(program)}
                onClick={() => setLoyalty((list) => toggle(list, program))}
                className={chip(loyalty.includes(program))}
              >
                {LOYALTY_LABELS[program]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Moje sklepy (na górze listy)</legend>
          <div className="flex flex-wrap gap-2">
            {SHOP_ORDER.map((shop) => (
              <button
                key={shop}
                type="button"
                aria-pressed={preferred.includes(shop)}
                onClick={() => setPreferred((list) => toggle(list, shop))}
                className={chip(preferred.includes(shop))}
              >
                {SHOP_LABELS[shop]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Marki, których nie chcę</span>
          <Input value={brands} onChange={(event) => setBrands(event.target.value)} placeholder="np. Pilos, Mlekovita" />
          <span className="text-xs text-muted-foreground">Po przecinku. Nie będą podpowiadane ani liczone.</span>
        </label>
        <Button type="submit">Zapisz</Button>
      </form>
    </Sheet>
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
